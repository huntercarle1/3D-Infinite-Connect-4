// main.js
import { getAIMove } from "./ai/ai.js"; // (May still be used for non-worker calls, if needed.)

document.addEventListener("DOMContentLoaded", () => {
  // Ensure Three.js uses z-up.
  THREE.Object3D.DefaultUp.set(0, 0, 1);

  // Retrieve global game state and helper functions from gameLogic.js
  const gameState = window.gameState;
  const isValidMove = window.isValidMove;
  const addMove = window.addMove;
  const incrementCellHeight = window.incrementCellHeight;
  const getNextZ = window.getNextZ;
  const checkWin = window.checkWin; // win detection

  let scene, camera, renderer;
  let boardGroup, gridGroup;
  const isometricContainer = document.getElementById("isometric-view");
  if (!isometricContainer) {
    console.error("Element with ID 'isometric-view' not found.");
  }

  // Game settings and state variables
  let currentPlayer = 1;
  let numPlayers = 2;
  let winLength = 4;
  let rotationAngle = Math.PI / 4;
  let tiltAngle = Math.PI / 4;
  let currentSlice = { axis: "x", value: 0 }; // default to plane x0
  let highlightedColumn = 0;
  const panOffset = new THREE.Vector2(0, 0);

  let hoveredX = null, hoveredY = null;
  let boardState = { minX: -1, maxX: 1, minY: -1, maxY: 1, cellSize: 1 };

  const fov = 60, near = 0.1, far = 1000;
  let horizontalSensitivity = 0.0004;
  let verticalSensitivity = 0.0004;
  let zoomFactor = 1;
  let joystickActive = false;

  const playerColors3D = [0xff0000, 0x6699ff, 0xffbf00, 0x9966cc];
  const playerColors2D = ["red", "#6699ff", "#ffbf00", "#9966cc"];
  let winningLineObject = null;

  if (/Mobi|Android/i.test(navigator.userAgent)) {
    document.body.classList.add("mobile");
    horizontalSensitivity = 0.0008;
    verticalSensitivity = 0.0008;
  }

  // Self-play variables
  let selfPlayMode = false;
  let selfPlayTimerID = null;

  // --- Create AI Worker ---
  // Create a new worker from the "ai/worker.js" file.
  const aiWorker = new Worker("ai/worker.js", { type: "module" });

  // --- Asynchronous AI Move Request ---
  function getAIMoveAsync(gameStateText, genotype = null) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        resolve(e.data.move);
        aiWorker.removeEventListener("message", handler);
      };
      aiWorker.addEventListener("message", handler);
      aiWorker.postMessage({ gameStateText, genotype });
    });
  }

  // --- Helper Functions ---
  function parseMove(moveText) {
    const parts = moveText.split(",");
    const x = parseInt(parts[0].replace("x", ""));
    const y = parseInt(parts[1].replace("y", ""));
    const z = parseInt(parts[2].replace("z", ""));
    return { x, y, z };
  }

  function formatMove(moveObj) {
    return `x${moveObj.x},y${moveObj.y},z${moveObj.z}`;
  }

  function cloneGameState(state) {
    return {
      moves: [...state.moves],
      cellHeights: { ...state.cellHeights }
    };
  }

  // --- Self-Play Functionality ---
  async function runSelfPlay() {
    if (!selfPlayMode) return;
    const gameStateText = JSON.stringify(gameState, null, 2);
    const delayInput = document.getElementById("self-play-delay");
    let delay = parseInt(delayInput.value);
    if (isNaN(delay) || delay < 10) delay = 1000;
    try {
      const moveText = await getAIMoveAsync(gameStateText, null);
      if (moveText) {
        const move = parseMove(moveText);
        const z = getNextZ(move.x, move.y); // correct stacking
        if (isValidMove(move.x, move.y)) {
          placePiece(move.x, move.y, z, currentPlayer);
          addMove(move.x, move.y, z, currentPlayer);
          incrementCellHeight(move.x, move.y);
          const winningCoords = checkWin(move.x, move.y, z, currentPlayer, winLength);
          if (winningCoords) {
            alert(`Player ${currentPlayer} wins!`);
            if (typeof window.onWin === "function") {
              window.onWin(winningCoords, currentPlayer);
            }
            selfPlayMode = false;
            return;
          }
          // Expand grid if at boundary.
          let expanded = false;
          if (move.x === boardState.maxX) { boardState.maxX++; boardState.minX = -boardState.maxX; expanded = true; }
          if (move.x === boardState.minX) { boardState.minX--; boardState.maxX = -boardState.minX; expanded = true; }
          if (move.y === boardState.maxY) { boardState.maxY++; boardState.minY = -boardState.maxY; expanded = true; }
          if (move.y === boardState.minY) { boardState.minY--; boardState.maxY = -boardState.minY; expanded = true; }
          if (expanded) {
            createGrid();
            animateCameraZoom(500);
          } else {
            updateCamera();
          }
          update2DSlice(currentSlice.axis, currentSlice.value);
          updateTurnIndicator();
          updateMoveHistory();
          currentPlayer = (currentPlayer % numPlayers) + 1;
        }
      }
    } catch (error) {
      console.error("Error in selfPlay:", error);
    }
    selfPlayTimerID = setTimeout(runSelfPlay, delay);
  }

  // New function for a single self-play move.
  async function stepSelfPlay() {
    const gameStateText = JSON.stringify(gameState, null, 2);
    try {
      const moveText = await getAIMoveAsync(gameStateText, null);
      if (moveText) {
        const move = parseMove(moveText);
        const z = getNextZ(move.x, move.y);
        if (isValidMove(move.x, move.y)) {
          placePiece(move.x, move.y, z, currentPlayer);
          addMove(move.x, move.y, z, currentPlayer);
          incrementCellHeight(move.x, move.y);
          const winningCoords = checkWin(move.x, move.y, z, currentPlayer, winLength);
          if (winningCoords) {
            alert(`Player ${currentPlayer} wins!`);
            if (typeof window.onWin === "function") {
              window.onWin(winningCoords, currentPlayer);
            }
            return;
          }
          let expanded = false;
          if (move.x === boardState.maxX) { boardState.maxX++; boardState.minX = -boardState.maxX; expanded = true; }
          if (move.x === boardState.minX) { boardState.minX--; boardState.maxX = -boardState.minX; expanded = true; }
          if (move.y === boardState.maxY) { boardState.maxY++; boardState.minY = -boardState.maxY; expanded = true; }
          if (move.y === boardState.minY) { boardState.minY--; boardState.maxY = -boardState.minY; expanded = true; }
          if (expanded) {
            createGrid();
            animateCameraZoom(500);
          } else {
            updateCamera();
          }
          update2DSlice(currentSlice.axis, currentSlice.value);
          updateTurnIndicator();
          updateMoveHistory();
          currentPlayer = (currentPlayer % numPlayers) + 1;
        }
      }
    } catch (error) {
      console.error("Error in stepSelfPlay:", error);
    }
  }

  // --- Event Listeners ---
  document.getElementById("save-move-history").addEventListener("click", saveMoveHistory);
  document.getElementById("load-move-history").addEventListener("click", () => {
    document.getElementById("load-input").click();
  });
  document.getElementById("load-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      loadMoveHistory(e.target.result);
    };
    reader.readAsText(file);
  });
  document.getElementById("start-game").addEventListener("click", function () {
    numPlayers = parseInt(document.getElementById("num-players").value);
    winLength = parseInt(document.getElementById("win-length").value);
    document.getElementById("overlay").style.display = "none";
    document.getElementById("turn-indicator").style.display = "flex";
    updateTurnIndicator();
    selectPlane("x", 0);
    if (document.body.classList.contains("mobile")) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.mozRequestFullScreen) {
        document.documentElement.mozRequestFullScreen();
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
      }
    }
  });
  document.getElementById("self-play-button").addEventListener("click", () => {
    selfPlayMode = !selfPlayMode;
    if (selfPlayMode) {
      runSelfPlay();
      document.getElementById("self-play-button").innerText = "Stop Self-Play";
    } else {
      clearTimeout(selfPlayTimerID);
      document.getElementById("self-play-button").innerText = "Start Self-Play";
    }
  });
  document.getElementById("self-play-step").addEventListener("click", () => {
    stepSelfPlay();
  });
  document.getElementById("plane-up").addEventListener("click", () => {
    if (currentSlice.axis !== null) {
      let newValue = currentSlice.value + 1;
      if (currentSlice.axis === "x") newValue = Math.min(newValue, boardState.maxX);
      else if (currentSlice.axis === "y") newValue = Math.min(newValue, boardState.maxY);
      selectPlane(currentSlice.axis, newValue);
    }
  });
  document.getElementById("plane-down").addEventListener("click", () => {
    if (currentSlice.axis !== null) {
      let newValue = currentSlice.value - 1;
      if (currentSlice.axis === "x") newValue = Math.max(newValue, boardState.minX);
      else if (currentSlice.axis === "y") newValue = Math.max(newValue, boardState.minY);
      selectPlane(currentSlice.axis, newValue);
    }
  });
  document.getElementById("toggle-move-history").addEventListener("click", () => {
    const moveHistory = document.getElementById("move-history");
    const toggleButton = document.getElementById("toggle-move-history");
    if (moveHistory.classList.contains("collapsed")) {
      moveHistory.classList.remove("collapsed");
      toggleButton.classList.remove("collapsed");
    } else {
      moveHistory.classList.add("collapsed");
      toggleButton.classList.add("collapsed");
    }
  });

  // --- 3D Scene Initialization ---
  function init3DScene() {
    scene = new THREE.Scene();
    boardGroup = new THREE.Group();
    scene.add(boardGroup);
    const aspect = isometricContainer.clientWidth / isometricContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.up.set(0, 0, 1);
    updateCamera();
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 2);
    scene.add(dirLight);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(isometricContainer.clientWidth, isometricContainer.clientHeight);
    isometricContainer.appendChild(renderer.domElement);
    createGrid();
    animate();
  }

  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }

  function updateCamera() {
    const boardWidth = (boardState.maxX - boardState.minX + 1) * boardState.cellSize;
    const boardHeight = (boardState.maxY - boardState.minY + 1) * boardState.cellSize;
    const margin = 1;
    const H = Math.max(boardWidth, boardHeight) / 2 + margin;
    let top = 0;
    gameState.moves.forEach((moveObj) => {
      const pieceTop = moveObj.z + 0.5;
      if (pieceTop > top) top = pieceTop;
    });
    const V = Math.max(top, margin);
    const R = Math.sqrt(H * H + V * V);
    const fovRad = THREE.MathUtils.degToRad(fov);
    const computedD = R / Math.sin(fovRad / 2);
    const d = computedD * zoomFactor;
    const verticalCenter = V / 2;
    const lookAtZ = verticalCenter - 0.2 * d;
    const target = new THREE.Vector3(0, 0, lookAtZ);
    const x = d * Math.cos(rotationAngle) * Math.cos(tiltAngle);
    const y = d * Math.sin(rotationAngle) * Math.cos(tiltAngle);
    const z = d * Math.sin(tiltAngle);
    camera.position.set(x, y, z);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    updateLabels();
  }

  function animateCameraZoom(duration = 500) {
    const currentPos = camera.position.clone();
    const currentD = currentPos.length();
    const boardWidth = (boardState.maxX - boardState.minX + 1) * boardState.cellSize;
    const boardHeight = (boardState.maxY - boardState.minY + 1) * boardState.cellSize;
    const margin = 1;
    const H = Math.max(boardWidth, boardHeight) / 2 + margin;
    let top = 0;
    gameState.moves.forEach((moveObj) => {
      const pieceTop = moveObj.z + 0.5;
      if (pieceTop > top) top = pieceTop;
    });
    const V = Math.max(top, margin);
    const R = Math.sqrt(H * H + V * V);
    const fovRad = THREE.MathUtils.degToRad(fov);
    const targetD = (R / Math.sin(fovRad / 2)) * zoomFactor;
    const startTime = performance.now();
    function animateZoom() {
      const now = performance.now();
      const t = Math.min((now - startTime) / duration, 1);
      const dInterp = currentD + t * (targetD - currentD);
      const x = dInterp * Math.cos(rotationAngle) * Math.cos(tiltAngle);
      const y = dInterp * Math.sin(rotationAngle) * Math.cos(tiltAngle);
      const z = dInterp * Math.sin(tiltAngle);
      camera.position.set(x, y, z);
      const verticalCenter = V / 2;
      const lookAtZ = verticalCenter - 0.2 * dInterp;
      camera.lookAt(new THREE.Vector3(0, 0, lookAtZ));
      camera.updateProjectionMatrix();
      updateLabels();
      if (t < 1) requestAnimationFrame(animateZoom);
    }
    animateZoom();
  }

  function createGrid() {
    if (gridGroup) boardGroup.remove(gridGroup);
    gridGroup = new THREE.Group();
    for (let x = boardState.minX; x <= boardState.maxX; x++) {
      for (let y = boardState.minY; y <= boardState.maxY; y++) {
        const geometry = new THREE.PlaneGeometry(boardState.cellSize, boardState.cellSize);
        let color = (x === 0 || y === 0) ? 0xcccccc : 0xffffff;
        const material = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
        const cell = new THREE.Mesh(geometry, material);
        cell.position.set(x * boardState.cellSize, y * boardState.cellSize, 0);
        cell.userData = { x: x, y: y };
        gridGroup.add(cell);
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
        const cellEdges = new THREE.LineSegments(edges, lineMaterial);
        cellEdges.position.set(0, 0, 0.01);
        cell.add(cellEdges);
      }
    }
    boardGroup.add(gridGroup);
    updateCamera();
    updateLabels();
  }

  function updateLabels() {
    document.querySelectorAll(".axis-label").forEach((label) => label.remove());
    for (let x = boardState.minX; x <= boardState.maxX; x++) {
      const worldPos = new THREE.Vector3(x * boardState.cellSize, boardState.minY - boardState.cellSize / 2, 0);
      const screenPos = worldToScreen(worldPos);
      const label = document.createElement("div");
      label.className = "axis-label";
      label.style.left = `${screenPos.x - 10}px`;
      label.style.top = `${screenPos.y}px`;
      label.style.background = "rgba(255,255,255,0.7)";
      label.style.padding = "2px";
      label.style.border = "1px solid #000";
      label.innerText = `x${x}`;
      label.dataset.axis = "x";
      label.dataset.value = x;
      label.addEventListener("click", () => {
        selectPlane("x", x);
      });
      label.addEventListener("mouseover", () => {
        if (!joystickActive) {
          hoveredX = Number(x);
          updateGridColors();
        }
      });
      label.addEventListener("mouseout", () => {
        if (!joystickActive) {
          hoveredX = null;
          updateGridColors();
        }
      });
      isometricContainer.appendChild(label);
    }
    for (let y = boardState.minY; y <= boardState.maxY; y++) {
      const worldPos = new THREE.Vector3(boardState.minX - boardState.cellSize / 2, y * boardState.cellSize, 0);
      const screenPos = worldToScreen(worldPos);
      const label = document.createElement("div");
      label.className = "axis-label";
      label.style.left = `${screenPos.x - 30}px`;
      label.style.top = `${screenPos.y - 10}px`;
      label.style.background = "rgba(255,255,255,0.7)";
      label.style.padding = "2px";
      label.style.border = "1px solid #000";
      label.innerText = `y${y}`;
      label.dataset.axis = "y";
      label.dataset.value = y;
      label.addEventListener("click", () => {
        selectPlane("y", y);
      });
      label.addEventListener("mouseover", () => {
        if (!joystickActive) {
          hoveredY = Number(y);
          updateGridColors();
        }
      });
      label.addEventListener("mouseout", () => {
        if (!joystickActive) {
          hoveredY = null;
          updateGridColors();
        }
      });
      isometricContainer.appendChild(label);
    }
  }

  function worldToScreen(pos) {
    const vector = pos.clone();
    vector.project(camera);
    vector.x = ((vector.x + 1) / 2) * isometricContainer.clientWidth;
    vector.y = ((-vector.y + 1) / 2) * isometricContainer.clientHeight;
    return vector;
  }

  function getCandidateMove() {
    if (gameState.moves.length === 0) return { x: 0, y: 0, z: 0 };
    let horMinVal = currentSlice.axis === "x" ? boardState.minY : boardState.minX;
    return currentSlice.axis === "x"
      ? {
          x: currentSlice.value,
          y: horMinVal + highlightedColumn,
          z: getNextZ(currentSlice.value, horMinVal + highlightedColumn),
        }
      : {
          x: horMinVal + highlightedColumn,
          y: currentSlice.value,
          z: getNextZ(horMinVal + highlightedColumn, currentSlice.value),
        };
  }

  function update3DHighlight() {
    const candidate = getCandidateMove();
    gridGroup.children.forEach((cell) => {
      if (
        (currentSlice.axis === "x" && cell.userData.x === currentSlice.value) ||
        (currentSlice.axis === "y" && cell.userData.y === currentSlice.value)
      ) {
        if (
          highlightedColumn !== null &&
          cell.userData.x === candidate.x &&
          cell.userData.y === candidate.y
        ) {
          cell.material.color.set(0x66cc66);
        } else {
          cell.material.color.set(0x90ee90);
        }
      }
    });
  }

  function selectPlane(axis, value) {
    currentSlice.axis = axis;
    currentSlice.value = value;
    updateGridColors();
    highlightedColumn = 0;
    update2DSlice(axis, value);
    updatePlaneControls();
  }

  function updatePlaneControls() {
    const sp = document.getElementById("selected-plane");
    sp.innerText =
      currentSlice.axis !== null && currentSlice.value !== null
        ? `Plane: ${currentSlice.axis} = ${currentSlice.value}`
        : "No plane selected";
  }

  function updateGridColors() {
    if (!gridGroup) return;
    gridGroup.children.forEach((cell) => {
      let isSelected =
        (currentSlice.axis === "x" && cell.userData.x === currentSlice.value) ||
        (currentSlice.axis === "y" && cell.userData.y === currentSlice.value);
      let isHovered =
        (hoveredX !== null && cell.userData.x === hoveredX) ||
        (hoveredY !== null && cell.userData.y === hoveredY);
      if (isSelected) cell.material.color.set(0x90ee90);
      else if (isHovered) cell.material.color.set(0xADD8E6);
      else
        cell.material.color.set(
          cell.userData.x === 0 || cell.userData.y === 0 ? 0xcccccc : 0xffffff
        );
    });
    update3DHighlight();
  }

  function initSliceView() {
    const sliceCanvas = document.getElementById("slice-canvas");
    sliceCanvas.addEventListener("mousemove", onSliceMouseMove);
    sliceCanvas.addEventListener("click", onSliceMouseClick);
    sliceCanvas.addEventListener("mouseleave", () => {
      highlightedColumn = 0;
      update2DSlice(currentSlice.axis, currentSlice.value);
      update3DHighlight();
    });
  }

  function update2DSlice(axis, value) {
    const canvas = document.getElementById("slice-canvas");
    const ctx = canvas.getContext("2d");
    const sliceContainer = document.getElementById("slice-view");
    canvas.width = sliceContainer.clientWidth;
    canvas.height = sliceContainer.clientHeight;
    let horMin, horMax;
    if (axis === "x") {
      horMin = boardState.minY;
      horMax = boardState.maxY;
    } else {
      horMin = boardState.minX;
      horMax = boardState.maxX;
    }
    let maxZ = 0;
    gameState.moves.forEach((move) => {
      if (move.z > maxZ) maxZ = move.z;
    });
    const verMin = 0,
      verMax = maxZ + 1;
    const numHorCells = horMax - horMin + 1;
    const numVerCells = verMax - verMin + 1;
    const cellWidth = canvas.width / numHorCells;
    const cellHeight = canvas.height / numVerCells;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    for (let i = 0; i <= numHorCells; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j <= numVerCells; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * cellHeight);
      ctx.lineTo(canvas.width, j * cellHeight);
      ctx.stroke();
    }
    let candidate;
    if (gameState.moves.length === 0) {
      candidate = { x: 0, y: 0, z: 0 };
      candidate =
        axis === "x"
          ? { x: 0, y: 0 - boardState.minY, z: 0 }
          : { x: 0 - boardState.minX, y: 0, z: 0 };
      highlightedColumn = axis === "x" ? candidate.y : candidate.x;
    } else {
      let horMinVal = axis === "x" ? boardState.minY : boardState.minX;
      candidate =
        axis === "x"
          ? {
              x: currentSlice.value,
              y: horMinVal + highlightedColumn,
              z: getNextZ(currentSlice.value, horMinVal + highlightedColumn),
            }
          : {
              x: horMinVal + highlightedColumn,
              y: currentSlice.value,
              z: getNextZ(horMinVal + highlightedColumn, currentSlice.value),
            };
    }
    const valid =
      gameState.moves.length === 0 ? true : isValidMove(candidate.x, candidate.y);
    ctx.fillStyle = valid
      ? "rgba(144,238,144,0.3)"
      : "rgba(255,0,0,0.3)";
    if (highlightedColumn !== null)
      ctx.fillRect(highlightedColumn * cellWidth, 0, cellWidth, canvas.height);
    gameState.moves.forEach((move) => {
      let hor;
      if (axis === "x" && move.x === currentSlice.value) hor = move.y;
      else if (axis === "y" && move.y === currentSlice.value) hor = move.x;
      else return;
      const ver = move.z;
      const i = hor - horMin;
      const j = ver - verMin;
      const centerX = i * cellWidth + cellWidth / 2;
      const centerY = canvas.height - (j * cellHeight + cellHeight / 2);
      const radius = Math.min(cellWidth, cellHeight) * 0.3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = playerColors2D[move.player - 1];
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "white";
      ctx.stroke();
    });
    ctx.fillStyle = "white";
    ctx.font = "24px sans-serif";
    for (let i = 0; i < numHorCells; i++) {
      const coord = horMin + i;
      ctx.fillText(coord, i * cellWidth + cellWidth / 2 - 12, canvas.height - 4);
    }
    for (let j = 0; j < numVerCells; j++) {
      const coord = verMin + j;
      ctx.fillText(
        coord,
        4,
        canvas.height - (j * cellHeight + cellHeight / 2) + 8
      );
    }
    update3DHighlight();
  }

  function onSliceMouseMove(event) {
    if (!currentSlice.axis) return;
    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    let numHorCells =
      currentSlice.axis === "x"
        ? boardState.maxY - boardState.minY + 1
        : boardState.maxX - boardState.minX + 1;
    const cellWidth = canvas.width / numHorCells;
    let column = Math.floor(mouseX / cellWidth);
    if (gameState.moves.length === 0) {
      const validColumn =
        currentSlice.axis === "x"
          ? 0 - boardState.minY
          : 0 - boardState.minX;
      column = validColumn;
    }
    if (column !== highlightedColumn) {
      highlightedColumn = column;
      update2DSlice(currentSlice.axis, currentSlice.value);
    }
  }

  function onSliceMouseClick(event) {
    if (!currentSlice.axis) return;
    const canvas = document.getElementById("slice-canvas");
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    let numHorCells =
      currentSlice.axis === "x"
        ? boardState.maxY - boardState.minY + 1
        : boardState.maxX - boardState.minX + 1;
    const cellWidth = canvas.width / numHorCells;
    let column = Math.floor(mouseX / cellWidth);
    let candidate;
    if (gameState.moves.length === 0) {
      candidate = { x: 0, y: 0, z: 0 };
      const validColumn =
        currentSlice.axis === "x"
          ? 0 - boardState.minY
          : 0 - boardState.minX;
      if (column !== validColumn) {
        console.log("Invalid move: first move must be at (0,0).");
        return;
      }
    } else {
      let horMin =
        currentSlice.axis === "x" ? boardState.minY : boardState.minX;
      candidate =
        currentSlice.axis === "x"
          ? {
              x: currentSlice.value,
              y: horMin + column,
              z: getNextZ(currentSlice.value, horMin + column),
            }
          : {
              x: horMin + highlightedColumn,
              y: currentSlice.value,
              z: getNextZ(horMin + highlightedColumn, currentSlice.value),
            };
    }
    console.log("Slice click candidate:", candidate);
    let z = getNextZ(candidate.x, candidate.y);
    if (!isValidMove(candidate.x, candidate.y)) {
      console.log("Invalid move from 2D slice for candidate:", candidate);
      return;
    }
    placePiece(candidate.x, candidate.y, z, currentPlayer);
    addMove(candidate.x, candidate.y, z, currentPlayer);
    incrementCellHeight(candidate.x, candidate.y);
    const winningCoords = checkWin(
      candidate.x,
      candidate.y,
      z,
      currentPlayer,
      winLength
    );
    if (winningCoords) {
      alert(`Player ${currentPlayer} wins!`);
      if (typeof window.onWin === "function") {
        window.onWin(winningCoords, currentPlayer);
      }
      return;
    }
    let expanded = false;
    if (candidate.x === boardState.maxX) {
      boardState.maxX++;
      boardState.minX = -boardState.maxX;
      expanded = true;
    }
    if (candidate.x === boardState.minX) {
      boardState.minX--;
      boardState.maxX = -boardState.minX;
      expanded = true;
    }
    if (candidate.y === boardState.maxY) {
      boardState.maxY++;
      boardState.minY = -boardState.maxY;
      expanded = true;
    }
    if (candidate.y === boardState.minY) {
      boardState.minY--;
      boardState.maxY = -boardState.minY;
      expanded = true;
    }
    if (expanded) {
      createGrid();
      animateCameraZoom(500);
    } else {
      updateCamera();
    }
    currentPlayer = (currentPlayer % numPlayers) + 1;
    update2DSlice(currentSlice.axis, currentSlice.value);
    updateTurnIndicator();
    updateMoveHistory();
  }

  function placePiece(x, y, z, player) {
    const pieceRadius = 0.4;
    const geometry = new THREE.SphereGeometry(pieceRadius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: playerColors3D[player - 1],
      roughness: 0.4,
      metalness: 0.1,
    });
    const piece = new THREE.Mesh(geometry, material);
    // Place piece at z + 0.5 so that pieces at z=0 are visible above the grid.
    piece.position.set(x * boardState.cellSize, y * boardState.cellSize, z + 0.5);
    boardGroup.add(piece);
  }

  function initJoystickControl() {
    const container = document.getElementById("joystick-container");
    const knob = document.getElementById("joystick-knob");
    joystickActive = false;
    let joystickDisplacement = { x: 0, y: 0 };
    const maxRadius = 40;
    container.addEventListener("mousedown", (e) => {
      joystickActive = true;
      document.body.style.cursor = "grabbing";
      updateJoystick(e);
      startJoystickLoop();
    });
    container.addEventListener("mousemove", (e) => {
      if (joystickActive) updateJoystick(e);
    });
    window.addEventListener("mouseup", () => {
      if (joystickActive) {
        joystickActive = false;
        resetJoystick();
        document.body.style.cursor = "default";
      }
    });
    container.addEventListener("touchstart", (e) => {
      e.preventDefault();
      joystickActive = true;
      updateJoystick(e.touches[0]);
      startJoystickLoop();
    });
    container.addEventListener("touchmove", (e) => {
      e.preventDefault();
      if (joystickActive) updateJoystick(e.touches[0]);
    });
    container.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (joystickActive) {
        joystickActive = false;
        resetJoystick();
      }
    });
    function updateJoystick(e) {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let clampedDx = dx,
        clampedDy = dy;
      if (dist > maxRadius) {
        const scale = maxRadius / dist;
        clampedDx *= scale;
        clampedDy *= scale;
      }
      joystickDisplacement.x = clampedDx;
      joystickDisplacement.y = clampedDy;
      knob.style.left = `${(rect.width - knob.offsetWidth) / 2 + clampedDx}px`;
      knob.style.top = `${(rect.height - knob.offsetHeight) / 2 + clampedDy}px`;
    }
    function resetJoystick() {
      knob.style.left = `${(container.clientWidth - knob.offsetWidth) / 2}px`;
      knob.style.top = `${(container.clientHeight - knob.offsetHeight) / 2}px`;
      joystickDisplacement.x = 0;
      joystickDisplacement.y = 0;
    }
    function startJoystickLoop() {
      function update() {
        if (joystickActive) {
          rotationAngle += joystickDisplacement.x * horizontalSensitivity;
          tiltAngle -= joystickDisplacement.y * verticalSensitivity;
          tiltAngle = Math.max(0.2, Math.min(tiltAngle, Math.PI / 2 - 0.1));
          updateCamera();
          requestAnimationFrame(update);
        }
      }
      update();
    }
  }

  function initZoomSlider() {
    const slider = document.getElementById("zoom-slider");
    slider.addEventListener("input", () => {
      zoomFactor = Number(slider.value);
      updateCamera();
    });
  }

  function updateTurnIndicator() {
    const turnText = document.getElementById("turn-text");
    const turnCircle = document.getElementById("turn-circle");
    turnText.textContent = `Player ${currentPlayer}'s turn`;
    turnCircle.style.backgroundColor =
      "#" + ("000000" + playerColors3D[currentPlayer - 1].toString(16)).slice(-6);
  }

  function updateMoveHistory() {
    const moveList = document.getElementById("move-history-list");
    const moveNum = gameState.moves.length;
    const move = gameState.moves[moveNum - 1];
    const li = document.createElement("li");
    li.className = "move-entry";
    const moveNumberSpan = document.createElement("span");
    moveNumberSpan.className = "move-number";
    moveNumberSpan.textContent = moveNum + ".";
    li.appendChild(moveNumberSpan);
    const circle = document.createElement("span");
    circle.className = "move-circle";
    circle.style.backgroundColor = playerColors2D[move.player - 1];
    li.appendChild(circle);
    const text = document.createElement("span");
    text.textContent = ` (${move.x}, ${move.y}, ${move.z})`;
    li.appendChild(text);
    moveList.appendChild(li);
    const moveHistoryContainer = document.getElementById("move-history-list-container");
    moveHistoryContainer.scrollTop = moveHistoryContainer.scrollHeight;
  }

  function drawWinningLine(winningCoords, player) {
    const first = winningCoords[0];
    const last = winningCoords[winningCoords.length - 1];
    const startPos = new THREE.Vector3(
      first.x * boardState.cellSize,
      first.y * boardState.cellSize,
      first.z + 0.5
    );
    const endPos = new THREE.Vector3(
      last.x * boardState.cellSize,
      last.y * boardState.cellSize,
      last.z + 0.5
    );
    const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const height = direction.length();
    const radius = 0.2;
    const radialSegments = 12;
    const geometry = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1, false);
    const material = new THREE.MeshPhongMaterial({ color: playerColors3D[player - 1], transparent: false });
    const cylinder = new THREE.Mesh(geometry, material);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, direction.clone().normalize());
    cylinder.applyQuaternion(quaternion);
    cylinder.position.copy(midPoint);
    if (winningLineObject) boardGroup.remove(winningLineObject);
    winningLineObject = cylinder;
    boardGroup.add(cylinder);
  }
  window.onWin = drawWinningLine;

  function saveMoveHistory() {
    const dataToSave = { moves: gameState.moves, boardState: boardState };
    const data = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const now = new Date();
    const day = ("0" + now.getDate()).slice(-2);
    const month = ("0" + (now.getMonth() + 1)).slice(-2);
    const year = now.getFullYear();
    const hours = ("0" + now.getHours()).slice(-2);
    const minutes = ("0" + now.getMinutes()).slice(-2);
    const seconds = ("0" + now.getSeconds()).slice(-2);
    const timestamp = `${day}-${month}-${year}-${hours}-${minutes}-${seconds}`;
    a.download = "moveHistory_" + timestamp + ".json";
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function loadMoveHistory(fileContent) {
    try {
      const data = JSON.parse(fileContent);
      const moves = data.moves;
      boardState = data.boardState;
      gameState.moves = [];
      gameState.cellHeights = {};
      while (boardGroup.children.length > 0) {
        boardGroup.remove(boardGroup.children[0]);
      }
      winningLineObject = null;
      for (let move of moves) {
        const key = `${move.x},${move.y}`;
        gameState.cellHeights[key] = (gameState.cellHeights[key] || 0) + 1;
        gameState.moves.push(move);
        placePiece(move.x, move.y, move.z, move.player);
        updateMoveHistory();
      }
      currentPlayer = (moves.length % numPlayers) + 1;
      updateTurnIndicator();
      createGrid();
    } catch (e) {
      alert("Error loading move history: " + e.message);
    }
  }

  function onWindowResize() {
    const containerWidth = isometricContainer.clientWidth;
    const containerHeight = isometricContainer.clientHeight;
    camera.aspect = containerWidth / containerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerWidth, containerHeight);
    const sliceContainer = document.getElementById("slice-view");
    const sliceCanvas = document.getElementById("slice-canvas");
    sliceCanvas.width = sliceContainer.clientWidth;
    sliceCanvas.height = sliceContainer.clientHeight;
    updateCamera();
    updateLabels();
  }

  window.addEventListener("resize", onWindowResize);

  // Initialize 3D scene, 2D slice view, joystick, and zoom slider.
  init3DScene();
  initSliceView();
  initJoystickControl();
  initZoomSlider();

  // --- End of Main Thread Code ---
});
