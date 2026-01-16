// 语音聊天管理器
export class VoiceChatManager {
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.localStream = null;
        this.audioTracks = {}; // {playerNum: MediaStreamTrack}
        this.remoteAudios = {}; // {playerNum: HTMLAudioElement}
        this.isMuted = false;
        this.isEnabled = false;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        this.initialized = true;

        this.bindEvents();
        this.setupRoomEvents();
    }

    bindEvents() {
        const toggleBtn = document.getElementById('toggle-voice-btn');
        const muteBtn = document.getElementById('mute-voice-btn');

        toggleBtn?.addEventListener('click', () => this.toggleVoice());
        muteBtn?.addEventListener('click', () => this.toggleMute());
    }

    setupRoomEvents() {
        // 监听 P2P 连接建立
        this.roomManager.on('peer-connected', async (data) => {
            console.log(`P${data.playerNum} P2P连接建立，准备添加音频轨道`);
            if (this.isEnabled && this.localStream) {
                await this.addAudioTrackToPeer(data.playerNum);
            }
        });

        // 监听玩家离开
        this.roomManager.on('player-left', (data) => {
            this.removeRemoteAudio(data.playerNum);
        });

        // 监听房间关闭
        this.roomManager.on('room-closed', () => {
            this.cleanup();
        });
    }

    async toggleVoice() {
        if (this.isEnabled) {
            await this.disableVoice();
        } else {
            await this.enableVoice();
        }
    }

    async enableVoice() {
        try {
            // 请求麦克风权限
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('✅ 麦克风已启用');
            this.isEnabled = true;
            this.updateUI();

            // 为所有已连接的玩家添加音频轨道
            for (const playerNum of Object.keys(this.roomManager.peerConnections)) {
                const pc = this.roomManager.peerConnections[playerNum];
                if (pc.connectionState === 'connected') {
                    await this.addAudioTrackToPeer(parseInt(playerNum));
                }
            }

            this.showNotification('语音聊天已启用');
        } catch (error) {
            console.error('启用语音失败:', error);
            this.showNotification('无法访问麦克风，请检查权限设置', 'error');
        }
    }

    async disableVoice() {
        // 停止本地音频流
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // 移除所有音频轨道
        for (const playerNum of Object.keys(this.roomManager.peerConnections)) {
            this.removeAudioTrackFromPeer(parseInt(playerNum));
        }

        // 清理远程音频
        for (const playerNum of Object.keys(this.remoteAudios)) {
            this.removeRemoteAudio(parseInt(playerNum));
        }

        this.isEnabled = false;
        this.isMuted = false;
        this.updateUI();
        this.showNotification('语音聊天已关闭');
        console.log('❌ 语音聊天已关闭');
    }

    async addAudioTrackToPeer(playerNum) {
        if (!this.localStream) return;

        const pc = this.roomManager.peerConnections[playerNum];
        if (!pc) return;

        // 添加音频轨道
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (!audioTrack) return;

        try {
            // 检查是否已添加
            const senders = pc.getSenders();
            const audioSender = senders.find(s => s.track?.kind === 'audio');
            
            if (audioSender) {
                // 替换现有轨道
                await audioSender.replaceTrack(audioTrack);
                console.log(`替换 P${playerNum} 的音频轨道`);
            } else {
                // 添加新轨道
                pc.addTrack(audioTrack, this.localStream);
                console.log(`添加音频轨道到 P${playerNum}`);
            }

            this.audioTracks[playerNum] = audioTrack;

            // 设置接收远程音频
            this.setupRemoteAudio(playerNum, pc);

            // 重新协商（如果需要）
            if (this.roomManager.isHost) {
                await this.renegotiate(playerNum);
            }
        } catch (error) {
            console.error(`添加音频轨道到 P${playerNum} 失败:`, error);
        }
    }

    removeAudioTrackFromPeer(playerNum) {
        const pc = this.roomManager.peerConnections[playerNum];
        if (!pc) return;

        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        
        if (audioSender) {
            pc.removeTrack(audioSender);
            console.log(`移除 P${playerNum} 的音频轨道`);
        }

        delete this.audioTracks[playerNum];
    }

    setupRemoteAudio(playerNum, pc) {
        // 监听远程音频轨道
        pc.ontrack = (event) => {
            console.log(`收到 P${playerNum} 的音频轨道`);
            
            if (event.track.kind === 'audio') {
                // 创建或更新音频元素
                let audio = this.remoteAudios[playerNum];
                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    this.remoteAudios[playerNum] = audio;
                }
                
                audio.srcObject = event.streams[0];
                console.log(`✅ P${playerNum} 语音已连接`);
                this.showNotification(`P${playerNum} 加入语音聊天`);
            }
        };
    }

    removeRemoteAudio(playerNum) {
        const audio = this.remoteAudios[playerNum];
        if (audio) {
            audio.srcObject = null;
            audio.pause();
            delete this.remoteAudios[playerNum];
            console.log(`移除 P${playerNum} 的远程音频`);
        }
    }

    async renegotiate(playerNum) {
        const pc = this.roomManager.peerConnections[playerNum];
        if (!pc || pc.signalingState !== 'stable') return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.roomManager.sendWs({
                type: 'signal',
                toPlayer: playerNum,
                data: { type: 'offer', offer }
            });

            console.log(`重新协商 P${playerNum} 连接`);
        } catch (error) {
            console.error(`重新协商失败:`, error);
        }
    }

    toggleMute() {
        if (!this.isEnabled || !this.localStream) {
            this.showNotification('请先启用语音聊天', 'warning');
            return;
        }

        this.isMuted = !this.isMuted;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !this.isMuted;
        }

        this.updateUI();
        this.showNotification(this.isMuted ? '已静音' : '已取消静音');
        console.log(this.isMuted ? '🔇 已静音' : '🔊 已取消静音');
    }

    updateUI() {
        const toggleBtn = document.getElementById('toggle-voice-btn');
        const muteBtn = document.getElementById('mute-voice-btn');
        const voiceStatus = document.getElementById('voice-status');

        if (toggleBtn) {
            toggleBtn.textContent = this.isEnabled ? '🔊 关闭语音' : '🔇 开启语音';
            toggleBtn.classList.toggle('active', this.isEnabled);
        }

        if (muteBtn) {
            muteBtn.style.display = this.isEnabled ? 'inline-block' : 'none';
            muteBtn.textContent = this.isMuted ? '🔇 取消静音' : '🔊 静音';
            muteBtn.classList.toggle('muted', this.isMuted);
        }

        if (voiceStatus) {
            if (this.isEnabled) {
                voiceStatus.textContent = this.isMuted ? '已静音' : '语音开启';
                voiceStatus.className = this.isMuted ? 'muted' : 'active';
            } else {
                voiceStatus.textContent = '语音关闭';
                voiceStatus.className = '';
            }
        }
    }

    showNotification(message, type = 'info') {
        // 使用聊天系统显示通知
        const chatManager = window.app?.chatManager;
        if (chatManager) {
            chatManager.addSystemMessage(`[语音] ${message}`);
        } else {
            console.log(`[语音通知] ${message}`);
        }
    }

    cleanup() {
        this.disableVoice();
        this.initialized = false;
    }

    destroy() {
        this.cleanup();
    }
}
