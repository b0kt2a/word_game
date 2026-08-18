/* ==========================================
   Socket.IO 연결
========================================== */

const socket = io();


/* ==========================================
   DOM 요소를 쉽게 가져오기 위한 함수

   $("nickname")
   ↓
   document.getElementById("nickname")
========================================== */

const $ = id => document.getElementById(id);


/* ==========================================
   현재 참가자 게임 상태

   서버에서 player:state를 받을 때마다
   최신 상태가 여기에 저장됨
========================================== */

let state = null;


/* ==========================================
   참가자 고유 ID + 닉네임

   localStorage에 저장하기 때문에
   새로고침 / 뒤로가기 / 재접속 후에도
   같은 참가자로 인식할 수 있음
========================================== */

let playerId =
    localStorage.getItem("bangpingPlayerId") || "";

let nickname =
    localStorage.getItem("bangpingNickname") || "";



/* ==========================================
   이전에 저장된 닉네임이 있으면
   자동으로 재접속 시도
========================================== */

if (nickname) {

    $("nickname").value = nickname;

    join();

}



/* ==========================================
   버튼 이벤트
========================================== */


/* 참가 버튼 */
$("joinBtn").onclick = join;


/* 정답 제출 버튼 */
$("submitBtn").onclick = submit;


/* 힌트 버튼 */
$("hintBtn").onclick = () => {

    socket.emit("player:hint");

};



/* ==========================================
   정답 입력칸에서 Enter 키를 누르면 제출
========================================== */

$("word").addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {

            submit();

        }

    }
);



/* ==========================================
   참가자 입장
========================================== */

function join() {

    /* 입력한 닉네임 */
    nickname =
        $("nickname").value.trim();


    /* 닉네임이 없으면 입장하지 않음 */
    if (!nickname) {
        return;
    }


    /*
        서버로 참가 요청

        playerId가 이미 있으면
        기존 참가자로 복구

        playerId가 없으면
        서버에서 새 참가자 ID 생성
    */
    socket.emit(
        "player:join",
        {
            nickname,
            playerId
        }
    );

}



/* ==========================================
   서버에서 참가 성공 응답
========================================== */

socket.on(
    "player:joined",
    data => {


        /* 서버에서 받은 참가자 ID */
        playerId =
            data.playerId;


        /* 서버에서 받은 닉네임 */
        nickname =
            data.nickname;


        /*
            브라우저에 참가자 정보 저장

            새로고침해도 유지됨
        */
        localStorage.setItem(
            "bangpingPlayerId",
            playerId
        );

        localStorage.setItem(
            "bangpingNickname",
            nickname
        );


        /* 닉네임 입력 화면 숨김 */
        $("joinCard").classList.add("hidden");


        /* 실제 게임 화면 표시 */
        $("gameCard").classList.remove("hidden");

    }
);



/* ==========================================
   전체 게임 상태 수신

   현재 참가자 수 등
   모든 참가자에게 공통으로 필요한 정보
========================================== */

socket.on(
    "game:state",
    serverState => {

        $("people").textContent =
            `현재 참가자 ${serverState.participantCount}명`;

    }
);



/* ==========================================
   내 개인 게임 상태 수신

   시도 횟수
   힌트 사용 수
   정답 여부
   정답 순위
   이전 제출 기록
   등

   참가자마다 서로 다른 정보가 들어옴
========================================== */

socket.on(
    "player:state",
    serverState => {

        /* 현재 상태 저장 */
        state = serverState;


        /* 참가자 화면 다시 그리기 */
        render();

    }
);



/* ==========================================
   참가자 오류 메시지

   예:
   현재 진행 중인 문제가 없어.
   이미 이 문제를 맞혔어.
   5번의 도전을 모두 사용했어.
========================================== */

socket.on(
    "player:error",
    message => {

        $("status").textContent =
            message;

    }
);



/* ==========================================
   정답 제출 결과 수신
========================================== */

socket.on(
    "guess:result",
    result => {


        /* ======================================
           글자 수가 맞지 않는 경우
        ====================================== */

        if (!result.ok) {

            $("status").textContent =
                `글자 수가 맞지 않아! ${result.expectedLength}칸 필요`;

            return;

        }


        /*
            정상적으로 제출된 경우
            입력칸 비우기

            판정 결과 자체는 이후 player:state를 받아
            render()에서 다시 그림
        */
        $("word").value = "";

    }
);



/* ==========================================
   정답 제출
========================================== */

function submit() {


    /*
        게임 상태가 없거나
        현재 문제 진행 중이 아니면 제출하지 않음
    */
    if (
        !state ||
        state.phase !== "playing"
    ) {
        return;
    }


    /*
        입력한 단어를 서버로 전달

        자모 / 단어 판정은
        server.js가 처리
    */
    socket.emit(
        "player:guess",
        {
            word: $("word").value
        }
    );

}



/* ==========================================
   참가자 화면 전체 업데이트
========================================== */

function render() {


    /* 서버 상태가 아직 없으면 아무것도 안 함 */
    if (!state) {
        return;
    }



    /* ======================================
       1. 현재 참가자 수
    ====================================== */

    $("people").textContent =
        `현재 참가자 ${state.participantCount}명`;



    /* ======================================
       2. 현재 문제 방식

       자모
       단어
    ====================================== */

    $("mode").textContent =
        state.mode;



    /* ======================================
       3. 아직 문제가 없는 상태

       게임 최초 대기 상태
    ====================================== */

    if (state.questionNumber <= 0) {


        $("qTitle").textContent =
            "대기 중...";


        $("meta").textContent =
            "문제가 자동으로 시작되니 잠시 기다려주세요";


        /* 게임판 비우기 */
        $("board").innerHTML =
            "";


        return;

    }



    /* ======================================
       4. 현재 문제 번호
    ====================================== */

    $("qTitle").textContent =
        `문제 ${state.questionNumber} / ${state.totalQuestions}`;



    /* ======================================
       5. 문제 진행 정보

       예:
       7칸 · 2/5회 · 힌트 1/3
    ====================================== */

    $("meta").textContent =
        `${state.unitLength}칸 · ` +
        `${state.attempts}/5회 · ` +
        `힌트 ${state.hintsUsed}/${state.hintsTotal}`;



    /* ======================================
       6. 워들 게임판 그리기
    ====================================== */

    renderBoard();



    /* ======================================
       7. 지금까지 사용한 힌트 표시

       힌트를 하나도 사용하지 않았으면
       아무것도 표시되지 않음
    ====================================== */

    $("hints").innerHTML =

        state.revealedHints

            .map(
                (hint, index) => `

                    <div class="hint">

                        💡 힌트 ${index + 1}.
                        ${esc(hint)}

                    </div>

                `
            )

            .join("");



    /* ======================================
       8. 힌트 버튼 활성 / 비활성

       아래 상황에서는 힌트 버튼 사용 불가:

       - 문제 진행 중이 아님
       - 이미 정답을 맞힘
       - 모든 힌트를 사용함
    ====================================== */

    $("hintBtn").disabled =

        state.phase !== "playing" ||

        state.solved ||

        state.hintsUsed >= state.hintsTotal;



    /* ======================================
       9. 힌트 버튼 문구

       힌트가 남아 있으면:
       💡 힌트 보기 (1/3)

       모두 사용했으면:
       💡 힌트 모두 사용
    ====================================== */

    $("hintBtn").textContent =

        state.hintsUsed >= state.hintsTotal

            ? "💡 힌트 모두 사용"

            : `💡 힌트 보기 (${state.hintsUsed}/${state.hintsTotal})`;



    /* ======================================
       10. 정답 입력 가능 여부

       아래 상황에서는 입력 금지:

       - 문제가 진행 중이 아님
       - 이미 정답을 맞힘
       - 5번의 시도를 모두 사용함
    ====================================== */

    $("word").disabled =

        state.phase !== "playing" ||

        state.solved ||

        state.attempts >= 5;



    /* 제출 버튼도 입력칸과 동일하게 설정 */
    $("submitBtn").disabled =
        $("word").disabled;



    /* ======================================
       11. 게임 상태 안내 문구
    ====================================== */


    /* 이미 정답을 맞힌 경우 */
    if (state.solved) {

        $("status").textContent =

            `정답!! 🎉 ` +
            `${state.rank}번째 정답자 · ` +
            `${time(state.elapsedMs)}`;

    }


    /* 5번의 시도를 모두 사용한 경우 */
    else if (state.attempts >= 5) {

        $("status").textContent =
            "5번의 도전을 모두 사용했습니다!";

    }


    /* 운영자가 정답을 공개한 경우 */
    else if (state.phase === "revealed") {

        $("status").textContent =
            `정답: ${state.answer}`;

    }


    /* 그 외 정상 진행 중 */
    else {

        $("status").textContent =
            "";

    }

}



/* ==========================================
   워들 게임판 생성
========================================== */

function renderBoard() {


    /*
        현재 문제의 칸 수

        자모 모드:
        자물쇠
        → ㅈ ㅏ ㅁ ㅜ ㄹ ㅅ ㅚ
        → 7칸

        단어 모드:
        자물쇠
        → 자 물 쇠
        → 3칸
    */
    const length =
        state.unitLength;


    /*
        HTML을 문자열로 만든 후
        마지막에 한 번에 board에 넣음
    */
    let html =
        "";



    /* ======================================
       최대 5번의 시도
    ====================================== */

    for (
        let row = 0;
        row < 5;
        row++
    ) {


        /*
            해당 시도 기록

            아직 시도하지 않은 줄이면 undefined
        */
        const guess =
            state.guesses[row];



        /*
            문제 글자 수만큼 가로 칸 생성
        */
        html += `

            <div
                class="guess-row"
                style="
                    grid-template-columns:
                    repeat(${length}, minmax(0, 1fr))
                "
            >

        `;



        /* ==================================
           한 줄 안의 각 글자 칸 생성
        ================================== */

        for (
            let column = 0;
            column < length;
            column++
        ) {


            html += `

                <div
                    class="
                        cell
                        ${
                            guess
                                ? guess.result[column]
                                : ""
                        }
                    "
                >

                    ${
                        guess
                            ? esc(
                                guess.units[column] || ""
                            )
                            : ""
                    }

                </div>

            `;

        }



        /* 한 줄 닫기 */
        html +=
            "</div>";

    }



    /* 완성된 게임판 화면에 표시 */
    $("board").innerHTML =
        html;

}



/* ==========================================
   시간 표시 함수

   서버에서는 밀리초(ms)로 저장

   예:
   190000ms
   ↓
   3분 10초
========================================== */

function time(ms) {


    /* 시간이 없으면 빈 문자열 */
    if (ms == null) {
        return "";
    }


    /* 밀리초 → 초 */
    const seconds =
        Math.floor(ms / 1000);


    /* 분 */
    const minutes =
        Math.floor(seconds / 60);


    /* 남은 초 */
    const remainSeconds =
        seconds % 60;


    return (

        `${minutes}분 ` +

        `${String(remainSeconds).padStart(2, "0")}초`

    );

}



/* ==========================================
   HTML 특수문자 처리

   힌트나 닉네임 등에
   < > & " ' 같은 문자가 포함되어도

   HTML 코드로 실행되지 않게 안전하게 변환
========================================== */

function esc(value) {

    return String(value).replace(

        /[&<>"']/g,

        char => ({

            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"

        }[char])

    );

}