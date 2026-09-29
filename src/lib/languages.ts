import { LucideIcon } from "lucide-react";

export interface LanguageConfig {
  id: string;
  label: string;
  monacoId: string;
  extension: string;
  defaultCode: string;
  pistonLang: string;
  pistonVersion: string;
}

export const languages: LanguageConfig[] = [
  {
    id: "python",
    label: "Python",
    monacoId: "python",
    extension: ".py",
    pistonLang: "python",
    pistonVersion: "3.10.0",
    defaultCode: `# Welcome to Zuup Code — Python
# Write your Python code here

def greet(name):
    return f"Hello, {name}! Welcome to Zuup Code"

print(greet("Engineer"))

# Try some math
for i in range(1, 6):
    print(f"{i} squared = {i**2}")
`,
  },
  {
    id: "c",
    label: "C",
    monacoId: "c",
    extension: ".c",
    pistonLang: "c",
    pistonVersion: "10.2.0",
    defaultCode: `// Welcome to Zuup Code — C
#include <stdio.h>

int main() {
    printf("Hello from Zuup Code!\\n");
    return 0;
}
`,
  },
  {
    id: "html",
    label: "HTML",
    monacoId: "html",
    extension: ".html",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Zuup Code</title>
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background: #0f1019;
      color: #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    h1 { color: #e63462; }
  </style>
</head>
<body>
  <div>
    <h1>Hello from Zuup Code!</h1>
    <p>Start building amazing things.</p>
  </div>
</body>
</html>
`,
  },
  {
    id: "css",
    label: "CSS",
    monacoId: "css",
    extension: ".css",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: `/* Zuup Code — CSS */

:root {
  --zuup-primary: #e63462;
  --zuup-bg: #0f1019;
  --zuup-text: #e0e0e0;
}

body {
  background-color: var(--zuup-bg);
  color: var(--zuup-text);
  font-family: 'Inter', sans-serif;
}

.btn-primary {
  background: var(--zuup-primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(230, 52, 98, 0.3);
}
`,
  },
  {
    id: "javascript",
    label: "JavaScript",
    monacoId: "javascript",
    extension: ".js",
    pistonLang: "javascript",
    pistonVersion: "18.15.0",
    defaultCode: `// Welcome to Zuup Code — JavaScript

const zuup = {
  name: "Zuup Code",
  version: "1.0",
  mission: "Real Engineering. Real Futures."
};

console.log(zuup.name + " v" + zuup.version);
console.log("Mission: " + zuup.mission);

const numbers = [1, 2, 3, 4, 5];
const squared = numbers.map(n => n ** 2);
console.log("Squared:", squared);
`,
  },
  {
    id: "typescript",
    label: "TypeScript",
    monacoId: "typescript",
    extension: ".ts",
    pistonLang: "typescript",
    pistonVersion: "5.0.3",
    defaultCode: `// Welcome to Zuup Code — TypeScript

interface Student {
  name: string;
  grade: number;
  skills: string[];
}

const student: Student = {
  name: "Zuup Engineer",
  grade: 10,
  skills: ["Arduino", "Python", "PCB Design"]
};

function introduce(s: Student): string {
  return s.name + " (Grade " + s.grade + ") - Skills: " + s.skills.join(", ");
}

console.log(introduce(student));
`,
  },
  {
    id: "java",
    label: "Java",
    monacoId: "java",
    extension: ".java",
    pistonLang: "java",
    pistonVersion: "15.0.2",
    defaultCode: `// Welcome to Zuup Code — Java

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Zuup Code!");
        
        int[] numbers = {1, 2, 3, 4, 5};
        for (int n : numbers) {
            System.out.println(n + " squared = " + (n * n));
        }
    }
}
`,
  },
  {
    id: "cpp",
    label: "C++",
    monacoId: "cpp",
    extension: ".cpp",
    pistonLang: "c++",
    pistonVersion: "10.2.0",
    defaultCode: `// Welcome to Zuup Code — C++

#include <iostream>
#include <vector>
#include <string>

int main() {
    std::cout << "Hello from Zuup Code!" << std::endl;
    
    std::vector<std::string> skills = {"Arduino", "Embedded C", "PCB Design"};
    
    for (const auto& skill : skills) {
        std::cout << "Skill: " << skill << std::endl;
    }
    
    return 0;
}
`,
  },
  {
    id: "rust",
    label: "Rust",
    monacoId: "rust",
    extension: ".rs",
    pistonLang: "rust",
    pistonVersion: "1.68.2",
    defaultCode: `// Welcome to Zuup Code — Rust

fn main() {
    println!("Hello from Zuup Code!");
    
    let skills = vec!["Embedded Systems", "Hardware", "IoT"];
    
    for (i, skill) in skills.iter().enumerate() {
        println!("{}. {}", i + 1, skill);
    }
}
`,
  },
  {
    id: "go",
    label: "Go",
    monacoId: "go",
    extension: ".go",
    pistonLang: "go",
    pistonVersion: "1.16.2",
    defaultCode: `// Welcome to Zuup Code — Go

package main

import "fmt"

func main() {
    fmt.Println("Hello from Zuup Code!")
    
    skills := []string{"IoT", "Hardware", "Embedded"}
    for i, skill := range skills {
        fmt.Printf("%d. %s\\n", i+1, skill)
    }
}
`,
  },
  {
    id: "plaintext",
    label: "Plain Text",
    monacoId: "plaintext",
    extension: ".txt",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: "",
  },
  {
    id: "csv",
    label: "CSV",
    monacoId: "plaintext",
    extension: ".csv",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: "",
  },
  {
    id: "markdown",
    label: "Markdown",
    monacoId: "markdown",
    extension: ".md",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: "",
  },
  {
    id: "json",
    label: "JSON",
    monacoId: "json",
    extension: ".json",
    pistonLang: "",
    pistonVersion: "",
    defaultCode: "{}",
  },
];

export function getLanguageById(id: string): LanguageConfig {
  return languages.find(l => l.id === id) || languages[0];
}

/**
 * Detect language configuration automatically from a filename's extension.
 */
export function detectLanguageFromFilename(fileName: string): LanguageConfig {
  const ext = fileName.includes(".") ? `.${fileName.split(".").pop()?.toLowerCase()}` : "";
  if (!ext) return getLanguageById("python");
  const found = languages.find(l => l.extension.toLowerCase() === ext);
  return found || getLanguageById("plaintext");
}

/**
 * Detects if a code string uses standard input functions (scanf, cin >>, input(), Scanner, etc.)
 */
export function detectNeedsStdin(code: string, lang: string): boolean {
  if (!code) return false;
  // Strip single-line & multi-line comments to avoid false positives
  const stripped = code
    .replace(/#.*/g, "")               // Python / bash comments
    .replace(/\/\/.*/g, "")            // JS/TS/Java/C++ line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // block comments

  const patterns: Record<string, RegExp[]> = {
    python:     [/\binput\s*\(/],
    javascript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    typescript: [/readline\s*\(/, /process\.stdin/, /createInterface\s*\(/],
    c:          [/\bscanf\s*\(/, /\bfgets\s*\(/, /\bgetchar\s*\(/],
    cpp:        [/\bscanf\s*\(/, /\bcin\s*>>/, /\bgetline\s*\(/, /\bgetchar\s*\(/],
    "c++":      [/\bscanf\s*\(/, /\bcin\s*>>/, /\bgetline\s*\(/, /\bgetchar\s*\(/],
    java:       [/\bScanner\b/, /\bBufferedReader\b/, /System\.in/],
    rust:       [/read_line\s*\(/, /std::io::stdin/],
    ruby:       [/\bgets\b/, /\breadline\b/, /\$stdin/],
    go:         [/fmt\.Scan/, /bufio\.NewScanner/],
    r:          [/\breadLines\b/, /\bscan\b/, /\breadline\b/],
  };

  const langPatterns = patterns[lang.toLowerCase()] ?? [];
  return langPatterns.some((p) => p.test(stripped));
}

