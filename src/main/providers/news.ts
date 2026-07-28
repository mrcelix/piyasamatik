export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
}

const NEWS_URL =
  'https://news.google.com/rss/search?q=borsa%20OR%20d%C3%B6viz%20OR%20ekonomi%20OR%20alt%C4%B1n%20OR%20kripto&hl=tr&gl=TR&ceid=TR:tr';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (MiniTakip Desktop Widget)' };

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  let content = match[1].trim();
  const cdata = content.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdata) content = cdata[1];
  return content;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const rawTitle = decodeEntities(extractTag(block, 'title'));
    const link = decodeEntities(extractTag(block, 'link'));
    const pubDate = extractTag(block, 'pubDate');
    const source = decodeEntities(extractTag(block, 'source'));
    // Google News suffixes the title with " - <source>"; drop the duplicate.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    if (title && link) items.push({ title, link, source, pubDate });
  }
  return items;
}

export async function fetchMarketNews(force = false): Promise<NewsItem[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }
  try {
    const res = await fetch(NEWS_URL, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml).slice(0, 20);
    cache = { items, fetchedAt: Date.now() };
    return items;
  } catch {
    return cache?.items ?? [];
  }
}
