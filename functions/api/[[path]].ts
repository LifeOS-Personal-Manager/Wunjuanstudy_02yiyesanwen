import { readImageInfo } from "../_shared/image";
import { findSourceExcerpt } from "../../shared/sourceExcerpt";

interface Env {
  ESSAY_DB: D1Database;
  ESSAY_ASSETS: R2Bucket;
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL?: string;
  BRAVE_SEARCH_API_KEY?: string;
  DEV_USER_EMAIL?: string;
  CF_PAGES_BRANCH?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

type Context = EventContext<Env, string, Record<string, unknown>>;
type JsonRecord = Record<string, unknown>;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
// A single six-card generation is one DeepSeek request. Keep a practical
// per-hour ceiling for the protected MVP without carrying failed test runs
// over for an entire day.
const DEEPSEEK_ANALYSIS_LIMIT = 80;
const DEEPSEEK_ANALYSIS_WINDOW_SECONDS = 3600;

function now() { return new Date().toISOString(); }
function id() { return crypto.randomUUID(); }
const AUTHOR_ALIASES: Record<string, string> = {
  "居格涅夫": "屠格涅夫",
  "屠格涅夫": "屠格涅夫",
};

function normalizeAuthor(value: string) {
  const normalized = value.trim().replace(/\s+/g, "");
  return AUTHOR_ALIASES[normalized] || value.trim();
}

function normalizeTitle(value: string) {
  return value.trim().replace(/[《》]/g, "").replace(/\s+/g, "");
}

function sameAuthor(left: string, right: string) {
  const a = normalizeAuthor(left);
  const b = normalizeAuthor(right);
  return a === b || a.includes(b) || b.includes(a);
}

function sameTitle(left: string, right: string) {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  return a === b || a.includes(b) || b.includes(a);
}
function parseJson<T>(value: unknown, fallback: T): T { try { return typeof value === "string" ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function toHex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
async function sha256(value: string | ArrayBuffer) { return toHex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value)); }

class RateLimitError extends Error {
  constructor(public action: string, public limit: number, public windowSeconds: number) {
    super("RATE_LIMITED");
  }
}

function mapEssay(row: JsonRecord) {
  return {
    id: row.id, title: row.title, author: row.author, originalText: row.original_text,
    originalTextSha256: row.original_text_sha256, sourceName: row.source_name,
    sourceUrl: row.source_url || "", sourceRetrievedAt: row.source_retrieved_at || null,
    copyrightNotice: row.copyright_notice, status: row.status, publicationCopy: row.publication_copy,
    version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapCard(row: JsonRecord) {
  return {
    id: row.id, essayId: row.essay_id, kind: row.kind, position: row.position,
    sourceRange: { start: row.source_start, end: row.source_end }, sourceExcerpt: row.source_excerpt,
    editorGuide: row.editor_guide, sceneDescription: row.scene_description, imagePrompt: row.image_prompt,
    textPosition: parseJson(row.text_position_json, {}), crop: parseJson(row.crop_json, {}),
    templateSettings: parseJson(row.template_settings_json, {}), sourceAssetId: row.source_asset_id,
    renderedAssetId: row.rendered_asset_id, sourceStatus: row.source_status, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapAsset(row: JsonRecord) {
  return { id: row.id, essayId: row.essay_id, purpose: row.purpose, originalFilename: row.original_filename, mimeType: row.mime_type, byteSize: row.byte_size, width: row.width, height: row.height, sha256: row.sha256, createdAt: row.created_at };
}

async function body(request: Request) {
  try { return await request.json() as JsonRecord; } catch { throw new Error("INVALID_JSON"); }
}

function assertString(value: unknown, name: string, max = 100000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`INVALID_${name.toUpperCase()}`);
  return value;
}

async function getEssay(db: D1Database, essayId: string, ownerId: string) {
  const row = await db.prepare("SELECT * FROM essays WHERE id = ? AND owner_id = ?").bind(essayId, ownerId).first<JsonRecord>();
  return row ? mapEssay(row) : null;
}

async function listCards(db: D1Database, essayId: string) {
  const result = await db.prepare("SELECT * FROM cards WHERE essay_id = ? ORDER BY position").bind(essayId).all<JsonRecord>();
  return result.results.map(mapCard);
}

async function listAssets(db: D1Database, essayId: string) {
  const result = await db.prepare("SELECT * FROM assets WHERE essay_id = ? ORDER BY created_at DESC").bind(essayId).all<JsonRecord>();
  return result.results.map(mapAsset);
}

type AccessJwk = JsonWebKey & { kid?: string };
let accessKeysCache: { expiresAt: number; keys: AccessJwk[] } | null = null;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const entry = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

async function authenticatedUser(request: Request, env: Env) {
  if (env.CF_PAGES_BRANCH === "local" && env.DEV_USER_EMAIL) return env.DEV_USER_EMAIL.trim().toLowerCase();
  const accessEmail = request.headers.get("CF-Access-Authenticated-User-Email")?.trim().toLowerCase() || "";
  const token = request.headers.get("CF-Access-Jwt-Assertion") || cookieValue(request, "CF_Authorization");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return "";
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) return "";
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as { alg?: string; kid?: string };
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as { aud?: string | string[]; email?: string; exp?: number };
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const email = payload.email?.trim().toLowerCase() || "";
    if (header.alg !== "RS256" || !header.kid || !audience.includes(env.ACCESS_AUD) || !payload.exp || payload.exp <= Date.now() / 1000 || !email || (accessEmail && accessEmail !== email)) return "";
    if (!accessKeysCache || accessKeysCache.expiresAt < Date.now()) {
      const domain = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const response = await fetch(`https://${domain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return "";
      const certs = await response.json() as { keys?: AccessJwk[] };
      if (!certs.keys?.length) return "";
      accessKeysCache = { keys: certs.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
    }
    const jwk = accessKeysCache.keys.find((key) => key.kid === header.kid); if (!jwk) return "";
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
    return valid ? email : "";
  } catch { return ""; }
}

function isUnsafeMethod(method: string) { return !["GET", "HEAD", "OPTIONS"].includes(method); }

async function enforceRateLimit(db: D1Database, ownerId: string, action: string, limit: number, windowSeconds: number) {
  const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const row = await db.prepare("SELECT COUNT(*) AS count FROM usage_events WHERE owner_id=? AND action=? AND created_at>=?").bind(ownerId, action, cutoff).first<{ count: number }>();
  if (Number(row?.count || 0) >= limit) throw new RateLimitError(action, limit, windowSeconds);
  await db.prepare("INSERT INTO usage_events (id,owner_id,action,created_at) VALUES (?,?,?,?)").bind(id(), ownerId, action, now()).run();
}

// Public source providers are optional. A slow or unavailable provider must not
// prevent the DeepSeek completion fallback from running.
async function optionalSource<T>(provider: () => Promise<T>, fallback: T): Promise<T> {
  try { return await provider(); } catch { return fallback; }
}

async function fetchWikisource(title: string, requestedAuthor: string) {
  const endpoint = new URL("https://zh.wikisource.org/w/api.php");
  endpoint.search = new URLSearchParams({ action: "parse", page: title, prop: "text", format: "json", formatversion: "2", origin: "*" }).toString();
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "EssayImageStudio/0.1" } });
  if (!response.ok) return await searchWikisource(title, requestedAuthor);
  const payload = await response.json() as { parse?: { title?: string; text?: string } };
  if (!payload.parse?.text || payload.parse.text.length > 2000000) return await searchWikisource(title, requestedAuthor);
  const paragraphs: string[] = []; let paragraph = ""; let detectedAuthor = requestedAuthor;
  const rewritten = new HTMLRewriter()
    .on('#headerContainer a[title^="Author:"]', { element(element) { detectedAuthor = element.getAttribute("title")?.replace(/^Author:/, "") || detectedAuthor; } })
    .on(".prp-pages-output > p", {
      element(element) { paragraph = ""; element.onEndTag(() => { const clean = paragraph.replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim(); if (clean.length > 12 && !/^十月在/.test(clean)) paragraphs.push(clean); }); },
      text(chunk) { paragraph += chunk.text; },
    })
    .transform(new Response(payload.parse.text));
  await rewritten.text();
  if (!paragraphs.length || (requestedAuthor && detectedAuthor && !detectedAuthor.includes(requestedAuthor))) return await searchWikisource(title, requestedAuthor);
  return [{ id: `wikisource-${title}`, title: payload.parse.title || title, author: detectedAuthor || requestedAuthor || "作者待核验", sourceName: "中文维基文库公开校勘文本", sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(title)}`, copyrightNotice: "请依据来源页公有领域标记及所在地法律核验版权状态。", originalText: paragraphs.join("\n\n"), note: "由中文维基文库公开转录自动提取" }];
}

async function searchWikisource(title: string, requestedAuthor: string) {
  const searchTerms = [title, `${title} ${requestedAuthor}`.trim()].filter((term, index, list) => term && list.indexOf(term) === index);
  const titleSet = new Set<string>();
  await Promise.all(searchTerms.map(async (term) => {
    const endpoint = new URL("https://zh.wikisource.org/w/api.php");
    endpoint.search = new URLSearchParams({ action: "query", list: "search", srsearch: term, srnamespace: "0", srlimit: "10", format: "json", formatversion: "2", origin: "*" }).toString();
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "EssayImageStudio/0.1" } });
    if (!response.ok) return;
    const payload = await response.json() as { query?: { search?: Array<{ title?: string }> } };
    for (const item of payload.query?.search || []) {
      const pageTitle = item.title?.trim();
      if (pageTitle && pageTitle.replace(/[《》]/g, "").includes(title)) titleSet.add(pageTitle);
    }
  }));
  const titles = [...titleSet].slice(0, 3);
  return (await Promise.all(titles.map((pageTitle) => optionalSource(() => fetchWikisourcePage(pageTitle, requestedAuthor), [] as Awaited<ReturnType<typeof fetchWikisourcePage>>)))).flat();
}

async function fetchWikisourcePage(pageTitle: string, requestedAuthor: string) {
  const endpoint = new URL("https://zh.wikisource.org/w/api.php"); endpoint.search = new URLSearchParams({ action: "parse", page: pageTitle, prop: "text", format: "json", formatversion: "2", origin: "*" }).toString();
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "EssayImageStudio/0.1" } });
  if (!response.ok) return [];
  const payload = await response.json() as { parse?: { title?: string; text?: string } }; if (!payload.parse?.text || payload.parse.text.length > 2000000) return [];
  const paragraphs: string[] = []; let paragraph = ""; let detectedAuthor = requestedAuthor;
  const rewritten = new HTMLRewriter().on('#headerContainer a[title^="Author:"]', { element(element) { detectedAuthor = element.getAttribute("title")?.replace(/^Author:/, "") || detectedAuthor; } }).on(".prp-pages-output > p", { element(element) { paragraph = ""; element.onEndTag(() => { const clean = paragraph.replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim(); if (clean.length > 12 && !/^十月在/.test(clean)) paragraphs.push(clean); }); }, text(chunk) { paragraph += chunk.text; } }).transform(new Response(payload.parse.text));
  await rewritten.text();
  if (!paragraphs.length || (requestedAuthor && detectedAuthor && !detectedAuthor.includes(requestedAuthor))) return [];
  return [{ id: `wikisource-${pageTitle}`, title: payload.parse.title || pageTitle, author: detectedAuthor || requestedAuthor || "作者待核验", sourceName: "中文维基文库自动索引全文", sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(pageTitle)}`, copyrightNotice: "请依据来源页公有领域标记及所在地法律核验版权状态。", originalText: paragraphs.join("\n\n"), note: "通过维基文库搜索接口自动索引并抓取全文" }];
}

interface WebSearchResult { title: string; url: string; description: string }

function isSafePublicUrl(value: string) {
  try {
    const url = new URL(value); if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || host === "::1") return false;
    return true;
  } catch { return false; }
}

async function fetchPublicHtml(value: string) {
  let current = value;
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!isSafePublicUrl(current)) throw new Error("UNSAFE_SOURCE_URL");
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "user-agent": "EssayImageStudio/1.0 (+https://essay-image-studio.pages.dev)" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get("location"); if (!location) throw new Error("SOURCE_REDIRECT_INVALID"); current = new URL(location, current).toString(); continue; }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) throw new Error("SOURCE_FETCH_FAILED");
    const length = Number(response.headers.get("content-length") || 0); if (length > 3000000) throw new Error("SOURCE_TOO_LARGE");
    return { response, finalUrl: current };
  }
  throw new Error("SOURCE_REDIRECT_LIMIT");
}

async function extractWebEssay(result: WebSearchResult, requestedTitle: string, requestedAuthor: string) {
  try {
    const { response, finalUrl } = await fetchPublicHtml(result.url); const paragraphs: string[] = []; let paragraph = ""; let total = 0;
    const rewritten = new HTMLRewriter().on("p", {
      element(element) { paragraph = ""; element.onEndTag(() => { const clean = paragraph.replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim(); if (clean.length >= 20 && total + clean.length <= 200000) { paragraphs.push(clean); total += clean.length; } }); },
      text(chunk) { paragraph += chunk.text; },
    }).transform(response);
    await rewritten.text();
    const originalText = paragraphs.join("\n\n"); const compact = originalText.replace(/\s+/g, "");
    if (originalText.length < 500 || !compact.includes(requestedTitle.replace(/\s+/g, "")) || (requestedAuthor && !compact.includes(requestedAuthor.replace(/\s+/g, "")))) return null;
    return { id: `web-${await sha256(finalUrl)}`, title: requestedTitle, author: requestedAuthor || "作者待核验", sourceName: `全网公开页面 · ${result.title.slice(0, 160)}`, sourceUrl: finalUrl, copyrightNotice: "网页可访问不等于获得转载授权；发布前必须核验该页面授权范围及作品版权状态。", originalText, note: result.description.slice(0, 500) };
  } catch { return null; }
}

async function chooseWebSource(env: Env, title: string, author: string, candidates: Array<NonNullable<Awaited<ReturnType<typeof extractWebEssay>>>>) {
  if (candidates.length <= 1 || !env.DEEPSEEK_API_KEY) return candidates[0] || null;
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(30000), headers: { "content-type": "application/json", authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "只输出JSON：{selectedIndex:number,reason:string}。根据标题、作者、来源和正文开头选择最可能完整准确的原文版本。不得补写、改写或输出原文。" },
      { role: "user", content: JSON.stringify({ title, author, candidates: candidates.map((item, index) => ({ index, sourceName: item.sourceName, sourceUrl: item.sourceUrl, length: item.originalText.length, beginning: item.originalText.slice(0, 800) })) }) },
    ] }),
  });
  if (!response.ok) return candidates[0];
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const content = payload.choices?.[0]?.message?.content;
  if (!content) return candidates[0];
  try { const selected = JSON.parse(content) as { selectedIndex?: number }; return candidates[selected.selectedIndex ?? 0] || candidates[0]; } catch { return candidates[0]; }
}

async function searchWebSources(env: Env, title: string, author: string) {
  if (!env.BRAVE_SEARCH_API_KEY) return [];
  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.search = new URLSearchParams({ q: `"${title}" "${author}" 全文`, count: "10", search_lang: "zh-hans", country: "cn", safesearch: "moderate" }).toString();
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json", "x-subscription-token": env.BRAVE_SEARCH_API_KEY } });
  if (!response.ok) throw new Error("WEB_SEARCH_FAILED");
  const payload = await response.json() as { web?: { results?: WebSearchResult[] } };
  const results = (payload.web?.results || []).filter((item) => item.title && item.url && isSafePublicUrl(item.url)).slice(0, 5);
  const extracted = (await Promise.all(results.map((item) => extractWebEssay(item, title, author)))).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const selected = await chooseWebSource(env, title, author, extracted);
  return selected ? [selected] : [];
}

interface DeepSeekSourceResponse {
  title?: string;
  author?: string;
  originalText?: string;
  confidence?: "high" | "medium" | "low";
  sourceHint?: string;
}

async function completeSourceWithDeepSeek(env: Env, title: string, author: string) {
  if (!env.DEEPSEEK_API_KEY) return [];
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST", signal: AbortSignal.timeout(55000),
    headers: { "content-type": "application/json", authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是中文散文资料索引助手。根据篇名和作者，从你的知识中还原完整散文原文。只输出 JSON：{title:string,author:string,originalText:string,confidence:'high'|'medium'|'low',sourceHint:string}。originalText 必须只含正文，保留自然分段；不要摘要、解释、Markdown、引号或补充说明。若不能高置信识别或无法给出完整原文，originalText 设为空字符串。" },
        { role: "user", content: JSON.stringify({ title: normalizeTitle(title), author: normalizeAuthor(author) || "作者未提供" }) },
      ],
    }),
  });
  if (!response.ok) throw new Error("DEEPSEEK_SOURCE_FAILED");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) return [];
  let generated: DeepSeekSourceResponse;
  try { generated = JSON.parse(content) as DeepSeekSourceResponse; } catch { throw new Error("DEEPSEEK_SOURCE_INVALID_JSON"); }
  const originalText = typeof generated.originalText === "string" ? generated.originalText.trim() : "";
  const generatedTitle = typeof generated.title === "string" ? normalizeTitle(generated.title) : "";
  const normalizedTitle = normalizeTitle(title);
  const generatedAuthor = typeof generated.author === "string" ? normalizeAuthor(generated.author) : "";
  const normalizedAuthor = normalizeAuthor(author);
  if (originalText.length < 300 || originalText.length > 200000 || !sameTitle(generatedTitle, normalizedTitle) || (normalizedAuthor && generatedAuthor && !sameAuthor(generatedAuthor, normalizedAuthor))) return [];  const confidence = generated.confidence === "high" ? "高" : generated.confidence === "medium" ? "中" : "低";
  const sourceHint = typeof generated.sourceHint === "string" ? generated.sourceHint.trim().slice(0, 300) : "DeepSeek 知识库索引";
  return [{
    id: `deepseek-${await sha256(`${title}\n${generatedAuthor}\n${originalText}`)}`,
    title: normalizedTitle, author: generatedAuthor || normalizedAuthor || "作者待核验",
    sourceName: `DeepSeek AI 索引补全文 · 置信度${confidence}`,
    sourceUrl: "https://api.deepseek.com/",
    copyrightNotice: "该正文由 DeepSeek 按篇名和作者补全，不等同于已核验的权威版本。发布、转载或商用前请与授权版本逐字核验并确认版权。",
    originalText, note: sourceHint,
  }];
}

const defaultTextPositions = [
  { xPercent: 10, yPercent: 13, widthPercent: 78, maxHeightPercent: 29, horizontalAlign: "center", verticalAlign: "top", fontSizePx: 66, lineHeight: 1.55 },
  { xPercent: 9, yPercent: 57, widthPercent: 82, maxHeightPercent: 29, horizontalAlign: "left", verticalAlign: "top", fontSizePx: 42, lineHeight: 1.55 },
];

function sourceExcerptFallback(originalText: string, position: number) {
  const paragraphs = originalText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 12);
  const paragraphIndex = paragraphs.length ? Math.min(paragraphs.length - 1, Math.floor(position * (paragraphs.length - 1) / 5)) : 0;
  const paragraph = paragraphs[paragraphIndex] || originalText.trim();
  const punctuation = paragraph.slice(0, 360).search(/[。！？；]/);
  const excerpt = punctuation >= 40 ? paragraph.slice(0, punctuation + 1) : paragraph.slice(0, 360);
  const start = originalText.indexOf(excerpt);
  if (start < 0 || !excerpt) throw new Error("SOURCE_NOT_FOUND");
  return { sourceExcerpt: excerpt, sourceStart: start, sourceEnd: start + excerpt.length };
}

function resolveProposals(originalText: string, raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("DEEPSEEK_RESPONSE_NOT_OBJECT");
  const value = raw as JsonRecord;
  if (value.schemaVersion !== "1.0") throw new Error("DEEPSEEK_SCHEMA_VERSION");
  if (!Array.isArray(value.cards) || value.cards.length !== 6) throw new Error("DEEPSEEK_CARD_COUNT");
  const expectedKinds = ["cover", "body", "body", "body", "body", "ending"];
  return value.cards.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("DEEPSEEK_CARD_NOT_OBJECT");
    const proposal = item as JsonRecord;
    if (proposal.kind !== expectedKinds[index]) throw new Error("DEEPSEEK_CARD_KIND");
    const proposedExcerpt = typeof proposal.sourceExcerpt === "string" && proposal.sourceExcerpt.trim() && proposal.sourceExcerpt.length <= 500 ? proposal.sourceExcerpt.trim() : "";
    const matches: number[] = []; let cursor = originalText.indexOf(proposedExcerpt);
    while (cursor >= 0) { matches.push(cursor); cursor = originalText.indexOf(proposedExcerpt, cursor + 1); }
    if (!matches.length) {
      const fallback = sourceExcerptFallback(originalText, index);
      return {
        kind: expectedKinds[index], ...fallback,
        editorGuide: typeof proposal.editorGuide === "string" && proposal.editorGuide.trim() && proposal.editorGuide.length <= 500 ? proposal.editorGuide : (() => { throw new Error("DEEPSEEK_EDITOR_GUIDE"); })(),
        sceneDescription: typeof proposal.sceneDescription === "string" && proposal.sceneDescription.trim() && proposal.sceneDescription.length <= 1000 ? proposal.sceneDescription : (() => { throw new Error("DEEPSEEK_SCENE_DESCRIPTION"); })(),
        imagePrompt: typeof proposal.imagePrompt === "string" && proposal.imagePrompt.trim() && proposal.imagePrompt.length <= 3000 ? proposal.imagePrompt : (() => { throw new Error("DEEPSEEK_IMAGE_PROMPT"); })(),
        textPlacement: proposal.textPlacement,
      };
    }
    const hint = typeof proposal.sourceStartHint === "number" ? proposal.sourceStartHint : matches[0];
    const start = matches.sort((a, b) => Math.abs(a - hint) - Math.abs(b - hint))[0];
    return {
      kind: expectedKinds[index], sourceExcerpt: proposedExcerpt, sourceStart: start, sourceEnd: start + proposedExcerpt.length,
      editorGuide: typeof proposal.editorGuide === "string" && proposal.editorGuide.trim() && proposal.editorGuide.length <= 500 ? proposal.editorGuide : (() => { throw new Error("DEEPSEEK_EDITOR_GUIDE"); })(),
      sceneDescription: typeof proposal.sceneDescription === "string" && proposal.sceneDescription.trim() && proposal.sceneDescription.length <= 1000 ? proposal.sceneDescription : (() => { throw new Error("DEEPSEEK_SCENE_DESCRIPTION"); })(),
      imagePrompt: typeof proposal.imagePrompt === "string" && proposal.imagePrompt.trim() && proposal.imagePrompt.length <= 3000 ? proposal.imagePrompt : (() => { throw new Error("DEEPSEEK_IMAGE_PROMPT"); })(),
      textPlacement: proposal.textPlacement,
    };
  });
}

async function callDeepSeek(env: Env, essay: ReturnType<typeof mapEssay>) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_NOT_CONFIGURED");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0.2, max_tokens: 8192, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是中文散文视觉编辑。只输出JSON，不得改写sourceExcerpt。输出schemaVersion=1.0、cards恰好6项（cover,body,body,body,body,ending）和publicationCopy。每卡字段：kind,sourceExcerpt,sourceStartHint,editorGuide,sceneDescription,imagePrompt,textPlacement{horizontalAlign,verticalAlign,widthPercent}。sourceExcerpt必须逐字复制用户原文。editorGuide不超过80字，sceneDescription不超过80字，imagePrompt不超过260字，publicationCopy不超过220字；生图提示词要求竖构图、无文字、无水印。不得省略任何一张图卡。" },
          { role: "user", content: JSON.stringify({ title: essay.title, author: essay.author, originalText: essay.originalText }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DEEPSEEK_${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("DEEPSEEK_INVALID_JSON");
    return JSON.parse(content) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("DEEPSEEK_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

async function callDeepSeekCard(env: Env, essay: ReturnType<typeof mapEssay>, card: ReturnType<typeof mapCard>, instruction: string) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_NOT_CONFIGURED");
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat", temperature: 0.55, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是中文散文视觉编辑。只输出JSON对象，字段必须为editorGuide、sceneDescription、imagePrompt。不得输出或改写原文。imagePrompt必须要求竖构图、无文字、无水印。" },
          { role: "user", content: JSON.stringify({ title: essay.title, author: essay.author, sourceExcerpt: card.sourceExcerpt, current: { editorGuide: card.editorGuide, sceneDescription: card.sceneDescription, imagePrompt: card.imagePrompt }, instruction }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`DEEPSEEK_${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content; if (!content) throw new Error("DEEPSEEK_INVALID_JSON");
    const value = JSON.parse(content) as JsonRecord;
    return { editorGuide: assertString(value.editorGuide, "editorGuide", 500), sceneDescription: assertString(value.sceneDescription, "sceneDescription", 1000), imagePrompt: assertString(value.imagePrompt, "imagePrompt", 3000) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("DEEPSEEK_TIMEOUT");
    throw error;
  } finally { clearTimeout(timer); }
}

export const onRequest: PagesFunction<Env> = async (context: Context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = request.method.toUpperCase();
  const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
  const startedAt = Date.now();
  const ownerId = await authenticatedUser(request, env);
  let responseStatus = 200;
  const success = (data: unknown, status = 200) => { responseStatus = status; return new Response(JSON.stringify({ ok: true, data, requestId }), { status, headers: { ...jsonHeaders, "x-request-id": requestId } }); };
  const failure = (code: string, message: string, status = 400, details?: unknown) => { responseStatus = status; return new Response(JSON.stringify({ ok: false, error: { code, message, details }, requestId }), { status, headers: { ...jsonHeaders, "x-request-id": requestId } }); };

  try {
    if (!ownerId) return failure("UNAUTHORIZED", "请先通过 Cloudflare Access 登录", 401);
    const origin = request.headers.get("origin");
    if (isUnsafeMethod(method) && origin && origin !== url.origin) return failure("FORBIDDEN", "拒绝跨站写入请求", 403);

    if (path[0] === "health" && method === "GET") {
      await env.ESSAY_DB.prepare("SELECT 1").first();
      return success({ status: "ok", database: "connected", storage: "configured", user: ownerId });
    }

    if (path[0] === "source-candidates" && method === "GET") {
      const title = url.searchParams.get("title")?.trim().replace(/[《》]/g, "") || "";
      const author = normalizeAuthor(url.searchParams.get("author")?.trim() || "");
      if (!title) return failure("VALIDATION_ERROR", "请输入散文名", 400);
      if (title.length > 200 || author.length > 120) return failure("VALIDATION_ERROR", "篇名或作者过长", 400);
      await enforceRateLimit(env.ESSAY_DB, ownerId, "source_search", 60, 3600);
      const wikisource = await optionalSource(() => fetchWikisource(title, author), [] as Awaited<ReturnType<typeof fetchWikisource>>);
      if (wikisource.length) return success(wikisource);
      const webSources = await optionalSource(() => searchWebSources(env, title, author), [] as Awaited<ReturnType<typeof searchWebSources>>);
      if (webSources.length) return success(webSources);
      try { return success(await completeSourceWithDeepSeek(env, title, author)); }
      catch (error) {
        const code = error instanceof Error ? error.message : "DEEPSEEK_SOURCE_FAILED";
        return failure(code, "DeepSeek 补全文失败，请稍后重试", code === "DEEPSEEK_TIMEOUT" ? 504 : 502);
      }
    }

    if (path[0] === "essays" && path.length === 1 && method === "GET") {
      const rows = await env.ESSAY_DB.prepare("SELECT id,title,author,status,version,created_at,updated_at FROM essays WHERE owner_id=? AND status <> 'archived' ORDER BY updated_at DESC LIMIT 50").bind(ownerId).all<JsonRecord>();
      return success(rows.results.map(row => ({ id: row.id, title: row.title, author: row.author, status: row.status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at })));
    }

    if (path[0] === "essays" && path.length === 1 && method === "POST") {
      const input = await body(request); const createdAt = now(); const essayId = id();
      const title = assertString(input.title, "title", 200); const author = assertString(input.author, "author", 120); const originalText = assertString(input.originalText, "originalText", 200000);
      const sourceName = assertString(input.sourceName, "sourceName", 500); const sourceUrl = assertString(input.sourceUrl, "sourceUrl", 2000); const copyrightNotice = assertString(input.copyrightNotice, "copyrightNotice", 2000);
      const contentHash = await sha256(originalText);
      await env.ESSAY_DB.batch([
        env.ESSAY_DB.prepare("INSERT INTO essays (id,title,author,original_text,original_text_sha256,source_name,source_url,source_retrieved_at,copyright_notice,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(essayId, title, author, originalText, contentHash, sourceName, sourceUrl, createdAt, copyrightNotice, ownerId, createdAt, createdAt),
        env.ESSAY_DB.prepare("INSERT INTO source_snapshots (id,essay_id,owner_id,source_url,content_sha256,metadata_json,retrieved_at) VALUES (?,?,?,?,?,'{}',?)")
          .bind(id(), essayId, ownerId, sourceUrl, contentHash, createdAt),
      ]);
      return success(await getEssay(env.ESSAY_DB, essayId, ownerId), 201);
    }

    if (path[0] === "essays" && path.length >= 2) {
      const essayId = path[1]; const essay = await getEssay(env.ESSAY_DB, essayId, ownerId);
      if (!essay) return failure("NOT_FOUND", "散文不存在", 404);

      if (path.length === 2 && method === "GET") return success({ essay, cards: await listCards(env.ESSAY_DB, essayId), assets: await listAssets(env.ESSAY_DB, essayId) });

      if (path.length === 2 && method === "DELETE") {
        await env.ESSAY_DB.prepare("UPDATE essays SET status='archived',version=version+1,updated_at=? WHERE id=? AND owner_id=?").bind(now(), essayId, ownerId).run();
        responseStatus = 204;
        return new Response(null, { status: 204 });
      }

      if (path[2] === "purge" && path.length === 3 && method === "DELETE") {
        const assets = await env.ESSAY_DB.prepare("SELECT r2_key FROM assets WHERE essay_id=?").bind(essayId).all<{ r2_key: string }>();
        await Promise.all(assets.results.map((asset) => env.ESSAY_ASSETS.delete(asset.r2_key)));
        await env.ESSAY_DB.batch([
          env.ESSAY_DB.prepare("DELETE FROM export_jobs WHERE essay_id=?").bind(essayId),
          env.ESSAY_DB.prepare("DELETE FROM cards WHERE essay_id=?").bind(essayId),
          env.ESSAY_DB.prepare("DELETE FROM analysis_runs WHERE essay_id=?").bind(essayId),
          env.ESSAY_DB.prepare("DELETE FROM source_snapshots WHERE essay_id=?").bind(essayId),
          env.ESSAY_DB.prepare("DELETE FROM assets WHERE essay_id=?").bind(essayId),
          env.ESSAY_DB.prepare("DELETE FROM essays WHERE id=? AND owner_id=?").bind(essayId, ownerId),
        ]);
        return success({ deleted: true, deletedAssets: assets.results.length });
      }

      if (path.length === 2 && method === "PATCH") {
        const input = await body(request);
        if (input.version !== essay.version) return failure("VERSION_CONFLICT", "数据已被其他页面更新", 409, essay);
        const originalText = typeof input.originalText === "string" ? input.originalText : essay.originalText as string;
        const changedText = originalText !== essay.originalText;
        await env.ESSAY_DB.batch([
          env.ESSAY_DB.prepare("UPDATE essays SET title=?,author=?,original_text=?,original_text_sha256=?,source_name=?,copyright_notice=?,publication_copy=?,version=version+1,updated_at=? WHERE id=? AND version=?")
            .bind(input.title ?? essay.title, input.author ?? essay.author, originalText, await sha256(originalText), input.sourceName ?? essay.sourceName, input.copyrightNotice ?? essay.copyrightNotice, input.publicationCopy ?? essay.publicationCopy, now(), essayId, input.version),
          ...(changedText ? [env.ESSAY_DB.prepare("UPDATE cards SET source_status='source_stale',version=version+1,updated_at=? WHERE essay_id=?").bind(now(), essayId)] : []),
        ]);
        return success(await getEssay(env.ESSAY_DB, essayId, ownerId));
      }

      if (path[2] === "analysis-runs" && path.length === 3 && method === "POST") {
        await enforceRateLimit(env.ESSAY_DB, ownerId, "deepseek_analysis", DEEPSEEK_ANALYSIS_LIMIT, DEEPSEEK_ANALYSIS_WINDOW_SECONDS);
        const runId = id(); const started = now(); const model = env.DEEPSEEK_MODEL || "deepseek-chat";
        await env.ESSAY_DB.prepare("INSERT INTO analysis_runs (id,essay_id,scope,model,prompt_version,status,request_json,created_at,started_at) VALUES (?,?,?,?,?,'running','{}',?,?)").bind(runId, essayId, "essay", model, "1.0", started, started).run();
        try {
          const raw = await callDeepSeek(env, essay); const proposals = resolveProposals(essay.originalText as string, raw); const completed = now();
          const statements = [env.ESSAY_DB.prepare("DELETE FROM cards WHERE essay_id=?").bind(essayId)];
          proposals.forEach((card, position) => statements.push(env.ESSAY_DB.prepare("INSERT INTO cards (id,essay_id,kind,position,source_start,source_end,source_excerpt,editor_guide,scene_description,image_prompt,text_position_json,crop_json,template_settings_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .bind(id(), essayId, card.kind, position, card.sourceStart, card.sourceEnd, card.sourceExcerpt, card.editorGuide, card.sceneDescription, card.imagePrompt, JSON.stringify(defaultTextPositions[position === 0 ? 0 : 1]), JSON.stringify({ focalX: 50, focalY: 50, zoom: 1 }), JSON.stringify({ overlayOpacity: position === 0 ? .28 : .42, textColor: "#fffdf7", accentColor: "#d84a37", showAuthor: true, showEditorGuide: position > 0 && position < 5 }), completed, completed)));
          statements.push(env.ESSAY_DB.prepare("UPDATE essays SET status='editing',publication_copy=?,version=version+1,updated_at=? WHERE id=?").bind(String((raw as JsonRecord).publicationCopy || ""), completed, essayId));
          statements.push(env.ESSAY_DB.prepare("UPDATE analysis_runs SET status='succeeded',response_json=?,completed_at=? WHERE id=?").bind(JSON.stringify(raw), completed, runId));
          await env.ESSAY_DB.batch(statements);
          return success({ id: runId, essayId, status: "succeeded", cards: await listCards(env.ESSAY_DB, essayId) }, 201);
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEEPSEEK_REJECTED";
          await env.ESSAY_DB.prepare("UPDATE analysis_runs SET status='failed',error_code=?,error_message=?,completed_at=? WHERE id=?").bind(code, code, now(), runId).run();
          return failure(code, "AI 分析失败，未写入任何图卡", code === "DEEPSEEK_TIMEOUT" ? 504 : 422);
        }
      }

      if (path[2] === "cards" && path.length === 3 && method === "GET") return success(await listCards(env.ESSAY_DB, essayId));

      if (path[2] === "cards" && path[3] === "order" && method === "PUT") {
        const input = await body(request); if (!Array.isArray(input.orderedCardIds)) return failure("VALIDATION_ERROR", "缺少图卡顺序", 400);
        const existingCards = await listCards(env.ESSAY_DB, essayId);
        if (input.orderedCardIds.length !== existingCards.length || new Set(input.orderedCardIds).size !== existingCards.length || input.orderedCardIds.some((cardId) => !existingCards.some((card: ReturnType<typeof mapCard>) => card.id === cardId))) return failure("VALIDATION_ERROR", "图卡顺序不完整", 400);
        await env.ESSAY_DB.batch(input.orderedCardIds.map((cardId, position) => env.ESSAY_DB.prepare("UPDATE cards SET position=? WHERE id=? AND essay_id=?").bind(-position - 1, cardId, essayId)));
        await env.ESSAY_DB.batch(input.orderedCardIds.map((cardId, position) => env.ESSAY_DB.prepare("UPDATE cards SET position=?,version=version+1,updated_at=? WHERE id=? AND essay_id=?").bind(position, now(), cardId, essayId)));
        return success(await listCards(env.ESSAY_DB, essayId));
      }

      if (path[2] === "cards" && path.length === 4) {
        const cardId = path[3]; const row = await env.ESSAY_DB.prepare("SELECT * FROM cards WHERE id=? AND essay_id=?").bind(cardId, essayId).first<JsonRecord>();
        if (!row) return failure("NOT_FOUND", "图卡不存在", 404); const card = mapCard(row);
        if (method === "DELETE") {
          await env.ESSAY_DB.prepare("DELETE FROM cards WHERE id=? AND essay_id=?").bind(cardId, essayId).run();
          const remaining = await listCards(env.ESSAY_DB, essayId);
          await env.ESSAY_DB.batch(remaining.map((item: ReturnType<typeof mapCard>, position) => env.ESSAY_DB.prepare("UPDATE cards SET position=?,version=version+1,updated_at=? WHERE id=?").bind(position, now(), item.id)));
          const assetIds = [card.sourceAssetId, card.renderedAssetId].filter((assetId): assetId is string => Boolean(assetId));
          for (const assetId of new Set(assetIds)) {
            const asset = await env.ESSAY_DB.prepare("SELECT a.id,a.r2_key FROM assets a WHERE a.id=? AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.source_asset_id=a.id OR c.rendered_asset_id=a.id)").bind(assetId).first<{ id: string; r2_key: string }>();
            if (!asset) continue;
            try { await env.ESSAY_ASSETS.delete(asset.r2_key); await env.ESSAY_DB.prepare("DELETE FROM assets WHERE id=?").bind(asset.id).run(); }
            catch { console.error(JSON.stringify({ event: "asset_cleanup_failed", essayId, cardId, assetId })); }
          }
          responseStatus = 204;
          return new Response(null, { status: 204 });
        }
        if (method === "PATCH") {
          const input = await body(request); if (input.version !== card.version) return failure("VERSION_CONFLICT", "图卡已更新", 409, card);
          const excerptInput = typeof input.sourceExcerpt === "string" ? input.sourceExcerpt : card.sourceExcerpt as string;
          const sourceMatch = findSourceExcerpt(essay.originalText as string, excerptInput);
          if (!sourceMatch) return failure("SOURCE_NOT_FOUND", "短摘正文不在原文中；请仅修改长度、换行或标点", 422);
          await env.ESSAY_DB.prepare("UPDATE cards SET source_start=?,source_end=?,source_excerpt=?,editor_guide=?,scene_description=?,image_prompt=?,text_position_json=?,crop_json=?,template_settings_json=?,source_asset_id=?,rendered_asset_id=?,source_status='valid',version=version+1,updated_at=? WHERE id=? AND version=?")
            .bind(sourceMatch.start, sourceMatch.end, sourceMatch.excerpt, input.editorGuide ?? card.editorGuide, input.sceneDescription ?? card.sceneDescription, input.imagePrompt ?? card.imagePrompt, JSON.stringify(input.textPosition ?? card.textPosition), JSON.stringify(input.crop ?? card.crop), JSON.stringify(input.templateSettings ?? card.templateSettings), input.sourceAssetId === undefined ? card.sourceAssetId : input.sourceAssetId, input.renderedAssetId === undefined ? card.renderedAssetId : input.renderedAssetId, now(), cardId, input.version).run();
          const updated = await env.ESSAY_DB.prepare("SELECT * FROM cards WHERE id=?").bind(cardId).first<JsonRecord>(); return success(mapCard(updated!));
        }
      }

      if (path[2] === "cards" && path.length === 5 && path[4] === "regenerate" && method === "POST") {
        const cardId = path[3]; const row = await env.ESSAY_DB.prepare("SELECT * FROM cards WHERE id=? AND essay_id=?").bind(cardId, essayId).first<JsonRecord>();
        if (!row) return failure("NOT_FOUND", "图卡不存在", 404); const card = mapCard(row); const input = await body(request);
        if (input.version !== card.version) return failure("VERSION_CONFLICT", "图卡已更新", 409, card);
        await enforceRateLimit(env.ESSAY_DB, ownerId, "deepseek_analysis", DEEPSEEK_ANALYSIS_LIMIT, DEEPSEEK_ANALYSIS_WINDOW_SECONDS);
        const runId = id(); const started = now(); const model = env.DEEPSEEK_MODEL || "deepseek-chat";
        await env.ESSAY_DB.prepare("INSERT INTO analysis_runs (id,essay_id,scope,target_card_id,model,prompt_version,status,request_json,created_at,started_at) VALUES (?,?,?,?,?,?,'running','{}',?,?)").bind(runId, essayId, "card", cardId, model, "1.0", started, started).run();
        try {
          const generated = await callDeepSeekCard(env, essay, card, typeof input.instruction === "string" ? input.instruction.slice(0, 1000) : ""); const completed = now();
          await env.ESSAY_DB.batch([
            env.ESSAY_DB.prepare("UPDATE cards SET editor_guide=?,scene_description=?,image_prompt=?,version=version+1,updated_at=? WHERE id=? AND essay_id=? AND version=?").bind(generated.editorGuide, generated.sceneDescription, generated.imagePrompt, completed, cardId, essayId, input.version),
            env.ESSAY_DB.prepare("UPDATE analysis_runs SET status='succeeded',response_json=?,completed_at=? WHERE id=?").bind(JSON.stringify(generated), completed, runId),
          ]);
          const updated = await env.ESSAY_DB.prepare("SELECT * FROM cards WHERE id=? AND essay_id=?").bind(cardId, essayId).first<JsonRecord>(); return success(mapCard(updated!));
        } catch (error) {
          const code = error instanceof Error ? error.message : "DEEPSEEK_REJECTED";
          await env.ESSAY_DB.prepare("UPDATE analysis_runs SET status='failed',error_code=?,error_message=?,completed_at=? WHERE id=?").bind(code, code, now(), runId).run();
          return failure(code, "单卡重新生成失败，原图卡未被修改", code === "DEEPSEEK_TIMEOUT" ? 504 : 422);
        }
      }

      if (path[2] === "prompts" && path.length === 3 && method === "GET") return success((await listCards(env.ESSAY_DB, essayId)).map((card: ReturnType<typeof mapCard>) => ({ cardId: card.id, position: card.position, kind: card.kind, prompt: card.imagePrompt })));
      if (path[2] === "prompts.md" && method === "GET") {
        const cards = await listCards(env.ESSAY_DB, essayId); const markdown = `# 《${essay.title}》生图提示词\n\n${cards.map((card: ReturnType<typeof mapCard>) => `## ${Number(card.position)+1} · ${card.kind}\n\n${card.imagePrompt}`).join("\n\n---\n\n")}`;
        return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(essay.title))}-prompts.md` } });
      }

      if (path[2] === "assets" && path.length === 3 && method === "GET") return success(await listAssets(env.ESSAY_DB, essayId));
      if (path[2] === "assets" && path.length === 3 && method === "POST") {
        const form = await request.formData(); const file = form.get("file"); const purpose = String(form.get("purpose") || "source_image");
        if (!(file instanceof File)) return failure("VALIDATION_ERROR", "缺少图片文件", 400);
        if (!["source_image", "rendered_image", "export_bundle"].includes(purpose)) return failure("VALIDATION_ERROR", "资源用途无效", 400);
        if (file.size > 10 * 1024 * 1024) return failure("FILE_TOO_LARGE", "单张图片不能超过 10 MB", 413);
        const buffer = await file.arrayBuffer(); const info = readImageInfo(buffer);
        if (purpose === "export_bundle") return failure("UNSUPPORTED_MEDIA_TYPE", "ZIP 发布包请使用导出接口", 415);
        if (!info || info.mimeType !== file.type) return failure("UNSUPPORTED_MEDIA_TYPE", "文件内容与图片格式不符", 415);
        if (!info.width || !info.height || info.width * info.height > 40000000) return failure("IMAGE_TOO_LARGE", "图片像素不能超过 4000 万", 413);
        await enforceRateLimit(env.ESSAY_DB, ownerId, "asset_upload", 300, 86400);
        const assetId = id(); const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]; const r2Key = `owners/${await sha256(ownerId)}/essays/${essayId}/${purpose}/${assetId}.${extension}`;
        const originalFilename = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 240) || `upload.${extension}`;
        await env.ESSAY_ASSETS.put(r2Key, buffer, { httpMetadata: { contentType: file.type }, customMetadata: { originalFilename, width: String(info.width), height: String(info.height) } });
        try { await env.ESSAY_DB.prepare("INSERT INTO assets (id,essay_id,purpose,r2_key,original_filename,mime_type,byte_size,width,height,sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(assetId, essayId, purpose, r2Key, originalFilename, file.type, file.size, info.width, info.height, await sha256(buffer), now()).run(); }
        catch (error) { await env.ESSAY_ASSETS.delete(r2Key); throw error; }
        const asset = await env.ESSAY_DB.prepare("SELECT * FROM assets WHERE id=?").bind(assetId).first<JsonRecord>(); return success({ asset: mapAsset(asset!) }, 201);
      }

      if (path[2] === "export-manifest" && method === "GET") {
        const cards = await listCards(env.ESSAY_DB, essayId); if (cards.some((card: ReturnType<typeof mapCard>) => !card.renderedAssetId)) return failure("VALIDATION_ERROR", "仍有图卡未上传渲染结果", 422);
        return success({ essay: { id: essay.id, title: essay.title, author: essay.author, publicationCopy: essay.publicationCopy }, cards });
      }
    }

    if (path[0] === "assets" && path.length === 2 && method === "DELETE") {
      const row = await env.ESSAY_DB.prepare("SELECT a.id,a.r2_key FROM assets a JOIN essays e ON e.id=a.essay_id WHERE a.id=? AND e.owner_id=? AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.source_asset_id=a.id OR c.rendered_asset_id=a.id)").bind(path[1], ownerId).first<JsonRecord>();
      if (!row) return failure("NOT_FOUND", "资源不存在或仍被图卡使用", 404);
      await env.ESSAY_ASSETS.delete(String(row.r2_key));
      await env.ESSAY_DB.prepare("DELETE FROM assets WHERE id=?").bind(path[1]).run();
      return success({ deleted: true });
    }

    if (path[0] === "assets" && path[2] === "content" && method === "GET") {
      const row = await env.ESSAY_DB.prepare("SELECT a.r2_key,a.mime_type,a.sha256 FROM assets a JOIN essays e ON e.id=a.essay_id WHERE a.id=? AND e.owner_id=?").bind(path[1], ownerId).first<JsonRecord>();
      if (!row) return failure("NOT_FOUND", "资源不存在", 404); const object = await env.ESSAY_ASSETS.get(String(row.r2_key));
      if (!object) return failure("NOT_FOUND", "R2 对象不存在", 404);
      return new Response(object.body, { headers: { "content-type": String(row.mime_type), etag: String(row.sha256), "cache-control": "private, max-age=3600" } });
    }

    return failure("NOT_FOUND", "API 路径不存在", 404);
  } catch (error) {
    console.error(JSON.stringify({ event: "api_error", requestId, route: url.pathname, method, code: error instanceof Error ? error.message : "UNKNOWN" }));
    if (error instanceof RateLimitError) {
      const message = error.action === "deepseek_analysis"
        ? `全文已索引，但六卡生成在当前小时已达到 ${error.limit} 次安全额度。请稍后重试，候选全文不会丢失。`
        : "请求过于频繁，请稍后再试";
      return failure("RATE_LIMITED", message, 429, { action: error.action, limit: error.limit, windowSeconds: error.windowSeconds });
    }
    const code = error instanceof Error && error.message.startsWith("INVALID_") ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
    return failure(code, code === "VALIDATION_ERROR" ? "请求参数不完整或格式错误" : "服务暂时不可用", code === "VALIDATION_ERROR" ? 400 : 500);
  } finally {
    console.log(JSON.stringify({ event: "api_request", requestId, route: url.pathname, method, status: responseStatus, durationMs: Date.now() - startedAt, owner: ownerId ? await sha256(ownerId) : "anonymous" }));
  }
};
