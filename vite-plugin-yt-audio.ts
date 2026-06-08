import { spawn } from 'child_process'
import type { Plugin, ViteDevServer } from 'vite'

const YT_DLP = 'yt-dlp'
const URL_CACHE = new Map<string, { url: string; expiry: number }>()

async function getYtAudioUrl(videoId: string): Promise<string> {
  const cached = URL_CACHE.get(videoId)
  if (cached && Date.now() < cached.expiry) return cached.url

  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP, [
      '-f', 'bestaudio',
      '--get-url',
      `https://www.youtube.com/watch?v=${videoId}`
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })
    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        reject(new Error(`yt-dlp failed: ${stderr.trim() || 'no URL'}`))
        return
      }

      const url = stdout.trim()
      const expiryMatch = url.match(/[?&]expire=(\d+)/)
      const expiry = expiryMatch
        ? parseInt(expiryMatch[1]) * 1000 - 60000
        : Date.now() + 1800000

      URL_CACHE.set(videoId, { url, expiry })
      resolve(url)
    })
  })
}

export function ytAudioProxy(): Plugin {
  return {
    name: 'yt-audio-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/\/api\/yt-audio\/([\w-]{11})(?:\/.*)?$/)
        if (!match) return next()

        const videoId = match[1]

        try {
          const ytUrl = await getYtAudioUrl(videoId)
          const controller = new AbortController()

          req.socket.setTimeout(30000)
          req.socket.on('timeout', () => controller.abort())

          const ytRes = await fetch(ytUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Origin': 'https://www.youtube.com'
            },
            signal: controller.signal
          })

          if (!ytRes.ok) {
            res.statusCode = ytRes.status
            res.end(`Proxy error: ${ytRes.statusText}`)
            return
          }

          ytRes.headers.forEach((value, key) => {
            const lower = key.toLowerCase()
            if (lower !== 'transfer-encoding' && lower !== 'content-encoding' && lower !== 'content-length') {
              res.setHeader(key, value)
            }
          })

          if (ytRes.body) {
            const reader = (ytRes.body as ReadableStream<Uint8Array>).getReader()
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(Buffer.from(value))
              }
              res.end()
            }
            pump().catch(() => { if (!res.writableEnded) res.end() })
          } else {
            res.end()
          }
        } catch (err: any) {
          if (!res.writableEnded) {
            res.statusCode = 500
            res.end(`Audio proxy failed: ${err.message}`)
          }
        }
      })
    }
  }
}
