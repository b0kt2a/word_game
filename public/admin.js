const socket = io();
const $ = id => document.getElementById(id);

let key = sessionStorage.getItem("bangpingAdminKey") || "";
if (key) $("key").value = key;

// 휴대폰 화면 OFF/ON, 네트워크 변경 등으로 소켓이 재연결되면 자동 재인증
socket.on("connect", () => {
  if (key) socket.emit("admin:join", { key });
});

$("loginBtn").onclick = login;

function login() {
  key = $("key").value;
  socket.emit("admin:join", { key });
}

socket.on("admin:error", message => {
  $("notice").textContent = message;
});

socket.on("admin:notice", message => {
  $("notice").textContent = message;
});

socket.on("admin:state", state => {
  sessionStorage.setItem("bangpingAdminKey", key);
  $("login").classList.add("hidden");
  $("console").classList.remove("hidden");
  render(state);
});

$("start").onclick = () => socket.emit("admin:start");
$("next").onclick = () => socket.emit("admin:next");
$("reveal").onclick = () => socket.emit("admin:reveal");

$("upload").onclick = () => {
  socket.emit("admin:load-bundled-csv");
};

$("download").onclick = () => {
  window.location = `/api/export.csv?key=${encodeURIComponent(key)}`;
};

$("reset").onclick = () => {
  if (confirm("누적 기록을 모두 초기화할까?")) socket.emit("admin:reset");
};

function render(state) {
  $("phase").textContent = state.phase === "playing"
    ? "문제 진행 중"
    : state.phase === "revealed"
      ? "정답 공개"
      : "대기 중";

  $("question").textContent = state.questionNumber > 0
    ? `문제 ${state.questionNumber} / ${state.totalQuestions}`
    : "문제 없음";

  $("answer").textContent = state.answer || "";
  $("hints").innerHTML = (state.hints || [])
    .map((hint, index) => `힌트 ${index + 1}: ${escapeHtml(hint)}`)
    .join("<br>");

  $("counts").textContent = `현재 접속 ${state.participantCount}명 · 정답자 ${state.winnerCount}명`;

  $("winners").innerHTML = (state.winners || [])
    .map(winner => `
      <div class="winner">
        <b>${winner.rank}위</b>
        <b>${escapeHtml(winner.nickname)}</b>
        <span>${winner.attempts}회 · 💡${winner.hintsUsed} · ${formatTime(winner.elapsedMs)} · +${winner.score || 0}점</span>
      </div>
    `)
    .join("") || "아직 정답자가 없어.";

  $("records").textContent = `현재 누적 ${state.records?.length || 0}개 기록 저장됨`;
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
