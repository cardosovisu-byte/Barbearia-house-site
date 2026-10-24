# Barbearias

Plataforma responsiva para várias barbearias, com acesso independente por tenant, catálogo público por slug, agenda, serviços, produtos, pedidos e caixa.

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

Para ativar login, catálogo persistente, convites, pedidos, caixa e agendamentos, preencha `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `BARBERSHOP_SLUG`. Siga [outputs/SETUP-AUTH.md](outputs/SETUP-AUTH.md) para executar os SQLs, habilitar seu próprio acesso de administrador da plataforma, configurar Auth/SMTP e implantar a Edge Function. Nunca coloque uma chave `service_role` ou Secret no site.

Pedidos são lançamentos administrativos manuais; pagamentos/checkout, estoque, notificações e expediente configurável ainda não estão integrados. O painel multi-tenant só fica ativo depois de configurar o Supabase e conceder membership/admin.
