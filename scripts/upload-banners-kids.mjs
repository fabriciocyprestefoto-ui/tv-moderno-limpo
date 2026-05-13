/**
 * upload-banners-kids.mjs
 * Upload banners Kids (WebP) para Supabase Storage
 * e atualização do campo banner_url nas tabelas movies/series.
 *
 * Uso: node src_clean/scripts/upload-banners-kids.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variáveis de ambiente necessárias: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Defina-as no arquivo .env antes de executar este script.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BUCKET = 'banners';
const KIDS_DIR = path.resolve(__dirname, '..', 'kids');

// Mapeamento: nome do arquivo → título no banco + TMDB ID
const FILE_TO_DB_MAP = [
  { file: 'Luca.webp', title: 'Luca', table: 'movies', tmdb_id: 508943 },
  {
    file: 'Zootopia.webp',
    title: 'Zootopia: Essa Cidade é o Bicho',
    table: 'movies',
    tmdb_id: 269149,
  },
  {
    file: 'SpongeBob_SquarePants_The_Movie.webp',
    title: 'Bob Esponja: O Incrível Resgate',
    table: 'movies',
    tmdb_id: 618353,
  },
];

const TMDB_READ_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';

/** Busca logo, release, trailer do TMDB */
async function fetchTmdbMetadata(tmdbId, mediaType = 'movie') {
  const endpoint = mediaType === 'series' ? 'tv' : 'movie';
  try {
    const res = await fetch(
      `${TMDB_BASE}/${endpoint}/${tmdbId}?append_to_response=videos,images&language=pt-BR&include_image_language=pt-BR,pt,en,null`,
      { headers: { Authorization: `Bearer ${TMDB_READ_TOKEN}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const logos = data.images?.logos || [];
    const logo =
      logos.find((l) => l.iso_639_1 === 'pt-BR') ||
      logos.find((l) => l.iso_639_1 === 'pt') ||
      logos.find((l) => l.iso_639_1 === 'en');
    const logo_url = logo ? `${TMDB_IMAGE_BASE}${logo.file_path}` : null;

    const releaseDate = data.release_date || data.first_air_date || '';
    const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

    const videos = data.videos?.results || [];
    const trailer =
      videos.find(
        (v) =>
          v.type === 'Trailer' &&
          v.site === 'YouTube' &&
          (v.iso_639_1 === 'pt' || v.name?.toLowerCase().includes('dublado'))
      ) || videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
    const trailer_key = trailer?.key || null;
    const trailer_url = trailer_key ? `https://www.youtube.com/watch?v=${trailer_key}` : null;

    const description = data.overview || null;
    const rating = data.vote_average ? data.vote_average.toFixed(1) : null;

    return { logo_url, year, trailer_key, trailer_url, description, rating };
  } catch (err) {
    console.error(`   ⚠️  TMDB fetch falhou para ${tmdbId}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Upload banners KIDS + enriquecimento TMDB...\n');

  for (const entry of FILE_TO_DB_MAP) {
    const filePath = path.join(KIDS_DIR, entry.file);

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Arquivo não encontrado: ${entry.file}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `kids/${entry.file.toLowerCase()}`;

    // 1. Upload para Supabase Storage
    console.log(`📤 Uploading: ${entry.file} → banners/${storagePath}`);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: 'image/webp',
        upsert: true,
      });

    if (uploadError) {
      console.error(`   ❌ Upload falhou: ${uploadError.message}`);
      continue;
    }

    // 2. Gerar URL pública
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      console.error(`   ❌ Não foi possível gerar URL pública para ${entry.file}`);
      continue;
    }

    console.log(`   ✅ Banner URL: ${publicUrl}`);

    // 3. Buscar metadados do TMDB
    console.log(`   🎬 Buscando metadados TMDB para ${entry.title} (tmdb_id: ${entry.tmdb_id})...`);
    const tmdbMeta = await fetchTmdbMetadata(entry.tmdb_id);

    if (tmdbMeta) {
      console.log(`   📋 Logo: ${tmdbMeta.logo_url ? '✅' : '❌ não encontrada'}`);
      console.log(`   📅 Ano: ${tmdbMeta.year || 'N/A'}`);
      console.log(`   🎥 Trailer: ${tmdbMeta.trailer_key || 'N/A'}`);
    }

    // 4. Buscar no banco por tmdb_id
    const { data: existing, error: fetchError } = await supabase
      .from(entry.table)
      .select('id, title')
      .eq('tmdb_id', entry.tmdb_id)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error(`   ❌ Erro ao buscar ${entry.title}: ${fetchError.message}`);
      continue;
    }

    if (!existing) {
      console.warn(
        `   ⚠️  "${entry.title}" (tmdb_id: ${entry.tmdb_id}) não encontrado na tabela ${entry.table}. Upload feito, mas sem vínculo no DB.`
      );
      continue;
    }

    // 5. Montar update com banner_url + metadados TMDB
    const updateData = { banner_url: publicUrl };
    if (tmdbMeta) {
      if (tmdbMeta.logo_url) updateData.logo_url = tmdbMeta.logo_url;
      if (tmdbMeta.year) updateData.year = tmdbMeta.year;
      if (tmdbMeta.trailer_key) updateData.trailer_key = tmdbMeta.trailer_key;
      if (tmdbMeta.trailer_url) updateData.trailer_url = tmdbMeta.trailer_url;
      if (tmdbMeta.description) updateData.description = tmdbMeta.description;
      if (tmdbMeta.rating) updateData.rating = tmdbMeta.rating;
    }

    const { error: updateError } = await supabase
      .from(entry.table)
      .update(updateData)
      .eq('id', existing.id);

    if (updateError) {
      console.error(`   ❌ Erro ao atualizar: ${updateError.message}`);
    } else {
      console.log(`   🔗 Atualizado "${existing.title}" → banner_url + logo + release + trailer`);
    }

    console.log('');
  }

  console.log('✅ Upload de banners KIDS concluído!');
}

main().catch(console.error);
