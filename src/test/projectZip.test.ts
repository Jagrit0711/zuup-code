import { describe, expect, it } from "vitest";
import { buildZip, crc32, zipFileName } from "@/components/ide/palette/projectZip";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("writes local headers, a central directory and an end record", () => {
    const zip = buildZip([
      { path: "main.py", content: "print('hi')\n" },
      { path: "src/util.py", content: "" },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("main.py");
    expect(text).toContain("src/util.py");
    expect(text).toContain("print('hi')");
  });

  it("handles an empty project", () => {
    expect(buildZip([]).length).toBe(22);
  });
});

describe("zipFileName", () => {
  it("makes a tidy file name", () => {
    expect(zipFileName("My project!")).toBe("my-project.zip");
    expect(zipFileName(null)).toBe("zuup-project.zip");
    expect(zipFileName("***")).toBe("zuup-project.zip");
  });
});
