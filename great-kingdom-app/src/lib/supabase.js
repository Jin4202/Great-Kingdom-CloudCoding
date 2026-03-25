import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Sign in anonymously. Idempotent — reuses the existing session if one exists.
 * Returns the user's UUID, which is stored as blue_user or orange_user in rooms.
 *
 * After obtaining the session we explicitly call supabase.realtime.setAuth()
 * so that subsequent channel subscriptions use the correct user JWT.
 *
 * Without this, supabase-js fires onAuthStateChange asynchronously after
 * signInAnonymously() resolves. If a channel is subscribed before that
 * listener runs, the realtime client still holds the anon key, the channel
 * join fails RLS verification, and CHANNEL_ERROR fires immediately on every
 * first visit to the game room.
 */
export async function ensureAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    supabase.realtime.setAuth(session.access_token)
    return session.user
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  supabase.realtime.setAuth(data.session.access_token)
  return data.user
}
