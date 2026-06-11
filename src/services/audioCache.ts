import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'

const DB_NAME = 'yt-music-cache'
const STORE_NAME = 'audio'
const VERSION = 1

interface CachedAudio {
  videoId: string
  blob: Blob
  size: number
  cachedAt: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'videoId' })
        }
      },
    })
  }
  return dbPromise
}

export async function cacheAudio(videoId: string, blob: Blob): Promise<void> {
  const db = await getDb()
  const entry: CachedAudio = {
    videoId,
    blob,
    size: blob.size,
    cachedAt: Date.now(),
  }
  await db.put(STORE_NAME, entry)
}

export async function getCachedAudio(videoId: string): Promise<Blob | null> {
  const db = await getDb()
  const entry = await db.get(STORE_NAME, videoId)
  return entry?.blob ?? null
}

export async function isCached(videoId: string): Promise<boolean> {
  const db = await getDb()
  const count = await db.count(STORE_NAME, videoId)
  return count > 0
}

export async function deleteAudio(videoId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, videoId)
}

export async function getAllCachedTracks(): Promise<CachedAudio[]> {
  const db = await getDb()
  return db.getAll(STORE_NAME)
}

export async function getCacheInfo(): Promise<{ count: number; totalSize: number }> {
  const db = await getDb()
  const all = await db.getAll(STORE_NAME)
  const totalSize = all.reduce((sum, entry) => sum + entry.size, 0)
  return { count: all.length, totalSize }
}

export async function clearCache(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_NAME)
}
