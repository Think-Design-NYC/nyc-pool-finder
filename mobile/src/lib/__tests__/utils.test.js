import {
  getBorough,
  matchesActivity,
  matchesDay,
  isPastToday,
  fullAddress,
  getStatusStyle,
  ACTIVITIES,
} from '../utils';

describe('getBorough', () => {
  test('returns explicit borough field when present', () => {
    expect(getBorough({ borough: 'Queens', location: { zip_code: '10001' } })).toBe('Queens');
  });

  test('falls back to zip prefix when borough missing', () => {
    expect(getBorough({ location: { zip_code: '10451' } })).toBe('Bronx');
    expect(getBorough({ location: { zip_code: '11215' } })).toBe('Brooklyn');
    expect(getBorough({ location: { zip_code: '10014' } })).toBe('Manhattan');
    expect(getBorough({ location: { zip_code: '10301' } })).toBe('Staten Island');
    expect(getBorough({ location: { zip_code: '11368' } })).toBe('Queens');
  });

  test('returns Other for unknown zip or missing location', () => {
    expect(getBorough({ location: { zip_code: '90210' } })).toBe('Other');
    expect(getBorough({})).toBe('Other');
  });
});

describe('matchesActivity', () => {
  test('empty activity key matches everything', () => {
    expect(matchesActivity('Anything At All', null)).toBe(true);
    expect(matchesActivity('Anything At All', '')).toBe(true);
  });

  test('unknown activity key matches nothing', () => {
    expect(matchesActivity('Lap Swim', 'Scuba')).toBe(false);
  });

  test('lap swim bucket matches real session strings', () => {
    expect(matchesActivity('Adult Lap Swim', 'Lap Swim')).toBe(true);
    expect(matchesActivity('Early Morning Lap Swim', 'Lap Swim')).toBe(true);
    expect(matchesActivity('Open Swim', 'Lap Swim')).toBe(false);
  });

  test('open swim bucket excludes lap sessions', () => {
    expect(matchesActivity('Open Swim', 'Open Swim')).toBe(true);
    expect(matchesActivity('General Swim', 'Open Swim')).toBe(true);
    expect(matchesActivity('Open Lap Swim', 'Open Swim')).toBe(false);
  });

  test('water exercise matches aqua terms but not Aquacades', () => {
    expect(matchesActivity('Water Exercise', 'Water Exercise')).toBe(true);
    expect(matchesActivity('Water Aerobics', 'Water Exercise')).toBe(true);
    expect(matchesActivity('Aqua Zumba', 'Water Exercise')).toBe(true);
    expect(matchesActivity('Aquacades', 'Water Exercise')).toBe(false);
  });

  test('swim team bucket includes Aquacades', () => {
    expect(matchesActivity('Swim Team Practice', 'Swim Team')).toBe(true);
    expect(matchesActivity('Aquacades', 'Swim Team')).toBe(true);
  });

  test('family and learn-to-swim buckets', () => {
    expect(matchesActivity('Family Swim', 'Family Swim')).toBe(true);
    expect(matchesActivity('Learn to Swim (Youth)', 'Learn to Swim')).toBe(true);
  });

  test('every ACTIVITIES key is distinct', () => {
    const keys = ACTIVITIES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('matchesDay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Monday, Aug 31 2026, 10:00 local time
    jest.setSystemTime(new Date(2026, 7, 31, 10, 0, 0));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('Week or empty day key matches everything', () => {
    expect(matchesDay('Friday', 'Week')).toBe(true);
    expect(matchesDay('Friday', null)).toBe(true);
  });

  test('Today matches the current weekday', () => {
    expect(matchesDay('Monday', 'Today')).toBe(true);
    expect(matchesDay('Monday, Wednesday', 'Today')).toBe(true);
    expect(matchesDay('Tuesday', 'Today')).toBe(false);
  });

  test('Tomorrow matches the next weekday', () => {
    expect(matchesDay('Tuesday', 'Tomorrow')).toBe(true);
    expect(matchesDay('Monday', 'Tomorrow')).toBe(false);
  });

  test('requires a whole-word day match (same as the website)', () => {
    expect(matchesDay('Mondays only', 'Today')).toBe(false);
    expect(matchesDay(null, 'Today')).toBe(false);
  });
});

describe('isPastToday', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 2:00 PM local
    jest.setSystemTime(new Date(2026, 7, 31, 14, 0, 0));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('true when the end time has passed', () => {
    expect(isPastToday('10:00 a - 1:00 p')).toBe(true);
  });

  test('false when the end time is still ahead', () => {
    expect(isPastToday('10:00 a - 3:00 p')).toBe(false);
  });

  test('handles noon correctly', () => {
    expect(isPastToday('11:00 a - 12:30 p')).toBe(true);
  });

  test('fails soft (keeps the session) on malformed times', () => {
    expect(isPastToday('noon - dusk')).toBe(false);
    expect(isPastToday('')).toBe(false);
    expect(isPastToday(null)).toBe(false);
    expect(isPastToday(undefined)).toBe(false);
  });
});

describe('fullAddress', () => {
  test('joins present parts with commas', () => {
    expect(
      fullAddress({ address: '35 W 134th St', city: 'New York', state: 'NY', zip_code: '10037' })
    ).toBe('35 W 134th St, New York, NY, 10037');
  });

  test('skips missing parts and handles no argument', () => {
    expect(fullAddress({ address: '35 W 134th St', zip_code: '10037' })).toBe(
      '35 W 134th St, 10037'
    );
    expect(fullAddress()).toBe('');
  });
});

describe('getStatusStyle', () => {
  test('labels the three known statuses', () => {
    expect(getStatusStyle('open').label).toBe('Open');
    expect(getStatusStyle('closed').label).toBe('Closed');
    expect(getStatusStyle('transitioning').label).toBe('Transitioning');
  });

  test('falls back to the raw status as label', () => {
    expect(getStatusStyle('mystery').label).toBe('mystery');
    expect(getStatusStyle(undefined).label).toBe('Unknown');
  });

  test('every style carries color tokens for the badge', () => {
    for (const status of ['open', 'closed', 'transitioning', 'mystery']) {
      const style = getStatusStyle(status);
      expect(style.badgeBg).toBeTruthy();
      expect(style.badgeText).toBeTruthy();
      expect(style.dot).toBeTruthy();
    }
  });
});
