// Shared by the rendered UI (SeoContent) and the build-time JSON-LD/no-JS
// fallback in vite-plugin-seo.js, so the two can't drift apart. Answers take
// the list of currently-open pool names so the first one stays accurate.

export const FAQ = [
  {
    q: 'Which NYC indoor pools are open right now?',
    a: (openNames) =>
      `${openNames.length} NYC Parks indoor pools are currently open: ${openNames.join(', ')}. ` +
      `Use the "Today" filter to see only sessions that haven't already finished today.`,
  },
  {
    q: 'Are NYC public indoor pools free?',
    a: () =>
      'Not usually. Almost every NYC indoor pool sits inside a recreation center, and access ' +
      'requires a Recreation Center membership. Membership is free for anyone 24 and under, ' +
      '$25/year for seniors 62+, veterans and people with disabilities, and $150/year for other ' +
      "adults — and it covers every recreation center in the city. The city's outdoor pools, open " +
      'late June through Labor Day, are free to everyone with no membership.',
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
