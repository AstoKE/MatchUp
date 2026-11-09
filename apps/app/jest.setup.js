// Test-only public configuration. These are NOT real credentials (the key is a syntactically valid
// placeholder, not a Supabase-issued token).
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-placeholder-not-a-secret';
process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:8081';

/* global jest */
// react-native-webview needs its native module, which Jest does not have. A plain View stands in;
// tests drive the CAPTCHA through its onMessage prop (see auth-screens.test.tsx).
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  const WebView = (props) => require('react').createElement(View, { ...props, testID: 'webview' });
  return { WebView, default: WebView };
});

// React.lazy chunks (docs/PERFORMANCE.md) are rendered directly in component tests: what is tested is the screen, and
// Playwright covers the lazy loading on the web.
jest.mock('./src/features/events/components/LazyPanels', () => ({
  LazyRequestsPanel: jest.requireActual('./src/features/events/components/RequestsPanel')
    .RequestsPanel,
  LazyAttendancePanel: jest.requireActual('./src/features/events/components/AttendancePanel')
    .AttendancePanel,
  LazyReviewPanel: jest.requireActual('./src/features/events/components/ReviewPanel').ReviewPanel,
}));
jest.mock('./src/features/events/components/LazyEventsMap', () => ({
  LazyEventsMap: jest.requireActual('./src/features/events/components/EventsMap').EventsMap,
}));
jest.mock('./src/features/profile/components/LazyAvatarScreen', () => ({
  LazyAvatarScreen: jest.requireActual('./src/features/profile/screens/AvatarScreen').AvatarScreen,
}));
jest.mock('./src/features/onboarding/LazyVerifyPhoneScreen', () => ({
  LazyVerifyPhoneScreen: jest.requireActual('./src/features/onboarding/screens/VerifyPhoneScreen')
    .VerifyPhoneScreen,
}));
jest.mock('./src/features/events/components/LazyEventStepper', () => ({
  LazyEventStepper: jest.requireActual('./src/features/events/components/EventStepper')
    .EventStepper,
}));
// Push (Phase 8 / M4): no native module in tests; permission undetermined, no token, nothing tapped.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'undetermined', canAskAgain: true }),
  ),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'denied', canAskAgain: false })),
  getExpoPushTokenAsync: jest.fn(() => Promise.reject(new Error('no token in tests'))),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
// The avatar (Phase 8 / M3) shows in the header of the main screens: without this every such test would call the real API.
// Tests about avatars override these with jest.requireMock(...).
jest.mock('./src/features/profile/api/avatar-api', () => ({
  fetchMyAvatar: jest.fn(() =>
    Promise.resolve({ displayName: null, gender: null, avatarKey: null, avatarPath: null }),
  ),
  setMyGender: jest.fn(() => Promise.resolve()),
  setMyAvatar: jest.fn(() => Promise.resolve()),
  setMyAvatarPhoto: jest.fn(() => Promise.resolve(null)),
  clearMyAvatarPhoto: jest.fn(() => Promise.resolve()),
  adminRemoveAvatarPhoto: jest.fn(() => Promise.resolve(null)),
  uploadAvatarPhoto: jest.fn((userId) => Promise.resolve(`${userId}/photo.jpg`)),
  deleteAvatarObjects: jest.fn(() => Promise.resolve()),
  listMyAvatarObjects: jest.fn(() => Promise.resolve([])),
  signAvatarUrl: jest.fn(() => Promise.resolve(null)),
}));
// The catalog kept on the device (load-catalog.ts) would carry one test's catalog into the next; component tests always
// start without it, and load-catalog.test.ts tests the keeping itself.
jest.mock('./src/features/catalog/catalog-cache', () => ({
  readCachedCatalog: () => Promise.resolve(null),
  writeCachedCatalog: () => Promise.resolve(),
}));
