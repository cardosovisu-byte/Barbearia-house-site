import { configured, supabase } from "./supabase-client.js";
import { getCurrentShop, getCurrentMembership } from "./tenant.js";

const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initServices() {
  const form = document.querySelector("#serviceForm");
  const list = document.querySelector("#manageServices");
  const notice = document.querySelector("#serviceMessage");
  const saveButton = document.querySelector("#saveService");
  const cancelButton = document.querySelector("#cancelServiceEdit");
  const templates = document.querySelector("#serviceTemplates");
  let shopId = null;
  let activeSession = null;

  const setNotice = (text, error = false) => {
    notice.textContent = text;
    notice.classList.toggle("error", error);
  };

  const load = async () => {
    if (!configured || !activeSession) {
      list.replaceChildren();
      return;
    }
    const shop = await getCurrentShop();
    if (!shop) throw new Error("Barbearia não encontrada ou inativa.");
    shopId = shop.id;
    if (!await getCurrentMembership(activeSession, shopId)) {
      list.innerHTML = '<p class="muted">Sua conta não tem acesso a esta barbearia.</p>';
      return;
    }
    const { data, error } = await supabase.from("services")
      .select("id,name,description,price,duration_minutes,active")
      .eq("barbershop_id", shop.id)
      .order("name");
    if (error) throw error;
    list.innerHTML = data.map((service) =>
      `<article class="card"><h3>${escapeText(service.name)}</h3><p class="muted">${escapeText(service.description)}</p><div class="row"><span class="price">${money(service.price)}</span><span class="small">${service.duration_minutes} min · ${service.active ? "Ativo" : "Oculto"}</span></div><div class="actions"><button type="button" class="secondary" data-edit="${service.id}">Editar</button><button type="button" class="secondary" data-toggle="${service.id}" data-active="${service.active}">${service.active ? "Ocultar da vitrine" : "Publicar"}</button></div></article>`
    ).join("") || '<p class="muted">Nenhum serviço cadastrado.</p>';

    list.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const service = data.find((item) => item.id === button.dataset.edit);
        if (!service) return;
        form.elements.service_id.value = service.id;
        form.elements.name.value = service.name;
        form.elements.price.value = service.price;
        form.elements.duration_minutes.value = service.duration_minutes;
        form.elements.description.value = service.description ?? "";
        form.elements.active.checked = service.active;
        saveButton.textContent = "Salvar alterações";
        cancelButton.classList.remove("hidden");
        form.scrollIntoView({ behavior: "smooth" });
      });
    });
    list.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        const { error: updateError } = await supabase.from("services")
          .update({ active: button.dataset.active !== "true" })
          .eq("id", button.dataset.toggle)
          .eq("barbershop_id", shop.id);
        if (updateError) {
          setNotice(`Não foi possível atualizar o serviço: ${updateError.message}`, true);
          return;
        }
        await load();
      });
    });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const shop = await getCurrentShop();
      if (!shop || !activeSession || !await getCurrentMembership(activeSession, shop.id)) {
        throw new Error("Entre com uma conta autorizada da barbearia.");
      }
      shopId = shop.id;
      const values = new FormData(form);
      const service = {
        barbershop_id: shopId,
        name: values.get("name").trim(),
        description: values.get("description").trim(),
        price: Number(values.get("price")),
        duration_minutes: Number(values.get("duration_minutes")),
        active: form.elements.active.checked
      };
      const serviceId = values.get("service_id");
      const { error } = serviceId
        ? await supabase.from("services").update(service).eq("id", serviceId).eq("barbershop_id", shopId)
        : await supabase.from("services").insert(service);
      if (error) throw error;
      form.reset();
      form.elements.active.checked = true;
      saveButton.textContent = "Adicionar serviço";
      cancelButton.classList.add("hidden");
      setNotice(serviceId ? "Serviço atualizado." : "Serviço cadastrado.");
      await load();
    } catch (error) {
      setNotice(error.message, true);
    }
  });

  cancelButton.addEventListener("click", () => {
    form.reset();
    form.elements.active.checked = true;
    saveButton.textContent = "Adicionar serviço";
    cancelButton.classList.add("hidden");
    setNotice("");
  });
  templates.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service-template]");
    if (!button) return;
    form.elements.service_id.value = "";
    form.elements.name.value = button.dataset.serviceTemplate;
    saveButton.textContent = "Adicionar serviço";
    cancelButton.classList.add("hidden");
    form.scrollIntoView({ behavior: "smooth" });
    form.elements.price.focus();
  });
  window.addEventListener("auth-state", (event) => {
    activeSession = event.detail.session;
    load().catch((error) => setNotice(`Falha ao carregar serviços: ${error.message}`, true));
  });
}
