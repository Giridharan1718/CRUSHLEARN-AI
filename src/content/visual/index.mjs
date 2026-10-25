import compilerPipeline from './compilerPipeline.mjs';
import electricityCircuit from './electricityCircuit.mjs';
import refrigeratorCooling from './refrigeratorCooling.mjs';
import startupRevenue from './startupRevenue.mjs';

// Authored explanations are data only. The visual engine validates them before
// they reach a renderer.
export const visualExplanations = Object.freeze([
  electricityCircuit,
  compilerPipeline,
  startupRevenue,
  refrigeratorCooling,
]);

export default visualExplanations;
