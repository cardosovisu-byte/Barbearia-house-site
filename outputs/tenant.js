import { BARBERSHOP_SLUG } from "./supabase-config.js";
import { configured, supabase } from "./supabase-client.js";

export async function getCurrentShop() {
  if (!configured) return null;
  const { data, error } = await supabase.from("barbershops")
    .select("id,name,slug,active")
    .eq("slug", BARBERSHOP_SLUG)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const brand = document.querySelector("#shopBrand");
    const footerBrand = document.querySelector("#footerBrand");
    if (brand) brand.textContent = data.name.toLocaleUpperCase("pt-BR");
    if (footerBrand) footerBrand.textContent = data.name;
    document.title = `${data.name} | Barbearias`;
  }
  return data;
}

export async function getCurrentMembership(session, shopId) {
  if (!configured || !session || !shopId) return null;
  const { data, error } = await supabase.from("memberships")
    .select("barbershop_id,user_id,role")
    .eq("barbershop_id", shopId)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireShopMembership(session) {
  const shop = await getCurrentShop();
  if (!shop) throw new Error("Esta barbearia não está cadastrada ou está inativa.");
  const membership = await getCurrentMembership(session, shop.id);
  if (!membership) throw new Error("Sua conta não tem acesso a esta barbearia.");
  return { shop, membership };
}
