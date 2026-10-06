import type { LangData, RuleContext } from "./types";
import { fileSnip, snip } from "./types";
import { C_SYNTAX, L, TYPED_VARIABLE } from "./shared";

const C_HEADERS = [
  "stdio.h", "stdlib.h", "string.h", "math.h", "stdbool.h", "stdint.h", "ctype.h", "time.h", "assert.h",
  "limits.h", "float.h", "errno.h", "signal.h", "stddef.h", "unistd.h",
];

const CPP_HEADERS = [
  "iostream", "vector", "string", "algorithm", "map", "unordered_map", "set", "unordered_set", "queue",
  "stack", "deque", "cmath", "cstdio", "cstdlib", "cstring", "climits", "numeric", "iomanip", "sstream",
  "fstream", "memory", "functional", "utility", "tuple", "array", "bitset", "chrono", "thread", "mutex",
  "random", "cassert", "optional", "variant", "bits/stdc++.h",
];

const includeRule = (headers: string[], closing: (h: string) => string = (h) => `<${h}>`) => ({
  re: /^#\s*include\s*[<"]?([\w./+]*)$/,
  build: (m: RegExpExecArray, ctx: RuleContext) => {
    // Skip headers the file already includes.
    const included = (h: string) => new RegExp(`^\\s*#\\s*include\\s*[<"]${h.replace(/[.+]/g, "\\$&")}[>"]`, "m").test(ctx.text);
    const hit = headers.find((h) => h.startsWith(m[1]) && !included(h));
    return hit ? `#include ${closing(hit)}` : null;
  },
});

const CLIKE_FN_DECL = {
  re: /^\s*(?!(?:return|else|if|for|while|switch|do|delete|new|case|throw|sizeof|using|typedef)\b)(?:[A-Za-z_][\w:<>,*&\s]*?[\s*&])([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:\{|$)/,
  kind: "function" as const,
};

export const c: LangData = {
  id: "c",
  syntax: C_SYNTAX,
  keywords:
    "auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while",
  types: "int char short long float double void signed unsigned bool size_t ssize_t FILE int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t",
  functions:
    "printf scanf fprintf fscanf sprintf snprintf sscanf puts putchar getchar gets fgets fputs fopen fclose fread fwrite fseek ftell rewind fflush malloc calloc realloc free memcpy memmove memset memcmp strlen strcpy strncpy strcat strncat strcmp strncmp strchr strrchr strstr strtok atoi atof atol strtol strtod abs labs rand srand exit abort qsort bsearch sqrt pow sin cos tan floor ceil fabs log exp toupper tolower isalpha isdigit isalnum isspace time clock assert perror",
  constants: "NULL EOF true false INT_MAX INT_MIN UINT_MAX LONG_MAX RAND_MAX EXIT_SUCCESS EXIT_FAILURE stdin stdout stderr M_PI",
  snippets: [
    snip("main", "int main()", L("int main(void) {", "\t${0}", "\treturn 0;", "}")),
    snip("mainargs", "int main(argc, argv)", L("int main(int argc, char *argv[]) {", "\t${0}", "\treturn 0;", "}")),
    snip("inc", "#include <...>", "#include <${0:stdio.h}>"),
    snip("printf", "printf(...)", "printf(\"${1:%d}\\n\"${2:, value});"),
    snip("scanf", "scanf(...)", "scanf(\"${1:%d}\", &${2:value});"),
    snip("for", "for loop", L("for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("dowhile", "do / while loop", L("do {", "\t${0}", "} while (${1:condition});")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (${1:value}) {", "case ${2:1}:", "\t${0}", "\tbreak;", "default:", "\tbreak;", "}")),
    snip("struct", "typedef struct", L("typedef struct {", "\t${0:int id;}", "} ${1:Name};")),
    snip("enum", "typedef enum", L("typedef enum {", "\t${0:VALUE}", "} ${1:Name};")),
    snip("func", "Function definition", L("${1:int} ${2:name}(${3:void}) {", "\t${0}", "}")),
    snip("malloc", "malloc", "${1:int} *${2:ptr} = malloc(${3:n} * sizeof(${1:int}));"),
    snip("fopen", "Open a file", L("FILE *${1:fp} = fopen(${2:\"file.txt\"}, ${3:\"r\"});", "if (${1:fp} == NULL) {", "\tperror(\"fopen\");", "\treturn 1;", "}")),
    snip("guard", "Header guard", L("#ifndef ${1:HEADER_H}", "#define ${1:HEADER_H}", "", "${0}", "", "#endif")),
  ],
  modules: C_HEADERS.join(" "),
  decls: [
    CLIKE_FN_DECL,
    TYPED_VARIABLE,
    { re: /^\s*(?:typedef\s+)?(?:struct|union|enum)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*#\s*define\s+([A-Za-z_]\w*)/, kind: "constant" },
    { re: /^\s*}\s*([A-Za-z_]\w*)\s*;/, kind: "class" },
  ],
  rules: [
    includeRule(C_HEADERS),
    {
      re: /^(?:int|void) main$/,
      build: (m) => `${m[0]}(\${1:void}) {\n\t$0\n\treturn 0;\n}`,
    },
    { re: /^#\s*def\w*$/, build: () => "#define ${1:NAME} ${0:value}" },
  ],
  blocks: [
    {
      opener: /^\s*int\s+main\s*\([^)]*\)\s*\{\s*$/,
      build: (_m, ctx) => (/^\s*#\s*include\s*<stdio\.h>/m.test(ctx.text) ? 'printf("Hello, World!\\n");\nreturn 0;' : "return 0;"),
    },
    { opener: /^\s*for\s*\(\s*int\s+(\w+)\s*=.*\)\s*\{\s*$/, build: (m) => `printf("%d\\n", ${m[1]});` },
  ],
};

export const cpp: LangData = {
  id: "cpp",
  syntax: C_SYNTAX,
  keywords:
    "alignas alignof and asm auto break case catch class const constexpr const_cast continue decltype default delete do dynamic_cast else enum explicit export extern for friend goto if inline mutable namespace new noexcept not operator or override private protected public register reinterpret_cast return sizeof static static_assert static_cast struct switch template this throw try typedef typeid typename union using virtual volatile while final",
  types:
    "int char short long float double void bool signed unsigned size_t string wstring vector map unordered_map set unordered_set multiset multimap list deque queue priority_queue stack array pair tuple bitset optional variant shared_ptr unique_ptr weak_ptr function thread mutex ostream istream stringstream ifstream ofstream int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t",
  functions:
    "printf scanf sort reverse swap min max abs pow sqrt floor ceil lower_bound upper_bound binary_search accumulate iota fill find count unique next_permutation make_pair make_tuple make_shared make_unique move forward getline to_string stoi stol stod stoll exit rand srand memset memcpy strlen",
  constants: "nullptr true false NULL INT_MAX INT_MIN LLONG_MAX npos endl cin cout cerr",
  snippets: [
    snip("main", "int main()", L("int main() {", "\t${0}", "\treturn 0;", "}")),
    snip("mainargs", "int main(argc, argv)", L("int main(int argc, char *argv[]) {", "\t${0}", "\treturn 0;", "}")),
    snip("inc", "#include <...>", "#include <${0:iostream}>"),
    snip("using", "using namespace std", "using namespace std;"),
    snip("cout", "std::cout line", "cout << ${1:value} << endl;"),
    snip("cin", "std::cin read", "cin >> ${0:value};"),
    snip("for", "for loop", L("for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {", "\t${0}", "}")),
    snip("forr", "range-based for loop", L("for (${1:auto&} ${2:item} : ${3:items}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (${1:value}) {", "case ${2:1}:", "\t${0}", "\tbreak;", "default:", "\tbreak;", "}")),
    snip("class", "Class definition", L("class ${1:Name} {", "public:", "\t${1:Name}() {}", "\t~${1:Name}() {}", "", "private:", "\t${0}", "};")),
    snip("struct", "Struct definition", L("struct ${1:Name} {", "\t${0:int id;}", "};")),
    snip("template", "Function template", L("template <typename ${1:T}>", "${2:T} ${3:name}(${4:T a}) {", "\t${0}", "}")),
    snip("lambda", "Lambda expression", "[${1:&}](${2:int x}) { ${0} }"),
    snip("vec", "Vector declaration", "vector<${1:int}> ${0:v};"),
    snip("fastio", "Fast I/O", L("ios_base::sync_with_stdio(false);", "cin.tie(nullptr);")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch (const ${2:std::exception}& ${3:e}) {", "\t${0}", "}")),
    snip("guard", "Header guard", L("#pragma once", "", "${0}")),
  ],
  members: {
    std: "cout cin cerr endl string vector map unordered_map set unordered_set queue stack deque pair sort() reverse() swap() min() max() abs() to_string() stoi() getline() make_pair() move() make_shared() make_unique() accumulate() fill() find() count() unique() lower_bound() upper_bound() iota()",
    cout: "flush() precision() width()",
  },
  modules: CPP_HEADERS.join(" "),
  decls: [
    CLIKE_FN_DECL,
    TYPED_VARIABLE,
    { re: /^\s*(?:template\s*<[^>]*>\s*)?(?:class|struct|union|enum(?:\s+class)?)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:namespace)\s+([A-Za-z_]\w*)/, kind: "module" },
    { re: /^\s*#\s*define\s+([A-Za-z_]\w*)/, kind: "constant" },
    { re: /^\s*using\s+([A-Za-z_]\w*)\s*=/, kind: "type" },
  ],
  rules: [
    includeRule(CPP_HEADERS),
    { re: /^int main$/, build: () => "int main() {\n\t$0\n\treturn 0;\n}" },
    { re: /^using n\w*$/, build: () => "using namespace std;" },
    { re: /^(?:class|struct) ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} {\n${m[0].startsWith("class") ? "public:\n" : ""}\t$0\n};` },
  ],
  blocks: [
    {
      opener: /^\s*int\s+main\s*\([^)]*\)\s*\{\s*$/,
      build: (_m, ctx) => (/^\s*#\s*include\s*<iostream>/m.test(ctx.text) ? 'cout << "Hello, World!" << endl;\nreturn 0;' : "return 0;"),
    },
    { opener: /^\s*for\s*\(\s*(?:int|size_t|auto)\s+(\w+)\s*=.*\)\s*\{\s*$/, build: (m) => `cout << ${m[1]} << endl;` },
  ],
};

export const go: LangData = {
  id: "go",
  syntax: { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: "\"'", multilineQuotes: ["`"], charLiterals: true },
  keywords: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
  types: "bool string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr byte rune float32 float64 complex64 complex128 error any comparable",
  functions: "append cap clear close complex copy delete imag len make max min new panic print println real recover",
  constants: "true false nil iota",
  snippets: [
    snip("main", "func main()", L("func main() {", "\t${0}", "}")),
    fileSnip("package", "Main package starter", L("package main", "", "import \"fmt\"", "", "func main() {", "\t${0:fmt.Println(\"Hello, World!\")}", "}")),
    snip("func", "Function", L("func ${1:name}(${2:args}) ${3:error} {", "\t${0}", "}")),
    snip("method", "Method", L("func (${1:r} *${2:Type}) ${3:Name}(${4:args}) ${5:error} {", "\t${0}", "}")),
    snip("if", "if statement", L("if ${1:condition} {", "\t${0}", "}")),
    snip("iferr", "if err != nil", L("if err != nil {", "\t${0:return err}", "}")),
    snip("for", "for loop", L("for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {", "\t${0}", "}")),
    snip("forr", "for range loop", L("for ${1:i}, ${2:v} := range ${3:items} {", "\t${0}", "}")),
    snip("while", "for as while", L("for ${1:condition} {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch ${1:value} {", "case ${2:x}:", "\t${0}", "default:", "}")),
    snip("struct", "Struct type", L("type ${1:Name} struct {", "\t${0:Field string}", "}")),
    snip("interface", "Interface type", L("type ${1:Name} interface {", "\t${0:Method()}", "}")),
    snip("goroutine", "Start a goroutine", L("go func() {", "\t${0}", "}()")),
    snip("select", "select statement", L("select {", "case ${1:v} := <-${2:ch}:", "\t${0}", "}")),
    snip("pf", "fmt.Printf", "fmt.Printf(\"${1:%v}\\n\", ${0:value})"),
    snip("pl", "fmt.Println", "fmt.Println(${0})"),
    snip("defer", "defer statement", "defer ${0}"),
  ],
  members: {
    fmt: "Println() Printf() Sprintf() Sprint() Sprintln() Print() Errorf() Fprintf() Scan() Scanln() Scanf() Sscanf()",
    strings: "Contains() Split() Join() Repeat() Replace() ReplaceAll() ToUpper() ToLower() TrimSpace() Trim() HasPrefix() HasSuffix() Index() Fields() Builder",
    strconv: "Itoa() Atoi() ParseInt() ParseFloat() FormatInt() ParseBool() Quote()",
    math: "Sqrt() Pow() Abs() Floor() Ceil() Max() Min() MaxInt64 MinInt64 MaxInt32 Pi Sin() Cos() Log() Round() Inf()",
    sort: "Ints() Strings() Slice() Sort() Search()",
    os: "Args Exit() Stdin Stdout Stderr ReadFile() WriteFile() Getenv() Open()",
    time: "Now() Sleep() Since() Duration Second Millisecond Minute Hour",
    errors: "New() Is() As() Unwrap()",
    bufio: "NewReader() NewScanner() NewWriter()",
    sync: "WaitGroup Mutex RWMutex Once",
  },
  modules: "fmt strings strconv math sort os time errors bufio sync io log bytes regexp math/rand unicode encoding/json net/http context",
  decls: [
    { re: /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, kind: "class" },
    { re: /^\s*type\s+([A-Za-z_]\w*)\s+[A-Za-z[*]/, kind: "type" },
    { re: /^\s*(?:var|const)\s+([A-Za-z_]\w*)/, kind: "variable" },
    {
      re: /^\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*:=/,
      kind: "variable",
      names: (m) => m[1].split(",").map((s) => s.trim()),
    },
    { re: /^\s*import\s+(?:([A-Za-z_]\w*)\s+)?"[^"]*\/?([A-Za-z_]\w*)"/, kind: "module", names: (m) => [m[1] || m[2]] },
  ],
  rules: [
    {
      re: /^package$/,
      build: (_m, ctx) =>
        ctx.text.trim() === "package" ? 'package main\n\nimport "fmt"\n\nfunc main() {\n\t$0\n}' : "package main",
    },
    { re: /^func ([A-Za-z_]\w*)$/, build: (m) => (m[1] === "main" ? "func main() {\n\t$0\n}" : `${m[0]}(\${1:}) {\n\t$0\n}`) },
    { re: /^type ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} struct {\n\t$0\n}` },
    { re: /^if err !?=?$/, build: () => "if err != nil {\n\t${0:return err}\n}" },
  ],
  blocks: [
    { opener: /^\s*func\s+main\s*\(\s*\)\s*\{\s*$/, build: (_m, ctx) => (/"fmt"/.test(ctx.text) ? 'fmt.Println("Hello, World!")' : null) },
    { opener: /^\s*for\s+(\w+)\s*:=\s*0;.*\{\s*$/, build: (m) => `fmt.Println(${m[1]})` },
    { opener: /^\s*for\s+\w+,\s*(\w+)\s*:=\s*range\b.*\{\s*$/, build: (m) => `fmt.Println(${m[1]})` },
  ],
};

export const rust: LangData = {
  id: "rust",
  syntax: { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: "\"'", charLiterals: true },
  keywords:
    "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
  types: "i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc RefCell Cell HashMap HashSet BTreeMap BTreeSet VecDeque BinaryHeap Ordering",
  functions:
    "println! print! eprintln! eprint! format! vec! panic! assert! assert_eq! assert_ne! debug_assert! todo! unimplemented! unreachable! write! writeln! matches! dbg!",
  constants: "true false None Some Ok Err self Self",
  snippets: [
    snip("main", "fn main()", L("fn main() {", "\t${0}", "}")),
    snip("fn", "Function", L("fn ${1:name}(${2}) {", "\t${0}", "}")),
    snip("pfn", "Public function", L("pub fn ${1:name}(${2}) {", "\t${0}", "}")),
    snip("pl", "println!", "println!(\"{}\", ${0:value});"),
    snip("let", "let binding", "let ${1:name} = ${0:value};"),
    snip("letm", "let mut binding", "let mut ${1:name} = ${0:value};"),
    snip("if", "if expression", L("if ${1:condition} {", "\t${0}", "}")),
    snip("iflet", "if let", L("if let ${1:Some(x)} = ${2:value} {", "\t${0}", "}")),
    snip("for", "for loop", L("for ${1:i} in ${2:0..n} {", "\t${0}", "}")),
    snip("while", "while loop", L("while ${1:condition} {", "\t${0}", "}")),
    snip("loop", "loop", L("loop {", "\t${0}", "}")),
    snip("match", "match expression", L("match ${1:value} {", "\t${2:pattern} => ${3:expr},", "\t_ => ${0:expr},", "}")),
    snip("struct", "Struct", L("struct ${1:Name} {", "\t${0:field: i32,}", "}")),
    snip("enum", "Enum", L("enum ${1:Name} {", "\t${0:Variant,}", "}")),
    snip("impl", "impl block", L("impl ${1:Type} {", "\t${0}", "}")),
    snip("trait", "Trait", L("trait ${1:Name} {", "\t${0}", "}")),
    snip("derive", "derive attribute", "#[derive(${0:Debug, Clone})]"),
    snip("test", "Unit test", L("#[test]", "fn ${1:test_name}() {", "\t${0}", "}")),
    snip("read", "Read a line from stdin", L("let mut ${1:input} = String::new();", "std::io::stdin().read_line(&mut ${1:input}).expect(\"failed to read\");")),
  ],
  members: {
    std: "collections io fmt env fs process cmp mem thread time rc sync",
    "std::collections": "HashMap HashSet BTreeMap BTreeSet VecDeque BinaryHeap",
    String: "new() from() with_capacity()",
    Vec: "new() with_capacity() from()",
    HashMap: "new() with_capacity()",
  },
  decls: [
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+([A-Za-z_]\w*)/, kind: "type" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)/, kind: "module" },
    { re: /^\s*(?:pub\s+)?(?:const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)/, kind: "constant" },
    { re: /^\s*let\s+(?:mut\s+)?([A-Za-z_]\w*)/, kind: "variable" },
  ],
  rules: [
    { re: /^(pub )?fn ([A-Za-z_]\w*)$/, build: (m) => (m[2] === "main" ? "fn main() {\n\t$0\n}" : `${m[0]}(\${1:}) {\n\t$0\n}`) },
    { re: /^(?:struct|enum|trait|impl) ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} {\n\t$0\n}` },
    { re: /^#\[d\w*$/, build: () => "#[derive(${0:Debug, Clone})]" },
  ],
  blocks: [{ opener: /^\s*fn\s+main\s*\(\s*\)\s*\{\s*$/, build: () => 'println!("Hello, World!");' }],
};
