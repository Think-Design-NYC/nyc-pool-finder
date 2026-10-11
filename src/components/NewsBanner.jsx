import { Newspaper } from 'lucide-react'
import { NEWS } from '../copy'

// Mirrored by newsHtml() in src/html.js for the no-JS fallback; keep the
// wording and structure in step (both read NEWS).
export default function NewsBanner() {
  return (
    <aside
      aria-label="News"
      className="mx-auto mb-4 flex max-w-6xl flex-col gap-3 rounded-xl bg-shallow/40 px-4 py-3 text-sm text-deep-end ring-1 ring-tile-blue/20 md:flex-row md:items-start md:gap-5"
    >
      <div className="flex items-start gap-3 md:w-1/2">
        <Newspaper className="mt-0.5 shrink-0 text-tile-blue" size={18} aria-hidden="true" />
        <p>
          <strong className="font-semibold">
            <a href={NEWS.postUrl} className="hover:underline">
              {NEWS.headline}
            </a>
            .
          </strong>{' '}
          {NEWS.summary}{' '}
          <a href={NEWS.postUrl} className="font-medium underline underline-offset-2">
            {NEWS.postLabel}
          </a>
          .
        </p>
      </div>
      <figure className="md:w-1/2">
        <a href={NEWS.postUrl}>
          <img
            src={NEWS.photo.src}
            srcSet={NEWS.photo.srcSet}
            sizes="(min-width: 768px) 560px, 100vw"
            width={NEWS.photo.width}
            height={NEWS.photo.height}
            alt={NEWS.photo.alt}
            className="block h-auto w-full rounded-lg bg-shallow"
          />
        </a>
        <figcaption className="mt-1 text-xs text-deep-end/70">{NEWS.photo.caption}</figcaption>
      </figure>
    </aside>
  )
}
