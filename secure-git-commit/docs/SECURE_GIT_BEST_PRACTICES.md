# Secure Git Best Practices (이 스킬과 함께 사용)

1. 항상 GPG 서명 커밋 사용 (`git config --global commit.gpgsign true`)
2. main 브랜치 직접 커밋 금지 → feature 브랜치 + PR 필수
3. 커밋 전 반드시 secret 스캔
4. .gitignore에 .env, *.pem, private key 확실히 추가
5. Git hook은 팀 전체 공유 (`.git/hooks` 대신 pre-commit 프레임워크 추천)
