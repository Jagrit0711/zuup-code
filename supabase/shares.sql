-- =============================================================
-- Zuup Code — Shared Code/Projects Table
-- =============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- Creates a table for database-backed dynamic share links.
-- =============================================================

-- ─── 1. code_shares ─────────────────────────────────────────
-- Stores shared code snippets and projects with short IDs.
-- Anyone can view a share via /share/<id> — read-only.
--
CREATE TABLE IF NOT EXISTS code_shares (
  id          TEXT PRIMARY KEY,                       -- short random ID (8 chars)
  type        TEXT NOT NULL DEFAULT 'file'             -- 'file' or 'project'
    CHECK (type IN ('file', 'project')),
  title       TEXT NOT NULL DEFAULT 'Untitled',
  language    TEXT NOT NULL DEFAULT 'python',
  files       JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ name, language, content }]
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,  -- nullable (anon shares ok)
  views       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_code_shares_created_by ON code_shares(created_by);
CREATE INDEX IF NOT EXISTS idx_code_shares_created_at ON code_shares(created_at DESC);

-- ─── 2. Row Level Security ──────────────────────────────────
ALTER TABLE code_shares ENABLE ROW LEVEL SECURITY;

-- Anyone can READ any share (that's the point)
CREATE POLICY "Anyone can read code_shares"
  ON code_shares FOR SELECT
  USING (true);

-- Authenticated users can create shares
CREATE POLICY "Authenticated users can insert code_shares"
  ON code_shares FOR INSERT
  WITH CHECK (true);

-- Allow anonymous inserts too (for non-logged-in users)
-- This requires granting insert to anon role
-- The anon key already has these permissions via the policy above

-- Owners can delete their own shares
CREATE POLICY "Owners can delete own code_shares"
  ON code_shares FOR DELETE
  USING (auth.uid() = created_by);

-- ─── 3. Auto-increment views function ──────────────────────
CREATE OR REPLACE FUNCTION increment_share_views(share_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE code_shares SET views = views + 1 WHERE id = share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
