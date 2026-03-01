// Vercel Serverless Function — proxies code execution to Piston API
// This avoids CORS issues since the browser calls our own domain

const PISTON_API = "https://emkc.org/api/v2/piston/execute";
const PISTON_AUTH_KEY = "ef4b83cc-396f-423c-80f7-4c12bec1fd2b";

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    const { language, version, files } = req.body;

    // Validate required fields
    if (!language || !version || !files || !Array.isArray(files)) {
      return res.status(400).json({
        message: "Missing required fields: language, version, files",
      });
    }

    const pistonResponse = await fetch(PISTON_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: PISTON_AUTH_KEY,
      },
      body: JSON.stringify({ language, version, files }),
    });

    const data = await pistonResponse.json();

    // Forward the Piston response status and body
    return res.status(pistonResponse.status).json(data);
  } catch (error: any) {
    console.error("Piston proxy error:", error);
    return res.status(502).json({
      message: "Failed to reach Piston API",
      error: error.message,
    });
  }
}
