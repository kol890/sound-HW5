const gridContainer = document.getElementById('grid-container');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const nextBtn = document.getElementById('next-btn');
const restartBtn = document.getElementById('restart-btn');
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

const colors = [
    'var(--cell-alive-1)',
    'var(--cell-alive-2)',
    'var(--cell-alive-3)',
    'var(--cell-alive-4)',
    'var(--cell-alive-5)'
];

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

    // Initialize internal state
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
            });

            cell.addEventListener('mouseover', () => {
                if (isMouseDown) {
                    setCellState(r, c, currentMode, cell);
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

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const neighbors = countNeighbors(r, c);
            const isAlive = grid[r][c] === 1;

            if (isAlive) {
                if (neighbors < 2 || neighbors > 3) {
                    nextGrid[r][c] = 0;
                    hasChanged = true;
                }
            } else {
                if (neighbors === 3) {
                    nextGrid[r][c] = 1;
                    hasChanged = true;
                }
            }
        }
    }

    if (hasChanged) {
        stepCount++;
        stepCountDisplay.textContent = stepCount;
        
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
        // Restart interval with new speed
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
