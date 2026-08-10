/**
 * Persistance de la bibliothèque dans IndexedDB.
 *
 * Les playlists étaient stockées en JSON dans localStorage, dont le quota tourne
 * autour de 5 Mo : quelques playlists complètes suffisent à le saturer, et
 * `setItem` lève alors un QuotaExceededError non capturé qui interrompt l'import.
 * IndexedDB n'a pas cette limite et `idb` est déjà une dépendance du projet
 * (même motif que services/audioCache.ts).
 */

import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import type { Playlist, ImportedPlaylist } from '../types'

const DB_NAME = 'yt-music-library'
const PLAYLIST_STORE = 'playlists'
const META_STORE = 'meta'
const VERSION = 1

const IMPORTED_KEY = 'imported'

// Anciennes clés localStorage, lues une seule fois pour la migration.
const LEGACY_PLAYLISTS_KEY = 'yt-playlists'
const LEGACY_IMPORTED_KEY = 'yt-imported-playlists'
const MIGRATION_FLAG = 'yt-library-migrated'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(PLAYLIST_STORE)) {
          db.createObjectStore(PLAYLIST_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE)
        }
      },
    })
  }
  return dbPromise
}

export async function loadPlaylists(): Promise<Playlist[]> {
  const db = await getDb()
  return db.getAll(PLAYLIST_STORE)
}

export async function savePlaylist(playlist: Playlist): Promise<void> {
  const db = await getDb()
  await db.put(PLAYLIST_STORE, playlist)
}

export async function savePlaylists(playlists: Playlist[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(PLAYLIST_STORE, 'readwrite')
  await Promise.all(playlists.map((p) => tx.store.put(p)))
  await tx.done
}

export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(PLAYLIST_STORE, id)
}

export async function loadImported(): Promise<ImportedPlaylist[]> {
  const db = await getDb()
  return (await db.get(META_STORE, IMPORTED_KEY)) ?? []
}

export async function saveImported(imported: ImportedPlaylist[]): Promise<void> {
  const db = await getDb()
  await db.put(META_STORE, imported, IMPORTED_KEY)
}

/**
 * Reprend une bibliothèque enregistrée par une version antérieure.
 * Exécutée une seule fois, puis les clés localStorage sont libérées.
 */
async function migrateFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return

  try {
    const legacyPlaylists: Playlist[] = JSON.parse(localStorage.getItem(LEGACY_PLAYLISTS_KEY) || '[]')
    const legacyImported: ImportedPlaylist[] = JSON.parse(localStorage.getItem(LEGACY_IMPORTED_KEY) || '[]')

    if (Array.isArray(legacyPlaylists) && legacyPlaylists.length > 0) {
      await savePlaylists(legacyPlaylists.filter((p) => p?.id))
    }
    if (Array.isArray(legacyImported) && legacyImported.length > 0) {
      await saveImported(legacyImported.filter((p) => p?.id))
    }

    localStorage.removeItem(LEGACY_PLAYLISTS_KEY)
    localStorage.removeItem(LEGACY_IMPORTED_KEY)
  } catch {
    // Données héritées illisibles : on repart d'une bibliothèque vide.
  } finally {
    localStorage.setItem(MIGRATION_FLAG, '1')
  }
}

export interface LibrarySnapshot {
  playlists: Playlist[]
  imported: ImportedPlaylist[]
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  await migrateFromLocalStorage()
  const [playlists, imported] = await Promise.all([loadPlaylists(), loadImported()])
  return { playlists, imported }
}
