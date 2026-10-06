// Cloudflare Pages Function: GET /api/github/callback
import { type OAuthEnv, handleCallback } from "../../../src/lib/github/oauthServer";

export async function onRequest({ request, env }: { request: Request; env: OAuthEnv }) {
  return handleCallback(request, env);
}
