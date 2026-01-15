// 多平台模拟器封装
// 整合 NES (jsnes) + 其他平台 (EmulatorJS)

import { PLATFORMS, detectPlatform, detectPlatformFromData } from './emulator-core.js';

// EmulatorJS 配置
// 本地路径优先，如果本地没有则使用 CDN
const EMULATORJS_CDN = 'https://cdn.emulatorjs.org/stable/data/';
const EMULATORJS_LOCAL = 'emulatorjs/';  // 本地 EmulatorJS 文件目录

// 检查是否使用本地 EmulatorJS 文件
let useLocalEmulatorJS = false;

// 核心映射 - EmulatorJS 支持的核心
const CORE_MAP = {
    nes: 'fceumm',        // FC/NES (fceumm 兼容性更好)
    sfc: 'snes9x',        // SFC/SNES
    snes: 'snes9x',
    md: 'genesis_plus_gx', // 世嘉MD
    gba: 'mgba',          // GBA
    gb: 'gambatte',       // GB
    gbc: 'gambatte',      // GBC
    n64: 'mupen64plus_next', // N64
    pce: 'mednafen_pce',  // PCE
    arcade: 'fbneo',      // 街机
    neogeo: 'fbneo',
    mame: 'mame2003_plus', // MAME
    wsc: 'mednafen_wswan', // WSC
    nds: 'melonds',       // NDS
    psx: 'pcsx_rearmed',  // PS1
    ps: 'pcsx_rearmed',
    psp: 'ppsspp',        // PSP
    dc: 'flycast',        // Dreamcast
};

// CPS2 游戏列表 (需要 qsound.zip BIOS)
const CPS2_GAMES = [
    'mshvsf', 'xmvsf', 'mvsc', 'sfa', 'sfa2', 'sfa3', 'ssf2', 'ssf2t',
    'vsav', 'vsav2', 'dstlk', 'nwarr', 'cybots', 'armwar', 'avsp',
    'ddsom', 'ddtod', 'aliens', 'batcir', 'csclub', 'dimahoo',
    'gigawing', 'jyangoku', 'megaman2', 'mmatrix', 'mpang', 'progear',
    'pzloop2', 'qndream', 'ringdest', 'sgemf', 'spf2t', 'xmcota'
];

// Neo Geo 游戏列表 (需要 neogeo.zip BIOS)
const NEOGEO_GAMES = [
    'kof94', 'kof95', 'kof96', 'kof97', 'kof98', 'kof99', 'kof2000', 'kof2001', 'kof2002', 'kof2003',
    'fatfury1', 'fatfury2', 'fatfury3', 'fatfursp', 'garou', 'rbff1', 'rbff2', 'rbffspec',
    'samsho', 'samsho2', 'samsho3', 'samsho4', 'samsho5', 'samsh5sp',
    'mslug', 'mslug2', 'mslug3', 'mslug4', 'mslug5', 'mslugx',
    'aof', 'aof2', 'aof3', 'lastblad', 'lastbld2', 'wh1', 'wh2', 'wh2j', 'whp',
    'neogeo', 'blazstar', 'pulstar', 'viewpoin', 'twinspri', 'magdrop2', 'magdrop3'
];

// PGM 游戏列表 (需要 pgm.zip BIOS) - 西游释厄传、三国战纪等
const PGM_GAMES = [
    'olds', 'olds100', 'olds100a', 'olds103t',  // 西游释厄传
    'kovsh', 'kovshp', 'kovshxas', 'kovlsqh', 'kovlsqh2', 'kovlsjb', 'kovlsjba', // 三国战纪
    'kov', 'kov2', 'kov2p', 'kov2nl', 'kov3', // 三国战纪系列
    'orlegend', 'orlegnde', 'orlegndc', // 西游释厄传
    'drgw2', 'drgw2c', 'drgw2j', 'drgw3', // 龙王
    'killbld', 'killbldp', // 傲剑狂刀
    'ddp2', 'ddp3', 'ddp3b', // 怒首领蜂
    'espgal', 'espgalbl', // ESP
    'pgm', 'pgm2', 'pgm3' // PGM 系统
];

export class MultiPlatformEmulator {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d', { alpha: false }) : null;

        // EmulatorJS 容器
        this.emulatorContainer = document.getElementById('emulator-container');

        // 当前平台和核心
        this.platform = 'nes';
        this.coreType = 'jsnes'; // 'jsnes' 或 'emulatorjs'
        this.core = null;
        this.emulatorJS = null;

        // 状态
        this.isRunning = false;
        this.isPaused = false;
        this.isHost = true;
        this.frameCount = 0;
        this.frameId = null;

        // 回调
        this.onFrameReady = null;
        this.onAudioReady = null; // 音频同步回调
        this.onEmulatorReady = null; // 模拟器完全准备好的回调（用于联机同步）

        // 音频
        this.audioCtx = null;
        this.audioBuffer = [];
        this.audioBufferSize = 4096;
        
        // 音频同步 - 优化参数
        this.audioSyncBuffer = [];
        this.audioSyncBufferSize = 1024; // 减小缓冲区，降低延迟
        
        // 客户端音频播放队列
        this.audioPlayQueue = [];
        this.audioPlayScheduledTime = 0;
        this.audioLatencyCompensation = 0.05; // 50ms 延迟补偿

        // 帧同步
        this.lastFrameBuffer = null;
        this.lastError = null;
        this.compressFrameCount = 0;
        this.lastReceivedSeq = 0;
        this.frameBufferValid = false;
        this.pendingFrame = null;
        this.renderPending = false;
        
        // 客户端双缓冲（防止画面撕裂）
        this.backBuffer = null;
        this.rafPending = false;

        // 帧率控制
        this.targetFPS = 60;
        this.frameInterval = 1000 / 60;
        this.lastFrameTime = 0;
        this.accumulator = 0;

        // 分辨率
        this.width = 256;
        this.height = 240;
        this.imageData = null;

        // 初始化
        if (this.ctx) {
            this.ctx.imageSmoothingEnabled = false;
            this.imageData = this.ctx.createImageData(256, 240);
        }
    }

    // 设置分辨率
    setResolution(width, height) {
        this.width = width;
        this.height = height;
        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.imageData = this.ctx.createImageData(width, height);
        }
    }

    setHost(isHost) {
        this.isHost = isHost;
        console.log(`模拟器模式: ${isHost ? '主机(P1)' : '客户端(P2)'}`);
    }

    // 检测ROM平台
    detectRomPlatform(romData, filename = '') {
        if (filename) {
            const platform = detectPlatform(filename);
            if (platform) return platform;
        }
        return detectPlatformFromData(romData);
    }

    // 更新平台显示
    updatePlatformBadge(platform) {
        const badge = document.getElementById('platform-badge');
        const nameEl = document.getElementById('platform-name');
        if (badge && nameEl && PLATFORMS[platform]) {
            nameEl.textContent = PLATFORMS[platform].name;
            badge.style.display = 'flex';
        }
    }

    // 加载ROM
    async loadRom(romData, filename = '') {
        if (this.isRunning) {
            this.stop();
        }

        // 如果有街机ROM名，强制使用arcade平台
        if (this.arcadeRomName) {
            this.platform = 'arcade';
        } else {
            // 检测平台
            this.platform = this.detectRomPlatform(romData, filename) || 'nes';
        }
        console.log(`检测到平台: ${PLATFORMS[this.platform]?.name || this.platform}`);

        // 更新平台显示
        this.updatePlatformBadge(this.platform);

        // 设置分辨率和帧率
        const config = PLATFORMS[this.platform];
        if (config) {
            this.setResolution(config.resolution.width, config.resolution.height);
            this.targetFPS = config.fps;
            this.frameInterval = 1000 / config.fps;
        }

        try {
            if (this.platform === 'nes') {
                const nesResult = await this.loadNES(romData);
                // 如果 JSNES 加载失败（可能是 Mapper 不支持），尝试使用 EmulatorJS
                if (!nesResult && this.lastError && this.lastError.includes('Mapper')) {
                    console.log('JSNES 不支持该 Mapper，尝试使用 EmulatorJS...');
                    this.lastError = null;
                    return await this.loadWithEmulatorJS(romData, filename, 'nes', null);
                }
                return nesResult;
            } else {
                // 传递街机ROM的英文名（如果有）
                return await this.loadWithEmulatorJS(romData, filename, this.platform, this.arcadeRomName);
            }
        } catch (e) {
            console.error('ROM加载失败:', e);
            this.lastError = e.message;
            return false;
        }
    }

    // 加载NES ROM (使用jsnes)
    async loadNES(romData) {
        this.coreType = 'jsnes';

        // 显示 canvas，隐藏 EmulatorJS 容器
        if (this.canvas) this.canvas.style.display = 'block';
        if (this.emulatorContainer) this.emulatorContainer.classList.add('hidden');

        if (typeof jsnes === 'undefined') {
            this.lastError = 'jsnes库未加载';
            return false;
        }

        const self = this;

        this.core = new jsnes.NES({
            onFrame: function (frameBuffer) {
                self.renderNESFrame(frameBuffer);
                if (self.isHost && self.onFrameReady) {
                    try {
                        self.onFrameReady(frameBuffer);
                    } catch (e) {
                        console.warn('帧回调错误:', e);
                    }
                }
            },
            onAudioSample: function (left, right) {
                self.handleAudio(left, right);
                // 收集音频样本用于同步
                if (self.isHost && self.onAudioReady) {
                    self.collectAudioSample(left, right);
                }
            }
        });
        
        // 添加兼容性方法 - jsnes 内部可能会调用 stop()
        // jsnes 的 CPU 模块内部通过 this.nes 引用 NES 实例
        if (this.core) {
            // 定义 stop 方法（如果不存在）
            const stopFn = function() {
                console.log('NES stop() called - ignored');
            };
            
            // 在 NES 实例上添加 stop 方法
            if (typeof this.core.stop !== 'function') {
                Object.defineProperty(this.core, 'stop', {
                    value: stopFn,
                    writable: true,
                    configurable: true
                });
            }
        }

        // 预处理ROM
        const processedRom = this.preprocessNESRom(romData);

        // 加载ROM - 捕获 Mapper 不支持的错误
        try {
            this.core.loadROM(this.arrayToString(processedRom));
        } catch (e) {
            console.error('ROM加载错误:', e);
            this.core = null; // 清除无效的 core
            
            // 解析错误信息，提供更友好的提示
            const errorMsg = e.message || '';
            if (errorMsg.includes('Mapper') || errorMsg.includes('mapper')) {
                // 提取 Mapper 编号
                const mapperMatch = errorMsg.match(/Mapper\s*\(?(\d+)\)?/i);
                const mapperNum = mapperMatch ? mapperMatch[1] : '未知';
                this.lastError = `该ROM使用Mapper ${mapperNum}，当前模拟器不支持。请尝试其他版本的ROM`;
            } else {
                this.lastError = e.message || 'ROM加载失败';
            }
            return false;
        }
        
        this.lastFrameBuffer = null;
        this.lastError = null;

        console.log('NES ROM加载成功');
        return true;
    }

    // 使用EmulatorJS加载其他平台ROM
    async loadWithEmulatorJS(romData, filename, platform, arcadeRomName = null) {
        this.coreType = 'emulatorjs';

        // 隐藏 canvas，显示 EmulatorJS 容器
        if (this.canvas) this.canvas.style.display = 'none';
        if (this.emulatorContainer) {
            this.emulatorContainer.classList.remove('hidden');
            this.emulatorContainer.innerHTML = ''; // 清空旧内容
        }

        const coreName = CORE_MAP[platform];
        if (!coreName) {
            this.lastError = `平台 ${platform} 暂不支持`;
            return false;
        }

        try {
            // 街机游戏需要使用英文ROM名
            const romName = arcadeRomName || filename || 'game';
            const romFileName = platform === 'arcade' ? `${romName}.zip` : romName;
            
            // 创建 ROM Blob URL，使用正确的文件名
            const blob = new Blob([romData], { type: 'application/octet-stream' });
            const romUrl = URL.createObjectURL(blob);

            // 创建 EmulatorJS 游戏容器
            const gameDiv = document.createElement('div');
            gameDiv.id = 'emulatorjs-game';
            gameDiv.style.cssText = 'width: 100%; height: 100%; min-height: 480px;';
            this.emulatorContainer.appendChild(gameDiv);

            // 清除之前的 EmulatorJS 全局变量
            this.cleanupEmulatorJS();

            // 设置 EmulatorJS 全局配置
            window.EJS_player = '#emulatorjs-game';
            window.EJS_core = coreName;
            window.EJS_gameUrl = romUrl;
            window.EJS_gameName = romFileName;  // 使用英文ROM名
            
            // 检测并使用本地 EmulatorJS 文件
            const emulatorJSPath = await this.getEmulatorJSPath();
            window.EJS_pathtodata = emulatorJSPath;
            console.log(`EmulatorJS 数据路径: ${emulatorJSPath}`);
            
            // 使用中文语言
            window.EJS_language = 'zh-CN';
            
            window.EJS_startOnLoaded = true;
            window.EJS_color = '#1a1a2e';
            window.EJS_backgroundColor = '#000';
            
            // 禁用默认控制设置，使用我们的按键映射
            window.EJS_defaultControls = false;
            
            // 设置 EmulatorJS 按键映射 - 使用 EJS_Settings
            // 这是 EmulatorJS 官方支持的配置方式
            window.EJS_Settings = {
                // 玩家1按键 - 与项目 input.js 保持一致
                // P1: WASD方向, JK=AB, HG=XY, UI=SELECT/START
                '0': {
                    'keyboard': {
                        'up': 'w',
                        'down': 's',
                        'left': 'a',
                        'right': 'd',
                        'a': 'j',
                        'b': 'k',
                        'x': 'h',
                        'y': 'g',
                        'l': 'q',
                        'r': 'e',
                        'start': 'i',
                        'select': 'u'
                    }
                },
                // 玩家2按键
                // P2: 方向键, 小键盘1/2=AB, 4/5=XY, 7/9=SELECT/START
                '1': {
                    'keyboard': {
                        'up': 'ArrowUp',
                        'down': 'ArrowDown',
                        'left': 'ArrowLeft',
                        'right': 'ArrowRight',
                        'a': '1',
                        'b': '2',
                        'x': '4',
                        'y': '5',
                        'l': '0',
                        'r': '.',
                        'start': '9',
                        'select': '7'
                    }
                }
            };
            
            // 按键映射将在游戏启动后通过 API 设置
            const self = this;
            window.EJS_onGameStart = () => {
                console.log('EmulatorJS 游戏启动成功');
                self.isRunning = true;
                
                // 延迟一点再设置按键和启动帧捕获，确保 EmulatorJS 完全初始化
                setTimeout(() => {
                    self.applyEmulatorJSKeyBindings();
                    
                    // 启动帧捕获（用于联机同步）- 必须在游戏真正启动后
                    if (self.isHost && self.onFrameReady) {
                        console.log('EmulatorJS 游戏已启动，开始帧捕获');
                        self.startEmulatorJSFrameCapture();
                    }
                    
                    // 触发模拟器准备好的回调（用于联机同步）
                    if (self.onEmulatorReady) {
                        console.log('触发 onEmulatorReady 回调');
                        self.onEmulatorReady();
                        self.onEmulatorReady = null; // 只触发一次
                    }
                }, 500);
            };
            
            window.EJS_defaultOptions = {
                'shader': 'disabled',
                'save-state-slot': '1'
            };
            
            // EmulatorJS 按钮配置 - 显示所有有用的功能
            window.EJS_Buttons = {
                playPause: true,   // 暂停/继续
                restart: true,     // 重启游戏
                mute: true,        // 静音
                settings: true,    // 设置
                fullscreen: true,  // 全屏
                saveState: true,   // 存档
                loadState: true,   // 读档
                screenRecord: true, // 录屏
                gamepad: true,     // 手柄设置
                cheat: true,       // 作弊码
                volume: true,      // 音量
                quickSave: true,   // 快速存档
                quickLoad: true,   // 快速读档
                screenshot: true,  // 截图
                cacheManager: true // 缓存管理
            };
            
            console.log(`EmulatorJS 配置: core=${coreName}, romName=${romFileName}`);

            // 街机游戏需要 BIOS
            if (platform === 'arcade' || platform === 'neogeo' || platform === 'mame') {
                // 使用英文ROM名来判断游戏类型
                const checkName = (arcadeRomName || romName).toLowerCase();
                
                // PGM 游戏 (西游释厄传、三国战纪等)
                if (this.isPGMGame(checkName)) {
                    window.EJS_biosUrl = '/bios/pgm.zip';
                    console.log('PGM 游戏 - BIOS: pgm.zip');
                }
                // Neo Geo 游戏 (拳皇、合金弹头等)
                else if (platform === 'neogeo' || this.isNeoGeoGame(checkName)) {
                    window.EJS_biosUrl = '/bios/neogeo.zip';
                    console.log('Neo Geo 游戏 - BIOS: neogeo.zip');
                }
                // CPS1/CPS2 游戏 (街霸、快打旋风等)
                else if (this.isCPS2Game(checkName)) {
                    window.EJS_biosUrl = '/bios/qsound.zip';
                    console.log('CPS2 游戏 - BIOS: qsound.zip');
                }
                // 其他街机游戏默认用 neogeo
                else {
                    window.EJS_biosUrl = '/bios/neogeo.zip';
                    console.log('街机游戏 - BIOS: neogeo.zip');
                }
            }

            // 清除可能损坏的 EmulatorJS 控制设置，然后设置我们的按键映射
            this.clearEmulatorJSControls();
            this.setupEmulatorJSKeyBindings();

            // 动态加载 EmulatorJS loader
            await this.loadEmulatorJSScript();

            this.lastError = null;
            this.isRunning = true;
            console.log(`${PLATFORMS[platform].name} ROM准备就绪，支持联机对战`);
            
            return true;

        } catch (e) {
            console.error('EmulatorJS加载失败:', e);
            this.lastError = `加载失败: ${e.message}`;
            return false;
        }
    }
    
    // 设置 EmulatorJS 按键绑定
    setupEmulatorJSKeyBindings() {
        // EmulatorJS 使用 localStorage 存储按键设置
        // 经过测试，EmulatorJS 使用的格式是: {core}.controls.{player}.keyboard.{button}
        // 或者: {core}.settings.controls.{player}.keyboard.{button}
        
        const coreName = CORE_MAP[this.platform] || 'fbneo';
        
        // 按键映射 - 与项目 input.js 保持一致
        // P1: WASD方向, JK=AB, HG=XY, UI=SELECT/START
        // P2: 方向键, 小键盘
        const keyMap = {
            // Player 1 (player index 0)
            0: {
                'a': 'KeyJ',
                'b': 'KeyK',
                'x': 'KeyH',
                'y': 'KeyG',
                'l': 'KeyQ',
                'r': 'KeyE',
                'start': 'KeyI',
                'select': 'KeyU',
                'up': 'KeyW',
                'down': 'KeyS',
                'left': 'KeyA',
                'right': 'KeyD',
                'l2': 'Tab',
                'r2': 'KeyR'
            },
            // Player 2 (player index 1)
            1: {
                'a': 'Numpad1',
                'b': 'Numpad2',
                'x': 'Numpad4',
                'y': 'Numpad5',
                'l': 'Numpad0',
                'r': 'NumpadDecimal',
                'start': 'Numpad9',
                'select': 'Numpad7',
                'up': 'ArrowUp',
                'down': 'ArrowDown',
                'left': 'ArrowLeft',
                'right': 'ArrowRight'
            }
        };
        
        try {
            // 尝试多种 localStorage 格式
            const formats = [
                // 格式1: core.controls.player.keyboard.button
                (core, player, button, key) => {
                    localStorage.setItem(`${core}.controls.${player}.keyboard.${button}`, JSON.stringify(key));
                },
                // 格式2: core.keyboard.player.button (简化格式)
                (core, player, button, key) => {
                    localStorage.setItem(`${core}.keyboard.${player}.${button}`, key);
                },
                // 格式3: input.player.keyboard.button
                (core, player, button, key) => {
                    localStorage.setItem(`input.${player}.keyboard.${button}`, key);
                }
            ];
            
            for (const setFn of formats) {
                for (const [player, keys] of Object.entries(keyMap)) {
                    for (const [button, key] of Object.entries(keys)) {
                        setFn(coreName, player, button, key);
                    }
                }
            }
            
            console.log('EmulatorJS 按键映射已设置, core:', coreName);
        } catch (e) {
            console.warn('设置 EmulatorJS 按键映射失败:', e);
        }
    }
    
    // 在游戏启动后应用按键绑定
    applyEmulatorJSKeyBindings() {
        // 尝试通过 EmulatorJS 的内部 API 设置按键
        if (!window.EJS_emulator) {
            console.warn('EmulatorJS 实例未找到');
            return;
        }
        
        try {
            const emu = window.EJS_emulator;
            const coreName = CORE_MAP[this.platform] || 'fbneo';
            
            // 按键映射 - 与项目 input.js 保持一致
            // P1: WASD方向, JK=AB, HG=XY, UI=SELECT/START
            const keyMap = {
                // Player 1
                0: {
                    'a': 'j',
                    'b': 'k', 
                    'x': 'h',
                    'y': 'g',
                    'l': 'q',
                    'r': 'e',
                    'start': 'i',
                    'select': 'u',
                    'up': 'w',
                    'down': 's',
                    'left': 'a',
                    'right': 'd',
                    'l2': 'Tab',
                    'r2': 'r'
                },
                // Player 2
                1: {
                    'a': '1',
                    'b': '2',
                    'x': '4', 
                    'y': '5',
                    'l': '0',
                    'r': '.',
                    'start': '9',
                    'select': '7',
                    'up': 'ArrowUp',
                    'down': 'ArrowDown',
                    'left': 'ArrowLeft',
                    'right': 'ArrowRight'
                }
            };
            
            // 方法1: 尝试使用 EmulatorJS 的 controls API
            if (emu.controls) {
                console.log('找到 EmulatorJS controls API');
                for (const [player, keys] of Object.entries(keyMap)) {
                    for (const [button, key] of Object.entries(keys)) {
                        try {
                            if (emu.controls.setKey) {
                                emu.controls.setKey(parseInt(player), button, key);
                            }
                        } catch (e) {}
                    }
                }
            }
            
            // 方法2: 尝试使用 gameManager
            if (emu.gameManager) {
                console.log('找到 EmulatorJS gameManager');
                if (emu.gameManager.controls) {
                    for (const [player, keys] of Object.entries(keyMap)) {
                        for (const [button, key] of Object.entries(keys)) {
                            try {
                                const storageKey = `${coreName}.keyboard.${player}.${button}`;
                                localStorage.setItem(storageKey, key);
                            } catch (e) {}
                        }
                    }
                }
            }
            
            // 方法3: 直接设置 localStorage（多种格式尝试）
            const formats = [
                (p, b) => `${coreName}.keyboard.${p}.${b}`,
                (p, b) => `${coreName}-keyboard-${p}-${b}`,
                (p, b) => `ejs-${coreName}-keyboard-${p}-${b}`,
                (p, b) => `input.${p}.keyboard.${b}`
            ];
            
            for (const formatFn of formats) {
                for (const [player, keys] of Object.entries(keyMap)) {
                    for (const [button, key] of Object.entries(keys)) {
                        try {
                            const storageKey = formatFn(player, button);
                            localStorage.setItem(storageKey, key);
                        } catch (e) {}
                    }
                }
            }
            
            console.log('EmulatorJS 按键设置已尝试应用');
            console.log('提示: 如果按键未生效，请在 EmulatorJS 的设置中手动配置');
            
        } catch (e) {
            console.warn('应用 EmulatorJS 按键绑定失败:', e);
        }
    }

    // 判断是否为 PGM 游戏
    isPGMGame(romName) {
        return PGM_GAMES.some(g => romName.includes(g));
    }

    // 判断是否为 CPS2 游戏
    isCPS2Game(romName) {
        return CPS2_GAMES.some(g => romName.includes(g));
    }

    // 判断是否为 Neo Geo 游戏
    isNeoGeoGame(romName) {
        return NEOGEO_GAMES.some(g => romName.includes(g));
    }

    // 清除可能损坏的 EmulatorJS 控制设置
    clearEmulatorJSControls() {
        try {
            // 清除所有 EmulatorJS 相关的 localStorage 项
            // EmulatorJS 使用多种格式: ejs-*, {core}.*, {core}-*
            const keysToRemove = [];
            const coreNames = Object.values(CORE_MAP);
            
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                
                // 清除 ejs- 开头的
                if (key.startsWith('ejs-')) {
                    keysToRemove.push(key);
                    continue;
                }
                
                // 清除各核心的按键设置 (格式: {core}.keyboard.* 或 {core}-keyboard-*)
                for (const core of coreNames) {
                    if (key.startsWith(`${core}.keyboard.`) || 
                        key.startsWith(`${core}-keyboard-`) ||
                        key.startsWith(`${core}.settings`) ||
                        key.startsWith(`${core}-settings`)) {
                        keysToRemove.push(key);
                        break;
                    }
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            if (keysToRemove.length > 0) {
                console.log(`清除了 ${keysToRemove.length} 个 EmulatorJS 设置`);
            }
        } catch (e) {
            console.warn('清除 EmulatorJS 设置失败:', e);
        }
    }

    // 清理 EmulatorJS 全局变量
    cleanupEmulatorJS() {
        // 完整的 EmulatorJS 全局变量列表
        const ejsVars = [
            'EJS_player', 'EJS_core', 'EJS_gameUrl', 'EJS_gameName',
            'EJS_pathtodata', 'EJS_startOnLoaded', 'EJS_color',
            'EJS_backgroundColor', 'EJS_loadStateURL', 'EJS_DEBUG_XX',
            'EJS_biosUrl', 'EJS_onGameStart', 'EJS_onLoadState',
            'EJS_defaultControls', 'EJS_defaultOptions', 'EJS_Buttons',
            'EJS_language', 'EJS_emulator', 'EJS_STORAGE', 'EJS_main',
            'EJS_GameManager', 'EJS_MODULES', 'EJS_LOADED', 'EJS_INIT',
            'EJS_Settings', 'EJS_VirtualGamepad', 'EJS_AdHandler',
            'EJS_SettingsMenu', 'EJS_ready', 'EJS_onReady'
        ];
        ejsVars.forEach(v => {
            try {
                if (window[v] !== undefined) {
                    window[v] = undefined;
                    delete window[v];
                }
            } catch (e) {}
        });
        
        // 清理所有以 EJS_ 开头的全局变量
        Object.keys(window).forEach(key => {
            if (key.startsWith('EJS_')) {
                try {
                    window[key] = undefined;
                    delete window[key];
                } catch (e) {}
            }
        });
    }

    // 检测本地 EmulatorJS 文件是否存在
    async checkLocalEmulatorJS() {
        // 暂时禁用本地检测，强制使用 CDN
        return false;
        /*
        try {
            const response = await fetch(EMULATORJS_LOCAL + 'loader.js', { method: 'HEAD' });
            return response.ok;
        } catch (e) {
            return false;
        }
        */
    }

    // 获取 EmulatorJS 数据路径（优先本地）
    async getEmulatorJSPath() {
        // 强制使用 CDN
        console.log('使用 CDN 加载 EmulatorJS');
        return EMULATORJS_CDN;
    }

    // 加载 EmulatorJS 脚本
    async loadEmulatorJSScript() {
        const basePath = await this.getEmulatorJSPath();
        
        return new Promise((resolve, reject) => {
            // 检查是否已经加载过 EmulatorJS
            const existingScript = document.getElementById('emulatorjs-loader');
            
            if (existingScript) {
                // 移除旧脚本，强制重新加载
                existingScript.remove();
            }
            
            // 移除所有 EmulatorJS 相关脚本（但不清理配置变量）
            document.querySelectorAll('script[src*="emulator"]').forEach(s => s.remove());
            
            // 只清理 EmulatorJS 内部变量，保留配置变量
            const internalVars = [
                'EJS_emulator', 'EJS_STORAGE', 'EJS_main',
                'EJS_GameManager', 'EJS_MODULES', 'EJS_LOADED', 'EJS_INIT',
                'EJS_VirtualGamepad', 'EJS_AdHandler', 'EJS_SettingsMenu'
            ];
            internalVars.forEach(v => {
                try {
                    if (window[v] !== undefined) {
                        window[v] = undefined;
                        delete window[v];
                    }
                } catch (e) {}
            });
            
            // 短暂延迟确保清理完成
            setTimeout(() => {
                const script = document.createElement('script');
                script.id = 'emulatorjs-loader';
                script.src = basePath + 'loader.js';
                script.onload = () => {
                    console.log(`EmulatorJS loader 加载完成 (${basePath})`);
                    resolve();
                };
                script.onerror = () => reject(new Error('EmulatorJS 加载失败'));
                document.body.appendChild(script);
            }, 50);
        });
    }

    // 渲染NES帧
    renderNESFrame(frameBuffer) {
        if (!this.canvas || !this.ctx) return;

        this.frameCount++;

        if (!frameBuffer || frameBuffer.length < this.width * this.height) {
            return;
        }

        // 确保 imageData 存在
        if (!this.imageData) {
            this.imageData = this.ctx.createImageData(this.width, this.height);
        }

        const data = this.imageData.data;

        for (let i = 0; i < this.width * this.height; i++) {
            const pixel = frameBuffer[i];
            const j = i * 4;

            // jsnes BGR格式
            data[j] = pixel & 0xff;
            data[j + 1] = (pixel >> 8) & 0xff;
            data[j + 2] = (pixel >> 16) & 0xff;
            data[j + 3] = 0xff;
        }

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    // 通用帧渲染
    renderFrame(frameBuffer) {
        if (!this.canvas || !this.ctx) return;
        
        // 确保 imageData 与当前分辨率匹配
        if (!this.imageData || this.imageData.width !== this.width || this.imageData.height !== this.height) {
            this.imageData = this.ctx.createImageData(this.width, this.height);
        }
        
        const data = this.imageData.data;
        const pixelCount = Math.min(frameBuffer.length, this.width * this.height);

        for (let i = 0; i < pixelCount; i++) {
            const pixel = frameBuffer[i];
            const j = i * 4;

            // 处理 RGBA 格式（EmulatorJS）或 BGR 格式（JSNES）
            // EmulatorJS 使用 ABGR 格式存储在 Uint32Array 中
            data[j] = pixel & 0xff;           // R
            data[j + 1] = (pixel >> 8) & 0xff;  // G
            data[j + 2] = (pixel >> 16) & 0xff; // B
            data[j + 3] = 0xff;                 // A
        }

        this.ctx.putImageData(this.imageData, 0, 0);
        this.frameCount++;
    }

    // 接收远程帧 - 立即渲染，不使用缓冲
    receiveFrame(frameData) {
        if (this.isHost) return;

        try {
            // 动态调整分辨率以匹配接收到的帧
            if (frameData.width && frameData.height) {
                if (this.width !== frameData.width || this.height !== frameData.height) {
                    this.setResolution(frameData.width, frameData.height);
                    console.log(`客户端分辨率调整为: ${this.width}x${this.height}`);
                }
            }
            
            const frameBuffer = this.decompressFrame(frameData);
            if (frameBuffer && frameBuffer.length > 0) {
                // 验证帧大小是否匹配当前分辨率
                const expectedSize = this.width * this.height;
                if (frameBuffer.length !== expectedSize) {
                    // 尝试推断分辨率
                    const possibleResolutions = [
                        { w: 256, h: 240 },   // NES
                        { w: 320, h: 224 },   // 街机常见
                        { w: 320, h: 240 },   // 街机常见
                        { w: 384, h: 224 },   // CPS1/2
                        { w: 304, h: 224 },   // Neo Geo
                        { w: 512, h: 448 },   // SNES hi-res
                    ];
                    
                    for (const res of possibleResolutions) {
                        if (frameBuffer.length === res.w * res.h) {
                            this.setResolution(res.w, res.h);
                            console.log(`根据帧大小推断分辨率: ${res.w}x${res.h}`);
                            break;
                        }
                    }
                }
                
                // 立即渲染收到的帧，不做缓冲
                // 这样可以保证画面与房主同步，避免重影
                this.renderFrame(frameBuffer);
            }
        } catch (e) {
            console.warn('帧解压失败:', e);
        }
    }

    // 压缩帧数据
    compressFrame(frameBuffer) {
        this.compressFrameCount = (this.compressFrameCount || 0) + 1;
        const isKeyFrame = this.compressFrameCount % 15 === 1; // 每15帧一个关键帧（约4次/秒）

        if (!this.lastFrameBuffer || isKeyFrame) {
            this.lastFrameBuffer = new Uint32Array(frameBuffer);
            const compressed = this.rleEncode(frameBuffer);
            return { 
                type: 'key', 
                data: compressed, 
                seq: this.compressFrameCount,
                width: this.width,
                height: this.height
            };
        }

        const changes = [];
        let changeCount = 0;

        for (let i = 0; i < frameBuffer.length; i++) {
            if (frameBuffer[i] !== this.lastFrameBuffer[i]) {
                changes.push(i, frameBuffer[i]);
                changeCount++;
            }
        }

        this.lastFrameBuffer = new Uint32Array(frameBuffer);

        // 如果变化超过25%，发送关键帧
        if (changeCount > frameBuffer.length * 0.25) {
            const compressed = this.rleEncode(frameBuffer);
            return { 
                type: 'key', 
                data: compressed, 
                seq: this.compressFrameCount,
                width: this.width,
                height: this.height
            };
        }

        return { 
            type: 'diff', 
            data: changes, 
            seq: this.compressFrameCount,
            width: this.width,
            height: this.height
        };
    }

    rleEncode(frameBuffer) {
        const result = [];
        const RLE_MARKER = 0x7fffffff;
        let i = 0;
        while (i < frameBuffer.length) {
            const pixel = frameBuffer[i];
            let count = 1;
            while (i + count < frameBuffer.length && frameBuffer[i + count] === pixel && count < 255) {
                count++;
            }
            if (count > 3) {
                result.push(RLE_MARKER, count, pixel);
            } else {
                for (let j = 0; j < count; j++) {
                    result.push(pixel);
                }
            }
            i += count;
        }
        return result;
    }

    rleDecode(compressed) {
        const result = new Uint32Array(this.width * this.height);
        const RLE_MARKER = 0x7fffffff;
        let outIdx = 0;
        let i = 0;
        while (i < compressed.length && outIdx < result.length) {
            if (compressed[i] === RLE_MARKER && i + 2 < compressed.length) {
                const count = compressed[i + 1];
                const pixel = compressed[i + 2];
                for (let j = 0; j < count && outIdx < result.length; j++) {
                    result[outIdx++] = pixel;
                }
                i += 3;
            } else {
                result[outIdx++] = compressed[i];
                i++;
            }
        }
        return result;
    }

    decompressFrame(frameData) {
        if (frameData.seq && this.lastReceivedSeq && frameData.seq < this.lastReceivedSeq) {
            return null;
        }
        
        // 检测是否有丢帧（序号跳跃超过2）
        const seqGap = frameData.seq - (this.lastReceivedSeq || 0);
        if (seqGap > 2 && frameData.type === 'diff') {
            // 丢帧了，差分帧可能不准确，标记需要关键帧
            this.frameBufferValid = false;
            console.warn(`检测到丢帧 (gap=${seqGap})，等待关键帧...`);
        }
        
        this.lastReceivedSeq = frameData.seq || 0;

        if (frameData.type === 'key') {
            const buffer = this.rleDecode(frameData.data);
            this.lastFrameBuffer = buffer;
            this.frameBufferValid = true;
            return buffer;
        } else if (frameData.type === 'diff') {
            if (!this.lastFrameBuffer || !this.frameBufferValid) {
                console.warn('缺少基准帧，等待关键帧...');
                return this.lastFrameBuffer || new Uint32Array(this.width * this.height);
            }
            const buffer = new Uint32Array(this.lastFrameBuffer);
            for (let i = 0; i < frameData.data.length; i += 2) {
                const idx = frameData.data[i];
                const pixel = frameData.data[i + 1];
                if (idx >= 0 && idx < buffer.length) {
                    buffer[idx] = pixel;
                }
            }
            this.lastFrameBuffer = buffer;
            return buffer;
        }

        return null;
    }

    // 音频处理
    handleAudio(left, right) {
        if (!this.audioCtx) return;

        this.audioBuffer.push(left, right);

        if (this.audioBuffer.length >= this.audioBufferSize) {
            this.playAudioBuffer();
        }
    }
    
    // 收集音频样本用于同步发送
    collectAudioSample(left, right) {
        this.audioSyncBuffer.push(left, right);
        
        // 达到缓冲区大小时发送
        if (this.audioSyncBuffer.length >= this.audioSyncBufferSize) {
            if (this.onAudioReady) {
                // 转换为可传输的格式（Float32 -> Int16 压缩）
                const compressed = this.compressAudio(this.audioSyncBuffer);
                this.onAudioReady(compressed);
            }
            this.audioSyncBuffer = [];
        }
    }
    
    // 压缩音频数据（Float32 -> Int16）- 优化版本
    compressAudio(samples) {
        // 使用 Int16Array 然后转换为普通数组
        const len = samples.length;
        const compressed = new Int16Array(len);
        for (let i = 0; i < len; i++) {
            // 将 -1.0 ~ 1.0 转换为 -32768 ~ 32767
            const val = samples[i] * 32767;
            compressed[i] = val > 32767 ? 32767 : (val < -32768 ? -32768 : val | 0);
        }
        // 使用 Array.from 比 spread 更快
        return Array.from(compressed);
    }
    
    // 接收远程音频数据
    receiveAudio(audioData) {
        if (this.isHost) return;
        if (!this.audioCtx) {
            this.initAudio();
        }
        if (!this.audioCtx) return;
        
        try {
            // 解压音频数据（Int16 -> Float32）
            const samples = this.decompressAudio(audioData);
            
            // 创建音频缓冲区
            const buffer = this.audioCtx.createBuffer(2, samples.length / 2, 44100);
            const leftChannel = buffer.getChannelData(0);
            const rightChannel = buffer.getChannelData(1);
            
            for (let i = 0; i < samples.length / 2; i++) {
                leftChannel[i] = samples[i * 2];
                rightChannel[i] = samples[i * 2 + 1];
            }
            
            // 使用调度播放，避免音频重叠或间隙
            const source = this.audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioCtx.destination);
            
            const currentTime = this.audioCtx.currentTime;
            const bufferDuration = buffer.duration;
            
            // 计算播放时间
            if (this.audioPlayScheduledTime < currentTime) {
                // 如果调度时间已过，从当前时间开始（加一点延迟补偿）
                this.audioPlayScheduledTime = currentTime + this.audioLatencyCompensation;
            }
            
            source.start(this.audioPlayScheduledTime);
            this.audioPlayScheduledTime += bufferDuration;
            
            // 防止调度时间跑得太远（超过 500ms 就重置）
            if (this.audioPlayScheduledTime > currentTime + 0.5) {
                this.audioPlayScheduledTime = currentTime + this.audioLatencyCompensation;
            }
        } catch (e) {
            // 忽略音频播放错误
        }
    }
    
    // 解压音频数据（Int16 -> Float32）
    decompressAudio(compressed) {
        const samples = new Float32Array(compressed.length);
        for (let i = 0; i < compressed.length; i++) {
            samples[i] = compressed[i] / 32767;
        }
        return samples;
    }

    initAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100,
                latencyHint: 'interactive' // 低延迟模式
            });
            // 重置音频调度时间
            this.audioPlayScheduledTime = 0;
        } catch (e) {
            console.warn('音频初始化失败:', e);
        }
    }

    playAudioBuffer() {
        if (!this.audioCtx || this.audioBuffer.length === 0) return;

        const buffer = this.audioCtx.createBuffer(2, this.audioBuffer.length / 2, 44100);
        const leftChannel = buffer.getChannelData(0);
        const rightChannel = buffer.getChannelData(1);

        for (let i = 0; i < this.audioBuffer.length / 2; i++) {
            leftChannel[i] = this.audioBuffer[i * 2];
            rightChannel[i] = this.audioBuffer[i * 2 + 1];
        }

        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioCtx.destination);
        source.start();

        this.audioBuffer = [];
    }

    // 预处理NES ROM
    preprocessNESRom(romData) {
        if (
            romData.length >= 4 &&
            romData[0] === 0x4e &&
            romData[1] === 0x45 &&
            romData[2] === 0x53 &&
            romData[3] === 0x1a
        ) {
            return romData;
        }

        if (
            romData.length >= 4 &&
            romData[0] === 0x55 &&
            romData[1] === 0x4e &&
            romData[2] === 0x49 &&
            romData[3] === 0x46
        ) {
            return this.convertUnifToNes(romData);
        }

        return romData;
    }

    convertUnifToNes(unifData) {
        let prgData = null;
        let chrData = null;
        let mapper = 0;
        let mirroring = 0;

        let offset = 32;

        while (offset < unifData.length - 8) {
            const chunkId = String.fromCharCode(
                unifData[offset],
                unifData[offset + 1],
                unifData[offset + 2],
                unifData[offset + 3]
            );
            const chunkLen =
                unifData[offset + 4] |
                (unifData[offset + 5] << 8) |
                (unifData[offset + 6] << 16) |
                (unifData[offset + 7] << 24);
            offset += 8;

            if (offset + chunkLen > unifData.length) break;

            const chunkData = unifData.slice(offset, offset + chunkLen);

            if (chunkId.startsWith('PRG')) {
                prgData = prgData ? this.concatArrays(prgData, chunkData) : chunkData;
            } else if (chunkId.startsWith('CHR')) {
                chrData = chrData ? this.concatArrays(chrData, chunkData) : chunkData;
            } else if (chunkId === 'MIRR') {
                mirroring = chunkData[0];
            }

            offset += chunkLen;
        }

        if (!prgData) return unifData;

        const prgSize = prgData.length;
        const chrSize = chrData ? chrData.length : 0;
        const prgBanks = Math.ceil(prgSize / 16384);
        const chrBanks = Math.ceil(chrSize / 8192);

        const nesHeader = new Uint8Array(16);
        nesHeader[0] = 0x4e;
        nesHeader[1] = 0x45;
        nesHeader[2] = 0x53;
        nesHeader[3] = 0x1a;
        nesHeader[4] = prgBanks;
        nesHeader[5] = chrBanks;
        nesHeader[6] = ((mapper & 0x0f) << 4) | (mirroring & 1);
        nesHeader[7] = mapper & 0xf0;

        const totalSize = 16 + prgSize + chrSize;
        const nesRom = new Uint8Array(totalSize);
        nesRom.set(nesHeader, 0);
        nesRom.set(prgData, 16);
        if (chrData) {
            nesRom.set(chrData, 16 + prgSize);
        }

        return nesRom;
    }

    concatArrays(a, b) {
        const result = new Uint8Array(a.length + b.length);
        result.set(a, 0);
        result.set(b, a.length);
        return result;
    }

    arrayToString(array) {
        let str = '';
        for (let i = 0; i < array.length; i++) {
            str += String.fromCharCode(array[i]);
        }
        return str;
    }

    // 启动模拟器
    start() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;
        this.frameCount = 0;
        this.lastFrameTime = 0;
        this.accumulator = 0;

        if (this.isHost) {
            this.initAudio();

            if (this.coreType === 'jsnes' && this.core) {
                requestAnimationFrame((time) => this.gameLoop(time));
            } else if (this.coreType === 'emulatorjs') {
                // EmulatorJS 自己管理游戏循环
                // 帧捕获会在 EJS_onGameStart 回调中启动，确保游戏真正开始后才捕获
                console.log('EmulatorJS 模式，等待游戏启动后开始帧捕获...');
            }
        }
    }
    
    // 启动 EmulatorJS 帧捕获（用于联机同步）
    startEmulatorJSFrameCapture() {
        if (this.ejsFrameCaptureInterval) {
            clearInterval(this.ejsFrameCaptureInterval);
        }
        
        // 使用 requestAnimationFrame 实现流畅的帧捕获
        let captureCanvas = null;
        let captureCtx = null;
        let captureFailCount = 0;
        let foundCanvas = false;
        let frameCapturedCount = 0;
        let lastFrameTime = 0;
        const targetInterval = 1000 / 60; // 目标 60fps，与 NES 保持一致
        
        console.log('开始 EmulatorJS 帧捕获 (60fps)...');
        
        const captureFrame = (currentTime) => {
            if (!this.isRunning || !this.isHost) {
                return;
            }
            
            // 继续下一帧
            this.ejsFrameRequestId = requestAnimationFrame(captureFrame);
            
            if (this.isPaused || !this.onFrameReady) {
                return;
            }
            
            // 严格限制帧率到 60fps，无论显示器刷新率多少
            if (currentTime - lastFrameTime < targetInterval) {
                return;
            }
            lastFrameTime = currentTime;
            
            try {
                // 查找 EmulatorJS 的 canvas（尝试多种选择器）
                let ejsCanvas = null;
                
                // 方法1: 直接查找 EmulatorJS 容器内的 canvas
                const selectors = [
                    '#emulatorjs-game canvas',
                    '#emulator-container canvas',
                    '.ejs_canvas',
                    'canvas[id*="canvas"]',
                    '#game canvas',
                    'canvas'
                ];
                
                let maxArea = 0;
                for (const selector of selectors) {
                    const canvases = document.querySelectorAll(selector);
                    for (const canvas of canvases) {
                        // 跳过我们自己的 canvas
                        if (canvas.id === 'nes-canvas') continue;
                        
                        const area = canvas.width * canvas.height;
                        if (area > maxArea && canvas.width > 100 && canvas.height > 100) {
                            maxArea = area;
                            ejsCanvas = canvas;
                        }
                    }
                    if (ejsCanvas) break;
                }
                
                if (!ejsCanvas || ejsCanvas.width === 0 || ejsCanvas.height === 0) {
                    captureFailCount++;
                    if (captureFailCount === 1) {
                        console.log('等待 EmulatorJS canvas 初始化...');
                    }
                    if (captureFailCount > 300) { // 15秒后放弃
                        console.warn('EmulatorJS canvas 未找到，停止帧捕获');
                        this.stopEmulatorJSFrameCapture();
                    }
                    return;
                }
                
                if (!foundCanvas) {
                    foundCanvas = true;
                    console.log(`找到 EmulatorJS canvas: ${ejsCanvas.width}x${ejsCanvas.height}`);
                }
                
                captureFailCount = 0;
                
                // 获取原始分辨率
                const srcWidth = ejsCanvas.width;
                const srcHeight = ejsCanvas.height;
                
                // 对于大分辨率，缩放到 320x240 以减少数据量
                // 街机游戏通常是 320x224 或 384x224
                const maxWidth = 320;
                const maxHeight = 240;
                
                let targetWidth = srcWidth;
                let targetHeight = srcHeight;
                
                if (srcWidth > maxWidth || srcHeight > maxHeight) {
                    const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
                    targetWidth = Math.floor(srcWidth * scale);
                    targetHeight = Math.floor(srcHeight * scale);
                }
                
                // 更新分辨率
                if (this.width !== targetWidth || this.height !== targetHeight) {
                    this.width = targetWidth;
                    this.height = targetHeight;
                    // 重新创建捕获 canvas
                    captureCanvas = document.createElement('canvas');
                    captureCanvas.width = targetWidth;
                    captureCanvas.height = targetHeight;
                    captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
                    captureCtx.imageSmoothingEnabled = false; // 保持像素清晰
                    console.log(`EmulatorJS 捕获分辨率: ${srcWidth}x${srcHeight} -> ${targetWidth}x${targetHeight}`);
                }
                
                // 确保有捕获 canvas
                if (!captureCanvas || !captureCtx) {
                    captureCanvas = document.createElement('canvas');
                    captureCanvas.width = this.width;
                    captureCanvas.height = this.height;
                    captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
                    captureCtx.imageSmoothingEnabled = false;
                }
                
                // 绘制到捕获 canvas（可能会缩放）
                captureCtx.drawImage(ejsCanvas, 0, 0, srcWidth, srcHeight, 0, 0, this.width, this.height);
                
                // 获取图像数据
                const imageData = captureCtx.getImageData(0, 0, this.width, this.height);
                
                // 转换为与 JSNES 兼容的格式（RGBA -> 32位整数数组）
                const frameBuffer = new Uint32Array(imageData.data.buffer);
                
                // 调用帧回调
                this.onFrameReady(frameBuffer);
                
                frameCapturedCount++;
                if (frameCapturedCount % 600 === 0) { // 每10秒打印一次（60fps * 10s）
                    console.log(`EmulatorJS 已捕获 ${frameCapturedCount} 帧`);
                }
                
            } catch (e) {
                captureFailCount++;
                if (captureFailCount % 50 === 0) {
                    console.warn('EmulatorJS 帧捕获错误:', e.message);
                }
            }
        };
        
        // 启动帧捕获循环
        this.ejsFrameRequestId = requestAnimationFrame(captureFrame);
        console.log('EmulatorJS 帧捕获已启动 (requestAnimationFrame)');
    }
    
    // 停止 EmulatorJS 帧捕获
    stopEmulatorJSFrameCapture() {
        if (this.ejsFrameRequestId) {
            cancelAnimationFrame(this.ejsFrameRequestId);
            this.ejsFrameRequestId = null;
            console.log('EmulatorJS 帧捕获已停止');
        }
        if (this.ejsFrameCaptureInterval) {
            clearInterval(this.ejsFrameCaptureInterval);
            this.ejsFrameCaptureInterval = null;
        }
    }

    gameLoop(currentTime) {
        if (!this.isRunning || !this.isHost) return;

        if (this.lastFrameTime === 0) {
            this.lastFrameTime = currentTime;
        }

        const deltaTime = currentTime - this.lastFrameTime;
        this.accumulator += deltaTime;
        this.lastFrameTime = currentTime;

        let framesExecuted = 0;
        let hasError = false;
        
        // 限制每次循环最多执行 2 帧，防止卡顿时追帧导致卡死
        const maxFrames = Math.min(2, Math.floor(this.accumulator / this.frameInterval));
        
        for (let i = 0; i < maxFrames && !hasError; i++) {
            if (!this.isPaused && this.core) {
                try {
                    if (this.coreType === 'jsnes') {
                        this.core.frame();
                    }
                } catch (e) {
                    console.error('帧执行错误:', e);
                    hasError = true;
                    this.isRunning = false;
                    this.lastError = e.message || '游戏执行错误';
                    break;
                }
            }
            framesExecuted++;
        }
        
        // 减少累积时间
        this.accumulator -= framesExecuted * this.frameInterval;

        // 防止累积时间过大
        if (this.accumulator > this.frameInterval * 3) {
            this.accumulator = this.frameInterval;
        }

        // 只有在运行状态下且没有错误才继续循环
        if (this.isRunning && !hasError) {
            this.frameId = requestAnimationFrame((time) => this.gameLoop(time));
        }
    }

    stop() {
        this.isRunning = false;

        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        
        // 停止 EmulatorJS 帧捕获
        this.stopEmulatorJSFrameCapture();

        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        
        // 重置音频同步状态
        this.audioSyncBuffer = [];
        this.audioPlayScheduledTime = 0;

        // 清理 EmulatorJS - 完全停止并清理
        if (this.coreType === 'emulatorjs') {
            // 停止 EmulatorJS 实例
            if (window.EJS_emulator) {
                try {
                    // 暂停游戏
                    if (window.EJS_emulator.pause) {
                        window.EJS_emulator.pause();
                    }
                    // 静音
                    if (window.EJS_emulator.setVolume) {
                        window.EJS_emulator.setVolume(0);
                    }
                    // 尝试停止
                    if (window.EJS_emulator.stop) {
                        window.EJS_emulator.stop();
                    }
                } catch (e) {
                    console.warn('停止 EmulatorJS 实例失败:', e);
                }
            }
            
            // 清空容器
            if (this.emulatorContainer) {
                this.emulatorContainer.innerHTML = '';
            }
            
            // 清理全局变量
            this.cleanupEmulatorJS();
            
            // 移除加载的脚本，以便下次重新加载
            const ejsScript = document.getElementById('emulatorjs-loader');
            if (ejsScript) {
                ejsScript.remove();
            }
            
            // 清理可能残留的 EmulatorJS 相关元素
            const ejsElements = document.querySelectorAll('[id^="ejs-"], [class^="ejs-"]');
            ejsElements.forEach(el => {
                try {
                    el.remove();
                } catch (e) {}
            });
        }

        this.lastFrameBuffer = null;
        this.lastFrameTime = 0;
        this.accumulator = 0;
        this.compressFrameCount = 0;
        this.lastReceivedSeq = 0;
        this.frameBufferValid = false;
        this.pendingFrame = null;
        this.renderPending = false;
        this.arcadeRomName = null; // 重置街机ROM名
        
        console.log('模拟器已停止');
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        return this.isPaused;
    }

    reset() {
        if (this.coreType === 'jsnes') {
            if (this.isHost && this.core) {
                this.core.reset();
            }
            this.lastFrameBuffer = null;
        } else if (this.coreType === 'emulatorjs') {
            // EmulatorJS 重置
            if (window.EJS_emulator) {
                try {
                    // 尝试使用 EmulatorJS 的重置功能
                    if (window.EJS_emulator.gameManager && window.EJS_emulator.gameManager.restart) {
                        window.EJS_emulator.gameManager.restart();
                        console.log('EmulatorJS 游戏已重置');
                    } else if (window.EJS_emulator.restart) {
                        window.EJS_emulator.restart();
                        console.log('EmulatorJS 游戏已重置');
                    }
                } catch (e) {
                    console.warn('EmulatorJS 重置失败:', e);
                }
            }
        }
    }

    // EmulatorJS 按键映射 - 与项目统一
    // P1: WASD方向, JK=AB, HG=XY, UI=SELECT/START
    // P2: 方向键, 小键盘1247=AB/SELECT, 小键盘9=START
    getEmulatorJSKeyCode(button, player = 0) {
        // NES 按钮索引: A=0, B=1, SELECT=2, START=3, UP=4, DOWN=5, LEFT=6, RIGHT=7
        // 与项目 input.js 的按键映射保持一致
        const keyMaps = {
            0: { // Player 1 - 与 defaultKeyMapP1 一致
                0: 'KeyJ',      // A -> J
                1: 'KeyK',      // B -> K
                2: 'KeyU',      // SELECT -> U
                3: 'KeyI',      // START -> I
                4: 'KeyW',      // UP -> W
                5: 'KeyS',      // DOWN -> S
                6: 'KeyA',      // LEFT -> A
                7: 'KeyD',      // RIGHT -> D
                // 扩展按键 (用于 SNES/GBA 等)
                8: 'KeyH',      // X -> H
                9: 'KeyG',      // Y -> G
                10: 'KeyQ',     // L -> Q
                11: 'KeyE'      // R -> E
            },
            1: { // Player 2 - 与 defaultKeyMapP2 一致
                0: 'Numpad1',   // A
                1: 'Numpad2',   // B
                2: 'Numpad7',   // SELECT
                3: 'Numpad9',   // START
                4: 'ArrowUp',   // UP
                5: 'ArrowDown', // DOWN
                6: 'ArrowLeft', // LEFT
                7: 'ArrowRight',// RIGHT
                // 扩展按键
                8: 'Numpad4',   // X
                9: 'Numpad5',   // Y
                10: 'Numpad0',  // L
                11: 'NumpadDecimal' // R
            }
        };
        
        return keyMaps[player]?.[button] || null;
    }

    // 模拟键盘事件给 EmulatorJS
    simulateKeyEvent(keyCode, isDown) {
        if (!keyCode) return;
        
        const event = new KeyboardEvent(isDown ? 'keydown' : 'keyup', {
            code: keyCode,
            key: keyCode,
            bubbles: true,
            cancelable: true
        });
        
        // 发送到 EmulatorJS 的 canvas 或 document
        const ejsCanvas = document.querySelector('#emulatorjs-game canvas');
        if (ejsCanvas) {
            ejsCanvas.dispatchEvent(event);
        } else {
            document.dispatchEvent(event);
        }
    }

    // 按键处理
    buttonDown(player, button) {
        if (!this.isRunning || !this.isHost) return;

        if (this.coreType === 'jsnes' && this.core) {
            if (player < 0 || player > 1) return;
            try {
                this.core.buttonDown(player + 1, button);
            } catch (e) {
                console.error('buttonDown错误:', e);
            }
        } else if (this.coreType === 'emulatorjs') {
            // EmulatorJS 通过模拟键盘事件处理
            const keyCode = this.getEmulatorJSKeyCode(button, player);
            if (keyCode) {
                this.simulateKeyEvent(keyCode, true);
            }
        }
    }

    buttonUp(player, button) {
        if (!this.isRunning || !this.isHost) return;

        if (this.coreType === 'jsnes' && this.core) {
            if (player < 0 || player > 1) return;
            try {
                this.core.buttonUp(player + 1, button);
            } catch (e) {
                console.error('buttonUp错误:', e);
            }
        } else if (this.coreType === 'emulatorjs') {
            // EmulatorJS 通过模拟键盘事件处理
            const keyCode = this.getEmulatorJSKeyCode(button, player);
            if (keyCode) {
                this.simulateKeyEvent(keyCode, false);
            }
        }
    }

    getLastError() {
        return this.lastError;
    }

    getPlatformInfo() {
        if (!this.platform) return null;
        return {
            platform: this.platform,
            ...PLATFORMS[this.platform]
        };
    }


    // ========== 存档功能 ==========

    getSaveList(gameId) {
        const key = `emu_saves_${this.platform}_${gameId}`;
        try {
            const saves = localStorage.getItem(key);
            return saves ? JSON.parse(saves) : [];
        } catch (e) {
            return [];
        }
    }

    saveGame(gameId, slotIndex, slotName = '') {
        // EmulatorJS 模式使用模拟器内置的存档功能
        if (this.coreType === 'emulatorjs') {
            return { success: false, error: '街机游戏请使用模拟器内的存档功能' };
        }
        
        if (!this.core || !this.isRunning) {
            return { success: false, error: '游戏未运行' };
        }

        // 只有 jsnes 支持存档
        if (this.coreType !== 'jsnes') {
            return { success: false, error: '此平台暂不支持存档' };
        }

        try {
            const state = this.core.toJSON();
            const thumbnail = this.captureScreenshot();

            const saveData = {
                gameId,
                slotIndex,
                slotName: slotName || `存档 ${slotIndex + 1}`,
                timestamp: Date.now(),
                state,
                thumbnail,
                frameCount: this.frameCount,
                platform: this.platform
            };

            const key = `emu_saves_${this.platform}_${gameId}`;
            let saves = this.getSaveList(gameId);

            const existingIndex = saves.findIndex((s) => s.slotIndex === slotIndex);
            if (existingIndex >= 0) {
                saves[existingIndex] = saveData;
            } else {
                saves.push(saveData);
            }

            saves.sort((a, b) => a.slotIndex - b.slotIndex);
            localStorage.setItem(key, JSON.stringify(saves));

            return { success: true, save: saveData };
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                return { success: false, error: '存储空间不足' };
            }
            return { success: false, error: e.message };
        }
    }

    loadGame(gameId, slotIndex) {
        if (!this.core) {
            return { success: false, error: '模拟器未初始化' };
        }

        if (this.coreType !== 'jsnes') {
            return { success: false, error: '此平台暂不支持读档' };
        }

        try {
            const saves = this.getSaveList(gameId);
            const saveData = saves.find((s) => s.slotIndex === slotIndex);

            if (!saveData) {
                return { success: false, error: '存档不存在' };
            }

            this.core.fromJSON(saveData.state);
            this.frameCount = saveData.frameCount || 0;
            return { success: true, save: saveData };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    deleteSave(gameId, slotIndex) {
        try {
            const key = `emu_saves_${this.platform}_${gameId}`;
            let saves = this.getSaveList(gameId);
            saves = saves.filter((s) => s.slotIndex !== slotIndex);
            localStorage.setItem(key, JSON.stringify(saves));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    captureScreenshot() {
        try {
            let sourceCanvas = this.canvas;
            
            // EmulatorJS 模式下，尝试获取 EmulatorJS 的 canvas
            if (this.coreType === 'emulatorjs' && this.emulatorContainer) {
                // EmulatorJS 可能有多个 canvas，找到主游戏 canvas
                const canvases = this.emulatorContainer.querySelectorAll('canvas');
                for (const canvas of canvases) {
                    // 选择尺寸最大的 canvas（通常是游戏画面）
                    if (canvas.width > 0 && canvas.height > 0) {
                        sourceCanvas = canvas;
                        break;
                    }
                }
            }
            
            if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
                console.warn('截图失败: canvas 无效或尺寸为0');
                return null;
            }
            
            // 检查 canvas 是否可以读取（跨域问题）
            try {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = 64;
                tempCanvas.height = 60;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (!tempCtx) {
                    console.warn('截图失败: 无法创建 canvas context');
                    return null;
                }
                
                tempCtx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, 64, 60);
                return tempCanvas.toDataURL('image/jpeg', 0.6);
            } catch (securityError) {
                // 跨域 canvas 无法读取
                console.warn('截图失败 (跨域限制):', securityError.message);
                return null;
            }
        } catch (e) {
            console.warn('截图失败:', e);
            return null;
        }
    }

    quickSave(gameId) {
        return this.saveGame(gameId, 0, '快速存档');
    }

    quickLoad(gameId) {
        return this.loadGame(gameId, 0);
    }

    getStorageInfo() {
        try {
            let totalSize = 0;
            for (let key in localStorage) {
                if (key.startsWith('emu_saves_') || key.startsWith('nes_saves_')) {
                    totalSize += localStorage.getItem(key).length * 2;
                }
            }
            return {
                used: totalSize,
                usedMB: (totalSize / 1024 / 1024).toFixed(2)
            };
        } catch (e) {
            return { used: 0, usedMB: '0' };
        }
    }
}

// 导出按键常量 (兼容旧代码)
export const NES_BUTTONS = {
    A: 0,
    B: 1,
    SELECT: 2,
    START: 3,
    UP: 4,
    DOWN: 5,
    LEFT: 6,
    RIGHT: 7
};

// 导出平台信息
export { PLATFORMS, detectPlatform, detectPlatformFromData };
