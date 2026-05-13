import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { requireSupabaseUrl, requireServiceRoleKey } from './supabase-env.mjs';

const supabaseUrl = requireSupabaseUrl();
const supabaseKey = requireServiceRoleKey();
const supabase = createClient(supabaseUrl, supabaseKey);

const files = [
  {
    local:
      'c:/Users/Fabricio/Downloads/devin-main/devin-main/src_clean/public/bannert/beastgames.jpg',
    bucket: 'posters',
    remote: 'beastgames.jpg',
  },
  {
    local:
      'c:/Users/Fabricio/Downloads/devin-main/devin-main/src_clean/public/bannert/bailarina.jpg',
    bucket: 'posters',
    remote: 'bailarina.jpg',
  },
  {
    local:
      'c:/Users/Fabricio/Downloads/devin-main/devin-main/src_clean/public/bannert/Prime_Video_BAILARINA_004 (1).png',
    bucket: 'logos',
    remote: 'ballerina-logo.png',
  },
  {
    local:
      'c:/Users/Fabricio/Downloads/devin-main/devin-main/src_clean/public/bannert/beastgame-kigi.png',
    bucket: 'logos',
    remote: 'beastgames-logo.png',
  },
];

async function uploadFiles() {
  for (const file of files) {
    console.log(`Uploading ${file.local}...`);
    if (!fs.existsSync(file.local)) {
      console.error(`File not found: ${file.local}`);
      continue;
    }
    const fileBuffer = fs.readFileSync(file.local);
    const { data, error } = await supabase.storage
      .from(file.bucket)
      .upload(file.remote, fileBuffer, {
        upsert: true,
        contentType: file.local.endsWith('.png') ? 'image/png' : 'image/jpeg',
      });

    if (error) {
      console.error(`Error uploading ${file.remote}:`, error.message);
    } else {
      console.log(`Successfully uploaded ${file.remote}`);
    }
  }
}

uploadFiles();
