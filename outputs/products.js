import { BARBERSHOP_SLUG } from "./supabase-config.js";
import { configured, supabase } from "./supabase-client.js";

const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

async function getShopId() {
  const { data, error } = await supabase.from("barbershops").select("id")
    .eq("slug", BARBERSHOP_SLUG).eq("active", true).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export function initProducts() {
  const catalog = document.querySelector("#productList");
  const manage = document.querySelector("#manageProducts");
  const form = document.querySelector("#productForm");
  const notice = document.querySelector("#productMessage");
  const saveButton = document.querySelector("#saveProduct");
  const cancelEditButton = document.querySelector("#cancelProductEdit");
  let shopId = null;

  const load = async () => {
    if (!configured) return;
    shopId = await getShopId();
    if (!shopId) {
      catalog.innerHTML = '<p class="muted">A barbearia ainda não foi configurada.</p>';
      return;
    }
    const { data, error } = await supabase.from("products").select("id,name,description,price")
      .eq("barbershop_id", shopId).eq("active", true).order("name");
    if (error) throw error;
    catalog.innerHTML = data.length ? data.map((item) =>
      `<article class="card"><h3>${escapeText(item.name)}</h3><p class="muted">${escapeText(item.description)}</p><div class="price">${money(item.price)}</div></article>`
    ).join("") : '<p class="muted">Nenhum produto cadastrado.</p>';
    await loadManage();
  };

  const loadManage = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !shopId) {
      manage.replaceChildren();
      return;
    }
    const { data, error } = await supabase.from("products")
      .select("id,name,description,price,active").eq("barbershop_id", shopId).order("name");
    if (error) throw error;
    manage.innerHTML = data.map((item) =>
      `<article class="card"><h3>${escapeText(item.name)}</h3><p>${escapeText(item.description)}</p><div class="row"><span class="price">${money(item.price)}</span><div class="actions"><button class="secondary" data-edit="${item.id}">Editar</button><button class="secondary" data-delete="${item.id}">Excluir</button></div></div></article>`
    ).join("") || '<p class="muted">Você ainda não cadastrou produtos.</p>';
    manage.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", async () => {
        const product = data.find((item) => item.id === button.dataset.edit);
        if (!product) return;
        form.elements.product_id.value = product.id;
        form.elements.name.value = product.name;
        form.elements.price.value = product.price;
        form.elements.description.value = product.description ?? "";
        saveButton.textContent = "Salvar alterações";
        cancelEditButton.classList.remove("hidden");
        form.scrollIntoView({ behavior: "smooth" });
      });
    });
    manage.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Excluir este produto da vitrine?")) return;
        const { error: deleteError } = await supabase.from("products")
          .delete().eq("id", button.dataset.delete).eq("barbershop_id", shopId);
        if (deleteError) {
          notice.textContent = `Não foi possível excluir: ${deleteError.message}`;
          notice.classList.add("error");
          return;
        }
        await load();
      });
    });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      notice.textContent = "Configure o Supabase antes de cadastrar produtos.";
      notice.classList.add("error");
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Entre na área da barbearia para cadastrar produtos.");
      if (!shopId) shopId = await getShopId();
      if (!shopId) throw new Error("Barbearia não encontrada ou inativa.");
      const values = new FormData(form);
      const product = {
        barbershop_id: shopId,
        name: values.get("name").trim(),
        description: values.get("description").trim(),
        price: Number(values.get("price")),
        active: true
      };
      const productId = values.get("product_id");
      const { error } = productId
        ? await supabase.from("products").update(product).eq("id", productId).eq("barbershop_id", shopId)
        : await supabase.from("products").insert(product);
      if (error) throw error;
      form.reset();
      saveButton.textContent = "Adicionar produto";
      cancelEditButton.classList.add("hidden");
      notice.textContent = "Produto cadastrado.";
      notice.classList.remove("error");
      await load();
    } catch (error) {
      notice.textContent = error.message;
      notice.classList.add("error");
    }
  });

  cancelEditButton.addEventListener("click", () => {
    form.reset();
    saveButton.textContent = "Adicionar produto";
    cancelEditButton.classList.add("hidden");
    notice.textContent = "";
  });

  window.addEventListener("auth-state", () => loadManage().catch((error) => {
    notice.textContent = `Falha ao carregar seus produtos: ${error.message}`;
    notice.classList.add("error");
  }));
  load().catch((error) => {
    catalog.innerHTML = `<p class="notice error">Falha ao carregar produtos: ${escapeText(error.message)}</p>`;
  });
}
