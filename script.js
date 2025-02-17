// ------------------------------
// Parameter Object & Constants
// ------------------------------

const initialGridWidth = 7;
const initialGridHeight = 7;
const initialRoundTime = 45; // seconds per round
const initialMinRoundScore = 100;
const maxMinRoundScore = 1337;  // score req is increased each round but capped at this value
const initialRequiredPointsIncrement = 100;

const params = {
  gridWidth: initialGridWidth,
  gridHeight: initialGridHeight,
  minTileValue: 1,
  maxTileValue: 9,
  roundTime: initialRoundTime,
  minRoundScore: initialMinRoundScore,
  requiredPointsIncrement: initialRequiredPointsIncrement,
  minPathLength: 6,
  maxPathLength: 12,
  maxSequenceAttempts: 1000,
  maxPathAttempts: 1000
};

// ------------------------------
// Global Game Variables
// ------------------------------
let board = []; // 2D array of tile values
let winningPath = []; // Array of objects: {row, col, value}
let winningSequence = []; // The pre-generated sequence of numbers (non-decreasing)
let selectedPath = []; // Array of objects: {row, col, value}
let timerInterval = null;
let timeLeft = params.roundTime;
let totalScore = 0;
let roundScore = 0;
let currentRequiredScore = params.minRoundScore;
let gameActive = false;  // round is in progress
let roundNumber = 1; // Global round counter
let gameOver = false;
let soundEnabled = true;
// ------------------------------
// DOM Elements
// ------------------------------
const boardEl = document.getElementById('board');
const overlayEl = document.getElementById('overlay');
const timerEl = document.getElementById('timer');
const scoreBreakdownEl = document.getElementById('scoreBreakdown');
const newGameBtn = document.getElementById('newGameBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const showSolutionBtn = document.getElementById('showSolutionBtn');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpBtn = document.getElementById('closeHelpBtn');
const highScoreText = document.getElementById('highScore');
stopBtn.disabled = true;
nextRoundBtn.disabled = true;
showSolutionBtn.disabled = true;
highScoreText.textContent = `High Score: ${getHighScore()}`;

document.addEventListener('DOMContentLoaded', () => {
  const tileSize = 50; // px
  const gap = 2;       // px
  const containerWidth = (tileSize * params.gridWidth) + (gap * (params.gridWidth - 1));
  document.getElementById('boardContainer').style.width = containerWidth + 'px';
});

// ------------------------------
// Audio Setup
// ------------------------------

// Create one global AudioContext.
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBlip(pathLength) {
  if (!soundEnabled) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Base frequency of 400 Hz, increase 50 Hz per tile (adjust as desired)
  oscillator.frequency.value = 400 + (pathLength * 15);
  oscillator.type = 'sine';

  // Set the initial volume.
  const initialGain = 0.2;
  gainNode.gain.setValueAtTime(initialGain, audioCtx.currentTime);

  oscillator.start();

  // Schedule a smooth fade-out
  // Note: Exponential ramp requires a nonzero target value.
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);

  // Stop the oscillator slightly after the ramp completes.
  oscillator.stop(audioCtx.currentTime + 0.20);
}

// Play a "lose" sound when the player loses.
function playLoseSound() {
  if (!soundEnabled) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.frequency.value = 50;  // Lower tone for loss
  oscillator.type = 'sawtooth';
  gainNode.gain.value = 0.05;

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.5);  // Play for 500 ms
}

function playWarningSound10() {
  if (!soundEnabled) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Use a mid-range frequency for the 10 sec warning.
  oscillator.frequency.value = 600;
  oscillator.type = 'square';

  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  oscillator.start();
  // Smooth fade out over 0.2 seconds.
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  oscillator.stop(audioCtx.currentTime + 0.25);
}

function playWarningSound5() {
  if (!soundEnabled) return;

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  // Use a higher frequency for the 5 sec warning.
  oscillator.frequency.value = 750;
  oscillator.type = 'square';

  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  oscillator.start();
  // Smooth fade out over 0.2 seconds.
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  oscillator.stop(audioCtx.currentTime + 0.25);
}

const toggleSoundBtn = document.getElementById('toggleSound');

toggleSoundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    toggleSoundBtn.classList.add('active');
  } else {
    toggleSoundBtn.classList.remove('active');
  }
});

// ------------------------------
// Utility Functions
// ------------------------------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Returns a deep copy of an array of objects
function deepCopy(arr) {
  return JSON.parse(JSON.stringify(arr));
}

// ------------------------------
// Winning Sequence Generation
// ------------------------------

// Generate a non-decreasing sequence of numbers uniformly.
// We require that (length * sum) >= minRoundScore.
function generateWinningSequence(requiredScore) {
  const { minTileValue, maxTileValue, maxSequenceAttempts, minPathLength, maxPathLength } = params;
  const mu = (minTileValue + maxTileValue) / 2;  // approximate average tile value
  // Compute the desired sequence length based on R ≈ mu * L^2, i.e. L ≈ sqrt(R / mu)
  let desiredLength = Math.ceil(Math.sqrt(requiredScore / mu));
  // Define a range around the desired length.
  // const minLen = Math.max(minPathLength, desiredLength - 2);
  // const maxLen = Math.min(maxPathLength, desiredLength + 2);
  const minLen = Math.max(minPathLength, desiredLength - 1);
  const maxLen = Math.min(maxPathLength, desiredLength + 1);

  let attempts = 0;
  while (attempts < maxSequenceAttempts) {
    const length = randInt(minLen, maxLen);
    let seq = [];
    for (let i = 0; i < length; i++) {
      seq.push(randInt(minTileValue, maxTileValue));
    }
    // Sort to enforce non-decreasing order.
    seq.sort((a, b) => a - b);
    const sum = seq.reduce((a, b) => a + b, 0);
    const score = sum * length;
    if (score >= requiredScore) {
      return { seq, length };
    }
    attempts++;
  }
  return null; // Failed after many attempts.
}

// ------------------------------
// Winning Path Layout Generation
// ------------------------------

// Lay out the winning sequence on the grid with the following rules:
//   - The first tile must be in the top row.
//   - The last tile must be in the bottom row.
//   - Moves alternate: once the first move's type is chosen (either horizontal or vertical),
//     subsequent moves alternate.
// For horizontal moves: the row remains the same, and the column must change.
// For vertical moves: the column remains the same, and the row must increase (at least by 1).
function generateWinningPathLayout(n) {
  const gridHeight = params.gridHeight;
  const gridWidth = params.gridWidth;
  let bestPath = null;

  // Generate an alternating pattern
  function getPattern() {
    const pattern = [];
    const m = n - 1; // total number of moves needed
    // If m is even, start with horizontal; if odd, start with vertical.
    const firstMove = (m % 2 === 0) ? 'horizontal' : 'vertical';
    pattern.push(firstMove);
    for (let i = 1; i < m; i++) {
      pattern.push(pattern[i - 1] === 'horizontal' ? 'vertical' : 'horizontal');
    }
    return pattern;
  }

  // Backtracking function.
  // index: current move index (0-indexed; first tile is already in path)
  // curr: current position {row, col}
  // pattern: array of move types of length (n-1)
  // path: array of positions so far
  function backtrack(index, curr, pattern, path) {
    // If we are at the bottom row before finishing the path, this branch is invalid.
    if (curr.row === gridHeight - 1 && index < n - 1) {
      return false;
    }
    // Base case: we have generated n moves.
    if (index === n - 1) {
      if (curr.row === gridHeight - 1) {
        bestPath = JSON.parse(JSON.stringify(path));
        return true;
      }
      return false;
    }

    const moveType = pattern[index];
    let candidates = [];
    if (moveType === 'horizontal') {
      // Horizontal moves: same row, any different column.
      for (let col = 0; col < gridWidth; col++) {
        if (col !== curr.col) {
          candidates.push({ row: curr.row, col });
        }
      }
    } else { // vertical move (allow upward or downward)
      // For vertical moves, try all rows (except the current one).
      for (let row = 0; row < gridHeight; row++) {
        if (row === curr.row) continue;
        // Compute how many vertical moves remain after this move.
        const remainingVertical = pattern.slice(index + 1).filter(m => m === 'vertical').length;
        // Feasibility check:
        // In the best-case scenario, assume that from the candidate we can move downward by one per vertical move.
        // Then candidate.row + remainingVertical must be at least gridHeight - 1.
        if (row + remainingVertical < gridHeight - 1) continue;
        candidates.push({ row, col: curr.col });
      }
    }
    // Remove any candidate that is already in the path (to avoid cycles).
    candidates = candidates.filter(candidate =>
      !path.some(p => p.row === candidate.row && p.col === candidate.col)
    );
    // Randomize candidate order.
    candidates.sort(() => Math.random() - 0.5);
    for (let candidate of candidates) {
      path.push(candidate);
      if (backtrack(index + 1, candidate, pattern, path)) {
        return true;
      }
      path.pop();
    }
    return false;
  }

  // Try up to maxPathAttempts times to generate a valid path.
  for (let attempt = 0; attempt < params.maxPathAttempts; attempt++) {
    const pattern = getPattern();
    const startCol = randInt(0, gridWidth - 1);
    const path = [{ row: 0, col: startCol }];
    if (backtrack(0, { row: 0, col: startCol }, pattern, path)) {
      return bestPath;
    }
  }
  return null;
}

// ------------------------------
// Board Generation
// ------------------------------

// Generate the board with a winning path embedded.
function generateBoard(requiredScore) {
  const { gridHeight, gridWidth } = params;
  // Initialize board with nulls.
  board = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(null));

  const seqResult = generateWinningSequence(requiredScore);
  if (!seqResult) {
    alert("Unable to generate a winning sequence. Please try again later.");
    gameActive = false;
    return;
  }
  winningSequence = seqResult.seq;
  const seqLength = seqResult.length;

  const pathLayout = generateWinningPathLayout(seqLength);
  if (!pathLayout) {
    alert("Unable to generate a winning path layout. Please try again later.");
    gameActive = false;
    return;
  }
  winningPath = deepCopy(pathLayout);
  // Place the winning sequence numbers along the winning path.
  winningPath.forEach((tile, index) => {
    board[tile.row][tile.col] = winningSequence[index];
    tile.value = winningSequence[index];
  });
  // Fill in the remaining board.
  for (let r = 0; r < gridHeight; r++) {
    for (let c = 0; c < gridWidth; c++) {
      if (board[r][c] === null) {
        if (r === 0) {
          // First row: roll twice and take the lower number.
          board[r][c] = Math.min(randInt(params.minTileValue, params.maxTileValue),
                                 randInt(params.minTileValue, params.maxTileValue));
        } else if (r === gridHeight - 1) {
          // Last row: roll twice and take the higher number.
          board[r][c] = Math.max(randInt(params.minTileValue, params.maxTileValue),
                                 randInt(params.minTileValue, params.maxTileValue));
        } else {
          // All other rows: roll once.
          board[r][c] = randInt(params.minTileValue, params.maxTileValue);
        }
      }
    }
  }
}

// ------------------------------
// Rendering the Board
// ------------------------------
function renderBoard() {
  const { gridHeight, gridWidth } = params;
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${gridWidth}, 50px)`;
  for (let r = 0; r < gridHeight; r++) {
    for (let c = 0; c < gridWidth; c++) {
      const tileEl = document.createElement('div');
      tileEl.classList.add('tile');
      if (r === 0) tileEl.classList.add('tile-top');
      if (r === gridHeight - 1) tileEl.classList.add('tile-bottom');
      tileEl.dataset.row = r;
      tileEl.dataset.col = c;
      tileEl.textContent = board[r][c];
      if (selectedPath.some(t => t.row === r && t.col === c)) {
        tileEl.classList.add('selected');
      }
      boardEl.appendChild(tileEl);
    }
  }
  overlayEl.innerHTML = '';
}

// ------------------------------
// Drawing the Connecting Path
// ------------------------------
function drawPath(pathArray) {
  overlayEl.innerHTML = '';
  if (pathArray.length === 0) return;
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#FFFF44");
  polyline.setAttribute("stroke-width", "4");
  polyline.setAttribute("stroke-opacity", "0.5");

  const boardContainer = document.getElementById('boardContainer');
  const containerRect = boardContainer.getBoundingClientRect();
  let points = "";
  pathArray.forEach(tile => {
    const tileEl = document.querySelector(`.tile[data-row="${tile.row}"][data-col="${tile.col}"]`);
    if (tileEl) {
      const rect = tileEl.getBoundingClientRect();
      // Calculate the center of the tile relative to the boardContainer.
      const cx = rect.left - containerRect.left + rect.width / 2;
      const cy = rect.top - containerRect.top + rect.height / 2;
      points += `${cx},${cy} `;
    }
  });
  polyline.setAttribute("points", points.trim());
  overlayEl.appendChild(polyline);

  // Animate the drawing:
  const polylineLength = polyline.getTotalLength();
  polyline.style.strokeDasharray = polylineLength;
  polyline.style.strokeDashoffset = polylineLength;
  polyline.style.setProperty('--line-length', polylineLength);

  // Ensure constant speed (adjust constants as desired)
  const duration = 0.5 + (polylineLength / 500);

  // Combine two animations:
  // - drawLine: draws the line (duration based on polyline length)
  // - pulsateGlow: continuously pulsates the glow effect (2s cycle, infinite)
  polyline.style.animation = `drawLine ${duration}s ease-out forwards, pulsateGlow 2s ease-in-out infinite`;
}

// ------------------------------
// Game State Management & Moves
// ------------------------------
function isLegalMove(row, col) {
  const tileValue = board[row][col];
  // Prevent selecting a tile that's already in the selected path.
  if (selectedPath.some(t => t.row === row && t.col === col)) return false;

  // First move: must be on the top row.
  if (selectedPath.length === 0) {
    return row === 0;
  }

  const lastTile = selectedPath[selectedPath.length - 1];
  // The new tile's value must be equal to or higher than the last tile's value.
  if (tileValue < lastTile.value) return false;
  // Second move: allow any tile in the same row or the same column.
  if (selectedPath.length === 1) {
    return (row === lastTile.row || col === lastTile.col);
  }

  // For subsequent moves, determine the direction of the previous move.
  const prevTile = selectedPath[selectedPath.length - 2];
  // If the previous move was horizontal (same row), the current move must be vertical.
  if (prevTile.row === lastTile.row) {
    return col === lastTile.col;
  }
  // If the previous move was vertical (same column), the current move must be horizontal.
  if (prevTile.col === lastTile.col) {
    return row === lastTile.row;
  }

  return false;
}

function highlightLegalMoves() {
  document.querySelectorAll('.tile.legal').forEach(el => {
    el.classList.remove('legal');
  });
  if (!gameActive) return;
  const { gridHeight, gridWidth } = params;

  if (selectedPath.length === 0) {
    // For the first move, legal moves are all top row tiles.
    for (let c = 0; c < gridWidth; c++) {
      const tile = getTileEl(0, c);
      if (!tile.classList.contains('selected')) {
        tile.classList.add('legal');
      }
    }
  } else {
    const lastTile = selectedPath[selectedPath.length - 1];
    let legalTiles = [];
    if (selectedPath.length === 1) {
      // For the second move, legal moves are in the same row or same column.
      // Same row:
      for (let c = 0; c < gridWidth; c++) {
        if (c !== lastTile.col) legalTiles.push({ row: lastTile.row, col: c });
      }
      // Same column:
      for (let r = 0; r < gridHeight; r++) {
        if (r !== lastTile.row) legalTiles.push({ row: r, col: lastTile.col });
      }
    } else {
      const prevTile = selectedPath[selectedPath.length - 2];
      if (prevTile.row === lastTile.row) {
        // Previous move was horizontal, so the current move must be vertical.
        for (let r = 0; r < gridHeight; r++) {
          if (r !== lastTile.row) legalTiles.push({ row: r, col: lastTile.col });
        }
      } else if (prevTile.col === lastTile.col) {
        // Previous move was vertical, so the current move must be horizontal.
        for (let c = 0; c < gridWidth; c++) {
          if (c !== lastTile.col) legalTiles.push({ row: lastTile.row, col: c });
        }
      }
    }
    // Filter out moves that don't satisfy the non-decreasing condition.
    legalTiles = legalTiles.filter(tile => board[tile.row][tile.col] >= lastTile.value);
    legalTiles.forEach(tile => {
      const tileEl = getTileEl(tile.row, tile.col);
      tileEl.classList.add('legal');
    });
    if (legalTiles.length === 0) {
      endRound(false);
    }
  }
}

function getTileEl(row, col) {
  return document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

function updateRoundScore() {
  const sum = selectedPath.reduce((acc, tile) => acc + tile.value, 0);
  const length = selectedPath.length;
  roundScore = sum * length;
}

function handleTileClick(e) {
  if (!gameActive) return;
  const tileEl = e.currentTarget;
  if (!tileEl.classList.contains('legal')) return;
  const row = parseInt(tileEl.dataset.row);
  const col = parseInt(tileEl.dataset.col);
  if (!isLegalMove(row, col)) return;
  const value = board[row][col];
  selectedPath.push({ row, col, value });
  playBlip(selectedPath.length);

  tileEl.classList.add('selected');
  updateRoundScore();
  updateTopInfo();
  if (row === params.gridHeight - 1) {
    const score = calculateRoundScore();
    if (score >= params.minRoundScore) {
      endRound(true);
    } else {
      endRound(false);
      playLoseSound();
    }
    drawPath(selectedPath);
    return;
  }
  highlightLegalMoves();
}

function calculateRoundScore() {
  const sum = selectedPath.reduce((acc, tile) => acc + tile.value, 0);
  return sum * selectedPath.length;
}

function updateTopInfo() {
  const timerEl = document.getElementById('timer');
  const topScoreEl = document.getElementById('topScore');
  const topStatusEl = document.getElementById('topStatus');

  timerEl.textContent = "Time: " + formatTime(timeLeft);
  topScoreEl.textContent = `Score: ${roundScore}`;

  let pointsMissing = currentRequiredScore - roundScore;
  if (pointsMissing <= 0) {
    topStatusEl.textContent = "Breached!";
  } else {
    topStatusEl.textContent = `Missing: ${pointsMissing}`;
  }
}

// A function to retrieve the high score from localStorage, defaulting to 0 if not set.
function getHighScore() {
  return parseInt(localStorage.getItem('highScore')) || 0;
}

function updateHighScore() {
  const currentHigh = getHighScore();
  if (totalScore > currentHigh) {
    localStorage.setItem('highScore', totalScore);
    highScoreText.textContent = `High Score: ${totalScore}`;
  }
}

function updateDifficulty(roundNumber) {
  // increase minRoundScore but not above maxMinRoundScore
  params.minRoundScore = Math.min(params.minRoundScore + params.requiredPointsIncrement, maxMinRoundScore);

  const num = 4;
  if (roundNumber === num + 1) {
    params.roundTime += 5;
  } else if (roundNumber === 2 * num + 1) {
    params.roundTime += 5;
    params.gridHeight += 1;
  } else if (roundNumber === 3 * num + 1) {
    params.roundTime += 5;
  } else if (roundNumber === 4 * num + 1) {
    params.roundTime += 5;
    params.gridHeight += 1;
  }
}

function resetDifficulty() {
  params.minRoundScore = initialMinRoundScore;
  params.roundTime = initialRoundTime;
  params.gridWidth = initialGridWidth;
  params.gridHeight = initialGridHeight;
}

function endRound(win) {
  gameActive = false;
  clearInterval(timerInterval);
  document.querySelectorAll('.tile.legal').forEach(el => {
    el.classList.remove('legal');
  });
  stopBtn.disabled = true;

  if (win) {
    totalScore += roundScore;
    document.getElementById('messageLine').textContent = "Your breach was successfully!";
    document.getElementById('messageLine').className = "info-line win";
    updateHistory(roundNumber, currentRequiredScore, roundScore, totalScore);
    roundNumber++;
    updateDifficulty(roundNumber);
    nextRoundBtn.disabled = false;
    showSolutionBtn.disabled = true;
  } else {
    document.getElementById('messageLine').textContent = "You have been caught!";
    document.getElementById('messageLine').className = "info-line lose";
    updateHistory(roundNumber, currentRequiredScore, roundScore, totalScore);
    nextRoundBtn.disabled = true;
    showSolutionBtn.disabled = false;
    gameOver = true;
    playLoseSound();
  }
  updateHighScore();
  updateTopInfo();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  // Always show two digits for minutes and seconds.
  return `${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function startTimer() {
  timeLeft = params.roundTime;
  timerEl.textContent = "Time: " + formatTime(timeLeft);

  // Reset warning flags at the start of each round.
  let warning10Played = false;
  let warning5Played = false;

  const rootStyles = getComputedStyle(document.documentElement);
  const timerDefaultColor = rootStyles.getPropertyValue('--timer-default-color').trim();
  timerEl.style.color = timerDefaultColor;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = "Time: " + formatTime(timeLeft);

    if (timeLeft <= 10 && timeLeft > 0) {
      timerEl.style.color = "red";
    }

    if (timeLeft === 10 && !warning10Played) {
      playWarningSound10();
      warning10Played = true;
    }

    if (timeLeft <= 5 && timeLeft > 0) {
      playWarningSound5();
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      endRound(false);
      drawPath(selectedPath);
    }
  }, 1000);
}

// ------------------------------
// Show Winning Path
// ------------------------------
function revealWinningPath() {
  winningPath.forEach(tile => {
    const tileEl = getTileEl(tile.row, tile.col);
    tileEl.classList.add('solution');
  });
  drawPath(winningPath);
  showSolutionBtn.disabled = true;
}

// ------------------------------
// Score preview
// ------------------------------

let tooltipTimeout;

function showTooltipForTile(tileEl) {
  // Compute potential score: if the tile's value is added,
  // potential score = (current sum + tileValue) * (current count + 1).
  const tileValue = parseInt(tileEl.textContent);
  const currentSum = selectedPath.reduce((acc, tile) => acc + tile.value, 0);
  const newCount = selectedPath.length + 1;
  const potentialScore = (currentSum + tileValue) * newCount;

  // Position the tooltip near the tile.
  const rect = tileEl.getBoundingClientRect();
  const tooltip = document.getElementById('tooltip');
  tooltip.textContent = `${potentialScore}`;

  // Position tooltip above the tile if possible.
  tooltip.style.left = rect.left + (rect.width / 2) + 'px';
  tooltip.style.top = (rect.top - 10) + 'px'; // 10px above the tile
  tooltip.style.display = 'block';
  // Fade in:
  setTimeout(() => {
    tooltip.style.opacity = '1';
  }, 50);
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  tooltip.style.opacity = '0';
  // Hide after fade-out.
  setTimeout(() => {
    tooltip.style.display = 'none';
  }, 200);
}

// Use event delegation on the board.
boardEl.addEventListener('mouseover', (e) => {
  // Only show tooltip if the hovered element is a legal tile.
  const tileEl = e.target.closest('.tile.legal');
  if (tileEl) {
    // Set a timeout of 0.5 seconds before showing the tooltip.
    tooltipTimeout = setTimeout(() => {
      showTooltipForTile(tileEl);
    }, 500);
  }
});

boardEl.addEventListener('mouseout', (e) => {
  // When the mouse leaves a tile, clear the timeout and hide the tooltip.
  clearTimeout(tooltipTimeout);
  hideTooltip();
});

// ------------------------------
// Game Initialization and Reset
// ------------------------------
function startRound() {
  currentRequiredScore = params.minRoundScore;
  selectedPath = [];
  roundScore = 0;

  // Clear the info panel and hide it initially.
  document.getElementById('messageLine') && (document.getElementById('messageLine').textContent = "");

  gameActive = true;
  nextRoundBtn.disabled = true;
  showSolutionBtn.disabled = true;
  stopBtn.disabled = false;

  generateBoard(currentRequiredScore);
  renderBoard();
  document.querySelectorAll('.tile').forEach(tileEl => {
    tileEl.addEventListener('click', handleTileClick);
  });
  highlightLegalMoves();
  updateTopInfo();
  startTimer();
}

function restartGame() {
  clearInterval(timerInterval);
  totalScore = 0;
  // Reset required points to initial value.
  params.minRoundScore = initialMinRoundScore;
  roundNumber = 1;
  // Clear the history table.
  document.querySelector('#historyTable tbody').innerHTML = "";
  // Reset game flags.
  gameOver = false;
  highScore = getHighScore();
  highScoreText.textContent = `High Score: ${highScore}`;
  resetDifficulty();
  startRound();
}

// ---------------
// Score display
// ---------------

function updateHistory(round, minScore, achieved, cumulative) {
  const tbody = document.querySelector('#historyTable tbody');
  const tr = document.createElement('tr');
  // If the achieved score is less than the minimum required, mark this round as failed.
  if (achieved < minScore) {
    tr.classList.add('fail');
  }
  tr.innerHTML = `<td>${round}</td><td>${minScore}</td><td>${achieved}</td><td>${cumulative}</td>`;
  tbody.appendChild(tr);
}

// ------------------------------
// Button Event Listeners
// ------------------------------
newGameBtn.addEventListener('click', () => {
  // If the game is in progress (i.e. progress exists and game is not already over/stopped), ask for confirmation.
  if ((gameActive || !gameOver) && ((selectedPath.length > 0) || (roundNumber > 1))) {
    const confirmRestart = confirm("You will lose your current progress. Continue?");
    if (!confirmRestart) {
      return;  // Cancel new game.
    }
  }
  restartGame();
});

stopBtn.addEventListener('click', () => {
  if ((gameActive || !gameOver) && ((selectedPath.length > 0) || (roundNumber > 1))) {
    const confirmStop = confirm("You will lose your current progress. Continue?");
    if (!confirmStop) {
      return;
    }
  }
  clearInterval(timerInterval);
  gameActive = false;
  // Clear the board and overlay.
  boardEl.innerHTML = "";
  overlayEl.innerHTML = "";
  // Hide game-related controls.
  nextRoundBtn.disabled = true;
  showSolutionBtn.disabled = true;
  stopBtn.disabled = true;
});

nextRoundBtn.addEventListener('click', () => {
  startRound();
});

showSolutionBtn.addEventListener('click', () => {
  revealWinningPath();
});

helpBtn.addEventListener('click', () => {
  helpModal.style.display = 'block';
});

closeHelpBtn.addEventListener('click', () => {
  helpModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === helpModal) {
    helpModal.style.display = 'none';
  }
});
