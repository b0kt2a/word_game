const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "bangping-admin";

const questionsPath = path.join(__dirname, "data", "questions.json");
let questions = JSON.parse(fs.readFileSync(questionsPath, "utf8"));

const game = {
  phase: "waiting", // waiting | playing | revealed
  questionIndex: -1,
  questionId: 0,
  startedAt: null,
  hintVisible: false,
  answerVisible: false,
  winners: [],
  participants: new Map()
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/screen", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "screen.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

function decomposeHangul(text) {
  const CHOSEONG = [
    "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ",
    "ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"
  ];
  const JUNGSEONG = [
    "ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ",
    "ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"
  ];
  const JONGSEONG = [
    "", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ",
    "ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ",
    "ㅋ","ㅌ","ㅍ","ㅎ"
  ];

  const clean = String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\u3131-\u318E\uAC00-\uD7A3]/g, "");

  const result = [];

  for (const char of clean) {
    const code = char.charCodeAt(0);

    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      const cho = Math.floor(index / 588);
      const jung = Math.floor((index % 588) / 28);
      const jong = index % 28;

      result.push(CHOSEONG[cho], JUNGSEONG[jung]);
      if (jong > 0) result.push(JONGSEONG[jong]);
    } else {
      result.push(char);
    }
  }

  return result;
}

function evaluateGuess(guess, answer) {
  const result = Array(answer.length).fill("absent");
  const remaining = {};

  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
    } else {
      remaining[answer[i]] = (remaining[answer[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < guess.length; i += 1) {
    if (result[i] === "correct") continue;
    const char = guess[i];

    if ((remaining[char] || 0) > 0) {
      result[i] = "present";
      remaining[char] -= 1;
    }
  }

  return result;
}

function currentQuestion() {
  return questions[game.questionIndex] || null;
}

function publicState() {
  const question = currentQuestion();

  return {
    phase: game.phase,
    questionId: game.questionId,
    questionNumber: game.questionIndex + 1,
    totalQuestions: questions.length,
    jamoLength: question ? decomposeHangul(question.answer).length : 0,
    hintVisible: game.hintVisible,
    hint: game.hintVisible && question ? question.hint : "",
    answerVisible: game.answerVisible,
    answer: game.answerVisible && question ? question.answer : "",
    winnerCount: game.winners.length,
    participantCount: game.participants.size
  };
}

function adminState() {
  const question = currentQuestion();

  return {
    ...publicState(),
    answer: question ? question.answer : "",
    hint: question ? question.hint : "",
    winners: game.winners,
    questions
  };
}

function screenState() {
  const question = currentQuestion();

  return {
    ...publicState(),
    winners: game.winners.map(({ nickname, rank, attempt, elapsedMs }) => ({
      nickname, rank, attempt, elapsedMs
    })),
    answer: game.answerVisible && question ? question.answer : ""
  };
}

function broadcastState() {
  io.emit("game:state", publicState());
  io.to("admins").emit("admin:state", adminState());
  io.to("screens").emit("screen:state", screenState());
}

io.on("connection", (socket) => {
  socket.emit("game:state", publicState());

  socket.on("screen:join", () => {
    socket.join("screens");
    socket.emit("screen:state", screenState());
  });

  socket.on("player:join", ({ nickname }) => {
    const cleanName = String(nickname || "").trim().slice(0, 20);
    if (!cleanName) {
      socket.emit("player:error", "닉네임을 입력해줘.");
      return;
    }

    game.participants.set(socket.id, {
      nickname: cleanName,
      joinedAt: Date.now()
    });

    socket.data.nickname = cleanName;
    socket.emit("player:joined", { nickname: cleanName });
    broadcastState();
  });

  socket.on("admin:join", ({ key }) => {
    if (key !== ADMIN_KEY) {
      socket.emit("admin:error", "운영자 키가 맞지 않아.");
      return;
    }

    socket.join("admins");
    socket.data.isAdmin = true;
    socket.emit("admin:state", adminState());
  });

  socket.on("admin:start", () => {
    if (!socket.data.isAdmin) return;
    if (!questions.length) return;

    if (game.questionIndex < 0) game.questionIndex = 0;

    game.phase = "playing";
    game.questionId += 1;
    game.startedAt = Date.now();
    game.hintVisible = false;
    game.answerVisible = false;
    game.winners = [];

    broadcastState();
  });

  socket.on("admin:next", () => {
    if (!socket.data.isAdmin) return;
    if (!questions.length) return;

    game.questionIndex = (game.questionIndex + 1) % questions.length;
    game.phase = "waiting";
    game.questionId += 1;
    game.startedAt = null;
    game.hintVisible = false;
    game.answerVisible = false;
    game.winners = [];

    broadcastState();
  });

  socket.on("admin:showHint", () => {
    if (!socket.data.isAdmin) return;
    game.hintVisible = true;
    broadcastState();
  });

  socket.on("admin:reveal", () => {
    if (!socket.data.isAdmin) return;
    game.phase = "revealed";
    game.answerVisible = true;
    broadcastState();
  });

  socket.on("player:guess", ({ word, attempt }) => {
    const participant = game.participants.get(socket.id);
    const question = currentQuestion();

    if (!participant) {
      socket.emit("player:error", "먼저 닉네임으로 참가해줘.");
      return;
    }

    if (game.phase !== "playing" || !question) {
      socket.emit("player:error", "현재 진행 중인 문제가 없어.");
      return;
    }

    const alreadyWon = game.winners.some(
      (winner) => winner.socketId === socket.id && winner.questionId === game.questionId
    );

    if (alreadyWon) {
      socket.emit("player:error", "이미 이 문제를 맞혔어.");
      return;
    }

    const answerJamo = decomposeHangul(question.answer);
    const guessJamo = decomposeHangul(word);

    if (guessJamo.length !== answerJamo.length) {
      socket.emit("guess:result", {
        ok: false,
        reason: "length",
        expectedLength: answerJamo.length,
        actualLength: guessJamo.length
      });
      return;
    }

    const result = evaluateGuess(guessJamo, answerJamo);
    const correct = guessJamo.every((char, index) => char === answerJamo[index]);

    if (!correct) {
      socket.emit("guess:result", {
        ok: true,
        correct: false,
        jamo: guessJamo,
        result
      });
      return;
    }

    const rank = game.winners.length + 1;
    const elapsedMs = game.startedAt ? Date.now() - game.startedAt : null;

    const winner = {
      socketId: socket.id,
      questionId: game.questionId,
      nickname: participant.nickname,
      rank,
      attempt: Number(attempt) || 1,
      elapsedMs
    };

    game.winners.push(winner);

    socket.emit("guess:result", {
      ok: true,
      correct: true,
      jamo: guessJamo,
      result,
      rank,
      elapsedMs
    });

    broadcastState();
  });

  socket.on("disconnect", () => {
    game.participants.delete(socket.id);
    broadcastState();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`BangPing Word Game running on port ${PORT}`);
});
