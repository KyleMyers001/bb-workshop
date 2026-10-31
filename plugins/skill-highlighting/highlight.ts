/** Paint syntax only; a match does not imply that a skill is installed. */
export function findSkillTokens(text: string): { from: number; to: number }[] {
  // Require token boundaries, rejecting URL segments, paths, and extensions.
  // A trailing period is punctuation only at the end of a word/sentence.
  const pattern = /(^|[\s([{])\/(?:skill:)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?=$|[\s,!?;)\]}>]|\.(?=$|[\s)\]}]))/g;
  return Array.from(text.matchAll(pattern), (match) => ({
    from: match.index + match[1].length,
    to: match.index + match[0].length,
  }));
}
