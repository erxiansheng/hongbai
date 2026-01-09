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
        
        // 调试KV - 详细测试
        if (path === '/api/debug-kv') {
            const testKey = url.searchParams.get('key') || 'roms/6in1.zip';
            const namespace = url.searchParams.get('ns') || ROMS_NAMESPACE;
            const type = url.searchParams.get('type') || 'arrayBuffer'; // 默认用arrayBuffer
            const results = {
                namespace,
                testKey,
                readType: type,
                timestamp: Date.now()
            };
            
            try {
                const kv = new EdgeKV({ namespace });
                
                if (type === 'text') {
                    const value = await kv.get(testKey, { type: 'text' });
                    results.rawValue = value;
                    results.rawType = typeof value;
                    results.isNull = value === null;
                    results.isUndefined = value === undefined;
                    if (value && typeof value === 'string') {
                        results.status = 'found';
                        results.valueLength = value.length;
                        results.valueStart = value.substring(0, 200);
                    } else {
                        results.status = value === null ? 'null_returned' : 'not_found';
                    }
                } else {
                    // arrayBuffer 模式
                    const buffer = await kv.get(testKey, { type: 'arrayBuffer' });
                    results.rawType = typeof buffer;
                    results.isNull = buffer === null;
                    results.isUndefined = buffer === undefined;
                    
                    if (buffer && buffer.byteLength !== undefined) {
                        results.status = 'found';
                        results.byteLength = buffer.byteLength;
                        // 显示前20字节的hex
                        const arr = new Uint8Array(buffer.slice(0, 20));
                        results.hexPreview = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ');
                        // 检查是否是ZIP文件 (PK..)
                        results.isZipFile = arr[0] === 0x50 && arr[1] === 0x4b;
                        // 检查是否像base64文本 (以大写字母开头)
                        results.looksLikeBase64Text = arr[0] >= 0x41 && arr[0] <= 0x5a;
                    } else {
                        results.status = buffer === null ? 'null_returned' : 'not_found';
                    }
                }
            } catch (e) {
                results.status = 'error';
                results.errorMessage = e.message;
                results.errorString = String(e);
            }
            
            return jsonResponse(results);
        }
        
        // 测试写入和读取
        if (path === '/api/debug-write') {
            const namespace = url.searchParams.get('ns') || ROMS_NAMESPACE;
            const testKey = 'test/debug-' + Date.now();
            const testValue = 'hello-' + Date.now();
            const results = { namespace, testKey, testValue };
            
            try {
                const kv = new EdgeKV({ namespace });
                
                // 写入
                const putResult = await kv.put(testKey, testValue);
                results.putResult = putResult === undefined ? 'success' : putResult;
                
                // 读取验证
                const getValue = await kv.get(testKey, { type: 'text' });
                results.getValue = getValue;
                results.match = getValue === testValue;
                
                // 删除测试key
                await kv.delete(testKey);
                results.deleted = true;
                
            } catch (e) {
                results.error = e.message;
                results.errorString = String(e);
            }
            
            return jsonResponse(results);
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
            return await handleRomRequest(url, path);
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

// ========== ROM服务 ==========
async function handleRomRequest(url, path) {
    const gameId = decodeURIComponent(path.split('/api/rom/')[1]);
    
    // 支持通过query参数指定命名空间和解码模式
    const namespace = url.searchParams.get('ns') || ROMS_NAMESPACE;
    // 解码模式: native(使用内置base64_dec), atob(使用atob), binary(直接二进制)
    const mode = url.searchParams.get('mode') || 'native';
    
    try {
        const kv = new EdgeKV({ namespace });
        const key = `roms/${gameId}.zip`;
        
        let bytes;
        
        if (mode === 'binary') {
            // 方式1: 直接用 arrayBuffer 获取
            const buffer = await kv.get(key, { type: 'arrayBuffer' });
            if (buffer === undefined) {
                return jsonResponse({ error: 'ROM not found', key, namespace, mode }, 404);
            }
            bytes = new Uint8Array(buffer);
        } else {
            // 获取 base64 文本
            const base64Data = await kv.get(key, { type: 'text' });
            if (base64Data === undefined) {
                return jsonResponse({ error: 'ROM not found', key, namespace, mode }, 404);
            }
            
            if (mode === 'native') {
                // 方式2: 使用边缘函数内置的 base64_dec 解码
                const decoded = base64_dec(base64Data);
                // base64_dec 返回字符串，需要转换为 Uint8Array
                bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) {
                    bytes[i] = decoded.charCodeAt(i);
                }
            } else {
                // 方式3: 使用 atob 解码
                const binaryString = atob(base64Data);
                bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
            }
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
        return jsonResponse({ 
            error: e.message,
            errorString: String(e),
            key: `roms/${gameId}.zip`,
            namespace,
            mode
        }, 500);
    }
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
            if (existing !== undefined) {
                return jsonResponse({ error: '房间已存在' }, 400);
            }
        } catch (e) {
            // 出错继续创建
        }
        
        const room = {
            hostId: generateId(),
            players: [1],
            created: Date.now()
        };
        
        await kv.put(roomKey, JSON.stringify(room));
        
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
        
        if (room === undefined) {
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
        
        await kv.put(roomKey, JSON.stringify(room));
        
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
                
                if (room !== undefined) {
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
                        await kv.put(roomKey, JSON.stringify(room));
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
        if (existing !== undefined) {
            messages = existing;
        }
    } catch (e) {}
    
    messages.push(message);
    if (messages.length > 50) messages.shift();
    
    await kv.put(queueKey, JSON.stringify(messages));
}

// 获取消息
async function popMessages(kv, roomCode, playerNum) {
    const queueKey = `msg:${roomCode}:${playerNum}`;
    
    try {
        const existing = await kv.get(queueKey, { type: 'json' });
        if (existing === undefined) return [];
        
        await kv.delete(queueKey);
        return existing;
    } catch (e) {
        return [];
    }
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

export default {
    fetch: handleRequest
};
