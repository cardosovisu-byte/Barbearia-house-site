import { BARBERSHOP_SLUG } from "./supabase-config.js";
import { configured, supabase } from "./supabase-client.js";

const form = document.querySelector("#bookingForm");
const message = document.querySelector("#bookingMessage");
const serviceSelect = form.elements.service_id;
const dateInput = form.elements.booking_date;
const timeSelect = form.elements.start_time;
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initBooking() {
  dateInput.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  if (!configured) return;

  let shopId;
  const loadServices = async () => {
    const { data: shop, error: shopError } = await supabase.from("barbershops").select("id")
      .eq("slug", BARBERSHOP_SLUG).eq("active", true).maybeSingle();
    if (shopError) throw shopError;
    if (!shop) return;
    shopId = shop.id;
    const { data, error } = await supabase.from("services").select("id,name,description,price,duration_minutes")
      .eq("barbershop_id", shopId).eq("active", true).order("name");
    if (error) throw error;
    document.querySelector("#serviceList").innerHTML = data.length
      ? data.map((service) => `<article class="card"><h3>${escapeText(service.name)}</h3><p class="muted">${escapeText(service.description)}</p><div class="price">${Number(service.price).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</div><p class="small">${service.duration_minutes} min</p></article>`).join("")
      : '<p class="muted">Nenhum serviço cadastrado.</p>';
    serviceSelect.innerHTML = '<option value="">Selecione um serviço</option>' + data.map((service) =>
      `<option value="${service.id}" data-duration="${service.duration_minutes}">${escapeText(service.name)} — ${Number(service.price).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</option>`
    ).join("");
  };

  const loadSlots = async () => {
    timeSelect.innerHTML = '<option value="">Carregando horários...</option>';
    const serviceId = serviceSelect.value;
    const date = dateInput.value;
    if (!serviceId || !date || !shopId) {
      timeSelect.innerHTML = '<option value="">Selecione serviço e data</option>';
      return;
    }
    const { data: busy, error } = await supabase.rpc("get_busy_slots", {
      p_barbershop_id: shopId,
      p_day: date
    });
    if (error) throw error;
    const selected = serviceSelect.selectedOptions[0];
    const duration = Number(selected.dataset.duration);
    const starts = [];
    for (let minutes = 9 * 60; minutes < 18 * 60; minutes += 30) {
      const endMinutes = minutes + duration;
      if (endMinutes > 18 * 60) continue;
      const start = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
      const overlaps = (busy ?? []).some((slot) => start < slot.end_time && end > slot.start_time);
      if (!overlaps) starts.push(start);
    }
    timeSelect.innerHTML = starts.length
      ? '<option value="">Selecione um horário</option>' + starts.map((time) => `<option>${time}</option>`).join("")
      : '<option value="">Sem horários disponíveis</option>';
  };

  serviceSelect.addEventListener("change", () => loadSlots().catch(showError));
  dateInput.addEventListener("change", () => loadSlots().catch(showError));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const values = new FormData(form);
      const { error } = await supabase.rpc("book_appointment", {
        p_barbershop_id: shopId,
        p_service_id: values.get("service_id"),
        p_customer_name: values.get("customer_name").trim(),
        p_customer_phone: values.get("customer_phone").trim(),
        p_start_at: `${values.get("booking_date")}T${values.get("start_time")}:00`,
        p_notes: values.get("notes").trim() || null
      });
      if (error) throw error;
      message.textContent = "Solicitação enviada. A barbearia entrará em contato para confirmar.";
      message.classList.remove("error");
      form.reset();
      timeSelect.innerHTML = '<option value="">Selecione serviço e data</option>';
    } catch (error) {
      showError(error);
    }
  });
  loadServices().catch((error) => {
    document.querySelector("#serviceList").innerHTML = `<p class="notice error">Falha ao carregar serviços: ${escapeText(error.message)}</p>`;
  });
}

function showError(error) {
  message.textContent = error.message;
  message.classList.add("error");
}
