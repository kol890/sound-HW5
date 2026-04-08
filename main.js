const gridContainer = document.getElementById('grid-container');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const nextBtn = document.getElementById('next-btn');
const restartBtn = document.getElementById('restart-btn');
const testSoundBtn = document.getElementById('test-sound-btn');
const speedSlider = document.getElementById('speed-slider');
const speedValDisplay = document.getElementById('speed-val');
const stepCountDisplay = document.getElementById('step-count');

// Settings for the grid
const CELL_SIZE = 16;
let rows, cols;
let isMouseDown = false;
let currentMode = true;
let isRunning = false;
let stepCount = 0;

// Internal state
let grid = [];
let cellElements = [];

// --- TWO CLOCKS SCHEDULER ---
let currentSpeed = 1000; // ms per step
let nextStepTime = 0;    // When the next audio step should occur (in audioContext time)
const LOOK_AHEAD = 0.1;  // How far to look ahead (seconds)
let requestRef = null;

// Audio Context & Routing
let audioCtx = null;
let masterGain = null;
let compressor = null;

const colors = [
    'var(--cell-alive-1)',
    'var(--cell-alive-2)',
    'var(--cell-alive-3)',
    'var(--cell-alive-4)',
    'var(--cell-alive-5)'
];

const MINOR_PENTATONIC = [
    55.00,  65.41,  73.42,  82.41,  98.00,  
    110.00, 130.81, 146.83, 164.81, 196.00, 
    220.00, 261.63, 293.66, 329.63, 392.00, 
    440.00, 523.25, 587.33, 659.25, 783.99, 
    880.00, 1046.50, 1174.66, 1318.51, 1567.98 
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

function playNote(frequency, startTime, duration, noteCount = 1) {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, startTime);

    const freqFactor = Math.pow(frequency / 440, 0.5); 
    const baseVolume = 0.2 * freqFactor;
    const scaledVolume = baseVolume / Math.max(1, Math.pow(noteCount, 0.5));

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
    gainNode.connect(compressor);
    osc.start(startTime);
    osc.stop(startTime + duration + releaseTime);
}

function getFrequencyForRow(r) {
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
    gridContainer.innerHTML = '';
    const width = gridContainer.clientWidth;
    const height = gridContainer.clientHeight;
    cols = Math.floor(width / CELL_SIZE);
    rows = Math.floor(height / CELL_SIZE);
    gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    grid = Array(rows).fill().map(() => Array(cols).fill(0));
    cellElements = Array(rows).fill().map(() => Array(cols).fill(null));

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cellElements[r][c] = cell;
            cell.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isMouseDown = true;
                currentMode = grid[r][c] === 0;
                setCellState(r, c, currentMode);
                if (currentMode) {
                    playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2, 1);
                }
            });
            cell.addEventListener('mouseover', () => {
                if (isMouseDown) {
                    const wasDead = grid[r][c] === 0;
                    setCellState(r, c, currentMode);
                    if (wasDead && currentMode) {
                        playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2, 1);
                    }
                }
            });
            fragment.appendChild(cell);
        }
    }
    gridContainer.appendChild(fragment);
}

function setCellState(r, c, alive) {
    grid[r][c] = alive ? 1 : 0;
    const cell = cellElements[r][c];
    if (!cell) return;
    if (alive) {
        if (!cell.classList.contains('alive')) {
            cell.classList.add('alive');
            cell.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        }
    } else {
        cell.classList.remove('alive');
        cell.style.backgroundColor = '';
    }
}

function countNeighbors(r, c) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const row = (r + i + rows) % rows;
            const col = (c + j + cols) % cols;
            count += grid[row][col];
        }
    }
    return count;
}

/**
 * Computes next generation and schedules audio/visuals.
 */
function updateStep(time) {
    const nextGrid = grid.map(arr => [...arr]);
    let anyAlive = false;
    const activeRows = new Set();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const neighbors = countNeighbors(r, c);
            const isAlive = grid[r][c] === 1;
            if (isAlive) {
                if (neighbors === 2 || neighbors === 3) {
                    anyAlive = true;
                    activeRows.add(r);
                } else {
                    nextGrid[r][c] = 0;
                }
            } else {
                if (neighbors === 3) {
                    nextGrid[r][c] = 1;
                    anyAlive = true;
                    activeRows.add(r);
                }
            }
        }
    }

    // Schedule audio
    const noteDuration = (currentSpeed / 1000) * 0.8;
    activeRows.forEach(r => playNote(getFrequencyForRow(r), time, noteDuration, activeRows.size));

    // Schedule visual update
    const gridToRender = nextGrid.map(arr => [...arr]);
    const currentStep = ++stepCount;
    const delay = (time - audioCtx.currentTime) * 1000;
    
    setTimeout(() => {
        requestAnimationFrame(() => {
            renderGridState(gridToRender, currentStep);
        });
    }, Math.max(0, delay));

    grid = nextGrid;
    if (!anyAlive && isRunning) pauseSimulation();
}

/**
 * Updates DOM based on a captured grid state.
 */
function renderGridState(state, count) {
    stepCountDisplay.textContent = count;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const isAlive = state[r][c] === 1;
            const cell = cellElements[r][c];
            if (isAlive && !cell.classList.contains('alive')) {
                cell.classList.add('alive');
                cell.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            } else if (!isAlive && cell.classList.contains('alive')) {
                cell.classList.remove('alive');
                cell.style.backgroundColor = '';
            }
        }
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
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            setCellState(r, c, false);
        }
    }
}

speedSlider.addEventListener('input', (e) => {
    currentSpeed = parseInt(e.target.value);
    speedValDisplay.textContent = (currentSpeed / 1000).toFixed(1) + 's';
});

window.addEventListener('mouseup', () => { isMouseDown = false; });
createGrid();
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

testSoundBtn.addEventListener('click', () => {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playNote(440, audioCtx.currentTime, 0.5, 1);
});
