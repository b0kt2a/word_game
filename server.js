const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Server } = require("socket.io");

let Pool = null;
try { Pool = require("pg").Pool; } catch (_) {}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "bangping-admin";
const DATABASE_URL = process.env.DATABASE_URL || "";

const questionsPath = path.join(__dirname, "data", "questions.json");
const localStatePath = path.join(__dirname, "data", "game-state.json");

// 점수 규칙: 기본 100점 + 정답 순위 보너스 - 힌트 사용 감점
// 1~10등은 10점부터 1점까지 추가, 힌트 1개당 10점 감점
const SCORE_RULES = {
  base: 100,
  rankBonus: { 1: 10, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 },
  hintPenalty: 10
};

function normalizeQuestion(q, i) {
  const hints = Array.isArray(q.hints)
    ? q.hints.slice(0, 3)
    : [q.hint, q.hint1, q.hint2, q.hint3].filter(Boolean);

  return {
    id: q.id || `q${i + 1}`,
    answer: String(q.answer || "").trim(),
    hints: hints.map(v => String(v || "").trim()).filter(Boolean).slice(0, 3)
  };
}

let questions = JSON.parse(fs.readFileSync(questionsPath, "utf8")).map(normalizeQuestion);

const game = {
  phase: "waiting",              // waiting | playing | revealed
  sessionStarted: false,          // 최초 QR 대기화면 구분용
  questionIndex: -1,
  questionId: 0,
  startedAt: null,
  answerVisible: false,
  winners: [],
  participants: new Map(),        // playerId -> { nickname, joinedAt }
  sockets: new Map(),             // socketId -> playerId
  playerSockets: new Map(),       // playerId -> Set(socketId)
  records: []                     // 문제별 누적 기록
};

let pool = null;
if (DATABASE_URL && Pool) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
  });
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/screen", (_req, res) => res.sendFile(path.join(__dirname, "public", "screen.html")));
app.get("/health", (_req, res) => res.json({ ok: true, db: !!pool }));

app.get("/api/export.csv", (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).send("Forbidden");

  const totals = calculateTotalScores();
  const headers = [
    "닉네임", "문제번호", "정답", "정답여부", "정답순위",
    "시도횟수", "힌트사용수", "소요시간초", "획득점수", "최종누적점수"
  ];

  const rows = game.records.map(r => [
    r.nickname,
    r.questionNumber,
    r.answer,
    r.correct ? "정답" : "미정답",
    r.rank || "",
    r.attempts || 0,
    r.hintsUsed || 0,
    r.elapsedMs == null ? "" : Math.floor(r.elapsedMs / 1000),
    r.score || 0,
    totals.get(r.playerId)?.score || 0
  ]);

  const esc = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = "\uFEFF" + [headers, ...rows].map(row => row.map(esc).join(",")).join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bangping-results-${Date.now()}.csv"`);
  res.send(csv);
});

function decomposeHangul(text) {
  const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const clean = String(text || "").trim().replace(/\s+/g, "").replace(/[^\u3131-\u318E\uAC00-\uD7A3A-Za-z0-9]/g, "");
  const out = [];

  for (const ch of clean) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const idx = code - 0xAC00;
      const cho = Math.floor(idx / 588);
      const jung = Math.floor((idx % 588) / 28);
      const jong = idx % 28;
      out.push(CHO[cho], JUNG[jung]);
      if (jong) out.push(JONG[jong]);
    } else {
      out.push(ch.toUpperCase());
    }
  }
  return out;
}

function units(text) {
  return decomposeHangul(text);
}

function evaluateGuess(guess, answer) {
  const result = Array(answer.length).fill("absent");
  const remaining = {};

  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
  }

  for (let i = 0; i < guess.length; i++) {
    if (result[i] === "correct") continue;
    if ((remaining[guess[i]] || 0) > 0) {
      result[i] = "present";
      remaining[guess[i]]--;
    }
  }
  return result;
}

function currentQuestion() {
  return questions[game.questionIndex] || null;
}

function registerPlayerSocket(playerId, socketId) {
  if (!game.playerSockets.has(playerId)) game.playerSockets.set(playerId, new Set());
  game.playerSockets.get(playerId).add(socketId);
  game.sockets.set(socketId, playerId);
}

function unregisterPlayerSocket(socketId) {
  const playerId = game.sockets.get(socketId);
  if (!playerId) return;

  game.sockets.delete(socketId);
  const set = game.playerSockets.get(playerId);
  if (!set) return;

  set.delete(socketId);
  if (set.size === 0) game.playerSockets.delete(playerId);
}

function onlinePlayerIds() {
  return Array.from(game.playerSockets.entries())
    .filter(([, set]) => set.size > 0)
    .map(([playerId]) => playerId);
}

function onlineParticipantCount() {
  return onlinePlayerIds().length;
}

function getRecord(playerId, questionId = game.questionId) {
  return game.records.find(r => r.playerId === playerId && r.questionId === questionId);
}

function ensureRecord(playerId) {
  const p = game.participants.get(playerId);
  const q = currentQuestion();
  if (!p || !q || game.questionIndex < 0) return null;

  let r = getRecord(playerId);
  if (!r) {
    r = {
      playerId,
      nickname: p.nickname,
      questionId: game.questionId,
      questionNumber: game.questionIndex + 1,
      answer: q.answer,
      attempts: 0,
      hintsUsed: 0,
      correct: false,
      rank: null,
      elapsedMs: null,
      score: 0,
      guesses: []
    };
    game.records.push(r);
    persist();
  }
  return r;
}

function calculateScore(record) {
  if (!record?.correct) return 0;
  const rankBonus = SCORE_RULES.rankBonus[record.rank] || 0;
  const hintPenalty = record.hintsUsed * SCORE_RULES.hintPenalty;
  return Math.max(0, SCORE_RULES.base + rankBonus - hintPenalty);
}

function calculateTotalScores() {
  const totals = new Map();

  for (const [playerId, participant] of game.participants.entries()) {
    totals.set(playerId, { playerId, nickname: participant.nickname, score: 0, correctCount: 0 });
  }

  for (const r of game.records) {
    if (!totals.has(r.playerId)) {
      totals.set(r.playerId, { playerId: r.playerId, nickname: r.nickname, score: 0, correctCount: 0 });
    }
    const item = totals.get(r.playerId);
    item.nickname = r.nickname;
    item.score += Number(r.score || 0);
    if (r.correct) item.correctCount++;
  }

  return totals;
}

function cumulativeLeaderboard() {
  return Array.from(calculateTotalScores().values())
    .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.nickname.localeCompare(b.nickname, "ko"))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function publicState() {
  const q = currentQuestion();
  return {
    phase: game.phase,
    sessionStarted: game.sessionStarted,
    questionId: game.questionId,
    questionNumber: game.questionIndex + 1,
    totalQuestions: questions.length,
    unitLength: q ? units(q.answer).length : 0,
    answerVisible: game.answerVisible,
    answer: game.answerVisible && q ? q.answer : "",
    winnerCount: game.winners.length,
    participantCount: onlineParticipantCount()
  };
}

function playerState(playerId) {
  const q = currentQuestion();
  const r = getRecord(playerId);

  return {
    ...publicState(),
    playerId,
    unitLength: q ? units(q.answer).length : 0,
    attempts: r?.attempts || 0,
    hintsUsed: r?.hintsUsed || 0,
    hintsTotal: q?.hints.length || 0,
    revealedHints: q ? q.hints.slice(0, r?.hintsUsed || 0) : [],
    solved: !!r?.correct,
    rank: r?.rank || null,
    score: r?.score || 0,
    elapsedMs: r?.elapsedMs ?? null,
    guesses: r?.guesses || []
  };
}

function adminState() {
  const q = currentQuestion();
  return {
    ...publicState(),
    answer: q?.answer || "",
    hints: q?.hints || [],
    winners: game.winners,
    records: game.records,
    questions,
    cumulative: cumulativeLeaderboard(),
    scoreRules: SCORE_RULES
  };
}

function screenState() {
  const q = currentQuestion();
  return {
    ...publicState(),
    answer: game.answerVisible && q ? q.answer : "",
    winners: game.winners.map(w => ({
      nickname: w.nickname,
      rank: w.rank,
      attempts: w.attempts,
      hintsUsed: w.hintsUsed,
      elapsedMs: w.elapsedMs,
      score: w.score || 0
    })),
    cumulative: cumulativeLeaderboard()
  };
}

// 모든 화면을 같은 상태로 다시 맞춘다.
function broadcastState() {
  io.emit("game:state", publicState());
  io.to("admins").emit("admin:state", adminState());
  io.to("screens").emit("screen:state", screenState());

  for (const [socketId, playerId] of game.sockets.entries()) {
    io.to(socketId).emit("player:state", playerState(playerId));
  }
}

function serializableState() {
  return {
    phase: game.phase,
    sessionStarted: game.sessionStarted,
    questionIndex: game.questionIndex,
    questionId: game.questionId,
    startedAt: game.startedAt,
    answerVisible: game.answerVisible,
    winners: game.winners,
    participants: Array.from(game.participants.entries()),
    records: game.records,
    questions
  };
}

async function initDb() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS bangping_state (
    id INTEGER PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

async function persist() {
  const payload = serializableState();
  try { fs.writeFileSync(localStatePath, JSON.stringify(payload, null, 2), "utf8"); } catch (_) {}

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO bangping_state(id,payload,updated_at) VALUES(1,$1,NOW())
         ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,
        [payload]
      );
    } catch (e) {
      console.error("DB save failed:", e.message);
    }
  }
}

async function restore() {
  let saved = null;

  if (pool) {
    try {
      await initDb();
      const r = await pool.query("SELECT payload FROM bangping_state WHERE id=1");
      if (r.rows[0]) saved = r.rows[0].payload;
    } catch (e) {
      console.error("DB restore failed:", e.message);
    }
  }

  if (!saved && fs.existsSync(localStatePath)) {
    try { saved = JSON.parse(fs.readFileSync(localStatePath, "utf8")); } catch (_) {}
  }

  if (!saved) return;

  game.phase = saved.phase || "waiting";
  game.sessionStarted = !!saved.sessionStarted;
  game.questionIndex = Number(saved.questionIndex ?? -1);
  game.questionId = Number(saved.questionId || 0);
  game.startedAt = saved.startedAt || null;
  game.answerVisible = !!saved.answerVisible;
  game.winners = Array.isArray(saved.winners) ? saved.winners : [];
  game.participants = new Map(Array.isArray(saved.participants) ? saved.participants : []);
  game.records = Array.isArray(saved.records) ? saved.records : [];

  // 실제 연결 정보는 서버 재시작 후 새로 등록한다.
  game.sockets = new Map();
  game.playerSockets = new Map();

  if (Array.isArray(saved.questions) && saved.questions.length) {
    questions = saved.questions.map(normalizeQuestion);
  }

  // 이전 저장본에 점수 필드가 없으면 복구 시 계산한다.
  for (const r of game.records) {
    if (r.correct && r.score == null) r.score = calculateScore(r);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = String(text || "").replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(v => v.trim() !== "")) rows.push(row);
      row = []; cell = "";
    } else {
      cell += c;
    }
  }

  row.push(cell);
  if (row.some(v => v.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];

  const h = rows[0].map(x => x.trim());
  const col = (...names) => names.map(n => h.indexOf(n)).find(i => i >= 0);
  const ai = col("정답", "answer");
  const his = [1,2,3].map(n => col(`힌트${n}`, `hint${n}`));
  const legacyHint = col("힌트", "hint");

  return rows.slice(1).map((r, i) => normalizeQuestion({
    answer: r[ai] || "",
    hints: [
      ...(legacyHint >= 0 ? [r[legacyHint]] : []),
      ...his.filter(x => x >= 0).map(x => r[x])
    ].filter(Boolean)
  }, i)).filter(q => q.answer);
}

function selectQuestion(index) {
  game.questionIndex = index;
  game.questionId++;
  game.phase = "waiting";
  game.startedAt = null;
  game.answerVisible = false;
  game.winners = [];
}

io.on("connection", socket => {
  socket.emit("game:state", publicState());

  socket.on("screen:join", () => {
    socket.join("screens");
    socket.emit("screen:state", screenState());
  });

  socket.on("player:join", ({ nickname, playerId }) => {
    const name = String(nickname || "").trim().slice(0, 20);
    if (!name) return socket.emit("player:error", "닉네임을 입력해줘.");

    const id = String(playerId || "").trim() || crypto.randomUUID();
    const existing = game.participants.get(id);

    game.participants.set(id, {
      nickname: name,
      joinedAt: existing?.joinedAt || Date.now()
    });

    registerPlayerSocket(id, socket.id);
    socket.data.playerId = id;

    if (game.phase === "playing") ensureRecord(id);

    socket.emit("player:joined", { nickname: name, playerId: id });
    socket.emit("player:state", playerState(id));
    persist();
    broadcastState();
  });

  socket.on("player:hint", () => {
    const id = socket.data.playerId;
    const q = currentQuestion();
    if (!id || !q || game.phase !== "playing") return;

    const r = ensureRecord(id);
    if (!r || r.correct) return;

    if (r.hintsUsed < q.hints.length) {
      r.hintsUsed++;
      persist();
      broadcastState();
    }
  });

  socket.on("player:guess", ({ word }) => {
    const id = socket.data.playerId;
    const p = game.participants.get(id);
    const q = currentQuestion();

    if (!p) return socket.emit("player:error", "먼저 닉네임으로 참가해줘.");
    if (game.phase !== "playing" || !q) return socket.emit("player:error", "현재 진행 중인 문제가 없어.");

    const r = ensureRecord(id);
    if (r.correct) return socket.emit("player:error", "이미 이 문제를 맞혔어.");
    if (r.attempts >= 5) return socket.emit("player:error", "5번의 도전을 모두 사용했어.");

    const answer = units(q.answer);
    const guess = units(word);

    if (guess.length !== answer.length) {
      return socket.emit("guess:result", {
        ok: false,
        reason: "length",
        expectedLength: answer.length,
        actualLength: guess.length
      });
    }

    r.attempts++;
    const result = evaluateGuess(guess, answer);
    const correct = guess.every((x, i) => x === answer[i]);
    r.guesses.push({ units: guess, result });

    if (correct) {
      r.correct = true;
      r.rank = game.winners.length + 1;
      r.elapsedMs = game.startedAt ? Date.now() - game.startedAt : null;
      r.score = calculateScore(r);

      game.winners.push({
        playerId: id,
        nickname: p.nickname,
        rank: r.rank,
        attempts: r.attempts,
        hintsUsed: r.hintsUsed,
        elapsedMs: r.elapsedMs,
        score: r.score
      });
    }

    persist();
    socket.emit("guess:result", {
      ok: true,
      correct,
      units: guess,
      result,
      rank: r.rank,
      elapsedMs: r.elapsedMs,
      attempt: r.attempts,
      score: r.score
    });
    broadcastState();
  });

  socket.on("admin:join", ({ key }) => {
    if (key !== ADMIN_KEY) return socket.emit("admin:error", "운영자 키가 맞지 않아.");
    socket.join("admins");
    socket.data.isAdmin = true;
    socket.emit("admin:state", adminState());
  });

  socket.on("admin:start", () => {
    if (!socket.data.isAdmin || !questions.length) return;

    if (game.questionIndex < 0) selectQuestion(0);

    game.sessionStarted = true;
    game.phase = "playing";
    game.startedAt = Date.now();
    game.answerVisible = false;

    for (const playerId of onlinePlayerIds()) ensureRecord(playerId);

    persist();
    broadcastState();
  });

  socket.on("admin:next", () => {
    if (!socket.data.isAdmin || !questions.length) return;

    const nextIndex = game.questionIndex < 0
      ? 0
      : (game.questionIndex + 1) % questions.length;

    selectQuestion(nextIndex);
    persist();
    broadcastState();
  });

  socket.on("admin:reveal", () => {
    if (!socket.data.isAdmin) return;

    game.phase = "revealed";
    game.answerVisible = true;

    persist();
    broadcastState();
  });

  socket.on("admin:csv", ({ csv }) => {
    if (!socket.data.isAdmin) return;

    const parsed = parseCsv(csv);
    if (!parsed.length) return socket.emit("admin:error", "CSV에서 문제를 찾지 못했어.");

    questions = parsed;
    game.questionIndex = -1;
    game.questionId++;
    game.phase = "waiting";
    game.sessionStarted = false;
    game.startedAt = null;
    game.answerVisible = false;
    game.winners = [];

    fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2), "utf8");
    persist();
    broadcastState();
    socket.emit("admin:notice", `${questions.length}개 문제를 불러왔어.`);
  });

  socket.on("admin:reset", () => {
    if (!socket.data.isAdmin) return;

    game.phase = "waiting";
    game.sessionStarted = false;
    game.questionIndex = -1;
    game.questionId++;
    game.startedAt = null;
    game.answerVisible = false;
    game.winners = [];
    game.records = [];

    persist();
    broadcastState();
  });

  socket.on("disconnect", () => {
    unregisterPlayerSocket(socket.id);
    broadcastState();
  });
});

restore().finally(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`BangPing Word Game v4 running on ${PORT}`);
  });
});
