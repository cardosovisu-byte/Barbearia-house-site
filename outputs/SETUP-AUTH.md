# Configuração do Supabase

Este projeto usa uma chave pública Publishable no navegador e Row Level Security (RLS) para separar os dados de cada barbearia. Nunca coloque uma chave Secret, `service_role`, senha ou token privado em `outputs`.

## Preparação

1. Crie um projeto Supabase.
2. Copie `supabase-config.js.example` para `supabase-config.js` e preencha Project URL, chave Publishable e o slug da barbearia.
3. No SQL Editor, execute `supabase/schema.sql` e depois `supabase/booking.sql`.
4. Em Authentication → Users, crie sua conta de plataforma. Adicione seu UUID:

   ```sql
   insert into public.platform_admins(user_id)
   values ('UUID-DA-CONTA-DO-DESENVOLVEDOR');
   ```

5. Configure SMTP próprio em Supabase Auth e adicione o domínio HTTPS do site às URLs permitidas.
6. Publique o site; teste login, cadastro de produtos e agendamento com contas de teste antes de usar dados reais.

## Acesso de clientes/barbearias

O dono da plataforma deve convidar o cliente por e-mail através da Edge Function `invite-barbershop`. O link abre o slug da barbearia e permite que o cliente defina a própria senha antes de entrar em **Área do cliente** para cadastrar e editar produtos e preços. Não compartilhe credenciais nem solicite a senha do cliente.

Após o convite, o endereço da vitrine pode ser compartilhado no formato `https://SEU-SITE.onrender.com/?shop=slug-da-barbearia`. Cada slug aponta para um catálogo separado.

Implante da raiz do projeto:

```sh
supabase functions deploy invite-barbershop
supabase secrets set SITE_URL=https://SEU-SITE.onrender.com
```

Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` como secrets da função; essas variáveis nunca devem ser adicionadas aos arquivos públicos. A function verifica que o chamador autenticado é `platform_admin` antes de convidar e criar barbearia/membership.

## Reservas

`booking.sql` expõe disponibilidade sem nome/telefone e registra reservas como `requested`. A restrição de exclusão impede sobreposição mesmo em solicitações simultâneas. O horário do banco é interpretado em `America/Sao_Paulo`; o horário de funcionamento do formulário é demonstrativo (09h–18h). Expediente, folgas e bloqueios precisam ser configurados antes do uso real. Notificações e pagamento não estão integrados.
