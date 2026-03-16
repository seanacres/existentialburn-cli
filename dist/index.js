"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = extract;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// --- Pricing ---
const PRICING = {
    "claude-opus-4-6": { input: 15e-6, output: 75e-6, cacheRead: 1.5e-6, cacheCreate: 18.75e-6 },
    "claude-opus-4-5-20251101": { input: 15e-6, output: 75e-6, cacheRead: 1.5e-6, cacheCreate: 18.75e-6 },
    "claude-sonnet-4-5-20250929": { input: 3e-6, output: 15e-6, cacheRead: 0.3e-6, cacheCreate: 3.75e-6 },
    "claude-sonnet-4-6": { input: 3e-6, output: 15e-6, cacheRead: 0.3e-6, cacheCreate: 3.75e-6 },
    "claude-haiku-4-5-20251001": { input: 0.8e-6, output: 4e-6, cacheRead: 0.08e-6, cacheCreate: 1e-6 },
};
function estimateCost(model, usage) {
    const key = Object.keys(PRICING).find((k) => model.includes(k) || k.includes(model))
        ?? (model.includes("opus") ? "claude-opus-4-6"
            : model.includes("haiku") ? "claude-haiku-4-5-20251001"
                : "claude-sonnet-4-5-20250929");
    const p = PRICING[key];
    return ((usage.input_tokens ?? 0) * p.input +
        (usage.output_tokens ?? 0) * p.output +
        (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
        (usage.cache_creation_input_tokens ?? 0) * p.cacheCreate);
}
// --- File Discovery ---
function findJsonlFiles(baseDir) {
    const results = [];
    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (entry.name.endsWith(".jsonl")) {
                results.push(full);
            }
        }
    }
    walk(baseDir);
    return results;
}
// --- Streak Computation ---
function computeStreaks(dates) {
    if (dates.length === 0)
        return { longestStreak: 0, currentStreak: 0 };
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
        }
        else {
            current = 1;
        }
    }
    const lastDate = new Date(unique[unique.length - 1]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffFromToday = (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    const isCurrentStreak = diffFromToday <= 1;
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
function extract(options) {
    const claudeDir = options?.claudeDir ?? path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(claudeDir)) {
        throw new Error(`${claudeDir} not found. Is Claude Code installed?`);
    }
    const files = findJsonlFiles(claudeDir);
    // Accumulators
    const dailyMap = new Map();
    const sessionMap = new Map();
    const globalToolCalls = {};
    const globalHours = {};
    let totalSubagentSpawns = 0;
    let totalImagePastes = 0;
    let totalPlanModeUses = 0;
    const projectSlugs = new Set();
    const allModels = new Set();
    let processed = 0;
    for (const fpath of files) {
        let content;
        try {
            content = fs.readFileSync(fpath, "utf-8");
        }
        catch {
            continue;
        }
        const lines = content.split("\n");
        for (const line of lines) {
            // Fast pre-filter: skip lines that can't have useful data
            if (line.length < 30)
                continue;
            if (!line.includes('"assistant"') && !line.includes('"user"'))
                continue;
            let d;
            try {
                d = JSON.parse(line);
            }
            catch {
                continue;
            }
            const type = d.type;
            const ts = d.timestamp;
            const sessionId = d.sessionId;
            const slug = d.slug;
            if (!ts || !sessionId)
                continue;
            const date = ts.slice(0, 10);
            const hour = new Date(ts).getHours();
            const tsMs = new Date(ts).getTime();
            if (slug)
                projectSlugs.add(slug);
            // Ensure daily bucket
            if (!dailyMap.has(date)) {
                dailyMap.set(date, {
                    inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheCreate: 0,
                    cost: 0, messages: 0, sessions: new Set(), toolCalls: {}, models: {}, hours: {},
                });
            }
            const day = dailyMap.get(date);
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
                    gitBranch: d.gitBranch ?? "",
                    subagentSpawns: 0, imagePastes: 0, planModeUsed: false,
                });
            }
            const session = sessionMap.get(sessionId);
            session.firstTs = Math.min(session.firstTs, tsMs);
            session.lastTs = Math.max(session.lastTs, tsMs);
            if (d.gitBranch)
                session.gitBranch = d.gitBranch;
            if (type === "assistant") {
                day.messages++;
                session.messages++;
                const msg = d.message;
                if (!msg)
                    continue;
                // Token usage
                const usage = msg.usage;
                const model = msg.model ?? "unknown";
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
                const msgContent = msg.content;
                if (Array.isArray(msgContent)) {
                    for (const block of msgContent) {
                        if (typeof block === "object" && block !== null && block.type === "tool_use") {
                            const name = block.name;
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
                    const ids = d.imagePasteIds;
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
    const daily = sortedDates.map((date) => {
        const d = dailyMap.get(date);
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
    const sessions = [...sessionMap.entries()]
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
    let longestSession = null;
    for (const s of sessions) {
        if (!longestSession || s.durationMs > longestSession.durationMs) {
            longestSession = { id: s.id, durationMs: s.durationMs, messageCount: s.messageCount };
        }
    }
    const totals = {
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
//# sourceMappingURL=index.js.map