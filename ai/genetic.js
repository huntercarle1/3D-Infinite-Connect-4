// ai/genetic.js
import { getAIMove } from "./ai.js";

// --- Genotype Representation ---
// Each individual is represented by four weights.
function randomGenotype() {
  return {
    w_plane: Math.random() + 0.5,    // random value in [0.5, 1.5)
    w_vertical: Math.random() + 0.5,
    w_3d_a: Math.random() + 0.5,
    w_3d_b: Math.random() + 0.5
  };
}

// --- Simulation of a Game ---
// This function simulates a game between two individuals (genotypes).
// For simplicity, we simulate moves up to a maximum count and use a win-length of 4.
function simulateGame(genotype1, genotype2) {
  // State representation for the simulation.
  let state = { moves: [], cellHeights: {} };
  // Define a small board region.
  const boardState = { minX: -3, maxX: 3, minY: -3, maxY: 3, cellSize: 1 };
  let currentPlayer = 1;
  const maxMoves = 20;
  for (let moveCount = 0; moveCount < maxMoves; moveCount++) {
    // Select the appropriate genotype.
    const genotype = (currentPlayer === 1) ? genotype1 : genotype2;
    // Get AI move using the genotype.
    const moveText = getAIMove(JSON.stringify(state), genotype);
    if (!moveText) break;
    // Parse moveText.
    const parts = moveText.split(",");
    const x = parseInt(parts[0].replace("x", ""));
    const y = parseInt(parts[1].replace("y", ""));
    const z = parseInt(parts[2].replace("z", ""));
    state.moves.push({ x, y, z, player: currentPlayer });
    const key = `${x},${y}`;
    state.cellHeights[key] = (state.cellHeights[key] || 0) + 1;
    // Check win condition using window.checkWin if available.
    if (window.checkWin && window.checkWin(x, y, z, currentPlayer, 4)) {
      return (currentPlayer === 1) ? 1 : -1;
    }
    currentPlayer = (currentPlayer === 1) ? 2 : 1;
  }
  return 0; // draw
}

// --- Fitness Evaluation ---
// Run a round-robin tournament among individuals.
function evaluatePopulation(population, gamesPerPair = 3) {
  const fitness = new Array(population.length).fill(0);
  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      let score1 = 0;
      for (let g = 0; g < gamesPerPair; g++) {
        const result = simulateGame(population[i], population[j]);
        if (result === 1) score1++;
        else if (result === -1) score1--;
      }
      fitness[i] += score1;
      fitness[j] -= score1;
    }
  }
  return fitness;
}

// --- Tournament Selection ---
function tournamentSelection(population, fitness, tournamentSize = 3) {
  const selected = [];
  for (let i = 0; i < population.length; i++) {
    let best = null;
    for (let j = 0; j < tournamentSize; j++) {
      const idx = Math.floor(Math.random() * population.length);
      if (best === null || fitness[idx] > fitness[best]) {
        best = idx;
      }
    }
    selected.push(population[best]);
  }
  return selected;
}

// --- Crossover ---
// Create an offspring by averaging the parents’ weights.
function crossover(parent1, parent2) {
  return {
    w_plane: (parent1.w_plane + parent2.w_plane) / 2,
    w_vertical: (parent1.w_vertical + parent2.w_vertical) / 2,
    w_3d_a: (parent1.w_3d_a + parent2.w_3d_a) / 2,
    w_3d_b: (parent1.w_3d_b + parent2.w_3d_b) / 2
  };
}

// --- Mutation ---
// Randomly perturb each weight by a small amount.
function mutate(individual, mutationRate = 0.1) {
  const newInd = { ...individual };
  for (const key in newInd) {
    if (Math.random() < mutationRate) {
      newInd[key] += (Math.random() * 0.5 - 0.25); // perturb by ±0.25
    }
  }
  return newInd;
}

// --- Genetic Algorithm ---
// Runs the genetic algorithm for a given number of generations.
export function runGeneticAlgorithm(generations = 10, populationSize = 20) {
  let population = [];
  for (let i = 0; i < populationSize; i++) {
    population.push(randomGenotype());
  }
  let bestIndividual = null;
  for (let gen = 0; gen < generations; gen++) {
    console.log(`Generation ${gen}`);
    const fitness = evaluatePopulation(population);
    // Find the best individual.
    let bestFitness = -Infinity;
    for (let i = 0; i < population.length; i++) {
      if (fitness[i] > bestFitness) {
        bestFitness = fitness[i];
        bestIndividual = population[i];
      }
    }
    console.log("Best fitness:", bestFitness, "Best individual:", bestIndividual);
    // Selection.
    const selected = tournamentSelection(population, fitness);
    // Create new population via crossover and mutation.
    const newPopulation = [];
    for (let i = 0; i < populationSize; i += 2) {
      const parent1 = selected[i];
      const parent2 = selected[(i + 1) % populationSize];
      let child1 = crossover(parent1, parent2);
      let child2 = crossover(parent2, parent1);
      child1 = mutate(child1);
      child2 = mutate(child2);
      newPopulation.push(child1, child2);
    }
    population = newPopulation.slice(0, populationSize);
  }
  console.log("Final Best Individual:", bestIndividual);
  return bestIndividual;
}
