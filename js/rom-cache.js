// ROM 缓存管理器
// 使用 IndexedDB 缓存下载过的游戏ROM，避免重复下载

const DB_NAME = 'GameRomCache';
const DB_VERSION = 1;
const STORE_NAME = 'roms';

class RomCacheManager {
    constructor() {
        this.db = null;
        this.isReady = false;
    }

    // 初始化数据库
    async init() {
        if (this.isReady) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.warn('IndexedDB 打开失败，ROM缓存功能不可用');
                resolve(false);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                console.log('ROM缓存数据库已就绪');
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建ROM存储
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('platform', 'platform', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('ROM缓存存储已创建');
                }
            };
        });
    }

    // 生成缓存键
    getCacheKey(gameId, platform) {
        return `${platform}:${gameId}`;
    }

    // 检查ROM是否已缓存
    async has(gameId, platform = 'nes') {
        if (!this.isReady) return false;

        const key = this.getCacheKey(gameId, platform);
        
        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    resolve(!!request.result);
                };

                request.onerror = () => {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    }

    // 获取缓存的ROM
    async get(gameId, platform = 'nes') {
        if (!this.isReady) return null;

        const key = this.getCacheKey(gameId, platform);

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => {
                    if (request.result) {
                        console.log(`从缓存加载: ${gameId} (${platform})`);
                        resolve({
                            data: new Uint8Array(request.result.data),
                            romName: request.result.romName,
                            size: request.result.size,
                            timestamp: request.result.timestamp
                        });
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    }

    // 保存ROM到缓存
    async set(gameId, platform, romData, romName = '') {
        if (!this.isReady) return false;

        const key = this.getCacheKey(gameId, platform);

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const record = {
                    id: key,
                    gameId: gameId,
                    platform: platform,
                    romName: romName,
                    data: romData.buffer || romData,  // 存储 ArrayBuffer
                    size: romData.length || romData.byteLength,
                    timestamp: Date.now()
                };

                const request = store.put(record);

                request.onsuccess = () => {
                    const sizeMB = (record.size / 1024 / 1024).toFixed(2);
                    console.log(`ROM已缓存: ${gameId} (${platform}) - ${sizeMB} MB`);
                    resolve(true);
                };

                request.onerror = () => {
                    console.warn('ROM缓存失败:', request.error);
                    resolve(false);
                };
            } catch (e) {
                console.warn('ROM缓存异常:', e);
                resolve(false);
            }
        });
    }

    // 删除缓存的ROM
    async delete(gameId, platform = 'nes') {
        if (!this.isReady) return false;

        const key = this.getCacheKey(gameId, platform);

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(key);

                request.onsuccess = () => {
                    console.log(`缓存已删除: ${gameId} (${platform})`);
                    resolve(true);
                };

                request.onerror = () => {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    }

    // 获取所有缓存的ROM列表
    async list() {
        if (!this.isReady) return [];

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    const list = (request.result || []).map(item => ({
                        id: item.id,
                        gameId: item.gameId,
                        platform: item.platform,
                        romName: item.romName,
                        size: item.size,
                        timestamp: item.timestamp
                    }));
                    resolve(list);
                };

                request.onerror = () => {
                    resolve([]);
                };
            } catch (e) {
                resolve([]);
            }
        });
    }

    // 获取缓存统计信息
    async getStats() {
        const list = await this.list();
        const totalSize = list.reduce((sum, item) => sum + (item.size || 0), 0);
        
        return {
            count: list.length,
            totalSize: totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            games: list
        };
    }

    // 清空所有缓存
    async clear() {
        if (!this.isReady) return false;

        return new Promise((resolve) => {
            try {
                const transaction = this.db.transaction([STORE_NAME], 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('ROM缓存已清空');
                    resolve(true);
                };

                request.onerror = () => {
                    resolve(false);
                };
            } catch (e) {
                resolve(false);
            }
        });
    }
}

// 导出单例
export const romCache = new RomCacheManager();
