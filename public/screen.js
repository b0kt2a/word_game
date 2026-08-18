/* ==========================================
   Socket.IO 연결
========================================== */

const socket = io();


/* ==========================================
   자주 쓰는 DOM 선택 함수
========================================== */

const $ = id => document.getElementById(id);


/* ==========================================
   참가자 접속 주소

   QR 코드에 들어갈 실제 주소
========================================== */

const JOIN_URL = "https://word-game-xrte.onrender.com/";


/* ==========================================
   QR 코드 자동 생성

   screen.html에 있는
   <div id="qrcode"></div>
   안에 QR을 자동으로 그림
========================================== */

const qrTarget = $("qrcode");

if (qrTarget && typeof QRCode !== "undefined") {

    new QRCode(qrTarget, {
        text: JOIN_URL,

        /* QR 크기 */
        width: 320,
        height: 320,

        /* QR은 인식률 때문에 흑백 유지 */
        colorDark: "#000000",
        colorLight: "#ffffff",

        /* 오류 복원 수준 */
        correctLevel: QRCode.CorrectLevel.H
    });

}


/* ==========================================
   서버 연결 완료

   스크린 화면이라고 서버에 알려줌
========================================== */

socket.on("connect", () => {

    socket.emit("screen:join");

});


/* ==========================================
   서버에서 스크린 상태 수신

   참가자 입장
   정답 발생
   문제 시작
   문제 이동
   정답 공개

   등의 변화가 생길 때마다 실행됨
========================================== */

socket.on("screen:state", render);


/* ==========================================
   전체 스크린 화면 업데이트
========================================== */

function render(s) {


    /* ======================================
       1. 대기 화면 참가자 수

       QR 화면에서도 실시간으로
       현재 참가자 수를 표시
    ====================================== */

    $("waitingPc").textContent =
        s.participantCount ?? 0;



    /* ======================================
       2. 대기 화면 ↔ 게임 화면 전환
    ====================================== */

    const waitingScreen = $("waitingScreen");
    const gameScreen = $("gameScreen");


    /*
        waiting
        → QR 참가 화면

        playing / revealed
        → 실제 게임 화면
    */

    if (s.phase === "waiting") {

        /* QR 화면 보이기 */
        waitingScreen.classList.remove("hidden");

        /* 게임 화면 숨기기 */
        gameScreen.classList.add("hidden");

    } else {

        /* QR 화면 숨기기 */
        waitingScreen.classList.add("hidden");

        /* 게임 화면 보이기 */
        gameScreen.classList.remove("hidden");

    }



    /* ======================================
       3. 현재 게임 상태 표시
    ====================================== */

    $("phase").textContent =
        s.phase === "playing"
            ? "진행 중"
            : s.phase === "revealed"
                ? "정답 공개"
                : "대기 중";



    /* ======================================
       4. 현재 문제 번호 표시
    ====================================== */

    $("q").textContent =
        s.questionNumber > 0
            ? `문제 ${s.questionNumber}`
            : "게임을 준비하고 있어요";



    /* ======================================
       5. 현재 문제 정보

       예:
       20문제 중 3번째 · 자모
    ====================================== */

    $("meta").textContent =
        s.questionNumber > 0
            ? `${s.totalQuestions}문제 중 ${s.questionNumber}번째 · ${s.mode}`
            : "참가자들의 접속을 기다리는 중";



    /* ======================================
       6. 현재 정답자 수
    ====================================== */

    $("wc").textContent =
        s.winnerCount ?? 0;



    /* ======================================
       7. 현재 참가자 수
    ====================================== */

    $("pc").textContent =
        s.participantCount ?? 0;



    /* ======================================
       8. 실시간 정답 순위

       순위
       닉네임
       시도 횟수
       힌트 사용 수
       정답 시간
    ====================================== */

    $("winners").innerHTML =

        (s.winners || [])

            .map(w => `

                <div class="winner">

                    <b>
                        ${w.rank}위
                    </b>

                    <b>
                        ${esc(w.nickname)}
                    </b>

                    <span>
                        ${w.attempts}회
                        · 💡 ${w.hintsUsed}
                        · ${time(w.elapsedMs)}
                    </span>

                </div>

            `)

            .join("")

        ||

        `
            <div class="muted">
                아직 정답자가 없어요 👀
            </div>
        `;



    /* ======================================
       9. 정답 공개 화면

       운영자가 정답 공개 버튼을 누르면
       answerCard가 표시됨
    ====================================== */

    $("answerCard")
        .classList
        .toggle(
            "hidden",
            !s.answerVisible
        );


    /* 실제 정답 */
    $("answer").textContent =
        s.answer || "";

}


/* ==========================================
   시간 표시

   밀리초(ms)를

   190000
   ↓
   3분 10초

   형태로 변환
========================================== */

function time(ms) {

    if (ms == null) {
        return "";
    }


    const seconds =
        Math.floor(ms / 1000);


    const minutes =
        Math.floor(seconds / 60);


    const remainSeconds =
        seconds % 60;


    return (
        `${minutes}분 ` +
        `${String(remainSeconds).padStart(2, "0")}초`
    );

}


/* ==========================================
   HTML 특수문자 처리

   참가자가 닉네임에
   < > & " 등을 넣어도

   HTML 코드로 실행되지 않도록 처리
========================================== */

function esc(v) {

    return String(v).replace(
        /[&<>"']/g,
        c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c])
    );

}