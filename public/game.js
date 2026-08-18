const socket=io(),$=id=>document.getElementById(id);let state=null;
let playerId=localStorage.getItem("bangpingPlayerId")||"", nickname=localStorage.getItem("bangpingNickname")||"";
if(nickname){$("nickname").value=nickname; join();}
$("joinBtn").onclick=join;$("submitBtn").onclick=submit;$("hintBtn").onclick=()=>socket.emit("player:hint");
$("word").addEventListener("keydown",e=>{if(e.key==="Enter")submit()});
function join(){nickname=$("nickname").value.trim();if(!nickname)return;socket.emit("player:join",{nickname,playerId});}
socket.on("player:joined",d=>{playerId=d.playerId;nickname=d.nickname;localStorage.setItem("bangpingPlayerId",playerId);localStorage.setItem("bangpingNickname",nickname);$("joinCard").classList.add("hidden");$("gameCard").classList.remove("hidden")});
socket.on("game:state",s=>{$("people").textContent=`현재 참가자 ${s.participantCount}명`});
socket.on("player:state",s=>{state=s;render()});socket.on("player:error",m=>$("status").textContent=m);
socket.on("guess:result",r=>{if(!r.ok){$("status").textContent=`글자 수가 맞지 않아! ${r.expectedLength}칸 필요`;return}$("word").value="";});
function submit(){if(!state||state.phase!=="playing")return;socket.emit("player:guess",{word:$("word").value});}
function render(){if(!state)return;$("people").textContent=`현재 참가자 ${state.participantCount}명`;$("mode").textContent=state.mode;
if(state.questionNumber<=0){$("qTitle").textContent="대기 중";$("meta").textContent="운영자가 문제를 시작하면 자동으로 시작돼";$("board").innerHTML="";return}
$("qTitle").textContent=`문제 ${state.questionNumber} / ${state.totalQuestions}`;$("meta").textContent=`${state.unitLength}칸 · ${state.attempts}/5회 · 힌트 ${state.hintsUsed}/${state.hintsTotal}`;
renderBoard();$("hints").innerHTML=state.revealedHints.map((h,i)=>`<div class="hint">💡 힌트 ${i+1}. ${esc(h)}</div>`).join("");
$("hintBtn").disabled=state.phase!=="playing"||state.solved||state.hintsUsed>=state.hintsTotal;
$("hintBtn").textContent=state.hintsUsed>=state.hintsTotal?"💡 힌트 모두 사용":`💡 힌트 보기 (${state.hintsUsed}/${state.hintsTotal})`;
$("word").disabled=state.phase!=="playing"||state.solved||state.attempts>=5;$("submitBtn").disabled=$("word").disabled;
if(state.solved)$("status").textContent=`정답!! 🎉 ${state.rank}번째 정답자 · ${time(state.elapsedMs)}`;
else if(state.attempts>=5)$("status").textContent="5번의 도전을 모두 사용했어!";
else if(state.phase==="revealed")$("status").textContent=`정답: ${state.answer}`;
else $("status").textContent="";
}
function renderBoard(){const len=state.unitLength;let html="";for(let r=0;r<5;r++){const g=state.guesses[r];html+=`<div class="guess-row" style="grid-template-columns:repeat(${len},minmax(0,1fr))">`;for(let i=0;i<len;i++){html+=`<div class="cell ${g?g.result[i]:""}">${g?esc(g.units[i]||""):""}</div>`}html+="</div>"}$("board").innerHTML=html;}
function time(ms){if(ms==null)return"";let s=Math.floor(ms/1000);return `${Math.floor(s/60)}분 ${String(s%60).padStart(2,"0")}초`}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}