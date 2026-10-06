import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gitBlobSha, sha1Hex } from "@/lib/github/sha";
import { base64ToBytes, utf8ByteLength, utf8Decode, utf8Encode } from "@/lib/github/utf8";
import {
  MAX_FILE_BYTES,
  ignoreReasonForPath,
  joinRemotePath,
  normalizePath,
  normalizeSubdir,
  prepareLocalFiles,
  toLocalPath,
} from "@/lib/github/paths";

const nodeBlobSha = (text: string) => {
  const body = Buffer.from(text, "utf8");
  return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
};

describe("git blob sha", () => {
  it("matches known git vectors", () => {
    expect(gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(gitBlobSha("hello world\n")).toBe("3b18e512dba79e4c8300dd08aeb37f8e728b8dad");
  });

  it("matches node's sha1 for assorted inputs, including multi-byte text and block boundaries", () => {
    const samples = [
      "a",
      "x".repeat(55),
      "x".repeat(56),
      "x".repeat(63),
      "x".repeat(64),
      "x".repeat(65),
      "line1\r\nline2\r\n",
      "héllo wörld — 日本語 🚀\n",
      "﻿with BOM",
      "z".repeat(100_000),
    ];
    for (const s of samples) expect(gitBlobSha(s)).toBe(nodeBlobSha(s));
  });

  it("sha1Hex matches the FIPS test vector", () => {
    expect(sha1Hex(utf8Encode("abc"))).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});

describe("utf8 helpers", () => {
  it("round-trips unicode and counts bytes like Buffer", () => {
    const s = "a é 日 🚀 ﻿";
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(utf8ByteLength(s)).toBe(Buffer.byteLength(s, "utf8"));
    expect(Array.from(utf8Encode(s))).toEqual(Array.from(Buffer.from(s, "utf8")));
  });

  it("keeps a BOM when decoding", () => {
    expect(utf8Decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("﻿A");
  });

  it("rejects invalid UTF-8", () => {
    expect(utf8Decode(new Uint8Array([0xff, 0xfe]))).toBeNull();
    expect(utf8Decode(new Uint8Array([0xc0, 0x80]))).toBeNull(); // overlong
    expect(utf8Decode(new Uint8Array([0xed, 0xa0, 0x80]))).toBeNull(); // surrogate
    expect(utf8Decode(new Uint8Array([0xe2, 0x82]))).toBeNull(); // truncated
  });

  it("encodes lone surrogates as U+FFFD like TextEncoder", () => {
    expect(Array.from(utf8Encode("\ud800"))).toEqual([0xef, 0xbf, 0xbd]);
  });

  it("decodes base64 with line breaks", () => {
    expect(Array.from(base64ToBytes("aGVs\nbG8K"))).toEqual(Array.from(Buffer.from("hello\n")));
  });
});

describe("path normalisation", () => {
  it("normalises separators and rejects traversal", () => {
    expect(normalizePath("a\\b//c.py")).toBe("a/b/c.py");
    expect(normalizePath("./src/main.py")).toBe("src/main.py");
    expect(normalizePath("/abs/file.js")).toBe("abs/file.js");
    expect(normalizePath("../etc/passwd")).toBeNull();
    expect(normalizePath("a/../b")).toBeNull();
    expect(normalizePath("")).toBeNull();
    expect(normalizePath("bad\nname")).toBeNull();
    expect(normalizePath("x".repeat(500))).toBeNull();
  });

  it("maps sub-folders both ways", () => {
    expect(normalizeSubdir("")).toBe("");
    expect(normalizeSubdir("/")).toBe("");
    expect(normalizeSubdir("./")).toBe("");
    expect(normalizeSubdir(" /code/ ")).toBe("code");
    expect(normalizeSubdir("projects/demo/")).toBe("projects/demo");
    expect(normalizeSubdir("../up")).toBeNull();
    expect(joinRemotePath("projects/demo", "a/b.py")).toBe("projects/demo/a/b.py");
    expect(joinRemotePath("", "a.py")).toBe("a.py");
    expect(toLocalPath("projects/demo", "projects/demo/a/b.py")).toBe("a/b.py");
    expect(toLocalPath("projects/demo", "projects/other/a.py")).toBeNull();
    expect(toLocalPath("projects/demo", "projects/demo")).toBeNull();
    expect(toLocalPath("projects/demo", "projects/demonstration/a.py")).toBeNull();
    expect(toLocalPath("", "a.py")).toBe("a.py");
  });
});

describe("ignore rules", () => {
  it("ignores VCS, dependency and binary paths", () => {
    expect(ignoreReasonForPath(".git/config")).toBe("ignored-directory");
    expect(ignoreReasonForPath("pkg/node_modules/x/index.js")).toBe("ignored-directory");
    expect(ignoreReasonForPath("src/__pycache__/m.cpython-311.pyc")).toBe("ignored-directory");
    expect(ignoreReasonForPath("assets/logo.PNG")).toBe("binary-extension");
    expect(ignoreReasonForPath("lib/native.so")).toBe("binary-extension");
    expect(ignoreReasonForPath(".DS_Store")).toBe("ignored-file");
    expect(ignoreReasonForPath("src/main.py")).toBeNull();
    expect(ignoreReasonForPath(".gitignore")).toBeNull();
    expect(ignoreReasonForPath("png")).toBeNull();
  });
});

describe("prepareLocalFiles", () => {
  it("filters, sorts and reports skipped files", () => {
    const big = "a".repeat(MAX_FILE_BYTES + 1);
    const { files, skipped } = prepareLocalFiles([
      { path: "b.py", content: "b" },
      { path: "a.py", content: "a" },
      { path: "img.png", content: "binary-ish" },
      { path: "node_modules/x.js", content: "x" },
      { path: "data.bin2", content: "ok" },
      { path: "huge.txt", content: big },
      { path: "nul.txt", content: "a\0b" },
      { path: "../escape.txt", content: "no" },
      { path: "a.py", content: "dup" },
    ]);
    expect(files.map((f) => f.path)).toEqual(["a.py", "b.py", "data.bin2"]);
    expect(files.find((f) => f.path === "a.py")?.content).toBe("a");
    const reasons = Object.fromEntries(skipped.map((s) => [s.path, s.reason]));
    expect(reasons["img.png"]).toBe("binary-extension");
    expect(reasons["node_modules/x.js"]).toBe("ignored-directory");
    expect(reasons["huge.txt"]).toBe("too-large");
    expect(reasons["nul.txt"]).toBe("binary-content");
    expect(reasons["../escape.txt"]).toBe("invalid-path");
    expect(skipped.some((s) => s.reason === "duplicate-path")).toBe(true);
  });

  it("measures the size cap in UTF-8 bytes", () => {
    const content = "é".repeat(MAX_FILE_BYTES / 2 + 1); // 2 bytes each
    expect(prepareLocalFiles([{ path: "a.txt", content }]).skipped[0].reason).toBe("too-large");
  });

  it("drops a file that is also a directory of another file", () => {
    const { files, skipped } = prepareLocalFiles([
      { path: "src", content: "a file" },
      { path: "src/main.py", content: "x" },
    ]);
    expect(files.map((f) => f.path)).toEqual(["src/main.py"]);
    expect(skipped).toEqual([{ path: "src", reason: "path-conflict" }]);
  });

  it("enforces the hard file cap with a clear error", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ path: `f${i}.txt`, content: String(i) }));
    expect(() => prepareLocalFiles(many, 5)).toThrowError(/at most 5/);
    try {
      prepareLocalFiles(many, 5);
    } catch (e) {
      expect((e as { code: string }).code).toBe("too_many_files");
    }
  });
});
