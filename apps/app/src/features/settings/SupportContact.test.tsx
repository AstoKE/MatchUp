import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { renderApp } from '@/test/render';
import { SupportContact } from './SupportContact';

jest.mock('@matchup/config', () => {
  const actual = jest.requireActual<typeof import('@matchup/config')>('@matchup/config');
  return { ...actual, brand: { ...actual.brand, contact: { supportEmail: null } } };
});

const { contact } = jest.requireMock<{ brand: { contact: { supportEmail: string | null } } }>(
  '@matchup/config',
).brand;

describe('SupportContact', () => {
  afterEach(() => {
    contact.supportEmail = null;
  });

  it('says the address is coming while none is configured, and offers no dead link', async () => {
    await renderApp(<SupportContact />);
    expect(screen.getByText('Destek adresimiz çok yakında burada olacak.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the email app at the configured address', async () => {
    contact.supportEmail = 'destek@example.org';
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderApp(<SupportContact />, { locale: 'en' });
    expect(
      screen.getByText('If you have a problem, a question or an objection, email us.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'destek@example.org' }));
    expect(open).toHaveBeenCalledWith('mailto:destek@example.org');
  });
});
