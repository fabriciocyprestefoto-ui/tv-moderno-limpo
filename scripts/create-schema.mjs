/**
 * create-schema.mjs
 * Cria o schema do banco de dados diretamente via PostgreSQL (pg package).
 *
 * Uso: node scripts/create-schema.mjs <DB_PASSWORD>
 *
 * A senha do banco está no Supabase Dashboard em:
 * Settings → Database → Database Settings → Database password
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const PROJECT_REF = 'rqtzmgbduomwrhgrfsvp';
const DB_PASS = process.argv[2] || '7h8X%XpF.-f.X9z';

if (!DB_PASS) {
  console.error('❌ Forneça a senha do banco como argumento:');
  console.error('   node scripts/create-schema.mjs SUA_SENHA_AQUI');
  console.error('\n📍 Encontre a senha em:');
  console.error('   https://supabase.com/dashboard/project/rqtzmgbduomwrhgrfsvp/settings/database');
  process.exit(1);
}

// Conexão direta ao banco (porta 5432 — suporta DDL, sem pooler)
const connectionString = `postgresql://postgres:${encodeURIComponent(DB_PASS)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

const SCHEMA_SQL = `
-- ================================================================
-- REDFLIX — Schema
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- movies
CREATE TABLE IF NOT EXISTS public.movies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id       INTEGER,
  title         TEXT NOT NULL,
  original_title TEXT,
  description   TEXT,
  poster        TEXT,
  backdrop      TEXT,
  logo_url      TEXT,
  year          INTEGER,
  rating        NUMERIC(3,1),
  genre         TEXT[] DEFAULT '{}',
  stream_url    TEXT,
  video_url     TEXT,
  source_url    TEXT,
  trailer_url   TEXT,
  trailer_key   TEXT,
  use_trailer   BOOLEAN DEFAULT FALSE,
  platform      TEXT,
  stars         TEXT[] DEFAULT '{}',
  status        TEXT DEFAULT 'published',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS movies_tmdb_idx   ON public.movies(tmdb_id);
CREATE INDEX IF NOT EXISTS movies_year_idx   ON public.movies(year);
CREATE INDEX IF NOT EXISTS movies_status_idx ON public.movies(status);

-- series
CREATE TABLE IF NOT EXISTS public.series (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id       INTEGER,
  title         TEXT NOT NULL,
  original_title TEXT,
  description   TEXT,
  poster        TEXT,
  backdrop      TEXT,
  logo_url      TEXT,
  year          INTEGER,
  rating        NUMERIC(3,1),
  genre         TEXT[] DEFAULT '{}',
  stream_url    TEXT,
  video_url     TEXT,
  source_url    TEXT,
  trailer_url   TEXT,
  trailer_key   TEXT,
  use_trailer   BOOLEAN DEFAULT FALSE,
  platform      TEXT,
  stars         TEXT[] DEFAULT '{}',
  seasons_count INTEGER DEFAULT 0,
  status        TEXT DEFAULT 'published',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS series_tmdb_idx   ON public.series(tmdb_id);
CREATE INDEX IF NOT EXISTS series_year_idx   ON public.series(year);
CREATE INDEX IF NOT EXISTS series_status_idx ON public.series(status);

-- seasons
CREATE TABLE IF NOT EXISTS public.seasons (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id     UUID REFERENCES public.series(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  title         TEXT,
  description   TEXT,
  poster        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS seasons_series_idx ON public.seasons(series_id);

-- episodes
CREATE TABLE IF NOT EXISTS public.episodes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id      UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  duration       TEXT,
  stream_url     TEXT,
  video_url      TEXT,
  thumbnail      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS episodes_season_idx ON public.episodes(season_id);

-- channels
CREATE TABLE IF NOT EXISTS public.channels (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  logo        TEXT,
  category    TEXT,
  stream_url  TEXT NOT NULL,
  number      INTEGER,
  is_premium  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS channels_category_idx ON public.channels(category);

-- home_banners
CREATE TABLE IF NOT EXISTS public.home_banners (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tmdb_id    INTEGER,
  banner_url TEXT NOT NULL,
  ativo      BOOLEAN DEFAULT TRUE,
  ordem      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- catalog_settings
CREATE TABLE IF NOT EXISTS public.catalog_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  min_year        INTEGER DEFAULT 2010,
  max_year        INTEGER,
  selected_genres TEXT[] DEFAULT '{}',
  content_type    TEXT DEFAULT 'mixed',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.catalog_settings (id, min_year, content_type)
VALUES (1, 2010, 'mixed') ON CONFLICT (id) DO NOTHING;

-- user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  avatar_url       TEXT,
  avatar_color     TEXT DEFAULT '#E50914',
  is_kids          BOOLEAN DEFAULT FALSE,
  is_main          BOOLEAN DEFAULT FALSE,
  parental_rating  TEXT DEFAULT 'L',
  parental_pin     TEXT,
  parental_enabled BOOLEAN DEFAULT FALSE,
  auto_play_next   BOOLEAN DEFAULT TRUE,
  maturity_level   INTEGER DEFAULT 18,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS profiles_user_idx ON public.user_profiles(user_id);

-- watch_history
CREATE TABLE IF NOT EXISTS public.watch_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  media_id    TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  progress    NUMERIC(5,2) DEFAULT 0,
  duration    NUMERIC(10,2),
  completed   BOOLEAN DEFAULT FALSE,
  watched_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS history_user_idx  ON public.watch_history(user_id);
CREATE INDEX IF NOT EXISTS history_media_idx ON public.watch_history(media_id);

-- watchlist
CREATE TABLE IF NOT EXISTS public.watchlist (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  media_id    TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, profile_id, media_id)
);
CREATE INDEX IF NOT EXISTS watchlist_user_idx ON public.watchlist(user_id);

-- app_config
CREATE TABLE IF NOT EXISTS public.app_config (
  id               INTEGER PRIMARY KEY DEFAULT 1,
  logo_url         TEXT DEFAULT '/logored.webp',
  primary_color    TEXT DEFAULT '#E50914',
  secondary_color  TEXT DEFAULT '#B81D24',
  background_color TEXT DEFAULT '#141414'
);
INSERT INTO public.app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.movies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_banners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config      ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para usuários autenticados
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='movies' AND policyname='movies_read') THEN
    CREATE POLICY movies_read     ON public.movies     FOR SELECT TO authenticated USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='series' AND policyname='series_read') THEN
    CREATE POLICY series_read     ON public.series     FOR SELECT TO authenticated USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='seasons' AND policyname='seasons_read') THEN
    CREATE POLICY seasons_read    ON public.seasons    FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='episodes' AND policyname='episodes_read') THEN
    CREATE POLICY episodes_read   ON public.episodes   FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='channels_read') THEN
    CREATE POLICY channels_read   ON public.channels   FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='home_banners' AND policyname='banners_read') THEN
    CREATE POLICY banners_read    ON public.home_banners FOR SELECT TO authenticated USING (ativo = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalog_settings' AND policyname='settings_read') THEN
    CREATE POLICY settings_read   ON public.catalog_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_config' AND policyname='appconfig_read') THEN
    CREATE POLICY appconfig_read  ON public.app_config FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_profiles' AND policyname='profiles_read') THEN
    CREATE POLICY profiles_read   ON public.user_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE POLICY profiles_insert ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
    CREATE POLICY profiles_update ON public.user_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
    CREATE POLICY profiles_delete ON public.user_profiles FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watch_history' AND policyname='history_all') THEN
    CREATE POLICY history_all   ON public.watch_history FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watchlist' AND policyname='watchlist_all') THEN
    CREATE POLICY watchlist_all ON public.watchlist     FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
`;

async function main() {
  console.log('🔌 Conectando ao Supabase PostgreSQL...');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✅ Conectado!\n');
    console.log('📦 Criando schema (tabelas, índices, RLS)...');
    await client.query(SCHEMA_SQL);
    console.log('✅ Schema criado com sucesso!\n');
    console.log('🚀 Agora rode: node scripts/import-m3u.mjs');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    if (err.message.includes('password') || err.message.includes('auth')) {
      console.error('\n⚠️  Senha incorreta. Redefina em:');
      console.error(
        '   https://supabase.com/dashboard/project/rqtzmgbduomwrhgrfsvp/settings/database'
      );
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
