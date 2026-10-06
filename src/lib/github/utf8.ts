/**
 * Dependency-free UTF-8 and base64 helpers.
 *
 * TextEncoder/TextDecoder are intentionally avoided: the decoder strips a
 * leading BOM (which would change the git blob hash) and the strict mode
 * differs across runtimes. These helpers behave identically everywhere.
 */

export function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes += 1;
    } else if (c < 0x800) {
      bytes += 2;
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        bytes += 3; // lone high surrogate -> U+FFFD
      }
    } else {
      bytes += 3; // BMP char or lone surrogate -> U+FFFD (3 bytes)
    }
  }
  return bytes;
}

export function utf8Encode(str: string): Uint8Array {
  const out = new Uint8Array(utf8ByteLength(str));
  let p = 0;
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      out[p++] = c;
    } else if (c < 0x800) {
      out[p++] = 0xc0 | (c >> 6);
      out[p++] = 0x80 | (c & 0x3f);
    } else {
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          const cp = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
          out[p++] = 0xf0 | (cp >> 18);
          out[p++] = 0x80 | ((cp >> 12) & 0x3f);
          out[p++] = 0x80 | ((cp >> 6) & 0x3f);
          out[p++] = 0x80 | (cp & 0x3f);
          i++;
          continue;
        }
      }
      if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate
      out[p++] = 0xe0 | (c >> 12);
      out[p++] = 0x80 | ((c >> 6) & 0x3f);
      out[p++] = 0x80 | (c & 0x3f);
    }
  }
  return out;
}

/** Strict UTF-8 decode. Returns null when the bytes are not valid UTF-8. */
export function utf8Decode(bytes: Uint8Array): string | null {
  const CHUNK = 8192;
  const parts: string[] = [];
  let units: number[] = [];
  const flush = () => {
    if (units.length) {
      parts.push(String.fromCharCode.apply(null, units));
      units = [];
    }
  };
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 >= n || (bytes[i + 1] & 0xc0) !== 0x80) return null;
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if (b >= 0xe0 && b <= 0xef) {
      if (i + 2 >= n || (bytes[i + 1] & 0xc0) !== 0x80 || (bytes[i + 2] & 0xc0) !== 0x80) return null;
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) return null;
      i += 3;
    } else if (b >= 0xf0 && b <= 0xf4) {
      if (
        i + 3 >= n ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80 ||
        (bytes[i + 3] & 0xc0) !== 0x80
      ) {
        return null;
      }
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      if (cp < 0x10000 || cp > 0x10ffff) return null;
      i += 4;
    } else {
      return null;
    }
    if (cp >= 0x10000) {
      const v = cp - 0x10000;
      units.push(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else {
      units.push(cp);
    }
    if (units.length >= CHUNK) flush();
  }
  flush();
  return parts.join("");
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hasNulByte(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) return true;
  return false;
}
