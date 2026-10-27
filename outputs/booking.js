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
  form.querySelector('[type="submit"]').textContent = "Solicitar pelo WhatsApp";
  if (!configured) return;

  let shopId;
  let shopWhatsappPhone = "";
  const settingsForm = document.createElement("form");
  settingsForm.id = "shopWhatsappSettingsForm";
  settingsForm.className = "panel stack hidden";
  settingsForm.innerHTML = `
    <h3>Configurações da barbearia</h3>
    <p class="small">Cadastre o WhatsApp comercial depois de criar a barbearia. Use o código do país e o DDD; por exemplo, 55 + DDD + número.</p>
    <label>WhatsApp comercial<input name="whatsapp_phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" placeholder="5511999999999"></label>
    <div class="actions"><button type="submit">Salvar WhatsApp</button><span class="notice" data-whatsapp-settings-message role="status"></span></div>
  `;
  const passwordForm = document.querySelector("#setPasswordForm");
  if (passwordForm) passwordForm.insertAdjacentElement("afterend", settingsForm);
  const settingsMessage = settingsForm.querySelector("[data-whatsapp-settings-message]");
  const settingsPhoneInput = settingsForm.elements.whatsapp_phone;
  let activeShop = null;

  window.addEventListener("auth-state", async (event) => {
    activeShop = event.detail.shop;
    settingsForm.classList.toggle("hidden", !activeShop);
    if (!activeShop) return;

    const { data, error } = await supabase.from("barbershops")
      .select("whatsapp_phone")
      .eq("id", activeShop.id)
      .maybeSingle();
    if (error) {
      settingsMessage.textContent = `Falha ao carregar o WhatsApp: ${error.message}`;
      settingsMessage.classList.add("error");
      return;
    }
    settingsPhoneInput.value = data?.whatsapp_phone ?? "";
    settingsMessage.textContent = "";
    settingsMessage.classList.remove("error");
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeShop) {
      settingsMessage.textContent = "Entre com uma conta autorizada da barbearia.";
      settingsMessage.classList.add("error");
      return;
    }

    const phone = settingsPhoneInput.value.replace(/\D/g, "");
    if (phone && (phone.length < 10 || phone.length > 15)) {
      settingsMessage.textContent = "Informe o número com código do país e DDD, contendo de 10 a 15 dígitos.";
      settingsMessage.classList.add("error");
      return;
    }

    const saveButton = settingsForm.querySelector('[type="submit"]');
    saveButton.disabled = true;
    settingsMessage.textContent = "Salvando...";
    settingsMessage.classList.remove("error");
    const { error } = await supabase.rpc("set_barbershop_whatsapp", {
      p_barbershop_id: activeShop.id,
      p_whatsapp_phone: phone || null
    });
    saveButton.disabled = false;
    if (error) {
      settingsMessage.textContent = `Não foi possível salvar o WhatsApp: ${error.message}`;
      settingsMessage.classList.add("error");
      return;
    }
    shopWhatsappPhone = phone;
    settingsPhoneInput.value = phone;
    settingsMessage.textContent = phone
      ? "WhatsApp salvo. Os clientes poderão enviar pedidos para este número."
      : "Número removido. O envio pelo WhatsApp está desativado.";
  });

  const loadServices = async () => {
    const { data: shop, error: shopError } = await supabase.from("barbershops").select("id,whatsapp_phone")
      .eq("slug", BARBERSHOP_SLUG).eq("active", true).maybeSingle();
    if (shopError) throw shopError;
    if (!shop) return;
    shopId = shop.id;
    shopWhatsappPhone = shop.whatsapp_phone ?? "";
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
  form.addEventListener("input", () => {
    if (message.querySelector("a")) message.replaceChildren();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!shopWhatsappPhone) {
      showError("A barbearia ainda não cadastrou o WhatsApp comercial. Entre em contato com a equipe.");
      return;
    }
    try {
      const values = new FormData(form);
      const serviceName = serviceSelect.selectedOptions[0].textContent;
      const customerName = values.get("customer_name").trim();
      const customerPhone = values.get("customer_phone").trim();
      const bookingDate = values.get("booking_date");
      const startTime = values.get("start_time");
      const notes = values.get("notes").trim();
      const { error } = await supabase.rpc("book_appointment", {
        p_barbershop_id: shopId,
        p_service_id: values.get("service_id"),
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_start_at: `${bookingDate}T${startTime}:00`,
        p_notes: notes || null
      });
      if (error) throw error;

      const requestText = [
        "Olá! Gostaria de solicitar este horário (aguardando confirmação):",
        `Nome: ${customerName}`,
        `Telefone: ${customerPhone}`,
        `Serviço: ${serviceName}`,
        `Data: ${bookingDate}`,
        `Horário: ${startTime}`,
        notes ? `Observações: ${notes}` : ""
      ].filter(Boolean).join("\n");
      const whatsappLink = document.createElement("a");
      whatsappLink.href = `https://wa.me/${shopWhatsappPhone}?text=${encodeURIComponent(requestText)}`;
      whatsappLink.target = "_blank";
      whatsappLink.rel = "noopener noreferrer";
      whatsappLink.textContent = "Abrir conversa e enviar pedido pelo WhatsApp";
      whatsappLink.className = "button secondary";
      message.replaceChildren(
        document.createTextNode("Solicitação registrada e aguardando confirmação. Ela ainda não foi enviada pelo WhatsApp; use o link para abrir a conversa e enviar: "),
        whatsappLink
      );
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
  message.textContent = error.message ?? error;
  message.classList.add("error");
}
