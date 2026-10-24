import { configured, supabase } from "./supabase-client.js";
import { getCurrentShop, getCurrentMembership } from "./tenant.js";

const money = (value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const escapeText = (value) => {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
};

export function initCash() {
  const form = document.querySelector("#cashForm");
  const list = document.querySelector("#cashList");
  const notice = document.querySelector("#cashMessage");
  form.elements.occurred_on.value = localDate();
  let shopId = null;
  let activeSession = null;

  const setNotice = (text, error = false) => {
    notice.textContent = text;
    notice.classList.toggle("error", error);
  };

  const load = async () => {
    if (!configured || !activeSession) {
      list.innerHTML = '<p class="muted">Entre com sua conta da barbearia para consultar o caixa.</p>';
      return;
    }
    const shop = await getCurrentShop();
    if (!shop || !await getCurrentMembership(activeSession, shop.id)) {
      list.innerHTML = '<p class="muted">Sua conta não tem acesso ao caixa desta barbearia.</p>';
      return;
    }
    shopId = shop.id;
    const { data, error } = await supabase.from("cash_transactions")
      .select("id,kind,category,description,amount,occurred_on,order_id")
      .eq("barbershop_id", shop.id)
      .order("occurred_on", { ascending: false })
      .limit(250);
    if (error) throw error;
    const month = localDate().slice(0, 7);
    const { data: summary, error: summaryError } = await supabase.rpc("get_cash_month_summary", {
      p_barbershop_id: shop.id,
      p_month: `${month}-01`
    });
    if (summaryError) throw summaryError;
    const income = Number(summary[0]?.income ?? 0);
    const expenses = Number(summary[0]?.expenses ?? 0);
    document.querySelector("#cashIncome").textContent = money(income);
    document.querySelector("#cashExpenses").textContent = money(expenses);
    document.querySelector("#cashBalance").textContent = money(income - expenses);
    list.innerHTML = data.length ? data.map((entry) =>
      `<article class="card"><div class="row"><strong>${escapeText(entry.category)}</strong><span class="price">${entry.kind === "expense" ? "−" : "+"}${money(entry.amount)}</span></div><p class="small">${escapeText(entry.description)} · ${entry.occurred_on} · ${entry.order_id ? "Venda vinculada a pedido" : "Lançamento manual"}</p>${entry.order_id ? "" : `<button type="button" class="secondary" data-delete="${entry.id}">Excluir lançamento</button>`}</article>`
    ).join("") : '<p class="muted">Nenhuma movimentação registrada neste caixa.</p>';
    list.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!window.confirm("Excluir esta movimentação manual?")) return;
        const { error: deleteError } = await supabase.from("cash_transactions")
          .delete().eq("id", button.dataset.delete).eq("barbershop_id", shop.id);
        if (deleteError) {
          setNotice(`Não foi possível excluir: ${deleteError.message}`, true);
          return;
        }
        await load();
      });
    });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if (!activeSession || !shopId || !await getCurrentMembership(activeSession, shopId)) {
        throw new Error("Entre com uma conta autorizada da barbearia.");
      }
      const values = new FormData(form);
      const { error } = await supabase.from("cash_transactions").insert({
        barbershop_id: shopId,
        kind: values.get("kind"),
        category: values.get("category").trim(),
        description: values.get("description").trim(),
        amount: Number(values.get("amount")),
        occurred_on: values.get("occurred_on")
      });
      if (error) throw error;
      form.reset();
      form.elements.occurred_on.value = localDate();
      setNotice("Movimentação registrada.");
      await load();
    } catch (error) {
      setNotice(error.message, true);
    }
  });

  window.addEventListener("auth-state", (event) => {
    activeSession = event.detail.session;
    load().catch((error) => {
      list.innerHTML = `<p class="notice error">Falha ao carregar caixa: ${escapeText(error.message)}</p>`;
    });
  });
}
