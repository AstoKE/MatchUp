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
jest.mock('./src/features/events/components/LazyEventStepper', () => ({
  LazyEventStepper: jest.requireActual('./src/features/events/components/EventStepper')
    .EventStepper,
}));
