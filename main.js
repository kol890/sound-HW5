const gridContainer = document.getElementById('grid-container');

// Settings for the grid
const CELL_SIZE = 12; // pixels
let rows, cols;

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

    const colors = [
        'var(--cell-alive-1)',
        'var(--cell-alive-2)',
        'var(--cell-alive-3)',
        'var(--cell-alive-4)',
        'var(--cell-alive-5)'
    ];

    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        
        // Randomly make some cells "alive" for the visualization
        if (Math.random() > 0.85) {
            cell.classList.add('alive');
            // Assign a random color from our CSS variables
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            cell.style.backgroundColor = randomColor;
        }
        
        fragment.appendChild(cell);
    }

    gridContainer.appendChild(fragment);
}

// Initial grid creation
createGrid();

// Update grid on window resize
window.addEventListener('resize', () => {
    // Basic debounce to prevent excessive calculations during resize
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
        createGrid();
    }, 250);
});
