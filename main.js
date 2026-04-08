const gridContainer = document.getElementById('grid-container');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');

// Settings for the grid
const CELL_SIZE = 16; // Increased size slightly for easier interaction
let rows, cols;
let isMouseDown = false;
let currentMode = true; // true = painting alive, false = painting dead

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
    // Clear existing grid
    gridContainer.innerHTML = '';

    const width = gridContainer.clientWidth;
    const height = gridContainer.clientHeight;

    cols = Math.floor(width / CELL_SIZE);
    rows = Math.floor(height / CELL_SIZE);

    gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    const totalCells = rows * cols;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.dataset.index = i;
        
        // Event listeners for interaction
        cell.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isMouseDown = true;
            // If the cell is currently alive, we're likely erasing.
            // If it's dead, we're likely painting.
            currentMode = !cell.classList.contains('alive');
            toggleCell(cell, currentMode);
        });

        cell.addEventListener('mouseover', () => {
            if (isMouseDown) {
                toggleCell(cell, currentMode);
            }
        });

        fragment.appendChild(cell);
    }

    gridContainer.appendChild(fragment);
}

/**
 * Toggles a cell's alive/dead state.
 * @param {HTMLElement} cell 
 * @param {boolean} forceAlive 
 */
function toggleCell(cell, forceAlive) {
    if (forceAlive) {
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
 * Clears the entire grid.
 */
function clearGrid() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.classList.remove('alive');
        cell.style.backgroundColor = '';
    });
    
    // Reset buttons
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    console.log("Grid cleared.");
}

// Track mouse state globally
window.addEventListener('mouseup', () => {
    isMouseDown = false;
});

// Grid lifecycle
createGrid();
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
        createGrid();
    }, 250);
});

// Button placeholders
startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    console.log("Start pressed - logic not implemented yet.");
});

pauseBtn.addEventListener('click', () => {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    console.log("Pause pressed - logic not implemented yet.");
});

restartBtn.addEventListener('click', () => {
    clearGrid();
});
