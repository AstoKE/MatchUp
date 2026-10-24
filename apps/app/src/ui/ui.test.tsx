import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initI18n } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Screen,
  Skeleton,
  Text,
  TextField,
  ThemeProvider,
  ToastProvider,
  useSchemePreference,
  useTheme,
  useToast,
  darkColors,
  lightColors,
} from '.';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderThemed(ui: ReactElement, preference: 'light' | 'dark' = 'light') {
  initI18n('tr');
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider initialPreference={preference}>
        <ToastProvider>{ui}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('Button', () => {
  it('exposes role, accessible name and fires onPress', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Kaydet" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Kaydet' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled and reports disabled state', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Kaydet" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Kaydet' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('is busy, inert and uses the loading label while loading', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <Button label="Kaydet" loading loadingLabel="Yükleniyor…" onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Yükleniyor…' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeBusy();
  });
});

describe('TextField', () => {
  it('has a visible label, an accessible name, and forwards text changes', async () => {
    const onChangeText = jest.fn();
    await renderThemed(<TextField label="E-posta" value="" onChangeText={onChangeText} />);
    const input = screen.getByLabelText('E-posta');
    await fireEvent.changeText(input, 'a@b.co');
    expect(onChangeText).toHaveBeenCalledWith('a@b.co');
    // The visible label is rendered, but hidden from assistive tech on native: the input already
    // carries the accessible name, and exposing both made TalkBack stop on every label twice.
    const label = screen.getByText('E-posta', { includeHiddenElements: true });
    expect(label.props.accessibilityElementsHidden).toBe(true);
    expect(screen.queryByText('E-posta')).toBeNull();
    expect(screen.getAllByLabelText('E-posta')).toHaveLength(1);
  });

  it('announces errors via an alert and marks the field invalid', async () => {
    await renderThemed(
      <TextField label="E-posta" value="x" onChangeText={() => undefined} error="Geçersiz" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Geçersiz');
    expect(screen.getByLabelText('E-posta').props['aria-invalid']).toBe(true);
  });

  it('shows the hint when there is no error', async () => {
    await renderThemed(
      <TextField label="Şifre" value="" onChangeText={() => undefined} hint="En az 10 karakter." />,
    );
    expect(screen.getByText('En az 10 karakter.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Text, Banner, EmptyState, Skeleton, Screen', () => {
  it('Text with heading renders a heading role', async () => {
    await renderThemed(
      <Text heading={1} variant="headline">
        Başlık
      </Text>,
    );
    expect(screen.getByRole('heading', { name: 'Başlık' })).toBeTruthy();
  });

  it('danger Banner is an alert; info Banner is a status', async () => {
    await renderThemed(
      <>
        <Banner kind="danger" message="Hata oluştu" />
        <Banner kind="info" message="Bilgi" />
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Hata oluştu');
    expect(screen.getByRole('status')).toHaveTextContent('Bilgi');
  });

  it('EmptyState renders a heading and a working action', async () => {
    const onAction = jest.fn();
    await renderThemed(
      <EmptyState
        title="Boş"
        body="Henüz bir şey yok"
        actionLabel="Tekrar dene"
        onAction={onAction}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Boş' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('Skeleton is hidden from assistive technology', async () => {
    await renderThemed(
      <>
        <Skeleton />
        <RNText>içerik</RNText>
      </>,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('içerik')).toBeTruthy();
  });

  it('Screen provides the main landmark', async () => {
    await renderThemed(
      <Screen scroll={false} testID="screen">
        <Text>içerik</Text>
      </Screen>,
    );
    expect(screen.getByTestId('screen').props.role).toBe('main');
  });
});

describe('Toast', () => {
  function Trigger({ kind }: { kind?: 'info' | 'danger' }) {
    const toast = useToast();
    return <Button label="göster" onPress={() => toast.show('Merhaba toast', kind)} />;
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('appears, is dismissible, and auto-hides', async () => {
    await renderThemed(<Trigger />);
    await fireEvent.press(screen.getByRole('button', { name: 'göster' }));
    expect(screen.getByText('Merhaba toast')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Merhaba toast')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'göster' }));
    expect(screen.getByText('Merhaba toast')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5001);
    });
    expect(screen.queryByText('Merhaba toast')).toBeNull();
  });

  it('error toasts are alerts and live longer than info toasts', async () => {
    await renderThemed(<Trigger kind="danger" />);
    await fireEvent.press(screen.getByRole('button', { name: 'göster' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Merhaba toast');
    await act(async () => {
      jest.advanceTimersByTime(5001);
    });
    expect(screen.getByText('Merhaba toast')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Merhaba toast')).toBeNull();
  });
});

describe('ThemeProvider', () => {
  function ThemeProbe() {
    const theme = useTheme();
    const { setPreference } = useSchemePreference();
    return (
      <>
        <RNText testID="scheme">{theme.scheme}</RNText>
        <RNText testID="bg">{theme.colors.bgApp}</RNText>
        <Button label="dark" onPress={() => setPreference('dark')} />
      </>
    );
  }

  it('uses the requested preference and can switch at runtime', async () => {
    await renderThemed(<ThemeProbe />, 'light');
    expect(screen.getByTestId('scheme')).toHaveTextContent('light');
    expect(screen.getByTestId('bg')).toHaveTextContent(lightColors.bgApp);
    await fireEvent.press(screen.getByRole('button', { name: 'dark' }));
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
    expect(screen.getByTestId('bg')).toHaveTextContent(darkColors.bgApp);
  });

  it('throws a clear error when used outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ThemeProbe />)).rejects.toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
