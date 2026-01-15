/**
 * ROM批量上传脚本 - 上传到阿里云ESA KV存储
 * 
 * 使用方法:
 * 1. 安装依赖: npm install
 * 2. 配置环境变量或修改下方配置
 * 3. 运行: node scripts/upload-roms.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============ 配置区域 ============
const CONFIG = {
    // 阿里云ESA配置
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || 'your-access-key-id',
    accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || 'your-access-key-secret',
    
    // KV命名空间ID（从阿里云ESA控制台获取）
    kvNamespaceId: process.env.KV_NAMESPACE_ID || 'your-kv-namespace-id',
    
    // ESA站点ID
    siteId: process.env.ESA_SITE_ID || 'your-site-id',
    
    // ROM文件目录
    romsDir: path.join(__dirname, '..', 'roms'),
    
    // API端点
    apiEndpoint: 'esa.aliyuncs.com',
    
    // 并发上传数
    concurrency: 5,
};

// ============ 工具函数 ============

// 读取目录下所有zip文件
function getRomFiles(dir) {
    const files = fs.readdirSync(dir);
    return files
        .filter(f => f.endsWith('.zip'))
        .map(f => ({
            name: f,
            key: f, // KV存储的key
            path: path.join(dir, f)
        }));
}

// 读取文件为Base64
function readFileAsBase64(filePath) {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString('base64');
}

// 生成阿里云API签名（简化版，实际需要完整签名）
function generateSignature(params, secret) {
    const crypto = require('crypto');
    const sortedParams = Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const stringToSign = `POST&%2F&${encodeURIComponent(sortedParams)}`;
    return crypto.createHmac('sha1', secret + '&').update(stringToSign).digest('base64');
}

// ============ 上传方法 ============

// 方法1: 使用阿里云CLI（推荐）
async function uploadWithCLI() {
    const { execSync } = require('child_process');
    const romFiles = getRomFiles(CONFIG.romsDir);
    
    console.log(`找到 ${romFiles.length} 个ROM文件`);
    
    for (const rom of romFiles) {
        const key = `roms/${rom.key}`;
        console.log(`上传: ${rom.name} -> ${key}`);
        
        try {
            // 使用阿里云CLI上传
            execSync(`aliyun esa PutKvWithHighCapacity --SiteId ${CONFIG.siteId} --Namespace ${CONFIG.kvNamespaceId} --Key "${key}" --Value "$(base64 -i "${rom.path}")"`, {
                stdio: 'inherit'
            });
            console.log(`✓ ${rom.name} 上传成功`);
        } catch (error) {
            console.error(`✗ ${rom.name} 上传失败:`, error.message);
        }
    }
}

// 方法2: 使用HTTP API
async function uploadWithAPI() {
    const romFiles = getRomFiles(CONFIG.romsDir);
    console.log(`找到 ${romFiles.length} 个ROM文件`);
    
    // 分批上传
    for (let i = 0; i < romFiles.length; i += CONFIG.concurrency) {
        const batch = romFiles.slice(i, i + CONFIG.concurrency);
        await Promise.all(batch.map(rom => uploadSingleRom(rom)));
        console.log(`进度: ${Math.min(i + CONFIG.concurrency, romFiles.length)}/${romFiles.length}`);
    }
}

async function uploadSingleRom(rom) {
    return new Promise((resolve, reject) => {
        const content = readFileAsBase64(rom.path);
        const key = `roms/${rom.key}`;
        
        // 构建请求（这里需要根据阿里云ESA实际API调整）
        const postData = JSON.stringify({
            Key: key,
            Value: content,
        });
        
        const options = {
            hostname: CONFIG.apiEndpoint,
            port: 443,
            path: `/2024-09-10/sites/${CONFIG.siteId}/kv-namespaces/${CONFIG.kvNamespaceId}/values`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': `Bearer ${CONFIG.accessKeyId}`, // 简化，实际需要完整签名
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    console.log(`✓ ${rom.name}`);
                    resolve();
                } else {
                    console.error(`✗ ${rom.name}: ${res.statusCode} ${data}`);
                    reject(new Error(data));
                }
            });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

// 方法3: 生成curl命令（手动执行）
function generateCurlCommands() {
    const romFiles = getRomFiles(CONFIG.romsDir);
    const commands = [];
    
    console.log('# ROM上传curl命令\n');
    
    for (const rom of romFiles) {
        const key = `roms/${rom.key}`;
        const cmd = `curl -X PUT "https://esa.aliyuncs.com/2024-09-10/sites/${CONFIG.siteId}/kv-namespaces/${CONFIG.kvNamespaceId}/values/${encodeURIComponent(key)}" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/octet-stream" \\
  --data-binary @"${rom.path}"`;
        commands.push(cmd);
        console.log(cmd);
        console.log('');
    }
    
    // 保存到文件
    fs.writeFileSync('upload-commands.sh', commands.join('\n\n'), 'utf8');
    console.log('\n命令已保存到 upload-commands.sh');
}

// 方法4: 生成JSON清单（用于批量导入）
function generateManifest() {
    const romFiles = getRomFiles(CONFIG.romsDir);
    const manifest = romFiles.map(rom => ({
        key: `roms/${rom.key}`,
        file: rom.path,
        size: fs.statSync(rom.path).size,
    }));
    
    fs.writeFileSync('roms-manifest.json', JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`清单已生成: roms-manifest.json (${manifest.length} 个文件)`);
    
    // 统计总大小
    const totalSize = manifest.reduce((sum, r) => sum + r.size, 0);
    console.log(`总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
}

// ============ 主程序 ============
async function main() {
    const args = process.argv.slice(2);
    const method = args[0] || 'manifest';
    
    console.log('=== ROM批量上传工具 ===\n');
    
    switch (method) {
        case 'cli':
            console.log('使用阿里云CLI上传...\n');
            await uploadWithCLI();
            break;
        case 'api':
            console.log('使用HTTP API上传...\n');
            await uploadWithAPI();
            break;
        case 'curl':
            console.log('生成curl命令...\n');
            generateCurlCommands();
            break;
        case 'manifest':
        default:
            console.log('生成ROM清单...\n');
            generateManifest();
            console.log('\n使用方法:');
            console.log('  node scripts/upload-roms.js manifest  - 生成清单');
            console.log('  node scripts/upload-roms.js cli       - 使用阿里云CLI上传');
            console.log('  node scripts/upload-roms.js curl      - 生成curl命令');
            break;
    }
}

main().catch(console.error);
