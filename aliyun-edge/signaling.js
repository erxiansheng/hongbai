/**
 * 阿里云 ESA 边缘函数 - WebRTC信令服务 + ROM服务
 * 使用 HTTP 轮询方式（阿里云ESA不支持WebSocket）
 */

// KV 命名空间名称
const SIGNAL_NAMESPACE = 'nes-signal';  // 信令用
const ROMS_NAMESPACE = 'roms';          // ROM存储用

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // CORS 预检
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    
    try {
        // 调试接口
        if (path === '/api/debug') {
            return jsonResponse({ 
                status: 'ok',
                time: Date.now(),
                signalNamespace: SIGNAL_NAMESPACE,
                romsNamespace: ROMS_NAMESPACE
            });
        }
        
        // 健康检查
        if (path === '/api/health') {
            return jsonResponse({ status: 'ok', time: Date.now() });
        }
        
        // 信令服务
        if (path.startsWith('/api/signaling/')) {
            return await handleSignaling(request, url, path);
        }
        
        // ROM服务
        if (path.startsWith('/api/rom/')) {
            return await handleRomRequest(path);
        }
        
        if (path === '/api/list-roms') {
            return await handleListRoms();
        }
        
        return new Response('Not Found', { status: 404 });
    } catch (e) {
        return jsonResponse({ error: e.message, stack: e.stack }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders
    });
}

// ========== 信令服务 ==========
async function handleSignaling(request, url, path) {
    const endpoint = path.replace('/api/signaling/', '');
    const kv = new EdgeKV({ namespace: SIGNAL_NAMESPACE });
    
    // 创建房间
    if (endpoint === 'create') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            return jsonResponse({ error: '缺少房间号' }, 400);
        }
        
        const roomKey = `room:${roomCode}`;
        
        try {
            const existing = await kv.get(roomKey, { type: 'json' });
            if (existing) {
                return jsonResponse({ error: '房间已存在' }, 400);
            }
        } catch (e) {
            // key不存在，继续创建
        }
        
        const room = {
            hostId: generateId(),
            players: [1],
            created: Date.now()
        };
        
        await kv.put(roomKey, JSON.stringify(room), { expiration: 3600 });
        
        return jsonResponse({ 
            success: true, 
            roomCode, 
            peerId: room.hostId,
            playerNum: 1 
        });
    }
    
    // 加入房间
    if (endpoint === 'join') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            return jsonResponse({ error: '缺少房间号' }, 400);
        }
        
        const roomKey = `room:${roomCode}`;
        
        let room;
        try {
            room = await kv.get(roomKey, { type: 'json' });
        } catch (e) {
            return jsonResponse({ error: '房间不存在' }, 404);
        }
        
        if (!room) {
            return jsonResponse({ error: '房间不存在' }, 404);
        }
        
        // 分配玩家编号
        let playerNum = 2;
        while (room.players.includes(playerNum) && playerNum <= 4) {
            playerNum++;
        }
        if (playerNum > 4) {
            return jsonResponse({ error: '房间已满' }, 400);
        }
        
        const peerId = generateId();
        room.players.push(playerNum);
        room[`player${playerNum}Id`] = peerId;
        
        await kv.put(roomKey, JSON.stringify(room), { expiration: 3600 });
        
        // 通知房主
        await pushMessage(kv, roomCode, 1, {
            type: 'player-joined',
            playerNum,
            name: `玩家${playerNum}`
        });
        
        return jsonResponse({ 
            success: true, 
            roomCode, 
            peerId,
            playerNum,
            players: room.players
        });
    }
    
    // 发送消息
    if (endpoint === 'send' && request.method === 'POST') {
        const data = await request.json();
        const { roomCode, fromPlayer, toPlayer, message } = data;
        
        if (!roomCode || !message) {
            return jsonResponse({ error: '参数不完整' }, 400);
        }
        
        await pushMessage(kv, roomCode, toPlayer, {
            ...message,
            fromPlayer
        });
        
        return jsonResponse({ success: true });
    }
    
    // 轮询消息
    if (endpoint === 'poll') {
        const roomCode = url.searchParams.get('room');
        const playerNum = parseInt(url.searchParams.get('player'));
        
        if (!roomCode || !playerNum) {
            return jsonResponse({ error: '参数不完整' }, 400);
        }
        
        const messages = await popMessages(kv, roomCode, playerNum);
        return jsonResponse({ messages });
    }
    
    // 离开房间
    if (endpoint === 'leave') {
        const roomCode = url.searchParams.get('room');
        const playerNum = parseInt(url.searchParams.get('player'));
        
        if (roomCode && playerNum) {
            const roomKey = `room:${roomCode}`;
            
            try {
                const room = await kv.get(roomKey, { type: 'json' });
                
                if (room) {
                    if (playerNum === 1) {
                        // 房主离开，删除房间
                        await kv.delete(roomKey);
                        for (const p of room.players) {
                            if (p !== 1) {
                                await pushMessage(kv, roomCode, p, {
                                    type: 'error',
                                    message: '房主已离开'
                                });
                            }
                        }
                    } else {
                        // 玩家离开
                        room.players = room.players.filter(p => p !== playerNum);
                        await kv.put(roomKey, JSON.stringify(room), { expiration: 3600 });
                        await pushMessage(kv, roomCode, 1, {
                            type: 'player-left',
                            playerNum
                        });
                    }
                }
            } catch (e) {
                // 忽略
            }
        }
        
        return jsonResponse({ success: true });
    }
    
    return jsonResponse({ error: '未知接口' }, 404);
}

// 推送消息
async function pushMessage(kv, roomCode, toPlayer, message) {
    const queueKey = `msg:${roomCode}:${toPlayer}`;
    let messages = [];
    
    try {
        const existing = await kv.get(queueKey, { type: 'json' });
        if (existing) {
            messages = existing;
        }
    } catch (e) {}
    
    messages.push(message);
    if (messages.length > 50) messages.shift();
    
    await kv.put(queueKey, JSON.stringify(messages), { expiration: 300 });
}

// 获取消息
async function popMessages(kv, roomCode, playerNum) {
    const queueKey = `msg:${roomCode}:${playerNum}`;
    
    try {
        const existing = await kv.get(queueKey, { type: 'json' });
        if (!existing) return [];
        
        await kv.delete(queueKey);
        return existing;
    } catch (e) {
        return [];
    }
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

// ========== ROM服务 ==========
async function handleRomRequest(path) {
    const gameId = decodeURIComponent(path.split('/api/rom/')[1]);
    const kv = new EdgeKV({ namespace: ROMS_NAMESPACE });
    
    try {
        const key = `roms/${gameId}.zip`;
        const base64Data = await kv.get(key, { type: 'text' });
        
        if (!base64Data) {
            return jsonResponse({ error: 'ROM not found', key }, 404);
        }
        
        // 解码 base64
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return new Response(bytes.buffer, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(gameId)}.zip"`,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

async function handleListRoms() {
    const kv = new EdgeKV({ namespace: ROMS_NAMESPACE });
    
    try {
        const list = await kv.list({ prefix: 'roms/' });
        const roms = (list.keys || []).map(k => ({
            key: k.name,
            name: k.name.replace('roms/', '').replace('.zip', '')
        }));
        return jsonResponse({ count: roms.length, roms });
    } catch (e) {
        return jsonResponse({ error: e.message }, 500);
    }
}

export default {
    fetch: handleRequest
};
