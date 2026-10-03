/**
 * Catalogue tests for the module that owns every model ID in this repo.
 *
 * These assert on resolved rates, not on the spelling of a constant. A test
 * that only checked `CURRENT_MODELS.default === "claude-sonnet-5"` would pass
 * while the catalogue had no row for it and every Sonnet was priced by guess.
 */

import { describe, it, expect } from "vitest";
import {
  CURRENT_MODELS,
  LEGACY_MODELS,
  MODEL_RATES,
  perTokenRates,
  resolveModelRates,
} from "../src/models";

describe("every named model resolves to a real rate", () => {
  // The bug this catches: a role naming a dated snapshot
  // (claude-haiku-4-5-20251001) while the catalogue is keyed by family prefix
  // (claude-haiku-4-5). A direct lookup returned undefined and the cost came
  // out NaN, silently, for every unknown haiku-tier model.
  const named = { ...CURRENT_MODELS, ...LEGACY_MODELS };

  for (const [role, id] of Object.entries(named)) {
    it(`${role} (${id}) resolves without guessing`, () => {
      const r = resolveModelRates(id);
      expect(r.guessed).toBe(false);
      expect(r.matched).not.toBeNull();
      expect(Number.isFinite(r.rates.inputPerMTok)).toBe(true);
      expect(Number.isFinite(r.rates.outputPerMTok)).toBe(true);
      expect(r.rates.inputPerMTok).toBeGreaterThan(0);
    });
  }
});

describe("current list prices", () => {
  const cases: Array<[string, number, number]> = [
    ["claude-fable-5", 10, 50],
    ["claude-opus-5", 5, 25],
    ["claude-sonnet-5", 2, 10],
    ["claude-haiku-4-5-20251001", 1, 5],
  ];

  for (const [id, input, output] of cases) {
    it(`${id} is $${input}/$${output} per MTok`, () => {
      const { rates } = resolveModelRates(id);
      expect(rates.inputPerMTok).toBe(input);
      expect(rates.outputPerMTok).toBe(output);
    });
  }

  it("Sonnet 5 is cheaper than Sonnet 4.5, which the old table conflated", () => {
    // The whole table priced every Sonnet at the 4.x rate. Sonnet 5 is $2/$10;
    // billing it at $3/$15 overstated a real user's Sonnet line by 50%.
    expect(resolveModelRates("claude-sonnet-5").rates.inputPerMTok).toBe(2);
    expect(resolveModelRates("claude-sonnet-4-5").rates.inputPerMTok).toBe(3);
  });

  it("Fable 5 is not priced as a Sonnet", () => {
    // It contains none of opus/haiku, so the old substring fallback billed it
    // at the Sonnet rate — a fifth of its real price.
    expect(resolveModelRates("claude-fable-5").rates.outputPerMTok).toBe(50);
  });
});

describe("ID shapes that appear in real transcripts", () => {
  it("resolves a dated snapshot through its family prefix", () => {
    expect(resolveModelRates("claude-sonnet-4-5-20250929").matched).toBe(
      "claude-sonnet-4-5",
    );
    expect(resolveModelRates("claude-3-opus-20240229").matched).toBe(
      "claude-3-opus",
    );
  });

  it("prefers the longest matching prefix", () => {
    // claude-opus-4 ($15) is a prefix of claude-opus-4-6 ($5). Matching the
    // shorter key first would price current Opus at three times its rate.
    expect(resolveModelRates("claude-opus-4-6").rates.inputPerMTok).toBe(5);
    expect(resolveModelRates("claude-opus-4-20250514").rates.inputPerMTok).toBe(15);
    expect(resolveModelRates("claude-opus-4-1-20250805").rates.inputPerMTok).toBe(15);
  });

  it("strips the context-window tag", () => {
    expect(resolveModelRates("claude-opus-5[1m]").matched).toBe("claude-opus-5");
    expect(resolveModelRates("claude-opus-5[1m]").guessed).toBe(false);
  });

  it("resolves bare tier aliases to the current model of that tier", () => {
    expect(resolveModelRates("sonnet").matched).toBe("claude-sonnet-5");
    expect(resolveModelRates("opus").matched).toBe("claude-opus-5");
    expect(resolveModelRates("fable").matched).toBe("claude-fable-5");
    expect(resolveModelRates("haiku").matched).toBe("claude-haiku-4-5");
  });

  it("prices Claude Code's synthetic marker at zero, and does not flag it", () => {
    const r = resolveModelRates("<synthetic>");
    expect(r.rates).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
    expect(r.guessed).toBe(false);
  });
});

describe("the guessed flag fires in one direction only", () => {
  // Asserted both ways. A flag that is always true is noise; always false is a
  // warning that never appears — and the CLI's unpriced-model notice depends
  // on it, so a stuck flag would silently disable that notice.
  it("is false for a catalogued model", () => {
    expect(resolveModelRates("claude-opus-5").guessed).toBe(false);
  });

  it("is true for a model the catalogue has never seen", () => {
    expect(resolveModelRates("claude-opus-99-unreleased").guessed).toBe(true);
    expect(resolveModelRates("some-totally-unknown-model").guessed).toBe(true);
  });

  it("still returns a usable rate when it guesses", () => {
    // It must not throw: this runs on end users' machines against transcripts
    // we do not control.
    const r = resolveModelRates("claude-haiku-99-unreleased");
    expect(r.rates.inputPerMTok).toBe(1);
    expect(r.guessed).toBe(true);
  });
});

describe("cache multipliers", () => {
  it("derives read / 5m / 1h from the input rate", () => {
    const p = perTokenRates(MODEL_RATES["claude-opus-5"]);
    expect(p.input).toBeCloseTo(5e-6, 12);
    expect(p.output).toBeCloseTo(25e-6, 12);
    expect(p.cacheRead).toBeCloseTo(0.5e-6, 12);
    expect(p.cacheCreate5m).toBeCloseTo(6.25e-6, 12);
    expect(p.cacheCreate1h).toBeCloseTo(10e-6, 12);
  });
});
