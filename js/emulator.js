// NES模拟器封装 - 支持帧同步
export class NESEmulator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.imageData = this.ctx.createImageData(256, 240);
        
        this.nes = null;
        this.isRunning = false;
        this.isPaused = false;
        this.frameId = null;
        this.isHost = true; // 是否为主机（P1运行模拟器，P2只显示）
        
        // 帧同步回调
        this.onFrameReady = null;
        
        // 音频
        this.audioCtx = null;
        this.audioBuffer = [];
        this.audioBufferSize = 4096;
        
        // 帧数据压缩用
        this.lastFrameBuffer = null;
        
        // 固定帧率控制 - NES运行在60.0988 FPS (NTSC)
        this.targetFPS = 60.0988;
        this.frameInterval = 1000 / this.targetFPS; // ~16.64ms
        this.lastFrameTime = 0;
        this.accumulator = 0;
        
        this.init();
    }

    init() {
        // 检查jsnes是否已加载
        if (typeof jsnes === 'undefined') {
            console.error('jsnes库未加载！请确保页面已加载jsnes.min.js');
            return false;
        }
        
        try {
            this.nes = new jsnes.NES({
                onFrame: (frameBuffer) => {
                    this.renderFrame(frameBuffer);
                    
                    // 如果是主机，发送帧数据给其他玩家
                    if (this.isHost && this.onFrameReady) {
                        try {
                            this.onFrameReady(frameBuffer);
                        } catch (e) {
                            console.warn('帧回调错误:', e);
                        }
                    }
                },
                onAudioSample: (left, right) => {
                    if (this.isHost) {
                        this.handleAudio(left, right);
                    }
                }
            });
            console.log('NES模拟器初始化完成，nes对象:', this.nes ? '已创建' : '创建失败');
            return true;
        } catch (e) {
            console.error('NES模拟器初始化失败:', e);
            this.nes = null;
            return false;
        }
    }

    setHost(isHost) {
        this.isHost = isHost;
        console.log(`模拟器模式: ${isHost ? '主机(P1)' : '客户端(P2)'}`);
    }

    renderFrame(frameBuffer) {
        const data = this.imageData.data;
        for (let i = 0; i < frameBuffer.length; i++) {
            const pixel = frameBuffer[i];
            const j = i * 4;
            data[j] = pixel & 0xFF;
            data[j + 1] = (pixel >> 8) & 0xFF;
            data[j + 2] = (pixel >> 16) & 0xFF;
            data[j + 3] = 0xFF;
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }

    // P2接收并显示远程帧
    receiveFrame(frameData) {
        if (this.isHost) return;
        
        try {
            // 解压帧数据
            const frameBuffer = this.decompressFrame(frameData);
            if (frameBuffer && frameBuffer.length > 0) {
                this.renderFrame(frameBuffer);
            }
        } catch (e) {
            console.warn('帧解压失败:', e);
        }
    }

    // 压缩帧数据（使用差分编码 + RLE）
    compressFrame(frameBuffer) {
        // 简单压缩：只发送变化的像素
        const changes = [];
        
        if (!this.lastFrameBuffer) {
            // 第一帧，发送完整数据（采样降低数据量）
            this.lastFrameBuffer = new Uint32Array(frameBuffer);
            // 每4个像素采样1个，大幅减少数据量
            for (let i = 0; i < frameBuffer.length; i += 2) {
                changes.push(frameBuffer[i]);
            }
            return { type: 'full', data: changes };
        }
        
        // 差分帧：只发送变化
        for (let i = 0; i < frameBuffer.length; i++) {
            if (frameBuffer[i] !== this.lastFrameBuffer[i]) {
                changes.push(i, frameBuffer[i]);
            }
        }
        
        this.lastFrameBuffer = new Uint32Array(frameBuffer);
        
        // 如果变化太多，发送完整帧
        if (changes.length > frameBuffer.length / 2) {
            const sampled = [];
            for (let i = 0; i < frameBuffer.length; i += 2) {
                sampled.push(frameBuffer[i]);
            }
            return { type: 'full', data: sampled };
        }
        
        return { type: 'diff', data: changes };
    }

    // 解压帧数据
    decompressFrame(frameData) {
        if (frameData.type === 'full') {
            // 完整帧（采样的），需要插值还原
            const buffer = new Uint32Array(256 * 240);
            for (let i = 0; i < frameData.data.length; i++) {
                const idx = i * 2;
                buffer[idx] = frameData.data[i];
                // 简单复制到相邻像素
                if (idx + 1 < buffer.length) {
                    buffer[idx + 1] = frameData.data[i];
                }
            }
            this.lastFrameBuffer = buffer;
            return buffer;
        } else {
            // 差分帧
            if (!this.lastFrameBuffer) {
                this.lastFrameBuffer = new Uint32Array(256 * 240);
            }
            const buffer = new Uint32Array(this.lastFrameBuffer);
            for (let i = 0; i < frameData.data.length; i += 2) {
                const idx = frameData.data[i];
                const pixel = frameData.data[i + 1];
                buffer[idx] = pixel;
            }
            this.lastFrameBuffer = buffer;
            return buffer;
        }
    }

    handleAudio(left, right) {
        if (!this.audioCtx) return;
        
        this.audioBuffer.push(left, right);
        
        if (this.audioBuffer.length >= this.audioBufferSize) {
            this.playAudioBuffer();
        }
    }

    initAudio() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
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

    loadRom(romData) {
        try {
            // 检查ROM格式并转换
            const processedRom = this.preprocessRom(romData);
            this.nes.loadROM(this.arrayToString(processedRom));
            this.lastFrameBuffer = null; // 重置帧缓存
            console.log('ROM加载成功');
            return true;
        } catch (e) {
            console.error('ROM加载失败:', e);
            return false;
        }
    }

    // 预处理ROM - 支持UNF/UNIF格式转换
    preprocessRom(romData) {
        // 检查是否是UNIF格式 (以"UNIF"开头)
        if (romData.length >= 4 && 
            romData[0] === 0x55 && romData[1] === 0x4E && 
            romData[2] === 0x49 && romData[3] === 0x46) {
            console.log('检测到UNIF格式ROM，尝试转换...');
            return this.convertUnifToNes(romData);
        }
        
        // 检查是否是标准NES格式 (以"NES\x1A"开头)
        if (romData.length >= 4 && 
            romData[0] === 0x4E && romData[1] === 0x45 && 
            romData[2] === 0x53 && romData[3] === 0x1A) {
            console.log('标准NES格式ROM');
            return romData;
        }
        
        // 尝试作为原始ROM数据处理
        console.log('未知ROM格式，尝试直接加载');
        return romData;
    }

    // 简单的UNIF到NES转换（基本支持）
    convertUnifToNes(unifData) {
        // UNIF格式解析
        // Header: "UNIF" + 4字节版本 + 24字节保留
        // 然后是多个chunk，每个chunk: 4字节ID + 4字节长度 + 数据
        
        let prgData = null;
        let chrData = null;
        let mapper = 0;
        let mirroring = 0;
        
        let offset = 32; // 跳过header
        
        while (offset < unifData.length - 8) {
            const chunkId = String.fromCharCode(unifData[offset], unifData[offset+1], unifData[offset+2], unifData[offset+3]);
            const chunkLen = unifData[offset+4] | (unifData[offset+5] << 8) | (unifData[offset+6] << 16) | (unifData[offset+7] << 24);
            offset += 8;
            
            if (offset + chunkLen > unifData.length) break;
            
            const chunkData = unifData.slice(offset, offset + chunkLen);
            
            if (chunkId.startsWith('PRG')) {
                prgData = prgData ? this.concatArrays(prgData, chunkData) : chunkData;
            } else if (chunkId.startsWith('CHR')) {
                chrData = chrData ? this.concatArrays(chrData, chunkData) : chunkData;
            } else if (chunkId === 'MAPR') {
                // Mapper名称，尝试解析
                const mapperName = String.fromCharCode(...chunkData).replace(/\0/g, '');
                console.log('UNIF Mapper:', mapperName);
            } else if (chunkId === 'MIRR') {
                mirroring = chunkData[0];
            }
            
            offset += chunkLen;
        }
        
        if (!prgData) {
            console.warn('UNIF转换失败：未找到PRG数据');
            return unifData; // 返回原始数据让jsnes尝试
        }
        
        // 构建iNES格式
        const prgSize = prgData.length;
        const chrSize = chrData ? chrData.length : 0;
        const prgBanks = Math.ceil(prgSize / 16384);
        const chrBanks = Math.ceil(chrSize / 8192);
        
        const nesHeader = new Uint8Array(16);
        nesHeader[0] = 0x4E; // N
        nesHeader[1] = 0x45; // E
        nesHeader[2] = 0x53; // S
        nesHeader[3] = 0x1A; // EOF
        nesHeader[4] = prgBanks;
        nesHeader[5] = chrBanks;
        nesHeader[6] = (mapper & 0x0F) << 4 | (mirroring & 1);
        nesHeader[7] = mapper & 0xF0;
        
        // 组合最终ROM
        const totalSize = 16 + prgSize + chrSize;
        const nesRom = new Uint8Array(totalSize);
        nesRom.set(nesHeader, 0);
        nesRom.set(prgData, 16);
        if (chrData) {
            nesRom.set(chrData, 16 + prgSize);
        }
        
        console.log(`UNIF转换完成: PRG=${prgSize}, CHR=${chrSize}`);
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

    start() {
        if (this.isRunning) return;
        
        // 确保NES已初始化
        if (!this.nes) {
            console.warn('NES模拟器未初始化，尝试初始化...');
            if (!this.init()) {
                console.error('NES模拟器初始化失败，无法启动');
                return;
            }
        }
        
        this.isRunning = true;
        this.isPaused = false;
        this.lastFrameTime = performance.now();
        this.accumulator = 0;
        
        // 只有主机需要音频和游戏循环
        if (this.isHost) {
            this.initAudio();
            this.gameLoop(performance.now());
            console.log('主机模拟器已启动，nes对象状态:', this.nes ? '正常' : '异常');
        } else {
            console.log('客户端模拟器已启动（仅接收帧）');
        }
    }

    gameLoop(currentTime) {
        if (!this.isRunning || !this.isHost) return;
        
        // 计算时间差
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        // 防止时间跳跃（如切换标签页后）
        const clampedDelta = Math.min(deltaTime, 100);
        
        if (!this.isPaused) {
            this.accumulator += clampedDelta;
            
            // 固定时间步长更新 - 确保帧率一致
            while (this.accumulator >= this.frameInterval) {
                this.nes.frame();
                this.accumulator -= this.frameInterval;
            }
        }
        
        this.frameId = requestAnimationFrame((time) => this.gameLoop(time));
    }

    stop() {
        this.isRunning = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.lastFrameBuffer = null;
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        return this.isPaused;
    }

    reset() {
        if (this.nes && this.isHost) {
            this.nes.reset();
            this.lastFrameBuffer = null;
        }
    }

    buttonDown(player, button) {
        // 确保 nes 已初始化
        if (!this.nes) {
            console.warn('buttonDown: NES未初始化，尝试重新初始化');
            this.init();
        }
        
        if (this.isHost && this.nes) {
            try {
                this.nes.buttonDown(player, button);
            } catch (e) {
                console.warn('buttonDown错误:', e);
            }
        }
    }

    buttonUp(player, button) {
        // 确保 nes 已初始化
        if (!this.nes) {
            console.warn('buttonUp: NES未初始化，尝试重新初始化');
            this.init();
        }
        
        if (this.isHost && this.nes) {
            try {
                this.nes.buttonUp(player, button);
            } catch (e) {
                console.warn('buttonUp错误:', e);
            }
        }
    }

    // 保存/加载状态（用于初始同步）
    saveState() {
        return { timestamp: Date.now() };
    }

    loadState(state) {
        // 状态恢复
    }
}

// NES按键常量 - 延迟初始化以确保jsnes已加载
export const NES_BUTTONS = {
    get A() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_A : 0; },
    get B() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_B : 1; },
    get SELECT() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_SELECT : 2; },
    get START() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_START : 3; },
    get UP() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_UP : 4; },
    get DOWN() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_DOWN : 5; },
    get LEFT() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_LEFT : 6; },
    get RIGHT() { return typeof jsnes !== 'undefined' ? jsnes.Controller.BUTTON_RIGHT : 7; }
};
