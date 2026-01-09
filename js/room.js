// 房间管理器 - 支持4人房间
export class RoomManager {
    constructor() {
        this.roomCode = null;
        this.isHost = false;
        this.myPlayerNum = 0;
        this.peerConnections = {}; // {playerNum: RTCPeerConnection}
        this.dataChannels = {}; // {playerNum: RTCDataChannel}
        this.signalingWs = null;
        this.eventHandlers = {};
        
        // 延迟测量
        this.latencies = {}; // {playerNum: latency}
        this.pingTimestamps = {}; // {playerNum: timestamp}
        this.pingInterval = null;
        
        // 按键状态
        this.playerInputStates = {}; // {playerNum: {button: pressed}}
        
        this.signalingUrl = this.getSignalingUrl();
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
    }

    getSignalingUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'ws://localhost:3000/ws';
        }
        return `wss://${window.location.host}/api/signaling`;
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

    // ========== 创建房间 ==========
    async createRoom() {
        this.isHost = true;
        this.roomCode = this.generateRoomCode();
        this.myPlayerNum = 1;
        
        await this.connectSignaling();
        
        this.sendSignaling({
            type: 'create-room',
            roomCode: this.roomCode
        });
        
        return this.roomCode;
    }

    // ========== 加入房间 ==========
    async joinRoom(roomCode) {
        this.isHost = false;
        this.roomCode = roomCode.toUpperCase();
        
        await this.connectSignaling();
        
        return new Promise((resolve, reject) => {
            this.joinResolve = resolve;
            this.joinReject = reject;
            
            this.sendSignaling({
                type: 'join-room',
                roomCode: this.roomCode
            });
            
            setTimeout(() => {
                if (this.joinReject) {
                    this.joinReject(new Error('加入超时'));
                    this.joinReject = null;
                }
            }, 15000);
        });
    }

    // ========== 信令连接 ==========
    connectSignaling() {
        return new Promise((resolve, reject) => {
            try {
                this.signalingWs = new WebSocket(this.signalingUrl);
                
                this.signalingWs.onopen = () => {
                    console.log('信令服务器已连接');
                    resolve();
                };
                
                this.signalingWs.onmessage = (event) => {
                    this.handleSignalingMessage(JSON.parse(event.data));
                };
                
                this.signalingWs.onerror = (error) => {
                    console.error('信令错误:', error);
                    reject(error);
                };
                
                this.signalingWs.onclose = () => {
                    console.log('信令断开');
                    this.emit('disconnected');
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    sendSignaling(message) {
        if (this.signalingWs?.readyState === WebSocket.OPEN) {
            this.signalingWs.send(JSON.stringify(message));
        }
    }

    async handleSignalingMessage(message) {
        console.log('收到信令:', message.type);
        
        switch (message.type) {
            case 'room-created':
                console.log('房间创建成功');
                break;
                
            case 'join-success':
                this.myPlayerNum = message.playerNum;
                if (this.joinResolve) {
                    this.joinResolve({
                        playerNum: message.playerNum,
                        players: message.players
                    });
                    this.joinResolve = null;
                }
                // 与房主建立连接
                await this.setupPeerConnection(1);
                await this.createOffer(1);
                break;
                
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
                if (this.joinReject) {
                    this.joinReject(new Error(message.message));
                    this.joinReject = null;
                }
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
                this.sendSignaling({
                    type: 'ice-candidate',
                    roomCode: this.roomCode,
                    toPlayer: playerNum,
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
            console.log(`P${playerNum} 数据通道已打开, readyState: ${channel.readyState}`);
            this.emit('connected');
            // 开始延迟测量
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
        // 每2秒发送一次ping
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
        // 收到ping，回复pong
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
    
    // 获取玩家延迟
    getLatency(playerNum) {
        return this.latencies[playerNum] || null;
    }
    
    // 更新玩家按键状态
    updateInputState(playerNum, button, pressed) {
        if (!this.playerInputStates[playerNum]) {
            this.playerInputStates[playerNum] = {};
        }
        this.playerInputStates[playerNum][button] = pressed;
        this.emit('input-state-update', { player: playerNum, button, pressed });
    }
    
    // 获取玩家按键状态
    getInputState(playerNum) {
        return this.playerInputStates[playerNum] || {};
    }

    async createOffer(playerNum) {
        const pc = this.peerConnections[playerNum];
        if (!pc) return;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this.sendSignaling({
            type: 'offer',
            roomCode: this.roomCode,
            toPlayer: playerNum,
            offer: offer
        });
    }

    async handleOffer(fromPlayer, offer) {
        await this.setupPeerConnection(fromPlayer);
        const pc = this.peerConnections[fromPlayer];
        
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        this.sendSignaling({
            type: 'answer',
            roomCode: this.roomCode,
            toPlayer: fromPlayer,
            answer: answer
        });
    }

    async handleAnswer(fromPlayer, answer) {
        const pc = this.peerConnections[fromPlayer];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
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
        console.log('收到游戏消息:', data.type);
        
        switch (data.type) {
            case 'input':
                // 更新按键状态显示
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
                // 收到其他玩家的按键广播
                this.updateInputState(data.player, data.button, data.pressed);
                break;
        }

        // 房主转发消息给其他玩家（帧数据和ping/pong除外）
        if (this.isHost && data.type !== 'frame' && data.type !== 'ping' && data.type !== 'pong') {
            this.broadcast(data, data.fromPlayer);
        }
    }

    // ========== 发送消息 ==========
    send(data) {
        if (this.isHost) {
            // 房主发送给所有玩家
            this.broadcast(data);
        } else {
            // 客户端发送给房主
            const channel = this.dataChannels[1];
            if (channel?.readyState === 'open') {
                channel.send(JSON.stringify(data));
            }
        }
    }

    sendFrame(frameData) {
        if (!this.isHost) return;
        
        const data = JSON.stringify({ type: 'frame', frameData });
        let sentCount = 0;
        
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                try {
                    channel.send(data);
                    sentCount++;
                } catch (e) {
                    console.warn(`发送帧到P${playerNum}失败:`, e);
                }
            }
        }
        
        // 调试：每100帧输出一次状态
        if (!this._frameCount) this._frameCount = 0;
        this._frameCount++;
        if (this._frameCount % 100 === 0) {
            console.log(`已发送${this._frameCount}帧到${sentCount}个玩家`);
        }
    }

    broadcast(data, excludePlayer = null) {
        const msg = JSON.stringify(data);
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (parseInt(playerNum) !== excludePlayer && channel?.readyState === 'open') {
                try {
                    channel.send(msg);
                } catch (e) {
                    // 忽略
                }
            }
        }
    }

    disconnect() {
        // 停止ping测量
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        for (const playerNum of Object.keys(this.peerConnections)) {
            this.closePeerConnection(parseInt(playerNum));
        }
        if (this.signalingWs) {
            this.signalingWs.close();
        }
        
        // 清理状态
        this.latencies = {};
        this.pingTimestamps = {};
        this.playerInputStates = {};
    }
    
    // 广播本地玩家的按键状态给其他玩家
    broadcastInput(button, pressed) {
        const data = {
            type: 'input-broadcast',
            player: this.myPlayerNum,
            button,
            pressed
        };
        this.send(data);
        // 同时更新本地显示
        this.updateInputState(this.myPlayerNum, button, pressed);
    }
}
