/**
 * CRITICAL: Privacy / data boundary tests.
 *
 * These tests prove that the extractor ONLY outputs metadata and NEVER
 * leaks user prompts, assistant responses, code, tool arguments, or
 * any other sensitive content from the JSONL conversation files.
 *
 * This is the most important test file in the suite — it proves the
 * trust boundary that the README promises.
 */

import { describe, it, expect, afterEach } from "vitest";
import { extract } from "../src/index";
import {
  createTempProjectsDir,
  cleanupDir,
  writeJsonlFile,
} from "./helpers";
import * as fs from "fs";
import * as path from "path";

let tempDir: string;

afterEach(() => {
  if (tempDir) cleanupDir(tempDir);
});

// Sensitive strings that appear in mock JSONL data but must NEVER
// appear anywhere in the extraction output.
const SENSITIVE_STRINGS = [
  // User prompt text
  "Please refactor the authentication module to use OAuth2 instead of basic auth",
  "My API key is sk-ant-api03-abc123xyz",
  // Assistant response text
  "Here is the refactored authentication module using OAuth2",
  "I'll update the database schema to add the new columns",
  // Code blocks
  "const secretKey = process.env.SECRET_KEY",
  "function handleLogin(username: string, password: string)",
  'SELECT * FROM users WHERE email = "admin@example.com"',
  // Tool arguments (file contents, commands)
  "echo secret-password-12345",
  "/home/user/.ssh/id_rsa",
  "PRIVATE KEY CONTENT THAT SHOULD NOT LEAK",
  "rm -rf /important/data",
  // File path contents passed to tools
  "export const DATABASE_URL = 'postgresql://user:pass@host/db'",
  // Image paste IDs (only count should appear, not the IDs)
  "img_paste_abc123def456",
  "img_paste_xyz789uvw012",
  // Plan content
  "Detailed refactoring plan: Step 1 - Extract the auth service into a separate module",
];

function buildSensitiveJsonlLines(): object[] {
  const sessionId = "sess-boundary-test";
  const slug = "my-secret-project";
  const ts = "2025-06-15T10:00:00Z";

  return [
    // User message with sensitive prompt
    {
      type: "user",
      timestamp: ts,
      sessionId,
      slug,
      gitBranch: "feature/oauth2-migration",
      message: {
        id: "msg_user1",
        type: "message",
        role: "user",
        content: [
          {
            type: "text",
            text: "Please refactor the authentication module to use OAuth2 instead of basic auth. My API key is sk-ant-api03-abc123xyz",
          },
        ],
      },
      imagePasteIds: ["img_paste_abc123def456", "img_paste_xyz789uvw012"],
      planContent:
        "Detailed refactoring plan: Step 1 - Extract the auth service into a separate module",
    },
    // Assistant response with code and tool calls
    {
      type: "assistant",
      timestamp: "2025-06-15T10:00:05Z",
      sessionId,
      slug,
      message: {
        id: "msg_asst1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5-20250929",
        usage: {
          input_tokens: 5000,
          output_tokens: 2500,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 500,
        },
        content: [
          {
            type: "text",
            text: 'Here is the refactored authentication module using OAuth2. I\'ll update the database schema to add the new columns. Here\'s the code:\n\n```typescript\nconst secretKey = process.env.SECRET_KEY;\nfunction handleLogin(username: string, password: string) {\n  // auth logic\n}\n```\n\nAnd the SQL:\n```sql\nSELECT * FROM users WHERE email = "admin@example.com"\n```',
          },
          {
            type: "tool_use",
            id: "toolu_abc123",
            name: "Bash",
            input: {
              command: "echo secret-password-12345",
              description: "Run a secret command",
            },
          },
          {
            type: "tool_use",
            id: "toolu_def456",
            name: "Read",
            input: {
              file_path: "/home/user/.ssh/id_rsa",
            },
          },
          {
            type: "tool_use",
            id: "toolu_ghi789",
            name: "Write",
            input: {
              file_path: "/tmp/config.ts",
              content:
                "export const DATABASE_URL = 'postgresql://user:pass@host/db'",
            },
          },
          {
            type: "tool_use",
            id: "toolu_jkl012",
            name: "Bash",
            input: {
              command: "rm -rf /important/data",
            },
          },
          {
            type: "tool_use",
            id: "toolu_mno345",
            name: "Agent",
            input: {
              prompt:
                "PRIVATE KEY CONTENT THAT SHOULD NOT LEAK. Also do other things.",
            },
          },
        ],
      },
    },
  ];
}

describe("data boundary — sensitive content never leaks", () => {
  it("no sensitive string appears anywhere in the JSON output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "secret-proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    for (const secret of SENSITIVE_STRINGS) {
      expect(json).not.toContain(secret);
    }
  });

  it("user prompt text is not in any output field", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    expect(json).not.toContain("refactor the authentication");
    expect(json).not.toContain("OAuth2");
    expect(json).not.toContain("sk-ant-api03");
  });

  it("assistant response text is not in any output field", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    expect(json).not.toContain("refactored authentication module");
    expect(json).not.toContain("update the database schema");
    expect(json).not.toContain("handleLogin");
    expect(json).not.toContain("secretKey");
  });

  it("code blocks are not in any output field", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    expect(json).not.toContain("process.env.SECRET_KEY");
    expect(json).not.toContain("SELECT * FROM users");
    expect(json).not.toContain("admin@example.com");
  });

  it("tool arguments (commands, file paths, file contents) are not in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    // Tool input commands
    expect(json).not.toContain("echo secret-password");
    expect(json).not.toContain("rm -rf");
    // Tool input file paths
    expect(json).not.toContain(".ssh/id_rsa");
    expect(json).not.toContain("/tmp/config.ts");
    // Tool input file contents
    expect(json).not.toContain("postgresql://");
    expect(json).not.toContain("PRIVATE KEY CONTENT");
  });

  it("image paste IDs are not in output — only count is tracked", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    // The actual IDs must not appear
    expect(json).not.toContain("img_paste_abc123def456");
    expect(json).not.toContain("img_paste_xyz789uvw012");

    // But the count should be tracked
    expect(data.sessions[0].imagePastes).toBe(2);
    expect(data.meta.imagePastes).toBe(2);
  });

  it("plan content text is not in output — only boolean flag is set", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    expect(json).not.toContain("Detailed refactoring plan");
    expect(json).not.toContain("Extract the auth service");

    // But the flag should be set
    expect(data.sessions[0].planModeUsed).toBe(true);
    expect(data.meta.planModeUses).toBe(1);
  });
});

describe("data boundary — only metadata is extracted", () => {
  it("tool call NAMES appear in output but not tool call ARGUMENTS", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });
    const json = JSON.stringify(data);

    // Tool names SHOULD appear (they're metadata)
    expect(json).toContain("Bash");
    expect(json).toContain("Read");
    expect(json).toContain("Write");
    expect(json).toContain("Agent");

    // Tool arguments SHOULD NOT appear
    expect(json).not.toContain("echo secret");
    expect(json).not.toContain("id_rsa");
  });

  it("model names appear in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.meta.distinctModels).toContain("claude-sonnet-4-5-20250929");
    expect(data.sessions[0].modelsUsed).toContain("claude-sonnet-4-5-20250929");
  });

  it("timestamps appear in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.sessions[0].startTime).toContain("2025-06-15");
    expect(data.daily[0].date).toBe("2025-06-15");
  });

  it("session IDs appear in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.sessions[0].id).toBe("sess-boundary-test");
  });

  it("project slugs appear in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.sessions[0].project).toBe("my-secret-project");
  });

  it("git branch names appear in output", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.sessions[0].gitBranch).toBe("feature/oauth2-migration");
  });

  it("token counts appear in output (but not the actual content that generated them)", () => {
    tempDir = createTempProjectsDir();
    writeJsonlFile(tempDir, "proj", "conv.jsonl", buildSensitiveJsonlLines());

    const data = extract({ claudeDir: tempDir });

    expect(data.totals.inputTokens).toBe(5000);
    expect(data.totals.outputTokens).toBe(2500);
    expect(data.totals.cacheReadTokens).toBe(1000);
    expect(data.totals.cacheCreationTokens).toBe(500);
  });
});
