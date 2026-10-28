// The Pool Finder mark (Figma "Logo/Mark"): a tile-blue map pin with two
// waves and a lane-red dot. The Figma lockup sets "Pool Finder" as outlined
// type; the site keeps the wordmark as live text instead, because the name
// has to read "NYC Indoor Pool Finder" (see CLAUDE.md).
//
// scripts/make_icons.py draws the app-icon variant (white pin on tile blue).
export default function LogoMark({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <path
        d="M24 3C14.6 3 7 10.4 7 19.6C7 31.6 24 45 24 45C24 45 41 31.6 41 19.6C41 10.4 33.4 3 24 3Z"
        fill="#1668E3"
      />
      <path
        d="M13.5 18.5C16.1 18.5 16.1 16.1 18.75 16.1C21.4 16.1 21.35 18.5 24 18.5C26.65 18.5 26.6 16.1 29.25 16.1C31.9 16.1 31.85 18.5 34.5 18.5"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M15.5 26C17.6 26 17.6 23.8 19.7 23.8C21.8 23.8 21.8 26 24 26C26.2 26 26.1 23.8 28.2 23.8C30.3 23.8 30.3 26 32.5 26"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24" cy="9.5" r="2.6" fill="#F2542D" />
    </svg>
  )
}
