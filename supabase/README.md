# Supabase — Backend

> **Estado:** schema e edge functions NÃO estavam versionados. Este diretório é o destino.
> Gere os artefatos fiéis a partir do projeto real (ver comandos abaixo). O schema
> abaixo é **referência observada** (colunas vistas via REST), não substitui o `db pull`
> (que captura tipos exatos, defaults, constraints, índices e **RLS** — essenciais).

## Gerar artefatos fiéis
```bash
supabase login
supabase link --project-ref SEU_REF
supabase db pull                                  # → supabase/migrations/*.sql (schema + RLS)
supabase functions download tmdb-proxy            # → supabase/functions/tmdb-proxy/
supabase functions download verify-admin-password # → supabase/functions/verify-admin-password/
```

## Tabelas observadas (referência)
Confirmadas via REST nesta base (colunas vistas em uso pelo app):

### channels
`id` (uuid, pk) · `name` (text) · `logo` (text) · `category` (text) · `stream_url` (text) ·
`number` (int, nullable) · `is_premium` (bool) · `created_at` (timestamptz)
- Leitura anon (RLS) usada por `services/channelsFromSupabase.ts`.

### adult_streams
`id` (uuid, pk) · `title` (text) · `logo_url` (text, nullable) · `group_title` (text, nullable) ·
`stream_url` (text) · `source` (text, nullable) · `created_at` (timestamptz)
- Leitura anon (RLS) usada por `services/adultoService.ts`.

### adult_menu_sections
`id` · `slug` · `title` · `sort_order`

### adult_menu_items
`id` · `section_id` (fk sections) · `slug` · `label` · `icon` (nullable) · `target` (nullable) ·
`sort_order` · `enabled` (bool)

### adult_profile_verifications
`id` · `profile_id` · `user_id` · `birthdate` · `terms_version`
- Escrita autenticada; usada para gate de idade (`createAdultVerification`).

> Tabelas adicionais (catálogo VOD, settings, watchlist/watch_later, usuários/perfis) existem
> e são acessadas por `services/supabaseService.ts` / `userService.ts` / `catalogService.ts`.
> Capturar todas via `db pull`.

## Edge Functions
- **tmdb-proxy** — proxy TMDB com pool de tokens (round-robin/429). Chamada em `services/tmdb.ts`.
- **verify-admin-password** — valida senha do painel admin (secret `ADMIN_PASSWORD`). Chamada em login admin.
- (Adulto) verificação de PIN é via edge/Function de auth — confirmar nome no projeto.

Deploy: `npm run supabase:deploy-tmdb-fn` · `npm run supabase:deploy-admin-fn`.

## RLS — atenção
O app lê via **anon key** (REST). As policies de leitura anon (channels, adult_streams, menu)
são obrigatórias para o app receber dados. O `db pull` captura essas policies — sem elas, um
banco recriado do zero não serve conteúdo.
