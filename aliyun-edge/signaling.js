/**
 * 阿里云边缘函数 - ROM 文件 API
 * 从 KV 存储读取游戏 ROM 文件
 * 
 * KV 存储格式 (由 scripts/upload-roms.py 上传):
 * - key: roms:{游戏名.zip} 或 roms:{游戏名.nes}
 * - value: ROM 文件的 base64 编码数据
 * 
 * 街机游戏代理:
 * - 从七牛云私密空间代理下载，使用签名认证
 * - 隐藏真实地址和密钥，防止被刷流量
 */

// ============ 七牛云配置（私密空间） ============
// 注意：这些密钥只在边缘函数内部使用，不会暴露给前端
const QINIU_CONFIG = {
    accessKey: 'wusPRsFqSrjbDgQGvLxJfjV10kcDjEwWr2JVOA34',      // 替换为你的 AccessKey
    secretKey: '0misZAF4L7s_fjWGrWGlBDs3g9ZyI6oguazuQPb-',      // 替换为你的 SecretKey
    domain: 'jieji.188np.cn',  // 你的七牛云域名
    bucket: 'jiejiroms'                // 存储空间名（用于路径）
};

/**
 * HMAC-SHA1 签名（使用 Web Crypto API）
 */
async function hmacSha1(key, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const messageData = encoder.encode(message);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return signature;
}

/**
 * Base64 URL 安全编码（七牛云要求）
 */
function base64UrlSafe(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * 生成七牛云私密空间下载链接
 * @param {string} key - 文件路径/名称
 * @param {number} expires - 过期时间（秒），默认1小时
 */
async function generateQiniuPrivateUrl(key, expires = 3600) {
    const deadline = Math.floor(Date.now() / 1000) + expires;
    
    // 构建基础 URL
    const baseUrl = `http://${QINIU_CONFIG.domain}/${key}`;
    const urlWithDeadline = `${baseUrl}?e=${deadline}`;
    
    // 生成签名
    const signature = await hmacSha1(QINIU_CONFIG.secretKey, urlWithDeadline);
    const encodedSign = base64UrlSafe(signature);
    
    // 构建 token
    const token = `${QINIU_CONFIG.accessKey}:${encodedSign}`;
    
    // 返回完整的签名 URL
    return `${urlWithDeadline}&token=${token}`;
}

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

    // NES ROM API: /api/rom/{游戏名}
    if (path.startsWith('/api/rom/')) {
        const gameName = decodeURIComponent(path.substring(9));
        return await getRom(gameName, context);
    }
    
    // 街机 ROM 代理 API: /api/arcade/{游戏名}
    if (path.startsWith('/api/arcade/')) {
        const gameName = decodeURIComponent(path.substring(12));
        return await getArcadeRom(gameName, context);
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
 * 获取 NES ROM 文件（从 KV 存储）
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

/**
 * 代理获取街机 ROM 文件（从七牛云私密空间）
 * 使用签名认证下载，隐藏真实地址和密钥
 * 
 * 缓存策略：
 * 1. 设置 Cache-Control 让 ESA 边缘节点缓存响应
 * 2. 配合 ESA 控制台的缓存规则，可实现边缘缓存
 * 3. 同一游戏第二次请求时直接从边缘返回，不回源七牛云
 */
async function getArcadeRom(gameName, context) {
    try {
        // 文件在七牛云的路径
        const fileKey = `jiejiroms/${encodeURIComponent(gameName)}.zip`;
        
        // 生成带签名的私密下载链接（有效期1小时）
        const signedUrl = await generateQiniuPrivateUrl(fileKey, 3600);
        console.log(`代理街机ROM: ${gameName}`);
        
        // 从七牛云下载
        const response = await fetch(signedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 EdgeFunction'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                return jsonResponse({ error: '街机游戏不存在', game: gameName }, 404);
            }
            if (response.status === 401 || response.status === 403) {
                return jsonResponse({ error: '签名验证失败', status: response.status }, 403);
            }
            return jsonResponse({ error: '下载失败', status: response.status }, response.status);
        }
        
        // 获取文件内容
        const romData = await response.arrayBuffer();
        
        // 返回响应，设置长缓存时间让 ESA 边缘节点缓存
        return new Response(romData, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(gameName)}.zip"`,
                'Access-Control-Allow-Origin': '*',
                // 边缘缓存7天，浏览器缓存1天
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'CDN-Cache-Control': 'max-age=604800',
                'Content-Length': romData.byteLength.toString()
            }
        });
        
    } catch (error) {
        console.error('代理街机ROM失败:', error);
        return jsonResponse({ error: '代理下载失败', message: error.message }, 500);
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
