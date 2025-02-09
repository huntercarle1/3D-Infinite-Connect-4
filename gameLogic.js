// gameLogic.js

// Attach the game state to the global window object.
window.gameState = {
  moves: [],       // Array of move objects: { x, y, z, player }
  cellHeights: {}  // Mapping of "x,y" to the number of pieces in that cell.
};

function getNextZ(x, y) {
  const key = `${x},${y}`;
  const z = window.gameState.cellHeights[key] || 0;
  // Debug log:
  console.log(`getNextZ: For (${x},${y}), returning ${z}`);
  return z;
}
window.getNextZ = getNextZ;

function incrementCellHeight(x, y) {
  const key = `${x},${y}`;
  window.gameState.cellHeights[key] = (window.gameState.cellHeights[key] || 0) + 1;
  console.log(`incrementCellHeight: (${x},${y}) is now ${window.gameState.cellHeights[key]}`);
}
window.incrementCellHeight = incrementCellHeight;

function addMove(x, y, z, player) {
  window.gameState.moves.push({ x, y, z, player });
  console.log(`addMove: Added move (${x},${y},${z}) for player ${player}`);
}
window.addMove = addMove;

function isValidMove(x, y) {
  if (window.gameState.moves.length === 0) {
    return x === 0 && y === 0;
  }
  if (getNextZ(x, y) > 0) {
    return true;
  }
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const move of window.gameState.moves) {
    for (const [dx, dy] of directions) {
      if (move.x === x + dx && move.y === y + dy) {
        return true;
      }
    }
  }
  return false;
}
window.isValidMove = isValidMove;

// Optional: Simple win-checking (for future use)
function cellBelongsToPlayer(x, y, z, player) {
  return window.gameState.moves.some(move =>
    move.x === x && move.y === y && move.z === z && move.player === player
  );
}
window.cellBelongsToPlayer = cellBelongsToPlayer;

function checkWin(x, y, z, player, winLength) {
  const directions = [
    { dx: 1, dy: 0, dz: 0 },
    { dx: 0, dy: 1, dz: 0 },
    { dx: 0, dy: 0, dz: 1 },
    { dx: 1, dy: 1, dz: 0 },
    { dx: 1, dy: -1, dz: 0 },
    { dx: 1, dy: 0, dz: 1 },
    { dx: 1, dy: 0, dz: -1 },
    { dx: 0, dy: 1, dz: 1 },
    { dx: 0, dy: 1, dz: -1 },
    { dx: 1, dy: 1, dz: 1 },
    { dx: 1, dy: 1, dz: -1 },
    { dx: 1, dy: -1, dz: 1 },
    { dx: 1, dy: -1, dz: -1 }
  ];
  for (const { dx, dy, dz } of directions) {
    let count = 1;
    let coords = [{ x, y, z }];
    for (let n = 1; n < winLength; n++) {
      if (cellBelongsToPlayer(x + n * dx, y + n * dy, z + n * dz, player)) {
        count++;
        coords.push({ x: x + n * dx, y: y + n * dy, z: z + n * dz });
      } else {
        break;
      }
    }
    for (let n = 1; n < winLength; n++) {
      if (cellBelongsToPlayer(x - n * dx, y - n * dy, z - n * dz, player)) {
        count++;
        coords.push({ x: x - n * dx, y: y - n * dy, z: z - n * dz });
      } else {
        break;
      }
    }
    if (count >= winLength) return coords;
  }
  return null;
}
window.checkWin = checkWin;
