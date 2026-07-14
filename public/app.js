const state = {
  works: [],
  selectedGroup: "전체",
  query: "",
  source: "csv",
  warning: ""
};

const els = {
  cardGrid: document.querySelector("#card-grid"),
  groupTabs: document.querySelector("#group-tabs"),
  searchInput: document.querySelector("#search-input"),
  clearButton: document.querySelector("#clear-button"),
  refreshButton: document.querySelector("#refresh-button"),
  resultCount: document.querySelector("#result-count"),
  emptyState: document.querySelector("#empty-state"),
  notice: document.querySelector("#notice"),
  sourceDot: document.querySelector("#source-dot"),
  sourceLabel: document.querySelector("#source-label"),
  sourceDetail: document.querySelector("#source-detail"),
  statTeams: document.querySelector("#stat-teams"),
  statGames: document.querySelector("#stat-games"),
  statGenres: document.querySelector("#stat-genres"),
  dialog: document.querySelector("#detail-dialog"),
  dialogContent: document.querySelector("#dialog-content"),
  dialogClose: document.querySelector("#dialog-close")
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadWorks(false);
});

function bindEvents() {
  els.searchInput.addEventListener("input", event => {
    state.query = event.target.value.trim();
    renderCards();
  });

  els.clearButton.addEventListener("click", () => {
    state.query = "";
    state.selectedGroup = "전체";
    els.searchInput.value = "";
    updateUrl();
    renderTabs();
    renderCards();
  });

  els.refreshButton.addEventListener("click", () => loadWorks(true));
  els.dialogClose.addEventListener("click", closeDialog);

  els.dialog.addEventListener("click", event => {
    if (event.target === els.dialog) closeDialog();
  });

  window.addEventListener("popstate", applyUrlState);
}

async function loadWorks(forceRefresh) {
  setLoading(true);

  try {
    const response = await fetch(`/api/works${forceRefresh ? "?refresh=1" : ""}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    state.works = Array.isArray(payload.works) ? payload.works : [];
    state.source = payload.source || "csv";
    state.warning = payload.warning || "";
  } catch {
    state.works = Array.isArray(window.SAMPLE_WORKS) ? window.SAMPLE_WORKS : [];
    state.source = "csv";
    state.warning = "현재는 업로드된 CSV 미리보기 자료를 표시합니다. 서버에서 실행하면 노션과 자동 연동됩니다.";
  }

  applyUrlState();
  renderAll();
  setLoading(false);
}

function setLoading(isLoading) {
  els.refreshButton.disabled = isLoading;
  els.refreshButton.textContent = isLoading ? "자료 확인 중..." : "최신 자료 새로고침";
}

function renderAll() {
  renderSourceStatus();
  renderStats();
  renderTabs();
  renderCards();
}

function renderSourceStatus() {
  els.sourceDot.className = "status-card__dot";

  if (state.source === "notion") {
    els.sourceDot.classList.add("is-live");
    els.sourceLabel.textContent = "Notion 자동 연동 중";
    els.sourceDetail.textContent = "노션에서 수정한 최신 자료를 표시합니다.";
  } else {
    els.sourceDot.classList.add("is-fallback");
    els.sourceLabel.textContent = "CSV 미리보기 모드";
    els.sourceDetail.textContent = "노션 토큰 설정 전에도 현재 자료를 확인할 수 있습니다.";
  }

  if (state.warning) {
    els.notice.hidden = false;
    els.notice.textContent = state.warning;
  } else {
    els.notice.hidden = true;
    els.notice.textContent = "";
  }
}

function renderStats() {
  const groups = uniqueSorted(state.works.map(item => item.조).filter(Boolean));
  const genres = new Set();

  for (const work of state.works) {
    splitTerms(work["게임 장르"]).forEach(genre => genres.add(genre));
  }

  els.statTeams.textContent = groups.length;
  els.statGames.textContent = state.works.length;
  els.statGenres.textContent = genres.size;
}

function renderTabs() {
  const groups = uniqueSorted(state.works.map(item => item.조).filter(Boolean));
  const tabs = ["전체", ...groups];

  els.groupTabs.innerHTML = tabs.map(group => {
    const active = group === state.selectedGroup;
    return `
      <button
        class="group-tab${active ? " is-active" : ""}"
        type="button"
        role="tab"
        aria-selected="${active}"
        data-group="${escapeAttr(group)}"
      >${escapeHtml(group)}</button>
    `;
  }).join("");

  els.groupTabs.querySelectorAll(".group-tab").forEach(button => {
    button.addEventListener("click", () => {
      state.selectedGroup = button.dataset.group;
      updateUrl();
      renderTabs();
      renderCards();
    });
  });
}

function renderCards() {
  const query = normalizeText(state.query);

  const filtered = state.works.filter(work => {
    const groupMatches = state.selectedGroup === "전체" || work.조 === state.selectedGroup;
    if (!groupMatches) return false;
    if (!query) return true;

    const haystack = [
      work["게임 이름"],
      work["팀 이름"],
      work["팀 구성원"],
      work["게임 장르"],
      work["한 줄 소개"],
      work["배경 이야기"]
    ].map(normalizeText).join(" ");

    return haystack.includes(query);
  });

  els.resultCount.textContent = `${filtered.length}개의 작품을 보여주고 있습니다.`;
  els.emptyState.hidden = filtered.length !== 0;
  els.cardGrid.hidden = filtered.length === 0;
  els.cardGrid.innerHTML = filtered.map(createCard).join("");

  els.cardGrid.querySelectorAll(".game-card").forEach(card => {
    card.addEventListener("click", () => openDialog(card.dataset.id));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDialog(card.dataset.id);
      }
    });
  });
}

function createCard(work, index) {
  const accents = ["#dceef1", "#f9dfbc", "#dfe9d5", "#eadff2", "#f3d9d6"];
  const accent = accents[index % accents.length];

  return `
    <article
      class="game-card"
      tabindex="0"
      role="button"
      aria-label="${escapeAttr(work["게임 이름"] || "작품")} 상세보기"
      data-id="${escapeAttr(work._id)}"
      style="--card-accent:${accent}"
    >
      <div class="card-topline">
        <span class="group-badge">${escapeHtml(work.조 || "조 미정")}</span>
        <span class="genre-badge">${escapeHtml(work["게임 장르"] || "장르 미정")}</span>
      </div>

      <h3>${escapeHtml(work["게임 이름"] || "이름 없는 작품")}</h3>
      <p class="card-intro">${escapeHtml(firstValue(
        work["한 줄 소개"],
        work["최종 목표"],
        work["배경 이야기"],
        "친구들이 만든 창의적인 게임입니다."
      ))}</p>

      <div class="card-meta">
        <div class="card-meta__row">
          <span class="card-meta__label">팀 이름</span>
          <span class="card-meta__value">${escapeHtml(work["팀 이름"] || "미정")}</span>
        </div>
        <div class="card-meta__row">
          <span class="card-meta__label">구성원</span>
          <span class="card-meta__value">${escapeHtml(work["팀 구성원"] || "미입력")}</span>
        </div>
        <div class="card-meta__row">
          <span class="card-meta__label">게임 시간</span>
          <span class="card-meta__value">${escapeHtml(formatMinutes(work["게임 시간(분)"]))}</span>
        </div>
      </div>

      <div class="card-link">
        <span>자세히 보기</span>
        <span aria-hidden="true">→</span>
      </div>
    </article>
  `;
}

function openDialog(id) {
  const work = state.works.find(item => String(item._id) === String(id));
  if (!work) return;

  els.dialogContent.innerHTML = createDetail(work);
  els.dialog.showModal();
  document.body.style.overflow = "hidden";

  const params = new URLSearchParams(location.search);
  params.set("item", work._id);
  history.replaceState(null, "", `${location.pathname}?${params.toString()}${location.hash}`);
}

function closeDialog() {
  if (els.dialog.open) els.dialog.close();
  document.body.style.overflow = "";

  const params = new URLSearchParams(location.search);
  params.delete("item");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function createDetail(work) {
  const steps = collectNumbered(work, "게임 방법 ", "단계", 5);
  const rules = collectNumbered(work, "규칙 ", "", 5);
  const characters = [
    ["주인공", work["주인공(이름/특징/역할)"]],
    ["캐릭터 1", work["캐릭터1(이름/특징/역할)"]],
    ["캐릭터 2", work["캐릭터2(이름/특징/역할)"]],
    ["캐릭터 3", work["캐릭터3(이름/특징/역할)"]]
  ].filter(([, value]) => hasValue(value));

  const storySections = [
    ["게임 목표", firstValue(work["게임 목표(기타)"], work["게임 목표(선택)"], work["최종 목표"])],
    ["배경 이야기", work["배경 이야기"]],
    ["최종 목표", work["최종 목표"]],
    ["승리 조건", work["승리 조건(설명)"]],
    ["피하거나 이기는 방법", work["피하거나 이기는 방법"]],
    ["엔딩", work["엔딩 내용"]]
  ].filter(([, value]) => hasValue(value));

  const challengeSections = [
    ["악당·함정", work["악당/함정 이름·종류"]],
    ["방해 내용", work["악당/함정 방해 내용"]],
    ["특별 아이템·규칙", work["특별 아이템/규칙"]],
    ["재미 요소", joinValues(work["재미 요소(선택)"], work["재미 요소(자세히)"])],
    ["점수 획득 방식", work["점수 획득 방식(선택)"]],
    ["점수 계산 방법", work["점수 계산 방법(설명)"]]
  ].filter(([, value]) => hasValue(value));

  return `
    <div class="detail-hero">
      <div class="detail-hero__badges">
        <span class="group-badge">${escapeHtml(work.조 || "조 미정")}</span>
        <span class="genre-badge">${escapeHtml(work["게임 장르"] || "장르 미정")}</span>
      </div>
      <h2>${escapeHtml(work["게임 이름"] || "이름 없는 작품")}</h2>
      <p>${escapeHtml(firstValue(
        work["한 줄 소개"],
        work["배경 이야기"],
        "친구들이 만든 창의적인 게임 작품입니다."
      ))}</p>
    </div>

    <div class="detail-main">
      <div class="detail-summary">
        ${summaryChip("팀 이름", work["팀 이름"] || "미정")}
        ${summaryChip("팀 구성원", work["팀 구성원"] || "미입력")}
        ${summaryChip("대상 연령", work["대상 연령"] || "미입력")}
        ${summaryChip("게임 시간", formatMinutes(work["게임 시간(분)"]))}
      </div>

      ${renderBoxSection("작품 이야기", storySections)}
      ${renderNumberedSection("게임 방법", steps)}
      ${renderNumberedSection("게임 규칙", rules)}
      ${renderBoxSection("캐릭터", characters)}
      ${renderBoxSection("도전과 재미 요소", challengeSections)}
      ${renderReasonSection(work)}

      ${work._notionUrl ? `
        <a class="notion-open" href="${escapeAttr(work._notionUrl)}" target="_blank" rel="noopener noreferrer">
          노션 원본 페이지 열기 →
        </a>
      ` : ""}
    </div>
  `;
}

function renderBoxSection(title, entries) {
  if (!entries.length) return "";

  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="detail-grid">
        ${entries.map(([label, value]) => `
          <div class="detail-box">
            <span class="detail-box__label">${escapeHtml(label)}</span>
            <p>${escapeHtml(String(value))}</p>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderNumberedSection(title, items) {
  if (!items.length) return "";

  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <ol class="detail-list">
        ${items.map((item, index) => `
          <li data-number="${index + 1}">${escapeHtml(String(item))}</li>
        `).join("")}
      </ol>
    </section>
  `;
}

function renderReasonSection(work) {
  const reason = joinValues(
    work["만든 이유(선택)"],
    work["만든 이유(기타)"],
    work["만든 이유(자세히)"]
  );

  if (!hasValue(reason)) return "";

  return `
    <section class="detail-section">
      <h3>이 작품을 만든 이유</h3>
      <p>${escapeHtml(reason)}</p>
    </section>
  `;
}

function summaryChip(label, value) {
  return `
    <div class="summary-chip">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function collectNumbered(work, prefix, suffix, max) {
  const items = [];
  for (let i = 1; i <= max; i += 1) {
    const value = work[`${prefix}${i}${suffix}`];
    if (hasValue(value)) items.push(value);
  }
  return items;
}

function applyUrlState() {
  const params = new URLSearchParams(location.search);
  const group = params.get("group");
  const item = params.get("item");

  if (group && state.works.some(work => work.조 === group)) {
    state.selectedGroup = group;
  } else if (!group) {
    state.selectedGroup = "전체";
  }

  if (item && !els.dialog.open) {
    requestAnimationFrame(() => openDialog(item));
  }

  if (state.works.length) {
    renderTabs();
    renderCards();
  }
}

function updateUrl() {
  const params = new URLSearchParams(location.search);

  if (state.selectedGroup === "전체") params.delete("group");
  else params.set("group", state.selectedGroup);

  params.delete("item");
  const query = params.toString();
  history.pushState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => {
    const aNo = Number(String(a).match(/\d+/)?.[0] || 999);
    const bNo = Number(String(b).match(/\d+/)?.[0] || 999);
    return aNo - bNo || String(a).localeCompare(String(b), "ko");
  });
}

function splitTerms(value) {
  if (!hasValue(value)) return [];
  return String(value).split(/[,/·]/).map(item => item.trim()).filter(Boolean);
}

function formatMinutes(value) {
  if (!hasValue(value)) return "미입력";
  const number = Number(value);
  return Number.isFinite(number) ? `${number}분` : String(value);
}

function joinValues(...values) {
  return values.filter(hasValue).map(String).join(" · ");
}

function firstValue(...values) {
  return values.find(hasValue) || "";
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function normalizeText(value) {
  return String(value || "").toLocaleLowerCase("ko").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
