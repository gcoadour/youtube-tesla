/**
 * Déverrouillage des éléments audio sur iOS.
 *
 * Safari mobile refuse de charger ou de jouer un média tant que l'élément n'a
 * pas été « touché » par un geste utilisateur, et cette autorisation est
 * attachée à **l'élément**, pas à la page. Deux conséquences pour ce lecteur :
 *
 *  - `preload` est ignoré : un élément jamais joué ne déclenche jamais
 *    `loadedmetadata`, ce qui fait passer un flux parfaitement valide pour mort ;
 *  - l'autorisation issue d'un geste ne survit pas à un `await`. Or toucher une
 *    piste déclenche une résolution d'URL asynchrone avant le `play()` : au
 *    moment de l'appel, le geste n'est plus « en cours ».
 *
 * La parade standard : jouer un fichier silencieux sur l'élément **pendant** le
 * geste. L'élément reste ensuite autorisé pour toute la session, y compris
 * après un changement de `src`.
 */

/**
 * WAV PCM valide sans échantillon : rien à décoder, rien à entendre.
 * Silencieux par construction — on ne touche donc jamais à `muted`, qui
 * risquerait de rendre muette la piste réelle si le nettoyage arrivait tard.
 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

const primed = new WeakSet<HTMLAudioElement>()

/**
 * Autorise un élément audio. **À appeler de façon synchrone dans un
 * gestionnaire d'événement utilisateur** — un `await` préalable annule l'effet.
 */
export function primeAudioElement(audio: HTMLAudioElement): void {
  if (primed.has(audio)) return
  primed.add(audio)

  try {
    audio.src = SILENT_WAV
    const played = audio.play()

    /*
     * Le déverrouillage a lieu pendant le geste qui, bien souvent, sélectionne
     * aussi une piste : la résolution d'URL qui suit peut donc remplacer `src`
     * avant que la promesse de `play()` ne se règle. Le nettoyage ne doit
     * s'appliquer que si le clip silencieux est encore chargé — sinon il
     * effacerait la piste que l'utilisateur vient de lancer.
     */
    const cleanup = () => {
      if (audio.getAttribute('src') !== SILENT_WAV) return
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }

    if (played) {
      played.then(cleanup).catch(cleanup)
    } else {
      cleanup()
    }
  } catch {
    // Élément indisponible : la lecture repassera par un geste explicite.
  }
}

export function isPrimed(audio: HTMLAudioElement): boolean {
  return primed.has(audio)
}

/**
 * Déverrouille l'élément au premier geste utilisateur, quel qu'il soit.
 * Renvoie la fonction de désabonnement.
 */
export function primeOnFirstGesture(audio: HTMLAudioElement): () => void {
  const events: (keyof DocumentEventMap)[] = ['pointerdown', 'touchend', 'keydown']

  const handler = () => {
    primeAudioElement(audio)
    detach()
  }

  const detach = () => {
    for (const type of events) document.removeEventListener(type, handler, true)
  }

  // Capture : on veut passer avant les gestionnaires de l'application, pour
  // que le déverrouillage ait lieu dans le même geste que le tap sur une piste.
  for (const type of events) document.addEventListener(type, handler, true)
  return detach
}

/**
 * Crée un élément audio déjà autorisé, destiné aux tests d'instances.
 * À appeler dans le gestionnaire de clic du bouton de diagnostic.
 */
export function createPrimedProbe(): HTMLAudioElement {
  const audio = new Audio()
  audio.preload = 'metadata'
  primeAudioElement(audio)
  return audio
}
