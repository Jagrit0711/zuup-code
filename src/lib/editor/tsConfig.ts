import type * as MonacoNs from "monaco-editor";

type MonacoApi = typeof MonacoNs;

/** Node built-ins that scripts commonly import; declared as untyped modules so they never squiggle. */
export const NODE_MODULES = [
  "fs", "path", "os", "http", "https", "url", "util", "events", "stream", "crypto", "child_process",
  "readline", "assert", "buffer", "zlib", "net", "dns", "tty", "vm", "worker_threads", "perf_hooks",
  "timers", "querystring", "string_decoder", "fs/promises", "readline/promises", "timers/promises",
];

/**
 * Minimal ambient declarations so Node style scripts type-check without
 * `@types/node`: the common globals are typed, modules are untyped (any).
 */
export function nodeGlobalsSource(): string {
  const modules = NODE_MODULES.flatMap((m) => [`declare module "${m}";`, `declare module "node:${m}";`]).join("\n");
  return `
interface ZuupWriteStream { write(chunk: string | Uint8Array): boolean; isTTY?: boolean; columns?: number; on(event: string, cb: (...args: any[]) => void): this; end(): void; }
interface ZuupReadStream { on(event: string, cb: (...args: any[]) => void): this; setEncoding(enc: string): this; resume(): this; pause(): this; read(): any; isTTY?: boolean; }
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  platform: string;
  version: string;
  versions: Record<string, string>;
  pid: number;
  exitCode?: number;
  stdin: ZuupReadStream;
  stdout: ZuupWriteStream;
  stderr: ZuupWriteStream;
  cwd(): string;
  exit(code?: number): never;
  nextTick(cb: (...args: any[]) => void, ...args: any[]): void;
  hrtime: { (time?: [number, number]): [number, number]; bigint(): bigint };
  memoryUsage(): { rss: number; heapTotal: number; heapUsed: number; external: number };
  uptime(): number;
  on(event: string, cb: (...args: any[]) => void): any;
};
declare function require(id: string): any;
declare var module: { exports: any; id: string; filename: string; loaded: boolean; children: any[]; paths: string[]; require(id: string): any };
declare var exports: any;
declare const __dirname: string;
declare const __filename: string;
declare const Buffer: any;
declare function setImmediate(cb: (...args: any[]) => void, ...args: any[]): any;
declare function clearImmediate(handle: any): void;
${modules}
`;
}

/**
 * Tune Monaco's TypeScript/JavaScript service for a scratch-pad editor:
 * modern target, JSX, Node globals, no type-checking noise for plain JS and
 * no "convert to ES module" style hints.
 */
export function configureTypeScript(monaco: MonacoApi) {
  const ts = monaco.typescript;

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    // Every file is its own module so top-level names never clash across files.
    moduleDetection: 3,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    strict: false,
    strictNullChecks: true,
    noImplicitAny: false,
    noEmit: true,
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);

  const diagnostics = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    // Hints such as "File is a CommonJS module; it may be converted to an ES module".
    noSuggestionDiagnostics: true,
  };
  ts.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  ts.javascriptDefaults.setDiagnosticsOptions(diagnostics);

  const libSource = nodeGlobalsSource();
  ts.typescriptDefaults.addExtraLib(libSource, "file:///zuup/node-globals.d.ts");
  ts.javascriptDefaults.addExtraLib(libSource, "file:///zuup/node-globals.d.ts");
}
