const socket = io();

const MAX_ATTEMPTS = 5;
let nickname = localStorage.getItem("bangpingNickname") || "";
let joined = false;
let currentQuestionId = null;
let attempts = [];
let wonQuestionId = null;

const joinView = document.getElementById("joinView");
const waitingView = document.getElementById("waitingView");
const gameView = document.getElementById("gameView");
const winnerView = document.getElementById("winnerView");
const revealView = document.getElementById("revealView");

const nicknameInput = document.getElementById("nicknameInput");
const joinBtn = document.getElementById("joinBtn");
const joinStatus = document.getElementById("joinStatus");
const waitingMeta = document.getElementById("waitingMeta");
const questionBadge = document.getElementById("questionBadge");
const gameMeta = document.getElementById("gameMeta");
const hintBox = document.getElementById("hintBox");
const board = document.getElementById("board");
const guessInput = document.getElementById("guessInput");
const guessBtn = document.getElementById("guessBtn");
const gameStatus = document.getElementById("gameStatus");
const rankText = document.getElementById("rankText");
const winnerDetail = document.getElementById("winnerDetail");
const revealedAnswer = document.getElementById("revealedAnswer");

nicknameInput.value = nickname;

function showOnly(view) {
  [joinView, waitingView, gameView, winnerView, revealView]
    .forEach((element) => element.classList.add("hidden"));
  view.classList.remove("hidden");
}

function join() {
  const value = nicknameInput.value.trim();
  if (!value) {
    joinStatus.textContent = "닉네임을 입력해줘.";
    joinStatus.className = "status error";
    return;
  }

  socket.emit("player:join", { nickname: value });
}

joinBtn.addEventListener("click", join);
nicknameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") join();
});

guessBtn.addEventListener("click", submitGuess);
guessInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitGuess();
});

function submitGuess() {
  if (attempts.length >= MAX_ATTEMPTS) return;

  const word = guessInput.value.trim();
  if (!word) {
    gameStatus.textContent = "단어를 입력해줘.";
    gameStatus.className = "status error";
    return;
  }

  socket.emit("player:guess", {
    word,
    attempt: attempts.length + 1
  });
}

function renderBoard(jamoLength) {
  board.innerHTML = "";

  for (let rowIndex = 0; rowIndex < MAX_ATTEMPTS; rowIndex += 1) {
    const row = document.createElement("div");
    row.className = "guess-row";
    row.style.gridTemplateColumns = `repeat(${jamoLength}, minmax(40px, 58px))`;

    const attempt = attempts[rowIndex];

    for (let colIndex = 0; colIndex < jamoLength; colIndex += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";

      if (attempt) {
        tile.textContent = attempt.jamo[colIndex] || "";
        tile.classList.add(attempt.result[colIndex]);
      }

      row.appendChild(tile);
    }

    board.appendChild(row);
  }
}

function formatRank(rank) {
  return `${rank}번째`;
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) return "";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

socket.on("player:joined", ({ nickname: joinedName }) => {
  nickname = joinedName;
  joined = true;
  localStorage.setItem("bangpingNickname", nickname);
  joinStatus.textContent = "";
  showOnly(waitingView);
});

socket.on("player:error", (message) => {
  gameStatus.textContent = message;
  gameStatus.className = "status error";
  joinStatus.textContent = message;
  joinStatus.className = "status error";
});

socket.on("game:state", (state) => {
  if (!joined) return;

  waitingMeta.textContent = `현재 참가자 ${state.participantCount}명`;

  if (state.questionId !== currentQuestionId) {
    currentQuestionId = state.questionId;
    attempts = [];
    wonQuestionId = null;
    guessInput.value = "";
    gameStatus.textContent = "";
  }

  if (state.phase === "waiting") {
    showOnly(waitingView);
    return;
  }

  if (wonQuestionId === state.questionId) {
    showOnly(winnerView);
    return;
  }

  if (state.phase === "revealed") {
    revealedAnswer.textContent = state.answer || "정답 공개";
    showOnly(revealView);
    return;
  }

  questionBadge.textContent = `문제 ${state.questionNumber} / ${state.totalQuestions}`;
  gameMeta.textContent = `자모 ${state.jamoLength}칸 · ${attempts.length}/${MAX_ATTEMPTS}회`;
  hintBox.textContent = state.hint || "";
  hintBox.classList.toggle("hidden", !state.hintVisible);
  renderBoard(state.jamoLength);
  showOnly(gameView);
  guessInput.focus();
});

socket.on("guess:result", (payload) => {
  if (!payload.ok) {
    if (payload.reason === "length") {
      gameStatus.textContent =
        `이 문제는 자모 ${payload.expectedLength}칸이야. 입력한 단어는 ${payload.actualLength}칸이야.`;
      gameStatus.className = "status error";
    }
    return;
  }

  attempts.push({
    jamo: payload.jamo,
    result: payload.result
  });

  guessInput.value = "";
  gameStatus.textContent = "";
  renderBoard(payload.jamo.length);

  if (payload.correct) {
    wonQuestionId = currentQuestionId;
    rankText.textContent = formatRank(payload.rank);
    winnerDetail.textContent =
      `${attempts.length}회 시도 · ${formatTime(payload.elapsedMs)}`;
    showOnly(winnerView);
    return;
  }

  if (attempts.length >= MAX_ATTEMPTS) {
    gameStatus.textContent = "기회를 모두 사용했어. 정답 공개를 기다려줘.";
    gameStatus.className = "status error";
    guessInput.disabled = true;
    guessBtn.disabled = true;
  } else {
    gameMeta.textContent = `남은 기회 ${MAX_ATTEMPTS - attempts.length}번`;
    guessInput.focus();
  }
});

socket.on("connect", () => {
  if (nickname) {
    socket.emit("player:join", { nickname });
  }
});
