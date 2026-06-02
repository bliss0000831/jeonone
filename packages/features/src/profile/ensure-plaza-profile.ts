import type { SupabaseClient } from "@supabase/supabase-js"

export async function ensurePlazaProfile(
  supabase: SupabaseClient | any,
  userId: string,
  plazaId: string,
): Promise<void> {
  await (supabase as any).from("plaza_profiles").upsert(
    { user_id: userId, plaza_id: plazaId, account_type: "user", is_active: true },
    { onConflict: "user_id,plaza_id", ignoreDuplicates: true },
  )
}
