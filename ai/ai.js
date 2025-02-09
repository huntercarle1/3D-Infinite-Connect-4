// ai/ai.js
// A basic minimax AI for 3D Infinite Connect 4 with alpha-beta pruning,
// with an evaluation function that considers full 3D connectivity.
// The evaluation function can be parameterized by a genotype (if provided)
// and defaults to equal weights otherwise.

// --- Helper functions for state cloning and simulation ---

// Deep-clone the state.
function cloneState(state) {
    return {
      moves: JSON.parse(JSON.stringify(state.moves)),
      cellHeights: { ...state.cellHeights }
    };
  }
  
  // Returns the next available z coordinate for a given (x, y) in the state.
  function getNextZFromState(state, x, y) {
    const key = `${x},${y}`;
    return state.cellHeights[key] || 0;
  }
  
  // Simulate making a move on the state for a given player.
  function makeMove(state, move, player) {
    const z = getNextZFromState(state, move.x, move.y);
    state.moves.push({ x: move.x, y: move.y, z: z, player: player });
    const key = `${move.x},${move.y}`;
    state.cellHeights[key] = (state.cellHeights[key] || 0) + 1;
  }
  
  // --- Candidate Move Generation ---
  // This function scans a region defined by the board boundaries (expanded by one cell)
  // and returns all candidate moves in the x–y plane (with z computed via gravity).
  function getValidMoves(state, boardState) {
    let moves = [];
    for (let x = boardState.minX - 1; x <= boardState.maxX + 1; x++) {
      for (let y = boardState.minY - 1; y <= boardState.maxY + 1; y++) {
        if (state.moves.length === 0) {
          if (x === 0 && y === 0) {
            moves.push({ x, y, z: 0 });
          }
        } else {
          let valid = false;
          for (const m of state.moves) {
            if (Math.abs(m.x - x) + Math.abs(m.y - y) === 1) {
              valid = true;
              break;
            }
          }
          if (valid) {
            moves.push({ x, y, z: getNextZFromState(state, x, y) });
          }
        }
      }
    }
    return moves;
  }
  
  // --- Evaluation Function ---
  // We check connectivity in full 3D.
  // The directions are grouped as follows:
  //   - Group A ("plane"): (1,0,0), (0,1,0), (1,1,0), (1,-1,0) – weight: genotype.w_plane
  //   - Group B (vertical): (0,0,1) – weight: genotype.w_vertical
  //   - Group C ("3D minor diagonals"): (1,0,1) and (0,1,1) – weight: genotype.w_3d_a
  //   - Group D ("3D major diagonals"): (1,1,1) and (1,-1,1) – weight: genotype.w_3d_b
  // If no genotype is provided, all weights default to 1.
  function evaluateStateGenotype(state, genotype, aiPlayer, winLength) {
    let score = 0;
    const boardMap = {};
    for (const m of state.moves) {
      const key = `${m.x},${m.y},${m.z}`;
      boardMap[key] = m.player;
    }
    
    const directions = [
      { dx: 1, dy: 0, dz: 0, weightKey: "w_plane" },
      { dx: 0, dy: 1, dz: 0, weightKey: "w_plane" },
      { dx: 1, dy: 1, dz: 0, weightKey: "w_plane" },
      { dx: 1, dy: -1, dz: 0, weightKey: "w_plane" },
      { dx: 0, dy: 0, dz: 1, weightKey: "w_vertical" },
      { dx: 1, dy: 0, dz: 1, weightKey: "w_3d_a" },
      { dx: 0, dy: 1, dz: 1, weightKey: "w_3d_a" },
      { dx: 1, dy: 1, dz: 1, weightKey: "w_3d_b" },
      { dx: 1, dy: -1, dz: 1, weightKey: "w_3d_b" }
    ];
    
    for (const m of state.moves) {
      for (const d of directions) {
        let count = 1;
        for (let i = 1; i < winLength; i++) {
          const key = `${m.x + i * d.dx},${m.y + i * d.dy},${m.z + i * d.dz}`;
          if (boardMap[key] === m.player) {
            count++;
          } else {
            break;
          }
        }
        for (let i = 1; i < winLength; i++) {
          const key = `${m.x - i * d.dx},${m.y - i * d.dy},${m.z - i * d.dz}`;
          if (boardMap[key] === m.player) {
            count++;
          } else {
            break;
          }
        }
        let weight = genotype && genotype[d.weightKey] !== undefined ? genotype[d.weightKey] : 1;
        if (m.player === aiPlayer) {
          score += weight * (count * count);
        } else {
          score -= weight * (count * count);
        }
      }
    }
    return score;
  }
  
  // --- Minimax with Alpha-Beta Pruning ---
  // For performance, we use a search depth of 2.
  function minimax(state, boardState, depth, maximizingPlayer, aiPlayer, winLength, genotype, alpha, beta) {
    if (depth === 0) {
      return { score: evaluateStateGenotype(state, genotype, aiPlayer, winLength), move: null };
    }
    const moves = getValidMoves(state, boardState);
    if (moves.length === 0) {
      return { score: 0, move: null };
    }
    let bestMove = null;
    if (maximizingPlayer) {
      let maxEval = -Infinity;
      for (const move of moves) {
        const newState = cloneState(state);
        makeMove(newState, move, aiPlayer);
        const z = getNextZFromState(state, move.x, move.y);
        // Use typeof self.checkWin so that in a worker environment we avoid "window is not defined".
        if (typeof self.checkWin !== "undefined" && self.checkWin(move.x, move.y, z, aiPlayer, winLength)) {
          return { score: 10000, move: move };
        }
        const result = minimax(newState, boardState, depth - 1, false, aiPlayer, winLength, genotype, alpha, beta);
        if (result.score > maxEval) {
          maxEval = result.score;
          bestMove = move;
        }
        alpha = Math.max(alpha, result.score);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove };
    } else {
      let minEval = Infinity;
      const opponent = (aiPlayer === 1) ? 2 : 1;
      for (const move of moves) {
        const newState = cloneState(state);
        makeMove(newState, move, opponent);
        const z = getNextZFromState(state, move.x, move.y);
        if (typeof self.checkWin !== "undefined" && self.checkWin(move.x, move.y, z, opponent, winLength)) {
          return { score: -10000, move: move };
        }
        const result = minimax(newState, boardState, depth - 1, true, aiPlayer, winLength, genotype, alpha, beta);
        if (result.score < minEval) {
          minEval = result.score;
          bestMove = move;
        }
        beta = Math.min(beta, result.score);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove };
    }
  }
  
  //
  // --- Exported AI Move Function ---
  // This function accepts the game state (as a JSON string) and an optional genotype,
  // and returns a move string in the format "x#,y#,z#".
  export function getAIMove(gameStateText, genotype = null) {
    let state;
    try {
      state = JSON.parse(gameStateText);
    } catch (e) {
      console.error("Invalid game state:", e);
      return null;
    }
    if (state.moves.length === 0) {
      return "x0,y0,z0";
    }
    const boardState = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, cellSize: 1 };
    state.moves.forEach(m => {
      if (m.x < boardState.minX) boardState.minX = m.x;
      if (m.x > boardState.maxX) boardState.maxX = m.x;
      if (m.y < boardState.minY) boardState.minY = m.y;
      if (m.y > boardState.maxY) boardState.maxY = m.y;
    });
    boardState.minX--;
    boardState.maxX++;
    boardState.minY--;
    boardState.maxY++;
    
    const effectiveWinLength = state.winLength || 4;
    const aiPlayer = (state.moves.length % 2) + 1;
    
    const result = minimax(state, boardState, 2, true, aiPlayer, effectiveWinLength, genotype, -Infinity, Infinity);
    if (result.move) {
      return `x${result.move.x},y${result.move.y},z${result.move.z}`;
    } else {
      const moves = getValidMoves(state, boardState);
      if (moves.length > 0) {
        const m = moves[Math.floor(Math.random() * moves.length)];
        return `x${m.x},y${m.y},z${m.z}`;
      }
      return null;
    }
  }
  