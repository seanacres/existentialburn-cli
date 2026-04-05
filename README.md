# existentialburn

Extract your Claude Code usage stats. Runs 100% locally — your prompts and code never leave your machine. Only token counts, tool calls, timestamps, and model names are extracted.

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

> **Note:** Git branch names (e.g. `fix-acme-billing-bug`) are included in session data. If your branch names contain sensitive information, review the output before uploading.

## What it does NOT extract

- Prompt content or conversation text
- Code snippets or file contents
- Tool call arguments or parameters
- Images or binary data
- Any personally identifiable information beyond usage patterns

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
