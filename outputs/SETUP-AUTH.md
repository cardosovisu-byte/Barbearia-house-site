# Configuração do Supabase

Este projeto usa uma chave pública Publishable no navegador e Row Level Security (RLS) para separar os dados de cada barbearia. Nunca coloque uma chave Secret, `service_role`, senha ou token privado em `outputs`.

## Preparação

1. Crie um projeto Supabase.
2. Copie `supabase-config.js.example` para `supabase-config.js` e preencha Project URL, chave Publishable e o slug da barbearia.
3. No SQL Editor, execute nesta ordem: `supabase/schema.sql`, `supabase/booking.sql` e `supabase/admin.sql`.
4. Em Authentication → Users, crie/convide a sua conta de administrador da plataforma. Use o UUID dessa conta para conceder o acesso de vendedor:

   ```sql
   insert into public.platform_admins(user_id)
   values ('UUID-DA-SUA-CONTA')
   on conflict (user_id) do nothing;
   ```

5. Configure SMTP próprio em Supabase Auth e adicione o domínio HTTPS do site às URLs permitidas.
6. Em Environment → Environment Variables no Render, configure `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Configure o mesmo Project URL no runtime seguro da Edge Function.
7. Publique o site; teste login, isolamento entre contas, cadastro de produtos/serviços, pedidos, caixa e agendamento com contas de teste antes de usar dados reais.

## Acesso de clientes/barbearias

O dono da plataforma entra com a conta que foi incluída em `platform_admins`. Esse perfil de vendedor pode convidar barbearias e consultar seus links. Cada dono de barbearia recebe uma conta Auth independente e só vê o painel do slug ao qual tem membership. O convite abre o slug certo e permite ao cliente definir a própria senha. Não compartilhe credenciais nem solicite a senha do cliente.

Após o convite, o endereço da vitrine pode ser compartilhado no formato `https://SEU-SITE.onrender.com/?shop=slug-da-barbearia`. Cada slug aponta para um catálogo separado.

Implante da raiz do projeto:

```sh
supabase functions deploy invite-barbershop
supabase secrets set SITE_URL=https://SEU-SITE.onrender.com
```

Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` como secrets da função; essas variáveis nunca devem ser adicionadas aos arquivos públicos. A function verifica que o chamador autenticado é `platform_admin` antes de convidar e criar barbearia/membership.

## Painel administrativo

A aba **Serviços** permite criar, editar e ocultar/publicar serviços. A aba **Produtos** faz o mesmo para o catálogo; itens usados em pedidos são ocultados em vez de apagados, preservando o histórico. A aba **Pedidos** registra pedidos manuais com preço calculado no banco e permite concluir ou cancelar; concluir cria automaticamente uma entrada no caixa e estornar cria uma saída de estorno. A aba **Caixa** registra entradas/despesas manuais, exibe até 250 movimentações recentes e calcula o resumo mensal diretamente no banco. Agenda, produtos, serviços, pedidos e caixa são vinculados à barbearia do `?shop=slug` e protegidos por membership/RLS.

`admin.sql` é uma migração para os projetos já criados: não apague os dados existentes; execute-a uma vez depois dos dois SQLs anteriores. Pedidos não processam pagamentos e não controlam estoque.

## Reservas

`booking.sql` expõe disponibilidade sem nome/telefone e registra reservas como `requested`. A restrição de exclusão impede sobreposição mesmo em solicitações simultâneas. O horário do banco é interpretado em `America/Sao_Paulo`; o horário de funcionamento do formulário é demonstrativo (09h–18h). Expediente, folgas e bloqueios precisam ser configurados antes do uso real. Notificações e pagamento não estão integrados.
