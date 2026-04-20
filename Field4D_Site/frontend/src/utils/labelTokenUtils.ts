/**
 * BigQuery `Label` is often a string that looks like a JSON array.
 * Token overlap expansion: include every composite in `allOptions` that shares
 * at least one atomic token with any user-selected composite.
 */

export function parseLabelTokens(s: string): string[] {
  const t = String(s).trim();
  if (!t) return [];
  try {
    const p = JSON.parse(t);
    if (Array.isArray(p)) return p.map((x) => String(x));
  } catch {
    // opaque label string
  }
  return [t];
}

export function tokenSetsIntersect(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  for (const x of b) {
    if (setA.has(x)) return true;
  }
  return false;
}

/**
 * Union of tokens from all `selected`, then every L in `allOptions` with tokens(L) ∩ union ≠ ∅.
 */
export function expandCompositesByTokenOverlap(
  selected: string[],
  allOptions: string[]
): string[] {
  if (!selected.length || !allOptions.length) return [];
  const union = new Set<string>();
  for (const s of selected) {
    for (const tok of parseLabelTokens(s)) union.add(tok);
  }
  if (union.size === 0) return [];
  const out: string[] = [];
  for (const L of allOptions) {
    const parts = parseLabelTokens(L);
    if (parts.some((p) => union.has(p))) out.push(L);
  }
  return out;
}
