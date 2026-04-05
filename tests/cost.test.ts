/**
 * Cost estimation tests.
 *
 * Tests the estimateCost() function for each known model,
 * cache multipliers, unknown model fallback, and edge cases.
 *
 * Since estimateCost() is not directly exported, we test it
 * indirectly through extract() by providing known usage data
 * and verifying the resulting cost.
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
 * Helper: extract cost for a single assistant message with given model and usage.
 */
function getCostForMessage(
  model: string,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
  }
): number {
  tempDir = createTempProjectsDir();
  writeJsonlFile(tempDir, "proj", "c.jsonl", [
    userLine({ sessionId: "s1", timestamp: "2025-06-01T10:00:00Z", slug: "proj" }),
    assistantLine({
      sessionId: "s1",
      timestamp: "2025-06-01T10:00:01Z",
      slug: "proj",
      model,
      usage,
    }),
  ]);
  const data = extract({ claudeDir: tempDir });
  return data.totals.totalCost;
}

describe("cost estimation — known models", () => {
  // Opus 4.6: $5/$25 per 1M tokens
  it("claude-opus-4-6: input=$5/1M, output=$25/1M", () => {
    const cost = getCostForMessage("claude-opus-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(5.0, 2);

    cleanupDir(tempDir);
    const cost2 = getCostForMessage("claude-opus-4-6", {
      input_tokens: 0,
      output_tokens: 1_000_000,
    });
    expect(cost2).toBeCloseTo(25.0, 2);
  });

  // Sonnet 4.5: $3/$15 per 1M tokens
  it("claude-sonnet-4-5-20250929: input=$3/1M, output=$15/1M", () => {
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(3.0, 2);

    cleanupDir(tempDir);
    const cost2 = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 1_000_000,
    });
    expect(cost2).toBeCloseTo(15.0, 2);
  });

  // Sonnet 4.6: $3/$15 per 1M tokens
  it("claude-sonnet-4-6: input=$3/1M, output=$15/1M", () => {
    const cost = getCostForMessage("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(3.0, 2);
  });

  // Haiku 4.5: $1/$5 per 1M tokens
  it("claude-haiku-4-5-20251001: input=$1/1M, output=$5/1M", () => {
    const cost = getCostForMessage("claude-haiku-4-5-20251001", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(1.0, 2);

    cleanupDir(tempDir);
    const cost2 = getCostForMessage("claude-haiku-4-5-20251001", {
      input_tokens: 0,
      output_tokens: 1_000_000,
    });
    expect(cost2).toBeCloseTo(5.0, 2);
  });

  // Opus 4.1: $15/$75 per 1M tokens
  it("claude-opus-4-1-20250414: input=$15/1M, output=$75/1M", () => {
    const cost = getCostForMessage("claude-opus-4-1-20250414", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(15.0, 2);
  });
});

describe("cost estimation — cache multipliers", () => {
  // Cache read = 0.1x input price
  it("cache read tokens are priced at 0.1x input rate", () => {
    // Sonnet: input = $3/1M, cache read = $0.30/1M
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.3, 2);
  });

  // Cache creation (1h, fallback) = 2x input price
  it("cache creation tokens (1h fallback) are priced at 2x input rate", () => {
    // Sonnet: input = $3/1M, 1h cache = $6/1M
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6.0, 2);
  });

  // Granular: 5min cache = 1.25x input
  it("ephemeral 5min cache creation tokens are priced at 1.25x input rate", () => {
    // Sonnet: input = $3/1M, 5min cache = $3.75/1M
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation: {
        ephemeral_5m_input_tokens: 1_000_000,
        ephemeral_1h_input_tokens: 0,
      },
    });
    expect(cost).toBeCloseTo(3.75, 2);
  });

  // Granular: 1h cache = 2x input
  it("ephemeral 1h cache creation tokens are priced at 2x input rate", () => {
    // Sonnet: input = $3/1M, 1h cache = $6/1M
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation: {
        ephemeral_5m_input_tokens: 0,
        ephemeral_1h_input_tokens: 1_000_000,
      },
    });
    expect(cost).toBeCloseTo(6.0, 2);
  });

  // Granular cache takes priority when present
  it("granular cache breakdown takes priority over flat cache_creation_input_tokens", () => {
    // When both are present, granular should be used
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000, // would be $6 at 1h rate
      cache_creation: {
        ephemeral_5m_input_tokens: 1_000_000, // $3.75 at 5m rate
        ephemeral_1h_input_tokens: 0,
      },
    });
    // Should use granular ($3.75), not flat ($6)
    expect(cost).toBeCloseTo(3.75, 2);
  });

  it("combined cost with all token types is correct", () => {
    // Sonnet: 1K input ($0.003) + 500 output ($0.0075) + 200 cache read ($0.00006) + 100 cache create 1h ($0.0006)
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 100,
    });
    const expected = 1000 * 3e-6 + 500 * 15e-6 + 200 * 0.3e-6 + 100 * 6e-6;
    expect(cost).toBeCloseTo(expected, 6);
  });
});

describe("cost estimation — unknown model fallback", () => {
  it("unknown model with 'opus' in name uses opus pricing", () => {
    const cost = getCostForMessage("claude-opus-99-future-model", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    // Falls back to opus-4-6 pricing: $5/1M
    expect(cost).toBeCloseTo(5.0, 2);
  });

  it("unknown model with 'haiku' in name uses haiku pricing", () => {
    const cost = getCostForMessage("claude-haiku-99-future-model", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    // Falls back to haiku pricing: $1/1M
    expect(cost).toBeCloseTo(1.0, 2);
  });

  it("unknown model with 'sonnet' in name uses sonnet pricing", () => {
    const cost = getCostForMessage("claude-sonnet-99-future-model", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    // Falls back to sonnet pricing: $3/1M
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it("completely unknown model falls back to sonnet pricing", () => {
    const cost = getCostForMessage("some-totally-unknown-model", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    });
    // Default fallback is sonnet: $3/1M
    expect(cost).toBeCloseTo(3.0, 2);
  });
});

describe("cost estimation — edge cases", () => {
  it("zero tokens produces zero cost", () => {
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
    expect(cost).toBe(0);
  });

  it("missing usage fields default to zero", () => {
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {});
    expect(cost).toBe(0);
  });

  it("undefined values in usage are treated as zero", () => {
    const cost = getCostForMessage("claude-sonnet-4-5-20250929", {
      input_tokens: undefined,
      output_tokens: undefined,
      cache_read_input_tokens: undefined,
      cache_creation_input_tokens: undefined,
    });
    expect(cost).toBe(0);
  });

  it("very large token counts produce correct cost", () => {
    // 100M input tokens on Opus 4.6 = $500
    const cost = getCostForMessage("claude-opus-4-6", {
      input_tokens: 100_000_000,
      output_tokens: 0,
    });
    expect(cost).toBeCloseTo(500.0, 0);
  });
});
