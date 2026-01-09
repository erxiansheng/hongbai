/**
 * 阿里云边缘函数 - ROM 文件 API
 * 从 KV 存储读取游戏 ROM 文件
 * 
 * KV 存储格式 (由 scripts/upload-roms.py 上传):
 * - key: roms:{游戏名.zip} 或 roms:{游戏名.nes}
 * - value: ROM 文件的 base64 编码数据
 */

export async function handleRequest(request, context) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    // ROM API: /api/rom/{游戏名}
    if (path.startsWith('/api/rom/')) {
        const gameName = decodeURIComponent(path.substring(9));
        return await getRom(gameName, context);
    }

    return new Response('Not Found', { status: 404 });
}

/**
 * 清理key名称，与 upload-roms.py 保持一致
 */
function sanitizeKey(name) {
    return name.replace(/ /g, '_').replace(/，/g, '_').replace(/,/g, '_');
}

/**
 * 获取 ROM 文件
 */
async function getRom(gameName, context) {
    try {
        const sanitized = sanitizeKey(gameName);
        
        // 尝试多种 key 格式
        const keysToTry = [
            `roms:${sanitized}.zip`,
            `roms:${sanitized}.nes`,
            `roms:${sanitized}`,
        ];
        
        let romData = null;
        
        for (const key of keysToTry) {
            try {
                // 阿里云 ESA EdgeKV 返回 base64 编码的数据
                const value = await context.env.KV.get(key, { type: 'text' });
                if (value) {
                    // 解码 base64
                    romData = Uint8Array.from(atob(value), c => c.charCodeAt(0));
                    break;
                }
            } catch {}
        }
        
        if (!romData) {
            return jsonResponse({ error: '游戏不存在', game: gameName }, 404);
        }

        // 检测文件类型
        const bytes = romData.slice(0, 4);
        let contentType = 'application/octet-stream';
        let ext = '.nes';
        
        // ZIP 文件头: PK
        if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
            contentType = 'application/zip';
            ext = '.zip';
        }
        // NES 文件头: NES\x1A
        else if (bytes[0] === 0x4E && bytes[1] === 0x45 && bytes[2] === 0x53 && bytes[3] === 0x1A) {
            contentType = 'application/x-nes-rom';
            ext = '.nes';
        }

        return new Response(romData, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(gameName)}${ext}"`,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=86400'
            }
        });

    } catch (error) {
        console.error('获取ROM失败:', error);
        return jsonResponse({ error: '获取ROM失败', message: error.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

// 阿里云边缘函数入口
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, { env, ctx });
    }
};
