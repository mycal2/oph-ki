/**
 * Re-export Supabase client factories.
 * Use the specific imports directly for clarity:
 *   - @/lib/supabase/client  (browser)
 *   - @/lib/supabase/server  (server components, server actions, API routes)
 *   - @/lib/supabase/admin   (service role, server only)
 */
export { createClient as createBrowserClient } from "./supabase/client";
