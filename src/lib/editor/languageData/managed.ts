import type { LangData } from "./types";
import { snip } from "./types";
import { C_SYNTAX, L, TYPED_VARIABLE } from "./shared";

const JAVA_FN_DECL = {
  re: /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native|default|override|async|virtual|internal)\s+)*(?!return\b|new\b|else\b|throw\b)[A-Za-z_][\w<>,[\]?.\s]*?\s+([A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:throws\s+[\w.,\s]+)?\s*(?:\{|=>|$)/,
  kind: "function" as const,
};

export const java: LangData = {
  id: "java",
  syntax: { ...C_SYNTAX, multilineQuotes: ['"""'] },
  keywords:
    "abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try var void volatile while record sealed permits yield",
  types:
    "String Object Integer Long Double Float Boolean Character Byte Short Math System List ArrayList LinkedList Map HashMap TreeMap LinkedHashMap Set HashSet TreeSet Queue Deque ArrayDeque PriorityQueue Stack Optional Scanner BufferedReader InputStreamReader Arrays Collections Random StringBuilder Thread Runnable Exception RuntimeException IOException int long double float boolean char byte short",
  constants: "true false null this super",
  snippets: [
    snip("main", "public static void main", L("public static void main(String[] args) {", "\t${0}", "}")),
    snip("class", "Class", L("public class ${1:Name} {", "\t${0}", "}")),
    snip("mainclass", "Class with main method", L("public class ${1:Main} {", "\tpublic static void main(String[] args) {", "\t\t${0:System.out.println(\"Hello, World!\");}", "\t}", "}")),
    snip("interface", "Interface", L("public interface ${1:Name} {", "\t${0}", "}")),
    snip("sout", "System.out.println", "System.out.println(${0});"),
    snip("souf", "System.out.printf", "System.out.printf(\"${1:%d}%n\", ${0:value});"),
    snip("serr", "System.err.println", "System.err.println(${0});"),
    snip("scanner", "Scanner on stdin", "Scanner ${1:sc} = new Scanner(System.in);"),
    snip("br", "BufferedReader on stdin", "BufferedReader ${1:br} = new BufferedReader(new InputStreamReader(System.in));"),
    snip("for", "for loop", L("for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {", "\t${0}", "}")),
    snip("foreach", "enhanced for loop", L("for (${1:String} ${2:item} : ${3:items}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (${1:value}) {", "\tcase ${2:x}:", "\t\t${0}", "\t\tbreak;", "\tdefault:", "\t\tbreak;", "}")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch (${2:Exception} ${3:e}) {", "\t${0:e.printStackTrace();}", "}")),
    snip("method", "Method", L("public ${1:void} ${2:name}(${3}) {", "\t${0}", "}")),
    snip("psvm", "public static void method", L("public static ${1:void} ${2:name}(${3}) {", "\t${0}", "}")),
    snip("list", "ArrayList declaration", "List<${1:Integer}> ${2:list} = new ArrayList<>();"),
    snip("map", "HashMap declaration", "Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();"),
    snip("imp", "import", "import ${0:java.util.*};"),
  ],
  members: {
    "System.out": "println() print() printf() format() flush()",
    System: "out in err currentTimeMillis() nanoTime() exit() getProperty() lineSeparator() arraycopy()",
    Math: "abs() max() min() pow() sqrt() floor() ceil() round() random() PI E sin() cos() log() floorMod() hypot()",
    Arrays: "toString() sort() fill() asList() copyOf() copyOfRange() equals() stream() deepToString() binarySearch()",
    Collections: "sort() reverse() max() min() shuffle() unmodifiableList() emptyList() swap()",
    Integer: "parseInt() valueOf() toString() MAX_VALUE MIN_VALUE compare() toBinaryString() bitCount()",
    Long: "parseLong() valueOf() MAX_VALUE MIN_VALUE",
    Double: "parseDouble() valueOf() compare() MAX_VALUE isNaN()",
    String: "valueOf() format() join()",
    Character: "isDigit() isLetter() isUpperCase() isLowerCase() toUpperCase() toLowerCase() getNumericValue()",
    List: "of() copyOf()",
  },
  genericMembers:
    "length() charAt() substring() indexOf() equals() equalsIgnoreCase() toUpperCase() toLowerCase() trim() split() contains() startsWith() endsWith() replace() isEmpty() size() add() get() set() put() remove() getOrDefault() containsKey() keySet() values() entrySet() push() pop() peek() poll() offer() hashCode() toString() append() reverse() sort() stream() forEach()",
  modules:
    "java.util.* java.util.List java.util.ArrayList java.util.Map java.util.HashMap java.util.Scanner java.util.Arrays java.io.* java.io.BufferedReader java.io.InputStreamReader java.util.stream.Collectors java.util.function.Function java.math.BigInteger java.math.BigDecimal",
  decls: [
    JAVA_FN_DECL,
    { re: /^\s*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/, kind: "class" },
    TYPED_VARIABLE,
  ],
  rules: [
    { re: /^(?:public )?class ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} {\n\t$0\n}` },
    { re: /^public static void m\w*$/, build: () => "public static void main(String[] args) {\n\t$0\n}" },
    { re: /^import ([\w.]*)$/, build: (m) => (m[1].startsWith("java") ? null : "import java.util.*;") },
    { re: /^System\.out\.p\w*$/, build: () => "System.out.println(${0});" },
  ],
  blocks: [
    { opener: /^\s*public\s+static\s+void\s+main\s*\(.*\)\s*\{\s*$/, build: () => 'System.out.println("Hello, World!");' },
    { opener: /^\s*for\s*\(\s*int\s+(\w+)\s*=.*\)\s*\{\s*$/, build: (m) => `System.out.println(${m[1]});` },
  ],
};

export const csharp: LangData = {
  id: "csharp",
  syntax: C_SYNTAX,
  keywords:
    "abstract as async await base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly record ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using var virtual void volatile while yield get set init required",
  types:
    "string int long short byte sbyte uint ulong ushort float double decimal bool char object dynamic Console Math String List Dictionary HashSet Queue Stack Array Tuple Task Action Func IEnumerable IList IDictionary Exception DateTime TimeSpan Guid StringBuilder Random Convert Environment File Path Enumerable",
  constants: "true false null this base",
  snippets: [
    snip("main", "static void Main", L("static void Main(string[] args)", "{", "\t${0}", "}")),
    snip("class", "Class", L("public class ${1:Name}", "{", "\t${0}", "}")),
    snip("program", "Console program", L("using System;", "", "class ${1:Program}", "{", "\tstatic void Main(string[] args)", "\t{", "\t\t${0:Console.WriteLine(\"Hello, World!\");}", "\t}", "}")),
    snip("interface", "Interface", L("public interface ${1:IName}", "{", "\t${0}", "}")),
    snip("cw", "Console.WriteLine", "Console.WriteLine(${0});"),
    snip("cr", "Console.ReadLine", "var ${1:line} = Console.ReadLine();"),
    snip("for", "for loop", L("for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++)", "{", "\t${0}", "}")),
    snip("foreach", "foreach loop", L("foreach (var ${1:item} in ${2:items})", "{", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition})", "{", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition})", "{", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (${1:value})", "{", "\tcase ${2:x}:", "\t\t${0}", "\t\tbreak;", "\tdefault:", "\t\tbreak;", "}")),
    snip("try", "try / catch", L("try", "{", "\t${1}", "}", "catch (${2:Exception} ${3:ex})", "{", "\t${0:Console.WriteLine(${3:ex}.Message);}", "}")),
    snip("prop", "Auto property", "public ${1:int} ${2:Name} { get; set; }"),
    snip("method", "Method", L("public ${1:void} ${2:Name}(${3})", "{", "\t${0}", "}")),
    snip("list", "List declaration", "var ${1:list} = new List<${2:int}>();"),
    snip("dict", "Dictionary declaration", "var ${1:map} = new Dictionary<${2:string}, ${3:int}>();"),
    snip("linq", "LINQ query", "${1:items}.Where(${2:x} => ${3:true}).Select(${2:x} => ${0:x})"),
  ],
  members: {
    Console: "WriteLine() Write() ReadLine() ReadKey() Clear() ForegroundColor ResetColor() Error In Out",
    Math: "Abs() Max() Min() Pow() Sqrt() Floor() Ceiling() Round() PI E Sin() Cos() Log() Truncate()",
    String: "Join() Format() IsNullOrEmpty() IsNullOrWhiteSpace() Concat() Empty",
    Convert: "ToInt32() ToDouble() ToString() ToBoolean() ToInt64()",
    Environment: "NewLine Exit() GetEnvironmentVariable() CurrentDirectory",
    DateTime: "Now UtcNow Today Parse() TryParse()",
    int: "Parse() TryParse() MaxValue MinValue",
    Enumerable: "Range() Repeat() Empty()",
    File: "ReadAllText() WriteAllText() ReadAllLines() Exists() AppendAllText()",
  },
  genericMembers:
    "Length Count Add Remove Contains ContainsKey TryGetValue Clear Insert IndexOf ToString ToUpper ToLower Trim Split Substring Replace StartsWith EndsWith Equals Sort Reverse ToList ToArray Select Where First Last Any All Sum Max Min OrderBy Keys Values",
  modules: "System System.Collections.Generic System.Linq System.Text System.IO System.Threading System.Threading.Tasks System.Numerics",
  decls: [
    JAVA_FN_DECL,
    { re: /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial)\s+)*(?:class|interface|enum|struct|record)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*namespace\s+([A-Za-z_][\w.]*)/, kind: "module" },
    { re: /^\s*(?:public|private|protected|internal)?\s*(?:static\s+)?[A-Za-z_][\w<>,[\]?]*\s+([A-Za-z_]\w*)\s*\{\s*get/, kind: "property" },
    TYPED_VARIABLE,
  ],
  rules: [
    { re: /^(?:public )?class ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}\n{\n\t$0\n}` },
    { re: /^using S\w*$/, build: () => "using System;" },
    { re: /^static void M\w*$/, build: () => "static void Main(string[] args)\n{\n\t$0\n}" },
    { re: /^Console\.W\w*$/, build: () => "Console.WriteLine(${0});" },
  ],
  blocks: [
    { opener: /^\s*static\s+void\s+Main\s*\(.*\)\s*\{?\s*$/, build: () => null },
    { opener: /^\s*for\s*\(\s*int\s+(\w+)\s*=.*\)\s*\{\s*$/, build: (m) => `Console.WriteLine(${m[1]});` },
  ],
};

export const kotlin: LangData = {
  id: "kotlin",
  syntax: { ...C_SYNTAX, multilineQuotes: ['"""'] },
  keywords:
    "abstract annotation as break by catch class companion const constructor continue crossinline data delegate do dynamic else enum expect external final finally for fun get if import in infix init inline inner interface internal is lateinit noinline object open operator out override package private protected public reified return sealed set super suspend tailrec this throw try typealias val var vararg when where while",
  types: "Int Long Short Byte Float Double Boolean Char String Any Unit Nothing Array List MutableList Map MutableMap Set MutableSet Pair Triple Sequence Result Exception",
  functions: "println print readLine readln listOf mutableListOf mapOf mutableMapOf setOf mutableSetOf arrayOf emptyList require check error lazy repeat run let apply also with to maxOf minOf",
  constants: "true false null this super it",
  snippets: [
    snip("main", "fun main()", L("fun main() {", "\t${0}", "}")),
    snip("mainargs", "fun main(args)", L("fun main(args: Array<String>) {", "\t${0}", "}")),
    snip("fun", "Function", L("fun ${1:name}(${2}): ${3:Unit} {", "\t${0}", "}")),
    snip("class", "Class", L("class ${1:Name}(${2}) {", "\t${0}", "}")),
    snip("data", "Data class", "data class ${1:Name}(val ${2:id}: ${3:Int})"),
    snip("object", "Object", L("object ${1:Name} {", "\t${0}", "}")),
    snip("interface", "Interface", L("interface ${1:Name} {", "\t${0}", "}")),
    snip("if", "if expression", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("for", "for loop", L("for (${1:i} in ${2:0 until n}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("when", "when expression", L("when (${1:value}) {", "\t${2:x} -> ${3}", "\telse -> ${0}", "}")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch (e: ${2:Exception}) {", "\t${0}", "}")),
    snip("pl", "println", "println(${0})"),
    snip("readln", "Read a line", "val ${1:line} = readln()"),
  ],
  members: {
    Math: "abs() max() min() pow() sqrt() floor() ceil() PI",
    String: "format() valueOf()",
    kotlin: "math io collections text",
  },
  genericMembers:
    "length size get set add remove contains isEmpty isNotEmpty first last map filter forEach joinToString toString trim split substring toInt toDouble sorted reversed let apply also",
  modules: "kotlin.math.* kotlin.collections.* kotlin.io.* kotlin.text.* java.util.* java.io.*",
  decls: [
    { re: /^\s*(?:(?:private|public|internal|protected|override|open|abstract|inline|suspend|operator|infix|tailrec)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:(?:private|public|internal|protected|open|abstract|sealed|data|enum|inner|annotation)\s+)*(?:class|interface|object)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:(?:private|public|internal|protected|override|lateinit|const)\s+)*(?:val|var)\s+([A-Za-z_]\w*)/, kind: "variable" },
  ],
  rules: [
    { re: /^fun ([A-Za-z_]\w*)$/, build: (m) => (m[1] === "main" ? "fun main() {\n\t$0\n}" : `${m[0]}(\${1:}) {\n\t$0\n}`) },
    { re: /^(?:data |open |abstract )?class ([A-Za-z_]\w*)$/, build: (m) => (m[0].startsWith("data") ? `${m[0]}(val \${1:id}: \${2:Int})` : `${m[0]} {\n\t$0\n}`) },
  ],
  blocks: [{ opener: /^\s*fun\s+main\s*\(.*\)\s*\{\s*$/, build: () => 'println("Hello, World!")' }],
};

export const swift: LangData = {
  id: "swift",
  syntax: { ...C_SYNTAX, multilineQuotes: ['"""'] },
  keywords:
    "actor any as associatedtype async await break case catch class continue convenience default defer deinit do else enum extension fallthrough fileprivate final for func guard if import in indirect init inout internal is lazy let mutating nonmutating open operator override private protocol public repeat required rethrows return self Self static struct subscript super switch throw throws try typealias var weak where while willSet didSet get set",
  types: "Int Int8 Int16 Int32 Int64 UInt UInt8 UInt16 UInt32 UInt64 Float Double Bool String Character Array Dictionary Set Optional Result Any AnyObject Void Date Data URL Error",
  functions: "print readLine debugPrint min max abs zip stride sorted map filter reduce fatalError precondition assert dump swap",
  constants: "true false nil self super",
  snippets: [
    snip("func", "Function", L("func ${1:name}(${2}) -> ${3:Void} {", "\t${0}", "}")),
    snip("class", "Class", L("class ${1:Name} {", "\t${0}", "}")),
    snip("struct", "Struct", L("struct ${1:Name} {", "\t${0}", "}")),
    snip("enum", "Enum", L("enum ${1:Name} {", "\tcase ${0:value}", "}")),
    snip("protocol", "Protocol", L("protocol ${1:Name} {", "\t${0}", "}")),
    snip("ext", "Extension", L("extension ${1:Type} {", "\t${0}", "}")),
    snip("if", "if statement", L("if ${1:condition} {", "\t${0}", "}")),
    snip("iflet", "if let", L("if let ${1:value} = ${2:optional} {", "\t${0}", "}")),
    snip("guard", "guard statement", L("guard ${1:condition} else {", "\t${0:return}", "}")),
    snip("for", "for-in loop", L("for ${1:item} in ${2:items} {", "\t${0}", "}")),
    snip("fori", "for loop over a range", L("for ${1:i} in 0..<${2:n} {", "\t${0}", "}")),
    snip("while", "while loop", L("while ${1:condition} {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch ${1:value} {", "case ${2:x}:", "\t${3}", "default:", "\t${0}", "}")),
    snip("do", "do / catch", L("do {", "\t${1:try ${2:call()}}", "} catch {", "\t${0:print(error)}", "}")),
    snip("print", "print", "print(${0})"),
    snip("import", "import Foundation", "import ${0:Foundation}"),
  ],
  modules: "Foundation SwiftUI UIKit Combine Dispatch",
  decls: [
    { re: /^\s*(?:(?:public|private|fileprivate|internal|open|static|class|final|override|mutating|@\w+)\s+)*func\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:(?:public|private|fileprivate|internal|open|final|indirect)\s+)*(?:class|struct|enum|protocol|actor|extension)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:(?:public|private|fileprivate|internal|static|lazy|weak)\s+)*(?:let|var)\s+([A-Za-z_]\w*)/, kind: "variable" },
  ],
  rules: [
    { re: /^func ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}(\${1:}) {\n\t$0\n}` },
    { re: /^(?:class|struct|enum|protocol) ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} {\n\t$0\n}` },
    { re: /^import F\w*$/, build: () => "import Foundation" },
  ],
};

export const dart: LangData = {
  id: "dart",
  syntax: { ...C_SYNTAX, quotes: "\"'", multilineQuotes: ['"""', "'''"], charLiterals: false },
  keywords:
    "abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return sealed set show static super switch sync this throw true try typedef var void while with yield",
  types: "int double num String bool List Map Set Iterable Future Stream Object dynamic Duration DateTime Exception Error Function Symbol Type Runes StringBuffer",
  functions: "print runApp main",
  constants: "true false null this super",
  snippets: [
    snip("main", "void main()", L("void main() {", "\t${0}", "}")),
    snip("class", "Class", L("class ${1:Name} {", "\t${0}", "}")),
    snip("fun", "Function", L("${1:void} ${2:name}(${3}) {", "\t${0}", "}")),
    snip("afun", "Async function", L("Future<${1:void}> ${2:name}(${3}) async {", "\t${0}", "}")),
    snip("if", "if statement", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("ifelse", "if / else", L("if (${1:condition}) {", "\t${2}", "} else {", "\t${0}", "}")),
    snip("for", "for loop", L("for (var ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {", "\t${0}", "}")),
    snip("forin", "for-in loop", L("for (final ${1:item} in ${2:items}) {", "\t${0}", "}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("switch", "switch statement", L("switch (${1:value}) {", "\tcase ${2:x}:", "\t\t${0}", "\t\tbreak;", "\tdefault:", "}")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch (${2:e}) {", "\t${0}", "}")),
    snip("print", "print", "print(${0});"),
    snip("import", "import", "import '${0:dart:math}';"),
  ],
  members: {
    Math: "max() min() sqrt() pow() sin() cos() pi e Random",
    stdout: "write() writeln()",
  },
  modules: "dart:math dart:io dart:async dart:convert dart:collection dart:core",
  decls: [
    JAVA_FN_DECL,
    { re: /^\s*(?:abstract\s+)?(?:class|mixin|enum|extension)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:final|const|late|var)\s+(?:[A-Za-z_][\w<>,?]*\s+)?([A-Za-z_]\w*)\s*(?:=|;)/, kind: "variable" },
    TYPED_VARIABLE,
  ],
  rules: [
    { re: /^class ([A-Za-z_]\w*)$/, build: (m) => `${m[0]} {\n\t$0\n}` },
    { re: /^void m\w*$/, build: () => "void main() {\n\t$0\n}" },
  ],
  blocks: [{ opener: /^\s*void\s+main\s*\(.*\)\s*\{\s*$/, build: () => "print('Hello, World!');" }],
};

export const scala: LangData = {
  id: "scala",
  syntax: { ...C_SYNTAX, multilineQuotes: ['"""'], charLiterals: true },
  keywords:
    "abstract case catch class def do else enum export extends final finally for forSome given if implicit import lazy match new object override package private protected return sealed super then this throw trait try type using val var while with yield",
  types: "Int Long Short Byte Float Double Boolean Char String Unit Any AnyRef AnyVal Nothing Null List Vector Seq Set Map Array Option Some None Either Left Right Try Success Failure Future",
  functions: "println print readLine readInt require assert Some Left Right",
  constants: "true false null this super None Nil",
  snippets: [
    snip("main", "def main", L("def main(args: Array[String]): Unit = {", "\t${0}", "}")),
    snip("object", "Object", L("object ${1:Name} {", "\t${0}", "}")),
    snip("app", "Object extending App", L("object ${1:Main} extends App {", "\t${0:println(\"Hello, World!\")}", "}")),
    snip("class", "Class", L("class ${1:Name}(${2}) {", "\t${0}", "}")),
    snip("case", "Case class", "case class ${1:Name}(${0:id: Int})"),
    snip("trait", "Trait", L("trait ${1:Name} {", "\t${0}", "}")),
    snip("def", "Method", L("def ${1:name}(${2}): ${3:Unit} = {", "\t${0}", "}")),
    snip("if", "if expression", L("if (${1:condition}) {", "\t${0}", "}")),
    snip("for", "for comprehension", L("for {", "\t${1:x} <- ${2:items}", "} yield ${0:x}")),
    snip("while", "while loop", L("while (${1:condition}) {", "\t${0}", "}")),
    snip("match", "match expression", L("${1:value} match {", "\tcase ${2:pattern} => ${3}", "\tcase _ => ${0}", "}")),
    snip("try", "try / catch", L("try {", "\t${1}", "} catch {", "\tcase e: ${2:Exception} => ${0}", "}")),
    snip("pl", "println", "println(${0})"),
  ],
  decls: [
    { re: /^\s*(?:(?:private|protected|override|final|implicit|inline)\s+)*def\s+([A-Za-z_]\w*)/, kind: "function" },
    { re: /^\s*(?:(?:private|protected|final|sealed|abstract|case|implicit)\s+)*(?:class|object|trait|enum)\s+([A-Za-z_]\w*)/, kind: "class" },
    { re: /^\s*(?:(?:private|protected|override|final|lazy|implicit)\s+)*(?:val|var)\s+([A-Za-z_]\w*)/, kind: "variable" },
  ],
  rules: [
    { re: /^def ([A-Za-z_]\w*)$/, build: (m) => `${m[0]}(\${1:}) = {\n\t$0\n}` },
    { re: /^(?:case )?(?:class|object|trait) ([A-Za-z_]\w*)$/, build: (m) => (m[0].startsWith("case") ? `${m[0]}(\${1:id: Int})` : `${m[0]} {\n\t$0\n}`) },
  ],
};
