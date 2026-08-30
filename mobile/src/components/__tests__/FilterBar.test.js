import { render, screen, fireEvent } from '@testing-library/react-native';

import FilterBar from '../FilterBar';

const baseProps = {
  boroughs: ['Manhattan', 'Brooklyn'],
  selectedBorough: 'Manhattan',
  onSelectBorough: jest.fn(),
  activities: ['Lap Swim', 'Open Swim'],
  selectedActivity: 'Lap Swim',
  onSelectActivity: jest.fn(),
  selectedDay: 'Today',
  onSelectDay: jest.fn(),
};

test('renders borough, activity, and day pills', async () => {
  await render(<FilterBar {...baseProps} />);
  expect(screen.getByText('All Boroughs')).toBeTruthy();
  expect(screen.getByText('Brooklyn')).toBeTruthy();
  expect(screen.getByText('All activities')).toBeTruthy();
  expect(screen.getByText('Open Swim')).toBeTruthy();
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Tomorrow')).toBeTruthy();
  expect(screen.getByText('Week')).toBeTruthy();
});

test('pill presses call the matching handlers', async () => {
  await render(<FilterBar {...baseProps} />);
  fireEvent.press(screen.getByText('Brooklyn'));
  expect(baseProps.onSelectBorough).toHaveBeenCalledWith('Brooklyn');
  fireEvent.press(screen.getByText('Open Swim'));
  expect(baseProps.onSelectActivity).toHaveBeenCalledWith('Open Swim');
  fireEvent.press(screen.getByText('Tomorrow'));
  expect(baseProps.onSelectDay).toHaveBeenCalledWith('Tomorrow');
});

test('hides the activity row when no activities are present', async () => {
  await render(<FilterBar {...baseProps} activities={[]} />);
  expect(screen.queryByText('All activities')).toBeNull();
});
