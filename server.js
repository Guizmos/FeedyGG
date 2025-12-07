// ============================================================================
// IMPORTS & CONSTANTES GLOBALES
// ============================================================================

const express = require("express");
const Parser = require("rss-parser");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const pkg = require("./package.json");
const APP_VERSION = pkg.version;

const PORT = process.env.PORT || 8080;

const RSS_PASSKEY = process.env.RSS_PASSKEY;

const RSS_MOVIES_ID = process.env.RSS_MOVIES_ID || process.env.RSS_ID || "2183";
const RSS_SERIES_ID = process.env.RSS_SERIES_ID || "2184";
const RSS_SHOWS_ID = process.env.RSS_SHOWS_ID || "2182";
const RSS_ANIMATION_ID = process.env.RSS_ANIMATION_ID || "2178";
const RSS_GAMES_ID = process.env.RSS_GAMES_ID || "2161";
const RSS_SPECTACLE_ID = process.env.RSS_SPECTACLE_ID || "2185";

const CATEGORY_CONFIGS = [
  { key: "film",      label: "Films" },
  { key: "series",    label: "Séries TV" },
  { key: "emissions", label: "Émissions TV" },
  { key: "spectacle", label: "Spectacles" },
  { key: "animation", label: "Animation" },
  { key: "games",     label: "Jeux vidéo" },
];

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500";

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || "";
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET || "";
const IGDB_BASE_URL = "https://api.igdb.com/v4";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "yggfeed.db");
const DATA_DIR = process.env.DATA_DIR || path.dirname(DB_PATH);
const POSTERS_DIR = process.env.POSTERS_DIR || path.join(path.dirname(DB_PATH), "posters");

const DEFAULT_SYNC_INTERVAL_MINUTES = 30;
let currentSyncIntervalMinutes = DEFAULT_SYNC_INTERVAL_MINUTES;
let syncIntervalHandle = null;

const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, "yggfeed.log");
const LOG_MAX_BYTES = Number(process.env.LOG_MAX_BYTES || 5 * 1024 * 1024);

const DEFAULT_RETENTION_DAYS = 7;
let retentionDays = DEFAULT_RETENTION_DAYS;

let lastSyncAt = null;

const posterCache = new Map();

// ============================================================================
// LOGGING (fichier + rotation simple)
// ============================================================================

const LOG_LEVELS = {
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
};

let logCount = 0;

function maskSecrets(str) {
  if (str == null) return "";
  const s = String(str);
  return s.replace(/(passkey|api_key)=[^&\s]+/gi, "$1=********");
}

function appendLogLine(line) {
  try {
    fs.appendFile(LOG_FILE, line + "\n", (err) => {
      if (err) {
        console.error("[LOGS] Erreur append:", err.message);
      }
    });
  } catch (e) {
    console.error("[LOGS] Exception append:", e.message);
  }
}

function rotateLogsIfNeeded() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const stat = fs.statSync(LOG_FILE);
    if (stat.size <= LOG_MAX_BYTES) return;

    const data = fs.readFileSync(LOG_FILE, "utf8");
    const lines = data.split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-1000);

    fs.writeFileSync(LOG_FILE, tail.join("\n") + "\n", "utf8");
    console.log(
      `[LOGS] Rotation effectuée, fichier tronqué à ${tail.length} lignes`
    );
  } catch (e) {
    console.error("[LOGS] Erreur rotation:", e.message);
  }
}

function writeLog(level, tag, message) {
  const now = new Date();
  const stamp = now.toLocaleString("fr-FR");
  const safeMsg = maskSecrets(message || "");
  const line = `[${stamp}] [${level}] [${tag}] ${safeMsg}`;

  console.log(line);
  appendLogLine(line);

  logCount++;
  if (logCount % 50 === 0) {
    rotateLogsIfNeeded();
  }
}

const logInfo = (tag, msg) => writeLog(LOG_LEVELS.INFO, tag, msg);
const logWarn = (tag, msg) => writeLog(LOG_LEVELS.WARN, tag, msg);
const logError = (tag, msg) => writeLog(LOG_LEVELS.ERROR, tag, msg);

// ============================================================================
// VALIDATION CONFIG
// ============================================================================

if (!RSS_PASSKEY) {
  logError("CONFIG", "Missing RSS_PASSKEY env var");
  process.exit(1);
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();

app.use(express.json());

try {
  fs.mkdirSync(POSTERS_DIR, { recursive: true });
  logInfo("POSTERS", `Dossier des affiches prêt: ${POSTERS_DIR}`);
} catch (e) {
  logError("POSTERS", `Impossible de créer le dossier des affiches: ${e.message}`);
}

app.use("/posters", express.static(POSTERS_DIR));
app.use(express.static(path.join(__dirname, "public")));

app.get("/version", (req, res) => {
  res.json({ version: APP_VERSION });
});

// ============================================================================
// SQLITE INIT
// ============================================================================

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guid          TEXT UNIQUE,
    category      TEXT,
    raw_title     TEXT,
    title         TEXT,
    year          INTEGER,
    episode       TEXT,
    size          TEXT,
    seeders       INTEGER,
    quality       TEXT,
    added_at      TEXT,
    added_at_ts   INTEGER,
    poster        TEXT,
    page_link     TEXT,
    download_link TEXT,
    created_at    INTEGER,
    updated_at    INTEGER
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_items_category_date
    ON items (category, added_at_ts DESC);

  CREATE INDEX IF NOT EXISTS idx_items_category_seeders
    ON items (category, seeders DESC);

  CREATE TABLE IF NOT EXISTS favorites (
    guid TEXT PRIMARY KEY,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS posters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    provider    TEXT NOT NULL,
    media_type  TEXT NOT NULL,
    external_id TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    last_access INTEGER,
    UNIQUE (provider, media_type, external_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// ============================================================================
// SETTINGS GLOBAUX (table settings) + intervalle de sync
// ============================================================================

const getSettingStmt = db.prepare(`
  SELECT value
  FROM settings
  WHERE key = ?
`);

const upsertSettingStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

function loadSyncIntervalFromDb() {
  try {
    const row = getSettingStmt.get("sync_interval_minutes");
    if (row && row.value != null) {
      const v = Number(row.value);
      if (Number.isFinite(v)) {
        return v;
      }
    }
  } catch (err) {
    logError("SETTINGS", `Erreur lecture sync_interval_minutes: ${err.message}`);
  }
  return DEFAULT_SYNC_INTERVAL_MINUTES;
}

function saveSyncIntervalToDb(minutes) {
  const now = Date.now();
  try {
    upsertSettingStmt.run("sync_interval_minutes", String(minutes), now);
  } catch (err) {
    logError("SETTINGS", `Erreur écriture sync_interval_minutes: ${err.message}`);
  }
}

function loadRetentionDaysFromDb() {
  try {
    const row = getSettingStmt.get("retention_days");
    if (row && row.value != null) {
      const v = Number(row.value);
      if (Number.isFinite(v) && v > 0) {
        return v;
      }
    }
  } catch (err) {
    logError("SETTINGS", `Erreur lecture retention_days: ${err.message}`);
  }
  return DEFAULT_RETENTION_DAYS;
}

function saveRetentionDaysToDb(days) {
  const now = Date.now();
  try {
    upsertSettingStmt.run("retention_days", String(days), now);
  } catch (err) {
    logError("SETTINGS", `Erreur écriture retention_days: ${err.message}`);
  }
}

/**
 * (Re)programme la sync périodique.
 * minutes <= 0  => pas de sync automatique.
 */
function schedulePeriodicSync(minutes) {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }

  const m = Number(minutes);
  currentSyncIntervalMinutes = m;

  if (!Number.isFinite(m) || m <= 0) {
    logWarn("SYNC", "Intervalle <= 0 → pas de synchronisation automatique");
    return;
  }

  const ms = m * 60 * 1000;
  logInfo("SYNC", `Programmation: toutes les ${m} minutes`);

  syncIntervalHandle = setInterval(() => {
    syncAllCategories().catch((e) =>
      logError("SYNC_PERIODIC", `Erreur: ${e.message}`)
    );
  }, ms);
}

// ============================================================================
// PREPARED STATEMENTS POUR LES AFFICHES LOCALES (TABLE posters)
// ============================================================================

const selectPosterStmt = db.prepare(`
  SELECT file_path
  FROM posters
  WHERE provider = ?
    AND media_type = ?
    AND external_id = ?
`);

const insertPosterStmtLocal = db.prepare(`
  INSERT INTO posters (
    provider, media_type, external_id, file_path, created_at, last_access
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const updatePosterLastAccessStmt = db.prepare(`
  UPDATE posters
  SET last_access = ?
  WHERE provider = ?
    AND media_type = ?
    AND external_id = ?
`);

const deletePosterStmt = db.prepare(`
  DELETE FROM posters
  WHERE provider = ?
    AND media_type = ?
    AND external_id = ?
`);

const countItemsUsingPosterStmt = db.prepare(`
  SELECT COUNT(*) AS cnt
  FROM items
  WHERE poster LIKE ?
`);

// ============================================================================
// HELPERS FICHIERS POUR LES AFFICHES
// ============================================================================

async function downloadImageToFile(url, destPath) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      logWarn("POSTERS_DL", `HTTP ${resp.status} pour ${url}`);
      return false;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await fs.promises.writeFile(destPath, buffer);
    return true;
  } catch (err) {
    logError("POSTERS_DL", `Erreur téléchargement ${url} → ${destPath}: ${err.message}`);
    return false;
  }
}

// ============================================================================
// CACHE D'AFFICHES LOCALES (DB + FILESYSTEM)
// ============================================================================

function buildPosterFileName(provider, mediaType, externalId) {
  const safeProvider = String(provider || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  const safeMediaType = String(mediaType || "any")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  const safeId = String(externalId || "id")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");

  return `${safeProvider}_${safeMediaType}_${safeId}.jpg`;
}

/**
 * Garantit la présence d'une affiche en local et renvoie l'URL /posters/...
 *
 * @param {Object} params
 * @param {string} params.provider
 * @param {string} params.mediaType
 * @param {string|number} params.externalId
 * @param {string} [params.remoteUrl]
 *
 * @returns {Promise<string|null>}
 */
async function ensureLocalPoster({ provider, mediaType, externalId, remoteUrl }) {
  if (!provider || !mediaType || externalId == null) {
    logWarn(
      "POSTERS",
      `ensureLocalPoster appelé sans provider/mediaType/externalId valides (provider="${provider}", mediaType="${mediaType}", externalId="${externalId}")`
    );
    return null;
  }

  const now = Date.now();
  const providerKey = String(provider).toLowerCase();
  const mediaTypeKey = String(mediaType).toLowerCase();
  const externalIdKey = String(externalId);

  let row = selectPosterStmt.get(providerKey, mediaTypeKey, externalIdKey);

  if (row && row.file_path) {
    const absPath = path.join(POSTERS_DIR, row.file_path);

    if (fs.existsSync(absPath)) {
      try {
        updatePosterLastAccessStmt.run(now, providerKey, mediaTypeKey, externalIdKey);
      } catch (err) {
        logError("POSTERS", `Erreur update last_access: ${err.message}`);
      }

      return `/posters/${row.file_path}`;
    }

    try {
      deletePosterStmt.run(providerKey, mediaTypeKey, externalIdKey);
      logWarn(
        "POSTERS",
        `Entrée poster orpheline supprimée (fichier manquant): provider=${providerKey}, mediaType=${mediaTypeKey}, externalId=${externalIdKey}`
      );
    } catch (err) {
      logError("POSTERS", `Erreur suppression entrée orpheline: ${err.message}`);
    }

    row = null;
  }

  if (!remoteUrl) {
    logWarn(
      "POSTERS",
      `Aucun poster local et pas de remoteUrl fourni (provider=${providerKey}, mediaType=${mediaTypeKey}, externalId=${externalIdKey})`
    );
    return null;
  }

  const fileName = buildPosterFileName(providerKey, mediaTypeKey, externalIdKey);
  const filePathRelative = fileName;
  const absPath = path.join(POSTERS_DIR, fileName);

  const ok = await downloadImageToFile(remoteUrl, absPath);
  if (!ok) {
    return null;
  }

  try {
    insertPosterStmtLocal.run(
      providerKey,
      mediaTypeKey,
      externalIdKey,
      filePathRelative,
      now,
      now
    );
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      logWarn(
        "POSTERS",
        `Conflit UNIQUE sur posters (provider=${providerKey}, mediaType=${mediaTypeKey}, externalId=${externalIdKey}), on ignore.`
      );
    } else {
      logError("POSTERS", `Erreur insert poster: ${err.message}`);
    }
  }

  return `/posters/${filePathRelative}`;
}

// ============================================================================
// PURGE DES AFFICHES APRÈS SUPPRESSION D'ITEMS
// ============================================================================

function cleanupPostersAfterItemsPurge(deletedItems) {
  if (!Array.isArray(deletedItems) || deletedItems.length === 0) {
    return;
  }

  const posterKeyMap = new Map();

  for (const row of deletedItems) {
    if (!row || !row.poster) continue;

    const itemLike = {
      category: row.category,
      poster: row.poster,
    };

    const params = buildPosterCacheParamsFromItem(itemLike);
    if (!params) continue;

    const { provider, mediaType, externalId } = params;
    const keyStr = `${provider}||${mediaType}||${externalId}`;

    if (!posterKeyMap.has(keyStr)) {
      posterKeyMap.set(keyStr, params);
    }
  }

  if (posterKeyMap.size === 0) {
    return;
  }

  for (const params of posterKeyMap.values()) {
    const { provider, mediaType, externalId, remoteUrl } = params;
    const externalIdKey = String(externalId);

    let remaining = 0;
    try {
      const row = countItemsUsingPosterStmt.get(`%${externalIdKey}%`);
      remaining = row ? row.cnt : 0;
    } catch (err) {
      logError(
        "POSTERS_PURGE",
        `Erreur countItemsUsingPoster pour externalId=${externalIdKey}: ${err.message}`
      );
      continue;
    }

    if (remaining > 0) {
      continue;
    }

    try {
      deletePosterStmt.run(provider, mediaType, externalIdKey);
    } catch (err) {
      logError(
        "POSTERS_PURGE",
        `Erreur suppression entrée DB poster (provider=${provider}, mediaType=${mediaType}, externalId=${externalIdKey}): ${err.message}`
      );
    }

    const fileName = buildPosterFileName(provider, mediaType, externalIdKey);
    const absPath = path.join(POSTERS_DIR, fileName);

    try {
      if (fs.existsSync(absPath)) {
        fs.unlinkSync(absPath);
        logInfo(
          "POSTERS_PURGE",
          `Affiche supprimée: ${absPath} (provider=${provider}, mediaType=${mediaType}, externalId=${externalIdKey})`
        );
      }
    } catch (err) {
      logError(
        "POSTERS_PURGE",
        `Erreur suppression fichier d'affiche ${absPath}: ${err.message}`
      );
    }
  }
}

// ============================================================================
// NETTOYAGE GLOBAL DES AFFICHES ORPHELINES (DB + FILESYSTEM)
// ============================================================================

function cleanupPosterOrphans() {
  let dbRemoved = 0;
  let fsRemoved = 0;

  // --- Phase 1 : entrées DB "posters" sans aucun item associé ---
  try {
    const orphanRowsStmt = db.prepare(`
      SELECT p.provider, p.media_type, p.external_id, p.file_path
      FROM posters p
      LEFT JOIN items i
        ON i.poster LIKE '%' || p.external_id || '%'
      WHERE i.guid IS NULL
    `);

    const orphanRows = orphanRowsStmt.all() || [];

    for (const row of orphanRows) {
      const provider = row.provider;
      const mediaType = row.media_type;
      const externalIdKey = String(row.external_id);
      const filePathRel = row.file_path;

      try {
        deletePosterStmt.run(provider, mediaType, externalIdKey);
        dbRemoved++;
      } catch (err) {
        logError(
          "POSTERS_CLEANUP",
          `Erreur suppression entrée DB poster (provider=${provider}, mediaType=${mediaType}, externalId=${externalIdKey}): ${err.message}`
        );
      }

      if (filePathRel) {
        const absPath = path.join(POSTERS_DIR, filePathRel);
        try {
          if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
            fsRemoved++;
            logInfo(
              "POSTERS_CLEANUP",
              `Fichier d'affiche supprimé (orphelin DB): ${absPath}`
            );
          }
        } catch (err) {
          logError(
            "POSTERS_CLEANUP",
            `Erreur suppression fichier d'affiche (orphelin DB) ${absPath}: ${err.message}`
          );
        }
      }
    }
  } catch (err) {
    logError("POSTERS_CLEANUP", `Erreur phase 1 (DB orpheline): ${err.message}`);
  }

  // --- Phase 2 : fichiers sur disque sans entrée DB ---
  try {
    if (!fs.existsSync(POSTERS_DIR)) {
      logWarn("POSTERS_CLEANUP", `POSTERS_DIR n'existe pas: ${POSTERS_DIR}`);
    } else {
      const files = fs.readdirSync(POSTERS_DIR, { withFileTypes: true });

      const countByFilePathStmt = db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM posters
        WHERE file_path = ?
      `);

      for (const entry of files) {
        if (!entry.isFile()) continue;

        const fileName = entry.name;

        // On ne s'occupe que des fichiers d'images classiques
        if (!/\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
          continue;
        }

        let used = 0;
        try {
          const row = countByFilePathStmt.get(fileName);
          used = row ? row.cnt : 0;
        } catch (err) {
          logError(
            "POSTERS_CLEANUP",
            `Erreur vérification utilisation fichier ${fileName}: ${err.message}`
          );
          continue;
        }

        if (used > 0) {
          continue; // fichier encore référencé en DB
        }

        const absPath = path.join(POSTERS_DIR, fileName);

        try {
          fs.unlinkSync(absPath);
          fsRemoved++;
          logInfo(
            "POSTERS_CLEANUP",
            `Fichier d'affiche supprimé (orphelin FS): ${absPath}`
          );
        } catch (err) {
          logError(
            "POSTERS_CLEANUP",
            `Erreur suppression fichier d'affiche (orphelin FS) ${absPath}: ${err.message}`
          );
        }
      }
    }
  } catch (err) {
    logError("POSTERS_CLEANUP", `Erreur phase 2 (FS orphelin): ${err.message}`);
  }

  logInfo(
    "POSTERS_CLEANUP",
    `Nettoyage orphelins terminé: ${dbRemoved} entrées DB supprimées, ${fsRemoved} fichiers supprimés`
  );

  return { dbRemoved, fsRemoved };
}

// ============================================================================
// STATS AFFICHES (nombre de fichiers locaux)
// ============================================================================

async function countPosterFiles() {
  try {
    if (!fs.existsSync(POSTERS_DIR)) {
      logWarn("POSTERS_STATS", `POSTERS_DIR n'existe pas: ${POSTERS_DIR}`);
      return 0;
    }

    const entries = await fs.promises.readdir(POSTERS_DIR, { withFileTypes: true });

    let total = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;

      // On ne compte que les images "classiques"
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(entry.name)) {
        total++;
      }
    }

    return total;
  } catch (err) {
    logError("POSTERS_STATS", `Erreur lors du comptage des affiches: ${err.message}`);
    return 0;
  }
}

// ============================================================================
// RSS PARSER
// ============================================================================

const parser = new Parser({
  customFields: {
    item: [
      "enclosure",
      "category",
      "size",
      "seeders",
      "leechers",
      "uploaded_at",
      ["ygg:seeders", "seeders"],
      ["ygg:leechers", "leechers"],
      ["ygg:size", "size"],
    ],
  },
});

// ============================================================================
// HELPERS CATEGORIES / URL RSS
// ============================================================================

function normalizeCategoryKey(raw) {
  const c = (raw || "film").toLowerCase();

  if (c.startsWith("film")) return "film";
  if (c.startsWith("seri")) return "series";
  if (c.startsWith("emiss")) return "emissions";
  if (c.startsWith("spect")) return "spectacle";
  if (c.startsWith("anim")) return "animation";
  if (c.startsWith("jeu") || c.startsWith("game")) return "games";

  return "film";
}

const RSS_CATEGORY_IDS = {
  film: RSS_MOVIES_ID,
  series: RSS_SERIES_ID,
  emissions: RSS_SHOWS_ID,
  spectacle: RSS_SPECTACLE_ID,
  animation: RSS_ANIMATION_ID,
  games: RSS_GAMES_ID,
};

function getRssConfigForCategoryKey(catKey) {
  const key = normalizeCategoryKey(catKey);
  const id = RSS_CATEGORY_IDS[key];

  if (!id) {
    throw new Error(`No RSS ID configured for category "${key}"`);
  }

  const url = `https://yggapi.eu/rss?id=${id}&passkey=${RSS_PASSKEY}`;
  return { id, url };
}

// ============================================================================
// HELPERS TITRE / QUALITÉ / EPISODE
// ============================================================================

function guessTitleAndYear(rawTitle = "", kind = "film") {
  if (!rawTitle) {
    return { cleanTitle: "", year: null };
  }

  let t = rawTitle;

  t = t.replace(/\[.*?\]/g, " ");

  if (kind === "series") {
    const seriesCutRegexes = [/\bS\d{1,2}E\d{1,3}\b/i, /\bS\d{1,2}\b/i];
    for (const re of seriesCutRegexes) {
      const m = re.exec(t);
      if (m && m.index > 0) {
        t = t.slice(0, m.index);
        break;
      }
    }
  }

  t = t.replace(/[._]/g, " ");

  const yearMatch = t.match(/(19|20)\d{2}(?!\d)/);
  let year = null;
  let name = t;

  if (yearMatch) {
    year = parseInt(yearMatch[0], 10);
    name = t.slice(0, yearMatch.index).trim();
  }

  const tags = [
    "HYBRID",
    "MULTI",
    "MULTI VF2",
    "VF2",
    "VFF",
    "VFI",
    "VOSTFR",
    "TRUEFRENCH",
    "FRENCH",
    "WEBRIP",
    "WEB",
    "WEB DL",
    "WEBDL",
    "WEB-DL",
    "NF",
    "AMZN",
    "HMAX",
    "BLURAY",
    "BDRIP",
    "BRRIP",
    "BR RIP",
    "HDRIP",
    "DVDRIP",
    "HDTV",
    "1080P",
    "2160P",
    "720P",
    "4K",
    "UHD",
    "10BIT",
    "8BIT",
    "HDR",
    "HDR10",
    "HDR10PLUS",
    "DOLBY VISION",
    "DV",
    "X264",
    "X265",
    "H264",
    "H265",
    "AV1",
    "DDP5",
    "DDP5.1",
    "DDP",
    "AC3",
    "DTS",
    "DTS HD",
    "TRUEHD",
    "ATMOS",
    "THESYNDICATE",
    "QTZ",
    "SUPPLY",
    "BTT",
    "OUI",
  ];
  const tagRegex = new RegExp(`\\b(${tags.join("|")})\\b`, "gi");
  name = name.replace(tagRegex, " ");

  name = name.replace(/[-–_:()\[\]]+$/g, "");
  name = name.replace(/\s+/g, " ").trim();

  let cleanTitle = "";

  if (name) {
    cleanTitle = name;
  } else if (!name && !year) {
    cleanTitle = rawTitle.replace(/[._]/g, " ").trim();
  } else {
    cleanTitle = "";
  }

  return { cleanTitle, year };
}

function extractEpisodeInfo(rawTitle = "") {
  if (!rawTitle) return null;

  let t = rawTitle.replace(/\[.*?\]/g, " ");

  const fullEp = t.match(/\bS\d{1,2}E\d{1,3}\b/i);
  if (fullEp) {
    return fullEp[0].toUpperCase();
  }

  const saisonWord = t.match(/\bSaison\s+\d{1,2}\b/i);
  if (saisonWord) {
    return saisonWord[0].replace(/\s+/g, " ");
  }

  const seasonOnly = t.match(/\bS\d{1,2}\b/i);
  if (seasonOnly) {
    return seasonOnly[0].toUpperCase();
  }

  return null;
}

function extractQuality(rawTitle = "") {
  if (!rawTitle) return null;

  const upper = rawTitle.toUpperCase();

  let resolution = null;
  if (/\b(2160P|4K)\b/.test(upper)) {
    resolution = "2160p";
  } else if (/\b1080P\b/.test(upper)) {
    resolution = "1080p";
  } else if (/\b720P\b/.test(upper)) {
    resolution = "720p";
  }

  let codec = null;
  if (/\b(HEVC|H\.?265|X265)\b/.test(upper)) {
    codec = "x265 / H.265";
  } else if (/\b(H\.?264|X264)\b/.test(upper)) {
    codec = "x264 / H.264";
  } else if (/\bAV1\b/.test(upper)) {
    codec = "AV1";
  }

  const parts = [];
  if (resolution) parts.push(resolution);
  if (codec) parts.push(codec);

  return parts.length ? parts.join(" - ") : null;
}

// ============================================================================
// HELPERS JEUX (titre propre + requêtes IGDB)
// ============================================================================

function cleanGameTitle(rawTitle = "") {
  if (!rawTitle) return "";

  let t = rawTitle;

  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/\(S:\d+\/L:\d+\)/gi, " ");
  t = t.replace(/\([^)]*\d[^)]*\)/g, " ");
  t = t.replace(/[._]/g, " ");
  t = t.replace(
    /\b(FitGirl|Repack|ElAmigos|TENOKE|RUNE|Mephisto|GOG|PORTABLE|WIN|X64|X86|MULTI\d*|MULTI|EN|FR|VOICES\d+|Net8)\b/gi,
    " "
  );

  t = t.replace(/\s*\/\s*\d+\s*build\b.*$/i, " ");
  t = t.replace(/\s*\/\s*build\b.*$/i, " ");
  t = t.replace(/\bbuild\b.*$/i, " ");
  t = t.replace(/[:\-]\s*Update\b.*$/i, " ");
  t = t.replace(/\bUpdate\b.*$/i, " ");
  t = t.replace(/\b\d{4}-\d{2}-\d{2}-\d+\b/g, " ");
  t = t.replace(/\bV\d{6,}(?:\.\d+)*\b/gi, " ");
  t = t.replace(/\bv\d+(?:[._]\d+){1,}\b/gi, " ");
  t = t.replace(/\b\d+(?:[._]\d+){1,}\b/gi, " ");
  t = t.replace(/\b\d{5,}\b/g, " ");
  t = t.replace(/[:\-–_]+$/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  if (!t) {
    return rawTitle.replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  }

  return t;
}

function cleanGameTitleForIgdb(rawTitle = "") {
  let t = cleanGameTitle(rawTitle);
  if (!t) return "";

  t = t.replace(/\b(Manual|CE)\b.*$/i, " ");
  t = t.replace(
    /\b(Relaunched|Deluxe Edition|Ultimate Edition|Royal Edition|Digital Deluxe Edition|Complete Edition|Game of the Year)\b.*$/i,
    " "
  );

  t = t.replace(/\+\s*DLCs?\/?Bonuses?.*$/i, " ");
  t = t.replace(/\bUpdate\b.*$/i, " ");
  t = t.replace(/\/\s*build\b.*$/i, " ");
  t = t.replace(/\bbuild\s*\d+\b.*$/i, " ");
  t = t.replace(/\s*[-–]\s*(P2P|Repack.*)$/i, " ");
  t = t.replace(/[:\-–_]+$/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

// ============================================================================
// HELPERS TEXTE RSS (date / taille / seeders)
// ============================================================================

function getItemText(item) {
  return (
    [
      item.contentSnippet,
      item.content,
      item.summary,
      item.description,
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() || ""
  );
}

function parseYggMeta(item) {
  const text = getItemText(item);

  let addedAtStr = null;
  const dateMatch = text.match(
    /Ajouté le\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})/i
  );
  if (dateMatch) {
    addedAtStr = dateMatch[1];
  }

  let sizeStr = null;

  const sizeMatch1 = text.match(
    /Taille(?:\s+de l'upload)?\s*:\s*([0-9.,]+\s*[A-Za-z]+)\b/i
  );
  if (sizeMatch1) {
    sizeStr = sizeMatch1[1].replace(/\s+/g, "");
  } else {
    const sizeMatch2 = text.match(/Taille[^0-9]*([0-9.,]+\s*[A-Za-z]+)/i);
    if (sizeMatch2) {
      sizeStr = sizeMatch2[1].replace(/\s+/g, "");
    }
  }

  let seedersParsed = null;
  const seedMatch = text.match(/(\d+)\s*seeders?/i);
  if (seedMatch) {
    seedersParsed = Number(seedMatch[1]);
  }

  return { addedAtStr, sizeStr, seedersParsed };
}

function timestampFromYggDate(str) {
  if (!str) return 0;
  const m = str.match(
    /^([0-9]{2})\/([0-9]{2})\/([0-9]{4})\s+([0-9]{2}):([0-9]{2}):([0-9]{2})$/
  );
  if (!m) return 0;
  const [, dd, mm, yyyy, hh, ii, ss] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(ii),
    Number(ss)
  );
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

// ============================================================================
// TMDB HELPERS + CACHE
// ============================================================================

async function tmdbSearch(pathUrl, params) {
  const url = new URL(`${TMDB_BASE_URL}${pathUrl}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  });

  logInfo("TMDB_CALL", `Search ${pathUrl} → ${url.toString()}`);

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      logWarn("TMDB_HTTP", `HTTP ${resp.status} ${url.toString()}`);
      return null;
    }

    const data = await resp.json();
    if (!data.results || !data.results.length) return null;

    const best = data.results.find((r) => r.poster_path) || data.results[0];
    if (!best.poster_path) return null;

    return `https://image.tmdb.org/t/p/w342${best.poster_path}`;
  } catch (err) {
    logError("TMDB", `Erreur: ${err.message} ${url.toString()}`);
    return null;
  }
}

async function fetchPosterForTitle(rawTitle, categoryRaw) {
  if (!TMDB_API_KEY || !rawTitle) return null;

  const cacheKey = `${categoryRaw || "any"}::${rawTitle.toLowerCase()}`;
  if (posterCache.has(cacheKey)) {
    return posterCache.get(cacheKey);
  }

  const catKey = normalizeCategoryKey(categoryRaw);

  if (catKey === "games") {
    posterCache.set(cacheKey, null);
    return null;
  }

  const kind = catKey === "series" || catKey === "emissions" ? "series" : "film";

  const { cleanTitle, year } = guessTitleAndYear(rawTitle, kind);
  const queryBase =
    cleanTitle && cleanTitle.length > 0
      ? cleanTitle
      : rawTitle.replace(/[._]/g, " ").trim();

  if (!queryBase) {
    posterCache.set(cacheKey, null);
    return null;
  }

  let poster = null;

  if (year && kind === "film") {
    poster =
      (await tmdbSearch("/search/movie", {
        api_key: TMDB_API_KEY,
        language: "fr-FR",
        query: queryBase,
        year,
      })) || null;
  }

  if (!poster && kind === "film") {
    poster = await tmdbSearch("/search/movie", {
      api_key: TMDB_API_KEY,
      language: "fr-FR",
      query: queryBase,
    });
  }

  if (!poster && kind === "film") {
    poster = await tmdbSearch("/search/movie", {
      api_key: TMDB_API_KEY,
      language: "en-US",
      query: queryBase,
      year,
    });
  }

  if (!poster && kind === "series" && year) {
    poster = await tmdbSearch("/search/tv", {
      api_key: TMDB_API_KEY,
      language: "fr-FR",
      query: queryBase,
      first_air_date_year: year,
    });
  }

  if (!poster && kind === "series") {
    poster = await tmdbSearch("/search/tv", {
      api_key: TMDB_API_KEY,
      language: "fr-FR",
      query: queryBase,
    });
  }

  if (!poster && kind === "series") {
    poster = await tmdbSearch("/search/tv", {
      api_key: TMDB_API_KEY,
      language: "en-US",
      query: queryBase,
    });
  }

  if (!poster && rawTitle !== queryBase) {
    const q = rawTitle.replace(/[._]/g, " ");
    poster =
      (await tmdbSearch("/search/movie", {
        api_key: TMDB_API_KEY,
        language: "fr-FR",
        query: q,
      })) ||
      (await tmdbSearch("/search/tv", {
        api_key: TMDB_API_KEY,
        language: "fr-FR",
        query: q,
      }));
  }

  let finalPoster = poster;

  if (poster) {
    try {
      const mediaType = kind === "series" ? "series" : "film";
      const externalId =
        extractImageKeyFromUrl(poster) || `${mediaType}_${cacheKey}`;

      const localUrl = await ensureLocalPoster({
        provider: "tmdb",
        mediaType,
        externalId,
        remoteUrl: poster,
      });

      if (localUrl) {
        finalPoster = localUrl;
      }
    } catch (e) {
      logError(
        "TMDB_POSTER",
        `Erreur cache local poster pour "${rawTitle}" (${kind}): ${e.message}`
      );
    }
  }

  if (!finalPoster) {
    logWarn(
      "TMDB_NO_POSTER",
      `AUCUN POSTER | rawTitle="${rawTitle}" | query="${queryBase}" | year=${year != null ? year : "?"} | kind=${kind}`
    );
  }

  posterCache.set(cacheKey, finalPoster || null);
  return finalPoster || null;
}


// ============================================================================
// IGDB HELPERS + CACHE (JEUX)
// ============================================================================

let igdbToken = null;
let igdbTokenExpiry = 0;

async function getIgdbToken() {
  if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
    logWarn("IGDB", "IGDB_CLIENT_ID ou IGDB_CLIENT_SECRET non configuré");
    return null;
  }

  const now = Date.now();
  if (igdbToken && now < igdbTokenExpiry - 60 * 1000) {
    return igdbToken;
  }

  try {
    const params = new URLSearchParams({
      client_id: IGDB_CLIENT_ID,
      client_secret: IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    const resp = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!resp.ok) {
      logError("IGDB_TOKEN", `HTTP ${resp.status} lors de la récupération du token`);
      return null;
    }

    const data = await resp.json();
    igdbToken = data.access_token;
    const expiresIn = data.expires_in || 0;
    igdbTokenExpiry = now + expiresIn * 1000;

    logInfo("IGDB", `Token obtenu (expire dans ${expiresIn}s)`);
    return igdbToken;
  } catch (err) {
    logError("IGDB_TOKEN", `Erreur: ${err.message}`);
    return null;
  }
}

async function igdbSearchGame(title) {
  const token = await getIgdbToken();
  if (!token) return null;

  const safeTitle = title.replace(/"/g, '\\"');

  const query = [
    `search "${safeTitle}";`,
    "fields name, cover.image_id, first_release_date;",
    "limit 10;",
  ].join(" ");

  logInfo("IGDB_CALL", `Search "${safeTitle}"`);

  try {
    const resp = await fetch(`${IGDB_BASE_URL}/games`, {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: query,
    });

    if (!resp.ok) {
      logWarn("IGDB_HTTP", `HTTP ${resp.status} pour "${safeTitle}"`);
      return null;
    }

    const games = await resp.json();
    if (!Array.isArray(games) || games.length === 0) {
      return null;
    }

    const withCover = games.filter((g) => g.cover && g.cover.image_id);
    const chosen = withCover[0] || games[0];

    if (!chosen.cover || !chosen.cover.image_id) {
      return null;
    }

    const imageId = chosen.cover.image_id;
    const url = `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
    return url;
  } catch (err) {
    logError("IGDB", `Erreur recherche IGDB pour "${title}": ${err.message}`);
    return null;
  }
}

async function fetchIgdbCoverForTitle(rawTitle = "") {
  if (!rawTitle) return null;

  const cacheKey = `games::${rawTitle.toLowerCase()}`;
  if (posterCache.has(cacheKey)) {
    return posterCache.get(cacheKey);
  }

  const mainTitle = cleanGameTitleForIgdb(rawTitle);
  if (!mainTitle) {
    posterCache.set(cacheKey, null);
    return null;
  }

  const queries = new Set();
  queries.add(mainTitle);

  if (mainTitle.includes(":")) {
    queries.add(mainTitle.split(":")[0].trim());
  }
  if (mainTitle.includes(" - ")) {
    queries.add(mainTitle.split(" - ")[0].trim());
  }
  if (mainTitle.includes(" – ")) {
    queries.add(mainTitle.split(" – ")[0].trim());
  }

  let coverUrl = null;
  let usedQuery = mainTitle;

  for (const q of queries) {
    if (!q) continue;
    coverUrl = await igdbSearchGame(q);
    if (coverUrl) {
      usedQuery = q;
      break;
    }
  }

  if (!coverUrl) {
    logWarn(
      "IGDB_NO_COVER",
      `Aucune cover IGDB | rawTitle="${rawTitle}" | query="${Array.from(queries).join(" || ")}"`
    );
  } else {
    logInfo("IGDB_MATCH", `Match cover IGDB | rawTitle="${rawTitle}" | query="${usedQuery}"`);
  }

  posterCache.set(cacheKey, coverUrl || null);
  return coverUrl || null;
}

// ============================================================================
// SYNC YGG → SQLITE
// ============================================================================

const insertItemStmt = db.prepare(`
  INSERT INTO items (
    guid, category, raw_title, title, year, episode,
    size, seeders, quality,
    added_at, added_at_ts,
    poster, page_link, download_link,
    created_at, updated_at
  )
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const updateItemStmt = db.prepare(`
  UPDATE items
  SET
    size = COALESCE(?, size),
    seeders = ?,
    added_at = COALESCE(?, added_at),
    added_at_ts = CASE
      WHEN ? > 0 THEN ?
      ELSE added_at_ts
    END,
    updated_at = ?
  WHERE guid = ?
`);

const getItemByGuidStmt = db.prepare(`
  SELECT id, poster FROM items WHERE guid = ?
`);

const updateItemTitleStmt = db.prepare(`
  UPDATE items
  SET title = ?, updated_at = ?
  WHERE guid = ?
`);

async function syncCategory(catKey) {
  const normCat = normalizeCategoryKey(catKey);
  const { id, url } = getRssConfigForCategoryKey(normCat);

  logInfo("SYNC", `Catégorie ${normCat} → id=${id} (YGGAPI)`);

  const feed = await parser.parseURL(url);
  const items = feed.items || [];

  logInfo("SYNC", `${normCat}: ${items.length} items RSS`);

  for (const item of items) {
    try {
      const rawTitle = item.title || "";
      const kind =
        normCat === "series" || normCat === "emissions" ? "series" : "film";

      const { cleanTitle, year } = guessTitleAndYear(rawTitle, kind);
      const quality = extractQuality(rawTitle);
      const episode = kind === "series" ? extractEpisodeInfo(rawTitle) : null;

      let displayTitle = cleanTitle || rawTitle;
      if (normCat === "games") {
        displayTitle = cleanGameTitle(rawTitle);
      }

      const { addedAtStr, sizeStr, seedersParsed } = parseYggMeta(item);

      const guid = item.guid || item.link || rawTitle;
      const pageLink =
        item.link ||
        (item.guid && item.guid.includes("http") ? item.guid : null) ||
        null;
      const downloadLink =
        (item.enclosure && item.enclosure.url) || pageLink || null;

      const addedAt = addedAtStr || null;
      const addedAtTs =
        addedAtStr != null
          ? timestampFromYggDate(addedAtStr)
          : (() => {
              const d = new Date(
                item.uploaded_at || item.pubDate || item.isoDate || ""
              );
              const t = d.getTime();
              return Number.isNaN(t) ? 0 : t;
            })();

      const size = sizeStr || (item.size != null ? String(item.size) : null);
      const seeders =
        item.seeders != null && !Number.isNaN(Number(item.seeders))
          ? Number(item.seeders)
          : seedersParsed != null
          ? seedersParsed
          : 0;

      const now = Date.now();
      const existing = getItemByGuidStmt.get(guid);

      if (!existing) {
        let poster = null;

        try {
          let remotePoster = null;

          // 1) On récupère l'URL distante (TMDB ou IGDB) comme avant
          if (normCat === "games") {
            remotePoster = await fetchIgdbCoverForTitle(rawTitle);
          } else if (TMDB_API_KEY) {
            remotePoster = await fetchPosterForTitle(rawTitle, normCat);
          }

          // 2) Si on a une URL distante, on force le cache local tout de suite
          if (remotePoster) {
            const cacheParams = buildPosterCacheParamsFromItem({
              category: normCat,
              poster: remotePoster,
            });

            if (cacheParams) {
              const localUrl = await ensureLocalPoster(cacheParams);
              // On stocke l'URL locale si dispo, sinon on retombe sur l'URL distante
              poster = localUrl || remotePoster;
            } else {
              poster = remotePoster;
            }
          }
        } catch (e) {
          const src = normCat === "games" ? "IGDB" : "TMDB";
          logError(
            src,
            `Poster error pour "${rawTitle}" (${normCat}): ${e.message}`
          );
        }

        insertItemStmt.run(
          guid,
          normCat,
          rawTitle,
          displayTitle,
          year || null,
          episode,
          size,
          seeders,
          quality,
          addedAt,
          addedAtTs,
          poster,
          pageLink,
          downloadLink,
          now,
          now
        );
      } else {
        updateItemStmt.run(
          size,
          seeders,
          addedAt,
          addedAtTs,
          addedAtTs,
          now,
          guid
        );
      }
    } catch (e) {
      logError("SYNC", `Erreur item ${normCat}: ${e.message}`);
    }
  }

  logInfo("SYNC", `Catégorie ${normCat} terminée.`);
  return items.length;
}

// ============================================================================
// HELPERS POUR LES CLES D'AFFICHES LOCALES
// ============================================================================

function extractImageKeyFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const pathname = u.pathname || "";
    const m = pathname.match(/\/([^\/]+)\.(jpg|jpeg|png|webp)$/i);
    if (!m) return pathname || url;
    return m[1];
  } catch {
    return url;
  }
}

function buildPosterCacheParamsFromItem(item) {
  if (!item || !item.poster) return null;

  const remoteUrl = item.poster;
  if (typeof remoteUrl !== "string" || !remoteUrl.trim()) return null;

  if (/^\/posters\//.test(remoteUrl)) {
    return null;
  }

  const category = item.category || "film";
  const normCat = normalizeCategoryKey(category);

  const provider = normCat === "games" ? "igdb" : "tmdb";
  const mediaType = normCat;

  const externalId = extractImageKeyFromUrl(remoteUrl);
  if (!externalId) return null;

  return {
    provider,
    mediaType,
    externalId,
    remoteUrl,
  };
}

async function enrichItemsWithLocalPosters(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return items || [];
  }

  const tasks = items.map(async (item) => {
    try {
      const params = buildPosterCacheParamsFromItem(item);
      if (!params) {
        return item;
      }

      const localUrl = await ensureLocalPoster(params);
      if (localUrl) {
        item.posterUrl = localUrl;
      } else {
        item.posterUrl = item.poster || null;
      }
    } catch (err) {
      logError(
        "POSTERS",
        `Erreur enrichItemsWithLocalPosters pour guid=${item.guid || "?"}: ${err.message}`
      );
      item.posterUrl = item.poster || null;
    }
    return item;
  });

  await Promise.all(tasks);
  return items;
}

// ============================================================================
// PURGE BDD (rétention)
// ============================================================================

function purgeOldItems(maxAgeDays) {
  const base = retentionDays;
  const daysRaw =
    typeof maxAgeDays === "number" && Number.isFinite(maxAgeDays) && maxAgeDays > 0
      ? maxAgeDays
      : base;

  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : DEFAULT_RETENTION_DAYS;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const selectToDeleteStmt = db.prepare(`
    SELECT guid, category, poster
    FROM items
    WHERE added_at_ts IS NOT NULL
      AND added_at_ts > 1000000000000
      AND added_at_ts < ?
  `);

  const itemsToDelete = selectToDeleteStmt.all(cutoff) || [];

  const deleteStmt = db.prepare(`
    DELETE FROM items
    WHERE added_at_ts IS NOT NULL
      AND added_at_ts > 1000000000000
      AND added_at_ts < ?
  `);

  const info = deleteStmt.run(cutoff);
  const deleted = info.changes || 0;

  logInfo(
    "PURGE",
    `${deleted} anciens items supprimés (avant ${new Date(
      cutoff
    ).toLocaleString("fr-FR")} | rétention = ${days} jours)`
  );

  try {
    if (itemsToDelete.length > 0) {
      cleanupPostersAfterItemsPurge(itemsToDelete);
    }
  } catch (err) {
    logError(
      "POSTERS_PURGE",
      `Erreur pendant cleanupPostersAfterItemsPurge: ${err.message}`
    );
  }

  return deleted;
}

async function syncAllCategories() {
  const cats = CATEGORY_CONFIGS.map((c) => c.key);

  logInfo("SYNC", "Lancement de la synchronisation globale…");

  const summary = {};
  let purgedCount = 0;

  for (const cat of cats) {
    try {
      const count = await syncCategory(cat);
      summary[cat] = count;
    } catch (e) {
      logError("SYNC", `Erreur catégorie ${cat}: ${e.message}`);
      summary[cat] = null;
    }
  }

  purgedCount = purgeOldItems();

  const parts = Object.entries(summary).map(
    ([key, count]) => `${key}=${count != null ? count : "?"}`
  );
  parts.push(`purged=${purgedCount}`);

  logInfo("SYNC", `Résumé: ${parts.join(", ")}`);
  logInfo("SYNC", "Synchronisation globale terminée.");

  lastSyncAt = new Date().toISOString();

  return {
    summary,
    purged: purgedCount,
  };
}

// ============================================================================
// FAVORIS (API + BDD)
// ============================================================================

app.get("/api/favorites", (req, res) => {
  const rows = db.prepare("SELECT guid FROM favorites").all();
  res.json({ favorites: rows.map((r) => r.guid) });
});

app.post("/api/favorites/:guid", (req, res) => {
  const guid = req.params.guid;
  try {
    db.prepare("INSERT OR IGNORE INTO favorites (guid) VALUES (?)").run(guid);
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/favorites error:", err);
    res.status(500).json({ ok: false });
  }
});

app.delete("/api/favorites/:guid", (req, res) => {
  const guid = req.params.guid;
  try {
    db.prepare("DELETE FROM favorites WHERE guid = ?").run(guid);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/favorites error:", err);
    res.status(500).json({ ok: false });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    lastSyncAt,
    isSyncRunning,
    syncIntervalMinutes: currentSyncIntervalMinutes,
  });
});

// ============================================================================
// API CONFIG : intervalle de synchronisation
// ============================================================================

app.get("/api/config/sync-interval", (req, res) => {
  res.json({
    ok: true,
    minutes: currentSyncIntervalMinutes,
    isManual: !Number.isFinite(currentSyncIntervalMinutes) || currentSyncIntervalMinutes <= 0,
    defaultMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  });
});

app.post("/api/config/sync-interval", (req, res) => {
  // On accepte JSON { minutes: ... } ou ?minutes=
  const raw =
    (req.body && (req.body.minutes ?? req.body.value)) ??
    req.query.minutes;

  let minutes;

  if (typeof raw === "string" && raw.toLowerCase() === "manual") {
    minutes = 0; // 0 = mode manuel (pas de sync auto)
  } else {
    minutes = Number(raw);
  }

  if (!Number.isFinite(minutes)) {
    return res.status(400).json({
      ok: false,
      error: "Valeur minutes invalide",
    });
  }

  // Persistance BDD
  saveSyncIntervalToDb(minutes);

  // Reprogrammation du scheduler
  schedulePeriodicSync(minutes);

  logInfo(
    "SYNC_CFG",
    `Intervalle de synchronisation mis à jour: ${minutes} minutes`
  );

  return res.json({
    ok: true,
    minutes,
    isManual: minutes <= 0,
  });
});

// ============================================================================
// API RÉTENTION (durée de conservation en BDD)
// ============================================================================

app.get("/api/retention", (req, res) => {
  res.json({
    ok: true,
    days: retentionDays,
    defaultDays: DEFAULT_RETENTION_DAYS,
  });
});

app.post("/api/retention", (req, res) => {
  const raw =
    (req.body && (req.body.days ?? req.body.value)) ??
    req.query.days;

  const newDays = Number(raw);

  if (!Number.isFinite(newDays) || newDays <= 0) {
    return res.status(400).json({
      ok: false,
      error: "Durée de rétention invalide",
    });
  }

  const oldDays = retentionDays;
  retentionDays = newDays;

  saveRetentionDaysToDb(newDays);

  logInfo(
    "PURGE_CFG",
    `Durée de rétention mise à jour: ${oldDays} jours → ${newDays} jours`
  );

  let purged = 0;
  try {
    purged = purgeOldItems(newDays);
  } catch (e) {
    logError("PURGE_CFG", `Erreur purge après changement rétention: ${e.message}`);
  }

  return res.json({
    ok: true,
    previousDays: oldDays,
    days: retentionDays,
    purged,
  });
});


// ============================================================================
// SYNC API : empêcher plusieurs synchros en parallèle
// ============================================================================

let isSyncRunning = false;

async function runGlobalSyncOnce() {
  if (isSyncRunning) {
    logWarn("SYNC", "Tentative de sync alors qu'une sync est déjà en cours.");
    return { alreadyRunning: true };
  }

  isSyncRunning = true;
  const startedAt = Date.now();

  try {
    const result = await syncAllCategories();
    const durationMs = Date.now() - startedAt;

    return {
      alreadyRunning: false,
      startedAt,
      durationMs,
      ...result,
    };
  } catch (e) {
    logError("SYNC", `Erreur pendant runGlobalSyncOnce: ${e.message}`);
    throw e;
  } finally {
    isSyncRunning = false;
  }
}

// ============================================================================
// SELECTS BDD POUR /api/feed
// ============================================================================

function selectItemsFromDb(category, sort, limitParam) {
  let orderBy = "added_at_ts DESC";
  if (sort === "seeders") {
    orderBy = "seeders DESC";
  } else if (sort === "name") {
    orderBy = "title COLLATE NOCASE ASC";
  }

  let limitClause = "";
  const params = [category];
  const limitNum = limitParam === "all" ? null : Number(limitParam);

  if (limitNum && !Number.isNaN(limitNum)) {
    limitClause = "LIMIT ?";
    params.push(limitNum);
  }

  const sql = `
    SELECT
      i.category,
      i.title,
      i.raw_title     AS rawTitle,
      i.year,
      i.episode,
      i.size,
      i.seeders,
      i.quality,
      i.added_at      AS addedAt,
      i.added_at_ts   AS addedAtTs,
      i.poster,
      i.page_link     AS pageLink,
      i.download_link AS download,
      i.guid,
      CASE WHEN f.guid IS NOT NULL THEN 1 ELSE 0 END AS isFavorite
    FROM items i
    LEFT JOIN favorites f ON f.guid = i.guid
    WHERE i.category = ?
    ORDER BY ${orderBy}
    ${limitClause};
  `;

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

function selectFavoritesFromDb(sort, limitParam) {
  let orderBy = "i.added_at_ts DESC";
  if (sort === "seeders") {
    orderBy = "i.seeders DESC";
  } else if (sort === "name") {
    orderBy = "i.title COLLATE NOCASE ASC";
  }

  const params = [];
  let limitClause = "";
  const limitNum = limitParam === "all" ? null : Number(limitParam);

  if (limitNum && !Number.isNaN(limitNum)) {
    limitClause = "LIMIT ?";
    params.push(limitNum);
  }

  const sql = `
    SELECT
      i.category,
      i.title,
      i.raw_title     AS rawTitle,
      i.year,
      i.episode,
      i.size,
      i.seeders,
      i.quality,
      i.added_at      AS addedAt,
      i.added_at_ts   AS addedAtTs,
      i.poster,
      i.page_link     AS pageLink,
      i.download_link AS download,
      i.guid,
      1 AS isFavorite
    FROM favorites f
    JOIN items i ON i.guid = f.guid
    ORDER BY ${orderBy}
    ${limitClause};
  `;

  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

// ============================================================================
// API LOGS (popup "Logs")
// ============================================================================

app.get("/api/logs", (req, res) => {
  const limit = Number(req.query.limit || 200);

  fs.readFile(LOG_FILE, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        return res.json({ lines: [] });
      }
      console.error("[LOGS] Erreur lecture fichier:", err.message);
      return res.status(500).json({ error: "Erreur lecture logs" });
    }

    const lines = data.split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(-limit).reverse();

    res.json({ lines: tail });
  });
});

// ============================================================================
// API SYNC (lance une synchro globale YGG → SQLite)
// ============================================================================

app.post("/api/sync", async (req, res) => {
  try {
    const info = await runGlobalSyncOnce();

    if (info.alreadyRunning) {
      return res.status(409).json({
        ok: false,
        error: "Sync déjà en cours",
      });
    }

    return res.json({
      ok: true,
      running: false,
      durationMs: info.durationMs,
      summary: info.summary,
      purged: info.purged,
    });
  } catch (err) {
    logError("API_SYNC", `Erreur /api/sync: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: "Erreur pendant la synchronisation",
    });
  }
});

// ============================================================================
// API CATEGORIES (pour le front)
// ============================================================================

app.get("/api/categories", (req, res) => {
  res.json([
    { key: "all",       label: "Tout" },
    { key: "favorites", label: "Favoris" },
    ...CATEGORY_CONFIGS,
  ]);
});

// ============================================================================
// API FEED (lecture BDD uniquement)
// ============================================================================

app.get("/api/feed", async (req, res) => {
  try {
    const sort = (req.query.sort || "seeders").toLowerCase();
    const limitParam = (req.query.limit || "all").toLowerCase();
    const category = req.query.category || "film";

    if (category === "favorites") {
      let items = selectFavoritesFromDb(sort, limitParam);
      items = await enrichItemsWithLocalPosters(items);
      return res.json({ items });
    }

    if (category === "all") {
      const groupsPromises = CATEGORY_CONFIGS.map(async (cfg) => {
        let items = selectItemsFromDb(cfg.key, sort, limitParam);
        items = await enrichItemsWithLocalPosters(items);
        return {
          key: cfg.key,
          label: cfg.label,
          items,
        };
      });

      const groups = await Promise.all(groupsPromises);
      return res.json({ groups });
    }

    const normCat = normalizeCategoryKey(category);
    let items = selectItemsFromDb(normCat, sort, limitParam);
    items = await enrichItemsWithLocalPosters(items);
    res.json({ items });
  } catch (err) {
    console.error("API /api/feed error:", err);
    res.status(500).json({ error: "Erreur récupération BDD" });
  }
});

// ============================================================================
// API ITEMS : édition du titre
// ============================================================================

app.post("/api/items/:guid/edit", (req, res) => {
  const guid = req.params.guid;
  const { title } = req.body || {};

  if (!guid) {
    return res.status(400).json({
      ok: false,
      error: "GUID manquant",
    });
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({
      ok: false,
      error: "Titre invalide",
    });
  }

  try {
    const now = Date.now();
    const info = updateItemTitleStmt.run(title.trim(), now, guid);

    if (info.changes === 0) {
      return res.status(404).json({
        ok: false,
        error: "Élément introuvable",
      });
    }

    logInfo(
      "ITEM_EDIT",
      `Titre mis à jour pour guid=${guid} → "${title.trim()}"`
    );

    return res.json({ ok: true });
  } catch (err) {
    logError(
      "ITEM_EDIT",
      `Erreur MAJ titre guid=${guid}: ${err.message}`
    );
    return res.status(500).json({
      ok: false,
      error: "Erreur serveur lors de la mise à jour du titre",
    });
  }
});

// ============================================================================
// API DETAILS (fiche détaillée via TMDB en FR)
// ============================================================================

app.get("/api/details", async (req, res) => {
  try {
    const rawTitle = (req.query.title || "").toString().trim();
    const category = (req.query.category || "film").toString();
    const yearHint = req.query.year ? parseInt(req.query.year, 10) : undefined;

    if (!rawTitle) {
      return res.status(400).json({ error: "Missing title" });
    }
    if (!TMDB_API_KEY) {
      logWarn("TMDB_DETAILS", "TMDB_API_KEY non configuré");
      return res
        .status(500)
        .json({ error: "TMDB_API_KEY non configuré côté serveur." });
    }

    const catKey = normalizeCategoryKey(category);
    const tmdbType = catKey === "series" ? "tv" : "movie";
    const guessKind = catKey === "series" ? "series" : "film";

    const { cleanTitle, year } = guessTitleAndYear(rawTitle, guessKind);
    const baseTitle =
      cleanTitle && cleanTitle.length
        ? cleanTitle
        : rawTitle.replace(/[._]/g, " ").trim();

    if (!baseTitle) {
      return res.status(400).json({ error: "Titre non exploitable" });
    }

    const searchUrl = new URL(`${TMDB_BASE_URL}/search/${tmdbType}`);
    searchUrl.searchParams.set("api_key", TMDB_API_KEY);
    searchUrl.searchParams.set("language", "fr-FR");
    searchUrl.searchParams.set("query", baseTitle);
    searchUrl.searchParams.set("include_adult", "false");

    const y = yearHint || year;
    if (y && !Number.isNaN(y)) {
      if (tmdbType === "movie") {
        searchUrl.searchParams.set("year", String(y));
      } else {
        searchUrl.searchParams.set("first_air_date_year", String(y));
      }
    }

    logInfo(
      "TMDB_DETAILS",
      `Search "${baseTitle}" (type=${tmdbType}, year=${y || "?"})`
    );

    const searchResp = await fetch(searchUrl.toString());
    if (!searchResp.ok) {
      logWarn(
        "TMDB_DETAILS_HTTP",
        `HTTP ${searchResp.status} pour ${searchUrl.toString()}`
      );
      return res.status(502).json({ error: "Erreur HTTP TMDB (search)" });
    }

    const searchData = await searchResp.json();
    const results = Array.isArray(searchData.results)
      ? searchData.results
      : [];

    if (!results.length) {
      logWarn("TMDB_DETAILS_NO_RESULT", `Aucun résultat pour "${baseTitle}"`);
      return res.status(404).json({ error: "Aucune fiche trouvée" });
    }

    const best = results[0];
    const tmdbId = best.id;

    const detailsUrl = new URL(`${TMDB_BASE_URL}/${tmdbType}/${tmdbId}`);
    detailsUrl.searchParams.set("api_key", TMDB_API_KEY);
    detailsUrl.searchParams.set("language", "fr-FR");
    detailsUrl.searchParams.set("append_to_response", "credits,external_ids");

    const detailsResp = await fetch(detailsUrl.toString());
    if (!detailsResp.ok) {
      logWarn(
        "TMDB_DETAILS_HTTP",
        `HTTP ${detailsResp.status} pour ${detailsUrl.toString()}`
      );
      return res.status(502).json({ error: "Erreur HTTP TMDB (details)" });
    }

    const d = await detailsResp.json();
    const title = d.title || d.name || baseTitle;
    const released = d.release_date || d.first_air_date || "";
    const yearStr =
      (d.release_date && d.release_date.slice(0, 4)) ||
      (d.first_air_date && d.first_air_date.slice(0, 4)) ||
      "";

    let runtime = null;
    if (typeof d.runtime === "number" && d.runtime > 0) {
      runtime = `${d.runtime} min`;
    } else if (
      Array.isArray(d.episode_run_time) &&
      d.episode_run_time.length &&
      d.episode_run_time[0] > 0
    ) {
      runtime = `${d.episode_run_time[0]} min / épisode`;
    }

    const genre =
      Array.isArray(d.genres) && d.genres.length
        ? d.genres.map((g) => g.name).join(", ")
        : null;

    let director = null;
    if (d.credits && Array.isArray(d.credits.crew)) {
      const directors = d.credits.crew.filter((p) => p.job === "Director");
      if (directors.length) {
        director = directors.map((p) => p.name).join(", ");
      }
    }
    if (!director && Array.isArray(d.created_by) && d.created_by.length) {
      director = d.created_by.map((p) => p.name).join(", ");
    }

    let actors = null;
    if (d.credits && Array.isArray(d.credits.cast) && d.credits.cast.length) {
      actors = d.credits.cast
        .slice(0, 5)
        .map((p) => p.name)
        .join(", ");
    }

    const language =
      Array.isArray(d.spoken_languages) && d.spoken_languages.length
        ? d.spoken_languages.map((l) => l.name || l.english_name).join(", ")
        : null;

    const country =
      Array.isArray(d.production_countries) && d.production_countries.length
        ? d.production_countries.map((c) => c.name).join(", ")
        : null;

    const awards = d.tagline || null;

    const poster = d.poster_path ? `${TMDB_IMG_BASE}${d.poster_path}` : null;

    const imdbRating =
      typeof d.vote_average === "number" && d.vote_average > 0
        ? d.vote_average.toFixed(1)
        : null;
    const imdbVotes =
      typeof d.vote_count === "number" && d.vote_count > 0
        ? d.vote_count.toLocaleString("fr-FR")
        : null;

    const imdbID =
      d.external_ids && d.external_ids.imdb_id
        ? d.external_ids.imdb_id
        : null;

    const payload = {
      title,
      year: yearStr || null,
      released: released || null,
      runtime: runtime || null,
      genre,
      director,
      writer: null,
      actors,
      plot: d.overview || null,
      language,
      country,
      awards,
      poster,
      imdbRating,
      imdbVotes,
      imdbID,
      type: tmdbType,
      totalSeasons: tmdbType === "tv" ? d.number_of_seasons || null : null,
    };

    return res.json(payload);
  } catch (err) {
    logError("TMDB_DETAILS", `Erreur /api/details: ${err.message}`);
    return res.status(500).json({ error: "Erreur serveur sur /api/details" });
  }
});

// ============================================================================
// API ADMIN : NETTOYAGE DES AFFICHES ORPHELINES
// ============================================================================

app.post("/api/admin/posters/cleanup-orphans", (req, res) => {
  try {
    const result = cleanupPosterOrphans();
    return res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    logError("POSTERS_CLEANUP", `Erreur API cleanup-orphans: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: "Erreur pendant le nettoyage des affiches orphelines",
    });
  }
});

// ============================================================================
// API : rafraîchir la pochette d'un item précis
// ============================================================================

app.post("/api/posters/refresh/:guid", async (req, res) => {
  const rawGuid = req.params.guid || "";
  let guid;

  try {
    guid = decodeURIComponent(rawGuid);
  } catch {
    return res.status(400).json({ ok: false, error: "GUID invalide" });
  }

  if (!guid) {
    return res.status(400).json({ ok: false, error: "GUID manquant" });
  }

  try {
    // On récupère l'item complet
    const item = db
      .prepare(
        `
        SELECT guid, category, raw_title, title, poster
        FROM items
        WHERE guid = ?
      `
      )
      .get(guid);

    if (!item) {
      return res
        .status(404)
        .json({ ok: false, error: "Item introuvable pour ce GUID" });
    }

    const normCat = normalizeCategoryKey(item.category || "film");
    const isGame = normCat === "games";

    const searchTitle =
      item.title ||
      item.raw_title ||
      item.rawTitle ||
      "";

    if (!searchTitle) {
      return res.status(400).json({
        ok: false,
        error: "Titre introuvable pour cet item",
      });
    }

    let remotePoster = null;

    if (isGame) {
      const cacheKey = `games::${searchTitle.toLowerCase()}`;
      posterCache.delete(cacheKey);
      remotePoster = await fetchIgdbCoverForTitle(searchTitle);
    } else if (TMDB_API_KEY) {
      const cacheKey = `${normCat || "any"}::${searchTitle.toLowerCase()}`;
      posterCache.delete(cacheKey);
      remotePoster = await fetchPosterForTitle(searchTitle, normCat);
    }

    const provider = isGame ? "igdb" : "tmdb";
    const mediaType =
      normCat === "series" || normCat === "emissions"
        ? "series"
        : isGame
        ? "games"
        : "film";

    const externalId =
      extractImageKeyFromUrl(remotePoster) ||
      `${provider}_${mediaType}_${Date.now()}`;

    const localUrl = await ensureLocalPoster({
      provider,
      mediaType,
      externalId,
      remoteUrl: remotePoster,
    });

    const finalPoster = localUrl || remotePoster;
    const now = Date.now();

    // 3) On met à jour la BDD pour CE seul item
    db.prepare(
      `
      UPDATE items
      SET poster = ?, updated_at = ?
      WHERE guid = ?
    `
    ).run(finalPoster, now, guid);

    logInfo(
      "POSTERS_REFRESH",
      `Pochette mise à jour pour guid=${guid}, cat=${normCat}, titre="${searchTitle}"`
    );

    return res.json({
      ok: true,
      poster: finalPoster,
    });
  } catch (err) {
    logError(
      "POSTERS_REFRESH",
      `Erreur rafraîchissement pochette (guid=${rawGuid}): ${err.message}`
    );
    return res.status(500).json({
      ok: false,
      error: "Erreur serveur pendant le rafraîchissement de la pochette",
    });
  }
});

// ============================================================================
// API STATS AFFICHES (compteur pour les settings)
// ============================================================================

app.get("/api/posters/stats", async (req, res) => {
  try {
    const total = await countPosterFiles();

    return res.json({
      ok: true,
      total,
    });
  } catch (err) {
    logError("POSTERS_STATS", `Erreur API /api/posters/stats: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: "Erreur pendant le comptage des affiches",
    });
  }
});

// ============================================================================
// LANCEMENT SERVEUR + SYNC PÉRIODIQUE
// ============================================================================

app.listen(PORT, () => {
  logInfo("SERVER", `YGGFeed DB server running on http://localhost:${PORT}`);
  logInfo("SERVER", `Base SQLite : ${DB_PATH}`);
  logInfo("SERVER", `Fichier de logs : ${LOG_FILE}`);

  const initialInterval = loadSyncIntervalFromDb();
  schedulePeriodicSync(initialInterval);

  retentionDays = loadRetentionDaysFromDb();
  logInfo("PURGE_CFG", `Durée de rétention active: ${retentionDays} jours`);

  syncAllCategories().catch((e) =>
    logError("SYNC_INIT", `Erreur: ${e.message}`)
  );
});

