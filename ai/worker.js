// ai/worker.js
// This worker is used to perform AI calculations off the main thread.
// It imports the AI module (ai/ai.js) and listens for messages containing
// the game state text (and an optional genotype), then returns the computed move.

import { getAIMove } from "./ai.js";

self.onmessage = (event) => {
  const { gameStateText, genotype } = event.data;
  // Call the AI move function. It returns a move string, e.g. "x2,y-1,z1".
  const move = getAIMove(gameStateText, genotype);
  // Post the result back to the main thread.
  self.postMessage({ move });
};
