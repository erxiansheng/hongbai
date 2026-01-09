/**
 * 阿里云边缘函数 - WebRTC信令服务 + ROM服务
 * 使用 HTTP 轮询方式（阿里云ESA不支持WebSocket）
 * 
 * 部署说明：
 * 1. 在ESA控制台创建边缘函数
 * 2. 绑定KV命名空间，变量名设为: KV 或 ROMS
 * 3. 上传此代码
 */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // CORS预检
        if (request.method === 'OPTIONS') {
            return corsResponse(null);
        }
        
        // 调试：查看env中有哪些绑定
        if (url.pathname === '/api/debug') {
            return jsonResponse({
                envKeys: Object.keys(env || {}),
                hasKV: !!getKV(env),
                env: env ? JSON.stringify(env).substring(0, 500) : 'null'
            });
        }
        
        try {
            // 信令服务 - HTTP轮询
            if (url.pathname.startsWith('/api/signaling/')) {
                return await handleSignaling(request, env, url);
            }
            
            // ROM文件获取
            if (url.pathname.startsWith('/api/rom/')) {
                return await handleRomRequest(url, env);
            }
            
            // 列出所有ROM
            if (url.pathname === '/api/list-roms') {
                return await handleListRoms(env);
            }
            
            // 健康检查
            if (url.pathname === '/api/health') {
                return jsonResponse({ 
                    status: 'ok', 
                    time: Date.now(),
                    kvConfigured: !!getKV(env)
                });
            }
            
            return new Response('Not Found', { status: 404 });
        } catch (e) {
            return jsonResponse({ error: e.message, stack: e.stack }, 500);
        }
    }
};

// CORS响应
function corsResponse(body, status = 200) {
    return new Response(body, {
        status,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// JSON响应
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// 获取KV绑定 - 尝试多种可能的绑定名称
function getKV(env) {
    if (!env) return null;
    // 阿里云ESA可能的KV绑定名称
    return env.KV || env.kv || env.ROMS || env.roms || env.store || env.STORE || null;
}

// ========== 信令服务 (HTTP轮询) ==========
async function handleSignaling(request, env, url) {
    const kv = getKV(env);
    const path = url.pathname.replace('/api/signaling/', '');
    
    // 如果KV未配置，返回详细错误
    if (!kv) {
        return jsonResponse({ 
            error: 'KV not configured',
            hint: '请在ESA控制台绑定KV命名空间，变量名设为 KV',
            envKeys: Object.keys(env || {})
        }, 500);
    }
    
    // 创建房间: GET /api/signaling/create?room=XXXX
    if (path === 'create') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            return jsonResponse({ error: '缺少房间号' }, 400);
        }
        
        const roomKey = `signal:room:${roomCode}`;
        
        try {
            const existing = await kv.get(roomKey);
            if (existing) {
                return jsonResponse({ error: '房间已存在' }, 400);
            }
            
            const room = {
                hostId: generateId(),
                players: [1],
                created: Date.now()
            };
            await kv.put(roomKey, JSON.stringify(room), { expirationTtl: 3600 });
            
            return jsonResponse({ 
                success: true, 
                roomCode, 
                peerId: room.hostId,
                playerNum: 1 
            });
        } catch (e) {
            return jsonResponse({ error: 'KV操作失败: ' + e.message }, 500);
        }
    }
    
    // 加入房间: GET /api/signaling/join?room=XXXX
    if (path === 'join') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            return jsonResponse({ error: '缺少房间号' }, 400);
        }
        
        const roomKey = `signal:room:${roomCode}`;
        
        try {
            const roomStr = await kv.get(roomKey);
            if (!roomStr) {
                return jsonResponse({ error: '房间不存在' }, 404);
            }
            
            const room = JSON.parse(roomStr);
            
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
            await kv.put(roomKey, JSON.stringify(room), { expirationTtl: 3600 });
            
            // 通知房主有新玩家加入
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
        } catch (e) {
            return jsonResponse({ error: 'KV操作失败: ' + e.message }, 500);
        }
    }
    
    // 发送消息: POST /api/signaling/send
    if (path === 'send' && request.method === 'POST') {
        try {
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
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }
    
    // 轮询消息: GET /api/signaling/poll?room=XXXX&player=N
    if (path === 'poll') {
        const roomCode = url.searchParams.get('room');
        const playerNum = parseInt(url.searchParams.get('player'));
        
        if (!roomCode || !playerNum) {
            return jsonResponse({ error: '参数不完整' }, 400);
        }
        
        try {
            const messages = await popMessages(kv, roomCode, playerNum);
            return jsonResponse({ messages });
        } catch (e) {
            return jsonResponse({ messages: [] });
        }
    }
    
    // 离开房间: GET /api/signaling/leave?room=XXXX&player=N
    if (path === 'leave') {
        const roomCode = url.searchParams.get('room');
        const playerNum = parseInt(url.searchParams.get('player'));
        
        if (roomCode && playerNum) {
            try {
                const roomKey = `signal:room:${roomCode}`;
                const roomStr = await kv.get(roomKey);
                
                if (roomStr) {
                    const room = JSON.parse(roomStr);
                    
                    if (playerNum === 1) {
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
                        room.players = room.players.filter(p => p !== playerNum);
                        await kv.put(roomKey, JSON.stringify(room), { expirationTtl: 3600 });
                        await pushMessage(kv, roomCode, 1, {
                            type: 'player-left',
                            playerNum
                        });
                    }
                }
            } catch (e) {
                // 忽略错误
            }
        }
        
        return jsonResponse({ success: true });
    }
    
    return jsonResponse({ error: '未知接口' }, 404);
}

// 推送消息到队列
async function pushMessage(kv, roomCode, toPlayer, message) {
    const queueKey = `signal:msg:${roomCode}:${toPlayer}`;
    let messages = [];
    
    try {
        const existing = await kv.get(queueKey);
        if (existing) {
            messages = JSON.parse(existing);
        }
    } catch (e) {}
    
    messages.push(message);
    if (messages.length > 50) messages.shift();
    
    await kv.put(queueKey, JSON.stringify(messages), { expirationTtl: 300 });
}

// 获取并清空消息队列
async function popMessages(kv, roomCode, playerNum) {
    const queueKey = `signal:msg:${roomCode}:${playerNum}`;
    
    try {
        const existing = await kv.get(queueKey);
        if (!existing) return [];
        
        await kv.delete(queueKey);
        return JSON.parse(existing);
    } catch (e) {
        return [];
    }
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

// ========== ROM服务 ==========
async function handleRomRequest(url, env) {
    const gameId = decodeURIComponent(url.pathname.split('/api/rom/')[1]);
    const kv = getKV(env);
    
    if (!kv) {
        return jsonResponse({ 
            error: 'KV not configured',
            envKeys: Object.keys(env || {})
        }, 500);
    }
    
    try {
        const key = `roms/${gameId}.zip`;
        const base64Data = await kv.get(key, { type: 'text' });
        
        if (!base64Data) {
            return jsonResponse({ error: 'ROM not found', key }, 404);
        }
        
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

async function handleListRoms(env) {
    const kv = getKV(env);
    if (!kv) {
        return jsonResponse({ 
            error: 'KV not configured',
            envKeys: Object.keys(env || {})
        }, 500);
    }
    
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
