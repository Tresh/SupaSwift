-- =====================================================================
-- SupaSwift — migration 0002: per-check detail payloads
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Stores the raw service-level health report for each check so the
-- detail view can show the full report and offer a raw copy.
-- =====================================================================

alter table public.health_checks
  add column if not exists details jsonb;
