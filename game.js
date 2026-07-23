const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const areaEl = document.getElementById('area');
const finalScoreEl = document.getElementById('final-score');
const finalAreaEl = document.getElementById('final-area');

let COLS = 50;
let ROWS = 50;
let CELL_WIDTH, CELL_HEIGHT;

let grid = []; // 0: empty, 1: filled, 2: trail
let player = {};
let enemies = [];
let trailPath = [];
let state = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let totalEmptyCells = 0;
let capturedCells = 0;
let gameLoopId;

const PADDING = 2;

function resize() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // adjust canvas CSS size
    CELL_WIDTH = canvas.width / COLS;
    CELL_HEIGHT = canvas.height / ROWS;
    
    if (state === 'PLAYING') {
        draw();
    }
}
window.addEventListener('resize', resize);

function initGame() {
    // Reset state
    score = 0;
    capturedCells = 0;
    grid = [];
    trailPath = [];
    
    // Use fixed columns and scale rows based on aspect ratio
    const container = document.getElementById('game-container');
    const aspect = container.clientHeight / container.clientWidth;
    COLS = 50;
    ROWS = Math.floor(COLS * aspect);
    
    CELL_WIDTH = container.clientWidth / COLS;
    CELL_HEIGHT = container.clientHeight / ROWS;
    
    resize();
    
    totalEmptyCells = (COLS - PADDING * 2) * (ROWS - PADDING * 2);
    
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            if (x < PADDING || x >= COLS - PADDING || y < PADDING || y >= ROWS - PADDING) {
                row.push(1);
            } else {
                row.push(0);
            }
        }
        grid.push(row);
    }
    
    player = {
        x: Math.floor(COLS / 2),
        y: ROWS - PADDING,
        vx: 0,
        vy: 0,
        nextVx: 0,
        nextVy: 0,
        drawing: false,
        lastMoveTime: 0,
        speed: 80 // Lower is faster. Grid movement speed.
    };
    
    enemies = [];
    spawnEnemy();
    spawnEnemy();
    
    updateHUD();
    state = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    
    player.lastMoveTime = performance.now();
    lastTime = performance.now();
    if (gameLoopId) cancelAnimationFrame(gameLoopId);
    gameLoopId = requestAnimationFrame(gameLoop);
}

function spawnEnemy() {
    enemies.push({
        x: COLS / 2,
        y: ROWS / 2,
        vx: (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 5),
        vy: (Math.random() > 0.5 ? 1 : -1) * (15 + Math.random() * 5),
        radius: 0.8
    });
}

function GameOver() {
    state = 'GAMEOVER';
    hud.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    finalScoreEl.innerText = score;
    finalAreaEl.innerText = (capturedCells / totalEmptyCells * 100).toFixed(1);
}

// Input handling
let touchStartX = 0;
let touchStartY = 0;

window.addEventListener('keydown', (e) => {
    if (state !== 'PLAYING') return;
    switch(e.key) {
        case 'ArrowUp': player.nextVx = 0; player.nextVy = -1; break;
        case 'ArrowDown': player.nextVx = 0; player.nextVy = 1; break;
        case 'ArrowLeft': player.nextVx = -1; player.nextVy = 0; break;
        case 'ArrowRight': player.nextVx = 1; player.nextVy = 0; break;
    }
});

canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, {passive: false});

canvas.addEventListener('touchmove', (e) => {
    if (state === 'PLAYING') {
        e.preventDefault();
    }
}, {passive: false});

canvas.addEventListener('touchend', (e) => {
    if (state !== 'PLAYING') return;
    let touchEndX = e.changedTouches[0].screenX;
    let touchEndY = e.changedTouches[0].screenY;
    let dx = touchEndX - touchStartX;
    let dy = touchEndY - touchStartY;
    
    if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 20) { player.nextVx = 1; player.nextVy = 0; }
        else if (dx < -20) { player.nextVx = -1; player.nextVy = 0; }
    } else {
        if (dy > 20) { player.nextVx = 0; player.nextVy = 1; }
        else if (dy < -20) { player.nextVx = 0; player.nextVy = -1; }
    }
});

document.getElementById('start-btn').addEventListener('click', initGame);
document.getElementById('restart-btn').addEventListener('click', initGame);

function floodFillGetEnemyRegions() {
    let enemyMask = new Array(ROWS).fill(0).map(() => new Array(COLS).fill(false));
    
    for(let e=0; e<enemies.length; e++){
        let ex = Math.floor(enemies[e].x);
        let ey = Math.floor(enemies[e].y);
        
        ex = Math.max(0, Math.min(COLS-1, ex));
        ey = Math.max(0, Math.min(ROWS-1, ey));
        
        if (grid[ey][ex] === 0 && !enemyMask[ey][ex]) {
            let queue = [{x: ex, y: ey}];
            enemyMask[ey][ex] = true;
            let head = 0;
            
            while(head < queue.length) {
                let curr = queue[head++];
                
                const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
                for(let d of dirs) {
                    let nx = curr.x + d[0];
                    let ny = curr.y + d[1];
                    if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
                        if (grid[ny][nx] === 0 && !enemyMask[ny][nx]) {
                            enemyMask[ny][nx] = true;
                            queue.push({x: nx, y: ny});
                        }
                    }
                }
            }
        }
    }
    return enemyMask;
}

function processCapture() {
    for (let pos of trailPath) {
        grid[pos.y][pos.x] = 1;
        capturedCells++;
        score += 10;
    }
    trailPath = [];
    player.drawing = false;
    
    let enemyMask = floodFillGetEnemyRegions();
    
    let filledThisRound = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x] === 0 && !enemyMask[y][x]) {
                grid[y][x] = 1;
                filledThisRound++;
            }
        }
    }
    
    capturedCells += filledThisRound;
    score += filledThisRound * 20;
    
    updateHUD();
    
    // Spawn another enemy periodically if capture goes up
    if (filledThisRound > 0 && Math.random() > 0.7) {
        spawnEnemy();
    }
}

function updateHUD() {
    scoreEl.innerText = score;
    let percentage = (capturedCells / totalEmptyCells * 100).toFixed(1);
    areaEl.innerText = percentage;
}

let lastTime = 0;

function gameLoop(now) {
    if (state !== 'PLAYING') return;
    
    let dt = (now - lastTime) / 1000; // in seconds
    lastTime = now;
    
    // clamp dt to prevent huge jumps
    if (dt > 0.1) dt = 0.1;
    
    updateEnemies(dt);
    
    if (now - player.lastMoveTime > player.speed) {
        updatePlayer();
        player.lastMoveTime = now;
    }
    
    draw();
    
    gameLoopId = requestAnimationFrame(gameLoop);
}

function updatePlayer() {
    if (player.nextVx !== 0 || player.nextVy !== 0) {
        if (player.drawing) {
            // Can't reverse
            if (!(player.nextVx === -Math.sign(player.vx) && player.nextVx !== 0) &&
                !(player.nextVy === -Math.sign(player.vy) && player.nextVy !== 0)) {
                player.vx = player.nextVx;
                player.vy = player.nextVy;
            }
        } else {
            player.vx = player.nextVx;
            player.vy = player.nextVy;
        }
    }
    
    if (player.vx === 0 && player.vy === 0) return;
    
    let nx = player.x + Math.sign(player.vx);
    let ny = player.y + Math.sign(player.vy);
    
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
        player.vx = 0;
        player.vy = 0;
        return; 
    }
    
    let targetCell = grid[ny][nx];
    
    if (targetCell === 2) {
        GameOver();
        return;
    }
    
    if (targetCell === 1) {
        if (player.drawing) {
            player.x = nx;
            player.y = ny;
            processCapture();
            player.vx = 0; player.vy = 0; player.nextVx = 0; player.nextVy = 0;
            return;
        } else {
            player.x = nx;
            player.y = ny;
        }
    } else if (targetCell === 0) {
        player.drawing = true;
        player.x = nx;
        player.y = ny;
        grid[ny][nx] = 2;
        trailPath.push({x: nx, y: ny});
    }
}

function updateEnemies(dt) {
    for (let e of enemies) {
        let nex = e.x + e.vx * dt;
        let ney = e.y + e.vy * dt;
        
        let cx = Math.floor(nex);
        let cy = Math.floor(ney);
        
        // Ensure bounds
        if (cx < 0) cx = 0;
        if (cx >= COLS) cx = COLS - 1;
        if (cy < 0) cy = 0;
        if (cy >= ROWS) cy = ROWS - 1;
        
        let bounce = false;
        if (nex < 0 || nex >= COLS || grid[Math.floor(e.y)][cx] === 1) {
            e.vx *= -1;
            nex = e.x + e.vx * dt;
            bounce = true;
        }
        
        if (ney < 0 || ney >= ROWS || grid[cy][Math.floor(e.x)] === 1) {
            e.vy *= -1;
            ney = e.y + e.vy * dt;
            bounce = true;
        }
        
        e.x = nex;
        e.y = ney;
        
        // Bounds checking
        e.x = Math.max(0.5, Math.min(COLS-0.5, e.x));
        e.y = Math.max(0.5, Math.min(ROWS-0.5, e.y));
        
        let checkX = Math.floor(e.x);
        let checkY = Math.floor(e.y);
        
        if (checkX >= 0 && checkX < COLS && checkY >= 0 && checkY < ROWS) {
            if (grid[checkY][checkX] === 2) {
                GameOver();
            }
            // Collision with player
            if (Math.abs(e.x - player.x - 0.5) < 1.0 && Math.abs(e.y - player.y - 0.5) < 1.0) {
                GameOver();
            }
        }
    }
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw cells
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            let val = grid[y][x];
            if (val === 1) {
                ctx.fillStyle = '#100030';
                ctx.fillRect(x * CELL_WIDTH, y * CELL_HEIGHT, CELL_WIDTH+0.5, CELL_HEIGHT+0.5);
                ctx.strokeStyle = '#300060';
                ctx.lineWidth = 1;
                ctx.strokeRect(x * CELL_WIDTH, y * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
            } else if (val === 2) {
                ctx.fillStyle = '#0ff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#0ff';
                ctx.fillRect(x * CELL_WIDTH, y * CELL_HEIGHT, CELL_WIDTH+0.5, CELL_HEIGHT+0.5);
                ctx.shadowBlur = 0;
            }
            if (val === 0) {
               ctx.strokeStyle = '#040410';
               ctx.lineWidth = 1;
               ctx.strokeRect(x * CELL_WIDTH, y * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
            }
        }
    }
    
    // Glow around filled borders
    ctx.strokeStyle = '#f0f';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#f0f';
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x] === 1) {
                if (y > 0 && grid[y-1][x] === 0) {
                    ctx.beginPath(); ctx.moveTo(x*CELL_WIDTH, y*CELL_HEIGHT); ctx.lineTo((x+1)*CELL_WIDTH, y*CELL_HEIGHT); ctx.stroke();
                }
                if (y < ROWS-1 && grid[y+1][x] === 0) {
                    ctx.beginPath(); ctx.moveTo(x*CELL_WIDTH, (y+1)*CELL_HEIGHT); ctx.lineTo((x+1)*CELL_WIDTH, (y+1)*CELL_HEIGHT); ctx.stroke();
                }
                if (x > 0 && grid[y][x-1] === 0) {
                    ctx.beginPath(); ctx.moveTo(x*CELL_WIDTH, y*CELL_HEIGHT); ctx.lineTo(x*CELL_WIDTH, (y+1)*CELL_HEIGHT); ctx.stroke();
                }
                if (x < COLS-1 && grid[y][x+1] === 0) {
                    ctx.beginPath(); ctx.moveTo((x+1)*CELL_WIDTH, y*CELL_HEIGHT); ctx.lineTo((x+1)*CELL_WIDTH, (y+1)*CELL_HEIGHT); ctx.stroke();
                }
            }
        }
    }
    ctx.shadowBlur = 0;
    
    // Draw trail path
    if (trailPath.length > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < trailPath.length; i++) {
            let cx = trailPath[i].x * CELL_WIDTH + CELL_WIDTH/2;
            let cy = trailPath[i].y * CELL_HEIGHT + CELL_HEIGHT/2;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.lineTo(player.x * CELL_WIDTH + CELL_WIDTH/2, player.y * CELL_HEIGHT + CELL_HEIGHT/2);
        ctx.stroke();
    }
    
    // Draw enemies
    for (let e of enemies) {
        let drawX = (e.x + 0.5) * CELL_WIDTH;
        let drawY = (e.y + 0.5) * CELL_HEIGHT;
        
        ctx.fillStyle = '#f00';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#f00';
        ctx.beginPath();
        ctx.arc(e.x * CELL_WIDTH, e.y * CELL_HEIGHT, CELL_WIDTH * e.radius * 0.5, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    
    // Draw player
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fff';
    ctx.fillRect(player.x * CELL_WIDTH, player.y * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT);
    ctx.shadowBlur = 0;
}
