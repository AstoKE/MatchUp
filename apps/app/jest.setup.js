// Test-only public configuration. These are NOT real credentials (the key is a syntactically valid
// placeholder, not a Supabase-issued token).
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-placeholder-not-a-secret';
process.env.EXPO_PUBLIC_WEB_URL = 'http://localhost:8081';
