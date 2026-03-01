const PISTON_API = "https://emkc.org/api/v2/piston";

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

export async function executeCode(
  language: string,
  version: string,
  code: string
): Promise<{ output: string[]; success: boolean }> {
  try {
    const response = await fetch(`${PISTON_API}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language,
        version,
        files: [{ content: code }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Execution failed: ${response.status}`);
    }

    const data: PistonResponse = await response.json();
    const lines: string[] = [];

    if (data.compile?.stderr) {
      lines.push("Compilation errors:");
      lines.push(...data.compile.stderr.split("\n").filter(Boolean));
      return { output: lines, success: false };
    }

    if (data.run.stdout) {
      lines.push(...data.run.stdout.split("\n"));
      // Remove trailing empty line
      if (lines[lines.length - 1] === "") lines.pop();
    }

    if (data.run.stderr) {
      lines.push(...data.run.stderr.split("\n").filter(Boolean));
    }

    const success = data.run.code === 0;
    return { output: lines, success };
  } catch (err: any) {
    return {
      output: [`Error: ${err.message}`, "Check your internet connection or try again."],
      success: false,
    };
  }
}
