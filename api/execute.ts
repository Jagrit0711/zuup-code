// Vercel Serverless Function — proxies code execution to Piston API
// This avoids CORS issues since the browser calls our own domain

const PISTON_API = "https://emkc.org/api/v2/piston/execute";
const PISTON_AUTH_KEY = "ef4b83cc-396f-423c-80f7-4c12bec1fd2b";

interface VercelRequest {
  method?: string;
  body: {
    language?: string;
    version?: string;
    files?: unknown;
    stdin?: unknown;
    args?: unknown;
  };
}

interface VercelResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): void };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { language, version, files, stdin, args } = req.body;

    // Validate required fields
    if (!language || !version || !files || !Array.isArray(files)) {
      return res.status(400).json({
        message: "Missing required fields: language, version, files",
      });
    }

    const pistonPayload: Record<string, unknown> = { language, version, files };
    if (typeof stdin === "string") {
      pistonPayload.stdin = stdin;
    }
    if (Array.isArray(args)) {
      pistonPayload.args = args;
    }

    const pistonResponse = await fetch(PISTON_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: PISTON_AUTH_KEY,
      },
      body: JSON.stringify(pistonPayload),
    });

    const data = await pistonResponse.json();

    // Forward the Piston response status and body
    return res.status(pistonResponse.status).json(data);
  } catch (error: unknown) {
    console.error("Piston proxy error:", error);
    return res.status(502).json({
      message: "Failed to reach Piston API",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
