/**
 * Streak calculation tests.
 *
 * Tests the computeStreaks() function indirectly through extract(),
 * since it's not exported. We create JSONL data with specific date
 * patterns and verify the streak values in the output.
 */

import { describe, it, expect, afterEach } from "vitest";
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
 * Helper: create JSONL entries spanning specific dates.
 * Each date gets one user + one assistant message.
 */
function createDatedEntries(dates: string[]): object[] {
  const lines: object[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const sessionId = `s-${i}`;
    lines.push(
      userLine({
        sessionId,
        timestamp: `${date}T12:00:00Z`,
        slug: "proj",
      }),
      assistantLine({
        sessionId,
        timestamp: `${date}T12:00:01Z`,
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    );
  }
  return lines;
}

describe("streak calculation", () => {
  it("empty data produces zero streaks", () => {
    tempDir = createTempProjectsDir();
    const data = extract({ claudeDir: tempDir });

    expect(data.meta.longestStreak).toBe(0);
    expect(data.meta.currentStreak).toBe(0);
  });

  it("single date produces longest streak of 1", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", createDatedEntries(["2025-06-15"]));

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(1);
  });

  it("consecutive dates produce correct streak length", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        "2025-06-10",
        "2025-06-11",
        "2025-06-12",
        "2025-06-13",
        "2025-06-14",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(5);
  });

  it("gap in dates breaks the streak", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        "2025-06-10",
        "2025-06-11",
        "2025-06-12",
        // gap on June 13
        "2025-06-14",
        "2025-06-15",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    // Longest streak is 3 (June 10-12), not 5
    expect(data.meta.longestStreak).toBe(3);
  });

  it("multiple streaks: longest is correctly identified", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        // Streak 1: 2 days
        "2025-06-01",
        "2025-06-02",
        // gap
        // Streak 2: 4 days (longest)
        "2025-06-10",
        "2025-06-11",
        "2025-06-12",
        "2025-06-13",
        // gap
        // Streak 3: 3 days
        "2025-06-20",
        "2025-06-21",
        "2025-06-22",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(4);
  });

  it("current streak is 0 when last activity is more than 1 day ago", () => {
    tempDir = createTempProjectsDir();
    // Dates far in the past
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries(["2024-01-01", "2024-01-02", "2024-01-03"])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(3);
    expect(data.meta.currentStreak).toBe(0); // too old to be current
  });

  it("current streak counts when last activity is today", () => {
    tempDir = createTempProjectsDir();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);

    const dates = [
      dayBefore.toISOString().slice(0, 10),
      yesterday.toISOString().slice(0, 10),
      today.toISOString().slice(0, 10),
    ];

    writeJsonlFile(tempDir, "proj", "c.jsonl", createDatedEntries(dates));

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.currentStreak).toBe(3);
    expect(data.meta.longestStreak).toBe(3);
  });

  it("current streak counts when last activity is yesterday", () => {
    tempDir = createTempProjectsDir();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);

    const dates = [
      dayBefore.toISOString().slice(0, 10),
      yesterday.toISOString().slice(0, 10),
    ];

    writeJsonlFile(tempDir, "proj", "c.jsonl", createDatedEntries(dates));

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.currentStreak).toBe(2);
  });

  it("dates spanning month boundaries are handled correctly", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        "2025-01-30",
        "2025-01-31",
        "2025-02-01",
        "2025-02-02",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(4);
  });

  it("dates spanning year boundaries are handled correctly", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        "2024-12-30",
        "2024-12-31",
        "2025-01-01",
        "2025-01-02",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(4);
  });

  it("duplicate dates on same day do not inflate streak length", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(
      tempDir,
      "proj",
      "c.jsonl",
      createDatedEntries([
        "2025-06-10",
        "2025-06-10", // duplicate
        "2025-06-10", // duplicate
        "2025-06-11",
      ])
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.longestStreak).toBe(2);
  });
});
