import { parseLabelTokens } from './labelTokenUtils';

/** e.g. `["Z0"]` → "Z0"; `["A","B"]` → "A, B" */
export function formatLabelForDisplay(raw: string): string {
  return parseLabelTokens(raw).join(', ');
}
