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
        
        this.init();
    }

    init() {
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
        console.log('NES模拟器初始化完成');
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
            this.nes.loadROM(this.arrayToString(romData));
            this.lastFrameBuffer = null; // 重置帧缓存
            console.log('ROM加载成功');
            return true;
        } catch (e) {
            console.error('ROM加载失败:', e);
            return false;
        }
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
        
        this.isRunning = true;
        this.isPaused = false;
        
        // 只有主机需要音频和游戏循环
        if (this.isHost) {
            this.initAudio();
            this.gameLoop();
            console.log('主机模拟器已启动');
        } else {
            console.log('客户端模拟器已启动（仅接收帧）');
        }
    }

    gameLoop() {
        if (!this.isRunning || !this.isHost) return;
        
        if (!this.isPaused) {
            this.nes.frame();
        }
        
        this.frameId = requestAnimationFrame(() => this.gameLoop());
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
        if (this.isHost) {
            this.nes.buttonDown(player, button);
        }
    }

    buttonUp(player, button) {
        if (this.isHost) {
            this.nes.buttonUp(player, button);
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

// NES按键常量
export const NES_BUTTONS = {
    A: jsnes.Controller.BUTTON_A,
    B: jsnes.Controller.BUTTON_B,
    SELECT: jsnes.Controller.BUTTON_SELECT,
    START: jsnes.Controller.BUTTON_START,
    UP: jsnes.Controller.BUTTON_UP,
    DOWN: jsnes.Controller.BUTTON_DOWN,
    LEFT: jsnes.Controller.BUTTON_LEFT,
    RIGHT: jsnes.Controller.BUTTON_RIGHT
};
