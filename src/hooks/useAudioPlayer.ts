import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { getSponsorSegments, getCurrentSegment } from '../services/sponsorblock'
import { resolveStream } from '../services/player'
import { getCachedAudio } from '../services/audioCache'
import { primeOnFirstGesture } from '../services/audioUnlock'

/**
 * Pilote un unique élément <audio> à partir du store.
 *
 * Changement majeur par rapport à la version précédente : la piste est **streamée**
 * (`audio.src = url`) au lieu d'être téléchargée intégralement en Blob avant de
 * démarrer. L'ancien `fetch()` vers une URL googlevideo brute était bloqué par CORS
 * en production, et son échec était avalé — d'où l'absence totale de son sur
 * GitHub Pages. Le streaming démarre immédiatement et le seek passe par des
 * requêtes Range.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  /** Incrémenté à chaque changement de piste : invalide les chargements en vol. */
  const loadIdRef = useRef(0)
  const objectUrlRef = useRef<string | null>(null)
  /** Origines d'instances déjà tentées sans succès pour la piste courante. */
  const triedOriginsRef = useRef<Set<string>>(new Set())

  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const sponsorBlockSegments = usePlayerStore((s) => s.sponsorBlockSegments)

  // --- création de l'élément audio -----------------------------------------
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute('playsinline', '')
    document.body.appendChild(audio)
    audioRef.current = audio

    // iOS n'autorise un élément média qu'après un geste utilisateur, et cette
    // autorisation ne survit pas à l'await de résolution d'URL. On la prend donc
    // au tout premier geste, avant même qu'une piste soit choisie.
    const stopPriming = primeOnFirstGesture(audio)

    const store = usePlayerStore.getState()
    store.registerPlayerSeeker((time: number) => {
      if (Number.isFinite(time)) audio.currentTime = time
    })
    store.registerPlayerReplay(() => {
      audio.play().catch((err) => {
        if ((err as { name?: string })?.name === 'NotAllowedError') {
          usePlayerStore.getState().pause()
        }
      })
    })

    return () => {
      stopPriming()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.remove()
      audioRef.current = null
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  // --- chargement de la piste courante -------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    const loadId = ++loadIdRef.current
    triedOriginsRef.current = new Set()
    const isStale = () => loadId !== loadIdRef.current

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }

    const store = usePlayerStore.getState()
    store.setLoading(true)
    store.setPlaybackError(null)
    store.setSponsorBlockSegments([])

    /**
     * Un `play()` rejeté n'a pas toujours le même sens.
     *
     * NotAllowedError = le navigateur exige un geste utilisateur : l'intention
     * de lecture doit alors être annulée, sans quoi l'interface afficherait
     * « en lecture » sans qu'aucun son ne sorte.
     *
     * Toute autre erreur vient du flux lui-même. Elle est déjà traitée par
     * `handleError`, qui bascule sur l'instance suivante — mettre le store en
     * pause ici laisserait le lecteur muet après un repli pourtant réussi.
     */
    const handlePlayRejection = (err: unknown) => {
      if (isStale()) return
      if ((err as { name?: string })?.name === 'NotAllowedError') {
        const state = usePlayerStore.getState()
        state.pause()
        // Sans message, l'utilisateur voit juste le bouton repasser en
        // « lecture » sans explication — le cas typique sur iOS.
        state.setPlaybackError('Le navigateur a bloqué la lecture automatique. Touchez à nouveau « lecture ».')
      }
    }

    const applySource = async () => {
      // Une piste téléchargée pour l'écoute hors ligne court-circuite le réseau.
      const cached = await getCachedAudio(currentTrack.videoId)
      if (isStale()) return

      revokeObjectUrl()

      if (cached) {
        objectUrlRef.current = URL.createObjectURL(cached)
        audio.src = objectUrlRef.current
      } else {
        // L'origine retenue est marquée avant lecture : si le flux échoue,
        // la tentative suivante repartira sur l'instance d'après.
        const stream = await resolveStream(currentTrack.videoId, triedOriginsRef.current)
        if (isStale()) return
        triedOriginsRef.current.add(stream.origin)
        audio.src = stream.url
      }

      audio.load()
      if (usePlayerStore.getState().isPlaying) {
        audio.play().catch(handlePlayRejection)
      }
    }

    const load = async () => {
      try {
        await applySource()
        if (isStale()) return
        usePlayerStore.getState().setLoading(false)

        getSponsorSegments(currentTrack.videoId).then((segments) => {
          if (!isStale()) usePlayerStore.getState().setSponsorBlockSegments(segments)
        })
      } catch (err) {
        if (isStale()) return
        const message = err instanceof Error ? err.message : String(err)
        usePlayerStore.getState().setLoading(false)
        usePlayerStore.getState().setPlaybackError(
          `Lecture impossible pour « ${currentTrack.title} ». ${message}`,
        )
      }
    }

    /**
     * L'élément audio rejette le flux : URL expirée, instance qui renvoie 403,
     * format refusé. On repart sur l'instance suivante — toutes les instances
     * Invidious, puis toutes les instances Piped. Quand il n'en reste plus,
     * `resolveStream` lève, on signale et on passe à la piste suivante.
     */
    const handleError = () => {
      if (isStale()) return
      void (async () => {
        try {
          await applySource()
          if (!isStale()) usePlayerStore.getState().setLoading(false)
        } catch {
          if (isStale()) return
          const state = usePlayerStore.getState()
          state.setLoading(false)
          state.setPlaybackError(
            `Aucune source n'a pu lire « ${currentTrack.title} ». Passage à la piste suivante.`,
          )
          if (state.queueIndex < state.queue.length - 1) state.next(true)
        }
      })()
    }

    const handleLoadedMetadata = () => {
      if (isStale()) return
      usePlayerStore.getState().setDuration(
        Number.isFinite(audio.duration) ? audio.duration : currentTrack.duration || 0,
      )
    }

    audio.addEventListener('error', handleError)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    load()

    return () => {
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [currentTrack])

  // --- lecture / pause ------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return

    if (isPlaying && audio.paused) {
      audio.play().catch((err) => {
        if ((err as { name?: string })?.name === 'NotAllowedError') {
          usePlayerStore.getState().pause()
        }
      })
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }, [isPlaying])

  // --- volume ---------------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  // --- progression et SponsorBlock -----------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // `timeupdate` remplace l'ancien setInterval(500 ms) : moins de réveils,
    // et la progression suit réellement l'élément audio.
    const handleTimeUpdate = () => {
      if (usePlayerStore.getState().scrubbing || audio.seeking) return
      usePlayerStore.getState().setProgress(audio.currentTime)

      const seg = getCurrentSegment(sponsorBlockSegments, audio.currentTime)
      if (seg) audio.currentTime = seg.segment[1]
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [sponsorBlockSegments])

  // --- fin de piste ---------------------------------------------------------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => usePlayerStore.getState().next(true)
    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [])

  // --- Media Session --------------------------------------------------------
  // Donne à la voiture (commandes au volant, Bluetooth) le contrôle du lecteur
  // et l'affichage des métadonnées.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album || '',
      artwork: [
        { src: currentTrack.thumbnail, sizes: '480x360', type: 'image/jpeg' },
      ],
    })

    const store = usePlayerStore.getState()
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => store.play()],
      ['pause', () => store.pause()],
      ['nexttrack', () => usePlayerStore.getState().next()],
      ['previoustrack', () => usePlayerStore.getState().previous()],
      ['seekto', (details) => {
        if (typeof details.seekTime === 'number') usePlayerStore.getState().seekTo(details.seekTime)
      }],
    ]

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // action non supportée par ce navigateur
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // ignore
        }
      }
    }
  }, [currentTrack])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // --- préchargement de la piste suivante ----------------------------------
  // Résout l'URL à l'avance pour que l'enchaînement ne reparte pas de zéro.
  useEffect(() => {
    if (!currentTrack) return
    const { queue, queueIndex } = usePlayerStore.getState()
    const nextTrack = queue[queueIndex + 1]
    if (!nextTrack) return

    const timer = setTimeout(() => {
      resolveStream(nextTrack.videoId).catch(() => {})
    }, 5000)
    return () => clearTimeout(timer)
  }, [currentTrack])
}
