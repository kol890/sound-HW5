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
let currentMode = true; // true = painting alive, false = painting dead
let isRunning = false;
let simulationInterval = null;
let currentSpeed = 1000;
let stepCount = 0;

// Internal state
let grid = [];

// Audio Context
let audioCtx = null;
let masterGain = null;

const colors = [
    'var(--cell-alive-1)',
    'var(--cell-alive-2)',
    'var(--cell-alive-3)',
    'var(--cell-alive-4)',
    'var(--cell-alive-5)'
];

// Minor Pentatonic Frequencies (A minor pentatonic: A, C, D, E, G)
// Starting from A1 (55Hz)
const MINOR_PENTATONIC = [
    55.00,  65.41,  73.42,  82.41,  98.00,  // Octave 1
    110.00, 130.81, 146.83, 164.81, 196.00, // Octave 2
    220.00, 261.63, 293.66, 329.63, 392.00, // Octave 3
    440.00, 523.25, 587.33, 659.25, 783.99, // Octave 4
    880.00, 1046.50, 1174.66, 1318.51, 1567.98 // Octave 5
];

/**
 * Initializes Audio Context and Master Gain on first user interaction
 */
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
    }
}

/**
 * Plays a single note with an ADSR-like envelope.
 */
function playNote(frequency, startTime, duration) {
    initAudio();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, startTime);

    const attackTime = 0.03;
    const decayTime = 0.1;
    const sustainLevel = 0.3;
    const releaseTime = 0.2;

    // Prevent clicking by starting at 0
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.2, startTime + attackTime);
    gainNode.gain.exponentialRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime);
    gainNode.gain.setValueAtTime(sustainLevel, startTime + duration);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + releaseTime);

    osc.connect(gainNode);
    gainNode.connect(masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration + releaseTime);
}

/**
 * Maps a grid row to a frequency in the Minor Pentatonic scale.
 * Bottom rows are lower notes, top rows are higher notes.
 */
function getFrequencyForRow(r) {
    // Inverse row index because row 0 is the top of the screen
    const invertedRow = (rows - 1) - r;
    const scaleIndex = invertedRow % MINOR_PENTATONIC.length;
    return MINOR_PENTATONIC[scaleIndex];
}

/**
 * Creates the grid of cells based on the window size.
 */
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

    const fragment = document.createDocumentFragment();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            
            cell.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isMouseDown = true;
                currentMode = grid[r][c] === 0;
                setCellState(r, c, currentMode, cell);
                if (currentMode) {
                    playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2);
                }
            });

            cell.addEventListener('mouseover', () => {
                if (isMouseDown) {
                    const wasDead = grid[r][c] === 0;
                    setCellState(r, c, currentMode, cell);
                    if (wasDead && currentMode) {
                        playNote(getFrequencyForRow(r), audioCtx?.currentTime || 0, 0.2);
                    }
                }
            });

            fragment.appendChild(cell);
        }
    }

    gridContainer.appendChild(fragment);
}

/**
 * Sets a specific cell's state and updates the UI.
 */
function setCellState(r, c, alive, cellElement) {
    grid[r][c] = alive ? 1 : 0;
    const cell = cellElement || document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    
    if (alive) {
        if (!cell.classList.contains('alive')) {
            cell.classList.add('alive');
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            cell.style.backgroundColor = randomColor;
        }
    } else {
        cell.classList.remove('alive');
        cell.style.backgroundColor = '';
    }
}

/**
 * Counts live neighbors for a cell with wrapping (toroidal) grid.
 */
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
 * Computes the next generation based on Game of Life rules.
 */
function updateStep() {
    const nextGrid = grid.map(arr => [...arr]);
    let hasChanged = false;
    let anyAlive = false;
    
    // Track which rows have "births" or survive to play sounds
    const activeRows = new Set();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const neighbors = countNeighbors(r, c);
            const isAlive = grid[r][c] === 1;

            if (isAlive) {
                if (neighbors < 2 || neighbors > 3) {
                    nextGrid[r][c] = 0;
                    hasChanged = true;
                } else {
                    anyAlive = true;
                    activeRows.add(r);
                }
            } else {
                if (neighbors === 3) {
                    nextGrid[r][c] = 1;
                    hasChanged = true;
                    anyAlive = true;
                    activeRows.add(r);
                }
            }
        }
    }

    if (hasChanged || anyAlive) {
        stepCount++;
        stepCountDisplay.textContent = stepCount;
        
        // Play sounds for the active rows
        const noteDuration = (currentSpeed / 1000) * 0.8;
        activeRows.forEach(r => {
            playNote(getFrequencyForRow(r), audioCtx.currentTime, noteDuration);
        });

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] !== nextGrid[r][c]) {
                    setCellState(r, c, nextGrid[r][c] === 1);
                }
            }
        }
        grid = nextGrid;
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
    simulationInterval = setInterval(updateStep, currentSpeed);
}

function pauseSimulation() {
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    nextBtn.disabled = false;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

function clearGrid() {
    pauseSimulation();
    resetStepCount();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) {
                setCellState(r, c, false);
            }
        }
    }
}

// Speed slider handling
speedSlider.addEventListener('input', (e) => {
    currentSpeed = parseInt(e.target.value);
    speedValDisplay.textContent = (currentSpeed / 1000).toFixed(1) + 's';
    
    if (isRunning) {
        clearInterval(simulationInterval);
        simulationInterval = setInterval(updateStep, currentSpeed);
    }
});

// Global mouse tracking
window.addEventListener('mouseup', () => {
    isMouseDown = false;
});

// Initialization
createGrid();
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(createGrid, 250);
});

// Button events
startBtn.addEventListener('click', startSimulation);
pauseBtn.addEventListener('click', pauseSimulation);
nextBtn.addEventListener('click', () => {
    if (!isRunning) {
        updateStep();
    }
});
restartBtn.addEventListener('click', clearGrid);

testSoundBtn.addEventListener('click', () => {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // Play a middle A for testing
    playNote(440, audioCtx.currentTime, 0.5);
});
