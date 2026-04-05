// --- メインCanvas ---
        const canvas = document.getElementById('tetris');
        const context = canvas.getContext('2d');
        const gameWrapper = document.getElementById('gameWrapper');
        
        // --- サブCanvas (Next/Hold) ---
        const nextCanvas = document.getElementById('next');
        const nextContext = nextCanvas.getContext('2d');
        const holdCanvas = document.getElementById('hold');
        const holdContext = holdCanvas.getContext('2d');

        // --- UI要素 ---
        const scoreElement = document.getElementById('score');
        const levelElement = document.getElementById('level');
        const linesElement = document.getElementById('lines');
        const overlay = document.getElementById('overlay');
        const overlayTitle = document.getElementById('overlay-title');
        const startBtn = document.getElementById('start-btn');
        const soundIcon = document.getElementById('sound-icon');

        // --- 設定 ---
        const COLS = 10;
        const ROWS = 20;
        const BLOCK_SIZE = 36;
        const SUB_BLOCK_SIZE = 25;

        context.scale(BLOCK_SIZE, BLOCK_SIZE);
        nextContext.scale(SUB_BLOCK_SIZE, SUB_BLOCK_SIZE);
        holdContext.scale(SUB_BLOCK_SIZE, SUB_BLOCK_SIZE);

        const COLORS = [
            null,
            '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', 
            '#FF8E0D', '#FFE138', '#3877FF'
        ];

        const SHADOW_COLORS = [
            null,
            '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', 
            '#FF8E0D', '#FFE138', '#3877FF'
        ];

        const arena = createMatrix(COLS, ROWS);
        
        const player = {
            pos: {x: 0, y: 0},
            matrix: null,
            next: null,
            hold: null,
            canHold: true,
            score: 0,
            lines: 0,
            level: 1,
        };

        let particles = [];
        let shakeIntensity = 0;
        let dropCounter = 0;
        let dropInterval = 1000;
        let lastTime = 0;
        let isPaused = true;
        let isGameOver = false;

        // --- サウンドシステム (Web Audio API) ---
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        let audioCtx = new AudioContext();
        let isMuted = false;
        let bgmOscillators = [];

        // 音を鳴らす関数
        function playSound(type) {
            if (isMuted || !audioCtx) return;
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const now = audioCtx.currentTime;

            if (type === 'move') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.05);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } 
            else if (type === 'rotate') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(600, now + 0.05);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            }
            else if (type === 'drop') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(20, now + 0.1);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            }
            else if (type === 'clear') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(800, now + 0.1);
                osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            }
            else if (type === 'gameover') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(10, now + 1.0);
                gainNode.gain.setValueAtTime(0.2, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
                osc.start(now);
                osc.stop(now + 1.0);
            }
        }

        function toggleMute() {
            isMuted = !isMuted;
            if (isMuted) {
                soundIcon.innerText = "🔇";
                soundIcon.classList.remove('sound-active');
            } else {
                soundIcon.innerText = "🔊";
                soundIcon.classList.add('sound-active');
                if (audioCtx.state === 'suspended') audioCtx.resume();
            }
        }

        // --- タッチ操作ハンドラ (修正版：長押し連続移動対応) ---
        let touchInterval = null;
        let touchTimeout = null;

        function startAction(action, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (isPaused || isGameOver) return;
            
            // AudioContextのアンロック(モバイル対応)
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

            // まず1回即座に実行
            executeAction(action);

            // 移動系のボタンなら長押しで連続入力（オートリピート）を有効にする
            if (action === 'left' || action === 'right' || action === 'down') {
                touchTimeout = setTimeout(() => {
                    touchInterval = setInterval(() => {
                        executeAction(action);
                    }, 80); // 連続入力のスピード（ミリ秒: 数字を小さくすると速くなる）
                }, 200); // 長押しと判定するまでの時間（ミリ秒）
            }
        }

        // 指を離した時、またはボタン外に指がズレた時に連続入力を止める
        function stopAction(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            clearTimeout(touchTimeout);
            clearInterval(touchInterval);
        }

        // 実際のアクション実行部分
        function executeAction(action) {
            if (isPaused || isGameOver) return;
            switch(action) {
                case 'left': playerMove(-1); break;
                case 'right': playerMove(1); break;
                case 'rotate': playerRotate(1); break;
                case 'down': playerDrop(); break;
                case 'drop': playerHardDrop(); break;
                case 'hold': playerHold(); break;
            }
        }

        // --- ゲームロジック ---

        function createPiece(type) {
            if (type === 'I') {
                return [
                    [0, 1, 0, 0],
                    [0, 1, 0, 0],
                    [0, 1, 0, 0],
                    [0, 1, 0, 0],
                ];
            } else if (type === 'L') {
                return [
                    [0, 2, 0],
                    [0, 2, 0],
                    [0, 2, 2],
                ];
            } else if (type === 'J') {
                return [
                    [0, 3, 0],
                    [0, 3, 0],
                    [3, 3, 0],
                ];
            } else if (type === 'O') {
                return [
                    [4, 4],
                    [4, 4],
                ];
            } else if (type === 'Z') {
                return [
                    [5, 5, 0],
                    [0, 5, 5],
                    [0, 0, 0],
                ];
            } else if (type === 'S') {
                return [
                    [0, 6, 6],
                    [6, 6, 0],
                    [0, 0, 0],
                ];
            } else if (type === 'T') {
                return [
                    [0, 7, 0],
                    [7, 7, 7],
                    [0, 0, 0],
                ];
            }
        }

        function getRandomPieceType() {
            const pieces = 'ILJOTSZ';
            return pieces[pieces.length * Math.random() | 0];
        }

        function createMatrix(w, h) {
            const matrix = [];
            while (h--) {
                matrix.push(new Array(w).fill(0));
            }
            return matrix;
        }

        function collide(arena, player) {
            const [m, o] = [player.matrix, player.pos];
            for (let y = 0; y < m.length; ++y) {
                for (let x = 0; x < m[y].length; ++x) {
                    if (m[y][x] !== 0 &&
                       (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                        return true;
                    }
                }
            }
            return false;
        }

        class Particle {
            constructor(x, y, color) {
                this.x = x;
                this.y = y;
                this.color = color;
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 0.2 + 0.05;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.life = 1.0;
                this.decay = Math.random() * 0.03 + 0.02;
                this.size = Math.random() * 0.4 + 0.1;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.vy += 0.01;
                this.life -= this.decay;
            }
            draw(ctx) {
                if (this.life <= 0) return;
                ctx.globalAlpha = this.life;
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
                ctx.fillRect(this.x, this.y, this.size, this.size);
                ctx.globalAlpha = 1.0;
                ctx.shadowBlur = 0;
            }
        }

        function spawnParticles(x, y, colorValue, amount = 5) {
            const color = COLORS[colorValue];
            for (let i = 0; i < amount; i++) {
                particles.push(new Particle(x + 0.5, y + 0.5, color));
            }
        }

        function triggerShake(amount) {
            shakeIntensity = amount;
            if (amount > 0.1) {
                gameWrapper.classList.remove('shake');
                void gameWrapper.offsetWidth;
                gameWrapper.classList.add('shake');
            }
        }

        function draw() {
            context.fillStyle = '#000';
            context.fillRect(0, 0, canvas.width, canvas.height);

            context.save();
            if (shakeIntensity > 0) {
                const dx = (Math.random() - 0.5) * shakeIntensity * 2;
                const dy = (Math.random() - 0.5) * shakeIntensity * 2;
                context.translate(dx, dy);
                shakeIntensity *= 0.9;
                if (shakeIntensity < 0.01) shakeIntensity = 0;
            }

            drawMatrix(context, arena, {x: 0, y: 0});
            
            if (!isGameOver) {
                const ghostPos = getGhostPosition();
                drawMatrix(context, player.matrix, ghostPos, true);
                drawMatrix(context, player.matrix, player.pos);
            }

            particles.forEach(p => p.draw(context));
            context.restore();

            drawSubCanvas(nextContext, player.next);
            drawSubCanvas(holdContext, player.hold);
        }

        function drawSubCanvas(ctx, matrix) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 4, 4);
            if (matrix) {
                const offsetX = (4 - matrix[0].length) / 2;
                const offsetY = (4 - matrix.length) / 2;
                drawMatrix(ctx, matrix, {x: offsetX, y: offsetY});
            }
        }

        function getGhostPosition() {
            const ghost = {
                matrix: player.matrix,
                pos: { x: player.pos.x, y: player.pos.y }
            };
            while (!collide(arena, ghost)) {
                ghost.pos.y++;
            }
            ghost.pos.y--;
            return ghost.pos;
        }

        function drawMatrix(ctx, matrix, offset, isGhost = false) {
            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        if (isGhost) {
                            ctx.globalAlpha = 0.2;
                            ctx.fillStyle = COLORS[value];
                            ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                            ctx.strokeStyle = COLORS[value];
                            ctx.lineWidth = 0.1;
                            ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
                            ctx.globalAlpha = 1.0;
                        } else {
                            ctx.shadowColor = SHADOW_COLORS[value];
                            ctx.shadowBlur = 15;
                            ctx.fillStyle = COLORS[value];
                            ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                            ctx.shadowBlur = 0;
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                            ctx.fillRect(x + offset.x + 0.2, y + offset.y + 0.2, 0.6, 0.6);
                        }
                    }
                });
            });
        }

        function merge(arena, player) {
            player.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        arena[y + player.pos.y][x + player.pos.x] = value;
                    }
                });
            });
            triggerShake(0.05);
            playSound('drop');
        }

        function playerRotate(dir) {
            const pos = player.pos.x;
            let offset = 1;
            rotate(player.matrix, dir);
            while (collide(arena, player)) {
                player.pos.x += offset;
                offset = -(offset + (offset > 0 ? 1 : -1));
                if (offset > player.matrix[0].length) {
                    rotate(player.matrix, -dir);
                    player.pos.x = pos;
                    return;
                }
            }
            playSound('rotate');
        }

        function rotate(matrix, dir) {
            for (let y = 0; y < matrix.length; ++y) {
                for (let x = 0; x < y; ++x) {
                    [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
                }
            }
            if (dir > 0) {
                matrix.forEach(row => row.reverse());
            } else {
                matrix.reverse();
            }
        }

        function playerDrop() {
            player.pos.y++;
            if (collide(arena, player)) {
                player.pos.y--;
                merge(arena, player);
                playerReset();
                arenaSweep();
                updateStats();
            }
            dropCounter = 0;
        }

        function playerHardDrop() {
            while (!collide(arena, player)) {
                player.pos.y++;
            }
            player.pos.y--;
            merge(arena, player);
            playerReset();
            arenaSweep();
            updateStats();
            dropCounter = 0;
            triggerShake(0.3);
        }

        function playerMove(dir) {
            player.pos.x += dir;
            if (collide(arena, player)) {
                player.pos.x -= dir;
            } else {
                playSound('move');
            }
        }

        function playerHold() {
            if (!player.canHold) return;
            if (player.hold === null) {
                player.hold = player.matrix;
                playerReset(true);
            } else {
                const temp = player.matrix;
                player.matrix = player.hold;
                player.hold = temp;
                player.pos.y = 0;
                player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
            }
            player.canHold = false;
            playSound('rotate');
        }

        function playerReset(fromHold = false) {
            if (player.next === null) {
                player.next = createPiece(getRandomPieceType());
            }
            player.matrix = player.next;
            player.next = createPiece(getRandomPieceType());
            player.pos.y = 0;
            player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
            player.canHold = true;

            if (collide(arena, player)) {
                isGameOver = true;
                isPaused = true;
                overlayTitle.innerText = "GAME OVER";
                startBtn.innerText = "RETRY";
                overlay.style.display = "flex";
                playSound('gameover');
            }
        }

        function arenaSweep() {
            let rowCount = 0;
            outer: for (let y = arena.length - 1; y > 0; --y) {
                for (let x = 0; x < arena[y].length; ++x) {
                    if (arena[y][x] === 0) {
                        continue outer;
                    }
                }
                const row = arena[y];
                for(let x = 0; x < row.length; x++) {
                    spawnParticles(x, y, row[x], 8);
                }
                const emptyRow = arena.splice(y, 1)[0].fill(0);
                arena.unshift(emptyRow);
                ++y;
                rowCount++;
            }
            
            if (rowCount > 0) {
                const lineScores = [0, 40, 100, 300, 1200];
                player.score += (lineScores[rowCount] || (rowCount * 100)) * player.level;
                player.lines += rowCount;
                
                const newLevel = Math.floor(player.lines / 10) + 1;
                if (newLevel > player.level) {
                    player.level = newLevel;
                    dropInterval = Math.max(100, 1000 - (player.level - 1) * 100);
                }
                triggerShake(rowCount * 0.15); 
                playSound('clear');
            }
        }

        function updateStats() {
            scoreElement.innerText = player.score;
            levelElement.innerText = player.level;
            linesElement.innerText = player.lines;
        }

        function update(time = 0) {
            if (isPaused) return;

            const deltaTime = time - lastTime;
            lastTime = time;

            dropCounter += deltaTime;
            if (dropCounter > dropInterval) {
                playerDrop();
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                if (particles[i].life <= 0) {
                    particles.splice(i, 1);
                }
            }
            draw();
            requestAnimationFrame(update);
        }

        document.addEventListener('keydown', event => {
            if([32, 37, 38, 39, 40].indexOf(event.keyCode) > -1) {
                event.preventDefault();
            }
            if (event.keyCode === 27) { // Escape
                toggleMute();
                togglePause();
                return;
            }
            if (isPaused) return;

            if (event.keyCode === 37) { playerMove(-1); } 
            else if (event.keyCode === 39) { playerMove(1); } 
            else if (event.keyCode === 40) { playerDrop(); } 
            else if (event.keyCode === 38) { playerRotate(1); } 
            else if (event.keyCode === 32) { playerHardDrop(); } 
            else if (event.keyCode === 67) { playerHold(); }
        });

        function startGame() {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            toggleMute(); // 初回のみアイコン更新用
            toggleMute(); // 戻す
            if (!isMuted) {
                soundIcon.innerText = "🔊";
                soundIcon.classList.add('sound-active');
            }
            togglePause();
        }

        function togglePause() {
            if (isGameOver) {
                arena.forEach(row => row.fill(0));
                player.score = 0;
                player.lines = 0;
                player.level = 1;
                player.hold = null;
                player.next = null;
                dropInterval = 1000;
                updateStats();
                isGameOver = false;
                playerReset();
                particles = [];
            }

            if (isPaused) {
                isPaused = false;
                overlay.style.display = "none";
                if (player.matrix === null) {
                    playerReset();
                }
                update();
            } else {
                isPaused = true;
                overlayTitle.innerText = "PAUSED";
                startBtn.innerText = "RESUME";
                overlay.style.display = "flex";
            }
        }

        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);