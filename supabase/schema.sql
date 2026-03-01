-- =============================================================
-- Zuup Code — Supabase Database Schema
-- =============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
--
-- IMPORTANT: Zuup uses a SHARED Supabase project across all
-- zuup.dev apps (time.zuup.dev, code.zuup.dev, etc.).
-- All tables below are prefixed with "code_" to avoid collisions.
--
-- ─── EXISTING TABLES (already in your DB — DO NOT RUN): ──────
--
--   public.profiles (
--     id              UUID  PK → auth.users(id) ON DELETE CASCADE
--     username        TEXT  UNIQUE, nullable
--     display_name    TEXT  nullable
--     avatar_url      TEXT  nullable
--     api_key         TEXT  UNIQUE, default 'zt_' || random uuid
--     is_public       BOOLEAN default true
--     email_notifications BOOLEAN default true
--     created_at      TIMESTAMPTZ default now()
--     updated_at      TIMESTAMPTZ default now()
--   )
--
--   public.projects (  ← used by time.zuup.dev / ZuupTime
--     id              UUID  PK  default gen_random_uuid()
--     user_id         UUID  FK → profiles(id) ON DELETE CASCADE
--     name            TEXT  NOT NULL
--     total_seconds   FLOAT default 0
--     last_heartbeat_at TIMESTAMPTZ
--     created_at      TIMESTAMPTZ default now()
--     updated_at      TIMESTAMPTZ default now()
--     UNIQUE(user_id, name)
--   )
--
-- ─── NEW TABLE FOR code.zuup.dev (RUN THIS): ────────────────
-- =============================================================

-- ─── 1. code_projects ────────────────────────────────────────
-- Stores each saved project/file for a user.
-- "files" is a JSONB array of { name, language, content } objects.
-- References profiles(id) — the shared user identity across all zuup apps.
--
CREATE TABLE IF NOT EXISTS code_projects (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL DEFAULT auth.uid(),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  language    TEXT NOT NULL DEFAULT 'python',
  files       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_public   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT code_projects_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_code_projects_user_id ON code_projects(user_id);
-- Index for public projects (community explore, future feature)
CREATE INDEX IF NOT EXISTS idx_code_projects_public ON code_projects(is_public) WHERE is_public = true;

-- ─── 2. Row Level Security (RLS) ────────────────────────────
-- Users can only see/edit their own projects.
-- Public projects are readable by anyone.

ALTER TABLE code_projects ENABLE ROW LEVEL SECURITY;

-- Users can read their own projects
CREATE POLICY "Users can read own code_projects"
  ON code_projects FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can read public projects
CREATE POLICY "Anyone can read public code_projects"
  ON code_projects FOR SELECT
  USING (is_public = true);

-- Users can insert their own projects
CREATE POLICY "Users can insert own code_projects"
  ON code_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own projects
CREATE POLICY "Users can update own code_projects"
  ON code_projects FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own projects
CREATE POLICY "Users can delete own code_projects"
  ON code_projects FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 3. Auto-update updated_at trigger ──────────────────────
-- (only creates if it doesn't already exist from another app)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_code_projects_updated_at
  BEFORE UPDATE ON code_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =============================================================
-- HOW ZUUP'S SHARED ACCOUNT SYSTEM WORKS:
-- =============================================================
--
-- Zuup uses ONE Supabase project for ALL zuup.dev subdomains.
--
-- Shared tables:
--   • auth.users       — Supabase-managed, shared auth identity
--   • public.profiles  — App-level user data, 1:1 with auth.users
--
-- Per-app tables (prefixed to avoid collisions):
--   • time.zuup.dev → public.projects (coding time tracking)
--   • code.zuup.dev → public.code_projects (saved code/files)
--   • giza.zuup.dev → its own prefixed tables
--
-- Foreign key chain:
--   code_projects.user_id → profiles.id → auth.users.id
--
-- This means a user MUST have a profiles row before they can
-- save code_projects. The AuthContext on code.zuup.dev ensures
-- a profile is upserted on every sign-in/sign-up.
--
-- The pattern:
--   1. All apps share the same SUPABASE_URL and ANON_KEY
--   2. Auth is shared (same user UUID everywhere)
--   3. public.profiles is the shared user record
--   4. Each app creates its own prefixed tables referencing profiles(id)
--   5. RLS policies use auth.uid() to restrict access
--   6. OAuth redirect URLs must be added for each subdomain:
--      - https://code.zuup.dev/**
--      - https://time.zuup.dev/**
--      in Supabase Dashboard → Auth → URL Configuration
-- =============================================================
