import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Vercel entry points run as native Node ESM ("type": "module"), where an extensionless relative
 * import fails with ERR_MODULE_NOT_FOUND. These checks keep that from regressing silently.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const relativeImports = (source: string) =>
  Array.from(source.matchAll(/^\s*(?:import|export)[^"']*from\s+["'](\.{1,2}\/[^"']+)["']/gm)).map((m) => m[1]);

describe("serverless entry points", () => {
  it("Vercel handlers import server modules with explicit .js extensions", () => {
    const files = readdirSync(join(root, "api/github")).filter((f) => f.endsWith(".ts"));
    expect(files.sort()).toEqual(["callback.ts", "config.ts", "login.ts"]);
    for (const file of files) {
      const imports = relativeImports(read(`api/github/${file}`));
      expect(imports.length).toBeGreaterThan(0);
      for (const spec of imports) expect(spec, `${file}: ${spec}`).toMatch(/\.js$/);
    }
  });

  it("server modules loaded by Node are self-contained", () => {
    for (const file of ["src/lib/github/oauthServer.ts", "src/lib/github/nodeAdapter.ts"]) {
      expect(relativeImports(read(file)), file).toEqual([]);
    }
  });

  it("Cloudflare Pages runs Functions only for /api/*", () => {
    const routes = JSON.parse(read("public/_routes.json"));
    expect(routes).toEqual({ version: 1, include: ["/api/*"], exclude: [] });
    // Every Pages Function lives under functions/api, so the include rule covers all of them.
    expect(readdirSync(join(root, "functions"))).toEqual(["api"]);
    expect(readdirSync(join(root, "functions/api"))).toEqual(expect.arrayContaining(["execute.ts", "github"]));
  });
});
