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

document.addEventListener("DOMContentLoaded", () => {
  const categorySelect = document.getElementById("category-select");
  const limitSelect = document.getElementById("limit-select");
  const sortSelect = document.getElementById("sort-select");
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
  const REFRESH_INTERVAL_STORAGE_KEY = "refreshIntervalMode";

  let activeSettingsSection = "theme";

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


  // ⭐ NOUVEAU : select pour la taille des cartes
  const cardSizeSelect = document.getElementById("card-size-select");
  const CARD_SIZE_STORAGE_KEY = "cardSize";

  let currentDateFilterDays = null;
  let defaultDateFilterDays = 0;

  const footerEl = document.getElementById("app-footer");
  const appVersionEl = document.getElementById("app-version");

  let controlsCollapsed = false;
  let controlsManuallyExpanded = false;
  let refreshTimerId = null;

  let currentSearch = "";
  const feedState = {
    mode: "single",
    categoryLabel: "",
    items: [],
    groups: [],
  };

  const FALLBACK_CATS = [
    { key: "all",        label: "Tout" },
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

  // ⭐ NOUVEAU : fonction qui applique la taille des cartes sur le <body>
  function applyCardSize(size) {
    document.body.classList.remove("cards-size-compact", "cards-size-large");

    if (size === "compact") {
      document.body.classList.add("cards-size-compact");
    } else if (size === "large") {
      document.body.classList.add("cards-size-large");
    }
    // "normal" = aucun ajout de classe, on garde le style par défaut
  }

  // ⭐ NOUVEAU : init de la taille des cartes depuis localStorage
  const savedCardSize = localStorage.getItem(CARD_SIZE_STORAGE_KEY) || "normal";
  applyCardSize(savedCardSize);
  if (cardSizeSelect) {
    cardSizeSelect.value = savedCardSize;
    autosizeSelect(cardSizeSelect);
  }

  function getDateFilterDisplayLabel(days) {
    if (!days || days <= 0) return "Tous";
    return getDateFilterLabel(days) || "";
  }

  const responsiveCards = [];

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
  }

  async function loadFeed() {
    statsEl.textContent = "";
    resultsEl.innerHTML = "";
    loadingEl.classList.remove("hidden");
    errorEl.classList.add("hidden");
    emptyEl.classList.add("hidden");

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

    try {
      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error("Erreur API");
      const data = await res.json();

      loadingEl.classList.add("hidden");

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
  
    // 1) Seeders/Leechers "(S:xx/L:xx)"
    t = t.replace(/\(S:\d+\/L:\d+\)/gi, "");
  
    // 2) Blocs de version/numéros entre parenthèses : (v1.2.3), (1.2.3), (86364)...
    t = t.replace(/\(\s*v?\s*\d[\d._]*\s*\)/gi, "");
    t = t.replace(/\(\s*\d+\s*\)/g, "");
  
    // 3) Parties " / build 20785690 ..." ou "build 20785690 ..."
    t = t.replace(/\s*\/\s*build\s*\d+.*$/i, "");
    t = t.replace(/\s*\/\s*\d+\s*build.*$/i, "");
    t = t.replace(/\s*build\s*\d+.*$/i, "");
  
    // 4) Traîne de version non parenthésée
    t = t.replace(/\bv\d+(?:[._]\d+)*\b.*$/i, "");
    t = t.replace(/\b\d+(?:[._]\d+){2,}\b.*$/i, "");
  
    // 5) "Update v97150", "Update 1.0.2.47088s" etc.
    t = t.replace(/\bUpdate\b.*$/i, "");
  
    // 6) Tags de groupe en fin
    t = t.replace(
      /\s*-\s*(ElAmigos|Mephisto|TENOKE|RUNE|P2P|FitGirl Repack|voices\d+)\s*$/i,
      ""
    );
  
    // 7) Blocs [X Y Z] à la fin
    t = t.replace(/\s*\[[^\]]*\]\s*$/g, "");
  
    // 8) Remplacer . et _ par espaces
    t = t.replace(/[._]/g, " ");
  
    // 9) Nettoyage espaces
    t = t.replace(/\s+/g, " ").trim();
  
    // 10) Espaces autour de ":" et " - "
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

    const posterUrl = item.poster || item.posterUrl;
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

    const infoBtn = document.createElement("button");
    infoBtn.className = "info-btn";
    infoBtn.textContent = "i";
    infoBtn.title = "Afficher/masquer les infos";

    titleRow.append(title, infoBtn);
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

    // --- Boutons d'action ---
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

    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = card.classList.toggle("card-meta-hidden");
      infoBtn.title = isHidden
        ? "Afficher les infos"
        : "Masquer les infos";
    });

    setupCardResponsiveButtons(card);
    return card;
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

  // --- Recherche / filtrage local ---

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

  // --- Helpers dates pour filtre "X derniers jours" ---

  function parseItemDate(raw) {
    if (!raw) return null;

    // 1) Déjà un Date valide
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw;
    }

    // 2) Timestamp numérique (ms depuis epoch)
    if (typeof raw === "number") {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    const str = String(raw).trim();

    // 3) Format ISO (2025-12-01T21:08:04Z, etc.)
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const d = new Date(str);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // 4) Ton format FR : dd/mm/yyyy [hh:mm[:ss]]
    const m = str.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1; // 0-based
      const year = parseInt(m[3], 10);
      const h = m[4] ? parseInt(m[4], 10) : 0;
      const min = m[5] ? parseInt(m[5], 10) : 0;
      const s = m[6] ? parseInt(m[6], 10) : 0;

      const d = new Date(year, month, day, h, min, s);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    // 5) Rien de reconnu → on renvoie null, on NE fait PAS new Date(str)
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

  function getDateFilterLabel(days) {
    switch (days) {
      case 1: return "24h";
      case 2: return "48h";
      case 3: return "3 jours";
      case 7: return "7 jours";
      default: return "";
    }
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

  // --- UI du filtre date (panneau sous la barre) ---

  function updateDateFilterInfo() {
    const infoEl = dateFilterPanel?.querySelector(".date-filter-info");
    if (!infoEl) return;

    if (!currentDateFilterDays || currentDateFilterDays <= 0) {
      infoEl.textContent = "Filtre désactivé — tous les résultats sont affichés.";
    } else if (currentDateFilterDays === 1) {
      infoEl.textContent = "Affichage limité aux 24 dernières heures.";
    } else if (currentDateFilterDays === 2) {
      infoEl.textContent = "Affichage limité aux 48 dernières heures.";
    } else {
      infoEl.textContent = `Affichage limité aux ${currentDateFilterDays} derniers jours.`;
    }
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

  // --- Settings popup ---

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

  // --- Logs popup ---

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
    }, 200);
  }

  logsOverlay?.addEventListener("click", (e) => {
    if (e.target === logsOverlay) {
      closeLogs();
    }
  });

  function closeDetails() {
    if (!detailsOverlay || !detailsModal) return;
    detailsModal.classList.remove("show");
    setTimeout(() => {
      detailsOverlay.classList.add("hidden");
      detailsModal.classList.add("hidden");
      document.body.classList.remove("no-scroll");
    }, 200);
  }

  function renderDetailsSkeleton(item, catKey) {
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

    detailsOriginalToggle.classList.toggle("details-original-toggle-active", !isShowingRaw);
  });

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

  // --- Settings footer/version ---

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

  // --- Events ---

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

  // ⭐ NOUVEAU : event sur le select "Affichage" (Compact / Normal / Large)
  cardSizeSelect?.addEventListener("change", (e) => {
    const value = e.target.value || "normal";
    const size =
      value === "compact" || value === "large" ? value : "normal";

    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
    applyCardSize(size);
  });

  // ---------------------------------------------------------------------------
  // Rafraîchissement complet : API /api/sync + rechargement du feed
  // ---------------------------------------------------------------------------

  async function triggerFullRefresh({ silent = false } = {}) {
    // On affiche un message basique si pas silent
    if (!silent && loadingEl) {
      loadingEl.classList.remove("hidden");
      errorEl.classList.add("hidden");
    }

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
      });

      if (res.status === 409) {
        // sync déjà en cours → on se contente de recharger la vue
        console.warn("Sync déjà en cours, on recharge seulement le feed.");
        await loadFeed();
        return;
      }

      if (!res.ok) {
        console.error("Erreur HTTP /api/sync:", res.status);
        if (!silent && errorEl) {
          errorEl.textContent = "Erreur lors de la synchronisation.";
          errorEl.classList.remove("hidden");
        }
        // on recharge quand même le feed avec ce qu'il y a
        await loadFeed();
        return;
      }

      const data = await res.json();
      if (!data.ok && !silent && errorEl) {
        errorEl.textContent =
          data.error || "Erreur pendant la synchronisation.";
        errorEl.classList.remove("hidden");
      }

      // Une fois la sync terminée, on recharge les données en BDD
      await loadFeed();
    } catch (err) {
      console.error("triggerFullRefresh error:", err);
      if (!silent && errorEl) {
        errorEl.textContent =
          "Erreur réseau lors de la synchronisation.";
        errorEl.classList.remove("hidden");
      }
      await loadFeed();
    } finally {
      if (!silent && loadingEl) {
        loadingEl.classList.add("hidden");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rafraîchissement auto basé sur les paramètres (15 / 30 / 60 min)
  // ---------------------------------------------------------------------------

  function clearRefreshTimer() {
    if (refreshTimerId !== null) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
  }

  function scheduleAutoRefresh(mode) {
    clearRefreshTimer();

    if (!mode || mode === "manual") {
      return; // pas d'auto-refresh
    }

    const minutes = parseInt(mode, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return;
    }

    const delayMs = minutes * 60 * 1000;

    refreshTimerId = setInterval(() => {
      // On ne spamme pas l'utilisateur : silent=true → pas de message d'erreur visible
      triggerFullRefresh({ silent: true });
    }, delayMs);
  }

  refreshIntervalSelect?.addEventListener("change", (e) => {
    const value = e.target.value || "manual";
    localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, value);
    scheduleAutoRefresh(value);
  });

  refreshBtn?.addEventListener("click", () => {
    triggerFullRefresh({ silent: false });
  });

  settingsBtn?.addEventListener("click", openSettings);
  closeSettingsBtn?.addEventListener("click", closeSettings);

  openLogsBtn?.addEventListener("click", openLogs);
  closeLogsBtn?.addEventListener("click", closeLogs);

  // --- Recherche ---

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

  // --- Selects + autosize + reload ---
  categorySelect?.addEventListener("change", (e) => {
    autosizeSelect(e.target);
    loadFeed();
  });

  // Résultats : n'affecte que le rendu local, pas l'API
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

  (async () => {
    await initCategories();
    autosizeSelect(limitSelect);
    autosizeSelect(sortSelect);
    if (cardSizeSelect) autosizeSelect(cardSizeSelect);
    initDateFilterPanel();
    activeDateFilterChip?.addEventListener("click", (e) => {
      const btn = e.target.closest(".date-filter-chip-clear");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();
      applyDateFilterSelection(defaultDateFilterDays || 0);
    });
    // 🔹 Init du mode de rafraîchissement depuis le localStorage
    if (refreshIntervalSelect) {
      const savedMode =
        localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY) || "manual";
      refreshIntervalSelect.value = savedMode;
      scheduleAutoRefresh(savedMode);
    }

    await loadFeed();
    await initVersionFooter();
  })();
});
