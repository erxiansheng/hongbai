# 街机游戏厅

基于阿里云 ESA 边缘计算的 Web 游戏模拟器平台，支持 FC/NES、街机等多种游戏，具备联机对战、语音聊天、智能缓存等功能。

## 技术栈

深度集成阿里云 ESA（边缘安全加速）服务，充分利用边缘计算能力实现高性能、低成本的游戏分发方案。

### 核心技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ IndexedDB   │  │ 静态资源     │  │ 边缘函数 API             │  │
│  │ 本地缓存     │  │ (ESA CDN)   │  │ /api/rom /api/arcade    │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          │ 1.优先本地     │ 2.静态资源          │ 3.动态API
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    阿里云 ESA 边缘节点                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    EdgeRoutine 边缘函数                      ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────────┐   ││
│  │  │ 路由分发   │  │ 签名生成   │  │ 流式代理 & 边缘缓存    │   ││
│  │  └─────┬─────┘  └─────┬─────┘  └───────────┬───────────┘   ││
│  └────────┼──────────────┼────────────────────┼────────────────┘│
│           │              │                    │                 │
│  ┌────────▼──────────────▼────────────────────▼────────────────┐│
│  │                      EdgeKV 边缘存储                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  ││
│  │  │ QINIU_CONFIG│  │ roms:游戏名  │  │ 配置/小型ROM缓存     │  ││
│  │  │ OSS配置信息  │  │ NES ROM数据 │  │                     │  ││
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 4.回源（仅首次/大文件）
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      七牛云 OSS 私密空间                         │
│                    （街机ROM源站存储）                           │
└─────────────────────────────────────────────────────────────────┘
```

## ESA 边缘函数应用

### 1. EdgeKV 边缘存储

**配置信息存储**：将 OSS 访问密钥存储在 EdgeKV，边缘函数运行时读取，避免硬编码敏感信息。

```javascript
// 创建 EdgeKV 实例
const edgeKV = new EdgeKV({ namespace: 'roms' });

// 从 KV 读取 OSS 配置（带内存缓存）
let qiniuConfigCache = null;
async function getQiniuConfig() {
    if (qiniuConfigCache) return qiniuConfigCache;
    
    const configStr = await edgeKV.get('QINIU_CONFIG', { type: 'text' });
    qiniuConfigCache = JSON.parse(configStr);
    return qiniuConfigCache;
}
```

**KV 存储结构**：
| Key | Value | 用途 |
|-----|-------|------|
| `QINIU_CONFIG` | JSON配置 | OSS访问密钥、域名、文件夹路径 |
| `roms:游戏名.nes` | Base64数据 | NES小型ROM直接存储 |

### 2. 边缘函数代理 OSS - 隐藏真实地址

**核心优势**：
- ✅ **地址隐藏**：用户只能访问边缘函数 API，无法获取 OSS 真实地址
- ✅ **密钥保护**：AK/SK 存储在 EdgeKV，不暴露给前端
- ✅ **防盗刷**：签名 URL 有效期仅 1 小时，过期自动失效
- ✅ **流量节省**：边缘缓存命中后不消耗 OSS 回源流量

```javascript
// 边缘函数入口 - 路由分发
export async function handleRequest(request) {
    const path = new URL(request.url).pathname;
    
    // NES ROM: 从 EdgeKV 直接读取
    if (path.startsWith('/api/rom/')) {
        return await getRomFromKV(gameName);
    }
    
    // 街机 ROM: 代理 OSS 下载
    if (path.startsWith('/api/arcade/')) {
        return await proxyArcadeRom(gameName);
    }
}
```

### 3. 私密空间签名认证

使用 Web Crypto API 在边缘节点生成 HMAC-SHA1 签名：

```javascript
// HMAC-SHA1 签名生成
async function hmacSha1(key, message) {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw', encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-1' },
        false, ['sign']
    );
    return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

// 生成带签名的私密下载链接
async function generateQiniuPrivateUrl(config, key, expires = 3600) {
    const deadline = Math.floor(Date.now() / 1000) + expires;
    const baseUrl = `https://${config.domain}/${key}`;
    const urlWithDeadline = `${baseUrl}?e=${deadline}`;
    
    // 签名 = HMAC-SHA1(secretKey, urlWithDeadline)
    const signature = await hmacSha1(config.secretKey, urlWithDeadline);
    const token = `${config.accessKey}:${base64UrlSafe(signature)}`;
    
    return `${urlWithDeadline}&token=${token}`;
}
```

### 4. 智能分级缓存策略

**四级缓存架构**：

```
用户请求 ROM
    │
    ▼
┌─────────────────┐
│ 1. IndexedDB    │ ← 浏览器本地缓存（永久）
│    本地缓存     │
└────────┬────────┘
         │ 未命中
         ▼
┌─────────────────┐
│ 2. ESA 静态资源 │ ← 边缘 CDN 缓存（7天）
│    边缘缓存     │
└────────┬────────┘
         │ 未命中
         ▼
┌─────────────────┐
│ 3. EdgeKV       │ ← 边缘 KV 存储（NES小型ROM）
│    边缘存储     │
└────────┬────────┘
         │ 未命中
         ▼
┌─────────────────┐
│ 4. OSS 回源     │ ← 源站存储（街机大型ROM）
│    代理下载     │
└─────────────────┘
```

**前端缓存逻辑**：

```javascript
async function loadRom(gameId, platform) {
    // 1. 优先读取 IndexedDB 本地缓存
    const cached = await romCache.get(gameId, platform);
    if (cached) {
        console.log('从本地缓存加载');
        return cached.data;
    }
    
    // 2. 从边缘函数 API 下载
    const response = await fetch(`/api/${platform}/${gameId}`);
    const romData = await response.arrayBuffer();
    
    // 3. 保存到本地缓存
    await romCache.set(gameId, platform, romData);
    
    return romData;
}
```

### 5. 流式传输 & 大文件处理

**智能分流策略**：根据文件大小选择最优传输方式，使用流式传输避免内存溢出

```javascript
async function getArcadeRom(gameName) {
    // 获取文件大小
    const headResponse = await fetch(signedUrl, { method: 'HEAD' });
    const contentLength = parseInt(headResponse.headers.get('content-length'));
    
    // 大文件（>=15MB）：返回签名URL，前端直接下载
    // 避免边缘函数内存限制，减少边缘节点压力
    if (contentLength > 15 * 1024 * 1024) {
        return jsonResponse({
            redirect: true,
            url: signedUrl,  // 1小时有效期的签名URL
            size: contentLength
        });
    }
    
    // 小文件：流式代理下载，直接转发响应流
    const response = await fetch(signedUrl);
    
    // 流式传输：直接转发 response.body，不读取到内存
    // 避免 ArrayBuffer allocation failed 错误
    return new Response(response.body, {
        headers: {
            'Content-Type': 'application/zip',
            'Cache-Control': 'public, max-age=86400, s-maxage=604800',
            'CDN-Cache-Control': 'max-age=604800'  // ESA边缘缓存7天
        }
    });
}
```

**流式传输优势**：

- ✅ **零内存缓冲**：直接转发上游响应流，不占用边缘函数内存
- ✅ **避免溢出**：解决大文件 `Array buffer allocation failed` 错误
- ✅ **低延迟**：数据边下载边转发，用户更快收到首字节
```

**缓存控制头说明**：
| Header | 值 | 作用 |
|--------|-----|------|
| `max-age` | 86400 | 浏览器缓存 1 天 |
| `s-maxage` | 604800 | ESA 边缘缓存 7 天 |
| `CDN-Cache-Control` | max-age=604800 | 强制 CDN 缓存 7 天 |

### 6. 零回源流量优化

**流量节省原理**：

```
首次请求：用户 → ESA边缘 → OSS回源 → 边缘缓存 → 用户
后续请求：用户 → ESA边缘（缓存命中）→ 用户

                    ┌──────────────────┐
                    │   OSS 回源流量   │
                    │   仅首次请求     │
                    └────────┬─────────┘
                             │
    ┌────────────────────────┼────────────────────────┐
    │                        ▼                        │
    │  ┌─────────────────────────────────────────┐   │
    │  │         ESA 边缘节点缓存                 │   │
    │  │         s-maxage=604800 (7天)           │   │
    │  └─────────────────────────────────────────┘   │
    │         │              │              │        │
    │         ▼              ▼              ▼        │
    │      用户A          用户B          用户C       │
    │    (首次回源)     (缓存命中)     (缓存命中)    │
    └────────────────────────────────────────────────┘
```

**成本对比**：
| 场景 | 传统方案 | ESA边缘方案 |
|------|---------|------------|
| 100用户下载同一游戏 | 100次OSS回源 | 1次OSS回源 |
| 流量成本 | 100x | 1x |
| 用户延迟 | 高（跨区域） | 低（就近边缘） |

## 📦 IndexedDB 本地缓存

使用浏览器 IndexedDB 实现游戏 ROM 本地持久化缓存：

```javascript
class RomCacheManager {
    constructor() {
        this.db = null;
    }

    async init() {
        const request = indexedDB.open('GameRomCache', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const store = db.createObjectStore('roms', { keyPath: 'id' });
            store.createIndex('platform', 'platform');
            store.createIndex('timestamp', 'timestamp');
        };
    }

    // 生成缓存键: platform:gameId
    getCacheKey(gameId, platform) {
        return `${platform}:${gameId}`;
    }

    // 检查缓存是否存在
    async has(gameId, platform) { /* ... */ }

    // 获取缓存的ROM
    async get(gameId, platform) { /* ... */ }

    // 保存ROM到缓存
    async set(gameId, platform, romData, romName) { /* ... */ }

    // 获取缓存统计
    async getStats() {
        const list = await this.list();
        return {
            count: list.length,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
        };
    }
}
```

**缓存优势**：
- 首次下载后永久本地存储
- 再次游玩秒开，无需网络
- 支持离线游玩（PWA模式）

## 🎮 功能特性

### 多平台游戏支持

- **FC/NES**：红白机经典游戏，支持联机对战
- **街机**：拳皇、合金弹头、恐龙快打等经典街机
- **GBA**：Game Boy Advance 游戏（EmulatorJS）

### 联机对战系统

- **WebRTC P2P**：点对点直连，低延迟同步
- **房间系统**：创建/加入房间，最多4人同玩
- **实时同步**：游戏状态与手柄输入实时同步

### 语音聊天

- **P2P 音频**：语音数据直传，不经服务器
- **回声消除**：自动回声消除与噪声抑制
- **静音控制**：一键静音/取消静音

### 游戏存档

- **即时存档**：随时保存游戏进度
- **多槽位**：每个游戏5个独立存档槽
- **本地存储**：存档保存在浏览器本地

### 手柄支持

- **物理手柄**：支持 Xbox、PS、Switch Pro 等标准手柄
- **自定义映射**：可自定义按键映射
- **虚拟手柄**：移动端触屏虚拟手柄

### 移动端适配

- **虚拟按键**：触屏虚拟手柄操控
- **横屏优化**：横屏自动全屏，隐藏UI
- **PWA 支持**：可添加到主屏幕

### 智能缓存

- **IndexedDB**：游戏ROM本地永久缓存
- **离线游玩**：缓存后无需网络
- **秒开加载**：本地加载 < 50ms

## 📁 项目结构

```
├── index.html              # 主页面
├── css/style.css           # 样式文件
├── js/
│   ├── main.js             # 主入口
│   ├── emulator-multi.js   # 多平台模拟器（JSNES + EmulatorJS）
│   ├── room.js             # 房间管理（WebRTC P2P）
│   ├── voice-chat.js       # 语音聊天（WebRTC 音频）
│   ├── rom-cache.js        # ROM本地缓存（IndexedDB）
│   ├── input.js            # 输入管理
│   └── arcade-games.js     # 街机游戏配置
├── aliyun-edge/
│   └── signaling.js        # 阿里云ESA边缘函数
├── server/
│   └── signaling_server.py # 信令服务器
├── emulatorjs/             # EmulatorJS 模拟器
├── bios/                   # 街机 BIOS 文件
└── roms/                   # ROM 文件目录
```

## 🛠️ 部署说明

### 阿里云 ESA 配置

1. **创建 ESA 站点**
   - 登录阿里云控制台 → 边缘安全加速 ESA
   - 创建站点，绑定域名

2. **部署边缘函数**
   - 创建 EdgeRoutine 函数
   - 上传 `aliyun-edge/signaling.js`
   - 配置路由规则：`/api/*` → 边缘函数

3. **配置 EdgeKV**
   - 创建命名空间：`roms`
   - 添加 OSS 配置：
   ```json
   {
     "key": "QINIU_CONFIG",
     "value": {
       "accessKey": "your-access-key",
       "secretKey": "your-secret-key", 
       "domain": "your-cdn-domain.com",
       "folder": "roms-folder"
     }
   }
   ```

4. **上传静态资源**
   - 将前端文件上传到 ESA Pages
   - 或配置回源到 OSS

### 本地开发

```bash
# 前端
python -m http.server 8080

# 信令服务器
pip install websockets
python server/signaling_server.py
```

## 🌐 技术栈

| 类别 | 技术 |
|------|------|
| 边缘计算 | 阿里云 ESA EdgeRoutine |
| 边缘存储 | 阿里云 ESA EdgeKV |
| CDN加速 | 阿里云 ESA |
| 对象存储 | 七牛云 OSS（私密空间） |
| 本地存储 | IndexedDB |
| 前端框架 | 原生 JavaScript (ES6+) |
| 模拟器 | JSNES, EmulatorJS |
| 实时通信 | WebSocket, WebRTC |

## 📊 性能指标

| 指标 | 数值 |
|------|------|
| 首次加载（边缘缓存命中） | < 500ms |
| 本地缓存加载 | < 50ms |
| 边缘节点覆盖 | 全球 2800+ |
| OSS回源节省 | 99%+ |

## 📄 许可证

MIT License

## 本项目由阿里云ESA提供加速、计算和保护
![alt text](image-1.png)