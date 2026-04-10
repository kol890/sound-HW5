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

// Internal state - Optimized to 1D Typed Arrays
let grid = null;
let nextGrid = null;
let cellElements = []; // Flattened DOM Cache

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

function playNote(frequency, startTime, duration, noteCount = 1, pan = 0) {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();
    
    panner.pan.setValueAtTime(pan, startTime);
    osc.type = 'triangle';

    // Add slight variation for warmth (±0.5% jitter)
    const jitteredFreq = frequency * (1 + (Math.random() - 0.5) * 0.01);
    osc.frequency.setValueAtTime(jitteredFreq, startTime);

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
    gainNode.connect(panner);
    panner.connect(compressor);
    
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

    // Optimized Linear Arrays
    grid = new Uint8Array(rows * cols);
    nextGrid = new Uint8Array(rows * cols);
    cellElements = new Array(rows * cols);

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cellElements[idx] = cell;
            cell.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isMouseDown = true;
                currentMode = grid[idx] === 0;
                setCellState(r, c, currentMode);
                if (currentMode) {
                    const pan = (c / Math.max(1, cols - 1)) * 2 - 1;
                    playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2, 1, pan);
                }
            });
            cell.addEventListener('mouseover', () => {
                if (isMouseDown) {
                    const wasDead = grid[idx] === 0;
                    setCellState(r, c, currentMode);
                    if (wasDead && currentMode) {
                        const pan = (c / Math.max(1, cols - 1)) * 2 - 1;
                        playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2, 1, pan);
                    }
                }
            });
            fragment.appendChild(cell);
        }
    }
    gridContainer.appendChild(fragment);
}

function setCellState(r, c, alive) {
    const idx = r * cols + c;
    grid[idx] = alive ? 1 : 0;
    const cell = cellElements[idx];
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
    const activeCells = []; // Track all alive cells for simulation audio
    const changes = []; // Only track what changed for the visual update

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
                    activeCells.push({r, c});
                }
            } else if (neighbors === 3) {
                nextState = 1;
                anyAlive = true;
                activeCells.push({r, c});
            }

            nextGrid[idx] = nextState;
            if (isAlive !== (nextState === 1)) {
                changes.push(idx, nextState);
            }
        }
    }

    // Buffer Swap: grid becomes nextGrid without any cloning
    const temp = grid;
    grid = nextGrid;
    nextGrid = temp;

    if (anyAlive || changes.length > 0) {
        const noteDuration = (currentSpeed / 1000) * 0.8;
        activeCells.forEach(cell => {
            const pan = (cell.c / Math.max(1, cols - 1)) * 2 - 1;
            playNote(getFrequencyForRow(cell.r), time, noteDuration, activeCells.length, pan);
        });

        const currentStep = ++stepCount;
        const delay = (time - audioCtx.currentTime) * 1000;
        
        setTimeout(() => {
            requestAnimationFrame(() => {
                stepCountDisplay.textContent = currentStep;
                for (let i = 0; i < changes.length; i += 2) {
                    const idx = changes[i];
                    const state = changes[i+1];
                    const cell = cellElements[idx];
                    if (state === 1) {
                        cell.classList.add('alive');
                        cell.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    } else {
                        cell.classList.remove('alive');
                        cell.style.backgroundColor = '';
                    }
                }
            });
        }, Math.max(0, delay));
    } else if (isRunning) {
        pauseSimulation();
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
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === 1) {
            grid[i] = 0;
            const cell = cellElements[i];
            cell.classList.remove('alive');
            cell.style.backgroundColor = '';
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
