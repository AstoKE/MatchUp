import type { DrawnAvatarKey } from '@matchup/domain';
import type { ImageSourcePropType } from 'react-native';

/**
 * The drawn avatars (docs/PHASE8_PLAN.md M3; the founder's set, 2026-11-07), cropped square from the design's circle crop.
 * Static requires: each picture is bundled once, as an asset (the web loads it on demand, outside the JavaScript).
 */
export const avatarImages: Record<DrawnAvatarKey, ImageSourcePropType> = {
  'm-general': require('../../../assets/avatars/m-general.png'),
  'm-football': require('../../../assets/avatars/m-football.png'),
  'm-futsal': require('../../../assets/avatars/m-futsal.png'),
  'm-basketball': require('../../../assets/avatars/m-basketball.png'),
  'm-volleyball': require('../../../assets/avatars/m-volleyball.png'),
  'm-tennis': require('../../../assets/avatars/m-tennis.png'),
  'm-padel': require('../../../assets/avatars/m-padel.png'),
  'm-badminton': require('../../../assets/avatars/m-badminton.png'),
  'm-table-tennis': require('../../../assets/avatars/m-table-tennis.png'),
  'm-running': require('../../../assets/avatars/m-running.png'),
  'm-walking': require('../../../assets/avatars/m-walking.png'),
  'f-general': require('../../../assets/avatars/f-general.png'),
  'f-football': require('../../../assets/avatars/f-football.png'),
  'f-futsal': require('../../../assets/avatars/f-futsal.png'),
  'f-basketball': require('../../../assets/avatars/f-basketball.png'),
  'f-volleyball': require('../../../assets/avatars/f-volleyball.png'),
  'f-tennis': require('../../../assets/avatars/f-tennis.png'),
  'f-padel': require('../../../assets/avatars/f-padel.png'),
  'f-badminton': require('../../../assets/avatars/f-badminton.png'),
  'f-table-tennis': require('../../../assets/avatars/f-table-tennis.png'),
  'f-running': require('../../../assets/avatars/f-running.png'),
  'f-walking': require('../../../assets/avatars/f-walking.png'),
};
