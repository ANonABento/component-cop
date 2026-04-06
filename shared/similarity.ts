import { STRUCTURE_WEIGHT, STYLE_WEIGHT } from './constants';

/**
 * Compute style similarity by comparing individual category slots.
 * Returns 0-1 where 1 = identical categorical fingerprints.
 */
export function styleSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / Math.max(a.length, b.length);
}

/**
 * Compute structure similarity.
 * 1.0 = exact hash match
 * 0.5 = same component name (partial structural match)
 * 0.0 = different
 */
export function structureSimilarity(
  hashA: string,
  hashB: string,
  nameA?: string,
  nameB?: string,
): number {
  if (hashA === hashB) return 1.0;
  if (nameA && nameB && nameA === nameB && nameA !== 'Anonymous' && nameA !== 'div') {
    return 0.5;
  }
  return 0.0;
}

/**
 * Compute overall similarity score between two components.
 * MVP: 55% style + 45% structure.
 */
export function computeSimilarity(
  styleCategoriesA: string[],
  structureHashA: string,
  styleCategoriesB: string[],
  structureHashB: string,
  nameA?: string,
  nameB?: string,
): { score: number; styleScore: number; structureScore: number } {
  const styleScore = styleSimilarity(styleCategoriesA, styleCategoriesB);
  const structureScore = structureSimilarity(structureHashA, structureHashB, nameA, nameB);
  const score = STYLE_WEIGHT * styleScore + STRUCTURE_WEIGHT * structureScore;
  return { score, styleScore, structureScore };
}
