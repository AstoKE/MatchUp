import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { currentLocale, initI18n, restoreStoredLocale } from '@/lib/i18n';
import { ThemeProvider } from '@/ui';
import { LanguagePicker } from './LanguagePicker';

jest.mock('expo-secure-store', () => {
  const data = new Map<string, string>();
  return {
    getItemAsync: jest.fn((key: string) => Promise.resolve(data.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      data.set(key, value);
      return Promise.resolve();
    }),
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderPicker() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider initialPreference="light">
        <LanguagePicker />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('LanguagePicker', () => {
  beforeEach(() => initI18n('tr'));

  it('shows both languages by their own names and marks the current one', async () => {
    await renderPicker();
    expect(screen.getByRole('radio', { name: 'Türkçe' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('switches the whole UI language and remembers the choice', async () => {
    await renderPicker();
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    await waitFor(() => expect(currentLocale()).toBe('en'));
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    // The visible caption is translated too (hidden from assistive tech: the radio group carries the name).
    expect(screen.getByText('Language', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByLabelText('Language').props.accessibilityRole).toBe('radiogroup');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('matchup.locale', 'en');
  });

  it('applies a stored choice at startup, overriding the device language', async () => {
    await SecureStore.setItemAsync('matchup.locale', 'en');
    initI18n('tr'); // device says Turkish
    await restoreStoredLocale();
    expect(currentLocale()).toBe('en');
  });
});
