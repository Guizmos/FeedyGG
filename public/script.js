// Gestion des favoris côté front
let favoritesSet = new Set();

async function loadFavoritesFromApi() {
  try {
    const res = await fetch("/api/favorites");
    const data = await res.json();
    favoritesSet = new Set(data.favorites || []);
  } catch (err) {
    console.error("Erreur loadFavoritesFromApi:", err);
  }
}

async function addFavorite(guid) {
  const encoded = encodeURIComponent(guid);
  try {
    await fetch(`/api/favorites/${encoded}`, { method: "POST" });
    favoritesSet.add(guid); // on garde le guid "plein" dans le Set
  } catch (err) {
    console.error("Erreur addFavorite:", err);
  }
}

async function removeFavorite(guid) {
  const encoded = encodeURIComponent(guid);
  try {
    await fetch(`/api/favorites/${encoded}`, { method: "DELETE" });
    favoritesSet.delete(guid);
  } catch (err) {
    console.error("Erreur removeFavorite:", err);
  }
}

function isFavorite(guid) {
  return favoritesSet.has(guid);
}

// Thème global
function applyTheme(mode) {
  document.body.classList.remove("theme-light");

  if (mode === "light") {
    document.body.classList.add("theme-light");
  } else if (mode === "system") {
    const prefersLight = window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches;
    if (prefersLight) {
      document.body.classList.add("theme-light");
    }
  }
}

// Ajustement auto de la largeur des <select>
function autosizeSelect(select) {
  if (!select) return;

  const span = document.createElement("span");
  const style = window.getComputedStyle(select);

  span.style.visibility = "hidden";
  span.style.position = "fixed";
  span.style.whiteSpace = "nowrap";
  span.style.font = style.font;
  span.textContent =
    select.options[select.selectedIndex]?.textContent || "";

  document.body.appendChild(span);
  const width = span.getBoundingClientRect().width + 32;
  document.body.removeChild(span);

  select.style.width = width + "px";
}

// ============================================================================
// MAIN UI LOGIC
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  const categorySelect = document.getElementById("category-select");
  const limitSelect = document.getElementById("limit-select");
  const refreshBtn = document.getElementById("refresh-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const closeSettingsBtn = document.getElementById("close-settings");
  const overlay = document.getElementById("settings-overlay");
  const modal = document.getElementById("settings-modal");
  const resultsEl = document.getElementById("cards");
  const statsEl = document.getElementById("stats");
  const themeSelect = document.getElementById("theme-select");
  const headerEl = document.querySelector(".app-header");
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const emptyEl = document.getElementById("empty");
  const controlsEl = document.querySelector(".controls");
  const openLogsBtn = document.getElementById("open-logs");
  const logsOverlay = document.getElementById("logs-overlay");
  const logsModal = document.getElementById("logs-modal");
  const closeLogsBtn = document.getElementById("close-logs");
  const logsContent = document.getElementById("logs-content");
  const filtersContainer = document.getElementById("filters-container");
  const searchToggleBtn = document.getElementById("search-toggle");
  const searchContainer = document.getElementById("search-container");
  const searchInput = document.getElementById("search-input");
  const searchClearBtn = document.getElementById("search-clear");
  const filtersMiniBtn = document.getElementById("filters-mini");
  const defaultSortSelect = document.getElementById("default-sort-select");
  const defaultDateFilterSelect = document.getElementById("default-date-filter-select");
  const detailsOverlay = document.getElementById("details-overlay");
  const detailsModal = document.getElementById("details-modal");
  const detailsCloseBtn = document.getElementById("details-close");
  const detailsPosterEl = document.getElementById("details-poster");
  const detailsPosterFallback = document.getElementById("details-poster-fallback");
  const detailsTitleEl = document.getElementById("details-title");
  const detailsMetaEl = document.getElementById("details-meta");
  const detailsPlotEl = document.getElementById("details-plot");
  const detailsExtraEl = document.getElementById("details-extra");
  const detailsImdbLinkEl = document.getElementById("details-imdb-link");
  const dateFilterBtn = document.getElementById("date-filter-btn");
  const dateFilterPanel = document.getElementById("date-filter-panel");
  const activeDateFilterChip = document.getElementById("active-date-filter-chip");
  const DATE_FILTER_STORAGE_KEY = "dateFilterDays";
  const DATE_FILTER_DEFAULT_STORAGE_KEY = "defaultDateFilterDays";
  const detailsOriginalTitleEl = document.getElementById("details-original-title");
  const detailsOriginalToggle = document.getElementById("details-original-toggle");
  const settingsNavItems = document.querySelectorAll(".settings-nav-item");
  const settingsSections = document.querySelectorAll(".settings-section");
  const refreshIntervalSelect = document.getElementById("refresh-interval-select");
  const sortSelect = document.getElementById("sort-select");
  const sortDirectionBtn = document.getElementById("sort-direction-btn");
  const sortDirectionIcon = sortDirectionBtn?.querySelector(".sort-rotate-icon");
  const retentionDaysSelect = document.getElementById("retention-days-select");
  const cardSizeSelect = document.getElementById("card-size-select");
  const CARD_SIZE_STORAGE_KEY = "cardSize";
  const footerEl = document.getElementById("app-footer");
  const appVersionEl = document.getElementById("app-version");
  const lastSyncTextEl = document.getElementById("last-sync-text");
  const lastSyncValueEl = document.getElementById("last-sync-value");
  const cleanupPostersBtn = document.getElementById("cleanup-posters-btn");
  const cleanupPostersStatus = document.getElementById("cleanup-posters-status");

  let activeSettingsSection = "theme";
  let currentDateFilterDays = null;
  let defaultDateFilterDays = 0;
  let currentRetentionDays = null;
  let controlsCollapsed = false;
  let controlsManuallyExpanded = false;
  let refreshTimerId = null;
  let sortDirection = "desc";
  let currentSearch = "";

  const feedState = {
    mode: "single",
    categoryLabel: "",
    items: [],
    groups: [],
  };

  const FALLBACK_CATS = [
    { key: "all",        label: "Tout" },
    { key: "favorites",  label: "Favoris" },
    { key: "film",       label: "Films" },
    { key: "series",     label: "Séries TV" },
    { key: "emissions",  label: "Émissions TV" },
    { key: "spectacle",  label: "Spectacles" },
    { key: "animation",  label: "Animation" },
    { key: "games",      label: "Jeux vidéo" },
  ];

  const CATEGORY_LABELS = {
    film: "Film",
    series: "Série TV",
    emissions: "Émission TV",
    spectacle: "Spectacle",
    animation: "Animation",
    games: "Jeu vidéo",
  };

  const responsiveCards = [];

  // ---------------------------------------------------------------------------
  // Init thème / prefs
  // ---------------------------------------------------------------------------

  const savedTheme = localStorage.getItem("theme") || "system";
  applyTheme(savedTheme);
  if (themeSelect) {
    themeSelect.value = savedTheme;
  }

  themeSelect?.addEventListener("change", (e) => {
    const mode = e.target.value;
    localStorage.setItem("theme", mode);
    applyTheme(mode);
  });

  const savedDefaultSort = localStorage.getItem("defaultSort") || "seeders";
  if (defaultSortSelect) {
    defaultSortSelect.value = savedDefaultSort;
  }
  if (sortSelect) {
    sortSelect.value = savedDefaultSort;
  }

  const savedDefaultDateFilter =
    localStorage.getItem(DATE_FILTER_DEFAULT_STORAGE_KEY) || "0";

  if (defaultDateFilterSelect) {
    defaultDateFilterSelect.value = savedDefaultDateFilter;
  }

  defaultDateFilterDays = parseInt(savedDefaultDateFilter, 10);
  if (Number.isNaN(defaultDateFilterDays) || defaultDateFilterDays < 0) {
    defaultDateFilterDays = 0;
  }

  function updateSortDirectionButtonState() {
    if (!sortDirectionBtn || !categorySelect) return;
    const isAll = categorySelect.value === "all";
    sortDirectionBtn.disabled = isAll;
    sortDirectionBtn.classList.toggle("sort-direction-disabled", isAll);
  }

  function applyCardSize(size) {
    document.body.classList.remove("cards-size-compact", "cards-size-large");

    if (size === "compact") {
      document.body.classList.add("cards-size-compact");
    } else if (size === "large") {
      document.body.classList.add("cards-size-large");
    }
  }

  const savedCardSize = localStorage.getItem(CARD_SIZE_STORAGE_KEY) || "normal";
  applyCardSize(savedCardSize);
  if (cardSizeSelect) {
    cardSizeSelect.value = savedCardSize;
    autosizeSelect(cardSizeSelect);
  }

  function getDateFilterLabel(days) {
    switch (days) {
      case 1: return "24h";
      case 2: return "48h";
      case 3: return "3 jours";
      case 7: return "7 jours";
      default: return "";
    }
  }

  function getDateFilterDisplayLabel(days) {
    if (!days || days <= 0) return "Tous";
    return getDateFilterLabel(days) || "";
  }

  // ---------------------------------------------------------------------------
  // Cartes / affichage
  // ---------------------------------------------------------------------------

  function updateCardButtonMode(card) {
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const width = rect?.width || 0;

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth || 0;

    if (viewportWidth <= 370) {
      card.classList.remove("card--compact");
      card.classList.add("card--vertical");
      return;
    }

    const ICON_THRESHOLD = 380;

    if (width < ICON_THRESHOLD) {
      card.classList.add("card--compact");
    } else {
      card.classList.remove("card--compact");
    }

    card.classList.remove("card--vertical");
  }

  function setupCardResponsiveButtons(card) {
    if (!card) return;

    responsiveCards.push(card);
    updateCardButtonMode(card);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => updateCardButtonMode(card));
      ro.observe(card);
    }
  }

  window.addEventListener("resize", () => {
    responsiveCards.forEach(updateCardButtonMode);
  });

  async function initCategories() {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const cats = await res.json();
      fillCategorySelect(
        Array.isArray(cats) && cats.length ? cats : FALLBACK_CATS
      );
    } catch {
      fillCategorySelect(FALLBACK_CATS);
    }
  }

  function fillCategorySelect(cats) {
    categorySelect.innerHTML = "";
    cats.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = c.label;
      if (i === 0) opt.selected = true;
      categorySelect.appendChild(opt);
    });

    autosizeSelect(categorySelect);
    updateSortDirectionButtonState();
  }

  async function loadFeed(options = {}) {
    const { useMinSkeleton = false } = options;

    statsEl.textContent = "";
    errorEl.classList.add("hidden");
    emptyEl.classList.add("hidden");

    const hadCardsBefore = !!resultsEl.querySelector(".card");

    if (!hadCardsBefore) {
      // Premier chargement / F5 → on affiche direct le skeleton
      if (loadingEl) {
        loadingEl.classList.add("hidden");
      }
      renderSkeletonCards();
    } else {
      // Refresh / tri / filtre → skeleton sur les cartes existantes
      if (loadingEl) {
        loadingEl.classList.add("hidden");
      }
      const cards = resultsEl.querySelectorAll(".card");
      cards.forEach((card) => card.classList.add("card--loading"));
    }

    // On reset la recherche locale
    currentSearch = "";
    if (searchInput) {
      searchInput.value = "";
    }

    const category = categorySelect.value || "film";
    const sort = (sortSelect && sortSelect.value) || "seeders";

    const paramsObj = {
      category,
      limit: "all",
      sort,
    };

    const params = new URLSearchParams(paramsObj);
    const startTime = performance.now();

    try {
      const res = await fetch(`/api/feed?${params.toString()}`);

      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();

      const elapsed = performance.now() - startTime;
      if (useMinSkeleton && elapsed < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
      }

      const categoryLabel =
        categorySelect.options[categorySelect.selectedIndex]?.textContent ||
        data.label ||
        "Catégorie";

      feedState.categoryLabel = categoryLabel;

      if (Array.isArray(data.groups)) {
        feedState.mode = "groups";
        feedState.groups = data.groups;
        feedState.items = [];
      } else {
        const items = data.items || [];
        feedState.mode = "single";
        feedState.items = items;
        feedState.groups = [];
      }

      // On re-render : les anciennes cartes (avec card--loading) sont détruites
      loadingEl.classList.add("hidden");
      renderFromState();
    } catch (err) {
      console.error(err);
      loadingEl.classList.add("hidden");
      resultsEl.innerHTML = "";
      errorEl.textContent = "Impossible de récupérer le flux.";
      errorEl.classList.remove("hidden");
      statsEl.textContent = "";
    }
  }

  function createMetaLine(label, value, extraClass = "") {
    const div = document.createElement("div");
    div.className = "meta-line" + (extraClass ? " " + extraClass : "");

    const spanLabel = document.createElement("span");
    spanLabel.className = "meta-label";
    spanLabel.textContent = label;

    const spanValue = document.createElement("span");
    spanValue.className = "meta-value";
    spanValue.textContent =
      value != null && value !== "" ? String(value) : "—";

    div.append(spanLabel, spanValue);
    return div;
  }

  function getDisplayTitle(item) {
    const source = item.title || item.rawTitle || "";
    if (!source) return "Sans titre";

    let t = source;
    t = t.replace(/\(S:\d+\/L:\d+\)/gi, "");
    t = t.replace(/\(\s*v?\s*\d[\d._]*\s*\)/gi, "");
    t = t.replace(/\(\s*\d+\s*\)/g, "");
    t = t.replace(/\s*\/\s*build\s*\d+.*$/i, "");
    t = t.replace(/\s*\/\s*\d+\s*build.*$/i, "");
    t = t.replace(/\s*build\s*\d+.*$/i, "");
    t = t.replace(/\bv\d+(?:[._]\d+)*\b.*$/i, "");
    t = t.replace(/\b\d+(?:[._]\d+){2,}\b.*$/i, "");
    t = t.replace(/\bUpdate\b.*$/i, "");
    t = t.replace(
      /\s*-\s*(ElAmigos|Mephisto|TENOKE|RUNE|P2P|FitGirl Repack|voices\d+)\s*$/i,
      ""
    );

    t = t.replace(/\s*\[[^\]]*\]\s*$/g, "");
    t = t.replace(/[._]/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    t = t.replace(/\s+(:)/g, " $1");
    t = t.replace(/\s+-\s+/g, " - ");

    return t || source;
  }

  function createCard(item) {
    const card = document.createElement("div");
    card.className = "card";

    let catKey = item.category;

    if (!catKey && categorySelect) {
      const currentCat = categorySelect.value;
      if (currentCat && currentCat !== "all") {
        catKey = currentCat;
      }
    }

    if (catKey && catKey !== "all") {
      const catLabel =
        CATEGORY_LABELS[catKey] ||
        feedState.categoryLabel ||
        catKey;

      const catBadge = document.createElement("div");
      catBadge.className = `card-category card-category--${catKey}`;
      catBadge.textContent = catLabel;
      card.appendChild(catBadge);
    }

    const posterWrap = document.createElement("div");
    posterWrap.className = "card-poster-wrap";

    const posterUrl = item.posterUrl || item.poster;
    if (posterUrl) {
      const img = document.createElement("img");
      img.src = posterUrl;
      img.alt = item.title || "Affiche";
      img.className = "card-poster";
      posterWrap.appendChild(img);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "poster-fallback";
      fallback.textContent = "Affiche";
      posterWrap.appendChild(fallback);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const titleRow = document.createElement("div");
    titleRow.className = "card-title-row";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = getDisplayTitle(item);

    titleRow.appendChild(title);

    const guid = item.guid;

    if (guid) {
      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "info-btn card-fav-btn";

      const favIcon = document.createElement("span");
      favIcon.className = "material-symbols-rounded";

      const initiallyFav = item.isFavorite || isFavorite(guid);
      favIcon.textContent = initiallyFav ? "star" : "star_border";
      if (initiallyFav) {
        favBtn.classList.add("card-fav-btn--active");
      }

      favBtn.appendChild(favIcon);

      favBtn.addEventListener("click", async (e) => {
        e.stopPropagation();

        if (isFavorite(guid)) {
          await removeFavorite(guid);
          favBtn.classList.remove("card-fav-btn--active");
          favIcon.textContent = "star_border";
        } else {
          await addFavorite(guid);
          favBtn.classList.add("card-fav-btn--active");
          favIcon.textContent = "star";
        }
      });

      titleRow.appendChild(favBtn);
    }

    body.append(titleRow);

    const sub = document.createElement("div");
    sub.className = "card-sub";

    const added = item.addedAt || "—";
    sub.appendChild(createMetaLine("Date d'ajout :", added));

    const hasEpisode = item.episode != null && item.episode !== "";
    const labelEpisodeOrYear = hasEpisode ? "Épisode :" : "Année :";
    const valueEpisodeOrYear = hasEpisode ? item.episode : (item.year || "—");
    sub.appendChild(createMetaLine(labelEpisodeOrYear, valueEpisodeOrYear));

    sub.appendChild(createMetaLine("Taille :", item.size || "—"));

    if (item.quality) {
      sub.appendChild(createMetaLine("Qualité :", item.quality));
    }

    sub.appendChild(
      createMetaLine(
        "Seeders :",
        item.seeders != null ? String(item.seeders) : "—",
        "meta-line-seeders"
      )
    );

    body.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const btnDl = document.createElement("a");
    btnDl.href = item.download || "#";
    btnDl.className = "btn btn-download";
    btnDl.textContent = "Télécharger";
    btnDl.target = "_blank";
    btnDl.rel = "noopener noreferrer";

    const btnDlIcon = document.createElement("a");
    btnDlIcon.href = item.download || "#";
    btnDlIcon.className = "btn-download-icon";
    btnDlIcon.target = "_blank";
    btnDlIcon.rel = "noopener noreferrer";
    btnDlIcon.innerHTML = `
      <span class="material-symbols-rounded">download</span>
    `;

    const btnOpen = document.createElement("a");
    btnOpen.href = item.pageLink || "#";
    btnOpen.className = "btn btn-open";
    btnOpen.textContent = "Ouvrir";
    btnOpen.target = "_blank";
    btnOpen.rel = "noopener noreferrer";

    actions.append(btnDl, btnDlIcon, btnOpen);

    body.append(actions);
    card.append(posterWrap, body);

    const showDetails =
      catKey === "film" || catKey === "series" || catKey === "spectacle";

    if (showDetails) {
      posterWrap.classList.add("card-poster-clickable");
      posterWrap.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDetails(
          {
            ...item,
            category: catKey,
          },
          catKey
        );
      });
    }

    setupCardResponsiveButtons(card);
    return card;
  }

  function renderSkeletonCards() {
    if (!resultsEl) return;

    responsiveCards.length = 0;
    resultsEl.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "cards-grid cards-grid--skeleton";

    const uiLimit = getUiLimit();
    const count = Number.isFinite(uiLimit) ? Math.min(uiLimit, 8) : 8; // jusqu’à 8 skeletons max

    for (let i = 0; i < count; i++) {
      const card = document.createElement("div");
      card.className = "card card--skeleton";

      card.innerHTML = `
        <div class="card-poster-wrap">
          <div class="skeleton skeleton-poster"></div>
        </div>

        <div class="card-body">
          <div class="card-title-row">
            <div class="skeleton skeleton-line skeleton-title"></div>
          </div>

          <div class="card-sub">
            <div class="skeleton skeleton-line skeleton-meta"></div>
            <div class="skeleton skeleton-line skeleton-meta"></div>
            <div class="skeleton skeleton-line skeleton-meta short"></div>
          </div>

          <div class="card-actions">
            <div class="skeleton skeleton-pill skeleton-btn"></div>
            <div class="skeleton skeleton-pill skeleton-btn"></div>
          </div>
        </div>
      `.trim();

      grid.appendChild(card);
    }

    resultsEl.appendChild(grid);
  }

  function renderItems(items) {
    responsiveCards.length = 0;
    if (!items.length) {
      resultsEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    resultsEl.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "cards-grid";

    items.forEach((item) => {
      grid.appendChild(createCard(item));
    });

    resultsEl.appendChild(grid);
  }

  function renderGroups(groups) {
    responsiveCards.length = 0;
    if (!Array.isArray(groups) || !groups.length) {
      renderItems([]);
      return;
    }

    emptyEl.classList.add("hidden");
    resultsEl.innerHTML = "";

    let total = 0;

    groups.forEach((group) => {
      const items = group.items || [];
      if (!items.length) return;

      total += items.length;

      const section = document.createElement("section");
      section.className = "category-group";

      const header = document.createElement("div");
      header.className = "group-header";
      header.textContent = group.label || group.key || "Catégorie";

      const grid = document.createElement("div");
      grid.className = "cards-grid";

      items.forEach((item) => {
        grid.appendChild(createCard(item));
      });

      section.append(header, grid);
      resultsEl.appendChild(section);
    });

    if (!total) {
      renderItems([]);
    }
  }

  // ---------------------------------------------------------------------------
  // Recherche locale
  // ---------------------------------------------------------------------------

  function matchesSearch(item, q) {
    if (!q) return true;
    const qv = q.toLowerCase();

    const displayTitle = getDisplayTitle(item);

    const fields = [
      displayTitle,
      item.rawTitle,
      item.year != null ? String(item.year) : "",
      item.episode,
      item.size,
      item.quality,
    ];

    return fields.some((val) => {
      if (val == null) return false;
      return String(val).toLowerCase().includes(qv);
    });
  }

  // ---------------------------------------------------------------------------
  // Gestion dates pour filtre
  // ---------------------------------------------------------------------------

  function parseItemDate(raw) {
    if (!raw) return null;

    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw;
    }

    if (typeof raw === "number") {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const str = String(raw).trim();

    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const m = str.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const year = parseInt(m[3], 10);
      const h = m[4] ? parseInt(m[4], 10) : 0;
      const min = m[5] ? parseInt(m[5], 10) : 0;
      const s = m[6] ? parseInt(m[6], 10) : 0;

      const d = new Date(year, month, day, h, min, s);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  function ensureItemDate(item) {
    if (item._addedAtDate instanceof Date && !Number.isNaN(item._addedAtDate.getTime())) {
      return item._addedAtDate;
    }

    const raw =
      item.addedAt ||
      item.dateAdded ||
      item.uploadedAt ||
      item.createdAt ||
      null;

    const d = parseItemDate(raw);
    item._addedAtDate = d || null;
    return item._addedAtDate;
  }

  function passesDateFilter(item) {
    if (!currentDateFilterDays || currentDateFilterDays <= 0) return true;

    const d = ensureItemDate(item);
    if (!d) return true;

    const now = Date.now();
    const diffMs = now - d.getTime();
    if (diffMs < 0) return false;

    const maxMs = currentDateFilterDays * 24 * 60 * 60 * 1000;
    return diffMs <= maxMs;
  }

  function updateDateFilterChip() {
    if (!activeDateFilterChip) return;

    const effectiveCurrent =
      currentDateFilterDays && currentDateFilterDays > 0
        ? currentDateFilterDays
        : 0;

    const effectiveDefault =
      defaultDateFilterDays && defaultDateFilterDays > 0
        ? defaultDateFilterDays
        : 0;

    const currentLabel = getDateFilterDisplayLabel(effectiveCurrent);
    const defaultLabel = getDateFilterDisplayLabel(effectiveDefault);

    if (effectiveCurrent === effectiveDefault) {
      if (!defaultLabel) {
        activeDateFilterChip.classList.add("hidden");
        activeDateFilterChip.innerHTML = "";
        return;
      }

      activeDateFilterChip.classList.remove("hidden");
      activeDateFilterChip.innerHTML = `
        <span class="stats-chip stats-chip-secondary date-filter-default-chip">
          Période : ${defaultLabel}
        </span>
      `;
      return;
    }

    if (!currentLabel) {
      activeDateFilterChip.classList.add("hidden");
      activeDateFilterChip.innerHTML = "";
      return;
    }

    activeDateFilterChip.classList.remove("hidden");
    activeDateFilterChip.innerHTML = `
      <div class="date-filter-chip-wrapper">
        <div class="date-filter-chip-inner">
          <span class="date-filter-chip-label">${currentLabel}</span>
        </div>

        <button type="button" class="date-filter-chip-clear" title="Revenir au filtre par défaut">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
    `;
  }

  function getUiLimit() {
    if (!limitSelect) return Infinity;

    const raw = limitSelect.value;
    if (!raw || raw === "all") return Infinity;

    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  }

  function sortItemsForCurrentSort(items) {
    const sortKey = (sortSelect && sortSelect.value) || "seeders";
    const dir = sortDirection === "asc" ? 1 : -1;
    const arr = [...items];

    arr.sort((a, b) => {
      if (sortKey === "name") {
        const va = getDisplayTitle(a).toLowerCase();
        const vb = getDisplayTitle(b).toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      }

      if (sortKey === "date") {
        const da = ensureItemDate(a);
        const db = ensureItemDate(b);
        const ta = da ? da.getTime() : 0;
        const tb = db ? db.getTime() : 0;
        return (ta - tb) * dir;
      }

      const sa =
        typeof a.seeders === "number"
          ? a.seeders
          : parseInt(a.seeders, 10) || 0;
      const sb =
        typeof b.seeders === "number"
          ? b.seeders
          : parseInt(b.seeders, 10) || 0;

      return (sa - sb) * dir;
    });

    return arr;
  }

  function renderFromState() {
    if (!feedState.mode) return;

    const q = (currentSearch || "").trim().toLowerCase();
    const hasSearch = !!q;
    const hasDateFilter = !!(currentDateFilterDays && currentDateFilterDays > 0);
    const limitValue = getUiLimit();

    if (feedState.mode === "groups") {
      let groupsToRender = feedState.groups || [];

      if (hasSearch || hasDateFilter) {
        groupsToRender = groupsToRender
          .map((g) => ({
            ...g,
            items: (g.items || []).filter((item) => {
              const okSearch = matchesSearch(item, q);
              const okDate = passesDateFilter(item);
              return okSearch && okDate;
            }),
          }))
          .filter((g) => g.items && g.items.length);
      }

      if (Number.isFinite(limitValue)) {
        groupsToRender = groupsToRender
          .map((g) => ({
            ...g,
            items: (g.items || []).slice(0, limitValue),
          }))
          .filter((g) => g.items && g.items.length);
      }

      renderGroups(groupsToRender);

      const total = (groupsToRender || []).reduce(
        (sum, g) => sum + (g.items ? g.items.length : 0),
        0
      );

      const extraText = "";

      statsEl.innerHTML = `
        <span class="stats-chip stats-chip-primary">
          ${feedState.categoryLabel}
        </span>
        <span class="stats-chip stats-chip-secondary">
          ${total} élément${total > 1 ? "s" : ""}${extraText}
        </span>
      `;
    } else {
      let itemsToRender = feedState.items || [];

      if (hasSearch || hasDateFilter) {
        itemsToRender = itemsToRender.filter((item) => {
          const okSearch = matchesSearch(item, q);
          const okDate = passesDateFilter(item);
          return okSearch && okDate;
        });
      }

      if (Number.isFinite(limitValue)) {
        itemsToRender = itemsToRender.slice(0, limitValue);
      }

      itemsToRender = sortItemsForCurrentSort(itemsToRender);

      renderItems(itemsToRender);
      const total = itemsToRender.length;

      const extraText = "";

      statsEl.innerHTML = `
        <span class="stats-chip stats-chip-primary">
          ${feedState.categoryLabel}
        </span>
        <span class="stats-chip stats-chip-secondary">
          ${total} élément${total > 1 ? "s" : ""}${extraText}
        </span>
      `;
    }
  }

  // ---------------------------------------------------------------------------
  // UI filtre par date
  // ---------------------------------------------------------------------------

  function updateDateFilterInfo() {
    const infoEl = dateFilterPanel?.querySelector(".date-filter-info");
    if (!infoEl) return;

    // On vide le texte systématiquement
    infoEl.textContent = "";
  }

  function applyDateFilterSelection(days, options = {}) {
    const { skipReload = false } = options;

    if (!days || Number.isNaN(days) || days <= 0) {
      currentDateFilterDays = null;
      localStorage.removeItem(DATE_FILTER_STORAGE_KEY);
    } else {
      currentDateFilterDays = days;
      localStorage.setItem(DATE_FILTER_STORAGE_KEY, String(days));
    }

    if (dateFilterPanel) {
      const pills = dateFilterPanel.querySelectorAll(".date-filter-pill");
      pills.forEach((p) => {
        const d = parseInt(p.getAttribute("data-days"), 10);
        const isActive =
          (!currentDateFilterDays && (!d || d === 0)) ||
          (currentDateFilterDays && d === currentDateFilterDays);
        p.classList.toggle("active", !!isActive);
      });
    }

    if (dateFilterBtn) {
      const effectiveCurrent =
        currentDateFilterDays && currentDateFilterDays > 0
          ? currentDateFilterDays
          : 0;

      const effectiveDefault =
        defaultDateFilterDays && defaultDateFilterDays > 0
          ? defaultDateFilterDays
          : 0;

      const hasActiveFilter = effectiveCurrent !== effectiveDefault;
      dateFilterBtn.classList.toggle("active", hasActiveFilter);
    }

    updateDateFilterInfo();
    updateDateFilterChip();

    if (!skipReload) {
      renderFromState();
    }
  }

  function openDateFilterPanel() {
    if (!dateFilterPanel) return;
    dateFilterPanel.classList.remove("hidden");
    dateFilterPanel.classList.add("open");
  }

  function closeDateFilterPanel() {
    if (!dateFilterPanel) return;
    dateFilterPanel.classList.add("hidden");
    dateFilterPanel.classList.remove("open");
  }

  function toggleDateFilterPanel() {
    if (!dateFilterPanel) return;
    const isHidden = dateFilterPanel.classList.contains("hidden");
    if (isHidden) {
      openDateFilterPanel();
    } else {
      closeDateFilterPanel();
    }
  }

  function initDateFilterPanel() {
    if (!dateFilterPanel) return;

    dateFilterPanel.innerHTML = `
      <div class="date-filter-inner">
        <div class="date-filter-pills">
          <button class="date-filter-pill" data-days="0">All</button>
          <button class="date-filter-pill" data-days="1">24h</button>
          <button class="date-filter-pill" data-days="2">48h</button>
          <button class="date-filter-pill" data-days="3">3 jours</button>
          <button class="date-filter-pill" data-days="7">7 jours</button>
        </div>
      </div>
    `;

    const saved = localStorage.getItem(DATE_FILTER_STORAGE_KEY);

    let initialDays = 0;

    if (saved != null) {
      const savedDays = parseInt(saved, 10);
      initialDays =
        !savedDays || Number.isNaN(savedDays) || savedDays <= 0 ? 0 : savedDays;
    } else {
      const def = localStorage.getItem(DATE_FILTER_DEFAULT_STORAGE_KEY);
      const defDays = def != null ? parseInt(def, 10) : 0;
      initialDays =
        !defDays || Number.isNaN(defDays) || defDays <= 0 ? 0 : defDays;
    }

    applyDateFilterSelection(initialDays, { skipReload: true });

    dateFilterPanel.addEventListener("click", (e) => {
      const pill = e.target.closest(".date-filter-pill");
      if (pill) {
        const d = parseInt(pill.getAttribute("data-days"), 10) || 0;
        applyDateFilterSelection(d);
        return;
      }

      const resetBtn = e.target.closest(".date-filter-reset");
      if (resetBtn) {
        applyDateFilterSelection(0);
        return;
      }
    });

    dateFilterBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDateFilterPanel();
    });

    document.addEventListener("click", (e) => {
      if (!dateFilterPanel || dateFilterPanel.classList.contains("hidden")) return;
      const target = e.target;
      if (
        target === dateFilterPanel ||
        dateFilterPanel.contains(target) ||
        target === dateFilterBtn ||
        (dateFilterBtn && dateFilterBtn.contains(target))
      ) {
        return;
      }
      closeDateFilterPanel();
    });

    updateDateFilterInfo();
  }

  // ---------------------------------------------------------------------------
  // Mode recherche
  // ---------------------------------------------------------------------------

  function openSearchMode() {
    if (!searchContainer || !searchToggleBtn || !filtersContainer || !controlsEl) return;

    const w = controlsEl.offsetWidth;
    if (w && w > 0) {
      controlsEl.style.width = w + "px";
      controlsEl.style.flex = "0 0 auto";
    }

    searchContainer.classList.remove("hidden");
    filtersContainer.classList.add("hidden");
    document.body.classList.add("search-active");

    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  function closeSearchMode() {
    if (!searchContainer || !searchToggleBtn || !filtersContainer || !controlsEl) return;

    document.body.classList.remove("search-active");
    searchContainer.classList.add("hidden");
    filtersContainer.classList.remove("hidden");

    controlsEl.style.width = "";
    controlsEl.style.flex = "";

    currentSearch = "";
    if (searchInput) {
      searchInput.value = "";
    }
    renderFromState();
  }

  // ---------------------------------------------------------------------------
  // Settings Popup
  // ---------------------------------------------------------------------------

  function setActiveSettingsSection(sectionId) {
    activeSettingsSection = sectionId || "theme";

    settingsNavItems.forEach((btn) => {
      const id = btn.getAttribute("data-section");
      btn.classList.toggle("active", id === activeSettingsSection);
    });

    settingsSections.forEach((section) => {
      const id = section.getAttribute("data-section");
      section.classList.toggle("active", id === activeSettingsSection);
    });
  }

  settingsNavItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-section");
      if (!id) return;
      setActiveSettingsSection(id);
    });
  });

  function openSettings() {
    if (!overlay || !modal) return;
    overlay.classList.remove("hidden");
    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("show"));
    document.body.classList.add("no-scroll");
  }

  function closeSettings() {
    if (!overlay || !modal) return;
    modal.classList.remove("show");
    setTimeout(() => {
      overlay.classList.add("hidden");
      modal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
    }, 200);
  }

  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeSettings();
    }
  });

  // ---------------------------------------------------------------------------
  // Logs Popup
  // ---------------------------------------------------------------------------

  function classifyLogLine(line) {
    const m = line.match(/^\[[^\]]+\]\s+\[[^\]]+\]\s+\[([^\]]+)\]/);
    const tag = m ? m[1].toUpperCase() : "";

    if (tag === "PURGE") return "log-purge";
    if (tag === "SYNC") return "log-sync";
    if (tag.startsWith("TMDB")) return "log-tmdb";

    return "";
  }

  async function loadLogs() {
    if (!logsContent) return;
    logsContent.textContent = "Chargement des logs...";

    try {
      const res = await fetch("/api/logs?limit=300");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const lines = Array.isArray(data.lines) ? data.lines : [];

      logsContent.innerHTML = "";

      if (!lines.length) {
        logsContent.textContent = "Aucun log pour le moment.";
        return;
      }

      const frag = document.createDocumentFragment();

      lines.forEach((line) => {
        const div = document.createElement("div");
        div.className = "log-line";

        const extraClass = classifyLogLine(line);
        if (extraClass) {
          div.classList.add(extraClass);
        }

        div.textContent = line;
        frag.appendChild(div);
      });

      logsContent.appendChild(frag);
    } catch (err) {
      console.error(err);
      logsContent.textContent = "Erreur lors du chargement des logs.";
    }
  }

  function openLogs() {
    if (!logsOverlay || !logsModal) return;

    // On masque le modal des paramètres derrière
    if (modal) {
      modal.classList.add("settings-modal-behind-logs");
    }

    logsOverlay.classList.remove("hidden");
    logsModal.classList.remove("hidden");
    requestAnimationFrame(() => logsModal.classList.add("show"));
    document.body.classList.add("no-scroll");
    loadLogs();
  }

  function closeLogs() {
    if (!logsOverlay || !logsModal) return;

    logsModal.classList.remove("show");
    setTimeout(() => {
      logsOverlay.classList.add("hidden");
      logsModal.classList.add("hidden");
      document.body.classList.remove("no-scroll");

      // On ré-affiche le modal des paramètres une fois les logs fermés
      if (modal) {
        modal.classList.remove("settings-modal-behind-logs");
      }
    }, 200);
  }

  logsOverlay?.addEventListener("click", (e) => {
    if (e.target === logsOverlay) {
      closeLogs();
    }
  });

  // ---------------------------------------------------------------------------
  // Détails (modal TMDB)
  // ---------------------------------------------------------------------------

  function closeDetails() {
    if (!detailsOverlay || !detailsModal) return;
    detailsModal.classList.remove("show");
    setTimeout(() => {
      detailsOverlay.classList.add("hidden");
      detailsModal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
    }, 200);
  }

  function renderDetailsSkeleton(item) {
    if (!detailsMetaEl || !detailsPlotEl || !detailsExtraEl) return;

    detailsMetaEl.innerHTML = "";
    detailsExtraEl.innerHTML = "";

    const meta = [];

    const hasEpisode = item.episode != null && item.episode !== "";
    const labelEpisodeOrYear = hasEpisode ? "Épisode" : "Année";
    const valueEpisodeOrYear = hasEpisode ? item.episode : (item.year || "—");
    meta.push(`${labelEpisodeOrYear} : ${valueEpisodeOrYear}`);
    meta.push(`Taille : ${item.size || "—"}`);
    meta.push(`Seeders : ${item.seeders != null ? item.seeders : "—"}`);
    if (item.quality) {
      meta.push(`Qualité : ${item.quality}`);
    }
    if (item.addedAt) {
      meta.push(`Ajouté le : ${item.addedAt}`);
    }

    detailsMetaEl.innerHTML = meta
      .map((line) => `<div class="details-meta-line">${line}</div>`)
      .join("");

    detailsPlotEl.textContent = "Chargement des infos IMDb…";
    detailsImdbLinkEl?.classList.add("hidden");
  }

  function applyDetailsPoster(src) {
    if (!detailsPosterEl || !detailsPosterFallback) return;
    if (src) {
      detailsPosterEl.src = src;
      detailsPosterEl.classList.remove("hidden");
      detailsPosterFallback.classList.add("hidden");
    } else {
      detailsPosterEl.src = "";
      detailsPosterEl.classList.add("hidden");
      detailsPosterFallback.classList.remove("hidden");
    }
  }

  async function fetchAndFillDetails(item, catKey) {
    if (!detailsPlotEl) return;

    const baseTitle = item.rawTitle || item.title || "";
    if (!baseTitle) {
      detailsPlotEl.textContent = "Titre introuvable pour la recherche.";
      return;
    }

    const params = new URLSearchParams({
      title: baseTitle,
      category: catKey || item.category || categorySelect?.value || "film",
    });

    try {
      const res = await fetch(`/api/details?${params.toString()}`);
      if (!res.ok) {
        detailsPlotEl.textContent = "Aucune fiche trouvée sur IMDb.";
        return;
      }

      const data = await res.json();

      if (data.title && detailsTitleEl) {
        detailsTitleEl.textContent = data.title;
      }

      if (data.poster) {
        applyDetailsPoster(data.poster);
      }

      if (detailsMetaEl) {
        const meta = [];

        if (data.year) meta.push(`Année : ${data.year}`);
        if (data.released) meta.push(`Sortie : ${data.released}`);
        if (data.runtime) meta.push(`Durée : ${data.runtime}`);
        if (data.genre) meta.push(`Genre : ${data.genre}`);
        if (data.director && data.director !== "N/A") {
          meta.push(`Réalisateur : ${data.director}`);
        }
        if (data.actors && data.actors !== "N/A") {
          meta.push(`Acteurs : ${data.actors}`);
        }
        if (data.imdbRating && data.imdbRating !== "N/A") {
          meta.push(`Note IMDb : ${data.imdbRating}/10 (${data.imdbVotes || "?"} votes)`);
        }

        detailsMetaEl.innerHTML = meta
          .map((line) => `<div class="details-meta-line">${line}</div>`)
          .join("");
      }

      if (detailsPlotEl) {
        detailsPlotEl.textContent =
          data.plot && data.plot !== "N/A"
            ? data.plot
            : "Pas de résumé disponible.";
      }

      if (detailsExtraEl) {
        const extra = [];
        if (data.language && data.language !== "N/A") {
          extra.push(`Langues : ${data.language}`);
        }
        if (data.country && data.country !== "N/A") {
          extra.push(`Pays : ${data.country}`);
        }
        if (data.awards && data.awards !== "N/A") {
          extra.push(`Récompenses : ${data.awards}`);
        }

        detailsExtraEl.innerHTML = extra
          .map((line) => `<div class="details-extra-line">${line}</div>`)
          .join("");
      }

      if (detailsImdbLinkEl && data.imdbID) {
        const imdbUrl = `https://www.imdb.com/title/${data.imdbID}/`;
        detailsImdbLinkEl.href = imdbUrl;
        detailsImdbLinkEl.textContent = "Voir la fiche sur IMDb";
        detailsImdbLinkEl.classList.remove("hidden");
      }
    } catch (err) {
      console.error(err);
      detailsPlotEl.textContent =
        "Erreur lors du chargement de la fiche détaillée.";
    }
  }

  function openDetails(item, catKey) {
    if (!detailsOverlay || !detailsModal) return;

    const effectiveCat = catKey || item.category || categorySelect?.value || "film";

    const displayTitle = getDisplayTitle(item);

    if (detailsTitleEl) {
      detailsTitleEl.textContent = displayTitle;
    }

    if (detailsOriginalToggle) {
      const raw = (item.rawTitle || "").trim();

      if (raw && raw !== displayTitle) {
        detailsOriginalToggle.classList.remove("hidden");
        detailsOriginalToggle.dataset.rawTitle = raw;
        detailsOriginalToggle.dataset.cleanTitle = displayTitle;
        detailsOriginalToggle.classList.remove("details-original-toggle-active");
      } else {
        detailsOriginalToggle.classList.add("hidden");
      }
    }

    applyDetailsPoster(item.poster || item.posterUrl || null);

    renderDetailsSkeleton(item, effectiveCat);

    detailsOverlay.classList.remove("hidden");
    detailsModal.classList.remove("hidden");
    requestAnimationFrame(() => detailsModal.classList.add("show"));
    document.body.classList.add("no-scroll");

    fetchAndFillDetails(item, effectiveCat);
  }

  detailsOverlay?.addEventListener("click", (e) => {
    if (e.target === detailsOverlay) {
      closeDetails();
    }
  });

  detailsCloseBtn?.addEventListener("click", closeDetails);

  detailsOriginalToggle?.addEventListener("click", () => {
    if (!detailsOriginalToggle) return;

    const raw = detailsOriginalToggle.dataset.rawTitle;
    const clean = detailsOriginalToggle.dataset.cleanTitle;

    const isShowingRaw = detailsTitleEl.textContent === raw;
    detailsTitleEl.textContent = isShowingRaw ? clean : raw;

    detailsOriginalToggle.classList.toggle(
      "details-original-toggle-active",
      !isShowingRaw
    );
  });

  // ---------------------------------------------------------------------------
  // Scroll / header / controls
  // ---------------------------------------------------------------------------

  window.addEventListener("scroll", () => {
    if (!headerEl) return;

    const scrolled = window.scrollY || document.documentElement.scrollTop;
    const isMobile = window.innerWidth <= 768;

    if (!isMobile) {
      if (scrolled > 40) {
        headerEl.classList.add("header-compact");
      } else {
        headerEl.classList.remove("header-compact");
      }
    } else {
      headerEl.classList.remove("header-compact");

      if (scrolled > 20) {
        headerEl.classList.add("header-mobile-tight");
      } else {
        headerEl.classList.remove("header-mobile-tight");
      }

      if (scrolled > 60) {
        headerEl.classList.add("header-mobile-faded");
      } else {
        headerEl.classList.remove("header-mobile-faded");
      }
    }

    if (!controlsEl || !isMobile) return;

    if (controlsManuallyExpanded) {
      if (scrolled < 80) {
        controlsManuallyExpanded = false;
      }
      return;
    }

    if (scrolled > 140 && !controlsCollapsed) {
      controlsEl.classList.add("controls-collapsed");
      controlsCollapsed = true;
    } else if (scrolled < 100 && controlsCollapsed) {
      controlsEl.classList.remove("controls-collapsed");
      controlsCollapsed = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Footer / version
  // ---------------------------------------------------------------------------

  async function initVersionFooter() {
    if (footerEl) {
      footerEl.addEventListener("click", () => {
        window.open("https://github.com/Guizmos/FeedyGG", "_blank");
      });
    }

    if (!appVersionEl) return;

    try {
      const res = await fetch("/version", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      if (data && data.version) {
        appVersionEl.textContent = `v${data.version}`;
      } else {
        appVersionEl.textContent = "";
      }
    } catch (err) {
      console.error("Erreur lors de la récupération de la version :", err);
      appVersionEl.textContent = "";
    }
  }

  async function updateLastSyncText() {
    if (!lastSyncTextEl) return;

    try {
      const res = await fetch("/api/status");
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();

      if (!data.lastSyncAt) {
        lastSyncTextEl.textContent =
          "Date de la dernière synchronisation : inconnue";
        return;
      }

      const d = new Date(data.lastSyncAt);
      if (Number.isNaN(d.getTime())) {
        lastSyncTextEl.textContent =
          "Date de la dernière synchronisation : inconnue";
        return;
      }

      const formatted = d.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      lastSyncTextEl.textContent =
        "Date de la dernière synchronisation : " + formatted;
    } catch (err) {
      console.error("Erreur updateLastSyncText:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // Dernière synchronisation (status backend)
  // ---------------------------------------------------------------------------

  function formatLastSyncLabel(iso) {
    if (!iso) return "inconnue";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "inconnue";

    const datePart = d.toLocaleDateString("fr-FR");
    const timePart = d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `${datePart} à ${timePart}`;
  }

  async function updateLastSyncStatus() {
    if (!lastSyncValueEl) return;

    try {
      const res = await fetch("/api/status", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();
      lastSyncValueEl.textContent = formatLastSyncLabel(data.lastSyncAt);
    } catch (err) {
      console.error("Erreur /api/status:", err);
      lastSyncValueEl.textContent = "inconnue";
    }
  }

  // ---------------------------------------------------------------------------
  // Rétention BDD
  // ---------------------------------------------------------------------------

  async function initRetentionSettings() {
    if (!retentionDaysSelect) return;

    try {
      const res = await fetch("/api/retention");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      const days = Number(data.days);
      if (!Number.isFinite(days) || days <= 0) return;

      currentRetentionDays = days;

      let found = false;
      Array.from(retentionDaysSelect.options).forEach((opt) => {
        if (Number(opt.value) === days) {
          opt.selected = true;
          found = true;
        }
      });

      if (!found) {
        const opt = document.createElement("option");
        opt.value = String(days);
        opt.textContent = `${days} jours`;
        retentionDaysSelect.appendChild(opt);
        retentionDaysSelect.value = String(days);
      }

      autosizeSelect(retentionDaysSelect);
    } catch (err) {
      console.error("Erreur initRetentionSettings:", err);
    }
  }

  async function updateRetentionOnServer(newDays) {
    if (!Number.isFinite(newDays) || newDays <= 0) return;

    try {
      const res = await fetch(`/api/retention?days=${encodeURIComponent(newDays)}`, {
        method: "POST",
      });

      if (!res.ok) {
        console.error("Erreur HTTP /api/retention:", res.status);
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        console.error("Erreur API /api/retention:", data.error);
        return;
      }

      currentRetentionDays = newDays;
    } catch (err) {
      console.error("updateRetentionOnServer error:", err);
    } finally {
      if (retentionDaysSelect) {
        autosizeSelect(retentionDaysSelect);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Nettoyage des affiches orphelines
  // ---------------------------------------------------------------------------

  async function cleanupOrphanPosters() {
    if (!cleanupPostersStatus) return;

    const ok = window.confirm(
      "Cette opération va supprimer les fichiers d'affiches qui ne sont plus utilisés.\n\nContinuer ?"
    );
    if (!ok) return;

    cleanupPostersStatus.textContent = "Nettoyage en cours…";

    try {
      const res = await fetch("/api/admin/posters/cleanup-orphans", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }

      const data = await res.json();
      const n = Number(data.deletedCount);
      const hasCount = Number.isFinite(n);

      if (data.ok && hasCount) {
        if (n === 0) {
          cleanupPostersStatus.textContent =
            "Aucune affiche orpheline à supprimer.";
        } else {
          cleanupPostersStatus.textContent =
            `${n} affiche${n > 1 ? "s" : ""} orpheline${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}.`;
        }
      } else if (data.ok) {
        cleanupPostersStatus.textContent = "Nettoyage terminé.";
      } else {
        cleanupPostersStatus.textContent =
          data.error || "Erreur pendant le nettoyage des affiches.";
      }
    } catch (err) {
      console.error("cleanupOrphanPosters error:", err);
      cleanupPostersStatus.textContent =
        "Erreur réseau lors du nettoyage des affiches.";
    }
  }

  // ---------------------------------------------------------------------------
  // Sync global / refresh
  // ---------------------------------------------------------------------------

  async function triggerFullRefresh({ silent = false } = {}) {
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
      });

      if (res.status === 409) {
        console.warn("Sync déjà en cours, on recharge seulement le feed.");
        await loadFeed({ useMinSkeleton: !silent });
        await updateLastSyncText();
        return;
      }

      if (!res.ok) {
        console.error("Erreur HTTP /api/sync:", res.status);
        if (!silent && errorEl) {
          errorEl.textContent = "Erreur lors de la synchronisation.";
          errorEl.classList.remove("hidden");
        }
        await loadFeed({ useMinSkeleton: !silent });
        await updateLastSyncText();
        return;
      }

      const data = await res.json();
      if (!data.ok && !silent && errorEl) {
        errorEl.textContent =
          data.error || "Erreur pendant la synchronisation.";
        errorEl.classList.remove("hidden");
      }

      await loadFeed({ useMinSkeleton: !silent });
      await updateLastSyncText();
    } catch (err) {
      console.error("triggerFullRefresh error:", err);
      if (!silent && errorEl) {
        errorEl.textContent =
          "Erreur réseau lors de la synchronisation.";
        errorEl.classList.remove("hidden");
      }
      await loadFeed({ useMinSkeleton: !silent });
      await updateLastSyncText();
    } finally {
      updateLastSyncStatus();
    }
  }

  function clearRefreshTimer() {
    if (refreshTimerId !== null) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  }

  function scheduleAutoRefresh(minutes) {
    clearRefreshTimer();

    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) {
      return;
    }

    const delayMs = m * 60 * 1000;

    refreshTimerId = setInterval(() => {
      triggerFullRefresh({ silent: true });
    }, delayMs);
  }

  async function updateSyncIntervalOnServer(newMinutes) {
    try {
      const payload = { minutes: Number(newMinutes) || 0 };

      const res = await fetch("/api/config/sync-interval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("Erreur HTTP /api/config/sync-interval:", res.status);
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        console.error("Erreur API /api/config/sync-interval:", data.error);
      }
    } catch (err) {
      console.error("updateSyncIntervalOnServer error:", err);
    }
  }

  async function initSyncIntervalSettings() {
    if (!refreshIntervalSelect) return;

    try {
      const res = await fetch("/api/config/sync-interval", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();

      let minutes = Number(data.minutes);
      if (!Number.isFinite(minutes)) {
        const def = Number(data.defaultMinutes);
        minutes = Number.isFinite(def) ? def : 30;
      }

      let selectValue = "manual";
      if (minutes > 0) {
        selectValue = String(minutes);

        let found = false;
        Array.from(refreshIntervalSelect.options).forEach((opt) => {
          if (opt.value === selectValue) {
            found = true;
          }
        });

        if (!found) {
          const opt = document.createElement("option");
          opt.value = selectValue;
          opt.textContent = `${minutes} min`;
          refreshIntervalSelect.appendChild(opt);
        }
      }

      refreshIntervalSelect.value = selectValue;
      autosizeSelect(refreshIntervalSelect);

      scheduleAutoRefresh(minutes);
    } catch (err) {
      console.error("Erreur initSyncIntervalSettings:", err);
    }
  }


  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  defaultSortSelect?.addEventListener("change", (e) => {
    const value = e.target.value || "seeders";

    localStorage.setItem("defaultSort", value);

    if (sortSelect) {
      sortSelect.value = value;
      autosizeSelect(sortSelect);
    }

    loadFeed();
  });

  defaultDateFilterSelect?.addEventListener("change", (e) => {
    const value = parseInt(e.target.value, 10) || 0;

    defaultDateFilterDays = value;
    localStorage.setItem(DATE_FILTER_DEFAULT_STORAGE_KEY, String(value));

    applyDateFilterSelection(value);
  });

  cardSizeSelect?.addEventListener("change", (e) => {
    const value = e.target.value || "normal";
    const size =
      value === "compact" || value === "large" ? value : "normal";

    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
    applyCardSize(size);
  });

  sortDirectionBtn?.addEventListener("click", () => {
    if (sortDirectionBtn.disabled) return;

    sortDirection = sortDirection === "asc" ? "desc" : "asc";

    if (sortDirectionIcon) {
      sortDirectionIcon.style.transform =
        sortDirection === "asc" ? "rotate(-90deg)" : "rotate(90deg)";
    }

    renderFromState();
  });

  retentionDaysSelect?.addEventListener("change", (e) => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    const newDays = value;
    const oldDays = currentRetentionDays;

    if (oldDays != null && newDays < oldDays) {
      const ok = window.confirm(
        `Attention : passer de ${oldDays} à ${newDays} jours va supprimer définitivement les éléments plus anciens.\n\nContinuer ?`
      );

      if (!ok) {
        e.target.value = String(oldDays);
        autosizeSelect(retentionDaysSelect);
        return;
      }
    }

    updateRetentionOnServer(newDays);
  });

  refreshBtn?.addEventListener("click", () => {
    triggerFullRefresh({ silent: false });
  });

  settingsBtn?.addEventListener("click", openSettings);
  closeSettingsBtn?.addEventListener("click", closeSettings);

  openLogsBtn?.addEventListener("click", openLogs);
  closeLogsBtn?.addEventListener("click", closeLogs);

  searchToggleBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    openSearchMode();
  });

  filtersMiniBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeSearchMode();
  });

  searchInput?.addEventListener("input", (e) => {
    currentSearch = e.target.value || "";
    renderFromState();
  });

  searchClearBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!searchInput) return;
    searchInput.value = "";
    currentSearch = "";
    renderFromState();
    searchInput.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (detailsModal && !detailsModal.classList.contains("hidden") && detailsModal.classList.contains("show")) {
      closeDetails();
      return;
    }

    if (logsModal && !logsModal.classList.contains("hidden") && logsModal.classList.contains("show")) {
      closeLogs();
      return;
    }

    if (modal && !modal.classList.contains("hidden") && modal.classList.contains("show")) {
      closeSettings();
      return;
    }

    if (searchContainer && !searchContainer.classList.contains("hidden")) {
      closeSearchMode();
      return;
    }

    if (dateFilterPanel && !dateFilterPanel.classList.contains("hidden")) {
      closeDateFilterPanel();
      return;
    }
  });

  categorySelect?.addEventListener("change", (e) => {
    autosizeSelect(e.target);
    updateSortDirectionButtonState();
    loadFeed();
  });

  limitSelect?.addEventListener("change", (e) => {
    autosizeSelect(e.target);
    renderFromState();
  });

  sortSelect?.addEventListener("change", (e) => {
    autosizeSelect(e.target);
    loadFeed();
  });

  controlsEl?.addEventListener("click", () => {
    if (window.innerWidth > 768) return;

    if (!controlsCollapsed) return;

    controlsEl.classList.remove("controls-collapsed");
    controlsCollapsed = false;
    controlsManuallyExpanded = true;
  });

  activeDateFilterChip?.addEventListener("click", (e) => {
    const btn = e.target.closest(".date-filter-chip-clear");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();
    applyDateFilterSelection(defaultDateFilterDays || 0);
  });

  refreshIntervalSelect?.addEventListener("change", async (e) => {
    const value = e.target.value || "manual";

    let minutes = 0;
    if (value !== "manual") {
      const n = parseInt(value, 10);
      if (Number.isFinite(n) && n > 0) {
        minutes = n;
      }
    }

    autosizeSelect(e.target);
    await updateSyncIntervalOnServer(minutes);
    scheduleAutoRefresh(minutes);
  });


  cleanupPostersBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    cleanupOrphanPosters();
  });

  // ---------------------------------------------------------------------------
  // Init globale
  // ---------------------------------------------------------------------------

  (async () => {
    await loadFavoritesFromApi();
    await initCategories();
    autosizeSelect(limitSelect);
    autosizeSelect(sortSelect);
    if (cardSizeSelect) autosizeSelect(cardSizeSelect);

    initDateFilterPanel();

    if (refreshIntervalSelect) {
      await initSyncIntervalSettings();
    }

    await initRetentionSettings();
    await loadFeed();
    await initVersionFooter();
    await updateLastSyncText();
    await updateLastSyncStatus();
  })();
});
