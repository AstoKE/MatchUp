import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Native: writes the export to the app's private cache and opens the share sheet so the user decides
 * where it goes. Overwritten by the next export; other apps cannot read the cache directly.
 */
export async function saveExport(fileName: string, json: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(json);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: fileName,
  });
}
