// 主入口文件 - 多人版（WebSocket + WebRTC P2P）
import { RoomManager } from './room.js';
import { MultiPlatformEmulator, PLATFORMS, detectPlatform } from './emulator-multi.js';
import { InputManager } from './input.js';
import { UIManager } from './ui.js';
import { ChatManager } from './chat.js';
import { VoiceChatManager } from './voice-chat.js';
import { ARCADE_GAMES, ARCADE_OSS_BASE, getArcadeRomName, isArcadeGame, getArcadeGameList } from './arcade-games.js';
import { romCache } from './rom-cache.js';

class GameApp {
    constructor() {
        this.roomManager = null;
        this.emulator = null;
        this.inputManager = null;
        this.ui = null;
        this.chatManager = null;
        this.voiceChatManager = null;

        this.mode = null; // 'single', 'host', 'client'
        this.myPlayerNum = 0;
        this.players = {};
        this.selectedGame = null;
        this.selectedGameName = '';
        this.customRom = null;
        this.customRomFilename = ''; // 保存文件名用于平台检测
        this.allGames = [];
        this.saveMode = 'save'; // 存档模式: 'save' 或 'load'
        this.currentPlatform = 'nes'; // 当前游戏平台
        
        // 联机加载同步
        this.pendingGameStart = null; // 房主等待客户端加载完成
        this.playersReady = {}; // 记录哪些玩家已准备好
        this.gameStartTimeout = null; // 超时定时器
    }

    async init() {
        // 直接跳过开场动画
        this.initGame(null);
    }

    async initGame(selectedMode) {
        this.ui = new UIManager();
        this.emulator = new MultiPlatformEmulator('tv-nes-canvas', 'tv-emulator-container');
        this.inputManager = new InputManager(this.emulator);
        this.roomManager = new RoomManager();
        this.chatManager = new ChatManager(this.roomManager);
        this.voiceChatManager = new VoiceChatManager(this.roomManager);

        // 初始化ROM缓存
        await romCache.init();

        await this.loadGameList();
        this.bindEvents();
        this.inputManager.initControlsUI();
        
        // 尝试自动进入全屏模式
        this.tryAutoFullscreen();

        console.log('🎮 多平台游戏对战系统初始化完成');
        
        // 如果从动画中选择了模式，自动触发
        if (selectedMode) {
            setTimeout(() => {
                switch(selectedMode) {
                    case 'single':
                        this.startSinglePlayer();
                        break;
                    case 'create':
                        this.createRoom();
                        break;
                    case 'join':
                        this.showJoinForm();
                        break;
                }
            }, 100);
        }
    }
    
    // 尝试自动全屏
    tryAutoFullscreen() {
        // 检查是否已经是全屏
        if (document.fullscreenElement) return;
        
        // 添加点击事件监听，用户首次交互时进入全屏
        const enterFullscreen = () => {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => {});
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
            // 移除监听器，只触发一次
            document.removeEventListener('click', enterFullscreen);
            document.removeEventListener('keydown', enterFullscreen);
        };
        
        // 监听用户首次交互
        document.addEventListener('click', enterFullscreen, { once: true });
        document.addEventListener('keydown', enterFullscreen, { once: true });
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

        // 返回首页按钮
        document.getElementById('tv-back-btn')?.addEventListener('click', () => this.backToHome());

        // 游戏搜索
        document.getElementById('game-search').addEventListener('input', (e) => this.searchGames(e.target.value));
        document.getElementById('rom-upload').addEventListener('change', (e) => this.handleRomUpload(e));

        // 开始游戏
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('power-btn').addEventListener('click', () => this.startGame());

        // 游戏控制
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
        document.getElementById('save-btn').addEventListener('click', () => this.openSaveModal());
        document.getElementById('fullscreen-btn').addEventListener('click', () => this.toggleFullscreen());
        document.getElementById('exit-btn').addEventListener('click', () => this.exitGame());
        
        // 右上角全屏按钮
        document.getElementById('top-fullscreen-btn')?.addEventListener('click', () => this.togglePageFullscreen());

        // 存档弹窗事件
        this.bindSaveModalEvents();
        
        // 服务器设置弹窗事件
        this.bindServerModalEvents();
        
        // 街机菜单按钮（手机端）
        document.getElementById('arcade-menu-btn')?.addEventListener('click', () => this.toggleArcadeMenu());

        // 房间事件
        this.bindRoomEvents();
    }
    
    bindServerModalEvents() {
        const modal = document.getElementById('server-modal');
        const openBtn = document.getElementById('open-server-btn');
        const closeBtn = document.getElementById('close-server-btn');
        const overlay = modal?.querySelector('.modal-overlay');
        const saveBtn = document.getElementById('save-server-btn');
        const resetBtn = document.getElementById('reset-server-btn');
        const input = document.getElementById('custom-server-input');
        const display = document.getElementById('current-server-display');
        
        // 打开弹窗
        openBtn?.addEventListener('click', () => {
            modal?.classList.remove('hidden');
            // 加载当前配置
            const config = RoomManager.getServerConfig();
            if (input) input.value = config.customServer;
            this.updateServerDisplay();
        });
        
        // 关闭弹窗
        closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
        overlay?.addEventListener('click', () => modal?.classList.add('hidden'));
        
        // 保存设置
        saveBtn?.addEventListener('click', () => {
            const serverUrl = input?.value?.trim() || '';
            RoomManager.setCustomServer(serverUrl);
            this.updateServerDisplay();
            this.ui.showToast(serverUrl ? '服务器设置已保存' : '已恢复默认服务器');
            // 重新创建 RoomManager 以使用新配置
            this.roomManager = new RoomManager();
            this.bindRoomEvents();
        });
        
        // 恢复默认
        resetBtn?.addEventListener('click', () => {
            RoomManager.setCustomServer('');
            if (input) input.value = '';
            this.updateServerDisplay();
            this.ui.showToast('已恢复默认服务器');
            // 重新创建 RoomManager
            this.roomManager = new RoomManager();
            this.bindRoomEvents();
        });
    }
    
    updateServerDisplay() {
        const display = document.getElementById('current-server-display');
        if (display) {
            const config = RoomManager.getServerConfig();
            if (config.isCustom) {
                display.textContent = config.customServer;
                display.classList.add('custom');
            } else {
                display.textContent = '默认 (自动检测)';
                display.classList.remove('custom');
            }
        }
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
        this.roomManager.on('audio', (audioData) => this.onAudio(audioData));
        this.roomManager.on('pause', (data) => this.onPause(data));
        this.roomManager.on('reset', () => this.onReset());
        this.roomManager.on('error', (data) => this.onError(data));
        this.roomManager.on('latency-update', (data) => this.onLatencyUpdate(data));
        this.roomManager.on('input-state-update', (data) => this.onInputStateUpdate(data));
        this.roomManager.on('input-mode', (data) => this.onInputModeChange(data));
        this.roomManager.on('game-ready', (data) => this.onGameReady(data));
        this.roomManager.on('game-sync-start', (data) => this.onGameSyncStart(data));
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
        this.updateSearchPlaceholder();
        document.getElementById('room-code-display').textContent = '单人模式';
    }

    async createRoom() {
        this.mode = 'host';
        this.emulator.setHost(true);
        this.ui.setConnectionStatus('connecting', '创建中...');
        document.getElementById('connection-status').classList.remove('hidden');
        this.updateSearchPlaceholder();

        try {
            const roomCode = await this.roomManager.createRoom();
            this.myPlayerNum = 1;
            this.players = { 1: { name: '房主', connected: true } };

            // 显示房间号，让用户有时间复制
            document.getElementById('room-code').textContent = roomCode;
            document.getElementById('room-info').classList.remove('hidden');
            document.querySelector('.neon-menu').classList.add('hidden');
            this.ui.setConnectionStatus('connected', 'P2P 就绪');
            
            // 提前初始化聊天和语音，确保能捕获 P2P 连接事件
            this.chatManager.init();
            this.voiceChatManager.init();

            // 添加"进入房间"按钮，让用户主动进入
            this.showEnterRoomButton(roomCode);
        } catch (error) {
            console.error('创建房间失败:', error);
            this.ui.setConnectionStatus('error', '创建失败');
            this.ui.showToast(error.message);
        }
    }
    
    // 更新搜索框占位符
    updateSearchPlaceholder() {
        const searchInput = document.getElementById('game-search');
        if (searchInput) {
            if (this.mode === 'host' || this.mode === 'client') {
                searchInput.placeholder = '🔍 搜索NES游戏（联机仅支持NES）...';
            } else {
                searchInput.placeholder = '🔍 搜索游戏（NES/街机/多平台）...';
            }
        }
    }

    showEnterRoomButton(roomCode) {
        // 检查是否已存在进入按钮
        let enterBtn = document.getElementById('enter-room-btn');
        if (!enterBtn) {
            enterBtn = document.createElement('button');
            enterBtn.id = 'enter-room-btn';
            enterBtn.className = 'nes-btn primary';
            enterBtn.style.marginTop = '20px';
            enterBtn.textContent = '▶ 进入房间';
            document.querySelector('.room-code-display').appendChild(enterBtn);
        }
        enterBtn.classList.remove('hidden');
        
        enterBtn.onclick = () => {
            enterBtn.classList.add('hidden');
            this.ui.showRoomPanel();
            document.getElementById('room-code-display').textContent = roomCode;
            this.updateSeats();
            this.updateStartButton();
        };
    }

    showJoinForm() {
        document.querySelector('.neon-menu').classList.add('hidden');
        document.getElementById('join-form').classList.remove('hidden');
        document.getElementById('room-input').focus();
    }

    backToModeSelect() {
        document.querySelector('.neon-menu').classList.remove('hidden');
        document.getElementById('join-form').classList.add('hidden');
        document.getElementById('room-info').classList.add('hidden');
        document.getElementById('connection-status').classList.add('hidden');
    }

    backToHome() {
        // 如果正在游戏中，先停止游戏
        if (this.emulator && this.emulator.isRunning) {
            this.emulator.stop();
        }

        // 如果在联机模式，断开连接
        if (this.roomManager && (this.mode === 'host' || this.mode === 'client')) {
            this.roomManager.disconnect();
        }

        // 重置状态
        this.mode = null;
        this.selectedGame = null;
        this.selectedGameName = '';
        this.customRom = null;
        this.players = {};
        this.myPlayerNum = 0;

        // 清空游戏搜索
        const searchInput = document.getElementById('game-search');
        if (searchInput) searchInput.value = '';

        // 隐藏房间面板，显示模式选择
        this.ui.hideRoomPanel();
        this.backToModeSelect();

        // 显示提示
        this.ui.showToast('已返回首页');
    }

    async joinRoom(roomCode) {
        this.mode = 'client';
        this.emulator.setHost(false);
        this.ui.setConnectionStatus('connecting', '连接中...');
        document.getElementById('connection-status').classList.remove('hidden');
        this.updateSearchPlaceholder();

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
            
            // 提前初始化聊天和语音，确保能捕获 P2P 连接事件
            this.chatManager.init();
            this.voiceChatManager.init();
            
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
        this.updatePlayerInputPanels(); // 更新手柄面板显示
        
        // 通知 InputManager 有远程玩家加入（禁用本地对应玩家输入）
        if (playerNum !== this.myPlayerNum) {
            this.inputManager.addRemotePlayer(playerNum);
        }
        
        this.ui.showToast(`P${playerNum} 加入了房间`);
        this.chatManager?.addSystemMessage(`P${playerNum} 加入了房间`);
    }

    onPlayerLeft(data) {
        const { playerNum } = data;
        if (this.players[playerNum]) {
            this.players[playerNum].connected = false;
            this.updateSeats();
            this.updatePlayerInputPanels(); // 更新手柄面板显示
            
            // 通知 InputManager 远程玩家离开（启用本地对应玩家输入）
            this.inputManager.removeRemotePlayer(playerNum);
            
            this.ui.showToast(`P${playerNum} 离开了房间`);
            this.chatManager?.addSystemMessage(`P${playerNum} 离开了房间`);
        }
    }

    onRoomClosed(data) {
        this.ui.showToast(data.message || '房间已关闭');
        this.backToModeSelect();
    }

    onRemoteInput(data) {
        // 所有游戏都使用帧同步模式，只有房主处理远程输入
        if (this.mode === 'host' || this.mode === 'single') {
            this.inputManager.handleRemoteInput(data);
        }
        // 客户端只更新 UI 显示
        // 注意：远程玩家使用自己的P1键位，但UI应该显示在对应玩家面板上
        if (this.mode === 'client') {
            // 如果是远程输入，使用 fromPlayer 作为显示的玩家编号
            const displayPlayer = (data.isRemote && data.fromPlayer) ? data.fromPlayer : data.player;
            this.inputManager.updateTestDisplay(data.button, data.pressed, displayPlayer);
        }
    }

    onGameStart(data) {
        if (this.mode === 'client') {
            this.selectedGameName = data.gameName || '游戏';
            this.selectedGame = data.gameId;
            this.currentPlatform = data.platform || 'nes';
            
            // 所有游戏都使用帧同步模式：P1 运行游戏，P2 接收画面
            this.startGameAsClient();
            this.roomManager.send({ type: 'game-ready', playerNum: this.myPlayerNum });
        }
    }
    
    // 客户端加载 ROM 并启动（已废弃，所有游戏都使用帧同步模式）
    async startGameAsClientWithRom(data) {
        // 不再使用，所有游戏都使用帧同步模式
        console.warn('startGameAsClientWithRom 已废弃，使用帧同步模式');
        this.startGameAsClient();
        this.roomManager.send({ type: 'game-ready', playerNum: this.myPlayerNum });
    }
    
    // 房主收到客户端准备好的消息
    onGameReady(data) {
        if (this.mode !== 'host') return;
        
        const { playerNum, failed } = data;
        console.log(`收到 P${playerNum} 的 game-ready, failed=${failed}`);
        
        if (failed) {
            // 客户端加载失败
            this.ui.showToast(`P${playerNum} 加载游戏失败`);
            this.cancelPendingGameStart();
            return;
        }
        
        this.playersReady[playerNum] = true;
        
        // 检查是否所有玩家都准备好了
        this.checkAllPlayersReady();
    }
    
    // 检查是否所有玩家都准备好
    checkAllPlayersReady() {
        if (!this.pendingGameStart) return;
        
        const connectedPlayers = Object.keys(this.players)
            .filter(p => this.players[p]?.connected && parseInt(p) !== this.myPlayerNum)
            .map(p => parseInt(p));
        
        const allClientsReady = connectedPlayers.every(p => this.playersReady[p]);
        
        // 检查房主的模拟器是否也准备好（EmulatorJS 模式需要等待）
        const hostReady = this.hostEmulatorReady !== false; // undefined 或 true 都算准备好
        
        console.log('检查玩家准备状态:', { 
            connectedPlayers, 
            playersReady: this.playersReady, 
            allClientsReady,
            hostReady 
        });
        
        if (allClientsReady && hostReady) {
            // 所有玩家都准备好了，发送同步开始信号
            this.clearGameStartTimeout();
            console.log('所有玩家准备好，发送 game-sync-start');
            this.roomManager.send({ type: 'game-sync-start' });
            
            // 房主也开始游戏
            this.finishHostGameStart();
        }
    }
    
    // 客户端收到同步开始信号
    onGameSyncStart(data) {
        if (this.mode !== 'client') return;
        
        console.log('收到 game-sync-start，开始游戏');
        this.hideLoadingProgress();
        
        if (this.pendingClientStart) {
            // 完成客户端游戏启动
            this.finishClientGameStart();
        }
    }
    
    // 完成客户端游戏启动
    finishClientGameStart() {
        // 判断是否是街机模式
        const isArcade = this.currentPlatform === 'arcade' || this.emulator.coreType === 'emulatorjs';
        // 客户端是联机模式，显示聊天面板
        this.ui.showGameScreen(true, isArcade, this.selectedGameName);
        
        // 所有游戏都使用帧同步模式，客户端只接收画面
        // 确保 canvas 可见用于显示接收到的帧
        if (this.emulator.canvas) {
            this.emulator.canvas.style.display = 'block';
        }
        // 隐藏 EmulatorJS 容器（客户端不需要运行模拟器）
        if (this.emulator.emulatorContainer) {
            this.emulator.emulatorContainer.classList.add('hidden');
        }
        
        // 设置为客户端模式
        this.emulator.setHost(false);
        this.emulator.isRunning = true;
        
        // 街机游戏隐藏改键按钮，显示按键提示
        if (isArcade) {
            document.getElementById('controls-btn').classList.add('hidden');
            this.ui.showArcadeKeysHint();
        } else {
            document.getElementById('controls-btn').classList.remove('hidden');
        }
        
        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            (inputData) => this.roomManager.send({ type: 'input', ...inputData }),
            (button, pressed, player) => this.roomManager.broadcastInput(button, pressed, player)
        );
        
        // 帧同步模式，客户端不能控制暂停和重置
        document.getElementById('pause-btn').disabled = true;
        document.getElementById('reset-btn').disabled = true;
        
        this.chatManager.init();
        this.voiceChatManager.init();
        this.initPlayerInputPanels();
        
        // 手机端处理：显示提示并设置虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.showMobileHints();
            // NES游戏需要设置虚拟手柄事件
            if (this.currentPlatform !== 'arcade' && this.emulator.coreType !== 'emulatorjs') {
                this.inputManager.setupVirtualGamepad();
            }
        }
        
        this.ui.showToast('游戏同步开始');
        this.pendingClientStart = null;
        window.app = this;
    }
    
    // 取消等待中的游戏开始
    cancelPendingGameStart() {
        this.clearGameStartTimeout();
        this.pendingGameStart = null;
        this.playersReady = {};
        this.hostEmulatorReady = false;
        this.hideLoadingProgress();
        document.getElementById('power-btn').classList.remove('on');
    }
    
    // 清除超时定时器
    clearGameStartTimeout() {
        if (this.gameStartTimeout) {
            clearTimeout(this.gameStartTimeout);
            this.gameStartTimeout = null;
        }
    }
    
    // 设置游戏开始超时
    setGameStartTimeout() {
        this.clearGameStartTimeout();
        this.gameStartTimeout = setTimeout(() => {
            console.log('等待玩家超时');
            this.ui.showToast('等待其他玩家超时，强制开始游戏');
            // 强制开始游戏
            this.hostEmulatorReady = true; // 强制标记为准备好
            this.roomManager.send({ type: 'game-sync-start' });
            this.finishHostGameStart();
        }, 60000); // 60秒超时（增加时间，因为下载模拟器核心可能需要较长时间）
    }

    onFrame(frameData) {
        if (this.mode === 'client') {
            this.emulator.receiveFrame(frameData);
        }
    }
    
    onAudio(audioData) {
        if (this.mode === 'client') {
            this.emulator.receiveAudio(audioData);
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
        // 更新两个位置的延迟显示
        const el = document.getElementById(`latency-p${player}`);
        const tvEl = document.getElementById(`tv-latency-p${player}`);
        
        const updateEl = (element) => {
            if (!element) return;
            if (latency === null) {
                element.textContent = '--ms';
                element.className = 'panel-latency';
            } else {
                element.textContent = `${latency}ms`;
                element.className = 'panel-latency ' + (latency < 50 ? 'good' : latency < 100 ? 'medium' : 'bad');
            }
        };
        
        updateEl(el);
        updateEl(tvEl);
    }

    onInputStateUpdate(data) {
        const { player, button, pressed } = data;
        // 更新所有匹配的手柄面板（包括电视机下方的）
        const panels = document.querySelectorAll(`.player-input-panel[data-player="${player}"]`);
        panels.forEach(panel => {
            panel.classList.add('active');
            // 更新所有匹配的按钮
            const btns = panel.querySelectorAll(`.mini-btn[data-btn="${button}"]`);
            btns.forEach(btn => btn.classList.toggle('active', pressed));
        });
    }
    
    onInputModeChange(data) {
        const { player, isGamepad } = data;
        this.inputManager.handleRemoteInputMode(player, isGamepad);
    }

    initPlayerInputPanels() {
        // 计算需要显示的手柄数量
        // 单人模式：显示2个（支持本地双人）
        // 多人模式：根据房间实际人数显示
        const connectedCount = Object.values(this.players).filter(p => p?.connected).length;
        const panelsToShow = this.mode === 'single' ? 2 : Math.max(connectedCount, 1);
        
        // 获取电视机下方的手柄容器
        const tvControllers = document.getElementById('tv-controllers');
        
        for (let i = 1; i <= 4; i++) {
            // 更新所有手柄面板（包括电视机下方的）
            const panels = document.querySelectorAll(`.player-input-panel[data-player="${i}"]`);
            panels.forEach(panel => {
                // 单人模式显示P1和P2，多人模式根据连接人数显示
                const shouldShow = this.mode === 'single' 
                    ? (i <= 2)  // 单人模式显示P1、P2
                    : (this.players[i]?.connected || i <= panelsToShow);
                panel.classList.toggle('active', shouldShow);
                panel.style.display = shouldShow ? '' : 'none';
            });
            
            // 更新延迟显示（两个位置都更新）
            const el = document.getElementById(`latency-p${i}`);
            const tvEl = document.getElementById(`tv-latency-p${i}`);
            const latencyText = i === this.myPlayerNum ? '本地' : '--ms';
            const latencyClass = 'panel-latency' + (i === this.myPlayerNum ? ' good' : '');
            
            if (el) {
                el.textContent = latencyText;
                el.className = latencyClass;
            }
            if (tvEl) {
                tvEl.textContent = latencyText;
                tvEl.className = latencyClass;
            }
        }
    }
    
    // 更新玩家面板显示（当玩家加入/离开时调用）
    updatePlayerInputPanels() {
        this.initPlayerInputPanels();
    }

    // ========== 座位更新 ==========
    updateSeats() {
        for (let i = 1; i <= 4; i++) {
            const seat = document.getElementById(`seat-${i}`);
            if (!seat) continue;
            
            const player = this.players[i];
            seat.classList.remove('occupied', 'empty', 'me', 'p1', 'p2', 'p3', 'p4');

            // 查找图标元素（兼容新旧结构）
            const iconEl = seat.querySelector('.player-avatar') || seat.querySelector('.player-icon');
            
            if (player?.connected) {
                seat.classList.add('occupied', `p${i}`);
                if (iconEl) iconEl.textContent = ['🧑', '👩', '👨', '🧒'][i - 1];
                if (i === this.myPlayerNum) seat.classList.add('me');
            } else {
                seat.classList.add('empty');
                if (iconEl) iconEl.textContent = '👤';
            }

            const inputPanel = document.querySelector(`.player-input-panel[data-player="${i}"]`);
            if (inputPanel) inputPanel.classList.toggle('active', player?.connected);
        }

        for (let i = 1; i <= 4; i++) {
            const nameEl = document.getElementById(`p${i}-name`);
            if (!nameEl) continue;
            const player = this.players[i];
            nameEl.textContent = player?.connected
                ? (i === this.myPlayerNum ? `${player.name}(你)` : player.name)
                : '-';
        }
    }

    // ========== 游戏选择 ==========
    async loadGameList() {
        // 从本地 roms/nes 目录扫描 NES 游戏列表
        try {
            const response = await fetch('roms-manifest.json');
            if (response.ok) {
                const manifest = await response.json();
                this.allGames = manifest.files.map(f => {
                    const name = f.name.replace('.zip', '').replace('.nes', '');
                    return { id: name, name, icon: this.getGameIcon(name), players: this.guessPlayers(name), platform: 'nes' };
                });
            } else {
                throw new Error();
            }
        } catch {
            // 默认 NES 游戏列表
            this.allGames = [
                { id: '魂斗罗', name: '魂斗罗', icon: '🔫', players: 2, platform: 'nes' },
                { id: '超级魂斗罗', name: '超级魂斗罗', icon: '🔫', players: 2, platform: 'nes' },
                { id: '超级玛莉', name: '超级玛丽', icon: '🍄', players: 1, platform: 'nes' },
                { id: '坦克大战(打坦克，Battle City)', name: '坦克大战', icon: '🎖️', players: 2, platform: 'nes' },
                { id: '雪人兄弟', name: '雪人兄弟', icon: '⛄', players: 2, platform: 'nes' },
                { id: '双截龙', name: '双截龙', icon: '🐉', players: 2, platform: 'nes' },
                { id: '赤色要塞', name: '赤色要塞', icon: '🚁', players: 2, platform: 'nes' },
                { id: '忍者神龟2', name: '忍者神龟2', icon: '🐢', players: 2, platform: 'nes' },
            ];
        }
        
        // 添加街机游戏列表（从 OSS 加载）
        const arcadeGames = getArcadeGameList();
        this.allGames = [...this.allGames, ...arcadeGames];
        
        // 显示默认热门游戏
        this.showDefaultGames();
    }
    
    // 显示默认热门游戏
    showDefaultGames() {
        // 推荐游戏列表（精确匹配）
        const recommendedNES = [
            '超级马里奥兄弟', '超级玛莉', '雪人兄弟', '泡泡龙',
            '魂斗罗经典', '魂斗罗力量', '洛克人', '冒险岛',
            '热血格斗传说', '激龟格斗', '双截龙'
        ];
        const recommendedArcade = [
            '合金弹头', '拳皇97', '街头霸王', '三国志吞食天地2中文',
            '雪人兄弟2', '真人快打'
        ];
        
        // 根据当前模式筛选游戏
        let games;
        if (this.mode === 'host' || this.mode === 'client') {
            // 联机模式：只显示NES游戏
            games = this.allGames.filter(g => g.platform !== 'arcade');
        } else {
            // 单人模式：显示所有游戏
            games = this.allGames;
        }
        
        // 按推荐列表顺序排列游戏
        const recommendedGames = [];
        const allRecommended = this.mode === 'host' || this.mode === 'client' 
            ? recommendedNES 
            : [...recommendedNES, ...recommendedArcade];
        
        // 按推荐顺序查找游戏
        allRecommended.forEach(keyword => {
            const found = games.find(g => g.name.includes(keyword) && !recommendedGames.includes(g));
            if (found) {
                recommendedGames.push(found);
            }
        });
        
        // 限制数量为20个
        this.renderGameResults(recommendedGames.slice(0, 20));
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
        // 搜索框为空时显示默认游戏
        if (!q) {
            this.showDefaultGames();
            return;
        }
        // 联机模式只搜索NES游戏，单人模式搜索所有游戏
        let results;
        if (this.mode === 'host' || this.mode === 'client') {
            // 联机模式：只显示NES游戏
            results = this.allGames.filter(g => 
                g.name.toLowerCase().includes(q) && g.platform !== 'arcade'
            ).slice(0, 30);
        } else {
            // 单人模式：显示所有游戏
            results = this.allGames.filter(g => g.name.toLowerCase().includes(q)).slice(0, 30);
        }
        this.renderGameResults(results);
    }

    renderGameResults(games) {
        const container = document.getElementById('game-results');
        container.innerHTML = '';
        if (games.length === 0) {
            container.innerHTML = '<div class="game-item" style="text-align:center;color:#00aa88;">未找到匹配游戏</div>';
            return;
        }
        games.forEach(game => {
            const item = document.createElement('div');
            // 兼容新旧样式
            item.className = 'game-item game-result-item';
            const platformLabel = game.platform === 'arcade' ? '街机' : 'FC';
            item.innerHTML = `<span class="game-icon">${game.icon}</span><span class="game-name">${game.name}</span><span class="game-platform">${platformLabel}</span>`;
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
        if (cartridge) {
            cartridge.classList.remove('hidden', 'inserting');
            const cartLabel = document.getElementById('cart-label');
            if (cartLabel) cartLabel.textContent = name.substring(0, 8);
            setTimeout(() => cartridge.classList.add('inserting'), 50);
        }
    }

    handleRomUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 支持多平台 ROM 格式
        const supportedFormats = /\.(nes|unf|unif|fds|nsf|jsnes|sfc|smc|md|bin|gen|gba|zip|7z|rar)$/i;
        if (!supportedFormats.test(file.name)) {
            this.ui.showToast('支持: NES/SFC/MD/GBA ROM 文件');
            return;
        }

        // 检测平台
        const platform = detectPlatform(file.name);
        
        // 联机模式下只允许NES游戏
        if ((this.mode === 'host' || this.mode === 'client') && platform !== 'nes') {
            this.ui.showToast('联机模式仅支持NES游戏，其他平台请选择单人模式');
            event.target.value = ''; // 清空文件选择
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.customRom = new Uint8Array(e.target.result);
            this.customRomFilename = file.name;
            this.selectedGame = null;
            this.selectedGameName = file.name.replace(/\.(nes|unf|unif|fds|nsf|jsnes|sfc|smc|md|bin|gen|gba|zip|7z|rar)$/i, '');

            // 检测平台
            if (platform && PLATFORMS[platform]) {
                this.currentPlatform = platform;
                const platformName = PLATFORMS[platform].name;
                document.getElementById('upload-filename').textContent = `✓ ${file.name} [${platformName}]`;
            } else {
                document.getElementById('upload-filename').textContent = `✓ ${file.name}`;
            }

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
        this.arcadeRomName = null; // 重置街机ROM名
        
        if (this.customRom) {
            romData = this.customRom;
        } else if (this.selectedGame) {
            try {
                this.showLoadingProgress(0, '准备加载...');
                romData = await this.loadRomFromServer(this.selectedGame);
                console.log('ROM 数据加载完成, 大小:', romData?.length);
            } catch (error) {
                this.hideLoadingProgress();
                console.error('ROM 加载错误:', error);
                this.ui.showToast(`加载失败: ${error.message}`);
                return;
            }
        }

        if (!romData || romData.length < 16) {
            this.hideLoadingProgress();
            this.ui.showToast('请先选择有效游戏');
            return;
        }

        document.getElementById('power-btn').classList.add('on');

        if (this.mode === 'host') {
            // 检查是否有其他玩家连接
            const connectedPlayers = Object.keys(this.players)
                .filter(p => this.players[p]?.connected && parseInt(p) !== this.myPlayerNum);
            
            if (connectedPlayers.length > 0) {
                // 有其他玩家，需要等待同步
                this.pendingGameStart = { romData };
                this.playersReady = {};
                
                // 发送游戏信息给客户端
                this.roomManager.send({ 
                    type: 'game-start', 
                    gameName: this.selectedGameName,
                    gameId: this.selectedGame,
                    platform: this.currentPlatform,
                    isArcade: isArcadeGame(this.selectedGame)
                });
                
                this.showLoadingProgress(80, '等待其他玩家加载...');
                
                // 设置超时
                this.setGameStartTimeout();
                
                // 房主先加载ROM但不启动
                await this.prepareHostGame(romData);
                return; // 等待客户端准备好后再启动
            }
        }
        
        // 单人模式或房主没有其他玩家，直接开始
        this.hideLoadingProgress();
        this.startGameAsHost(romData);
    }
    
    // 房主预加载游戏（不启动）
    async prepareHostGame(romData) {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        
        console.log('房主预加载 ROM...');
        const filename = this.customRomFilename || this.selectedGame || '';
        
        // 传递街机ROM英文名给模拟器
        if (this.arcadeRomName) {
            this.emulator.arcadeRomName = this.arcadeRomName;
        }
        
        // 设置 EmulatorJS 加载进度回调
        this.emulator.onLoadProgress = (percent, text) => {
            this.showLoadingProgress(percent, text);
        };
        
        // 设置游戏启动完成回调（用于隐藏加载进度）
        this.emulator.onGameStarted = () => {
            this.hideLoadingProgress();
        };
        
        // 提前设置帧同步回调（EmulatorJS 启动时需要）
        this.emulator.onFrameReady = (frameBuffer) => {
            const compressed = this.emulator.compressFrame(frameBuffer);
            this.roomManager.sendFrame(compressed);
        };
        this.emulator.onAudioReady = (audioData) => {
            this.roomManager.sendAudio(audioData);
        };
        
        // 设置房主的模拟器准备好回调（用于 EmulatorJS 模式）
        this.hostEmulatorReady = false;
        this.emulator.onEmulatorReady = () => {
            console.log('房主模拟器完全准备好');
            this.hostEmulatorReady = true;
            // 检查是否可以开始游戏
            this.checkAllPlayersReady();
        };
        
        const loadSuccess = await this.emulator.loadRom(romData, filename);
        
        if (!loadSuccess) {
            const error = this.emulator.getLastError();
            console.error('ROM 加载失败:', error);
            
            let errorMsg = error || 'ROM加载失败，请尝试其他游戏';
            if (error && error.includes('Mapper')) {
                errorMsg = '该ROM使用的芯片类型不兼容，请尝试其他版本的ROM';
            }
            
            this.ui.showToast(errorMsg);
            this.cancelPendingGameStart();
            return;
        }
        
        // 更新当前平台
        this.currentPlatform = this.emulator.platform || 'nes';
        
        // 如果是 JSNES 模式，直接标记为准备好
        if (this.emulator.coreType === 'jsnes') {
            this.hostEmulatorReady = true;
            console.log('房主 JSNES 模式，直接准备好');
        } else {
            console.log('房主 EmulatorJS 模式，等待核心加载完成...');
            this.showLoadingProgress(85, '等待模拟器核心加载...');
        }
        
        console.log('房主ROM预加载完成，等待其他玩家...');
    }
    
    // 房主完成游戏启动（所有玩家准备好后调用）
    finishHostGameStart() {
        this.clearGameStartTimeout();
        this.pendingGameStart = null;
        this.playersReady = {};
        this.hideLoadingProgress();
        
        console.log('所有玩家准备好，房主启动游戏');
        
        // 隐藏加载提示
        this.ui.hideToast();
        
        // 判断是否是街机模式
        const isArcade = this.currentPlatform === 'arcade' || this.emulator.coreType === 'emulatorjs';
        // 单人模式不显示聊天面板
        this.ui.showGameScreen(this.mode !== 'single', isArcade, this.selectedGameName);
        
        // 如果是街机游戏，显示按键提示
        if (isArcade) {
            this.ui.showArcadeKeysHint();
            // 街机游戏隐藏改键按钮
            document.getElementById('controls-btn').classList.add('hidden');
        } else {
            // NES 游戏显示改键按钮
            document.getElementById('controls-btn').classList.remove('hidden');
        }

        // 帧同步回调已在 prepareHostGame 中设置
        // 启动模拟器（EmulatorJS 可能已经在运行，start() 会检查 isRunning）
        this.emulator.start();
        
        console.log('模拟器已启动, isRunning:', this.emulator.isRunning);

        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            () => {},
            (button, pressed, player) => {
                this.roomManager.broadcastInput(button, pressed, player);
            }
        );

        // 联机模式才初始化聊天
        if (this.mode !== 'single') {
            this.chatManager.init();
            this.voiceChatManager.init();
        }
        this.initPlayerInputPanels();

        // 手机端处理：显示提示并设置虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.showMobileHints();
            // NES游戏需要设置虚拟手柄事件
            if (this.currentPlatform !== 'arcade' && this.emulator.coreType !== 'emulatorjs') {
                this.inputManager.setupVirtualGamepad();
            }
        }

        this.ui.showToast('游戏同步开始');
        window.app = this;
    }
    
    // 显示手机端提示（iOS PWA）
    showMobileHints() {
        // 检查是否是iOS Safari且不是PWA模式
        if (this.isIOSSafari() && !this.isStandalone()) {
            this.showIOSPWAHint();
        }
    }
    
    // 检测是否是iOS Safari
    isIOSSafari() {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
        return isIOS && isSafari;
    }
    
    // 检测是否是PWA模式（添加到主屏幕）
    isStandalone() {
        return window.navigator.standalone === true || 
               window.matchMedia('(display-mode: standalone)').matches;
    }
    
    // 显示横屏提示
    showLandscapeHint() {
        const hint = document.getElementById('landscape-hint');
        if (hint) {
            hint.classList.remove('hidden');
            
            const closeBtn = document.getElementById('landscape-close-btn');
            closeBtn?.addEventListener('click', () => {
                hint.classList.add('hidden');
            }, { once: true });
            
            // 监听屏幕方向变化，横屏后自动关闭
            const checkOrientation = () => {
                if (window.innerWidth > window.innerHeight) {
                    hint.classList.add('hidden');
                    window.removeEventListener('resize', checkOrientation);
                }
            };
            window.addEventListener('resize', checkOrientation);
        }
    }
    
    // 显示iOS PWA提示
    showIOSPWAHint() {
        // 检查是否已经选择不再提示
        if (localStorage.getItem('ios_pwa_hint_dismissed') === 'true') {
            return;
        }
        
        const hint = document.getElementById('ios-pwa-hint');
        if (hint) {
            hint.classList.remove('hidden');
            
            const closeBtn = document.getElementById('ios-pwa-close-btn');
            const noShowCheck = document.getElementById('ios-pwa-noshow-check');
            
            closeBtn?.addEventListener('click', () => {
                if (noShowCheck?.checked) {
                    localStorage.setItem('ios_pwa_hint_dismissed', 'true');
                }
                hint.classList.add('hidden');
            }, { once: true });
        }
    }
    
    // 显示加载进度
    showLoadingProgress(percent, text) {
        const overlay = document.getElementById('loading-overlay');
        const progress = document.getElementById('loading-progress');
        const loadingText = document.getElementById('loading-text');
        
        if (overlay) {
            overlay.classList.remove('hidden');
        }
        if (progress) {
            progress.style.width = `${percent}%`;
        }
        if (loadingText) {
            loadingText.textContent = text || `${Math.round(percent)}%`;
        }
    }
    
    // 隐藏加载进度
    hideLoadingProgress() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    async startGameAsHost(romData) {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        
        console.log('开始加载 ROM 到模拟器...');
        // 传递文件名以便平台检测
        const filename = this.customRomFilename || this.selectedGame || '';
        
        // 传递街机ROM英文名给模拟器
        if (this.arcadeRomName) {
            this.emulator.arcadeRomName = this.arcadeRomName;
        }
        
        // 设置 EmulatorJS 加载进度回调
        this.emulator.onLoadProgress = (percent, text) => {
            this.showLoadingProgress(percent, text);
        };
        
        // 设置游戏启动完成回调（用于隐藏加载进度）
        this.emulator.onGameStarted = () => {
            this.hideLoadingProgress();
        };
        
        // 提前设置帧同步回调（EmulatorJS 启动时需要）
        if (this.mode === 'host') {
            this.emulator.onFrameReady = (frameBuffer) => {
                const compressed = this.emulator.compressFrame(frameBuffer);
                this.roomManager.sendFrame(compressed);
            };
            this.emulator.onAudioReady = (audioData) => {
                this.roomManager.sendAudio(audioData);
            };
        }
        
        const loadSuccess = await this.emulator.loadRom(romData, filename);
        console.log('ROM 加载结果:', loadSuccess);
        
        if (!loadSuccess) {
            const error = this.emulator.getLastError();
            console.error('ROM 加载失败:', error);
            
            // 针对 Mapper 不支持的错误给出更友好的提示
            let errorMsg = error || 'ROM加载失败，请尝试其他游戏';
            if (error && error.includes('Mapper')) {
                errorMsg = '该ROM使用的芯片类型不兼容，请尝试其他版本的ROM';
            }
            
            this.ui.showToast(errorMsg);
            document.getElementById('power-btn').classList.remove('on');
            return;
        }
        
        // 更新当前平台
        this.currentPlatform = this.emulator.platform || 'nes';
        
        // 隐藏加载提示
        this.ui.hideToast();
        
        // 判断是否是街机模式
        const isArcade = this.currentPlatform === 'arcade' || this.emulator.coreType === 'emulatorjs';
        
        console.log('切换到游戏画面');
        // 单人模式不显示聊天面板
        this.ui.showGameScreen(this.mode !== 'single', isArcade, this.selectedGameName);
        
        // 根据游戏类型显示/隐藏改键按钮
        if (isArcade) {
            // 街机游戏隐藏改键按钮，显示按键提示
            document.getElementById('controls-btn').classList.add('hidden');
            this.ui.showArcadeKeysHint();
        } else {
            // NES 游戏显示改键按钮
            document.getElementById('controls-btn').classList.remove('hidden');
        }

        console.log('启动模拟器');
        this.emulator.start();
        
        console.log('模拟器已启动, isRunning:', this.emulator.isRunning);

        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            () => {},
            (button, pressed, player) => {
                if (this.mode !== 'single') {
                    this.roomManager.broadcastInput(button, pressed, player);
                } else {
                    this.roomManager.updateInputState(player, button, pressed);
                }
            }
        );

        // 联机模式才初始化聊天
        if (this.mode !== 'single') {
            this.chatManager.init();
        }
        this.initPlayerInputPanels();

        // 手机端处理：显示提示并设置虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.showMobileHints();
            // NES游戏需要设置虚拟手柄事件
            if (this.currentPlatform !== 'arcade' && this.emulator.coreType !== 'emulatorjs') {
                this.inputManager.setupVirtualGamepad();
            }
        }

        window.app = this;
    }

    startGameAsClient() {
        document.getElementById('current-game-title').textContent = this.selectedGameName;
        // 判断是否是街机模式
        const isArcade = this.currentPlatform === 'arcade';
        // 客户端是联机模式，显示聊天面板
        this.ui.showGameScreen(true, isArcade, this.selectedGameName);
        
        // 根据游戏类型显示/隐藏改键按钮
        if (isArcade) {
            // 街机游戏隐藏改键按钮，显示按键提示
            document.getElementById('controls-btn').classList.add('hidden');
            this.ui.showArcadeKeysHint();
        } else {
            // NES 游戏显示改键按钮
            document.getElementById('controls-btn').classList.remove('hidden');
        }
        
        // 客户端不运行模拟器，只接收帧数据
        // 确保 canvas 可见用于显示接收到的帧
        if (this.emulator.canvas) {
            this.emulator.canvas.style.display = 'block';
            console.log('客户端 Canvas 已设置为可见');
        } else {
            console.warn('客户端 Canvas 未找到！');
        }
        // 隐藏 EmulatorJS 容器（客户端不需要）
        if (this.emulator.emulatorContainer) {
            this.emulator.emulatorContainer.classList.add('hidden');
        }
        
        // 设置为客户端模式
        this.emulator.setHost(false);
        this.emulator.isRunning = true;
        
        // 确保 canvas 和 context 已初始化
        if (!this.emulator.ctx && this.emulator.canvas) {
            this.emulator.ctx = this.emulator.canvas.getContext('2d', { alpha: false });
            if (this.emulator.ctx) {
                this.emulator.ctx.imageSmoothingEnabled = false;
                console.log('客户端 Canvas Context 已初始化');
            }
        }

        this.inputManager.setLocalPlayer(this.myPlayerNum);
        this.inputManager.start(
            (inputData) => this.roomManager.send({ type: 'input', ...inputData }),
            (button, pressed, player) => this.roomManager.broadcastInput(button, pressed, player)
        );

        document.getElementById('pause-btn').disabled = true;
        document.getElementById('reset-btn').disabled = true;

        this.chatManager.init();
        this.initPlayerInputPanels();

        // 手机端处理：显示提示并设置虚拟手柄
        if (this.inputManager.isMobileDevice()) {
            this.showMobileHints();
            // NES游戏需要设置虚拟手柄事件
            if (this.currentPlatform !== 'arcade' && this.emulator.coreType !== 'emulatorjs') {
                this.inputManager.setupVirtualGamepad();
            }
        }

        window.app = this;
    }

    togglePause() {
        if (this.mode === 'client') return;
        const paused = this.emulator.togglePause();
        document.getElementById('pause-btn').textContent = paused ? '▶ 继续' : '⏸ 暂停';
        if (this.mode === 'host') this.roomManager.send({ type: 'pause', paused });
    }
    
    // 切换街机模拟器菜单（手机端）
    toggleArcadeMenu() {
        if (this.emulator.coreType !== 'emulatorjs') return;
        
        const emulatorContainer = document.getElementById('tv-emulator-container');
        if (!emulatorContainer) return;
        
        // 方法1: 尝试直接调用 EmulatorJS 的菜单 API
        if (window.EJS_emulator) {
            try {
                // 尝试使用 EmulatorJS 的 menu 对象
                if (window.EJS_emulator.menu) {
                    if (window.EJS_emulator.menu.toggle) {
                        window.EJS_emulator.menu.toggle();
                        return;
                    }
                    if (window.EJS_emulator.menu.open) {
                        window.EJS_emulator.menu.open();
                        return;
                    }
                }
            } catch (e) {
                console.warn('EmulatorJS 菜单 API 调用失败:', e);
            }
        }
        
        // 方法2: 查找并切换 EmulatorJS 的底部菜单栏
        // EmulatorJS 的菜单栏类名通常包含 ejs_menu_bar 或 ejs_bottom
        const menuSelectors = [
            '.ejs_menu_bar',
            '.ejs_bottom_bar', 
            '.ejs_menu_container',
            '[class*="ejs_menu"]',
            '[class*="ejs_bottom"]'
        ];
        
        for (const selector of menuSelectors) {
            const menuBar = emulatorContainer.querySelector(selector);
            if (menuBar) {
                // 切换菜单栏显示
                const currentDisplay = window.getComputedStyle(menuBar).display;
                const currentOpacity = window.getComputedStyle(menuBar).opacity;
                
                if (currentDisplay === 'none' || currentOpacity === '0') {
                    menuBar.style.display = 'flex';
                    menuBar.style.opacity = '1';
                    menuBar.style.visibility = 'visible';
                } else {
                    menuBar.style.opacity = '0';
                    setTimeout(() => {
                        menuBar.style.display = 'none';
                    }, 200);
                }
                return;
            }
        }
        
        // 方法3: 模拟点击游戏画面来触发菜单（EmulatorJS 默认行为）
        const gameCanvas = emulatorContainer.querySelector('canvas');
        if (gameCanvas) {
            // 创建并触发点击事件
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            gameCanvas.dispatchEvent(clickEvent);
        }
    }

    resetGame() {
        if (this.mode === 'client') return;
        
        // 暂停输入处理
        if (this.inputManager) {
            this.inputManager.stop();
        }
        
        // 重置模拟器
        this.emulator.reset();
        
        // 重新启动输入处理
        setTimeout(() => {
            if (this.inputManager && this.emulator.isRunning) {
                this.inputManager.start(
                    (inputData) => this.roomManager?.send({ type: 'input', ...inputData }),
                    (button, pressed, player) => this.roomManager?.broadcastInput(button, pressed, player)
                );
            }
        }, 100);
        
        this.ui.showToast('游戏已重置');
        if (this.mode === 'host') this.roomManager.send({ type: 'reset' });
    }

    toggleFullscreen() {
        // iOS Safari 不支持全屏API，显示PWA提示
        if (this.isIOSSafari()) {
            this.showIOSPWAHint();
            return;
        }
        
        const screen = document.querySelector('.screen-wrapper');
        if (!document.fullscreenElement) {
            screen.requestFullscreen().catch(() => this.ui.showToast('无法进入全屏'));
        } else {
            document.exitFullscreen();
        }
    }

    togglePageFullscreen() {
        // iOS Safari 不支持全屏API，显示PWA提示
        if (this.isIOSSafari()) {
            this.showIOSPWAHint();
            return;
        }
        
        const elem = document.documentElement;
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => this.ui.showToast('无法进入全屏'));
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            document.exitFullscreen();
        }
    }

    // ========== 存档功能 ==========
    bindSaveModalEvents() {
        // 关闭存档弹窗
        document.getElementById('close-save-btn').addEventListener('click', () => this.closeSaveModal());
        document.querySelector('#save-modal .modal-overlay').addEventListener('click', () => this.closeSaveModal());
        
        // 存档/读档标签切换
        document.querySelectorAll('.save-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.save-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.saveMode = e.target.dataset.mode;
                this.renderSaveSlots();
            });
        });
        
        // 快捷键: F5 快速存档, F7 快速读档
        document.addEventListener('keydown', (e) => {
            if (!this.emulator.isRunning) return;
            
            if (e.key === 'F5') {
                e.preventDefault();
                this.quickSave();
            } else if (e.key === 'F7') {
                e.preventDefault();
                this.quickLoad();
            }
        });
    }
    
    openSaveModal() {
        if (this.mode === 'client') {
            this.ui.showToast('只有房主可以存档');
            return;
        }
        
        // 暂停游戏
        if (!this.emulator.isPaused) {
            this.emulator.isPaused = true;
        }
        
        this.saveMode = 'save';
        document.querySelectorAll('.save-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.save-tab[data-mode="save"]').classList.add('active');
        
        document.getElementById('save-modal').classList.remove('hidden');
        this.renderSaveSlots();
        this.updateStorageInfo();
    }
    
    closeSaveModal() {
        document.getElementById('save-modal').classList.add('hidden');
    }
    
    getGameId() {
        // 使用游戏名称作为存档 ID
        return this.selectedGameName || this.selectedGame || 'unknown';
    }
    
    renderSaveSlots() {
        const container = document.getElementById('save-slots');
        const gameId = this.getGameId();
        const saves = this.emulator.getSaveList(gameId);
        const maxSlots = 5;
        
        container.innerHTML = '';
        
        for (let i = 0; i < maxSlots; i++) {
            const save = saves.find(s => s.slotIndex === i);
            const slot = document.createElement('div');
            slot.className = 'save-slot' + (save ? ' has-save' : ' empty');
            slot.dataset.slot = i;
            
            if (save) {
                const date = new Date(save.timestamp);
                const timeStr = date.toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                slot.innerHTML = `
                    <div class="slot-thumbnail">
                        ${save.thumbnail ? `<img src="${save.thumbnail}" alt="截图">` : '<div class="no-thumb">📷</div>'}
                    </div>
                    <div class="slot-info">
                        <div class="slot-name">${save.slotName}</div>
                        <div class="slot-time">${timeStr}</div>
                    </div>
                    <div class="slot-actions">
                        ${this.saveMode === 'save' 
                            ? '<button class="slot-btn save-btn" title="覆盖存档">💾</button>' 
                            : '<button class="slot-btn load-btn" title="读取存档">▶</button>'}
                        <button class="slot-btn delete-btn" title="删除存档">🗑️</button>
                    </div>
                `;
            } else {
                slot.innerHTML = `
                    <div class="slot-thumbnail">
                        <div class="no-thumb">空</div>
                    </div>
                    <div class="slot-info">
                        <div class="slot-name">存档 ${i + 1}</div>
                        <div class="slot-time">空槽位</div>
                    </div>
                    <div class="slot-actions">
                        ${this.saveMode === 'save' 
                            ? '<button class="slot-btn save-btn" title="保存到此槽位">💾</button>' 
                            : '<span class="slot-empty-hint">无存档</span>'}
                    </div>
                `;
            }
            
            // 绑定事件
            const saveBtn = slot.querySelector('.save-btn');
            const loadBtn = slot.querySelector('.load-btn');
            const deleteBtn = slot.querySelector('.delete-btn');
            
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.saveToSlot(i);
                });
            }
            
            if (loadBtn) {
                loadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadFromSlot(i);
                });
            }
            
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteSlot(i);
                });
            }
            
            container.appendChild(slot);
        }
    }
    
    saveToSlot(slotIndex) {
        const gameId = this.getGameId();
        const result = this.emulator.saveGame(gameId, slotIndex, `存档 ${slotIndex + 1}`);
        
        if (result.success) {
            this.ui.showToast(`存档成功: 存档 ${slotIndex + 1}`);
            this.renderSaveSlots();
            this.updateStorageInfo();
        } else {
            this.ui.showToast(`存档失败: ${result.error}`);
        }
    }
    
    loadFromSlot(slotIndex) {
        const gameId = this.getGameId();
        const result = this.emulator.loadGame(gameId, slotIndex);
        
        if (result.success) {
            this.ui.showToast(`读档成功: ${result.save.slotName}`);
            this.closeSaveModal();
            // 恢复游戏
            this.emulator.isPaused = false;
            document.getElementById('pause-btn').textContent = '⏸ 暂停';
        } else {
            this.ui.showToast(`读档失败: ${result.error}`);
        }
    }
    
    deleteSlot(slotIndex) {
        if (!confirm(`确定要删除存档 ${slotIndex + 1} 吗？`)) {
            return;
        }
        
        const gameId = this.getGameId();
        const result = this.emulator.deleteSave(gameId, slotIndex);
        
        if (result.success) {
            this.ui.showToast('存档已删除');
            this.renderSaveSlots();
            this.updateStorageInfo();
        } else {
            this.ui.showToast(`删除失败: ${result.error}`);
        }
    }
    
    quickSave() {
        if (this.mode === 'client') return;
        
        const gameId = this.getGameId();
        const result = this.emulator.quickSave(gameId);
        
        if (result.success) {
            this.ui.showToast('快速存档成功 (F7 读档)');
        } else {
            this.ui.showToast(`存档失败: ${result.error}`);
        }
    }
    
    quickLoad() {
        if (this.mode === 'client') return;
        
        const gameId = this.getGameId();
        const result = this.emulator.quickLoad(gameId);
        
        if (result.success) {
            this.ui.showToast('快速读档成功');
        } else {
            this.ui.showToast(`读档失败: ${result.error}`);
        }
    }
    
    updateStorageInfo() {
        const info = this.emulator.getStorageInfo();
        document.getElementById('storage-info').textContent = `存储使用: ${info.usedMB} MB`;
    }

    exitGame() {
        // 完全停止模拟器（包括 EmulatorJS）
        this.emulator.stop();
        this.emulator.onFrameReady = null;
        
        // 强制清理 EmulatorJS 实例
        this.cleanupEmulatorJS();
        
        this.inputManager.stop();
        this.inputManager.resetRemotePlayers(); // 重置远程玩家状态
        this.inputManager.hideVirtualGamepad();
        this.chatManager?.destroy();
        
        // 隐藏手机端提示
        document.getElementById('landscape-hint')?.classList.add('hidden');
        document.getElementById('ios-pwa-hint')?.classList.add('hidden');

        document.getElementById('power-btn').classList.remove('on');
        document.getElementById('pause-btn').textContent = '⏸ 暂停';
        document.getElementById('pause-btn').disabled = false;
        document.getElementById('reset-btn').disabled = false;

        this.ui.hideGameScreen();
        this.ui.showRoomPanel();
    }
    
    // 清理 EmulatorJS 实例
    cleanupEmulatorJS() {
        // 停止 EmulatorJS 的音频
        if (window.EJS_emulator) {
            try {
                // 尝试暂停/停止 EmulatorJS
                if (window.EJS_emulator.pause) {
                    window.EJS_emulator.pause();
                }
                if (window.EJS_emulator.stop) {
                    window.EJS_emulator.stop();
                }
                // 静音
                if (window.EJS_emulator.setVolume) {
                    window.EJS_emulator.setVolume(0);
                }
            } catch (e) {
                console.warn('停止 EmulatorJS 失败:', e);
            }
        }
        
        // 清理 EmulatorJS 容器
        const container = document.getElementById('tv-emulator-container');
        if (container) {
            // 移除所有子元素（包括 iframe、canvas 等）
            container.innerHTML = '';
        }
        
        // 只清理配置变量，不清理类定义（如 EJS_STORAGE, EJS_COMPRESSION 等）
        const configVars = [
            'EJS_player', 'EJS_core', 'EJS_gameUrl', 'EJS_gameName',
            'EJS_pathtodata', 'EJS_startOnLoaded', 'EJS_color',
            'EJS_backgroundColor', 'EJS_loadStateURL', 'EJS_DEBUG_XX',
            'EJS_biosUrl', 'EJS_onGameStart', 'EJS_onLoadState',
            'EJS_defaultControls', 'EJS_defaultOptions', 'EJS_Buttons',
            'EJS_language', 'EJS_Settings', 'EJS_ready', 'EJS_onReady'
        ];
        
        // 实例变量（可以清理）
        const instanceVars = ['EJS_emulator', 'EJS_main', 'EJS_LOADED', 'EJS_INIT'];
        
        [...configVars, ...instanceVars].forEach(v => {
            try {
                if (window[v] !== undefined) {
                    delete window[v];
                }
            } catch (e) {}
        });
        
        // 不移除脚本，因为会破坏 EmulatorJS 的类定义
        
        console.log('EmulatorJS 已清理');
    }

    async loadRomFromServer(gameId) {
        // 检查是否是街机游戏（中文名）
        if (isArcadeGame(gameId)) {
            return await this.loadArcadeRom(gameId);
        }
        
        // 先检查缓存
        const cached = await romCache.get(gameId, 'nes');
        if (cached) {
            this.showLoadingProgress(100, '从缓存加载');
            console.log(`从缓存加载NES游戏: ${gameId}`);
            return cached.data;
        }
        
        // NES 游戏：优先从本地 roms/nes 目录读取
        // 统一处理空格问题：将空格替换为下划线
        const sanitizedGameId = gameId.replace(/ /g, '_').replace(/，/g, '_').replace(/,/g, '_');
        const encodedGameId = encodeURIComponent(sanitizedGameId);
        
        // 同时尝试原始名称（兼容旧文件）
        const encodedOriginalId = encodeURIComponent(gameId);
        
        const urls = [
            `roms/nes/${encodedGameId}.zip`,
            `roms/nes/${encodedGameId}.nes`,
            `roms/nes/${encodedOriginalId}.zip`,
            `roms/nes/${encodedOriginalId}.nes`
        ];

        this.showLoadingProgress(10, '加载NES游戏...');

        for (const url of urls) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    this.showLoadingProgress(50, '读取数据...');
                    const data = await res.arrayBuffer();
                    this.showLoadingProgress(80, '解析ROM...');
                    // 检查是否是 ZIP 文件
                    const header = new Uint8Array(data.slice(0, 4));
                    let romData;
                    if (header[0] === 0x50 && header[1] === 0x4B) {
                        romData = await this.extractRomFromZip(data);
                    } else {
                        // 直接是 ROM 文件
                        romData = new Uint8Array(data);
                    }
                    
                    // 缓存ROM（本地文件也缓存，方便离线使用）
                    await romCache.set(gameId, 'nes', romData);
                    return romData;
                }
            } catch (e) {
                console.warn(`加载 ${url} 失败:`, e);
            }
        }
        
        // 本地未找到，尝试从边缘函数 KV 下载
        console.log(`本地未找到 ${gameId}，尝试从KV下载...`);
        return await this.loadRomFromKV(gameId);
    }

    // 从阿里云边缘函数 KV 存储下载 NES 游戏
    // KV 存储格式: key = roms:{游戏名}.nes 或 roms:{游戏名}.NES
    async loadRomFromKV(gameId) {
        // 边缘函数 API 地址
        const EDGE_API_BASE = 'https://arcade.188np.cn';
        
        this.showLoadingProgress(20, '从云端下载...');
        
        // 清理游戏名称（与边缘函数 sanitizeKey 保持一致）
        const sanitizedId = gameId.replace(/ /g, '_').replace(/，/g, '_').replace(/,/g, '_');
        
        // 调用边缘函数 API
        const apiUrl = `${EDGE_API_BASE}/api/rom/${encodeURIComponent(sanitizedId)}`;
        console.log(`KV API URL: ${apiUrl}`);
        
        try {
            const res = await fetch(apiUrl);
            
            if (!res.ok) {
                if (res.status === 404) {
                    throw new Error(`游戏 "${gameId}" 在云端不存在`);
                }
                throw new Error(`下载失败: ${res.status}`);
            }
            
            // 获取文件大小用于进度显示
            const contentLength = res.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            
            let romData;
            
            if (total > 0) {
                // 流式读取显示进度
                const reader = res.body.getReader();
                const chunks = [];
                let received = 0;
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    received += value.length;
                    
                    const percent = 20 + Math.round((received / total) * 60);
                    this.showLoadingProgress(percent, `下载中 ${Math.round(received / 1024)}KB`);
                }
                
                // 合并数据
                romData = new Uint8Array(received);
                let position = 0;
                for (const chunk of chunks) {
                    romData.set(chunk, position);
                    position += chunk.length;
                }
                
                this.showLoadingProgress(85, '解析ROM...');
                
                // 检查是否是 ZIP 文件
                if (romData[0] === 0x50 && romData[1] === 0x4B) {
                    romData = await this.extractRomFromZip(romData.buffer);
                }
            } else {
                // 无法获取大小，普通方式下载
                this.showLoadingProgress(50, '下载中...');
                const data = await res.arrayBuffer();
                romData = new Uint8Array(data);
                
                this.showLoadingProgress(85, '解析ROM...');
                
                // 检查是否是 ZIP 文件
                if (romData[0] === 0x50 && romData[1] === 0x4B) {
                    romData = await this.extractRomFromZip(data);
                }
            }
            
            // 缓存下载的ROM
            await romCache.set(gameId, 'nes', romData);
            
            console.log(`KV ROM 加载成功: ${romData.length} bytes`);
            return romData;
        } catch (e) {
            console.error('KV 下载失败:', e);
            throw new Error(`无法加载 "${gameId}": ${e.message}`);
        }
    }

    // 加载街机ROM（通过边缘函数代理下载，隐藏真实OSS地址）
    async loadArcadeRom(chineseName) {
        const englishName = getArcadeRomName(chineseName);
        if (!englishName) {
            throw new Error(`未找到街机游戏: ${chineseName}`);
        }
        
        // 先检查缓存
        const cached = await romCache.get(chineseName, 'arcade');
        if (cached) {
            this.showLoadingProgress(100, '从缓存加载');
            console.log(`从缓存加载街机游戏: ${chineseName}`);
            // 恢复街机ROM名
            this.arcadeRomName = cached.romName || englishName;
            this.currentPlatform = 'arcade';
            return cached.data;
        }
        
        // 通过边缘函数代理下载（不需要 .zip 后缀，边缘函数会自动处理）
        const proxyUrl = `${ARCADE_OSS_BASE}/${encodeURIComponent(chineseName)}`;
        console.log(`加载街机ROM: ${chineseName} -> ${englishName}`);
        console.log(`代理URL: ${proxyUrl}`);
        
        try {
            this.showLoadingProgress(0, '连接服务器...');
            
            // 先请求边缘函数，检查是否返回重定向JSON（大文件）
            const res = await fetch(proxyUrl, {
                redirect: 'manual',  // 不自动跟随，先检查响应
                mode: 'cors'
            });
            
            // 检查是否是 JSON 响应（大文件返回签名URL）
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const jsonData = await res.json();
                
                // 检查是否是错误响应
                if (jsonData.error) {
                    throw new Error(jsonData.error);
                }
                
                // 大文件：边缘函数返回签名URL，直接从七牛云下载
                if (jsonData.redirect && jsonData.url) {
                    console.log(`大文件模式: ${(jsonData.size / 1024 / 1024).toFixed(2)} MB`);
                    console.log(`直接下载URL: ${jsonData.url.substring(0, 80)}...`);
                    return await this.downloadFromUrl(jsonData.url, jsonData.size, englishName, chineseName);
                }
            }
            
            if (!res.ok) {
                throw new Error(`下载失败: ${res.status}`);
            }
            
            // 小文件：边缘函数直接返回数据
            return await this.downloadFromResponse(res, englishName, 0, chineseName);
            
        } catch (e) {
            console.error('街机ROM加载失败:', e);
            throw new Error(`加载街机游戏失败: ${chineseName}`);
        }
    }
    
    // 从URL直接下载（大文件，绕过边缘函数）
    async downloadFromUrl(url, expectedSize, englishName, chineseName = '') {
        this.showLoadingProgress(5, '连接下载服务器...');
        
        const res = await fetch(url, {
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!res.ok) {
            throw new Error(`下载失败: ${res.status}`);
        }
        
        return await this.downloadFromResponse(res, englishName, expectedSize, chineseName);
    }
    
    // 从 Response 流式下载并显示进度
    async downloadFromResponse(res, englishName, expectedSize = 0, chineseName = '') {
        const contentLength = res.headers.get('content-length');
        const total = expectedSize || (contentLength ? parseInt(contentLength, 10) : 0);
        
        console.log(`文件大小: ${total > 0 ? (total / 1024 / 1024).toFixed(2) + ' MB' : '未知'}`);
        
        let romData;
        
        if (total > 0 && res.body) {
            // 使用流式读取显示进度
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                received += value.length;
                
                const percent = Math.round((received / total) * 100);
                const sizeMB = (received / 1024 / 1024).toFixed(1);
                const totalMB = (total / 1024 / 1024).toFixed(1);
                this.showLoadingProgress(percent, `下载中 ${sizeMB}/${totalMB} MB`);
            }
            
            // 合并所有块
            romData = new Uint8Array(received);
            let position = 0;
            for (const chunk of chunks) {
                romData.set(chunk, position);
                position += chunk.length;
            }
        } else {
            // 无法获取大小，使用普通方式
            this.showLoadingProgress(50, '下载中...');
            const zipData = await res.arrayBuffer();
            romData = new Uint8Array(zipData);
        }
        
        // 保存英文ROM名供模拟器使用
        this.arcadeRomName = englishName;
        this.currentPlatform = 'arcade';
        
        // 缓存下载的ROM
        if (chineseName) {
            await romCache.set(chineseName, 'arcade', romData, englishName);
        }
        
        console.log(`街机ROM加载成功: ${romData.length} bytes`);
        return romData;
    }

    async extractRomFromZip(zipData) {
        const zip = await window.JSZip.loadAsync(zipData);
        const files = Object.keys(zip.files).filter(f => !zip.files[f].dir);
        
        // 支持多平台 ROM 扩展名
        const romExtensions = [
            '.nes', '.unf', '.unif', '.fds',  // NES
            '.sfc', '.smc',                    // SNES
            '.md', '.bin', '.gen', '.smd',     // MD/Genesis
            '.gba', '.agb',                    // GBA
            '.zip'                             // Arcade (nested zip)
        ];
        
        for (const ext of romExtensions) {
            for (const f of files) {
                if (f.toLowerCase().endsWith(ext)) {
                    return await zip.files[f].async('uint8array');
                }
            }
        }
        
        // 如果没有匹配的扩展名，返回第一个文件
        if (files.length > 0) {
            return await zip.files[files[0]].async('uint8array');
        }
        
        throw new Error('ZIP中未找到ROM');
    }
}

// 启动
const app = new GameApp();
app.init().catch(console.error);
