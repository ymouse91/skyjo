const CARD_COUNTS = new Map([
  [-2, 5],
  [-1, 10],
  [0, 15],
  [1, 10],
  [2, 10],
  [3, 10],
  [4, 10],
  [5, 10],
  [6, 10],
  [7, 10],
  [8, 10],
  [9, 10],
  [10, 10],
  [11, 10],
  [12, 10],
]);

const TURN_ROTATION_DELAY_MS = 3000;
const AI_ACTION_DELAY_MS = 850;

const state = {
  players: [],
  deck: [],
  discard: [],
  round: 1,
  phase: "setup",
  currentPlayer: 0,
  selectedCard: null,
  selectedSource: null,
  drawnCard: null,
  finalStarter: null,
  finalTurnsLeft: 0,
  lastRoundStarter: 0,
  nextPlayer: null,
  turnDelayTimer: null,
  aiTimer: null,
  gameOver: false,
};

let shouldAnimatePlayerOrder = false;

const els = {
  setup: document.querySelector("#setup"),
  game: document.querySelector("#game"),
  setupForm: document.querySelector("#setup-form"),
  playerCount: document.querySelector("#player-count"),
  nameFields: document.querySelector("#name-fields"),
  players: document.querySelector("#players"),
  statusTitle: document.querySelector("#status-title"),
  statusText: document.querySelector("#status-text"),
  roundLabel: document.querySelector("#round-label"),
  deckCount: document.querySelector("#deck-count"),
  discardValue: document.querySelector("#discard-value"),
  drawPile: document.querySelector("#draw-pile"),
  discardPile: document.querySelector("#discard-pile"),
  drawnPanel: document.querySelector("#drawn-card-panel"),
  drawnCard: document.querySelector("#drawn-card"),
  rejectDrawn: document.querySelector("#reject-drawn"),
  scoreboard: document.querySelector("#scoreboard"),
  rulesDialog: document.querySelector("#rules-dialog"),
  roundDialog: document.querySelector("#round-dialog"),
  roundResults: document.querySelector("#round-results"),
  roundResultTitle: document.querySelector("#round-result-title"),
  continueButton: document.querySelector("#continue-button"),
};

function makeDeck() {
  const deck = [];
  for (const [value, count] of CARD_COUNTS) {
    for (let i = 0; i < count; i += 1) {
      deck.push(value);
    }
  }
  return shuffle(deck);
}

function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cardClass(value) {
  if (value < 0) return "negative";
  if (value === 0) return "zero";
  if (value >= 8) return "high";
  return "";
}

function addValueClass(element, value) {
  const valueClass = cardClass(value);
  if (valueClass) element.classList.add(valueClass);
}

function formatValue(value) {
  return value > 0 ? String(value) : String(value).replace("-", "\u2212");
}

function updateNameFields() {
  const count = Number(els.playerCount.value);
  els.nameFields.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "player-setup-row";

    const label = document.createElement("label");
    label.textContent = `Pelaaja ${i + 1}`;
    const input = document.createElement("input");
    input.className = "player-name-input";
    input.name = `player-${i}`;
    input.value = `Pelaaja ${i + 1}`;
    input.autocomplete = "off";
    label.append(input);

    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Tyyppi";
    const select = document.createElement("select");
    select.className = "player-type-select";
    select.name = `player-type-${i}`;
    select.innerHTML = `
      <option value="human">Ihminen</option>
      <option value="ai">Tekoäly</option>
    `;
    typeLabel.append(select);

    row.append(label, typeLabel);
    els.nameFields.append(row);
  }
}

function startGame(event) {
  event.preventDefault();
  const rows = [...els.nameFields.querySelectorAll(".player-setup-row")];
  const players = rows.map((row, index) => {
    const input = row.querySelector(".player-name-input");
    const type = row.querySelector(".player-type-select").value;
    const defaultName = type === "ai" ? `Tekoäly ${index + 1}` : `Pelaaja ${index + 1}`;
    const name = input.value.trim() || defaultName;
    return {
      name,
      isAi: type === "ai",
      score: 0,
      roundScore: 0,
      board: [],
      openedForSetup: 0,
    };
  });

  state.players = players;
  state.round = 1;
  state.lastRoundStarter = 0;
  state.gameOver = false;
  dealRound();
  els.setup.classList.add("hidden");
  els.game.classList.remove("hidden");
  render();
}

function dealRound() {
  clearAiTimer();
  clearTurnDelay();
  state.deck = makeDeck();
  state.discard = [];
  state.phase = "setup";
  state.currentPlayer = 0;
  state.selectedCard = null;
  state.selectedSource = null;
  state.drawnCard = null;
  state.finalStarter = null;
  state.finalTurnsLeft = 0;
  state.nextPlayer = null;

  for (const player of state.players) {
    player.board = Array.from({ length: 12 }, () => ({
      value: state.deck.pop(),
      faceUp: false,
      removed: false,
    }));
    player.openedForSetup = 0;
    player.roundScore = 0;
  }

  state.discard.push(state.deck.pop());
  revealAiSetupCards();
  advanceFromSetupIfReady();
}

function revealSetupCard(playerIndex, cardIndex) {
  const player = state.players[playerIndex];
  if (player.isAi) return;
  const card = player.board[cardIndex];
  if (state.phase !== "setup" || card.faceUp || player.openedForSetup >= 2) return;
  card.faceUp = true;
  player.openedForSetup += 1;
  checkColumns(player);

  advanceFromSetupIfReady();
  render();
}

function revealAiSetupCards() {
  for (const player of state.players) {
    if (!player.isAi) continue;
    while (player.openedForSetup < 2) {
      const cardIndex = chooseRandomHiddenCardIndex(player);
      if (cardIndex === -1) break;
      player.board[cardIndex].faceUp = true;
      player.openedForSetup += 1;
    }
    checkColumns(player);
  }
}

function advanceFromSetupIfReady() {
  if (!state.players.every((p) => p.openedForSetup === 2)) return;

  if (state.round === 1) {
    const totals = state.players.map((player) => visibleTotal(player));
    const highest = Math.max(...totals);
    state.currentPlayer = totals.findIndex((total) => total === highest);
  } else {
    state.currentPlayer = state.lastRoundStarter;
  }
  state.phase = "choose";
}

function visibleTotal(player) {
  return player.board.reduce((sum, card) => {
    if (card.removed || !card.faceUp) return sum;
    return sum + card.value;
  }, 0);
}

function roundTotal(player) {
  return player.board.reduce((sum, card) => {
    if (card.removed) return sum;
    return sum + card.value;
  }, 0);
}

function drawFromDeck() {
  if (state.phase !== "choose") return;
  recycleDiscardIfNeeded();
  state.drawnCard = state.deck.pop();
  state.phase = "drawn";
  render();
}

function takeDiscard() {
  if (state.phase !== "choose" || state.discard.length === 0) return;
  state.selectedCard = state.discard.pop();
  state.selectedSource = "discard";
  state.phase = "swap";
  render();
}

function rejectDrawn() {
  if (state.phase !== "drawn") return;
  state.discard.push(state.drawnCard);
  state.drawnCard = null;
  state.phase = "flip";
  render();
}

function swapWithCard(playerIndex, cardIndex) {
  if (!["swap", "drawn"].includes(state.phase)) return;
  if (playerIndex !== state.currentPlayer) return;
  const player = state.players[playerIndex];
  const target = player.board[cardIndex];
  if (!target || target.removed) return;

  const incoming = state.phase === "drawn" ? state.drawnCard : state.selectedCard;
  state.discard.push(target.value);
  player.board[cardIndex] = {
    value: incoming,
    faceUp: true,
    removed: false,
  };
  state.drawnCard = null;
  state.selectedCard = null;
  state.selectedSource = null;
  checkColumns(player);
  finishTurn();
}

function flipOwnCard(playerIndex, cardIndex) {
  if (state.phase !== "flip" || playerIndex !== state.currentPlayer) return;
  const player = state.players[playerIndex];
  const card = player.board[cardIndex];
  if (!card || card.removed || card.faceUp) return;
  card.faceUp = true;
  checkColumns(player);
  finishTurn();
}

function checkColumns(player) {
  for (let column = 0; column < 4; column += 1) {
    const indexes = [column, column + 4, column + 8];
    const cards = indexes.map((index) => player.board[index]);
    if (cards.every((card) => card && !card.removed && card.faceUp && card.value === cards[0].value)) {
      for (const index of indexes) {
        state.discard.push(player.board[index].value);
        player.board[index].removed = true;
      }
    }
  }
}

function finishTurn() {
  clearAiTimer();
  const active = state.players[state.currentPlayer];
  const allOpen = active.board.every((card) => card.removed || card.faceUp);

  if (state.finalStarter === null && allOpen) {
    state.finalStarter = state.currentPlayer;
    state.finalTurnsLeft = state.players.length - 1;
  } else if (state.finalStarter !== null && state.currentPlayer !== state.finalStarter) {
    state.finalTurnsLeft -= 1;
  }

  if (state.finalStarter !== null && state.finalTurnsLeft <= 0) {
    scoreRound();
    return;
  }

  let nextPlayer = state.currentPlayer;
  do {
    nextPlayer = (nextPlayer + 1) % state.players.length;
  } while (nextPlayer === state.finalStarter && state.finalTurnsLeft > 0);

  state.nextPlayer = nextPlayer;
  state.phase = "betweenTurns";
  render();
  state.turnDelayTimer = window.setTimeout(() => {
    state.currentPlayer = nextPlayer;
    state.nextPlayer = null;
    state.phase = "choose";
    state.turnDelayTimer = null;
    shouldAnimatePlayerOrder = true;
    render();
  }, TURN_ROTATION_DELAY_MS);
}

function clearTurnDelay() {
  if (state.turnDelayTimer === null) return;
  window.clearTimeout(state.turnDelayTimer);
  state.turnDelayTimer = null;
}

function clearAiTimer() {
  if (state.aiTimer === null) return;
  window.clearTimeout(state.aiTimer);
  state.aiTimer = null;
}

function recycleDiscardIfNeeded() {
  if (state.deck.length > 0 || state.discard.length <= 1) return;
  const top = state.discard.pop();
  state.deck = shuffle(state.discard);
  state.discard = [top];
}

function scoreRound() {
  for (const player of state.players) {
    for (const card of player.board) {
      if (!card.removed) card.faceUp = true;
    }
    checkColumns(player);
    player.roundScore = roundTotal(player);
  }

  const finisher = state.players[state.finalStarter];
  const rawFinisherScore = finisher.roundScore;
  const lowest = Math.min(...state.players.map((player) => player.roundScore));
  const singleLowest = state.players.filter((player) => player.roundScore === lowest).length === 1;
  if (rawFinisherScore > 0 && !(singleLowest && rawFinisherScore === lowest)) {
    finisher.roundScore *= 2;
  }

  for (const player of state.players) {
    player.score += player.roundScore;
  }

  state.lastRoundStarter = state.finalStarter;
  state.phase = "scored";
  state.gameOver = state.players.some((player) => player.score >= 100);
  showRoundResults();
  render();
}

function showRoundResults() {
  const sorted = [...state.players].sort((a, b) => a.score - b.score);
  els.roundResultTitle.textContent = state.gameOver ? "Peli valmis" : "Kierros valmis";
  els.roundResults.innerHTML = "";
  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "result-row";
    row.innerHTML = `
      <strong class="${player === sorted[0] ? "winner" : ""}">${player.name}</strong>
      <span>Kierros ${player.roundScore}</span>
      <span>Yht. ${player.score}</span>
    `;
    els.roundResults.append(row);
  }
  els.continueButton.textContent = state.gameOver ? "Uusi peli" : "Seuraava kierros";
  els.roundDialog.showModal();
}

function continueAfterRound() {
  els.roundDialog.close();
  if (state.gameOver) {
    resetToSetup();
    return;
  }
  state.round += 1;
  dealRound();
  state.currentPlayer = state.lastRoundStarter;
  render();
}

function resetToSetup() {
  clearAiTimer();
  clearTurnDelay();
  els.game.classList.add("hidden");
  els.setup.classList.remove("hidden");
  state.players = [];
  updateNameFields();
}

function render() {
  renderStatus();
  renderCenter();
  renderPlayers();
  renderScoreboard();
  scheduleAiAction();
}

function renderStatus() {
  els.roundLabel.textContent = `Kierros ${state.round}`;
  const player = state.players[state.currentPlayer];
  if (state.phase === "setup") {
    els.statusTitle.textContent = "Avaa aloituskortit";
    els.statusText.textContent = "Jokainen pelaaja avaa kaksi omaa korttiaan.";
  } else if (state.phase === "choose") {
    els.statusTitle.textContent = `${player.name}: valitse pino`;
    const final = state.finalStarter === null ? "" : ` Loppukierros: ${state.finalTurnsLeft} vuoroa jäljellä.`;
    const actionText = player.isAi ? "Tekoäly miettii poistopakkaa ja nostopakkaa." : "Ota avoin poistokortti tai nosta sokkona.";
    els.statusText.textContent = actionText + final;
  } else if (state.phase === "drawn") {
    els.statusTitle.textContent = `${player.name}: pidä vai hylkää`;
    els.statusText.textContent = "Vaihda nostettu kortti ruudukkoon tai hylkää se ja avaa yksi peitetty kortti.";
  } else if (state.phase === "swap") {
    els.statusTitle.textContent = `${player.name}: vaihda kortti`;
    els.statusText.textContent = "Valitse omasta ruudukosta kortti, jonka tilalle poistopakan kortti tulee.";
  } else if (state.phase === "flip") {
    els.statusTitle.textContent = `${player.name}: avaa kortti`;
    els.statusText.textContent = "Valitse yksi oma peitetty kortti avattavaksi.";
  } else if (state.phase === "betweenTurns") {
    const nextPlayer = state.players[state.nextPlayer];
    els.statusTitle.textContent = `${player.name}: vuoro valmis`;
    els.statusText.textContent = `Katsotaan asetettu kortti hetki. ${nextPlayer.name} jatkaa pian.`;
  } else {
    els.statusTitle.textContent = "Pisteytys";
    els.statusText.textContent = "Kierroksen tulokset on laskettu.";
  }
}

function renderCenter() {
  els.deckCount.textContent = state.deck.length;
  els.discardValue.textContent = state.discard.length ? formatValue(state.discard.at(-1)) : "-";
  const pilesSelectable = state.phase === "choose" && !isAiTurn();
  els.discardPile.disabled = !pilesSelectable;
  els.drawPile.disabled = !pilesSelectable;
  els.discardPile.classList.toggle("selectable", pilesSelectable);
  els.drawPile.classList.toggle("selectable", pilesSelectable);

  if (state.phase === "drawn") {
    els.drawnPanel.classList.remove("hidden");
    els.drawnCard.textContent = formatValue(state.drawnCard);
    els.drawnCard.className = "card revealed";
    addValueClass(els.drawnCard, state.drawnCard);
    els.rejectDrawn.disabled = isAiTurn();
  } else {
    els.drawnPanel.classList.add("hidden");
    els.rejectDrawn.disabled = false;
  }
}

function renderPlayers() {
  const previousRects = shouldAnimatePlayerOrder ? capturePlayerRects() : new Map();
  els.players.innerHTML = "";
  for (const playerIndex of playerDisplayOrder()) {
    const player = state.players[playerIndex];
    const board = document.createElement("article");
    board.className = "player-board";
    board.dataset.playerIndex = String(playerIndex);
    if (playerIndex === state.currentPlayer && state.phase !== "setup") board.classList.add("active");
    if (isDimmedPlayer(playerIndex)) board.classList.add("dimmed");
    if (state.finalStarter === playerIndex) board.classList.add("finished");

    const head = document.createElement("header");
    head.className = "player-head";
    head.innerHTML = `
      <h3>${escapeHtml(player.name)}${player.isAi ? '<span class="ai-badge">AI</span>' : ""}</h3>
      <span class="player-total">Näkyvissä ${visibleTotal(player)}</span>
    `;

    const grid = document.createElement("div");
    grid.className = "grid";

    player.board.forEach((card, cardIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card";
      if (card.removed) {
        button.classList.add("removed");
        button.disabled = true;
      } else if (card.faceUp) {
        button.classList.add("revealed");
        addValueClass(button, card.value);
        button.textContent = formatValue(card.value);
      } else {
        button.classList.add("face-down");
        button.textContent = "?";
      }

      if (isSelectable(playerIndex, cardIndex)) {
        button.classList.add("selectable");
      }

      button.addEventListener("click", () => handleCardClick(playerIndex, cardIndex));
      grid.append(button);
    });

    if (state.phase === "betweenTurns" && playerIndex === state.currentPlayer) {
      const overlay = document.createElement("div");
      overlay.className = "turn-wait-overlay";
      overlay.innerHTML = `
        <span class="ios-spinner" aria-hidden="true"></span>
        <span>Hetki</span>
      `;
      grid.append(overlay);
    }

    const message = document.createElement("p");
    message.className = "message";
    message.textContent = playerMessage(player, playerIndex);

    board.append(head, grid, message);
    els.players.append(board);
  }
  animatePlayerReorder(previousRects);
  shouldAnimatePlayerOrder = false;
}

function playerDisplayOrder() {
  if (state.phase === "setup" || state.players.length === 0) {
    return state.players.map((_, index) => index);
  }

  return state.players.map((_, offset) => (state.currentPlayer + offset) % state.players.length);
}

function isDimmedPlayer(playerIndex) {
  if (state.phase === "setup" || state.phase === "scored") return false;
  return playerIndex !== state.currentPlayer;
}

function capturePlayerRects() {
  const rects = new Map();
  els.players.querySelectorAll(".player-board").forEach((board) => {
    rects.set(board.dataset.playerIndex, board.getBoundingClientRect());
  });
  return rects;
}

function animatePlayerReorder(previousRects) {
  if (previousRects.size === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  els.players.querySelectorAll(".player-board").forEach((board) => {
    const previous = previousRects.get(board.dataset.playerIndex);
    if (!previous) return;

    const current = board.getBoundingClientRect();
    const deltaX = previous.left - current.left;
    const deltaY = previous.top - current.top;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

    board.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.92 },
        { transform: "translate(0, 0)", opacity: 1 },
      ],
      {
        duration: 700,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  });
}

function isSelectable(playerIndex, cardIndex) {
  const card = state.players[playerIndex].board[cardIndex];
  if (!card || card.removed) return false;
  if (state.phase === "setup") {
    return !state.players[playerIndex].isAi && !card.faceUp && state.players[playerIndex].openedForSetup < 2;
  }
  if (isAiTurn()) return false;
  if (playerIndex !== state.currentPlayer) return false;
  if (state.phase === "swap" || state.phase === "drawn") return true;
  if (state.phase === "flip") return !card.faceUp;
  return false;
}

function handleCardClick(playerIndex, cardIndex) {
  if (!isSelectable(playerIndex, cardIndex)) return;
  if (state.phase === "setup") revealSetupCard(playerIndex, cardIndex);
  else if (state.phase === "swap" || state.phase === "drawn") swapWithCard(playerIndex, cardIndex);
  else if (state.phase === "flip") flipOwnCard(playerIndex, cardIndex);
}

function playerMessage(player, playerIndex) {
  if (state.phase === "setup") {
    return player.openedForSetup < 2 ? `Avaa ${2 - player.openedForSetup} korttia.` : "Aloituskortit avattu.";
  }
  if (state.phase === "betweenTurns" && state.currentPlayer === playerIndex) return "Vuoro valmis.";
  if (state.currentPlayer === playerIndex && player.isAi && ["choose", "drawn", "swap", "flip"].includes(state.phase)) {
    return shouldAiPushForFinish(player) ? "Tekoäly yrittää päättää kierroksen." : "Tekoäly miettii.";
  }
  if (state.finalStarter === playerIndex) return "Päätti kierroksen.";
  if (state.currentPlayer === playerIndex) return "Vuorossa.";
  return "";
}

function isAiTurn() {
  return state.players[state.currentPlayer]?.isAi && ["choose", "drawn", "swap", "flip"].includes(state.phase);
}

function scheduleAiAction() {
  if (!isAiTurn() || state.aiTimer !== null) return;
  state.aiTimer = window.setTimeout(() => {
    state.aiTimer = null;
    runAiAction();
  }, AI_ACTION_DELAY_MS);
}

function runAiAction() {
  const player = state.players[state.currentPlayer];
  if (!player?.isAi) return;

  if (state.phase === "choose") {
    const closingMode = shouldAiPushForFinish(player);
    const discardValue = state.discard.at(-1);
    const targetIndex = chooseSwapTarget(player, discardValue, { allowHidden: !closingMode && discardValue <= 4 });
    if (targetIndex !== -1 && shouldTakeDiscard(player, discardValue, targetIndex)) {
      takeDiscard();
      return;
    }
    drawFromDeck();
    return;
  }

  if (state.phase === "drawn") {
    const closingMode = shouldAiPushForFinish(player);
    const targetIndex = chooseSwapTarget(player, state.drawnCard, { allowHidden: !closingMode && state.drawnCard <= 5 });
    if (targetIndex !== -1 && shouldKeepDrawn(player, state.drawnCard, targetIndex, closingMode)) {
      swapWithCard(state.currentPlayer, targetIndex);
      return;
    }
    rejectDrawn();
    return;
  }

  if (state.phase === "swap") {
    const targetIndex = chooseSwapTarget(player, state.selectedCard, { allowHidden: state.selectedCard <= 4 });
    swapWithCard(state.currentPlayer, targetIndex === -1 ? firstAvailableCardIndex(player) : targetIndex);
    return;
  }

  if (state.phase === "flip") {
    const cardIndex = chooseFlipTarget(player);
    if (cardIndex !== -1) flipOwnCard(state.currentPlayer, cardIndex);
  }
}

function shouldTakeDiscard(player, value, targetIndex) {
  const target = player.board[targetIndex];
  if (!target) return false;
  if (!target.faceUp) return value <= 3;
  return value < target.value || completesColumn(player, targetIndex, value);
}

function shouldKeepDrawn(player, value, targetIndex, closingMode = false) {
  const target = player.board[targetIndex];
  if (!target) return false;
  if (completesColumn(player, targetIndex, value)) return true;
  if (closingMode && !target.faceUp) return false;
  if (closingMode && target.faceUp) return value <= target.value - 2 || value <= 0;
  if (!target.faceUp) return value <= 4;
  return value <= target.value - 1 || value <= 2;
}

function chooseSwapTarget(player, value, options = {}) {
  const columnIndex = columnCompletionTarget(player, value);
  if (columnIndex !== -1) return columnIndex;

  const visible = player.board
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.removed && card.faceUp)
    .sort((a, b) => b.card.value - a.card.value);
  if (visible.length > 0 && value < visible[0].card.value) return visible[0].index;

  if (options.allowHidden) return chooseRandomHiddenCardIndex(player);
  return -1;
}

function chooseFlipTarget(player) {
  const hidden = hiddenCardIndexes(player);
  if (hidden.length === 0) return -1;

  const promisingColumn = hidden.find((index) => {
    const column = index % 4;
    const visibleValues = [column, column + 4, column + 8]
      .map((cardIndex) => player.board[cardIndex])
      .filter((card) => card && !card.removed && card.faceUp)
      .map((card) => card.value);
    return visibleValues.length >= 1 && new Set(visibleValues).size === 1;
  });

  return promisingColumn ?? hidden[Math.floor(Math.random() * hidden.length)];
}

function columnCompletionTarget(player, value) {
  for (let column = 0; column < 4; column += 1) {
    const indexes = [column, column + 4, column + 8];
    const cards = indexes.map((index) => player.board[index]);
    const target = indexes.find((index) => {
      const card = player.board[index];
      return card && !card.removed && (!card.faceUp || card.value !== value);
    });
    const matchingOpen = cards.filter((card) => card && !card.removed && card.faceUp && card.value === value).length;
    const available = cards.filter((card) => card && !card.removed).length;
    if (matchingOpen === 2 && available === 3 && target !== undefined) return target;
  }
  return -1;
}

function completesColumn(player, targetIndex, value) {
  const column = targetIndex % 4;
  const indexes = [column, column + 4, column + 8];
  return indexes
    .filter((index) => index !== targetIndex)
    .every((index) => {
      const card = player.board[index];
      return card && !card.removed && card.faceUp && card.value === value;
    });
}

function firstAvailableCardIndex(player) {
  return player.board.findIndex((card) => !card.removed);
}

function chooseRandomHiddenCardIndex(player) {
  const indexes = hiddenCardIndexes(player);
  if (indexes.length === 0) return -1;
  return indexes[Math.floor(Math.random() * indexes.length)];
}

function hiddenCardIndexes(player) {
  return player.board
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !card.removed && !card.faceUp)
    .map(({ index }) => index);
}

function shouldAiPushForFinish(player) {
  const hiddenCount = hiddenCardIndexes(player).length;
  if (hiddenCount === 0 || hiddenCount > 3) return false;

  const standings = visibleStandings();
  const own = standings.find((entry) => entry.player === player);
  if (!own) return false;

  const bestVisible = Math.min(...standings.map((entry) => entry.visible));
  const tiedForBest = own.visible === bestVisible;
  const withinFinishWindow = own.visible <= bestVisible + 4;
  const visibleCards = player.board.filter((card) => !card.removed && card.faceUp).length;

  return visibleCards >= 6 && (tiedForBest || withinFinishWindow);
}

function visibleStandings() {
  return state.players.map((player) => ({
    player,
    visible: visibleTotal(player),
  }));
}

function renderScoreboard() {
  els.scoreboard.innerHTML = "";
  const sorted = [...state.players].sort((a, b) => a.score - b.score);
  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `<strong>${escapeHtml(player.name)}</strong><span>${player.score}</span>`;
    els.scoreboard.append(row);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

els.playerCount.addEventListener("change", updateNameFields);
els.setupForm.addEventListener("submit", startGame);
els.drawPile.addEventListener("click", drawFromDeck);
els.discardPile.addEventListener("click", takeDiscard);
els.rejectDrawn.addEventListener("click", rejectDrawn);
els.continueButton.addEventListener("click", continueAfterRound);
document.querySelector("#new-game-button").addEventListener("click", resetToSetup);
document.querySelector("#rules-button").addEventListener("click", () => els.rulesDialog.showModal());
document.querySelector("#close-rules").addEventListener("click", () => els.rulesDialog.close());

updateNameFields();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
