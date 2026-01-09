/**
 * 阿里云边缘函数 - WebRTC信令服务
 * 部署到阿里云ESA边缘函数
 */

// 房间存储（边缘函数使用KV存储持久化）
const ROOM_TTL = 3600; // 房间1小时过期

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        
        // WebSocket升级
        if (request.headers.get('Upgrade') === 'websocket') {
            return handleWebSocket(request, env);
        }
        
        // REST API
        if (url.pathname === '/api/signaling') {
            return handleSignalingAPI(request, env);
        }
        
        // ROM文件获取
        if (url.pathname.startsWith('/api/rom/')) {
            return handleRomRequest(request, env);
        }
        
        // ROM上传接口（需要API密钥）
        if (url.pathname === '/api/upload-rom') {
            return handleRomUpload(request, env);
        }
        
        // 批量上传ROM
        if (url.pathname === '/api/upload-roms-batch') {
            return handleBatchRomUpload(request, env);
        }
        
        // 列出所有ROM
        if (url.pathname === '/api/list-roms') {
            return handleListRoms(request, env);
        }
        
        // 健康检查
        if (url.pathname === '/api/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response('Not Found', { status: 404 });
    }
};

async function handleWebSocket(request, env) {
    const [client, server] = Object.values(new WebSocketPair());
    
    server.accept();
    
    const state = {
        roomCode: null,
        isHost: false
    };
    
    server.addEventListener('message', async (event) => {
        try {
            const data = JSON.parse(event.data);
            await processMessage(server, data, state, env);
        } catch (e) {
            console.error('消息处理错误:', e);
        }
    });
    
    server.addEventListener('close', async () => {
        if (state.roomCode) {
            await handleDisconnect(state, env);
        }
    });
    
    return new Response(null, {
        status: 101,
        webSocket: client
    });
}

async function processMessage(ws, data, state, env) {
    const { type, roomCode } = data;
    
    switch (type) {
        case 'create-room':
            await createRoom(ws, roomCode, state, env);
            break;
            
        case 'join-room':
            await joinRoom(ws, roomCode, state, env);
            break;
            
        case 'offer':
        case 'answer':
        case 'ice-candidate':
            await relayMessage(ws, data, state, env);
            break;
    }
}

async function createRoom(ws, roomCode, state, env) {
    // 检查房间是否存在
    const existing = await env.KV.get(`room:${roomCode}`);
    if (existing) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已存在' }));
        return;
    }
    
    // 创建房间
    const roomData = {
        hostId: generateId(),
        guestId: null,
        created: Date.now()
    };
    
    await env.KV.put(`room:${roomCode}`, JSON.stringify(roomData), {
        expirationTtl: ROOM_TTL
    });
    
    state.roomCode = roomCode;
    state.isHost = true;
    state.peerId = roomData.hostId;
    
    // 存储WebSocket连接引用（使用Durable Objects更好）
    await env.KV.put(`ws:${roomData.hostId}`, 'connected', {
        expirationTtl: ROOM_TTL
    });
    
    ws.send(JSON.stringify({ type: 'room-created', roomCode }));
}

async function joinRoom(ws, roomCode, state, env) {
    const roomStr = await env.KV.get(`room:${roomCode}`);
    if (!roomStr) {
        ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
        return;
    }
    
    const room = JSON.parse(roomStr);
    if (room.guestId) {
        ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
        return;
    }
    
    // 更新房间
    room.guestId = generateId();
    await env.KV.put(`room:${roomCode}`, JSON.stringify(room), {
        expirationTtl: ROOM_TTL
    });
    
    state.roomCode = roomCode;
    state.isHost = false;
    state.peerId = room.guestId;
    
    // 通知双方
    ws.send(JSON.stringify({ type: 'peer-joined', peerId: 'host' }));
    
    // 通过消息队列通知房主（简化实现）
    await env.KV.put(`signal:${room.hostId}`, JSON.stringify({
        type: 'peer-joined',
        peerId: 'guest'
    }), { expirationTtl: 60 });
}

async function relayMessage(ws, data, state, env) {
    if (!state.roomCode) return;
    
    const roomStr = await env.KV.get(`room:${state.roomCode}`);
    if (!roomStr) return;
    
    const room = JSON.parse(roomStr);
    const targetId = state.isHost ? room.guestId : room.hostId;
    
    if (targetId) {
        // 存储待转发消息
        await env.KV.put(`signal:${targetId}`, JSON.stringify(data), {
            expirationTtl: 60
        });
    }
}

async function handleDisconnect(state, env) {
    if (!state.roomCode) return;
    
    const roomStr = await env.KV.get(`room:${state.roomCode}`);
    if (!roomStr) return;
    
    const room = JSON.parse(roomStr);
    
    if (state.isHost) {
        // 房主离开，删除房间
        await env.KV.delete(`room:${state.roomCode}`);
    } else {
        // 访客离开
        room.guestId = null;
        await env.KV.put(`room:${state.roomCode}`, JSON.stringify(room), {
            expirationTtl: ROOM_TTL
        });
    }
}

async function handleRomRequest(request, env) {
    const url = new URL(request.url);
    const gameId = decodeURIComponent(url.pathname.split('/api/rom/')[1]);
    
    // 从KV存储获取ROM
    const romData = await env.KV.get(`roms/${gameId}.zip`, 'arrayBuffer');
    
    if (!romData) {
        return new Response('ROM not found', { status: 404 });
    }
    
    return new Response(romData, {
        headers: {
            'Content-Type': 'application/zip',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// ROM上传接口
async function handleRomUpload(request, env) {
    // 验证API密钥
    const apiKey = request.headers.get('X-API-Key');
    const validKey = env.UPLOAD_API_KEY || 'your-secret-upload-key';
    
    if (apiKey !== validKey) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    if (request.method !== 'PUT' && request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    if (!key) {
        return new Response('Missing key parameter', { status: 400 });
    }
    
    try {
        const content = await request.arrayBuffer();
        
        // 存储到KV
        await env.KV.put(key, content);
        
        return new Response(JSON.stringify({ 
            success: true, 
            key: key,
            size: content.byteLength 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: e.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 批量上传ROM（JSON格式，Base64编码）
async function handleBatchRomUpload(request, env) {
    const apiKey = request.headers.get('X-API-Key');
    const validKey = env.UPLOAD_API_KEY || 'your-secret-upload-key';
    
    if (apiKey !== validKey) {
        return new Response('Unauthorized', { status: 401 });
    }
    
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    try {
        const { roms } = await request.json();
        // roms: [{key: 'roms/xxx.zip', data: 'base64...'}]
        
        const results = [];
        
        for (const rom of roms) {
            try {
                const buffer = Uint8Array.from(atob(rom.data), c => c.charCodeAt(0));
                await env.KV.put(rom.key, buffer.buffer);
                results.push({ key: rom.key, success: true });
            } catch (e) {
                results.push({ key: rom.key, success: false, error: e.message });
            }
        }
        
        return new Response(JSON.stringify({ results }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 列出所有ROM
async function handleListRoms(request, env) {
    try {
        const list = await env.KV.list({ prefix: 'roms/' });
        
        const roms = list.keys.map(k => ({
            key: k.name,
            name: k.name.replace('roms/', '').replace('.zip', '')
        }));
        
        return new Response(JSON.stringify({ 
            count: roms.length,
            roms 
        }), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 备用HTTP轮询API
async function handleSignalingAPI(request, env) {
    if (request.method === 'POST') {
        const data = await request.json();
        // 处理信令消息
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    if (request.method === 'GET') {
        const url = new URL(request.url);
        const peerId = url.searchParams.get('peerId');
        
        if (peerId) {
            // 获取待接收消息
            const message = await env.KV.get(`signal:${peerId}`);
            if (message) {
                await env.KV.delete(`signal:${peerId}`);
                return new Response(message, {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        
        return new Response('{}', {
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    return new Response('Method not allowed', { status: 405 });
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}
