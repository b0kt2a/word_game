const socket = io();
const $ = id => document.getElementById(id);
const JOIN_URL = "https://word-game-xrte.onrender.com/";

// QR 자동 생성
if ($("qrcode") && typeof QRCode !== "undefined") {
  new QRCode($("qrcode"), {
    text: JOIN_URL,
    width: 320,
    height: 320,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// 스크린도 소켓 재연결 시 자동 재등록
socket.on("connect", () => socket.emit("screen:join"));
socket.on("screen:state", render);

function render(state) {
  $("waitingPc").textContent = state.participantCount ?? 0;
  $("pc").textContent = state.participantCount ?? 0;
  $("participantBig").textContent = `${state.participantCount ?? 0}명`;

  // 최초 게임 시작 전만 QR 표시. 문제 사이 waiting 상태에서는 QR로 돌아가지 않음.
  const showQrWaiting = !state.sessionStarted;
  $("waitingScreen").classList.toggle("hidden", !showQrWaiting);
  $("gameScreen").classList.toggle("hidden", showQrWaiting);
  if (showQrWaiting) return;

  $("phase").textContent = state.phase === "playing"
    ? "진행 중"
    : state.phase === "revealed"
      ? "정답 공개"
      : "다음 문제 준비";

  $("q").textContent = state.questionNumber > 0 ? `문제 ${state.questionNumber}` : "다음 문제";
  $("meta").textContent = state.questionNumber > 0
    ? `${state.totalQuestions}문제 중 ${state.questionNumber}번째 · ${state.mode}`
    : "";
  $("wc").textContent = state.winnerCount ?? 0;

  // 정답 공개 시 상단 메인 영역 자체를 정답 화면으로 전환
  const revealed = state.phase === "revealed";
  $("questionHero").classList.toggle("hidden", revealed);
  $("answerHero").classList.toggle("hidden", !revealed);
  $("answer").textContent = state.answer || "";

  $("winners").innerHTML = (state.winners || [])
    .map(winner => `
      <div class="screen-winner">
        <div class="screen-rank">${winner.rank}위</div>
        <div class="screen-name">${escapeHtml(winner.nickname)}</div>
        <div class="screen-winner-meta">${winner.attempts}회 · 💡 ${winner.hintsUsed} · ${formatTime(winner.elapsedMs)} · +${winner.score || 0}점</div>
      </div>
    `)
    .join("") || '<div class="screen-empty">아직 정답자가 없어요</div>';

  $("cumulative").innerHTML = (state.cumulative || [])
    .slice(0, 8)
    .map(player => `
      <div class="cumulative-row">
        <span class="cumulative-rank">${player.rank}위</span>
        <strong class="cumulative-name">${escapeHtml(player.nickname)}</strong>
        <span class="cumulative-score">${player.score}점</span>
      </div>
    `)
    .join("") || '<div class="screen-empty small">아직 점수가 없어요</div>';
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
