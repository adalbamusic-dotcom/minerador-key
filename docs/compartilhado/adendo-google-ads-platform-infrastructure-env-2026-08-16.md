# Adendo arquitetural — Google Ads como infraestrutura da Plataforma

**Data:** 2026-08-24 (revisão da rotação OAuth)
**Módulo proprietário:** Plataforma / Google Ads  
**Classificação:** decisão aprovada para implementação local; rotação do OAuth implementada localmente

## Decisão

Google Ads continua sendo `PLATFORM_INFRASTRUCTURE`, com configuração estática
server-side e segredo operacional separado. A fonte canônica server-side da
configuração estática é o conjunto:

- `GOOGLE_ADS_DEVELOPER_TOKEN`;
- `GOOGLE_ADS_CLIENT_ID`;
- `GOOGLE_ADS_CLIENT_SECRET`;
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`;
- `GOOGLE_ADS_RESEARCH_CUSTOMER_ID`.

A versão da API continua fixa na allowlist canônica do cliente server-side;
ela não é um campo editável da UI.

O ambiente local usa `.env.local`; a produção usa Environment Variables da
Vercel. Nenhuma variável é pública. O `GOOGLE_ADS_REFRESH_TOKEN`, quando
mantido para o smoke CLI manual/bootstrap local, não é autoridade operacional
nem fallback do produto.

O resolver operacional único é `resolveGoogleAdsPlatformConfig()` em
`lib/server/google-ads-canonical.ts`: ele lê a configuração estática do ENV,
busca a Connection global de produção, resolve `secret_ref` pelo Secret Store
server-side e falha explicitamente quando a referência, o segredo ou a
configuração estática não estão disponíveis. Não existe fallback do Secret
Store para ENV. `getGoogleAdsPlatformConfig()` permanece somente como builder
compatível para fixtures/configurações explicitamente injetadas; não lê o
refresh token do ENV.

Discovery, Metrics, health check e o endpoint de conexão da Brand usam o
resolver canônico. O refresh token fica no Secret Store; somente a referência
sanitizada fica na Connection, e nunca é retornado à UI. Tabelas e dados
legados permanecem preservados para auditoria e limpeza posterior pelo Planner
Geral.

## Fronteiras preservadas

- `actorUserId`, `agencyId` e `brandId` continuam no contexto da requisição;
- `brandId` continua dono dos dados persistidos pelo Minerador;
- Research Customer ID é conta global da Plataforma para Keyword Planner;
- Customer ID específico de Brand permanece reservado para operações futuras de conta publicitária;
- DataForSEO e OpenRouter permanecem `GOVERNABLE_CONNECTIONS`;
- o modelo OpenRouter continua configuração persistida independente;
- não houve migration, alteração estrutural de banco ou alteração de grants.

## Administração e health check

Google Ads permanece visível no Admin como status de infraestrutura. Developer
Token, Client ID, Client Secret, Login Customer ID, Research Customer ID e a
versão da API são somente leitura e continuam server-side. O único campo
mutável é o novo OAuth Refresh Token: o formulário envia `refreshToken` apenas
para a rota protegida por Admin global, cria uma nova referência no Secret
Store, atualiza o ponteiro da Connection e deixa o lifecycle `pending`.
O segredo atual nunca é lido pela UI, retornado ou gravado em coluna pública.

Salvar/rotacionar não chama o provider. “Testar conexão” é uma ação explícita;
resolve o segredo pelo Secret Store, autentica OAuth, chama
`listAccessibleCustomers` e valida o Login Customer ID e o Research Customer
ID. O estado de sucesso da UI só é exibido depois do readback sanitizado.

## Uso e auditoria

As tabelas operacionais do Minerador continuam registrando `actor_user_id`, `brand_id`, `operation_request_id` e request-id sanitizado do provider. O ledger genérico `integration_usage_events` exige `connection_id` não nulo por contrato atual; portanto não foi fabricado um identificador para representar env nem feita alteração de schema. Esse é um gap explícito para o desenho posterior de Usage de infraestrutura.

## Estado local

O código, a UI e os testes locais foram atualizados. A rotação remota, a
execução do health check e qualquer chamada real ao provider continuam ações
manuais; nenhuma operação remota foi executada nesta revisão. A resolução
operacional permanece bloqueada de forma explícita quando a Connection ou o
Secret Store não estiverem configurados.

`SCHEMA_CHANGE_REQUIRED = NO`  
`DATABASE_SCHEMA_CHANGED = NO`
