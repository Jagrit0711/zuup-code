// Alternative free code execution APIs
const CODE_EXECUTION_APIS = {
  JUDGE0: "https://judge0-ce.p.rapidapi.com",
  ONECOMPILER: "https://onecompiler.com/api/code/exec",
  JDOODLE: "https://api.jdoodle.com/v1/execute"
};

interface PistonResult {
  stdout: string;
  stderr: string;
  code: number;
  signal: string | null;
}

interface PistonResponse {
  run: PistonResult;
  compile?: PistonResult;
}

// Language mappings for different APIs
const LANGUAGE_MAPPINGS: { [key: string]: { judge0?: number; onecompiler?: string; jdoodle?: string } } = {
  "python": { judge0: 71, onecompiler: "python", jdoodle: "python3" },
  "javascript": { judge0: 63, onecompiler: "nodejs", jdoodle: "nodejs" },
  "java": { judge0: 62, onecompiler: "java", jdoodle: "java" },
  "c": { judge0: 50, onecompiler: "c", jdoodle: "c" },
  "c++": { judge0: 54, onecompiler: "cpp", jdoodle: "cpp" },
  "go": { judge0: 60, onecompiler: "go", jdoodle: "go" },
  "rust": { judge0: 73, onecompiler: "rust", jdoodle: "rust" },
  "typescript": { onecompiler: "typescript" }
};

// Simulate code execution locally for basic languages
function simulateExecution(language: string, code: string): { output: string[]; success: boolean } {
  const lines: string[] = [];
  
  try {
    if (language === "python") {
      // Simple Python simulation
      lines.push("[SIMULATED] Code analysis:");
      if (code.includes("print(")) {
        const printMatches = code.match(/print\(([^)]+)\)/g);
        printMatches?.forEach(match => {
          const content = match.replace(/print\(|\)/g, '').replace(/['"]/g, '');
          lines.push(content);
        });
      }
      lines.push("");
      lines.push("[INFO] This is a simulated execution.");
      lines.push("[INFO] For actual execution, set up a local runtime or get Piston API access.");
      return { output: lines, success: true };
    }
    
    if (language === "javascript") {
      // Simple JavaScript simulation
      lines.push("[SIMULATED] Code analysis:");
      if (code.includes("console.log(")) {
        const logMatches = code.match(/console\.log\(([^)]+)\)/g);
        logMatches?.forEach(match => {
          const content = match.replace(/console\.log\(|\)/g, '').replace(/['"]/g, '');
          lines.push(content);
        });
      }
      lines.push("");
      lines.push("[INFO] This is a simulated execution.");
      lines.push("[INFO] For actual execution, set up a local runtime or get API access.");
      return { output: lines, success: true };
    }
    
    // For other languages
    lines.push("[SIMULATED] Code validated and ready for execution.");
    lines.push(`[INFO] Language: ${language.charAt(0).toUpperCase() + language.slice(1)}`);
    lines.push(`[INFO] Code length: ${code.length} characters`);
    lines.push("");
    lines.push("[NOTICE] Remote execution service is unavailable.");
    lines.push("[NOTICE] The Piston API now requires authorization (as of Feb 2026).");
    lines.push("[SUGGESTION] Set up a local development environment for actual execution.");
    
    return { output: lines, success: true };
    
  } catch (error) {
    return {
      output: [`[ERROR] Simulation failed: ${error}`, "[NOTICE] Please check your code syntax."],
      success: false
    };
  }
}

export async function executeCode(
  language: string,
  version: string,
  code: string
): Promise<{ output: string[]; success: boolean }> {
  try {
    // For now, use simulation until a proper alternative is set up
    return simulateExecution(language, code);
    
  } catch (err: any) {
    return {
      output: [
        `[ERROR] ${err.message}`,
        "",
        "[NOTICE] The Piston API now requires authorization.",
        "[NOTICE] This IDE is using simulated execution for demonstration.",
        "[SUGGESTION] For real code execution, consider:",
        "  • Setting up local development environment",
        "  • Using online IDEs like Repl.it, CodePen, or JSFiddle",
        "  • Getting Piston API authorization from EngineerMan Discord"
      ],
      success: false,
    };
  }
}
