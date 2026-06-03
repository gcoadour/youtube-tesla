# Spotify Tesla Clone — Design Document

## Overview

Clone de l'application Spotify Tesla, fonctionnant comme une SPA web statique (zéro backend), utilisant YouTube comme source musicale et SponsorBlock pour skipper les segments sponsorisés.

## Stack

- **Vite + React + TypeScript** — build et dev
- **Zustand** — state management
- **react-router-dom** — routing SPA
- **YouTube IFrame Player API** — lecture audio (video cachée)
- **YouTube Data API v3** — recherche, import playlists YouTube Music
- **SponsorBlock API** — skip automatique des segments sponsor
- **localStorage** — cache playlists, préférences, tokens
- **Déploiement** — Vercel / Netlify (site statique)

## Architecture

0 backend. Tout est appelé côté client :

```
┌──────────────────────────────────────────────┐
│  React App (SPA)                              │
│                                               │
│  ┌─────────────┐  ┌──────────────────────┐   │
│  │ react-router │  │ Zustand store        │   │
│  │ /            │  │  - tracks, queue     │   │
│  │ /playlist/:id│  │  - player state      │   │
│  │ /search      │  │  - playlists         │   │
│  └─────────────┘  └──────────────────────┘   │
│                                               │
│  Services (appels HTTP directs) :             │
│  - YouTube Data API v3 (REST)                │
│  - YouTube IFrame Player (JS)                │
│  - SponsorBlock (REST)                       │
│  - Google OAuth 2.0 (implicit)               │
└──────────────────────────────────────────────┘
```

## UI / Layout

Reproduction exacte de l'interface Spotify Tesla :

- **Fond** : sidebar noire (#000), contenu gris foncé (#121212)
- **Sidebar** (200px, persistante) : logo, Search, Your Library, playlists
- **Contenu principal** : grille en 2x2 (playlists récentes), 4 colonnes (recommandations)
- **Now Playing Bar** (fixe en bas) : cover art + titre + artiste à gauche, contrôles (prev/play/next + barre progression) au centre, volume à droite
- **Accent** : vert Spotify (#1ed760) pour like et highlight

## Pages

- `/` — Accueil avec grille "Recently played" + boutons rapides
- `/search` — Barre de recherche YouTube + résultats (titres, artistes, durée)
- `/playlist/:id` — Liste des morceaux d'une playlist (importée ou locale)
- `/library` — Toutes les playlists importées + favoris

## Composants

```
src/
├── App.tsx
├── main.tsx
├── components/
│   ├── Layout/
│   │   ├── Sidebar.tsx
│   │   └── NowPlayingBar.tsx
│   ├── Player/
│   │   ├── PlayerControls.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── VolumeControl.tsx
│   │   └── YouTubePlayer.tsx
│   ├── Playlist/
│   │   ├── PlaylistGrid.tsx
│   │   ├── PlaylistCard.tsx
│   │   └── PlaylistView.tsx
│   ├── Search/
│   │   ├── SearchBar.tsx
│   │   └── SearchResults.tsx
│   └── common/
│       ├── TrackItem.tsx
│       ├── AlbumArt.tsx
│       └── Spinner.tsx
├── hooks/
│   ├── useYouTubePlayer.ts
│   ├── useYouTubeAPI.ts
│   ├── useSponsorBlock.ts
│   ├── usePlaylists.ts
│   └── useAuth.ts
├── services/
│   ├── youtube.ts
│   ├── sponsorblock.ts
│   └── auth.ts
├── store/
│   └── playerStore.ts
├── types/
│   └── index.ts
└── utils/
    └── helpers.ts
```

## Data Flow

### Lecture d'un morceau
1. User clique sur un morceau dans une playlist
2. Store : `play(track)` → met à jour `currentTrack`, `isPlaying`
3. `YouTubePlayer` : `loadVideoById(videoId)` (lecture audio, video cachée)
4. `useSponsorBlock` : `GET https://sponsor.ajay.app/api/skipSegments?videoID=xxx`
5. Store stocke les segments → intervalle vérifie et skip si nécessaire
6. `NowPlayingBar` écoute le store et affiche les infos

### Import playlists YouTube Music
1. User clique "Se connecter" → OAuth Google (scope youtube.readonly)
2. `GET /youtube/v3/playlists?mine=true&part=snippet`
3. Pour chaque playlist : `GET /youtube/v3/playlistItems?playlistId=xxx&part=snippet`
4. Transformation en `Playlist[]` local (titre, tracks)
5. Stockage dans localStorage

### Recherche YouTube
1. User tape dans SearchBar
2. Debounce 300ms → `GET /youtube/v3/search?q=xxx&type=video&part=snippet`
3. Résultats affichés dans SearchResults
4. User peut ajouter un résultat à une playlist ou le lire immédiatement

## Gestion d'erreurs

- **Quota YouTube atteint** : message explicite "API limit reached, try later"
- **OAuth expiré** : redirection login + message
- **Vidéo indisponible** : skip automatique au track suivant
- **SponsorBlock down** : lecture normale sans skip
- **Hors ligne** : lecture depuis les tracks en cache localStorage

## Stockage local (localStorage)

- `yt-playlists` : Playlist[] — playlists importées + créées localement
- `yt-liked-tracks` : string[] — IDs des tracks likés
- `yt-auth` : token OAuth + expiration
- `yt-cache` : Map<videoId, TrackInfo> — cache des recherches

## Contraintes

- Zéro backend — pas de proxy, pas de serveur
- Background playback limité au desktop (pas de PWA background audio mobile)
- Déploiement static (Vercel / Netlify)
- Consultation du code depuis un navigateur standard (pas Tesla)

## Non-functional

- Performance : bundle < 200kB, lazy loading sur pages
- Accessibilité : navigation clavier, aria-labels
- Thème : dark only (comme Tesla)
- Responsive : adapté desktop + tablette (pas mobile-first, comme Tesla)
