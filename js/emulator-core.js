// 多平台模拟器核心管理器
// 支持多种游戏平台

// 平台配置
export const PLATFORMS = {
    nes: {
        name: 'FC/NES',
        extensions: ['.nes', '.unf', '.unif'],
        core: 'jsnes',
        resolution: { width: 256, height: 240 },
        fps: 60.0988,
        maxPlayers: 2
    },
    sfc: {
        name: 'SFC/SNES',
        extensions: ['.sfc', '.smc', '.fig', '.swc'],
        core: 'snes9x',
        resolution: { width: 256, height: 224 },
        fps: 60.0988,
        maxPlayers: 2
    },
    md: {
        name: 'MD/世嘉',
        extensions: ['.md', '.bin', '.gen', '.smd'],
        core: 'genesis_plus_gx',
        resolution: { width: 320, height: 224 },
        fps: 59.922743,
        maxPlayers: 2
    },
    gba: {
        name: 'GBA',
        extensions: ['.gba', '.agb'],
        core: 'mgba',
        resolution: { width: 240, height: 160 },
        fps: 59.7275,
        maxPlayers: 1
    },
    gbc: {
        name: 'GBC/GB',
        extensions: ['.gbc', '.gb', '.sgb'],
        core: 'gambatte',
        resolution: { width: 160, height: 144 },
        fps: 59.7275,
        maxPlayers: 1
    },
    n64: {
        name: 'N64',
        extensions: ['.n64', '.z64', '.v64'],
        core: 'mupen64plus_next',
        resolution: { width: 320, height: 240 },
        fps: 60,
        maxPlayers: 4
    },
    pce: {
        name: 'PCE',
        extensions: ['.pce', '.sgx'],
        core: 'mednafen_pce',
        resolution: { width: 256, height: 240 },
        fps: 60,
        maxPlayers: 2
    },
    arcade: {
        name: '街机/Arcade',
        extensions: ['.zip'],
        core: 'fbneo',
        resolution: { width: 320, height: 224 },
        fps: 60,
        maxPlayers: 4,
        needsBios: true
    },
    mame: {
        name: 'MAME',
        extensions: ['.zip'],
        core: 'mame2003_plus',
        resolution: { width: 320, height: 224 },
        fps: 60,
        maxPlayers: 4,
        needsBios: true
    },
    wsc: {
        name: 'WSC',
        extensions: ['.wsc', '.ws'],
        core: 'mednafen_wswan',
        resolution: { width: 224, height: 144 },
        fps: 75,
        maxPlayers: 1
    },
    nds: {
        name: 'NDS',
        extensions: ['.nds'],
        core: 'melonds',
        resolution: { width: 256, height: 384 },
        fps: 60,
        maxPlayers: 1
    },
    psx: {
        name: 'PS1',
        extensions: ['.bin', '.cue', '.iso', '.pbp', '.chd'],
        core: 'pcsx_rearmed',
        resolution: { width: 320, height: 240 },
        fps: 60,
        maxPlayers: 2,
        needsBios: true
    },
    psp: {
        name: 'PSP',
        extensions: ['.iso', '.cso', '.pbp'],
        core: 'ppsspp',
        resolution: { width: 480, height: 272 },
        fps: 60,
        maxPlayers: 1
    },
    dc: {
        name: 'DC/Dreamcast',
        extensions: ['.cdi', '.gdi', '.chd'],
        core: 'flycast',
        resolution: { width: 640, height: 480 },
        fps: 60,
        maxPlayers: 4,
        needsBios: true
    }
};

// 根据文件扩展名检测平台
export function detectPlatform(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    
    for (const [platform, config] of Object.entries(PLATFORMS)) {
        if (config.extensions.includes(ext)) {
            return platform;
        }
    }
    
    return null;
}

// 根据ROM数据检测平台
export function detectPlatformFromData(romData) {
    if (!romData || romData.length < 16) return null;
    
    // NES: "NES\x1A"
    if (romData[0] === 0x4E && romData[1] === 0x45 && 
        romData[2] === 0x53 && romData[3] === 0x1A) {
        return 'nes';
    }
    
    // SNES: 检查header
    // SMC header (512 bytes) 或直接ROM
    const hasSMCHeader = romData.length % 1024 === 512;
    const offset = hasSMCHeader ? 512 : 0;
    
    // 检查SNES ROM header位置 (0x7FC0 或 0xFFC0)
    if (romData.length > offset + 0x8000) {
        // LoROM header at 0x7FC0
        const loRomChecksum = romData[offset + 0x7FDC] + (romData[offset + 0x7FDD] << 8);
        const loRomComplement = romData[offset + 0x7FDE] + (romData[offset + 0x7FDF] << 8);
        if ((loRomChecksum ^ loRomComplement) === 0xFFFF) {
            return 'snes';
        }
        
        // HiROM header at 0xFFC0
        if (romData.length > offset + 0x10000) {
            const hiRomChecksum = romData[offset + 0xFFDC] + (romData[offset + 0xFFDD] << 8);
            const hiRomComplement = romData[offset + 0xFFDE] + (romData[offset + 0xFFDF] << 8);
            if ((hiRomChecksum ^ hiRomComplement) === 0xFFFF) {
                return 'snes';
            }
        }
    }
    
    // MD/Genesis: "SEGA" 标识
    // 通常在 0x100 或 0x110 位置
    if (romData.length > 0x200) {
        const seg1 = String.fromCharCode(romData[0x100], romData[0x101], romData[0x102], romData[0x103]);
        const seg2 = String.fromCharCode(romData[0x110], romData[0x111], romData[0x112], romData[0x113]);
        if (seg1 === 'SEGA' || seg2 === 'SEGA') {
            return 'md';
        }
    }
    
    // GBA: 检查Nintendo logo和header
    if (romData.length > 0xC0) {
        // GBA ROM 在 0x04 位置有 Nintendo logo
        // 简单检查: 0xB0位置的固定值
        if (romData[0xB2] === 0x96) {
            return 'gba';
        }
    }
    
    return null;
}

// 基础模拟器接口
export class BaseEmulator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.platform = null;
        this.isRunning = false;
        this.isPaused = false;
        this.isHost = true;
        this.frameCount = 0;
        this.onFrameReady = null;
        this.lastError = null;
    }
    
    // 子类需要实现的方法
    async loadRom(romData) { throw new Error('Not implemented'); }
    start() { throw new Error('Not implemented'); }
    stop() { throw new Error('Not implemented'); }
    reset() { throw new Error('Not implemented'); }
    buttonDown(player, button) { throw new Error('Not implemented'); }
    buttonUp(player, button) { throw new Error('Not implemented'); }
    
    setHost(isHost) {
        this.isHost = isHost;
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        return this.isPaused;
    }
    
    getLastError() {
        return this.lastError;
    }
}

// 按键映射 - 统一接口
export const BUTTONS = {
    // 通用按键
    UP: 'UP',
    DOWN: 'DOWN',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    A: 'A',
    B: 'B',
    X: 'X',
    Y: 'Y',
    START: 'START',
    SELECT: 'SELECT',
    L: 'L',
    R: 'R',
    // 街机额外按键
    C: 'C',
    D: 'D',
    COIN: 'COIN'
};
