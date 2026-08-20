const socket = io();
const $ = id => document.getElementById(id);

let state = null;
let draft = "";
let lastQuestionId = null;
let playerId = localStorage.getItem("bangpingPlayerId") || "";
let nickname = localStorage.getItem("bangpingNickname") || "";
let toastTimer = null;

if (nickname) $("nickname").value = nickname;

$("joinBtn").onclick = join;
$("submitBtn").onclick = submit;
$("hintBtn").onclick = () => {
  if (state?.phase === "playing" && !state?.solved) socket.emit("player:hint");
};

$("board").addEventListener("click", focusWordInput);
$("board").addEventListener("keydown", event => {
  if (event.key === "Enter") focusWordInput();
});

// 키보드 입력 내용을 현재 활성 줄에 실시간 표시
$("word").addEventListener("input", event => {
  draft = event.target.value;
  renderBoard();
});

// 모바일 키보드의 완료/Enter로도 제출
$("word").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    submit();
  }
});

// 화면 OFF/ON, 네트워크 전환 등으로 소켓이 재연결되면 기존 참가자로 자동 복구
socket.on("connect", () => {
  if (nickname) socket.emit("player:join", { nickname, playerId });
});

function join() {
  nickname = $("nickname").value.trim();
  if (!nickname) {
    showToast("닉네임을 입력해줘!", "error");
    return;
  }
  socket.emit("player:join", { nickname, playerId });
}

socket.on("player:joined", data => {
  playerId = data.playerId;
  nickname = data.nickname;
  localStorage.setItem("bangpingPlayerId", playerId);
  localStorage.setItem("bangpingNickname", nickname);
  $("joinCard").classList.add("hidden");
  $("gameCard").classList.remove("hidden");
});

socket.on("game:state", serverState => {
  $("people").textContent = `${serverState.participantCount}명 접속`;
});

socket.on("player:state", serverState => {
  // 새 문제로 넘어가면 이전 문제에서 타이핑 중이던 글자는 제거
  if (lastQuestionId !== null && lastQuestionId !== serverState.questionId) clearDraft();
  lastQuestionId = serverState.questionId;
  state = serverState;
  render();
});

socket.on("player:error", message => showToast(message, "error"));

socket.on("guess:result", result => {
  if (!result.ok) {
    showToast(`⚠️ ${result.expectedLength}칸을 입력해야 해!`, "error");
    shakeActiveRow();
    return;
  }
  clearDraft();
});

function submit() {
  if (!state || state.phase !== "playing" || state.solved || state.attempts >= 5) return;

  if (!draft.trim()) {
    showToast("정답을 입력해줘!", "error");
    shakeActiveRow();
    focusWordInput();
    return;
  }

  socket.emit("player:guess", { word: draft });
}

function focusWordInput() {
  if (!state || state.phase !== "playing" || state.solved || state.attempts >= 5) return;
  $("word").focus();
}

function clearDraft() {
  draft = "";
  $("word").value = "";
}

function render() {
  if (!state) return;

  $("people").textContent = `${state.participantCount}명 접속`;
  $("mode").textContent = state.mode;

  if (state.questionNumber <= 0) {
    $("qTitle").textContent = "대기 중";
    $("meta").textContent = "게임 시작을 기다려줘";
    $("board").innerHTML = "";
    $("hints").innerHTML = "";
    $("hintBtn").disabled = true;
    $("submitBtn").disabled = true;
    $("answerReveal").classList.add("hidden");
    return;
  }

  $("qTitle").textContent = `문제 ${state.questionNumber} / ${state.totalQuestions}`;
  $("meta").textContent = `${state.unitLength}칸 · ${state.attempts}/5회 · 💡 ${state.hintsUsed}/${state.hintsTotal}`;

  renderBoard();

  $("hints").innerHTML = (state.revealedHints || [])
    .map((hint, index) => `<div class="hint"><b>힌트 ${index + 1}</b> ${escapeHtml(hint)}</div>`)
    .join("");

  const locked = state.phase !== "playing" || state.solved || state.attempts >= 5;
  $("word").disabled = locked;
  $("submitBtn").disabled = locked;
  $("hintBtn").disabled = state.phase !== "playing" || state.solved || state.hintsUsed >= state.hintsTotal;
  $("hintBtn").textContent = state.hintsUsed >= state.hintsTotal
    ? "💡 힌트 모두 사용"
    : `💡 힌트 보기 (${state.hintsUsed}/${state.hintsTotal})`;

  // 운영자가 정답 공개를 누르면, 풀이 여부와 상관없이 정답 표시 + 입력 잠금
  if (state.phase === "revealed") {
    $("revealedAnswer").textContent = state.answer || "";
    $("answerReveal").classList.remove("hidden");
    $("status").textContent = state.solved
      ? `${state.rank}번째 정답 · +${state.score || 0}점`
      : "이번 문제는 종료됐어";
    return;
  }

  $("answerReveal").classList.add("hidden");

  if (state.solved) {
    $("status").textContent = `🎉 정답! ${state.rank}번째 · +${state.score || 0}점 · ${formatTime(state.elapsedMs)}`;
  } else if (state.attempts >= 5) {
    $("status").textContent = "5번의 도전을 모두 사용했어!";
  } else if (state.phase === "waiting") {
    $("status").textContent = "다음 문제를 준비 중이야";
  } else {
    $("status").textContent = "게임판을 누르고 정답을 입력해줘";
  }
}

function renderBoard() {
  if (!state || state.unitLength <= 0) {
    $("board").innerHTML = "";
    return;
  }

  const length = state.unitLength;
  const draftUnits = displayUnits(draft, state.mode);
  let html = "";

  for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    const guess = state.guesses[rowIndex];
    const isActive = state.phase === "playing" && !state.solved && state.attempts < 5 && rowIndex === state.attempts;

    html += `<div class="guess-row ${isActive ? "active-row" : ""}" data-row="${rowIndex}" style="--cols:${length}">`;

    for (let columnIndex = 0; columnIndex < length; columnIndex++) {
      let value = "";
      let resultClass = "";

      if (guess) {
        value = guess.units[columnIndex] || "";
        resultClass = guess.result[columnIndex] || "";
      } else if (isActive) {
        value = draftUnits[columnIndex] || "";
      }

      html += `<div class="cell ${resultClass} ${isActive ? "draft-cell" : ""}">${escapeHtml(value)}</div>`;
    }

    html += "</div>";
  }

  $("board").innerHTML = html;
}

// 서버의 자모/단어 판정과 같은 방식으로 현재 입력을 화면에 표시
function displayUnits(text, mode) {
  const clean = String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9]/g, "");

  if (mode === "단어") return Array.from(clean).map(v => v.toUpperCase());

  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const output = [];

  for (const character of clean) {
    const code = character.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const index = code - 0xAC00;
      const cho = Math.floor(index / 588);
      const jung = Math.floor((index % 588) / 28);
      const jong = index % 28;
      output.push(CHO[cho], JUNG[jung]);
      if (jong) output.push(JONG[jong]);
    } else {
      output.push(character.toUpperCase());
    }
  }

  return output;
}

function showToast(message, type = "error") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2200);
}

function shakeActiveRow() {
  const row = document.querySelector(".guess-row.active-row");
  if (!row) return;
  row.classList.remove("shake");
  void row.offsetWidth;
  row.classList.add("shake");
  setTimeout(() => row.classList.remove("shake"), 450);
}

function formatTime(ms) {
  if (ms == null) return "";
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}
