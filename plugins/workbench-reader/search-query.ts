export const normalizeTitle = (text: string) =>
  (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
export const queryWords = (text: string) => normalizeTitle(text).split(" ").filter(Boolean).slice(0, 16);

// User punctuation/operators never reach FTS syntax; only quoted literal tokens do.
export function ftsQuery(query: string): string {
  return (query.match(/"[^"]+"|[^\s"]+/g) ?? []).slice(0, 16).flatMap(part => {
    const words = queryWords(part).map(word => word.slice(0, 64));
    if (!words.length) return [];
    return part.startsWith('"') ? [`"${words.join(" ")}"`] : words.map(word => `"${word}"*`);
  }).join(" AND ");
}

export function oneTypo(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  if (a.length === b.length) {
    const diffs = [...a].flatMap((c, i) => c === b[i] ? [] : [i]);
    return diffs.length === 1 || (diffs.length === 2 && diffs[1] === diffs[0]! + 1 &&
      a[diffs[0]!] === b[diffs[1]!] && a[diffs[1]!] === b[diffs[0]!]);
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0; while (short[i] === long[i] && i < short.length) i++;
  return short.slice(i) === long.slice(i + 1);
}
