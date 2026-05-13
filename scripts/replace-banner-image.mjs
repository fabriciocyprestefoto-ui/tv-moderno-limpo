/**
 * replace-banner-image.mjs
 * Atualiza o banner WebP de um único item no Supabase Storage e nas tabelas `movies` / `home_banners`.
 * Uso: `node scripts/replace-banner-image.mjs <caminho/para/arquivo.webp> [tmdbId=541671] [storageName=ballerina.webp]`
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = requireSupabaseUrl();
const SUPABASE_SERVICE_KEY = requireServiceRoleKey();
const BUCKET = 'banners';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  const [imagePathArg, tmdbIdArg, storageNameArg] = process.argv.slice(2);
  if (!imagePathArg) {
    console.error(
      'Uso: node scripts/replace-banner-image.mjs <imagem.webp> [tmdbId] [storageName]'
    );
    process.exit(1);
  }

  const imagePath = path.resolve(process.cwd(), imagePathArg);
  if (!fs.existsSync(imagePath)) {
    console.error(`Arquivo não encontrado: ${imagePath}`);
    process.exit(1);
  }

  const tmdbId = Number(tmdbIdArg || '541671');
  if (!tmdbId || tmdbId <= 0) {
    console.error('tmdbId deve ser um número válido.');
    process.exit(1);
  }

  const storageName = storageNameArg || 'ballerina.webp';
  const storagePath = `${storageName}`;
  const buffer = fs.readFileSync(imagePath);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/webp', upsert: true });

  if (uploadError) {
    console.error('Falha no upload:', uploadError.message);
    process.exit(1);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    console.error('Não foi possível gerar URL pública.');
    process.exit(1);
  }

  console.log('Upload concluído →', publicUrl);

  const updateBanner = async () => {
    const { data: movie, error: movieErr } = await supabase
      .from('movies')
      .select('id,title')
      .eq('tmdb_id', tmdbId)
      .limit(1)
      .maybeSingle();

    if (movieErr) throw movieErr;
    if (!movie) throw new Error(`Filme tmdb_id=${tmdbId} não encontrado em movies.`);

    await supabase.from('movies').update({ banner_url: publicUrl }).eq('id', movie.id);

    const { error: homeErr } = await supabase
      .from('home_banners')
      .update({ banner_url: publicUrl })
      .eq('tmdb_id', tmdbId);

    if (homeErr) throw homeErr;

    console.log(`Atualizado: ${movie.title} (movies + home_banners).`);
  };

  try {
    await updateBanner();
    console.log('Banner substituído com sucesso.');
  } catch (err) {
    console.error('Erro ao atualizar o banco:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
