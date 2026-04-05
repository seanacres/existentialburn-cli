/**
 * Edge case tests.
 *
 * Tests handling of malformed JSONL, empty files, missing fields,
 * very long lines, mixed valid/invalid data, and unicode content.
 */

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
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
 * Write raw text as a JSONL file (for testing malformed content).
 */
function writeRawJsonl(baseDir: string, projectSlug: string, filename: string, content: string): string {
  const dir = path.join(baseDir, projectSlug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("edge cases — malformed JSONL", () => {
  it("invalid JSON lines are skipped without crashing", () => {
    tempDir = createTempProjectsDir();
    const validUser = JSON.stringify(
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" })
    );
    const validAssistant = JSON.stringify(
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    );

    const content = [
      "this is not json at all!!!",
      validUser,
      '{"broken": true, missing closing brace',
      validAssistant,
      "{{{{{",
      "",
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(100);
    expect(data.totals.outputTokens).toBe(50);
    expect(data.meta.filesProcessed).toBe(1);
  });

  it("completely invalid JSONL file produces valid empty output", () => {
    tempDir = createTempProjectsDir();
    writeRawJsonl(
      tempDir,
      "proj",
      "garbage.jsonl",
      "not json\nalso not json\nstill not json\n"
    );

    const data = extract({ claudeDir: tempDir });
    // File was "processed" (opened and read) but no valid data extracted
    expect(data.meta.filesProcessed).toBe(1);
    expect(data.totals.totalMessages).toBe(0);
  });
});

describe("edge cases — empty files", () => {
  it("empty JSONL file produces valid output", () => {
    tempDir = createTempProjectsDir();
    writeRawJsonl(tempDir, "proj", "empty.jsonl", "");

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(1);
    expect(data.daily).toEqual([]);
    expect(data.sessions).toEqual([]);
  });

  it("JSONL file with only whitespace and blank lines", () => {
    tempDir = createTempProjectsDir();
    writeRawJsonl(tempDir, "proj", "whitespace.jsonl", "\n\n   \n  \n\n");

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(1);
    expect(data.totals.totalMessages).toBe(0);
  });
});

describe("edge cases — missing fields in JSONL data", () => {
  it("lines missing timestamp are skipped", () => {
    tempDir = createTempProjectsDir();
    const content = [
      // Valid line with timestamp
      JSON.stringify({
        type: "assistant",
        timestamp: "2025-06-01T10:00:00Z",
        sessionId: "s1",
        slug: "proj",
        message: {
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [],
        },
      }),
      // Invalid: no timestamp
      JSON.stringify({
        type: "assistant",
        sessionId: "s1",
        slug: "proj",
        message: {
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 999, output_tokens: 999 },
          content: [],
        },
      }),
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    // Only the line with timestamp should be counted
    expect(data.totals.inputTokens).toBe(100);
    expect(data.totals.outputTokens).toBe(50);
  });

  it("lines missing sessionId are skipped", () => {
    tempDir = createTempProjectsDir();
    const content = [
      JSON.stringify({
        type: "assistant",
        timestamp: "2025-06-01T10:00:00Z",
        sessionId: "s1",
        slug: "proj",
        message: {
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [],
        },
      }),
      // Missing sessionId
      JSON.stringify({
        type: "assistant",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        message: {
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 999, output_tokens: 999 },
          content: [],
        },
      }),
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(100);
  });

  it("assistant line with missing message field is handled", () => {
    tempDir = createTempProjectsDir();
    const content = JSON.stringify({
      type: "assistant",
      timestamp: "2025-06-01T10:00:00Z",
      sessionId: "s1",
      slug: "proj",
      // no 'message' field
    });

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    // Should not throw
    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(0);
  });

  it("assistant line with missing usage field is handled", () => {
    tempDir = createTempProjectsDir();
    const content = JSON.stringify({
      type: "assistant",
      timestamp: "2025-06-01T10:00:00Z",
      sessionId: "s1",
      slug: "proj",
      message: {
        model: "claude-sonnet-4-5-20250929",
        // no 'usage' field
        content: [],
      },
    });

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    // No crash, zero tokens
    expect(data.totals.inputTokens).toBe(0);
  });

  it("lines missing slug still produce sessions", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      {
        type: "user",
        timestamp: "2025-06-01T10:00:00Z",
        sessionId: "s1",
        // no slug
        message: { role: "user", content: [{ type: "text", text: "hello" }] },
      },
      {
        type: "assistant",
        timestamp: "2025-06-01T10:00:01Z",
        sessionId: "s1",
        // no slug
        message: {
          role: "assistant",
          model: "claude-sonnet-4-5-20250929",
          usage: { input_tokens: 100, output_tokens: 50 },
          content: [],
        },
      },
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.totalSessions).toBe(1);
    expect(data.sessions[0].project).toBe(""); // empty, not undefined
    expect(data.meta.projectCount).toBe(0); // no slug = no project counted
  });
});

describe("edge cases — very long lines", () => {
  it("handles very long JSONL lines (100KB+)", () => {
    tempDir = createTempProjectsDir();
    // Build a line with a huge text content block
    const hugeText = "A".repeat(100_000);
    const line = {
      type: "assistant",
      timestamp: "2025-06-01T10:00:00Z",
      sessionId: "s1",
      slug: "proj",
      message: {
        model: "claude-sonnet-4-5-20250929",
        usage: { input_tokens: 500, output_tokens: 250 },
        content: [{ type: "text", text: hugeText }],
      },
    };

    writeRawJsonl(tempDir, "proj", "conv.jsonl", JSON.stringify(line));

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(500);
    expect(data.totals.outputTokens).toBe(250);
    // The huge text should NOT appear in output
    expect(JSON.stringify(data)).not.toContain(hugeText);
  });
});

describe("edge cases — mixed valid/invalid lines", () => {
  it("extracts only valid data from files with mixed content", () => {
    tempDir = createTempProjectsDir();

    const validLines = [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:01:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:01:01Z",
        slug: "proj",
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
    ];

    // Interleave valid and invalid lines
    const content = [
      "invalid line 1",
      JSON.stringify(validLines[0]),
      "",
      JSON.stringify(validLines[1]),
      "another invalid line",
      JSON.stringify(validLines[2]),
      '{"type":"system","data":"ignored"}', // valid JSON but not user/assistant
      JSON.stringify(validLines[3]),
      "trailing garbage",
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(300);
    expect(data.totals.outputTokens).toBe(150);
    expect(data.totals.totalMessages).toBe(4);
  });
});

describe("edge cases — unicode content", () => {
  it("handles unicode in user prompts without crashing", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "proj",
        promptText: "Help me with this code: const greeting = '\u4f60\u597d\u4e16\u754c \ud83c\udf0d \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4 \u00f1'",
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
        textContent: "\u5f53\u7136\u53ef\u4ee5\uff01\u8fd9\u662f\u4f60\u7684\u4ee3\u7801\u4fee\u590d\u3002Here is the fix with \u00fc\u00f6\u00e4 support.",
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(100);
    expect(data.totals.outputTokens).toBe(50);

    // Unicode content should NOT leak into output
    const json = JSON.stringify(data);
    expect(json).not.toContain("\u4f60\u597d\u4e16\u754c");
    expect(json).not.toContain("\u5f53\u7136\u53ef\u4ee5");
  });

  it("handles emoji in JSONL without crashing", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "proj",
        promptText: "\ud83d\ude80 Deploy this to production! \ud83d\udd25\ud83d\udcaf\ud83e\udd16",
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
        textContent: "\u2705 Done! \ud83c\udf89 Your app is now deployed \ud83d\ude80",
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.totalMessages).toBe(2);
  });

  it("handles RTL text (Arabic/Hebrew) without crashing", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "c.jsonl", [
      userLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:00Z",
        slug: "proj",
        promptText: "\u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645 - \u05e9\u05dc\u05d5\u05dd \u05e2\u05d5\u05dc\u05dd",
      }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.totalMessages).toBe(2);
  });
});

describe("edge cases — pre-filter behavior", () => {
  it("lines shorter than 30 chars are skipped (fast pre-filter)", () => {
    tempDir = createTempProjectsDir();
    // Short valid-ish JSON lines should be skipped by the pre-filter
    const content = [
      '{"type":"user"}', // 15 chars, skipped
      '{"type":"assistant"}', // 20 chars, skipped
      JSON.stringify(
        userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" })
      ),
      JSON.stringify(
        assistantLine({
          sessionId: "s1",
          timestamp: "2025-06-01T10:00:01Z",
          slug: "proj",
          usage: { input_tokens: 100, output_tokens: 50 },
        })
      ),
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(100);
  });

  it("lines without 'assistant' or 'user' string are skipped (fast pre-filter)", () => {
    tempDir = createTempProjectsDir();
    // This line has valid JSON with type:"system" but no "assistant" or "user" substring
    const systemLine = JSON.stringify({
      type: "system",
      timestamp: "2025-06-01T10:00:00Z",
      sessionId: "s1",
      slug: "proj",
      data: { tokens: 999 },
      padding: "x".repeat(100), // ensure > 30 chars
    });

    const content = [
      systemLine,
      JSON.stringify(
        userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" })
      ),
      JSON.stringify(
        assistantLine({
          sessionId: "s1",
          timestamp: "2025-06-01T10:00:01Z",
          slug: "proj",
          usage: { input_tokens: 100, output_tokens: 50 },
        })
      ),
    ].join("\n");

    writeRawJsonl(tempDir, "proj", "conv.jsonl", content);

    const data = extract({ claudeDir: tempDir });
    expect(data.totals.inputTokens).toBe(100);
    expect(data.totals.totalMessages).toBe(2);
  });
});
