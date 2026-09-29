import { createClient } from "@supabase/supabase-js";

// Zuup Auth Gateway (Cloudflare Worker & Hono proxy)
// Keeps database credentials secure at the edge while proxying /auth, /rest, and /storage.
export const ZUUP_AUTH_GATEWAY_URL =
  import.meta.env.VITE_ZUUP_AUTH_URL ??
  import.meta.env.VITE_SUPABASE_URL ??
  "https://auth.zuup.dev";

export const ZUUP_GATEWAY_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "zuup_gateway_secret";

export const supabase = createClient(ZUUP_AUTH_GATEWAY_URL, ZUUP_GATEWAY_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

