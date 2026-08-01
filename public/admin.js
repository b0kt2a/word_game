const socket = io();

const loginView = document.getElementById("loginView");
const controlView = document.getElementById("controlView");
const adminKeyInput = document.getElementById("adminKeyInput");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLoginStatus = document.getElementById("adminLoginStatus");

const participantCount = document.getElementById("participantCount");
const winnerCount = document.getElementById("winnerCount");
const questionNumber = document.getElementById("questionNumber");
const adminAnswer = document.getElementById("adminAnswer");
const adminHint = document.getElementById("adminHint");
const adminStatus = document.getElementById("adminStatus");
const winnerList = document.getElementById("winnerList");

const startBtn = document.getElementById("startBtn");
const hintBtn = document.getElementById("hintBtn");
const revealBtn = document.getElementById("revealBtn");
const nextBtn = document.getElementById("nextBtn");

function login() {
  const key = adminKeyInput.value;
  socket.emit("admin:join", { key });
}

adminLoginBtn.addEventListener("click", login);
adminKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

startBtn.addEventListener("click", () => socket.emit("admin:start"));
hintBtn.addEventListener("click", () => socket.emit("admin:showHint"));
revealBtn.addEventListener("click", () => socket.emit("admin:reveal"));
nextBtn.addEventListener("click", () => socket.emit("admin:next"));

socket.on("admin:error", (message) => {
  adminLoginStatus.textContent = message;
  adminLoginStatus.className = "status error";
});

socket.on("admin:state", (state) => {
  loginView.classList.add("hidden");
  controlView.classList.remove("hidden");

  participantCount.textContent = `${state.participantCount}명`;
  winnerCount.textContent = `${state.winnerCount}명`;

  questionNumber.textContent =
    state.questionNumber > 0
      ? `문제 ${state.questionNumber} / ${state.totalQuestions}`
      : "문제 없음";

  adminAnswer.textContent = state.answer || "-";
  adminHint.textContent = state.hint || "-";

  const phaseLabel = {
    waiting: "대기 중",
    playing: "문제 진행 중",
    revealed: "정답 공개됨"
  };

  adminStatus.textContent = phaseLabel[state.phase] || "";

  winnerList.innerHTML = "";

  if (!state.winners.length) {
    winnerList.innerHTML = '<div class="sub">아직 정답자가 없어.</div>';
    return;
  }

  state.winners.forEach((winner) => {
    const item = document.createElement("div");
    item.className = "winner";

    const seconds = Number.isFinite(winner.elapsedMs)
      ? `${Math.floor(winner.elapsedMs / 1000)}초`
      : "";

    item.innerHTML = `
      <b>${winner.rank}위</b>
      <span>${escapeHtml(winner.nickname)}</span>
      <span class="sub">${winner.attempt}회 · ${seconds}</span>
    `;

    winnerList.appendChild(item);
  });
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
