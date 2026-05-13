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
const FILE_PATH = path.resolve(__dirname, '..', 'imagem_convertida.webp');
const STORAGE_PATH = 'ballerina.webp';

async function main() {
  console.log('🚀 Uploading Ballerina banner...');

  if (!fs.existsSync(FILE_PATH)) {
    console.error('❌ File not found:', FILE_PATH);
    return;
  }

  const fileBuffer = fs.readFileSync(FILE_PATH);

  // 1. Upload
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(STORAGE_PATH, fileBuffer, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    return;
  }

  // 2. Get Public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(STORAGE_PATH);

  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    console.error('❌ Failed to get public URL');
    return;
  }

  console.log('✅ Public URL:', publicUrl);

  // 3. Update Database (Ballerina TMDB ID is 541671)
  const { data, error: updateError } = await supabase
    .from('movies')
    .update({ banner_url: publicUrl })
    .eq('tmdb_id', 541671);

  if (updateError) {
    console.error('❌ DB Update failed:', updateError.message);
  } else {
    console.log('✅ DB updated for Ballerina');
  }
}

main().catch(console.error);
