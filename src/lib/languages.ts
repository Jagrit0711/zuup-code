export interface LanguageConfig {
  id: string;
  label: string;
  monacoId: string;
  icon: string;
  extension: string;
  defaultCode: string;
}

export const languages: LanguageConfig[] = [
  {
    id: "python",
    label: "Python",
    monacoId: "python",
    icon: "🐍",
    extension: ".py",
    defaultCode: `# Welcome to Zuup Code — Python
# Write your Python code here

def greet(name):
    return f"Hello, {name}! Welcome to Zuup Code 🚀"

print(greet("Engineer"))

# Try some math
for i in range(1, 6):
    print(f"{i} squared = {i**2}")
`,
  },
  {
    id: "c",
    label: "C (Arduino)",
    monacoId: "c",
    icon: "⚡",
    extension: ".c",
    defaultCode: `// Welcome to Zuup Code — C / Arduino
// Write your C or Arduino code here

#include <stdio.h>

// Simulated Arduino setup
void setup() {
    printf("Zuup Code initialized!\\n");
    printf("LED on pin 13 ready.\\n");
}

void loop() {
    printf("Blink!\\n");
}

int main() {
    setup();
    for (int i = 0; i < 3; i++) {
        loop();
    }
    return 0;
}
`,
  },
  {
    id: "html",
    label: "HTML",
    monacoId: "html",
    icon: "🌐",
    extension: ".html",
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
    <h1>Hello from Zuup Code! 🚀</h1>
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
    icon: "🎨",
    extension: ".css",
    defaultCode: `/* Zuup Code — CSS */
/* Style your components here */

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

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
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
    icon: "⚙️",
    extension: ".js",
    defaultCode: `// Welcome to Zuup Code — JavaScript
// Write your JavaScript code here

const zuup = {
  name: "Zuup Code",
  version: "1.0",
  mission: "Real Engineering. Real Futures."
};

console.log(\`🚀 \${zuup.name} v\${zuup.version}\`);
console.log(\`Mission: \${zuup.mission}\`);

// Array methods
const numbers = [1, 2, 3, 4, 5];
const squared = numbers.map(n => n ** 2);
console.log("Squared:", squared);

// Async example
async function fetchData() {
  console.log("Fetching data...");
  await new Promise(r => setTimeout(r, 1000));
  console.log("Data loaded! ✅");
}

fetchData();
`,
  },
  {
    id: "typescript",
    label: "TypeScript",
    monacoId: "typescript",
    icon: "🔷",
    extension: ".ts",
    defaultCode: `// Welcome to Zuup Code — TypeScript
// Write your TypeScript code here

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
  return \`\${s.name} (Grade \${s.grade}) — Skills: \${s.skills.join(", ")}\`;
}

console.log(introduce(student));
`,
  },
  {
    id: "java",
    label: "Java",
    monacoId: "java",
    icon: "☕",
    extension: ".java",
    defaultCode: `// Welcome to Zuup Code — Java

public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Zuup Code! 🚀");
        
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
    icon: "🔧",
    extension: ".cpp",
    defaultCode: `// Welcome to Zuup Code — C++

#include <iostream>
#include <vector>
#include <string>

int main() {
    std::cout << "Hello from Zuup Code! 🚀" << std::endl;
    
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
    icon: "🦀",
    extension: ".rs",
    defaultCode: `// Welcome to Zuup Code — Rust

fn main() {
    println!("Hello from Zuup Code! 🚀");
    
    let skills = vec!["Embedded Systems", "Hardware", "IoT"];
    
    for (i, skill) in skills.iter().enumerate() {
        println!("{}. {}", i + 1, skill);
    }
}
`,
  },
];

export function getLanguageById(id: string): LanguageConfig {
  return languages.find(l => l.id === id) || languages[0];
}
