import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import * as ReactNative from 'react-native';
import { ThemeProvider, useSchemePreference, useTheme } from './ThemeProvider';

const mockStore = { getItem: jest.fn(), setItem: jest.fn() };
jest.mock('expo-secure-store', () => ({
  getItem: (...a: unknown[]) => mockStore.getItem(...a),
  setItem: (...a: unknown[]) => mockStore.setItem(...a),
}));

function Probe() {
  const { scheme } = useTheme();
  const { setPreference } = useSchemePreference();
  return (
    <Pressable onPress={() => setPreference('dark')}>
      <Text testID="scheme">{scheme}</Text>
    </Pressable>
  );
}
const shown = () => screen.getByTestId('scheme').props.children as string;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue('dark');
});
afterEach(() => jest.restoreAllMocks());

describe('the theme a person starts with', () => {
  it('is light on a first start, even on a device in dark mode', async () => {
    mockStore.getItem.mockReturnValue(null);
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe('light');
  });

  it('is what they chose before, and "system" still follows the device', async () => {
    mockStore.getItem.mockReturnValue('system');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe('dark');
  });

  it('ignores an unknown stored value, and survives storage that throws', async () => {
    mockStore.getItem.mockReturnValueOnce('neon');
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe('light');
    mockStore.getItem.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(shown()).toBe('light');
  });

  it('remembers a new choice', async () => {
    mockStore.getItem.mockReturnValue(null);
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('scheme'));
    expect(shown()).toBe('dark');
    expect(mockStore.setItem).toHaveBeenCalledWith('matchup.theme', 'dark');
  });
});
