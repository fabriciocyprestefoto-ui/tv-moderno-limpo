export async function fetchWikipediaLogo(officialName: string): Promise<string | null> {
  const languages = ["pt", "en"];
  
  for (const lang of languages) {
    try {
      // 1. Try direct title match
      const directUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(officialName)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
      const directResponse = await fetch(directUrl);
      const directData = await directResponse.json();
      
      const pages = directData.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId !== "-1" && pages[pageId].thumbnail?.source) {
        return pages[pageId].thumbnail.source;
      }

      // 2. Fallback: Search for the title
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(officialName)}&gsrlimit=1&prop=pageimages&format=json&pithumbsize=500&origin=*`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (searchData.query?.pages) {
        const searchPages = searchData.query.pages;
        const searchPageId = Object.keys(searchPages)[0];
        if (searchPages[searchPageId].thumbnail?.source) {
          return searchPages[searchPageId].thumbnail.source;
        }
      }
    } catch (error) {
      console.error(`Error fetching logo for ${officialName} in ${lang}:`, error);
    }
  }
  
  return null;
}
