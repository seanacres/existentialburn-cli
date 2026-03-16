#!/usr/bin/env node
import { extract } from './index';

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
