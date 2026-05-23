import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rqtzmgbduomwrhgrfsvp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdHptZ2JkdW9td3JoZ3Jmc3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY1NDQyMCwiZXhwIjoyMDkwMjMwNDIwfQ.85fwYAK6O4lDv0TX1i0C5w0eR6ASQlWCy_-sZQG8Z8g";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkZGIxYmRmNmFhOTFiZGYzMzU3OTc4NTM4ODRiMGMxZCIsIm5iZiI6MTc1NzgyNzc4NS42NTI5OTk5LCJzdWIiOiI2OGM2NTJjOWExMzU0OWNiMTljOGZkNTQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.MRN49ZNLLIcrO-jeU9lcJUetiI8fZ5rkJl0a81RAb5U";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEADERS_TMDB = { accept: 'application/json', Authorization: `Bearer ${TMDB_TOKEN}` };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbFetch(path, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`https://api.themoviedb.org/3${path}`, { headers: HEADERS_TMDB });
      if (r.status === 429) {
        await sleep(3000);
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      if (i === retries - 1) return null;
      await sleep(1000);
    }
  }
  return null;
}

async function syncEpisodes() {
  console.log('Buscando séries a partir de 2015 no banco de dados...');
  
  let allSeries = [];
  let from = 0;
  const pageSize = 1000;
  while(true) {
    const { data, error } = await supabase
      .from('series')
      .select('id, tmdb_id, title, year')
      .not('tmdb_id', 'is', null)
      .gte('year', 2015)
      .order('year', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allSeries.push(...data);
    from += pageSize;
  }
  
  console.log(`Encontradas ${allSeries.length} séries para processar (2015+).`);

  let countSeasons = 0;
  let countEpisodes = 0;

  for (let i = 0; i < allSeries.length; i++) {
    const series = allSeries[i];
    console.log(`[${i+1}/${allSeries.length}] ${series.title} (${series.year})`);
    
    // Check if we already synced this series
    const { count } = await supabase.from('seasons').select('*', { count: 'exact', head: true }).eq('series_id', series.id);
    if (count && count > 0) {
      console.log(`   - Já sincronizada. Pulando.`);
      continue;
    }

    const details = await tmdbFetch(`/tv/${series.tmdb_id}?language=pt-BR`);
    if (!details || !details.seasons) {
       await sleep(100);
       continue;
    }

    for (const season of details.seasons) {
      if (season.season_number === 0) continue; // Pula "Especiais"

      const { data: insertedSeason, error: seasonError } = await supabase.from('seasons').insert({
        series_id: series.id,
        season_number: season.season_number,
        title: season.name || `Temporada ${season.season_number}`,
        description: season.overview || '',
        poster: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : null,
      }).select('id').single();

      if (seasonError || !insertedSeason) {
        console.error(`   ! Erro temporada ${season.season_number}:`, seasonError?.message);
        continue;
      }
      countSeasons++;

      const seasonDetails = await tmdbFetch(`/tv/${series.tmdb_id}/season/${season.season_number}?language=pt-BR`);
      if (!seasonDetails || !seasonDetails.episodes) continue;

      const episodesToInsert = seasonDetails.episodes.map((ep) => ({
        season_id: insertedSeason.id,
        episode_number: ep.episode_number,
        title: ep.name || `Episódio ${ep.episode_number}`,
        description: ep.overview || '',
        duration: ep.runtime ? `${ep.runtime} min` : null,
        thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
        stream_url: null
      }));

      if (episodesToInsert.length > 0) {
        const { error: epError } = await supabase.from('episodes').insert(episodesToInsert);
        if (epError) {
          console.error(`   ! Erro episódios:`, epError.message);
        } else {
          countEpisodes += episodesToInsert.length;
        }
      }
      
      await sleep(150);
    }
    
    await sleep(200);
  }

  console.log(`\n🎉 Sincronização parcial concluída!`);
  console.log(`Temporadas inseridas: ${countSeasons}`);
  console.log(`Episódios inseridos: ${countEpisodes}`);
}

syncEpisodes().catch(console.error);
