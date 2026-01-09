// 文字聊天管理（纯文字，无语音）
export class ChatManager {
    constructor(roomManager) {
        this.roomManager = roomManager;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.bindEvents();
        this.roomManager.on('chat', (data) => this.onChatMessage(data));
    }

    bindEvents() {
        const chatPanel = document.getElementById('chat-panel');
        const toggleBtn = document.getElementById('toggle-chat-btn');
        const sendBtn = document.getElementById('send-chat-btn');
        const chatInput = document.getElementById('chat-input');

        // 折叠/展开聊天
        toggleBtn?.addEventListener('click', () => {
            chatPanel.classList.toggle('collapsed');
            toggleBtn.textContent = chatPanel.classList.contains('collapsed') ? '▲' : '▼';
        });

        // 发送消息
        sendBtn?.addEventListener('click', () => this.sendMessage());
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        const playerNum = this.getMyPlayerNum();

        // 本地显示
        this.addMessage(playerNum, text);

        // 发送给其他玩家
        this.roomManager.send({
            type: 'chat',
            playerNum,
            text
        });

        input.value = '';
    }

    onChatMessage(data) {
        this.addMessage(data.playerNum, data.text);
    }

    addMessage(playerNum, text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-msg';
        msg.innerHTML = `
            <span class="msg-sender p${playerNum}">P${playerNum}:</span>
            <span class="msg-text">${this.escapeHtml(text)}</span>
        `;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-msg system';
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getMyPlayerNum() {
        return window.app?.myPlayerNum || 1;
    }

    destroy() {
        this.initialized = false;
    }
}
