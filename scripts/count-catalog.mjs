import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://rqtzmgbduomwrhgrfsvp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdHptZ2JkdW9td3JoZ3Jmc3ZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDY1NDQyMCwiZXhwIjoyMDkwMjMwNDIwfQ.85fwYAK6O4lDv0TX1i0C5w0eR6ASQlWCy_-sZQG8Z8g";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const [movies2015, series2015] = await Promise.all([
    supabase.from('movies').select('*', { count: 'exact', head: true }).gte('year', 2015),
    supabase.from('series').select('*', { count: 'exact', head: true }).gte('year', 2015),
  ]);

  const [seasons, episodes] = await Promise.all([
    supabase.from('seasons').select('*', { count: 'exact', head: true }),
    supabase.from('episodes').select('*', { count: 'exact', head: true })
  ]);
  
  const { data: oneSeries } = await supabase.from('series').select('*').limit(1);

  console.log(`Filmes (2015+): ${movies2015.count}`);
  console.log(`Séries (2015+): ${series2015.count}`);
  console.log(`Tabela 'seasons': ${seasons?.count ?? '0'} registros`);
  console.log(`Tabela 'episodes': ${episodes?.count ?? '0'} registros`);
  console.log('\nExemplo de colunas de uma série para ver se os episódios estão embutidos:');
  console.log(oneSeries && oneSeries.length > 0 ? Object.keys(oneSeries[0]).join(', ') : 'Nenhuma série');
}

check().catch(console.error);
