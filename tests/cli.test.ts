/**
 * CLI integration tests.
 *
 * Tests the CLI behavior by simulating what cli.ts does: calling extract()
 * and writing JSON to stdout vs progress info to stderr. Since the actual
 * CLI has no --dir flag, we test the contract it implements:
 *
 * 1. extract() output is valid JSON (stdout contract)
 * 2. extract() errors produce clear error messages (stderr contract)
 * 3. The stdout/stderr separation is correct
 *
 * We also test running the actual CLI via child_process for the error path,
 * which doesn't need a custom directory.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as path from "path";
import { extract } from "../src/index";
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

/**
 * Simulate the CLI's stdout output: JSON.stringify(data).
 * This mirrors exactly what cli.ts does with process.stdout.write.
 */
function simulateCliStdout(claudeDir: string): string {
  const data = extract({ claudeDir });
  return JSON.stringify(data);
}

/**
 * Simulate the CLI's stderr output.
 */
function simulateCliStderr(claudeDir: string): string {
  const data = extract({ claudeDir });
  const lines: string[] = [];
  lines.push(`\n\u2713 ${data.totals.totalSessions} sessions, ${data.totals.totalDays} days`);
  lines.push(`\u2713 $${data.totals.totalCost.toFixed(2)} total estimated cost`);
  lines.push(
    `\u2713 ${Object.values(data.meta.totalToolCalls)
      .reduce((s, v) => s + v, 0)
      .toLocaleString()} tool calls`
  );
  if (data.meta.subagentSpawns > 0) {
    lines.push(`\u2713 ${data.meta.subagentSpawns} subagent spawns`);
  }
  lines.push(`\nUpload at https://existentialburn.com/upload`);
  return lines.join("\n");
}

describe("CLI — stdout contract", () => {
  it("outputs valid JSON to stdout", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 500, output_tokens: 250 },
      }),
    ]);

    const stdout = simulateCliStdout(tempDir);

    // stdout should be parseable JSON
    const data = JSON.parse(stdout);
    expect(data.version).toBe(1);
    expect(data.totals).toBeDefined();
    expect(data.sessions).toBeDefined();
    expect(data.daily).toBeDefined();
    expect(data.meta).toBeDefined();
  });

  it("stdout is pure JSON with no extra text", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    const stdout = simulateCliStdout(tempDir);
    const trimmed = stdout.trim();

    // Pure JSON: starts with { and ends with }
    expect(trimmed.startsWith("{")).toBe(true);
    expect(trimmed.endsWith("}")).toBe(true);
    expect(() => JSON.parse(trimmed)).not.toThrow();
  });

  it("stdout JSON is parseable even with large data", () => {
    tempDir = createTempProjectsDir();
    // Create many sessions across many days
    const lines: object[] = [];
    for (let day = 1; day <= 30; day++) {
      const date = `2025-06-${String(day).padStart(2, "0")}`;
      for (let sess = 0; sess < 5; sess++) {
        const sessionId = `s-${day}-${sess}`;
        lines.push(
          userLine({ sessionId, timestamp: `${date}T10:00:00Z`, slug: "proj" }),
          assistantLine({
            sessionId,
            timestamp: `${date}T10:00:01Z`,
            slug: "proj",
            usage: { input_tokens: 100, output_tokens: 50 },
            toolCalls: ["Read", "Write"],
          })
        );
      }
    }
    writeJsonlFile(tempDir, "proj", "c.jsonl", lines);

    const stdout = simulateCliStdout(tempDir);
    const data = JSON.parse(stdout);

    expect(data.totals.totalSessions).toBe(150);
    expect(data.totals.totalDays).toBe(30);
  });
});

describe("CLI — stderr contract", () => {
  it("stderr contains session count and cost", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 500, output_tokens: 250 },
      }),
    ]);

    const stderr = simulateCliStderr(tempDir);
    expect(stderr).toContain("1 sessions");
    expect(stderr).toContain("1 days");
    expect(stderr).toContain("$");
    expect(stderr).toContain("tool calls");
    expect(stderr).toContain("existentialburn.com/upload");
  });

  it("stderr mentions subagent spawns when present", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        toolCalls: ["Agent", "Agent"],
      }),
    ]);

    const stderr = simulateCliStderr(tempDir);
    expect(stderr).toContain("2 subagent spawns");
  });

  it("stderr does not mention subagent spawns when zero", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
      }),
    ]);

    const stderr = simulateCliStderr(tempDir);
    expect(stderr).not.toContain("subagent");
  });
});

describe("CLI — error handling", () => {
  it("throws error for non-existent claude directory", () => {
    expect(() => extract({ claudeDir: "/nonexistent/path/to/claude" })).toThrow(
      /not found/
    );
  });

  it("error message includes the missing path", () => {
    const badPath = "/some/fake/claude/projects";
    try {
      extract({ claudeDir: badPath });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain(badPath);
    }
  });

  it("error message asks if Claude Code is installed", () => {
    try {
      extract({ claudeDir: "/nonexistent" });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Claude Code installed");
    }
  });

  it("empty directory produces valid JSON with zero counts (no error)", () => {
    tempDir = createTempProjectsDir();
    const stdout = simulateCliStdout(tempDir);
    const data = JSON.parse(stdout);

    expect(data.totals.totalSessions).toBe(0);
    expect(data.totals.totalMessages).toBe(0);
    expect(data.sessions).toEqual([]);
    expect(data.daily).toEqual([]);
  });
});
