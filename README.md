# existentialburn

Extract your Claude Code usage stats. Runs 100% locally and writes a file to your disk; nothing is sent anywhere until you upload it yourself.

**No prompt or code content is extracted.** What is extracted is usage metadata: token counts, tool call counts, timestamps, model names, session durations, project names, and git branch names. Project and branch names are real strings from your machine, so review the output before uploading.

## Quick start

```bash
npx -y existentialburn@latest > upload.json
```

Then upload at [existentialburn.com/upload](https://existentialburn.com/upload).

## What it extracts

The extractor reads `~/.claude/projects/` JSONL conversation files and outputs structured JSON:

- **Daily aggregates** — tokens, cost, messages, sessions, tool calls, model breakdowns, hourly activity
- **Session details** — duration, token counts, models used, tool calls, git branch names, subagent spawns
- **Totals** — lifetime token/cost/session/message/day counts
- **Metadata** — streaks, longest session, tool call breakdown, project count, date range

> **Note:** Project names and git branch names (e.g. `fix-acme-billing-bug`) are included in session data. If either can contain sensitive information, review the output before uploading, or use the paranoid redaction level on the upload page, which strips both.

## What it does NOT extract

- Prompt content or conversation text
- Code snippets or file contents
- Tool call arguments or parameters
- Images or binary data
- Real names, email addresses, or credentials

The no-network property is structural, not a policy: `src/` imports exactly three modules (`fs`, `path`, `os`), so there is no network client in scope to call. A 14-test data-boundary suite seeds realistic secrets (an API key, an SSH key path, a database URL) and asserts none reach the output.

## Programmatic usage

```typescript
import { extract } from "existentialburn";

const data = extract();
console.log(`$${data.totals.totalCost.toFixed(2)} across ${data.totals.totalSessions} sessions`);
```

### Custom directory

```typescript
const data = extract({ claudeDir: "/path/to/claude/projects" });
```

## Output format

```jsonc
{
  "version": 1,
  "extractedAt": "2026-03-15T...",
  "daily": [{ "date": "2026-03-14", "totalCost": 12.50, ... }],
  "sessions": [{ "id": "...", "durationMs": 3600000, ... }],
  "totals": { "totalCost": 450.00, "totalSessions": 200, ... },
  "meta": { "longestStreak": 14, "subagentSpawns": 42, ... }
}
```

## Requirements

- Node.js 18+
- Claude Code installed (`~/.claude/projects/` must exist)

## Platform support

- **macOS / Linux** — fully supported
- **Windows** — should work (uses `os.homedir()` and `path.join()` for cross-platform paths), but Claude Code on Windows may store data in a different location. If extraction fails, try passing a custom directory: `extract({ claudeDir: "C:\\Users\\you\\.claude\\projects" })`

## License

MIT
