---
name: secure-git-commit
description: Git 커밋 시 보안을 최우선으로 보장하는 스킬. secret 스캔, GPG 서명 커밋 강제, conventional commit 검증, 보호용 Git hook 설치, main 브랜치 직접 커밋 차단 등을 수행. git commit, git push, 코드 변경 후 커밋 준비 상황에서 자동으로 사용.
---

# Secure Git Commit

모든 Git 커밋은 **보안 우선**으로 처리한다.
secret 유출, 서명 없는 커밋, 위험한 브랜치 직접 푸시를 원천 차단한다.

## 빠른 시작

1. 이 스킬 활성화 후 아래 명령 중 하나를 사용:
   - `/secure-commit` — 현재 변경사항을 안전하게 커밋
   - `/setup-secure-git` — GPG 서명 + hook 전체 설치
   - `/scan-secrets` — staged 파일 secret 스캔

2. Claude Code 사용자라면 프로젝트 루트에 이 스킬 폴더를 넣거나 `/plugin install`로 설치.

## Secure Commit 기본 흐름 (반드시 이 순서로 실행)

1. **Secret 스캔 먼저** (`/scan-secrets`)
   - `.env`, API 키, private key, token 등 탐지
   - 발견 시 즉시 중단하고 사용자에게 알림

2. **GPG 서명 설정 확인**
   - `git config --global commit.gpgsign true` 확인 및 설정
   - 서명 키가 없으면 생성 가이드 제공

3. **Conventional Commit + Security Context 생성**
   - `feat(git-security): ...` 형식 강제
   - 보안 관련 변경이면 `security:` 또는 `fix(security):` 태그 사용

4. **보호 Hook 설치** (선택)
   - pre-commit: secret 스캔 + lint
   - commit-msg: 메시지 형식 검증
   - pre-push: main 직접 푸시 차단

5. **안전한 커밋 실행**
   - `git commit -S` (서명 포함)
   - main 브랜치 직접 커밋은 절대 허용하지 않음

## 사용 가능한 명령어

| 명령어                  | 설명                                      | 예시 |
|-------------------------|-------------------------------------------|------|
| `/secure-commit`        | 현재 staged 변경사항을 보안 흐름으로 커밋 | `/secure-commit "버그 수정"` |
| `/setup-secure-git`     | GPG 서명 + 보안 hook 전체 초기 설정       | - |
| `/scan-secrets`         | staged + working directory secret 스캔    | - |
| `/install-security-hooks` | pre-commit, commit-msg hook 설치        | - |
| `/secure-push`          | main 브랜치 보호하며 안전하게 push        | - |

## 보안 체크리스트 (Claude가 항상 확인)

- [ ] secret 스캔 통과
- [ ] GPG 서명 활성화됨
- [ ] conventional commit 형식 준수
- [ ] main 브랜치에 직접 커밋하지 않음
- [ ] 민감 파일(.env, *.pem, private key 등) 변경 시 추가 확인

## 예시 동작

사용자: "이 변경사항 커밋해줘"

Claude 동작:
1. 먼저 `/scan-secrets` 실행
2. 문제 없으면 GPG 서명 확인
3. `feat(git-security): add secure commit project` 형식으로 메시지 제안
4. `git commit -S -m "..."` 실행 제안 또는 직접 수행 (Claude Code인 경우)

## 주의사항

- 이 스킬은 **코드 실행 권한**이 필요하다 (code execution 활성화 필수).
- 민감한 저장소에서는 hook 설치 전 반드시 사용자 승인 받을 것.
- 이미 존재하는 pre-commit hook과 충돌 가능 → 기존 hook은 백업 권장.
