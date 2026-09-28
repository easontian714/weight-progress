import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://eehroaunwvltcchrwocr.supabase.co",
  "sb_publishable_vdYBIgEmwnEhOU9zR2jmUg_ZlcbFRBf",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
