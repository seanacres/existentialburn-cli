# Changelog

## 0.1.3

- **Fix:** Streak calculation timezone bug. Current streak was incorrectly reset to 0 when last activity was yesterday, due to UTC/local time mismatch in date comparison.
- **Quality:** Add `publint` package validation to CI and prepublishOnly — catches packaging issues (missing shebangs, wrong exports, missing files) before publish.
- **Quality:** Add smoke test to CI — `npm pack` → install in isolated temp dir → verify `--version`, `--help`, and error path from the actual published artifact.
- **Infra:** Add `"type": "commonjs"` field per Node.js best practice.

## 0.1.2

- **Security:** Fix symlink traversal in directory walker. Symlinks pointing outside `~/.claude/projects/` are now skipped, preventing reads of unintended directories (e.g. `~/.ssh/`, `/etc/`).
- **Feature:** Add `--help` / `-h` flag with full disclosure of what is and isn't extracted.
- **Feature:** Add `--version` / `-v` flag.
- **Docs:** Disclose git branch names in README "What it extracts" section.
- **Docs:** Add Windows compatibility note.

## 0.1.1

- Fix: Correct stale token pricing for Opus 4.5/4.6 and Haiku 4.5.
- Add granular cache creation cost breakdown (5-minute vs 1-hour ephemeral).

## 0.1.0

- Initial release.
- Extract daily aggregates, session details, totals, and metadata from Claude Code JSONL files.
- Cost estimation with model-specific pricing.
- Streak computation.
- Session-level git branch, subagent spawn, and image paste tracking.
