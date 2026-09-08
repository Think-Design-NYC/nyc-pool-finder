import { useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often an already-open tab re-checks for a new build. The data refreshes
// once a day, so this only matters for a session left open across a refresh —
// an installed PWA on someone's phone, typically.
const UPDATE_CHECK_MS = 60 * 60 * 1000

// Offered rather than applied: the service worker is registered with
// registerType 'prompt', so a new build waits until the reader asks for it
// instead of replacing the schedule they are currently reading. If they ignore
// it, App.jsx's staleness banner takes over after STALE_AFTER_HOURS.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const timer = setInterval(() => registration.update(), UPDATE_CHECK_MS)
      // The interval outlives this callback deliberately — it is torn down by
      // the page going away, not by a re-render.
      return () => clearInterval(timer)
    },
  })

  // Nothing to clean up when the prompt unmounts, but keep the escape hatch
  // honest: dismissing hides the toast for this page load only.
  useEffect(() => {}, [])

  if (!needRefresh) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-20 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
    >
      <RefreshCw size={16} className="shrink-0 text-sky-300" />
      <span className="flex-1">Updated pool schedules are available.</span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-lg bg-sky-500 px-3 py-1 font-semibold hover:bg-sky-400"
      >
        Refresh
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss"
        className="shrink-0 text-slate-400 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  )
}
