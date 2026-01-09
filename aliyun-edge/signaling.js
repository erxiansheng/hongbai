/**
 * 阿里云边缘函数 - WebRTC信令服务 + ROM服务
 * 部署到阿里云ESA边缘函数
 * 
 * 注意：需要在ESA控制台绑定KV命名空间，绑定名称为 "roms"
 */

// KV命名空间名称（在ESA控制台配置）
const KV_NAMESPACE = 'roms';

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
            // ROM文件获取 - /api/rom/游戏名
            if (url.pathname.startsWith('/api/rom/')) {
                return await handleRomRequest(request, env);
            }
            
            // 列出所有ROM
            if (url.pathname === '/api/list-roms') {
                return await handleListRoms(request, env);
            }
            
            // 信令服务 - HTTP轮询方式
            if (url.pathname.startsWith('/api/signaling')) {
                return await handleSignalingAPI(request, env);
            }
            
            // 健康检查
            if (url.pathname === '/api/health') {
                return jsonResponse({ status: 'ok', time: Date.now() });
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

// 信令API - HTTP轮询方式（替代WebSocket）
async function handleSignalingAPI(request, env) {
    const url = new URL(request.url);
    const kv = getKV(env);
    
    // 创建房间
    if (url.pathname === '/api/signaling/create') {
        const roomCode = url.searchParams.get('room') || generateId();
        const peerId = generateId();
        
        if (kv) {
            const existing = await kv.get(`room:${roomCode}`);
            if (existing) {
                return jsonResponse({ error: '房间已存在' }, 400);
            }
            
            await kv.put(`room:${roomCode}`, JSON.stringify({
                hostId: peerId,
                guestId: null,
                created: Date.now()
            }), { expirationTtl: 3600 });
        }
        
        return jsonResponse({ success: true, roomCode, peerId, isHost: true });
    }
    
    // 加入房间
    if (url.pathname === '/api/signaling/join') {
        const roomCode = url.searchParams.get('room');
        if (!roomCode) {
            return jsonResponse({ error: '缺少房间号' }, 400);
        }
        
        const peerId = generateId();
        
        if (kv) {
            const roomStr = await kv.get(`room:${roomCode}`);
            if (!roomStr) {
                return jsonResponse({ error: '房间不存在' }, 404);
            }
            
            const room = JSON.parse(roomStr);
            if (room.guestId) {
                return jsonResponse({ error: '房间已满' }, 400);
            }
            
            room.guestId = peerId;
            await kv.put(`room:${roomCode}`, JSON.stringify(room), { expirationTtl: 3600 });
        }
        
        return jsonResponse({ success: true, roomCode, peerId, isHost: false });
    }
    
    // 发送信令消息
    if (url.pathname === '/api/signaling/send' && request.method === 'POST') {
        const data = await request.json();
        const { roomCode, peerId, message } = data;
        
        if (kv && roomCode && peerId) {
            // 存储消息供对方轮询
            await kv.put(`msg:${roomCode}:${peerId}`, JSON.stringify(message), { expirationTtl: 60 });
        }
        
        return jsonResponse({ success: true });
    }
    
    // 轮询消息
    if (url.pathname === '/api/signaling/poll') {
        const roomCode = url.searchParams.get('room');
        const peerId = url.searchParams.get('peer');
        
        if (kv && roomCode) {
            // 获取房间信息
            const roomStr = await kv.get(`room:${roomCode}`);
            if (roomStr) {
                const room = JSON.parse(roomStr);
                // 获取对方发来的消息
                const targetId = room.hostId === peerId ? room.guestId : room.hostId;
                if (targetId) {
                    const msgKey = `msg:${roomCode}:${targetId}`;
                    const msg = await kv.get(msgKey);
                    if (msg) {
                        await kv.delete(msgKey);
                        return jsonResponse({ message: JSON.parse(msg) });
                    }
                }
            }
        }
        
        return jsonResponse({ message: null });
    }
    
    return jsonResponse({ error: 'Unknown signaling endpoint' }, 404);
}

function generateId() {
    return Math.random().toString(36).substring(2, 15);
}
