import { createClient } from '@/lib/supabase/server'

export async function canManageOutlookIntegration(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data: role, error } = await supabase.rpc('get_user_role')
  return !error && role === 'admin'
}
