import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderApp } from '@/test/render';
import { AuthScreenLayout } from './components/AuthScreenLayout';

const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The account screens sit outside the tab bar: the back button is the guest's only way out.
describe('AuthScreenLayout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the title and a back button, and no logo', async () => {
    await renderApp(
      <AuthScreenLayout title="Tekrar hoş geldin">
        <Text>içerik</Text>
      </AuthScreenLayout>,
    );
    expect(screen.getByRole('heading', { name: 'Tekrar hoş geldin' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Geri' })).toBeTruthy();
    expect(screen.queryByLabelText(/logo/i)).toBeNull();
  });

  it('goes back when there is history', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    await renderApp(
      <AuthScreenLayout title="Giriş">
        <Text>içerik</Text>
      </AuthScreenLayout>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Geri' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('falls back to Discover when a guest was redirected here (no history)', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderApp(
      <AuthScreenLayout title="Giriş">
        <Text>içerik</Text>
      </AuthScreenLayout>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Geri' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});
