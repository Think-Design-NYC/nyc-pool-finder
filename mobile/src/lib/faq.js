// Shared by the rendered UI (SeoContent) and the build-time JSON-LD/no-JS
// fallback in vite-plugin-seo.js, so the two can't drift apart. Answers take
// the list of currently-open pool names so the first one stays accurate.

import { IDNYC_NOTE, MEMBERSHIP_CHECKED, MEMBERSHIP_SUMMARY } from './membership'

export const FAQ = [
  {
    q: 'Which NYC indoor pools are open right now?',
    a: (openNames) =>
      `${openNames.length} NYC Parks indoor pools are currently open: ${openNames.join(', ')}. ` +
      `Use the "Today" filter to see only sessions that haven't already finished today.`,
  },
  {
    q: 'How much does it cost to swim at an NYC indoor pool?',
    a: () =>
      `Every NYC indoor pool sits inside a recreation center, so you need a Recreation Center ` +
      `membership. As of ${MEMBERSHIP_CHECKED} it is ${MEMBERSHIP_SUMMARY}. ` +
      `One membership covers every recreation center in the ` +
      `city. Note that the cheaper $100 tier does not include centers with pools — you need the ` +
      `"Access to All Centers" package. ${IDNYC_NOTE}`,
  },
  {
    q: 'Are NYC public indoor pools free?',
    a: () =>
      'Only if you are 24 or under — youth and young-adult memberships cost nothing. Everyone ' +
      "else pays for a Recreation Center membership. The city's outdoor pools, open late June " +
      'through Labor Day, are free to everyone with no membership at all.',
  },
  {
    q: 'When is lap swim at NYC indoor pools?',
    a: () =>
      'Lap swim runs most weekday mornings and evenings, with extra weekend blocks at the larger ' +
      'recreation centers. Times vary by pool and change seasonally — filter by "Lap Swim" to see ' +
      'the current schedule for every borough.',
  },
  {
    q: 'What do I need to bring to an NYC public pool?',
    a: () =>
      'A bathing suit, a towel, and a padlock for the lockers. Swim caps are required at most NYC ' +
      'Parks pools. Bags larger than a small backpack are generally not allowed on the pool deck.',
  },
  {
    q: 'Are NYC indoor pools open year-round?',
    a: () =>
      "Indoor pools operate year-round, unlike the city's outdoor pools which only open from late " +
      'June through Labor Day. Individual indoor pools still close for maintenance or capital ' +
      'projects — any closure is shown on the pool card above.',
  },
]
