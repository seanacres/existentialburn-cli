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
export interface UsageBlock {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
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
    longestSession: {
        id: string;
        durationMs: number;
        messageCount: number;
    } | null;
    longestStreak: number;
    currentStreak: number;
    hourCounts: Record<number, number>;
    subagentSpawns: number;
    imagePastes: number;
    planModeUses: number;
    dateRange: {
        first: string;
        last: string;
    } | null;
}
export interface ExtractOptions {
    /** Override the Claude projects directory (defaults to ~/.claude/projects) */
    claudeDir?: string;
}
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
export declare function extract(options?: ExtractOptions): ExtractedData;
//# sourceMappingURL=index.d.ts.map