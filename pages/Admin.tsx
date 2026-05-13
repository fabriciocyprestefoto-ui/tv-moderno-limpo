import React, { useState } from 'react';
import { supabase } from '../services/supabaseService';
import { logger } from '../utils/logger';

interface UploadStats {
  movies: number;
  series: number;
  channels: number;
}

export default function Admin() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [stats, setStats] = useState<UploadStats>({ movies: 0, series: 0, channels: 0 });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage('');
    }
  };

  const parseM3U = (content: string) => {
    const lines = content.split('\n');
    const channels: any[] = [];
    const movies: any[] = [];
    const series: any[] = [];

    let currentItem: any = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#EXTINF:')) {
        // Parse EXTINF line
        const nameMatch = line.match(/,(.+)$/);
        const logoMatch = line.match(/tvg-logo="([^"]+)"/);
        const groupMatch = line.match(/group-title="([^"]+)"/);

        // Extrair ano do título se houver (ex: "Filme (2023)")
        const yearMatch = nameMatch ? nameMatch[1].match(/\((\d{4})\)/) : null;
        const release = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

        currentItem = {
          nome: nameMatch ? nameMatch[1].trim() : '',
          logo: logoMatch ? logoMatch[1] : '',
          genero: groupMatch ? groupMatch[1] : '',
          ano: release,
        };
      } else if (line.startsWith('http')) {
        currentItem.url = line;

        // Determinar tipo baseado no grupo
        const genero = currentItem.genero?.toLowerCase() || '';

        if (genero.includes('filme') || genero.includes('movie')) {
          movies.push({
            title: currentItem.nome,
            poster: currentItem.logo,
            logo_url: currentItem.logo, // Usar logo da lista também como logo
            genre: [currentItem.genero],
            stream_url: currentItem.url,
            year: currentItem.ano,
            description: `Lançamento: ${currentItem.ano} - Gênero: ${currentItem.genero}`,
            status: 'draft', // Default to draft
          });
        } else if (
          genero.includes('série') ||
          genero.includes('series') ||
          genero.includes('serie')
        ) {
          series.push({
            title: currentItem.nome,
            poster: currentItem.logo,
            logo_url: currentItem.logo,
            genre: [currentItem.genero],
            year: currentItem.ano,
            description: `Série de ${currentItem.ano} - Gênero: ${currentItem.genero}`,
            status: 'draft',
          });
        } else {
          channels.push(currentItem);
        }

        currentItem = {};
      }
    }

    return { channels, movies, series };
  };

  const parseJSON = (content: string) => {
    const data = JSON.parse(content);
    const channels: any[] = [];
    const movies: any[] = [];
    const series: any[] = [];

    const mapItem = (item: any) => {
      const type =
        item.type ||
        item.media_type ||
        (item.seasons
          ? 'series'
          : item.duration || item.stream_url || item.url
            ? 'movie'
            : 'channel');

      if (type === 'movie') {
        movies.push({
          title: item.cleanTitle || item.title || item.name || item.nome || 'Sem Título',
          tmdb_id: parseInt(item.tmdb_id || item.id_tmdb || item.id) || null,
          description: item.description || item.overview || item.desc || item.sinopse || '',
          rating: String(item.rating || item.vote_average || item.classification || ''),
          year:
            parseInt(
              item.year ||
                item.ano ||
                (item.release_date ? item.release_date.substring(0, 4) : null)
            ) || new Date().getFullYear(),
          duration: item.duration || item.tempo || '',
          genre: Array.isArray(item.genres || item.genre || item.genero)
            ? item.genres || item.genre || item.genero
            : item.category || item.group_title || item.genre || item.genero
              ? [item.category || item.group_title || item.genre || item.genero]
              : [],
          backdrop: item.backdrop_path || item.backdrop || item.fanart || item.background || '',
          poster: item.poster_path || item.poster || item.capa || item.image || '',
          logo_url: item.logo_url || item.logo || item.icon || '',
          stars: Array.isArray(item.stars || item.atores) ? item.stars || item.atores : [],
          trailer_key: item.trailer_key || item.trailer || '',
          stream_url: item.stream_url || item.url || item.link || item.play_url || '',
        });
      } else if (type === 'series') {
        series.push({
          title: item.cleanTitle || item.title || item.name || item.nome || 'Sem Título',
          tmdb_id: parseInt(item.tmdb_id || item.id_tmdb || item.id) || null,
          description: item.description || item.overview || item.desc || item.sinopse || '',
          rating: String(item.rating || item.vote_average || item.classification || ''),
          year:
            parseInt(
              item.year ||
                item.ano ||
                (item.first_air_date ? item.first_air_date.substring(0, 4) : null) ||
                (item.release_date ? item.release_date.substring(0, 4) : null)
            ) || new Date().getFullYear(),
          seasons: parseInt(item.seasons || item.temporadas) || 1,
          genre: Array.isArray(item.genres || item.genre || item.genero)
            ? item.genres || item.genre || item.genero
            : item.category || item.group_title || item.genre || item.genero
              ? [item.category || item.group_title || item.genre || item.genero]
              : [],
          backdrop: item.backdrop_path || item.backdrop || item.fanart || item.background || '',
          poster: item.poster_path || item.poster || item.capa || item.image || '',
          logo_url: item.logo_url || item.logo || item.icon || '',
          stars: Array.isArray(item.stars || item.atores) ? item.stars || item.atores : [],
          trailer_key: item.trailer_key || item.trailer || '',
        });
      } else {
        channels.push({
          nome: item.nome || item.name || item.title || item.cleanTitle || 'Canal Sem Nome',
          logo: item.logo || item.icon || item.image || item.logo_url || '',
          genero: item.genero || item.genre || item.category || item.group || 'Geral',
          url: item.url || item.link || item.stream || item.play_url || '',
        });
      }
    };

    // Detectar estrutura do JSON
    if (Array.isArray(data)) {
      data.forEach(mapItem);
    } else if (data.items && Array.isArray(data.items)) {
      data.items.forEach(mapItem);
    } else {
      if (Array.isArray(data.channels))
        data.channels.forEach((item: any) => mapItem({ ...item, type: 'channel' }));
      if (Array.isArray(data.movies))
        data.movies.forEach((item: any) => mapItem({ ...item, type: 'movie' }));
      if (Array.isArray(data.series))
        data.series.forEach((item: any) => mapItem({ ...item, type: 'series' }));

      // Caso seja um objeto único com propriedades de mídia
      if (!data.channels && !data.movies && !data.series && !data.items) {
        mapItem(data);
      }
    }

    return { channels, movies, series };
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Por favor, selecione um arquivo');
      return;
    }

    setLoading(true);
    setProgress(0);
    setCurrentStep('Lendo arquivo...');
    setMessage('');

    try {
      const content = await file.text();
      logger.log('📄 Arquivo lido:', file.name);
      setProgress(10);
      setCurrentStep('Processando dados...');

      let parsed: { channels: any[]; movies: any[]; series: any[] };

      if (file.name.endsWith('.m3u')) {
        parsed = parseM3U(content);
      } else if (file.name.endsWith('.json')) {
        parsed = parseJSON(content);
      } else {
        throw new Error('Formato de arquivo não suportado. Use .json ou .m3u');
      }

      logger.log('📊 Dados parseados:', {
        canais: parsed.channels.length,
        filmes: parsed.movies.length,
        series: parsed.series.length,
      });
      setProgress(25);

      const totalItems = parsed.channels.length + parsed.movies.length + parsed.series.length;

      if (totalItems === 0) {
        throw new Error(
          'Nenhum dado válido (filmes, séries ou canais) foi encontrado no arquivo. Verifique o formato.'
        );
      }

      let processedItems = 0;

      // Inserir canais
      if (parsed.channels.length > 0) {
        setCurrentStep(`Inserindo ${parsed.channels.length} canais...`);
        logger.log('📡 Inserindo canais...');
        const { data: channelsData, error: channelsError } = await supabase
          .from('channels')
          .insert(parsed.channels)
          .select();

        if (channelsError) {
          logger.error('❌ Erro ao inserir canais:', channelsError);
          throw channelsError;
        }
        logger.log('✅ Canais inseridos:', channelsData?.length);
        processedItems += parsed.channels.length;
        setProgress(25 + (processedItems / totalItems) * 50);
      }

      // Inserir filmes
      if (parsed.movies.length > 0) {
        setCurrentStep(`Inserindo ${parsed.movies.length} filmes...`);
        logger.log('🎬 Inserindo filmes...');
        const { data: moviesData, error: moviesError } = await supabase
          .from('movies')
          .insert(parsed.movies.map((m) => ({ ...m, status: 'draft' }))) // Force draft status
          .select();

        if (moviesError) {
          logger.error('❌ Erro ao inserir filmes:', moviesError);
          throw moviesError;
        }
        logger.log('✅ Filmes inseridos:', moviesData?.length);
        processedItems += parsed.movies.length;
        setProgress(25 + (processedItems / totalItems) * 50);
      }

      // Inserir séries
      if (parsed.series.length > 0) {
        setCurrentStep(`Inserindo ${parsed.series.length} séries...`);
        logger.log('📺 Inserindo séries...');
        const { data: seriesData, error: seriesError } = await supabase
          .from('series')
          .insert(parsed.series.map((s) => ({ ...s, status: 'draft' }))) // Force draft status
          .select();

        if (seriesError) {
          logger.error('❌ Erro ao inserir séries:', seriesError);
          throw seriesError;
        }
        logger.log('✅ Séries inseridas:', seriesData?.length);
        processedItems += parsed.series.length;
        setProgress(75);
      }

      // Registrar upload
      setCurrentStep('Finalizando...');
      setProgress(90);
      logger.log('📝 Registrando upload...');
      const { error: uploadError } = await supabase.from('uploads').insert({
        filename: file.name,
        file_type: file.name.endsWith('.m3u') ? 'm3u' : 'json',
        content_type: 'mixed',
        items_count: totalItems,
      });

      if (uploadError) {
        logger.error('⚠️ Erro ao registrar upload:', uploadError);
      }

      setStats({
        movies: parsed.movies.length,
        series: parsed.series.length,
        channels: parsed.channels.length,
      });

      setProgress(100);
      setCurrentStep('Concluído!');
      logger.log('🎉 Upload concluído com sucesso!');
      setMessage(`✅ Upload concluído com sucesso!`);
      setFile(null);
    } catch (error: any) {
      logger.error('💥 Erro no upload:', error);
      setMessage(`❌ Erro: ${error.message || JSON.stringify(error)}`);
      setProgress(0);
      setCurrentStep('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '40px 20px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '20px',
          padding: '40px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: '700',
            marginBottom: '10px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Painel Admin
        </h1>
        <p style={{ color: '#666', marginBottom: '40px' }}>
          Envie arquivos JSON ou M3U para popular o banco de dados
        </p>

        <div
          style={{
            border: '2px dashed #667eea',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            marginBottom: '30px',
            background: '#f8f9ff',
          }}
        >
          <input
            type="file"
            accept=".json,.m3u"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            style={{
              display: 'inline-block',
              padding: '15px 40px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              transition: 'transform 0.2s',
              border: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            📁 Selecionar Arquivo
          </label>

          {file && (
            <div style={{ marginTop: '20px', color: '#667eea', fontWeight: '500' }}>
              ✓ {file.name}
            </div>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          style={{
            width: '100%',
            padding: '18px',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1.2rem',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s',
            marginBottom: '20px',
          }}
        >
          {loading ? '⏳ Processando...' : '🚀 Enviar e Processar'}
        </button>

        {loading && progress > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '0.9rem',
                color: '#667eea',
                fontWeight: '600',
              }}
            >
              <span>{currentStep}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: '#e0e7ff',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  transition: 'width 0.3s ease',
                  borderRadius: '10px',
                }}
              />
            </div>
          </div>
        )}

        {message && (
          <div
            style={{
              padding: '20px',
              borderRadius: '10px',
              background: message.includes('✅') ? '#d4edda' : '#f8d7da',
              color: message.includes('✅') ? '#155724' : '#721c24',
              marginBottom: '20px',
              fontWeight: '500',
            }}
          >
            {message}
          </div>
        )}

        {(stats.movies > 0 || stats.series > 0 || stats.channels > 0) && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '20px',
              marginTop: '30px',
            }}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                padding: '20px',
                borderRadius: '12px',
                color: 'white',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>{stats.movies}</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Filmes</div>
            </div>
            <div
              style={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                padding: '20px',
                borderRadius: '12px',
                color: 'white',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>{stats.series}</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Séries</div>
            </div>
            <div
              style={{
                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                padding: '20px',
                borderRadius: '12px',
                color: 'white',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2rem', fontWeight: '700' }}>{stats.channels}</div>
              <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>Canais</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
