import api from '../api/client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// No iOS o push so funciona com o app instalado na tela inicial (PWA).
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  )
}

export type PushState = 'granted' | 'denied' | 'default' | 'unsupported'

export function currentPushState(): PushState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushState
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'nao-suportado' }
  if (isIOS() && !isStandalone()) return { ok: false, reason: 'ios-instalar' }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'permissao-negada' }

  const reg = await navigator.serviceWorker.ready
  const { data } = await api.get('/push/vapid-public-key')
  if (!data?.key) return { ok: false, reason: 'sem-vapid' }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.key) as BufferSource,
    })
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'inscricao-invalida' }
  }
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
  return { ok: true }
}
