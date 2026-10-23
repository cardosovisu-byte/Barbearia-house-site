import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  const authorization = request.headers.get("Authorization");
  if (!url || !serviceKey || !siteUrl || !authorization) {
    return json({ error: "Configuração ou autenticação ausente." }, 500);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const caller = createClient(url, serviceKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await caller.auth.getUser();
  if (userError || !user) return json({ error: "Sessão inválida." }, 401);

  const { data: platformAdmin, error: roleError } = await admin
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (roleError) return json({ error: "Falha ao verificar permissão." }, 500);
  if (!platformAdmin) return json({ error: "Apenas administradores da plataforma podem convidar clientes." }, 403);

  let input: { email?: string; name?: string; slug?: string };
  try {
    input = await request.json();
  } catch {
    return json({ error: "Corpo JSON inválido." }, 400);
  }
  const email = input.email?.trim().toLowerCase();
  const name = input.name?.trim();
  const slug = input.slug?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !name || name.length > 120
    || !slug || slug.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({ error: "Informe e-mail, nome e slug válidos." }, 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("barbershops").select("id").eq("slug", slug).maybeSingle();
  if (existingError) return json({ error: "Falha ao verificar slug." }, 500);
  if (existing) return json({ error: "Este slug já está em uso." }, 409);

  const inviteRedirect = new URL(siteUrl);
  inviteRedirect.searchParams.set("shop", slug);
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirect.toString(),
    data: { barbershop_name: name, barbershop_slug: slug },
  });
  if (inviteError || !invitation.user) {
    return json({ error: inviteError?.message ?? "Não foi possível enviar o convite." }, 400);
  }

  const { data: shop, error: shopError } = await admin
    .from("barbershops").insert({ name, slug }).select("id").single();
  if (shopError) {
    return json({ error: `Convite enviado, mas não foi possível criar a barbearia: ${shopError.message}` }, 500);
  }
  const { error: membershipError } = await admin.from("memberships").insert({
    barbershop_id: shop.id,
    user_id: invitation.user.id,
    role: "owner",
  });
  if (membershipError) {
    return json({ error: `Barbearia criada, mas não foi possível atribuir o acesso: ${membershipError.message}` }, 500);
  }
  return json({ message: "Convite enviado. O cliente poderá definir a própria senha.", barbershop_id: shop.id }, 201);
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
