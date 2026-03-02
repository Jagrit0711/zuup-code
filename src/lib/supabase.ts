import { createClient } from "@supabase/supabase-js";

// Shared Supabase project across all zuup.dev apps
// Proxied via Jiobase to bypass Supabase blocks in India
const SUPABASE_URL = "https://zuup.jiobase.com";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuYXB3dWtxaHliemlkdWh6cG93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNjA3ODYsImV4cCI6MjA4NzkzNjc4Nn0.x1a-lyiPhBDqR2U-ZAC_waSa-2smUs_KpSGXbK54rp0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
