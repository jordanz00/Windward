/**
 * Showcase page size ceilings (KiB = 1024 bytes).
 *
 * Policy owner: AEI Continuous — agents must not raise these numbers.
 * Founder approval required to change ceilings. Active caps may only stay
 * equal to or lower than CEILINGS.
 *
 * Dual lock: CEILINGS and LOCKED_LITERALS must match. Editing one without the
 * other fails budget-gate (agents cannot silently raise caps).
 */

export const KiB = 1024;

/** Founder-locked ceilings (KiB). Do not raise. */
export const CEILINGS_KIB = Object.freeze({
  pageGzip: 400,
  pageBrotli: 350,
  criticalGzip: 200,
});

/**
 * Byte ceilings derived from CEILINGS_KIB.
 * Active enforcement uses these; keep in sync with LOCKED_LITERALS in budget-gate.
 */
export const CEILINGS = Object.freeze({
  pageGzip: CEILINGS_KIB.pageGzip * KiB,
  pageBrotli: CEILINGS_KIB.pageBrotli * KiB,
  criticalGzip: CEILINGS_KIB.criticalGzip * KiB,
});

/** Optional tighter active caps (must be ≤ CEILINGS). Same as ceilings for v1. */
export const ACTIVE = Object.freeze({
  pageGzip: CEILINGS.pageGzip,
  pageBrotli: CEILINGS.pageBrotli,
  criticalGzip: CEILINGS.criticalGzip,
});
