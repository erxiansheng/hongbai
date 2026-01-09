// 主入口文件 - 多人版（支持单人/4人房间/聊天/语音）
import { RoomManager } from './room.js';
import { NESEmulator } from './emulator.js';
import { InputManager } from './input.js';
import { UIManager } from './ui.js';
import { ChatManager } from './chat.js';

class GameApp {
    constructor() {
        this.roomManager = null;
        this.emulator = null;
        this.inputManager = null;
        this.ui = null;
        this.chatManager = null;
        
        this.mode = null; // 'single', 'host', 'client'
        this.myPlayerNum = 0; // 1-4
        this.players = {}; // {1: {name, connected}, 2: {...}, ...}
        this.selectedGame = null;
        this.selectedGameName = '';
        this.customRom = null;
        this.allGames = [];
    }

    async init() {
        this.ui = new UIManager();
        this.emulator = new NESEmulator('nes-canvas');
        this.inputManager = new InputManager(this.emulator);
        this.roomManager = new RoomManager();
        this.chatManager = new ChatManager(this.roomManager);
        
        await this.loadGameList();
        this.bindEvents();
        this.inputManager.initControlsUI();
        
        document.getElementById('controls-panel').classList.add('expanded');
        
        console.log('🎮 红白机多人对战系统初始化完成');
    }

    bindEvents() {
        // 模式选择
        document.getElementById('single-mode').addEventListener('click', () => this.startSinglePlayer());
        document.getElementById('create-mode').addEventListener('click', () => this.createRoom());
        document.getElementById('join-mode').addEventListener('click', () => this.showJoinForm());
        
        document.getElementById('back-to-mode-btn').addEventListener('click', () => this.backToModeSelect());
        document.getElementById('confirm-join-btn').addEventListener('click', () => {
            const code = document.getElementById('room-input').value.trim();
            if (code) this.joinRoom(code);
        });
        document.getElementById('room-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const code = e.target.value.trim();
                if (code) this.joinRoom(code);
            }
        });
        document.getElementById('copy-room-btn').addEventListener('click', () => {
            const code = document.getElementById('room-code').textContent;
            navigator.clipboard.writeText(code);
            this.ui.showToast('房间号已复制');
        });

        // 游戏搜索
        document.getElementById('game-search').addEventListener('input', (e) => this.searchGames(e.target.value));
        document.getElementById('rom-upload').addEventListener('change', (e) => this.handleRomUpload(e));

        // 开始游戏
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('power-btn').addEventListener('click', () => this.startGame());

        // 游戏控制
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('exit-btn').addEventListener('click', () => this.exitGame());

        // 房间事件
        this.roomManager.on('connected', () => this.onConnected());
        this.roomManager.on('disconnected', () => this.onDisconnected());
        this.roomManager.on('player-joined', (data) => this.onPlayerJoined(data));
        this.roomManager.on('player-left', (data) => this.onPlayerLeft(data));
        this.roomManager.on('input', (data) => this.onRemoteInput(data));
        this.roomManager.on('game-start', (data) => this.onGameStart(data));
        this.roomManager.on('frame', (frameData) => this.onFrame(frameData));
        this.roomManager.on('pause', (data) => this.onPause(data));
        this.roomManager.on('reset', () => this.onReset());
        this.roomManager.on('room-state', (data) => this.onRoomState(data));
        
        // 延迟和按键状态事件
        this.roomManager.on('latency-update', (data) => this.onLatencyUpdate(data));
        this.roomManager.on('input-state-update', (data) => this.onInputStateUpdate(data));
    }

    // ========== 模式选择 ==========
    startSinglePlayer() {
        this.mode = 'single';
        this.myPlayerNum = 1;
        this.emulator.setHost(true);
        this.players = { 1: { name: '玩家', connected: true } };
        
        this.ui.showRoomPanel();
        this.updateSeats();
        this.updateStartButton();
        document.getElementById('room-code-display').textContent = '单人模式';
    }

    async createRoom() {
        this.mode = 'host';
        this.emulator.setHost(true);
        this.ui.setConnectionStatus('connecting', '创建中...');
        document.getElementById('connection-status').classList.remove('hidden');
        
        try {
            const roomCode = await this.roomManager.createRoom();
            this.myPlayerNum = 1;
            this.players = { 1: { name: '房主', connected: true } };
            
            document.getElementById('room-code').textContent = roomCode;
            document.getElementById('room-info').classList.remove('hidden');
            document.querySelector('.mode-cards').classList.add('hidden');
            this.ui.setConnectionStatus('connected', '等待玩家加入');
            
            // 显示房间面板
            setTimeout(() => {
                this.ui.showRoomPanel();
                document.getElementById('room-code-display').textContent = roomCode;
                this.updateSeats();
                this.updateStartButton();
            }, 500);
        } catch (error) {
            console.error('创建房间失败:', error);
            this.ui.setConnectionStatus('error', '创建失败');
            this.ui.showToast('创建房间失败');
        }
    }

    showJoinForm() {
        document.querySelector('.mode-cards').classList.add('hidden');
        document.getElementById('join-form').classList.remove('hidden');
        document.getElementById('room-input').focus();
    }

    backToModeSelect() {
        document.querySelector('.mode-cards').classList.remove('hidden');
        document.getElementById('join-form').classList.add('hidden');
        document.getElementById('room-info').classList.add('hidden');
        document.getElementById('connection-status').classList.add('hidden');
    }

    async joinRoom(roomCode) {
        this.mode = 'client';
        this.emulator.setHost(false);
        this.ui.setConnectionStatus('connecting', '连接中...');
        document.getElementById('connection-status').classList.remove('hidden');
        
        try {
            const result = await this.roomManager.joinRoom(roomCode);
            this.myPlayerNum = result.playerNum;
            
            // 服务器返回的players已经是正确格式 {1: {name, connected}, 2: {...}}
            this.players = result.players || {};
            // 确保自己的信息正确
            this.players[this.myPlayerNum] = { name: `玩家${this.myPlayerNum}`, connected: true };
            
            this.ui.setConnectionStatus('connected', '已连接');
            this.ui.showRoomPanel();
            document.getElementById('room-code-display').textContent = roomCode;
            this.updateSeats();
            this.updateStartButton();
            this.ui.showToast(`你是 P${this.myPlayerNum}`);
            
            console.log('加入房间成功，当前玩家:', this.players);
        } catch (error) {
            console.error('加入房间失败:', error);
            this.ui.setConnectionStatus('error', '加入失败');
            this.ui.showToast(error.message || '加入失败');
        }
    }

    // ========== 房间事件 ==========
    onConnected() {
        this.ui.setConnectionStatus('connected', '已连接');
    }

    onDisconnected() {
        this.ui.setConnectionStatus('error', '连接断开');
        this.ui.showToast('连接已断开');
    }

    onPlayerJoined(data) {
        const { playerNum, name } = data;
        this.players[playerNum] = { name: name || `玩家${playerNum}`, connected: true };
        this.updateSeats();
        this.ui.showToast(`P${playerNum} 加入了房间`);
        this.chatManager.addSystemMessage(`P${playerNum} 加入了房间`);
    }

    onPlayerLeft(data) {
        const { playerNum } = data;
        if (this.players[playerNum]) {
            this.players[playerNum].connected = false;
            this.updateSeats();
            this.ui.showToast(`P${playerNum} 离开了房间`);
            this.chatManager.addSystemMessage(`P${playerNum} 离开了房间`);
        }
    }

    onRoomState(data) {
        this.players = data.players || {};
        this.updateSeats();
    }

    onRemoteInput(data) {
        if (this.mode === 'host' || this.mode === 'single') {
            this.inputManager.handleRemoteInput(data);
        }
    }

    onGameStart(data) {
        if (this.mode === 'client') {
            this.selectedGameName = data.gameName || '游戏';
            this.startGameAsClient();
        }
    }

    onFrame(frameData) {
        if (this.mode === 'client') {
            this.emulator.receiveFrame(frameData);
            
            // 调试：每100帧输出一次
            if (!this._recvFrameCount) this._recvFrameCount = 0;
            this._recvFrameCount++;
            if (this._recvFrameCount % 100 === 0) {
                console.log(`已接收${this._recvFrameCount}帧`);
            }
        }
    }

    onPause(data) {
        if (this.mode === 'client') {
            this.emulator.isPaused = data.paused;
            document.getElementById('pause-btn').textContent = data.paused ? '▶ 继续' : '⏸ 暂停';
        }
    }

    onReset() {
        if (this.mode === 'client') {
            this.ui.showToast('游戏已重置');
        }
    }
    
    // ========== 延迟和按键状态更新 ==========
    onLatencyUpdate(data) {
        const { player, latency } = data;
        const latencyEl = document.getElementById(`latency-p${player}`);
        if (latencyEl) {
            if (latency === null) {
                latencyEl.textContent = '--ms';
                latencyEl.className = 'panel-latency';
            } else {
                latencyEl.textContent = `${latency}ms`;
                latencyEl.className = 'panel-latency';
                if (latency < 50) {
                    latencyEl.classList.add('good');
                } else if (latency < 100) {
                    latencyEl.classList.add('medium');
                } else {
                    latencyEl.classList.add('bad');
                }
            }
        }
    }
    
    onInputStateUpdate(data) {
        const { player, button, pressed } = data;
        const panel = document.querySelector(`.player-input-panel[data-player="${player}"]`);
        if (!panel) return;
        
        // 激活面板
        panel.classList.add('active');
        
        // 更新按键显示
        const btnEl = panel.querySelector(`.mini-btn[data-btn="${button}"]`);
        if (btnEl) {
            if (pressed) {
                btnEl.classList.add('active');
            } else {
                btnEl.classList.remove('active');
            }
        }
    }
    
    // 初始化玩家输入面板
    initPlayerInputPanels() {
        // 激活有玩家的面板
        for (let i = 1; i <= 4; i++) {
            const panel = document.querySelector(`.player-input-panel[data-player="${i}"]`);
            if (panel) {
                if (this.players[i] && this.players[i].connected) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            }
            // 重置延迟显示
            const latencyEl = document.getElementById(`latency-p${i}`);
            if (latencyEl) {
                if (i === this.myPlayerNum) {
                    latencyEl.textContent = '本地';
                    latencyEl.className = 'panel-latency good';
                } else {
                    latencyEl.textContent = '--ms';
                    latencyEl.className = 'panel-latency';
                }
            }
        }
    }

    // ========== 座位更新 ==========
    updateSeats() {
        for (let i = 1; i <= 4; i++) {
            const seat = document.getElementById(`seat-${i}`);
            const player = this.players[i];
            
            seat.classList.remove('occupied', 'empty', 'me', 'p1', 'p2', 'p3', 'p4');
            
            if (player && player.connected) {
                seat.classList.add('occupied', `p${i}`);
                seat.querySelector('.player-avatar').textContent = this.getPlayerEmoji(i);
                if (i === this.myPlayerNum) {
                    seat.classList.add('me');
                }
            } else {
                seat.classList.add('empty');
                seat.querySelector('.player-avatar').textContent = '👤';
            }
            
            // 同时更新输入面板激活状态
            const inputPanel = document.querySelector(`.player-input-panel[data-player="${i}"]`);
            if (inputPanel) {
                if (player && player.connected) {
                    inputPanel.classList.add('active');
                } else {
                    inputPanel.classList.remove('active');
                }
            }
        }

        // 更新玩家栏
        for (let i = 1; i <= 4; i++) {
            const nameEl = document.getElementById(`p${i}-name`);
            const player = this.players[i];
            if (player && player.connected) {
                nameEl.textContent = i === this.myPlayerNum ? `${player.name}(你)` : player.name;
            } else {
                nameEl.textContent = '-';
            }
        }
    }

    getPlayerEmoji(num) {
        const emojis = { 1: '🧑', 2: '👩', 3: '👨', 4: '🧒' };
        return emojis[num] || '👤';
    }

    // ========== 游戏选择 ==========
    async loadGameList() {
        // 尝试从 manifest 加载完整游戏列表
        try {
            const response = await fetch('/roms-manifest.json');
            if (response.ok) {
                const manifest = await response.json();
                this.allGames = manifest.files.map(f => {
                    const name = f.name.replace('.zip', '').replace('.nes', '');
                    return {
                        id: name,
                        name: name,
                        icon: this.getGameIcon(name),
                        players: this.guessPlayers(name),
                        size: f.size
                    };
                });
                console.log(`从manifest加载了 ${this.allGames.length} 个游戏`);
            } else {
                throw new Error('manifest not found');
            }
        } catch (e) {
            console.log('使用预设游戏列表');
            // 回退到预设列表
            this.allGames = [
                { id: '魂斗罗', name: '魂斗罗', icon: '🔫', players: 2 },
                { id: '超级魂斗罗', name: '超级魂斗罗', icon: '🔫', players: 2 },
                { id: '超级玛莉', name: '超级玛丽', icon: '🍄', players: 1 },
                { id: '坦克大战(打坦克，Battle City)', name: '坦克大战', icon: '🎖️', players: 2 },
                { id: '雪人兄弟', name: '雪人兄弟', icon: '⛄', players: 2 },
                { id: '双截龙', name: '双截龙', icon: '🐉', players: 2 },
                { id: '赤色要塞', name: '赤色要塞', icon: '🚁', players: 2 },
                { id: '忍者神龟2', name: '忍者神龟2', icon: '🐢', players: 2 },
                { id: '热血物语', name: '热血物语', icon: '👊', players: 2 },
                { id: '松鼠大战2', name: '松鼠大战2', icon: '🐿️', players: 2 },
            ];
        }
        
        this.renderGameResults(this.allGames.slice(0, 12));
    }
    
    getGameIcon(name) {
        // 根据游戏名猜测图标
        const iconMap = {
            '魂斗罗': '🔫', '坦克': '🎖️', '马里奥': '🍄', '玛莉': '🍄', '玛丽': '🍄',
            '雪人': '⛄', '双截龙': '🐉', '忍者': '🥷', '热血': '👊', '松鼠': '🐿️',
            '冒险岛': '🏝️', '炸弹': '💣', '泡泡': '🫧', '洛克人': '🤖', '恶魔城': '🏰',
            '足球': '⚽', '篮球': '🏀', '棒球': '⚾', '赛车': '🏎️', '飞机': '✈️',
            '三国': '⚔️', '龙珠': '🐲', '高达': '🤖', '街霸': '👊', '拳': '🥊',
            '麻将': '🀄', '象棋': '♟️', '围棋': '⚫', '扑克': '🃏',
        };
        for (const [key, icon] of Object.entries(iconMap)) {
            if (name.includes(key)) return icon;
        }
        return '🎮';
    }
    
    guessPlayers(name) {
        // 根据游戏名猜测支持人数
        const twoPlayerKeywords = ['魂斗罗', '坦克', '雪人', '双截龙', '热血', '松鼠', '炸弹', '泡泡', '兵蜂', '赤色', '绿色兵团'];
        for (const kw of twoPlayerKeywords) {
            if (name.includes(kw)) return 2;
        }
        return 1;
    }

    searchGames(query) {
        const q = query.toLowerCase().trim();
        if (!q) {
            this.renderGameResults(this.allGames.slice(0, 8));
            return;
        }
        const results = this.allGames.filter(g => 
            g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q)
        );
        this.renderGameResults(results);
    }

    renderGameResults(games) {
        const container = document.getElementById('game-results');
        container.innerHTML = '';
        
        games.forEach(game => {
            const item = document.createElement('div');
            item.className = 'game-result-item';
            item.dataset.id = game.id;
            item.innerHTML = `
                <span class="game-icon">${game.icon}</span>
                <span class="game-name">${game.name}</span>
                <span style="margin-left:auto;font-size:0.4rem;color:#888">${game.players}P</span>
            `;
            item.addEventListener('click', () => this.selectGame(game, item));
            container.appendChild(item);
        });
    }

    selectGame(game, element) {
        document.querySelectorAll('.game-result-item').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        this.selectedGame = game.id;
        this.selectedGameName = game.name;
        this.customRom = null;
        document.getElementById('upload-filename').textContent = '';
        
        // 显示卡带
        this.showCartridge(game.name);
        this.updateStartButton();
    }

    showCartridge(name) {
        const cartridge = document.getElementById('cartridge');
        const label = document.getElementById('cart-label');
        
        cartridge.classList.remove('hidden', 'inserting');
        label.textContent = name.substring(0, 8);
        
        // 触发插入动画
        setTimeout(() => cartridge.classList.add('inserting'), 50);
    }

    handleRomUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.nes')) {
            this.ui.showToast('请上传.nes格式文件');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.customRom = new Uint8Array(e.target.result);
            this.selectedGame = null;
            this.selectedGameName = file.name.replace('.nes', '');
            document.getElementById('upload-filename').textContent = `✓ ${file.name}`;
            document.querySelectorAll('.game-result-item').forEach(el => el.classList.remove('selected'));
            
            this.showCartridge(this.selectedGameName);
            this.updateStartButton();
            this.ui.showToast('ROM加载成功');
        };
        reader.readAsArrayBuffer(file);
    }

    updateStartButton() {
        const btn = document.getElementById('start-game-btn');
        const canStart = (this.mode === 'single' || this.mode === 'host') && (this.selectedGame || this.customRom);
        btn.disabled = !canStart;
        
        if (this.mode === 'client') {
            btn.textContent = '等待房主开始...';
            btn.disabled = true;
        } else {
            btn.textContent = this.selectedGame || this.customRom ? '▶ 开始游戏' : '请选择游戏';
        }
    }

    // ========== 游戏控制 ==========
    async startGame() {
        if (this.mode === 'client') return;
        
        let romData;
        if (this.customRom) {
            romData = this.customRom;
        } else if (this.selectedGame) {
            try {
                this.ui.showToast('加载游戏中...');
                romData = await this.loadRomFromServer(this.selectedGame);
            } catch (error) {
                console.error('游戏加载失败:', error);
                this.ui.showToast(`加载失败: ${error.message}`);
                return;
            }
        }

        if (!romData) {
            this.ui.showToast('请先选择游戏');
            return;
        }
        
        // 验证ROM数据
        if (romData.length < 16) {
            this.ui.showToast('ROM文件无效');
            return;
        }
        
        console.log(`ROM加载完成，大小: ${romData.length} bytes`);

        // 电源按钮亮起
        document.getElementById('power-btn').classList.add('on');

        // 通知其他玩家
        if (this.mode === 'host') {
            this.roomManager.send({
                type: 'game-start',
                gameName: this.selectedGameName
            });
        }

        this.startGameAsHost(romData);
    }

    startGameAsHost(romData) {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        this.ui.showGameScreen();
        
        this.emulator.loadRom(romData);
        
        // 设置帧同步回调 - 只在多人模式下发送帧
        if (this.mode === 'host') {
            this.emulator.onFrameReady = (frameBuffer) => {
                const compressed = this.emulator.compressFrame(frameBuffer);
                this.roomManager.sendFrame(compressed);
            };
        }
        
        this.emulator.start();
        
        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            () => {
                // 本地输入已在inputManager处理
            },
            (button, pressed) => {
                // 广播按键状态给其他玩家
                if (this.mode !== 'single') {
                    this.roomManager.broadcastInput(button, pressed);
                } else {
                    // 单人模式也更新本地显示
                    this.roomManager.updateInputState(this.myPlayerNum, button, pressed);
                }
            }
        );

        this.chatManager.init();
        
        // 初始化玩家输入面板
        this.initPlayerInputPanels();
        
        // 移动端显示虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.inputManager.setupVirtualGamepad();
            this.inputManager.showVirtualGamepad();
        }
        
        // 暴露app实例供chat使用
        window.app = this;
    }

    startGameAsClient() {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        this.ui.showGameScreen();
        
        // 客户端不运行模拟器循环，只接收帧
        // emulator.start() 在非host模式下不会启动gameLoop
        this.emulator.start();
        
        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            (inputData) => {
                // 客户端发送输入给房主
                this.roomManager.send({ type: 'input', ...inputData });
            },
            (button, pressed) => {
                // 广播按键状态给其他玩家
                this.roomManager.broadcastInput(button, pressed);
            }
        );

        document.getElementById('pause-btn').disabled = true;
        document.getElementById('reset-btn').disabled = true;
        
        this.chatManager.init();
        
        // 初始化玩家输入面板
        this.initPlayerInputPanels();
        
        // 移动端显示虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.inputManager.setupVirtualGamepad();
            this.inputManager.showVirtualGamepad();
        }
        
        // 暴露app实例供chat使用
        window.app = this;
    }

    togglePause() {
        if (this.mode === 'client') return;
        const paused = this.emulator.togglePause();
        document.getElementById('pause-btn').textContent = paused ? '▶ 继续' : '⏸ 暂停';
        if (this.mode === 'host') {
            this.roomManager.send({ type: 'pause', paused });
        }
    }

    resetGame() {
        if (this.mode === 'client') return;
        this.emulator.reset();
        this.ui.showToast('游戏已重置');
        if (this.mode === 'host') {
            this.roomManager.send({ type: 'reset' });
        }
    }

    toggleFullscreen() {
        const screen = document.querySelector('.screen-wrapper');
        if (!document.fullscreenElement) {
            screen.requestFullscreen().catch(() => this.ui.showToast('无法进入全屏'));
        } else {
            document.exitFullscreen();
        }
    }

    exitGame() {
        this.emulator.stop();
        this.emulator.onFrameReady = null;
        this.inputManager.stop();
        this.inputManager.hideVirtualGamepad();
        this.chatManager.destroy();

        document.getElementById('power-btn').classList.remove('on');
        document.getElementById('pause-btn').textContent = '⏸ 暂停';
        document.getElementById('pause-btn').disabled = false;
        document.getElementById('reset-btn').disabled = false;
        
        this.ui.hideGameScreen();
        this.ui.showRoomPanel();
    }

    async loadRomFromServer(gameId) {
        console.log(`正在加载ROM: ${gameId}`);
        
        // 优先从边缘函数API获取
        const apiUrl = `/api/rom/${encodeURIComponent(gameId)}`;
        
        try {
            console.log(`尝试从API获取: ${apiUrl}`);
            const response = await fetch(apiUrl);
            if (response.ok) {
                const zipData = await response.arrayBuffer();
                console.log(`从API获取成功，大小: ${zipData.byteLength} bytes`);
                return await this.extractNesFromZip(zipData);
            }
            console.log(`API返回状态: ${response.status}`);
        } catch (e) {
            console.log('从API获取ROM失败:', e.message);
        }
        
        // 回退到本地roms目录 - 尝试多种URL格式
        const urlVariants = [
            `/roms/${encodeURIComponent(gameId)}.zip`,  // URL编码
            `/roms/${gameId}.zip`  // 原始中文（某些服务器支持）
        ];
        
        for (const romUrl of urlVariants) {
            console.log(`尝试从本地获取: ${romUrl}`);
            
            try {
                const response = await fetch(romUrl);
                if (response.ok) {
                    const zipData = await response.arrayBuffer();
                    console.log(`从本地获取成功，大小: ${zipData.byteLength} bytes`);
                    return await this.extractNesFromZip(zipData);
                }
                console.log(`返回状态: ${response.status}`);
            } catch (e) {
                console.log(`尝试失败: ${e.message}`);
            }
        }
        
        throw new Error(`无法加载游戏 "${gameId}"`);
    }

    async extractNesFromZip(zipData) {
        try {
            // JSZip是通过CDN加载的全局变量
            const zip = await window.JSZip.loadAsync(zipData);
            const files = Object.keys(zip.files).filter(f => !zip.files[f].dir);
            console.log(`ZIP包含文件: ${files.join(', ')}`);
            
            // 支持的ROM格式，按优先级排序
            const romExtensions = ['.nes', '.unf', '.unif', '.fds', '.nsf'];
            
            for (const ext of romExtensions) {
                for (const filename of files) {
                    if (filename.toLowerCase().endsWith(ext)) {
                        console.log(`提取ROM文件: ${filename}`);
                        return await zip.files[filename].async('uint8array');
                    }
                }
            }
            
            // 如果没有找到已知格式，尝试提取第一个非目录文件
            if (files.length > 0) {
                const firstFile = files[0];
                console.log(`未找到标准ROM格式，尝试提取: ${firstFile}`);
                return await zip.files[firstFile].async('uint8array');
            }
            
            throw new Error('ZIP中未找到ROM文件');
        } catch (e) {
            console.error('ZIP解压失败:', e);
            throw new Error(`ZIP解压失败: ${e.message}`);
        }
    }
}

// 启动
const app = new GameApp();
app.init().catch(console.error);
