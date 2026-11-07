import {
  AppError,
  GENDERS,
  isAvatarKey,
  mapRpcError,
  type AvatarKey,
  type Gender,
} from '@matchup/domain';
import { Platform } from 'react-native';
import * as z from 'zod/mini';
import { env } from '@/lib/env';
import { newRequestId } from '@/lib/request-id';
import { supabase } from '@/lib/supabase/client';

/**
 * Phase 8 / M3 (ADR-0027): the person's avatar and photo. The RPCs hold the rules; the photo's bytes go through the
 * Storage REST API with the person's token (the storage client is not in the web bundle, PERFORMANCE §3.7), and the
 * bucket's policies decide who may upload, read and delete.
 */
export interface MyAvatar {
  /** For the initials when there is no picture. */
  displayName: string | null;
  gender: Gender | null;
  avatarKey: AvatarKey | null;
  avatarPath: string | null;
}

const myAvatarRow = z.object({
  gender: z.nullable(z.enum(GENDERS)),
  avatar_key: z.nullable(z.string()),
  avatar_path: z.nullable(z.string()),
  display_name: z.nullable(z.string()),
});

export async function fetchMyAvatar(): Promise<MyAvatar> {
  const { data, error } = await supabase.rpc('get_my_avatar');
  if (error) throw mapRpcError(error);
  const row = myAvatarRow.parse(data);
  return {
    displayName: row.display_name,
    gender: row.gender,
    avatarKey: isAvatarKey(row.avatar_key) ? row.avatar_key : null,
    avatarPath: row.avatar_path,
  };
}

export async function setMyGender(gender: Gender): Promise<void> {
  const { error } = await supabase.rpc('set_my_gender', { p_gender: gender });
  if (error) throw mapRpcError(error);
}

/** A drawing (or the letters). It replaces a photo, whose bytes the caller deletes first. */
export async function setMyAvatar(key: AvatarKey): Promise<void> {
  const { error } = await supabase.rpc('set_my_avatar', { p_avatar_key: key });
  if (error) throw mapRpcError(error);
}

/** Points the profile at an uploaded photo; returns the photo it replaced, if any. */
export async function setMyAvatarPhoto(path: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_my_avatar_photo', { p_path: path });
  if (error) throw mapRpcError(error);
  return z.nullable(z.string()).parse(data);
}

export async function clearMyAvatarPhoto(): Promise<void> {
  const { error } = await supabase.rpc('clear_my_avatar_photo');
  if (error) throw mapRpcError(error);
}

/** Moderation: clears a person's photo and returns its path, for the console to delete the bytes. */
export async function adminRemoveAvatarPhoto(userId: string, note: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('admin_remove_avatar_photo', {
    p_user_id: userId,
    p_note: note,
  });
  if (error) throw mapRpcError(error);
  return z.nullable(z.string()).parse(data);
}

// ---- Storage REST ----------------------------------------------------------------------------------------------------

const BUCKET = 'avatars';

async function storageFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AppError('NOT_AUTHENTICATED');
  try {
    return await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1${path}`, {
      ...init,
      headers: {
        apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new AppError('NETWORK', { cause });
  }
}

function newPhotoName(userId: string): string {
  return `${userId}/${newRequestId()}.jpg`;
}

/**
 * Uploads a prepared JPEG (a local file or blob URI from the photo picker) into the person's folder and returns its
 * name. The web sends the bytes; native sends the file as a form part, the way React Native uploads files.
 */
export async function uploadAvatarPhoto(userId: string, uri: string): Promise<string> {
  const name = newPhotoName(userId);
  let init: RequestInit;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    init = { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob };
  } else {
    const form = new FormData();
    // React Native's FormData takes a file as { uri, name, type }.
    form.append('file', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as unknown as Blob);
    init = { method: 'POST', body: form };
  }
  const response = await storageFetch(`/object/${BUCKET}/${name}`, init);
  if (!response.ok) {
    throw new AppError(response.status === 413 ? 'VALIDATION_FAILED' : 'NOT_ALLOWED');
  }
  return name;
}

/** Deletes objects; the policy silently skips any the caller may not delete. */
export async function deleteAvatarObjects(names: readonly string[]): Promise<void> {
  if (names.length === 0) return;
  const response = await storageFetch(`/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: names }),
  });
  if (!response.ok) throw new AppError('UNKNOWN');
}

const listed = z.array(z.object({ name: z.string() }));

/** Every object in the person's own folder (left behind by an interrupted replace, for instance). */
export async function listMyAvatarObjects(userId: string): Promise<string[]> {
  const response = await storageFetch(`/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }),
  });
  if (!response.ok) throw new AppError('UNKNOWN');
  return listed
    .parse(await response.json())
    .map((o) => `${userId}/${o.name}`)
    .filter((name) => name.endsWith('.jpg'));
}

const signedRow = z.object({ signedURL: z.string() });

/** A short-lived URL for a photo the caller may see; null when the policy says no (the drawing is shown instead). */
export async function signAvatarUrl(path: string): Promise<string | null> {
  const response = await storageFetch(`/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!response.ok) return null;
  const parsed = signedRow.safeParse(await response.json());
  if (!parsed.success) return null;
  return `${env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1${parsed.data.signedURL}`;
}
