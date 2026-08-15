const BETTING_URL = "https://getruvada.com/?promo=dd7bee7a-6766-481c-88be-a9087ca1c0b1&target=register&click_id=ru_8";
const TOP_PROMO_TEXT = "Лучшая платформа для игры";
const LEGACY_PROMO_TEXT = "Промокод WHIST50 — бонус до 300 рублей";
const BETTING_LABELS = [
  "Зарегистрироваться",
  "Получить бонус",
  "Посмотреть линию",
  "Скачать приложение",
  "Пополнить счет",
  "Начать ставить",
  "Перейти к ставкам",
];
const NEWS_PLACEHOLDER_IMAGE = "/images/news-placeholder.svg";
const NEWS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const NEWS_FETCH_TIMEOUT_MS = 10000;
const NEWS_FEED_SOURCES = [
  {
    url: "https://www.sport-express.ru/services/materials/news/football/se/",
    source: "Спорт-Экспресс Футбол",
  },
  {
    url: "https://www.sport-express.ru/services/materials/news/se/",
    source: "Спорт-Экспресс",
  },
];
const NEWS_BACKUP_FEED_SOURCES = [
  {
    url: "https://lenta.ru/rss/news/sport",
    source: "Lenta.ru Спорт",
    proxy: true,
  },
];
let latestNewsItems = [];
let newsRefreshPromise = null;
let newsRepaintTimeoutId = null;

function updateMeta() {
  document.title = "Whistle — ставки на спорт, аналитика матчей и ответственная игра";

  const metaMappings = [
    ["meta[property='og:title']", "content", "Whistle — ставки на спорт, аналитика матчей и ответственная игра"],
    ["meta[name='twitter:title']", "content", "Whistle — ставки на спорт, аналитика матчей и ответственная игра"],
    ["meta[property='og:site_name']", "content", "Whistle"],
    ["meta[property='og:url']", "content", "https://whistle.pro"],
    ["link[rel='canonical']", "href", "https://whistle.pro"],
  ];

  for (const [selector, attribute, value] of metaMappings) {
    const element = document.querySelector(selector);
    if (element) {
      element.setAttribute(attribute, value);
    }
  }
}

function updateBranding() {
  const logoBadge = document.querySelector("header a[aria-label*='главную'] span");
  if (logoBadge) {
    logoBadge.textContent = "W";
  }

  const titleElement = document.querySelector("header a[aria-label*='главную'] .text-sm.font-semibold");
  if (titleElement) {
    titleElement.textContent = "Whistle";
  }

  const homeLink = document.querySelector("header a[aria-label]");
  if (homeLink) {
    homeLink.setAttribute("aria-label", "На главную, Whistle");
  }
}

function createPromoBanner() {
  const promoBanner = document.createElement("div");
  promoBanner.dataset.whistlePromo = "top";
  promoBanner.className =
    "relative z-50 border-b border-[rgba(198,161,91,0.24)] bg-[rgba(198,161,91,0.14)] px-4 py-3 text-center text-sm font-semibold uppercase tracking-[0.16em] text-[#f3e2bf] sm:px-6";
  syncPromoBannerContent(promoBanner);
  return promoBanner;
}

function syncPromoBannerContent(promoBanner) {
  if (promoBanner.querySelector("[data-whistle-promo-button='top']")) {
    const button = promoBanner.querySelector("[data-whistle-promo-button='top']");
    const text = promoBanner.querySelector("span");
    if (text) {
      text.textContent = TOP_PROMO_TEXT;
    }
    if (button) {
      button.href = BETTING_URL;
      button.target = "_self";
      button.rel = "noreferrer";
    }
    return;
  }

  const content = document.createElement("div");
  content.className = "mx-auto flex max-w-6xl flex-col items-center justify-center gap-3 sm:flex-row";

  const text = document.createElement("span");
  text.textContent = TOP_PROMO_TEXT;

  const button = document.createElement("a");
  button.dataset.whistlePromoButton = "top";
  button.href = BETTING_URL;
  button.target = "_self";
  button.rel = "noreferrer";
  button.className = "button-shared focus-visible:outline-none button-primary";
  button.textContent = "Перейти к ставкам";
  button.setAttribute("aria-label", "Перейти к ставкам.");

  content.append(text, button);
  promoBanner.replaceChildren(content);
}

function insertPromoBanner() {
  const siteFrame = document.querySelector(".site-frame");
  if (!siteFrame) {
    return;
  }

  const strayPromoBanner = document.body?.querySelector(":scope > [data-whistle-promo='top']");
  if (strayPromoBanner) {
    strayPromoBanner.remove();
  }

  let promoBanner =
    siteFrame.querySelector(":scope > [data-whistle-promo='top']") ||
    Array.from(siteFrame.children).find((element) =>
      element.textContent?.includes(LEGACY_PROMO_TEXT) || element.textContent?.includes(TOP_PROMO_TEXT),
    );

  if (!promoBanner) {
    promoBanner = createPromoBanner();
    siteFrame.prepend(promoBanner);
  }

  promoBanner.dataset.whistlePromo = "top";
  promoBanner.classList.add("relative", "z-50");
  syncPromoBannerContent(promoBanner);
}

function updateTopPromoCopies() {
  const headerPromo = document.querySelector("header span.xl\\:inline-flex");
  if (headerPromo?.textContent?.includes(LEGACY_PROMO_TEXT)) {
    headerPromo.textContent = TOP_PROMO_TEXT;
  }

  const newsPromo = document.querySelector("section[aria-label='Главные спортивные новости'] .rounded-\\[1\\.5rem\\]");
  if (newsPromo?.textContent?.includes(LEGACY_PROMO_TEXT)) {
    newsPromo.textContent = TOP_PROMO_TEXT;
  }
}

function watchPromoBanner() {
  const siteFrame = document.querySelector(".site-frame");
  if (!siteFrame || siteFrame.dataset.whistlePromoObserver === "active") {
    return;
  }

  const observer = new MutationObserver(() => {
    insertPromoBanner();
    updateTopPromoCopies();
  });

  observer.observe(siteFrame, { childList: true });
  siteFrame.dataset.whistlePromoObserver = "active";
}

function getBettingLabel(text) {
  const normalizedText = text?.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return "";
  }

  return BETTING_LABELS.find(
    (label) => normalizedText === label || normalizedText.startsWith(`${label} `),
  ) || "";
}

function syncBettingButton(button, label) {
  button.href = BETTING_URL;
  button.target = "_self";
  button.rel = "noreferrer";
  button.dataset.whistleBettingCta = "true";
  button.setAttribute("aria-label", `${label}.`);
}

function updateBettingCards() {
  document.querySelectorAll("[data-whistle-promo='bet']").forEach((promo) => {
    promo.remove();
  });

  const allButtons = Array.from(document.querySelectorAll("a"));

  for (const button of allButtons) {
    const label = getBettingLabel(button.textContent);

    if (label) {
      syncBettingButton(button, label);
    }

    if (label === "Получить бонус") {
      const card = button.closest("div.rounded-3xl");
      const descriptions = card?.querySelectorAll("p");
      const description = descriptions?.[descriptions.length - 1];
      if (description && description.innerHTML.includes("WHIST50")) {
        description.innerHTML =
          "Бонусные предложения доступны по правилам акции. Проверьте условия бонусов до активации.";
      }
    }
  }
}

function watchBettingCards() {
  const siteFrame = document.querySelector(".site-frame") || document.body;
  if (!siteFrame || siteFrame.dataset.whistleBettingObserver === "active") {
    return;
  }

  const observer = new MutationObserver(updateBettingCards);
  observer.observe(siteFrame, { childList: true, subtree: true });
  siteFrame.dataset.whistleBettingObserver = "active";
}

function handleBettingClick(event) {
  const button = event.target?.closest?.("a");
  if (!button) {
    return;
  }

  const label = getBettingLabel(button.textContent);
  if (!label) {
    return;
  }

  syncBettingButton(button, label);
  event.preventDefault();
  window.location.assign(BETTING_URL);
}

function formatNewsPublishedAt(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeNewsItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items
    .filter((item) => item && item.title)
    .map((item, index) => ({
      id: item.id || `news-${index}`,
      title: item.title,
      source: item.source || "Спортивные новости",
      publishedAt: item.publishedAt || item.pubDate || item.date || "",
      imageUrl: normalizeNewsImageUrl(item.imageUrl || item.image),
      url: item.url || item.link || "#",
      description: item.description || "",
    }));
}

function createFreshUrl(url) {
  const freshUrl = new URL(url);
  freshUrl.searchParams.set("_", Date.now().toString());
  return freshUrl.toString();
}

function createCorsProxyUrl(url) {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(createFreshUrl(url))}`;
}

async function fetchTextWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NEWS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return "";
    }

    return response.text();
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function getNodeText(node, selector) {
  const element = node.querySelector(selector);
  return element?.textContent?.trim() || "";
}

function normalizeNewsImageUrl(url) {
  const imageUrl = url?.trim();
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

function getNewsImageUrl(item) {
  const mediaContent =
    item.querySelector("media\\:content[url]") ||
    item.querySelector("content[url]") ||
    item.querySelector("enclosure[type^='image'][url]");

  if (mediaContent?.getAttribute("url")) {
    return normalizeNewsImageUrl(mediaContent.getAttribute("url"));
  }

  const description = getNodeText(item, "description, summary, content\\:encoded");
  const imageMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  return normalizeNewsImageUrl(imageMatch?.[1]);
}

function getNewsLink(item) {
  const atomLink = item.querySelector("link[href]");
  return atomLink?.getAttribute("href") || getNodeText(item, "link") || "#";
}

function stripHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent?.replace(/\s+/g, " ").trim() || "";
}

function parseRssNews(xmlText, source) {
  const documentXml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    return [];
  }

  return Array.from(documentXml.querySelectorAll("item, entry"))
    .map((item, index) => ({
      id: `${source}-${getNewsLink(item)}-${index}`,
      title: getNodeText(item, "title"),
      source,
      publishedAt: getNodeText(item, "pubDate, published, updated, dc\\:date"),
      imageUrl: getNewsImageUrl(item),
      url: getNewsLink(item),
      description: stripHtml(getNodeText(item, "description, summary, content\\:encoded")),
    }))
    .filter((item) => item.title && item.url !== "#");
}

async function fetchFeedNews(source) {
  const feedUrls = source.proxy
    ? [createCorsProxyUrl(source.url)]
    : [createFreshUrl(source.url), createCorsProxyUrl(source.url)];

  for (const feedUrl of feedUrls) {
    const xmlText = await fetchTextWithTimeout(feedUrl);
    if (!xmlText) {
      continue;
    }

    const items = parseRssNews(xmlText, source.source);
    if (items.length) {
      return items;
    }
  }

  return [];
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

async function fetchLiveNews() {
  const settledPrimaryFeeds = await Promise.allSettled(NEWS_FEED_SOURCES.map(fetchFeedNews));
  const primaryRssItems = settledPrimaryFeeds.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (primaryRssItems.length) {
    return mergeNewsItems(primaryRssItems);
  }

  const settledBackupFeeds = await Promise.allSettled(NEWS_BACKUP_FEED_SOURCES.map(fetchFeedNews));
  const backupRssItems = settledBackupFeeds.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (backupRssItems.length) {
    return mergeNewsItems(backupRssItems);
  }

  const response = await fetch("/api/sports-news", { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  return normalizeNewsItems(await response.json());
}

function createNewsCard(item) {
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "shrink-0 rounded-3xl focus-visible:rounded-3xl";

  const article = document.createElement("article");
  article.className =
    "flex min-h-[4.5rem] min-w-[19rem] max-w-[26rem] shrink-0 items-center gap-3 rounded-3xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm leading-5 text-[#e8dfd2] sm:min-w-[21rem]";

  const media = document.createElement("div");
  media.className = "h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20";

  const image = document.createElement("img");
  image.src = normalizeNewsImageUrl(item.imageUrl);
  image.alt = item.title;
  image.width = 48;
  image.height = 48;
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.className = "h-full w-full object-cover";
  image.onerror = () => {
    image.src = NEWS_PLACEHOLDER_IMAGE;
  };

  const body = document.createElement("div");
  body.className = "min-w-0";

  const title = document.createElement("p");
  title.className = "line-clamp-2 font-medium text-[#f7f0e5]";
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.className = "mt-1 truncate text-xs leading-5 text-muted";
  const publishedAt = formatNewsPublishedAt(item.publishedAt);
  meta.textContent = [item.source, publishedAt].filter(Boolean).join(" • ");

  body.append(title);
  if (meta.textContent) {
    body.append(meta);
  }

  media.append(image);
  article.append(media, body);
  link.append(article);

  return link;
}

function renderNewsTickerNotice(title, description) {
  const track = document.querySelector(".news-ticker-track");
  if (!track) {
    return;
  }

  const card = document.createElement("div");
  card.className =
    "flex min-h-[4.25rem] min-w-[16rem] shrink-0 flex-col justify-center rounded-3xl border border-[rgba(198,161,91,0.2)] bg-[rgba(198,161,91,0.08)] px-4 py-3 text-sm leading-5 text-[#f2e6cf]";

  const headline = document.createElement("p");
  headline.className = "font-medium";
  headline.textContent = title;

  const body = document.createElement("p");
  body.className = "mt-1 text-xs leading-5 text-muted";
  body.textContent = description;

  card.append(headline, body);
  track.replaceChildren(card);
}

function renderNewsTickerItems(items) {
  const track = document.querySelector(".news-ticker-track");
  if (!track || !items.length) {
    return;
  }

  latestNewsItems = items;
  const doubledItems = [...items, ...items];
  track.replaceChildren(...doubledItems.map(createNewsCard));
  track.dataset.whistleLiveNews = "ready";
}

function createNewsSectionCard(item, index) {
  const link = document.createElement("a");
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "rounded-[2rem] focus-visible:rounded-[2rem]";

  const article = document.createElement("article");
  article.className = [
    "animate-fade-up flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04]",
    "shadow-[0_24px_64px_rgba(0,0,0,0.24)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(198,161,91,0.24)]",
    index % 3 === 1 ? "animate-delay-2" : index % 3 === 2 ? "animate-delay-3" : "animate-delay-1",
  ].join(" ");

  const imageFrame = document.createElement("div");
  imageFrame.className = "aspect-[16/9] overflow-hidden border-b border-white/10 bg-black/10";

  const image = document.createElement("img");
  image.src = normalizeNewsImageUrl(item.imageUrl);
  image.alt = item.title;
  image.className = "h-full w-full object-cover";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.onerror = () => {
    image.src = NEWS_PLACEHOLDER_IMAGE;
  };

  const content = document.createElement("div");
  content.className = "flex flex-1 flex-col p-5";

  const meta = document.createElement("div");
  meta.className = "flex flex-wrap items-center gap-3 text-xs font-medium text-muted";

  const source = document.createElement("span");
  source.className = "text-brand";
  source.textContent = item.source;

  const date = document.createElement("span");
  date.textContent = formatNewsPublishedAt(item.publishedAt);

  const title = document.createElement("h3");
  title.className = "mt-4 text-xl font-semibold text-ink";
  title.textContent = item.title;

  const description = document.createElement("p");
  description.className = "mt-3 line-clamp-4 text-sm leading-6 text-muted";
  description.textContent = item.description || "Свежий новостной контекст для спокойного анализа события.";

  const action = document.createElement("div");
  action.className = "mt-auto pt-5";

  const actionText = document.createElement("span");
  actionText.className = "button-shared focus-visible:outline-none button-secondary";
  actionText.textContent = "Читать новость";

  meta.append(source);
  if (date.textContent) {
    meta.append(date);
  }
  action.append(actionText);
  content.append(meta, title, description, action);
  imageFrame.append(image);
  article.append(imageFrame, content);
  link.append(article);

  return link;
}

function renderNewsSectionItems(items) {
  const section = document.querySelector("#sports-news");
  const grid = section?.querySelector(".grid");
  if (!grid || !items.length) {
    return;
  }

  grid.replaceChildren(...items.slice(0, 6).map(createNewsSectionCard));
  grid.dataset.whistleLiveNews = "ready";
}

async function refreshLiveNewsTicker() {
  if (newsRefreshPromise) {
    return newsRefreshPromise;
  }

  newsRefreshPromise = refreshLiveNewsTickerOnce();
  try {
    return await newsRefreshPromise;
  } finally {
    newsRefreshPromise = null;
  }
}

async function refreshLiveNewsTickerOnce() {
  renderNewsTickerNotice(
    "Обновляем спортивную ленту",
    "Показываем свежие новости сразу после ответа источника.",
  );

  try {
    const items = await fetchLiveNews();
    if (!items.length) {
      renderNewsTickerNotice(
        "Внешняя лента временно недоступна",
        "Попробуем обновить новости снова автоматически.",
      );
      return;
    }

    renderNewsTickerItems(items);
    renderNewsSectionItems(items);
  } catch {
    renderNewsTickerNotice(
      "Внешняя лента временно недоступна",
      "Попробуем обновить новости снова автоматически.",
    );
  }
}

function repaintLiveNewsIfNeeded() {
  if (!latestNewsItems.length) {
    return;
  }

  const track = document.querySelector(".news-ticker-track");
  if (track && track.dataset.whistleLiveNews !== "ready") {
    renderNewsTickerItems(latestNewsItems);
  }

  const grid = document.querySelector("#sports-news .grid");
  if (grid && grid.dataset.whistleLiveNews !== "ready") {
    renderNewsSectionItems(latestNewsItems);
  }
}

function scheduleLiveNewsRepaint() {
  window.clearTimeout(newsRepaintTimeoutId);
  newsRepaintTimeoutId = window.setTimeout(repaintLiveNewsIfNeeded, 120);
}

function watchLiveNewsSections() {
  const siteFrame = document.querySelector(".site-frame") || document.body;
  if (!siteFrame || siteFrame.dataset.whistleNewsObserver === "active") {
    return;
  }

  const observer = new MutationObserver(scheduleLiveNewsRepaint);
  observer.observe(siteFrame, { childList: true, subtree: true });
  siteFrame.dataset.whistleNewsObserver = "active";
}

function initWhistleCustomizations() {
  updateMeta();
  updateBranding();
  insertPromoBanner();
  updateTopPromoCopies();
  watchPromoBanner();
  updateBettingCards();
  watchBettingCards();
  watchLiveNewsSections();
  refreshLiveNewsTicker();
  window.setInterval(refreshLiveNewsTicker, NEWS_REFRESH_INTERVAL_MS);

  if (document.body.dataset.whistleBettingClickHandler !== "active") {
    document.addEventListener("click", handleBettingClick, true);
    document.body.dataset.whistleBettingClickHandler = "active";
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      insertPromoBanner();
      updateTopPromoCopies();
      updateBettingCards();
      repaintLiveNewsIfNeeded();
    });
  });

  window.setTimeout(updateTopPromoCopies, 1000);
  window.setTimeout(updateTopPromoCopies, 3000);
  window.setTimeout(updateBettingCards, 1000);
  window.setTimeout(updateBettingCards, 3000);
  window.setTimeout(refreshLiveNewsTicker, 1500);
  window.setTimeout(refreshLiveNewsTicker, 5000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWhistleCustomizations);
} else {
  initWhistleCustomizations();
}

window.addEventListener("load", () => {
  insertPromoBanner();
  updateTopPromoCopies();
  updateBettingCards();
  repaintLiveNewsIfNeeded();
  refreshLiveNewsTicker();
});
