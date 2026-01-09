// 输入管理器 - 键盘和手柄映射
import { NES_BUTTONS } from './emulator.js';

export class InputManager {
    constructor(emulator) {
        this.emulator = emulator;
        this.localPlayer = 1;
        this.onInputCallback = null;
        this.onInputBroadcast = null; // 新增：按键广播回调
        this.gamepadIndex = null;
        this.gamepadPollInterval = null;
        this.previousGamepadState = {};
        this.isListeningForKey = false;
        this.listeningAction = null;
        this.listeningButton = null;
        this.isGameRunning = false;
        
        // 默认键盘映射
        // NES只有A/B两个动作键，X/Y映射为A/B的备用键
        this.defaultKeyMap = {
            'KeyW': 'UP',
            'KeyS': 'DOWN',
            'KeyA': 'LEFT',
            'KeyD': 'RIGHT',
            'KeyJ': 'A',      // A键
            'KeyK': 'B',      // B键
            'KeyH': 'X',      // X键 -> 映射到A
            'KeyG': 'Y',      // Y键 -> 映射到B
            'KeyU': 'SELECT',
            'KeyI': 'START'
        };

        this.keyMap = this.loadKeyMap();
        this.actionToKey = this.buildActionToKey();

        this.gamepadMap = {
            // 标准手柄按键映射到NES
            0: 'B',      // A/Cross -> B (NES的B在左边)
            1: 'A',      // B/Circle -> A (NES的A在右边)
            2: 'B',      // X/Square -> B (连发B)
            3: 'A',      // Y/Triangle -> A (连发A)
            4: 'SELECT', // LB/L1 -> SELECT
            5: 'START',  // RB/R1 -> START
            6: 'SELECT', // LT/L2 -> SELECT
            7: 'START',  // RT/R2 -> START
            8: 'SELECT', // Back/Select
            9: 'START',  // Start
            10: 'SELECT', // L3 -> SELECT
            11: 'START',  // R3 -> START
            12: 'UP',    // D-Pad Up
            13: 'DOWN',  // D-Pad Down
            14: 'LEFT',  // D-Pad Left
            15: 'RIGHT'  // D-Pad Right
        };

        // 绑定事件处理器（保持引用以便移除）
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);
        this.boundGamepadConnected = this.handleGamepadConnected.bind(this);
        this.boundGamepadDisconnected = this.handleGamepadDisconnected.bind(this);
    }

    loadKeyMap() {
        try {
            const saved = localStorage.getItem('nesKeyMap');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return { ...this.defaultKeyMap };
    }

    saveKeyMap() {
        try {
            localStorage.setItem('nesKeyMap', JSON.stringify(this.keyMap));
        } catch (e) {}
    }

    buildActionToKey() {
        const map = {};
        for (const [key, action] of Object.entries(this.keyMap)) {
            map[action] = key;
        }
        return map;
    }

    getKeyDisplayName(keyCode) {
        const names = {
            'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
            'KeyJ': 'J', 'KeyK': 'K', 'KeyU': 'U', 'KeyI': 'I',
            'KeyQ': 'Q', 'KeyE': 'E', 'KeyR': 'R', 'KeyT': 'T',
            'KeyY': 'Y', 'KeyO': 'O', 'KeyP': 'P',
            'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyL': 'L',
            'KeyZ': 'Z', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V',
            'KeyB': 'B', 'KeyN': 'N', 'KeyM': 'M',
            'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
            'Space': 'SPACE', 'Enter': 'ENTER',
            'Numpad0': 'NUM0', 'Numpad1': 'NUM1', 'Numpad2': 'NUM2',
            'Numpad3': 'NUM3', 'Numpad4': 'NUM4', 'Numpad5': 'NUM5',
            'Numpad6': 'NUM6', 'Numpad7': 'NUM7', 'Numpad8': 'NUM8', 'Numpad9': 'NUM9',
        };
        return names[keyCode] || keyCode.replace('Key', '').replace('Numpad', 'NUM');
    }

    setLocalPlayer(playerNum) {
        this.localPlayer = playerNum;
        console.log(`本地玩家设置为 P${playerNum}`);
    }

    start(onInputCallback, onInputBroadcast = null) {
        this.onInputCallback = onInputCallback;
        this.onInputBroadcast = onInputBroadcast;
        this.isGameRunning = true;
        this.checkExistingGamepads();
        this.startGamepadPolling();
    }

    stop() {
        this.isGameRunning = false;
        this.onInputCallback = null;
    }

    // 初始化按键设置UI - 在页面加载时调用
    initControlsUI() {
        console.log('初始化按键设置UI...');
        
        // 全局键盘监听（始终有效，用于测试和游戏）
        document.addEventListener('keydown', this.boundKeyDown);
        document.addEventListener('keyup', this.boundKeyUp);
        window.addEventListener('gamepadconnected', this.boundGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.boundGamepadDisconnected);

        // 展开/收起面板
        const panel = document.getElementById('controls-panel');
        const toggleBtn = document.getElementById('toggle-controls-btn');
        
        toggleBtn?.addEventListener('click', () => {
            panel.classList.toggle('expanded');
        });

        // 标签页切换
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`${tabId}-tab`)?.classList.add('active');
            });
        });

        // 按键绑定按钮
        document.querySelectorAll('.key-bind-btn').forEach(btn => {
            const action = btn.dataset.action;
            btn.textContent = this.getKeyDisplayName(this.actionToKey[action]);
            btn.addEventListener('click', () => this.startKeyBinding(btn, action));
        });

        // 恢复默认按钮
        document.getElementById('reset-keys-btn')?.addEventListener('click', () => this.resetKeyMap());

        // 启动手柄UI轮询
        this.startGamepadUIPolling();
        
        // 检查已连接的手柄
        this.checkExistingGamepads();
        
        console.log('按键设置UI初始化完成');
    }

    startKeyBinding(button, action) {
        if (this.listeningButton) {
            this.listeningButton.classList.remove('listening');
        }
        this.isListeningForKey = true;
        this.listeningAction = action;
        this.listeningButton = button;
        button.classList.add('listening');
        button.textContent = '...';
    }

    finishKeyBinding(keyCode) {
        if (!this.isListeningForKey) return;

        const oldKey = this.actionToKey[this.listeningAction];
        if (oldKey) delete this.keyMap[oldKey];

        if (this.keyMap[keyCode]) {
            const conflictAction = this.keyMap[keyCode];
            delete this.keyMap[keyCode];
            const conflictBtn = document.querySelector(`.key-bind-btn[data-action="${conflictAction}"]`);
            if (conflictBtn) conflictBtn.textContent = '-';
            delete this.actionToKey[conflictAction];
        }

        this.keyMap[keyCode] = this.listeningAction;
        this.actionToKey[this.listeningAction] = keyCode;
        
        this.listeningButton.textContent = this.getKeyDisplayName(keyCode);
        this.listeningButton.classList.remove('listening');
        this.listeningButton.classList.add('pressed');
        setTimeout(() => this.listeningButton?.classList.remove('pressed'), 200);

        this.saveKeyMap();
        this.isListeningForKey = false;
        this.listeningAction = null;
        this.listeningButton = null;
    }

    resetKeyMap() {
        this.keyMap = { ...this.defaultKeyMap };
        this.actionToKey = this.buildActionToKey();
        this.saveKeyMap();
        document.querySelectorAll('.key-bind-btn').forEach(btn => {
            const action = btn.dataset.action;
            btn.textContent = this.getKeyDisplayName(this.actionToKey[action]);
        });
    }

    handleKeyDown(event) {
        if (event.target.tagName === 'INPUT') return;
        
        // 按键绑定模式
        if (this.isListeningForKey) {
            event.preventDefault();
            this.finishKeyBinding(event.code);
            return;
        }

        const button = this.keyMap[event.code];
        if (button) {
            event.preventDefault();
            console.log(`按键按下: ${event.code} -> ${button}`);
            // 始终更新测试显示
            this.updateTestDisplay(button, true, 'keyboard', event.code);
            // 只有游戏运行时才处理输入
            if (this.isGameRunning) {
                this.processInput(button, true);
            }
        }
    }

    handleKeyUp(event) {
        if (event.target.tagName === 'INPUT') return;
        if (this.isListeningForKey) return;

        const button = this.keyMap[event.code];
        if (button) {
            event.preventDefault();
            this.updateTestDisplay(button, false, 'keyboard', event.code);
            if (this.isGameRunning) {
                this.processInput(button, false);
            }
        }
    }

    processInput(button, pressed) {
        // X/Y 映射到 A/B (NES只有A/B两个动作键)
        let nesButtonName = button;
        if (button === 'X') nesButtonName = 'A';
        if (button === 'Y') nesButtonName = 'B';
        
        const nesButton = NES_BUTTONS[nesButtonName];
        if (nesButton === undefined) {
            console.warn('未知按键:', nesButtonName);
            return;
        }

        const playerIndex = this.localPlayer - 1;
        
        // 主机直接处理输入
        if (this.emulator && this.emulator.isHost) {
            // 确保模拟器和 nes 对象都存在
            if (!this.emulator.nes) {
                console.warn('processInput: emulator.nes 未初始化，尝试初始化...');
                if (!this.emulator.init()) {
                    console.error('processInput: 无法初始化 NES 模拟器');
                    return;
                }
            }
            
            // 再次检查 nes 对象
            if (this.emulator.nes && typeof this.emulator.nes.buttonDown === 'function') {
                try {
                    if (pressed) {
                        this.emulator.nes.buttonDown(playerIndex, nesButton);
                    } else {
                        this.emulator.nes.buttonUp(playerIndex, nesButton);
                    }
                } catch (e) {
                    console.error('processInput 按键处理错误:', e);
                }
            } else {
                console.error('processInput: nes 对象无效');
            }
        }

        // 非主机发送输入给主机
        if (this.emulator && !this.emulator.isHost && this.onInputCallback) {
            this.onInputCallback({
                player: this.localPlayer,
                button: nesButtonName,
                pressed: pressed
            });
        }
        
        // 广播按键状态给其他玩家显示
        if (this.onInputBroadcast) {
            this.onInputBroadcast(nesButtonName, pressed);
        }
    }

    handleRemoteInput(data) {
        const { player, button, pressed } = data;
        const nesButton = NES_BUTTONS[button];
        if (nesButton === undefined) return;

        const playerIndex = player - 1;
        if (this.emulator && this.emulator.nes) {
            if (pressed) {
                this.emulator.buttonDown(playerIndex, nesButton);
            } else {
                this.emulator.buttonUp(playerIndex, nesButton);
            }
        }
    }

    updateTestDisplay(action, pressed, source, rawKey) {
        // 更新测试面板的NES控制器显示
        const testBtn = document.querySelector(`.nes-btn-test[data-test="${action}"]`);
        if (testBtn) {
            if (pressed) {
                testBtn.classList.add('active');
            } else {
                testBtn.classList.remove('active');
            }
        }

        // 更新最后输入显示
        if (pressed) {
            const display = document.getElementById('last-input-display');
            if (display) {
                const sourceName = source === 'keyboard' ? '键盘' : '手柄';
                const keyName = source === 'keyboard' ? this.getKeyDisplayName(rawKey) : `按钮${rawKey}`;
                display.textContent = `${sourceName} ${keyName} → ${action}`;
            }
        }
    }

    handleGamepadConnected(event) {
        console.log('手柄已连接:', event.gamepad.id);
        this.gamepadIndex = event.gamepad.index;
        this.startGamepadPolling();
        this.updateGamepadStatus(true, event.gamepad.id);
    }

    handleGamepadDisconnected(event) {
        if (event.gamepad.index === this.gamepadIndex) {
            this.gamepadIndex = null;
        }
        this.updateGamepadStatus(false);
    }

    updateGamepadStatus(connected, name = '') {
        const statusEl = document.querySelector('.gamepad-status');
        const textEl = document.getElementById('gamepad-status-text');
        if (statusEl && textEl) {
            statusEl.classList.toggle('connected', connected);
            textEl.textContent = connected ? `已连接: ${name.substring(0, 30)}` : '未检测到手柄';
        }
    }

    checkExistingGamepads() {
        const gamepads = navigator.getGamepads();
        for (const gamepad of gamepads) {
            if (gamepad) {
                this.gamepadIndex = gamepad.index;
                this.updateGamepadStatus(true, gamepad.id);
                break;
            }
        }
    }

    startGamepadPolling() {
        if (this.gamepadPollInterval) clearInterval(this.gamepadPollInterval);
        this.gamepadPollInterval = setInterval(() => this.pollGamepad(), 16);
    }

    startGamepadUIPolling() {
        setInterval(() => this.pollGamepadForUI(), 100);
    }

    pollGamepad() {
        if (this.gamepadIndex === null) return;
        const gamepads = navigator.getGamepads();
        const gamepad = gamepads[this.gamepadIndex];
        if (!gamepad) return;

        for (const [buttonIndex, buttonName] of Object.entries(this.gamepadMap)) {
            const idx = parseInt(buttonIndex);
            const button = gamepad.buttons[idx];
            if (!button) continue;

            const pressed = button.pressed;
            const prevPressed = this.previousGamepadState[idx] || false;

            if (pressed !== prevPressed) {
                this.updateTestDisplay(buttonName, pressed, 'gamepad', idx);
                if (this.isGameRunning) {
                    this.processInput(buttonName, pressed);
                }
                this.previousGamepadState[idx] = pressed;
            }
        }
        this.handleGamepadAxes(gamepad);
    }

    pollGamepadForUI() {
        const gamepads = navigator.getGamepads();
        let foundGamepad = null;
        for (const gamepad of gamepads) {
            if (gamepad) { foundGamepad = gamepad; break; }
        }

        if (foundGamepad) {
            // 更新按钮状态
            for (let idx = 0; idx < foundGamepad.buttons.length; idx++) {
                const button = foundGamepad.buttons[idx];
                if (!button) continue;
                const gpBtn = document.querySelector(`.gp-btn[data-btn="${idx}"]`);
                gpBtn?.classList.toggle('active', button.pressed);
            }
            
            // 更新摇杆显示
            const leftStick = document.getElementById('gp-left-stick');
            if (leftStick && foundGamepad.axes.length >= 2) {
                const indicator = leftStick.querySelector('.stick-indicator');
                if (indicator) {
                    const x = foundGamepad.axes[0] * 8;
                    const y = foundGamepad.axes[1] * 8;
                    indicator.style.transform = `translate(${x}px, ${y}px)`;
                    
                    // 如果摇杆有明显偏移，高亮显示
                    const threshold = 0.3;
                    const isActive = Math.abs(foundGamepad.axes[0]) > threshold || 
                                    Math.abs(foundGamepad.axes[1]) > threshold;
                    leftStick.classList.toggle('active', isActive);
                }
            }
        }
    }

    handleGamepadAxes(gamepad) {
        const axes = gamepad.axes;
        if (axes.length < 2) return;
        const threshold = 0.5;
        
        const checkAxis = (condition, key, stateKey) => {
            if (condition && !this.previousGamepadState[stateKey]) {
                this.updateTestDisplay(key, true, 'gamepad', 'Stick');
                if (this.isGameRunning) this.processInput(key, true);
                this.previousGamepadState[stateKey] = true;
            } else if (!condition && this.previousGamepadState[stateKey]) {
                this.updateTestDisplay(key, false, 'gamepad', 'Stick');
                if (this.isGameRunning) this.processInput(key, false);
                this.previousGamepadState[stateKey] = false;
            }
        };

        checkAxis(axes[0] < -threshold, 'LEFT', 'axisLeft');
        checkAxis(axes[0] > threshold, 'RIGHT', 'axisRight');
        checkAxis(axes[1] < -threshold, 'UP', 'axisUp');
        checkAxis(axes[1] > threshold, 'DOWN', 'axisDown');
    }

    setupVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (!gamepad) return;

        // 阻止默认触摸行为
        gamepad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        gamepad.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        gamepad.querySelectorAll('.vgp-btn').forEach(btn => {
            const key = btn.dataset.key;
            if (!key) return; // 跳过center按钮
            
            const onPress = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isGameRunning) this.processInput(key, true);
                btn.classList.add('active');
            };
            const onRelease = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isGameRunning) this.processInput(key, false);
                btn.classList.remove('active');
            };

            // 触摸事件
            btn.addEventListener('touchstart', onPress, { passive: false });
            btn.addEventListener('touchend', onRelease, { passive: false });
            btn.addEventListener('touchcancel', onRelease, { passive: false });
            
            // 鼠标事件（用于测试）
            btn.addEventListener('mousedown', onPress);
            btn.addEventListener('mouseup', onRelease);
            btn.addEventListener('mouseleave', (e) => {
                if (btn.classList.contains('active')) {
                    onRelease(e);
                }
            });
        });
        
        console.log('虚拟手柄初始化完成');
    }
    
    // 显示/隐藏虚拟手柄
    showVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (gamepad) {
            gamepad.classList.remove('hidden');
        }
    }
    
    hideVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (gamepad) {
            gamepad.classList.add('hidden');
        }
    }
    
    // 检测是否为移动设备
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth <= 768;
    }
}
