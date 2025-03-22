// Parameters & Constants
const initialGridWidth = 7;
const initialGridHeight = 7;
const initialRoundTime = 45; // seconds
const initialMinRoundScore = 100;
const maxMinRoundScore = 1337;
const initialRequiredPointsIncrement = 100;

const params = {
  gridWidth: initialGridWidth,
  gridHeight: initialGridHeight,
  minTileValue: 1,
  maxTileValue: 9,
  roundTime: initialRoundTime,
  minRoundScore: initialMinRoundScore,
  requiredPointsIncrement: initialRequiredPointsIncrement,
  minPathLength: 5,
  maxPathLength: 23,
  maxSequenceAttempts: 10000,
  maxPathAttempts: 10000
};

// Game State
const state = {
  board: [],
  winningPath: [],
  winningSequence: [],
  selectedPath: [],
  timerInterval: null,
  timeLeft: params.roundTime,
  totalScore: 0,
  roundScore: 0,
  currentRequiredScore: params.minRoundScore,
  gameActive: false,
  roundNumber: 1,
  gameOver: false
};

// DOM Elements
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
const stopBtn = document.getElementById('stopBtn');

stopBtn.disabled = true;
nextRoundBtn.disabled = true;
showSolutionBtn.disabled = true;
highScoreText.textContent = `High Score: ${getHighScore()}`;

document.addEventListener('DOMContentLoaded', () => {
  const tileSize = 50, gap = 2;
  const containerWidth = (tileSize * params.gridWidth) + (gap * (params.gridWidth - 1));
  document.getElementById('boardContainer').style.width = `${containerWidth}px`;
});

// Audio Setup
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBlip(pathLength) {
  if (!soundEnabled) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 400 + (pathLength * 15);
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  oscillator.start();
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  oscillator.stop(audioCtx.currentTime + 0.20);
}

function playLoseSound() {
  if (!soundEnabled) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 50;
  oscillator.type = 'sawtooth';
  gainNode.gain.value = 0.05;
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.5);
}

// Combined warning sound function (different frequencies)
function playWarningSound(frequency) {
  if (!soundEnabled) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = frequency;
  oscillator.type = 'square';
  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  oscillator.start();
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
  oscillator.stop(audioCtx.currentTime + 0.25);
}

const toggleSoundBtn = document.getElementById('toggleSound');
let soundEnabled = true;
toggleSoundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  toggleSoundBtn.classList.toggle('active', soundEnabled);
});

// Utility Functions
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const deepCopy = (arr) => JSON.parse(JSON.stringify(arr));

// Winning Sequence Generation
function generateWinningSequence(requiredScore) {
  const { minTileValue, maxTileValue, maxSequenceAttempts, minPathLength, maxPathLength } = params;
  const mu = (minTileValue + maxTileValue) / 2;
  let desiredLength = Math.ceil(1.2 * Math.sqrt(requiredScore / mu));
  const minLen = Math.min(Math.max(minPathLength, desiredLength - 2), desiredLength + 2 - 1);
  const maxLen = Math.min(maxPathLength, desiredLength + 2);
  let attempts = 0;
  while (attempts < params.maxSequenceAttempts) {
    const length = randInt(minLen, maxLen);
    const seq = Array.from({ length }, () => randInt(minTileValue, maxTileValue)).sort((a, b) => a - b);
    const sum = seq.reduce((a, b) => a + b, 0);
    if (sum * length >= requiredScore) return { seq, length };
    attempts++;
  }
  console.log("Failed to generate a winning sequence.");
  return null;
}

// Winning Path Layout Generation
function generateWinningPathLayout(n) {
  const { gridHeight, gridWidth } = params;
  const getPattern = () => {
    const pattern = [];
    for (let i = 0; i < n - 1; i++) {
      pattern.push(i === 0 ? ((n - 1) % 2 === 0 ? 'horizontal' : 'vertical')
                           : (pattern[i - 1] === 'horizontal' ? 'vertical' : 'horizontal'));
    }
    return pattern;
  };

  for (let attempt = 0; attempt < params.maxPathAttempts; attempt++) {
    const pattern = getPattern();
    const startCol = randInt(0, gridWidth - 1);
    const path = [{ row: 0, col: startCol }];
    let valid = true;
    for (let i = 0; i < pattern.length; i++) {
      const current = path[path.length - 1];
      if (pattern[i] === 'horizontal') {
        const allowedCols = Array.from({ length: gridWidth }, (_, col) => col)
          .filter(col => col !== current.col && !path.some(t => t.row === current.row && t.col === col));
        if (!allowedCols.length) { valid = false; break; }
        path.push({ row: current.row, col: allowedCols[randInt(0, allowedCols.length - 1)] });
      } else {
        const allowedRows = Array.from({ length: gridHeight }, (_, row) => row)
          .filter(row => row !== current.row && (i === pattern.length - 1 ? true : row !== gridHeight - 1)
                          && !path.some(t => t.row === row && t.col === current.col));
        if (!allowedRows.length) { valid = false; break; }
        path.push({ row: allowedRows[randInt(0, allowedRows.length - 1)], col: current.col });
      }
    }
    if (valid && path[path.length - 1].row === gridHeight - 1) return path;
  }
  console.log("Failed to generate a winning path.");
  return null;
}

// Board Generation
function generateBoard(requiredScore) {
  state.board = Array.from({ length: params.gridHeight }, () => Array(params.gridWidth).fill(null));
  const seqResult = generateWinningSequence(requiredScore);
  if (!seqResult) {
    alert("Error generating board. Please try again later.");
    state.gameActive = false;
    return;
  }
  state.winningSequence = seqResult.seq;
  const pathLayout = generateWinningPathLayout(seqResult.length);
  if (!pathLayout) {
    alert("Error generating board. Please try again later.");
    state.gameActive = false;
    return;
  }
  state.winningPath = deepCopy(pathLayout);
  state.winningPath.forEach((tile, index) => {
    state.board[tile.row][tile.col] = state.winningSequence[index];
    tile.value = state.winningSequence[index];
  });
  for (let r = 0; r < params.gridHeight; r++) {
    for (let c = 0; c < params.gridWidth; c++) {
      if (state.board[r][c] === null) {
        state.board[r][c] = r === 0
          ? Math.min(randInt(params.minTileValue, params.maxTileValue), randInt(params.minTileValue, params.maxTileValue))
          : r === params.gridHeight - 1
          ? Math.max(randInt(params.minTileValue, params.maxTileValue), randInt(params.minTileValue, params.maxTileValue))
          : randInt(params.minTileValue, params.maxTileValue);
      }
    }
  }
}

// Rendering
function renderBoard() {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${params.gridWidth}, 50px)`;
  for (let r = 0; r < params.gridHeight; r++) {
    for (let c = 0; c < params.gridWidth; c++) {
      const tileEl = document.createElement('div');
      tileEl.className = 'tile' + (r === 0 ? ' tile-top' : '') + (r === params.gridHeight - 1 ? ' tile-bottom' : '');
      tileEl.dataset.row = r;
      tileEl.dataset.col = c;
      tileEl.textContent = state.board[r][c];
      if (state.selectedPath.some(t => t.row === r && t.col === c)) {
        tileEl.classList.add('selected');
      }
      boardEl.appendChild(tileEl);
    }
  }
  overlayEl.innerHTML = '';
}

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

// Game Moves
function getTileEl(row, col) {
  return document.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

function isLegalMove(row, col) {
  const tileValue = state.board[row][col];
  if (state.selectedPath.some(t => t.row === row && t.col === col)) return false;
  if (row === params.gridHeight - 1 && state.roundScore < params.minRoundScore) return false;
  if (!state.selectedPath.length) return row === 0;
  const lastTile = state.selectedPath[state.selectedPath.length - 1];
  if (tileValue < lastTile.value) return false;
  if (state.selectedPath.length === 1) return (row === lastTile.row || col === lastTile.col);
  const prevTile = state.selectedPath[state.selectedPath.length - 2];
  return prevTile.row === lastTile.row ? col === lastTile.col : row === lastTile.row;
}

function highlightLegalMoves() {
  document.querySelectorAll('.tile.legal').forEach(el => el.classList.remove('legal'));
  if (!state.gameActive) return;
  if (!state.selectedPath.length) {
    for (let c = 0; c < params.gridWidth; c++) {
      getTileEl(0, c)?.classList.add('legal');
    }
  } else {
    const lastTile = state.selectedPath[state.selectedPath.length - 1];
    let legalTiles = [];
    if (state.selectedPath.length === 1) {
      for (let c = 0; c < params.gridWidth; c++) {
        if (c !== lastTile.col) legalTiles.push({ row: lastTile.row, col: c });
      }
      for (let r = 0; r < params.gridHeight; r++) {
        if (r !== lastTile.row) legalTiles.push({ row: r, col: lastTile.col });
      }
    } else {
      const prevTile = state.selectedPath[state.selectedPath.length - 2];
      if (prevTile.row === lastTile.row) {
        for (let r = 0; r < params.gridHeight; r++) {
          if (r !== lastTile.row) legalTiles.push({ row: r, col: lastTile.col });
        }
      } else if (prevTile.col === lastTile.col) {
        for (let c = 0; c < params.gridWidth; c++) {
          if (c !== lastTile.col) legalTiles.push({ row: lastTile.row, col: c });
        }
      }
    }
    legalTiles = legalTiles.filter(tile => {
      if (tile.row === params.gridHeight - 1 && state.roundScore < params.minRoundScore) return false;
      return state.board[tile.row][tile.col] >= lastTile.value;
    });
    legalTiles.forEach(tile => getTileEl(tile.row, tile.col)?.classList.add('legal'));
    if (!legalTiles.length) endRound(false);
  }
}

function updateRoundScore() {
  const sum = state.selectedPath.reduce((acc, tile) => acc + tile.value, 0);
  state.roundScore = sum * state.selectedPath.length;
}

function handleTileClick(e) {
  if (!state.gameActive) return;
  const tileEl = e.currentTarget;
  if (!tileEl.classList.contains('legal')) return;
  const row = parseInt(tileEl.dataset.row), col = parseInt(tileEl.dataset.col);
  if (!isLegalMove(row, col)) return;
  const value = state.board[row][col];
  state.selectedPath.push({ row, col, value });
  playBlip(state.selectedPath.length);
  tileEl.classList.add('selected');
  updateRoundScore();
  updateTopInfo();
  if (row === params.gridHeight - 1) {
    if (state.roundScore >= params.minRoundScore) {
      endRound(true);
    } else {
      endRound(false);
      playLoseSound();
    }
    drawPath(state.selectedPath);
    return;
  }
  highlightLegalMoves();
}

function updateTopInfo() {
  document.getElementById('timer').textContent = "Time: " + formatTime(state.timeLeft);
  document.getElementById('topScore').textContent = `Score: ${state.roundScore}`;
  const pointsMissing = state.currentRequiredScore - state.roundScore;
  document.getElementById('topStatus').textContent = pointsMissing <= 0 ? "Breached!" : `Missing: ${pointsMissing}`;
}

function getHighScore() {
  return parseInt(localStorage.getItem('highScore')) || 0;
}

function updateHighScore() {
  const currentHigh = getHighScore();
  if (state.totalScore > currentHigh) {
    localStorage.setItem('highScore', state.totalScore);
    highScoreText.textContent = `High Score: ${state.totalScore}`;
  }
}

function updateDifficulty(roundNumber) {
  params.minRoundScore = Math.min(params.minRoundScore + params.requiredPointsIncrement, maxMinRoundScore);
  if (roundNumber > 1 && roundNumber % 4 === 1) {
    params.roundTime += 5;
    if (Math.floor((roundNumber - 1) / 4) % 2 === 0) {
      params.gridHeight += 1;
    }
  }
}

function resetDifficulty() {
  params.minRoundScore = initialMinRoundScore;
  params.roundTime = initialRoundTime;
  params.gridWidth = initialGridWidth;
  params.gridHeight = initialGridHeight;
}

function addGlitchEffect() {
  const boardContainer = document.querySelector('#boardContainer');
  boardContainer.classList.add('game-glitch');
  document.querySelectorAll('.tile').forEach(tile => {
    tile.setAttribute('data-number', tile.textContent);
    tile.classList.add('glitch');
  });
  setTimeout(() => {
    boardContainer.classList.remove('game-glitch');
    document.querySelectorAll('.tile').forEach(tile => tile.classList.remove('glitch'));
  }, 1200);
}

function removeGlitchEffect() {
  const boardContainer = document.querySelector('#boardContainer');
  boardContainer.classList.remove('game-glitch', 'glitch-active');
  document.querySelectorAll('.tile').forEach(tile => tile.classList.remove('glitch'));
}

function endRound(win) {
  state.gameActive = false;
  clearInterval(state.timerInterval);
  document.querySelectorAll('.tile.legal').forEach(el => el.classList.remove('legal'));
  stopBtn.disabled = true;
  if (win) {
    state.totalScore += state.roundScore;
    document.getElementById('messageLine').textContent = "Your breach was successful!";
    document.getElementById('messageLine').className = "info-line win";
    updateHistory(state.roundNumber, state.currentRequiredScore, state.roundScore, state.totalScore);
    state.roundNumber++;
    updateDifficulty(state.roundNumber);
    nextRoundBtn.disabled = false;
    showSolutionBtn.disabled = true;
  } else {
    document.getElementById('messageLine').textContent = "You have been caught!";
    document.getElementById('messageLine').className = "info-line lose";
    updateHistory(state.roundNumber, state.currentRequiredScore, state.roundScore, state.totalScore);
    nextRoundBtn.disabled = true;
    showSolutionBtn.disabled = false;
    state.gameOver = true;
    addGlitchEffect();
    playLoseSound();
  }
  updateHighScore();
  updateTopInfo();
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes < 10 ? "0" : ""}${minutes}:${secs < 10 ? "0" : ""}${secs}`;
}

function startTimer() {
  state.timeLeft = params.roundTime;
  timerEl.textContent = "Time: " + formatTime(state.timeLeft);
  let warning10Played = false;
  const timerDefaultColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--timer-default-color').trim();
  timerEl.style.color = timerDefaultColor;
  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    timerEl.textContent = "Time: " + formatTime(state.timeLeft);
    if (state.timeLeft <= 10 && state.timeLeft > 0) timerEl.style.color = "red";
    if (state.timeLeft === 10 && !warning10Played) {
      playWarningSound(600);
      warning10Played = true;
    }
    if (state.timeLeft <= 5 && state.timeLeft > 0) playWarningSound(750);
    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      endRound(false);
      drawPath(state.selectedPath);
    }
  }, 1000);
}

function revealWinningPath() {
  state.winningPath.forEach(tile => getTileEl(tile.row, tile.col)?.classList.add('solution'));
  drawPath(state.winningPath);
  showSolutionBtn.disabled = true;
}

// Tooltip for Score Preview
let tooltipTimeout;
function showTooltipForTile(tileEl) {
  const tileValue = parseInt(tileEl.textContent);
  const currentSum = state.selectedPath.reduce((acc, tile) => acc + tile.value, 0);
  const newCount = state.selectedPath.length + 1;
  const potentialScore = (currentSum + tileValue) * newCount;
  const rect = tileEl.getBoundingClientRect();
  const tooltip = document.getElementById('tooltip');
  tooltip.textContent = `${potentialScore}`;
  tooltip.style.left = rect.left + (rect.width / 2) + 'px';
  tooltip.style.top = (rect.top - 10) + 'px';
  tooltip.style.display = 'block';
  setTimeout(() => { tooltip.style.opacity = '1'; }, 500);
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  tooltip.style.opacity = '0';
  setTimeout(() => { tooltip.style.display = 'none'; }, 200);
}

boardEl.addEventListener('mouseover', (e) => {
  const tileEl = e.target.closest('.tile.legal');
  if (tileEl) tooltipTimeout = setTimeout(() => showTooltipForTile(tileEl), 500);
});
boardEl.addEventListener('mouseout', () => {
  clearTimeout(tooltipTimeout);
  hideTooltip();
});

// Game Initialization
async function startRound() {
  state.currentRequiredScore = params.minRoundScore;
  state.selectedPath = [];
  state.roundScore = 0;
  const messageLine = document.getElementById('messageLine');
  if (messageLine) messageLine.textContent = "";
  state.gameActive = true;
  nextRoundBtn.disabled = true;
  showSolutionBtn.disabled = true;
  stopBtn.disabled = false;
  generateBoard(state.currentRequiredScore);
  renderBoard();
  document.querySelectorAll('.tile').forEach(tileEl => tileEl.addEventListener('click', handleTileClick));
  await revealTiles(document.getElementById('board'), 15);
  highlightLegalMoves();
  updateTopInfo();
  startTimer();
}

function restartGame() {
  clearInterval(state.timerInterval);
  state.totalScore = 0;
  params.minRoundScore = initialMinRoundScore;
  state.roundNumber = 1;
  document.querySelector('#historyTable tbody').innerHTML = "";
  removeGlitchEffect();
  state.gameOver = false;
  highScoreText.textContent = `High Score: ${getHighScore()}`;
  resetDifficulty();
  startRound();
}

function revealTiles(board, delay = 20) {
  const tiles = board.querySelectorAll('.tile');
  tiles.forEach(tile => {
    tile.style.transform = 'rotateY(90deg)';
    tile.style.opacity = '0';
  });
  tiles.forEach((tile, index) => {
    setTimeout(() => {
      tile.style.transition = 'transform 0.1s ease, opacity 0.1s ease';
      tile.style.transform = 'rotateY(0deg)';
      tile.style.opacity = '1';
      setTimeout(() => { tile.style.transition = ''; }, 300);
    }, index * delay);
  });
  return new Promise(resolve => setTimeout(resolve, tiles.length * delay + 300));
}

function updateHistory(round, minScore, achieved, cumulative) {
  const tbody = document.querySelector('#historyTable tbody');
  const tr = document.createElement('tr');
  if (achieved < minScore) tr.classList.add('fail');
  tr.innerHTML = `<td>${round}</td><td>${minScore}</td><td>${achieved}</td><td>${cumulative}</td>`;
  tbody.appendChild(tr);
}

// Button Event Listeners
newGameBtn.addEventListener('click', () => {
  if ((state.gameActive || !state.gameOver) && (state.selectedPath.length > 0 || state.roundNumber > 1)) {
    if (!confirm("You will lose your current progress. Continue?")) return;
  }
  restartGame();
});

stopBtn.addEventListener('click', () => {
  if ((state.gameActive || !state.gameOver) && (state.selectedPath.length > 0 || state.roundNumber > 1)) {
    if (!confirm("You will lose your current progress. Continue?")) return;
  }
  clearInterval(state.timerInterval);
  state.gameActive = false;
  boardEl.innerHTML = "";
  overlayEl.innerHTML = "";
  nextRoundBtn.disabled = true;
  showSolutionBtn.disabled = true;
  stopBtn.disabled = true;
});

nextRoundBtn.addEventListener('click', startRound);
showSolutionBtn.addEventListener('click', revealWinningPath);
helpBtn.addEventListener('click', () => { helpModal.style.display = 'block'; });
closeHelpBtn.addEventListener('click', () => { helpModal.style.display = 'none'; });
window.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.style.display = 'none'; });
