import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

import App from '../../App';

beforeEach(() => {
  // Monday, Aug 31 2026, 10:00 local — deterministic Today/Tomorrow filters.
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 7, 31, 10, 0, 0) });
  global.fetch = jest.fn(async () => {
    throw new Error('offline test');
  });
});

afterEach(() => {
  jest.useRealTimers();
  delete global.fetch;
});

test('renders the bundled pools under the default filters', async () => {
  await render(<App />);

  expect(await screen.findByText('NYC Indoor Pool Finder')).toBeTruthy();
  // Manhattan / Lap Swim / Today defaults: Chelsea has Monday lap swim.
  expect(await screen.findByText('Chelsea Pool')).toBeTruthy();
  // Closed Manhattan pool has no schedules, so the activity filter drops it.
  expect(screen.queryByText('Hansborough Pool')).toBeNull();
});

test('switching borough changes the visible pools', async () => {
  await render(<App />);
  await screen.findByText('Chelsea Pool');

  await fireEvent.press(screen.getByText('Brooklyn'));
  await waitFor(() => expect(screen.queryByText('Chelsea Pool')).toBeNull());
  expect(screen.getByText(/St. John's Pool/)).toBeTruthy();
});
