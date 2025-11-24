# FeedYGG
<img width="167" height="68" alt="image" src="https://github.com/user-attachments/assets/e15891a1-e6e6-4611-9956-34888aa6286c" />

FeedYGG est une application **self-hosted** qui agrège et enrichit les flux RSS de YggAPI pour les rendre enfin **lisibles, filtrables et sexy**.  
L’app récupère les flux (films, séries, émissions TV, animation, spectacles, jeux vidéo), les stocke dans une base SQLite et les affiche dans une interface moderne et responsive.

👉 Objectif : avoir **un tableau de bord propre** pour surveiller les derniers ajouts YGG, avec tri, filtres, infos enrichies (TMDB / IGDB) et historique persistant.

<img width="1847" height="868" alt="image" src="https://github.com/user-attachments/assets/f69a0f07-fa5c-4ba8-9598-f22ac13cf3b6" />
<img width="1597" height="860" alt="image" src="https://github.com/user-attachments/assets/f525deb7-1237-41b6-b9ca-9bc445cba6e5" />
<img width="1835" height="862" alt="image" src="https://github.com/user-attachments/assets/dd283b59-7f52-4c51-80d3-f68fea17677c" />

---

## ✨ Fonctionnalités principales

- 🧲 **Agrégation multi-flux YGG**
  - Films
  - Séries TV
  - Émissions / TV
  - Animation
  - Spectacles
  - Jeux vidéo
  - Chaque catégorie peut être activée/désactivée via les variables d’environnement.

- 🗃 **Base SQLite intégrée**
  - Persistance des flux (pas juste en mémoire)
  - Pas besoin de serveur de base externe
  - Chemin de la DB configurable (`DB_PATH`)

- 🎬 **Enrichissement TMDB**
  - Récupération d’infos films / séries (titre propre, année, poster, etc.)
  - Affichage plus propre que le simple titre RSS YGG

- 🎮 **Enrichissement IGDB (jeux vidéo)**
  - Infos supplémentaires pour les jeux (nom, visuel, etc.)
  - Utilisation de `IGDB_CLIENT_ID` et `IGDB_CLIENT_SECRET`

- 🔍 **UI moderne & filtrable**
  - Interface responsive (desktop / mobile)
  - Filtres par catégorie
  - Tri / recherche (titre, type, etc. selon ton front)
  - Thème sombre / clair (suivant ton implémentation front)

- 🔁 **Sync automatique**
  - Scan périodique des flux (configurable via `SYNC_INTERVAL_MINUTES`)
  - Logs détaillés (purge, synchro, appels TMDB/IGDB)

- 🐳 **100% Docker-friendly**
  - Image Docker dispo sur Docker Hub : `guizmos/feedygg`
  - Déploiement ultra simple avec `docker-compose`

---

## 🏗 Architecture

- **Backend**
  - Node.js / Express
  - Parsing RSS
  - Intégration TMDB + IGDB
  - Stockage SQLite
  - API JSON + servie du front statique

- **Base de données**
  - SQLite (`yggfeed.db`)
  - Stockée dans un volume Docker (`/data` dans le container)

- **Frontend**
  - HTML / CSS / JS statique
  - Affichage des cartes par catégorie
  - Intégration avec l’API backend

- **Déploiement**
  - Docker image : `guizmos/feedygg:latest`
  - Docker Compose / Portainer stack friendly

---
## 🔑 Récupérer les clés TMDB & IGDB

Certaines fonctionnalités avancées de FeedYGG (posters, métadonnées, infos jeux vidéo, etc.)
nécessitent des clés API externes. Voici comment les obtenir.

---

### 🎬 Obtenir une clé TMDB (The Movie Database)

TMDB est utilisé pour enrichir les fiches Films & Séries (titre propre, année, posters, etc.).

### Étapes :

1. Rendez-vous sur le site de TMDB :  
   👉 https://www.themoviedb.org

2. Créez un compte ou connectez-vous.

3. Allez dans **Settings** → **API**  
   👉 https://www.themoviedb.org/settings/api

4. Cliquez sur **"Create API Key"**  
   - Choisissez **Developer API**
   - Remplissez le formulaire (simple)

5. Votre clé API apparaîtra dans la section **API Key (v3 auth)**.  
   👉 C’est cette clé qu'il faut utiliser comme `TMDB_API_KEY`.

**Exemple dans docker-compose :**
```yaml
- TMDB_API_KEY=VOTRE_CLE_ICI
```
### 🎮 Obtenir vos clés IGDB (Client ID + Client Secret)

IGDB (propriété de Twitch/Amazon) est utilisé pour enrichir les infos Jeux Vidéo.

IGDB passe par Twitch Developer Console, ce qui peut surprendre – c’est normal.

Étapes :

Allez sur le portail développeur Twitch :
👉 https://dev.twitch.tv/

Connectez-vous avec votre compte Twitch.

Cliquez sur Console → Applications
👉 https://dev.twitch.tv/console/apps

Cliquez sur “Register Your Application”

Donnez un nom (ex : FeedYGG)

Category : Application Integration

OAuth Redirect URL : mettez n'importe quoi (ex : https://localhost)

Une fois l'application créée :

Vous verrez votre Client ID

Cliquez sur “New Secret” pour générer un Client Secret

Ensuite, allez sur la documentation IGDB pour valider que tout fonctionne :
👉 https://api-docs.igdb.com/#about

Exemple dans docker-compose :
```yaml
- IGDB_CLIENT_ID=votre_client_id
- IGDB_CLIENT_SECRET=votre_client_secret
```

📌 Important

Vous pouvez utiliser FeedYGG sans TMDB/IGDB, mais l’interface sera moins enrichie.

Les clés TMDB et IGDB sont gratuites tant que vous restez dans une utilisation simple.

Ne partagez jamais vos clés API publiquement (évitez de les mettre en dur dans des screenshots).


## 🚀 Déploiement rapide avec Docker Compose

### 1. Exemple de `docker-compose.yml`

```yaml
version: "3.9"

services:
  feedygg:
    image: guizmos/feedygg:latest
    container_name: FEEDYGG
    restart: unless-stopped

    environment:
      - TZ=Europe/Paris

      # =======================
      #  YGG / Flux RSS
      # =======================
      - RSS_PASSKEY=CHANGER_CECI

      # Pour désactiver une catégorie, commente simplement la ligne
      - RSS_MOVIES_ID=2183        # Films
      - RSS_SERIES_ID=2184        # Séries TV
      - RSS_SHOWS_ID=2182         # Émissions / TV
      - RSS_ANIMATION_ID=2178     # Animation
      - RSS_SPECTACLE_ID=2185     # Spectacles
      - RSS_GAMES_ID=2161         # Jeux vidéo

      # =======================
      #  API externes
      # =======================
      - TMDB_API_KEY=CHANGER_CECI
      - IGDB_CLIENT_ID=CHANGER_CECI
      - IGDB_CLIENT_SECRET=CHANGER_CECI

      # =======================
      #  Backend
      # =======================
      - DB_PATH=/data/yggfeed.db
      - SYNC_INTERVAL_MINUTES=30
      - LOG_FILE=/data/yggfeed.log
      - LOG_MAX_BYTES=5242880
      - PORT=8080

    volumes:
      - /volume1/Docker/FeedyGG/data:/data

    ports:
      - "7070:8080"
```

2. Lancement
docker compose pull
docker compose up -d


Ensuite, l’app sera accessible sur :
👉 http://<ip_du_serveur>:7070

## ⚙️ Variables d’environnement

| Variable               | Obligatoire | Description                                                   |
|------------------------|:----------:|---------------------------------------------------------------|
| `RSS_PASSKEY`          | ✅         | Passkey YGG utilisé pour générer les flux RSS                 |
| `RSS_MOVIES_ID`        | ❌         | ID du flux Films (ex : `2183`)                                |
| `RSS_SERIES_ID`        | ❌         | ID du flux Séries TV                                          |
| `RSS_SHOWS_ID`         | ❌         | ID du flux Émissions TV                                       |
| `RSS_ANIMATION_ID`     | ❌         | ID du flux Animation                                          |
| `RSS_SPECTACLE_ID`     | ❌         | ID du flux Spectacles                                         |
| `RSS_GAMES_ID`         | ❌         | ID du flux Jeux vidéo                                         |
| `TMDB_API_KEY`         | ❌         | Clé API TMDB pour enrichir films / séries                     |
| `IGDB_CLIENT_ID`       | ❌         | Client ID IGDB pour les jeux vidéo                            |
| `IGDB_CLIENT_SECRET`   | ❌         | Client Secret IGDB                                            |
| `DB_PATH`              | ❌         | Chemin du fichier SQLite (défaut : `/data/yggfeed.db`)        |
| `SYNC_INTERVAL_MINUTES`| ❌         | Intervalle entre deux synchronisations RSS (minutes)          |
| `LOG_FILE`             | ❌         | Chemin du fichier de logs                                     |
| `LOG_MAX_BYTES`        | ❌         | Taille max du fichier de log (rotation simple)                |
| `PORT`                 | ❌         | Port d’écoute interne de l’API backend (défaut : `8080`)      |


📝 Tip : si tu commentes, par exemple, RSS_MOVIES_ID, la catégorie Films sera tout simplement ignorée (aucun flux fetché, aucune carte liée).


✅ Avantages

Self-hosted : tu contrôles tout, aucune dépendance SaaS.

Pensé pour tourner sur un NAS / petit serveur (Synology, etc.) via Docker.

Modulaire : tu actives uniquement les catégories dont tu as besoin.

Enrichi : meilleurs titres, visuels, infos grâce à TMDB / IGDB.

Simple à déployer : une image Docker, un docker-compose.yml et c’est parti.

Idéal comme “backend” pour des dashboards plus complexes (Home Assistant, front custom, etc.).

🗺 Roadmap / Idées

✅ Intégration TMDB / IGDB

✅ Multi-catégories (films, séries, jeux, etc.)

⏳ Filtres avancés (qualité, langue, seeders…)

⏳ Intégration directe avec des indexers type *arr (Prowlarr, etc.)

⏳ Mode “API only” sans front

⚠️ Disclaimer

FeedYGG est un projet à usage personnel / éducatif.
Tu es entièrement responsable de l’utilisation que tu en fais et du respect des lois en vigueur dans ton pays.
