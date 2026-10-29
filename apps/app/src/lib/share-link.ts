import { Platform, Share } from 'react-native';

/**
 * Copies a link (web) or opens the system share sheet (native). No new dependency: the browser clipboard on
 * web, React Native's `Share` elsewhere. Returns what happened so the caller can say so in plain words.
 */
export async function shareLink(url: string): Promise<'copied' | 'shared' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
    const result = await Share.share({ message: url });
    return result.action === Share.sharedAction ? 'shared' : 'failed';
  } catch {
    return 'failed';
  }
}
