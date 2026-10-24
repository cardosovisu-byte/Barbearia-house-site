import { configured, supabase } from "./supabase-client.js";
import { getCurrentMembership, getCurrentShop } from "./tenant.js";

export function initAuth() {
  const dialog = document.querySelector("#loginDialog");
  const loginForm = document.querySelector("#loginForm");
  const message = document.querySelector("#authMessage");
  const clientArea = document.querySelector("#clientArea");
  const vendorArea = document.querySelector("#vendorArea");
  const shopAdminArea = document.querySelector("#shopAdminArea");
  const setPasswordForm = document.querySelector("#setPasswordForm");
  const vendorShopList = document.querySelector("#vendorShopList");

  document.querySelector("#openLogin").addEventListener("click", () => dialog.showModal());
  document.querySelector("#closeLogin").addEventListener("click", () => dialog.close());

  const renderSession = (session, shop) => {
    clientArea.classList.toggle("hidden", !session);
    document.querySelector("#signedInAs").textContent = session ? session.user.email : "";
    document.querySelector("#dashboardLabel").textContent = shop ? "Painel da barbearia" : "Painel do administrador";
    document.querySelector("#dashboardShopName").textContent = shop?.name ?? "Barbearias";
    const linkType = `${window.location.hash}&${window.location.search}`;
    const needsPassword = Boolean(session) && /type=(invite|recovery)/.test(linkType);
    setPasswordForm.classList.toggle("hidden", !needsPassword);
    window.dispatchEvent(new CustomEvent("auth-state", { detail: { session, shop } }));
  };

  const loadVendorShops = async () => {
    const { data, error } = await supabase.from("barbershops")
      .select("id,name,slug,active")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    vendorShopList.innerHTML = data.length ? data.map((shop) => {
      const url = new URL(window.location.pathname, window.location.origin);
      url.searchParams.set("shop", shop.slug);
      return `<article class="card"><h3>${escapeText(shop.name)}</h3><p class="small">Acesso por tenant: ${escapeText(shop.slug)}</p><a class="button secondary" href="${escapeAttribute(url)}">Abrir vitrine</a></article>`;
    }).join("") : '<p class="muted">Nenhuma barbearia ativa cadastrada.</p>';
  };

  const refresh = async (session) => {
    if (!session || !configured) {
      vendorArea.classList.add("hidden");
      shopAdminArea.classList.add("hidden");
      renderSession(session, null);
      return;
    }

    const shop = await getCurrentShop();
    const membership = shop ? await getCurrentMembership(session, shop.id) : null;
    const { data: platformAdmin, error: adminError } = await supabase.from("platform_admins")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (adminError) throw adminError;

    shopAdminArea.classList.toggle("hidden", !membership);
    vendorArea.classList.toggle("hidden", !platformAdmin);
    renderSession(session, membership ? shop : null);
    if (platformAdmin) await loadVendorShops();
    if (!membership && !platformAdmin) {
      message.textContent = "Sua conta ainda não tem acesso. Use o link da barbearia enviado no convite ou fale com o administrador da plataforma.";
      message.classList.add("error");
      return;
    }
    message.textContent = "";
    message.classList.remove("error");
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      message.textContent = "A autenticação não está configurada. Consulte outputs/SETUP-AUTH.md.";
      message.classList.add("error");
      return;
    }
    const values = new FormData(loginForm);
    message.textContent = "Acessando...";
    message.classList.remove("error");
    const { error } = await supabase.auth.signInWithPassword({
      email: values.get("email"),
      password: values.get("password")
    });
    if (error) {
      message.textContent = error.message;
      message.classList.add("error");
      return;
    }
    dialog.close();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      message.textContent = `Falha ao abrir a sessão: ${sessionError.message}`;
      message.classList.add("error");
      return;
    }
    try {
      await refresh(session);
      clientArea.scrollIntoView({ behavior: "smooth" });
    } catch (refreshError) {
      message.textContent = `Falha ao carregar seu acesso: ${refreshError.message}`;
      message.classList.add("error");
    }
  });

  document.querySelector("#resetPassword").addEventListener("click", async () => {
    if (!configured) {
      message.textContent = "Configure o Supabase antes de solicitar a recuperação.";
      message.classList.add("error");
      return;
    }
    const email = new FormData(loginForm).get("email");
    if (!email) {
      message.textContent = "Informe seu e-mail para receber o link de recuperação.";
      message.classList.add("error");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname + window.location.search
    });
    message.textContent = error ? error.message : "Se a conta existir, enviaremos um link de recuperação.";
    message.classList.toggle("error", Boolean(error));
  });

  document.querySelector("#signOut").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      message.textContent = `Não foi possível sair: ${error.message}`;
      message.classList.add("error");
      return;
    }
    await refresh(null);
  });

  setPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordMessage = document.querySelector("#passwordMessage");
    const values = new FormData(setPasswordForm);
    if (values.get("password") !== values.get("password_confirmation")) {
      passwordMessage.textContent = "As senhas não conferem.";
      passwordMessage.classList.add("error");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: values.get("password") });
    if (error) {
      passwordMessage.textContent = `Não foi possível salvar a senha: ${error.message}`;
      passwordMessage.classList.add("error");
      return;
    }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    setPasswordForm.classList.add("hidden");
    setPasswordForm.reset();
    passwordMessage.textContent = "Senha salva. Seu acesso está pronto.";
    passwordMessage.classList.remove("error");
  });

  if (configured) {
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => refresh(session).catch((error) => {
        message.textContent = `Falha ao atualizar acesso: ${error.message}`;
        message.classList.add("error");
      }), 0);
    });
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) throw error;
      return refresh(session);
    }).catch((error) => {
      message.textContent = `Falha ao verificar a sessão: ${error.message}`;
      message.classList.add("error");
    });
  }

  document.querySelector("#inviteForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const inviteMessage = document.querySelector("#inviteMessage");
    if (!configured) {
      inviteMessage.textContent = "Configure o Supabase antes de enviar convites.";
      inviteMessage.classList.add("error");
      return;
    }
    const values = new FormData(event.currentTarget);
    inviteMessage.textContent = "Enviando convite...";
    inviteMessage.classList.remove("error");
    const { data, error } = await supabase.functions.invoke("invite-barbershop", {
      body: {
        name: values.get("name").trim(),
        email: values.get("email").trim(),
        slug: values.get("slug").trim().toLowerCase()
      }
    });
    if (error) {
      inviteMessage.textContent = `Não foi possível enviar o convite: ${error.message}`;
      inviteMessage.classList.add("error");
      return;
    }
    inviteMessage.textContent = data.message;
    event.currentTarget.reset();
    vendorShopList.replaceChildren();
    await loadVendorShops();
  });

  const slugInput = document.querySelector("#inviteForm").elements.slug;
  slugInput.addEventListener("input", () => {
    document.querySelector("#shopLinkPreview").textContent =
      `${window.location.origin}${window.location.pathname}?shop=${encodeURIComponent(slugInput.value || "slug-da-barbearia")}`;
  });
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = value ?? "";
  return element.innerHTML;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
