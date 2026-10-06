/**
 * Small fuzzy matcher for the command palette. Pure functions, no DOM.
 *
 * A query matches a text when its characters appear in order (case-insensitive). The score rewards
 * matches at the start, at word starts and runs of consecutive characters, and penalises gaps and
 * long texts, so "run" ranks "Run" above "Save before running" and "nf" finds "New file".
 */

export interface FuzzyMatch {
  score: number;
  /** Indices in the text of the matched characters, ascending. */
  indices: number[];
}

const SEPARATORS = new Set([" ", "-", "_", "/", ".", "\\", ":", "(", ")"]);

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (SEPARATORS.has(prev)) return true;
  // camelCase boundary: "fileName" -> N
  const ch = text[i];
  return prev === prev.toLowerCase() && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

/**
 * Score `text` against `query`. Returns null when the query does not match.
 * Whitespace in the query is ignored, so "new f" matches like "newf".
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.replace(/\s+/g, "").toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const t = text.toLowerCase();
  if (q.length > t.length) return null;

  // Best of two strategies: a contiguous substring hit (strong), or a greedy word-start-aware subsequence.
  const best = [substringMatch(q, t, text), subsequenceMatch(q, t, text)].filter((m): m is FuzzyMatch => !!m);
  if (best.length === 0) return null;
  return best.reduce((a, b) => (b.score > a.score ? b : a));
}

function substringMatch(q: string, t: string, original: string): FuzzyMatch | null {
  let from = 0;
  let best: FuzzyMatch | null = null;
  while (from <= t.length - q.length) {
    const at = t.indexOf(q, from);
    if (at < 0) break;
    let score = 100 + q.length * 12;
    if (at === 0) score += 60;
    else if (isWordStart(original, at)) score += 35;
    else score -= Math.min(at, 20);
    if (at + q.length === t.length) score += 10;
    score -= Math.max(0, t.length - q.length) * 0.5;
    const indices = Array.from({ length: q.length }, (_, k) => at + k);
    if (!best || score > best.score) best = { score, indices };
    from = at + 1;
  }
  return best;
}

function subsequenceMatch(q: string, t: string, original: string): FuzzyMatch | null {
  const indices: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    // Prefer the next word start that has this character, if one exists before the plain next hit
    // would leave too little text for the rest of the query.
    let plain = -1;
    let wordStart = -1;
    for (let k = ti; k < t.length; k++) {
      if (t[k] !== ch) continue;
      if (plain < 0) plain = k;
      if (isWordStart(original, k)) {
        wordStart = k;
        break;
      }
    }
    if (plain < 0) return null;
    const prevIndex = indices[indices.length - 1];
    // Keep a consecutive run going rather than jumping to a later word start.
    const jump = wordStart >= 0 && plain !== prevIndex + 1 && canFinish(q, qi + 1, t, wordStart + 1);
    const pick = jump ? wordStart : plain;
    indices.push(pick);
    ti = pick + 1;
  }
  let score = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    score += 10;
    if (idx === 0) score += 25;
    else if (isWordStart(original, idx)) score += 18;
    if (i > 0) {
      const gap = idx - indices[i - 1] - 1;
      if (gap === 0) score += 12;
      else score -= Math.min(gap, 10) * 1.5;
    }
  }
  score -= Math.max(0, t.length - q.length) * 0.5;
  return { score, indices };
}

/** True when q[qi..] is still a subsequence of t[from..]. */
function canFinish(q: string, qi: number, t: string, from: number): boolean {
  let k = from;
  for (let i = qi; i < q.length; i++) {
    k = t.indexOf(q[i], k);
    if (k < 0) return false;
    k++;
  }
  return true;
}

export interface Rankable {
  /** Primary text: shown, highlighted and weighted highest. */
  label: string;
  /** Other words that should find this item (synonyms, the file's folder). */
  keywords?: readonly string[];
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** Matched indices in `item.label` (empty when the match came from a keyword). */
  indices: number[];
}

/**
 * Filter and sort items by how well they match `query`. With an empty query the original order is
 * kept. Ties keep the original order too, so callers control the default ranking.
 */
export function rankItems<T extends Rankable>(query: string, items: readonly T[], limit = Infinity): Ranked<T>[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit).map((item) => ({ item, score: 0, indices: [] }));

  const ranked: (Ranked<T> & { order: number })[] = [];
  items.forEach((item, order) => {
    const onLabel = fuzzyMatch(q, item.label);
    let best: Ranked<T> | null = onLabel ? { item, score: onLabel.score, indices: onLabel.indices } : null;
    for (const kw of item.keywords ?? []) {
      const m = fuzzyMatch(q, kw);
      // Keyword hits count a little less than label hits.
      if (m && (!best || m.score * 0.8 > best.score)) best = { item, score: m.score * 0.8, indices: [] };
    }
    if (best) ranked.push({ ...best, order });
  });
  ranked.sort((a, b) => b.score - a.score || a.order - b.order);
  return ranked.slice(0, limit).map(({ item, score, indices }) => ({ item, score, indices }));
}

/** Split `text` into runs of matched / unmatched characters for highlighting. */
export function highlightSegments(text: string, indices: readonly number[]): { text: string; match: boolean }[] {
  if (indices.length === 0) return [{ text, match: false }];
  const set = new Set(indices);
  const out: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = set.has(i);
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += text[i];
    else out.push({ text: text[i], match });
  }
  return out;
}
