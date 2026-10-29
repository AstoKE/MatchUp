// Web-only stand-ins for @supabase/realtime-js and @supabase/storage-js (see ../metro.config.js).
// supabase-js constructs both clients eagerly, so the modules cannot simply be empty, but the app uses
// neither: notifications are polled (ADR-0019) and there are no file uploads yet. Whatever the app might
// call by mistake fails loudly instead of silently doing nothing.
const unused = (what) => () => {
  throw new Error(`${what} is not available in the web bundle (apps/app/metro.config.js)`);
};

class RealtimeClient {
  // supabase-js hands the access token over on every auth change; there is no socket to give it to.
  setAuth() {
    return Promise.resolve();
  }
  getChannels() {
    return [];
  }
  channel = unused('Supabase Realtime');
  removeChannel = unused('Supabase Realtime');
  removeAllChannels = unused('Supabase Realtime');
}

class StorageClient {}
class StorageApiError extends Error {}

module.exports = { RealtimeClient, StorageClient, StorageApiError };
