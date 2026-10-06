// Vercel Serverless Function: GET /api/github/config
import { handleConfig } from "../../src/lib/github/oauthServer.js";
import { type NodeRequestLike, type NodeResponseLike, sendWebResponse, toWebRequest } from "../../src/lib/github/nodeAdapter.js";

export default async function handler(req: NodeRequestLike, res: NodeResponseLike) {
  const env = process.env as Record<string, string | undefined>;
  await sendWebResponse(res, await handleConfig(toWebRequest(req), env));
}
