import type { LangData } from "./types";
import { snip } from "./types";
import { HASH_SYNTAX, L, SQL_SYNTAX } from "./shared";

export const sql: LangData = {
  id: "sql",
  syntax: SQL_SYNTAX,
  keywords:
    "SELECT FROM WHERE GROUP BY HAVING ORDER LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX VIEW DATABASE JOIN INNER LEFT RIGHT FULL OUTER CROSS ON USING AS AND OR NOT IN BETWEEN LIKE IS NULL DISTINCT UNION ALL EXISTS CASE WHEN THEN ELSE END ASC DESC PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT CHECK CONSTRAINT AUTO_INCREMENT WITH RECURSIVE OVER PARTITION TRUNCATE BEGIN COMMIT ROLLBACK TRANSACTION IF",
  types: "INT INTEGER BIGINT SMALLINT DECIMAL NUMERIC FLOAT DOUBLE REAL VARCHAR CHAR TEXT BOOLEAN DATE TIME TIMESTAMP DATETIME BLOB JSON UUID SERIAL",
  functions:
    "COUNT SUM AVG MIN MAX COALESCE NULLIF ROUND FLOOR CEIL ABS UPPER LOWER LENGTH SUBSTRING TRIM CONCAT REPLACE NOW CURRENT_DATE CURRENT_TIMESTAMP CAST EXTRACT DATE_TRUNC ROW_NUMBER RANK DENSE_RANK LAG LEAD STRING_AGG GROUP_CONCAT IFNULL",
  constants: "NULL TRUE FALSE",
  snippets: [
    snip("select", "SELECT query", L("SELECT ${1:*}", "FROM ${2:table}", "WHERE ${0:condition};")),
    snip("selectj", "SELECT with JOIN", L("SELECT ${1:a.*}, ${2:b.*}", "FROM ${3:table_a} a", "JOIN ${4:table_b} b ON b.${5:a_id} = a.${6:id}", "WHERE ${0:condition};")),
    snip("insert", "INSERT statement", L("INSERT INTO ${1:table} (${2:columns})", "VALUES (${0:values});")),
    snip("update", "UPDATE statement", L("UPDATE ${1:table}", "SET ${2:column} = ${3:value}", "WHERE ${0:condition};")),
    snip("delete", "DELETE statement", L("DELETE FROM ${1:table}", "WHERE ${0:condition};")),
    snip("create", "CREATE TABLE", L("CREATE TABLE ${1:table} (", "\tid INTEGER PRIMARY KEY,", "\t${0:name} VARCHAR(255) NOT NULL", ");")),
    snip("alter", "ALTER TABLE", "ALTER TABLE ${1:table} ADD COLUMN ${2:column} ${0:INTEGER};"),
    snip("index", "CREATE INDEX", "CREATE INDEX ${1:idx_name} ON ${2:table} (${0:column});"),
    snip("groupby", "GROUP BY", L("SELECT ${1:column}, COUNT(*)", "FROM ${2:table}", "GROUP BY ${1:column}", "ORDER BY COUNT(*) DESC;")),
    snip("cte", "Common table expression", L("WITH ${1:name} AS (", "\t${0:SELECT 1}", ")", "SELECT * FROM ${1:name};")),
    snip("case", "CASE expression", L("CASE", "\tWHEN ${1:condition} THEN ${2:result}", "\tELSE ${0:other}", "END")),
  ],
  decls: [
    { re: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([A-Za-z_]\w*)/i, kind: "class" },
    { re: /^\s*WITH\s+([A-Za-z_]\w*)\s+AS\b/i, kind: "class" },
    { re: /^\s*(?:ALTER\s+TABLE\s+\w+\s+ADD\s+(?:COLUMN\s+)?)([A-Za-z_]\w*)/i, kind: "property" },
    { re: /^\s{2,}[`"]?([A-Za-z_]\w*)[`"]?\s+(?:INT|INTEGER|BIGINT|SMALLINT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|VARCHAR|CHAR|TEXT|BOOLEAN|DATE|TIME|TIMESTAMP|DATETIME|BLOB|JSON|UUID|SERIAL)\b/i, kind: "property" },
  ],
  rules: [
    { re: /^(?:SELECT|select)$/, build: (m) => `${m[0]} \${1:*}\n${m[0] === "select" ? "from" : "FROM"} \${0:table};` },
    { re: /^(?:INSERT|insert)$/, build: (m) => (m[0] === "insert" ? "insert into ${1:table} (${2:columns})\nvalues (${0:values});" : "INSERT INTO ${1:table} (${2:columns})\nVALUES (${0:values});") },
  ],
};

export const yaml: LangData = {
  id: "yaml",
  explicitOnly: true,
  syntax: HASH_SYNTAX,
  keywords: "true false null yes no on off",
  snippets: [
    snip("list", "List of items", L("${1:key}:", "\t- ${2:item}", "\t- ${0:item}")),
    snip("map", "Nested mapping", L("${1:parent}:", "\t${2:key}: ${0:value}")),
    snip("anchor", "Anchor and alias", L("${1:base}: &${2:anchor}", "\t${3:key}: ${4:value}", "${5:derived}:", "\t<<: *${2:anchor}")),
    snip("multiline", "Block scalar", L("${1:key}: |", "\t${0:text}")),
    snip("compose", "Docker Compose service", L("services:", "\t${1:app}:", "\t\timage: ${2:image:tag}", "\t\tports:", "\t\t\t- \"${3:8080}:${4:80}\"")),
  ],
  decls: [{ re: /^\s*(?:-\s+)?([A-Za-z_][\w.-]*)\s*:(?:\s|$)/, kind: "property" }],
};

export const xml: LangData = {
  id: "xml",
  explicitOnly: true,
  syntax: { lineComments: [], blockComments: [["<!--", "-->"]], quotes: "" },
  snippets: [
    snip("xml", "XML declaration", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"),
    snip("element", "Element", L("<${1:tag}>", "\t${0}", "</${1:tag}>")),
    snip("attr", "Element with attribute", "<${1:tag} ${2:name}=\"${3:value}\">${0}</${1:tag}>"),
    snip("cdata", "CDATA section", "<![CDATA[${0}]]>"),
    snip("comment", "Comment", "<!-- ${0} -->"),
  ],
  rules: [
    { re: /^<\?x\w*$/, build: () => '<?xml version="1.0" encoding="UTF-8"?>' },
  ],
};

export const markdown: LangData = {
  id: "markdown",
  explicitOnly: true,
  syntax: { lineComments: [], blockComments: [["<!--", "-->"]], quotes: "" },
  snippets: [
    snip("link", "Link", "[${1:text}](${0:https://})"),
    snip("img", "Image", "![${1:alt}](${0:path})"),
    snip("code", "Fenced code block", L("```${1:js}", "${0}", "```")),
    snip("table", "Table", L("| ${1:Column} | ${2:Column} |", "| --- | --- |", "| ${3:Cell} | ${0:Cell} |")),
    snip("task", "Task list item", "- [ ] ${0}"),
    snip("bold", "Bold", "**${0}**"),
    snip("quote", "Blockquote", "> ${0}"),
    snip("hr", "Horizontal rule", "---"),
  ],
};
