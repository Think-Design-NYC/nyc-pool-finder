// Recreation Center membership pricing.
//
// Verified against nycgovparks.org/programs/recreation-centers/membership on
// 2026-08-03. Unlike everything else on this site these numbers are NOT
// scraped, so they can go stale — re-check them if the page looks off.
//
// Only the "Access to All Centers" tier gets you into an indoor pool. NYC Parks
// also sells a cheaper $100/yr tier, but it explicitly excludes every center
// that has a pool, so quoting it here would send people to the wrong product.

export const MEMBERSHIP_URL =
  'https://www.nycgovparks.org/programs/recreation-centers/membership'

// Shown next to the prices. Hardcoded on purpose — it's the date the figures
// were checked against NYC Parks, not today's date, so bump it by hand when you
// re-verify. An auto-updating date here would vouch for numbers nobody looked at.
export const MEMBERSHIP_CHECKED = 'Aug 31, 2026'

export const MEMBERSHIP_TIERS = [
  { who: '24 and under', price: 'Free' },
  { who: '25–61', price: '$150 / year', note: 'or $75 for six months' },
  {
    who: '62+, veterans, people with disabilities',
    price: '$25 / year',
    note: 'any age for veterans and people with disabilities',
  },
]

// One-line version for prose and meta descriptions.
export const MEMBERSHIP_SUMMARY =
  'free if you are 24 or under, $25 a year for seniors 62+, veterans and people ' +
  'with disabilities, and $150 a year (or $75 for six months) for adults 25–61'

export const IDNYC_NOTE =
  'New Yorkers aged 25–61 get 10% off with an IDNYC card. There is no sign-up ' +
  'fee, but memberships are non-refundable and cash is not accepted.'
