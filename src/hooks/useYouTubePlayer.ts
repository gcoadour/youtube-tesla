import { useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { getSponsorSegments, getCurrentSegment } from '../services/sponsorblock'
import { getAudioBlob } from '../services/invidiousPlayer'
import { getCachedAudio, cacheAudio } from '../services/audioCache'

export function useYouTubePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    sponsorBlockSegments,
    setProgress,
    setDuration,
    setSponsorBlockSegments,
    next,
  } = usePlayerStore()

  useEffect(() => {
    delete (window as any).YT
    delete (window as any).onYouTubeIframeAPIReady

    const audio = new Audio()
    audio.preload = 'auto'
    document.body.appendChild(audio)
    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
      audio.load()
      audio.remove()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    usePlayerStore.getState().registerPlayerSeeker((time: number) => {
      audio.currentTime = time
    })
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    let active = true
    let objectUrl: string | null = null

    const load = async () => {
      try {
        const cached = await getCachedAudio(currentTrack.videoId)
        if (!active) return

        if (cached) {
          objectUrl = URL.createObjectURL(cached)
          audio.src = objectUrl
        } else {
          const blob = await getAudioBlob(currentTrack.videoId)
          if (!active) return

          cacheAudio(currentTrack.videoId, blob).catch(() => {})

          objectUrl = URL.createObjectURL(blob)
          audio.src = objectUrl
        }

        await new Promise<void>((resolve, reject) => {
          const onMeta = () => {
            cleanup()
            resolve()
          }
          const onErr = () => {
            cleanup()
            reject(new Error('audio load error'))
          }
          const cleanup = () => {
            audio.removeEventListener('loadedmetadata', onMeta)
            audio.removeEventListener('error', onErr)
          }
          audio.addEventListener('loadedmetadata', onMeta)
          audio.addEventListener('error', onErr, { once: true })
        })

        if (!active) return

        setDuration(audio.duration || 0)
        setProgress(0)
        setSponsorBlockSegments([])

        getSponsorSegments(currentTrack.videoId).then(segments => {
          if (active) setSponsorBlockSegments(segments)
        })

        if (usePlayerStore.getState().isPlaying) {
          audio.play().catch(() => usePlayerStore.getState().pause())
        }
      } catch (err) {
        if (active) {
          console.error('Failed to load audio stream:', err)
        }
      }
    }

    load()

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [currentTrack, setDuration, setProgress, setSponsorBlockSegments])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audio.src) return

    if (isPlaying) {
      if (audio.paused) {
        audio.play().catch(() => usePlayerStore.getState().pause())
      }
    } else {
      if (!audio.paused) {
        audio.pause()
      }
    }
  }, [isPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = isMuted ? 0 : volume
  }, [volume, isMuted])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const interval = setInterval(() => {
      if (audio.paused || audio.seeking) return
      setProgress(audio.currentTime)

      const seg = getCurrentSegment(sponsorBlockSegments, audio.currentTime)
      if (seg) {
        audio.currentTime = seg.segment[1]
      }
    }, 500)

    return () => clearInterval(interval)
  }, [sponsorBlockSegments, setProgress])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      setProgress(audio.duration)
      next()
    }

    audio.addEventListener('ended', handleEnded)
    return () => audio.removeEventListener('ended', handleEnded)
  }, [next, setProgress])
}
