export interface FuzzyOption {
  value: string;
  text: string;
}

export interface FuzzyMatch<T extends FuzzyOption> {
  option: T;
  score: number;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost
      );
    }
    for (let j = 0; j < previous.length; j += 1) previous[j] = current[j]!;
  }

  return previous[b.length]!;
}

export function tokenOverlap(a: string, b: string): number {
  const left = new Set(normalizeText(a).split(" ").filter(Boolean));
  const right = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let hits = 0;
  left.forEach((token) => {
    if (right.has(token)) hits += 1;
  });
  return hits / Math.max(left.size, right.size);
}

export function fuzzyScore(needle: string, haystack: string): number {
  const a = normalizeText(needle);
  const b = normalizeText(haystack);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;

  const distance = levenshtein(a, b);
  const editScore = 1 - distance / Math.max(a.length, b.length);
  const overlap = tokenOverlap(a, b);
  return Math.max(0, editScore * 0.7 + overlap * 0.3);
}

export function bestFuzzyOption<T extends FuzzyOption>(
  target: string,
  options: T[],
  threshold = 0.75
): FuzzyMatch<T> | null {
  let best: FuzzyMatch<T> | null = null;

  for (const option of options) {
    const score = Math.max(
      fuzzyScore(target, option.text),
      fuzzyScore(target, option.value)
    );
    if (!best || score > best.score) best = { option, score };
  }

  return best && best.score >= threshold ? best : null;
}
