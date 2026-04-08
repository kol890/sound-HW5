const gridContainer = document.getElementById('grid-container');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');

// Settings for the grid
const CELL_SIZE = 16;
let rows, cols;
let isMouseDown = false;
let currentMode = true; // true = painting alive, false = painting dead
let isRunning = false;
let simulationInterval = null;

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
                if (isRunning) return;
                e.preventDefault();
                isMouseDown = true;
                currentMode = grid[r][c] === 0;
                setCellState(r, c, currentMode, cell);
            });

            cell.addEventListener('mouseover', () => {
                if (isMouseDown && !isRunning) {
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

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const neighbors = countNeighbors(r, c);
            const isAlive = grid[r][c] === 1;

            if (isAlive) {
                // Rules 1, 2, 3: Survival, Overpopulation, Isolation
                if (neighbors < 2 || neighbors > 3) {
                    nextGrid[r][c] = 0;
                }
            } else {
                // Rule 4: Reproduction
                if (neighbors === 3) {
                    nextGrid[r][c] = 1;
                }
            }
        }
    }

    // Update UI and state
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] !== nextGrid[r][c]) {
                setCellState(r, c, nextGrid[r][c] === 1);
            }
        }
    }
    grid = nextGrid;
}

function startSimulation() {
    if (isRunning) return;
    isRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    simulationInterval = setInterval(updateStep, 1000);
}

function pauseSimulation() {
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

function clearGrid() {
    pauseSimulation();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 1) {
                setCellState(r, c, false);
            }
        }
    }
}

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
restartBtn.addEventListener('click', clearGrid);
