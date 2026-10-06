import type { LangData } from "./types";
import { snip } from "./types";
import { HASH_SYNTAX, L } from "./shared";

const PY_ALIASES: Record<string, string> = {
  numpy: "np",
  pandas: "pd",
  "matplotlib.pyplot": "plt",
  seaborn: "sns",
  tensorflow: "tf",
  networkx: "nx",
};

/** True when `name` is defined as a function somewhere in the text. */
const defines = (text: string, re: RegExp) => re.test(text);

/**
 * True when the line ends in the middle of a word: its last identifier is the start of a longer
 * identifier used elsewhere in the text (`if n` while `name` exists), so a closing `:` would be premature.
 */
const midWord = (stem: string, text: string): boolean => {
  const word = /[A-Za-z_]\w*$/.exec(stem)?.[0];
  return !!word && new RegExp(`(?<![\\w.])${word}\\w`).test(text);
};

export const python: LangData = {
  id: "python",
  syntax: { lineComments: ["#"], quotes: "\"'", multilineQuotes: ['"""', "'''"] },
  keywords:
    "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",
  types:
    "int float str bool list dict set frozenset tuple bytes bytearray object complex type Exception ValueError TypeError KeyError IndexError RuntimeError StopIteration NotImplementedError ZeroDivisionError OSError",
  functions:
    "print input len range enumerate zip map filter sorted reversed sum min max abs round isinstance issubclass id hash iter next any all chr ord hex bin oct divmod pow format repr vars dir getattr setattr hasattr callable super open exit quit globals locals slice",
  constants: "True False None self cls __name__ __file__ __init__ __main__",
  snippets: [
    snip("def", "Define a function", L("def ${1:name}(${2:args}):", "\t${0:pass}")),
    snip("defs", "Define a method", L("def ${1:name}(self${2:, args}):", "\t${0:pass}")),
    snip("class", "Define a class", L("class ${1:Name}:", "\tdef __init__(self${2:}):", "\t\t${0:pass}")),
    snip("if", "if statement", L("if ${1:condition}:", "\t${0:pass}")),
    snip("ife", "if / else", L("if ${1:condition}:", "\t${2:pass}", "else:", "\t${0:pass}")),
    snip("for", "for loop", L("for ${1:item} in ${2:items}:", "\t${0:pass}")),
    snip("forr", "for loop over a range", L("for ${1:i} in range(${2:n}):", "\t${0:pass}")),
    snip("fore", "for loop with enumerate", L("for ${1:i}, ${2:item} in enumerate(${3:items}):", "\t${0:pass}")),
    snip("while", "while loop", L("while ${1:condition}:", "\t${0:pass}")),
    snip("try", "try / except", L("try:", "\t${1:pass}", "except ${2:Exception} as ${3:e}:", "\t${0:print(${3:e})}")),
    snip("with", "with open(...)", L("with open(${1:\"file.txt\"}, ${2:\"r\"}) as ${3:f}:", "\t${0:data = ${3:f}.read()}")),
    snip("ifmain", "Script entry point", L("if __name__ == \"__main__\":", "\t${0:main()}")),
    snip("lambda", "Lambda expression", "lambda ${1:x}: ${0:x}"),
    snip("print", "print(...)", "print(${0})"),
    snip("pf", "print an f-string", "print(f\"${0}\")"),
    snip("inint", "Read an integer", "int(input(${0}))"),
    snip("inints", "Read space separated integers", "list(map(int, input().split()))"),
    snip("lc", "List comprehension", "[${1:x} for ${2:x} in ${3:items}]"),
    snip("dataclass", "Dataclass", L("from dataclasses import dataclass", "", "@dataclass", "class ${1:Name}:", "\t${0:field: int}")),
  ],
  members: {
    os: "path getcwd() listdir() makedirs() remove() rename() environ getenv() system() sep name walk()",
    "os.path": "join() exists() isfile() isdir() basename() dirname() abspath() splitext() getsize()",
    sys: "argv exit() stdin stdout stderr path version platform maxsize",
    math: "pi e tau inf nan sqrt() pow() floor() ceil() sin() cos() tan() atan2() log() log2() log10() exp() fabs() factorial() gcd() lcm() radians() degrees() hypot() isqrt() comb() perm()",
    random: "random() randint() randrange() choice() choices() shuffle() sample() uniform() seed() gauss()",
    json: "loads() dumps() load() dump()",
    time: "time() sleep() perf_counter() monotonic() strftime() localtime()",
    datetime: "datetime date time timedelta timezone",
    collections: "defaultdict Counter deque OrderedDict namedtuple()",
    itertools: "permutations() combinations() product() chain() accumulate() groupby() count() cycle() islice() zip_longest() repeat()",
    functools: "reduce() lru_cache() partial() wraps() cache()",
    re: "match() search() findall() finditer() sub() split() compile() fullmatch() escape() IGNORECASE MULTILINE DOTALL",
    heapq: "heappush() heappop() heapify() nlargest() nsmallest()",
    string: "ascii_letters ascii_lowercase ascii_uppercase digits punctuation",
    np: "array() zeros() ones() arange() linspace() reshape() dot() sum() mean() std() max() min() random sqrt() where() concatenate()",
    pd: "DataFrame Series read_csv() concat() merge() to_datetime()",
    plt: "plot() show() figure() xlabel() ylabel() title() legend() subplots() savefig() bar() hist() scatter()",
  },
  // Unknown receivers (variables) fall back to the most common builtin methods.
  genericMembers:
    "append() extend() pop() insert() remove() sort() reverse() index() count() copy() clear() keys() values() items() get() update() add() discard() union() intersection() split() join() strip() lower() upper() replace() startswith() endswith() find() format()",
  modules:
    "os sys math random json time datetime collections itertools functools re heapq string typing pathlib subprocess threading asyncio dataclasses statistics bisect copy decimal fractions csv argparse logging unittest numpy pandas matplotlib.pyplot",
  decls: [
    { re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/, kind: "variable" },
    {
      re: /^\s*for\s+([A-Za-z_][\w\s,]*?)\s+in\b/,
      kind: "variable",
      names: (m) => m[1].split(",").map((s) => s.trim()).filter(Boolean),
    },
    { re: /^\s*import\s+([A-Za-z_]\w*)(?:\.\w+)*\s*$/, kind: "module" },
    { re: /^\s*import\s+[\w.]+\s+as\s+([A-Za-z_]\w*)/, kind: "module" },
    {
      re: /^\s*from\s+[\w.]+\s+import\s+([^#]+)/,
      kind: "module",
      names: (m) =>
        m[1]
          .replace(/[()]/g, "")
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/).pop() ?? "")
          .filter((s) => /^[A-Za-z_]\w*$/.test(s)),
    },
    {
      re: /^\s*(?:async\s+)?def\s+\w+\s*\(([^)]*)\)/,
      kind: "variable",
      names: (m) =>
        m[1]
          .split(",")
          .map((s) => s.trim().replace(/^\*+/, "").split(/[:=]/)[0].trim())
          .filter((s) => /^[A-Za-z_]\w*$/.test(s) && s !== "self" && s !== "cls"),
    },
  ],
  rules: [
    {
      re: /^(?:async )?def ([A-Za-z_]\w*)$/,
      build: (m) => (m[1] === "main" ? `${m[0]}():\n\t$0` : `${m[0]}(\${1:}):\n\t$0`),
    },
    { re: /^class ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}:\n\tdef __init__(self\${1:}):\n\t\t$0` },
    {
      re: /^for ([A-Za-z_]\w*) in(?: (\w*))?$/,
      build: (m, ctx) => {
        const target = m[2] ?? "";
        if (target === "" || "range".startsWith(target)) return `for ${m[1]} in range(\${1:n}):\n\t$0`;
        return midWord(m[0], ctx.text) ? null : `${m[0]}:\n\t$0`;
      },
    },
    {
      re: /^(?:async )?def [A-Za-z_]\w*\([^)]*\)(?: ?-> ?[\w[\], .|]+)?$/,
      build: (m) => `${m[0]}:\n\t$0`,
    },
    { re: /^class [A-Za-z_]\w*\([^)]*\)$/, build: (m) => `${m[0]}:\n\t$0` },
    { re: /^if __n\w*$/, build: () => 'if __name__ == "__main__":\n\t$0' },
    {
      re: /^import ([A-Za-z_][\w.]*)$/,
      build: (m) => {
        const hit = Object.keys(PY_ALIASES).find((k) => k.startsWith(m[1]));
        return hit ? `import ${hit} as ${PY_ALIASES[hit]}` : null;
      },
    },
    {
      // `if x > 0` / `while n` / `else` ... missing the trailing colon.
      re: /^((?:if|elif|while|with|except|try|finally|else|for)\b[^#:]*[\w)\]"'])$|^(try|else|finally)$/,
      build: (m, ctx) => {
        const stem = m[0];
        if (/^(?:try|else|finally)$/.test(stem)) return `${stem}:\n\t$0`;
        if ((stem.match(/\(/g) ?? []).length !== (stem.match(/\)/g) ?? []).length) return null;
        if ((stem.match(/\[/g) ?? []).length !== (stem.match(/\]/g) ?? []).length) return null;
        if (/\b(?:and|or|not|in|is|if|elif|while|with|except|as|for)$/.test(stem)) return null;
        if (/^for\b/.test(stem) && !/^for\s+[\w\s,()]+\s+in\s+\S/.test(stem)) return null;
        if (midWord(stem, ctx.text)) return null;
        return `${stem}:\n\t$0`;
      },
    },
  ],
  blocks: [
    {
      opener: /^\s*def\s+__init__\s*\(\s*self\s*,\s*([^)]+)\)\s*(?:->\s*None\s*)?:\s*$/,
      build: (m) => {
        const params = m[1]
          .split(",")
          .map((s) => s.trim().replace(/^\*+/, "").split(/[:=]/)[0].trim())
          .filter((s) => /^[A-Za-z_]\w*$/.test(s));
        return params.length ? params.map((p) => `self.${p} = ${p}`).join("\n") : null;
      },
    },
    {
      opener: /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:\s*$/,
      build: (_m, ctx) => (defines(ctx.text, /^\s*def\s+main\s*\(/m) ? "main()" : null),
    },
    { opener: /^\s*for\s+([A-Za-z_]\w*)\s+in\b.*:\s*$/, build: (m) => `print(${m[1]})` },
    { opener: /^\s*class\s+\w+\s*\(\s*\w+\s*\)\s*:\s*$/, build: () => "def __init__(self):\n\tsuper().__init__()" },
    { opener: /^\s*class\s+\w+\s*:\s*$/, build: () => "def __init__(self):\n\tpass" },
    { opener: /^\s*while\s+True\s*:\s*$/, build: () => "break" },
  ],
};

export const ruby: LangData = {
  id: "ruby",
  syntax: { lineComments: ["#"], blockComments: [["=begin", "=end"]], quotes: "\"'" },
  keywords:
    "alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require require_relative attr_accessor attr_reader attr_writer",
  functions: "puts print p gets printf sprintf format rand sleep loop lambda proc raise require",
  types: "String Integer Float Array Hash Symbol Range Struct Time Comparable Enumerable Kernel Math File Dir Set Object",
  constants: "true false nil self __FILE__",
  snippets: [
    snip("def", "Define a method", L("def ${1:name}(${2:args})", "\t${0}", "end")),
    snip("class", "Define a class", L("class ${1:Name}", "\tdef initialize(${2:args})", "\t\t${0}", "\tend", "end")),
    snip("module", "Define a module", L("module ${1:Name}", "\t${0}", "end")),
    snip("if", "if statement", L("if ${1:condition}", "\t${0}", "end")),
    snip("unless", "unless statement", L("unless ${1:condition}", "\t${0}", "end")),
    snip("each", "Iterate with each", L("${1:items}.each do |${2:item}|", "\t${0}", "end")),
    snip("times", "Repeat n times", L("${1:5}.times do |${2:i}|", "\t${0}", "end")),
    snip("while", "while loop", L("while ${1:condition}", "\t${0}", "end")),
    snip("case", "case expression", L("case ${1:value}", "when ${2:match}", "\t${0}", "else", "\t", "end")),
    snip("begin", "begin / rescue", L("begin", "\t${1}", "rescue ${2:StandardError} => ${3:e}", "\tputs ${3:e}.message", "end")),
    snip("puts", "puts(...)", "puts ${0}"),
    snip("attr", "attr_accessor", "attr_accessor :${0:name}"),
  ],
  members: {
    Math: "sqrt() sin() cos() tan() log() PI E hypot() cbrt()",
    File: "read() write() open() exist?() readlines() join() basename()",
    Time: "now() at() mktime()",
  },
  decls: [
    { re: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/, kind: "function" },
    { re: /^\s*(?:class|module)\s+([A-Z]\w*)/, kind: "class" },
    { re: /^\s*(@{0,2}[A-Za-z_]\w*)\s*(?:\|\|)?=(?!=)/, kind: "variable" },
  ],
  rules: [
    { re: /^def ([A-Za-z_]\w*[?!]?)$/, build: (m) => `${m[0]}(\${1:})\n\t$0\nend` },
    { re: /^class ([A-Z]\w*)$/, build: (m) => `${m[0]}\n\tdef initialize\n\t\t$0\n\tend\nend` },
  ],
};

export const lua: LangData = {
  id: "lua",
  syntax: { lineComments: ["--"], blockComments: [["--[[", "]]"]], quotes: "\"'", multilineQuotes: ["[[", "[=["] },
  keywords: "and break do else elseif end false for function goto if in local nil not or repeat return then true until while",
  functions:
    "print pairs ipairs type tostring tonumber require pcall error assert select setmetatable getmetatable rawget rawset next unpack",
  constants: "true false nil _G _VERSION",
  snippets: [
    snip("function", "Define a function", L("function ${1:name}(${2:args})", "\t${0}", "end")),
    snip("lfunction", "Define a local function", L("local function ${1:name}(${2:args})", "\t${0}", "end")),
    snip("if", "if statement", L("if ${1:condition} then", "\t${0}", "end")),
    snip("ifelse", "if / else", L("if ${1:condition} then", "\t${2}", "else", "\t${0}", "end")),
    snip("for", "numeric for loop", L("for ${1:i} = ${2:1}, ${3:10} do", "\t${0}", "end")),
    snip("forp", "for loop with pairs", L("for ${1:k}, ${2:v} in pairs(${3:t}) do", "\t${0}", "end")),
    snip("fori", "for loop with ipairs", L("for ${1:i}, ${2:v} in ipairs(${3:t}) do", "\t${0}", "end")),
    snip("while", "while loop", L("while ${1:condition} do", "\t${0}", "end")),
    snip("repeat", "repeat until", L("repeat", "\t${0}", "until ${1:condition}")),
    snip("print", "print(...)", "print(${0})"),
  ],
  members: {
    string: "format() sub() gsub() find() match() gmatch() len() lower() upper() rep() reverse() byte() char()",
    table: "insert() remove() concat() sort() unpack() pack()",
    math: "floor() ceil() sqrt() abs() max() min() random() randomseed() pi huge sin() cos() tan() log() exp()",
    os: "time() clock() date() getenv() exit()",
    io: "write() read() open() lines()",
  },
  decls: [
    { re: /^\s*(?:local\s+)?function\s+([A-Za-z_][\w.:]*)/, kind: "function" },
    { re: /^\s*local\s+([A-Za-z_]\w*)\s*=/, kind: "variable" },
    { re: /^\s*([A-Za-z_]\w*)\s*=(?!=)/, kind: "variable" },
  ],
  rules: [{ re: /^(local )?function ([A-Za-z_][\w.:]*)$/, build: (m) => `${m[0]}(\${1:})\n\t$0\nend` }],
};

export const perl: LangData = {
  id: "perl",
  syntax: { lineComments: ["#"], blockComments: [["=pod", "=cut"]], quotes: "\"'" },
  keywords:
    "my our local sub if elsif else unless while until for foreach do last next redo return package use no require and or not eq ne lt gt le ge cmp qw qq q wantarray",
  functions:
    "print printf say push pop shift unshift splice scalar keys values each exists delete defined die warn length substr index join split sort reverse map grep open close chomp chop lc uc sprintf abs int sqrt rand srand time localtime sleep exit",
  constants: "__FILE__ __LINE__ __PACKAGE__ STDIN STDOUT STDERR ARGV ENV",
  snippets: [
    snip("sub", "Define a subroutine", L("sub ${1:name} {", "\tmy (${2:\\$arg}) = @_;", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("foreach", "foreach loop", L("foreach my \\$${1:item} (@${2:items}) {", "\t${0}", "}")),
    snip("for", "C-style for loop", L("for (my \\$${1:i} = 0; \\$${1:i} < ${2:10}; \\$${1:i}++) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("strict", "Strict pragmas", L("use strict;", "use warnings;")),
    snip("open", "Open a file", "open(my \\$${1:fh}, '<', ${2:'file.txt'}) or die \"Cannot open: \\$!\";"),
    snip("print", "print", "print \"${0}\\n\";"),
  ],
  decls: [
    { re: /^\s*sub\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:my|our|local)\s+[$@%]([A-Za-z_]\w*)/, kind: "variable" },
    { re: /^\s*package\s+([A-Za-z_][\w:]*)/, kind: "class" },
  ],
};

export const r: LangData = {
  id: "r",
  syntax: HASH_SYNTAX,
  keywords: "if else repeat while function for next break in return TRUE FALSE NULL NA Inf NaN library require source",
  functions:
    "print cat paste paste0 c length seq rep rev sort order sum mean median var sd min max abs sqrt round floor ceiling exp log nchar substr toupper tolower sapply lapply vapply apply tapply mapply Map Filter Reduce data.frame matrix list vector names head tail str summary table unique which is.na is.null ifelse stop warning tryCatch plot hist lines points barplot readline readLines read.csv write.csv set.seed runif rnorm sample",
  constants: "TRUE FALSE NULL NA NA_integer_ NA_character_ Inf NaN pi letters LETTERS",
  snippets: [
    snip("function", "Define a function", L("${1:name} <- function(${2:args}) {", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("for", "for loop", L("for (${1:i} in ${2:1:10}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("lib", "Load a library", "library(${0})"),
    snip("df", "Create a data frame", "${1:df} <- data.frame(${0})"),
    snip("tc", "tryCatch", L("tryCatch({", "\t${1}", "}, error = function(e) {", "\t${0:message(e)}", "})")),
  ],
  decls: [
    { re: /^\s*([A-Za-z_.][\w.]*)\s*(?:<-|=)\s*function\b/, kind: "function" },
    { re: /^\s*([A-Za-z_.][\w.]*)\s*(?:<-|=(?!=))/, kind: "variable" },
  ],
  rules: [{ re: /^([A-Za-z_.][\w.]*) <- function$/, build: (m) => `${m[0]}(\${1:}) {\n\t$0\n}` }],
};

export const shell: LangData = {
  id: "shell",
  syntax: { lineComments: ["#"], quotes: "\"'", multilineQuotes: ["`"] },
  keywords: "if then else elif fi case esac for select while until do done in function time coproc return exit break continue local export readonly declare unset shift source",
  functions:
    "echo printf read cd ls pwd cat grep sed awk cut sort uniq wc head tail find xargs chmod chown mkdir rmdir rm cp mv touch tr tee test eval exec trap wait kill date sleep curl wget tar gzip",
  snippets: [
    snip("shebang", "Bash shebang", L("#!/usr/bin/env bash", "set -euo pipefail", "")),
    snip("if", "if statement", L("if [[ ${1:condition} ]]; then", "\t${0}", "fi")),
    snip("ifelse", "if / else", L("if [[ ${1:condition} ]]; then", "\t${2}", "else", "\t${0}", "fi")),
    snip("for", "for loop over words", L("for ${1:item} in ${2:items}; do", "\t${0}", "done")),
    snip("fori", "C-style for loop", L("for ((${1:i}=0; ${1:i}<${2:10}; ${1:i}++)); do", "\t${0}", "done")),
    snip("while", "while loop", L("while ${1:condition}; do", "\t${0}", "done")),
    snip("case", "case statement", L("case \\$${1:var} in", "\t${2:pattern})", "\t\t${0}", "\t\t;;", "\t*)", "\t\t;;", "esac")),
    snip("function", "Define a function", L("${1:name}() {", "\t${0}", "}")),
    snip("read", "Read a line of input", "read -r ${0:line}"),
    snip("echo", "echo", "echo \"${0}\""),
  ],
  decls: [
    { re: /^\s*(?:function\s+)?([A-Za-z_]\w*)\s*\(\s*\)\s*\{?/, kind: "function" },
    { re: /^\s*function\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:export\s+|local\s+|readonly\s+|declare\s+(?:-\w+\s+)?)?([A-Za-z_]\w*)=/, kind: "variable" },
  ],
  rules: [
    { re: /^for ([A-Za-z_]\w*) in [^;]*[\w"'}]$/, build: (m) => `${m[0]}; do\n\t$0\ndone` },
    { re: /^(?:if|while|until) \[\[?[^;]*\]\]?$/, build: (m) => (m[0].startsWith("if") ? `${m[0]}; then\n\t$0\nfi` : `${m[0]}; do\n\t$0\ndone`) },
  ],
};

export const elixir: LangData = {
  id: "elixir",
  syntax: { lineComments: ["#"], quotes: "\"'", multilineQuotes: ['"""', "'''"] },
  keywords: "after alias and case catch cond def defp defmodule defmacro defstruct defprotocol defimpl do else end fn for if import in not or quote raise receive require rescue try unless unquote use when with",
  functions: "IO.puts IO.inspect Enum.map Enum.filter Enum.reduce Enum.each length hd tl elem is_nil is_list is_map is_binary to_string spawn send self inspect",
  constants: "true false nil",
  snippets: [
    snip("defmodule", "Define a module", L("defmodule ${1:Name} do", "\t${0}", "end")),
    snip("def", "Define a public function", L("def ${1:name}(${2:args}) do", "\t${0}", "end")),
    snip("defp", "Define a private function", L("defp ${1:name}(${2:args}) do", "\t${0}", "end")),
    snip("if", "if expression", L("if ${1:condition} do", "\t${0}", "end")),
    snip("case", "case expression", L("case ${1:value} do", "\t${2:pattern} ->", "\t\t${0}", "end")),
    snip("cond", "cond expression", L("cond do", "\t${1:condition} ->", "\t\t${0}", "end")),
    snip("fn", "Anonymous function", "fn ${1:x} -> ${0} end"),
    snip("for", "Comprehension", "for ${1:x} <- ${2:list}, do: ${0}"),
    snip("puts", "IO.puts(...)", "IO.puts(${0})"),
    snip("pipe", "Pipe into Enum.map", "|> Enum.map(fn ${1:x} -> ${0} end)"),
  ],
  members: {
    Enum: "map() filter() reduce() each() sort() reverse() sum() count() find() member?() join() take() drop() zip() with_index() into()",
    IO: "puts() inspect() gets() write()",
    String: "upcase() downcase() length() split() trim() replace() to_integer() contains?() starts_with?()",
    List: "first() last() flatten() delete() foldl() keyfind()",
    Map: "get() put() keys() values() merge() has_key?() new()",
  },
  decls: [
    { re: /^\s*defp?\s+([a-z_]\w*[?!]?)/, kind: "function" },
    { re: /^\s*defmodule\s+([A-Z][\w.]*)/, kind: "class" },
    { re: /^\s*([a-z_]\w*)\s*=(?!=)/, kind: "variable" },
  ],
  rules: [{ re: /^(defp?) ([a-z_]\w*[?!]?)$/, build: (m) => `${m[0]}(\${1:}) do\n\t$0\nend` }],
};

export const clojure: LangData = {
  id: "clojure",
  syntax: { lineComments: [";"], quotes: '"' },
  keywords: "def defn defn- defmacro defmulti defmethod defprotocol defrecord deftype ns let fn if if-not when when-not cond case do loop recur for doseq dotimes try catch finally throw quote require use import",
  functions:
    "println print prn str map filter reduce first rest cons conj count nth get assoc dissoc update keys vals range take drop apply partial comp identity inc dec mod rem max min even? odd? zero? nil? empty? seq vec into sort sort-by reverse concat distinct frequencies group-by atom swap! reset! deref",
  constants: "true false nil",
  snippets: [
    snip("defn", "Define a function", L("(defn ${1:name} [${2:args}]", "\t${0})")),
    snip("def", "Define a var", "(def ${1:name} ${0})"),
    snip("let", "let bindings", L("(let [${1:x} ${2:value}]", "\t${0})")),
    snip("if", "if expression", "(if ${1:test}\n\t${2:then}\n\t${0:else})"),
    snip("when", "when expression", L("(when ${1:test}", "\t${0})")),
    snip("cond", "cond expression", L("(cond", "\t${1:test} ${2:result}", "\t:else ${0})")),
    snip("loop", "loop / recur", L("(loop [${1:i} 0]", "\t(when (< ${1:i} ${2:10})", "\t\t${0}", "\t\t(recur (inc ${1:i}))))")),
    snip("doseq", "doseq loop", L("(doseq [${1:x} ${2:coll}]", "\t${0})")),
    snip("ns", "Namespace", L("(ns ${1:app.core}", "\t(:require [${0}]))")),
    snip("println", "println", "(println ${0})"),
  ],
  decls: [
    { re: /^\s*\(\s*defn-?\s+([^\s()[\]]+)/, kind: "function" },
    { re: /^\s*\(\s*def\s+([^\s()[\]]+)/, kind: "variable" },
    { re: /^\s*\(\s*def(?:record|type|protocol)\s+([^\s()[\]]+)/, kind: "class" },
  ],
};

export const nim: LangData = {
  id: "nim",
  syntax: { lineComments: ["#"], blockComments: [["#[", "]#"]], quotes: "\"'", multilineQuotes: ['"""'] },
  keywords:
    "addr and as asm bind block break case cast concept const continue converter defer discard distinct div do elif else end enum except export finally for from func if import in include interface is isnot iterator let macro method mixin mod nil not notin object of or out proc ptr raise ref return shl shr static template try tuple type using var when while xor yield",
  types: "int int8 int16 int32 int64 uint float float32 float64 bool char string seq array set openArray Table HashSet Option",
  functions: "echo len add pop inc dec readLine parseInt parseFloat repr newSeq newString min max abs sort high low contains quit assert",
  constants: "true false nil",
  snippets: [
    snip("proc", "Define a procedure", L("proc ${1:name}(${2:args}): ${3:int} =", "\t${0}")),
    snip("func", "Define a pure function", L("func ${1:name}(${2:args}): ${3:int} =", "\t${0}")),
    snip("type", "Define an object type", L("type", "\t${1:Name} = object", "\t\t${0:field: int}")),
    snip("if", "if statement", L("if ${1:condition}:", "\t${0}")),
    snip("for", "for loop", L("for ${1:i} in ${2:0}..<${3:n}:", "\t${0}")),
    snip("while", "while loop", L("while ${1:condition}:", "\t${0}")),
    snip("case", "case statement", L("case ${1:value}", "of ${2:match}:", "\t${0}", "else:", "\tdiscard")),
    snip("echo", "echo", "echo ${0}"),
    snip("import", "Import modules", "import ${0:strutils, sequtils}"),
  ],
  decls: [
    { re: /^\s*(?:proc|func|method|iterator|template|macro|converter)\s+`?([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:var|let|const)\s+([A-Za-z_]\w*)/, kind: "variable" },
    { re: /^\s+([A-Z]\w*)\*?\s*=\s*(?:object|enum|ref|tuple|distinct)/, kind: "class" },
  ],
  rules: [{ re: /^(proc|func) ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}(\${1:}) =\n\t$0` }],
};

export const haskell: LangData = {
  id: "haskell",
  syntax: { lineComments: ["--"], blockComments: [["{-", "-}"]], quotes: '"' },
  keywords: "case class data default deriving do else forall foreign if import in infix infixl infixr instance let module newtype of qualified then type where as hiding",
  types: "Int Integer Float Double Bool Char String Maybe Either IO Ordering List Eq Ord Show Read Num Functor Monad Applicative",
  functions:
    "putStrLn putStr print getLine getContents readFile writeFile show read map filter foldr foldl foldl1 foldr1 sum product length head tail last init take drop reverse zip zipWith unzip concat concatMap lines unlines words unwords fst snd maximum minimum elem null replicate span lookup mapM_ forM_ return pure fmap not otherwise error undefined fromIntegral div mod sqrt",
  constants: "True False Nothing Just Left Right LT EQ GT",
  snippets: [
    snip("main", "main entry point", L("main :: IO ()", "main = do", "\t${0:putStrLn \"Hello, World!\"}")),
    snip("module", "Module header", L("module ${1:Main} where", "", "${0}")),
    snip("data", "Data type", "data ${1:Name} = ${2:Constructor} ${0:Int}"),
    snip("class", "Type class", L("class ${1:Name} ${2:a} where", "\t${0}")),
    snip("instance", "Type class instance", L("instance ${1:Show} ${2:Name} where", "\t${0}")),
    snip("case", "case expression", L("case ${1:value} of", "\t${2:pattern} -> ${0}")),
    snip("if", "if expression", "if ${1:condition} then ${2:a} else ${0:b}"),
    snip("let", "let expression", L("let ${1:x} = ${2:value}", "in ${0:x}")),
    snip("where", "where block", L("where", "\t${0}")),
    snip("import", "Import a module", "import ${0:Data.List}"),
  ],
  modules: "Data.List Data.Char Data.Maybe Data.Map Data.Set Data.Ord Data.Function Data.Bits Control.Monad Text.Printf System.IO",
  decls: [
    { re: /^([a-z_][\w']*)\s*::/, kind: "function" },
    { re: /^(?:data|newtype|type)\s+([A-Z][\w']*)/, kind: "class" },
    { re: /^class\s+(?:\([^)]*\)\s*=>\s*)?([A-Z][\w']*)/, kind: "class" },
  ],
  rules: [
    { re: /^main$/, build: () => "main :: IO ()\nmain = do\n\t$0" },
  ],
};
