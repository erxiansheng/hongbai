/**
 * 阿里云边缘函数 - ROM 文件 API
 * 从 KV 存储读取游戏 ROM 文件
 * 
 * KV 存储格式 (由 scripts/upload-roms.py 上传):
 * - key: roms:{游戏名.zip} 或 roms:{游戏名.nes}
 * - value: ROM 文件的 base64 编码数据
 * 
 * 七牛云配置存储在 KV 中:
 * - key: QINIU_CONFIG
 * - value: JSON 格式的配置:
 *   {
 *     "accessKey": "七牛云AK",
 *     "secretKey": "七牛云SK",
 *     "domain": "下载域名，如 jieji.188np.cn",
 *     "folder": "文件夹路径，如 jiejiroms"
 *   }
 * 
 * 街机游戏代理:
 * - 从七牛云私密空间代理下载，使用签名认证
 * - 隐藏真实地址和密钥，防止被刷流量
 */

// 七牛云配置缓存（避免每次请求都读取 KV）
let qiniuConfigCache = null;

/**
 * 从 KV 获取七牛云配置
 */
async function getQiniuConfig(context) {
    // 如果有缓存，直接返回
    if (qiniuConfigCache) {
        return qiniuConfigCache;
    }
    
    try {
        const configStr = await context.env.KV.get('QINIU_CONFIG', { type: 'text' });
        if (configStr) {
            qiniuConfigCache = JSON.parse(configStr);
            return qiniuConfigCache;
        }
    } catch (e) {
        console.error('读取七牛云配置失败:', e);
    }
    
    return null;
}

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
 * 参考官方文档: https://developer.qiniu.com/kodo/1202/download-token
 * 
 * @param {object} config - 七牛云配置 { accessKey, secretKey, domain }
 * @param {string} key - 文件路径/名称（不需要 URL 编码，函数内部处理）
 * @param {number} expires - 过期时间（秒），默认1小时
 */
async function generateQiniuPrivateUrl(config, key, expires = 3600) {
    const deadline = Math.floor(Date.now() / 1000) + expires;
    
    // 构建基础 URL（key 不需要额外编码，七牛云会处理）
    // 注意：domain 可能已包含 http:// 或 https://
    let domain = config.domain;
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
        domain = `http://${domain}`;
    }
    
    // 原始 URL（key 保持原样，不编码）
    const baseUrl = `${domain}/${key}`;
    const urlWithDeadline = `${baseUrl}?e=${deadline}`;
    
    // 生成签名 - 对完整 URL 进行 HMAC-SHA1
    const signature = await hmacSha1(config.secretKey, urlWithDeadline);
    const encodedSign = base64UrlSafe(signature);
    
    // 构建 token: accessKey:encodedSign
    const token = `${config.accessKey}:${encodedSign}`;
    
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
        // 从 KV 获取七牛云配置
        const qiniuConfig = await getQiniuConfig(context);
        if (!qiniuConfig) {
            return jsonResponse({ error: '七牛云配置未找到，请检查 KV 中的 QINIU_CONFIG' }, 500);
        }
        
        // 文件在七牛云的路径: folder/游戏名.zip
        // 注意：这里不要对 gameName 进行 URL 编码，七牛云 key 是原始中文
        const folder = qiniuConfig.folder || qiniuConfig.bucket || 'jiejiroms';
        const fileKey = `${folder}/${gameName}.zip`;
        
        // 生成带签名的私密下载链接（有效期1小时）
        const signedUrl = await generateQiniuPrivateUrl(qiniuConfig, fileKey, 3600);
        console.log(`代理街机ROM: ${gameName}, URL: ${signedUrl}`);
        
        // 从七牛云下载
        const response = await fetch(signedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 EdgeFunction'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`七牛云返回错误: ${response.status}, body: ${errorText}`);
            
            if (response.status === 404) {
                return jsonResponse({ error: '街机游戏不存在', game: gameName, key: fileKey }, 404);
            }
            if (response.status === 401 || response.status === 403) {
                return jsonResponse({ error: '签名验证失败，请检查 AK/SK 配置', status: response.status }, 403);
            }
            return jsonResponse({ error: '下载失败', status: response.status, detail: errorText }, response.status);
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
        return jsonResponse({ error: '代理下载失败', message: error.message, stack: error.stack }, 500);
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
