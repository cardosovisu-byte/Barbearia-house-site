// Configure with the project's public Supabase URL and publishable key.
// Never place a Secret or service_role key in a browser file.
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
const configuredSlug = "vintage-house";
export const BARBERSHOP_SLUG = new URLSearchParams(window.location.search).get("shop") || configuredSlug;
