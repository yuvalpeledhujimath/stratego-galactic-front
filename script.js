(() => {
  const BOARD_SIZE = 10;
  const MOVE_ANIMATION_MS = 500;
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
      noise: 6,
      guardBombs: 3,
      decoyBombs: 3,
      frontScoutShare: 0.58,
      minerBackMin: 4,
      antiCluster: 22,
      styleWeights: {
        cornerFortress: 0.3,
        centerShield: 0.56,
        shorelineBluff: 0.08,
        wingVault: 0.06,
      },
    },
    player: {
      noise: 20,
      guardBombs: 3,
      decoyBombs: 2,
      frontScoutShare: 0.55,
      minerBackMin: 3,
      antiCluster: 12,
      styleWeights: {
        cornerFortress: 0.26,
        centerShield: 0.44,
        shorelineBluff: 0.2,
        wingVault: 0.1,
      },
    },
  };

  const DEPLOYMENT_SEARCH_TRIALS = {
    easy: 5,
    medium: 10,
    hard: 18,
    expert: 34,
    player: 12,
  };

  const DEPLOYMENT_DIVERSITY = {
    player: 4,
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

  const UNIT_NAMES = {
    light: {
      flag: "Jedi Holocron",
      bomb: "Ion Mine",
      spy: "Bothan Agent",
      scout: "Rebel Recon",
      miner: "Sapper",
      sergeant: "Pathfinder",
      lieutenant: "Wing Lieutenant",
      captain: "Alliance Captain",
      major: "Vanguard Major",
      colonel: "Jedi Knight",
      general: "Alliance General",
      marshal: "Jedi Grand Master",
    },
    dark: {
      flag: "Sith Relic",
      bomb: "Thermal Mine",
      spy: "Imperial Inquisitor",
      scout: "Probe Unit",
      miner: "Siege Engineer",
      sergeant: "Storm Sergeant",
      lieutenant: "Imperial Lieutenant",
      captain: "Legion Captain",
      major: "Dark Major",
      colonel: "Sith Enforcer",
      general: "Moff General",
      marshal: "Dark Lord",
    },
  };

  const UNIT_SHORT_NAME = {
    flag: "Flag",
    bomb: "Bomb",
    spy: "Spy",
    scout: "Scout",
    miner: "Miner",
    sergeant: "Sgt",
    lieutenant: "Lt",
    captain: "Cpt",
    major: "Maj",
    colonel: "Col",
    general: "Gen",
    marshal: "Msh",
  };

  const INVENTORY_ORDER = [
    "marshal",
    "general",
    "colonel",
    "major",
    "captain",
    "lieutenant",
    "sergeant",
    "miner",
    "scout",
    "spy",
    "bomb",
    "flag",
  ];

  const DIFFICULTY_PROFILE = {
    medium: { tactical: 1.15, eval: 0.2, advance: 4, noise: 55 },
    hard: { tactical: 1.55, eval: 0.35, advance: 5.2, noise: 20 },
  };

  const FOG_AI_PROFILE = {
    easy: { tactical: 0.95, advance: 2.4, safety: 0.75, noise: 190, topK: 1 },
    medium: { tactical: 1.15, advance: 3.2, safety: 1.05, noise: 120, topK: 2 },
    hard: { tactical: 1.38, advance: 3.8, safety: 1.35, noise: 18, topK: 3 },
    expert: { tactical: 1.6, advance: 4.5, safety: 1.7, noise: 8, topK: 4 },
  };

  const FOG_SEARCH_PROFILE = {
    hard: {
      candidates: 7,
      samples: 3,
      depth: 1,
      maxBranch: 9,
      replyBranch: 9,
      baseWeight: 0.22,
      noise: 4,
    },
    expert: {
      candidates: 10,
      samples: 6,
      depth: 2,
      maxBranch: 8,
      replyBranch: 10,
      baseWeight: 0.16,
      noise: 1.5,
    },
  };

  const state = {
    mode: "pvc",
    difficulty: "easy",
    humanSide: "light",
    aiSide: "dark",
    phase: "setup",
    deploymentSide: null,
    deployReserve: {
      light: makeFullReserve(),
      dark: makeFullReserve(),
    },
    deploySelectedType: null,
    currentTurn: "light",
    board: [],
    selected: null,
    legalTargets: [],
    gameOver: false,
    winner: null,
    viewerSide: "light",
    revealPending: false,
    revealContext: null,
    aiThinking: false,
    animatingMove: false,
    battleLog: [],
    lastBattle: null,
    battleDialog: null,
    resolvingBattle: false,
    pendingBattleOutcome: null,
    pendingInventoryLoss: {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    },
    lastStep: null,
    aiKnowledge: {
      knownEnemyIds: new Set(),
      movedEnemyIds: new Set(),
    },
    online: {
      socket: null,
      connected: false,
      pin: "",
      side: null,
      isHost: false,
      roomReady: false,
      status: "Create a room or join with a PIN.",
      suppressSync: false,
      lastSentSnapshot: "",
    },
  };

  let pieceIdCounter = 1;

  const el = {
    setupPanel: document.getElementById("setupPanel"),
    gamePanel: document.getElementById("gamePanel"),
    difficultyGroup: document.getElementById("difficultyGroup"),
    sideGroup: document.getElementById("sideGroup"),
    onlineGroup: document.getElementById("onlineGroup"),
    modeOptions: document.getElementById("modeOptions"),
    difficultyOptions: document.getElementById("difficultyOptions"),
    sideOptions: document.getElementById("sideOptions"),
    createOnlineBtn: document.getElementById("createOnlineBtn"),
    joinOnlineBtn: document.getElementById("joinOnlineBtn"),
    joinPinInput: document.getElementById("joinPinInput"),
    onlineStatus: document.getElementById("onlineStatus"),
    onlinePin: document.getElementById("onlinePin"),
    onlinePinValue: document.getElementById("onlinePinValue"),
    startBtn: document.getElementById("startBtn"),
    resetBtn: document.getElementById("resetBtn"),
    randomizeBtn: document.getElementById("randomizeBtn"),
    clearDeployBtn: document.getElementById("clearDeployBtn"),
    autoDeployBtn: document.getElementById("autoDeployBtn"),
    confirmDeployBtn: document.getElementById("confirmDeployBtn"),
    deployPanel: document.getElementById("deployPanel"),
    deployInfo: document.getElementById("deployInfo"),
    piecePalette: document.getElementById("piecePalette"),
    duelPanel: document.getElementById("duelPanel"),
    duelNumbers: document.getElementById("duelNumbers"),
    duelWinner: document.getElementById("duelWinner"),
    battleModal: document.getElementById("battleModal"),
    battleTitle: document.getElementById("battleTitle"),
    battleLightLine: document.getElementById("battleLightLine"),
    battleDarkLine: document.getElementById("battleDarkLine"),
    battleResultLine: document.getElementById("battleResultLine"),
    boardWrap: document.querySelector(".board-wrap"),
    moveLayer: document.getElementById("moveLayer"),
    inventoryPanel: document.getElementById("inventoryPanel"),
    inventoryLight: document.getElementById("inventoryLight"),
    inventoryDark: document.getElementById("inventoryDark"),
    board: document.getElementById("board"),
    hudMode: document.getElementById("hudMode"),
    hudTurn: document.getElementById("hudTurn"),
    hudStatus: document.getElementById("hudStatus"),
    battleLog: document.getElementById("battleLog"),
    turnOverlay: document.getElementById("turnOverlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlayText: document.getElementById("overlayText"),
    revealBtn: document.getElementById("revealBtn"),
  };

  init();

  function init() {
    wireChoiceButtons(el.modeOptions, "mode", (value) => {
      state.mode = value;
      if (value === "online") {
        ensureOnlineSocket();
      }
      syncModeUI();
    });

    wireChoiceButtons(el.difficultyOptions, "difficulty", (value) => {
      state.difficulty = value;
    });

    wireChoiceButtons(el.sideOptions, "side", (value) => {
      state.humanSide = value;
    });

    el.createOnlineBtn.addEventListener("click", () => {
      createOnlineRoom();
    });

    el.joinOnlineBtn.addEventListener("click", () => {
      joinOnlineRoom();
    });

    el.joinPinInput.addEventListener("input", () => {
      el.joinPinInput.value = el.joinPinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });

    el.startBtn.addEventListener("click", () => {
      startGame();
    });

    el.resetBtn.addEventListener("click", () => {
      if (state.mode === "online" && !state.online.isHost) {
        addLog("Only the host can reset the online match.");
        renderAll();
        return;
      }
      resetToSetup();
      if (state.mode === "online") {
        syncOnlineStateIfNeeded(true);
      }
    });

    el.randomizeBtn.addEventListener("click", () => {
      if (state.mode === "online" && !state.online.isHost) {
        addLog("Only the host can restart the online match.");
        renderAll();
        return;
      }
      startGame();
    });

    el.clearDeployBtn.addEventListener("click", () => {
      if (state.phase !== "deploy" || !state.deploymentSide || state.revealPending) {
        return;
      }
      if (state.mode === "online" && state.deploymentSide !== state.humanSide) {
        return;
      }
      clearDeploymentForSide(state.deploymentSide);
      addLog(`${sideLabel(state.deploymentSide)} deployment cleared.`);
      renderAll();
      syncOnlineStateIfNeeded();
    });

    el.autoDeployBtn.addEventListener("click", () => {
      if (state.phase !== "deploy" || !state.deploymentSide || state.revealPending) {
        return;
      }
      if (state.mode === "online" && state.deploymentSide !== state.humanSide) {
        return;
      }
      autoPlaceRemainingForSide(state.deploymentSide, "player");
      addLog(`${sideLabel(state.deploymentSide)} auto-placed remaining units.`);
      renderAll();
      syncOnlineStateIfNeeded();
    });

    el.confirmDeployBtn.addEventListener("click", () => {
      if (state.revealPending) {
        return;
      }
      confirmDeployment();
    });

    el.board.addEventListener("click", handleBoardClick);
    el.battleModal.addEventListener("click", () => {
      acknowledgeBattleResolution();
    });
    document.addEventListener("keydown", () => {
      acknowledgeBattleResolution();
    });

    el.revealBtn.addEventListener("click", () => {
      if (!state.revealPending || state.gameOver) {
        return;
      }

      state.revealPending = false;
      hideOverlay();

      if (state.revealContext === "deploy") {
        state.viewerSide = state.deploymentSide;
      } else if (state.revealContext === "turn") {
        state.viewerSide = state.currentTurn;
      }

      state.revealContext = null;
      renderAll();
    });

    syncModeUI();
    resetToSetup();
  }

  function wireChoiceButtons(container, dataKey, onSelect) {
    const buttons = Array.from(container.querySelectorAll("button"));
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onSelect(btn.dataset[dataKey]);
      });
    });
  }

  function syncModeUI() {
    const pvc = state.mode === "pvc";
    const online = state.mode === "online";
    el.difficultyGroup.classList.toggle("hidden", !pvc);
    el.sideGroup.classList.toggle("hidden", !pvc);
    el.onlineGroup.classList.toggle("hidden", !online);
    el.startBtn.textContent = online ? "Start Online Match" : "Start Battle";
    renderOnlineSetupStatus();
  }

  function resetToSetup() {
    state.phase = "setup";
    state.gameOver = false;
    state.winner = null;
    state.aiThinking = false;
    state.animatingMove = false;
    state.revealPending = false;
    state.revealContext = null;
    state.battleLog = [];
    state.lastBattle = null;
    state.battleDialog = null;
    state.resolvingBattle = false;
    state.pendingBattleOutcome = null;
    state.pendingInventoryLoss = {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };
    state.lastStep = null;
    state.aiKnowledge = {
      knownEnemyIds: new Set(),
      movedEnemyIds: new Set(),
    };
    state.selected = null;
    state.legalTargets = [];
    state.viewerSide = state.mode === "online" && state.online.side ? state.online.side : "light";
    clearMoveLayer();
    hideOverlay();

    el.gamePanel.classList.add("hidden");
    el.setupPanel.classList.remove("hidden");
    renderAll();
    renderOnlineSetupStatus();
    syncOnlineStateIfNeeded();
  }

  function startGame() {
    if (state.mode === "online") {
      startOnlineGameAsHost();
      return;
    }

    pieceIdCounter = 1;
    state.board = createBoardWithLakes();
    state.selected = null;
    state.legalTargets = [];
    state.gameOver = false;
    state.winner = null;
    state.aiThinking = false;
    state.animatingMove = false;
    state.battleLog = [];
    state.lastBattle = null;
    state.battleDialog = null;
    state.resolvingBattle = false;
    state.pendingBattleOutcome = null;
    state.pendingInventoryLoss = {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };
    state.lastStep = null;
    state.aiKnowledge = {
      knownEnemyIds: new Set(),
      movedEnemyIds: new Set(),
    };
    clearMoveLayer();

    state.deployReserve = {
      light: makeFullReserve(),
      dark: makeFullReserve(),
    };

    state.phase = "deploy";
    state.currentTurn = "light";
    state.revealPending = false;
    state.revealContext = null;
    hideOverlay();

    state.aiSide = oppositeSide(state.humanSide);
    state.deploymentSide = state.humanSide;
    state.viewerSide = state.humanSide;
    state.deploySelectedType = firstAvailableType(state.humanSide);
    addLog(
      `Deployment phase: Place your ${sideLabel(state.humanSide)} units. AI (${difficultyLabel(
        state.difficulty
      )}) will deploy strategically.`
    );

    el.setupPanel.classList.add("hidden");
    el.gamePanel.classList.remove("hidden");

    renderAll();
  }

  function ensureOnlineSocket() {
    if (state.online.socket) {
      return state.online.socket;
    }

    if (typeof io !== "function") {
      state.online.status = "Socket client failed to load.";
      renderOnlineSetupStatus();
      return null;
    }

    const socket = io();
    state.online.socket = socket;

    socket.on("connect", () => {
      state.online.connected = true;
      if (!state.online.pin) {
        state.online.status = "Connected. Create a room or join with a PIN.";
      }
      renderOnlineSetupStatus();
    });

    socket.on("disconnect", () => {
      state.online.connected = false;
      state.online.roomReady = false;
      state.online.status = "Disconnected from server.";
      renderOnlineSetupStatus();
    });

    socket.on("room:created", (payload) => {
      state.online.pin = payload.pin;
      state.online.side = payload.side;
      state.online.isHost = true;
      state.online.roomReady = false;
      state.online.lastSentSnapshot = "";
      state.online.status = `Room ${payload.pin} created. Waiting for opponent...`;
      state.humanSide = payload.side;
      renderOnlineSetupStatus();
    });

    socket.on("room:joined", (payload) => {
      state.online.pin = payload.pin;
      state.online.side = payload.side;
      state.online.isHost = false;
      state.online.lastSentSnapshot = "";
      state.online.status = `Joined room ${payload.pin}. Waiting for host to start...`;
      state.humanSide = payload.side;
      renderOnlineSetupStatus();
    });

    socket.on("room:ready", (payload) => {
      if (!payload || payload.pin !== state.online.pin) {
        return;
      }
      state.online.roomReady = true;
      state.online.status = state.online.isHost
        ? `Opponent connected. Press "Start Online Match".`
        : "Connected. Waiting for host to start.";
      renderOnlineSetupStatus();
    });

    socket.on("room:error", (payload) => {
      state.online.status = payload?.message || "Online error.";
      renderOnlineSetupStatus();
    });

    socket.on("room:opponent_left", () => {
      state.online.roomReady = false;
      if (!state.online.isHost) {
        state.online.pin = "";
        state.online.status = "Host disconnected. Create or join another room.";
      } else {
        state.online.status = "Opponent disconnected.";
      }
      if (state.phase !== "setup") {
        addLog("Opponent disconnected.");
      }
      renderOnlineSetupStatus();
    });

    socket.on("state:update", (payload) => {
      if (state.mode !== "online") {
        return;
      }
      if (!payload || !payload.snapshot) {
        return;
      }
      applyOnlineSnapshot(payload.snapshot);
    });

    return socket;
  }

  function createOnlineRoom() {
    if (state.mode !== "online") {
      return;
    }
    const socket = ensureOnlineSocket();
    if (!socket || !state.online.connected) {
      state.online.status = "Not connected yet. Please wait and try again.";
      renderOnlineSetupStatus();
      return;
    }
    socket.emit("room:create");
  }

  function joinOnlineRoom() {
    if (state.mode !== "online") {
      return;
    }
    const socket = ensureOnlineSocket();
    const pin = (el.joinPinInput.value || "").trim().toUpperCase();
    if (!socket || !state.online.connected) {
      state.online.status = "Not connected yet. Please wait and try again.";
      renderOnlineSetupStatus();
      return;
    }
    if (!pin) {
      state.online.status = "Enter a game PIN to join.";
      renderOnlineSetupStatus();
      return;
    }
    socket.emit("room:join", { pin });
  }

  function renderOnlineSetupStatus() {
    if (!el.onlineStatus || !el.startBtn) {
      return;
    }

    const inOnline = state.mode === "online";
    const canStartOnline =
      inOnline &&
      state.online.connected &&
      state.online.isHost &&
      state.online.roomReady &&
      !!state.online.pin;

    if (!inOnline) {
      el.startBtn.disabled = false;
      return;
    }

    if (!state.online.connected && state.online.socket) {
      state.online.status = "Connecting to server...";
    } else if (!state.online.connected) {
      state.online.status = "Offline. Connect and create/join a room.";
    } else if (!state.online.pin) {
      state.online.status = "Connected. Create a room or join with a PIN.";
    }

    el.onlineStatus.textContent = state.online.status;
    el.onlinePin.classList.toggle("hidden", !state.online.pin);
    if (state.online.pin) {
      el.onlinePinValue.textContent = state.online.pin;
    }

    el.createOnlineBtn.disabled = !state.online.connected;
    el.joinOnlineBtn.disabled = !state.online.connected;
    el.joinPinInput.disabled = !state.online.connected;
    el.startBtn.disabled = !canStartOnline;
  }

  function startOnlineGameAsHost() {
    if (state.mode !== "online") {
      return;
    }
    if (!state.online.connected || !state.online.pin) {
      state.online.status = "Create or join a room first.";
      renderOnlineSetupStatus();
      return;
    }
    if (!state.online.isHost) {
      state.online.status = "Only the host can start the match.";
      renderOnlineSetupStatus();
      return;
    }
    if (!state.online.roomReady) {
      state.online.status = "Waiting for opponent to join room.";
      renderOnlineSetupStatus();
      return;
    }

    pieceIdCounter = 1;
    state.board = createBoardWithLakes();
    state.selected = null;
    state.legalTargets = [];
    state.gameOver = false;
    state.winner = null;
    state.aiThinking = false;
    state.animatingMove = false;
    state.battleLog = [];
    state.lastBattle = null;
    state.battleDialog = null;
    state.resolvingBattle = false;
    state.pendingBattleOutcome = null;
    state.pendingInventoryLoss = {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };
    state.lastStep = null;
    state.aiKnowledge = {
      knownEnemyIds: new Set(),
      movedEnemyIds: new Set(),
    };
    state.deployReserve = {
      light: makeFullReserve(),
      dark: makeFullReserve(),
    };

    state.phase = "deploy";
    state.currentTurn = "light";
    state.aiSide = null;
    state.humanSide = state.online.side || "light";
    state.deploymentSide = "light";
    state.viewerSide = state.humanSide;
    state.deploySelectedType = firstAvailableType(state.humanSide);
    state.revealPending = false;
    state.revealContext = null;
    hideOverlay();
    clearMoveLayer();

    addLog(`Online match ${state.online.pin} started. Light Side deploys first.`);
    el.setupPanel.classList.add("hidden");
    el.gamePanel.classList.remove("hidden");
    renderAll();
    syncOnlineStateIfNeeded(true);
  }

  function syncOnlineStateIfNeeded(force = false) {
    if (state.mode !== "online") {
      return;
    }
    if (!state.online.socket || !state.online.connected || !state.online.pin) {
      return;
    }
    if (state.online.suppressSync) {
      return;
    }

    const snapshot = buildOnlineSnapshot();
    const serial = JSON.stringify(snapshot);
    if (!force && serial === state.online.lastSentSnapshot) {
      return;
    }

    state.online.lastSentSnapshot = serial;
    state.online.socket.emit("state:update", {
      pin: state.online.pin,
      snapshot,
    });
  }

  function buildOnlineSnapshot() {
    return {
      pieceIdCounter,
      phase: state.phase,
      deploymentSide: state.deploymentSide,
      deployReserve: state.deployReserve,
      deploySelectedType: state.deploySelectedType,
      currentTurn: state.currentTurn,
      board: state.board,
      gameOver: state.gameOver,
      winner: state.winner,
      battleLog: state.battleLog,
      lastBattle: state.lastBattle,
      battleDialog: state.battleDialog,
      resolvingBattle: state.resolvingBattle,
      pendingBattleOutcome: state.pendingBattleOutcome,
      pendingInventoryLoss: state.pendingInventoryLoss,
      lastStep: state.lastStep,
    };
  }

  function applyOnlineSnapshot(snapshot) {
    state.online.suppressSync = true;

    pieceIdCounter = Number(snapshot.pieceIdCounter || pieceIdCounter);
    state.phase = snapshot.phase;
    state.deploymentSide = snapshot.deploymentSide;
    state.deployReserve = snapshot.deployReserve || {
      light: makeFullReserve(),
      dark: makeFullReserve(),
    };
    state.deploySelectedType = snapshot.deploySelectedType;
    state.currentTurn = snapshot.currentTurn;
    state.board = snapshot.board || createBoardWithLakes();
    state.gameOver = !!snapshot.gameOver;
    state.winner = snapshot.winner || null;
    state.battleLog = Array.isArray(snapshot.battleLog) ? snapshot.battleLog : [];
    state.lastBattle = snapshot.lastBattle || null;
    state.battleDialog = snapshot.battleDialog || null;
    state.resolvingBattle = !!snapshot.resolvingBattle;
    state.pendingBattleOutcome = snapshot.pendingBattleOutcome || null;
    state.pendingInventoryLoss = snapshot.pendingInventoryLoss || {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };
    state.lastStep = snapshot.lastStep || null;
    state.selected = null;
    state.legalTargets = [];
    state.aiSide = null;
    state.humanSide = state.online.side || state.humanSide;
    state.viewerSide = state.humanSide;
    state.revealPending = false;
    state.revealContext = null;
    state.aiThinking = false;
    state.animatingMove = false;

    const serial = JSON.stringify(snapshot);
    state.online.lastSentSnapshot = serial;
    state.online.suppressSync = false;

    el.setupPanel.classList.toggle("hidden", state.phase !== "setup");
    el.gamePanel.classList.toggle("hidden", state.phase === "setup");
    renderAll();
    renderOnlineSetupStatus();
  }

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

  function createPiece(side, type) {
    const spec = PIECE_SPEC_MAP[type];
    const piece = {
      id: `${side}-${type}-${pieceIdCounter}`,
      side,
      type,
      rank: spec.rank,
      movable: spec.movable,
      code: spec.code,
      name: UNIT_NAMES[side][type],
    };
    pieceIdCounter += 1;
    return piece;
  }

  function handleBoardClick(event) {
    const cell = event.target.closest(".cell[data-row][data-col]");
    if (!cell) {
      return;
    }

    if (state.gameOver || state.revealPending || state.aiThinking || state.resolvingBattle || state.animatingMove) {
      return;
    }

    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);

    if (!isInside(row, col) || isLake(row, col)) {
      return;
    }

    if (state.phase === "deploy") {
      handleDeploymentClick(row, col);
      return;
    }

    if (state.mode === "pvc" && state.currentTurn !== state.humanSide) {
      return;
    }
    if (state.mode === "online" && state.currentTurn !== state.humanSide) {
      return;
    }

    handleBattleClick(row, col);
  }

  function handleDeploymentClick(row, col) {
    const side = state.deploymentSide;
    if (!side) {
      return;
    }
    if (state.mode === "online" && side !== state.humanSide) {
      return;
    }

    if (!isDeploymentCellForSide(row, col, side)) {
      return;
    }

    const reserve = state.deployReserve[side];
    const target = state.board[row][col];

    if (target && target !== "lake" && target.side === side) {
      const selectedType = state.deploySelectedType;
      const canSwap =
        selectedType &&
        selectedType !== target.type &&
        (reserve[selectedType] ?? 0) > 0;

      if (canSwap) {
        reserve[target.type] += 1;
        state.board[row][col] = createPiece(side, selectedType);
        reserve[selectedType] -= 1;
      } else {
        state.board[row][col] = null;
        reserve[target.type] += 1;
      }

      state.lastStep = { cells: [{ r: row, c: col }] };

      if ((reserve[state.deploySelectedType] ?? 0) === 0) {
        state.deploySelectedType = firstAvailableType(side);
      }

      renderAll();
      syncOnlineStateIfNeeded();
      return;
    }

    if (target) {
      return;
    }

    const placeType = state.deploySelectedType;
    if (!placeType) {
      return;
    }

    if ((reserve[placeType] ?? 0) <= 0) {
      state.deploySelectedType = firstAvailableType(side);
      renderAll();
      syncOnlineStateIfNeeded();
      return;
    }

    state.board[row][col] = createPiece(side, placeType);
    reserve[placeType] -= 1;
    state.lastStep = { cells: [{ r: row, c: col }] };

    if (reserve[placeType] <= 0) {
      state.deploySelectedType = firstAvailableType(side);
    }

    renderAll();
    syncOnlineStateIfNeeded();
  }

  function confirmDeployment() {
    if (state.phase !== "deploy" || !state.deploymentSide) {
      return;
    }

    const side = state.deploymentSide;
    if (state.mode === "online" && side !== state.humanSide) {
      return;
    }

    if (!isDeploymentComplete(side)) {
      const remaining = reserveTotal(side);
      addLog(
        `${sideLabel(side)} still has ${remaining} unit${remaining === 1 ? "" : "s"} to place.`
      );
      renderAll();
      syncOnlineStateIfNeeded();
      return;
    }

    addLog(`${sideLabel(side)} deployment locked.`);

    if (state.mode === "pvc") {
      autoDeployComputerAndStartBattle();
      syncOnlineStateIfNeeded();
      return;
    }

    if (state.mode === "online") {
      if (side === "light") {
        state.deploymentSide = "dark";
        state.deploySelectedType = firstAvailableType("dark");
        state.viewerSide = state.humanSide;
        state.revealPending = false;
        state.revealContext = null;
        hideOverlay();
        addLog("Dark Side deployment begins.");
        renderAll();
        syncOnlineStateIfNeeded();
        return;
      }

      startBattlePhase();
      syncOnlineStateIfNeeded();
      return;
    }

    startBattlePhase();
    syncOnlineStateIfNeeded();
  }

  function autoDeployComputerAndStartBattle() {
    clearDeploymentForSide(state.aiSide);
    autoPlaceRemainingForSide(state.aiSide, state.difficulty);
    addLog(`${sideLabel(state.aiSide)} deployed with ${difficultyLabel(state.difficulty)} doctrine.`);
    startBattlePhase();
  }

  function startBattlePhase() {
    state.deploymentSide = null;
    state.deploySelectedType = null;
    state.phase = "battle";
    state.selected = null;
    state.legalTargets = [];
    state.revealContext = null;

    if (state.mode === "pvc") {
      state.currentTurn = state.humanSide;
      state.viewerSide = state.humanSide;
      state.revealPending = false;
      hideOverlay();
      addLog(`Battle started. ${sideLabel(state.currentTurn)} moves first.`);
      renderAll();

      if (state.currentTurn === state.aiSide) {
        queueAiTurn();
      }
      return;
    }

    if (state.mode === "online") {
      state.currentTurn = "light";
      state.viewerSide = state.humanSide;
      state.revealPending = false;
      state.revealContext = null;
      hideOverlay();
      addLog(`Battle started. ${sideLabel(state.currentTurn)} moves first.`);
      renderAll();
      return;
    }

    state.currentTurn = "light";
    state.viewerSide = "light";
    state.revealPending = false;
    state.revealContext = null;
    hideOverlay();
    addLog("Deployment complete. Battle phase begins.");
    renderAll();
  }

  function clearDeploymentForSide(side) {
    if (!side) {
      return;
    }

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = state.board[r][c];
        if (piece && piece !== "lake" && piece.side === side && isDeploymentCellForSide(r, c, side)) {
          state.board[r][c] = null;
        }
      }
    }

    state.deployReserve[side] = makeFullReserve();
    if (state.deploymentSide === side) {
      state.deploySelectedType = firstAvailableType(side);
    }
  }

  function autoPlaceRemainingForSide(side, profileName) {
    if (!side) {
      return;
    }

    const reserve = state.deployReserve[side];
    const profile = DEPLOYMENT_PROFILE[profileName] || DEPLOYMENT_PROFILE.medium;
    const trials = DEPLOYMENT_SEARCH_TRIALS[profileName] ?? DEPLOYMENT_SEARCH_TRIALS.medium;
    const diversifyTop = DEPLOYMENT_DIVERSITY[profileName] || 1;
    const optimized = optimizeDeploymentForSide(state.board, side, reserve, profile, trials, diversifyTop);

    if (optimized) {
      state.board = optimized.board;
      state.deployReserve[side] = optimized.reserve;
    } else {
      placePiecesStrategically(state.board, side, reserve, profile);
    }

    if (state.deploymentSide === side) {
      state.deploySelectedType = firstAvailableType(side);
    }
  }

  function optimizeDeploymentForSide(board, side, reserve, profile, trials, diversifyTop = 1) {
    const iterations = Math.max(1, trials);
    const candidates = [];

    for (let i = 0; i < iterations; i += 1) {
      const boardCopy = cloneBoard(board);
      const reserveCopy = { ...reserve };
      placePiecesStrategically(boardCopy, side, reserveCopy, profile);

      const remaining = reserveMapTotal(reserveCopy);
      const score = evaluateDeploymentBoard(boardCopy, side) - remaining * 80_000;
      candidates.push({ board: boardCopy, reserve: reserveCopy, score });
    }

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((a, b) => b.score - a.score);

    const topCount = Math.max(1, Math.min(diversifyTop, candidates.length));
    if (topCount === 1) {
      const best = candidates[0];
      return { board: best.board, reserve: best.reserve };
    }

    const top = candidates.slice(0, topCount);
    const floor = top[top.length - 1].score;
    const weights = top.map((entry, idx) => {
      const rankBoost = topCount - idx;
      const scoreBoost = Math.max(1, entry.score - floor + 1);
      return rankBoost * scoreBoost;
    });

    let total = 0;
    weights.forEach((w) => {
      total += w;
    });

    let roll = Math.random() * total;
    for (let i = 0; i < top.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) {
        return { board: top[i].board, reserve: top[i].reserve };
      }
    }

    const fallback = top[0];
    return { board: fallback.board, reserve: fallback.reserve };
  }

  function placePiecesStrategically(board, side, reserve, profile) {
    let available = deploymentCells(side).filter((cell) => !board[cell.r][cell.c]);
    if (available.length === 0) {
      return;
    }

    const placeAt = (type, position) => {
      if (!position || reserve[type] <= 0) {
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
          return base - antiCluster + Math.random() * profile.noise;
        });

        if (!best) {
          break;
        }

        placeAt(type, best);
        placed += 1;
      }
    };

    const anchor = chooseFlagAnchor(available, side, profile);
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

    const officers = placeKeyOfficers(
      board,
      side,
      reserve,
      flagPosition,
      placeByHeuristic,
      profile
    );
    placeSpyNearOfficer(board, side, reserve, officers, flagPosition, placeByHeuristic, profile);

    placeBacklineMiners(side, reserve, flagPosition, placeByHeuristic, profile);
    placeForwardScouts(side, reserve, flagPosition, placeByHeuristic, profile);

    const remainingTypes = expandReserveSorted(reserve);
    for (const type of remainingTypes) {
      placeByHeuristic(type, 1, (cell) =>
        strategicCellScore(type, side, cell, flagPosition, anchor?.style, profile)
      );
    }
  }

  function chooseFlagAnchor(available, side, profile) {
    if (available.length === 0) {
      return null;
    }

    const style = weightedChoice(profile.styleWeights);
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
      if (!availableNeighbors.some((n) => n.r === cell.r && n.c === cell.c)) {
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

  function placeKeyOfficers(board, side, reserve, flagPosition, placeByHeuristic, profile) {
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

  function placeBacklineMiners(side, reserve, flagPosition, placeByHeuristic, profile) {
    const count = Math.min(profile.minerBackMin, reserve.miner ?? 0);
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
    score += flagBackness * 240;
    score += flagEdgeDist <= 1 ? 140 : flagEdgeDist === 2 ? 80 : 20;

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

    pieceEntries.forEach(({ piece, r, c }) => {
      const depth = deploymentDepth(side, r);
      if (piece.type === "bomb") {
        bombs.push({ r, c, depth });
      } else if (piece.type === "miner") {
        miners.push({ r, c, depth });
      } else if (piece.type === "scout") {
        scouts.push({ r, c, depth });
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
      const a = bombs[i];
      if (a.depth >= 2) {
        forwardBombs += 1;
      }
      for (let j = i + 1; j < bombs.length; j += 1) {
        const b = bombs[j];
        if (manhattan(a.r, a.c, b.r, b.c) <= 1) {
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

    return score;
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

  function adjacencyTypePenalty(board, side, type, cell, profile) {
    const pieceRank = PIECE_SPEC_MAP[type].rank;
    let penalty = 0;

    for (const neighbor of adjacentCells(cell.r, cell.c)) {
      const nearby = board[neighbor.r][neighbor.c];
      if (!nearby || nearby === "lake" || nearby.side !== side) {
        continue;
      }

      if (nearby.type === type) {
        penalty += profile.antiCluster;
      } else if (nearby.rank === pieceRank) {
        penalty += profile.antiCluster * 0.6;
      }
    }

    return penalty;
  }

  function countAdjacentFriendlyType(board, center, side, type) {
    let total = 0;
    for (const cell of adjacentCells(center.r, center.c)) {
      const piece = board[cell.r][cell.c];
      if (piece && piece !== "lake" && piece.side === side && piece.type === type) {
        total += 1;
      }
    }
    return total;
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

  function deploymentRowsForSide(side) {
    if (side === "light") {
      return { back: 9, back2: 8, mid: 7, front: 6 };
    }
    return { back: 0, back2: 1, mid: 2, front: 3 };
  }

  function uniqueCells(cells) {
    const seen = new Set();
    const result = [];
    for (const cell of cells) {
      const key = `${cell.r},${cell.c}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(cell);
    }
    return result;
  }

  function weightedChoice(weights) {
    const entries = Object.entries(weights || {});
    if (entries.length === 0) {
      return "centerShield";
    }

    const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
    if (total <= 0) {
      return entries[0][0];
    }

    let roll = Math.random() * total;
    for (const [key, weight] of entries) {
      roll -= Math.max(0, weight);
      if (roll <= 0) {
        return key;
      }
    }

    return entries[entries.length - 1][0];
  }

  function pickBestPlacement(cells, scorer) {
    if (cells.length === 0) {
      return null;
    }

    let bestScore = -Infinity;
    let bestCells = [];

    for (const cell of cells) {
      const score = scorer(cell);
      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestCells = [cell];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestCells.push(cell);
      }
    }

    return sample(bestCells);
  }

  function expandReserveSorted(reserve) {
    const pieces = [];
    Object.keys(reserve).forEach((type) => {
      for (let i = 0; i < reserve[type]; i += 1) {
        pieces.push(type);
      }
    });

    pieces.sort((a, b) => DEPLOYMENT_PRIORITY[a] - DEPLOYMENT_PRIORITY[b]);
    return pieces;
  }

  function handleBattleClick(row, col) {
    if (state.selected && isLegalTarget(row, col)) {
      performMove({
        fromR: state.selected.r,
        fromC: state.selected.c,
        toR: row,
        toC: col,
      });
      return;
    }

    const piece = state.board[row][col];
    if (piece && piece.side === state.currentTurn && piece.movable) {
      state.selected = { r: row, c: col };
      state.legalTargets = getLegalMoves(state.board, row, col);
      renderBoard();
      renderHud();
      return;
    }

    clearSelection();
    renderBoard();
    renderHud();
  }

  function clearSelection() {
    state.selected = null;
    state.legalTargets = [];
  }

  function isLegalTarget(row, col) {
    return state.legalTargets.some((target) => target.r === row && target.c === col);
  }

  function performMove(move) {
    if (state.animatingMove) {
      return;
    }

    const attacker = state.board[move.fromR][move.fromC];
    if (!attacker || attacker === "lake") {
      return;
    }

    state.animatingMove = true;
    clearSelection();
    renderBoard();
    renderHud();

    animateMoveTransition(move)
      .catch(() => {})
      .finally(() => {
        state.animatingMove = false;
        resolveMoveAfterAnimation(move);
      });
  }

  function resolveMoveAfterAnimation(move) {
    if (state.phase !== "battle") {
      renderAll();
      return;
    }

    const liveAttacker = state.board[move.fromR][move.fromC];
    if (!liveAttacker || liveAttacker === "lake") {
      renderAll();
      return;
    }

    const attacker = copyPiece(liveAttacker);
    const defender = copyPiece(state.board[move.toR][move.toC]);
    if (isAiFogEnabled()) {
      noteAiKnowledgeFromMovement(attacker);
    }

    const outcome = applyMove(state.board, move);
    state.lastStep = {
      cells: [
        { r: move.fromR, c: move.fromC },
        { r: move.toR, c: move.toC },
      ],
    };

    if (outcome.kind === "battle") {
      if (isAiFogEnabled()) {
        noteAiKnowledgeFromBattle(attacker, defender);
      }
      state.lastBattle = buildLastBattle(move, attacker, defender, outcome);
      scheduleInventoryLoss(attacker, defender, outcome);
      state.battleDialog = state.lastBattle;
      state.resolvingBattle = true;
      state.pendingBattleOutcome = outcome;
    }

    addLog(describeOutcome(move, attacker, defender, outcome));
    clearSelection();

    if (outcome.kind === "battle") {
      renderAll();
      syncOnlineStateIfNeeded();
      return;
    }

    continueAfterMove(outcome);
    syncOnlineStateIfNeeded();
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

  function buildLastBattle(move, attacker, defender, outcome) {
    const location = coordToText(move.toR, move.toC);
    const lightPiece = attacker.side === "light" ? attacker : defender;
    const darkPiece = attacker.side === "dark" ? attacker : defender;

    let winnerTheme = "both";
    let winnerText = "Both sides lost!";

    if (outcome.result === "attacker" || outcome.result === "captureFlag") {
      winnerTheme = attacker.side;
      winnerText = attacker.side === "light" ? "Light fighter won!" : "Dark fighter won!";
    } else if (outcome.result === "defender") {
      winnerTheme = defender.side;
      winnerText = defender.side === "light" ? "Light fighter won!" : "Dark fighter won!";
    }

    return {
      location,
      numbers: `${sideLabel(attacker.side)} [${battleNumber(attacker)}] vs ${sideLabel(defender.side)} [${battleNumber(
        defender
      )}]`,
      winnerText,
      winnerTheme,
      lightLine: `Light fighter: ${battlePieceLabel(lightPiece)}`,
      darkLine: `Dark fighter: ${battlePieceLabel(darkPiece)}`,
    };
  }

  function describeOutcome(move, attacker, defender, outcome) {
    const from = coordToText(move.fromR, move.fromC);
    const to = coordToText(move.toR, move.toC);

    if (outcome.kind === "move") {
      return `${sideLabel(attacker.side)} moved ${unitLabel(attacker)} ${from} -> ${to}.`;
    }

    const attackerNum = battleNumber(attacker);
    const defenderNum = battleNumber(defender);

    if (outcome.result === "captureFlag") {
      return `Duel ${to}: ${sideLabel(attacker.side)} [${attackerNum}] vs ${sideLabel(defender.side)} [${defenderNum}] -> ${sideLabel(
        attacker.side
      )} captured the Flag.`;
    }

    if (outcome.result === "attacker") {
      return `Duel ${to}: ${sideLabel(attacker.side)} [${attackerNum}] vs ${sideLabel(defender.side)} [${defenderNum}] -> ${sideLabel(
        attacker.side
      )} won.`;
    }

    if (outcome.result === "defender") {
      return `Duel ${to}: ${sideLabel(attacker.side)} [${attackerNum}] vs ${sideLabel(defender.side)} [${defenderNum}] -> ${sideLabel(
        defender.side
      )} won.`;
    }

    return `Duel ${to}: ${sideLabel(attacker.side)} [${attackerNum}] vs ${sideLabel(defender.side)} [${defenderNum}] -> draw.`;
  }

  function acknowledgeBattleResolution() {
    if (!state.resolvingBattle || !state.pendingBattleOutcome) {
      return;
    }
    if (state.mode === "online" && state.currentTurn !== state.humanSide) {
      return;
    }

    const outcome = state.pendingBattleOutcome;
    state.pendingBattleOutcome = null;
    state.battleDialog = null;
    state.resolvingBattle = false;
    clearPendingInventoryLoss();
    continueAfterMove(outcome);
    syncOnlineStateIfNeeded();
  }

  function continueAfterMove(outcome) {
    if (outcome.winner) {
      endGame(outcome.winner, "Flag captured.");
      return;
    }

    const nextTurn = oppositeSide(state.currentTurn);
    if (!hasAnyLegalMove(state.board, nextTurn)) {
      endGame(state.currentTurn, `${sideLabel(nextTurn)} has no movable units left.`);
      return;
    }

    state.currentTurn = nextTurn;

    if (state.mode === "online") {
      state.viewerSide = state.humanSide;
      state.revealPending = false;
      state.revealContext = null;
      renderAll();
      syncOnlineStateIfNeeded();
      return;
    }

    state.viewerSide = state.humanSide;
    renderAll();
    syncOnlineStateIfNeeded();

    if (state.currentTurn === state.aiSide) {
      queueAiTurn();
    }
  }

  function scheduleInventoryLoss(attacker, defender, outcome) {
    if (!attacker || !defender) {
      return;
    }

    if (outcome.result === "attacker" || outcome.result === "captureFlag") {
      queueRowLoss(defender.side, defender.type);
      return;
    }

    if (outcome.result === "defender") {
      queueRowLoss(attacker.side, attacker.type);
      return;
    }

    if (outcome.result === "both") {
      queueRowLoss(attacker.side, attacker.type);
      queueRowLoss(defender.side, defender.type);
    }
  }

  function queueRowLoss(side, type) {
    if (!side || !type) {
      return;
    }

    state.pendingInventoryLoss[side][type] += 1;
    renderInventoryPanel();
  }

  function endGame(winnerSide, reason) {
    state.gameOver = true;
    state.winner = winnerSide;
    state.aiThinking = false;
    state.revealPending = false;
    state.revealContext = null;
    state.viewerSide = state.mode === "pvc" || state.mode === "online" ? state.humanSide : winnerSide;
    hideOverlay();
    addLog(`${sideLabel(winnerSide)} wins. ${reason}`);
    renderAll();
    syncOnlineStateIfNeeded();
  }

  function queueAiTurn() {
    if (state.phase !== "battle" || state.resolvingBattle || state.animatingMove) {
      return;
    }

    state.aiThinking = true;
    renderHud();

    const delayByLevel = {
      easy: 350,
      medium: 500,
      hard: 650,
      expert: 850,
    };

    window.setTimeout(() => {
      if (
        state.gameOver ||
        state.mode !== "pvc" ||
        state.phase !== "battle" ||
        state.currentTurn !== state.aiSide ||
        state.animatingMove ||
        !state.aiThinking
      ) {
        return;
      }

      const move = chooseAiMove();
      state.aiThinking = false;

      if (!move) {
        endGame(state.humanSide, `${sideLabel(state.aiSide)} cannot make any legal move.`);
        return;
      }

      performMove(move);
    }, delayByLevel[state.difficulty] ?? 500);
  }

  function chooseAiMove() {
    const moves = getAllLegalMoves(state.board, state.aiSide);
    if (moves.length === 0) {
      return null;
    }

    if (isAiFogEnabled()) {
      return chooseAiMoveFogAware(moves);
    }

    if (state.difficulty === "easy") {
      return sample(moves);
    }

    if (state.difficulty === "medium") {
      return chooseHeuristicMove(state.board, moves, state.aiSide, DIFFICULTY_PROFILE.medium);
    }

    if (state.difficulty === "hard") {
      return chooseHardMove(moves);
    }

    return chooseExpertMove(moves);
  }

  function chooseAiMoveFogAware(moves) {
    if (state.difficulty === "easy") {
      return sample(moves);
    }

    if (state.difficulty === "medium") {
      const profile = FOG_AI_PROFILE.medium;
      const scored = moves
        .map((move) => ({
          move,
          score: scoreFogAwareMove(move, profile),
        }))
        .sort((a, b) => b.score - a.score);
      const pool = scored.slice(0, Math.max(1, profile.topK));
      return sample(pool).move;
    }

    return chooseFogSearchMove(moves, state.difficulty);
  }

  function chooseFogSearchMove(moves, level) {
    const baseProfile = FOG_AI_PROFILE[level] || FOG_AI_PROFILE.hard;
    const searchProfile = FOG_SEARCH_PROFILE[level] || FOG_SEARCH_PROFILE.hard;

    const scored = moves
      .map((move) => ({
        move,
        score: scoreFogAwareMove(move, baseProfile),
      }))
      .sort((a, b) => b.score - a.score);

    const candidates = scored.slice(0, Math.max(2, Math.min(searchProfile.candidates, scored.length)));
    if (candidates.length <= 1) {
      return candidates[0].move;
    }

    const sampleCount = Math.max(2, searchProfile.samples - (moves.length > 44 ? 1 : 0));
    const hypotheses = [];
    for (let i = 0; i < sampleCount; i += 1) {
      hypotheses.push(sampleFogHypothesisBoard(state.board, state.aiSide));
    }

    let bestScore = -Infinity;
    let bestMoves = [];

    for (const candidate of candidates) {
      let total = 0;
      for (const hypothesis of hypotheses) {
        total += evaluateFogCandidateOnHypothesis(hypothesis, candidate.move, state.aiSide, searchProfile);
      }
      const expected = total / hypotheses.length;
      const finalScore =
        expected + candidate.score * searchProfile.baseWeight + Math.random() * searchProfile.noise;

      if (finalScore > bestScore + 0.0001) {
        bestScore = finalScore;
        bestMoves = [candidate.move];
      } else if (Math.abs(finalScore - bestScore) < 0.0001) {
        bestMoves.push(candidate.move);
      }
    }

    return sample(bestMoves);
  }

  function evaluateFogCandidateOnHypothesis(hypothesisBoard, move, aiSide, searchProfile) {
    const opponent = oppositeSide(aiSide);
    const boardCopy = cloneBoard(hypothesisBoard);
    const outcome = applyMove(boardCopy, move);

    if (outcome.winner === aiSide) {
      return 9_000_000;
    }
    if (outcome.winner === opponent) {
      return -9_000_000;
    }
    if (searchProfile.depth <= 0) {
      return evaluateBoard(boardCopy, aiSide);
    }

    return fogLimitedMinimax(boardCopy, searchProfile.depth, aiSide, opponent, -Infinity, Infinity, searchProfile);
  }

  function fogLimitedMinimax(board, depth, maximizingSide, turnSide, alpha, beta, searchProfile) {
    const winner = winnerFromBoard(board);
    if (winner) {
      return winner === maximizingSide ? 8_000_000 + depth : -8_000_000 - depth;
    }

    if (depth === 0) {
      return evaluateBoard(board, maximizingSide);
    }

    let moves = getAllLegalMoves(board, turnSide);
    if (moves.length === 0) {
      return turnSide === maximizingSide ? -7_000_000 : 7_000_000;
    }

    moves = limitMovesForFogSearch(board, moves, turnSide, maximizingSide, searchProfile);

    if (turnSide === maximizingSide) {
      let value = -Infinity;
      for (const move of moves) {
        const nextBoard = cloneBoard(board);
        applyMove(nextBoard, move);
        const nextValue = fogLimitedMinimax(
          nextBoard,
          depth - 1,
          maximizingSide,
          oppositeSide(turnSide),
          alpha,
          beta,
          searchProfile
        );
        value = Math.max(value, nextValue);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) {
          break;
        }
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      const nextBoard = cloneBoard(board);
      applyMove(nextBoard, move);
      const nextValue = fogLimitedMinimax(
        nextBoard,
        depth - 1,
        maximizingSide,
        oppositeSide(turnSide),
        alpha,
        beta,
        searchProfile
      );
      value = Math.min(value, nextValue);
      beta = Math.min(beta, value);
      if (beta <= alpha) {
        break;
      }
    }
    return value;
  }

  function limitMovesForFogSearch(board, moves, turnSide, maximizingSide, searchProfile) {
    const limit = turnSide === maximizingSide ? searchProfile.maxBranch : searchProfile.replyBranch;
    if (moves.length <= limit) {
      return moves;
    }

    const minimizingSide = oppositeSide(maximizingSide);
    const scored = moves.map((move) => {
      const boardCopy = cloneBoard(board);
      const outcome = applyMove(boardCopy, move);
      let score;

      if (outcome.winner === maximizingSide) {
        score = 7_500_000;
      } else if (outcome.winner === minimizingSide) {
        score = -7_500_000;
      } else {
        score = evaluateBoard(boardCopy, maximizingSide);
      }

      return { move, score };
    });

    scored.sort((a, b) => (turnSide === maximizingSide ? b.score - a.score : a.score - b.score));
    return scored.slice(0, limit).map((entry) => entry.move);
  }

  function sampleFogHypothesisBoard(board, aiSide) {
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
        if (isKnownEnemyToAi(piece)) {
          remainingByType[piece.type] = Math.max(0, remainingByType[piece.type] - 1);
        } else {
          unknownCells.push({
            r,
            c,
            moved: hasEnemyMovedToAi(piece),
          });
        }
      }
    }

    const orderedUnknown = shuffled(unknownCells).sort((a, b) => Number(b.moved) - Number(a.moved));

    for (const cell of orderedUnknown) {
      const sampledType = drawFogUnknownType(remainingByType, cell.moved);
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

  function drawFogUnknownType(remainingByType, moved) {
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

    let roll = Math.random() * totalWeight;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) {
        return option.type;
      }
    }

    return options[options.length - 1].type;
  }

  function withSampledType(piece, type) {
    const spec = PIECE_SPEC_MAP[type];
    return {
      ...piece,
      type,
      rank: spec.rank,
      movable: spec.movable,
      code: spec.code,
      name: UNIT_NAMES[piece.side][type],
    };
  }

  function scoreFogAwareMove(move, profile) {
    const side = state.aiSide;
    const tactical = quickTacticalScore(state.board, move, side) * profile.tactical;
    const advance = forwardPressure(move, side, state.board) * profile.advance;
    const risk = estimateDestinationRisk(move, side) * profile.safety;
    const mobility = estimateMobilityGain(move, side) * 4.2;
    const random = Math.random() * profile.noise;
    return tactical + advance + mobility - risk + random;
  }

  function estimateDestinationRisk(move, side) {
    const enemy = oppositeSide(side);
    let risk = 0;

    for (const [dr, dc] of DIRECTIONS) {
      const r = move.toR + dr;
      const c = move.toC + dc;
      if (!isInside(r, c) || isLake(r, c)) {
        continue;
      }

      const piece = state.board[r][c];
      if (!piece || piece === "lake" || piece.side !== enemy) {
        continue;
      }

      if (isAiFogEnabled() && enemy === state.humanSide && !isKnownEnemyToAi(piece)) {
        const moved = hasEnemyMovedToAi(piece);
        risk += moved ? 22 : 13;
        continue;
      }

      if (!piece.movable) {
        continue;
      }

      risk += (PIECE_VALUE[piece.type] || 120) * 0.035;
    }

    return risk;
  }

  function estimateMobilityGain(move, side) {
    const attacker = state.board[move.fromR][move.fromC];
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
      const target = state.board[nr][nc];
      if (!target || target.side !== side) {
        freeNeighbors += 1;
      }
    }
    return freeNeighbors * 0.2;
  }

  function chooseHeuristicMove(board, moves, side, profile) {
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
      const score = scoreHeuristicMove(board, move, side, profile);
      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestMoves.push(move);
      }
    }

    return sample(bestMoves);
  }

  function chooseHardMove(moves) {
    const side = state.aiSide;
    const opponent = oppositeSide(side);
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of moves) {
      const firstScore = scoreHeuristicMove(state.board, move, side, DIFFICULTY_PROFILE.hard);
      const boardCopy = cloneBoard(state.board);
      const outcome = applyMove(boardCopy, move);

      if (outcome.winner === side) {
        return move;
      }

      const opponentMoves = getAllLegalMoves(boardCopy, opponent);
      let worstReply = 0;
      for (const oppMove of opponentMoves.slice(0, 28)) {
        worstReply = Math.max(worstReply, quickTacticalScore(boardCopy, oppMove, opponent));
      }

      const score = firstScore - worstReply * 0.38;

      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestMoves.push(move);
      }
    }

    return sample(bestMoves);
  }

  function chooseExpertMove(moves) {
    const side = state.aiSide;
    const opponent = oppositeSide(side);

    const ordered = moves
      .map((move) => ({ move, score: quickTacticalScore(state.board, move, side) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    let bestScore = -Infinity;
    let bestMoves = [];

    for (const candidate of ordered) {
      const boardCopy = cloneBoard(state.board);
      const outcome = applyMove(boardCopy, candidate.move);

      let score;
      if (outcome.winner === side) {
        score = 9_000_000;
      } else {
        score = minimax(boardCopy, 2, side, opponent, -Infinity, Infinity);
      }

      score += candidate.score * 0.2;

      if (score > bestScore + 0.0001) {
        bestScore = score;
        bestMoves = [candidate.move];
      } else if (Math.abs(score - bestScore) < 0.0001) {
        bestMoves.push(candidate.move);
      }
    }

    return sample(bestMoves);
  }

  function minimax(board, depth, maximizingSide, turnSide, alpha, beta) {
    const winner = winnerFromBoard(board);
    if (winner) {
      if (winner === maximizingSide) {
        return 8_000_000 + depth;
      }
      return -8_000_000 - depth;
    }

    if (depth === 0) {
      return evaluateBoard(board, maximizingSide);
    }

    let moves = getAllLegalMoves(board, turnSide);
    if (moves.length === 0) {
      return turnSide === maximizingSide ? -7_000_000 : 7_000_000;
    }

    if (moves.length > 22) {
      moves = moves
        .map((move) => ({ move, score: quickTacticalScore(board, move, turnSide) }))
        .sort((a, b) =>
          turnSide === maximizingSide ? b.score - a.score : a.score - b.score
        )
        .slice(0, 22)
        .map((entry) => entry.move);
    }

    if (turnSide === maximizingSide) {
      let value = -Infinity;
      for (const move of moves) {
        const nextBoard = cloneBoard(board);
        applyMove(nextBoard, move);
        const nextValue = minimax(
          nextBoard,
          depth - 1,
          maximizingSide,
          oppositeSide(turnSide),
          alpha,
          beta
        );
        value = Math.max(value, nextValue);
        alpha = Math.max(alpha, value);
        if (beta <= alpha) {
          break;
        }
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      const nextBoard = cloneBoard(board);
      applyMove(nextBoard, move);
      const nextValue = minimax(
        nextBoard,
        depth - 1,
        maximizingSide,
        oppositeSide(turnSide),
        alpha,
        beta
      );
      value = Math.min(value, nextValue);
      beta = Math.min(beta, value);
      if (beta <= alpha) {
        break;
      }
    }
    return value;
  }

  function scoreHeuristicMove(board, move, side, profile) {
    const tactical = quickTacticalScore(board, move, side);

    const boardCopy = cloneBoard(board);
    applyMove(boardCopy, move);
    const evalShift = evaluateBoard(boardCopy, side) - evaluateBoard(board, side);
    const advance = forwardPressure(move, side, board);

    return (
      tactical * profile.tactical +
      evalShift * profile.eval +
      advance * profile.advance +
      Math.random() * profile.noise
    );
  }

  function quickTacticalScore(board, move, side) {
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

    if (shouldUseFogScoring(side, defender)) {
      return expectedBattleScoreAgainstUnknown(attacker, defender, board);
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
      score += 1200;
      return score;
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

  function shouldUseFogScoring(side, defender) {
    if (!isAiFogEnabled()) {
      return false;
    }
    if (side !== state.aiSide) {
      return false;
    }
    if (!defender || defender === "lake" || defender.side !== state.humanSide) {
      return false;
    }
    return !isKnownEnemyToAi(defender);
  }

  function expectedBattleScoreAgainstUnknown(attacker, defender, board) {
    if (!attacker || !defender) {
      return 0;
    }

    const counts = unknownEnemyTypeCounts(board);
    const defenderMoved = hasEnemyMovedToAi(defender);
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

  function unknownEnemyTypeCounts(board) {
    const counts = makeZeroCountMap();

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== state.humanSide) {
          continue;
        }

        if (isKnownEnemyToAi(piece)) {
          continue;
        }

        counts[piece.type] += 1;
      }
    }

    return counts;
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

  function evaluateBoard(board, perspective) {
    let total = 0;

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake") {
          continue;
        }

        const sign = piece.side === perspective ? 1 : -1;
        let value = PIECE_VALUE[piece.type] || 0;

        if (piece.movable) {
          value += 20;
          value += pressureByPosition(piece.side, r) * 5;
        }

        total += sign * value;
      }
    }

    total += flagSafetyScore(board, perspective);
    total -= flagSafetyScore(board, oppositeSide(perspective));

    return total;
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
      if (!isInside(nr, nc)) {
        continue;
      }
      const piece = board[nr][nc];
      if (piece && piece !== "lake" && piece.side === side && piece.type === "bomb") {
        score += 65;
      }
    }

    return score;
  }

  function pressureByPosition(side, row) {
    return side === "light" ? 9 - row : row;
  }

  function getAllLegalMoves(board, side) {
    const moves = [];
    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = board[r][c];
        if (!piece || piece === "lake" || piece.side !== side || !piece.movable) {
          continue;
        }
        const legal = getLegalMoves(board, r, c);
        legal.forEach((target) => {
          moves.push({ fromR: r, fromC: c, toR: target.r, toC: target.c });
        });
      }
    }
    return moves;
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

  function renderAll() {
    renderHud();
    renderBoard();
    renderBattleModal();
    renderDeploymentPanel();
    renderDuelPanel();
    renderInventoryPanel();
    renderLog();
  }

  function renderHud() {
    if (state.mode === "pvc") {
      el.hudMode.textContent = `PvC (${difficultyLabel(state.difficulty)})`;
    } else if (state.mode === "online") {
      const pinPart = state.online.pin ? ` PIN ${state.online.pin}` : "";
      el.hudMode.textContent = `Online PvP${pinPart}`;
    } else {
      el.hudMode.textContent = "PvP";
    }

    if (state.phase === "setup") {
      el.hudTurn.textContent = "-";
      el.hudStatus.textContent = "Configure mission settings.";
      return;
    }

    if (state.phase === "deploy") {
      el.hudTurn.textContent = `${sideLabel(state.deploymentSide)} Deployment`;
      const remaining = reserveTotal(state.deploymentSide);
      if (state.mode === "online" && state.deploymentSide !== state.humanSide) {
        el.hudStatus.textContent = `Waiting for ${sideLabel(state.deploymentSide)} commander...`;
      } else if (state.revealPending) {
        el.hudStatus.textContent = `Pass device to ${sideLabel(state.deploymentSide)}.`;
      } else if (remaining > 0) {
        el.hudStatus.textContent = `Place ${remaining} more unit${remaining === 1 ? "" : "s"}.`;
      } else {
        el.hudStatus.textContent = "All units placed. Confirm deployment.";
      }
      return;
    }

    if (state.gameOver) {
      el.hudTurn.textContent = `${sideLabel(state.winner)} Victory`;
      el.hudStatus.textContent = "Battle complete.";
      return;
    }

    el.hudTurn.textContent = `${sideLabel(state.currentTurn)}`;

    if (state.revealPending) {
      el.hudStatus.textContent = `Pass device to ${sideLabel(state.currentTurn)}.`;
      return;
    }

    if (state.animatingMove) {
      el.hudStatus.textContent = "Unit moving...";
      return;
    }

    if (state.resolvingBattle) {
      el.hudStatus.textContent = "Resolving duel...";
      return;
    }

    if (state.mode === "pvc" && state.currentTurn === state.aiSide) {
      el.hudStatus.textContent = "Computer is calculating a move...";
      return;
    }

    if (state.mode === "online" && state.currentTurn !== state.humanSide) {
      el.hudStatus.textContent = `Waiting for ${sideLabel(state.currentTurn)} commander...`;
      return;
    }

    if (state.selected) {
      el.hudStatus.textContent = "Select a highlighted destination.";
      return;
    }

    el.hudStatus.textContent = "Select one of your movable units.";
  }

  function renderBoard() {
    el.board.innerHTML = "";

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);

        if (isLake(r, c)) {
          cell.classList.add("lake");
          el.board.appendChild(cell);
          continue;
        }

        if (state.phase === "deploy" && isDeploymentCellForSide(r, c, state.deploymentSide)) {
          cell.classList.add("deploy-zone");
        }

        if (state.phase === "battle" && state.selected && state.selected.r === r && state.selected.c === c) {
          cell.classList.add("selected");
        }

        if (state.phase === "battle" && isLegalTarget(r, c)) {
          cell.classList.add("move-target");
        }

        if (isRecentStepCell(r, c)) {
          cell.classList.add("recent-step");
        }

        if (isCellSelectable(r, c)) {
          cell.classList.add("selectable");
        }

        const piece = state.board[r][c];
        if (piece) {
          const pieceEl = document.createElement("div");
          pieceEl.classList.add("piece", piece.side, `type-${piece.type}`);

          if (canViewPiece(piece)) {
            const rank = document.createElement("span");
            rank.className = "rank";
            rank.textContent = rankLabel(piece);
            pieceEl.appendChild(rank);
            pieceEl.title = `${piece.name} (${rankLabel(piece)})`;
          } else {
            pieceEl.classList.add("concealed");
            pieceEl.textContent = "?";
            pieceEl.title = `${sideLabel(piece.side)} unit`;
          }

          cell.appendChild(pieceEl);
        }

        el.board.appendChild(cell);
      }
    }
  }

  function animateMoveTransition(move) {
    if (!el.moveLayer || !el.boardWrap) {
      return Promise.resolve();
    }

    const fromCell = el.board.querySelector(
      `.cell[data-row="${move.fromR}"][data-col="${move.fromC}"]`
    );
    const toCell = el.board.querySelector(`.cell[data-row="${move.toR}"][data-col="${move.toC}"]`);
    const fromPiece = fromCell?.querySelector(".piece");
    if (!fromCell || !toCell || !fromPiece) {
      return Promise.resolve();
    }

    const boardWrapRect = el.boardWrap.getBoundingClientRect();
    const fromRect = fromPiece.getBoundingClientRect();
    const toRect = toCell.getBoundingClientRect();

    const clone = fromPiece.cloneNode(true);
    clone.classList.remove("moving-origin");
    clone.classList.add("flying-piece");
    clone.style.width = `${fromRect.width}px`;
    clone.style.height = `${fromRect.height}px`;
    clone.style.left = `${fromRect.left - boardWrapRect.left}px`;
    clone.style.top = `${fromRect.top - boardWrapRect.top}px`;

    const targetX =
      toRect.left - fromRect.left + (toRect.width - fromRect.width) / 2;
    const targetY =
      toRect.top - fromRect.top + (toRect.height - fromRect.height) / 2;

    fromPiece.classList.add("moving-origin");
    clearMoveLayer();
    el.moveLayer.appendChild(clone);

    return new Promise((resolve) => {
      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        fromPiece.classList.remove("moving-origin");
        clearMoveLayer();
        resolve();
      };

      const fallback = window.setTimeout(finish, MOVE_ANIMATION_MS + 80);
      clone.addEventListener(
        "transitionend",
        () => {
          window.clearTimeout(fallback);
          finish();
        },
        { once: true }
      );

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          clone.style.transform = `translate(${targetX}px, ${targetY}px)`;
        });
      });
    });
  }

  function clearMoveLayer() {
    if (!el.moveLayer) {
      return;
    }
    el.moveLayer.innerHTML = "";
  }

  function renderBattleModal() {
    if (!state.battleDialog) {
      el.battleModal.classList.add("hidden");
      return;
    }

    const card = el.battleModal.querySelector(".battle-card");
    card.classList.remove("theme-light", "theme-dark", "theme-both");
    card.classList.add(`theme-${state.battleDialog.winnerTheme || "both"}`);

    el.battleModal.classList.remove("hidden");
    el.battleTitle.textContent = `Battle at ${state.battleDialog.location}:`;
    el.battleLightLine.textContent = state.battleDialog.lightLine;
    el.battleDarkLine.textContent = state.battleDialog.darkLine;
    el.battleResultLine.textContent = state.battleDialog.winnerText;
  }

  function renderDeploymentPanel() {
    const isDeploy = state.phase === "deploy";
    el.deployPanel.classList.toggle("hidden", !isDeploy);

    if (!isDeploy || !state.deploymentSide) {
      return;
    }

    const side = state.deploymentSide;
    const remaining = reserveTotal(side);
    const waitingOnlineSide = state.mode === "online" && side !== state.humanSide;
    if (waitingOnlineSide) {
      el.deployInfo.textContent = `Waiting for ${sideLabel(side)} commander to deploy.`;
    } else if (state.revealPending) {
      el.deployInfo.textContent = `Awaiting handoff. Reveal for ${sideLabel(side)} commander.`;
    } else {
      el.deployInfo.textContent = `${sideLabel(side)}: ${remaining} unit${remaining === 1 ? "" : "s"} remaining.`;
    }

    el.piecePalette.innerHTML = "";

    PIECE_SPECS.forEach((spec) => {
      const left = state.deployReserve[side][spec.type];
      const btn = document.createElement("button");
      btn.className = "palette-btn";
      if (state.deploySelectedType === spec.type) {
        btn.classList.add("active");
      }
      btn.disabled = left <= 0 || state.revealPending || waitingOnlineSide;
      btn.textContent = `[${battleNumberFromType(spec.type)}] ${UNIT_SHORT_NAME[spec.type]} x${left}`;
      btn.addEventListener("click", () => {
        if (left <= 0) {
          return;
        }
        state.deploySelectedType = spec.type;
        renderDeploymentPanel();
      });
      el.piecePalette.appendChild(btn);
    });

    el.confirmDeployBtn.disabled = remaining > 0 || state.revealPending || waitingOnlineSide;
    el.autoDeployBtn.disabled = remaining === 0 || state.revealPending || waitingOnlineSide;
    el.clearDeployBtn.disabled = state.revealPending || waitingOnlineSide;
  }

  function renderDuelPanel() {
    if (!state.lastBattle) {
      el.duelPanel.classList.add("hidden");
      return;
    }

    el.duelPanel.classList.remove("hidden");
    el.duelNumbers.textContent = `${state.lastBattle.location}: ${state.lastBattle.numbers}`;
    el.duelWinner.textContent = state.lastBattle.winnerText;
  }

  function renderInventoryPanel() {
    const show = state.phase === "battle" || state.gameOver;
    el.inventoryPanel.classList.toggle("hidden", !show);

    if (!show) {
      return;
    }

    const counts = getCurrentInventoryCounts();
    renderInventoryList(el.inventoryLight, counts.light, state.pendingInventoryLoss.light);
    renderInventoryList(el.inventoryDark, counts.dark, state.pendingInventoryLoss.dark);
  }

  function renderInventoryList(container, sideCounts, pendingLoss) {
    container.innerHTML = "";

    INVENTORY_ORDER.forEach((type) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const right = document.createElement("span");
      right.className = "inventory-right";
      const count = document.createElement("span");
      const pending = pendingLoss[type] ?? 0;
      const shownCount = (sideCounts[type] ?? 0) + pending;
      count.className = "count";

      label.textContent = inventoryLabel(type);
      count.textContent = String(shownCount);

      right.appendChild(count);
      if (pending > 0) {
        const loss = document.createElement("span");
        loss.className = "row-loss";
        loss.textContent = `-${pending}`;
        right.appendChild(loss);
      }

      item.appendChild(label);
      item.appendChild(right);
      container.appendChild(item);
    });
  }

  function renderLog() {
    el.battleLog.innerHTML = "";
    state.battleLog.slice(0, 40).forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      el.battleLog.appendChild(item);
    });
  }

  function canViewPiece(piece) {
    if (state.gameOver) {
      return true;
    }

    if (state.mode === "pvc") {
      return piece.side === state.humanSide;
    }

    if (state.mode === "online") {
      return piece.side === state.humanSide;
    }

    if (!state.viewerSide) {
      return false;
    }

    return piece.side === state.viewerSide;
  }

  function isCellSelectable(row, col) {
    if (state.gameOver || state.revealPending || state.aiThinking || state.resolvingBattle || state.animatingMove) {
      return false;
    }

    if (state.phase === "deploy") {
      if (!state.deploymentSide || !isDeploymentCellForSide(row, col, state.deploymentSide)) {
        return false;
      }
      if (state.mode === "online" && state.deploymentSide !== state.humanSide) {
        return false;
      }

      const piece = state.board[row][col];
      if (piece && piece.side === state.deploymentSide) {
        return true;
      }

      if (!piece && state.deploySelectedType) {
        return (state.deployReserve[state.deploymentSide][state.deploySelectedType] ?? 0) > 0;
      }

      return false;
    }

    if (state.mode === "pvc" && state.currentTurn !== state.humanSide) {
      return false;
    }
    if (state.mode === "online" && state.currentTurn !== state.humanSide) {
      return false;
    }

    const piece = state.board[row][col];
    return !!piece && piece.side === state.currentTurn && piece.movable;
  }

  function isRecentStepCell(row, col) {
    if (!state.lastStep || !Array.isArray(state.lastStep.cells)) {
      return false;
    }

    return state.lastStep.cells.some((cell) => cell.r === row && cell.c === col);
  }

  function showOverlayForTurn() {
    showOverlay(
      `Pass To ${sideLabel(state.currentTurn)}`,
      "Hand over the device, then reveal the battlefield for the next commander."
    );
  }

  function showOverlay(title, text) {
    el.overlayTitle.textContent = title;
    el.overlayText.textContent = text;
    el.revealBtn.textContent = "Reveal Battlefield";
    el.turnOverlay.classList.remove("hidden");
  }

  function hideOverlay() {
    el.turnOverlay.classList.add("hidden");
  }

  function addLog(text) {
    state.battleLog.unshift(text);
    renderLog();
  }

  function unitLabel(piece) {
    if (!piece) {
      return "unit";
    }
    return `[${battleNumber(piece)}] ${UNIT_SHORT_NAME[piece.type]}`;
  }

  function rankLabel(piece) {
    if (piece.type === "flag") {
      return "🏁";
    }
    if (piece.type === "bomb") {
      return "💣";
    }
    if (piece.type === "spy") {
      return "1";
    }
    return String(piece.rank);
  }

  function battleNumber(piece) {
    if (!piece) {
      return "-";
    }
    if (piece.type === "flag") {
      return "🏁";
    }
    if (piece.type === "bomb") {
      return "💣";
    }
    if (piece.type === "spy") {
      return "1";
    }
    return String(piece.rank);
  }

  function battleNumberFromType(type) {
    if (type === "flag") {
      return "🏁";
    }
    if (type === "bomb") {
      return "💣";
    }
    if (type === "spy") {
      return "1";
    }
    return String(PIECE_SPEC_MAP[type].rank);
  }

  function battlePieceLabel(piece) {
    if (!piece) {
      return "[?] --";
    }
    return `[${battleNumber(piece)}] ${UNIT_SHORT_NAME[piece.type]}`;
  }

  function getCurrentInventoryCounts() {
    const counts = {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };

    for (let r = 0; r < BOARD_SIZE; r += 1) {
      for (let c = 0; c < BOARD_SIZE; c += 1) {
        const piece = state.board[r][c];
        if (!piece || piece === "lake") {
          continue;
        }
        counts[piece.side][piece.type] += 1;
      }
    }

    return counts;
  }

  function makeZeroCountMap() {
    const map = {};
    PIECE_SPECS.forEach((spec) => {
      map[spec.type] = 0;
    });
    return map;
  }

  function clearPendingInventoryLoss() {
    state.pendingInventoryLoss = {
      light: makeZeroCountMap(),
      dark: makeZeroCountMap(),
    };
    renderInventoryPanel();
  }

  function inventoryLabel(type) {
    return `[${battleNumberFromType(type)}] ${UNIT_SHORT_NAME[type]}`;
  }

  function isAiFogEnabled() {
    return state.mode === "pvc" && !!state.aiSide && !!state.humanSide;
  }

  function noteAiKnowledgeFromMovement(attacker) {
    if (!attacker || attacker.side !== state.humanSide) {
      return;
    }
    state.aiKnowledge.movedEnemyIds.add(attacker.id);
  }

  function noteAiKnowledgeFromBattle(attacker, defender) {
    [attacker, defender].forEach((piece) => {
      if (!piece || piece.side !== state.humanSide) {
        return;
      }
      state.aiKnowledge.knownEnemyIds.add(piece.id);
      if (piece.type === "bomb" || piece.type === "flag") {
        state.aiKnowledge.movedEnemyIds.delete(piece.id);
      }
    });
  }

  function isKnownEnemyToAi(piece) {
    return !!piece && state.aiKnowledge.knownEnemyIds.has(piece.id);
  }

  function hasEnemyMovedToAi(piece) {
    return !!piece && state.aiKnowledge.movedEnemyIds.has(piece.id);
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

  function shuffled(items) {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function sideLabel(side) {
    return side === "light" ? "Light Side" : "Dark Side";
  }

  function difficultyLabel(level) {
    return level.charAt(0).toUpperCase() + level.slice(1);
  }

  function oppositeSide(side) {
    return side === "light" ? "dark" : "light";
  }

  function reserveTotal(side) {
    if (!side) {
      return 0;
    }

    return Object.values(state.deployReserve[side]).reduce((sum, count) => sum + count, 0);
  }

  function reserveMapTotal(reserveMap) {
    if (!reserveMap) {
      return 0;
    }
    return Object.values(reserveMap).reduce((sum, count) => sum + (count || 0), 0);
  }

  function firstAvailableType(side) {
    if (!side) {
      return null;
    }

    for (const spec of PIECE_SPECS) {
      if ((state.deployReserve[side][spec.type] ?? 0) > 0) {
        return spec.type;
      }
    }

    return null;
  }

  function isDeploymentComplete(side) {
    return reserveTotal(side) === 0;
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
    if (!side) {
      return false;
    }
    if (isLake(row, col)) {
      return false;
    }
    if (side === "light") {
      return row >= 6 && row <= 9;
    }
    return row >= 0 && row <= 3;
  }

  function deploymentDepth(side, row) {
    return side === "light" ? 9 - row : row;
  }

  function nearestLakeDistance(row, col) {
    let dist = Infinity;

    for (const [lr, lc] of LAKE_COORDS) {
      dist = Math.min(dist, manhattan(row, col, lr, lc));
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

  function coordToText(row, col) {
    return `${String.fromCharCode(65 + col)}${row + 1}`;
  }

  function isLake(row, col) {
    return LAKES.has(`${row},${col}`);
  }

  function isInside(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function manhattan(r1, c1, r2, c2) {
    return Math.abs(r1 - r2) + Math.abs(c1 - c2);
  }
})();
