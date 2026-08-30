import { render, screen } from '@testing-library/react-native';

import StalenessBanner from '../StalenessBanner';

const NOW = new Date(2026, 7, 31, 10, 0, 0);

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true, now: NOW });
});
afterEach(() => {
  jest.useRealTimers();
});

test('hidden while the fetch is still pending, even if data looks stale', async () => {
  await render(
    <StalenessBanner meta={{ updated_at: '2026-08-01T06:00:00Z' }} fetchState="pending" />
  );
  expect(screen.queryByText(/stale|old/i)).toBeNull();
});

test('shown when the fetch settled and data is older than 48 hours', async () => {
  await render(
    <StalenessBanner meta={{ updated_at: '2026-08-01T06:00:00Z' }} fetchState="error" />
  );
  expect(screen.getByText(/Aug 1, 2026/)).toBeTruthy();
});

test('hidden when data is fresh', async () => {
  await render(
    <StalenessBanner meta={{ updated_at: '2026-08-30T06:00:00Z' }} fetchState="success" />
  );
  expect(screen.queryByText(/Aug 30, 2026/)).toBeNull();
});
