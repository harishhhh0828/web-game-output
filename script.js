// ====== APP STATE AND NAVIGATION ======
const menuView = document.getElementById("menu-view");
const pacmanView = document.getElementById("pacman-view");
const battleshipView = document.getElementById("battleship-view");

const btnPacman = document.getElementById("btn-pacman");
const btnBattleship = document.getElementById("btn-battleship");
const backBtns = document.querySelectorAll(".back-btn");

let pacmanActive = false;
let battleshipActive = false;

function showView(viewEl) {
    document.querySelectorAll(".view").forEach(v => {
        v.classList.remove("active");
        v.classList.add("hidden");
    });
    viewEl.classList.remove("hidden");
    viewEl.classList.add("active");
}

btnPacman.addEventListener("click", () => {
    showView(pacmanView);
    pacmanActive = true;
    battleshipActive = false;
    startPacman();
});

btnBattleship.addEventListener("click", () => {
    showView(battleshipView);
    pacmanActive = false;
    battleshipActive = true;
    startBattleship();
});

backBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        showView(menuView);
        pacmanActive = false;
        battleshipActive = false;
        if (audioCtx) {
            try { audioCtx.suspend(); } catch(e) {}
        }
    });
});

// ==========================================
// ====== PACMAN GAME LOGIC =================
// ==========================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const tileSize = 16; 
const corridorScale = 1.25; 
const corridorTile = Math.round(tileSize * corridorScale); 
const wallSize = tileSize; 
const cols = 28;
const rows = 31;

canvas.width = cols * corridorTile;
canvas.height = rows * corridorTile;

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const restartBtn = document.getElementById("restartBtn");

const levelLayout = [
    "1111111111111111111111111111",
    "1222222222112222222222222221",
    "1211112112112112112111112121",
    "1311112112112112112111112131",
    "1222222222222222222222222221",
    "1211112111112111112111112121",
    "1222222112222222211222222221",
    "1111112112111112112111111111",
    "0000012112110002112110000000",
    "1111112112111112112111111111",
    "1222222222222112222222222221",
    "1211112111112111112111112121",
    "1222212222222222222222122221",
    "1111212111110001111122111111",
    "0000212110000000000122110000",
    "1111212110111111101122111111",
    "1222222220222222202222222221",
    "1211112112111112112111112121",
    "1222222112222222211222222221",
    "1111112112111112112111111111",
    "0000012112110002112110000000",
    "1111112112111112112111111111",
    "1222222222222222222222222221",
    "1211112111112111112111112121",
    "1311112222222112222222112131",
    "1222222111112111111122222221",
    "1111112112222222212111111111",
    "1222222222112222112222222221",
    "1211111112112112111111112121",
    "1222222222222222222222222221",
    "1111111111111111111111111111",
];

let map = [];
let pelletsRemaining = 0;

const pacman = {
    x: 1, y: 29, dirX: 0, dirY: 0, nextDirX: 0, nextDirY: 0, speed: 8, radius: tileSize * 0.6,
};

const ghosts = [
    { x: 13, y: 14, dirX: 1, dirY: 0, color: "#ff4b4b" },
    { x: 14, y: 14, dirX: -1, dirY: 0, color: "#4bc6ff" },
];

let score = 0;
let lives = 3;
let gameOver = false;
let lastTime = 0;
let gameTime = 0; 

let audioCtx = null;
let backgroundOsc = null;
let backgroundGain = null;
let backgroundInterval = null;
let backgroundStarted = false;

function getAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
}

function startBackgroundSound() {
    if (backgroundStarted || !pacmanActive) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        ctx.resume();
        backgroundOsc = ctx.createOscillator();
        backgroundGain = ctx.createGain();
        backgroundOsc.connect(backgroundGain);
        backgroundGain.connect(ctx.destination);
        backgroundOsc.type = "sawtooth";
        backgroundOsc.frequency.setValueAtTime(200, ctx.currentTime);
        backgroundGain.gain.setValueAtTime(0.04, ctx.currentTime);
        backgroundOsc.start(ctx.currentTime);
        backgroundStarted = true;
        backgroundInterval = setInterval(() => {
            if (!backgroundOsc || !ctx || !pacmanActive) return;
            const t = Date.now() / 1000;
            const freq = 180 + 130 * Math.sin(t * 0.85);
            backgroundOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
        }, 80);
    } catch (_) { }
}

function playPelletSound() {
    if(!pacmanActive) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(680, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.06);
    } catch (_) { }
}

function playDeathSound() {
    if(!pacmanActive) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
        ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
    } catch (_) { }
}

function initMap() {
    map = [];
    pelletsRemaining = 0;
    for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < cols; c++) {
            let val = Number(levelLayout[r][c]);
            if (val === 2 || val === 3) pelletsRemaining++;
            row.push(val);
        }
        map.push(row);
    }
}

function resetEntities() {
    pacman.x = 1; pacman.y = 29;
    pacman.dirX = 0; pacman.dirY = 0;
    pacman.nextDirX = 0; pacman.nextDirY = 0;

    ghosts[0].x = 13; ghosts[0].y = 14;
    ghosts[0].dirX = 1; ghosts[0].dirY = 0;

    ghosts[1].x = 14; ghosts[1].y = 14;
    ghosts[1].dirX = -1; ghosts[1].dirY = 0;
}

function restartGame() {
    score = 0;
    lives = 3;
    gameOver = false;
    initMap();
    resetEntities();
    updateUI();
}

function updateUI() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
}

function isWall(col, row) {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return true;
    return map[row][col] === 1;
}

function trySetDirection(dx, dy) {
    pacman.nextDirX = dx;
    pacman.nextDirY = dy;
}

function handleInput() {
    const centerCol = Math.round(pacman.x);
    const centerRow = Math.round(pacman.y);
    const offsetX = Math.abs(pacman.x - centerCol);
    const offsetY = Math.abs(pacman.y - centerRow);
    const aligned = offsetX < 0.35 && offsetY < 0.35;
    const stopped = pacman.dirX === 0 && pacman.dirY === 0;

    if (aligned || stopped) {
        const targetCol = centerCol + pacman.nextDirX;
        const targetRow = centerRow + pacman.nextDirY;
        if (!isWall(targetCol, targetRow)) {
            pacman.dirX = pacman.nextDirX;
            pacman.dirY = pacman.nextDirY;
        }
    }
}

function movePacman(deltaSeconds) {
    handleInput();
    const speedPerFrame = pacman.speed * deltaSeconds;
    let newX = pacman.x + pacman.dirX * speedPerFrame;
    let newY = pacman.y + pacman.dirY * speedPerFrame;

    if (newX < 0) newX = cols - 1;
    if (newX > cols - 1) newX = 0;

    const nextCol = Math.round(newX);
    const nextRow = Math.round(newY);

    if (isWall(nextCol, nextRow)) {
        const dx = pacman.dirX;
        const dy = pacman.dirY;
        pacman.dirX = 0;
        pacman.dirY = 0;
        pacman.x = nextCol - dx;
        pacman.y = nextRow - dy;
        return;
    }

    pacman.x = newX;
    pacman.y = newY;

    const col = Math.round(pacman.x);
    const row = Math.round(pacman.y);
    if (map[row] && (map[row][col] === 2 || map[row][col] === 3)) {
        playPelletSound();
        if (map[row][col] === 2) score += 10;
        if (map[row][col] === 3) score += 50;
        map[row][col] = 0;
        pelletsRemaining--;
        updateUI();

        if (pelletsRemaining <= 0) {
            gameOver = true;
            setTimeout(() => alert("You cleared the maze! 🎉"), 100);
        }
    }
}

function moveGhost(ghost, deltaSeconds) {
    const speed = 6 * deltaSeconds;
    let newX = ghost.x + ghost.dirX * speed;
    let newY = ghost.y + ghost.dirY * speed;

    const nextCol = Math.round(newX);
    const nextRow = Math.round(newY);

    if (isWall(nextCol, nextRow)) {
        const dirs = [ { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, ];
        const currentOppX = -ghost.dirX;
        const currentOppY = -ghost.dirY;
        const valid = dirs.filter((d) => !(d.x === currentOppX && d.y === currentOppY));
        const choice = valid[Math.floor(Math.random() * valid.length)];
        ghost.dirX = choice.x;
        ghost.dirY = choice.y;
        return;
    }

    ghost.x = newX;
    ghost.y = newY;
    if (ghost.x < 0) ghost.x = cols - 1;
    if (ghost.x > cols - 1) ghost.x = 0;
}

function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

function checkCollisions() {
    for (const ghost of ghosts) {
        if (distance(ghost, pacman) < 0.7) {
            playDeathSound();
            lives--;
            updateUI();
            if (lives <= 0) {
                gameOver = true;
                setTimeout(() => alert("Game Over!"), 100);
            }
            resetEntities();
            break;
        }
    }
}

function drawMap() {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = map[r][c];
            const x = c * corridorTile;
            const y = r * corridorTile;

            if (val === 1) {
                const wallX = x + (corridorTile - wallSize) / 2;
                const wallY = y + (corridorTile - wallSize) / 2;
                ctx.fillStyle = "#001b4d";
                ctx.fillRect(wallX, wallY, wallSize, wallSize);
                ctx.strokeStyle = "#0ff";
                ctx.lineWidth = 2;
                ctx.strokeRect(wallX + 2, wallY + 2, wallSize - 4, wallSize - 4);
            } else {
                ctx.fillStyle = "#000016";
                ctx.fillRect(x, y, corridorTile, corridorTile);

                if (val === 2) {
                    ctx.fillStyle = "#ffd966";
                    ctx.beginPath();
                    ctx.arc(x + corridorTile / 2, y + corridorTile / 2, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (val === 3) {
                    ctx.fillStyle = "#ffd966";
                    ctx.beginPath();
                    ctx.arc(x + corridorTile / 2, y + corridorTile / 2, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }
}

function drawPacman() {
    const px = pacman.x * corridorTile + corridorTile / 2;
    const py = pacman.y * corridorTile + corridorTile / 2;
    const angleOffset = pacman.dirX === 1 ? 0 : pacman.dirX === -1 ? Math.PI : pacman.dirY === -1 ? -Math.PI / 2 : pacman.dirY === 1 ? Math.PI / 2 : 0;
    const chompSpeed = 18;
    const mouthOpen = 0.08 + 0.28 * (0.5 + 0.5 * Math.sin(gameTime * chompSpeed));

    ctx.fillStyle = "#ffd966";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, corridorTile * 0.6, angleOffset + mouthOpen, angleOffset + Math.PI * 2 - mouthOpen);
    ctx.closePath();
    ctx.fill();
}

function drawGhost(ghost) {
    const gx = (Math.round(ghost.x) * corridorTile) + corridorTile / 2;
    const gy = (Math.round(ghost.y) * corridorTile) + corridorTile / 2;
    const r = corridorTile * 0.6;

    ctx.fillStyle = ghost.color;
    ctx.beginPath();
    ctx.arc(gx, gy, r, Math.PI, 0);
    ctx.lineTo(gx + r, gy + r);
    ctx.lineTo(gx - r, gy + r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(gx - r / 3, gy - r / 4, r / 4, 0, Math.PI * 2);
    ctx.arc(gx + r / 3, gy - r / 4, r / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(gx - r / 3, gy - r / 4, r / 8, 0, Math.PI * 2);
    ctx.arc(gx + r / 3, gy - r / 4, r / 8, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawPacman();
    ghosts.forEach(drawGhost);
}

function loop(timestamp) {
    if (!pacmanActive) return;
    if (!lastTime) lastTime = timestamp;
    const delta = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    gameTime = timestamp / 1000;

    if (!gameOver) {
        movePacman(delta);
        ghosts.forEach((g) => moveGhost(g, delta));
        checkCollisions();
    }

    draw();
    requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
    if (!pacmanActive) return;
    startBackgroundSound();
    switch (e.key) {
        case "ArrowUp": case "w": case "W":
            e.preventDefault(); trySetDirection(0, -1); break;
        case "ArrowDown": case "s": case "S":
            e.preventDefault(); trySetDirection(0, 1); break;
        case "ArrowLeft": case "a": case "A":
            e.preventDefault(); trySetDirection(-1, 0); break;
        case "ArrowRight": case "d": case "D":
            e.preventDefault(); trySetDirection(1, 0); break;
    }
});

restartBtn.addEventListener("click", () => {
    startBackgroundSound();
    restartGame();
});

function startPacman() {
    lastTime = 0;
    restartGame();
    requestAnimationFrame(loop);
}


// ==========================================
// ====== BATTLESHIP GAME LOGIC =============
// ==========================================

const SIZE = 10;
const FLEET = [
    { id: "carrier", name: "Carrier", length: 5 },
    { id: "battleship", name: "Battleship", length: 4 },
    { id: "cruiser", name: "Cruiser", length: 3 },
    { id: "submarine", name: "Submarine", length: 3 },
    { id: "destroyer", name: "Destroyer", length: 2 },
];

const LEVEL_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" };

const levelScreen = document.getElementById("levelScreen");
const gameScreen = document.getElementById("gameScreen");
const levelBadge = document.getElementById("levelBadge");
const hud = document.getElementById("hud");
const placementBar = document.getElementById("placementBar");
const shipTray = document.getElementById("shipTray");
const rotateBtn = document.getElementById("rotateBtn");
const readyBtn = document.getElementById("readyBtn");
const playerBoardEl = document.getElementById("playerBoard");
const enemyBoardEl = document.getElementById("enemyBoard");
const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultMsg = document.getElementById("resultMsg");
const helpOverlay = document.getElementById("helpOverlay");
const newGameBtn = document.getElementById("newGameBtn");
const changeLevelBtn = document.getElementById("changeLevelBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const changeLevelFromResultBtn = document.getElementById("changeLevelFromResultBtn");
const helpBtnLevel = document.getElementById("helpBtnLevel");
const helpBtnGame = document.getElementById("helpBtnGame");
const helpClose = document.getElementById("helpClose");

let level = "easy";
let phase = "level"; // level | placement | combat | result
let horizontal = true;
let selectedShipId = null;
let playerTurn = true;
let aiThinking = false;
let hoverCell = null;

let playerGrid = createEmptyGrid();
let enemyGrid = createEmptyGrid();
let playerShips = [];
let enemyShips = [];
let playerShots = createShotMap();
let enemyShots = createShotMap();

let aiHuntQueue = [];
let aiHitCells = [];
let aiParity = 0;

function createEmptyGrid() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); }
function createShotMap() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); }
function key(r, c) { return r + "," + c; }
function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

function shipCells(r, c, length, isHorizontal) {
    const cells = [];
    for (let i = 0; i < length; i++) {
        cells.push({ r: isHorizontal ? r : r + i, c: isHorizontal ? c + i : c });
    }
    return cells;
}

function canPlace(grid, r, c, length, isHorizontal) {
    const cells = shipCells(r, c, length, isHorizontal);
    for (const cell of cells) {
        if (!inBounds(cell.r, cell.c) || grid[cell.r][cell.c] !== null) return false;
    }
    return true;
}

function placeShipOnGrid(grid, ships, def, r, c, isHorizontal) {
    if (!canPlace(grid, r, c, def.length, isHorizontal)) return false;
    const cells = shipCells(r, c, def.length, isHorizontal);
    const ship = {
        id: def.id, name: def.name, length: def.length,
        cells: cells.map(cell => ({ r: cell.r, c: cell.c })), hits: 0, sunk: false,
    };
    cells.forEach(cell => { grid[cell.r][cell.c] = def.id; });
    ships.push(ship);
    return true;
}

function removeShip(grid, ships, shipId) {
    const idx = ships.findIndex(s => s.id === shipId);
    if (idx === -1) return;
    const ship = ships[idx];
    ship.cells.forEach(cell => { grid[cell.r][cell.c] = null; });
    ships.splice(idx, 1);
}

function autoPlaceFleet(grid, ships) {
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) grid[i][j] = null;
    ships.length = 0;
    for (const def of FLEET) {
        let placed = false;
        for (let attempt = 0; attempt < 400 && !placed; attempt++) {
            placed = placeShipOnGrid(grid, ships, def, Math.floor(Math.random() * SIZE), Math.floor(Math.random() * SIZE), Math.random() < 0.5);
        }
        if (!placed) return false;
    }
    return true;
}

function findShip(ships, shipId) { return ships.find(s => s.id === shipId); }
function allPlaced() { return playerShips.length === FLEET.length; }
function fleetSunk(ships) { return ships.length > 0 && ships.every(s => s.sunk); }

function applyShot(grid, ships, shots, r, c) {
    if (shots[r][c] !== null) return null;
    const shipId = grid[r][c];
    if (!shipId) {
        shots[r][c] = "miss";
        return { result: "miss", ship: null };
    }
    shots[r][c] = "hit";
    const ship = findShip(ships, shipId);
    ship.hits += 1;
    if (ship.hits >= ship.length) {
        ship.sunk = true;
        ship.cells.forEach(cell => { shots[cell.r][cell.c] = "sunk"; });
        return { result: "sunk", ship: ship };
    }
    return { result: "hit", ship: ship };
}

function resetAiMemory() {
    aiHuntQueue = []; aiHitCells = []; aiParity = Math.random() < 0.5 ? 0 : 1;
}

function neighbors(r, c) {
    return [{ r: r - 1, c: c }, { r: r + 1, c: c }, { r: r, c: c - 1 }, { r: r, c: c + 1 }].filter(n => inBounds(n.r, n.c));
}

function unshotCells() {
    const cells = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (enemyShots[r][c] === null) cells.push({ r, c });
    return cells;
}

function enqueueHuntAround(r, c) {
    shuffle(neighbors(r, c)).forEach(n => {
        if (enemyShots[n.r][n.c] === null && !aiHuntQueue.some(q => q.r === n.r && q.c === n.c)) aiHuntQueue.push(n);
    });
}

function pruneHuntQueue() { aiHuntQueue = aiHuntQueue.filter(n => enemyShots[n.r][n.c] === null); }

function alignedContinuation() {
    if (aiHitCells.length < 2) return null;
    const rows = aiHitCells.map(h => h.r), cols = aiHitCells.map(h => h.c);
    const sameRow = rows.every(r => r === rows[0]), sameCol = cols.every(c => c === cols[0]);
    if (!sameRow && !sameCol) return null;
    const candidates = [];
    if (sameRow) {
        const sorted = cols.slice().sort((a, b) => a - b);
        const left = sorted[0] - 1, right = sorted[sorted.length - 1] + 1;
        if (inBounds(rows[0], left) && enemyShots[rows[0]][left] === null) candidates.push({ r: rows[0], c: left });
        if (inBounds(rows[0], right) && enemyShots[rows[0]][right] === null) candidates.push({ r: rows[0], c: right });
    } else {
        const sorted = rows.slice().sort((a, b) => a - b);
        const up = sorted[0] - 1, down = sorted[sorted.length - 1] + 1;
        if (inBounds(up, cols[0]) && enemyShots[up][cols[0]] === null) candidates.push({ r: up, c: cols[0] });
        if (inBounds(down, cols[0]) && enemyShots[down][cols[0]] === null) candidates.push({ r: down, c: cols[0] });
    }
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function pickParityCell() {
    const open = unshotCells();
    const parity = open.filter(c => (c.r + c.c) % 2 === aiParity);
    const pool = parity.length ? parity : open;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function pickRandomUnshot() {
    const open = unshotCells();
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}

function chooseAiShot() {
    if (level === "easy") return pickRandomUnshot();
    pruneHuntQueue();
    if (level === "hard") {
        const cont = alignedContinuation();
        if (cont) return cont;
    }
    while (aiHuntQueue.length) {
        const next = aiHuntQueue.shift();
        if (enemyShots[next.r][next.c] === null) return next;
    }
    return level === "hard" ? pickParityCell() : pickRandomUnshot();
}

function onAiShotResult(r, c, outcome) {
    if (level === "easy") return;
    if (outcome.result === "hit") {
        aiHitCells.push({ r, c });
        enqueueHuntAround(r, c);
    } else if (outcome.result === "sunk") {
        aiHitCells = []; aiHuntQueue = [];
    } else if (outcome.result === "miss") pruneHuntQueue();
}

function buildBoards() {
    playerBoardEl.innerHTML = ""; enemyBoardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const pCell = document.createElement("button");
            pCell.className = "cell"; pCell.dataset.r = r; pCell.dataset.c = c;
            playerBoardEl.appendChild(pCell);

            const eCell = document.createElement("button");
            eCell.className = "cell fog"; eCell.dataset.r = r; eCell.dataset.c = c;
            enemyBoardEl.appendChild(eCell);
        }
    }
}

function renderShipTray() {
    shipTray.innerHTML = "";
    FLEET.forEach(def => {
        const placed = !!findShip(playerShips, def.id);
        const btn = document.createElement("button");
        btn.className = "ship-chip" + (placed ? " placed" : "") + (selectedShipId === def.id ? " selected" : "");
        btn.disabled = placed; btn.dataset.shipId = def.id;

        const name = document.createElement("span");
        name.className = "ship-chip-name"; name.textContent = def.name + " (" + def.length + ")";
        btn.appendChild(name);

        const cells = document.createElement("span");
        cells.className = "ship-chip-cells";
        for (let i = 0; i < def.length; i++) {
            const dot = document.createElement("span"); dot.className = "ship-chip-cell"; cells.appendChild(dot);
        }
        btn.appendChild(cells);

        if (!placed) {
            btn.addEventListener("click", () => {
                selectedShipId = def.id; renderShipTray(); renderBoards();
                setHud("Place " + def.name + " · Rotate or R to turn");
            });
        }
        shipTray.appendChild(btn);
    });
    readyBtn.disabled = !allPlaced();
}

function getPreviewCells() {
    if (phase !== "placement" || !selectedShipId || !hoverCell) return null;
    const def = FLEET.find(s => s.id === selectedShipId);
    if (!def) return null;
    return { cells: shipCells(hoverCell.r, hoverCell.c, def.length, horizontal), valid: canPlace(playerGrid, hoverCell.r, hoverCell.c, def.length, horizontal) };
}

function renderBoards() {
    const preview = getPreviewCells();
    const previewSet = new Set();
    if (preview) preview.cells.forEach(c => { if (inBounds(c.r, c.c)) previewSet.add(key(c.r, c.c)); });

    playerBoardEl.querySelectorAll(".cell").forEach(el => {
        const r = Number(el.dataset.r), c = Number(el.dataset.c);
        el.className = "cell";
        const shot = enemyShots[r][c], occupied = playerGrid[r][c];

        if (shot === "sunk") el.classList.add("sunk");
        else if (shot === "hit") el.classList.add("hit");
        else if (shot === "miss") el.classList.add("miss");
        else if (occupied) el.classList.add("ship");

        if (preview && previewSet.has(key(r, c))) el.classList.add(preview.valid ? "preview-valid" : "preview-invalid");
    });

    enemyBoardEl.querySelectorAll(".cell").forEach(el => {
        const r = Number(el.dataset.r), c = Number(el.dataset.c);
        el.className = "cell";
        const shot = playerShots[r][c];
        if (shot === "sunk") el.classList.add("sunk");
        else if (shot === "hit") el.classList.add("hit");
        else if (shot === "miss") el.classList.add("miss");
        else el.classList.add("fog");
    });

    playerBoardEl.classList.toggle("placing", phase === "placement");
    enemyBoardEl.classList.toggle("combat-target", phase === "combat" && playerTurn && !aiThinking);
}

function setHud(text) { hud.textContent = text; }
function showHelp(show) { helpOverlay.classList.toggle("hidden", !show); }
function showResult(won) {
    phase = "result"; resultOverlay.classList.remove("hidden");
    resultTitle.textContent = won ? "Victory!" : "Defeat";
    resultMsg.textContent = won ? "You sank the enemy fleet. The seas are yours." : "Your fleet has been destroyed. Better luck next time.";
    playerTurn = false; aiThinking = false; renderBoards();
}

function startPlacement() {
    phase = "placement"; horizontal = true; selectedShipId = FLEET[0].id;
    playerTurn = true; aiThinking = false; hoverCell = null;
    playerGrid = createEmptyGrid(); enemyGrid = createEmptyGrid();
    playerShips = []; enemyShips = []; playerShots = createShotMap(); enemyShots = createShotMap();
    resetAiMemory(); resultOverlay.classList.add("hidden");
    placementBar.classList.remove("hidden-bar"); levelBadge.textContent = LEVEL_LABELS[level];
    setHud("Select a ship and place it on your board"); renderShipTray(); renderBoards();
}

function startCombat() {
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) ok = autoPlaceFleet(enemyGrid, enemyShips);
    if (!ok) { setHud("Could not place enemy fleet — try Ready again"); return; }
    phase = "combat"; playerTurn = true; aiThinking = false; selectedShipId = null; hoverCell = null;
    placementBar.classList.add("hidden-bar"); setHud("Your turn — fire on enemy waters"); renderBoards();
}

function endIfOver() {
    if (fleetSunk(enemyShips)) { showResult(true); return true; }
    if (fleetSunk(playerShips)) { showResult(false); return true; }
    return false;
}

function handlePlayerFire(r, c) {
    if (phase !== "combat" || !playerTurn || aiThinking || playerShots[r][c] !== null) return;
    const outcome = applyShot(enemyGrid, enemyShips, playerShots, r, c);
    if (!outcome) return;
    if (outcome.result === "miss") setHud("Miss");
    else if (outcome.result === "hit") setHud("Hit!");
    else setHud("You sank the enemy " + outcome.ship.name + "!");
    renderBoards();
    if (endIfOver()) return;
    playerTurn = false; scheduleAiTurn();
}

function scheduleAiTurn() {
    aiThinking = true; setHud("Enemy targeting…"); renderBoards();
    setTimeout(() => {
        if (phase !== "combat") return;
        const target = chooseAiShot();
        if (!target) { aiThinking = false; playerTurn = true; setHud("Your turn — fire on enemy waters"); renderBoards(); return; }
        const outcome = applyShot(playerGrid, playerShips, enemyShots, target.r, target.c);
        onAiShotResult(target.r, target.c, outcome);
        if (outcome.result === "miss") setHud("Enemy missed");
        else if (outcome.result === "hit") setHud("Enemy hit your " + outcome.ship.name + "!");
        else setHud("Enemy sank your " + outcome.ship.name + "!");
        renderBoards(); aiThinking = false;
        if (endIfOver()) return;
        playerTurn = true; setHud("Your turn — fire on enemy waters"); renderBoards();
    }, 400 + Math.floor(Math.random() * 201));
}

function tryPlaceAt(r, c) {
    if (phase !== "placement" || !selectedShipId) return;
    const def = FLEET.find(s => s.id === selectedShipId);
    if (!def || findShip(playerShips, def.id)) return;
    if (!canPlace(playerGrid, r, c, def.length, horizontal)) { setHud("Invalid placement — try another cell or rotate"); return; }
    placeShipOnGrid(playerGrid, playerShips, def, r, c, horizontal);
    const next = FLEET.find(s => !findShip(playerShips, s.id));
    selectedShipId = next ? next.id : null; hoverCell = null;
    renderShipTray(); renderBoards();
    if (allPlaced()) setHud("Fleet ready — press Ready to battle");
    else if (selectedShipId) setHud("Place " + FLEET.find(s => s.id === selectedShipId).name);
}

function openLevelScreen() {
    phase = "level"; gameScreen.classList.add("hidden"); levelScreen.classList.remove("hidden");
    resultOverlay.classList.add("hidden"); showHelp(false);
}

function beginLevel(selected) { level = selected; levelScreen.classList.add("hidden"); gameScreen.classList.remove("hidden"); startPlacement(); }

document.querySelectorAll(".level-btn").forEach(btn => btn.addEventListener("click", () => beginLevel(btn.dataset.level)));
rotateBtn.addEventListener("click", () => { if (phase === "placement") { horizontal = !horizontal; renderBoards(); setHud(horizontal ? "Orientation: horizontal" : "Orientation: vertical"); } });
readyBtn.addEventListener("click", () => { if (allPlaced()) startCombat(); });
newGameBtn.addEventListener("click", startPlacement);
changeLevelBtn.addEventListener("click", openLevelScreen);
playAgainBtn.addEventListener("click", startPlacement);
changeLevelFromResultBtn.addEventListener("click", openLevelScreen);
helpBtnLevel.addEventListener("click", () => showHelp(true));
helpBtnGame.addEventListener("click", () => showHelp(true));
helpClose.addEventListener("click", () => showHelp(false));
helpOverlay.addEventListener("click", e => { if (e.target === helpOverlay) showHelp(false); });

playerBoardEl.addEventListener("click", e => { const cell = e.target.closest(".cell"); if (cell && playerBoardEl.contains(cell)) tryPlaceAt(Number(cell.dataset.r), Number(cell.dataset.c)); });
playerBoardEl.addEventListener("mousemove", e => {
    if (phase !== "placement" || !selectedShipId) return;
    const cell = e.target.closest(".cell");
    if (!cell || !playerBoardEl.contains(cell)) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (!hoverCell || hoverCell.r !== r || hoverCell.c !== c) { hoverCell = { r, c }; renderBoards(); }
});
playerBoardEl.addEventListener("mouseleave", () => { if (phase === "placement" && hoverCell) { hoverCell = null; renderBoards(); } });
enemyBoardEl.addEventListener("click", e => { const cell = e.target.closest(".cell"); if (cell && enemyBoardEl.contains(cell)) handlePlayerFire(Number(cell.dataset.r), Number(cell.dataset.c)); });

document.addEventListener("keydown", e => {
    if(!battleshipActive) return;
    if (e.key === "Escape" && !helpOverlay.classList.contains("hidden")) { showHelp(false); return; }
    if (phase !== "placement") return;
    if ((e.key === "r" || e.key === "R") && !(e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
        e.preventDefault(); horizontal = !horizontal; renderBoards(); setHud(horizontal ? "Orientation: horizontal" : "Orientation: vertical");
    }
});

playerBoardEl.addEventListener("dblclick", e => {
    if (phase !== "placement") return;
    const cell = e.target.closest(".cell"); if (!cell) return;
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c), shipId = playerGrid[r][c];
    if (!shipId) return;
    removeShip(playerGrid, playerShips, shipId); selectedShipId = shipId;
    renderShipTray(); renderBoards(); setHud("Reposition " + FLEET.find(s => s.id === shipId).name);
});

function startBattleship() {
    buildBoards();
    openLevelScreen();
}