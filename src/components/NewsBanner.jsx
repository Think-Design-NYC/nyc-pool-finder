import { useState } from 'react'
import { ArrowRight, Newspaper, X } from 'lucide-react'
import { NEWS } from '../copy'

const DISMISS_KEY = 'poolfinder.newsDismissed'

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === NEWS.id
  } catch {
    return false
  }
}

// A one-line strip under the header, in the mockup's info-bar style. Mirrored
// by newsHtml() in src/html.js for the no-JS fallback; keep the wording in
// step (both read NEWS). Dismissal hides it for this reader only — the
// fallback and every other visitor still get it, and the story's pool keeps
// its tag (PoolCard), so the news stays findable in context.
export default function NewsBanner() {
  const [hidden, setHidden] = useState(wasDismissed)
  if (hidden) return null
  return (
    <aside aria-label="News" className="-mx-4 border-b border-tile-blue/15 bg-shallow/60 px-4">
      <div className="mx-auto flex max-w-6xl items-start gap-2.5 py-2.5 text-sm text-deep-end">
        <Newspaper className="mt-0.5 shrink-0 text-tile-blue" size={16} aria-hidden="true" />
        <p className="flex-1" title={NEWS.summary}>
          <strong className="font-semibold">
            <a href={NEWS.postUrl} className="hover:underline">
              {NEWS.headline}
            </a>
            .
          </strong>{' '}
          <a
            href={NEWS.postUrl}
            className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-tile-blue hover:underline"
          >
            {NEWS.postLabel}
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, NEWS.id)
            } catch {
              // still hide it for this page view
            }
            setHidden(true)
          }}
          aria-label="Dismiss this news"
          className="-mr-1 shrink-0 rounded-full p-1 text-muted hover:bg-white hover:text-deep-end"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  )
}
