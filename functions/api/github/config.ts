// Cloudflare Pages Function: GET /api/github/config
import { type OAuthEnv, handleConfig } from "../../../src/lib/github/oauthServer";

export async function onRequest({ request, env }: { request: Request; env: OAuthEnv }) {
  return handleConfig(request, env);
}
