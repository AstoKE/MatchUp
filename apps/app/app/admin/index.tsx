import { Redirect } from 'expo-router';

// The phone app has no console: `index.web.tsx` is the page, and this fallback only exists because the router wants one
// file without a platform extension. Nothing of the console is bundled here.
export default function Admin() {
  return <Redirect href="/" />;
}
