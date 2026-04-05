/**
 * Existential Burn -- Local Usage Extractor
 *
 * Reads ~/.claude/projects/ JSONL files and extracts usage metadata.
 * Runs 100% locally. Your prompts and code never leave your machine.
 * Only token counts, tool calls, timestamps, and model names are extracted.
 *
 * @example
 * ```ts
 * import { extract } from 'existentialburn';
 * const data = extract();
 * console.log(data.totals.totalCost);
 * ```
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// --- Types ---

export interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

interface ToolUseBlock {
  type: "tool_use";
  name: string;
}

export interface ExtractedData {
  version: 1;
  extractedAt: string;
  /** Daily aggregates */
  daily: DailyEntry[];
  /** Session-level data */
  sessions: SessionEntry[];
  /** Totals */
  totals: Totals;
  /** Rich metadata for achievements */
  meta: MetaData;
}

export interface DailyEntry {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCost: number;
  messageCount: number;
  sessionCount: number;
  toolCalls: Record<string, number>;
  modelBreakdowns: ModelBreakdown[];
  hourCounts: Record<number, number>;
}

export interface SessionEntry {
  id: string;
  project: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCost: number;
  modelsUsed: string[];
  toolCalls: Record<string, number>;
  gitBranch: string;
  subagentSpawns: number;
  imagePastes: number;
  planModeUsed: boolean;
}

export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cost: number;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCost: number;
  totalSessions: number;
  totalMessages: number;
  totalDays: number;
}

export interface MetaData {
  filesProcessed: number;
  projectCount: number;
  distinctModels: string[];
  totalToolCalls: Record<string, number>;
  longestSession: { id: string; durationMs: number; messageCount: number } | null;
  longestStreak: number;
  currentStreak: number;
  hourCounts: Record<number, number>;
  subagentSpawns: number;
  imagePastes: number;
  planModeUses: number;
  dateRange: { first: string; last: string } | null;
}

export interface ExtractOptions {
  /** Override the Claude projects directory (defaults to ~/.claude/projects) */
  claudeDir?: string;
}

// --- Pricing ---

// Pricing source: https://docs.anthropic.com/en/docs/about-claude/pricing
// Cache multipliers: read = 0.1x input, 5min write = 1.25x input, 1h write = 2x input
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate5m: number; cacheCreate1h: number }> = {
  // Opus 4.5 / 4.6 — $5 / $25
  "claude-opus-4-6": { input: 5e-6, output: 25e-6, cacheRead: 0.5e-6, cacheCreate5m: 6.25e-6, cacheCreate1h: 10e-6 },
  "claude-opus-4-5-20251101": { input: 5e-6, output: 25e-6, cacheRead: 0.5e-6, cacheCreate5m: 6.25e-6, cacheCreate1h: 10e-6 },
  // Opus 4 / 4.1 — $15 / $75
  "claude-opus-4-1-20250414": { input: 15e-6, output: 75e-6, cacheRead: 1.5e-6, cacheCreate5m: 18.75e-6, cacheCreate1h: 30e-6 },
  "claude-opus-4-20250414": { input: 15e-6, output: 75e-6, cacheRead: 1.5e-6, cacheCreate5m: 18.75e-6, cacheCreate1h: 30e-6 },
  // Sonnet — $3 / $15
  "claude-sonnet-4-6": { input: 3e-6, output: 15e-6, cacheRead: 0.3e-6, cacheCreate5m: 3.75e-6, cacheCreate1h: 6e-6 },
  "claude-sonnet-4-5-20250929": { input: 3e-6, output: 15e-6, cacheRead: 0.3e-6, cacheCreate5m: 3.75e-6, cacheCreate1h: 6e-6 },
  // Haiku 4.5 — $1 / $5
  "claude-haiku-4-5-20251001": { input: 1e-6, output: 5e-6, cacheRead: 0.1e-6, cacheCreate5m: 1.25e-6, cacheCreate1h: 2e-6 },
};

function estimateCost(model: string, usage: UsageBlock): number {
  const key = Object.keys(PRICING).find((k) => model.includes(k) || k.includes(model))
    ?? (model.includes("opus") ? "claude-opus-4-6"
      : model.includes("haiku") ? "claude-haiku-4-5-20251001"
        : "claude-sonnet-4-5-20250929");
  const p = PRICING[key];

  let cacheCost: number;
  const cc = usage.cache_creation;
  if (cc && ((cc.ephemeral_5m_input_tokens ?? 0) > 0 || (cc.ephemeral_1h_input_tokens ?? 0) > 0)) {
    // Use granular breakdown when available (Claude Code provides this)
    cacheCost =
      (cc.ephemeral_5m_input_tokens ?? 0) * p.cacheCreate5m +
      (cc.ephemeral_1h_input_tokens ?? 0) * p.cacheCreate1h;
  } else {
    // Fallback: assume 1h cache (Claude Code's default) when breakdown not available
    cacheCost = (usage.cache_creation_input_tokens ?? 0) * p.cacheCreate1h;
  }

  return (
    (usage.input_tokens ?? 0) * p.input +
    (usage.output_tokens ?? 0) * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    cacheCost
  );
}

// --- File Discovery ---

function findJsonlFiles(baseDir: string): string[] {
  const resolvedBase = fs.realpathSync(baseDir);
  const results: string[] = [];
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      // Security: skip symlinks that escape the base directory
      if (entry.isSymbolicLink()) {
        try {
          const realTarget = fs.realpathSync(full);
          if (!realTarget.startsWith(resolvedBase + path.sep) && realTarget !== resolvedBase) {
            continue;
          }
        } catch {
          continue; // broken symlink — skip
        }
      }

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".jsonl")) {
        results.push(full);
      }
    }
  }
  walk(resolvedBase);
  return results;
}

// --- Streak Computation ---

function computeStreaks(dates: string[]): { longestStreak: number; currentStreak: number } {
  if (dates.length === 0) return { longestStreak: 0, currentStreak: 0 };

  const unique = [...new Set(dates)].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = new Date(unique[i - 1]);
    const curr = new Date(unique[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  // Dates in unique[] come from ts.slice(0,10) on ISO timestamps (UTC dates).
  // Compare as strings to avoid UTC/local timezone mismatch from Date parsing.
  const lastDateStr = unique[unique.length - 1];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const isCurrentStreak = lastDateStr === todayStr || lastDateStr === yesterdayStr;

  return {
    longestStreak: longest,
    currentStreak: isCurrentStreak ? current : 0,
  };
}

// --- Main Extraction ---

/**
 * Extract Claude Code usage data from local JSONL conversation files.
 *
 * Reads ~/.claude/projects/ (or a custom directory) and returns structured
 * usage data including daily aggregates, session details, and metadata.
 *
 * @param options - Optional configuration
 * @returns Structured extraction data ready for upload
 * @throws Error if the Claude projects directory doesn't exist
 */
export function extract(options?: ExtractOptions): ExtractedData {
  const claudeDir = options?.claudeDir ?? path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(claudeDir)) {
    throw new Error(`${claudeDir} not found. Is Claude Code installed?`);
  }

  const files = findJsonlFiles(claudeDir);

  // Accumulators
  const dailyMap = new Map<string, {
    inputTokens: number; outputTokens: number;
    cacheRead: number; cacheCreate: number;
    cost: number; messages: number; sessions: Set<string>;
    toolCalls: Record<string, number>;
    models: Record<string, { in: number; out: number; cr: number; cc: number; cost: number }>;
    hours: Record<number, number>;
  }>();

  const sessionMap = new Map<string, {
    project: string; firstTs: number; lastTs: number;
    messages: number; inputTokens: number; outputTokens: number;
    cacheRead: number; cacheCreate: number; cost: number;
    models: Set<string>; toolCalls: Record<string, number>;
    gitBranch: string; subagentSpawns: number;
    imagePastes: number; planModeUsed: boolean;
  }>();

  const globalToolCalls: Record<string, number> = {};
  const globalHours: Record<number, number> = {};
  let totalSubagentSpawns = 0;
  let totalImagePastes = 0;
  let totalPlanModeUses = 0;
  const projectSlugs = new Set<string>();
  const allModels = new Set<string>();
  let processed = 0;

  for (const fpath of files) {
    let content: string;
    try {
      content = fs.readFileSync(fpath, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    for (const line of lines) {
      // Fast pre-filter: skip lines that can't have useful data
      if (line.length < 30) continue;
      if (!line.includes('"assistant"') && !line.includes('"user"')) continue;

      let d: Record<string, unknown>;
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }

      const type = d.type as string;
      const ts = d.timestamp as string | undefined;
      const sessionId = d.sessionId as string | undefined;
      const slug = d.slug as string | undefined;

      if (!ts || !sessionId) continue;

      const date = ts.slice(0, 10);
      const hour = new Date(ts).getHours();
      const tsMs = new Date(ts).getTime();

      if (slug) projectSlugs.add(slug);

      // Ensure daily bucket
      if (!dailyMap.has(date)) {
        dailyMap.set(date, {
          inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreate: 0,
          cost: 0, messages: 0, sessions: new Set(), toolCalls: {}, models: {}, hours: {},
        });
      }
      const day = dailyMap.get(date)!;
      day.sessions.add(sessionId);
      day.hours[hour] = (day.hours[hour] ?? 0) + 1;
      globalHours[hour] = (globalHours[hour] ?? 0) + 1;

      // Ensure session bucket
      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          project: slug ?? "", firstTs: tsMs, lastTs: tsMs,
          messages: 0, inputTokens: 0, outputTokens: 0,
          cacheRead: 0, cacheCreate: 0, cost: 0,
          models: new Set(), toolCalls: {},
          gitBranch: (d.gitBranch as string) ?? "",
          subagentSpawns: 0, imagePastes: 0, planModeUsed: false,
        });
      }
      const session = sessionMap.get(sessionId)!;
      session.firstTs = Math.min(session.firstTs, tsMs);
      session.lastTs = Math.max(session.lastTs, tsMs);
      if (d.gitBranch) session.gitBranch = d.gitBranch as string;

      if (type === "assistant") {
        day.messages++;
        session.messages++;

        const msg = d.message as Record<string, unknown> | undefined;
        if (!msg) continue;

        // Token usage
        const usage = msg.usage as UsageBlock | undefined;
        const model = (msg.model as string) ?? "unknown";
        if (usage) {
          allModels.add(model);
          session.models.add(model);

          const inp = usage.input_tokens ?? 0;
          const out = usage.output_tokens ?? 0;
          const cr = usage.cache_read_input_tokens ?? 0;
          const cc = usage.cache_creation_input_tokens ?? 0;
          const cost = estimateCost(model, usage);

          day.inputTokens += inp;
          day.outputTokens += out;
          day.cacheRead += cr;
          day.cacheCreate += cc;
          day.cost += cost;

          session.inputTokens += inp;
          session.outputTokens += out;
          session.cacheRead += cr;
          session.cacheCreate += cc;
          session.cost += cost;

          // Per-model daily breakdown
          if (!day.models[model]) {
            day.models[model] = { in: 0, out: 0, cr: 0, cc: 0, cost: 0 };
          }
          day.models[model].in += inp;
          day.models[model].out += out;
          day.models[model].cr += cr;
          day.models[model].cc += cc;
          day.models[model].cost += cost;
        }

        // Tool calls from content blocks
        const msgContent = msg.content as unknown[];
        if (Array.isArray(msgContent)) {
          for (const block of msgContent) {
            if (typeof block === "object" && block !== null && (block as ToolUseBlock).type === "tool_use") {
              const name = (block as ToolUseBlock).name;
              day.toolCalls[name] = (day.toolCalls[name] ?? 0) + 1;
              session.toolCalls[name] = (session.toolCalls[name] ?? 0) + 1;
              globalToolCalls[name] = (globalToolCalls[name] ?? 0) + 1;

              if (name === "Agent") {
                session.subagentSpawns++;
                totalSubagentSpawns++;
              }
            }
          }
        }
      }

      if (type === "user") {
        day.messages++;
        session.messages++;

        if (d.imagePasteIds) {
          const ids = d.imagePasteIds as string[];
          if (ids.length > 0) {
            session.imagePastes += ids.length;
            totalImagePastes += ids.length;
          }
        }
        if (d.planContent) {
          session.planModeUsed = true;
          totalPlanModeUses++;
        }
      }
    }

    processed++;
  }

  // --- Build output ---

  const sortedDates = [...dailyMap.keys()].sort();

  const daily: DailyEntry[] = sortedDates.map((date) => {
    const d = dailyMap.get(date)!;
    return {
      date,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheReadTokens: d.cacheRead,
      cacheCreationTokens: d.cacheCreate,
      totalCost: d.cost,
      messageCount: d.messages,
      sessionCount: d.sessions.size,
      toolCalls: d.toolCalls,
      modelBreakdowns: Object.entries(d.models).map(([model, m]) => ({
        modelName: model,
        inputTokens: m.in,
        outputTokens: m.out,
        cacheReadTokens: m.cr,
        cacheCreationTokens: m.cc,
        cost: m.cost,
      })),
      hourCounts: d.hours,
    };
  });

  const sessions: SessionEntry[] = [...sessionMap.entries()]
    .map(([id, s]) => ({
      id,
      project: s.project,
      startTime: new Date(s.firstTs).toISOString(),
      endTime: new Date(s.lastTs).toISOString(),
      durationMs: s.lastTs - s.firstTs,
      messageCount: s.messages,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheRead,
      cacheCreationTokens: s.cacheCreate,
      totalCost: s.cost,
      modelsUsed: [...s.models],
      toolCalls: s.toolCalls,
      gitBranch: s.gitBranch,
      subagentSpawns: s.subagentSpawns,
      imagePastes: s.imagePastes,
      planModeUsed: s.planModeUsed,
    }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Compute streaks
  const { longestStreak, currentStreak } = computeStreaks(sortedDates);

  // Find longest session
  let longestSession: MetaData["longestSession"] = null;
  for (const s of sessions) {
    if (!longestSession || s.durationMs > longestSession.durationMs) {
      longestSession = { id: s.id, durationMs: s.durationMs, messageCount: s.messageCount };
    }
  }

  const totals: Totals = {
    inputTokens: daily.reduce((s, d) => s + d.inputTokens, 0),
    outputTokens: daily.reduce((s, d) => s + d.outputTokens, 0),
    cacheReadTokens: daily.reduce((s, d) => s + d.cacheReadTokens, 0),
    cacheCreationTokens: daily.reduce((s, d) => s + d.cacheCreationTokens, 0),
    totalCost: daily.reduce((s, d) => s + d.totalCost, 0),
    totalSessions: sessionMap.size,
    totalMessages: daily.reduce((s, d) => s + d.messageCount, 0),
    totalDays: daily.length,
  };

  return {
    version: 1,
    extractedAt: new Date().toISOString(),
    daily,
    sessions,
    totals,
    meta: {
      filesProcessed: processed,
      projectCount: projectSlugs.size,
      distinctModels: [...allModels].sort(),
      totalToolCalls: globalToolCalls,
      longestSession,
      longestStreak,
      currentStreak,
      hourCounts: globalHours,
      subagentSpawns: totalSubagentSpawns,
      imagePastes: totalImagePastes,
      planModeUses: totalPlanModeUses,
      dateRange: sortedDates.length > 0
        ? { first: sortedDates[0], last: sortedDates[sortedDates.length - 1] }
        : null,
    },
  };
}
