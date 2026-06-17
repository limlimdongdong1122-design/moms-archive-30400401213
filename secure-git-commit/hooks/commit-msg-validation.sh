#!/bin/bash
# Commit message format validation
commit_regex='^(feat|fix|docs|style|refactor|perf|test|chore|security)(\([a-z-]+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format."
    echo "Expected: type(scope): subject (max 50 chars)"
    echo "Example: feat(git-security): add secure commit project"
    exit 1
fi
