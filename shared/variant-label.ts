/** Generate variant label: A-Z, then AA, AB, ... AZ, BA, BB, ... */
export function variantLabel(idx: number): string {
  if (idx < 26) return String.fromCharCode(65 + idx);
  const adjusted = idx - 26;
  return String.fromCharCode(65 + Math.floor(adjusted / 26)) + String.fromCharCode(65 + (adjusted % 26));
}
