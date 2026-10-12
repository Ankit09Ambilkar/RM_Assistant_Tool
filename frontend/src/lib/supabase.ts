// Supabase Auth client. Configured from frontend/.env.local:
//   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (the publishable key is safe in the browser).
// When they are missing, the app falls back to the old demo sign-in (pick an RM, any password).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null

export const authConfigured = supabase !== null

/** Current access token (refreshed automatically by supabase-js), or null when signed out / not configured. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}
