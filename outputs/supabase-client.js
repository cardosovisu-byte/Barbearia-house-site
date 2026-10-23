import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

export const configured = !SUPABASE_URL.includes("YOUR-PROJECT")
  && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE");
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
