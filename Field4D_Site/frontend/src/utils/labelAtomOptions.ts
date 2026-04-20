import {
  parseLabelTokens,
  tokenSetsIntersect,
} from './labelTokenUtils';

/** Sorted unique atomic tokens from all composite label strings in experiment `labelOptions`. */
export function collectAtomicLabelsFromComposites(labelOptions: string[]): string[] {
  const set = new Set<string>();
  for (const L of labelOptions) {
    for (const t of parseLabelTokens(L)) {
      if (t.trim() !== '') set.add(t);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Per-atom sensor counts: a sensor is counted for atom A if any of its composite labels
 * shares token overlap with A (same rule as include matching).
 */
export function atomCountsFromSensorMap(
  sensorLabelMap: Record<string, string[]>,
  labelOptions: string[]
): Record<string, number> {
  const atoms = collectAtomicLabelsFromComposites(labelOptions);
  const counts: Record<string, number> = {};
  for (const atom of atoms) {
    let n = 0;
    const atomToks = parseLabelTokens(atom);
    for (const labels of Object.values(sensorLabelMap)) {
      if (
        labels.some((sl) => tokenSetsIntersect(parseLabelTokens(sl), atomToks))
      ) {
        n += 1;
      }
    }
    counts[atom] = n;
  }
  return counts;
}
