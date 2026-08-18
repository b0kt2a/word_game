const socket=io(),$=id=>document.getElementById(id);let key=sessionStorage.getItem("bangpingAdminKey")||"";
if(key){$("key").value=key;login()}$("loginBtn").onclick=login;
function login(){key=$("key").value;socket.emit("admin:join",{key})}
socket.on("admin:error",m=>$("notice").textContent=m);socket.on("admin:notice",m=>$("notice").textContent=m);
socket.on("admin:state",s=>{sessionStorage.setItem("bangpingAdminKey",key);$("login").classList.add("hidden");$("console").classList.remove("hidden");render(s)});
$("start").onclick=()=>socket.emit("admin:start");$("next").onclick=()=>socket.emit("admin:next");$("reveal").onclick=()=>socket.emit("admin:reveal");
$("upload").onclick=()=>{const f=$("csv").files[0];if(!f)return;const r=new FileReader();r.onload=()=>socket.emit("admin:csv",{csv:r.result});r.readAsText(f,"utf-8")};
$("download").onclick=()=>window.location=`/api/export.csv?key=${encodeURIComponent(key)}`;
$("reset").onclick=()=>{if(confirm("누적 기록을 모두 초기화할까?"))socket.emit("admin:reset")};
function render(s){$("phase").textContent=s.phase;$("question").textContent=s.questionNumber>0?`문제 ${s.questionNumber} / ${s.totalQuestions} · ${s.mode}`:"문제 없음";$("answer").textContent=s.answer||"";$("hints").innerHTML=(s.hints||[]).map((h,i)=>`힌트 ${i+1}: ${esc(h)}`).join("<br>");$("counts").textContent=`참가자 ${s.participantCount}명 · 정답자 ${s.winnerCount}명`;
$("winners").innerHTML=(s.winners||[]).map(w=>`<div class="winner"><b>${w.rank}위</b><b>${esc(w.nickname)}</b><span>${w.attempts}회 · 💡${w.hintsUsed} · ${time(w.elapsedMs)}</span></div>`).join("")||"아직 정답자가 없어.";
$("records").textContent=`현재 누적 ${s.records?.length||0}개 기록 저장됨`;
}
function time(ms){if(ms==null)return"";let s=Math.floor(ms/1000);return `${Math.floor(s/60)}분 ${String(s%60).padStart(2,"0")}초`}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}