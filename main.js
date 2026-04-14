const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Performance hint
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const nextBtn = document.getElementById('next-btn');
const restartBtn = document.getElementById('restart-btn');
const speedSlider = document.getElementById('speed-slider');
const speedValDisplay = document.getElementById('speed-val');
const stepCountDisplay = document.getElementById('step-count');
const adaptiveToggle = document.getElementById('adaptive-toggle');
const jitterToggle = document.getElementById('jitter-toggle');

// Settings for the grid
const CELL_SIZE = 16;
let rows, cols;
let isMouseDown = false;
let currentMode = true;
let isRunning = false;
let stepCount = 0;
let isAdaptiveTempo = false;
let isJitterEnabled = true;

// Internal state - Optimized to 1D Typed Arrays
let grid = null;
let nextGrid = null;
let cellColors = null; // Store colors for each alive cell

// --- TWO CLOCKS SCHEDULER ---
let currentSpeed = 1000;
let nextStepTime = 0;
const LOOK_AHEAD = 0.1;
let requestRef = null;

// Audio Context & Routing
let audioCtx = null;
let masterGain = null;
let compressor = null;

const colors = [
    '#3fb950', // Green
    '#d29922', // Gold
    '#f85149', // Red
    '#bc8cff', // Purple
    '#1f6feb'  // Blue
];

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        compressor.connect(masterGain);
        masterGain.connect(audioCtx.destination);
    }
}

function playNote(frequency, startTime, duration, noteCount = 1, pan = 0) {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    
    panner.pan.setValueAtTime(pan, startTime);
    osc.type = 'triangle';

    const jitterAmount = isJitterEnabled ? 0.01 : 0;
    const jitteredFreq = frequency * (1 + (Math.random() - 0.5) * jitterAmount);
    osc.frequency.setValueAtTime(jitteredFreq, startTime);

    const freqFactor = Math.pow(frequency / 440, 0.5); 
    const baseVolume = 0.2 * freqFactor;
    // Cap voice volume to avoid clipping
    const scaledVolume = baseVolume / Math.max(1, Math.pow(noteCount, 0.6));
    
    const attackTime = 0.03;
    const decayTime = 0.1;
    const sustainLevel = scaledVolume * 0.7;
    const releaseTime = 0.2;
    
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(scaledVolume, startTime + attackTime);
    gainNode.gain.exponentialRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
    gainNode.gain.setValueAtTime(sustainLevel, startTime + duration);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + releaseTime);
    
    osc.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(compressor);
    
    osc.start(startTime);
    osc.stop(startTime + duration + releaseTime);
}

function getFrequencyForRow(r) {
    const MINOR_PENTATONIC = [
        55.00, 65.41, 73.42, 82.41, 98.00,  
        110.00, 130.81, 146.83, 164.81, 196.00, 
        220.00, 261.63, 293.66, 329.63, 392.00, 
        440.00, 523.25, 587.33, 659.25, 783.99, 
        880.00, 1046.50, 1174.66, 1318.51, 1567.98 
    ];
    const invertedRow = (rows - 1) - r;
    const scaleIndex = invertedRow % MINOR_PENTATONIC.length;
    return MINOR_PENTATONIC[scaleIndex];
}

function scheduler() {
    if (!isRunning) return;
    while (nextStepTime < audioCtx.currentTime + LOOK_AHEAD) {
        updateStep(nextStepTime);
        nextStepTime += currentSpeed / 1000;
    }
    requestRef = requestAnimationFrame(scheduler);
}

function createGrid() {
    pauseSimulation();
    resetStepCount();
    
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    cols = Math.floor(canvas.width / CELL_SIZE);
    rows = Math.floor(canvas.height / CELL_SIZE);

    grid = new Uint8Array(rows * cols);
    nextGrid = new Uint8Array(rows * cols);
    cellColors = new Int8Array(rows * cols).fill(-1);

    renderGrid();
}

function renderGrid() {
    ctx.fillStyle = '#161b22'; // Cell BG
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#30363d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
        ctx.moveTo(i * CELL_SIZE, 0);
        ctx.lineTo(i * CELL_SIZE, rows * CELL_SIZE);
    }
    for (let j = 0; j <= rows; j++) {
        ctx.moveTo(0, j * CELL_SIZE);
        ctx.lineTo(cols * CELL_SIZE, j * CELL_SIZE);
    }
    ctx.stroke();

    // Draw alive cells
    for (let r = 0; r < rows; r++) {
        const offset = r * cols;
        for (let c = 0; c < cols; c++) {
            const idx = offset + c;
            if (grid[idx] === 1) {
                const colorIdx = cellColors[idx];
                ctx.fillStyle = colors[colorIdx === -1 ? 0 : colorIdx];
                ctx.fillRect(c * CELL_SIZE + 1, r * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
            }
        }
    }
}

function getCellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    if (r >= 0 && r < rows && c >= 0 && c < cols) {
        return {r, c, idx: r * cols + c};
    }
    return null;
}

function setCellState(r, c, alive) {
    const idx = r * cols + c;
    grid[idx] = alive ? 1 : 0;
    if (alive) {
        cellColors[idx] = Math.floor(Math.random() * colors.length);
    } else {
        cellColors[idx] = -1;
    }
}

function countNeighbors(r, c) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        const nr = (r + i + rows) % rows;
        const rowOffset = nr * cols;
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const nc = (c + j + cols) % cols;
            count += grid[rowOffset + nc];
        }
    }
    return count;
}

function updateStep(time) {
    let anyAlive = false;
    const activeCells = [];

    for (let r = 0; r < rows; r++) {
        const offset = r * cols;
        for (let c = 0; c < cols; c++) {
            const idx = offset + c;
            const neighbors = countNeighbors(r, c);
            const isAlive = grid[idx] === 1;
            
            let nextState = 0;
            if (isAlive) {
                if (neighbors === 2 || neighbors === 3) {
                    nextState = 1;
                    anyAlive = true;
                    activeCells.push({r, c, color: cellColors[idx]});
                }
            } else if (neighbors === 3) {
                nextState = 1;
                anyAlive = true;
                activeCells.push({r, c, color: Math.floor(Math.random() * colors.length)});
            }
            nextGrid[idx] = nextState;
        }
    }

    // Update colors for next generation
    for (let i = 0; i < nextGrid.length; i++) {
        if (nextGrid[i] === 0) cellColors[i] = -1;
    }
    activeCells.forEach(cell => {
        cellColors[cell.r * cols + cell.c] = cell.color;
    });

    if (isAdaptiveTempo) {
        const totalCells = rows * cols;
        const aliveCount = activeCells.length;
        const occupancy = Math.min(aliveCount / (totalCells * 0.05), 1.0);
        currentSpeed = 2000 - occupancy * (2000 - 200);
        
        setTimeout(() => {
            speedSlider.value = currentSpeed;
            speedValDisplay.textContent = (currentSpeed / 1000).toFixed(1) + 's';
        }, 0);
    }

    const temp = grid;
    grid = nextGrid;
    nextGrid = temp;

    if (anyAlive) {
        const noteDuration = (currentSpeed / 1000) * 0.8;
        // VOICE LIMIT
        const maxVoices = 100;
        const playCells = activeCells.length > maxVoices 
            ? activeCells.sort(() => Math.random() - 0.5).slice(0, maxVoices)
            : activeCells;

        playCells.forEach(cell => {
            const pan = (cell.c / Math.max(1, cols - 1)) * 2 - 1;
            playNote(getFrequencyForRow(cell.r), time, noteDuration, playCells.length, pan);
        });

        const currentStep = ++stepCount;
        const delay = (time - audioCtx.currentTime) * 1000;
        
        setTimeout(() => {
            requestAnimationFrame(() => {
                stepCountDisplay.textContent = currentStep;
                renderGrid();
            });
        }, Math.max(0, delay));
    } else if (isRunning) {
        pauseSimulation();
        renderGrid();
    }
}

function resetStepCount() {
    stepCount = 0;
    stepCountDisplay.textContent = '0';
}

function startSimulation() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (isRunning) return;
    isRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    nextBtn.disabled = true;
    nextStepTime = audioCtx.currentTime;
    scheduler();
}

function pauseSimulation() {
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    nextBtn.disabled = false;
    if (requestRef) cancelAnimationFrame(requestRef);
}

function clearGrid() {
    pauseSimulation();
    resetStepCount();
    if (!grid) return;
    grid.fill(0);
    cellColors.fill(-1);
    renderGrid();
}

canvas.addEventListener('mousedown', (e) => {
    initAudio();
    const cell = getCellFromEvent(e);
    if (!cell) return;
    isMouseDown = true;
    currentMode = grid[cell.idx] === 0;
    setCellState(cell.r, cell.c, currentMode);
    renderGrid();
    if (currentMode) {
        const pan = (cell.c / Math.max(1, cols - 1)) * 2 - 1;
        playNote(getFrequencyForRow(cell.r), audioCtx.currentTime, 0.2, 1, pan);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isMouseDown) {
        const cell = getCellFromEvent(e);
        if (!cell) return;
        const wasDead = grid[cell.idx] === 0;
        if (grid[cell.idx] !== (currentMode ? 1 : 0)) {
            setCellState(cell.r, cell.c, currentMode);
            renderGrid();
            if (wasDead && currentMode) {
                const pan = (cell.c / Math.max(1, cols - 1)) * 2 - 1;
                playNote(getFrequencyForRow(cell.r), audioCtx.currentTime, 0.2, 1, pan);
            }
        }
    }
});

speedSlider.addEventListener('input', (e) => {
    currentSpeed = parseInt(e.target.value);
    speedValDisplay.textContent = (currentSpeed / 1000).toFixed(1) + 's';
});

adaptiveToggle.addEventListener('change', (e) => {
    isAdaptiveTempo = e.target.checked;
    speedSlider.disabled = isAdaptiveTempo;
});

jitterToggle.addEventListener('change', (e) => {
    isJitterEnabled = e.target.checked;
});

window.addEventListener('mouseup', () => { isMouseDown = false; });
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(createGrid, 250);
});

startBtn.addEventListener('click', startSimulation);
pauseBtn.addEventListener('click', pauseSimulation);
nextBtn.addEventListener('click', () => {
    if (!isRunning) {
        initAudio();
        updateStep(audioCtx.currentTime);
    }
});
restartBtn.addEventListener('click', clearGrid);

createGrid();
