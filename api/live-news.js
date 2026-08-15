const NEWS_PLACEHOLDER_IMAGE = "/images/news-placeholder.svg";
const NEWS_FETCH_TIMEOUT_MS = 9000;
const NEWS_SOURCES = [
  {
    url: "https://www.sport-express.ru/services/materials/news/football/se/",
    source: "Спорт-Экспресс Футбол",
  },
  {
    url: "https://www.sport-express.ru/services/materials/news/se/",
    source: "Спорт-Экспресс",
  },
  {
    url: "https://lenta.ru/rss/news/sport",
    source: "Lenta.ru Спорт",
  },
];

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
  return decodeEntities(xml.match(pattern)?.[1] || "").trim();
}

function normalizeImageUrl(url = "") {
  const imageUrl = decodeEntities(url).trim();
  if (!imageUrl || imageUrl === "#") {
    return NEWS_PLACEHOLDER_IMAGE;
  }

  if (imageUrl.startsWith("//")) {
    return `https:${imageUrl}`;
  }

  if (imageUrl.startsWith("http://")) {
    return imageUrl.replace("http://", "https://");
  }

  return imageUrl;
}

function getImageUrl(itemXml) {
  const mediaMatch =
    itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i) ||
    itemXml.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i) ||
    itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i);

  if (mediaMatch?.[1]) {
    return normalizeImageUrl(mediaMatch[1]);
  }

  const description = getTagValue(itemXml, "description");
  return normalizeImageUrl(description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]);
}

function parseRss(xml, source) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map(([itemXml], index) => {
      const title = stripHtml(getTagValue(itemXml, "title"));
      const url = getTagValue(itemXml, "link") || "#";

      return {
        id: `${source}-${index}-${title}`,
        title,
        source,
        url,
        publishedAt: getTagValue(itemXml, "pubDate"),
        imageUrl: getImageUrl(itemXml),
        description: stripHtml(getTagValue(itemXml, "description")),
      };
    })
    .filter((item) => item.title && item.url !== "#");
}

function mergeNewsItems(items) {
  const seen = new Set();

  return items
    .filter((item) => {
      const key = item.url || item.title;
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((first, second) => {
      const firstTime = new Date(first.publishedAt).getTime() || 0;
      const secondTime = new Date(second.publishedAt).getTime() || 0;
      return secondTime - firstTime;
    })
    .slice(0, 12);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);

  try {
    const freshUrl = new URL(url);
    freshUrl.searchParams.set("_", Date.now().toString());

    const response = await fetch(freshUrl, {
      headers: {
        accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "user-agent": "WhistleLiveNews/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    return response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchSource(source) {
  const xml = await fetchText(source.url);
  return xml ? parseRss(xml, source.source) : [];
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const settledSources = await Promise.allSettled(NEWS_SOURCES.map(fetchSource));
  const items = mergeNewsItems(
    settledSources.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(200).json({
    items,
    source: items.length ? "live" : "fallback",
    updatedAt: new Date().toISOString(),
  });
};
