// UI管理器
export class UIManager {
    constructor() {
        this.elements = {
            modePanel: document.getElementById('mode-panel'),
            roomPanel: document.getElementById('room-panel'),
            gameScreen: document.getElementById('game-screen'),
            toast: document.getElementById('toast'),
            virtualGamepad: document.getElementById('virtual-gamepad'),
            controlsModal: document.getElementById('controls-modal'),
            chatPanel: document.getElementById('chat-panel'),
            tvGameScreen: document.getElementById('tv-game-screen'),
            tvPreview: document.getElementById('tv-preview')
        };
    }

    showRoomPanel() {
        this.elements.modePanel.classList.add('hidden');
        this.elements.roomPanel.classList.remove('hidden');
        // 隐藏标题区域，给房间面板更多空间
        const heroHeader = document.querySelector('.hero-header');
        if (heroHeader) heroHeader.classList.add('hidden');
        
        // 确保电视机显示房间选择界面
        this.showTvRoomSelect();
    }

    hideRoomPanel() {
        this.elements.roomPanel.classList.add('hidden');
        this.elements.modePanel.classList.remove('hidden');
        // 恢复标题区域
        const heroHeader = document.querySelector('.hero-header');
        if (heroHeader) heroHeader.classList.remove('hidden');
    }
    
    // 显示电视机内的房间选择界面
    showTvRoomSelect() {
        // 显示房间选择相关元素
        const roomHeader = document.querySelector('.tv-room-header');
        const players = document.querySelector('.tv-players');
        const search = document.querySelector('.tv-search');
        const gameList = document.getElementById('game-results');
        
        if (roomHeader) roomHeader.style.display = '';
        if (players) players.style.display = '';
        if (search) search.style.display = '';
        if (gameList) gameList.style.display = '';
        
        // 移除游戏中状态class
        this.elements.roomPanel?.classList.remove('game-playing');
        
        // 隐藏游戏画面
        if (this.elements.tvGameScreen) {
            this.elements.tvGameScreen.classList.add('hidden');
        }
        
        // 切换操作按钮
        const selectActions = document.querySelector('.tv-select-actions');
        const gameActions = document.querySelector('.tv-game-actions');
        if (selectActions) selectActions.classList.remove('hidden');
        if (gameActions) gameActions.classList.add('hidden');
        
        // 隐藏两侧虚拟手柄
        const leftControllers = document.getElementById('tv-controllers-left');
        const rightControllers = document.getElementById('tv-controllers-right');
        if (leftControllers) leftControllers.classList.remove('visible');
        if (rightControllers) rightControllers.classList.remove('visible');
    }
    
    // 显示电视机内的游戏画面
    showTvGameScreen(gameName) {
        // 隐藏房间选择相关元素
        const roomHeader = document.querySelector('.tv-room-header');
        const players = document.querySelector('.tv-players');
        const search = document.querySelector('.tv-search');
        const gameList = document.getElementById('game-results');
        
        if (roomHeader) roomHeader.style.display = 'none';
        if (players) players.style.display = 'none';
        if (search) search.style.display = 'none';
        if (gameList) gameList.style.display = 'none';
        
        // 添加游戏中状态class
        this.elements.roomPanel?.classList.add('game-playing');
        
        // 显示游戏画面
        if (this.elements.tvGameScreen) {
            this.elements.tvGameScreen.classList.remove('hidden');
            const titleEl = document.getElementById('tv-game-title');
            if (titleEl && gameName) {
                titleEl.textContent = gameName;
            }
        }
        
        // 切换操作按钮
        const selectActions = document.querySelector('.tv-select-actions');
        const gameActions = document.querySelector('.tv-game-actions');
        if (selectActions) selectActions.classList.add('hidden');
        if (gameActions) gameActions.classList.remove('hidden');
        
        // 显示两侧虚拟手柄
        const leftControllers = document.getElementById('tv-controllers-left');
        const rightControllers = document.getElementById('tv-controllers-right');
        if (leftControllers) leftControllers.classList.add('visible');
        if (rightControllers) rightControllers.classList.add('visible');
    }

    showGameScreen(showChat = true, isArcade = false, gameName = '') {
        console.log('切换到游戏画面, isArcade:', isArcade);
        
        // 在电视机内显示游戏画面
        this.showTvGameScreen(gameName);
        
        // 更新电源按钮状态
        const powerBtn = document.getElementById('power-btn');
        if (powerBtn) powerBtn.classList.add('on');
        
        // 街机模式添加特殊class
        if (isArcade) {
            this.elements.roomPanel?.classList.add('arcade-mode');
            // 街机模式隐藏暂停和存档按钮（模拟器自带）
            const pauseBtn = document.getElementById('pause-btn');
            const saveBtn = document.getElementById('save-btn');
            const resetBtn = document.getElementById('reset-btn');
            if (pauseBtn) pauseBtn.classList.add('hidden');
            if (saveBtn) saveBtn.classList.add('hidden');
            if (resetBtn) resetBtn.classList.add('hidden');
        } else {
            this.elements.roomPanel?.classList.remove('arcade-mode');
            // NES模式显示暂停和存档按钮
            const pauseBtn = document.getElementById('pause-btn');
            const saveBtn = document.getElementById('save-btn');
            const resetBtn = document.getElementById('reset-btn');
            if (pauseBtn) pauseBtn.classList.remove('hidden');
            if (saveBtn) saveBtn.classList.remove('hidden');
            if (resetBtn) resetBtn.classList.remove('hidden');
        }
        
        // 根据参数决定是否显示聊天面板（单人模式不显示）
        if (showChat) {
            this.elements.chatPanel?.classList.remove('hidden');
        } else {
            this.elements.chatPanel?.classList.add('hidden');
        }
        
        // 确保 mode-panel 也隐藏
        this.elements.modePanel.classList.add('hidden');
        
        // 手机端：NES游戏显示虚拟手柄，街机游戏不显示（使用EmulatorJS自带的）
        if (this.isMobile() && !isArcade) {
            this.elements.virtualGamepad?.classList.remove('hidden');
        } else {
            this.elements.virtualGamepad?.classList.add('hidden');
        }
        
        // 手机端街机模式显示菜单按钮
        const arcadeMenuBtn = document.getElementById('arcade-menu-btn');
        if (arcadeMenuBtn) {
            if (isArcade && this.isMobile()) {
                arcadeMenuBtn.classList.remove('hidden');
            } else {
                arcadeMenuBtn.classList.add('hidden');
            }
        }
    }

    hideGameScreen() {
        // 恢复电视机内的房间选择界面
        this.showTvRoomSelect();
        
        // 更新电源按钮状态
        const powerBtn = document.getElementById('power-btn');
        if (powerBtn) powerBtn.classList.remove('on');
        
        this.elements.roomPanel?.classList.remove('arcade-mode');
        this.elements.virtualGamepad?.classList.add('hidden');
        this.elements.chatPanel?.classList.add('hidden');
        
        // 恢复暂停、存档、重置按钮显示
        const pauseBtn = document.getElementById('pause-btn');
        const saveBtn = document.getElementById('save-btn');
        const resetBtn = document.getElementById('reset-btn');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (resetBtn) resetBtn.classList.remove('hidden');
        
        // 隐藏街机按键提示
        this.hideArcadeKeysHint();
        // 隐藏街机菜单按钮
        const arcadeMenuBtn = document.getElementById('arcade-menu-btn');
        if (arcadeMenuBtn) {
            arcadeMenuBtn.classList.add('hidden');
        }
    }
    
    // 显示街机按键提示
    showArcadeKeysHint() {
        const hint = document.getElementById('arcade-keys-hint');
        if (hint) {
            hint.classList.remove('hidden');
            // 不再自动隐藏，用户点击"知道了"按钮关闭
        }
    }
    
    // 隐藏街机按键提示
    hideArcadeKeysHint() {
        const hint = document.getElementById('arcade-keys-hint');
        if (hint) {
            hint.classList.add('hidden');
        }
    }

    setConnectionStatus(status, text) {
        const statusEl = document.getElementById('connection-status');
        statusEl.className = 'connection-status ' + status;
        document.getElementById('status-text').textContent = text;
    }

    showToast(message, duration = 2500) {
        const toast = this.elements.toast;
        toast.textContent = message;
        toast.classList.remove('hidden');

        // 清除之前的定时器
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }

        this.toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    }

    hideToast() {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }
        this.elements.toast.classList.add('hidden');
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}
