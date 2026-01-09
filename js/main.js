// 主入口文件 - 多人版（WebSocket + WebRTC P2P）
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
        this.myPlayerNum = 0;
        this.players = {};
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
        this.bindRoomEvents();
    }

    bindRoomEvents() {
        this.roomManager.on('connected', () => this.onConnected());
        this.roomManager.on('peer-connected', (data) => this.onPeerConnected(data));
        this.roomManager.on('peer-disconnected', (data) => this.onPeerDisconnected(data));
        this.roomManager.on('player-joined', (data) => this.onPlayerJoined(data));
        this.roomManager.on('player-left', (data) => this.onPlayerLeft(data));
        this.roomManager.on('room-closed', (data) => this.onRoomClosed(data));
        this.roomManager.on('input', (data) => this.onRemoteInput(data));
        this.roomManager.on('game-start', (data) => this.onGameStart(data));
        this.roomManager.on('frame', (frameData) => this.onFrame(frameData));
        this.roomManager.on('pause', (data) => this.onPause(data));
        this.roomManager.on('reset', () => this.onReset());
        this.roomManager.on('error', (data) => this.onError(data));
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
            this.ui.setConnectionStatus('connected', 'P2P 就绪');

            setTimeout(() => {
                this.ui.showRoomPanel();
                document.getElementById('room-code-display').textContent = roomCode;
                this.updateSeats();
                this.updateStartButton();
            }, 300);
        } catch (error) {
            console.error('创建房间失败:', error);
            this.ui.setConnectionStatus('error', '创建失败');
            this.ui.showToast(error.message);
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
            this.players = {};
            if (result.players) {
                for (const p of result.players) {
                    this.players[p.playerNum] = { name: p.name, connected: true };
                }
            }
            this.players[this.myPlayerNum] = { name: `玩家${this.myPlayerNum}`, connected: true };

            this.ui.setConnectionStatus('connected', '等待P2P...');
            this.ui.showRoomPanel();
            document.getElementById('room-code-display').textContent = roomCode;
            this.updateSeats();
            this.updateStartButton();
            this.ui.showToast(`你是 P${this.myPlayerNum}`);
        } catch (error) {
            console.error('加入房间失败:', error);
            this.ui.setConnectionStatus('error', '加入失败');
            this.ui.showToast(error.message);
        }
    }

    // ========== 房间事件 ==========
    onConnected() {
        this.ui.setConnectionStatus('connected', 'P2P 已连接');
    }

    onPeerConnected(data) {
        console.log(`P${data.playerNum} P2P连接成功`);
        this.ui.setConnectionStatus('connected', 'P2P 已连接');
    }

    onPeerDisconnected(data) {
        console.log(`P${data.playerNum} P2P断开`);
    }

    onPlayerJoined(data) {
        const { playerNum, name } = data;
        if (this.players[playerNum]?.connected) return;
        this.players[playerNum] = { name: name || `玩家${playerNum}`, connected: true };
        this.updateSeats();
        this.ui.showToast(`P${playerNum} 加入了房间`);
        this.chatManager?.addSystemMessage(`P${playerNum} 加入了房间`);
    }

    onPlayerLeft(data) {
        const { playerNum } = data;
        if (this.players[playerNum]) {
            this.players[playerNum].connected = false;
            this.updateSeats();
            this.ui.showToast(`P${playerNum} 离开了房间`);
            this.chatManager?.addSystemMessage(`P${playerNum} 离开了房间`);
        }
    }

    onRoomClosed(data) {
        this.ui.showToast(data.message || '房间已关闭');
        this.backToModeSelect();
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

    onError(data) {
        console.error('错误:', data.message);
        this.ui.showToast(data.message);
        this.ui.setConnectionStatus('error', '错误');
    }

    onLatencyUpdate(data) {
        const { player, latency } = data;
        const el = document.getElementById(`latency-p${player}`);
        if (el) {
            if (latency === null) {
                el.textContent = '--ms';
                el.className = 'panel-latency';
            } else {
                el.textContent = `${latency}ms`;
                el.className = 'panel-latency ' + (latency < 50 ? 'good' : latency < 100 ? 'medium' : 'bad');
            }
        }
    }

    onInputStateUpdate(data) {
        const { player, button, pressed } = data;
        const panel = document.querySelector(`.player-input-panel[data-player="${player}"]`);
        if (!panel) return;
        panel.classList.add('active');
        const btn = panel.querySelector(`.mini-btn[data-btn="${button}"]`);
        if (btn) btn.classList.toggle('active', pressed);
    }

    initPlayerInputPanels() {
        for (let i = 1; i <= 4; i++) {
            const panel = document.querySelector(`.player-input-panel[data-player="${i}"]`);
            if (panel) panel.classList.toggle('active', this.players[i]?.connected);
            const el = document.getElementById(`latency-p${i}`);
            if (el) {
                el.textContent = i === this.myPlayerNum ? '本地' : '--ms';
                el.className = 'panel-latency' + (i === this.myPlayerNum ? ' good' : '');
            }
        }
    }

    // ========== 座位更新 ==========
    updateSeats() {
        for (let i = 1; i <= 4; i++) {
            const seat = document.getElementById(`seat-${i}`);
            const player = this.players[i];
            seat.classList.remove('occupied', 'empty', 'me', 'p1', 'p2', 'p3', 'p4');

            if (player?.connected) {
                seat.classList.add('occupied', `p${i}`);
                seat.querySelector('.player-avatar').textContent = ['🧑', '👩', '👨', '🧒'][i - 1];
                if (i === this.myPlayerNum) seat.classList.add('me');
            } else {
                seat.classList.add('empty');
                seat.querySelector('.player-avatar').textContent = '👤';
            }

            const inputPanel = document.querySelector(`.player-input-panel[data-player="${i}"]`);
            if (inputPanel) inputPanel.classList.toggle('active', player?.connected);
        }

        for (let i = 1; i <= 4; i++) {
            const nameEl = document.getElementById(`p${i}-name`);
            const player = this.players[i];
            nameEl.textContent = player?.connected
                ? (i === this.myPlayerNum ? `${player.name}(你)` : player.name)
                : '-';
        }
    }

    // ========== 游戏选择 ==========
    async loadGameList() {
        try {
            // 优先从边缘函数 API 获取游戏列表
            let loaded = false;
            
            try {
                const apiRes = await fetch('/api/roms');
                if (apiRes.ok) {
                    const data = await apiRes.json();
                    if (data.roms && data.roms.length > 0) {
                        this.allGames = data.roms.map(r => ({
                            id: r.id,
                            name: r.name,
                            icon: this.getGameIcon(r.name),
                            players: this.guessPlayers(r.name)
                        }));
                        loaded = true;
                        console.log(`📦 从 KV 加载了 ${data.count} 个游戏`);
                    }
                }
            } catch {}

            // 回退到本地 manifest
            if (!loaded) {
                const response = await fetch('/roms-manifest.json');
                if (response.ok) {
                    const manifest = await response.json();
                    this.allGames = manifest.files.map(f => {
                        const name = f.name.replace('.zip', '').replace('.nes', '');
                        return { id: name, name, icon: this.getGameIcon(name), players: this.guessPlayers(name) };
                    });
                    loaded = true;
                    console.log(`📁 从本地加载了 ${this.allGames.length} 个游戏`);
                }
            }

            if (!loaded) throw new Error('无法加载游戏列表');
        } catch {
            // 最终回退到硬编码列表
            this.allGames = [
                { id: '魂斗罗', name: '魂斗罗', icon: '🔫', players: 2 },
                { id: '超级魂斗罗', name: '超级魂斗罗', icon: '🔫', players: 2 },
                { id: '超级玛莉', name: '超级玛丽', icon: '🍄', players: 1 },
                { id: '坦克大战(打坦克，Battle City)', name: '坦克大战', icon: '🎖️', players: 2 },
                { id: '雪人兄弟', name: '雪人兄弟', icon: '⛄', players: 2 },
                { id: '双截龙', name: '双截龙', icon: '🐉', players: 2 },
                { id: '赤色要塞', name: '赤色要塞', icon: '🚁', players: 2 },
                { id: '忍者神龟2', name: '忍者神龟2', icon: '🐢', players: 2 },
            ];
        }
        this.renderGameResults(this.allGames.slice(0, 12));
    }

    getGameIcon(name) {
        const map = { '魂斗罗': '🔫', '坦克': '🎖️', '马里奥': '🍄', '玛莉': '🍄', '雪人': '⛄', '双截龙': '🐉', '忍者': '🥷', '热血': '👊', '松鼠': '🐿️' };
        for (const [k, v] of Object.entries(map)) if (name.includes(k)) return v;
        return '🎮';
    }

    guessPlayers(name) {
        const kw = ['魂斗罗', '坦克', '雪人', '双截龙', '热血', '松鼠', '炸弹', '泡泡', '兵蜂', '赤色'];
        return kw.some(k => name.includes(k)) ? 2 : 1;
    }

    searchGames(query) {
        const q = query.toLowerCase().trim();
        const results = q ? this.allGames.filter(g => g.name.toLowerCase().includes(q)) : this.allGames.slice(0, 8);
        this.renderGameResults(results);
    }

    renderGameResults(games) {
        const container = document.getElementById('game-results');
        container.innerHTML = '';
        games.forEach(game => {
            const item = document.createElement('div');
            item.className = 'game-result-item';
            item.innerHTML = `<span class="game-icon">${game.icon}</span><span class="game-name">${game.name}</span><span style="margin-left:auto;font-size:0.4rem;color:#888">${game.players}P</span>`;
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
        this.showCartridge(game.name);
        this.updateStartButton();
    }

    showCartridge(name) {
        const cartridge = document.getElementById('cartridge');
        cartridge.classList.remove('hidden', 'inserting');
        document.getElementById('cart-label').textContent = name.substring(0, 8);
        setTimeout(() => cartridge.classList.add('inserting'), 50);
    }

    handleRomUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!/\.(nes|unf|unif)$/i.test(file.name)) {
            this.ui.showToast('请上传.nes/.unf格式文件');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this.customRom = new Uint8Array(e.target.result);
            this.selectedGame = null;
            this.selectedGameName = file.name.replace(/\.(nes|unf|unif)$/i, '');
            document.getElementById('upload-filename').textContent = `✓ ${file.name}`;
            document.querySelectorAll('.game-result-item').forEach(el => el.classList.remove('selected'));
            this.showCartridge(this.selectedGameName);
            this.updateStartButton();
        };
        reader.readAsArrayBuffer(file);
    }

    updateStartButton() {
        const btn = document.getElementById('start-game-btn');
        const canStart = (this.mode === 'single' || this.mode === 'host') && (this.selectedGame || this.customRom);
        btn.disabled = !canStart;
        btn.textContent = this.mode === 'client' ? '等待房主开始...' : (canStart ? '▶ 开始游戏' : '请选择游戏');
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
                this.ui.showToast(`加载失败: ${error.message}`);
                return;
            }
        }

        if (!romData || romData.length < 16) {
            this.ui.showToast('请先选择有效游戏');
            return;
        }

        document.getElementById('power-btn').classList.add('on');

        if (this.mode === 'host') {
            this.roomManager.send({ type: 'game-start', gameName: this.selectedGameName });
        }

        this.startGameAsHost(romData);
    }

    startGameAsHost(romData) {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        this.ui.showGameScreen();

        this.emulator.loadRom(romData);

        if (this.mode === 'host') {
            this.emulator.onFrameReady = (frameBuffer) => {
                const compressed = this.emulator.compressFrame(frameBuffer);
                this.roomManager.sendFrame(compressed);
            };
        }

        this.emulator.start();

        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            () => {},
            (button, pressed) => {
                if (this.mode !== 'single') {
                    this.roomManager.broadcastInput(button, pressed);
                } else {
                    this.roomManager.updateInputState(this.myPlayerNum, button, pressed);
                }
            }
        );

        this.chatManager.init();
        this.initPlayerInputPanels();

        if (this.inputManager.isMobileDevice()) {
            this.inputManager.setupVirtualGamepad();
            this.inputManager.showVirtualGamepad();
        }

        window.app = this;
    }

    startGameAsClient() {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        this.ui.showGameScreen();

        this.emulator.start();

        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            (inputData) => this.roomManager.send({ type: 'input', ...inputData }),
            (button, pressed) => this.roomManager.broadcastInput(button, pressed)
        );

        document.getElementById('pause-btn').disabled = true;
        document.getElementById('reset-btn').disabled = true;

        this.chatManager.init();
        this.initPlayerInputPanels();

        if (this.inputManager.isMobileDevice()) {
            this.inputManager.setupVirtualGamepad();
            this.inputManager.showVirtualGamepad();
        }

        window.app = this;
    }

    togglePause() {
        if (this.mode === 'client') return;
        const paused = this.emulator.togglePause();
        document.getElementById('pause-btn').textContent = paused ? '▶ 继续' : '⏸ 暂停';
        if (this.mode === 'host') this.roomManager.send({ type: 'pause', paused });
    }

    resetGame() {
        if (this.mode === 'client') return;
        this.emulator.reset();
        this.ui.showToast('游戏已重置');
        if (this.mode === 'host') this.roomManager.send({ type: 'reset' });
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
        this.chatManager?.destroy();

        document.getElementById('power-btn').classList.remove('on');
        document.getElementById('pause-btn').textContent = '⏸ 暂停';
        document.getElementById('pause-btn').disabled = false;
        document.getElementById('reset-btn').disabled = false;

        this.ui.hideGameScreen();
        this.ui.showRoomPanel();
    }

    async loadRomFromServer(gameId) {
        // 尝试多种路径
        const urls = [
            `/api/rom/${encodeURIComponent(gameId)}`,  // API 路由
            `/roms/${encodeURIComponent(gameId)}.zip`, // 直接访问
            `/roms/${gameId}.zip`
        ];

        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.arrayBuffer();
                    // 检查是否是 ZIP 文件
                    const header = new Uint8Array(data.slice(0, 4));
                    if (header[0] === 0x50 && header[1] === 0x4B) {
                        return await this.extractNesFromZip(data);
                    }
                    // 直接是 NES 文件
                    return new Uint8Array(data);
                }
            } catch {}
        }
        throw new Error(`无法加载 "${gameId}"`);
    }

    async extractNesFromZip(zipData) {
        const zip = await window.JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files).filter(f => !zip.files[f].dir);
        for (const ext of ['.nes', '.unf', '.unif', '.fds']) {
            for (const f of files) {
                if (f.toLowerCase().endsWith(ext)) return await zip.files[f].async('uint8array');
            }
        }
        if (files.length > 0) return await zip.files[files[0]].async('uint8array');
        throw new Error('ZIP中未找到ROM');
    }
}

// 启动
const app = new GameApp();
app.init().catch(console.error);
