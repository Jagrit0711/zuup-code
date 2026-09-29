// ==============================================================
// Zuup Code — Rich Monaco Completion & IntelliSense Engine
// Registers comprehensive IntelliSense, keywords, standard libraries,
// methods, and snippets for C, C++, Python, Java, JS, TS, Go, Rust & Web.
// Provides intelligent range calculation to prevent snippet duplication.
// ==============================================================

import type { Monaco } from "@monaco-editor/react";

let registered = false;

export function registerMonacoLanguageSnippets(monaco: Monaco) {
  if (registered) return;
  registered = true;

  const { CompletionItemKind, CompletionItemInsertTextRule } = monaco.languages;

  // Helper to create word range
  const getRange = (model: any, position: any) => {
    const word = model.getWordUntilPosition(position);
    return {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
  };

  // Helper to get replacement range for #include directive to prevent duplication
  // like: `#include <#include <stdio.h>`
  const getIncludeRange = (model: any, position: any, linePrefix: string, lineSuffix: string) => {
    const incMatch = linePrefix.match(/(?:^|\s)(#?\s*include\s*<?\s*)([a-zA-Z0-9_.]*)$/);
    if (incMatch) {
      const fullMatchLen = incMatch[1].length + incMatch[2].length;
      const startColumn = position.column - fullMatchLen;
      const endColumn = lineSuffix.startsWith(">") ? position.column + 1 : position.column;
      return {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: Math.max(1, startColumn),
        endColumn,
      };
    }
    return getRange(model, position);
  };

  const triggerChars = [".", ":", "#", "<", ">", "/", '"', "$", "@", "_"];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. C Language (stdio, stdlib, string, math, keywords & snippets)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("c", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const linePrefix = lineContent.substring(0, position.column - 1);
      const lineSuffix = lineContent.substring(position.column - 1);

      const wordRange = getRange(model, position);
      const incRange = getIncludeRange(model, position, linePrefix, lineSuffix);
      const isInsideAngle = /#?\s*include\s*<[a-zA-Z0-9_.]*$/.test(linePrefix);

      const cHeaders = [
        { name: "stdio.h", desc: "Standard I/O (printf, scanf, fopen)" },
        { name: "stdlib.h", desc: "Standard Library (malloc, free, rand, exit)" },
        { name: "string.h", desc: "String utilities (strlen, strcpy, strcmp, memset)" },
        { name: "math.h", desc: "Math functions (sqrt, pow, sin, cos, floor)" },
        { name: "stdbool.h", desc: "Boolean types (bool, true, false)" },
        { name: "ctype.h", desc: "Character classification (isalpha, isdigit)" },
        { name: "time.h", desc: "Time & clock utilities" },
        { name: "assert.h", desc: "Diagnostics & assertion (assert)" },
        { name: "limits.h", desc: "Integer limits (INT_MAX, INT_MIN)" },
      ];

      const items: any[] = [];

      // If user is inside `#include <`, suggest header files directly without `#include <`
      if (isInsideAngle) {
        cHeaders.forEach((h) => {
          items.push({
            label: h.name,
            kind: CompletionItemKind.Module,
            detail: `<${h.name}> — ${h.desc}`,
            insertText: lineSuffix.startsWith(">") ? h.name : `${h.name}>`,
            range: wordRange,
            sortText: `0_0_${h.name}`,
          });
        });
      }

      // Always suggest full `#include <header.h>` with intelligent full-directive replacement
      cHeaders.forEach((h) => {
        items.push({
          label: `#include <${h.name}>`,
          filterText: `include ${h.name} #${h.name} <${h.name}>`,
          kind: CompletionItemKind.Module,
          insertText: `#include <${h.name}>`,
          detail: `<${h.name}> — ${h.desc}`,
          range: incRange, // Safely replaces `#include <...` or `include ...` without duplicates!
          sortText: `0_1_${h.name}`,
        });
      });

      // Standard C functions and snippets
      items.push(
        {
          label: "main",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "int main() {",
            "    ${1}",
            "    return 0;",
            "}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Standard C main() entry function",
          detail: "int main() { ... }",
          sortText: "0_main",
          range: wordRange,
        },
        {
          label: "main_args",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "int main(int argc, char *argv[]) {",
            "    ${1}",
            "    return 0;",
            "}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "C main() function with command line arguments",
          detail: "int main(int argc, char *argv[])",
          sortText: "0_main_args",
          range: wordRange,
        },
        {
          label: "c_starter",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "#include <stdio.h>",
            "",
            "int main() {",
            "    ${1:printf(\"Hello, World!\\\\n\");}",
            "    return 0;",
            "}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Complete C program starter template with stdio.h",
          detail: "#include <stdio.h> + main()",
          sortText: "0_z_starter",
          range: wordRange,
        },
        {
          label: "printf",
          kind: CompletionItemKind.Function,
          insertText: 'printf("${1:%s}\\n"${2:, ...});',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Print formatted text to stdout",
          detail: 'printf(const char *format, ...)',
          sortText: "0_printf",
          range: wordRange,
        },
        {
          label: "scanf",
          kind: CompletionItemKind.Function,
          insertText: 'scanf("${1:%d}", &${2:variable});',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Read formatted input from stdin",
          detail: 'scanf(const char *format, ...)',
          sortText: "0_scanf",
          range: wordRange,
        },
        {
          label: "scanf_two",
          kind: CompletionItemKind.Function,
          insertText: 'scanf("${1:%d} ${2:%d}", &${3:a}, &${4:b});',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Read two variables from stdin",
          detail: 'scanf("%d %d", &a, &b)',
          sortText: "0_scanf_two",
          range: wordRange,
        },
        {
          label: "malloc",
          kind: CompletionItemKind.Function,
          insertText: "(${1:int} *)malloc(${2:n} * sizeof(${1:int}));",
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Dynamic memory allocation",
          detail: "void *malloc(size_t size)",
          sortText: "0_malloc",
          range: wordRange,
        },
        {
          label: "free",
          kind: CompletionItemKind.Function,
          insertText: "free(${1:ptr});",
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Deallocate dynamically allocated memory",
          detail: "void free(void *ptr)",
          sortText: "0_free",
          range: wordRange,
        },
        {
          label: "for",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {",
            "    ${3:/* code */}",
            "}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Standard for loop",
          sortText: "0_for",
          range: wordRange,
        },
        {
          label: "while",
          kind: CompletionItemKind.Snippet,
          insertText: ["while (${1:condition}) {", "    ${2:/* code */}", "}"].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "While loop",
          sortText: "0_while",
          range: wordRange,
        },
        {
          label: "struct",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "typedef struct {",
            "    ${2:int id;}",
            "} ${1:Name};",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Typedef struct definition",
          sortText: "0_struct",
          range: wordRange,
        }
      );

      // C keywords
      [
        "int", "char", "float", "double", "void", "return", "if", "else", "switch",
        "case", "default", "break", "continue", "sizeof", "const", "static", "typedef",
        "struct", "union", "enum"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `1_${kw}`,
          range: wordRange,
        });
      });

      // Common C library functions
      [
        "strlen", "strcpy", "strncpy", "strcmp", "strcat", "memset", "memcpy",
        "fopen", "fclose", "fgets", "fprintf", "fscanf", "exit"
      ].forEach((fn) => {
        items.push({
          label: fn,
          kind: CompletionItemKind.Function,
          insertText: `${fn}(${"${1}"})`,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `2_${fn}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. C++ Language (iostream, vector, string, algorithms, OOP, STL)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("cpp", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const linePrefix = lineContent.substring(0, position.column - 1);
      const lineSuffix = lineContent.substring(position.column - 1);

      const wordRange = getRange(model, position);
      const incRange = getIncludeRange(model, position, linePrefix, lineSuffix);
      const isInsideAngle = /#?\s*include\s*<[a-zA-Z0-9_.]*$/.test(linePrefix);
      const isAfterStd = /(?:std::)$/.test(linePrefix.replace(/\w*$/, ""));

      const cppHeaders = [
        { name: "iostream", desc: "Standard I/O stream (cin, cout, cerr, endl)" },
        { name: "vector", desc: "Dynamic array container (std::vector)" },
        { name: "string", desc: "C++ String class (std::string)" },
        { name: "algorithm", desc: "STL Algorithms (sort, find, reverse, max)" },
        { name: "map", desc: "Ordered key-value map container" },
        { name: "unordered_map", desc: "Hash table map container (O(1) lookups)" },
        { name: "set", desc: "Unique ordered element set" },
        { name: "queue", desc: "Queue & priority_queue containers" },
        { name: "stack", desc: "LIFO stack container" },
        { name: "cmath", desc: "C++ Math functions (sqrt, pow, abs)" },
        { name: "memory", desc: "Smart pointers (unique_ptr, shared_ptr)" },
        { name: "fstream", desc: "File stream operations (ifstream, ofstream)" },
        { name: "sstream", desc: "String stream operations (stringstream)" },
      ];

      const items: any[] = [];

      // If user is inside `#include <`, suggest header names directly
      if (isInsideAngle) {
        cppHeaders.forEach((h) => {
          items.push({
            label: h.name,
            kind: CompletionItemKind.Module,
            detail: `<${h.name}> — ${h.desc}`,
            insertText: lineSuffix.startsWith(">") ? h.name : `${h.name}>`,
            range: wordRange,
            sortText: `0_0_${h.name}`,
          });
        });
      }

      // Full directive `#include <header>` replacing the directive safely
      cppHeaders.forEach((h) => {
        items.push({
          label: `#include <${h.name}>`,
          filterText: `include ${h.name} #${h.name} <${h.name}>`,
          kind: CompletionItemKind.Module,
          insertText: `#include <${h.name}>`,
          detail: `<${h.name}> — ${h.desc}`,
          range: incRange, // Prevents duplicate #include <#include <
          sortText: `0_1_${h.name}`,
        });
      });

      // Context-aware cout, cin, endl
      if (isAfterStd) {
        items.push(
          { label: "cout", kind: CompletionItemKind.Variable, insertText: "cout", range: wordRange, sortText: "0_0_cout" },
          { label: "cin", kind: CompletionItemKind.Variable, insertText: "cin", range: wordRange, sortText: "0_0_cin" },
          { label: "endl", kind: CompletionItemKind.Variable, insertText: "endl", range: wordRange, sortText: "0_0_endl" },
          { label: "vector", kind: CompletionItemKind.Class, insertText: "vector<${1:int}>", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, range: wordRange, sortText: "0_0_vector" },
          { label: "string", kind: CompletionItemKind.Class, insertText: "string", range: wordRange, sortText: "0_0_string" },
          { label: "pair", kind: CompletionItemKind.Class, insertText: "pair<${1:T1}, ${2:T2}>", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, range: wordRange, sortText: "0_0_pair" },
          { label: "sort", kind: CompletionItemKind.Function, insertText: "sort(${1:v}.begin(), ${1:v}.end());", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, range: wordRange, sortText: "0_0_sort" },
          { label: "max", kind: CompletionItemKind.Function, insertText: "max(${1:a}, ${2:b})", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, range: wordRange, sortText: "0_0_max" },
          { label: "min", kind: CompletionItemKind.Function, insertText: "min(${1:a}, ${2:b})", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, range: wordRange, sortText: "0_0_min" }
        );
      } else {
        items.push(
          {
            label: "main",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "int main() {",
              "    ${1}",
              "    return 0;",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "C++ main entry function",
            detail: "int main() { ... }",
            sortText: "0_main",
            range: wordRange,
          },
          {
            label: "main_args",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "int main(int argc, char *argv[]) {",
              "    ${1}",
              "    return 0;",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "C++ main() function with command line arguments",
            detail: "int main(int argc, char *argv[])",
            sortText: "0_main_args",
            range: wordRange,
          },
          {
            label: "cpp_starter",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "#include <iostream>",
              "using namespace std;",
              "",
              "int main() {",
              "    ${1:cout << \"Hello, World!\" << endl;}",
              "    return 0;",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Complete C++ program starter with iostream and main",
            detail: "#include <iostream> + main()",
            sortText: "0_z_starter",
            range: wordRange,
          },
          {
            label: "cout",
            kind: CompletionItemKind.Snippet,
            insertText: 'cout << ${1:"Hello, World!"} << endl;',
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Print to standard output using cout",
            detail: "cout << ... << endl;",
            sortText: "0_cout",
            range: wordRange,
          },
          {
            label: "cin",
            kind: CompletionItemKind.Snippet,
            insertText: "cin >> ${1:variable};",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Read from standard input using cin",
            detail: "cin >> var;",
            sortText: "0_cin",
            range: wordRange,
          },
          {
            label: "cin_two",
            kind: CompletionItemKind.Snippet,
            insertText: "cin >> ${1:a} >> ${2:b};",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Read two variables from standard input",
            detail: "cin >> a >> b;",
            sortText: "0_cin_two",
            range: wordRange,
          },
          {
            label: "vector",
            kind: CompletionItemKind.Class,
            insertText: "vector<${1:int}> ${2:vec};",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "std::vector declaration",
            detail: "vector<T> name",
            sortText: "0_vector",
            range: wordRange,
          },
          {
            label: "class",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "class ${1:MyClass} {",
              "public:",
              "    ${1:MyClass}() {",
              "        ${2:/* constructor */}",
              "    }",
              "    virtual ~${1:MyClass}() {}",
              "private:",
              "    ${3:/* members */}",
              "};",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Define a C++ class with constructor and destructor",
            sortText: "0_class",
            range: wordRange,
          },
          {
            label: "for_range",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "for (const auto &${1:item} : ${2:collection}) {",
              "    ${3:/* code */}",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Range-based for loop (C++11)",
            sortText: "0_for_range",
            range: wordRange,
          }
        );
      }

      // Methods & keywords
      [
        "push_back", "emplace_back", "pop_back", "size()", "empty()", "clear()",
        "begin()", "end()"
      ].forEach((m) => {
        items.push({
          label: m,
          kind: CompletionItemKind.Method,
          insertText: m,
          sortText: `2_${m}`,
          range: wordRange,
        });
      });

      [
        "auto", "nullptr", "template", "typename", "public", "private", "protected",
        "virtual", "override", "const", "constexpr"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `1_${kw}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Python Language (built-ins, methods, standard libraries & idioms)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const wordRange = getRange(model, position);

      const items: any[] = [
        {
          label: "print",
          kind: CompletionItemKind.Function,
          insertText: "print(${1:message})",
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Print objects to text stream / console",
          detail: "print(*objects, sep=' ', end='\\n')",
          sortText: "0_print",
          range: wordRange,
        },
        {
          label: "input",
          kind: CompletionItemKind.Function,
          insertText: "input(${1:\"Enter: \"})",
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Read a string from standard input",
          detail: "input(prompt) -> str",
          sortText: "0_input",
          range: wordRange,
        },
        {
          label: "input_int",
          kind: CompletionItemKind.Snippet,
          insertText: "int(input(${1:\"Enter number: \"}))",
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Read an integer from standard input",
          detail: "int(input())",
          sortText: "0_input_int",
          range: wordRange,
        },
        {
          label: "input_split_ints",
          kind: CompletionItemKind.Snippet,
          insertText: "map(int, input().split())",
          documentation: "Read space-separated integers",
          detail: "a, b = map(int, input().split())",
          sortText: "0_input_split",
          range: wordRange,
        },
        {
          label: "def",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "def ${1:function_name}(${2:args}):",
            "    \"\"\"${3:docstring}\"\"\"",
            "    ${4:pass}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Define a function",
          sortText: "0_def",
          range: wordRange,
        },
        {
          label: "class",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "class ${1:ClassName}:",
            "    def __init__(self, ${2:arg}):",
            "        self.${2:arg} = ${2:arg}",
            "",
            "    def __repr__(self):",
            "        return f\"{self.__class__.__name__}()\"",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Define a Python class with __init__",
          sortText: "0_class",
          range: wordRange,
        },
        {
          label: "if__name__",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "if __name__ == '__main__':",
            "    ${1:main()}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Python main guard",
          sortText: "0_main_guard",
          range: wordRange,
        },
        {
          label: "for_in_range",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "for ${1:i} in range(${2:n}):",
            "    ${3:pass}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Iterate over integer range",
          sortText: "0_for_range",
          range: wordRange,
        },
        {
          label: "for_enumerate",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "for ${1:i}, ${2:val} in enumerate(${3:iterable}):",
            "    ${4:pass}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Iterate with index and value",
          sortText: "0_for_enum",
          range: wordRange,
        },
        {
          label: "try_except",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "try:",
            "    ${1:/* risky code */}",
            "except ${2:Exception} as ${3:e}:",
            "    print(f\"Error: {${3:e}}\")",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Exception handling block",
          sortText: "0_try",
          range: wordRange,
        },
        {
          label: "with_open",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "with open(${1:\"filename.txt\"}, \"${2:r}\") as ${3:f}:",
            "    ${4:content = f.read()}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Safe file context manager",
          sortText: "0_with_open",
          range: wordRange,
        },
      ];

      // Python built-ins & types
      [
        "len", "range", "enumerate", "zip", "min", "max", "sum", "abs", "round",
        "sorted", "reversed", "isinstance", "type", "int", "float", "str", "bool",
        "list", "dict", "set", "tuple"
      ].forEach((fn) => {
        items.push({
          label: fn,
          kind: CompletionItemKind.Function,
          insertText: `${fn}(${"${1}"})`,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `1_${fn}`,
          range: wordRange,
        });
      });

      // Python keywords
      [
        "import", "from", "return", "yield", "lambda", "if", "elif", "else", "while",
        "break", "continue", "pass", "True", "False", "None", "async", "await", "global",
        "nonlocal"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `2_${kw}`,
          range: wordRange,
        });
      });

      // Common string/list methods
      [
        "append", "extend", "pop", "insert", "remove", "index", "count", "reverse",
        "sort", "keys", "values", "items", "get", "update", "split", "join", "strip",
        "lower", "upper", "replace", "startswith", "endswith"
      ].forEach((m) => {
        items.push({
          label: m,
          kind: CompletionItemKind.Method,
          insertText: `${m}(${"${1}"})`,
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: `3_${m}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Java Language (System.out, Scanner, Collections, OOP)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("java", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const linePrefix = lineContent.substring(0, position.column - 1);
      const wordRange = getRange(model, position);

      const isAfterSysOut = /(?:System\.out\.)$/.test(linePrefix.replace(/\w*$/, ""));

      const items: any[] = [];

      if (isAfterSysOut) {
        items.push(
          { label: "println", kind: CompletionItemKind.Method, insertText: "println(${1:\"\"});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_println", range: wordRange },
          { label: "print", kind: CompletionItemKind.Method, insertText: "print(${1:\"\"});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_print", range: wordRange },
          { label: "printf", kind: CompletionItemKind.Method, insertText: 'printf("${1:%s}\\n", ${2:args});', insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_printf", range: wordRange }
        );
      } else {
        items.push(
          {
            label: "main",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "public static void main(String[] args) {",
              "    ${1}",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Java public static void main method",
            detail: "public static void main(String[] args)",
            sortText: "0_main",
            range: wordRange,
          },
          {
            label: "java_starter",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "public class Main {",
              "    public static void main(String[] args) {",
              "        ${1:System.out.println(\"Hello, World!\");}",
              "    }",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Java class with main entry method",
            detail: "class Main + main()",
            sortText: "0_z_starter",
            range: wordRange,
          },
          {
            label: "sout",
            kind: CompletionItemKind.Snippet,
            insertText: "System.out.println(${1:\"\"});",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Print to standard output (sout / System.out.println)",
            detail: "System.out.println()",
            sortText: "0_sout",
            range: wordRange,
          },
          {
            label: "System.out.println",
            kind: CompletionItemKind.Method,
            insertText: "System.out.println(${1:\"\"});",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Print line to standard output",
            sortText: "0_sys_println",
            range: wordRange,
          },
          {
            label: "Scanner",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "import java.util.Scanner;",
              "",
              "Scanner scanner = new Scanner(System.in);",
              "${1:int n = scanner.nextInt();}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Initialize Scanner for reading standard input",
            detail: "Scanner scanner = new Scanner(System.in);",
            sortText: "0_scanner",
            range: wordRange,
          },
          {
            label: "scanner",
            kind: CompletionItemKind.Snippet,
            insertText: "Scanner scanner = new Scanner(System.in);",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Scanner initialization",
            sortText: "0_scanner_lower",
            range: wordRange,
          },
          {
            label: "ArrayList",
            kind: CompletionItemKind.Class,
            insertText: "List<${1:String}> ${2:list} = new ArrayList<>();",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Initialize a new ArrayList",
            sortText: "0_arraylist",
            range: wordRange,
          },
          {
            label: "HashMap",
            kind: CompletionItemKind.Class,
            insertText: "Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Initialize a new HashMap",
            sortText: "0_hashmap",
            range: wordRange,
          }
        );
      }

      [
        "public", "private", "protected", "static", "final", "void", "class", "interface",
        "extends", "implements", "return", "new", "this", "super", "try", "catch", "finally",
        "throw", "throws"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `1_${kw}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. JavaScript & TypeScript (ES6+, DOM, Node, Promises)
  // ─────────────────────────────────────────────────────────────────────────────
  const registerJsTs = (lang: string) => {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: triggerChars,
      provideCompletionItems: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const linePrefix = lineContent.substring(0, position.column - 1);
        const wordRange = getRange(model, position);

        const isAfterConsole = /(?:console\.)$/.test(linePrefix.replace(/\w*$/, ""));

        const items: any[] = [];

        if (isAfterConsole) {
          items.push(
            { label: "log", kind: CompletionItemKind.Method, insertText: "log(${1:message});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_log", range: wordRange },
            { label: "error", kind: CompletionItemKind.Method, insertText: "error(${1:err});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_error", range: wordRange },
            { label: "warn", kind: CompletionItemKind.Method, insertText: "warn(${1:data});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_warn", range: wordRange },
            { label: "table", kind: CompletionItemKind.Method, insertText: "table(${1:data});", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_table", range: wordRange }
          );
        } else {
          items.push(
            {
              label: "clg",
              kind: CompletionItemKind.Snippet,
              insertText: "console.log(${1:message});",
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Log message to console",
              detail: "console.log(...)",
              sortText: "0_clg",
              range: wordRange,
            },
            {
              label: "console.log",
              kind: CompletionItemKind.Function,
              insertText: "console.log(${1:data});",
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: "0_console_log",
              range: wordRange,
            },
            {
              label: "console.error",
              kind: CompletionItemKind.Function,
              insertText: "console.error(${1:err});",
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: "0_console_error",
              range: wordRange,
            },
            {
              label: "afn",
              kind: CompletionItemKind.Snippet,
              insertText: "const ${1:name} = async (${2:args}) => {\n  ${3}\n};",
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Async arrow function",
              sortText: "0_afn",
              range: wordRange,
            },
            {
              label: "fetch_async",
              kind: CompletionItemKind.Snippet,
              insertText: [
                "const res = await fetch(\"${1:https://api.example.com}\");",
                "const data = await res.json();",
              ].join("\n"),
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Fetch data asynchronously",
              sortText: "0_fetch",
              range: wordRange,
            },
            {
              label: "try_catch",
              kind: CompletionItemKind.Snippet,
              insertText: [
                "try {",
                "  ${1}",
                "} catch (error) {",
                "  console.error(error);",
                "}",
              ].join("\n"),
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              documentation: "Try-catch error handler",
              sortText: "0_try",
              range: wordRange,
            },
            {
              label: "Promise.all",
              kind: CompletionItemKind.Method,
              insertText: "Promise.all([${1:promises}])",
              insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: "0_promise_all",
              range: wordRange,
            }
          );
        }

        [
          "const", "let", "var", "function", "return", "async", "await", "import",
          "export", "default", "from", "if", "else", "switch", "case", "for", "while",
          "class", "extends"
        ].forEach((kw) => {
          items.push({
            label: kw,
            kind: CompletionItemKind.Keyword,
            insertText: kw,
            sortText: `1_${kw}`,
            range: wordRange,
          });
        });

        [
          "map", "filter", "reduce", "forEach", "find", "some", "every", "includes",
          "push", "pop", "slice", "splice", "join", "split"
        ].forEach((m) => {
          items.push({
            label: m,
            kind: CompletionItemKind.Method,
            insertText: m + "((${1:item}) => ${2})",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `2_${m}`,
            range: wordRange,
          });
        });

        return { suggestions: items };
      },
    });
  };

  registerJsTs("javascript");
  registerJsTs("typescript");

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Rust Language (fn main, println!, Result, Option)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("rust", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const wordRange = getRange(model, position);

      const items: any[] = [
        {
          label: "main",
          kind: CompletionItemKind.Snippet,
          insertText: [
            "fn main() {",
            "    ${1:println!(\"Hello, World!\");}",
            "}",
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Rust main entry function",
          sortText: "0_main",
          range: wordRange,
        },
        {
          label: "println!",
          kind: CompletionItemKind.Function,
          insertText: 'println!("${1:{}", ${2:arg});',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: "Print formatted line to stdout",
          sortText: "0_println",
          range: wordRange,
        },
      ];

      [
        "fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "pub",
        "match", "return", "if", "else", "while", "for", "in", "use", "mod"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `1_${kw}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Go Language (package main, func main, fmt)
  // ─────────────────────────────────────────────────────────────────────────────
  monaco.languages.registerCompletionItemProvider("go", {
    triggerCharacters: triggerChars,
    provideCompletionItems: (model, position) => {
      const lineContent = model.getLineContent(position.lineNumber);
      const linePrefix = lineContent.substring(0, position.column - 1);
      const wordRange = getRange(model, position);

      const isAfterFmt = /(?:fmt\.)$/.test(linePrefix.replace(/\w*$/, ""));

      const items: any[] = [];

      if (isAfterFmt) {
        items.push(
          { label: "Println", kind: CompletionItemKind.Function, insertText: "Println(${1:\"\"})", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_println", range: wordRange },
          { label: "Printf", kind: CompletionItemKind.Function, insertText: "Printf(\"${1:%v}\\n\", ${2:val})", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_printf", range: wordRange },
          { label: "Sprintf", kind: CompletionItemKind.Function, insertText: "Sprintf(\"${1:%v}\", ${2:val})", insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet, sortText: "0_0_sprintf", range: wordRange }
        );
      } else {
        items.push(
          {
            label: "main",
            kind: CompletionItemKind.Snippet,
            insertText: [
              "package main",
              "",
              "import \"fmt\"",
              "",
              "func main() {",
              "    ${1:fmt.Println(\"Hello, World!\")}",
              "}",
            ].join("\n"),
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: "Go main package entry function",
            sortText: "0_main",
            range: wordRange,
          },
          {
            label: "fmt.Println",
            kind: CompletionItemKind.Function,
            insertText: "fmt.Println(${1:\"\"})",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: "0_fmt_println",
            range: wordRange,
          },
          {
            label: "fmt.Printf",
            kind: CompletionItemKind.Function,
            insertText: "fmt.Printf(\"${1:%v}\\n\", ${2:val})",
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: "0_fmt_printf",
            range: wordRange,
          }
        );
      }

      [
        "package", "import", "func", "return", "var", "const", "type", "struct",
        "interface", "if", "else", "for", "range", "defer", "go", "select", "chan"
      ].forEach((kw) => {
        items.push({
          label: kw,
          kind: CompletionItemKind.Keyword,
          insertText: kw,
          sortText: `1_${kw}`,
          range: wordRange,
        });
      });

      return { suggestions: items };
    },
  });
}

/**
 * Return language snippets for testing or external consumption.
 */
export function getLanguageSnippets(lang: string): { label: string; insertText: string; documentation?: string }[] {
  const normalized = lang.toLowerCase();

  switch (normalized) {
    case "c":
      return [
        { label: "main", insertText: "int main() {\n    return 0;\n}" },
        { label: "printf", insertText: 'printf("%s\\n", ...);' },
        { label: "scanf", insertText: 'scanf("%d", &var);' },
        { label: "for", insertText: "for (int i = 0; i < n; i++) {\n}" },
        { label: "while", insertText: "while (condition) {\n}" },
        { label: "malloc", insertText: "malloc(...)" },
        { label: "free", insertText: "free(ptr);" },
      ];
    case "cpp":
    case "c++":
      return [
        { label: "main", insertText: "int main() {\n    return 0;\n}" },
        { label: "cout", insertText: "cout << ... << endl;" },
        { label: "cin", insertText: "cin >> var;" },
        { label: "vector", insertText: "vector<int> v;" },
      ];
    case "python":
    case "py":
      return [
        { label: "print", insertText: "print(...)" },
        { label: "input", insertText: "input(...)" },
        { label: "def", insertText: "def fn():\n    pass" },
        { label: "class", insertText: "class Cls:\n    pass" },
      ];
    case "java":
      return [
        { label: "main", insertText: "public static void main(String[] args) {}" },
        { label: "sout", insertText: "System.out.println();" },
        { label: "scanner", insertText: "Scanner sc = new Scanner(System.in);" },
        { label: "Scanner", insertText: "Scanner sc = new Scanner(System.in);" },
      ];
    default:
      return [];
  }
}
