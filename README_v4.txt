방핑 WORD GAME v4 업데이트

이 ZIP은 기존 WORD_GAME 폴더 위에 덮어쓰기용입니다.
문제 데이터(data/questions.json)는 포함하지 않았습니다.

포함 파일
- server.js
- public/index.html
- public/game.js
- public/admin.html
- public/admin.js
- public/screen.html
- public/screen.js
- public/style.css

이번 업데이트

[플레이어]
- 모바일 화면 압축
- 보이는 별도 입력창 제거
- 게임판 현재 줄에 입력 내용 실시간 표시
- 게임판 터치 -> 모바일 키보드
- 입력 완료 버튼 또는 Enter로 제출
- 글자 수 오류: 상단 큰 경고 토스트 + 현재 줄 흔들림
- 운영자 정답 공개 시 전원 정답 표시 + 입력/힌트/제출 잠금
- 다음 문제를 새로고침 없이 자동 전환
- 소켓 재연결 시 기존 참가자로 자동 복구

[GM]
- 휴대폰 화면 OFF/ON, 네트워크 변경 후 자동 재인증
- 운영자 키 재입력 없이 현재 상태 복구
- waiting/playing/revealed를 한글 상태명으로 표시

[스크린]
- 예전 대시보드형 UI 복원
- 최초 시작 전 QR 참가 화면
- 첫 문제 시작 후 문제 사이 대기에는 QR이 다시 나오지 않음
- 상단: 문제 번호 + 현재 정답자 수
- 좌측: 이번 문제 실시간 정답 순위
- 우측 상단: 현재 접속 참가자 수
- 우측 하단: 누적 점수 순위
- 정답 공개 시 상단 영역 자체가 정답 화면으로 교체

[점수]
현재는 임시 공식입니다.
- 정답 기본 100점
- 1위 +30 / 2위 +20 / 3위 +10
- 첫 시도 이후 추가 시도 1회당 -5
- 힌트 1개당 -10
- 최소 0점

server.js 상단 SCORE_RULES 숫자만 바꾸면 조정 가능합니다.
결과 CSV에는 획득점수 / 최종누적점수 열이 추가됩니다.

[현재 보류]
- GM 화면 디자인 전면 수정
- 테마 포스터 정답 화면
- 점수 공식 최종 확정
- 다른 닉네임으로 다시 입장 버튼

배포
1. ZIP 압축을 풉니다.
2. 안의 server.js와 public 폴더를 기존 WORD_GAME 폴더에 덮어씁니다.
3. PowerShell에서 WORD_GAME 폴더로 이동합니다.
4. git status
5. git add server.js public
6. git commit -m "Update game sync and player UI"
7. git push
