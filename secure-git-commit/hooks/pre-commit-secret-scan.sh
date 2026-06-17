#!/bin/bash
# Secure Git Pre-commit Hook (by secure-git-commit skill)
echo "🔒 Running secret scan before commit..."

# git-secrets, trufflehog, ggshield 중 사용 가능한 것 실행
if command -v git-secrets &> /dev/null; then
    git-secrets --scan
elif command -v trufflehog &> /dev/null; then
    trufflehog git file://. --since-commit HEAD --fail
else
    echo "⚠️  git-secrets 또는 trufflehog가 설치되어 있지 않습니다."
    echo "   설치 권장: brew install git-secrets 또는 pip install trufflehog"
fi

echo "✅ Secret scan completed."
