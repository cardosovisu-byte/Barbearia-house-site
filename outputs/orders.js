import { configured, supabase } from "./supabase-client.js";
import { getCurrentShop, getCurrentMembership } from "./tenant.js";

const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initOrders() {
  const form = document.querySelector("#orderForm");
  const productSelect = form.elements.product_id;
  const cartElement = document.querySelector("#orderCart");
  const list = document.querySelector("#orderList");
  const notice = document.querySelector("#orderMessage");
  const addItemButton = document.querySelector("#addOrderItem");
  let shopId = null;
  let activeSession = null;
  let products = [];
  let cart = [];

  const setNotice = (text, error = false) => {
    notice.textContent = text;
    notice.classList.toggle("error", error);
  };

  const renderCart = () => {
    if (!cart.length) {
      cartElement.innerHTML = '<p class="muted">Adicione produtos para montar o pedido.</p>';
      return;
    }
    const total = cart.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.product_id);
      return sum + Number(product?.price ?? 0) * item.quantity;
    }, 0);
    cartElement.innerHTML = cart.map((item, index) => {
      const product = products.find((entry) => entry.id === item.product_id);
      return `<div class="order-line"><span>${escapeText(product?.name)} × ${item.quantity}</span><span>${money(Number(product?.price ?? 0) * item.quantity)} <button type="button" class="secondary" data-remove="${index}" aria-label="Remover item">×</button></span></div>`;
    }).join("") + `<div class="row"><strong>Total</strong><strong class="price">${money(total)}</strong></div>`;
    cartElement.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        cart.splice(Number(button.dataset.remove), 1);
        renderCart();
      });
    });
  };

  const loadProducts = async (currentShop) => {
    const { data, error } = await supabase.from("products")
      .select("id,name,price")
      .eq("barbershop_id", currentShop.id)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    products = data;
    productSelect.innerHTML = '<option value="">Selecione um produto</option>' + products.map((product) =>
      `<option value="${product.id}">${escapeText(product.name)} — ${money(product.price)}</option>`
    ).join("");
  };

  const loadOrders = async () => {
    if (!activeSession || !configured) {
      list.innerHTML = '<p class="muted">Entre com sua conta da barbearia para consultar os pedidos.</p>';
      return;
    }
    const shop = await getCurrentShop();
    if (!shop || !await getCurrentMembership(activeSession, shop.id)) {
      list.innerHTML = '<p class="muted">Sua conta não tem acesso aos pedidos desta barbearia.</p>';
      return;
    }
    shopId = shop.id;
    await loadProducts(shop);
    const { data, error } = await supabase.from("orders")
      .select("id,customer_name,customer_phone,status,total,created_at,order_items(product_name,quantity,line_total)")
      .eq("barbershop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    list.innerHTML = data.length ? data.map((order) => {
      const items = order.order_items.map((item) =>
        `<div class="order-line"><span>${escapeText(item.product_name)} × ${item.quantity}</span><span>${money(item.line_total)}</span></div>`
      ).join("");
      const actions = order.status === "pending"
        ? `<button type="button" class="secondary" data-status="completed" data-id="${order.id}">Marcar como concluído</button><button type="button" class="secondary" data-status="cancelled" data-id="${order.id}">Cancelar</button>`
        : order.status === "completed"
          ? `<button type="button" class="secondary" data-status="cancelled" data-id="${order.id}">Estornar venda</button>`
          : "";
      return `<article class="card stack"><div class="row"><strong>Pedido ${escapeText(order.id.slice(0, 8))}</strong><span>${escapeText(order.status)}</span></div><p class="small">${escapeText(order.customer_name || "Cliente não informado")} · ${escapeText(order.customer_phone || "Sem telefone")} · ${new Date(order.created_at).toLocaleString("pt-BR")}</p>${items}<div class="row"><strong>Total</strong><strong class="price">${money(order.total)}</strong></div><div class="actions">${actions}</div></article>`;
    }).join("") : '<p class="muted">Nenhum pedido cadastrado.</p>';
    list.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const { error: statusError } = await supabase.rpc("set_order_status", {
          p_order_id: button.dataset.id,
          p_status: button.dataset.status
        });
        if (statusError) {
          setNotice(`Não foi possível atualizar o pedido: ${statusError.message}`, true);
          return;
        }
        setNotice("Status do pedido atualizado.");
        await loadOrders();
      });
    });
  };

  addItemButton.addEventListener("click", () => {
    const productId = productSelect.value;
    const quantity = Number(form.elements.quantity.value);
    if (!products.some((product) => product.id === productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      setNotice("Selecione um produto e uma quantidade válida.", true);
      return;
    }
    const existing = cart.find((item) => item.product_id === productId);
    if (existing) {
      if (existing.quantity + quantity > 100) {
        setNotice("A quantidade máxima por produto é 100.", true);
        return;
      }
      existing.quantity += quantity;
    } else {
      cart.push({ product_id: productId, quantity });
    }
    renderCart();
    setNotice("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!activeSession || !shopId || !await getCurrentMembership(activeSession, shopId)) {
        throw new Error("Entre com uma conta autorizada da barbearia.");
      }
      if (!cart.length) throw new Error("Adicione ao menos um produto ao pedido.");
      const values = new FormData(form);
      const { error } = await supabase.rpc("create_order", {
        p_barbershop_id: shopId,
        p_customer_name: values.get("customer_name").trim(),
        p_customer_phone: values.get("customer_phone").trim(),
        p_items: cart
      });
      if (error) throw error;
      cart = [];
      form.reset();
      renderCart();
      setNotice("Pedido criado. Ao concluir, a entrada será lançada no caixa.");
      await loadOrders();
    } catch (error) {
      setNotice(error.message, true);
    }
  });

  window.addEventListener("auth-state", (event) => {
    activeSession = event.detail.session;
    loadOrders().catch((error) => {
      list.innerHTML = `<p class="notice error">Falha ao carregar pedidos: ${escapeText(error.message)}</p>`;
    });
  });
}
