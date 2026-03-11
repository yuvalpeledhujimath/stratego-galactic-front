(function (root, factory) {
  const engine = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = engine;
  }
  root.StrategoEngine = engine;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BOARD_SIZE = 10;
  const DIRECTIONS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  const LAKE_COORDS = [
    [4, 2],
    [4, 3],
    [5, 2],
    [5, 3],
    [4, 6],
    [4, 7],
    [5, 6],
    [5, 7],
  ];
  const LAKES = new Set(LAKE_COORDS.map(([r, c]) => `${r},${c}`));

  const PIECE_SPECS = [
    { type: "flag", count: 1, rank: 0, movable: false, code: "F" },
    { type: "bomb", count: 6, rank: 11, movable: false, code: "B" },
    { type: "spy", count: 1, rank: 1, movable: true, code: "S" },
    { type: "scout", count: 8, rank: 2, movable: true, code: "2" },
    { type: "miner", count: 5, rank: 3, movable: true, code: "3" },
    { type: "sergeant", count: 4, rank: 4, movable: true, code: "4" },
    { type: "lieutenant", count: 4, rank: 5, movable: true, code: "5" },
    { type: "captain", count: 4, rank: 6, movable: true, code: "6" },
    { type: "major", count: 3, rank: 7, movable: true, code: "7" },
    { type: "colonel", count: 2, rank: 8, movable: true, code: "8" },
    { type: "general", count: 1, rank: 9, movable: true, code: "9" },
    { type: "marshal", count: 1, rank: 10, movable: true, code: "10" },
  ];

  const PIECE_SPEC_MAP = Object.fromEntries(PIECE_SPECS.map((spec) => [spec.type, spec]));

  const DEPLOYMENT_PRIORITY = {
    flag: 1,
    bomb: 2,
    marshal: 3,
    general: 4,
    colonel: 5,
    major: 6,
    captain: 7,
    lieutenant: 8,
    miner: 9,
    sergeant: 10,
    scout: 11,
    spy: 12,
  };

  const DEPLOYMENT_PROFILE = {
    easy: {
      noise: 52,
      guardBombs: 2,
      decoyBombs: 1,
      frontScoutShare: 0.45,
      minerBackMin: 2,
      antiCluster: 6,
      styleWeights: {
        cornerFortress: 0.34,
        centerShield: 0.34,
        shorelineBluff: 0.16,
        wingVault: 0.16,
      },
    },
    medium: {
      noise: 28,
      guardBombs: 3,
      decoyBombs: 2,
      frontScoutShare: 0.55,
      minerBackMin: 3,
      antiCluster: 11,
      styleWeights: {
        cornerFortress: 0.27,
        centerShield: 0.43,
        shorelineBluff: 0.2,
        wingVault: 0.1,
      },
    },
    hard: {
      noise: 15,
      guardBombs: 3,
      decoyBombs: 2,
      frontScoutShare: 0.6,
      minerBackMin: 3,
      antiCluster: 14,
      styleWeights: {
        cornerFortress: 0.27,
        centerShield: 0.5,
        shorelineBluff: 0.13,
        wingVault: 0.1,
      },
    },
    expert: {
      noise: 4,
      guardBombs: 3,
      decoyBombs: 3,
      frontScoutShare: 0.6,
      minerBackMin: 4,
      antiCluster: 24,
      styleWeights: {
        cornerFortress: 0.27,
        centerShield: 0.54,
        shorelineBluff: 0.1,
        wingVault: 0.09,
      },
    },
    player: {
      noise: 16,
      guardBombs: 3,
      decoyBombs: 2,
      frontScoutShare: 0.58,
      minerBackMin: 3,
      antiCluster: 13,
      styleWeights: {
        cornerFortress: 0.25,
        centerShield: 0.45,
        shorelineBluff: 0.2,
        wingVault: 0.1,
      },
    },
  };

  const DEPLOYMENT_SEARCH_TRIALS = {
    easy: 5,
    medium: 10,
    hard: 20,
    expert: 42,
    player: 18,
  };

  const DEPLOYMENT_DIVERSITY = {
    player: 5,
  };

  const DEPLOYMENT_STYLE_LABEL = {
    cornerFortress: "Corner Fortress",
    centerShield: "Center Shield",
    shorelineBluff: "Shoreline Bluff",
    wingVault: "Wing Vault",
  };

  const DEPLOYMENT_ROLLOUT_PROFILE = {
    easy: null,
    medium: {
      topCandidates: 4,
      opponentSetups: 2,
      plies: 8,
      weight: 0.35,
      ownDifficulty: "hard",
      enemyDifficulty: "hard",
      opponentProfileName: "player",
    },
    hard: {
      topCandidates: 5,
      opponentSetups: 2,
      plies: 10,
      weight: 0.45,
      ownDifficulty: "hard",
      enemyDifficulty: "hard",
      opponentProfileName: "player",
    },
    expert: {
      topCandidates: 6,
      opponentSetups: 3,
      plies: 12,
      weight: 0.62,
      ownDifficulty: "expert",
      enemyDifficulty: "hard",
      opponentProfileName: "player",
    },
    player: {
      topCandidates: 6,
      opponentSetups: 3,
      plies: 12,
      weight: 0.72,
      ownDifficulty: "hard",
      enemyDifficulty: "expert",
      opponentProfileName: "expert",
    },
  };

  const PIECE_VALUE = {
    flag: 20000,
    bomb: 150,
    spy: 120,
    scout: 190,
    miner: 275,
    sergeant: 330,
    lieutenant: 390,
    captain: 480,
    major: 590,
    colonel: 740,
    general: 920,
    marshal: 1150,
  };

  const DIFFICULTY_PROFILE = {
    medium: { tactical: 1.15, eval: 0.2, advance: 4, noise: 55 },
    hard: { tactical: 1.55, eval: 0.35, advance: 5.2, noise: 18 },
  };

  const FOG_AI_PROFILE = {
    easy: { tactical: 0.95, advance: 2.4, safety: 0.75, noise: 190, topK: 1 },
    medium: { tactical: 1.15, advance: 3.2, safety: 1.05, noise: 120, topK: 2 },
    hard: { tactical: 1.42, advance: 3.9, safety: 1.38, noise: 12, topK: 3 },
    expert: { tactical: 1.72, advance: 4.8, safety: 1.85, noise: 0.8, topK: 4 },
  };

  const FOG_SEARCH_PROFILE = {
    hard: {
      candidates: 7,
      samples: 4,
      depth: 1,
      endgameDepth: 2,
      maxBranch: 9,
      replyBranch: 9,
      baseWeight: 0.22,
      variancePenalty: 0.06,
      noise: 2.5,
    },
    expert: {
      candidates: 12,
      samples: 10,
      depth: 2,
      endgameDepth: 3,
      maxBranch: 8,
      replyBranch: 10,
      baseWeight: 0.18,
      variancePenalty: 0.12,
      noise: 0.18,
    },
  };

  const PERFECT_SEARCH_PROFILE = {
    hard: {
      rootCandidates: 16,
      depth: 2,
      endgameDepth: 3,
      maxBranch: 12,
      replyBranch: 12,
      noise: 2,
      priorWeight: 0.2,
    },
    expert: {
      rootCandidates: 20,
      depth: 3,
      endgameDepth: 4,
      maxBranch: 10,
      replyBranch: 12,
      noise: 0.12,
      priorWeight: 0.16,
    },
  };

  function createBoardWithLakes() {
    const board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    );
    LAKE_COORDS.forEach(([r, c]) => {
      board[r][c] = "lake";
    });
    return board;
  }

  function makeFullReserve() {
    const reserve = {};
    PIECE_SPECS.forEach((spec) => {
      reserve[spec.type] = spec.count;
    });
    return reserve;
  }

  function makeZeroCountMap() {
    const map = {};
    PIECE_SPECS.forEach((spec) => {
      map[spec.type] = 0;
    });
    return map;
  }

  function createPieceFactory(options = {}) {
    let nextId = Number(options.startId || 1);
    return function createPiece(side, type) {
      const spec = PIECE_SPEC_MAP[type];
      const piece = {
        id: `${side}-${type}-${nextId}`,
        side,
        type,
        rank: spec.rank,
        movable: spec.movable,
        code: spec.code,
      };
      if (options.unitNames && options.unitNames[side] && options.unitNames[side][type]) {
        piece.name = options.unitNames[side][type];
      }
      nextId += 1;
      return piece;
    };
  }

  function copyPiece(piece) {
    if (!piece || piece === "lake") {
      return null;
    }
    return { ...piece };
  }

  function cloneBoard(board) {
    return board.map((row) =>
      row.map((cell) => {
        if (!cell || cell === "lake") {
          return cell;
        }
        return { ...cell };
      })
    );
  }

  function stripEnemyPieces(board, side) {
    return board.map((row) =>
      row.map((cell) => {
        if (!cell || cell === "lake") {
          return cell;
        }
        if (cell.side !== side) {
          return null;
        }
        return { ...cell };
      })
    );
  }

  function mergeBoards(primaryBoard, secondaryBoard) {
    const merged = createBoardWithLakes();
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const first = primaryBoard[r][c];
        const second = secondaryBoard[r][c];
        if (first && first !== "lake") {
          merged[r][c] = { ...first };
        } else if (second && second !== "lake") {
          merged[r][c] = { ...second };
        }
      }
    }
    return merged;
  }

  function makeKnowledgeState(seed = {}) {
    return {
      knownEnemyIds: new Set(seed.knownEnemyIds || []),
      movedEnemyIds: new Set(seed.movedEnemyIds || []),
    };
  }

  function normalizeKnowledge(knowledge) {
    if (!knowledge) {
      return makeKnowledgeState();
    }
    return {
      knownEnemyIds:
        knowledge.knownEnemyIds instanceof Set
          ? knowledge.knownEnemyIds
          : new Set(knowledge.knownEnemyIds || []),
      movedEnemyIds:
        knowledge.movedEnemyIds instanceof Set
          ? knowledge.movedEnemyIds
          : new Set(knowledge.movedEnemyIds || []),
    };
  }

  function observeEnemyMovement(knowledge, observerSide, piece, move) {
    if (!piece || piece.side === observerSide) {
      return;
    }

    const known = normalizeKnowledge(knowledge);
    const distance = Math.abs(move.toR - move.fromR) + Math.abs(move.toC - move.fromC);
    if (distance > 1) {
      known.knownEnemyIds.add(piece.id);
      known.movedEnemyIds.delete(piece.id);
      return;
    }

    if (!known.knownEnemyIds.has(piece.id)) {
      known.movedEnemyIds.add(piece.id);
    }
  }

  function observeBattle(knowledge, observerSide, attacker, defender) {
    const known = normalizeKnowledge(knowledge);
    [attacker, defender].forEach((piece) => {
      if (!piece || piece.side === observerSide) {
        return;
      }
      known.knownEnemyIds.add(piece.id);
      if (piece.type === "bomb" || piece.type === "flag") {
        known.movedEnemyIds.delete(piece.id);
      }
    });
  }

  function isKnownEnemy(piece, knowledge) {
    return !!piece && !!knowledge && knowledge.knownEnemyIds.has(piece.id);
  }

  function hasEnemyMoved(piece, knowledge) {
    return !!piece && !!knowledge && knowledge.movedEnemyIds.has(piece.id);
  }

  function oppositeSide(side) {
    return side === "light" ? "dark" : "light";
  }

  function isInside(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function isLake(row, col) {
    return LAKES.has(`${row},${col}`);
  }

  function manhattan(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
  }

  function deploymentCells(side) {
    const cells = [];
    const rows = side === "light" ? [6, 7, 8, 9] : [0, 1, 2, 3];
    rows.forEach((r) => {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        if (!isLake(r, c)) {
          cells.push({ r, c });
        }
      }
    });
    return cells;
  }

  function isDeploymentCellForSide(row, col, side) {
    if (!side || isLake(row, col)) {
      return false;
    }
    if (side === "light") {
      return row >= 6 && row <= 9;
    }
    return row >= 0 && row <= 3;
  }

  function deploymentRowsForSide(side) {
    if (side === "light") {
      return { front: 6, mid: 7, back2: 8, back: 9 };
    }
    return { front: 3, mid: 2, back2: 1, back: 0 };
  }

  function deploymentDepth(side, row) {
    return side === "light" ? 9 - row : row;
  }

  function nearestLakeDistance(row, col) {
    let dist = Infinity;
    for (const [lakeRow, lakeCol] of LAKE_COORDS) {
      dist = Math.min(dist, manhattan(row, col, lakeRow, lakeCol));
    }
    return dist;
  }

  function adjacentCells(row, col) {
    const cells = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) {
          continue;
        }
        const nr = row + dr;
        const nc = col + dc;
        if (isInside(nr, nc) && !isLake(nr, nc)) {
          cells.push({ r: nr, c: nc });
        }
      }
    }
    return cells;
  }

  function reserveMapTotal(reserveMap) {
    if (!reserveMap) {
      return 0;
    }
    return Object.values(reserveMap).reduce((sum, count) => sum + (count || 0), 0);
  }

  function shuffled(items, rng = Math.random) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function sample(items, rng = Math.random) {
    return items[Math.floor(rng() * items.length)];
  }

  function weightedChoice(weights, rng = Math.random) {
    const entries = Object.entries(weights);
    let total = 0;
    entries.forEach(([, weight]) => {
      total += weight;
    });
    if (total <= 0) {
      return entries[0] ? entries[0][0] : null;
    }

    let roll = rng() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) {
        return key;
      }
    }
    return entries[entries.length - 1][0];
  }

  function uniqueCells(cells) {
    const seen = new Set();
    return cells.filter((cell) => {
      const key = `${cell.r},${cell.c}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function pickBestPlacement(cells, scorer) {
    let best = null;
    let bestScore = -Infinity;
    cells.forEach((cell) => {
      const score = scorer(cell);
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    });
    return best;
  }

  function expandReserveSorted(reserve) {
    return Object.entries(reserve)
      .flatMap(([type, count]) => Array.from({ length: count }, () => type))
      .sort((a, b) => DEPLOYMENT_PRIORITY[a] - DEPLOYMENT_PRIORITY[b]);
  }

  function findFlag(board, side) {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (piece && piece !== "lake" && piece.side === side && piece.type === "flag") {
          return { r, c };
        }
      }
    }
    return null;
  }

  function findPiecePosition(board, side, type) {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (piece && piece !== "lake" && piece.side === side && piece.type === type) {
          return { r, c };
        }
      }
    }
    return null;
  }

  function countAdjacentFriendlyType(board, center, side, type) {
    let count = 0;
    for (const cell of adjacentCells(center.r, center.c)) {
      const piece = board[cell.r][cell.c];
      if (piece && piece !== "lake" && piece.side === side && piece.type === type) {
        count += 1;
      }
    }
    return count;
  }

  function getLegalMoves(board, row, col) {
    const piece = board[row][col];
    if (!piece || piece === "lake" || !piece.movable) {
      return [];
    }

    const moves = [];
    if (piece.type === "scout") {
      for (const [dr, dc] of DIRECTIONS) {
        let nr = row + dr;
        let nc = col + dc;
        while (isInside(nr, nc) && !isLake(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ r: nr, c: nc });
            nr += dr;
            nc += dc;
            continue;
          }
          if (target.side !== piece.side) {
            moves.push({ r: nr, c: nc });
          }
          break;
        }
      }
      return moves;
    }

    for (const [dr, dc] of DIRECTIONS) {
      const nr = row + dr;
      const nc = col + dc;
      if (!isInside(nr, nc) || isLake(nr, nc)) {
        continue;
      }
      const target = board[nr][nc];
      if (!target || target.side !== piece.side) {
        moves.push({ r: nr, c: nc });
      }
    }
    return moves;
  }

  function getAllLegalMoves(board, side) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== side || !piece.movable) {
          continue;
        }
        getLegalMoves(board, r, c).forEach((target) => {
          moves.push({ fromR: r, fromC: c, toR: target.r, toC: target.c });
        });
      }
    }
    return moves;
  }

  function hasAnyLegalMove(board, side) {
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== side || !piece.movable) {
          continue;
        }
        if (getLegalMoves(board, r, c).length > 0) {
          return true;
        }
      }
    }
    return false;
  }

  function winnerFromBoard(board) {
    const lightFlag = findFlag(board, "light");
    const darkFlag = findFlag(board, "dark");
    if (!lightFlag) {
      return "dark";
    }
    if (!darkFlag) {
      return "light";
    }
    return null;
  }

  function applyMove(board, move) {
    const attacker = board[move.fromR][move.fromC];
    const defender = board[move.toR][move.toC];

    if (!attacker || attacker === "lake") {
      return { kind: "invalid", winner: null };
    }

    if (!defender) {
      board[move.toR][move.toC] = attacker;
      board[move.fromR][move.fromC] = null;
      return { kind: "move", result: "moved", winner: null };
    }

    if (defender.type === "flag") {
      board[move.toR][move.toC] = attacker;
      board[move.fromR][move.fromC] = null;
      return { kind: "battle", result: "captureFlag", winner: attacker.side };
    }

    if (defender.type === "bomb") {
      if (attacker.type === "miner") {
        board[move.toR][move.toC] = attacker;
        board[move.fromR][move.fromC] = null;
        return { kind: "battle", result: "attacker", winner: null };
      }
      board[move.fromR][move.fromC] = null;
      return { kind: "battle", result: "defender", winner: null };
    }

    if (attacker.type === "spy" && defender.type === "marshal") {
      board[move.toR][move.toC] = attacker;
      board[move.fromR][move.fromC] = null;
      return { kind: "battle", result: "attacker", winner: null };
    }

    if (attacker.rank > defender.rank) {
      board[move.toR][move.toC] = attacker;
      board[move.fromR][move.fromC] = null;
      return { kind: "battle", result: "attacker", winner: null };
    }

    if (attacker.rank < defender.rank) {
      board[move.fromR][move.fromC] = null;
      return { kind: "battle", result: "defender", winner: null };
    }

    board[move.fromR][move.fromC] = null;
    board[move.toR][move.toC] = null;
    return { kind: "battle", result: "both", winner: null };
  }

  function styleBiasScore(style, cell, side) {
    const rows = deploymentRowsForSide(side);
    const backBias = cell.r === rows.back ? 1 : cell.r === rows.back2 ? 0.7 : 0;
    const centerDist = Math.abs(cell.c - 4.5);
    const edgeDist = Math.min(cell.c, BOARD_SIZE - 1 - cell.c);
    const lakeDist = nearestLakeDistance(cell.r, cell.c);

    switch (style) {
      case "cornerFortress":
        return backBias * 70 + (edgeDist <= 1 ? 55 : 0) - centerDist * 5;
      case "centerShield":
        return backBias * 68 - centerDist * 10 + (centerDist <= 1 ? 22 : 0);
      case "shorelineBluff":
        return (cell.r === rows.mid || cell.r === rows.back2 ? 36 : 0) + (lakeDist <= 2 ? 30 : 0);
      case "wingVault":
        return backBias * 54 + (edgeDist >= 2 && edgeDist <= 3 ? 32 : 0) + (edgeDist <= 1 ? 12 : 0);
      default:
        return 0;
    }
  }

  function strategicCellScore(type, side, cell, flagPosition, style, profile) {
    const frontness = deploymentDepth(side, cell.r);
    const backness = 3 - frontness;
    const centerDist = Math.abs(cell.c - 4.5);
    const edgeDist = Math.min(cell.c, BOARD_SIZE - 1 - cell.c);
    const lakeDist = nearestLakeDistance(cell.r, cell.c);
    const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;

    let score = styleBiasScore(style, cell, side);
    switch (type) {
      case "flag":
        score += 520 + backness * 90 + (edgeDist === 0 ? 80 : 0) - centerDist * 10;
        score += lakeDist <= 2 ? 20 : 0;
        break;
      case "bomb":
        score += 168 + backness * 34 + 120 / (flagDist + 1) + (edgeDist <= 1 ? 12 : 0);
        break;
      case "marshal":
        score += 246 + frontness * 62 - centerDist * 8 - (flagDist <= 2 ? 35 : 0);
        break;
      case "general":
        score += 228 + frontness * 56 - centerDist * 7 - (flagDist <= 2 ? 30 : 0);
        break;
      case "colonel":
        score += 206 + frontness * 50 - centerDist * 6;
        break;
      case "major":
        score += 188 + frontness * 44 - centerDist * 5;
        break;
      case "captain":
        score += 170 + frontness * 36 - centerDist * 3;
        break;
      case "lieutenant":
        score += 156 + frontness * 30 - centerDist * 2;
        break;
      case "sergeant":
        score += 144 + frontness * 25 + centerDist * 2;
        break;
      case "miner":
        score += 170 + frontness * 24 + backness * 8 + (lakeDist <= 2 ? 16 : 0);
        break;
      case "scout":
        score += 138 + frontness * 58 + centerDist * 3 + (edgeDist <= 1 ? 18 : 0);
        break;
      case "spy":
        score += 128 + backness * 28 - centerDist * 7 + (flagDist <= 2 ? 18 : 0);
        break;
      default:
        score += 100;
    }
    return score;
  }

  function adjacencyTypePenalty(board, side, type, cell, profile) {
    const pieceRank = PIECE_SPEC_MAP[type].rank;
    let penalty = 0;

    for (const neighbor of adjacentCells(cell.r, cell.c)) {
      const piece = board[neighbor.r][neighbor.c];
      if (!piece || piece === "lake" || piece.side !== side) {
        continue;
      }

      if (piece.type === type) {
        penalty += profile.antiCluster;
      }

      const rankGap = Math.abs(piece.rank - pieceRank);
      if (rankGap <= 1) {
        penalty += 6;
      }
    }

    return penalty;
  }

  function flagCandidatesForStyle(style, side) {
    const rows = deploymentRowsForSide(side);
    const styleCandidates = {
      cornerFortress: [
        { r: rows.back, c: 0 },
        { r: rows.back, c: 9 },
        { r: rows.back, c: 1 },
        { r: rows.back, c: 8 },
        { r: rows.back2, c: 0 },
        { r: rows.back2, c: 9 },
      ],
      centerShield: [
        { r: rows.back, c: 3 },
        { r: rows.back, c: 6 },
        { r: rows.back, c: 4 },
        { r: rows.back, c: 5 },
        { r: rows.back2, c: 3 },
        { r: rows.back2, c: 6 },
        { r: rows.back2, c: 4 },
        { r: rows.back2, c: 5 },
      ],
      shorelineBluff: [
        { r: rows.mid, c: 2 },
        { r: rows.mid, c: 3 },
        { r: rows.mid, c: 6 },
        { r: rows.mid, c: 7 },
        { r: rows.back2, c: 2 },
        { r: rows.back2, c: 3 },
        { r: rows.back2, c: 6 },
        { r: rows.back2, c: 7 },
      ],
      wingVault: [
        { r: rows.back, c: 2 },
        { r: rows.back, c: 7 },
        { r: rows.back, c: 1 },
        { r: rows.back, c: 8 },
        { r: rows.back2, c: 1 },
        { r: rows.back2, c: 8 },
      ],
    };
    const cells = styleCandidates[style] || styleCandidates.centerShield;
    return uniqueCells(cells.filter((cell) => isDeploymentCellForSide(cell.r, cell.c, side)));
  }

  function chooseFlagAnchor(available, side, profile, rng) {
    if (available.length === 0) {
      return null;
    }
    const style = weightedChoice(profile.styleWeights, rng);
    const preferred = flagCandidatesForStyle(style, side).filter((candidate) =>
      available.some((cell) => cell.r === candidate.r && cell.c === candidate.c)
    );
    const pool = preferred.length > 0 ? preferred : available;
    const cell = pickBestPlacement(pool, (candidate) =>
      strategicCellScore("flag", side, candidate, null, style, profile)
    );
    if (!cell) {
      return null;
    }
    return { cell, style };
  }

  function placeGuardBombRing(board, side, reserve, flagPosition, available, placeByHeuristic, profile) {
    if (!flagPosition || (reserve.bomb ?? 0) <= 0) {
      return;
    }
    const existingGuards = countAdjacentFriendlyType(board, flagPosition, side, "bomb");
    const target = Math.max(0, profile.guardBombs - existingGuards);
    if (target <= 0) {
      return;
    }

    const availableNeighbors = adjacentCells(flagPosition.r, flagPosition.c).filter((cell) =>
      available.some((openCell) => openCell.r === cell.r && openCell.c === cell.c)
    );
    if (availableNeighbors.length === 0) {
      return;
    }

    placeByHeuristic("bomb", Math.min(target, reserve.bomb, availableNeighbors.length), (cell) => {
      if (!availableNeighbors.some((neighbor) => neighbor.r === cell.r && neighbor.c === cell.c)) {
        return -5000;
      }
      const backness = 3 - deploymentDepth(side, cell.r);
      const centerDist = Math.abs(cell.c - 4.5);
      return 320 + backness * 55 - centerDist * 8;
    });
  }

  function placeDecoyBombs(side, reserve, flagPosition, placeByHeuristic, profile) {
    const count = Math.min(profile.decoyBombs, reserve.bomb ?? 0);
    if (count <= 0) {
      return;
    }

    placeByHeuristic("bomb", count, (cell) => {
      const frontness = deploymentDepth(side, cell.r);
      const edgeDist = Math.min(cell.c, BOARD_SIZE - 1 - cell.c);
      const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;
      const edgeBonus = edgeDist <= 1 ? 38 : edgeDist <= 2 ? 18 : 0;
      return 180 + frontness * 34 + edgeBonus + flagDist * 18;
    });
  }

  function placeKeyOfficers(board, side, reserve, flagPosition, placeByHeuristic) {
    let marshalPos = findPiecePosition(board, side, "marshal");
    if ((reserve.marshal ?? 0) > 0) {
      placeByHeuristic("marshal", 1, (cell) => {
        const frontness = deploymentDepth(side, cell.r);
        const centerDist = Math.abs(cell.c - 4.5);
        const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;
        return 280 + frontness * 66 - centerDist * 10 - (flagDist <= 2 ? 42 : 0);
      });
      marshalPos = findPiecePosition(board, side, "marshal");
    }

    let generalPos = findPiecePosition(board, side, "general");
    if ((reserve.general ?? 0) > 0) {
      placeByHeuristic("general", 1, (cell) => {
        const frontness = deploymentDepth(side, cell.r);
        const centerDist = Math.abs(cell.c - 4.5);
        const oppositeFlankBonus = marshalPos
          ? marshalPos.c <= 4
            ? cell.c >= 5
              ? 54
              : -12
            : cell.c <= 4
            ? 54
            : -12
          : 0;
        return 258 + frontness * 58 - centerDist * 8 + oppositeFlankBonus;
      });
      generalPos = findPiecePosition(board, side, "general");
    }

    return { marshalPos, generalPos };
  }

  function placeSpyNearOfficer(
    board,
    side,
    reserve,
    officers,
    flagPosition,
    placeByHeuristic,
    profile
  ) {
    if ((reserve.spy ?? 0) <= 0) {
      return;
    }

    const protectTarget = officers.marshalPos || officers.generalPos;
    if (!protectTarget) {
      placeByHeuristic("spy", 1, (cell) =>
        strategicCellScore("spy", side, cell, flagPosition, "centerShield", profile)
      );
      return;
    }

    placeByHeuristic("spy", 1, (cell) => {
      const dist = manhattan(cell.r, cell.c, protectTarget.r, protectTarget.c);
      const backness = 3 - deploymentDepth(side, cell.r);
      const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;
      return 260 - dist * 48 + backness * 24 + (flagDist <= 2 ? 16 : 0);
    });
  }

  function placeBacklineMiners(side, reserve, flagPosition, placeByHeuristic) {
    const count = Math.min(4, reserve.miner ?? 0);
    if (count <= 0) {
      return;
    }

    placeByHeuristic("miner", count, (cell) => {
      const backness = 3 - deploymentDepth(side, cell.r);
      const centerDist = Math.abs(cell.c - 4.5);
      const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;
      return 228 + backness * 52 - centerDist * 4 + (flagDist <= 2 ? 24 : 0);
    });
  }

  function placeForwardScouts(side, reserve, flagPosition, placeByHeuristic, profile) {
    const currentScouts = reserve.scout ?? 0;
    if (currentScouts <= 0) {
      return;
    }

    const frontTarget = Math.max(2, Math.round(currentScouts * profile.frontScoutShare));
    placeByHeuristic("scout", Math.min(frontTarget, currentScouts), (cell) => {
      const frontness = deploymentDepth(side, cell.r);
      const edgeDist = Math.min(cell.c, BOARD_SIZE - 1 - cell.c);
      const flagDist = flagPosition ? manhattan(cell.r, cell.c, flagPosition.r, flagPosition.c) : 4;
      const edgeBonus = edgeDist <= 1 ? 24 : edgeDist <= 2 ? 14 : 0;
      return 184 + frontness * 70 + edgeBonus + flagDist * 6;
    });
  }

  function placePiecesStrategically(board, side, reserve, profile, options = {}) {
    const rng = options.rng || Math.random;
    const createPiece = options.createPiece || createPieceFactory();
    let available = deploymentCells(side).filter((cell) => !board[cell.r][cell.c]);
    if (available.length === 0) {
      return { style: null, flagPosition: findFlag(board, side) };
    }

    const placeAt = (type, position) => {
      if (!position || (reserve[type] ?? 0) <= 0) {
        return false;
      }
      board[position.r][position.c] = createPiece(side, type);
      reserve[type] -= 1;
      available = available.filter((cell) => !(cell.r === position.r && cell.c === position.c));
      return true;
    };

    const placeByHeuristic = (type, count, scorer) => {
      let placed = 0;
      while (placed < count && (reserve[type] ?? 0) > 0 && available.length > 0) {
        const best = pickBestPlacement(available, (cell) => {
          const base = scorer(cell);
          const antiCluster = adjacencyTypePenalty(board, side, type, cell, profile);
          return base - antiCluster + rng() * profile.noise;
        });

        if (!best) {
          break;
        }

        placeAt(type, best);
        placed += 1;
      }
    };

    const anchor = chooseFlagAnchor(available, side, profile, rng);
    let flagPosition = findFlag(board, side);
    if ((reserve.flag ?? 0) > 0 && anchor) {
      placeAt("flag", anchor.cell);
      flagPosition = anchor.cell;
    }

    if (!flagPosition) {
      flagPosition = findFlag(board, side);
    }

    placeGuardBombRing(board, side, reserve, flagPosition, available, placeByHeuristic, profile);
    placeDecoyBombs(side, reserve, flagPosition, placeByHeuristic, profile);

    const officers = placeKeyOfficers(board, side, reserve, flagPosition, placeByHeuristic);
    placeSpyNearOfficer(board, side, reserve, officers, flagPosition, placeByHeuristic, profile);
    placeBacklineMiners(side, reserve, flagPosition, placeByHeuristic);
    placeForwardScouts(side, reserve, flagPosition, placeByHeuristic, profile);

    const remainingTypes = expandReserveSorted(reserve);
    for (const type of remainingTypes) {
      placeByHeuristic(type, 1, (cell) =>
        strategicCellScore(type, side, cell, flagPosition, anchor ? anchor.style : null, profile)
      );
    }

    return {
      style: anchor ? anchor.style : null,
      flagPosition: flagPosition || findFlag(board, side),
    };
  }

  function evaluateDeploymentBoard(board, side) {
    const rows = deploymentRowsForSide(side);
    const flag = findFlag(board, side);
    if (!flag) {
      return -9_000_000;
    }

    const columns = Array.from({ length: BOARD_SIZE }, () => 0);
    const pieceEntries = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== side) {
          continue;
        }
        pieceEntries.push({ piece, r, c });
        columns[c] += 1;
      }
    }

    let score = 0;
    const flagBackness = 3 - deploymentDepth(side, flag.r);
    const flagEdgeDist = Math.min(flag.c, BOARD_SIZE - 1 - flag.c);
    const flagLakeDist = nearestLakeDistance(flag.r, flag.c);
    score += flagBackness * 240;
    score += flagEdgeDist <= 1 ? 140 : flagEdgeDist === 2 ? 80 : 20;
    score += flagLakeDist <= 2 ? 55 : 0;

    const guardBombs = countAdjacentFriendlyType(board, flag, side, "bomb");
    score += guardBombs * 160;
    if (guardBombs < 2) {
      score -= (2 - guardBombs) * 320;
    }

    const bombs = [];
    const miners = [];
    const scouts = [];
    let frontMovables = 0;
    let frontStatics = 0;
    let reservePressure = 0;

    pieceEntries.forEach(({ piece, r, c }) => {
      const depth = deploymentDepth(side, r);
      if (piece.type === "bomb") {
        bombs.push({ r, c, depth });
      } else if (piece.type === "miner") {
        miners.push({ r, c, depth });
      } else if (piece.type === "scout") {
        scouts.push({ r, c, depth });
      }

      if (piece.movable) {
        reservePressure += 8 + pressureByPosition(side, r) * 1.4;
      }

      if (r === rows.front) {
        if (piece.movable) {
          frontMovables += 1;
        } else {
          frontStatics += 1;
        }
      }
    });

    let bombAdjPenalty = 0;
    let forwardBombs = 0;
    for (let i = 0; i < bombs.length; i += 1) {
      const first = bombs[i];
      if (first.depth >= 2) {
        forwardBombs += 1;
      }
      for (let j = i + 1; j < bombs.length; j += 1) {
        const second = bombs[j];
        if (manhattan(first.r, first.c, second.r, second.c) <= 1) {
          bombAdjPenalty += 34;
        }
      }
    }

    score += Math.min(3, forwardBombs) * 52;
    score -= bombAdjPenalty;

    const backMiners = miners.filter(({ depth }) => depth <= 1).length;
    const midMiners = miners.filter(({ depth }) => depth === 2).length;
    score += Math.min(4, backMiners) * 62;
    score += Math.min(2, midMiners) * 28;

    const forwardScouts = scouts.filter(({ depth }) => depth >= 2).length;
    const flankScouts = scouts.filter(({ c }) => Math.min(c, BOARD_SIZE - 1 - c) <= 1).length;
    score += forwardScouts * 34 + flankScouts * 12;

    score += frontMovables * 28;
    score -= frontStatics * 38;
    if (frontMovables < 6) {
      score -= (6 - frontMovables) * 45;
    }

    const marshal = findPiecePosition(board, side, "marshal");
    const general = findPiecePosition(board, side, "general");
    const spy = findPiecePosition(board, side, "spy");
    if (marshal && general) {
      const dist = manhattan(marshal.r, marshal.c, general.r, general.c);
      score += dist >= 3 ? 38 : -62;
    }
    if (spy && marshal) {
      const dist = manhattan(spy.r, spy.c, marshal.r, marshal.c);
      score += dist <= 2 ? 54 : -28;
    }

    for (const load of columns) {
      if (load >= 6) {
        score -= (load - 5) * 72;
      }
    }

    const legalCount = getAllLegalMoves(board, side).length;
    score += Math.min(26, legalCount) * 11;
    if (legalCount < 8) {
      score -= (8 - legalCount) * 85;
    }

    score += reservePressure;
    return score;
  }

  function pieceEvaluationValue(piece, enemyCounts) {
    let value = PIECE_VALUE[piece.type] || 0;
    if (piece.type === "bomb") {
      value += Math.max(0, 4 - enemyCounts.miner) * 20;
    } else if (piece.type === "miner") {
      value += enemyCounts.bomb * 14;
    } else if (piece.type === "scout") {
      value += 24;
    } else if (piece.type === "spy") {
      value += enemyCounts.marshal > 0 ? 40 : -30;
    }

    if (piece.movable) {
      value += 18;
    }
    return value;
  }

  function countLivingTypes(board, side) {
    const counts = makeZeroCountMap();
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== side) {
          continue;
        }
        counts[piece.type] += 1;
      }
    }
    return counts;
  }

  function mobilityScore(board, side) {
    return Math.min(44, getAllLegalMoves(board, side).length) * 5;
  }

  function flagSafetyScore(board, side) {
    const flag = findFlag(board, side);
    if (!flag) {
      return -2500;
    }

    let score = 0;
    for (const [dr, dc] of DIRECTIONS) {
      const nr = flag.r + dr;
      const nc = flag.c + dc;
      if (!isInside(nr, nc) || isLake(nr, nc)) {
        score += 18;
        continue;
      }
      const piece = board[nr][nc];
      if (!piece) {
        score -= 12;
        continue;
      }
      if (piece.side === side && piece.type === "bomb") {
        score += 65;
      } else if (piece.side === side) {
        score += piece.movable ? 18 : 10;
      } else {
        score -= 84;
      }
    }
    return score;
  }

  function pressureByPosition(side, row) {
    return side === "light" ? 9 - row : row;
  }

  function evaluateBoard(board, perspective) {
    const enemy = oppositeSide(perspective);
    const ownCounts = countLivingTypes(board, perspective);
    const enemyCounts = countLivingTypes(board, enemy);

    let total = 0;
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake") {
          continue;
        }

        const sign = piece.side === perspective ? 1 : -1;
        const opposingCounts = piece.side === perspective ? enemyCounts : ownCounts;
        let value = pieceEvaluationValue(piece, opposingCounts);
        if (piece.movable) {
          value += pressureByPosition(piece.side, r) * 5;
          value += (4.5 - Math.abs(c - 4.5)) * 6;
        }
        total += sign * value;
      }
    }

    total += mobilityScore(board, perspective);
    total -= mobilityScore(board, enemy);
    total += flagSafetyScore(board, perspective);
    total -= flagSafetyScore(board, enemy);

    if (!hasAnyLegalMove(board, enemy)) {
      total += 3000;
    }
    if (!hasAnyLegalMove(board, perspective)) {
      total -= 3000;
    }
    return total;
  }

  function forwardPressure(move, side, board) {
    const enemyFlag = findFlag(board, oppositeSide(side));
    if (!enemyFlag) {
      return 0;
    }
    const before = manhattan(move.fromR, move.fromC, enemyFlag.r, enemyFlag.c);
    const after = manhattan(move.toR, move.toC, enemyFlag.r, enemyFlag.c);
    return before - after;
  }

  function shouldUseFogScoring(side, defender, context) {
    if (!context.useFog) {
      return false;
    }
    if (side !== context.aiSide) {
      return false;
    }
    if (!defender || defender === "lake" || defender.side !== context.enemySide) {
      return false;
    }
    return !isKnownEnemy(defender, context.knowledge);
  }

  function virtualBattleResult(attacker, defenderType) {
    if (defenderType === "flag") {
      return "captureFlag";
    }
    if (defenderType === "bomb") {
      return attacker.type === "miner" ? "attacker" : "defender";
    }
    if (attacker.type === "spy" && defenderType === "marshal") {
      return "attacker";
    }
    const defenderRank = PIECE_SPEC_MAP[defenderType].rank;
    if (attacker.rank > defenderRank) {
      return "attacker";
    }
    if (attacker.rank < defenderRank) {
      return "defender";
    }
    return "both";
  }

  function virtualBattleScore(attacker, defenderType, result) {
    if (result === "captureFlag") {
      return 1_000_000;
    }
    if (result === "attacker") {
      return (PIECE_VALUE[defenderType] || 120) * 0.95 + 14;
    }
    if (result === "defender") {
      return -(PIECE_VALUE[attacker.type] || 120) * 0.92;
    }
    return ((PIECE_VALUE[defenderType] || 120) - (PIECE_VALUE[attacker.type] || 120)) * 0.22;
  }

  function unknownEnemyTypeCounts(board, enemySide, knowledge) {
    const counts = makeZeroCountMap();
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== enemySide) {
          continue;
        }
        if (isKnownEnemy(piece, knowledge)) {
          continue;
        }
        counts[piece.type] += 1;
      }
    }
    return counts;
  }

  function expectedBattleScoreAgainstUnknown(attacker, defender, board, context) {
    if (!attacker || !defender) {
      return 0;
    }
    const counts = unknownEnemyTypeCounts(board, context.enemySide, context.knowledge);
    const defenderMoved = hasEnemyMoved(defender, context.knowledge);
    const filtered = makeZeroCountMap();
    let total = 0;

    Object.keys(counts).forEach((type) => {
      if (defenderMoved && (type === "bomb" || type === "flag")) {
        return;
      }
      filtered[type] = counts[type];
      total += counts[type];
    });

    if (total <= 0) {
      Object.keys(counts).forEach((type) => {
        filtered[type] = counts[type];
        total += counts[type];
      });
    }

    if (total <= 0) {
      return 0;
    }

    let expected = 0;
    Object.entries(filtered).forEach(([type, count]) => {
      if (!count) {
        return;
      }
      const result = virtualBattleResult(attacker, type);
      expected += count * virtualBattleScore(attacker, type, result);
    });

    return expected / total;
  }

  function quickTacticalScore(board, move, side, context) {
    const attacker = board[move.fromR][move.fromC];
    const defender = board[move.toR][move.toC];
    let score = 0;

    if (!attacker || attacker === "lake") {
      return -99999;
    }

    if (!defender) {
      score += 8;
      return score + forwardPressure(move, side, board) * 2;
    }

    if (shouldUseFogScoring(side, defender, context)) {
      return expectedBattleScoreAgainstUnknown(attacker, defender, board, context);
    }

    if (defender.type === "flag") {
      return 1_000_000;
    }

    if (defender.type === "bomb") {
      if (attacker.type === "miner") {
        score += 820;
      } else {
        score -= PIECE_VALUE[attacker.type] * 1.05;
      }
      return score;
    }

    if (attacker.type === "spy" && defender.type === "marshal") {
      return 1200;
    }

    if (attacker.rank > defender.rank) {
      score += PIECE_VALUE[defender.type] * 0.9;
    } else if (attacker.rank < defender.rank) {
      score -= PIECE_VALUE[attacker.type] * 0.95;
    } else {
      score += (PIECE_VALUE[defender.type] - PIECE_VALUE[attacker.type]) * 0.25;
    }

    return score;
  }

  function estimateDestinationRisk(board, move, side, context) {
    const enemy = oppositeSide(side);
    let risk = 0;

    for (const [dr, dc] of DIRECTIONS) {
      const r = move.toR + dr;
      const c = move.toC + dc;
      if (!isInside(r, c) || isLake(r, c)) {
        continue;
      }

      const piece = board[r][c];
      if (!piece || piece === "lake" || piece.side !== enemy) {
        continue;
      }

      if (context.useFog && enemy === context.enemySide && !isKnownEnemy(piece, context.knowledge)) {
        risk += hasEnemyMoved(piece, context.knowledge) ? 22 : 13;
        continue;
      }

      if (!piece.movable) {
        continue;
      }

      risk += (PIECE_VALUE[piece.type] || 120) * 0.035;
    }
    return risk;
  }

  function estimateMobilityGain(board, move, side) {
    const attacker = board[move.fromR][move.fromC];
    if (!attacker || attacker === "lake" || !attacker.movable) {
      return 0;
    }

    if (attacker.type === "scout") {
      return Math.max(0, Math.abs(move.toR - move.fromR) + Math.abs(move.toC - move.fromC) - 1);
    }

    let freeNeighbors = 0;
    for (const [dr, dc] of DIRECTIONS) {
      const nr = move.toR + dr;
      const nc = move.toC + dc;
      if (!isInside(nr, nc) || isLake(nr, nc)) {
        continue;
      }
      const target = board[nr][nc];
      if (!target || target.side !== side) {
        freeNeighbors += 1;
      }
    }
    return freeNeighbors * 0.2;
  }

  function scoreHeuristicMove(board, move, side, profile, context, rng = Math.random) {
    const tactical = quickTacticalScore(board, move, side, context);
    const boardCopy = cloneBoard(board);
    applyMove(boardCopy, move);
    const evalShift = evaluateBoard(boardCopy, side) - evaluateBoard(board, side);
    const advance = forwardPressure(move, side, board);

    return (
      tactical * profile.tactical +
      evalShift * profile.eval +
      advance * profile.advance +
      rng() * profile.noise
    );
  }

  function scoreFogAwareMove(board, move, profile, context, rng = Math.random) {
    const side = context.aiSide;
    const tactical = quickTacticalScore(board, move, side, context) * profile.tactical;
    const advance = forwardPressure(move, side, board) * profile.advance;
    const risk = estimateDestinationRisk(board, move, side, context) * profile.safety;
    const mobility = estimateMobilityGain(board, move, side) * 4.2;
    return tactical + advance + mobility - risk + rng() * profile.noise;
  }

  function chooseHeuristicMove(board, moves, side, profile, context, rng = Math.random) {
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const move of moves) {
      const score = scoreHeuristicMove(board, move, side, profile, context, rng);
      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestMoves.push(move);
      }
    }
    return sample(bestMoves, rng);
  }

  function withSampledType(piece, type) {
    const spec = PIECE_SPEC_MAP[type];
    return {
      ...piece,
      type,
      rank: spec.rank,
      movable: spec.movable,
      code: spec.code,
    };
  }

  function drawFogUnknownType(remainingByType, moved, rng = Math.random) {
    const options = [];
    let totalWeight = 0;

    Object.entries(remainingByType).forEach(([type, count]) => {
      if (!count) {
        return;
      }
      if (moved && (type === "bomb" || type === "flag")) {
        return;
      }
      options.push({ type, weight: count });
      totalWeight += count;
    });

    if (totalWeight <= 0) {
      Object.entries(remainingByType).forEach(([type, count]) => {
        if (!count) {
          return;
        }
        options.push({ type, weight: count });
        totalWeight += count;
      });
    }

    if (totalWeight <= 0 || options.length === 0) {
      return null;
    }

    let roll = rng() * totalWeight;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        return option.type;
      }
    }
    return options[options.length - 1].type;
  }

  function sampleFogHypothesisBoard(board, aiSide, knowledge, rng = Math.random) {
    const enemySide = oppositeSide(aiSide);
    const hypothesis = cloneBoard(board);
    const remainingByType = makeZeroCountMap();
    const unknownCells = [];

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== enemySide) {
          continue;
        }

        remainingByType[piece.type] += 1;
        if (isKnownEnemy(piece, knowledge)) {
          remainingByType[piece.type] = Math.max(0, remainingByType[piece.type] - 1);
        } else {
          unknownCells.push({
            r,
            c,
            moved: hasEnemyMoved(piece, knowledge),
          });
        }
      }
    }

    const orderedUnknown = shuffled(unknownCells, rng).sort((a, b) => Number(b.moved) - Number(a.moved));
    for (const cell of orderedUnknown) {
      const sampledType = drawFogUnknownType(remainingByType, cell.moved, rng);
      if (!sampledType) {
        continue;
      }
      const piece = hypothesis[cell.r][cell.c];
      if (!piece || piece === "lake") {
        continue;
      }
      hypothesis[cell.r][cell.c] = withSampledType(piece, sampledType);
      remainingByType[sampledType] = Math.max(0, remainingByType[sampledType] - 1);
    }
    return hypothesis;
  }

  function boardKey(board, turnSide) {
    let key = `${turnSide}|`;
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const cell = board[r][c];
        if (!cell) {
          key += "_.";
        } else if (cell === "lake") {
          key += "L.";
        } else {
          key += `${cell.side.charAt(0)}${cell.code}.`;
        }
      }
    }
    return key;
  }

  function orderMoveScore(board, move, turnSide, maximizingSide, context) {
    const nextBoard = cloneBoard(board);
    const outcome = applyMove(nextBoard, move);
    if (outcome.winner === maximizingSide) {
      return 9_000_000;
    }
    if (outcome.winner === oppositeSide(maximizingSide)) {
      return -9_000_000;
    }

    const tactical = quickTacticalScore(
      board,
      move,
      turnSide,
      turnSide === maximizingSide ? context : { ...context, useFog: false }
    );
    const evalShift = evaluateBoard(nextBoard, maximizingSide) - evaluateBoard(board, maximizingSide);
    return tactical * 1.6 + evalShift * 0.32;
  }

  function limitMovesForSearch(board, moves, turnSide, maximizingSide, searchProfile, context) {
    const limit = turnSide === maximizingSide ? searchProfile.maxBranch : searchProfile.replyBranch;
    if (moves.length <= limit) {
      return moves;
    }

    const scored = moves.map((move) => ({
      move,
      score: orderMoveScore(board, move, turnSide, maximizingSide, context),
    }));

    scored.sort((a, b) => (turnSide === maximizingSide ? b.score - a.score : a.score - b.score));
    return scored.slice(0, limit).map((entry) => entry.move);
  }

  function resolveSearchDepth(board, searchProfile) {
    const movableCount = getAllLegalMoves(board, "light").length + getAllLegalMoves(board, "dark").length;
    if (movableCount <= 18) {
      return searchProfile.endgameDepth || searchProfile.depth;
    }
    return searchProfile.depth;
  }

  function searchBoard(board, depth, maximizingSide, turnSide, alpha, beta, searchProfile, context, table) {
    const winner = winnerFromBoard(board);
    if (winner) {
      return winner === maximizingSide ? 8_000_000 + depth : -8_000_000 - depth;
    }

    if (depth === 0) {
      return evaluateBoard(board, maximizingSide);
    }

    const key = boardKey(board, turnSide);
    const cached = table.get(key);
    if (cached && cached.depth >= depth) {
      return cached.value;
    }

    let moves = getAllLegalMoves(board, turnSide);
    if (moves.length === 0) {
      return turnSide === maximizingSide ? -7_000_000 : 7_000_000;
    }

    moves = limitMovesForSearch(board, moves, turnSide, maximizingSide, searchProfile, context);

    let value;
    let cutOff = false;
    if (turnSide === maximizingSide) {
      value = -Infinity;
      for (const move of moves) {
        const nextBoard = cloneBoard(board);
        applyMove(nextBoard, move);
        const nextValue = searchBoard(
          nextBoard,
          depth - 1,
          maximizingSide,
          oppositeSide(turnSide),
          alpha,
          beta,
          searchProfile,
          context,
          table
        );
        value = Math.max(value, nextValue);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) {
          cutOff = true;
          break;
        }
      }
    } else {
      value = Infinity;
      for (const move of moves) {
        const nextBoard = cloneBoard(board);
        applyMove(nextBoard, move);
        const nextValue = searchBoard(
          nextBoard,
          depth - 1,
          maximizingSide,
          oppositeSide(turnSide),
          alpha,
          beta,
          searchProfile,
          context,
          table
        );
        value = Math.min(value, nextValue);
        beta = Math.min(beta, value);
        if (beta <= alpha) {
          cutOff = true;
          break;
        }
      }
    }

    if (!cutOff) {
      table.set(key, { depth, value });
    }
    return value;
  }

  function choosePerfectSearchMove(board, moves, side, level, context, rng = Math.random) {
    const profile = PERFECT_SEARCH_PROFILE[level] || PERFECT_SEARCH_PROFILE.hard;
    const opponent = oppositeSide(side);
    const ordered = moves
      .map((move) => ({
        move,
        prior: scoreHeuristicMove(
          board,
          move,
          side,
          DIFFICULTY_PROFILE.hard,
          { ...context, useFog: false },
          rng
        ),
      }))
      .sort((a, b) => b.prior - a.prior)
      .slice(0, Math.min(profile.rootCandidates, moves.length));

    let bestScore = -Infinity;
    let bestMoves = [];
    for (const candidate of ordered) {
      const boardCopy = cloneBoard(board);
      const outcome = applyMove(boardCopy, candidate.move);
      let score;
      if (outcome.winner === side) {
        score = 9_000_000;
      } else {
        const depth = resolveSearchDepth(boardCopy, profile);
        score = searchBoard(
          boardCopy,
          depth,
          side,
          opponent,
          -Infinity,
          Infinity,
          profile,
          { ...context, useFog: false },
          new Map()
        );
      }
      score += candidate.prior * profile.priorWeight + rng() * profile.noise;

      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestMoves = [candidate.move];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestMoves.push(candidate.move);
      }
    }
    return sample(bestMoves, rng);
  }

  function evaluateFogCandidateOnHypothesis(hypothesisBoard, move, aiSide, searchProfile, context) {
    const opponent = oppositeSide(aiSide);
    const boardCopy = cloneBoard(hypothesisBoard);
    const outcome = applyMove(boardCopy, move);

    if (outcome.winner === aiSide) {
      return 9_000_000;
    }
    if (outcome.winner === opponent) {
      return -9_000_000;
    }

    const depth = resolveSearchDepth(boardCopy, searchProfile);
    if (depth <= 0) {
      return evaluateBoard(boardCopy, aiSide);
    }

    return searchBoard(
      boardCopy,
      depth,
      aiSide,
      opponent,
      -Infinity,
      Infinity,
      searchProfile,
      { ...context, useFog: false },
      new Map()
    );
  }

  function chooseFogSearchMove(board, moves, level, context, rng = Math.random) {
    const baseProfile = FOG_AI_PROFILE[level] || FOG_AI_PROFILE.hard;
    const searchProfile = FOG_SEARCH_PROFILE[level] || FOG_SEARCH_PROFILE.hard;

    const scored = moves
      .map((move) => ({
        move,
        score: scoreFogAwareMove(board, move, baseProfile, context, rng),
      }))
      .sort((a, b) => b.score - a.score);

    const candidateCount = Math.max(2, Math.min(searchProfile.candidates, scored.length));
    const candidates = scored.slice(0, candidateCount);
    if (candidates.length <= 1) {
      return candidates[0] ? candidates[0].move : null;
    }

    const unknownCounts = unknownEnemyTypeCounts(board, context.enemySide, context.knowledge);
    const unknownTotal = Object.values(unknownCounts).reduce((sum, count) => sum + count, 0);
    const hypothesisCount = unknownTotal === 0 ? 1 : Math.max(2, searchProfile.samples - (moves.length > 44 ? 1 : 0));
    const hypotheses = [];
    for (let i = 0; i < hypothesisCount; i += 1) {
      hypotheses.push(unknownTotal === 0 ? cloneBoard(board) : sampleFogHypothesisBoard(board, context.aiSide, context.knowledge, rng));
    }

    let bestScore = -Infinity;
    let bestMoves = [];
    for (const candidate of candidates) {
      const scores = hypotheses.map((hypothesis) =>
        evaluateFogCandidateOnHypothesis(hypothesis, candidate.move, context.aiSide, searchProfile, context)
      );
      const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      const variance =
        scores.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / scores.length;
      const penalty = Math.sqrt(variance) * searchProfile.variancePenalty;
      const finalScore = mean - penalty + candidate.score * searchProfile.baseWeight + rng() * searchProfile.noise;

      if (finalScore > bestScore + 0.0001) {
        bestScore = finalScore;
        bestMoves = [candidate.move];
      } else if (Math.abs(finalScore - bestScore) < 0.0001) {
        bestMoves.push(candidate.move);
      }
    }
    return sample(bestMoves, rng);
  }

  function chooseAiMove(board, options = {}) {
    const side = options.side;
    if (!side) {
      return null;
    }

    const difficulty = options.difficulty || "easy";
    const rng = options.rng || Math.random;
    const context = {
      aiSide: side,
      enemySide: options.enemySide || oppositeSide(side),
      useFog: !!options.useFog,
      knowledge: normalizeKnowledge(options.knowledge),
    };

    const moves = getAllLegalMoves(board, side);
    if (moves.length === 0) {
      return null;
    }

    if (difficulty === "easy") {
      return sample(moves, rng);
    }

    if (context.useFog) {
      if (difficulty === "medium") {
        const profile = FOG_AI_PROFILE.medium;
        const scored = moves
          .map((move) => ({
            move,
            score: scoreFogAwareMove(board, move, profile, context, rng),
          }))
          .sort((a, b) => b.score - a.score);
        const pool = scored.slice(0, Math.max(1, profile.topK));
        return sample(pool, rng).move;
      }
      return chooseFogSearchMove(board, moves, difficulty, context, rng);
    }

    if (difficulty === "medium") {
      return chooseHeuristicMove(board, moves, side, DIFFICULTY_PROFILE.medium, context, rng);
    }

    return choosePerfectSearchMove(board, moves, side, difficulty === "hard" ? "hard" : "expert", context, rng);
  }

  function buildGenericOpponentSetups(side, rolloutProfile, options) {
    const rng = options.rng || Math.random;
    const enemySide = oppositeSide(side);
    const createPiece = options.createPiece || createPieceFactory();
    const boards = [];
    const opponentProfileName = rolloutProfile.opponentProfileName || "player";
    const opponentProfile = DEPLOYMENT_PROFILE[opponentProfileName] || DEPLOYMENT_PROFILE.player;
    const setupTrials = Math.max(4, Math.floor((DEPLOYMENT_SEARCH_TRIALS[opponentProfileName] || 12) / 2));

    for (let i = 0; i < rolloutProfile.opponentSetups; i += 1) {
      let best = null;
      for (let trial = 0; trial < setupTrials; trial += 1) {
        const board = createBoardWithLakes();
        const reserve = makeFullReserve();
        const meta = placePiecesStrategically(board, enemySide, reserve, opponentProfile, {
          rng,
          createPiece,
        });
        const score = evaluateDeploymentBoard(board, enemySide);
        if (!best || score > best.score) {
          best = { board, score, meta };
        }
      }
      boards.push(best.board);
    }
    return boards;
  }

  function runDeploymentRollout(candidateBoard, side, rolloutProfile, opponentBoards, rng) {
    let total = 0;

    opponentBoards.forEach((enemyBoard) => {
      const board = mergeBoards(candidateBoard, enemyBoard);
      let currentTurn = "light";
      let plies = 0;

      while (plies < rolloutProfile.plies) {
        const winner = winnerFromBoard(board);
        if (winner) {
          total += winner === side ? 9000 : -9000;
          return;
        }

        const move = chooseAiMove(board, {
          side: currentTurn,
          enemySide: oppositeSide(currentTurn),
          difficulty:
            currentTurn === side ? rolloutProfile.ownDifficulty : rolloutProfile.enemyDifficulty,
          useFog: false,
          rng,
        });

        if (!move) {
          total += currentTurn === side ? -7000 : 7000;
          return;
        }

        applyMove(board, move);
        currentTurn = oppositeSide(currentTurn);
        plies += 1;
      }

      total += evaluateBoard(board, side);
    });

    return total / Math.max(1, opponentBoards.length);
  }

  function deploymentSignature(board, side) {
    const cells = deploymentCells(side);
    return cells
      .map(({ r, c }) => {
        const piece = board[r][c];
        return piece && piece !== "lake" && piece.side === side ? piece.type : ".";
      })
      .join("|");
  }

  function buildDeploymentRecommendations(board, side, reserve, options = {}) {
    const profileName = options.profileName || "medium";
    const profile = options.profile || DEPLOYMENT_PROFILE[profileName] || DEPLOYMENT_PROFILE.medium;
    const trials = Math.max(1, options.trials || DEPLOYMENT_SEARCH_TRIALS[profileName] || 10);
    const rng = options.rng || Math.random;
    const createPiece = options.createPiece || createPieceFactory();
    const baseBoard = stripEnemyPieces(board, side);
    const seen = new Set();
    const candidates = [];

    for (let i = 0; i < trials; i += 1) {
      const boardCopy = cloneBoard(baseBoard);
      const reserveCopy = { ...reserve };
      const meta = placePiecesStrategically(boardCopy, side, reserveCopy, profile, {
        rng,
        createPiece,
      });

      const remaining = reserveMapTotal(reserveCopy);
      const staticScore = evaluateDeploymentBoard(boardCopy, side) - remaining * 80_000;
      const signature = deploymentSignature(boardCopy, side);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      candidates.push({
        board: boardCopy,
        reserve: reserveCopy,
        staticScore,
        rolloutScore: 0,
        totalScore: staticScore,
        meta: {
          style: meta.style,
          styleLabel: meta.style ? DEPLOYMENT_STYLE_LABEL[meta.style] || meta.style : "Balanced",
        },
      });
    }

    if (candidates.length === 0) {
      return [];
    }

    candidates.sort((a, b) => b.staticScore - a.staticScore);

    const rolloutProfile =
      options.enableRollouts === false
        ? null
        : options.rolloutProfile === null
        ? null
        : options.rolloutProfile || DEPLOYMENT_ROLLOUT_PROFILE[profileName] || null;

    if (rolloutProfile) {
      const opponentBoards = buildGenericOpponentSetups(side, rolloutProfile, { rng, createPiece });
      const rolloutCandidates = candidates.slice(0, Math.min(rolloutProfile.topCandidates, candidates.length));
      rolloutCandidates.forEach((candidate) => {
        candidate.rolloutScore = runDeploymentRollout(candidate.board, side, rolloutProfile, opponentBoards, rng);
        candidate.totalScore = candidate.staticScore + candidate.rolloutScore * rolloutProfile.weight;
      });
      candidates.slice(rolloutCandidates.length).forEach((candidate) => {
        candidate.totalScore = candidate.staticScore;
      });
      candidates.sort((a, b) => b.totalScore - a.totalScore);
    }

    const diverse = [];
    const usedStyles = new Set();
    candidates.forEach((candidate) => {
      const styleKey = candidate.meta.style || "balanced";
      if (!usedStyles.has(styleKey) && diverse.length < 3) {
        usedStyles.add(styleKey);
        diverse.push(candidate);
      }
    });

    candidates.forEach((candidate) => {
      if (diverse.length >= 3) {
        return;
      }
      if (!diverse.includes(candidate)) {
        diverse.push(candidate);
      }
    });

    return diverse.concat(candidates.filter((candidate) => !diverse.includes(candidate)));
  }

  function optimizeDeploymentForSide(board, side, reserve, options = {}) {
    const diversifyTop = Math.max(
      1,
      options.diversifyTop || DEPLOYMENT_DIVERSITY[options.profileName || "medium"] || 1
    );
    const rng = options.rng || Math.random;
    const recommendations = buildDeploymentRecommendations(board, side, reserve, options);
    if (recommendations.length === 0) {
      return null;
    }

    const topCount = Math.max(1, Math.min(diversifyTop, recommendations.length));
    const top = recommendations.slice(0, topCount);
    let chosen = top[0];

    if (topCount > 1) {
      const floor = top[top.length - 1].totalScore;
      const weights = top.map((entry, index) => {
        const rankBoost = topCount - index;
        const scoreBoost = Math.max(1, entry.totalScore - floor + 1);
        return rankBoost * scoreBoost;
      });

      let total = 0;
      weights.forEach((weight) => {
        total += weight;
      });

      let roll = rng() * total;
      for (let i = 0; i < top.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) {
          chosen = top[i];
          break;
        }
      }
    }

    return {
      board: chosen.board,
      reserve: chosen.reserve,
      recommendations,
      meta: chosen.meta,
    };
  }

  return {
    BOARD_SIZE,
    PIECE_SPECS,
    PIECE_SPEC_MAP,
    PIECE_VALUE,
    DEPLOYMENT_PROFILE,
    DEPLOYMENT_SEARCH_TRIALS,
    DEPLOYMENT_DIVERSITY,
    createBoardWithLakes,
    createPieceFactory,
    makeFullReserve,
    makeZeroCountMap,
    copyPiece,
    cloneBoard,
    stripEnemyPieces,
    mergeBoards,
    makeKnowledgeState,
    normalizeKnowledge,
    observeEnemyMovement,
    observeBattle,
    isKnownEnemy,
    hasEnemyMoved,
    oppositeSide,
    isInside,
    isLake,
    manhattan,
    deploymentCells,
    isDeploymentCellForSide,
    deploymentDepth,
    reserveMapTotal,
    findFlag,
    getLegalMoves,
    getAllLegalMoves,
    hasAnyLegalMove,
    winnerFromBoard,
    applyMove,
    evaluateBoard,
    evaluateDeploymentBoard,
    buildDeploymentRecommendations,
    optimizeDeploymentForSide,
    chooseAiMove,
  };
});
