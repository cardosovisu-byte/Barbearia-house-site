import { BARBERSHOP_SLUG } from "./supabase-config.js";
import { configured, supabase } from "./supabase-client.js";

const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initCalendar() {
  const list = document.querySelector("#appointmentList");
  const load = async (session) => {
    if (!session) {
      list.innerHTML = '<p class="muted">Entre para consultar os agendamentos.</p>';
      return;
    }
    if (!configured) return;
    const { data: shop, error: shopError } = await supabase.from("barbershops").select("id")
      .eq("slug", BARBERSHOP_SLUG).maybeSingle();
    if (shopError) throw shopError;
    if (!shop) {
      list.innerHTML = '<p class="muted">Barbearia não encontrada.</p>';
      return;
    }
    const { data, error } = await supabase.from("appointments")
      .select("id,customer_name,customer_phone,start_at,status,services(name)")
      .eq("barbershop_id", shop.id).in("status", ["requested", "confirmed"])
      .gte("start_at", new Date().toISOString()).order("start_at").limit(100);
    if (error) throw error;
    list.innerHTML = data.length ? data.map((item) => {
      const when = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo"
      }).format(new Date(item.start_at));
      const service = Array.isArray(item.services) ? item.services[0]?.name : item.services?.name;
      return `<article class="card"><div class="row"><strong>${escapeText(item.customer_name)}</strong><span>${when}</span></div><p class="muted">${escapeText(service)} · ${escapeText(item.customer_phone)} · ${escapeText(item.status)}</p></article>`;
    }).join("") : '<p class="muted">Nenhum agendamento futuro.</p>';
  };

  window.addEventListener("auth-state", (event) => load(event.detail.session).catch((error) => {
    list.innerHTML = `<p class="notice error">Falha ao carregar agenda: ${escapeText(error.message)}</p>`;
  }));
}
