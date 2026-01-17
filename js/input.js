// 输入管理器 - 统一键盘和手柄映射，支持双玩家
import { NES_BUTTONS } from './emulator.js';

export class InputManager {
    constructor(emulator) {
        this.emulator = emulator;
        this.localPlayer = 1;
        this.onInputCallback = null;
        this.onInputBroadcast = null;
        this.gamepadPollInterval = null;
        this.previousGamepadState = {};
        this.isGameRunning = false;
        
        // 双玩家支持
        this.gamepads = { 1: null, 2: null }; // 玩家 -> 手柄索引
        this.hasLocalP2 = false; // 是否有本地P2
        
        // 多人模式下禁用本地P2（避免与远程P2冲突）
        this.disableLocalP2 = false; // 当有远程P2时设为true
        this.remotePlayerNums = new Set(); // 远程玩家编号集合
        
        // 编辑状态
        this.isEditing = false;
        this.editingAction = null;
        this.editingButton = null;
        this.editingPlayer = 1; // 当前编辑的玩家
        this.currentDisplayPlayer = 1; // 当前显示测试的玩家
        
        // NES按键列表 (X/Y映射到A/B，作为备用键)
        this.nesActions = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'SELECT', 'START'];
        
        // 默认按键映射 - P1
        // 北通手柄按键索引: A=0, B=1, X=3, Y=4, LB=5, RB=6
        this.defaultKeyMapP1 = {
            UP:     { keyboard: 'KeyW', gamepad: { type: 'button', index: 12 } },
            DOWN:   { keyboard: 'KeyS', gamepad: { type: 'button', index: 13 } },
            LEFT:   { keyboard: 'KeyA', gamepad: { type: 'button', index: 14 } },
            RIGHT:  { keyboard: 'KeyD', gamepad: { type: 'button', index: 15 } },
            A:      { keyboard: 'KeyJ', gamepad: { type: 'button', index: 0 } },  // A键
            B:      { keyboard: 'KeyK', gamepad: { type: 'button', index: 1 } },  // B键
            X:      { keyboard: 'KeyH', gamepad: { type: 'button', index: 3 } },  // X键 (北通: index 3)
            Y:      { keyboard: 'KeyG', gamepad: { type: 'button', index: 4 } },  // Y键 (北通: index 4)
            SELECT: { keyboard: 'KeyU', gamepad: { type: 'button', index: 8 } },
            START:  { keyboard: 'KeyI', gamepad: { type: 'button', index: 9 } }
        };
        
        // 默认按键映射 - P2 (使用方向键和小键盘，手柄映射与P1相同)
        // 北通手柄按键索引: A=0, B=1, X=3, Y=4, LB=5, RB=6, SEL=8, STA=9, 方向键=12-15
        this.defaultKeyMapP2 = {
            UP:     { keyboard: 'ArrowUp', gamepad: { type: 'button', index: 12 } },
            DOWN:   { keyboard: 'ArrowDown', gamepad: { type: 'button', index: 13 } },
            LEFT:   { keyboard: 'ArrowLeft', gamepad: { type: 'button', index: 14 } },
            RIGHT:  { keyboard: 'ArrowRight', gamepad: { type: 'button', index: 15 } },
            A:      { keyboard: 'Numpad1', gamepad: { type: 'button', index: 0 } },   // A键
            B:      { keyboard: 'Numpad2', gamepad: { type: 'button', index: 1 } },   // B键
            X:      { keyboard: 'Numpad4', gamepad: { type: 'button', index: 3 } },   // X键 (北通: index 3)
            Y:      { keyboard: 'Numpad5', gamepad: { type: 'button', index: 4 } },   // Y键 (北通: index 4)
            SELECT: { keyboard: 'Numpad7', gamepad: { type: 'button', index: 8 } },  // SELECT
            START:  { keyboard: 'Numpad9', gamepad: { type: 'button', index: 9 } }   // START
        };
        
        // 映射版本号 (升级以强制重置)
        this.keyMapVersion = 7;

        // 加载按键映射
        this.keyMaps = {
            1: this.loadKeyMap(1),
            2: this.loadKeyMap(2)
        };
        
        // 构建反向映射
        this.keyboardToAction = {
            1: this.buildKeyboardToAction(1),
            2: this.buildKeyboardToAction(2)
        };

        // 绑定事件处理器
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);
        this.boundGamepadConnected = this.handleGamepadConnected.bind(this);
        this.boundGamepadDisconnected = this.handleGamepadDisconnected.bind(this);
    }

    loadKeyMap(player) {
        const key = `nesKeyMap_P${player}`;
        const versionKey = `nesKeyMapVersion_P${player}`;
        const defaultMap = player === 1 ? this.defaultKeyMapP1 : this.defaultKeyMapP2;
        
        try {
            const saved = localStorage.getItem(key);
            const savedVersion = localStorage.getItem(versionKey);
            
            if (saved) {
                if (savedVersion !== String(this.keyMapVersion)) {
                    console.log(`P${player} 按键映射版本过旧，重置为默认值`);
                    localStorage.removeItem(key);
                    localStorage.setItem(versionKey, String(this.keyMapVersion));
                    return JSON.parse(JSON.stringify(defaultMap));
                }
                
                const parsed = JSON.parse(saved);
                const hasAllKeys = this.nesActions.every(action => parsed[action]);
                if (hasAllKeys) {
                    console.log(`加载 P${player} 按键映射`);
                    return parsed;
                }
            }
        } catch (e) {
            console.warn(`加载 P${player} 按键映射失败:`, e);
        }
        
        localStorage.removeItem(key);
        localStorage.setItem(versionKey, String(this.keyMapVersion));
        return JSON.parse(JSON.stringify(defaultMap));
    }

    saveKeyMap(player) {
        const key = `nesKeyMap_P${player}`;
        const versionKey = `nesKeyMapVersion_P${player}`;
        try {
            localStorage.setItem(key, JSON.stringify(this.keyMaps[player]));
            localStorage.setItem(versionKey, String(this.keyMapVersion));
            console.log(`P${player} 按键映射已保存`);
        } catch (e) {
            console.warn(`保存 P${player} 按键映射失败:`, e);
        }
    }

    buildKeyboardToAction(player) {
        const map = {};
        for (const [action, binding] of Object.entries(this.keyMaps[player])) {
            if (binding.keyboard) {
                map[binding.keyboard] = { action, player };
            }
        }
        return map;
    }

    rebuildAllKeyboardMaps() {
        this.keyboardToAction = {
            1: this.buildKeyboardToAction(1),
            2: this.buildKeyboardToAction(2)
        };
    }

    getKeyDisplayName(keyCode) {
        if (!keyCode) return '-';
        const names = {
            'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
            'KeyJ': 'J', 'KeyK': 'K', 'KeyU': 'U', 'KeyI': 'I',
            'KeyQ': 'Q', 'KeyE': 'E', 'KeyR': 'R', 'KeyT': 'T',
            'KeyY': 'Y', 'KeyO': 'O', 'KeyP': 'P',
            'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyL': 'L',
            'KeyZ': 'Z', 'KeyX': 'X', 'KeyC': 'C', 'KeyV': 'V',
            'KeyB': 'B', 'KeyN': 'N', 'KeyM': 'M',
            'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
            'Space': 'SPACE', 'Enter': 'ENTER', 'ShiftLeft': 'L-SHIFT', 'ShiftRight': 'R-SHIFT',
            'ControlLeft': 'L-CTRL', 'ControlRight': 'R-CTRL',
            'Numpad0': 'N0', 'Numpad1': 'N1', 'Numpad2': 'N2',
            'Numpad3': 'N3', 'Numpad4': 'N4', 'Numpad5': 'N5',
            'Numpad6': 'N6', 'Numpad7': 'N7', 'Numpad8': 'N8', 'Numpad9': 'N9',
        };
        return names[keyCode] || keyCode.replace('Key', '').replace('Numpad', 'N');
    }

    getGamepadButtonName(binding) {
        if (!binding) return '-';
        if (binding.type === 'button') {
            // 北通手柄按键名称映射 (X=3, Y=4, LB=5, RB=6)
            const names = {
                0: 'A', 1: 'B', 2: 'B2', 3: 'X', 4: 'Y',
                5: 'LB', 6: 'RB', 7: 'LT', 8: 'RT',
                9: 'SEL', 10: 'STA', 11: 'L3', 12: 'R3',
                13: '↑', 14: '↓', 15: '←', 16: '→'
            };
            return names[binding.index] || `B${binding.index}`;
        } else if (binding.type === 'axis') {
            const axisNames = { 0: 'LX', 1: 'LY', 2: 'RX', 3: 'RY' };
            const dir = binding.direction > 0 ? '+' : '-';
            return `${axisNames[binding.index] || `A${binding.index}`}${dir}`;
        }
        return '-';
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

    // 初始化按键设置UI
    initControlsUI() {
        console.log('初始化按键设置UI...');
        
        // 全局键盘监听
        document.addEventListener('keydown', this.boundKeyDown);
        document.addEventListener('keyup', this.boundKeyUp);
        window.addEventListener('gamepadconnected', this.boundGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.boundGamepadDisconnected);

        // 弹窗打开/关闭
        const modal = document.getElementById('controls-modal');
        const controlsBtn = document.getElementById('controls-btn');
        const closeBtn = document.getElementById('close-controls-btn');
        const overlay = modal?.querySelector('.modal-overlay');
        
        const openModal = () => {
            modal?.classList.remove('hidden');
            this.checkExistingGamepads();
        };
        
        controlsBtn?.addEventListener('click', openModal);
        
        closeBtn?.addEventListener('click', () => {
            modal?.classList.add('hidden');
        });
        
        overlay?.addEventListener('click', () => {
            modal?.classList.add('hidden');
        });

        // 玩家切换标签
        document.querySelectorAll('.player-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const player = parseInt(tab.dataset.player);
                this.switchPlayerTab(player);
            });
        });

        // 初始化按键绑定按钮
        this.updateAllBindingButtons();
        
        // 绑定按钮点击事件
        document.querySelectorAll('.unified-bind-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const player = parseInt(btn.closest('.player-mapping')?.dataset.player || '1');
                this.startEditing(btn, action, player);
            });
        });

        // 恢复默认按钮
        document.getElementById('reset-keys-btn')?.addEventListener('click', () => this.resetKeyMap());
        
        // 点击手柄状态区域重新检测
        document.querySelector('.gamepad-status')?.addEventListener('click', () => {
            this.checkExistingGamepads();
        });

        // 启动手柄轮询
        this.startGamepadPolling();
        this.checkExistingGamepads();
        
        console.log('按键设置UI初始化完成');
    }

    switchPlayerTab(player) {
        // 更新标签状态
        document.querySelectorAll('.player-tab').forEach(tab => {
            tab.classList.toggle('active', parseInt(tab.dataset.player) === player);
        });
        
        // 显示对应玩家的映射面板
        document.querySelectorAll('.player-mapping').forEach(panel => {
            panel.classList.toggle('active', parseInt(panel.dataset.player) === player);
        });
        
        this.editingPlayer = player;
        this.currentDisplayPlayer = player; // 当前显示的玩家（用于手柄可视化）
        
        // 清除手柄可视化状态
        document.querySelectorAll('.gp-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.nes-btn-test').forEach(btn => btn.classList.remove('active'));
        
        console.log(`切换到 P${player} 标签`);
    }

    updateAllBindingButtons() {
        [1, 2].forEach(player => {
            const panel = document.querySelector(`.player-mapping[data-player="${player}"]`);
            if (!panel) return;
            
            panel.querySelectorAll('.unified-bind-btn').forEach(btn => {
                const action = btn.dataset.action;
                const binding = this.keyMaps[player][action];
                if (binding) {
                    const kbSpan = btn.querySelector('.kb-key');
                    const gpSpan = btn.querySelector('.gp-key');
                    if (kbSpan) kbSpan.textContent = this.getKeyDisplayName(binding.keyboard);
                    if (gpSpan) gpSpan.textContent = this.getGamepadButtonName(binding.gamepad);
                }
            });
        });
    }

    startEditing(button, action, player = 1) {
        if (this.editingButton) {
            this.editingButton.classList.remove('editing');
        }
        
        this.isEditing = true;
        this.editingAction = action;
        this.editingButton = button;
        this.editingPlayer = player;
        button.classList.add('editing');
        
        const hint = button.querySelector('.edit-hint');
        if (hint) hint.style.display = 'block';
        
        console.log(`开始编辑 P${player}: ${action}`);
    }

    finishEditing(type, value) {
        if (!this.isEditing || !this.editingAction) return;
        
        const action = this.editingAction;
        const player = this.editingPlayer;
        const keyMap = this.keyMaps[player];
        
        if (type === 'keyboard') {
            // 检查同一玩家内的冲突
            const conflictInfo = this.keyboardToAction[player][value];
            if (conflictInfo && conflictInfo.action !== action) {
                keyMap[conflictInfo.action].keyboard = null;
                this.updateBindingButton(conflictInfo.action, player);
            }
            
            keyMap[action].keyboard = value;
            this.rebuildAllKeyboardMaps();
        } else if (type === 'gamepad') {
            // 检查同一玩家内的手柄按键冲突
            for (const [act, binding] of Object.entries(keyMap)) {
                if (act !== action && binding.gamepad && 
                    binding.gamepad.type === value.type && 
                    binding.gamepad.index === value.index &&
                    (value.type !== 'axis' || binding.gamepad.direction === value.direction)) {
                    binding.gamepad = null;
                    this.updateBindingButton(act, player);
                }
            }
            keyMap[action].gamepad = value;
        }
        
        // 清除状态
        for (const act of this.nesActions) {
            delete this.previousGamepadState[`p${player}_action_${act}`];
        }
        
        this.updateBindingButton(action, player);
        this.saveKeyMap(player);
        
        // 结束编辑
        this.editingButton?.classList.remove('editing');
        this.editingButton?.classList.add('flash');
        setTimeout(() => this.editingButton?.classList.remove('flash'), 300);
        
        const hint = this.editingButton?.querySelector('.edit-hint');
        if (hint) hint.style.display = 'none';
        
        this.isEditing = false;
        this.editingAction = null;
        this.editingButton = null;
    }

    updateBindingButton(action, player) {
        const panel = document.querySelector(`.player-mapping[data-player="${player}"]`);
        const btn = panel?.querySelector(`.unified-bind-btn[data-action="${action}"]`);
        if (!btn) return;
        
        const binding = this.keyMaps[player][action];
        const kbSpan = btn.querySelector('.kb-key');
        const gpSpan = btn.querySelector('.gp-key');
        if (kbSpan) kbSpan.textContent = this.getKeyDisplayName(binding.keyboard);
        if (gpSpan) gpSpan.textContent = this.getGamepadButtonName(binding.gamepad);
    }

    resetKeyMap() {
        const player = this.editingPlayer;
        const defaultMap = player === 1 ? this.defaultKeyMapP1 : this.defaultKeyMapP2;
        this.keyMaps[player] = JSON.parse(JSON.stringify(defaultMap));
        this.rebuildAllKeyboardMaps();
        this.saveKeyMap(player);
        this.updateAllBindingButtons();
        this.previousGamepadState = {};
        console.log(`P${player} 按键映射已重置`);
    }

    handleKeyDown(event) {
        if (event.target.tagName === 'INPUT') return;
        
        // 弹窗打开时，ESC关闭弹窗
        const modal = document.getElementById('controls-modal');
        if (!modal?.classList.contains('hidden')) {
            if (event.code === 'Escape') {
                modal.classList.add('hidden');
                return;
            }
        }
        
        // 编辑模式
        if (this.isEditing) {
            event.preventDefault();
            this.finishEditing('keyboard', event.code);
            return;
        }

        // 检查两个玩家的键盘映射
        for (const player of [1, 2]) {
            const info = this.keyboardToAction[player][event.code];
            if (info && info.player === player) {
                // 确定UI显示的玩家编号
                // 如果是远程玩家（非房主），使用 localPlayer 作为显示编号
                // 这样远程P2按P1键位时，UI会显示在P2面板上
                const displayPlayer = (this.emulator && !this.emulator.isHost) ? this.localPlayer : player;
                
                // 更新手柄UI显示
                this.updateTestDisplay(info.action, true, displayPlayer);
                
                if (this.isGameRunning) {
                    // 检查是否是 EmulatorJS 模式
                    const isEmulatorJS = this.emulator && this.emulator.coreType === 'emulatorjs';
                    
                    if (isEmulatorJS) {
                        // EmulatorJS 模式：不阻止事件，让 EmulatorJS 直接处理键盘
                        // 街机游戏使用输入同步，总是广播输入
                    } else {
                        // JSNES 模式：阻止默认行为，通过我们的系统处理
                        event.preventDefault();
                        this.processInput(info.action, true, player);
                    }
                    
                    // 总是广播输入（用于联机同步和UI更新）
                    if (this.onInputBroadcast) {
                        // 广播时使用实际的显示玩家编号
                        this.onInputBroadcast(info.action, true, displayPlayer);
                    }
                } else {
                    event.preventDefault();
                }
                return;
            }
        }
    }

    handleKeyUp(event) {
        if (event.target.tagName === 'INPUT') return;
        if (this.isEditing) return;

        for (const player of [1, 2]) {
            const info = this.keyboardToAction[player][event.code];
            if (info && info.player === player) {
                // 确定UI显示的玩家编号
                // 如果是远程玩家（非房主），使用 localPlayer 作为显示编号
                const displayPlayer = (this.emulator && !this.emulator.isHost) ? this.localPlayer : player;
                
                // 更新手柄UI显示
                this.updateTestDisplay(info.action, false, displayPlayer);
                
                if (this.isGameRunning) {
                    // 检查是否是 EmulatorJS 模式
                    const isEmulatorJS = this.emulator && this.emulator.coreType === 'emulatorjs';
                    
                    if (isEmulatorJS) {
                        // EmulatorJS 模式：不阻止事件，让 EmulatorJS 直接处理键盘
                        // 街机游戏使用输入同步，总是广播输入
                    } else {
                        // JSNES 模式
                        event.preventDefault();
                        this.processInput(info.action, false, player);
                    }
                    
                    // 总是广播输入（用于联机同步和UI更新）
                    if (this.onInputBroadcast) {
                        // 广播时使用实际的显示玩家编号
                        this.onInputBroadcast(info.action, false, displayPlayer);
                    }
                } else {
                    event.preventDefault();
                }
                return;
            }
        }
    }

    processInput(action, pressed, player = 1) {
        let nesAction = action;
        if (action === 'X') nesAction = 'A';
        if (action === 'Y') nesAction = 'B';
        
        const nesButton = NES_BUTTONS[nesAction];
        if (nesButton === undefined) return;

        const playerIndex = player - 1;
        if (playerIndex < 0 || playerIndex > 1) return;
        
        // 多人模式下，如果本地P2被禁用（有远程P2），则忽略本地P2输入
        if (player === 2 && this.disableLocalP2) {
            console.log('本地P2输入被禁用（远程P2已连接）');
            return;
        }
        
        // 主机直接处理输入
        if (this.emulator && this.emulator.isHost) {
            if (!this.emulator.isRunning) return;
            
            // 检查是否是 EmulatorJS 模式
            const isEmulatorJS = this.emulator.coreType === 'emulatorjs';
            
            if (isEmulatorJS) {
                // EmulatorJS 模式：模拟键盘事件
                this.simulateKeyForEmulatorJS(action, pressed, player);
            } else {
                // JSNES 模式：直接调用模拟器方法
                try {
                    if (pressed) {
                        this.emulator.buttonDown(playerIndex, nesButton);
                    } else {
                        this.emulator.buttonUp(playerIndex, nesButton);
                    }
                } catch (e) {
                    console.error('按键处理错误:', e);
                }
            }
        }

        // 非主机（远程P2）发送输入
        // 关键改动：远程P2使用自己的P1键位，但发送时标记为远程输入
        // 房主收到后会将其映射为P2输入
        if (this.emulator && !this.emulator.isHost && this.onInputCallback) {
            // 远程玩家总是发送 player=1 的输入（使用自己的P1键位）
            // 但标记 isRemote=true，让房主知道这是远程玩家的输入
            this.onInputCallback({
                player: 1,  // 远程玩家使用自己的P1键位
                button: nesAction,
                pressed: pressed,
                isRemote: true  // 标记为远程输入，房主会映射为对应玩家编号
            });
        }
        
        if (this.onInputBroadcast) {
            this.onInputBroadcast(action, pressed, player);
        }
    }
    
    // 设置远程玩家（用于禁用本地对应玩家输入）
    setRemotePlayers(playerNums) {
        this.remotePlayerNums = new Set(playerNums);
        // 如果有远程P2，禁用本地P2
        this.disableLocalP2 = this.remotePlayerNums.has(2);
        console.log('远程玩家:', Array.from(this.remotePlayerNums), '本地P2禁用:', this.disableLocalP2);
    }
    
    // 添加远程玩家
    addRemotePlayer(playerNum) {
        this.remotePlayerNums.add(playerNum);
        if (playerNum === 2) {
            this.disableLocalP2 = true;
            console.log('远程P2加入，本地P2已禁用');
        }
    }
    
    // 移除远程玩家
    removeRemotePlayer(playerNum) {
        this.remotePlayerNums.delete(playerNum);
        if (playerNum === 2) {
            this.disableLocalP2 = false;
            console.log('远程P2离开，本地P2已启用');
        }
    }
    
    // 重置远程玩家状态
    resetRemotePlayers() {
        this.remotePlayerNums.clear();
        this.disableLocalP2 = false;
    }

    handleRemoteInput(data) {
        const { player, button, pressed, isRemote, fromPlayer } = data;
        const nesButton = NES_BUTTONS[button];
        if (nesButton === undefined) return;

        // 确定实际的玩家编号
        // 如果是远程输入（isRemote=true），使用发送者的玩家编号（fromPlayer）
        // 远程玩家使用自己的P1键位，但在房主端映射为对应的玩家编号
        let actualPlayer = player;
        if (isRemote && fromPlayer) {
            actualPlayer = fromPlayer;  // 使用发送者的玩家编号
        }
        
        const playerIndex = actualPlayer - 1;
        
        // 更新 UI 显示
        this.updateTestDisplay(button, pressed, actualPlayer);
        
        // 所有游戏都使用帧同步模式，房主处理所有输入
        if (this.emulator && this.emulator.isRunning && this.emulator.isHost) {
            if (pressed) {
                this.emulator.buttonDown(playerIndex, nesButton);
            } else {
                this.emulator.buttonUp(playerIndex, nesButton);
            }
        }
    }

    updateTestDisplay(action, pressed, player = 1) {
        // 更新测试面板 (只更新当前显示的玩家)
        const activePanel = document.querySelector('.player-mapping.active');
        const activePlayer = parseInt(activePanel?.dataset.player || '1');
        
        if (player === activePlayer) {
            const testBtn = document.querySelector(`.nes-btn-test[data-test="${action}"]`);
            if (testBtn) {
                testBtn.classList.toggle('active', pressed);
            }
        }
        
        // 更新游戏中的玩家手柄UI面板 - 只更新对应玩家的面板
        const playerPanel = document.querySelector(`.player-input-panel[data-player="${player}"]`);
        if (playerPanel) {
            // 只更新该玩家面板内的按钮，使用更精确的选择器
            const btns = playerPanel.querySelectorAll(`.mini-btn[data-btn="${action}"]`);
            btns.forEach(btn => btn.classList.toggle('active', pressed));
        }

        if (pressed) {
            const display = document.getElementById('last-input-display');
            if (display) {
                display.textContent = `P${player}: ${action}`;
            }
        }
    }
    
    // 为 EmulatorJS 模拟键盘事件
    simulateKeyForEmulatorJS(action, pressed, player = 1) {
        // 获取对应的键盘码
        const keyMap = this.keyMaps[player];
        const binding = keyMap[action];
        if (!binding || !binding.keyboard) return;
        
        const keyCode = binding.keyboard;
        const keyCodeNum = this.getKeyCodeNumber(keyCode);
        
        // 创建键盘事件
        const event = new KeyboardEvent(pressed ? 'keydown' : 'keyup', {
            code: keyCode,
            key: this.getKeyFromCode(keyCode),
            keyCode: keyCodeNum,
            which: keyCodeNum,
            bubbles: true,
            cancelable: true
        });
        
        // 发送到 EmulatorJS - 尝试多个目标
        // 1. EmulatorJS 的 canvas
        const ejsCanvas = document.querySelector('#emulatorjs-game canvas');
        if (ejsCanvas) {
            ejsCanvas.dispatchEvent(event);
        }
        
        // 2. EmulatorJS 容器
        const ejsContainer = document.querySelector('#emulatorjs-game');
        if (ejsContainer) {
            ejsContainer.dispatchEvent(event);
        }
        
        // 3. document（作为备用）
        document.dispatchEvent(event);
    }
    
    // 从 code 获取 key
    getKeyFromCode(code) {
        const map = {
            'KeyW': 'w', 'KeyA': 'a', 'KeyS': 's', 'KeyD': 'd',
            'KeyJ': 'j', 'KeyK': 'k', 'KeyU': 'u', 'KeyI': 'i',
            'KeyH': 'h', 'KeyG': 'g', 'KeyQ': 'q', 'KeyE': 'e',
            'ArrowUp': 'ArrowUp', 'ArrowDown': 'ArrowDown',
            'ArrowLeft': 'ArrowLeft', 'ArrowRight': 'ArrowRight',
            'Numpad1': '1', 'Numpad2': '2', 'Numpad4': '4', 'Numpad5': '5',
            'Numpad7': '7', 'Numpad9': '9', 'Numpad0': '0', 'NumpadDecimal': '.'
        };
        return map[code] || code;
    }
    
    // 从 code 获取 keyCode 数字
    getKeyCodeNumber(code) {
        const map = {
            'KeyW': 87, 'KeyA': 65, 'KeyS': 83, 'KeyD': 68,
            'KeyJ': 74, 'KeyK': 75, 'KeyU': 85, 'KeyI': 73,
            'KeyH': 72, 'KeyG': 71, 'KeyQ': 81, 'KeyE': 69,
            'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
            'Numpad1': 97, 'Numpad2': 98, 'Numpad4': 100, 'Numpad5': 101,
            'Numpad7': 103, 'Numpad9': 105, 'Numpad0': 96, 'NumpadDecimal': 110
        };
        return map[code] || 0;
    }

    handleGamepadConnected(event) {
        console.log('手柄已连接:', event.gamepad.id, '索引:', event.gamepad.index);
        this.assignGamepad(event.gamepad);
    }

    handleGamepadDisconnected(event) {
        console.log('手柄已断开:', event.gamepad.index);
        
        if (this.gamepads[1] === event.gamepad.index) {
            this.gamepads[1] = null;
        }
        if (this.gamepads[2] === event.gamepad.index) {
            this.gamepads[2] = null;
            this.hasLocalP2 = false;
        }
        
        this.updateGamepadStatus();
    }

    assignGamepad(gamepad) {
        console.log(`检测到手柄: ${gamepad.id}, 索引: ${gamepad.index}, 按钮数: ${gamepad.buttons.length}, 轴数: ${gamepad.axes.length}`);
        
        // 单人模式：第一个手柄始终分配给P1，第二个手柄分配给P2
        // 如果P1没有手柄，分配给P1
        if (this.gamepads[1] === null) {
            this.gamepads[1] = gamepad.index;
            this.initPlayerGamepadState(1);
            console.log('手柄分配给 P1');
        } 
        // 如果P1已有手柄且P2没有手柄，且这是不同的手柄，分配给P2
        else if (this.gamepads[2] === null && gamepad.index !== this.gamepads[1]) {
            this.gamepads[2] = gamepad.index;
            this.hasLocalP2 = true;
            this.initPlayerGamepadState(2);
            console.log('手柄分配给 P2，启用本地双人');
            console.log('P2 按键映射:', JSON.stringify(this.keyMaps[2], null, 2));
            
            // 显示P2标签
            const p2Tab = document.querySelector('.player-tab[data-player="2"]');
            if (p2Tab) p2Tab.classList.add('has-gamepad');
        }
        
        this.updateGamepadStatus();
    }
    
    // 初始化玩家的手柄状态
    initPlayerGamepadState(player) {
        const statePrefix = `p${player}_`;
        for (const action of this.nesActions) {
            this.previousGamepadState[`${statePrefix}action_${action}`] = false;
        }
        console.log(`P${player} 手柄状态已初始化`);
    }
    
    updateGamepadStatus() {
        const statusEl = document.querySelector('.gamepad-status');
        const textEl = document.getElementById('gamepad-status-text');
        
        if (!statusEl || !textEl) return;
        
        const gamepads = navigator.getGamepads();
        const p1Gp = this.gamepads[1] !== null ? gamepads[this.gamepads[1]] : null;
        const p2Gp = this.gamepads[2] !== null ? gamepads[this.gamepads[2]] : null;
        
        let statusText = '';
        if (p1Gp && p2Gp) {
            statusText = 'P1 + P2 手柄已连接';
            statusEl.classList.add('connected', 'dual');
        } else if (p1Gp) {
            statusText = `P1: ${p1Gp.id.substring(0, 25)}`;
            statusEl.classList.add('connected');
            statusEl.classList.remove('dual');
        } else {
            statusText = '未检测到手柄';
            statusEl.classList.remove('connected', 'dual');
        }
        
        textEl.textContent = statusText;
    }

    checkExistingGamepads() {
        const gamepads = navigator.getGamepads();
        console.log('检查已连接的手柄...');
        
        // 重置分配和状态
        this.gamepads = { 1: null, 2: null };
        this.hasLocalP2 = false;
        
        // 清除所有手柄相关状态
        for (const key of Object.keys(this.previousGamepadState)) {
            if (key.startsWith('p1_') || key.startsWith('p2_')) {
                delete this.previousGamepadState[key];
            }
        }
        
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (gp && gp.connected) {
                this.assignGamepad(gp);
            }
        }
        
        this.updateGamepadStatus();
    }

    startGamepadPolling() {
        if (this.gamepadPollInterval) {
            clearInterval(this.gamepadPollInterval);
        }
        
        this.gamepadPollInterval = setInterval(() => {
            this.pollGamepad();
        }, 16);
    }

    pollGamepad() {
        const gamepads = navigator.getGamepads();
        
        // 轮询两个玩家的手柄
        for (const player of [1, 2]) {
            const gpIndex = this.gamepads[player];
            if (gpIndex === null) continue;
            
            const gamepad = gamepads[gpIndex];
            if (!gamepad || !gamepad.connected) continue;
            
            this.pollSingleGamepad(gamepad, player);
        }
    }

    pollSingleGamepad(gamepad, player) {
        const keyMap = this.keyMaps[player];
        const statePrefix = `p${player}_`;
        
        // 编辑模式 - 当前显示的玩家对应的手柄可以编辑，或者如果当前玩家没有手柄则任意手柄都可以
        const isEditingThisPlayer = this.isEditing && this.editingPlayer === this.currentDisplayPlayer;
        const currentPlayerHasGamepad = this.gamepads[this.currentDisplayPlayer] !== null;
        const canEdit = isEditingThisPlayer && (player === this.currentDisplayPlayer || !currentPlayerHasGamepad);
        
        if (canEdit) {
            for (let i = 0; i < gamepad.buttons.length; i++) {
                const btn = gamepad.buttons[i];
                const isPressed = btn.pressed || btn.value > 0.5;
                const wasPressed = this.previousGamepadState[`${statePrefix}edit_btn${i}`] || false;
                
                if (isPressed && !wasPressed) {
                    this.finishEditing('gamepad', { type: 'button', index: i });
                }
                this.previousGamepadState[`${statePrefix}edit_btn${i}`] = isPressed;
            }
            
            const threshold = 0.7;
            for (let i = 0; i < gamepad.axes.length; i++) {
                const value = gamepad.axes[i];
                const prevValue = this.previousGamepadState[`${statePrefix}edit_axis${i}`] || 0;
                
                if (Math.abs(value) > threshold && Math.abs(prevValue) <= threshold) {
                    this.finishEditing('gamepad', { 
                        type: 'axis', 
                        index: i, 
                        direction: value > 0 ? 1 : -1 
                    });
                }
                this.previousGamepadState[`${statePrefix}edit_axis${i}`] = value;
            }
            
            if (player === this.currentDisplayPlayer) this.updateGamepadVisual(gamepad);
            return;
        }

        // 处理映射的按键输入
        for (const [action, binding] of Object.entries(keyMap)) {
            if (!binding || !binding.gamepad) continue;
            
            let pressed = false;
            const gp = binding.gamepad;
            
            if (gp.type === 'button') {
                // 确保按钮索引有效
                const btnIndex = gp.index;
                if (btnIndex >= 0 && btnIndex < gamepad.buttons.length) {
                    const btn = gamepad.buttons[btnIndex];
                    if (btn) {
                        pressed = btn.pressed || btn.value > 0.5;
                    }
                } else {
                    // 按钮索引超出范围，跳过但不报错
                    continue;
                }
            } else if (gp.type === 'axis') {
                const axisIndex = gp.index;
                if (axisIndex >= 0 && axisIndex < gamepad.axes.length) {
                    const threshold = 0.5;
                    const value = gamepad.axes[axisIndex];
                    pressed = gp.direction > 0 ? value > threshold : value < -threshold;
                } else {
                    continue;
                }
            }
            
            const stateKey = `${statePrefix}action_${action}`;
            
            // 初始化状态为 false（如果未定义）
            if (this.previousGamepadState[stateKey] === undefined) {
                this.previousGamepadState[stateKey] = false;
            }
            
            const prevPressed = this.previousGamepadState[stateKey];
            
            // 只有状态变化时才更新（使用严格布尔比较）
            if (!!pressed !== !!prevPressed) {
                // 单人模式：直接使用手柄分配的玩家编号
                // 多人模式（联机）：如果是远程玩家（非房主），使用 localPlayer 作为显示编号
                const displayPlayer = (this.emulator && !this.emulator.isHost) ? this.localPlayer : player;
                
                this.updateTestDisplay(action, pressed, displayPlayer);
                if (this.isGameRunning) {
                    // 单人模式和多人模式都使用实际的玩家编号处理输入
                    this.processInput(action, pressed, player);
                    
                    // 广播输入时使用显示玩家编号
                    if (this.onInputBroadcast) {
                        this.onInputBroadcast(action, pressed, displayPlayer);
                    }
                }
                this.previousGamepadState[stateKey] = !!pressed;
            }
        }
        
        // 更新当前显示玩家的手柄可视化
        if (player === this.currentDisplayPlayer) {
            this.updateGamepadVisual(gamepad);
        }
    }

    updateGamepadVisual(gamepad) {
        for (let i = 0; i < gamepad.buttons.length; i++) {
            const gpBtn = document.querySelector(`.gp-btn[data-btn="${i}"]`);
            gpBtn?.classList.toggle('active', gamepad.buttons[i].pressed);
        }
        
        const leftStick = document.getElementById('gp-left-stick');
        if (leftStick && gamepad.axes.length >= 2) {
            const indicator = leftStick.querySelector('.stick-indicator');
            if (indicator) {
                const x = gamepad.axes[0] * 8;
                const y = gamepad.axes[1] * 8;
                indicator.style.transform = `translate(${x}px, ${y}px)`;
                const threshold = 0.3;
                const isActive = Math.abs(gamepad.axes[0]) > threshold || Math.abs(gamepad.axes[1]) > threshold;
                leftStick.classList.toggle('active', isActive);
            }
        }
    }

    // 检查是否有本地P2
    hasLocalPlayer2() {
        return this.hasLocalP2;
    }

    setupVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (!gamepad) return;

        gamepad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        gamepad.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

        // 设置摇杆
        this.setupJoystick();

        // 设置按钮
        gamepad.querySelectorAll('.vgp-btn').forEach(btn => {
            const key = btn.dataset.key;
            if (!key) return;
            
            const onPress = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // 使用 localPlayer 作为玩家编号（联机时P2使用自己的虚拟手柄）
                const player = this.localPlayer || 1;
                if (this.isGameRunning) this.processInput(key, true, player);
                btn.classList.add('active');
                // 更新对应玩家的手柄UI面板
                this.updateTestDisplay(key, true, player);
            };
            const onRelease = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const player = this.localPlayer || 1;
                if (this.isGameRunning) this.processInput(key, false, player);
                btn.classList.remove('active');
                this.updateTestDisplay(key, false, player);
            };

            btn.addEventListener('touchstart', onPress, { passive: false });
            btn.addEventListener('touchend', onRelease, { passive: false });
            btn.addEventListener('touchcancel', onRelease, { passive: false });
            btn.addEventListener('mousedown', onPress);
            btn.addEventListener('mouseup', onRelease);
            btn.addEventListener('mouseleave', (e) => {
                if (btn.classList.contains('active')) onRelease(e);
            });
        });
    }
    
    setupJoystick() {
        const joystickArea = document.querySelector('.vgp-joystick-area');
        const joystick = document.getElementById('vgp-joystick');
        const stick = document.getElementById('vgp-stick');
        if (!joystickArea || !joystick || !stick) return;
        
        let isActive = false;
        let centerX = 0;
        let centerY = 0;
        const maxDistance = 50; // 摇杆放大后增加移动距离
        const threshold = 0.3;
        
        // 当前方向状态
        const dirState = { UP: false, DOWN: false, LEFT: false, RIGHT: false };
        
        const updateDirection = (dx, dy) => {
            const distance = Math.sqrt(dx * dx + dy * dy);
            const normalizedX = distance > 0 ? dx / maxDistance : 0;
            const normalizedY = distance > 0 ? dy / maxDistance : 0;
            
            const newState = {
                UP: normalizedY < -threshold,
                DOWN: normalizedY > threshold,
                LEFT: normalizedX < -threshold,
                RIGHT: normalizedX > threshold
            };
            
            // 使用 localPlayer 作为玩家编号
            const player = this.localPlayer || 1;
            
            // 检测状态变化并发送输入
            for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
                if (newState[dir] !== dirState[dir]) {
                    dirState[dir] = newState[dir];
                    if (this.isGameRunning) {
                        this.processInput(dir, newState[dir], player);
                        this.updateTestDisplay(dir, newState[dir], player);
                    }
                }
            }
        };
        
        const onStart = (e) => {
            e.preventDefault();
            isActive = true;
            stick.classList.add('active');
            
            const rect = joystick.getBoundingClientRect();
            centerX = rect.left + rect.width / 2;
            centerY = rect.top + rect.height / 2;
            
            const touch = e.touches ? e.touches[0] : e;
            handleMove(touch.clientX, touch.clientY);
        };
        
        const onMove = (e) => {
            if (!isActive) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            handleMove(touch.clientX, touch.clientY);
        };
        
        const handleMove = (clientX, clientY) => {
            let dx = clientX - centerX;
            let dy = clientY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > maxDistance) {
                dx = (dx / distance) * maxDistance;
                dy = (dy / distance) * maxDistance;
            }
            
            stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            updateDirection(dx, dy);
        };
        
        const onEnd = (e) => {
            if (!isActive) return;
            e.preventDefault();
            isActive = false;
            stick.classList.remove('active');
            stick.style.transform = 'translate(-50%, -50%)';
            
            // 使用 localPlayer 作为玩家编号
            const player = this.localPlayer || 1;
            
            // 释放所有方向
            for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
                if (dirState[dir]) {
                    dirState[dir] = false;
                    if (this.isGameRunning) {
                        this.processInput(dir, false, player);
                        this.updateTestDisplay(dir, false, player);
                    }
                }
            }
        };
        
        joystickArea.addEventListener('touchstart', onStart, { passive: false });
        joystickArea.addEventListener('touchmove', onMove, { passive: false });
        joystickArea.addEventListener('touchend', onEnd, { passive: false });
        joystickArea.addEventListener('touchcancel', onEnd, { passive: false });
        
        // 鼠标支持（调试用）
        joystickArea.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', (e) => {
            if (isActive) onMove(e);
        });
        document.addEventListener('mouseup', onEnd);
    }
    
    showVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (gamepad) gamepad.classList.remove('hidden');
    }
    
    hideVirtualGamepad() {
        const gamepad = document.getElementById('virtual-gamepad');
        if (gamepad) gamepad.classList.add('hidden');
    }
    
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || window.innerWidth <= 768;
    }

    // 处理远程玩家输入（不再需要切换UI模式，统一显示）
    handleRemoteInputMode(player, isGamepad) {
        // 统一UI，不需要切换模式
        // 保留方法以兼容可能的调用
    }
}
