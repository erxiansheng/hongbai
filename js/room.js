// 房间管理器 - 支持4人房间 (HTTP轮询版本)
export class RoomManager {
    constructor() {
        this.roomCode = null;
        this.isHost = false;
        this.myPlayerNum = 0;
        this.peerId = null;
        this.peerConnections = {}; // {playerNum: RTCPeerConnection}
        this.dataChannels = {}; // {playerNum: RTCDataChannel}
        this.eventHandlers = {};
        
        // HTTP轮询
        this.pollInterval = null;
        this.isPolling = false;
        
        // 延迟测量
        this.latencies = {};
        this.pingTimestamps = {};
        this.pingInterval = null;
        
        // 按键状态
        this.playerInputStates = {};
        
        this.signalingBaseUrl = this.getSignalingBaseUrl();
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    getSignalingBaseUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000/api/signaling';
        }
        return `${window.location.origin}/api/signaling`;
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
    }

    emit(event, data) {
        (this.eventHandlers[event] || []).forEach(h => h(data));
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // ========== HTTP信令 ==========
    async signalingRequest(endpoint, params = {}, method = 'GET', body = null) {
        let url = `${this.signalingBaseUrl}/${endpoint}`;
        if (Object.keys(params).length > 0) {
            url += '?' + new URLSearchParams(params).toString();
        }
        
        const options = { method };
        if (body) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        return await response.json();
    }

    // 开始轮询
    startPolling() {
        if (this.pollInterval) return;
        
        this.isPolling = true;
        this.pollInterval = setInterval(async () => {
            if (!this.isPolling || !this.roomCode || !this.myPlayerNum) return;
            
            try {
                const result = await this.signalingRequest('poll', {
                    room: this.roomCode,
                    player: this.myPlayerNum
                });
                
                if (result.messages && result.messages.length > 0) {
                    for (const msg of result.messages) {
                        await this.handleSignalingMessage(msg);
                    }
                }
            } catch (e) {
                console.warn('轮询失败:', e);
            }
        }, 500); // 每500ms轮询一次
    }

    stopPolling() {
        this.isPolling = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // 发送信令消息
    async sendSignaling(toPlayer, message) {
        try {
            await this.signalingRequest('send', {}, 'POST', {
                roomCode: this.roomCode,
                fromPlayer: this.myPlayerNum,
                toPlayer,
                message
            });
        } catch (e) {
            console.error('发送信令失败:', e);
        }
    }

    // ========== 创建房间 ==========
    async createRoom() {
        this.isHost = true;
        this.roomCode = this.generateRoomCode();
        
        const result = await this.signalingRequest('create', { room: this.roomCode });
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        this.peerId = result.peerId;
        this.myPlayerNum = result.playerNum;
        
        // 开始轮询
        this.startPolling();
        
        console.log('房间创建成功:', this.roomCode);
        return this.roomCode;
    }

    // ========== 加入房间 ==========
    async joinRoom(roomCode) {
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase();
        
        const result = await this.signalingRequest('join', { room: this.roomCode });
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        this.peerId = result.peerId;
        this.myPlayerNum = result.playerNum;
        
        // 开始轮询
        this.startPolling();
        
        // 与房主建立WebRTC连接
        await this.setupPeerConnection(1);
        await this.createOffer(1);
        
        return {
            playerNum: this.myPlayerNum,
            players: result.players
        };
    }

    // ========== 处理信令消息 ==========
    async handleSignalingMessage(message) {
        console.log('收到信令:', message.type, message);
        
        switch (message.type) {
            case 'player-joined':
                this.emit('player-joined', { playerNum: message.playerNum, name: message.name });
                // 房主与新玩家建立连接
                if (this.isHost) {
                    await this.setupPeerConnection(message.playerNum);
                }
                break;
                
            case 'player-left':
                this.emit('player-left', { playerNum: message.playerNum });
                this.closePeerConnection(message.playerNum);
                break;
                
            case 'offer':
                await this.handleOffer(message.fromPlayer, message.offer);
                break;
                
            case 'answer':
                await this.handleAnswer(message.fromPlayer, message.answer);
                break;
                
            case 'ice-candidate':
                await this.handleIceCandidate(message.fromPlayer, message.candidate);
                break;
                
            case 'error':
                console.error('信令错误:', message.message);
                this.emit('error', { message: message.message });
                break;
        }
    }

    // ========== WebRTC连接 ==========
    async setupPeerConnection(playerNum) {
        console.log(`设置与P${playerNum}的WebRTC连接...`);
        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections[playerNum] = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling(playerNum, {
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`P${playerNum} 连接状态:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.emit('connected');
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.emit('player-left', { playerNum });
            }
        };

        pc.ondatachannel = (event) => {
            console.log(`P${playerNum} 收到数据通道`);
            this.setupDataChannel(playerNum, event.channel);
        };

        // 如果是房主，创建数据通道
        if (this.isHost) {
            console.log(`房主创建到P${playerNum}的数据通道`);
            const channel = pc.createDataChannel('gameData', { ordered: true });
            this.setupDataChannel(playerNum, channel);
        }
    }

    setupDataChannel(playerNum, channel) {
        this.dataChannels[playerNum] = channel;
        
        channel.onopen = () => {
            console.log(`P${playerNum} 数据通道已打开`);
            this.emit('connected');
            this.startPingMeasurement(playerNum);
        };

        channel.onclose = () => {
            console.log(`P${playerNum} 数据通道已关闭`);
            this.stopPingMeasurement(playerNum);
        };

        channel.onerror = (error) => {
            console.error(`P${playerNum} 数据通道错误:`, error);
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                data.fromPlayer = playerNum;
                this.handleGameMessage(data);
            } catch (e) {
                console.error('消息解析错误:', e);
            }
        };
    }
    
    // 延迟测量
    startPingMeasurement(playerNum) {
        if (!this.pingInterval) {
            this.pingInterval = setInterval(() => {
                this.sendPingToAll();
            }, 2000);
        }
    }
    
    stopPingMeasurement(playerNum) {
        delete this.latencies[playerNum];
        delete this.pingTimestamps[playerNum];
        this.emit('latency-update', { player: playerNum, latency: null });
    }
    
    sendPingToAll() {
        const timestamp = Date.now();
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                this.pingTimestamps[playerNum] = timestamp;
                try {
                    channel.send(JSON.stringify({ type: 'ping', timestamp }));
                } catch (e) {}
            }
        }
    }
    
    handlePing(fromPlayer, timestamp) {
        const channel = this.dataChannels[fromPlayer] || this.dataChannels[1];
        if (channel?.readyState === 'open') {
            try {
                channel.send(JSON.stringify({ type: 'pong', timestamp, fromPlayer: this.myPlayerNum }));
            } catch (e) {}
        }
    }
    
    handlePong(fromPlayer, timestamp) {
        const now = Date.now();
        const latency = Math.round((now - timestamp) / 2);
        this.latencies[fromPlayer] = latency;
        this.emit('latency-update', { player: fromPlayer, latency });
    }
    
    getLatency(playerNum) {
        return this.latencies[playerNum] || null;
    }
    
    updateInputState(playerNum, button, pressed) {
        if (!this.playerInputStates[playerNum]) {
            this.playerInputStates[playerNum] = {};
        }
        this.playerInputStates[playerNum][button] = pressed;
        this.emit('input-state-update', { player: playerNum, button, pressed });
    }
    
    getInputState(playerNum) {
        return this.playerInputStates[playerNum] || {};
    }

    async createOffer(playerNum) {
        const pc = this.peerConnections[playerNum];
        if (!pc) return;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        await this.sendSignaling(playerNum, {
            type: 'offer',
            offer: offer
        });
    }

    async handleOffer(fromPlayer, offer) {
        // 检查是否已有连接
        let pc = this.peerConnections[fromPlayer];
        
        if (pc) {
            // 如果连接已存在且不是 stable 状态，可能是重复的 offer
            if (pc.signalingState !== 'stable') {
                console.warn(`P${fromPlayer} 连接状态: ${pc.signalingState}，忽略重复offer`);
                return;
            }
        } else {
            await this.setupPeerConnection(fromPlayer);
            pc = this.peerConnections[fromPlayer];
        }
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            await this.sendSignaling(fromPlayer, {
                type: 'answer',
                answer: answer
            });
            console.log(`已回复P${fromPlayer}的offer`);
        } catch (e) {
            console.error(`处理P${fromPlayer}的offer失败:`, e);
        }
    }

    async handleAnswer(fromPlayer, answer) {
        const pc = this.peerConnections[fromPlayer];
        if (!pc) {
            console.warn(`收到P${fromPlayer}的answer但没有对应的连接`);
            return;
        }
        
        // 检查连接状态，只有在 have-local-offer 状态才能设置 remote answer
        if (pc.signalingState !== 'have-local-offer') {
            console.warn(`P${fromPlayer} 连接状态不正确: ${pc.signalingState}，忽略answer`);
            return;
        }
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`P${fromPlayer} answer已设置`);
        } catch (e) {
            console.error(`设置P${fromPlayer}的answer失败:`, e);
        }
    }

    async handleIceCandidate(fromPlayer, candidate) {
        const pc = this.peerConnections[fromPlayer];
        if (pc && candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.warn('添加ICE候选失败:', e);
            }
        }
    }

    closePeerConnection(playerNum) {
        if (this.dataChannels[playerNum]) {
            this.dataChannels[playerNum].close();
            delete this.dataChannels[playerNum];
        }
        if (this.peerConnections[playerNum]) {
            this.peerConnections[playerNum].close();
            delete this.peerConnections[playerNum];
        }
    }

    // ========== 消息处理 ==========
    handleGameMessage(data) {
        switch (data.type) {
            case 'input':
                this.updateInputState(data.player || data.fromPlayer, data.button, data.pressed);
                this.emit('input', data);
                break;
            case 'game-start':
                this.emit('game-start', data);
                break;
            case 'frame':
                this.emit('frame', data.frameData);
                break;
            case 'pause':
                this.emit('pause', data);
                break;
            case 'reset':
                this.emit('reset', data);
                break;
            case 'chat':
                this.emit('chat', data);
                break;
            case 'voice-data':
                this.emit('voice-data', data);
                break;
            case 'ping':
                this.handlePing(data.fromPlayer, data.timestamp);
                break;
            case 'pong':
                this.handlePong(data.fromPlayer, data.timestamp);
                break;
            case 'input-broadcast':
                this.updateInputState(data.player, data.button, data.pressed);
                break;
        }

        if (this.isHost && data.type !== 'frame' && data.type !== 'ping' && data.type !== 'pong') {
            this.broadcast(data, data.fromPlayer);
        }
    }

    // ========== 发送消息 ==========
    send(data) {
        if (this.isHost) {
            this.broadcast(data);
        } else {
            const channel = this.dataChannels[1];
            if (channel?.readyState === 'open') {
                channel.send(JSON.stringify(data));
            }
        }
    }

    sendFrame(frameData) {
        if (!this.isHost) return;
        
        const data = JSON.stringify({ type: 'frame', frameData });
        
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                try {
                    channel.send(data);
                } catch (e) {
                    console.warn(`发送帧到P${playerNum}失败:`, e);
                }
            }
        }
    }

    broadcast(data, excludePlayer = null) {
        const msg = JSON.stringify(data);
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (parseInt(playerNum) !== excludePlayer && channel?.readyState === 'open') {
                try {
                    channel.send(msg);
                } catch (e) {}
            }
        }
    }

    async disconnect() {
        // 通知服务器离开
        if (this.roomCode && this.myPlayerNum) {
            try {
                await this.signalingRequest('leave', {
                    room: this.roomCode,
                    player: this.myPlayerNum
                });
            } catch (e) {}
        }
        
        // 停止轮询
        this.stopPolling();
        
        // 停止ping测量
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // 关闭所有连接
        for (const playerNum of Object.keys(this.peerConnections)) {
            this.closePeerConnection(parseInt(playerNum));
        }
        
        this.latencies = {};
        this.pingTimestamps = {};
        this.playerInputStates = {};
        this.roomCode = null;
        this.myPlayerNum = 0;
    }
    
    broadcastInput(button, pressed) {
        const data = {
            type: 'input-broadcast',
            player: this.myPlayerNum,
            button,
            pressed
        };
        this.send(data);
        this.updateInputState(this.myPlayerNum, button, pressed);
    }
}
