# Vintage House

Prévia estática responsiva da barbearia, com catálogo multiempresa, área autenticada para cadastro de produtos e preços, convite de clientes por e-mail e solicitação de agendamentos.

## Abrir localmente

Os módulos JavaScript precisam de HTTP; não abra `outputs/index.html` diretamente via `file://`.

```powershell
py -m http.server 8000 --directory outputs
```

Acesse `http://localhost:8000`. Para usar autenticação, vitrine persistente ou reservas, configure o Supabase seguindo [outputs/SETUP-AUTH.md](outputs/SETUP-AUTH.md).

## O que está preparado

- Site público em `outputs/`, com serviços, produtos e formulário de agendamento.
- Link da vitrine selecionado pelo parâmetro `?shop=slug`.
- Painel do vendedor para convidar uma barbearia; o cliente define a própria senha e administra os produtos e preços.
- SQL de tabelas, políticas RLS e prevenção de sobreposição de reservas.
- Configuração Render em `render.yaml`.

O Supabase ainda precisa de credenciais públicas, execução dos SQLs, SMTP e implantação da Edge Function. Loja/pagamentos, notificações, expediente configurável e operações completas de caixa/pedidos não estão implementados.