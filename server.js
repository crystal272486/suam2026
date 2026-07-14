require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NOTION_VERSION = "2026-03-11";
const NOTION_TOKEN = (process.env.NOTION_TOKEN || "").trim();
const NOTION_DATABASE_ID = normalizeId(process.env.NOTION_DATABASE_ID || "");
const NOTION_DATA_SOURCE_ID = normalizeId(process.env.NOTION_DATA_SOURCE_ID || "");
const CACHE_SECONDS = Math.max(0, Number(process.env.CACHE_SECONDS || 60));
const sampleWorks = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "sample.json"), "utf8")
);

let cache = { savedAt: 0, data: null, source: "csv", warning: "" };

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"], etag: true, maxAge: "5m"
}));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    notionConfigured: Boolean(NOTION_TOKEN && (NOTION_DATABASE_ID || NOTION_DATA_SOURCE_ID)),
    notionVersion: NOTION_VERSION,
    cachedAt: cache.savedAt ? new Date(cache.savedAt).toISOString() : null
  });
});

app.get("/api/works", async (req, res) => {
  const forceRefresh = req.query.refresh === "1";
  const now = Date.now();

  if (!forceRefresh && cache.data && now - cache.savedAt < CACHE_SECONDS * 1000) {
    return res.json({
      ok: true, source: cache.source, warning: cache.warning,
      updatedAt: new Date(cache.savedAt).toISOString(),
      count: cache.data.length, works: cache.data
    });
  }

  if (!NOTION_TOKEN || (!NOTION_DATABASE_ID && !NOTION_DATA_SOURCE_ID)) {
    const warning = "노션 연결 정보가 없어 업로드된 CSV 미리보기 자료를 표시합니다.";
    cache = { savedAt: now, data: sampleWorks, source: "csv", warning };
    return res.json({
      ok: true, source: "csv", warning,
      updatedAt: new Date(now).toISOString(),
      count: sampleWorks.length, works: sampleWorks
    });
  }

  try {
    const works = await loadNotionWorks();
    cache = { savedAt: now, data: works, source: "notion", warning: "" };
    return res.json({
      ok: true, source: "notion", warning: "",
      updatedAt: new Date(now).toISOString(),
      count: works.length, works
    });
  } catch (error) {
    console.error("[Notion load error]", error);
    const warning = `노션 연동 오류로 CSV 미리보기를 표시합니다: ${safeErrorMessage(error)}`;
    cache = { savedAt: now, data: sampleWorks, source: "csv", warning };
    return res.json({
      ok: true, source: "csv", warning,
      updatedAt: new Date(now).toISOString(),
      count: sampleWorks.length, works: sampleWorks
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`수암초 작품 허브: http://localhost:${PORT}`);
});

async function loadNotionWorks() {
  const dataSourceId = await resolveDataSourceId();
  const pages = await queryAllPages(dataSourceId);

  return pages.map((page, index) => {
    const item = {};
    for (const [name, property] of Object.entries(page.properties || {})) {
      item[name] = propertyToValue(property);
    }
    item._id = page.id || `notion-${index + 1}`;
    item._notionUrl = page.public_url || page.url || "";
    item._lastEditedTime = page.last_edited_time || "";
    item.학년 = item.학년 || "6학년";
    item.반 = item.반 || "1반";
    const match = String(item.조 || "").match(/\d+/);
    item._groupNumber = match ? Number(match[0]) : 999;
    return item;
  }).sort((a, b) => (
    a._groupNumber - b._groupNumber ||
    String(a["게임 이름"] || "").localeCompare(String(b["게임 이름"] || ""), "ko")
  ));
}

async function resolveDataSourceId() {
  if (NOTION_DATA_SOURCE_ID) return NOTION_DATA_SOURCE_ID;
  if (!NOTION_DATABASE_ID) throw new Error("노션 데이터베이스 ID가 없습니다.");

  const database = await notionRequest(`/v1/databases/${NOTION_DATABASE_ID}`, { method: "GET" });
  const sources = [
    ...(Array.isArray(database.data_sources) ? database.data_sources : []),
    ...(Array.isArray(database.dataSources) ? database.dataSources : [])
  ];
  const first = sources.find(Boolean);
  if (first) return normalizeId(first.id || first.data_source_id || first);

  try {
    await notionRequest(`/v1/data_sources/${NOTION_DATABASE_ID}`, { method: "GET" });
    return NOTION_DATABASE_ID;
  } catch {
    throw new Error(".env의 NOTION_DATA_SOURCE_ID에 데이터 원본 ID를 입력해 주세요.");
  }
}

async function queryAllPages(dataSourceId) {
  const results = [];
  let startCursor;
  do {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const response = await notionRequest(`/v1/data_sources/${dataSourceId}/query`, {
      method: "POST", body: JSON.stringify(body)
    });
    results.push(...(response.results || []));
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);
  return results;
}

async function notionRequest(endpoint, options) {
  const response = await fetch(`https://api.notion.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { message: text }; }

  if (!response.ok) {
    throw new Error(payload.message || payload.code || `HTTP ${response.status}`);
  }
  return payload;
}

function propertyToValue(property) {
  if (!property || typeof property !== "object") return "";
  const type = property.type;
  const value = property[type];

  switch (type) {
    case "title":
    case "rich_text":
      return richTextToPlain(value);
    case "number":
      return value ?? "";
    case "select":
    case "status":
      return value?.name || "";
    case "multi_select":
      return Array.isArray(value) ? value.map(v => v.name).filter(Boolean).join(", ") : "";
    case "date":
      if (!value) return "";
      return value.end ? `${value.start} ~ ${value.end}` : value.start || "";
    case "checkbox":
      return Boolean(value);
    case "url":
    case "email":
    case "phone_number":
      return value || "";
    case "files":
      return Array.isArray(value)
        ? value.map(file => file.file?.url || file.external?.url || "").filter(Boolean)
        : [];
    case "people":
      return Array.isArray(value)
        ? value.map(person => person.name || person.person?.email || person.id).filter(Boolean).join(", ")
        : "";
    case "relation":
      return Array.isArray(value) ? value.map(item => item.id).join(", ") : "";
    case "formula":
      return formulaToValue(value);
    case "rollup":
      return rollupToValue(value);
    case "created_time":
    case "last_edited_time":
      return value || "";
    case "created_by":
    case "last_edited_by":
      return value?.name || value?.id || "";
    case "unique_id":
      return value ? `${value.prefix ? value.prefix + "-" : ""}${value.number ?? ""}` : "";
    default:
      if (Array.isArray(value)) return value.map(String).join(", ");
      if (value && typeof value === "object") return JSON.stringify(value);
      return value ?? "";
  }
}

function richTextToPlain(items) {
  return Array.isArray(items)
    ? items.map(item => item.plain_text || item.text?.content || "").join("")
    : "";
}

function formulaToValue(value) {
  if (!value) return "";
  if (value.type === "string") return value.string || "";
  if (value.type === "number") return value.number ?? "";
  if (value.type === "boolean") return Boolean(value.boolean);
  if (value.type === "date") return value.date?.start || "";
  return "";
}

function rollupToValue(value) {
  if (!value) return "";
  if (value.type === "number") return value.number ?? "";
  if (value.type === "date") return value.date?.start || "";
  if (value.type === "array") return value.array.map(propertyToValue).filter(v => v !== "").join(", ");
  return "";
}

function normalizeId(value) {
  return String(value || "").replace(/-/g, "").trim();
}

function safeErrorMessage(error) {
  return String(error?.message || error || "알 수 없는 오류")
    .replace(/\s+/g, " ").slice(0, 240);
}
