// NES模拟器封装 - 支持帧同步
export class NESEmulator {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        
        // 禁用图像平滑，保持像素清晰
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.webkitImageSmoothingEnabled = false;
        this.ctx.mozImageSmoothingEnabled = false;
        this.ctx.msImageSmoothingEnabled = false;
        
        this.imageData = this.ctx.createImageData(256, 240);
        
        this.nes = null;
        this.isRunning = false;
        this.isPaused = false;
        this.frameId = null;
        this.isHost = true; // 是否为主机（P1运行模拟器，P2只显示）
        this.frameCount = 0; // 帧计数器
        
        // 帧同步回调
        this.onFrameReady = null;
        
        // 音频
        this.audioCtx = null;
        this.audioBuffer = [];
        this.audioBufferSize = 4096;
        
        // 帧数据压缩用
        this.lastFrameBuffer = null;
        this.lastError = null;
        this.compressFrameCount = 0;
        this.lastReceivedSeq = 0;
        this.frameBufferValid = false;
        this.pendingFrame = null;
        this.renderPending = false;
        
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
            this.nes = null;
            return false;
        }
        
        // 如果已经初始化过，直接返回
        if (this.nes && typeof this.nes.buttonDown === 'function') {
            return true;
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
            
            // 添加兼容性方法 - jsnes 某些版本可能会调用 stop()
            if (this.nes && typeof this.nes.stop !== 'function') {
                this.nes.stop = () => {
                    // 空实现，防止报错
                };
            }
            
            // 验证 nes 对象创建成功
            if (this.nes && typeof this.nes.buttonDown === 'function') {
                console.log('NES模拟器初始化完成');
                return true;
            } else {
                console.error('NES模拟器创建失败：对象无效');
                this.nes = null;
                return false;
            }
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
        if (!this.canvas || !this.ctx) {
            return;
        }

        this.frameCount++;

        // 确保帧缓冲区有效
        if (!frameBuffer || frameBuffer.length < 256 * 240) {
            console.warn('无效的帧缓冲区:', frameBuffer?.length);
            return;
        }

        const data = this.imageData.data;

        // jsnes 1.2.1 PPU buffer 格式
        // jsnes 输出的像素格式实际上是 0x00BBGGRR (BGR顺序)
        // Canvas ImageData 需要 RGBA 格式，所以需要交换 R 和 B
        for (let i = 0; i < 256 * 240; i++) {
            const pixel = frameBuffer[i];
            const j = i * 4;

            // 交换 R 和 B 通道
            data[j] = pixel & 0xff; // R (从低8位取)
            data[j + 1] = (pixel >> 8) & 0xff; // G (中间8位)
            data[j + 2] = (pixel >> 16) & 0xff; // B (从高8位取)
            data[j + 3] = 0xff; // A
        }

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    // P2接收并显示远程帧
    receiveFrame(frameData) {
        if (this.isHost) return;
        
        try {
            // 解压帧数据
            const frameBuffer = this.decompressFrame(frameData);
            if (frameBuffer && frameBuffer.length === 256 * 240) {
                // 使用双缓冲避免闪烁
                if (!this.pendingFrame) {
                    this.pendingFrame = frameBuffer;
                    // 使用 requestAnimationFrame 同步渲染，避免撕裂
                    if (!this.renderPending) {
                        this.renderPending = true;
                        requestAnimationFrame(() => {
                            if (this.pendingFrame) {
                                this.renderFrame(this.pendingFrame);
                                this.pendingFrame = null;
                            }
                            this.renderPending = false;
                        });
                    }
                } else {
                    // 如果有待渲染帧，直接替换（丢弃旧帧）
                    this.pendingFrame = frameBuffer;
                }
            }
        } catch (e) {
            console.warn('帧解压失败:', e);
        }
    }

    // 压缩帧数据（优化版：减少采样损失）
    compressFrame(frameBuffer) {
        // 每隔 keyFrameInterval 帧发送完整帧，确保同步
        this.compressFrameCount = (this.compressFrameCount || 0) + 1;
        const isKeyFrame = this.compressFrameCount % 15 === 1; // 每15帧一个关键帧（约4次/秒）
        
        if (!this.lastFrameBuffer || isKeyFrame) {
            // 关键帧：发送完整数据（无损）
            this.lastFrameBuffer = new Uint32Array(frameBuffer);
            // 使用简单的 RLE 压缩
            const compressed = this.rleEncode(frameBuffer);
            return { type: 'key', data: compressed, seq: this.compressFrameCount };
        }
        
        // 差分帧：只发送变化的像素
        const changes = [];
        let changeCount = 0;
        
        for (let i = 0; i < frameBuffer.length; i++) {
            if (frameBuffer[i] !== this.lastFrameBuffer[i]) {
                changes.push(i, frameBuffer[i]);
                changeCount++;
            }
        }
        
        this.lastFrameBuffer = new Uint32Array(frameBuffer);
        
        // 如果变化超过25%，发送关键帧（降低阈值，更频繁发送完整帧）
        if (changeCount > frameBuffer.length * 0.25) {
            const compressed = this.rleEncode(frameBuffer);
            return { type: 'key', data: compressed, seq: this.compressFrameCount };
        }
        
        return { type: 'diff', data: changes, seq: this.compressFrameCount };
    }
    
    // RLE 编码压缩 - 使用特殊标记避免与像素值冲突
    rleEncode(frameBuffer) {
        const result = [];
        const RLE_MARKER = 0x7FFFFFFF; // 使用最大正整数作为 RLE 标记
        let i = 0;
        while (i < frameBuffer.length) {
            const pixel = frameBuffer[i];
            let count = 1;
            while (i + count < frameBuffer.length && frameBuffer[i + count] === pixel && count < 255) {
                count++;
            }
            if (count > 3) {
                // RLE: [标记, 重复次数, 像素值]
                result.push(RLE_MARKER, count, pixel);
            } else {
                // 直接存储
                for (let j = 0; j < count; j++) {
                    result.push(pixel);
                }
            }
            i += count;
        }
        return result;
    }
    
    // RLE 解码
    rleDecode(compressed) {
        const result = new Uint32Array(256 * 240);
        const RLE_MARKER = 0x7FFFFFFF;
        let outIdx = 0;
        let i = 0;
        while (i < compressed.length && outIdx < result.length) {
            if (compressed[i] === RLE_MARKER && i + 2 < compressed.length) {
                // RLE 编码的重复像素
                const count = compressed[i + 1];
                const pixel = compressed[i + 2];
                for (let j = 0; j < count && outIdx < result.length; j++) {
                    result[outIdx++] = pixel;
                }
                i += 3;
            } else {
                // 直接像素
                result[outIdx++] = compressed[i];
                i++;
            }
        }
        return result;
    }

    // 解压帧数据（优化版）
    decompressFrame(frameData) {
        // 检查帧序号，丢弃过时的帧
        if (frameData.seq && this.lastReceivedSeq && frameData.seq < this.lastReceivedSeq) {
            return null; // 丢弃乱序帧
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
            // 关键帧：RLE 解码
            const buffer = this.rleDecode(frameData.data);
            this.lastFrameBuffer = buffer;
            this.frameBufferValid = true;
            return buffer;
        } else if (frameData.type === 'diff') {
            // 差分帧
            if (!this.lastFrameBuffer || !this.frameBufferValid) {
                // 没有基准帧，请求关键帧（这里只能等待下一个关键帧）
                console.warn('缺少基准帧，等待关键帧...');
                return this.lastFrameBuffer || new Uint32Array(256 * 240);
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
        } else if (frameData.type === 'full') {
            // 兼容旧格式
            const buffer = new Uint32Array(256 * 240);
            for (let i = 0; i < frameData.data.length; i++) {
                const idx = i * 2;
                buffer[idx] = frameData.data[i];
                if (idx + 1 < buffer.length) {
                    buffer[idx + 1] = frameData.data[i];
                }
            }
            this.lastFrameBuffer = buffer;
            this.frameBufferValid = true;
            return buffer;
        }
        
        return null;
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
        // 如果正在运行，先停止
        if (this.isRunning) {
            this.stop();
        }
        
        // 每次加载 ROM 都重新创建 NES 实例，确保回调正确绑定
        try {
            console.log('创建新的 NES 实例...');
            
            // 保存 this 引用
            const self = this;
            
            this.nes = new jsnes.NES({
                onFrame: function(frameBuffer) {
                    // 使用 function 而不是箭头函数，确保 this 绑定正确
                    self.renderFrame(frameBuffer);
                    
                    // 如果是主机，发送帧数据给其他玩家
                    if (self.isHost && self.onFrameReady) {
                        try {
                            self.onFrameReady(frameBuffer);
                        } catch (e) {
                            console.warn('帧回调错误:', e);
                        }
                    }
                },
                onAudioSample: function(left, right) {
                    if (self.isHost) {
                        self.handleAudio(left, right);
                    }
                }
            });
            
            console.log('NES 实例创建成功, nes.ppu:', this.nes.ppu ? '存在' : '不存在');
            
            // 添加兼容性方法
            if (typeof this.nes.stop !== 'function') {
                this.nes.stop = () => {};
            }
            
            // 检查ROM格式并转换
            const processedRom = this.preprocessRom(romData);
            console.log(`加载ROM: ${processedRom.length} 字节`);
            
            this.nes.loadROM(this.arrayToString(processedRom));
            this.lastFrameBuffer = null;
            
            // 验证 ROM 加载后的状态
            console.log('ROM加载成功, PPU buffer:', this.nes.ppu?.buffer ? `长度=${this.nes.ppu.buffer.length}` : '不存在');
            
            this.lastError = null;
            return true;
        } catch (e) {
            console.error('ROM加载失败:', e);
            
            const errorMsg = e.message || e.toString();
            if (errorMsg.includes('mapper not supported') || errorMsg.includes('Unknown Mapper')) {
                const mapperMatch = errorMsg.match(/Mapper[,\s]*(\d+)/i);
                const mapperNum = mapperMatch ? mapperMatch[1] : '未知';
                this.lastError = `此游戏使用的 Mapper ${mapperNum} 不被支持，请尝试其他游戏`;
            } else {
                this.lastError = `ROM加载失败: ${errorMsg}`;
            }
            
            return false;
        }
    }
    
    getLastError() {
        return this.lastError || null;
    }

    // 预处理ROM - 支持多种格式
    preprocessRom(romData) {
        // 检查是否是压缩文件 (ZIP/7Z/RAR)
        if (romData.length >= 4) {
            // ZIP 文件 (PK)
            if (romData[0] === 0x50 && romData[1] === 0x4B) {
                console.log('检测到 ZIP 格式，需要解压缩');
                this.lastError = 'ZIP 文件需要先解压缩，请上传解压后的 .nes 文件';
                throw new Error(this.lastError);
            }
            // 7Z 文件
            if (romData[0] === 0x37 && romData[1] === 0x7A && romData[2] === 0xBC && romData[3] === 0xAF) {
                console.log('检测到 7Z 格式');
                this.lastError = '7Z 文件需要先解压缩，请上传解压后的 .nes 文件';
                throw new Error(this.lastError);
            }
            // RAR 文件
            if (romData[0] === 0x52 && romData[1] === 0x61 && romData[2] === 0x72 && romData[3] === 0x21) {
                console.log('检测到 RAR 格式');
                this.lastError = 'RAR 文件需要先解压缩，请上传解压后的 .nes 文件';
                throw new Error(this.lastError);
            }
        }
        
        // 检查是否是 JSNES 状态文件 (JSON 格式)
        if (romData.length > 10) {
            try {
                const text = new TextDecoder().decode(romData.slice(0, 100));
                if (text.includes('"rom"') && text.includes('"state"')) {
                    console.log('检测到 JSNES 状态文件');
                    const stateData = JSON.parse(new TextDecoder().decode(romData));
                    if (stateData.rom) {
                        console.log('从 JSNES 状态文件提取 ROM 数据');
                        // 将 base64 或字符串 ROM 数据转换为 Uint8Array
                        const romString = stateData.rom;
                        const romBytes = new Uint8Array(romString.length);
                        for (let i = 0; i < romString.length; i++) {
                            romBytes[i] = romString.charCodeAt(i);
                        }
                        return this.preprocessRom(romBytes);
                    }
                }
            } catch (e) {
                // 不是 JSON 格式，继续其他检测
            }
        }
        
        // 检查是否是UNIF格式 (以"UNIF"开头)
        if (romData.length >= 4 && 
            romData[0] === 0x55 && romData[1] === 0x4E && 
            romData[2] === 0x49 && romData[3] === 0x46) {
            console.log('检测到UNIF格式ROM，尝试转换...');
            return this.convertUnifToNes(romData);
        }
        
        // 检查是否是FDS格式 (Famicom Disk System)
        if (romData.length >= 4 && 
            romData[0] === 0x46 && romData[1] === 0x44 && 
            romData[2] === 0x53 && romData[3] === 0x1A) {
            console.log('检测到FDS格式ROM');
            this.lastError = 'FDS (磁碟机) 格式暂不支持，请尝试标准 NES ROM';
            throw new Error(this.lastError);
        }
        
        // 检查是否是NSF格式 (音乐文件)
        if (romData.length >= 5 && 
            romData[0] === 0x4E && romData[1] === 0x45 && 
            romData[2] === 0x53 && romData[3] === 0x4D && romData[4] === 0x1A) {
            console.log('检测到NSF格式');
            this.lastError = 'NSF 是音乐文件格式，不是游戏ROM';
            throw new Error(this.lastError);
        }
        
        // 检查是否是标准NES格式 (以"NES\x1A"开头)
        if (romData.length >= 4 && 
            romData[0] === 0x4E && romData[1] === 0x45 && 
            romData[2] === 0x53 && romData[3] === 0x1A) {
            console.log('标准NES格式ROM');
            
            // 检查 Mapper 类型
            const mapper = ((romData[6] & 0xF0) >> 4) | (romData[7] & 0xF0);
            console.log(`ROM Mapper: ${mapper}`);
            
            // 检查是否是不支持的 Mapper
            const unsupportedMappers = {
                45: '多合一卡带 (Super Game)',
                52: '多合一卡带',
                176: '多合一卡带',
                178: '多合一卡带',
                226: '多合一卡带',
                227: '多合一卡带',
                234: '多合一卡带 (Maxi 15)',
                235: '多合一卡带 (Golden Game)',
                255: '多合一卡带'
            };
            
            if (unsupportedMappers[mapper]) {
                this.lastError = `此游戏是 ${unsupportedMappers[mapper]} (Mapper ${mapper})，jsnes 不支持此格式。\n\n建议：\n1. 下载单独的游戏 ROM\n2. 使用其他模拟器如 FCEUX、Nestopia`;
                console.warn(this.lastError);
                throw new Error(this.lastError);
            }
            
            // 检查其他可能不支持的 Mapper
            const partialSupportMappers = [5, 16, 18, 19, 21, 22, 23, 24, 25, 26, 64, 65, 67, 68, 69, 73, 75, 76, 80, 82, 85, 86, 87, 88, 89, 92, 93, 94, 95, 97, 105, 113, 118, 119, 140, 152, 154, 180, 184, 185, 206, 207, 210];
            if (partialSupportMappers.includes(mapper)) {
                console.warn(`Mapper ${mapper} 可能不完全支持，游戏可能无法正常运行`);
            }
            
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
        let mapperName = '';
        
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
                mapperName = String.fromCharCode(...chunkData).replace(/\0/g, '');
                console.log('UNIF Mapper:', mapperName);
                
                // 检查是否是不支持的多合一卡带
                if (mapperName.includes('BMC') || mapperName.includes('Supervision') || 
                    mapperName.includes('Multi') || mapperName.includes('in1')) {
                    console.warn('警告: 多合一卡带可能不被支持');
                    this.lastError = `此游戏是多合一卡带 (${mapperName})，可能不被支持`;
                }
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
        if (this.isRunning) {
            return;
        }
        
        // 确保NES已初始化
        if (!this.nes) {
            if (!this.init()) {
                console.error('NES模拟器初始化失败，无法启动');
                return;
            }
        }
        
        // 确保 stop 方法存在
        if (typeof this.nes.stop !== 'function') {
            this.nes.stop = () => {};
        }
        
        this.isRunning = true;
        this.isPaused = false;
        this.frameCount = 0;
        
        // 重置帧率控制变量
        this.lastFrameTime = 0;
        this.accumulator = 0;
        
        console.log('模拟器启动, isHost:', this.isHost);
        
        // 只有主机需要音频和游戏循环
        if (this.isHost) {
            this.initAudio();
            
            // 立即执行一帧来测试回调是否工作
            try {
                console.log('执行测试帧...');
                this.nes.frame();
                console.log('测试帧执行完成, frameCount:', this.frameCount);
                
                // 如果回调没有触发，检查 PPU buffer
                if (this.frameCount === 0 && this.nes.ppu) {
                    console.log('PPU 状态:', {
                        buffer: this.nes.ppu.buffer ? `存在(${this.nes.ppu.buffer.length})` : '不存在',
                        frameBuffer: this.nes.ppu.frameBuffer ? '存在' : '不存在'
                    });
                }
            } catch (e) {
                console.error('测试帧执行失败:', e);
            }
            
            requestAnimationFrame((time) => this.gameLoop(time));
        }
    }

    gameLoop(currentTime) {
        if (!this.isRunning || !this.isHost) {
            return;
        }
        
        // 初始化时间
        if (this.lastFrameTime === 0) {
            this.lastFrameTime = currentTime;
        }
        
        // 计算时间差
        const deltaTime = currentTime - this.lastFrameTime;
        this.accumulator += deltaTime;
        this.lastFrameTime = currentTime;
        
        // 固定时间步长执行 NES 帧
        let framesExecuted = 0;
        while (this.accumulator >= this.frameInterval && framesExecuted < 2) {
            if (!this.isPaused && this.nes) {
                try {
                    // 记录执行前的帧数
                    const prevFrameCount = this.frameCount;
                    
                    // 调用 frame() 执行一帧模拟
                    this.nes.frame();
                    
                    // 如果 onFrame 回调没有被触发（frameCount 没有增加），尝试备用方案
                    if (this.frameCount === prevFrameCount) {
                        // jsnes 的 PPU 帧缓冲区
                        const ppu = this.nes.ppu;
                        if (ppu && ppu.buffer && ppu.buffer.length > 0) {
                            // 只在第一次时打印日志
                            if (this.frameCount === 0) {
                                console.log('onFrame 回调未触发，切换到直接 PPU 渲染模式');
                            }
                            this.renderFrame(ppu.buffer);
                            
                            // 如果是主机，发送帧数据给其他玩家
                            if (this.onFrameReady) {
                                try {
                                    this.onFrameReady(ppu.buffer);
                                } catch (e) {
                                    // 静默处理
                                }
                            }
                        }
                    }
                    
                    framesExecuted++;
                } catch (e) {
                    console.error('帧执行错误:', e);
                    this.isRunning = false;
                    return;
                }
            }
            
            this.accumulator -= this.frameInterval;
        }
        
        // 防止累积器过大（避免死循环）
        if (this.accumulator > this.frameInterval * 3) {
            this.accumulator = this.frameInterval;
        }
        
        this.frameId = requestAnimationFrame((time) => this.gameLoop(time));
    }

    stop() {
        this.isRunning = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close();
            this.audioCtx = null;
        }
        this.lastFrameBuffer = null;
        
        // 重置帧率控制变量
        this.lastFrameTime = 0;
        this.accumulator = 0;
        
        // 重置帧压缩/同步状态
        this.compressFrameCount = 0;
        this.lastReceivedSeq = 0;
        this.frameBufferValid = false;
        this.pendingFrame = null;
        this.renderPending = false;
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
        // 检查游戏是否正在运行
        if (!this.isRunning || !this.isHost) {
            return;
        }
        
        // 确保 nes 已初始化
        if (!this.nes) {
            return;
        }
        
        // 验证玩家索引 (0 或 1)
        if (player < 0 || player > 1) {
            console.warn('buttonDown: 无效的玩家索引', player);
            return;
        }
        
        try {
            // 调用 jsnes 的 buttonDown
            this.nes.buttonDown(player + 1, button);
        } catch (e) {
            console.error('buttonDown 错误:', e);
        }
    }

    buttonUp(player, button) {
        // 检查游戏是否正在运行
        if (!this.isRunning || !this.isHost) {
            return;
        }
        
        // 确保 nes 已初始化
        if (!this.nes) {
            return;
        }
        
        // 验证玩家索引 (0 或 1)
        if (player < 0 || player > 1) {
            console.warn('buttonUp: 无效的玩家索引', player);
            return;
        }
        
        try {
            // 调用 jsnes 的 buttonUp
            this.nes.buttonUp(player + 1, button);
        } catch (e) {
            console.error('buttonUp 错误:', e);
        }
    }

    // ========== 存档功能 ==========
    
    // 获取存档列表
    getSaveList(gameId) {
        const key = `nes_saves_${gameId}`;
        try {
            const saves = localStorage.getItem(key);
            return saves ? JSON.parse(saves) : [];
        } catch (e) {
            console.error('读取存档列表失败:', e);
            return [];
        }
    }
    
    // 保存游戏状态
    saveGame(gameId, slotIndex, slotName = '') {
        if (!this.nes || !this.isRunning) {
            console.warn('游戏未运行，无法存档');
            return { success: false, error: '游戏未运行' };
        }
        
        try {
            // 获取 NES 完整状态
            const state = this.nes.toJSON();
            
            // 截取当前画面作为缩略图
            const thumbnail = this.captureScreenshot();
            
            // 构建存档数据
            const saveData = {
                gameId,
                slotIndex,
                slotName: slotName || `存档 ${slotIndex + 1}`,
                timestamp: Date.now(),
                state,
                thumbnail,
                frameCount: this.frameCount
            };
            
            // 获取现有存档列表
            const key = `nes_saves_${gameId}`;
            let saves = this.getSaveList(gameId);
            
            // 更新或添加存档
            const existingIndex = saves.findIndex(s => s.slotIndex === slotIndex);
            if (existingIndex >= 0) {
                saves[existingIndex] = saveData;
            } else {
                saves.push(saveData);
            }
            
            // 按槽位排序
            saves.sort((a, b) => a.slotIndex - b.slotIndex);
            
            // 保存到 localStorage
            localStorage.setItem(key, JSON.stringify(saves));
            
            console.log(`存档成功: ${saveData.slotName}`);
            return { success: true, save: saveData };
        } catch (e) {
            console.error('存档失败:', e);
            
            // 检查是否是存储空间不足
            if (e.name === 'QuotaExceededError') {
                return { success: false, error: '存储空间不足，请删除一些旧存档' };
            }
            return { success: false, error: e.message };
        }
    }
    
    // 加载游戏状态
    loadGame(gameId, slotIndex) {
        if (!this.nes) {
            console.warn('模拟器未初始化');
            return { success: false, error: '模拟器未初始化' };
        }
        
        try {
            const saves = this.getSaveList(gameId);
            const saveData = saves.find(s => s.slotIndex === slotIndex);
            
            if (!saveData) {
                return { success: false, error: '存档不存在' };
            }
            
            // 恢复 NES 状态
            this.nes.fromJSON(saveData.state);
            this.frameCount = saveData.frameCount || 0;
            
            console.log(`读档成功: ${saveData.slotName}`);
            return { success: true, save: saveData };
        } catch (e) {
            console.error('读档失败:', e);
            return { success: false, error: e.message };
        }
    }
    
    // 删除存档
    deleteSave(gameId, slotIndex) {
        try {
            const key = `nes_saves_${gameId}`;
            let saves = this.getSaveList(gameId);
            saves = saves.filter(s => s.slotIndex !== slotIndex);
            localStorage.setItem(key, JSON.stringify(saves));
            return { success: true };
        } catch (e) {
            console.error('删除存档失败:', e);
            return { success: false, error: e.message };
        }
    }
    
    // 截取当前画面作为缩略图 (64x60 缩小版)
    captureScreenshot() {
        try {
            // 创建临时 canvas 用于缩放
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = 64;
            tempCanvas.height = 60;
            const tempCtx = tempCanvas.getContext('2d');
            
            // 从主 canvas 缩放绘制
            tempCtx.drawImage(this.canvas, 0, 0, 256, 240, 0, 0, 64, 60);
            
            // 转为 base64 (使用较低质量减少存储)
            return tempCanvas.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            console.warn('截图失败:', e);
            return null;
        }
    }
    
    // 快速存档 (F5)
    quickSave(gameId) {
        return this.saveGame(gameId, 0, '快速存档');
    }
    
    // 快速读档 (F7)
    quickLoad(gameId) {
        return this.loadGame(gameId, 0);
    }
    
    // 获取存储使用情况
    getStorageInfo() {
        try {
            let totalSize = 0;
            for (let key in localStorage) {
                if (key.startsWith('nes_saves_')) {
                    totalSize += localStorage.getItem(key).length * 2; // UTF-16
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

// NES按键常量 - jsnes 1.2.1 的按键值
// 参考: https://github.com/bfirsh/jsnes/blob/master/src/controller.js
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
