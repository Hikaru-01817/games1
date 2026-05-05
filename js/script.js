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
        const modeSelect = document.getElementById('mode-select');
        const holdPanel = document.getElementById('holdPanel');
        const holdLabel = document.getElementById('holdLabel');
        const nextLabel = document.getElementById('nextLabel');
        const mobileHold = document.getElementById('mobile-hold');
        const mobileDrop = document.getElementById('mobile-drop');
        const resultNextBtn = document.getElementById('result-next-btn');
        const rankingTitle = document.getElementById('ranking-title');
        const rankingBackBtn = document.getElementById('ranking-back-btn');
        const rankingTabs = document.getElementById('ranking-tabs');
        const helpTitle = document.getElementById('help-title');
        const helpContent = document.getElementById('help-content');
        const helpTabs = document.getElementById('help-tabs');

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
        let currentGame = 'tetris';

        // --- サウンドシステム (Web Audio API) ---
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        let audioCtx = new AudioContext();
        let isMuted = false;
        let bgmOscillators = [];

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

        let touchInterval = null;
        let touchTimeout = null;

        function startAction(action, event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (isPaused || isGameOver) return;
            
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

            executeAction(action);

            if (action === 'left' || action === 'right') {
                touchTimeout = setTimeout(() => {
                    touchInterval = setInterval(() => {
                        executeAction(action);
                    }, 80); 
                }, 200); 
            }
        }

        function stopAction(event) {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            clearTimeout(touchTimeout);
            clearInterval(touchInterval);
        }

        function executeAction(action) {
            if (isPaused || isGameOver) return;
            if (currentGame === 'puyo') {
                executePuyoAction(action);
                return;
            }
            switch(action) {
                case 'left': playerMove(-1); break;
                case 'right': playerMove(1); break;
                case 'rotate': playerRotate(1); break;
                case 'drop': playerHardDrop(); break;
                case 'hold': playerHold(); break;
            }
        }

        // --- ゲームロジック ---

        function createPiece(type) {
            if (type === 'I') { return [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]; }
            else if (type === 'L') { return [[0, 2, 0], [0, 2, 0], [0, 2, 2]]; }
            else if (type === 'J') { return [[0, 3, 0], [0, 3, 0], [3, 3, 0]]; }
            else if (type === 'O') { return [[4, 4], [4, 4]]; }
            else if (type === 'Z') { return [[5, 5, 0], [0, 5, 5], [0, 0, 0]]; }
            else if (type === 'S') { return [[0, 6, 6], [6, 6, 0], [0, 0, 0]]; }
            else if (type === 'T') { return [[0, 7, 0], [7, 7, 7], [0, 0, 0]]; }
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

        function drawTetris() {
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

            // --- 修正: ゲームオーバー時の処理 ---
            if (collide(arena, player) && !fromHold) {
                isGameOver = true;
                isPaused = true;
                playSound('gameover');
                handleTetrisGameOverSequence();
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
            if (currentGame === 'puyo') {
                scoreElement.innerText = puyo.score;
                levelElement.innerText = 'PUYO';
                linesElement.innerText = puyo.chain;
                return;
            }
            scoreElement.innerText = player.score;
            levelElement.innerText = player.level;
            linesElement.innerText = player.lines;
        }

        function update(time = 0) {
            if (isPaused) return;

            const deltaTime = time - lastTime;
            lastTime = time;

            if (currentGame === 'puyo') {
                updatePuyo(deltaTime);
            } else {
                updateTetris(deltaTime);
            }

            requestAnimationFrame(update);
        }

        function updateTetris(deltaTime) {
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
            drawTetris();
        }

        document.addEventListener('keydown', event => {
            if([16, 32, 37, 38, 39, 40, 67].indexOf(event.keyCode) > -1) {
                event.preventDefault();
            }
            if (event.keyCode === 27) { // Escape
                if (!isGameOver) {
                    toggleMute();
                    togglePause();
                }
                return;
            }
            if (event.keyCode === 80 && !isGameOver) {
                if (overlay.style.display !== "flex" || overlayTitle.innerText === "PAUSED") {
                    togglePause();
                }
                return;
            }
            if (isPaused) return;

            if (currentGame === 'puyo') {
                if (event.keyCode === 37) { puyoMove(-1); }
                else if (event.keyCode === 39) { puyoMove(1); }
                else if (event.keyCode === 38) { puyoRotate(1); }
                else if (event.keyCode === 32) { puyoHardDrop(); }
                else if (event.keyCode === 67) { puyoHold(); }
                return;
            }

            if (event.keyCode === 37) { playerMove(-1); } 
            else if (event.keyCode === 39) { playerMove(1); } 
            else if (event.keyCode === 38) { playerRotate(1); } 
            else if (event.keyCode === 32) { playerHardDrop(); } 
            else if (event.keyCode === 67) { playerHold(); }
        });

        // =========================================
        // 追加: 画面遷移とスコアランキング管理
        // =========================================

        function switchOverlayScreen(screenId) {
            document.getElementById('screen-start').style.display = 'none';
            document.getElementById('screen-result').style.display = 'none';
            document.getElementById('screen-ranking').style.display = 'none';
            document.getElementById('screen-help').style.display = 'none';
            document.getElementById(screenId).style.display = 'flex';
        }


        const HELP_DATA = {
            tetris: {
                title: 'TETRIS MODE',
                description: '&#x843D;&#x3061;&#x3066;&#x304F;&#x308B;&#x30D6;&#x30ED;&#x30C3;&#x30AF;&#x3092;&#x5DE6;&#x53F3;&#x306B;&#x52D5;&#x304B;&#x3057;&#x3001;&#x56DE;&#x8EE2;&#x3055;&#x305B;&#x306A;&#x304C;&#x3089;&#x6A2A;&#x4E00;&#x5217;&#x3092;&#x305D;&#x308D;&#x3048;&#x3066;&#x6D88;&#x3057;&#x3066;&#x3044;&#x304F;&#x30E2;&#x30FC;&#x30C9;&#x3067;&#x3059;&#x3002;&#x30E9;&#x30A4;&#x30F3;&#x3092;&#x6D88;&#x3059;&#x307B;&#x3069;&#x30B9;&#x30B3;&#x30A2;&#x304C;&#x5897;&#x3048;&#x3001;&#x4E00;&#x5B9A;&#x6570;&#x306E;&#x30E9;&#x30A4;&#x30F3;&#x3092;&#x6D88;&#x3059;&#x3068;&#x30EC;&#x30D9;&#x30EB;&#x304C;&#x4E0A;&#x304C;&#x308A;&#x307E;&#x3059;&#x3002;',
                pc: ['&larr; / &rarr;&#xFF1A;&#x5DE6;&#x53F3;&#x79FB;&#x52D5;', '&uarr;&#xFF1A;&#x56DE;&#x8EE2;', 'Space&#xFF1A;&#x30CF;&#x30FC;&#x30C9;&#x30C9;&#x30ED;&#x30C3;&#x30D7;', 'C&#xFF1A;&#x30DB;&#x30FC;&#x30EB;&#x30C9;', 'P&#xFF1A;&#x4E00;&#x6642;&#x505C;&#x6B62;'],
                mobile: ['&larr;&#xFF1A;&#x5DE6;&#x79FB;&#x52D5;', '&rarr;&#xFF1A;&#x53F3;&#x79FB;&#x52D5;', 'ROT&#xFF1A;&#x56DE;&#x8EE2;', 'DROP&#xFF1A;&#x4E00;&#x6C17;&#x306B;&#x843D;&#x4E0B;', 'HOLD&#xFF1A;&#x30DB;&#x30FC;&#x30EB;&#x30C9;']
            },
            puyo: {
                title: 'PUYO MODE',
                description: '2&#x500B;1&#x7D44;&#x3067;&#x843D;&#x3061;&#x3066;&#x304F;&#x308B;&#x3077;&#x3088;&#x3092;&#x64CD;&#x4F5C;&#x3057;&#x3001;&#x540C;&#x3058;&#x8272;&#x306E;&#x3077;&#x3088;&#x3092;&#x4E0A;&#x4E0B;&#x5DE6;&#x53F3;&#x306B;4&#x3064;&#x4EE5;&#x4E0A;&#x3064;&#x306A;&#x3052;&#x3066;&#x6D88;&#x3057;&#x3066;&#x3044;&#x304F;&#x30E2;&#x30FC;&#x30C9;&#x3067;&#x3059;&#x3002;&#x3077;&#x3088;&#x304C;&#x6D88;&#x3048;&#x308B;&#x3068;&#x4E0A;&#x306E;&#x3077;&#x3088;&#x304C;&#x843D;&#x4E0B;&#x3057;&#x3001;&#x9023;&#x7D9A;&#x3067;&#x6D88;&#x3048;&#x308B;&#x3068;&#x9023;&#x9396;&#x306B;&#x306A;&#x308A;&#x307E;&#x3059;&#x3002;',
                pc: ['&larr; / &rarr;&#xFF1A;&#x5DE6;&#x53F3;&#x79FB;&#x52D5;', '&uarr;&#xFF1A;&#x56DE;&#x8EE2;', 'Space&#xFF1A;&#x4E00;&#x6C17;&#x306B;&#x843D;&#x4E0B;', 'C&#xFF1A;&#x30DB;&#x30FC;&#x30EB;&#x30C9;', 'P&#xFF1A;&#x4E00;&#x6642;&#x505C;&#x6B62;'],
                mobile: ['&larr;&#xFF1A;&#x5DE6;&#x79FB;&#x52D5;', '&rarr;&#xFF1A;&#x53F3;&#x79FB;&#x52D5;', 'ROT&#xFF1A;&#x56DE;&#x8EE2;', 'DROP&#xFF1A;&#x4E00;&#x6C17;&#x306B;&#x843D;&#x4E0B;', 'HOLD&#xFF1A;&#x30DB;&#x30FC;&#x30EB;&#x30C9;']
            }
        };

        function setHelpTabsActive(mode) {
            if (!helpTabs) return;
            helpTabs.querySelectorAll('button').forEach(button => {
                button.classList.toggle('active', button.dataset.helpMode === mode);
            });
        }

        function renderHelp(mode = 'tetris') {
            const data = HELP_DATA[mode] || HELP_DATA.tetris;
            if (helpTitle) helpTitle.innerText = data.title;
            if (helpContent) {
                helpContent.innerHTML = `
                    <p>${data.description}</p>
                    <div class="help-section-title">PC CONTROLS</div>
                    <ul>${data.pc.map(item => `<li>${item}</li>`).join('')}</ul>
                    <div class="help-section-title">MOBILE CONTROLS</div>
                    <ul>${data.mobile.map(item => `<li>${item}</li>`).join('')}</ul>
                `;
            }
            setHelpTabsActive(mode);
        }

        function showHelpScreen(mode = 'tetris') {
            renderHelp(mode);
            switchOverlayScreen('screen-help');
            overlay.style.display = "flex";
        }
        function getRankingKey(mode = currentGame) {
            return mode === 'puyo' ? 'puyoRanking' : 'tetrisRanking';
        }

        function getRankingTitle(mode = currentGame) {
            if (mode === 'total') return 'TOTAL RANKING';
            return mode === 'puyo' ? 'PUYO RANKING' : 'TETRIS RANKING';
        }

        function getScores(mode = currentGame) {
            const scores = localStorage.getItem(getRankingKey(mode));
            return scores ? JSON.parse(scores) : [];
        }

        function saveScore(newScore, mode = currentGame) {
            if (newScore === 0) return;
            let scores = getScores(mode);
            scores.push(newScore);
            scores.sort((a, b) => b - a);
            scores = scores.slice(0, 5);
            localStorage.setItem(getRankingKey(mode), JSON.stringify(scores));
        }
        function handleTetrisGameOverSequence() {
            if (resultNextBtn) {
                resultNextBtn.innerText = 'NEXT';
                resultNextBtn.onclick = () => showRankingScreen('tetris');
            }
            // スコアを保存
            saveScore(player.score, 'tetris');

            // リザルト画面に数値をセット
            document.getElementById('res-score').innerText = player.score;
            document.getElementById('res-level').innerText = player.level;
            document.getElementById('res-lines').innerText = player.lines;

            // リザルト画面を表示
            switchOverlayScreen('screen-result');
            overlay.style.display = "flex";
        }

        function getTotalScores() {
            const tetrisScores = getScores('tetris').map(score => ({ score, mode: 'TETRIS' }));
            const puyoScores = getScores('puyo').map(score => ({ score, mode: 'PUYO' }));
            return [...tetrisScores, ...puyoScores]
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);
        }

        function setRankingTabsActive(mode) {
            if (!rankingTabs) return;
            rankingTabs.querySelectorAll('button').forEach(button => {
                button.classList.toggle('active', button.dataset.rankingMode === mode);
            });
        }

        function renderRanking(entries, type = 'single') {
            const list = document.getElementById('ranking-list');
            list.innerHTML = '';

            if (entries.length === 0) {
                list.innerHTML = '<li><span style="grid-column: 1 / -1; margin:0 auto; color:#888;">NO RECORD</span></li>';
                return;
            }

            entries.forEach((entry, index) => {
                const score = typeof entry === 'number' ? entry : entry.score;
                const mode = typeof entry === 'number' ? '' : entry.mode;
                const li = document.createElement('li');
                li.innerHTML = `<span class="rank">${index + 1}</span><span class="score-val">${score}</span><span class="mode-label">${type === 'total' ? mode : ''}</span>`;
                list.appendChild(li);
            });
        }

        function showTitleRanking() {
            showRankingScreen('total');
        }

        function showRankingScreen(mode = currentGame) {
            const rankingMode = mode || 'total';
            const scores = rankingMode === 'total' ? getTotalScores() : getScores(rankingMode);
            if (rankingTitle) rankingTitle.innerText = getRankingTitle(rankingMode);
            if (rankingBackBtn) rankingBackBtn.onclick = backToTitle;
            setRankingTabsActive('total');
            setRankingTabsActive(rankingMode);
            renderRanking(scores, rankingMode === 'total' ? 'total' : 'single');
            
            switchOverlayScreen('screen-ranking');
        }
        function backToTitle() {
            isPaused = true;
            isGameOver = false;
            currentGame = 'tetris';
            resetTetrisState(true);
            resetPuyoState();
            configureModeUi();
            particles = [];
            drawTetris();

            overlayTitle.innerText = "SELECT MODE";
            startBtn.innerText = "START GAME";
            startBtn.style.display = "none";
            if (modeSelect) modeSelect.style.display = "flex";
            if (resultNextBtn) {
                resultNextBtn.innerText = 'NEXT';
                resultNextBtn.onclick = () => showRankingScreen('tetris');
            }
            if (rankingBackBtn) rankingBackBtn.onclick = backToTitle;
            setRankingTabsActive('total');
            switchOverlayScreen('screen-start');
            overlay.style.display = "flex";
        }

        function selectGameMode(mode) {
            currentGame = mode;
            configureModeUi();
            if (currentGame === 'puyo') {
                startPuyoGame();
            } else {
                startTetrisGame();
            }
        }

        function startTetrisGame() {
            resetTetrisState(true);
            startGame();
        }

        function startPuyoGame() {
            resetPuyoState();
            startGame();
        }

        function startGame() {
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            toggleMute(); toggleMute(); 
            if (!isMuted) {
                soundIcon.innerText = "🔊";
                soundIcon.classList.add('sound-active');
            }
            togglePause();
        }

        function togglePause() {
            if (isPaused) {
                isPaused = false;
                overlay.style.display = "none";
                if (currentGame === 'tetris' && player.matrix === null) {
                    playerReset();
                }
                if (currentGame === 'puyo' && puyo.pair === null) {
                    puyoSpawn();
                }
                lastTime = 0;
                update();
            } else {
                isPaused = true;
                overlayTitle.innerText = "PAUSED";
                startBtn.innerText = "RESUME";
                startBtn.style.display = "inline-block";
                if (modeSelect) modeSelect.style.display = "none";
                switchOverlayScreen('screen-start');
                overlay.style.display = "flex";
            }
        }

        function resetTetrisState(preparePiece = false) {
            arena.forEach(row => row.fill(0));
            player.score = 0;
            player.lines = 0;
            player.level = 1;
            player.hold = null;
            player.next = null;
            player.matrix = null;
            player.canHold = true;
            dropCounter = 0;
            dropInterval = 1000;
            if (preparePiece) playerReset();
            updateStats();
        }

        function configureModeUi() {
            document.body.classList.toggle('puyo-mode', currentGame === 'puyo');
            if (holdPanel) holdPanel.style.visibility = 'visible';
            if (holdLabel) holdLabel.innerText = 'HOLD (C)';
            if (nextLabel) nextLabel.innerText = currentGame === 'puyo' ? 'NEXT PAIR' : 'NEXT';
            if (mobileHold) mobileHold.innerText = 'HOLD';
            if (mobileDrop) mobileDrop.innerText = 'DROP';
            const labels = document.querySelectorAll('.status-label');
            if (labels[1]) labels[1].innerText = currentGame === 'puyo' ? 'MODE' : 'LEVEL';
            if (labels[2]) labels[2].innerText = currentGame === 'puyo' ? 'CHAIN' : 'LINES';
            updateStats();
        }

        const PUYO_COLS = 6;
        const PUYO_ROWS = 13;
        const PUYO_VISIBLE_TOP = 1;
        const PUYO_OFFSET_X = 0;
        const PUYO_OFFSET_Y = 0;
        const PUYO_DRAW_SCALE = COLS / PUYO_COLS;
        const PUYO_COLORS = [null, '#ff4d6d', '#ffe66d', '#4dff88', '#4dabff', '#c77dff'];
        const PUYO_DIRS = [{x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}];

        const puyo = {
            arena: createMatrix(PUYO_COLS, PUYO_ROWS),
            pair: null,
            next: null,
            hold: null,
            canHold: true,
            score: 0,
            chain: 0
        };

        let puyoDropCounter = 0;
        let puyoDropInterval = 650;

        function randomPuyoColor() {
            return 1 + (Math.random() * (PUYO_COLORS.length - 1) | 0);
        }

        function createPuyoPair() {
            return {
                axis: {x: 2, y: 1},
                rotation: 0,
                colors: [randomPuyoColor(), randomPuyoColor()]
            };
        }

        function resetPuyoState() {
            puyo.arena.forEach(row => row.fill(0));
            puyo.pair = null;
            puyo.next = createPuyoPair();
            puyo.hold = null;
            puyo.canHold = true;
            puyo.score = 0;
            puyo.chain = 0;
            puyoDropCounter = 0;
            updateStats();
            drawPuyo();
        }

        function getPuyoCells(pair = puyo.pair) {
            if (!pair) return [];
            const dir = PUYO_DIRS[pair.rotation];
            return [
                {x: pair.axis.x, y: pair.axis.y, color: pair.colors[0]},
                {x: pair.axis.x + dir.x, y: pair.axis.y + dir.y, color: pair.colors[1]}
            ];
        }

        function puyoCollides(pair = puyo.pair) {
            return getPuyoCells(pair).some(cell => {
                if (cell.x < 0 || cell.x >= PUYO_COLS || cell.y >= PUYO_ROWS) return true;
                if (cell.y >= 0 && puyo.arena[cell.y][cell.x]) return true;
                return false;
            });
        }

        function puyoSpawn() {
            puyo.pair = puyo.next || createPuyoPair();
            puyo.pair.axis = {x: 2, y: 1};
            puyo.pair.rotation = 0;
            puyo.next = createPuyoPair();
            puyo.canHold = true;
            if (puyoCollides()) {
                isGameOver = true;
                isPaused = true;
                playSound('gameover');
                handlePuyoGameOverSequence();
            }
            drawPuyo();
        }

        function puyoMove(dir) {
            if (!puyo.pair) return;
            const moved = {...puyo.pair, axis: {x: puyo.pair.axis.x + dir, y: puyo.pair.axis.y}};
            if (!puyoCollides(moved)) {
                puyo.pair = moved;
                playSound('move');
                drawPuyo();
            }
        }

        function puyoRotate(dir) {
            if (!puyo.pair) return;
            const original = puyo.pair;
            const nextRotation = (original.rotation + dir + 4) % 4;
            for (const kick of [0, -1, 1, -2, 2]) {
                const rotated = {...original, rotation: nextRotation, axis: {x: original.axis.x + kick, y: original.axis.y}};
                if (!puyoCollides(rotated)) {
                    puyo.pair = rotated;
                    playSound('rotate');
                    drawPuyo();
                    return;
                }
            }
        }

        function puyoDrop() {
            if (!puyo.pair) return;
            const dropped = {...puyo.pair, axis: {x: puyo.pair.axis.x, y: puyo.pair.axis.y + 1}};
            if (!puyoCollides(dropped)) {
                puyo.pair = dropped;
                puyo.score += 1;
            } else {
                puyoLock();
            }
            puyoDropCounter = 0;
            updateStats();
            drawPuyo();
        }

        function puyoHardDrop() {
            if (!puyo.pair) return;
            while (true) {
                const dropped = {...puyo.pair, axis: {x: puyo.pair.axis.x, y: puyo.pair.axis.y + 1}};
                if (puyoCollides(dropped)) break;
                puyo.pair = dropped;
                puyo.score += 2;
            }
            puyoLock();
            updateStats();
            drawPuyo();
        }


        function clonePuyoPair(pair) {
            return {
                axis: {x: 2, y: 1},
                rotation: 0,
                colors: [...pair.colors]
            };
        }

        function puyoHold() {
            if (!puyo.pair || !puyo.canHold) return;

            const current = clonePuyoPair(puyo.pair);
            if (puyo.hold === null) {
                puyo.hold = current;
                puyo.pair = puyo.next || createPuyoPair();
                puyo.next = createPuyoPair();
            } else {
                const held = clonePuyoPair(puyo.hold);
                puyo.hold = current;
                puyo.pair = held;
            }

            puyo.pair.axis = {x: 2, y: 1};
            puyo.pair.rotation = 0;
            puyo.canHold = false;
            playSound('rotate');

            if (puyoCollides()) {
                isGameOver = true;
                isPaused = true;
                playSound('gameover');
                handlePuyoGameOverSequence();
                return;
            }

            updateStats();
            drawPuyo();
        }
        function puyoLock() {
            for (const cell of getPuyoCells()) {
                if (cell.y < PUYO_VISIBLE_TOP) {
                    isGameOver = true;
                } else {
                    puyo.arena[cell.y][cell.x] = cell.color;
                }
            }
            puyo.pair = null;
            triggerShake(0.05);
            playSound('drop');

            if (isGameOver) {
                isPaused = true;
                playSound('gameover');
                handlePuyoGameOverSequence();
                return;
            }

            // Let each locked puyo settle before checking for clears.
            applyPuyoGravity();
            resolvePuyoChains();
            puyoSpawn();
        }

        function resolvePuyoChains() {
            let chain = 0;
            while (true) {
                const cleared = findPuyoGroups();
                if (cleared.length === 0) break;
                chain++;
                for (const cell of cleared) {
                    spawnParticles(PUYO_OFFSET_X + cell.x, PUYO_OFFSET_Y + cell.y - PUYO_VISIBLE_TOP, cell.color, 7);
                    puyo.arena[cell.y][cell.x] = 0;
                }
                puyo.score += cleared.length * 10 * chain;
                puyo.chain = Math.max(puyo.chain, chain);
                applyPuyoGravity();
                triggerShake(Math.min(0.35, 0.12 * chain));
                playSound('clear');
            }
            updateStats();
        }

        function findPuyoGroups() {
            const visited = createMatrix(PUYO_COLS, PUYO_ROWS);
            const toClear = [];
            for (let y = PUYO_VISIBLE_TOP; y < PUYO_ROWS; y++) {
                for (let x = 0; x < PUYO_COLS; x++) {
                    const color = puyo.arena[y][x];
                    if (!color || visited[y][x]) continue;
                    const group = [];
                    const queue = [{x, y}];
                    visited[y][x] = 1;
                    while (queue.length) {
                        const current = queue.shift();
                        group.push(current);
                        for (const d of [{x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}]) {
                            const nx = current.x + d.x;
                            const ny = current.y + d.y;
                            if (nx < 0 || nx >= PUYO_COLS || ny < PUYO_VISIBLE_TOP || ny >= PUYO_ROWS) continue;
                            if (visited[ny][nx] || puyo.arena[ny][nx] !== color) continue;
                            visited[ny][nx] = 1;
                            queue.push({x: nx, y: ny});
                        }
                    }
                    if (group.length >= 4) toClear.push(...group.map(cell => ({...cell, color})));
                }
            }
            return toClear;
        }

        function applyPuyoGravity() {
            for (let x = 0; x < PUYO_COLS; x++) {
                let writeY = PUYO_ROWS - 1;
                for (let y = PUYO_ROWS - 1; y >= PUYO_VISIBLE_TOP; y--) {
                    if (puyo.arena[y][x]) {
                        puyo.arena[writeY][x] = puyo.arena[y][x];
                        if (writeY !== y) puyo.arena[y][x] = 0;
                        writeY--;
                    }
                }
                for (let y = writeY; y >= PUYO_VISIBLE_TOP; y--) {
                    puyo.arena[y][x] = 0;
                }
            }
        }

        function updatePuyo(deltaTime) {
            puyoDropCounter += deltaTime;
            if (puyoDropCounter > puyoDropInterval) {
                puyoDrop();
            }
            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                if (particles[i].life <= 0) particles.splice(i, 1);
            }
            drawPuyo();
        }

        function drawPuyoCircle(ctx, x, y, colorValue) {
            const cx = x + 0.5;
            const cy = y + 0.5;
            ctx.shadowColor = PUYO_COLORS[colorValue];
            ctx.shadowBlur = 15;
            ctx.fillStyle = PUYO_COLORS[colorValue];
            ctx.beginPath();
            ctx.arc(cx, cy, 0.43, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(cx - 0.14, cy - 0.15, 0.1, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawPuyo() {
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

            context.strokeStyle = 'rgba(0, 255, 65, 0.45)';
            context.scale(PUYO_DRAW_SCALE, PUYO_DRAW_SCALE);
            context.lineWidth = 0.05;
            context.strokeRect(PUYO_OFFSET_X, PUYO_OFFSET_Y, PUYO_COLS, PUYO_ROWS - PUYO_VISIBLE_TOP);
            context.strokeStyle = 'rgba(0, 243, 255, 0.12)';
            for (let x = 1; x < PUYO_COLS; x++) {
                context.beginPath();
                context.moveTo(PUYO_OFFSET_X + x, PUYO_OFFSET_Y);
                context.lineTo(PUYO_OFFSET_X + x, PUYO_OFFSET_Y + PUYO_ROWS - PUYO_VISIBLE_TOP);
                context.stroke();
            }
            for (let y = 1; y < PUYO_ROWS - PUYO_VISIBLE_TOP; y++) {
                context.beginPath();
                context.moveTo(PUYO_OFFSET_X, PUYO_OFFSET_Y + y);
                context.lineTo(PUYO_OFFSET_X + PUYO_COLS, PUYO_OFFSET_Y + y);
                context.stroke();
            }

            for (let y = PUYO_VISIBLE_TOP; y < PUYO_ROWS; y++) {
                for (let x = 0; x < PUYO_COLS; x++) {
                    if (puyo.arena[y][x]) drawPuyoCircle(context, PUYO_OFFSET_X + x, PUYO_OFFSET_Y + y - PUYO_VISIBLE_TOP, puyo.arena[y][x]);
                }
            }
            for (const cell of getPuyoCells()) {
                if (cell.y >= PUYO_VISIBLE_TOP) drawPuyoCircle(context, PUYO_OFFSET_X + cell.x, PUYO_OFFSET_Y + cell.y - PUYO_VISIBLE_TOP, cell.color);
            }

            particles.forEach(p => p.draw(context));
            context.restore();
            drawPuyoNext();
        }

        function drawPuyoNext() {
            nextContext.fillStyle = '#000';
            nextContext.fillRect(0, 0, 4, 4);
            holdContext.fillStyle = '#000';
            holdContext.fillRect(0, 0, 4, 4);
            if (puyo.hold) {
                drawPuyoCircle(holdContext, 1.5, 1.6, puyo.hold.colors[0]);
                drawPuyoCircle(holdContext, 1.5, 0.7, puyo.hold.colors[1]);
            }
            if (!puyo.next) return;
            drawPuyoCircle(nextContext, 1.5, 1.6, puyo.next.colors[0]);
            drawPuyoCircle(nextContext, 1.5, 0.7, puyo.next.colors[1]);
        }

        function executePuyoAction(action) {
            switch(action) {
                case 'left': puyoMove(-1); break;
                case 'right': puyoMove(1); break;
                case 'rotate': puyoRotate(1); break;
                case 'drop': puyoHardDrop(); break;
                case 'hold': puyoHold(); break;
            }
        }

        function handlePuyoGameOverSequence() {
            saveScore(puyo.score, 'puyo');
            if (resultNextBtn) {
                resultNextBtn.innerText = 'NEXT';
                resultNextBtn.onclick = () => showRankingScreen('puyo');
            }
            document.getElementById('res-score').innerText = puyo.score;
            document.getElementById('res-level').innerText = '-';
            document.getElementById('res-lines').innerText = puyo.chain;
            switchOverlayScreen('screen-result');
            overlay.style.display = "flex";
        }
        configureModeUi();
        context.fillStyle = '#000';
        context.fillRect(0, 0, canvas.width, canvas.height);
















