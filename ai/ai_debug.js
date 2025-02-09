// ai/ai_debug.js
import { AIGenome, getAIMove, downloadLog } from "./ai.js";

// Create a dummy game state for debugging. This game state is represented in text (JSON) form.
const dummyGameState = {
  moves: ["x0,y0,z0", "x1,y0,z0"],
  cellHeights: {
    "0,0": 1,
    "1,0": 1
  }
};
const gameStateText = JSON.stringify(dummyGameState, null, 2);

// Display the genome parameters.
document.getElementById("genome-info").innerHTML = `
  <h2>Genome Parameters</h2>
  <pre>${JSON.stringify(AIGenome, null, 2)}</pre>
`;

// Get the AI move using the dummy game state.
const aiMove = getAIMove(gameStateText);
document.getElementById("ai-move").innerHTML = `
  <h2>AI Chosen Move</h2>
  <pre>${aiMove}</pre>
`;

// Attach event handler for downloading the log.
document.getElementById("download-log").addEventListener("click", downloadLog);
