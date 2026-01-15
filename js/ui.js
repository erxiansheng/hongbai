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
            chatPanel: document.getElementById('chat-panel')
        };
    }

    showRoomPanel() {
        this.elements.modePanel.classList.add('hidden');
        this.elements.roomPanel.classList.remove('hidden');
    }

    showGameScreen(showChat = true, isArcade = false) {
        console.log('切换到游戏画面, isArcade:', isArcade);
        this.elements.roomPanel.classList.add('hidden');
        this.elements.controlsModal?.classList.add('hidden');
        this.elements.gameScreen.classList.remove('hidden');
        
        // 街机模式添加特殊class用于全屏样式
        if (isArcade) {
            this.elements.gameScreen.classList.add('arcade-mode');
        } else {
            this.elements.gameScreen.classList.remove('arcade-mode');
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
            this.elements.virtualGamepad.classList.remove('hidden');
        } else {
            this.elements.virtualGamepad.classList.add('hidden');
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
        this.elements.gameScreen.classList.add('hidden');
        this.elements.gameScreen.classList.remove('arcade-mode');
        this.elements.virtualGamepad.classList.add('hidden');
        this.elements.chatPanel?.classList.add('hidden');
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
