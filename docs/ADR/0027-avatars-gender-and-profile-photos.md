# ADR-0027: Drawn avatars, a private gender, and profile photos in a private bucket

**Status:** Accepted (Phase 8 M3, 2026-11-07).

## Context

The founder asked for three things:
- an automatic avatar chosen by the person's first sport, from a set of drawings designed for women and for men;
- a gender question while filling in the profile;
- the avatar shown at the top left of the main screens, and the choice to switch drawings or use one's own photo.

Until now, `profiles.avatar_path` existed but was unused, and Storage was not set up.

## Decision

1. **Drawings.** There are 22 drawings: a general one and one per sport, in a women's set (`f-…`) and a men's set (`m-…`), plus `letters` (the initials).
   - They are bundled with the app as assets.
   - `profiles.avatar_key` holds the choice. A check constraint and `set_my_avatar` accept only these keys.
   - The key is readable like the display name.
2. **Gender is private.** `profiles.gender` is `FEMALE`, `MALE` or `UNDISCLOSED`.
   - It is asked in onboarding and is required there, but "rather not say" is one of the answers.
   - It can be changed from Edit profile.
   - It is **never** a readable column and never in another person's view, an export for someone else, analytics or a notification. Only `get_my_avatar` returns it, to its owner.
   - Its only use is to offer the matching set first (the other set is one tap away) and to pick the automatic drawing.
   - `complete_onboarding` keeps its signature for installed apps. The app sends the gender and the drawing in a second call (`set_my_gender`, `set_my_avatar`) before the account is re-read.
3. **Own photo** in the private bucket `avatars`, at `<user id>/<uuid>.jpg`.
   - The file is JPEG only, at most 1 MB.
   - The app prepares it before upload: library only, no camera; cropped square; 512 px; re-encoded as JPEG, which drops EXIF, location included.
   - The photo outranks the drawing.
   - Storage policies decide every access:
     - **upload:** only into one's own folder, as an active onboarded person, at most three objects at a time, never overwriting;
     - **read and signed URLs:** the owner, a second-factor administrator, or a signed-in person who is not blocked and may see the profile (visibility `EVERYONE`, or an event peer: the same rule as `get_player_card`). Others can read only the photo the profile currently points at;
     - **delete:** the owner, or a second-factor administrator.
   - `set_my_avatar_photo` checks the object exists in the caller's folder and allows 10 changes a day.
4. **Deleting bytes.** Supabase refuses to delete storage rows from SQL, and a row deleted that way would leave the file behind. So bytes are deleted only through the Storage API:
   - by the owner, when replacing or removing a photo, and **at the moment of requesting account deletion** (the deletion screen says so);
   - by an administrator in the console, after `admin_remove_avatar_photo` has cleared the reference and recorded the decision (`AVATAR_REMOVED`).

   The purge clears the gender, the key and the path. It cannot reach storage.
5. **New dependencies:** `expo-image-picker` and `expo-image-manipulator` (Expo SDK 58 versions, `npx expo install`). They are native modules, so a new development build is needed.
   - The picker's plugin is configured without camera or microphone permissions, and Android blocks both.
   - On the web, the avatar screen is a lazy chunk, so neither library is in the first load.

## Consequences

**Positive**
- People recognise each other in rosters and on event pages.
- Gender data stays with its owner.
- Photo access follows the profile rule that already exists, and is enforced by the database, not the app.

**Negative**
- Photos are user content that one operator must moderate (R-9). The levers are the report reasons that already exist, removal from the console, and suspension.
- A photo's bytes can outlive its reference if an upload is interrupted, or if an account is purged without the app having deleted the photo. Such bytes are unreadable through the API, and the app deletes leftovers in the folder at the next change. A server-side sweeper needs a service credential and is not built.
- Asking for gender is processing of personal data. Counsel must confirm the purpose wording and the Privacy Notice paragraph (LAUNCH_CHECKLIST §1, ⚖).
- The drawings are about 150 px. They are sharp in lists, but can look soft at the 96–112 pt profile size on dense screens; larger exports can replace them without code changes.
- On devices, the picker, the crop and the upload are unverified: iOS needs a new build, and Android cannot be tested on this machine.
