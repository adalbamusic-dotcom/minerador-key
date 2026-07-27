# ADR-021 — tenant explícito em rotas operacionais por `brandRef`

## Status

Decisão aceita e implementada.

Tenant canônico: `brandId = public.marcas.id`. A rota canônica usa `brandRef`.

## Data

2026-07-27

## Módulos afetados

Todos os módulos tenantizados, Admin e Extensão.

## Contexto

### Consolidacao emergencial - 2026-07-23

A decisao operacional vigente usa uma unica arvore `app/(brand)/[brandRef]`. O segmento combina slug decorativo e `marcas.id`; nao ha paginas concorrentes em `[brandId]`, `[brandUserId]`, `(workspace)` ou `_legacy`. As rotas sao finas e consomem APIs publicas de `modules/<area>`.

### BrandRef legível — 2026-07-23

O slug não substitui o tenant. A URL usa um único segmento brandSlug--brandId; apenas o UUID é usado na resolução, autorização, consultas, caches e RLS. Renomear a marca produz redirect para o slug atual, sem mudar a identidade ou os dados.

### Extração da árvore antiga — 2026-07-23

As rotas canônicas deixaram de importar pages de app/(workspace). A implementação funcional pertence a `modules/`; os entry points do App Router apenas compõem o contexto tenantizado. A árvore workspace não é superfície funcional atual; compatibilidades legadas permanecem somente em resolução/redirecionamento controlado.

### Navegação compartilhada — 2026-07-23

O seletor de marca deve navegar para a URL canônica do tenant e não pode somente mutar estado do navegador. A preservação de módulo remove parâmetros de entidade; permissões continuam sendo verificadas pelo servidor. A sidebar é a superfície única de navegação, inclusive em telas responsivas, evitando menus locais concorrentes.

Refinamento definitivo: `brandId = marcas.id` é o tenant. `owner_user_id` é uma relação mutável de responsabilidade e nunca substitui o ID da marca na URL, cache ou chave operacional.

Na implementação existente, `marcas.id` é a chave de todos os registros operacionais e não há `marcas.user_id`. Owner e tenant permanecem identidades diferentes; não existe migração futura para transformar owner em identificador canônico de rota.

O produto dependia de rota global e seleção de marca no navegador. Isso não fornece uma fronteira verificável de tenant para colaboradores e links diretos.

## Decisão

Adotar `/{brandRef}/...` como forma canônica das rotas operacionais e resolver um `TenantContext` no servidor. `brandRef` é `slug-da-marca--brandId`; `brandId = public.marcas.id` é o tenant usado na autorização, consultas, caches e RLS. `brandUserId` é somente alias histórico/compatível igual a `brandId`, não uma identidade alternativa. A autorização permanece obrigatória em rotas e APIs; menu não é controle de acesso.

> **Nota de atualização — 2026-07-27:** os parágrafos de contexto anteriores preservam a evolução da decisão. A implementação vigente usa `app/(brand)/[brandRef]`; não existe `/workspace` como superfície atual e não há migração de dados implícita nesta ADR.

## Consequências

- links, cache novo e navegação passam a carregar o tenant;
- rotas antigas só redirecionam após resolução server-side ou seleção segura;
- dados de ownership/plano que não existem no schema não serão inferidos;
- `brandUserId` não é identificador canônico e não deve ser migrado para owner; consumidores legados devem convergir aditivamente para `brandRef`.
