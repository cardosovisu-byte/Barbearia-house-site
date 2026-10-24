import { configured, supabase } from "./supabase-client.js";
import { getCurrentShop, getCurrentMembership } from "./tenant.js";

const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initProducts() {
  const catalog = document.querySelector("#productList");
  const manage = document.querySelector("#manageProducts");
  const form = document.querySelector("#productForm");
  const notice = document.querySelector("#productMessage");
  const saveButton = document.querySelector("#saveProduct");
  const cancelEditButton = document.querySelector("#cancelProductEdit");
  let shopId = null;
  let activeSession = null;

  const loadCatalog = async () => {
    if (!configured) return;
    const shop = await getCurrentShop();
    if (!shop) {
      catalog.innerHTML = '<p class="muted">Barbearia não encontrada ou inativa.</p>';
      return;
    }
    shopId = shop.id;
    const { data, error } = await supabase.from("products")
      .select("id,name,description,price")
      .eq("barbershop_id", shop.id)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    catalog.innerHTML = data.length ? data.map((item) =>
      `<article class="card"><h3>${escapeText(item.name)}</h3><p class="muted">${escapeText(item.description)}</p><div class="price">${money(item.price)}</div></article>`
    ).join("") : '<p class="muted">Nenhum produto cadastrado.</p>';
    await loadManage();
  };

  const loadManage = async () => {
    if (!activeSession || !shopId || !await getCurrentMembership(activeSession, shopId)) {
      manage.replaceChildren();
      return;
    }
    const { data, error } = await supabase.from("products")
      .select("id,name,description,price,active")
      .eq("barbershop_id", shopId)
      .order("name");
    if (error) throw error;
    manage.innerHTML = data.map((item) =>
      `<article class="card"><h3>${escapeText(item.name)}</h3><p class="muted">${escapeText(item.description)}</p><div class="row"><span class="price">${money(item.price)}</span><span class="small">${item.active ? "Ativo" : "Oculto"}</span></div><div class="actions"><button type="button" class="secondary" data-edit="${item.id}">Editar</button><button type="button" class="secondary" data-toggle="${item.id}" data-active="${item.active}">${item.active ? "Ocultar da vitrine" : "Publicar"}</button></div></article>`
    ).join("") || '<p class="muted">Você ainda não cadastrou produtos.</p>';

    manage.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = data.find((item) => item.id === button.dataset.edit);
        if (!product) return;
        form.elements.product_id.value = product.id;
        form.elements.name.value = product.name;
        form.elements.price.value = product.price;
        form.elements.description.value = product.description ?? "";
        form.elements.active.checked = product.active;
        saveButton.textContent = "Salvar alterações";
        cancelEditButton.classList.remove("hidden");
        form.scrollIntoView({ behavior: "smooth" });
      });
    });
    manage.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", async () => {
        const { error: updateError } = await supabase.from("products")
          .update({ active: button.dataset.active !== "true" })
          .eq("id", button.dataset.toggle)
          .eq("barbershop_id", shopId);
        if (updateError) {
          setNotice(`Não foi possível alterar o produto: ${updateError.message}`, true);
          return;
        }
        await loadCatalog();
      });
    });
  };

  const setNotice = (text, isError = false) => {
    notice.textContent = text;
    notice.classList.toggle("error", isError);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured || !activeSession) {
      setNotice("Entre com uma conta autorizada da barbearia.", true);
      return;
    }
    try {
      if (!shopId || !await getCurrentMembership(activeSession, shopId)) {
        throw new Error("Sua conta não tem acesso a esta barbearia.");
      }
      const values = new FormData(form);
      const product = {
        barbershop_id: shopId,
        name: values.get("name").trim(),
        description: values.get("description").trim(),
        price: Number(values.get("price")),
        active: form.elements.active.checked
      };
      const productId = values.get("product_id");
      const { error } = productId
        ? await supabase.from("products").update(product).eq("id", productId).eq("barbershop_id", shopId)
        : await supabase.from("products").insert(product);
      if (error) throw error;
      form.reset();
      form.elements.active.checked = true;
      saveButton.textContent = "Adicionar produto";
      cancelEditButton.classList.add("hidden");
      setNotice(productId ? "Produto atualizado." : "Produto cadastrado.");
      await loadCatalog();
    } catch (error) {
      setNotice(error.message, true);
    }
  });

  cancelEditButton.addEventListener("click", () => {
    form.reset();
    form.elements.active.checked = true;
    saveButton.textContent = "Adicionar produto";
    cancelEditButton.classList.add("hidden");
    setNotice("");
  });

  window.addEventListener("auth-state", (event) => {
    activeSession = event.detail.session;
    loadManage().catch((error) => setNotice(`Falha ao carregar produtos: ${error.message}`, true));
  });
  loadCatalog().catch((error) => {
    catalog.innerHTML = `<p class="notice error">Falha ao carregar produtos: ${escapeText(error.message)}</p>`;
  });
}
