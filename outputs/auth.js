import { configured, supabase } from "./supabase-client.js";

export function initAuth() {
  const dialog = document.querySelector("#loginDialog");
  const loginForm = document.querySelector("#loginForm");
  const message = document.querySelector("#authMessage");
  const clientArea = document.querySelector("#clientArea");
  const vendorArea = document.querySelector("#vendorArea");
  const setPasswordForm = document.querySelector("#setPasswordForm");

  document.querySelector("#openLogin").addEventListener("click", () => dialog.showModal());
  document.querySelector("#closeLogin").addEventListener("click", () => dialog.close());

  const renderSession = (session) => {
    clientArea.classList.toggle("hidden", !session);
    document.querySelector("#signedInAs").textContent = session ? session.user.email : "";
    const linkType = `${window.location.hash}&${window.location.search}`;
    const needsPassword = Boolean(session) && /type=(invite|recovery)/.test(linkType);
    setPasswordForm.classList.toggle("hidden", !needsPassword);
    window.dispatchEvent(new CustomEvent("auth-state", { detail: { session } }));
  };

  const showVendorArea = async (session) => {
    if (!session) {
      vendorArea.classList.add("hidden");
      return;
    }
    const { data, error } = await supabase.from("platform_admins").select("user_id")
      .eq("user_id", session.user.id).maybeSingle();
    if (error) throw error;
    vendorArea.classList.toggle("hidden", !data);
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!configured) {
      message.textContent = "A integração ainda não foi configurada. Consulte SETUP-AUTH.md.";
      message.classList.add("error");
      return;
    }
    const data = new FormData(loginForm);
    message.textContent = "Acessando...";
    message.classList.remove("error");
    const { error } = await supabase.auth.signInWithPassword({
      email: data.get("email"),
      password: data.get("password")
    });
    if (error) {
      message.textContent = error.message;
      message.classList.add("error");
      return;
    }
    message.textContent = "";
    dialog.close();
    const { data: { session } } = await supabase.auth.getSession();
    renderSession(session);
    await showVendorArea(session);
    clientArea.scrollIntoView({ behavior: "smooth" });
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
      window.alert(`Não foi possível sair: ${error.message}`);
      return;
    }
    renderSession(null);
    vendorArea.classList.add("hidden");
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
    const refresh = async (session) => {
      renderSession(session);
      try {
        await showVendorArea(session);
      } catch (error) {
        message.textContent = `Falha ao verificar permissões: ${error.message}`;
        message.classList.add("error");
      }
    };
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => refresh(session), 0);
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
  });

  const slugInput = document.querySelector("#inviteForm").elements.slug;
  slugInput.addEventListener("input", () => {
    document.querySelector("#shopLinkPreview").textContent =
      `${window.location.origin}${window.location.pathname}?shop=${encodeURIComponent(slugInput.value || "slug-da-barbearia")}`;
  });
}
