import { useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { getSponsorSegments, getCurrentSegment } from '../services/sponsorblock'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: (() => void) | undefined
  }
}

let apiLoaded = false

function loadYouTubeAPI() {
  if (apiLoaded) return
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  const firstScript = document.getElementsByTagName('script')[0]
  firstScript.parentNode?.insertBefore(tag, firstScript)
  apiLoaded = true
}

export function useYouTubePlayer() {
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)

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
    loadYouTubeAPI()
  }, [])

  const initPlayer = useCallback(() => {
    if (playerReadyRef.current || !window.YT?.Player) return
    playerRef.current = new window.YT.Player('youtube-player', {
      height: '0',
      width: '0',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true
          playerRef.current.setVolume(volume * 100)
          usePlayerStore.getState().registerPlayerSeeker((time: number) => {
            if (playerRef.current) {
              playerRef.current.seekTo(time, true)
            }
          })
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            usePlayerStore.getState().play()
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            next()
          }
        },
      },
    })
  }, [volume, next])

  useEffect(() => {
    window.onYouTubeIframeAPIReady = () => {
      initPlayer()
    }
    if (window.YT?.Player) {
      initPlayer()
    }
  }, [initPlayer])

  useEffect(() => {
    if (!currentTrack) return

    const loadVideo = () => {
      if (!playerRef.current || !playerReadyRef.current) return
      playerRef.current.loadVideoById(currentTrack.videoId, 0)
      getSponsorSegments(currentTrack.videoId).then(setSponsorBlockSegments)
    }

    if (playerReadyRef.current) {
      loadVideo()
    } else {
      const check = setInterval(() => {
        if (playerReadyRef.current) {
          loadVideo()
          clearInterval(check)
        }
      }, 100)
      return () => clearInterval(check)
    }
  }, [currentTrack, setSponsorBlockSegments])

  useEffect(() => {
    if (!playerRef.current || !playerReadyRef.current) return
    if (isPlaying) {
      playerRef.current.playVideo()
    } else {
      playerRef.current.pauseVideo()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!playerRef.current || !playerReadyRef.current) return
    playerRef.current.setVolume(isMuted ? 0 : volume * 100)
  }, [volume, isMuted])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!playerRef.current || !playerReadyRef.current) return
      const currentTime = playerRef.current.getCurrentTime()
      const duration = playerRef.current.getDuration()
      setProgress(currentTime)
      setDuration(duration)

      const seg = getCurrentSegment(sponsorBlockSegments, currentTime)
      if (seg) {
        playerRef.current.seekTo(seg.segment[1], true)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [sponsorBlockSegments, setProgress, setDuration])

}
