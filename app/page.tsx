
// pages/rl-playground.tsx or app/rl-playground/page.tsx (for App Router)
'use client' // Add this if using App Router

import React, { useState, useEffect, useCallback } from 'react';

// Type definitions
type Position = [number, number];
type Action = 'up' | 'down' | 'left' | 'right';
type CellType = '' | 'start' | 'gem' | 'skull';
type Grid = CellType[][];

interface QTableState {
  [stateKey: string]: {
    [action: string]: number;
  };
}

interface PathStep {
  position: Position;
  action: Action;
  reward: number;
}

interface SavedPath {
  id: string;
  name: string;
  steps: PathStep[];
  totalReward: number;
  timestamp: Date;
}

const GRID_SIZE: number = 5;
const ACTIONS: Action[] = ['up', 'down', 'left', 'right'];

const RLPlayground: React.FC = () => {
  // Q-Learning parameters
  const [alpha] = useState<number>(0.1);
  const [gamma] = useState<number>(0.9);
  const [epsilon, setEpsilon] = useState<number>(0.2);
  const epsilonDecay: number = 0.995;
  const minEpsilon: number = 0.01;

  // Game state
  const [grid, setGrid] = useState<Grid>([]);
  const [agentPos, setAgentPos] = useState<Position>([0, 0]);
  const [qTable, setQTable] = useState<QTableState>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  
  // Path tracking
  const [currentPath, setCurrentPath] = useState<PathStep[]>([]);
  const [optimalPath, setOptimalPath] = useState<Position[]>([]);
  const [savedPaths, setSavedPaths] = useState<SavedPath[]>([]);
  const [showOptimalPath, setShowOptimalPath] = useState<boolean>(false);
  
  // Statistics
  const [stepCount, setStepCount] = useState<number>(0);
  const [episodeCount, setEpisodeCount] = useState<number>(0);
  const [totalReward, setTotalReward] = useState<number>(0);
  const [bestEpisodeReward, setBestEpisodeReward] = useState<number>(-Infinity);

  // Initialize grid
  const initializeGrid = useCallback((): Grid => {
    const newGrid: Grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
    newGrid[0][0] = 'start';
    newGrid[4][4] = 'gem';
    newGrid[2][2] = 'skull';
    newGrid[1][3] = 'skull';
    newGrid[3][1] = 'skull';
    return newGrid;
  }, []);

  // Initialize on mount
  useEffect(() => {
    setGrid(initializeGrid());
  }, [initializeGrid]);

  const getStateKey = (pos: Position): string => `${pos[0]},${pos[1]}`;

  const getNextPosition = (pos: Position, action: Action): Position => {
    const [x, y] = pos;
    switch (action) {
      case 'up': return [Math.max(x - 1, 0), y];
      case 'down': return [Math.min(x + 1, GRID_SIZE - 1), y];
      case 'left': return [x, Math.max(y - 1, 0)];
      case 'right': return [x, Math.min(y + 1, GRID_SIZE - 1)];
      default: return pos;
    }
  };

  const getReward = (pos: Position): number => {
    if (grid.length === 0) return 0;
    const cellType: CellType = grid[pos[0]][pos[1]];
    if (cellType === 'gem') return 10;
    if (cellType === 'skull') return -10;
    return -0.1;
  };

  const isTerminalState = (pos: Position): boolean => {
    if (grid.length === 0) return false;
    const cellType: CellType = grid[pos[0]][pos[1]];
    return cellType === 'gem' || cellType === 'skull';
  };

  const chooseAction = (pos: Position, currentQTable: QTableState): Action => {
    const stateKey: string = getStateKey(pos);
    
    if (!currentQTable[stateKey]) {
      currentQTable[stateKey] = {};
      ACTIONS.forEach((action: Action) => {
        currentQTable[stateKey][action] = 0;
      });
    }

    if (Math.random() < epsilon) {
      return ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    } else {
      let maxQ: number = -Infinity;
      let bestAction: Action = ACTIONS[0];
      
      ACTIONS.forEach((action: Action) => {
        const q: number = currentQTable[stateKey][action] || 0;
        if (q > maxQ) {
          maxQ = q;
          bestAction = action;
        }
      });
      return bestAction;
    }
  };

  const calculateOptimalPath = useCallback((currentQTable: QTableState): Position[] => {
    const path: Position[] = [];
    let currentPos: Position = [0, 0];
    const maxSteps = 50; // Prevent infinite loops
    let steps = 0;

    while (!isTerminalState(currentPos) && steps < maxSteps) {
      path.push([...currentPos] as Position);
      const stateKey = getStateKey(currentPos);
      
      if (!currentQTable[stateKey]) break;
      
      let bestAction: Action = ACTIONS[0];
      let maxQ = -Infinity;
      
      ACTIONS.forEach((action: Action) => {
        const q = currentQTable[stateKey][action] || 0;
        if (q > maxQ) {
          maxQ = q;
          bestAction = action;
        }
      });
      
      currentPos = getNextPosition(currentPos, bestAction);
      steps++;
    }
    
    if (isTerminalState(currentPos)) {
      path.push([...currentPos] as Position);
    }
    
    return path;
  }, []);

  const saveCurrentPath = (): void => {
    if (currentPath.length === 0) return;
    
    const pathReward = currentPath.reduce((sum, step) => sum + step.reward, 0);
    const newPath: SavedPath = {
      id: Date.now().toString(),
      name: `Path ${savedPaths.length + 1}`,
      steps: [...currentPath],
      totalReward: pathReward,
      timestamp: new Date()
    };
    
    setSavedPaths(prev => [...prev, newPath]);
  };

  const step = useCallback((): void => {
    if (grid.length === 0) return;

    setQTable((currentQTable: QTableState) => {
      const newQTable: QTableState = { ...currentQTable };
      const currentState: Position = agentPos;
      const action: Action = chooseAction(currentState, newQTable);
      const nextState: Position = getNextPosition(currentState, action);
      const reward: number = getReward(nextState);

      // Add to current path
      setCurrentPath(prev => [...prev, {
        position: [...currentState] as Position,
        action,
        reward
      }]);

      // Q-Learning update
      const stateKey: string = getStateKey(currentState);
      const nextStateKey: string = getStateKey(nextState);

      if (!newQTable[stateKey]) {
        newQTable[stateKey] = {};
        ACTIONS.forEach((a: Action) => newQTable[stateKey][a] = 0);
      }
      if (!newQTable[nextStateKey]) {
        newQTable[nextStateKey] = {};
        ACTIONS.forEach((a: Action) => newQTable[nextStateKey][a] = 0);
      }

      const maxQNext: number = Math.max(...ACTIONS.map((a: Action) => newQTable[nextStateKey][a] || 0));
      const oldQ: number = newQTable[stateKey][action] || 0;
      const newQ: number = oldQ + alpha * (reward + gamma * maxQNext - oldQ);
      newQTable[stateKey][action] = newQ;

      setAgentPos(nextState);
      setStepCount((prev: number) => prev + 1);
      setTotalReward((prev: number) => prev + reward);

      if (isTerminalState(nextState)) {
        const episodeReward = currentPath.reduce((sum, step) => sum + step.reward, 0) + reward;
        
        if (episodeReward > bestEpisodeReward) {
          setBestEpisodeReward(episodeReward);
        }
        
        setEpisodeCount((prev: number) => prev + 1);
        setEpsilon((prev: number) => Math.max(prev * epsilonDecay, minEpsilon));
        
        // Update optimal path
        const newOptimalPath = calculateOptimalPath(newQTable);
        setOptimalPath(newOptimalPath);
        
        setTimeout(() => {
          setAgentPos([0, 0]);
          setCurrentPath([]);
        }, 500);
      }

      return newQTable;
    });
  }, [agentPos, grid, alpha, gamma, epsilon, currentPath, bestEpisodeReward, calculateOptimalPath]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(step, 300);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, step]);

  const toggleSimulation = (): void => {
    setIsRunning(!isRunning);
  };

  const reset = (): void => {
    setIsRunning(false);
    setAgentPos([0, 0]);
    setQTable({});
    setCurrentPath([]);
    setOptimalPath([]);
    setStepCount(0);
    setEpisodeCount(0);
    setTotalReward(0);
    setBestEpisodeReward(-Infinity);
    setEpsilon(0.2);
    setGrid(initializeGrid());
  };

  const showOptimalRoute = (): void => {
    if (Object.keys(qTable).length > 0) {
      const path = calculateOptimalPath(qTable);
      setOptimalPath(path);
      setShowOptimalPath(true);
    }
  };

  const isOnOptimalPath = (i: number, j: number): boolean => {
    if (!showOptimalPath) return false;
    return optimalPath.some(([x, y]) => x === i && y === j);
  };

  const getCellContent = (i: number, j: number): string => {
    if (i === agentPos[0] && j === agentPos[1]) return '🤖';
    const cellType: CellType = grid[i]?.[j];
    switch (cellType) {
      case 'gem': return '💎';
      case 'skull': return '☠️';
      case 'start': return '🏁';
      default: return '';
    }
  };

  const getCellClasses = (i: number, j: number): string => {
    const baseClasses: string = "w-20 h-20 rounded-lg flex items-center justify-center text-4xl transition-all duration-300 cursor-pointer hover:scale-105 relative";
    
    if (i === agentPos[0] && j === agentPos[1]) {
      return `${baseClasses} bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/30 animate-pulse scale-110`;
    }
    
    const cellType: CellType = grid[i]?.[j];
    const onOptimalPath = isOnOptimalPath(i, j);
    
    let typeClasses = "";
    switch (cellType) {
      case 'start':
        typeClasses = "bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-500/30";
        break;
      case 'gem':
        typeClasses = "bg-gradient-to-br from-green-400 to-green-600 shadow-lg shadow-green-500/30 animate-bounce";
        break;
      case 'skull':
        typeClasses = "bg-gradient-to-br from-red-400 to-red-600 shadow-lg shadow-red-500/30 animate-pulse";
        break;
      default:
        typeClasses = onOptimalPath 
          ? "bg-gradient-to-br from-yellow-200 to-yellow-300 border-2 border-yellow-500" 
          : "bg-gray-100 hover:bg-gray-200";
    }
    
    return `${baseClasses} ${typeClasses}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/95 backdrop-blur-lg rounded-3xl shadow-2xl p-6 md:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
              🧠 RL Playground with Path Learning
            </h1>
            <p className="text-lg text-gray-600 mb-6">
              Watch the AI agent learn optimal paths using Q-Learning!
            </p>
            
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <div className="flex items-center gap-2 bg-white/70 px-4 py-2 rounded-full text-sm">
                <span>🤖</span> Agent
              </div>
              <div className="flex items-center gap-2 bg-white/70 px-4 py-2 rounded-full text-sm">
                <span>💎</span> Goal (+10)
              </div>
              <div className="flex items-center gap-2 bg-white/70 px-4 py-2 rounded-full text-sm">
                <span>☠️</span> Danger (-10)
              </div>
              <div className="flex items-center gap-2 bg-white/70 px-4 py-2 rounded-full text-sm">
                <span>🏁</span> Start
              </div>
              <div className="flex items-center gap-2 bg-yellow-200 px-4 py-2 rounded-full text-sm">
                <div className="w-4 h-4 bg-yellow-300 border border-yellow-500 rounded"></div>
                Optimal Path
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Grid */}
            <div className="lg:col-span-2">
              <div className="flex justify-center mb-4">
                <div className="inline-grid grid-cols-5 gap-1 p-4 bg-gray-800 rounded-2xl shadow-xl">
                  {grid.map((row: CellType[], i: number) =>
                    row.map((cell: CellType, j: number) => (
                      <div
                        key={`${i}-${j}`}
                        className={getCellClasses(i, j)}
                      >
                        {getCellContent(i, j)}
                        {isOnOptimalPath(i, j) && !getCellContent(i, j) && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              {/* Controls */}
              <div className="flex flex-wrap justify-center gap-3">
                <button 
                  onClick={toggleSimulation}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-sm"
                >
                  {isRunning ? '⏸️ Pause' : '▶️ Start Learning'}
                </button>
                <button 
                  onClick={step}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-sm"
                >
                  ⏯️ Single Step
                </button>
                <button 
                  onClick={showOptimalRoute}
                  className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-sm"
                >
                  🗺️ Show Optimal Path
                </button>
                <button 
                  onClick={() => setShowOptimalPath(false)}
                  className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-sm"
                >
                  🚫 Hide Path
                </button>
                <button 
                  onClick={reset}
                  className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-sm"
                >
                  🔄 Reset
                </button>
              </div>
            </div>

            {/* Side Panel */}
            <div className="space-y-6">
              {/* Statistics */}
              <div className="bg-white rounded-xl p-4 shadow-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-blue-600 mb-1">Steps</div>
                    <div className="text-xl font-bold text-blue-800">{stepCount}</div>
                  </div>
                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-green-600 mb-1">Episodes</div>
                    <div className="text-xl font-bold text-green-800">{episodeCount}</div>
                  </div>
                  <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-purple-600 mb-1">Total Reward</div>
                    <div className="text-xl font-bold text-purple-800">{totalReward.toFixed(1)}</div>
                  </div>
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3 text-center">
                    <div className="text-xs text-orange-600 mb-1">Epsilon</div>
                    <div className="text-xl font-bold text-orange-800">{epsilon.toFixed(2)}</div>
                  </div>
                </div>
                <div className="mt-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-xs text-yellow-600 mb-1">Best Episode</div>
                  <div className="text-xl font-bold text-yellow-800">
                    {bestEpisodeReward === -Infinity ? 'N/A' : bestEpisodeReward.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Current Path */}
              <div className="bg-white rounded-xl p-4 shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">Current Path</h3>
                  <button 
                    onClick={saveCurrentPath}
                    disabled={currentPath.length === 0}
                    className="px-3 py-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-sm rounded-full transition-colors"
                  >
                    💾 Save
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto bg-gray-50 rounded-lg p-2">
                  {currentPath.length === 0 ? (
                    <p className="text-gray-500 text-sm">No steps taken yet</p>
                  ) : (
                    <div className="space-y-1">
                      {currentPath.slice(-5).map((step, idx) => (
                        <div key={idx} className="text-xs bg-white p-2 rounded">
                          <span className="font-mono">
                            [{step.position[0]},{step.position[1]}] → {step.action} 
                            <span className={step.reward > 0 ? 'text-green-600' : step.reward < -1 ? 'text-red-600' : 'text-gray-600'}>
                              {step.reward > 0 ? '+' : ''}{step.reward}
                            </span>
                          </span>
                        </div>
                      ))}
                      {currentPath.length > 5 && (
                        <div className="text-xs text-gray-500 text-center">...and {currentPath.length - 5} more</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Optimal Path Info */}
              {optimalPath.length > 0 && (
                <div className="bg-white rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Optimal Path</h3>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <div className="text-sm text-gray-600 mb-2">
                      <strong>Steps:</strong> {optimalPath.length - 1}
                    </div>
                    <div className="text-xs font-mono bg-white p-2 rounded max-h-24 overflow-y-auto">
                      {optimalPath.map((pos, idx) => (
                        <span key={idx}>
                          [{pos[0]},{pos[1]}]{idx < optimalPath.length - 1 ? ' → ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Saved Paths */}
              {savedPaths.length > 0 && (
                <div className="bg-white rounded-xl p-4 shadow-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Saved Paths ({savedPaths.length})</h3>
                  <div className="max-h-32 overflow-y-auto space-y-2">
                    {savedPaths.slice(-3).map((path) => (
                      <div key={path.id} className="bg-gray-50 rounded-lg p-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">{path.name}</span>
                          <span className={`text-xs px-2 py-1 rounded ${path.totalReward > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {path.totalReward.toFixed(1)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {path.steps.length} steps
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Learning Info */}
          <div className="mt-8 p-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">How Q-Learning with Path Discovery Works:</h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
              <div>
                <strong>Path Learning:</strong> The agent discovers optimal routes through trial and error, gradually learning which actions lead to the highest rewards.
              </div>
              <div>
                <strong>Q-Table Updates:</strong> Each state-action pair gets a quality score that improves based on experienced rewards and future potential.
              </div>
              <div>
                <strong>Path Optimization:</strong> Over time, the agent converges on the shortest, safest path to the goal while avoiding obstacles.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RLPlayground;