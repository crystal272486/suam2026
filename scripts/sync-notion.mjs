import fs from "node:fs/promises";
import path from "node:path";

const NOTION_TOKEN = (process.env.NOTION_TOKEN || "").trim();
const NOTION_DATABASE_ID = normalizeId(process.env.NOTION_DATABASE_ID || "");
const NOTION_DATA_SOURCE_ID = normalizeId(process.env.NOTION_DATA_SOURCE_ID || "");
const NOTION_VERSION = "2026-03-11";

if (!NOTION_TOKEN) {
  throw new Error("GitHub Secret NOTION_TOKEN이 없습니다.");
}
if (!NOTION_DATABASE_ID && !NOTION_DATA_SOURCE_ID) {
  throw new Error("GitHub Secret NOTION_DATABASE_ID 또는 NOTION_DATA_SOURCE_ID가 없습니다.");
}

const dataSourceId = await resolveDataSourceId();
console.log(`사용할 Notion data source: ${dataSourceId}`);

const pages = await queryAllPages(dataSourceId);
const works = pages
  .map((page, index) => pageToWork(page, index))
  .sort(sortWorks);

const outputPath = path.join(process.cwd(), "data", "class1.json");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  JSON.stringify(works, null, 2) + "\n",
  "utf8"
);

console.log(`동기화 완료: ${works.length}건 → ${outputPath}`);

async function resolveDataSourceId() {
  if (NOTION_DATA_SOURCE_ID) return NOTION_DATA_SOURCE_ID;

  const database = await notionRequest(`/v1/databases/${NOTION_DATABASE_ID}`, {
    method: "GET"
  });

  const sources = Array.isArray(database.data_sources)
    ? database.data_sources
    : [];

  const first = sources[0];
  if (first?.id) return normalizeId(first.id);

  // 일부 단일 데이터 원본은 데이터베이스 ID와 데이터 원본 ID가 같을 수 있어 확인합니다.
  try {
    await notionRequest(`/v1/data_sources/${NOTION_DATABASE_ID}`, {
      method: "GET"
    });
    return NOTION_DATABASE_ID;
  } catch {
    throw new Error(
      "데이터 원본 ID를 자동으로 찾지 못했습니다. " +
      "Notion 데이터베이스를 연결에 공유했는지 확인하거나 " +
      "GitHub Secret NOTION_DATA_SOURCE_ID를 추가해 주세요."
    );
  }
}

async function queryAllPages(dataSourceId) {
  const results = [];
  let startCursor;

  do {
    const body = { page_size: 100 };
    if (startCursor) body.start_cursor = startCursor;

    const response = await notionRequest(
      `/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );

    results.push(...(response.results || []));
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);

  return results;
}

async function notionRequest(endpoint, options = {}) {
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

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const detail = payload.message || payload.code || `HTTP ${response.status}`;
    throw new Error(`Notion API 오류: ${detail}`);
  }

  return payload;
}

function pageToWork(page, index) {
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
      return Array.isArray(value)
        ? value.map((entry) => entry.name).filter(Boolean).join(", ")
        : "";

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
        ? value
            .map((file) => file.file?.url || file.external?.url || "")
            .filter(Boolean)
        : [];

    case "people":
      return Array.isArray(value)
        ? value
            .map((person) => person.name || person.person?.email || person.id)
            .filter(Boolean)
            .join(", ")
        : "";

    case "relation":
      return Array.isArray(value)
        ? value.map((entry) => entry.id).join(", ")
        : "";

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
      return value
        ? `${value.prefix ? value.prefix + "-" : ""}${value.number ?? ""}`
        : "";

    default:
      if (Array.isArray(value)) return value.map(String).join(", ");
      if (value && typeof value === "object") return JSON.stringify(value);
      return value ?? "";
  }
}

function richTextToPlain(items) {
  return Array.isArray(items)
    ? items
        .map((entry) => entry.plain_text || entry.text?.content || "")
        .join("")
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
  if (value.type === "array") {
    return value.array
      .map(propertyToValue)
      .filter((entry) => entry !== "")
      .join(", ");
  }
  return "";
}

function sortWorks(a, b) {
  return (
    Number(a._groupNumber || 999) - Number(b._groupNumber || 999) ||
    String(a["게임 이름"] || "").localeCompare(
      String(b["게임 이름"] || ""),
      "ko"
    )
  );
}

function normalizeId(value) {
  return String(value || "").replaceAll("-", "").trim();
}
