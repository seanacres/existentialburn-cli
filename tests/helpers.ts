/**
 * Shared test helpers for creating mock JSONL data
 * that mirrors real Claude Code conversation format.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Create a temp directory that mimics ~/.claude/projects/ structure.
 * Returns the base dir path (the "projects" directory).
 */
export function createTempProjectsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eb-test-"));
}

/**
 * Clean up a temp directory recursively.
 */
export function cleanupDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Write a JSONL file under baseDir/projectSlug/filename.
 * Creates intermediate directories as needed.
 */
export function writeJsonlFile(
  baseDir: string,
  projectSlug: string,
  filename: string,
  lines: object[]
): string {
  const dir = path.join(baseDir, projectSlug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  const content = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// --- JSONL line builders ---

interface AssistantLineOptions {
  sessionId: string;
  timestamp: string;
  model?: string;
  slug?: string;
  gitBranch?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
  };
  toolCalls?: string[];
  /** Raw text content for the assistant message (to test data boundary) */
  textContent?: string;
}

/**
 * Build a realistic assistant JSONL line with token usage and optional tool calls.
 */
export function assistantLine(opts: AssistantLineOptions): object {
  const content: object[] = [];

  if (opts.textContent) {
    content.push({ type: "text", text: opts.textContent });
  }

  if (opts.toolCalls) {
    for (const name of opts.toolCalls) {
      content.push({
        type: "tool_use",
        id: `toolu_${Math.random().toString(36).slice(2, 10)}`,
        name,
        input: {
          command: "echo secret-password-12345",
          file_path: "/home/user/.ssh/id_rsa",
          content: "PRIVATE KEY CONTENT THAT SHOULD NOT LEAK",
        },
      });
    }
  }

  return {
    type: "assistant",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    slug: opts.slug,
    gitBranch: opts.gitBranch,
    message: {
      id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      type: "message",
      role: "assistant",
      model: opts.model ?? "claude-sonnet-4-5-20250929",
      usage: opts.usage ?? {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 100,
      },
      content,
    },
  };
}

interface UserLineOptions {
  sessionId: string;
  timestamp: string;
  slug?: string;
  gitBranch?: string;
  /** Prompt text the user typed (should never appear in output) */
  promptText?: string;
  imagePasteIds?: string[];
  planContent?: string;
}

/**
 * Build a realistic user JSONL line.
 */
export function userLine(opts: UserLineOptions): object {
  return {
    type: "user",
    timestamp: opts.timestamp,
    sessionId: opts.sessionId,
    slug: opts.slug,
    gitBranch: opts.gitBranch,
    message: {
      id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      type: "message",
      role: "user",
      content: [
        {
          type: "text",
          text: opts.promptText ?? "Hello, please help me with my code.",
        },
      ],
    },
    ...(opts.imagePasteIds ? { imagePasteIds: opts.imagePasteIds } : {}),
    ...(opts.planContent ? { planContent: opts.planContent } : {}),
  };
}
