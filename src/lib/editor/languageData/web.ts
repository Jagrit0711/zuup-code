import type { LangData, SnippetDef } from "./types";
import { fileSnip, snip } from "./types";
import { JS_SYNTAX, L } from "./shared";

const JS_SNIPPETS: SnippetDef[] = [
  snip("clg", "console.log(...)", "console.log(${0});"),
  snip("cle", "console.error(...)", "console.error(${0});"),
  snip("ctb", "console.table(...)", "console.table(${0});"),
  snip("fn", "Function declaration", L("function ${1:name}(${2}) {", "\t${0}", "}")),
  snip("afn", "Async function", L("async function ${1:name}(${2}) {", "\t${0}", "}")),
  snip("arrow", "Arrow function", L("const ${1:name} = (${2}) => {", "\t${0}", "};")),
  snip("anon", "Anonymous arrow function", "(${1}) => ${0}"),
  snip("class", "Class", L("class ${1:Name} {", "\tconstructor(${2}) {", "\t\t${0}", "\t}", "}")),
  snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
  snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
  snip("for", "for loop", L("for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {", "\t${0}", "}")),
  snip("forof", "for...of loop", L("for (const ${1:item} of ${2:items}) {", "\t${0}", "}")),
  snip("forin", "for...in loop", L("for (const ${1:key} in ${2:object}) {", "\t${0}", "}")),
  snip("foreach", "Array.forEach", L("${1:items}.forEach((${2:item}) => {", "\t${0}", "});")),
  snip("map", "Array.map", "${1:items}.map((${2:item}) => ${0:item})"),
  snip("filter", "Array.filter", "${1:items}.filter((${2:item}) => ${0:true})"),
  snip("reduce", "Array.reduce", "${1:items}.reduce((${2:acc}, ${3:item}) => ${0:acc}, ${4:0})"),
  snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
  snip("switch", "switch statement", L("switch (${1:value}) {", "\tcase ${2:x}:", "\t\t${0}", "\t\tbreak;", "\tdefault:", "\t\tbreak;", "}")),
  snip("try", "try / catch", L("try {", "\t${1}", "} catch (${2:error}) {", "\t${0:console.error(${2:error});}", "}")),
  snip("promise", "new Promise", L("new Promise((resolve, reject) => {", "\t${0}", "})")),
  snip("fetch", "fetch JSON", L("const ${1:response} = await fetch(${2:url});", "const ${3:data} = await ${1:response}.json();")),
  snip("timeout", "setTimeout", L("setTimeout(() => {", "\t${0}", "}, ${1:1000});")),
  snip("interval", "setInterval", L("setInterval(() => {", "\t${0}", "}, ${1:1000});")),
  snip("req", "require", "const ${1:name} = require(\"${0:module}\");"),
  snip("imp", "import", "import ${1:name} from \"${0:module}\";"),
  snip("impn", "named import", "import { ${1:name} } from \"${0:module}\";"),
  snip("exp", "export default", "export default ${0};"),
  snip("rl", "readline on stdin", L("const readline = require(\"readline\");", "const rl = readline.createInterface({ input: process.stdin });", "rl.on(\"line\", (${1:line}) => {", "\t${0}", "});")),
  snip("qs", "document.querySelector", "document.querySelector(\"${0}\")"),
  snip("ael", "addEventListener", L("${1:element}.addEventListener(\"${2:click}\", (${3:event}) => {", "\t${0}", "});")),
];

const TS_SNIPPETS: SnippetDef[] = [
  snip("interface", "Interface", L("interface ${1:Name} {", "\t${0}", "}")),
  snip("type", "Type alias", "type ${1:Name} = ${0};"),
  snip("enum", "Enum", L("enum ${1:Name} {", "\t${0}", "}")),
  snip("tfn", "Typed function", L("function ${1:name}(${2:arg}: ${3:string}): ${4:void} {", "\t${0}", "}")),
  snip("tarrow", "Typed arrow function", L("const ${1:name} = (${2:arg}: ${3:string}): ${4:void} => {", "\t${0}", "};")),
  snip("generic", "Generic function", L("function ${1:name}<${2:T}>(${3:arg}: ${2:T}): ${2:T} {", "\t${0}", "}")),
];

const JS_DECLS = [
  { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, kind: "function" as const },
  { re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: "class" as const },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, kind: "variable" as const },
];

const jsRules = (ts: boolean) => [
  { re: /^(?:export )?(async )?function ([A-Za-z_$][\w$]*)$/, build: (m: RegExpExecArray) => `${m[0]}(\${1:}) {\n\t$0\n}` },
  {
    re: /^(?:export )?class ([A-Za-z_$][\w$]*)$/,
    build: (m: RegExpExecArray) => `${m[0]} {\n\tconstructor(\${1:}) {\n\t\t$0\n\t}\n}`,
  },
  { re: /^(?:export )?(?:const|let) ([A-Za-z_$][\w$]*) = (?:async )?\(([^)]*)\) =>$/, build: (m: RegExpExecArray) => `${m[0]} {\n\t$0\n}` },
  { re: /^import$/, build: () => 'import ${1:name} from "${0:module}";' },
  { re: /^(?:const|let) ([A-Za-z_$][\w$]*) = require\($/, build: (m: RegExpExecArray) => `${m[0]}"\${0:${m[1]}}");` },
  ...(ts
    ? [{ re: /^(?:export )?(?:interface|enum) ([A-Za-z_$][\w$]*)$/, build: (m: RegExpExecArray) => `${m[0]} {\n\t$0\n}` }]
    : []),
];

const jsBlocks = [
  { opener: /^\s*for\s*\(\s*(?:let|var)\s+(\w+)\s*=.*\)\s*\{\s*$/, build: (m: RegExpExecArray) => `console.log(${m[1]});` },
  { opener: /^\s*for\s*\(\s*(?:const|let)\s+(\w+)\s+of\b.*\)\s*\{\s*$/, build: (m: RegExpExecArray) => `console.log(${m[1]});` },
  { opener: /^\s*(?:[\w.]+)\.forEach\(\s*\(?(\w+)\)?\s*=>\s*\{\s*$/, build: (m: RegExpExecArray) => `console.log(${m[1]});` },
];

export const javascript: LangData = {
  id: "javascript",
  syntax: JS_SYNTAX,
  service: true,
  snippets: JS_SNIPPETS,
  modules: "fs path os http https url util events stream crypto child_process readline assert buffer zlib",
  decls: JS_DECLS,
  rules: jsRules(false),
  blocks: jsBlocks,
};

export const typescript: LangData = {
  id: "typescript",
  syntax: JS_SYNTAX,
  service: true,
  snippets: [...JS_SNIPPETS, ...TS_SNIPPETS],
  modules: javascript.modules,
  decls: [
    ...JS_DECLS,
    { re: /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/, kind: "class" as const },
    { re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/, kind: "type" as const },
  ],
  rules: jsRules(true),
  blocks: jsBlocks,
};

export const html: LangData = {
  id: "html",
  syntax: { lineComments: [], blockComments: [["<!--", "-->"]], quotes: "" },
  service: true,
  snippets: [
    fileSnip("html5", "HTML5 document", L("<!DOCTYPE html>", "<html lang=\"${1:en}\">", "<head>", "\t<meta charset=\"UTF-8\">", "\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">", "\t<title>${2:Document}</title>", "</head>", "<body>", "\t${0}", "</body>", "</html>")),
    snip("link:css", "Stylesheet link", "<link rel=\"stylesheet\" href=\"${0:style.css}\">"),
    snip("script:src", "External script", "<script src=\"${0:script.js}\"></script>"),
    snip("script", "Inline script", L("<script>", "\t${0}", "</script>")),
    snip("style", "Inline style", L("<style>", "\t${0}", "</style>")),
    snip("a:link", "Anchor", "<a href=\"${1:#}\">${0}</a>"),
    snip("img", "Image", "<img src=\"${1}\" alt=\"${0}\">"),
    snip("ul:li", "Unordered list", L("<ul>", "\t<li>${0}</li>", "</ul>")),
    snip("table", "Table", L("<table>", "\t<thead>", "\t\t<tr>", "\t\t\t<th>${1}</th>", "\t\t</tr>", "\t</thead>", "\t<tbody>", "\t\t<tr>", "\t\t\t<td>${0}</td>", "\t\t</tr>", "\t</tbody>", "</table>")),
    snip("form", "Form", L("<form action=\"${1}\" method=\"${2:post}\">", "\t${0}", "</form>")),
    snip("input", "Input with label", "<label for=\"${1:id}\">${2:Label}</label>\n<input type=\"${3:text}\" id=\"${1:id}\" name=\"${1:id}\">"),
    snip("button", "Button", "<button type=\"${1:button}\">${0}</button>"),
    snip("div", "Div", L("<div class=\"${1}\">", "\t${0}", "</div>")),
  ],
};

export const css: LangData = {
  id: "css",
  syntax: { lineComments: [], blockComments: [["/*", "*/"]], quotes: "\"'" },
  service: true,
  snippets: [
    snip("flex", "Flex container", L("display: flex;", "align-items: ${1:center};", "justify-content: ${0:center};")),
    snip("grid", "Grid container", L("display: grid;", "grid-template-columns: ${1:repeat(3, 1fr)};", "gap: ${0:1rem};")),
    snip("center", "Center with flexbox", L("display: flex;", "align-items: center;", "justify-content: center;")),
    snip("media", "Media query", L("@media (max-width: ${1:768px}) {", "\t${0}", "}")),
    snip("keyframes", "Keyframes", L("@keyframes ${1:name} {", "\tfrom {", "\t\t${2}", "\t}", "\tto {", "\t\t${0}", "\t}", "}")),
    snip("root", "Custom properties", L(":root {", "\t--${1:color}: ${0:#000};", "}")),
    snip("transition", "Transition", "transition: ${1:all} ${2:0.2s} ${0:ease};"),
    snip("reset", "Box-sizing reset", L("*,", "*::before,", "*::after {", "\tbox-sizing: border-box;", "\tmargin: 0;", "}")),
  ],
};

export const json: LangData = {
  id: "json",
  explicitOnly: true,
  syntax: { lineComments: ["//"], blockComments: [["/*", "*/"]], quotes: '"' },
  service: true,
  snippets: [
    snip("object", "Object", L("{", "\t\"${1:key}\": ${0:\"value\"}", "}")),
    snip("array", "Array", "[\n\t${0}\n]"),
  ],
};

export const php: LangData = {
  id: "php",
  syntax: { lineComments: ["//", "#"], blockComments: [["/*", "*/"]], quotes: "\"'" },
  keywords:
    "abstract and as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield",
  types: "int float string bool array object mixed void null callable iterable self static Exception InvalidArgumentException RuntimeException DateTime ArrayObject",
  functions:
    "echo print_r var_dump printf sprintf count strlen strpos str_replace substr strtolower strtoupper trim explode implode array_map array_filter array_reduce array_merge array_keys array_values array_push array_pop array_slice in_array array_key_exists sort usort rsort ksort json_encode json_decode isset empty unset intval floatval abs max min round floor ceil sqrt pow rand mt_rand file_get_contents file_put_contents fopen fclose date time microtime sleep die exit is_array is_string is_int is_numeric is_null str_contains str_starts_with str_ends_with ucfirst number_format preg_match preg_replace",
  constants: "true false null PHP_EOL PHP_INT_MAX __FILE__ __DIR__ __LINE__ $this",
  snippets: [
    snip("php", "PHP open tag", L("<?php", "", "${0}")),
    snip("function", "Function", L("function ${1:name}(${2}) {", "\t${0}", "}")),
    snip("class", "Class", L("class ${1:Name}", "{", "\tpublic function __construct(${2})", "\t{", "\t\t${0}", "\t}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("for", "for loop", L("for (\\$${1:i} = 0; \\$${1:i} < ${2:n}; \\$${1:i}++) {", "\t${0}", "}")),
    snip("foreach", "foreach loop", L("foreach (\\$${1:items} as \\$${2:item}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (\\$${1:value}) {", "\tcase ${2:x}:", "\t\t${0}", "\t\tbreak;", "\tdefault:", "\t\tbreak;", "}")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch (${2:Exception} \\$${3:e}) {", "\t${0}", "}")),
    snip("echo", "echo", "echo ${0};"),
    snip("pr", "print_r", "print_r(${0});"),
    snip("vd", "var_dump", "var_dump(${0});"),
    snip("fn", "Arrow function", "fn(${1:\\$x}) => ${0}"),
  ],
  decls: [
    { re: /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*\$([A-Za-z_]\w*)\s*=(?!=)/, kind: "variable" },
    { re: /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:readonly\s+)?(?:[\w?]+\s+)?\$([A-Za-z_]\w*)/, kind: "property" },
    { re: /^\s*const\s+([A-Za-z_]\w*)/, kind: "constant" },
  ],
  rules: [
    { re: /^function ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}(\${1:}) {\n\t$0\n}` },
    { re: /^class ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}\n{\n\t$0\n}` },
    { re: /^<\?p?h?p?$/, build: () => "<?php\n\n$0" },
  ],
};
