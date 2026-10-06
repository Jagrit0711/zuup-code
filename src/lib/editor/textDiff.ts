export interface MinimalEdit {
  /** Offset in the old text where the replacement starts. */
  start: number;
  /** Offset in the old text where the replacement ends (exclusive). */
  end: number;
  /** Replacement text. */
  text: string;
}

/**
 * Smallest single replacement that turns `oldText` into `newText`, found from
 * the common prefix and suffix. Applying only this edit keeps the cursor and
 * scroll position stable when an external change touches a small region.
 * Returns null when the texts are equal.
 */
export function computeMinimalEdit(oldText: string, newText: string): MinimalEdit | null {
  if (oldText === newText) return null;
  const max = Math.min(oldText.length, newText.length);

  let prefix = 0;
  while (prefix < max && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;

  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix++;
  }

  return {
    start: prefix,
    end: oldText.length - suffix,
    text: newText.slice(prefix, newText.length - suffix),
  };
}
