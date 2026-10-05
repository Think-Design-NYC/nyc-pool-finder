import { Newspaper } from 'lucide-react'
import { NEWS } from '../copy'

// Mirrored by newsHtml() in src/html.js for the no-JS fallback; keep the
// wording and structure in step (both read NEWS).
export default function NewsBanner() {
  return (
    <aside
      aria-label="News"
      className="mx-auto mb-4 flex max-w-6xl items-start gap-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-600/20"
    >
      <Newspaper className="mt-0.5 shrink-0 text-sky-600" size={18} aria-hidden="true" />
      <p>
        <strong className="font-semibold">{NEWS.headline}.</strong> {NEWS.summary}{' '}
        <a
          href={NEWS.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Read the {NEWS.source} story
        </a>
        , or{' '}
        <a href={NEWS.postUrl} className="font-medium underline underline-offset-2">
          {NEWS.postLabel.charAt(0).toLowerCase() + NEWS.postLabel.slice(1)}
        </a>
        .
      </p>
    </aside>
  )
}
