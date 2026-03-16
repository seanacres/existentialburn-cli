# existentialburn

Extract your Claude Code usage stats. Runs 100% locally — your prompts and code never leave your machine. Only token counts, tool calls, timestamps, and model names are extracted.

## Quick start

```bash
npx existentialburn > upload.json
```

Then upload at [existentialburn.com/upload](https://existentialburn.com/upload).

## What it extracts

The extractor reads `~/.claude/projects/` JSONL conversation files and outputs structured JSON:

- **Daily aggregates** — tokens, cost, messages, sessions, tool calls, model breakdowns, hourly activity
- **Session details** — duration, token counts, models used, tool calls, git branch, subagent spawns
- **Totals** — lifetime token/cost/session/message/day counts
- **Metadata** — streaks, longest session, tool call breakdown, project count, date range

## What it does NOT extract

- Prompt content
- Code snippets
- File contents
- Conversation text
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

## License

MIT
