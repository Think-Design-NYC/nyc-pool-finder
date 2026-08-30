import { render, screen, fireEvent } from '@testing-library/react-native';

import PoolCard from '../PoolCard';

const OPEN_POOL = {
  pool_name: 'Chelsea Pool',
  status: 'open',
  phone: '(212) 555-0123',
  url: 'https://www.nycgovparks.org/facilities/recreationcenters/chelsea',
  location: {
    address: '430 W 25th St',
    city: 'New York',
    state: 'NY',
    zip_code: '10001',
    nearest_subway: 'C/E to 23rd St',
    building_hours: { Monday_Friday: '6:00 a - 9:00 p', Saturday: '8:00 a - 4:45 p' },
  },
  schedules: [
    { session_type: 'Adult Lap Swim', days: 'Monday, Wednesday', time: '7:00 a - 9:00 a' },
  ],
};

const CLOSED_POOL = {
  pool_name: 'Hansborough Pool',
  status: 'closed',
  notes: 'Closed for reconstruction until further notice.',
  location: { address: '35 W 134th St', zip_code: '10037' },
  schedules: [],
};

test('renders name, borough, status, and schedule rows for an open pool', async () => {
  await render(<PoolCard pool={OPEN_POOL} activityLabel="Lap Swim" />);
  expect(screen.getByText('Chelsea Pool')).toBeTruthy();
  expect(screen.getByText('Manhattan')).toBeTruthy(); // inferred from zip 10001
  expect(screen.getByText('Open')).toBeTruthy();
  expect(screen.getByText('Adult Lap Swim')).toBeTruthy();
  expect(screen.getByText('7:00 a - 9:00 a')).toBeTruthy();
  expect(screen.getByText(/Lap Swim Times/)).toBeTruthy();
});

test('renders closure notes and no schedule section for a closed pool', async () => {
  await render(<PoolCard pool={CLOSED_POOL} />);
  expect(screen.getByText('Closed')).toBeTruthy();
  expect(screen.getByText(/Closed for reconstruction/)).toBeTruthy();
  expect(screen.queryByText(/Times/)).toBeNull();
});

test('building hours are collapsed until tapped', async () => {
  await render(<PoolCard pool={OPEN_POOL} />);
  expect(screen.queryByText('Monday – Friday')).toBeNull();

  await fireEvent.press(screen.getByText('Building hours'));
  expect(screen.getByText('Monday – Friday')).toBeTruthy();
  expect(screen.getByText('6:00 a - 9:00 p')).toBeTruthy();
});
