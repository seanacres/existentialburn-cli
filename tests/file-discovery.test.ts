/**
 * File system / file discovery tests.
 *
 * Tests that the extractor correctly discovers JSONL files in nested
 * directories, handles permission errors, ignores non-JSONL files,
 * and handles edge cases in directory traversal.
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

describe("file discovery", () => {
  it("finds JSONL files in nested directory trees", () => {
    tempDir = createTempProjectsDir();

    // Deep nesting: proj/sub1/sub2/conv.jsonl
    const deepDir = path.join(tempDir, "proj", "sub1", "sub2");
    fs.mkdirSync(deepDir, { recursive: true });
    const lines = [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ];
    fs.writeFileSync(
      path.join(deepDir, "conv.jsonl"),
      lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
      "utf-8"
    );

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(1);
    expect(data.totals.inputTokens).toBe(100);
  });

  it("handles empty directories gracefully", () => {
    tempDir = createTempProjectsDir();
    fs.mkdirSync(path.join(tempDir, "empty-project"), { recursive: true });

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(0);
    expect(data.daily).toEqual([]);
  });

  it("ignores non-JSONL files", () => {
    tempDir = createTempProjectsDir();
    const projDir = path.join(tempDir, "proj");
    fs.mkdirSync(projDir, { recursive: true });

    // Write various non-JSONL files
    fs.writeFileSync(path.join(projDir, "notes.txt"), "some text", "utf-8");
    fs.writeFileSync(path.join(projDir, "config.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(projDir, "data.csv"), "a,b,c", "utf-8");
    fs.writeFileSync(path.join(projDir, "readme.md"), "# readme", "utf-8");

    // Write one valid JSONL file
    writeJsonlFile(tempDir, "proj", "conv.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    // Only the .jsonl file should be processed
    expect(data.meta.filesProcessed).toBe(1);
  });

  it("permission errors on directories are caught and skipped", () => {
    tempDir = createTempProjectsDir();

    // Write a valid file in an accessible directory
    writeJsonlFile(tempDir, "accessible", "conv.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "accessible" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "accessible",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    // Create a directory with no read permission
    const restrictedDir = path.join(tempDir, "restricted");
    fs.mkdirSync(restrictedDir, { recursive: true });
    fs.writeFileSync(
      path.join(restrictedDir, "secret.jsonl"),
      JSON.stringify({ type: "user", timestamp: "2025-06-01T10:00:00Z", sessionId: "s2" }),
      "utf-8"
    );

    try {
      fs.chmodSync(restrictedDir, 0o000);

      // Should not throw, just skip the restricted directory
      const data = extract({ claudeDir: tempDir });
      expect(data.meta.filesProcessed).toBe(1); // only the accessible file
    } finally {
      // Restore permissions for cleanup
      fs.chmodSync(restrictedDir, 0o755);
    }
  });

  it("handles symlinks without crashing", () => {
    tempDir = createTempProjectsDir();

    // Write a real JSONL file
    writeJsonlFile(tempDir, "real-project", "conv.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "real-project" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "real-project",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    // Create a symlink to outside the base directory
    const externalDir = createTempProjectsDir();
    try {
      fs.symlinkSync(externalDir, path.join(tempDir, "symlink-project"));

      // Should not crash. The current code follows symlinks via isDirectory(),
      // which resolves symlinks. This test just proves it doesn't throw.
      const data = extract({ claudeDir: tempDir });
      expect(data.meta.filesProcessed).toBeGreaterThanOrEqual(1);
    } finally {
      cleanupDir(externalDir);
    }
  });

  it("handles broken symlinks without crashing", () => {
    tempDir = createTempProjectsDir();

    writeJsonlFile(tempDir, "real-project", "conv.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "real-project" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "real-project",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    // Create a symlink pointing to a nonexistent target
    fs.symlinkSync("/nonexistent/path", path.join(tempDir, "broken-link"));

    // Should not crash
    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(1);
  });

  it("discovers multiple JSONL files in the same directory", () => {
    tempDir = createTempProjectsDir();

    writeJsonlFile(tempDir, "proj", "conv1.jsonl", [
      userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s1",
        timestamp: "2025-06-01T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ]);

    writeJsonlFile(tempDir, "proj", "conv2.jsonl", [
      userLine({ sessionId: "s2", timestamp: "2025-06-02T10:00:00Z", slug: "proj" }),
      assistantLine({
        sessionId: "s2",
        timestamp: "2025-06-02T10:00:01Z",
        slug: "proj",
        usage: { input_tokens: 200, output_tokens: 100 },
      }),
    ]);

    const data = extract({ claudeDir: tempDir });
    expect(data.meta.filesProcessed).toBe(2);
    expect(data.totals.inputTokens).toBe(300);
  });
});
