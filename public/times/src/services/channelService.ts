const LOGO_CACHE_KEY = "sports_channel_logos_cache";

interface LogoCache {
  [key: string]: string;
}

function getCache(): LogoCache {
  const cache = localStorage.getItem(LOGO_CACHE_KEY);
  return cache ? JSON.parse(cache) : {};
}

function setCache(name: string, url: string) {
  const cache = getCache();
  cache[name] = url;
  localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cache));
}

export async function fetchChannelLogo(channelName: string): Promise<string | null> {
  const cache = getCache();
  if (cache[channelName]) return cache[channelName];

  const variations = [
    channelName,
    `${channelName} (canal de TV)`,
    `${channelName} Brasil`,
    `${channelName} HD`,
    `${channelName} Network`
  ];

  const languages = ["pt", "en"];

  // 1. Try Wikipedia Direct & Search
  for (const lang of languages) {
    for (const query of variations) {
      try {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query?.pages;
        const pageId = pages ? Object.keys(pages)[0] : "-1";

        if (pageId !== "-1" && pages[pageId].thumbnail?.source) {
          const logoUrl = pages[pageId].thumbnail.source;
          setCache(channelName, logoUrl);
          return logoUrl;
        }
      } catch (e) {
        console.error(`Wiki error for ${query}:`, e);
      }
    }
  }

  // 2. Fallback: Wikimedia Commons Search
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(channelName + " logo")}&format=json&origin=*`;
    const response = await fetch(commonsUrl);
    const data = await response.json();
    const searchResults = data.query?.search;

    if (searchResults && searchResults.length > 0) {
      // Try to find the best match (prioritize PNG/SVG)
      for (const result of searchResults) {
        const title = result.title;
        if (title.toLowerCase().includes("logo") && (title.toLowerCase().endsWith(".png") || title.toLowerCase().endsWith(".svg"))) {
          const fileUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
          const fileResponse = await fetch(fileUrl);
          const fileData = await fileResponse.json();
          const pages = fileData.query?.pages;
          const pageId = pages ? Object.keys(pages)[0] : "-1";
          
          if (pageId !== "-1" && pages[pageId].imageinfo?.[0]?.url) {
            const finalUrl = pages[pageId].imageinfo[0].url;
            setCache(channelName, finalUrl);
            return finalUrl;
          }
        }
      }
    }
  } catch (e) {
    console.error(`Commons error for ${channelName}:`, e);
  }

  return null;
}
