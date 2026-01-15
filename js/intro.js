// 红白机风格开场动画 - 梦回童年
export class IntroAnimation {
    constructor(onComplete) {
        this.onComplete = onComplete;
        this.currentScene = 0;
        this.isAnimating = false;
        this.selectedMode = null;
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.frameId = null;
        this.pixelSize = 4;
        
        // 动画状态
        this.manX = 0;
        this.manY = 0;
        this.manFrame = 0;
        this.frameCounter = 0;
        this.textIndex = 0;
        this.textTimer = 0;
        this.stars = [];
        this.dreamWave = 0;
        
        // 颜色定义 (NES调色板风格)
        this.colors = {
            black: '#0f0f0f',
            darkBlue: '#0000bc',
            blue: '#0078f8',
            lightBlue: '#3cbcfc',
            darkGreen: '#008800',
            green: '#00b800',
            cyan: '#00e8d8',
            red: '#e40058',
            orange: '#f83800',
            yellow: '#f8d800',
            gold: '#d4a017',
            skin: '#fca044',
            skinLight: '#f8d8b8',
            white: '#fcfcfc',
            gray: '#7c7c7c',
            darkGray: '#3c3c3c',
            brown: '#ac7c00',
            purple: '#9400bc'
        };
    }

    init() {
        this.createContainer();
        this.createCanvas();
        this.generateStars();
        this.showTitleScreen();
    }

    // 标题画面
    showTitleScreen() {
        this.isAnimating = true;
        let titleAlpha = 0;
        let pressStart = false;
        
        const animate = () => {
            if (!this.isAnimating) return;
            this.frameCounter++;
            
            // 黑色背景
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(0, 0, 512, 480);
            
            // 星星背景
            this.stars.forEach(star => {
                const twinkle = Math.sin(this.frameCounter * 0.05 + star.twinkle);
                if (twinkle > 0) {
                    this.ctx.fillStyle = twinkle > 0.5 ? this.colors.white : this.colors.lightBlue;
                    this.ctx.fillRect(star.x, star.y, star.size, star.size);
                }
            });
            
            // 标题淡入
            if (this.frameCounter < 60) {
                titleAlpha = this.frameCounter / 60;
            } else {
                titleAlpha = 1;
            }
            
            this.ctx.globalAlpha = titleAlpha;
            
            // 游戏标题
            this.drawPixelText('FAMILY', 160, 120, this.colors.red, 3);
            this.drawPixelText('COMPUTER', 120, 170, this.colors.gold || this.colors.yellow, 3);
            
            // 副标题
            this.drawPixelText('梦 回 童 年', 170, 240, this.colors.white, 2);
            
            this.ctx.globalAlpha = 1;
            
            // 闪烁的 "PRESS START"
            if (this.frameCounter > 90) {
                pressStart = true;
                if (Math.floor(this.frameCounter / 30) % 2 === 0) {
                    this.drawPixelText('- PRESS START -', 140, 350, this.colors.cyan, 1.5);
                }
            }
            
            // 版权信息
            this.drawPixelText('© 2026 RETRO GAMING', 150, 420, this.colors.gray, 1);
            
            // 自动进入下一场景或等待点击
            if (this.frameCounter > 300 || (pressStart && this.frameCounter > 120)) {
                // 检测点击或按键
            }
            
            if (this.frameCounter > 400) {
                this.isAnimating = false;
                this.startScene(0);
                return;
            }
            
            this.frameId = requestAnimationFrame(animate);
        };
        
        // 点击或按键跳过标题
        const skipTitle = () => {
            if (this.currentScene === -1 && this.frameCounter > 60) {
                this.isAnimating = false;
                this.startScene(0);
            }
        };
        
        this.canvas.addEventListener('click', skipTitle, { once: true });
        this.currentScene = -1;
        
        animate();
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'intro-container';
        this.container.innerHTML = `
            <div class="intro-scanlines"></div>
            <canvas id="intro-canvas"></canvas>
            <div id="intro-text" class="intro-text"></div>
            <div id="intro-choices" class="intro-choices hidden"></div>
            <div id="intro-skip" class="intro-skip">按 ENTER 或点击跳过</div>
        `;
        document.body.appendChild(this.container);
        
        // 跳过按钮
        document.getElementById('intro-skip').addEventListener('click', () => this.skip());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && this.container) {
                if (this.currentScene < 3) {
                    this.skip();
                }
            }
        });
    }

    createCanvas() {
        this.canvas = document.getElementById('intro-canvas');
        this.canvas.width = 512;
        this.canvas.height = 480;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
    }

    generateStars() {
        this.stars = [];
        for (let i = 0; i < 50; i++) {
            this.stars.push({
                x: Math.random() * 512,
                y: Math.random() * 480,
                size: Math.random() > 0.7 ? 2 : 1,
                twinkle: Math.random() * Math.PI * 2
            });
        }
    }

    startScene(sceneNum) {
        this.currentScene = sceneNum;
        this.textIndex = 0;
        this.frameCounter = 0;
        
        const textEl = document.getElementById('intro-text');
        const choicesEl = document.getElementById('intro-choices');
        textEl.textContent = '';
        choicesEl.classList.add('hidden');
        choicesEl.innerHTML = '';
        
        switch(sceneNum) {
            case 0: this.sceneOffice(); break;
            case 1: this.sceneDream(); break;
            case 2: this.sceneArcade(); break;
            case 3: this.sceneChoice(); break;
        }
    }


    // 场景0: 办公室 - 下班后疲惫的男子
    sceneOffice() {
        this.isAnimating = true;
        this.manX = 400;
        this.manY = 280;
        let phase = 0;
        let sleepZ = 0;
        
        const animate = () => {
            if (!this.isAnimating) return;
            this.frameCounter++;
            
            // 清屏 - 办公室背景
            this.ctx.fillStyle = this.colors.darkGray;
            this.ctx.fillRect(0, 0, 512, 480);
            
            // 窗户 - 夜景
            this.ctx.fillStyle = this.colors.darkBlue;
            this.ctx.fillRect(50, 80, 150, 120);
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(55, 85, 140, 110);
            
            // 窗外星星
            this.ctx.fillStyle = this.colors.yellow;
            this.stars.slice(0, 10).forEach(star => {
                if (Math.sin(this.frameCounter * 0.05 + star.twinkle) > 0) {
                    this.ctx.fillRect(55 + (star.x % 130), 85 + (star.y % 100), star.size, star.size);
                }
            });
            
            // 月亮
            this.ctx.fillStyle = this.colors.yellow;
            this.ctx.beginPath();
            this.ctx.arc(150, 120, 20, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 办公桌
            this.ctx.fillStyle = this.colors.brown;
            this.ctx.fillRect(280, 320, 200, 20);
            this.ctx.fillRect(300, 340, 20, 80);
            this.ctx.fillRect(440, 340, 20, 80);
            
            // 电脑显示器
            this.ctx.fillStyle = this.colors.darkGray;
            this.ctx.fillRect(340, 240, 80, 60);
            this.ctx.fillStyle = this.colors.darkBlue;
            this.ctx.fillRect(345, 245, 70, 50);
            this.ctx.fillStyle = this.colors.gray;
            this.ctx.fillRect(370, 300, 30, 20);
            
            // 时钟显示 23:30
            this.ctx.fillStyle = this.colors.red;
            this.ctx.fillRect(250, 100, 60, 30);
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(255, 105, 50, 20);
            this.drawPixelText('23:30', 260, 108, this.colors.red, 1);
            
            // 绘制疲惫的男子
            this.drawOfficeMan(this.manX, this.manY, phase);
            
            // 睡着的Z
            if (phase >= 2) {
                sleepZ += 0.02;
                const zCount = Math.min(3, Math.floor(sleepZ));
                for (let i = 0; i < zCount; i++) {
                    const zx = this.manX - 30 - i * 15;
                    const zy = this.manY - 40 - i * 20 + Math.sin(this.frameCounter * 0.1 + i) * 5;
                    const size = 1 + i * 0.3;
                    this.drawPixelText('Z', zx, zy, this.colors.white, size);
                }
            }
            
            // 动画阶段
            if (this.frameCounter < 60) {
                phase = 0; // 站立
            } else if (this.frameCounter < 120) {
                phase = 1; // 坐下
                this.manY = 280 + (this.frameCounter - 60) * 0.5;
            } else if (this.frameCounter < 180) {
                phase = 2; // 趴下睡觉
            } else if (this.frameCounter > 250) {
                // 进入梦境
                this.isAnimating = false;
                this.startScene(1);
                return;
            }
            
            // 文字
            if (this.frameCounter > 30 && this.frameCounter < 100) {
                this.showText('又是加班到深夜...');
            } else if (this.frameCounter > 130) {
                this.showText('好累...先休息一下...');
            }
            
            this.frameId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    // 场景1: 进入梦境
    sceneDream() {
        this.isAnimating = true;
        this.dreamWave = 0;
        let fadeIn = 0;
        let childAppear = 0;
        
        const animate = () => {
            if (!this.isAnimating) return;
            this.frameCounter++;
            this.dreamWave += 0.03;
            
            // 梦幻渐变背景
            const gradient = this.ctx.createLinearGradient(0, 0, 0, 480);
            gradient.addColorStop(0, this.colors.purple);
            gradient.addColorStop(0.5, this.colors.darkBlue);
            gradient.addColorStop(1, this.colors.black);
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, 512, 480);
            
            // 梦幻波纹效果
            for (let i = 0; i < 5; i++) {
                const wave = (this.dreamWave + i * 0.5) % (Math.PI * 2);
                const radius = 50 + wave * 80;
                const alpha = Math.max(0, 1 - wave / (Math.PI * 2));
                this.ctx.strokeStyle = `rgba(252, 252, 252, ${alpha * 0.3})`;
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(256, 240, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            
            // 闪烁的星星
            this.stars.forEach(star => {
                const twinkle = Math.sin(this.frameCounter * 0.08 + star.twinkle);
                if (twinkle > 0) {
                    this.ctx.fillStyle = twinkle > 0.5 ? this.colors.white : this.colors.lightBlue;
                    this.ctx.fillRect(star.x, star.y, star.size * 2, star.size * 2);
                }
            });
            
            // 文字效果
            if (this.frameCounter < 80) {
                fadeIn = Math.min(1, this.frameCounter / 40);
                this.ctx.globalAlpha = fadeIn;
                this.drawPixelText('Z z z . . .', 200, 150, this.colors.white, 2);
                this.ctx.globalAlpha = 1;
            } else if (this.frameCounter < 160) {
                this.showText('咦...这里是...');
            } else if (this.frameCounter < 240) {
                // 小时候的自己出现
                childAppear = Math.min(1, (this.frameCounter - 160) / 40);
                this.ctx.globalAlpha = childAppear;
                this.drawChildBoy(256, 300);
                this.ctx.globalAlpha = 1;
                this.showText('是小时候的我！');
            } else if (this.frameCounter > 300) {
                this.isAnimating = false;
                this.startScene(2);
                return;
            }
            
            this.frameId = requestAnimationFrame(animate);
        };
        
        animate();
    }


    // 场景2: 游戏厅门口
    sceneArcade() {
        this.isAnimating = true;
        this.manX = -50;
        let neonPhase = 0;
        
        const animate = () => {
            if (!this.isAnimating) return;
            this.frameCounter++;
            neonPhase += 0.1;
            
            // 傍晚天空
            const gradient = this.ctx.createLinearGradient(0, 0, 0, 480);
            gradient.addColorStop(0, this.colors.orange);
            gradient.addColorStop(0.3, this.colors.red);
            gradient.addColorStop(0.6, this.colors.purple);
            gradient.addColorStop(1, this.colors.darkBlue);
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, 512, 480);
            
            // 地面
            this.ctx.fillStyle = this.colors.darkGray;
            this.ctx.fillRect(0, 380, 512, 100);
            
            // 游戏厅建筑
            this.ctx.fillStyle = this.colors.gray;
            this.ctx.fillRect(100, 150, 312, 230);
            
            // 霓虹灯招牌
            const neonColor = Math.sin(neonPhase) > 0 ? this.colors.cyan : this.colors.lightBlue;
            const neonColor2 = Math.sin(neonPhase + 1) > 0 ? this.colors.red : this.colors.orange;
            
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(130, 160, 252, 50);
            
            this.drawPixelText('GAME', 150, 170, neonColor, 2.5);
            this.drawPixelText('CENTER', 270, 170, neonColor2, 2.5);
            
            // 门
            this.ctx.fillStyle = this.colors.brown;
            this.ctx.fillRect(220, 280, 72, 100);
            this.ctx.fillStyle = this.colors.yellow;
            this.ctx.fillRect(225, 285, 62, 90);
            
            // 门内的光
            this.ctx.fillStyle = Math.sin(neonPhase * 2) > 0 ? this.colors.cyan : this.colors.purple;
            this.ctx.fillRect(230, 290, 52, 80);
            
            // 游戏机剪影
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(240, 310, 15, 40);
            this.ctx.fillRect(260, 310, 15, 40);
            
            // 窗户
            for (let i = 0; i < 3; i++) {
                this.ctx.fillStyle = this.colors.darkBlue;
                this.ctx.fillRect(120 + i * 100, 220, 40, 40);
                // 窗内闪烁
                if (Math.sin(neonPhase + i) > 0) {
                    this.ctx.fillStyle = this.colors.cyan;
                    this.ctx.fillRect(125 + i * 100, 225, 30, 30);
                }
            }
            
            // 小男孩走向游戏厅
            if (this.frameCounter < 150) {
                this.manX = -50 + this.frameCounter * 1.5;
            } else {
                this.manX = 175;
            }
            
            this.drawChildBoy(this.manX, 340);
            
            // 文字
            if (this.frameCounter > 50 && this.frameCounter < 130) {
                this.showText('是那个游戏厅！');
            } else if (this.frameCounter > 160 && this.frameCounter < 250) {
                this.showText('我要进去玩游戏！');
            } else if (this.frameCounter > 280) {
                this.isAnimating = false;
                this.startScene(3);
                return;
            }
            
            this.frameId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    // 场景3: 选择 - 交互场景
    sceneChoice() {
        this.isAnimating = true;
        let neonPhase = 0;
        let friendX = 500;
        let friend2X = -50;
        let showChoices = false;
        
        const animate = () => {
            if (!this.isAnimating) return;
            this.frameCounter++;
            neonPhase += 0.08;
            
            // 游戏厅内部
            this.ctx.fillStyle = this.colors.black;
            this.ctx.fillRect(0, 0, 512, 480);
            
            // 地板格子
            for (let x = 0; x < 16; x++) {
                for (let y = 0; y < 4; y++) {
                    this.ctx.fillStyle = (x + y) % 2 === 0 ? this.colors.darkGray : this.colors.gray;
                    this.ctx.fillRect(x * 32, 350 + y * 32, 32, 32);
                }
            }
            
            // 游戏机
            this.drawArcadeMachine(80, 200, neonPhase, this.colors.red);
            this.drawArcadeMachine(200, 200, neonPhase + 1, this.colors.blue);
            this.drawArcadeMachine(320, 200, neonPhase + 2, this.colors.green);
            this.drawArcadeMachine(440, 200, neonPhase + 3, this.colors.purple);
            
            // 天花板霓虹灯
            const ceilColor = Math.sin(neonPhase) > 0 ? this.colors.cyan : this.colors.purple;
            this.ctx.fillStyle = ceilColor;
            this.ctx.fillRect(50, 30, 412, 8);
            
            // 主角小男孩 - 中间
            this.drawChildBoy(256, 380);
            
            // 朋友们
            if (this.frameCounter > 60) {
                friendX = Math.max(380, 500 - (this.frameCounter - 60) * 2);
                this.drawFriendBoy(friendX, 380, this.colors.green);
            }
            if (this.frameCounter > 90) {
                friend2X = Math.min(130, -50 + (this.frameCounter - 90) * 2);
                this.drawFriendBoy(friend2X, 380, this.colors.orange);
            }
            
            // 对话气泡
            if (this.frameCounter > 120 && this.frameCounter < 200) {
                this.drawSpeechBubble(friendX - 30, 320, '一起玩吧!');
            }
            if (this.frameCounter > 150 && this.frameCounter < 200) {
                this.drawSpeechBubble(friend2X + 30, 320, '来嘛来嘛!');
            }
            
            // 显示选择
            if (this.frameCounter > 200 && !showChoices) {
                showChoices = true;
                this.showChoices();
            }
            
            // 文字
            if (this.frameCounter > 30 && this.frameCounter < 100) {
                this.showText('哇，好多游戏机！');
            } else if (this.frameCounter > 200) {
                this.showText('今天想怎么玩呢？');
            }
            
            this.frameId = requestAnimationFrame(animate);
        };
        
        animate();
    }


    // 显示选择按钮
    showChoices() {
        const choicesEl = document.getElementById('intro-choices');
        choicesEl.classList.remove('hidden');
        choicesEl.innerHTML = `
            <div class="intro-choice" data-mode="single">
                <div class="choice-icon">🎮</div>
                <div class="choice-title">自己玩一会</div>
                <div class="choice-desc">单人游戏</div>
            </div>
            <div class="intro-choice" data-mode="create">
                <div class="choice-icon">📢</div>
                <div class="choice-title">叫朋友来玩</div>
                <div class="choice-desc">创建房间</div>
            </div>
            <div class="intro-choice" data-mode="join">
                <div class="choice-icon">🏃</div>
                <div class="choice-title">朋友叫我去</div>
                <div class="choice-desc">加入房间</div>
            </div>
        `;
        
        choicesEl.querySelectorAll('.intro-choice').forEach(choice => {
            choice.addEventListener('click', () => {
                this.selectedMode = choice.dataset.mode;
                this.selectChoice(choice);
            });
        });
    }

    selectChoice(choiceEl) {
        // 高亮选中
        document.querySelectorAll('.intro-choice').forEach(c => c.classList.remove('selected'));
        choiceEl.classList.add('selected');
        
        // 播放选中动画后结束
        setTimeout(() => {
            this.endIntro();
        }, 800);
    }

    // 绘制办公室里的男子
    drawOfficeMan(x, y, phase) {
        const p = this.pixelSize;
        
        // 头
        this.ctx.fillStyle = this.colors.skinLight;
        this.ctx.fillRect(x - 8*p, y - 24*p, 16*p, 16*p);
        
        // 头发
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 8*p, y - 28*p, 16*p, 6*p);
        this.ctx.fillRect(x - 10*p, y - 24*p, 4*p, 8*p);
        this.ctx.fillRect(x + 6*p, y - 24*p, 4*p, 8*p);
        
        // 眼睛 (闭着)
        this.ctx.fillStyle = this.colors.black;
        if (phase >= 2) {
            // 闭眼
            this.ctx.fillRect(x - 5*p, y - 16*p, 4*p, 1*p);
            this.ctx.fillRect(x + 1*p, y - 16*p, 4*p, 1*p);
        } else {
            // 睁眼但疲惫
            this.ctx.fillRect(x - 5*p, y - 17*p, 3*p, 2*p);
            this.ctx.fillRect(x + 2*p, y - 17*p, 3*p, 2*p);
        }
        
        // 身体 - 西装
        this.ctx.fillStyle = this.colors.darkGray;
        this.ctx.fillRect(x - 10*p, y - 8*p, 20*p, 20*p);
        
        // 领带
        this.ctx.fillStyle = this.colors.red;
        this.ctx.fillRect(x - 2*p, y - 8*p, 4*p, 16*p);
        
        if (phase >= 2) {
            // 趴在桌上
            this.ctx.fillStyle = this.colors.skinLight;
            this.ctx.fillRect(x - 20*p, y - 4*p, 12*p, 8*p); // 手臂
        }
    }

    // 绘制小男孩
    drawChildBoy(x, y) {
        const p = this.pixelSize;
        const bounce = Math.sin(this.frameCounter * 0.15) * 2;
        y += bounce;
        
        // 头
        this.ctx.fillStyle = this.colors.skinLight;
        this.ctx.fillRect(x - 6*p, y - 20*p, 12*p, 12*p);
        
        // 头发
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 6*p, y - 24*p, 12*p, 6*p);
        this.ctx.fillRect(x - 8*p, y - 22*p, 4*p, 4*p);
        
        // 眼睛 (大眼睛)
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 4*p, y - 16*p, 3*p, 3*p);
        this.ctx.fillRect(x + 1*p, y - 16*p, 3*p, 3*p);
        // 眼睛高光
        this.ctx.fillStyle = this.colors.white;
        this.ctx.fillRect(x - 3*p, y - 15*p, 1*p, 1*p);
        this.ctx.fillRect(x + 2*p, y - 15*p, 1*p, 1*p);
        
        // 嘴巴 (开心)
        this.ctx.fillStyle = this.colors.red;
        this.ctx.fillRect(x - 2*p, y - 11*p, 4*p, 2*p);
        
        // 身体 - T恤
        this.ctx.fillStyle = this.colors.red;
        this.ctx.fillRect(x - 6*p, y - 8*p, 12*p, 12*p);
        
        // 裤子
        this.ctx.fillStyle = this.colors.blue;
        this.ctx.fillRect(x - 5*p, y + 4*p, 10*p, 8*p);
        
        // 腿
        this.ctx.fillRect(x - 5*p, y + 12*p, 4*p, 6*p);
        this.ctx.fillRect(x + 1*p, y + 12*p, 4*p, 6*p);
        
        // 鞋
        this.ctx.fillStyle = this.colors.white;
        this.ctx.fillRect(x - 6*p, y + 18*p, 5*p, 3*p);
        this.ctx.fillRect(x + 1*p, y + 18*p, 5*p, 3*p);
    }

    // 绘制朋友小男孩
    drawFriendBoy(x, y, shirtColor) {
        const p = this.pixelSize;
        const bounce = Math.sin(this.frameCounter * 0.15 + 1) * 2;
        y += bounce;
        
        // 头
        this.ctx.fillStyle = this.colors.skinLight;
        this.ctx.fillRect(x - 6*p, y - 20*p, 12*p, 12*p);
        
        // 头发 (不同发型)
        this.ctx.fillStyle = this.colors.brown;
        this.ctx.fillRect(x - 6*p, y - 24*p, 12*p, 5*p);
        this.ctx.fillRect(x + 4*p, y - 22*p, 4*p, 4*p);
        
        // 眼睛
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 4*p, y - 16*p, 3*p, 3*p);
        this.ctx.fillRect(x + 1*p, y - 16*p, 3*p, 3*p);
        
        // 嘴巴
        this.ctx.fillStyle = this.colors.red;
        this.ctx.fillRect(x - 2*p, y - 11*p, 4*p, 2*p);
        
        // 身体
        this.ctx.fillStyle = shirtColor;
        this.ctx.fillRect(x - 6*p, y - 8*p, 12*p, 12*p);
        
        // 裤子
        this.ctx.fillStyle = this.colors.darkGray;
        this.ctx.fillRect(x - 5*p, y + 4*p, 10*p, 8*p);
        this.ctx.fillRect(x - 5*p, y + 12*p, 4*p, 6*p);
        this.ctx.fillRect(x + 1*p, y + 12*p, 4*p, 6*p);
        
        // 鞋
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 6*p, y + 18*p, 5*p, 3*p);
        this.ctx.fillRect(x + 1*p, y + 18*p, 5*p, 3*p);
    }

    // 绘制游戏机
    drawArcadeMachine(x, y, phase, accentColor) {
        const p = this.pixelSize;
        
        // 机身
        this.ctx.fillStyle = this.colors.darkGray;
        this.ctx.fillRect(x - 15*p, y, 30*p, 40*p);
        
        // 屏幕
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 12*p, y + 3*p, 24*p, 18*p);
        
        // 屏幕内容闪烁
        const screenColor = Math.sin(phase) > 0 ? accentColor : this.colors.darkBlue;
        this.ctx.fillStyle = screenColor;
        this.ctx.fillRect(x - 10*p, y + 5*p, 20*p, 14*p);
        
        // 控制面板
        this.ctx.fillStyle = this.colors.gray;
        this.ctx.fillRect(x - 12*p, y + 24*p, 24*p, 12*p);
        
        // 摇杆
        this.ctx.fillStyle = this.colors.black;
        this.ctx.fillRect(x - 8*p, y + 27*p, 4*p, 6*p);
        this.ctx.fillStyle = this.colors.red;
        this.ctx.fillRect(x - 9*p, y + 25*p, 6*p, 4*p);
        
        // 按钮
        this.ctx.fillStyle = accentColor;
        this.ctx.fillRect(x + 2*p, y + 28*p, 4*p, 4*p);
        this.ctx.fillRect(x + 8*p, y + 28*p, 4*p, 4*p);
    }

    // 绘制对话气泡
    drawSpeechBubble(x, y, text) {
        const p = this.pixelSize;
        const width = text.length * 8 + 20;
        
        this.ctx.fillStyle = this.colors.white;
        this.ctx.fillRect(x, y, width, 24);
        // 气泡尖角
        this.ctx.fillRect(x + 10, y + 24, 8, 8);
        
        this.drawPixelText(text, x + 8, y + 6, this.colors.black, 1);
    }

    // 绘制像素文字
    drawPixelText(text, x, y, color, scale = 1) {
        this.ctx.fillStyle = color;
        this.ctx.font = `${12 * scale}px "Press Start 2P", monospace`;
        this.ctx.fillText(text, x, y + 10 * scale);
    }

    // 显示底部文字
    showText(text) {
        const textEl = document.getElementById('intro-text');
        if (textEl.textContent !== text) {
            textEl.textContent = text;
        }
    }

    // 跳过动画
    skip() {
        this.isAnimating = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
        this.endIntro();
    }

    // 结束动画
    endIntro() {
        this.isAnimating = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
        
        // 淡出效果
        this.container.classList.add('fade-out');
        
        setTimeout(() => {
            this.container.remove();
            this.container = null;
            
            // 回调并传递选择的模式
            if (this.onComplete) {
                this.onComplete(this.selectedMode);
            }
        }, 500);
    }
}
