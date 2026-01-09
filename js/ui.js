// UI管理器
export class UIManager {
    constructor() {
        this.elements = {
            modePanel: document.getElementById('mode-panel'),
            roomPanel: document.getElementById('room-panel'),
            gameScreen: document.getElementById('game-screen'),
            toast: document.getElementById('toast'),
            virtualGamepad: document.getElementById('virtual-gamepad'),
            controlsPanel: document.getElementById('controls-panel'),
            chatPanel: document.getElementById('chat-panel')
        };
    }

    showRoomPanel() {
        this.elements.modePanel.classList.add('hidden');
        this.elements.roomPanel.classList.remove('hidden');
    }

    showGameScreen() {
        this.elements.roomPanel.classList.add('hidden');
        this.elements.controlsPanel.classList.add('hidden');
        this.elements.gameScreen.classList.remove('hidden');
        this.elements.chatPanel?.classList.remove('hidden');
        
        if (this.isMobile()) {
            this.elements.virtualGamepad.classList.remove('hidden');
        }
    }

    hideGameScreen() {
        this.elements.gameScreen.classList.add('hidden');
        this.elements.virtualGamepad.classList.add('hidden');
        this.elements.chatPanel?.classList.add('hidden');
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

        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
}
