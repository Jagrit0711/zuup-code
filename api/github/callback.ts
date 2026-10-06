// Vercel Serverless Function: GET /api/github/callback
import { handleCallback } from "../../src/lib/github/oauthServer.js";
import { type NodeRequestLike, type NodeResponseLike, sendWebResponse, toWebRequest } from "../../src/lib/github/nodeAdapter.js";

export default async function handler(req: NodeRequestLike, res: NodeResponseLike) {
  const env = process.env as Record<string, string | undefined>;
  await sendWebResponse(res, await handleCallback(toWebRequest(req), env));
}
