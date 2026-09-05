import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

// Native-shell wiring for the Capacitor app.
//
// (1) Android hardware back-button: without this, Android exits the app on
//     first press. We hook @capacitor/app.backButton → route history back
//     if possible, otherwise fall through to the OS (minimizes the app).
// (2) Universal / App Links: when the user taps a https://terehealth.co.nz
//     link inside another app (email, chat), Capacitor fires appUrlOpen —
//     strip the origin and navigate inside the SPA instead of reloading.
// (3) Status-bar tint: navy bar over the notch on both platforms.
//
// No-op on web.
export default function NativeShell() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
    if (!isNative) return

    let cleanups = []

    ;(async () => {
      try {
        const [{ App }, { StatusBar, Style }] = await Promise.all([
          import('@capacitor/app'),
          import('@capacitor/status-bar').catch(() => ({})),
        ])

        // (1) Android hardware back-button
        const backHandle = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack && window.history.length > 1) {
            navigate(-1)
          } else {
            // At root — let the OS minimize the app rather than exiting entirely
            App.minimizeApp?.().catch(() => {})
          }
        })
        cleanups.push(() => backHandle.remove())

        // (2) Deep-link / universal-link handler
        const urlHandle = await App.addListener('appUrlOpen', (event) => {
          try {
            const url = new URL(event.url)
            // Strip https://terehealth.co.nz OR terehealth:// prefix and navigate inside SPA
            const inAppPath = url.pathname + url.search + url.hash
            if (inAppPath && inAppPath !== '/') navigate(inAppPath)
          } catch {
            /* malformed URL — ignore */
          }
        })
        cleanups.push(() => urlHandle.remove())

        // (3) Status-bar tint (navy over the notch)
        if (StatusBar && Style) {
          try {
            await StatusBar.setStyle({ style: Style.Dark })
            await StatusBar.setBackgroundColor?.({ color: '#0D2B45' })
          } catch { /* iOS ignores setBackgroundColor; safe to swallow */ }
        }
      } catch (e) {
        // Capacitor plugins not installed in this environment — safe to ignore
        console.warn('[NativeShell] capacitor init skipped:', e?.message || e)
      }
    })()

    return () => {
      cleanups.forEach(fn => { try { fn() } catch { /* noop */ } })
    }
  }, [navigate])

  // Log route changes so future analytics can distinguish app vs web sessions
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      window.dispatchEvent(new CustomEvent('tere:route', { detail: { path: location.pathname } }))
    }
  }, [location.pathname])

  return null
}
