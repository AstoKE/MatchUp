import { DeleteAccountScreen } from '@/features/account';
import { deleteMyAvatarPhotoForDeletion } from '@/features/profile';

// Composed here: the account feature does not depend on the profile feature (the profile already uses the account's).
export default function DeleteAccount() {
  return <DeleteAccountScreen beforeRequest={deleteMyAvatarPhotoForDeletion} />;
}
