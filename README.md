# Barbearias

Site responsivo de barbearia com catálogo por slug, autenticação Supabase, área para cadastro de produtos e formulário de agendamento.

## Arquivos principais

- `server.js` — servidor HTTP, configuração por ambiente, arquivos estáticos e endpoint de saúde.
- `package.json` — scripts e versão mínima do Node.js.
- `public/index.html` — página da barbearia.
- `public/styles.css` — visual preto e dourado.
- `public/app.js` — inicializa as funcionalidades da interface.
- `.env.example` — modelo de configuração local.
- `outputs/` — módulos existentes da interface, SQL e Edge Function Supabase.

## Executar localmente

Instale Node.js 20 ou superior, copie `.env.example` para `.env` se desejar configurar o Supabase e execute:

```sh
npm start
```

Sem `PORT`, o servidor escolhe uma porta livre e informa o endereço no terminal. O endpoint `/healthz` responde com o estado do servidor. Variáveis em `.env` são lidas localmente; no Render configure os valores em **Environment → Environment Variables**.

## Publicação

O Render usa `render.yaml` para manter a prévia estática atual e criar em paralelo o novo serviço Node `barbearias`. Após validar a versão Node, a versão estática antiga pode ser removida pelo painel do Render.

Para ativar login, catálogo persistente, convites e agendamentos, preencha `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `BARBERSHOP_SLUG`. Siga [outputs/SETUP-AUTH.md](outputs/SETUP-AUTH.md) para executar SQL, configurar Auth/SMTP e implantar a Edge Function. Nunca coloque uma chave `service_role` ou Secret no site.

Loja/pagamentos, notificações e expediente configurável ainda não estão integrados.
