import type { AvatarKey, Gender } from '@matchup/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import {
  clearMyAvatarPhoto,
  deleteAvatarObjects,
  fetchMyAvatar,
  listMyAvatarObjects,
  setMyAvatar,
  setMyAvatarPhoto,
  setMyGender,
  signAvatarUrl,
  uploadAvatarPhoto,
} from './api/avatar-api';

const myAvatarKey = (userId: string | null) => ['my-avatar', userId] as const;

function useUserId(): string | null {
  const session = useSession();
  return session.status === 'authenticated' ? session.userId : null;
}

/** The signed-in person's gender, drawing and photo; idle for guests. */
export function useMyAvatar() {
  const userId = useUserId();
  return useQuery({
    queryKey: myAvatarKey(userId),
    queryFn: fetchMyAvatar,
    enabled: userId !== null,
  });
}

/** A signed URL for a photo, kept a little shorter than it lives (an hour); null when the viewer may not see it. */
export function useAvatarPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar-url', path],
    queryFn: () => signAvatarUrl(path as string),
    enabled: typeof path === 'string',
    staleTime: 45 * 60_000,
  });
}

/** After any change: re-read the own avatar and every view that shows a person. */
function useAvatarInvalidation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-avatar'] }),
      queryClient.invalidateQueries({ queryKey: ['player'] }),
      queryClient.invalidateQueries({ queryKey: ['event'] }),
    ]);
}

export function useSetGender() {
  const invalidate = useAvatarInvalidation();
  return useMutation({
    mutationFn: (gender: Gender) => setMyGender(gender),
    onSuccess: invalidate,
  });
}

/** Deletes every photo in the own folder except `keep` (a replaced photo, or one left by an interrupted upload). */
async function cleanFolder(userId: string, keep: string | null) {
  const names = await listMyAvatarObjects(userId);
  await deleteAvatarObjects(names.filter((name) => name !== keep));
}

/** A drawing (or the letters): the photo, if any, is deleted first, then the profile points at the drawing. */
export function useChooseAvatar() {
  const userId = useUserId();
  const invalidate = useAvatarInvalidation();
  return useMutation({
    mutationFn: async (key: AvatarKey) => {
      if (userId) await cleanFolder(userId, null);
      await setMyAvatar(key);
    },
    onSuccess: invalidate,
  });
}

/** Upload, point the profile at the new photo, then delete the old one (the order keeps a photo shown throughout). */
export function useUploadAvatarPhoto() {
  const userId = useUserId();
  const invalidate = useAvatarInvalidation();
  return useMutation({
    mutationFn: async (uri: string) => {
      if (!userId) throw new Error('signed out');
      // A folder holds at most three objects: clear leftovers from an interrupted change first.
      const current = (await fetchMyAvatar()).avatarPath;
      await cleanFolder(userId, current);
      const name = await uploadAvatarPhoto(userId, uri);
      try {
        await setMyAvatarPhoto(name);
      } catch (error) {
        await deleteAvatarObjects([name]).catch(() => undefined);
        throw error;
      }
      await cleanFolder(userId, name).catch(() => undefined);
      return name;
    },
    onSuccess: invalidate,
  });
}

/** Removes the photo (the bytes, then the reference); the drawing shows again. */
export function useRemoveAvatarPhoto() {
  const userId = useUserId();
  const invalidate = useAvatarInvalidation();
  return useMutation({
    mutationFn: async () => {
      if (userId) await cleanFolder(userId, null);
      await clearMyAvatarPhoto();
    },
    onSuccess: invalidate,
  });
}

/** For an account deletion: the photo's bytes go now (the purge cannot reach storage, ADR-0027). */
export async function deleteMyAvatarPhotoForDeletion(userId: string): Promise<void> {
  await cleanFolder(userId, null);
  await clearMyAvatarPhoto();
}
