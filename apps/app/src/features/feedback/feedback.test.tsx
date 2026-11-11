import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import { FeedbackSheet } from './FeedbackSheet';

const mockSubmit = jest.fn();
jest.mock('./api/feedback-api', () => ({
  ...jest.requireActual('./api/feedback-api'),
  submitFeedback: (...a: unknown[]) => mockSubmit(...a),
}));

const signedIn: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const onClose = jest.fn();
const open = () =>
  renderApp(<FeedbackSheet visible context="settings" onClose={onClose} />, { session: signedIn });

beforeEach(() => {
  jest.clearAllMocks();
  mockSubmit.mockResolvedValue('00000000-0000-4000-8000-0000000000f1');
});

describe('the feedback form (P-22)', () => {
  it('sends the kind, the trimmed text and the screen it came from, then closes', async () => {
    await open();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Öneri' }));
    await fireEvent.changeText(
      screen.getByLabelText('Mesajın'),
      '  Takvime ekle düğmesi olsa iyi olur.  ',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() =>
      expect(mockSubmit).toHaveBeenCalledWith({
        kind: 'SUGGESTION',
        body: 'Takvime ekle düğmesi olsa iyi olur.',
        context: 'settings',
      }),
    );
    expect(await screen.findByText('Mesajın bize ulaştı. Teşekkürler!')).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it('cannot be sent without a kind or with fewer than 10 characters', async () => {
    await open();
    expect(await screen.findByRole('button', { name: 'Gönder', disabled: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'İstek' }));
    await fireEvent.changeText(screen.getByLabelText('Mesajın'), 'kısa');
    expect(screen.getByRole('button', { name: 'Gönder', disabled: true })).toBeTruthy();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('points a complaint about a person or event to reporting', async () => {
    await open();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Şikayet' }));
    expect(screen.getByText(/onun sayfasındaki "Bildir" seçeneğini kullan/)).toBeTruthy();
  });

  it('shows a refusal from the server and stays open', async () => {
    mockSubmit.mockRejectedValue(new AppError('RATE_LIMITED'));
    await open();
    await fireEvent.press(await screen.findByRole('radio', { name: 'İstek' }));
    await fireEvent.changeText(
      screen.getByLabelText('Mesajın'),
      'Karanlık temada harita daha koyu olsun.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
