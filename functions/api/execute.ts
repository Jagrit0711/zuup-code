const PISTON_API = "https://emkc.org/api/v2/piston/execute";
const PISTON_AUTH_KEY = "ef4b83cc-396f-423c-80f7-4c12bec1fd2b";

type ExecuteRequestBody = {
  language?: string;
  version?: string;
  files?: Array<{ content?: string }>;
  stdin?: string;
};

export async function onRequest({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json(
      { message: "Method Not Allowed" },
      {
        status: 405,
        headers: { Allow: "POST" },
      }
    );
  }

  try {
    const { language, version, files, stdin } = (await request.json()) as ExecuteRequestBody;

    if (!language || !version || !files || !Array.isArray(files)) {
      return Response.json(
        {
          message: "Missing required fields: language, version, files",
        },
        { status: 400 }
      );
    }

    const pistonResponse = await fetch(PISTON_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: PISTON_AUTH_KEY,
      },
      body: JSON.stringify({
        language,
        version,
        files,
        ...(stdin !== undefined ? { stdin } : {}),
      }),
    });

    const data = await pistonResponse.json();

    return Response.json(data, {
      status: pistonResponse.status,
    });
  } catch (error: any) {
    console.error("Piston proxy error:", error);

    return Response.json(
      {
        message: "Failed to reach Piston API",
        error: error?.message ?? "Unknown error",
      },
      { status: 502 }
    );
  }
}