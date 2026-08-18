# Adendo arquitetural — Google Ads como infraestrutura da Plataforma

**Data:** 2026-08-16  
**Módulo proprietário:** Plataforma / Google Ads  
**Classificação:** decisão aprovada para implementação local

## Decisão

Google Ads é `PLATFORM_INFRASTRUCTURE_ENV`. A fonte canônica exclusiva server-side é o conjunto:

- `GOOGLE_ADS_DEVELOPER_TOKEN`;
- `GOOGLE_ADS_CLIENT_ID`;
- `GOOGLE_ADS_CLIENT_SECRET`;
- `GOOGLE_ADS_REFRESH_TOKEN`;
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`;
- `GOOGLE_ADS_RESEARCH_CUSTOMER_ID`.

O ambiente local usa `.env.local`; a produção usa Environment Variables da Vercel. Nenhuma variável é pública.

O resolver único é `getGoogleAdsPlatformConfig()`. Ele lê exclusivamente `process.env`, exige as seis variáveis, normaliza MCC e Research Customer ID para dez dígitos e mantém os segredos server-side.

Não existe fallback entre env, Connection, Vault, metadata, binding, grant, entitlement ou quota no runtime ativo de Discovery/Metrics. Tabelas e dados legados permanecem preservados para auditoria e limpeza posterior pelo Planner Geral.

## Fronteiras preservadas

- `actorUserId`, `agencyId` e `brandId` continuam no contexto da requisição;
- `brandId` continua dono dos dados persistidos pelo Minerador;
- Research Customer ID é conta global da Plataforma para Keyword Planner;
- Customer ID específico de Brand permanece reservado para operações futuras de conta publicitária;
- DataForSEO e OpenRouter permanecem `GOVERNABLE_CONNECTIONS`;
- o modelo OpenRouter continua configuração persistida independente;
- não houve migration, alteração estrutural de banco ou alteração de grants.

## Administração e health check

Google Ads permanece visível no Admin somente como status de infraestrutura. A UI não edita credenciais, MCC ou Research Customer ID. “Testar conexão” usa env server-side, autentica OAuth, chama `listAccessibleCustomers` e valida o Login Customer ID e o Research Customer ID. Valores sensíveis nunca são retornados.

## Uso e auditoria

As tabelas operacionais do Minerador continuam registrando `actor_user_id`, `brand_id`, `operation_request_id` e request-id sanitizado do provider. O ledger genérico `integration_usage_events` exige `connection_id` não nulo por contrato atual; portanto não foi fabricado um identificador para representar env nem feita alteração de schema. Esse é um gap explícito para o desenho posterior de Usage de infraestrutura.

## Estado local

O código e os testes locais foram atualizados. O `.env.local` encontrado no checkout ainda não possui `GOOGLE_ADS_RESEARCH_CUSTOMER_ID`; os smokes reais Discovery/Metrics permanecem bloqueados até essa variável ser adicionada e o servidor ser reiniciado.

`SCHEMA_CHANGE_REQUIRED = NO`  
`DATABASE_SCHEMA_CHANGED = NO`
