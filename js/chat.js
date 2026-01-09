// 聊天和语音通信管理
export class ChatManager {
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.isVoiceActive = false;
        this.localStream = null;
        this.audioContext = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;
        
        this.bindEvents();
        this.roomManager.on('chat', (data) => this.onChatMessage(data));
        this.roomManager.on('voice-data', (data) => this.onVoiceData(data));
    }

    bindEvents() {
        const chatPanel = document.getElementById('chat-panel');
        const toggleBtn = document.getElementById('toggle-chat-btn');
        const voiceBtn = document.getElementById('voice-btn');
        const sendBtn = document.getElementById('send-chat-btn');
        const chatInput = document.getElementById('chat-input');

        // 折叠/展开聊天
        toggleBtn?.addEventListener('click', () => {
            chatPanel.classList.toggle('collapsed');
            toggleBtn.textContent = chatPanel.classList.contains('collapsed') ? '▲' : '▼';
        });

        // 发送消息
        sendBtn?.addEventListener('click', () => this.sendMessage());
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // 语音按钮
        voiceBtn?.addEventListener('click', () => this.toggleVoice());
    }

    sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        const playerNum = this.getMyPlayerNum();
        
        // 本地显示
        this.addMessage(playerNum, text);
        
        // 发送给其他玩家
        this.roomManager.send({
            type: 'chat',
            playerNum,
            text
        });

        input.value = '';
    }

    onChatMessage(data) {
        this.addMessage(data.playerNum, data.text);
    }

    addMessage(playerNum, text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-msg';
        msg.innerHTML = `
            <span class="msg-sender p${playerNum}">P${playerNum}:</span>
            <span class="msg-text">${this.escapeHtml(text)}</span>
        `;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-msg system';
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getMyPlayerNum() {
        // 从全局获取
        return window.app?.myPlayerNum || 1;
    }

    // ========== 语音通信 ==========
    async toggleVoice() {
        const voiceBtn = document.getElementById('voice-btn');
        
        if (this.isVoiceActive) {
            this.stopVoice();
            voiceBtn.classList.remove('active');
            voiceBtn.textContent = '🎤';
        } else {
            try {
                await this.startVoice();
                voiceBtn.classList.add('active');
                voiceBtn.textContent = '🔴';
            } catch (e) {
                console.error('语音启动失败:', e);
                this.addSystemMessage('语音启动失败，请检查麦克风权限');
            }
        }
    }

    async startVoice() {
        // 获取麦克风
        this.localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // 创建音频上下文
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = this.audioContext.createMediaStreamSource(this.localStream);
        
        // 创建处理器
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            if (!this.isVoiceActive) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            // 简单压缩：降采样 + 量化
            const compressed = this.compressAudio(inputData);
            
            this.roomManager.send({
                type: 'voice-data',
                audio: compressed
            });
        };

        source.connect(processor);
        processor.connect(this.audioContext.destination);
        
        this.isVoiceActive = true;
        this.addSystemMessage('语音已开启');
    }

    stopVoice() {
        this.isVoiceActive = false;
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.addSystemMessage('语音已关闭');
    }

    compressAudio(data) {
        // 降采样到1/4
        const compressed = [];
        for (let i = 0; i < data.length; i += 4) {
            // 量化到8位
            compressed.push(Math.round((data[i] + 1) * 127));
        }
        return compressed;
    }

    onVoiceData(data) {
        if (!data.audio || data.audio.length === 0) return;
        
        try {
            // 播放接收到的音频
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = audioCtx.createBuffer(1, data.audio.length * 4, audioCtx.sampleRate);
            const channelData = buffer.getChannelData(0);
            
            // 解压
            for (let i = 0; i < data.audio.length; i++) {
                const value = (data.audio[i] / 127) - 1;
                // 插值还原
                channelData[i * 4] = value;
                channelData[i * 4 + 1] = value;
                channelData[i * 4 + 2] = value;
                channelData[i * 4 + 3] = value;
            }
            
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start();
        } catch (e) {
            // 忽略播放错误
        }
    }

    destroy() {
        this.stopVoice();
        this.initialized = false;
    }
}
