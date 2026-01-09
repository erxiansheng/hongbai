/**
 * 阿里云边缘函数 - WebRTC信令服务 + ROM服务
 * 部署到阿里云ESA边缘函数
 * 
 * 注意：需要在ESA控制台绑定KV命名空间，绑定名称为 "roms"
 */

// KV命名空间名称（在ESA控制台配置）
const KV_NAMESPACE = 'roms';

// 内存中的房间和连接管理（边缘函数实例内）
const rooms = new Map(); // roomCode -> { hostWs, guests: Map<playerNum, ws>, players: Set }
const wsToRoom = new Map(); // ws -> { roomCode, playerNum }

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // CORS预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                }
            });
        }
        
        try {
            // WebSocket信令服务
            if (url.pathname === '/api/signaling') {
                const upgradeHeader = request.headers.get('Upgrade');
                if (upgradeHeader === 'websocket') {
                    return handleWebSocket(request, env, ctx);
                }
                return jsonResponse({ error: 'WebSocket upgrade required' }, 400);
            }
            
            // ROM文件获取 - /api/rom/游戏名
            if (url.pathname.startsWith('/api/rom/')) {
                return await handleRomRequest(request, env);
            }
            
            // 列出所有ROM
            if (url.pathname === '/api/list-roms') {
                return await handleListRoms(request, env);
            }
            
            // 健康检查
            if (url.pathname === '/api/health') {
                return jsonResponse({ status: 'ok', time: Date.now(), rooms: rooms.size });
            }
            
            // 其他路径返回404
            return new Response('Not Found', { status: 404 });
            
        } catch (e) {
            return jsonResponse({ error: e.message, stack: e.stack }, 500);
        }
    }
};

// 辅助函数：JSON响应
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// 获取KV绑定
function getKV(env) {
    // 阿里云ESA KV绑定方式
    // 需要在控制台绑定KV命名空间，绑定变量名为 roms
    return env.roms || env.KV || env[KV_NAMESPACE];
}

// ROM请求处理
async function handleRomRequest(request, env) {
    const url = new URL(request.url);
    const gameId = decodeURIComponent(url.pathname.split('/api/rom/')[1]);
    
    const kv = getKV(env);
    if (!kv) {
        return jsonResponse({ error: 'KV not configured', env: Object.keys(env || {}) }, 500);
    }
    
    try {
        // 尝试获取ROM，key格式: roms/游戏名.zip
        const key = `roms/${gameId}.zip`;
        
        // 获取base64编码的数据
        const base64Data = await kv.get(key, { type: 'text' });
        
        if (!base64Data) {
            return jsonResponse({ error: 'ROM not found', key }, 404);
        }
        
        // 解码base64为二进制
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
        return jsonResponse({ error: e.message, key: `roms/${gameId}.zip` }, 500);
    }
}

// 列出ROM
async function handleListRoms(request, env) {
    const kv = getKV(env);
    if (!kv) {
        return jsonResponse({ error: 'KV not configured' }, 500);
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

// WebSocket信令处理
function handleWebSocket(request, env, ctx) {
    const [client, server] = Object.values(new WebSocketPair());
    
    server.accept();
    
    server.addEventListener('message', (event) => {
        try {
            const message = JSON.parse(event.data);
            handleSignalingMessage(server, message, env);
        } catch (e) {
            server.send(JSON.stringify({ type: 'error', message: e.message }));
        }
    });
    
    server.addEventListener('close', () => {
        handleDisconnect(server);
    });
    
    server.addEventListener('error', () => {
        handleDisconnect(server);
    });
    
    return new Response(null, {
        status: 101,
        webSocket: client
    });
}

// 处理信令消息
function handleSignalingMessage(ws, message, env) {
    console.log('收到信令消息:', message.type);
    
    switch (message.type) {
        case 'create-room':
            handleCreateRoom(ws, message);
            break;
        case 'join-room':
            handleJoinRoom(ws, message);
            break;
        case 'offer':
        case 'answer':
        case 'ice-candidate':
            forwardSignaling(ws, message);
            break;
        default:
            ws.send(JSON.stringify({ type: 'error', message: '未知消息类型' }));
    }
}

// 创建房间
function handleCreateRoom(ws, message) {
    const roomCode = message.roomCode;
    
    if (rooms.has(roomCode)) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已存在' }));
        return;
    }
    
    rooms.set(roomCode, {
        hostWs: ws,
        guests: new Map(),
        players: new Set([1])
    });
    
    wsToRoom.set(ws, { roomCode, playerNum: 1 });
    
    ws.send(JSON.stringify({ type: 'room-created', roomCode }));
    console.log(`房间 ${roomCode} 已创建`);
}

// 加入房间
function handleJoinRoom(ws, message) {
    const roomCode = message.roomCode;
    const room = rooms.get(roomCode);
    
    if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
        return;
    }
    
    // 分配玩家编号 (2-4)
    let playerNum = 2;
    while (room.players.has(playerNum) && playerNum <= 4) {
        playerNum++;
    }
    
    if (playerNum > 4) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
        return;
    }
    
    room.guests.set(playerNum, ws);
    room.players.add(playerNum);
    wsToRoom.set(ws, { roomCode, playerNum });
    
    // 通知新玩家加入成功
    ws.send(JSON.stringify({
        type: 'join-success',
        roomCode,
        playerNum,
        players: Array.from(room.players)
    }));
    
    // 通知房主有新玩家加入
    if (room.hostWs.readyState === 1) {
        room.hostWs.send(JSON.stringify({
            type: 'player-joined',
            playerNum,
            name: `玩家${playerNum}`
        }));
    }
    
    console.log(`玩家${playerNum}加入房间 ${roomCode}`);
}

// 转发信令消息
function forwardSignaling(ws, message) {
    const info = wsToRoom.get(ws);
    if (!info) return;
    
    const room = rooms.get(info.roomCode);
    if (!room) return;
    
    const toPlayer = message.toPlayer;
    let targetWs = null;
    
    if (toPlayer === 1) {
        targetWs = room.hostWs;
    } else {
        targetWs = room.guests.get(toPlayer);
    }
    
    if (targetWs && targetWs.readyState === 1) {
        targetWs.send(JSON.stringify({
            ...message,
            fromPlayer: info.playerNum
        }));
    }
}

// 处理断开连接
function handleDisconnect(ws) {
    const info = wsToRoom.get(ws);
    if (!info) return;
    
    const { roomCode, playerNum } = info;
    const room = rooms.get(roomCode);
    
    if (room) {
        room.players.delete(playerNum);
        
        if (playerNum === 1) {
            // 房主断开，通知所有玩家并关闭房间
            for (const [num, guestWs] of room.guests) {
                if (guestWs.readyState === 1) {
                    guestWs.send(JSON.stringify({ type: 'error', message: '房主已离开' }));
                    guestWs.close();
                }
            }
            rooms.delete(roomCode);
            console.log(`房间 ${roomCode} 已关闭（房主离开）`);
        } else {
            // 玩家断开，通知房主
            room.guests.delete(playerNum);
            if (room.hostWs.readyState === 1) {
                room.hostWs.send(JSON.stringify({
                    type: 'player-left',
                    playerNum
                }));
            }
            console.log(`玩家${playerNum}离开房间 ${roomCode}`);
        }
    }
    
    wsToRoom.delete(ws);
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}
