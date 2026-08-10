/**
 * Relais CORS publics — solution de dépannage.
 *
 * Les instances Invidious publiques doivent déployer un dispositif anti-bot
 * (règle 14 de la liste officielle) et ne renvoient pas d'en-tête
 * `Access-Control-Allow-Origin` : depuis une page servie par GitHub Pages,
 * aucun appel JSON direct n'aboutit. Un relais public refait la requête côté
 * serveur et renvoie la réponse avec CORS.
 *
 * Ce que cela coûte, et qu'il faut assumer :
 *  - les requêtes transitent par un tiers, qui voit ce qui est recherché ;
 *  - ces services sont gratuits, donc limités en débit et régulièrement saturés ;
 *  - le relais peut lui-même se faire opposer le défi anti-bot de l'instance.
 *
 * D'où le principe retenu : **le direct d'abord, toujours**. Le relais n'est
 * sollicité qu'une fois toutes les tentatives directes épuisées.
 */

const STORAGE_KEY = 'yt-cors-proxy'

export type ProxyMode = 'auto' | 'off'

export interface CorsProxy {
  id: string
  label: string
  /** Enveloppe une URL absolue. */
  wrap: (url: string) => string
}

/** Relais publics sans clé d'API, essayés dans cet ordre. */
export const CORS_PROXIES: CorsProxy[] = [
  {
    id: 'allorigins',
    label: 'AllOrigins',
    wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  },
  {
    id: 'codetabs',
    label: 'CodeTabs',
    wrap: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  },
  {
    id: 'corsproxy',
    label: 'corsproxy.io',
    wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  },
]

export function getProxyMode(): ProxyMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'off' ? 'off' : 'auto'
  } catch {
    return 'auto'
  }
}

export function setProxyMode(mode: ProxyMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Le choix ne survivra pas au rechargement, mais s'applique immédiatement.
  }
}

export function isProxyEnabled(): boolean {
  return getProxyMode() === 'auto'
}

/** Origine synthétique servant de clé d'exclusion dans les cascades. */
export function proxyOrigin(proxyId: string, origin: string): string {
  return `proxy:${proxyId}|${origin}`
}

export function proxiedUrl(proxy: CorsProxy, url: string): string {
  return proxy.wrap(url)
}

/**
 * Toutes les variantes relayées d'une URL, dans l'ordre de préférence.
 * Vide si l'utilisateur a désactivé les relais.
 */
export function proxyVariants(url: string): { proxy: CorsProxy; url: string }[] {
  if (!isProxyEnabled()) return []
  return CORS_PROXIES.map((proxy) => ({ proxy, url: proxy.wrap(url) }))
}
