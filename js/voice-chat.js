// 语音聊天管理器 - 优化版（支持多人语音通话）
export class VoiceChatManager {
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.localStream = null;
        this.audioTracks = {}; // {playerNum: MediaStreamTrack}
        this.remoteAudios = {}; // {playerNum: HTMLAudioElement}
        this.isMuted = false;
        this.isEnabled = false;
        this.initialized = false;
        
        // 呼叫状态
        this.callState = 'idle'; // idle, calling, ringing, connected
        this.callInitiator = null; // 发起呼叫的玩家
        this.connectedPeers = new Set(); // 已连接语音的玩家集合
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
        const acceptBtn = document.getElementById('accept-call-btn');
        const rejectBtn = document.getElementById('reject-call-btn');
        const hangupBtn = document.getElementById('hangup-call-btn');

        toggleBtn?.addEventListener('click', () => this.initiateCall());
        muteBtn?.addEventListener('click', () => this.toggleMute());
        acceptBtn?.addEventListener('click', () => this.acceptCall());
        rejectBtn?.addEventListener('click', () => this.rejectCall());
        hangupBtn?.addEventListener('click', () => this.hangupCall());
    }

    setupRoomEvents() {
        // 监听 P2P 连接建立
        this.roomManager.on('peer-connected', async (data) => {
            console.log(`P${data.playerNum} P2P连接建立`);
        });

        // 监听玩家离开
        this.roomManager.on('player-left', (data) => {
            this.removeRemoteAudio(data.playerNum);
            // 如果正在通话的玩家离开，挂断
            if (this.isEnabled) {
                this.hangupCall();
            }
        });

        // 监听房间关闭
        this.roomManager.on('room-closed', () => {
            this.cleanup();
        });
        
        // 监听语音呼叫消息
        this.roomManager.on('voice-call', (data) => this.handleVoiceCall(data));
        this.roomManager.on('voice-accept', (data) => this.handleVoiceAccept(data));
        this.roomManager.on('voice-reject', (data) => this.handleVoiceReject(data));
        this.roomManager.on('voice-hangup', (data) => this.handleVoiceHangup(data));
    }

    // 发起呼叫
    async initiateCall() {
        if (this.isEnabled) {
            // 如果已经在通话中，挂断
            this.hangupCall();
            return;
        }

        // 检查是否有其他玩家
        const availablePeers = Object.keys(this.roomManager.peerConnections).filter(playerNum => {
            const pc = this.roomManager.peerConnections[playerNum];
            return pc && pc.connectionState === 'connected';
        });
        
        if (availablePeers.length === 0) {
            this.showNotification('没有其他玩家在线', 'warning');
            return;
        }

        try {
            // 请求麦克风权限
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.callState = 'calling';
            
            // 广播呼叫请求给所有在线玩家
            this.roomManager.send({
                type: 'voice-call',
                from: this.roomManager.myPlayerNum
            });

            const playerList = availablePeers.map(p => `P${p}`).join(', ');
            this.showCallNotification('calling', `正在呼叫 ${playerList}...`);
            this.showNotification(`正在呼叫 ${playerList}...`);
            
            console.log(`📞 发起群组呼叫: ${playerList}`);
        } catch (error) {
            console.error('无法访问麦克风:', error);
            this.showNotification('无法访问麦克风，请检查权限设置', 'error');
            this.callState = 'idle';
        }
    }

    // 处理收到的呼叫
    handleVoiceCall(data) {
        if (this.isEnabled || this.callState !== 'idle') {
            // 已经在通话中，自动拒绝
            this.roomManager.send({
                type: 'voice-reject',
                to: data.from,
                reason: 'busy'
            });
            return;
        }

        this.callState = 'ringing';
        this.callInitiator = data.from;
        
        this.showCallNotification('ringing', `P${data.from} 邀请你语音通话`);
        this.showNotification(`P${data.from} 邀请你语音通话`);
        
        console.log(`📞 收到 P${data.from} 的呼叫`);
    }

    // 接听呼叫
    async acceptCall() {
        if (this.callState !== 'ringing') return;

        try {
            // 请求麦克风权限
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // 发送接受消息（广播给所有人）
            this.roomManager.send({
                type: 'voice-accept',
                from: this.roomManager.myPlayerNum
            });

            this.callState = 'connected';
            this.isEnabled = true;
            
            // 添加音频轨道到发起者
            await this.addAudioTrackToPeer(this.callInitiator);
            this.connectedPeers.add(this.callInitiator);
            
            // 添加音频轨道到所有已接听的玩家
            for (const playerNum of Object.keys(this.roomManager.peerConnections)) {
                const num = parseInt(playerNum);
                if (num !== this.callInitiator && this.connectedPeers.has(num)) {
                    await this.addAudioTrackToPeer(num);
                }
            }
            
            this.hideCallNotification();
            this.updateUI();
            this.showNotification('已加入语音通话');
            
            console.log(`✅ 接听呼叫，加入群组通话`);
        } catch (error) {
            console.error('接听失败:', error);
            this.showNotification('无法访问麦克风', 'error');
            this.rejectCall();
        }
    }

    // 拒绝呼叫
    rejectCall() {
        if (this.callState !== 'ringing') return;

        this.roomManager.send({
            type: 'voice-reject',
            from: this.roomManager.myPlayerNum,
            reason: 'declined'
        });

        this.callState = 'idle';
        this.callInitiator = null;
        
        this.hideCallNotification();
        this.showNotification('已拒绝呼叫');
        
        console.log('❌ 拒绝呼叫');
    }

    // 处理接受消息
    async handleVoiceAccept(data) {
        const acceptedPlayer = data.from;
        
        // 如果是发起者，记录接听的玩家
        if (this.callState === 'calling' || this.callState === 'connected') {
            this.connectedPeers.add(acceptedPlayer);
            
            if (this.callState === 'calling') {
                this.callState = 'connected';
                this.isEnabled = true;
                this.hideCallNotification();
                this.updateUI();
            }
            
            // 添加音频轨道
            await this.addAudioTrackToPeer(acceptedPlayer);
            
            this.showNotification(`P${acceptedPlayer} 加入了语音通话`);
            console.log(`✅ P${acceptedPlayer} 接听了呼叫`);
        }
        // 如果自己也已接听，与新接听的玩家建立连接
        else if (this.isEnabled) {
            this.connectedPeers.add(acceptedPlayer);
            await this.addAudioTrackToPeer(acceptedPlayer);
            this.showNotification(`P${acceptedPlayer} 加入了语音通话`);
            console.log(`✅ P${acceptedPlayer} 加入了通话`);
        }
    }

    // 处理拒绝消息
    handleVoiceReject(data) {
        const rejectedPlayer = data.from;
        const reason = data.reason === 'busy' ? '正在通话中' : '拒绝了呼叫';
        
        // 只在呼叫阶段显示拒绝消息
        if (this.callState === 'calling') {
            this.showNotification(`P${rejectedPlayer} ${reason}`);
            console.log(`❌ P${rejectedPlayer} ${reason}`);
            
            // 如果所有人都拒绝了，结束呼叫
            // 这里简化处理：只要有人接听就继续
        }
    }

    // 挂断呼叫
    hangupCall() {
        if (!this.isEnabled && this.callState === 'idle') return;

        // 广播挂断消息给所有人
        if (this.callState === 'connected') {
            this.roomManager.send({
                type: 'voice-hangup',
                from: this.roomManager.myPlayerNum
            });
        } else if (this.callState === 'calling') {
            // 取消呼叫
            this.roomManager.send({
                type: 'voice-reject',
                from: this.roomManager.myPlayerNum,
                reason: 'cancelled'
            });
        }

        this.disableVoice();
        this.hideCallNotification();
        this.showNotification('语音通话已结束');
        
        console.log('📴 挂断呼叫');
    }

    // 处理挂断消息
    handleVoiceHangup(data) {
        const hangupPlayer = data.from;
        
        // 移除该玩家的音频
        this.removeRemoteAudio(hangupPlayer);
        this.connectedPeers.delete(hangupPlayer);
        
        this.showNotification(`P${hangupPlayer} 离开了语音通话`);
        
        // 如果是发起者挂断，或者没有其他人在通话了，结束通话
        if (hangupPlayer === this.callInitiator || this.connectedPeers.size === 0) {
            this.disableVoice();
            this.hideCallNotification();
            this.showNotification('语音通话已结束');
        }
        
        console.log(`📴 P${hangupPlayer} 挂断了呼叫`);
    }

    disableVoice() {
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
        this.callState = 'idle';
        this.callInitiator = null;
        this.connectedPeers.clear();
        
        this.updateUI();
    }

    async addAudioTrackToPeer(playerNum) {
        if (!this.localStream) return;

        const pc = this.roomManager.peerConnections[playerNum];
        if (!pc) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (!audioTrack) return;

        try {
            const senders = pc.getSenders();
            const audioSender = senders.find(s => s.track?.kind === 'audio');
            
            if (audioSender) {
                await audioSender.replaceTrack(audioTrack);
                console.log(`替换 P${playerNum} 的音频轨道`);
            } else {
                pc.addTrack(audioTrack, this.localStream);
                console.log(`添加音频轨道到 P${playerNum}`);
            }

            this.audioTracks[playerNum] = audioTrack;
            this.setupRemoteAudio(playerNum, pc);

            if (this.roomManager.isHost) {
                await this.renegotiate(playerNum);
            }
        } catch (error) {
            console.error(`添加音频轨道失败:`, error);
        }
    }

    removeAudioTrackFromPeer(playerNum) {
        const pc = this.roomManager.peerConnections[playerNum];
        if (!pc) return;

        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === 'audio');
        
        if (audioSender) {
            pc.removeTrack(audioSender);
        }

        delete this.audioTracks[playerNum];
    }

    setupRemoteAudio(playerNum, pc) {
        pc.ontrack = (event) => {
            if (event.track.kind === 'audio') {
                let audio = this.remoteAudios[playerNum];
                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    this.remoteAudios[playerNum] = audio;
                }
                
                audio.srcObject = event.streams[0];
                console.log(`✅ P${playerNum} 语音已连接`);
            }
        };
    }

    removeRemoteAudio(playerNum) {
        const audio = this.remoteAudios[playerNum];
        if (audio) {
            audio.srcObject = null;
            audio.pause();
            delete this.remoteAudios[playerNum];
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
        } catch (error) {
            console.error(`重新协商失败:`, error);
        }
    }

    toggleMute() {
        if (!this.isEnabled || !this.localStream) {
            this.showNotification('请先连接语音通话', 'warning');
            return;
        }

        this.isMuted = !this.isMuted;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !this.isMuted;
        }

        this.updateUI();
        this.showNotification(this.isMuted ? '已静音' : '已取消静音');
    }

    showCallNotification(state, message) {
        const notification = document.getElementById('voice-call-notification');
        const title = document.getElementById('call-title');
        const subtitle = document.getElementById('call-subtitle');
        const acceptBtn = document.getElementById('accept-call-btn');
        const rejectBtn = document.getElementById('reject-call-btn');
        const hangupBtn = document.getElementById('hangup-call-btn');

        if (!notification) return;

        notification.classList.remove('hidden');
        
        if (state === 'calling') {
            title.textContent = '语音呼叫';
            subtitle.textContent = message;
            acceptBtn.style.display = 'none';
            rejectBtn.style.display = 'none';
            hangupBtn.style.display = 'inline-block';
        } else if (state === 'ringing') {
            title.textContent = '来电';
            subtitle.textContent = message;
            acceptBtn.style.display = 'inline-block';
            rejectBtn.style.display = 'inline-block';
            hangupBtn.style.display = 'none';
        }
    }

    hideCallNotification() {
        const notification = document.getElementById('voice-call-notification');
        if (notification) {
            notification.classList.add('hidden');
        }
    }

    updateUI() {
        const toggleBtn = document.getElementById('toggle-voice-btn');
        const muteBtn = document.getElementById('mute-voice-btn');
        const voiceStatus = document.getElementById('voice-status');

        if (toggleBtn) {
            toggleBtn.textContent = this.isEnabled ? '📴 挂断' : '📞 语音通话';
            toggleBtn.classList.toggle('active', this.isEnabled);
        }

        if (muteBtn) {
            muteBtn.style.display = this.isEnabled ? 'inline-block' : 'none';
            muteBtn.textContent = this.isMuted ? '🔇 取消静音' : '🔊 静音';
            muteBtn.classList.toggle('muted', this.isMuted);
        }

        if (voiceStatus) {
            if (this.isEnabled) {
                const participantCount = this.connectedPeers.size + 1; // +1 包括自己
                const statusText = this.isMuted ? '已静音' : `通话中 (${participantCount}人)`;
                voiceStatus.textContent = statusText;
                voiceStatus.className = 'voice-status ' + (this.isMuted ? 'muted' : 'active');
            } else {
                voiceStatus.textContent = '';
                voiceStatus.className = 'voice-status';
            }
        }
    }

    showNotification(message, type = 'info') {
        const chatManager = window.app?.chatManager;
        if (chatManager) {
            chatManager.addSystemMessage(`[语音] ${message}`);
        }
    }

    cleanup() {
        this.disableVoice();
        this.hideCallNotification();
        this.initialized = false;
    }

    destroy() {
        this.cleanup();
    }
}
