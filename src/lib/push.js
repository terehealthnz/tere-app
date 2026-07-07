// Push notification service — uses Capacitor native push on iOS/Android, falls back to web push

const isNative = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

// ── Native push (Capacitor) ───────────────────────────────────────────────────

async function initNativePush() {
  const { PushNotifications } = await import('@capacitor/push-notifications')

  const status = await PushNotifications.checkPermissions()
  let permission = status.receive

  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    const result = await PushNotifications.requestPermissions()
    permission = result.receive
  }

  if (permission !== 'granted') return null

  await PushNotifications.register()

  return new Promise((resolve) => {
    PushNotifications.addListener('registration', (token) => resolve(token.value))
    PushNotifications.addListener('registrationError', () => resolve(null))
    // 5s timeout in case registration hangs
    setTimeout(() => resolve(null), 5000)
  })
}

// ── Web push (VAPID) ──────────────────────────────────────────────────────────

async function initWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const reg = await navigator.serviceWorker.ready
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return null

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
    return JSON.stringify(sub)
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

// ── Unified API ───────────────────────────────────────────────────────────────

/**
 * Request push permission and store the token in Supabase for the given user.
 * Works in both native (Capacitor) and web (VAPID) contexts.
 */
export async function registerPush(userId) {
  const native = isNative()
  const token = native ? await initNativePush() : await initWebPush()
  if (!token) return { ok: false, reason: 'permission_denied' }

  const platform = native
    ? window.Capacitor.getPlatform() // 'ios' | 'android'
    : 'web'

  const { apiFetch } = await import('./api')
  const res = await apiFetch('/api/push-subscribe', {
    method: 'POST',
    body: JSON.stringify({ userId, token, platform }),
  })

  return { ok: res.ok, token, platform }
}

/**
 * Listen for incoming push notifications while the app is in foreground.
 * `handler` receives { title, body, data }.
 * Returns an unsubscribe function.
 */
export async function onPushReceived(handler) {
  if (!isNative()) return () => {}

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const listener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    handler({
      title: notification.title,
      body: notification.body,
      data: notification.data,
    })
  })
  return () => listener.remove()
}

/**
 * Listen for taps on push notifications (app opened from notification).
 * Returns an unsubscribe function.
 */
export async function onPushActionPerformed(handler) {
  if (!isNative()) return () => {}

  const { PushNotifications } = await import('@capacitor/push-notifications')
  const listener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    handler({
      title: action.notification.title,
      body: action.notification.body,
      data: action.notification.data,
    })
  })
  return () => listener.remove()
}
