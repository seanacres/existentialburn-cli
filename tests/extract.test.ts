/**
 * Core extraction tests.
 *
 * Creates temp directories with mock JSONL files containing realistic
 * Claude Code conversation data and verifies the output shape, aggregation,
 * and correctness of the extract() function.
 */

import { describe, it, expect, afterEach } from "vitest";
import { extract, ExtractedData } from "../src/index";
import {
  createTempProjectsDir,
  cleanupDir,
  writeJsonlFile,
  assistantLine,
  userLine,
} from "./helpers";

let tempDir: string;

afterEach(() => {
  if (tempDir) cleanupDir(tempDir);
});

describe("extract() — output shape", () => {
  it("returns all top-level fields with correct types", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "my-project", "conv.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "my-project",
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "my-project",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });

    expect(data.version).toBe(1);
    expect(typeof data.extractedAt).toBe("string");
    expect(Array.isArray(data.daily)).toBe(true);
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(typeof data.totals).toBe("object");
    expect(typeof data.meta).toBe("object");
  });

  it("daily entries have the correct DailyEntry shape", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T12:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T12:00:01Z",
        slug: "proj",
        usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 30 },
        toolCalls: ["Read", "Write"],
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    const day = data.daily[0];

    expect(day.date).toBe("2025-06-01");
    expect(day.inputTokens).toBe(500);
    expect(day.outputTokens).toBe(200);
    expect(day.cacheReadTokens).toBe(30);
    expect(day.cacheCreationTokens).toBe(0);
    expect(typeof day.totalCost).toBe("number");
    expect(day.totalCost).toBeGreaterThan(0);
    expect(day.messageCount).toBe(2); // user + assistant
    expect(day.sessionCount).toBe(1);
    expect(day.toolCalls).toEqual({ Read: 1, Write: 1 });
    expect(Array.isArray(day.modelBreakdowns)).toBe(true);
    expect(typeof day.hourCounts).toBe("object");
  });

  it("session entries have the correct SessionEntry shape", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T08:00:00Z", slug: "proj", gitBranch: "main" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T08:05:00Z",
        slug: "proj",
        gitBranch: "main",
        model: "claude-sonnet-4-5-20250929",
        usage: { input_tokens: 1000, output_tokens: 500 },
        toolCalls: ["Bash"],
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    const session = data.sessions[0];

    expect(session.id).toBe("s1");
    expect(session.project).toBe("proj");
    expect(typeof session.startTime).toBe("string");
    expect(typeof session.endTime).toBe("string");
    expect(session.durationMs).toBeGreaterThanOrEqual(0);
    expect(session.messageCount).toBe(2);
    expect(session.inputTokens).toBe(1000);
    expect(session.outputTokens).toBe(500);
    expect(session.modelsUsed).toContain("claude-sonnet-4-5-20250929");
    expect(session.toolCalls).toEqual({ Bash: 1 });
    expect(session.gitBranch).toBe("main");
    expect(typeof session.subagentSpawns).toBe("number");
    expect(typeof session.imagePastes).toBe("number");
    expect(typeof session.planModeUsed).toBe("boolean");
  });

  it("totals aggregate correctly across days", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10 },
      }),
      userLine({ sessionId: "s2", timestamp: "2025-06-02T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s2",
        timestamp: "2025-06-02T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 20 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });

    expect(data.totals.inputTokens).toBe(300);
    expect(data.totals.outputTokens).toBe(150);
    expect(data.totals.cacheReadTokens).toBe(30);
    expect(data.totals.totalSessions).toBe(2);
    expect(data.totals.totalMessages).toBe(4);
    expect(data.totals.totalDays).toBe(2);
    expect(data.totals.totalCost).toBeGreaterThan(0);
  });

  it("meta fields are populated correctly", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "project-a", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "project-a" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:30:00Z",
        slug: "project-a",
        model: "claude-opus-4-6",
        usage: { input_tokens: 500, output_tokens: 250 },
        toolCalls: ["Read", "Bash", "Agent"],
      }),
    ]);
    writeJsonlFile(tempDir, "project-b", "c.jsonl", [
      userLine({
        sessionId: "s2",
        timestamp: "2025-06-02T14:00:00Z",
        slug: "project-b",
        imagePasteIds: ["img1", "img2"],
      }),
      assistantLine({
        sessionId: "s2",
        timestamp: "2025-06-02T14:05:00Z",
        slug: "project-b",
        model: "claude-sonnet-4-5-20250929",
        usage: { input_tokens: 300, output_tokens: 100 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });

    expect(data.meta.filesProcessed).toBe(2);
    expect(data.meta.projectCount).toBe(2);
    expect(data.meta.distinctModels).toContain("claude-opus-4-6");
    expect(data.meta.distinctModels).toContain("claude-sonnet-4-5-20250929");
    expect(data.meta.totalToolCalls["Read"]).toBe(1);
    expect(data.meta.totalToolCalls["Bash"]).toBe(1);
    expect(data.meta.totalToolCalls["Agent"]).toBe(1);
    expect(data.meta.subagentSpawns).toBe(1);
    expect(data.meta.imagePastes).toBe(2);
    expect(data.meta.dateRange).toEqual({ first: "2025-06-01", last: "2025-06-02" });
    expect(data.meta.longestSession).toBeDefined();
    expect(data.meta.longestSession!.id).toBeDefined();
  });
});

describe("extract() — aggregation", () => {
  it("counts tool calls correctly per day and session", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        toolCalls: ["Read", "Read", "Bash", "Write"],
      }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:01:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:01:01Z",
        slug: "proj",
        toolCalls: ["Read"],
      }),
    ]);

    const data = extract({ claudeDir: tempDir });

    expect(data.daily[0].toolCalls["Read"]).toBe(3);
    expect(data.daily[0].toolCalls["Bash"]).toBe(1);
    expect(data.daily[0].toolCalls["Write"]).toBe(1);
    expect(data.sessions[0].toolCalls["Read"]).toBe(3);
    expect(data.meta.totalToolCalls["Read"]).toBe(3);
  });

  it("tracks model breakdowns per day", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        model: "claude-opus-4-6",
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:01:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:01:01Z",
        slug: "proj",
        model: "claude-sonnet-4-5-20250929",
        usage: { input_tokens: 300, output_tokens: 100 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    const breakdowns = data.daily[0].modelBreakdowns;

    expect(breakdowns.length).toBe(2);
    const opus = breakdowns.find((b) => b.modelName === "claude-opus-4-6");
    const sonnet = breakdowns.find((b) => b.modelName === "claude-sonnet-4-5-20250929");
    expect(opus).toBeDefined();
    expect(opus!.inputTokens).toBe(1000);
    expect(opus!.outputTokens).toBe(500);
    expect(sonnet).toBeDefined();
    expect(sonnet!.inputTokens).toBe(300);
    expect(sonnet!.outputTokens).toBe(100);
  });

  it("tracks subagent spawns via Agent tool calls", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        toolCalls: ["Agent", "Agent", "Read"],
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.sessions[0].subagentSpawns).toBe(2);
    expect(data.meta.subagentSpawns).toBe(2);
  });

  it("tracks image pastes from user lines", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "proj",
        imagePasteIds: ["img_abc", "img_def", "img_ghi"],
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.sessions[0].imagePastes).toBe(3);
    expect(data.meta.imagePastes).toBe(3);
  });

  it("tracks plan mode usage", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "proj",
        planContent: "I want to refactor the database layer to use connection pooling.",
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.sessions[0].planModeUsed).toBe(true);
    expect(data.meta.planModeUses).toBe(1);
  });

  it("handles multiple JSONL files across multiple projects", () => {
    tempDir = createTempProjectsDir();

    // Project A, file 1
    writeJsonlFile(tempDir, "project-a", "conv1.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "project-a" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "project-a",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    // Project A, file 2
    writeJsonlFile(tempDir, "project-a", "conv2.jsonl", [
      userLine({ sessionId: "s2", timestamp: "2025-06-02T11:00:00Z", slug: "project-a" }),
      assistantLine({
        sessionId: "s2",
        timestamp: "2025-06-02T11:00:01Z",
        slug: "project-a",
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
    ]);

    // Project B
    writeJsonlFile(tempDir, "project-b", "conv.jsonl", [
      userLine({ sessionId: "s3", timestamp: "2025-06-03T12:00:00Z", slug: "project-b" }),
      assistantLine({
        sessionId: "s3",
        timestamp: "2025-06-03T12:00:01Z",
        slug: "project-b",
        usage: { input_tokens: 300, output_tokens: 150 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });

    expect(data.meta.filesProcessed).toBe(3);
    expect(data.meta.projectCount).toBe(2);
    expect(data.totals.totalSessions).toBe(3);
    expect(data.totals.inputTokens).toBe(600);
    expect(data.totals.outputTokens).toBe(300);
    expect(data.totals.totalDays).toBe(3);
  });

  it("session duration is computed from first to last timestamp", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
      }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:30:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:30:01Z",
        slug: "proj",
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    const session = data.sessions[0];
    // 30 minutes and 1 second = 1,801,000 ms
    expect(session.durationMs).toBe(1801000);
  });

  it("hour counts track message distribution across hours", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T08:00:00Z", slug: "proj" }),
      assistantLine({ sessionId: "s1", timestamp: "2025-06-01T08:00:01Z", slug: "proj" }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T14:00:00Z", slug: "proj" }),
      assistantLine({ sessionId: "s1", timestamp: "2025-06-01T14:00:01Z", slug: "proj" }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T14:30:00Z", slug: "proj" }),
      assistantLine({ sessionId: "s1", timestamp: "2025-06-01T14:30:01Z", slug: "proj" }),
    ]);

    const data = extract({ claudeDir: tempDir });

    // Hours are in local time, so we need to account for timezone offset
    // Just verify the structure exists and has correct total count
    const totalHourMessages = Object.values(data.meta.hourCounts).reduce(
      (sum, v) => sum + v,
      0
    );
    expect(totalHourMessages).toBe(6);
  });
});

describe("extract() — error handling", () => {
  it("throws when claudeDir does not exist", () => {
    expect(() => extract({ claudeDir: "/nonexistent/path" })).toThrow(
      /not found/
    );
  });

  it("returns empty data for empty directory", () => {
    tempDir = createTempProjectsDir();
    const data = extract({ claudeDir: tempDir });

    expect(data.daily).toEqual([]);
    expect(data.sessions).toEqual([]);
    expect(data.totals.totalSessions).toBe(0);
    expect(data.totals.totalMessages).toBe(0);
    expect(data.totals.totalCost).toBe(0);
    expect(data.meta.filesProcessed).toBe(0);
    expect(data.meta.dateRange).toBeNull();
    expect(data.meta.longestSession).toBeNull();
  });
});
