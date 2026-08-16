-- Hint pool rows are written in the deployment locale (NEXT_PUBLIC_LOCALE).
-- The column lets the reader ignore rows of another language right after a
-- locale switch instead of serving them until the TTL expires.
ALTER TABLE "hints_cache" ADD COLUMN IF NOT EXISTS "locale" text NOT NULL DEFAULT 'ru';
