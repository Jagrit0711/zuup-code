// Cloudflare Pages Function: GET /api/github/login
import { type OAuthEnv, handleLogin } from "../../../src/lib/github/oauthServer";

export async function onRequest({ request, env }: { request: Request; env: OAuthEnv }) {
  return handleLogin(request, env);
}
