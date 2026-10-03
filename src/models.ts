/**
 * The single source of Anthropic model IDs and rates for this repository.
 *
 * Nothing else in this repo may hardcode a model ID. `tests/unit/model-ids-owned.test.ts`
 * fails when one appears outside this file, because a deprecated model answers
 * normally until its retirement date — no test fails and nothing errors, so a
 * hardcoded ID elsewhere is invisible until an email arrives.
 *
 * `src/lib/models.ts` is a copy of this file, kept honest by
 * `tests/unit/model-catalogue-parity.test.ts`. The web app cannot import this
 * one: this package is CommonJS and Turbopack refuses to bundle its ESM source.
 *
 * ## What this table is, and what it is not
 *
 * This is NOT a rate card for models this project calls — the extractor calls
 * nothing. It reads the *user's* `~/.claude/projects` transcripts and prices
 * whatever model names Claude Code wrote there, going back as far as the user's
 * history goes. The reachable set is therefore "every model Claude Code has ever
 * named in a transcript", which includes retired ones. Dropping a retired row
 * does not make pricing refuse; it makes `familyFallback` guess, silently and
 * wrongly. So retired models keep their rows here, which is the opposite of what
 * a rate card for outbound calls would do.
 *
 * Rates are Anthropic first-party API list prices, USD per million tokens.
 * Cache multipliers are uniform across models: read = 0.1x input,
 * 5-minute write = 1.25x input, 1-hour write = 2x input.
 */

/** Roles, so callers name intent rather than a version that will age. */
export const CURRENT_MODELS = {
  /** Deepest reasoning. */
  deepest: "claude-opus-5",
  /** Default working model. */
  default: "claude-sonnet-5",
  /** Most capable; lead / simultaneous-DA work. */
  lead: "claude-fable-5",
  /** Fast and cheap. */
  fast: "claude-haiku-4-5-20251001",
} as const;

/**
 * Retired models, named so seed and demo data can reference them without
 * hardcoding an ID elsewhere. They exist to exercise the historical pricing
 * path — a user's transcripts go back as far as their Claude Code install does.
 */
export const LEGACY_MODELS = {
  opus3: "claude-3-opus",
  sonnet35: "claude-3-5-sonnet",
  haiku3: "claude-3-haiku",
} as const;

export interface ModelRates {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
}

/**
 * Every model ID prefix this project can encounter, with its list price.
 *
 * Keys are ID *prefixes*, matched longest-first, so a dated snapshot
 * (`claude-sonnet-4-5-20250929`) resolves through its family key
 * (`claude-sonnet-4-5`) without needing a row per snapshot date.
 *
 * Retired and deprecated models are kept deliberately — see the file header.
 */
export const MODEL_RATES: Readonly<Record<string, ModelRates>> = {
  // --- Current ---
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-mythos-5": { inputPerMTok: 10, outputPerMTok: 50 },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 2, outputPerMTok: 10 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },

  // --- Prior generations, still appearing in transcripts ---
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-1": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-sonnet-4-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-sonnet-4": { inputPerMTok: 3, outputPerMTok: 15 },

  // --- Claude 3 family (retired, but present in older transcripts) ---
  "claude-3-opus": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-3-7-sonnet": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-3-5-sonnet": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-3-sonnet": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-3-5-haiku": { inputPerMTok: 0.8, outputPerMTok: 4 },
  "claude-3-haiku": { inputPerMTok: 0.25, outputPerMTok: 1.25 },
};

/**
 * Bare tier names Claude Code writes into transcripts as shorthand.
 *
 * These mean "whatever was current when the line was written", which is not
 * recoverable from the transcript, so they are priced as the current model of
 * that tier. That is an assumption, and it is the only one available; it is
 * wrong for an old transcript that used a bare alias. Flagging them all as
 * unpriced instead would bury the genuinely-unknown models in noise.
 */
const TIER_ALIASES: Readonly<Record<string, string>> = {
  opus: CURRENT_MODELS.deepest,
  sonnet: CURRENT_MODELS.default,
  haiku: CURRENT_MODELS.fast,
  fable: CURRENT_MODELS.lead,
  mythos: "claude-mythos-5",
};

/**
 * Claude Code's marker for messages it synthesises locally. Always carries
 * all-zero usage, so the rate is immaterial, but naming it keeps it out of the
 * unpriced-model report.
 */
const SYNTHETIC = "<synthetic>";

const FREE: ModelRates = { inputPerMTok: 0, outputPerMTok: 0 };

// Longest prefix first, so `claude-opus-4-6` wins over `claude-opus-4`.
const RATE_KEYS_BY_SPECIFICITY = Object.keys(MODEL_RATES).sort(
  (a, b) => b.length - a.length,
);

export interface ResolvedRates {
  rates: ModelRates;
  /** The catalogue key that matched, or `null` when the rate was guessed. */
  matched: string | null;
  /**
   * True when no catalogue entry matched and the rate came from the tier
   * fallback. Callers should surface these — a new model tier priced by
   * family guess is exactly how Fable 5 came to be billed at Sonnet rates.
   */
  guessed: boolean;
}

/** Strip the context-window tag Claude Code appends, e.g. `claude-opus-5[1m]`. */
function normalize(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/\[[^\]]*\]$/, "");
}

/**
 * Longest-prefix lookup, so `claude-sonnet-4-5-20250929` resolves through the
 * `claude-sonnet-4-5` key without needing a row per snapshot date, and
 * `claude-opus-4-6` beats the shorter `claude-opus-4`.
 */
function lookupByPrefix(id: string): { key: string; rates: ModelRates } | null {
  for (const key of RATE_KEYS_BY_SPECIFICITY) {
    if (id === key || id.startsWith(`${key}-`)) {
      return { key, rates: MODEL_RATES[key] };
    }
  }
  return null;
}

/**
 * Last resort for a model ID this catalogue has never seen: price it as the
 * current model of whichever tier the name mentions.
 *
 * This guesses, and the guess is reported rather than swallowed. It does not
 * throw: the CLI runs on end users' machines against transcripts we do not
 * control, and a crash the day Anthropic ships a new model is a worse failure
 * than a flagged estimate. `cost.test.ts` pins this behaviour deliberately.
 *
 * Resolves the tier's current ID through `lookupByPrefix` rather than indexing
 * MODEL_RATES directly, because a role may name a dated snapshot
 * (`claude-haiku-4-5-20251001`) while the catalogue is keyed by family prefix.
 */
function familyFallback(normalized: string): ModelRates {
  for (const [alias, target] of Object.entries(TIER_ALIASES)) {
    if (normalized.includes(alias)) {
      const hit = lookupByPrefix(target);
      if (hit) return hit.rates;
    }
  }
  return lookupByPrefix(CURRENT_MODELS.default)!.rates;
}

/** Resolve a model ID from a transcript to its list price. */
export function resolveModelRates(modelId: string): ResolvedRates {
  const normalized = normalize(modelId);

  if (normalized === SYNTHETIC) {
    return { rates: FREE, matched: SYNTHETIC, guessed: false };
  }

  const hit = lookupByPrefix(TIER_ALIASES[normalized] ?? normalized);
  if (hit) return { rates: hit.rates, matched: hit.key, guessed: false };

  return { rates: familyFallback(normalized), matched: null, guessed: true };
}

export interface PerTokenRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}

/** Expand a list price into the per-token rates, applying cache multipliers. */
export function perTokenRates(rates: ModelRates): PerTokenRates {
  const input = rates.inputPerMTok / 1_000_000;
  return {
    input,
    output: rates.outputPerMTok / 1_000_000,
    cacheRead: input * 0.1,
    cacheCreate5m: input * 1.25,
    cacheCreate1h: input * 2,
  };
}
