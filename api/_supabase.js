import { createClient } from "@supabase/supabase-js";

export function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function getValue(key, fallback) {
  const { data, error } = await db().from("app_data").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : fallback;
}

export async function setValue(key, value) {
  const { error } = await db().from("app_data").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
