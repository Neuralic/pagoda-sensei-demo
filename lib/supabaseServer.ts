// import { createClient, SupabaseClient } from '@supabase/supabase-js';

// let cached: SupabaseClient | null = null;

// export function getSupabaseServer(): SupabaseClient {
// 	if (cached) return cached;
// 	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// 	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// 	if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl) || !serviceRoleKey) {
// 		throw new Error('Supabase environment variables are not configured');
// 	}
// 	cached = createClient(supabaseUrl, serviceRoleKey);
// 	return cached;
// }





import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
	if (cached) return cached;

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!url || !key) {
		throw new Error('Supabase environment variables are not configured');
	}

	cached = createClient(url, key);
	return cached;
}
