// 房间管理器 - WebSocket + WebRTC P2P 实时版本

// 默认服务器配置
const DEFAULT_WS_PORT = 8765;

export class RoomManager {
    constructor() {
        this.roomCode = null;
        this.isHost = false;
        this.myPlayerNum = 0;
        this.peerId = null;
        this.peerConnections = {}; // {playerNum: RTCPeerConnection}
        this.dataChannels = {}; // {playerNum: RTCDataChannel}
        this.eventHandlers = {};

        // WebSocket 连接
        this.ws = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimer = null;

        // 延迟测量
        this.latencies = {};
        this.pingTimestamps = {};
        this.pingInterval = null;

        // 按键状态
        this.playerInputStates = {};

        // 配置
        this.wsUrl = this.getWebSocketUrl();
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];
    }

    getWebSocketUrl() {
        // 优先级：
        // 1. URL 参数 ?server=ws://xxx
        // 2. localStorage 中保存的自定义服务器
        // 3. 默认配置
        
        const params = new URLSearchParams(window.location.search);
        const urlServer = params.get('server');
        if (urlServer) {
            console.log('使用 URL 参数指定的服务器:', urlServer);
            return urlServer;
        }
        
        // 检查 localStorage 中的自定义服务器配置
        const customServer = localStorage.getItem('customSignalingServer');
        if (customServer && customServer.trim()) {
            console.log('使用自定义服务器:', customServer);
            return customServer.trim();
        }

        // 本地开发
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `ws://localhost:${DEFAULT_WS_PORT}`;
        }

        // 生产环境 - 使用固定的信令服务器
        return 'wss://jiejiserver.188np.cn';
    }
    
    // 设置自定义服务器地址
    static setCustomServer(serverUrl) {
        if (serverUrl && serverUrl.trim()) {
            localStorage.setItem('customSignalingServer', serverUrl.trim());
            console.log('已保存自定义服务器:', serverUrl);
        } else {
            localStorage.removeItem('customSignalingServer');
            console.log('已清除自定义服务器配置');
        }
    }
    
    // 获取当前服务器配置
    static getServerConfig() {
        const customServer = localStorage.getItem('customSignalingServer');
        return {
            customServer: customServer || '',
            isCustom: !!customServer
        };
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
    }

    off(event, handler) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }

    emit(event, data) {
        (this.eventHandlers[event] || []).forEach(h => {
            try {
                h(data);
            } catch (e) {
                console.error(`事件处理错误 [${event}]:`, e);
            }
        });
    }

    // ========== WebSocket 连接 ==========
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            console.log('连接信令服务器:', this.wsUrl);

            try {
                this.ws = new WebSocket(this.wsUrl);
            } catch (e) {
                reject(new Error('无法创建 WebSocket 连接: ' + e.message));
                return;
            }

            const timeout = setTimeout(() => {
                this.ws?.close();
                reject(new Error('连接超时，请检查信令服务器是否启动'));
            }, 5000);

            this.ws.onopen = () => {
                clearTimeout(timeout);
                console.log('✅ 信令服务器已连接');
                this.wsReconnectAttempts = 0;
                resolve();
            };

            this.ws.onclose = (event) => {
                clearTimeout(timeout);
                console.log('WebSocket 断开:', event.code, event.reason);
                this.handleWsDisconnect();
            };

            this.ws.onerror = (error) => {
                clearTimeout(timeout);
                console.error('WebSocket 错误:', error);
                reject(new Error('连接失败，请确保信令服务器已启动 (运行 start-server.bat)'));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('🔄 收到原始消息:', data);
                    this.handleWsMessage(data);
                } catch (e) {
                    console.error('消息解析错误:', e, '原始消息:', event.data);
                }
            };
        });
    }

    handleWsDisconnect() {
        // 清理重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // 如果还在房间中，尝试重连
        if (this.roomCode && this.wsReconnectAttempts < this.maxReconnectAttempts) {
            this.wsReconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts - 1), 10000);
            console.log(`${delay / 1000}秒后尝试重连 (${this.wsReconnectAttempts}/${this.maxReconnectAttempts})...`);

            this.reconnectTimer = setTimeout(async () => {
                try {
                    await this.connectWebSocket();
                    // 重连后重新加入房间
                    if (this.isHost) {
                        this.sendWs({ type: 'rejoin', roomCode: this.roomCode, playerNum: 1 });
                    } else {
                        this.sendWs({ type: 'rejoin', roomCode: this.roomCode, playerNum: this.myPlayerNum });
                    }
                } catch (e) {
                    console.error('重连失败:', e);
                }
            }, delay);
        } else if (this.roomCode) {
            this.emit('error', { message: '与服务器断开连接，请刷新页面重试' });
        }
    }

    sendWs(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            console.log('📤 发送消息:', data);
            this.ws.send(JSON.stringify(data));
            return true;
        }
        console.warn('WebSocket 未连接，无法发送:', data.type);
        return false;
    }

    // ========== 处理 WebSocket 消息 ==========
    async handleWsMessage(data) {
        console.log('收到信令:', data.type, data);

        switch (data.type) {
            case 'created':
                this.roomCode = data.roomCode;
                this.myPlayerNum = data.playerNum;
                this.peerId = data.peerId;
                this.emit('room-created', { roomCode: data.roomCode });
                
                // 解析 createRoom Promise
                if (this.createRoomPromise) {
                    this.createRoomPromise.resolve(this.roomCode);
                    this.createRoomPromise = null;
                }
                break;

            case 'joined':
                this.roomCode = data.roomCode;
                this.myPlayerNum = data.playerNum;
                this.peerId = data.peerId;
                // 通知已有玩家
                if (data.players) {
                    for (const p of data.players) {
                        if (p.playerNum !== this.myPlayerNum) {
                            this.emit('player-joined', { playerNum: p.playerNum, name: p.name });
                        }
                    }
                }
                
                // 解析 joinRoom Promise
                if (this.joinRoomPromise) {
                    this.joinRoomPromise.resolve({
                        playerNum: this.myPlayerNum,
                        players: data.players
                    });
                    this.joinRoomPromise = null;
                }
                break;

            case 'player-joined':
                console.log(`玩家 P${data.playerNum} 加入房间`);
                this.emit('player-joined', { playerNum: data.playerNum, name: data.name });
                // 房主与新玩家建立 WebRTC 连接
                if (this.isHost) {
                    await this.setupPeerConnection(data.playerNum);
                    await this.createOffer(data.playerNum);
                }
                break;

            case 'player-left':
                console.log(`玩家 P${data.playerNum} 离开房间`);
                this.emit('player-left', { playerNum: data.playerNum });
                this.closePeerConnection(data.playerNum);
                break;

            case 'signal':
                await this.handleSignal(data.fromPlayer, data.data);
                break;

            case 'room-closed':
                console.log('房间已关闭:', data.message);
                this.emit('room-closed', { message: data.message || '房间已关闭' });
                this.cleanup();
                break;

            case 'rejoined':
                console.log('重新加入房间成功');
                this.emit('reconnected');
                break;

            case 'error':
                console.error('服务器错误:', data.message);
                this.emit('error', { message: data.message });
                
                // 解析失败的 Promise
                if (this.createRoomPromise) {
                    this.createRoomPromise.reject(new Error(data.message));
                    this.createRoomPromise = null;
                }
                if (this.joinRoomPromise) {
                    this.joinRoomPromise.reject(new Error(data.message));
                    this.joinRoomPromise = null;
                }
                break;
        }
    }

    async handleSignal(fromPlayer, signalData) {
        console.log(`收到 P${fromPlayer} 的信令:`, signalData.type);

        switch (signalData.type) {
            case 'offer':
                await this.handleOffer(fromPlayer, signalData.offer);
                break;
            case 'answer':
                await this.handleAnswer(fromPlayer, signalData.answer);
                break;
            case 'ice-candidate':
                await this.handleIceCandidate(fromPlayer, signalData.candidate);
                break;
        }
    }

    // ========== 创建房间 ==========
    async createRoom() {
        this.isHost = true;
        
        try {
            await this.connectWebSocket();
        } catch (error) {
            throw new Error('无法连接信令服务器: ' + error.message);
        }

        // 设置 Promise 解析器
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('❌ 创建房间超时，未收到服务器响应');
                reject(new Error('创建房间超时，请检查服务器是否正常运行'));
            }, 10000); // 增加到 10 秒

            this.createRoomPromise = {
                resolve: (roomCode) => {
                    clearTimeout(timeout);
                    resolve(roomCode);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            };

            // 发送创建房间请求
            const sent = this.sendWs({ type: 'create' });
            if (!sent) {
                clearTimeout(timeout);
                reject(new Error('发送创建房间请求失败'));
            }
        });
    }

    // ========== 加入房间 ==========
    async joinRoom(roomCode) {
        this.isHost = false;
        await this.connectWebSocket();

        // 设置 Promise 解析器
        this.joinRoomPromise = {};
        const promise = new Promise((resolve, reject) => {
            this.joinRoomPromise.resolve = resolve;
            this.joinRoomPromise.reject = reject;
            
            // 5秒超时
            setTimeout(() => {
                if (this.joinRoomPromise) {
                    this.joinRoomPromise.reject(new Error('加入房间超时'));
                    this.joinRoomPromise = null;
                }
            }, 5000);
        });

        this.sendWs({ type: 'join', roomCode: roomCode.toUpperCase() });
        return promise;
    }

    // ========== WebRTC P2P 连接 ==========
    async setupPeerConnection(playerNum) {
        console.log(`建立与 P${playerNum} 的 P2P 连接...`);

        // 如果已有连接，先关闭
        if (this.peerConnections[playerNum]) {
            this.closePeerConnection(playerNum);
        }

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.peerConnections[playerNum] = pc;

        // ICE 候选
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendWs({
                    type: 'signal',
                    toPlayer: playerNum,
                    data: {
                        type: 'ice-candidate',
                        candidate: event.candidate
                    }
                });
            }
        };

        // 连接状态变化
        pc.onconnectionstatechange = () => {
            console.log(`P${playerNum} 连接状态:`, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.emit('peer-connected', { playerNum });
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.emit('peer-disconnected', { playerNum });
            }
        };

        // ICE 连接状态
        pc.oniceconnectionstatechange = () => {
            console.log(`P${playerNum} ICE状态:`, pc.iceConnectionState);
        };

        // 接收数据通道
        pc.ondatachannel = (event) => {
            console.log(`P${playerNum} 收到数据通道`);
            this.setupDataChannel(playerNum, event.channel);
        };

        // 房主创建数据通道
        if (this.isHost) {
            console.log(`创建到 P${playerNum} 的数据通道`);
            const channel = pc.createDataChannel('gameData', {
                ordered: true,
                maxRetransmits: 3
            });
            this.setupDataChannel(playerNum, channel);
        }
    }

    setupDataChannel(playerNum, channel) {
        console.log(`配置 P${playerNum} 数据通道，状态: ${channel.readyState}`);
        this.dataChannels[playerNum] = channel;

        channel.onopen = () => {
            console.log(`✅ P${playerNum} 数据通道已打开`);
            this.emit('connected', { playerNum });
            this.startPingMeasurement(playerNum);
        };

        channel.onclose = () => {
            console.log(`❌ P${playerNum} 数据通道已关闭`);
            this.stopPingMeasurement(playerNum);
            this.emit('channel-closed', { playerNum });
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
                console.error('游戏消息解析错误:', e);
            }
        };
    }

    async createOffer(playerNum) {
        const pc = this.peerConnections[playerNum];
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.sendWs({
                type: 'signal',
                toPlayer: playerNum,
                data: { type: 'offer', offer }
            });
        } catch (e) {
            console.error(`创建 offer 失败:`, e);
        }
    }

    async handleOffer(fromPlayer, offer) {
        let pc = this.peerConnections[fromPlayer];

        if (!pc) {
            await this.setupPeerConnection(fromPlayer);
            pc = this.peerConnections[fromPlayer];
        }

        if (pc.signalingState !== 'stable') {
            console.warn(`P${fromPlayer} 状态: ${pc.signalingState}，忽略 offer`);
            return;
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.sendWs({
                type: 'signal',
                toPlayer: fromPlayer,
                data: { type: 'answer', answer }
            });
            console.log(`已回复 P${fromPlayer} 的 offer`);
        } catch (e) {
            console.error(`处理 P${fromPlayer} offer 失败:`, e);
        }
    }

    async handleAnswer(fromPlayer, answer) {
        const pc = this.peerConnections[fromPlayer];
        if (!pc) return;

        if (pc.signalingState !== 'have-local-offer') {
            console.warn(`P${fromPlayer} 状态不正确: ${pc.signalingState}`);
            return;
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`P${fromPlayer} answer 已设置`);
        } catch (e) {
            console.error(`设置 P${fromPlayer} answer 失败:`, e);
        }
    }

    async handleIceCandidate(fromPlayer, candidate) {
        const pc = this.peerConnections[fromPlayer];
        if (pc && candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                // ICE 候选添加失败通常不是致命错误
                console.debug('添加 ICE 候选:', e.message);
            }
        }
    }

    closePeerConnection(playerNum) {
        if (this.dataChannels[playerNum]) {
            try {
                this.dataChannels[playerNum].close();
            } catch (e) { }
            delete this.dataChannels[playerNum];
        }
        if (this.peerConnections[playerNum]) {
            try {
                this.peerConnections[playerNum].close();
            } catch (e) { }
            delete this.peerConnections[playerNum];
        }
        this.stopPingMeasurement(playerNum);
    }

    // ========== 延迟测量 ==========
    startPingMeasurement(playerNum) {
        if (!this.pingInterval) {
            this.pingInterval = setInterval(() => this.sendPingToAll(), 2000);
        }
    }

    stopPingMeasurement(playerNum) {
        delete this.latencies[playerNum];
        delete this.pingTimestamps[playerNum];
        this.emit('latency-update', { player: playerNum, latency: null });

        // 如果没有活跃连接，停止 ping
        if (Object.keys(this.dataChannels).length === 0 && this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    sendPingToAll() {
        const timestamp = Date.now();
        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                this.pingTimestamps[playerNum] = timestamp;
                try {
                    channel.send(JSON.stringify({ type: 'ping', timestamp }));
                } catch (e) { }
            }
        }
    }

    handlePing(fromPlayer, timestamp) {
        const channel = this.dataChannels[fromPlayer] || this.dataChannels[1];
        if (channel?.readyState === 'open') {
            try {
                channel.send(JSON.stringify({
                    type: 'pong',
                    timestamp,
                    fromPlayer: this.myPlayerNum
                }));
            } catch (e) { }
        }
    }

    handlePong(fromPlayer, timestamp) {
        const latency = Math.round((Date.now() - timestamp) / 2);
        this.latencies[fromPlayer] = latency;
        this.emit('latency-update', { player: fromPlayer, latency });
    }

    getLatency(playerNum) {
        return this.latencies[playerNum] || null;
    }

    // ========== 输入状态 ==========
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

    // ========== 游戏消息处理 ==========
    handleGameMessage(data) {
        switch (data.type) {
            case 'input':
                // 保留 fromPlayer 信息，用于远程输入映射
                // 远程玩家使用自己的P1键位，但 fromPlayer 标识了实际的玩家编号
                const inputData = {
                    ...data,
                    fromPlayer: data.fromPlayer  // 确保 fromPlayer 被传递
                };
                // 使用 fromPlayer 作为实际玩家编号更新输入状态
                const actualPlayerNum = data.fromPlayer || data.player;
                this.updateInputState(actualPlayerNum, data.button, data.pressed);
                this.emit('input', inputData);
                break;
            case 'game-start':
                console.log('收到 game-start');
                this.emit('game-start', data);
                break;
            case 'game-ready':
                console.log('收到 game-ready from P' + data.playerNum);
                this.emit('game-ready', data);
                break;
            case 'game-sync-start':
                console.log('收到 game-sync-start');
                this.emit('game-sync-start', data);
                break;
            case 'frame':
                this.emit('frame', data.frameData);
                break;
            case 'audio':
                this.emit('audio', data.audioData);
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
            case 'ping':
                this.handlePing(data.fromPlayer, data.timestamp);
                break;
            case 'pong':
                this.handlePong(data.fromPlayer, data.timestamp);
                break;
            case 'input-broadcast':
                this.updateInputState(data.player, data.button, data.pressed);
                break;
            case 'input-mode':
                // 处理输入模式变化（键盘/手柄）
                this.emit('input-mode', { player: data.player, isGamepad: data.isGamepad });
                break;
        }

        // 房主转发消息给其他玩家
        if (this.isHost && !['frame', 'audio', 'ping', 'pong'].includes(data.type)) {
            this.broadcast(data, data.fromPlayer);
        }
    }

    // ========== 发送消息 (P2P) ==========
    send(data) {
        if (this.isHost) {
            this.broadcast(data);
        } else {
            // 客户端发送给房主
            const channel = this.dataChannels[1];
            if (channel?.readyState === 'open') {
                channel.send(JSON.stringify(data));
            } else {
                console.warn('P2P 通道未就绪');
            }
        }
    }

    sendFrame(frameData) {
        if (!this.isHost) return;

        const data = JSON.stringify({ type: 'frame', frameData });

        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                try {
                    // 检查缓冲区是否过满，避免阻塞
                    const bufferedAmount = channel.bufferedAmount || 0;
                    const maxBuffer = 1024 * 1024; // 1MB 阈值
                    
                    if (bufferedAmount > maxBuffer) {
                        // 缓冲区过满，跳过这一帧
                        if (bufferedAmount > maxBuffer * 2) {
                            console.warn(`P${playerNum} 缓冲区过满 (${(bufferedAmount/1024).toFixed(0)}KB)，跳过帧`);
                        }
                        continue;
                    }
                    
                    channel.send(data);
                } catch (e) {
                    console.warn(`发送帧到 P${playerNum} 失败:`, e.message);
                }
            }
        }
    }
    
    sendAudio(audioData) {
        if (!this.isHost) return;

        const data = JSON.stringify({ type: 'audio', audioData });

        for (const [playerNum, channel] of Object.entries(this.dataChannels)) {
            if (channel?.readyState === 'open') {
                try {
                    // 音频数据较小，不需要检查缓冲区
                    channel.send(data);
                } catch (e) {
                    // 忽略音频发送错误
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
                } catch (e) { }
            }
        }
    }

    broadcastInput(button, pressed, player = null) {
        // 如果没有指定 player，使用 myPlayerNum
        const playerNum = player !== null ? player : this.myPlayerNum;
        const data = {
            type: 'input-broadcast',
            player: playerNum,
            button,
            pressed
        };
        this.send(data);
        this.updateInputState(playerNum, button, pressed);
    }
    
    // 广播输入模式变化（键盘/手柄）
    broadcastInputMode(isGamepad) {
        const data = {
            type: 'input-mode',
            player: this.myPlayerNum,
            isGamepad
        };
        this.send(data);
    }

    // ========== 清理 ==========
    cleanup() {
        // 停止重连
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // 停止 ping
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // 关闭所有 P2P 连接
        for (const playerNum of Object.keys(this.peerConnections)) {
            this.closePeerConnection(parseInt(playerNum));
        }

        this.latencies = {};
        this.pingTimestamps = {};
        this.playerInputStates = {};
    }

    async disconnect() {
        // 通知服务器
        this.sendWs({ type: 'leave' });

        // 关闭 WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.cleanup();
        this.roomCode = null;
        this.myPlayerNum = 0;
    }

    // 检查是否有活跃的 P2P 连接
    hasActiveConnections() {
        return Object.values(this.dataChannels).some(ch => ch?.readyState === 'open');
    }

    // 获取连接的玩家数量
    getConnectedPlayerCount() {
        return Object.values(this.dataChannels).filter(ch => ch?.readyState === 'open').length;
    }
}
