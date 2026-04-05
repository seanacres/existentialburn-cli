#!/usr/bin/env node
import { extract } from './index';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`existentialburn - Extract your Claude Code usage stats

Usage:
  npx existentialburn > upload.json

Extracts the following from ~/.claude/projects/ JSONL files:
  - Token counts (input, output, cache read, cache creation)
  - Model names (e.g. claude-opus-4-6, claude-sonnet-4-5)
  - Timestamps and session durations
  - Tool call names (e.g. Read, Edit, Bash)
  - Session IDs and project slugs
  - Git branch names
  - Cost estimates
  - Subagent spawn counts and image paste counts

Does NOT extract:
  - Prompts or conversation text
  - Code snippets or file contents
  - Tool call arguments or parameters
  - Images or binary data

Everything runs 100% locally. Your prompts and code never leave your machine.
Upload your stats at https://existentialburn.com/upload
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  process.stdout.write(pkg.version + '\n');
  process.exit(0);
}

try {
  const data = extract();

  // Progress and stats to stderr
  process.stderr.write(`\n\u2713 ${data.totals.totalSessions} sessions, ${data.totals.totalDays} days\n`);
  process.stderr.write(`\u2713 $${data.totals.totalCost.toFixed(2)} total estimated cost\n`);
  process.stderr.write(`\u2713 ${Object.values(data.meta.totalToolCalls).reduce((s, v) => s + v, 0).toLocaleString()} tool calls\n`);
  if (data.meta.subagentSpawns > 0) {
    process.stderr.write(`\u2713 ${data.meta.subagentSpawns} subagent spawns\n`);
  }
  process.stderr.write(`\nUpload at https://existentialburn.com/upload\n`);

  // Clean JSON to stdout
  process.stdout.write(JSON.stringify(data));
} catch (err) {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
