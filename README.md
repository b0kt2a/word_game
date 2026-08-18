# 방핑 단어게임 v3

## 이번 업데이트
- 자모 / 단어(음절) 모드
- 참가자별 다중 힌트
- 힌트 사용 수 스크린/운영자 표시
- 참가자 ID를 localStorage에 보존해 새로고침/뒤로가기 후 진행 복구
- 시도 횟수, 힌트, 정답 순위, 시간 누적 기록
- 운영자 전체 기록 CSV 다운로드
- 문제 CSV 업로드 (정답, 분류코드, 힌트1~힌트5)
- DATABASE_URL이 있으면 PostgreSQL에 게임 전체 상태 자동 저장
- DATABASE_URL이 없으면 data/game-state.json에도 저장 (Render 재시작/재배포에는 안전하지 않음)

## Render
Build: npm install
Start: npm start
환경변수: ADMIN_KEY
DB 연결 시 환경변수: DATABASE_URL
