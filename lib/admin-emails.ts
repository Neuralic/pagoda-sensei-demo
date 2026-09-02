import { getSupabaseServer } from "@/lib/supabaseServer";

/** Active admin notification emails from the `admin` table. */
export async function getActiveAdminEmails(): Promise<string[]> {
  const supabase = getSupabaseServer();
  const { data: admins } = await supabase.from("admin").select("email").eq("is_active", true);
  return (admins || [])
    .map((a: { email?: string }) => a?.email?.trim())
    .filter((e): e is string => Boolean(e));
}
