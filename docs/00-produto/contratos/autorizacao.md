# Contrato de autorizacao por tenant

## Fonte de verdade

Correção: `marcas.id` é a fonte canônica de tenant. `owner_user_id` não é e não deve ser comparado ao ID da marca.

O tenant operacional atual é `brandId = marcas.id`, exposto na rota por `brandRef = slug-da-marca--brandId`. `brandUserId` é somente alias histórico de compatibilidade quando algum consumidor legado ainda o utiliza. O ator vem da sessão autenticada. Nenhum valor de URL, body, sidebar ou armazenamento local autoriza acesso.

## Guard central

`resolveTenantContext` resolve sessao, marca, owner legado, membership ativa, papel e permissoes. `requireTenantPermission` exige que `brandId`, se enviado, coincida com o tenant e que a permissao solicitada esteja presente. Admin global continua ator distinto do owner.

## Ownership futuro

> **Classificação documental — 2026-07-27:** este bloco é um snapshot pré-aplicação e não representa o estado vigente. Os efeitos de 0005/0006 são considerados existentes no ambiente alvo conforme o resultado remoto registrado em `docs/compartilhado/supabase.md`; não reexecutar nem reverter essas migrations.

`marcas.owner_user_id` e `brand_memberships.member_user_id` sao preparados na migration `0005`, ainda nao aplicada. Ate a revisao humana do dry-run, o vinculo legado `perfis.marca_id` permanece apenas como compatibilidade e nao prova ownership canonico por UUID.

## Estado vigente — 2026-07-27

O contrato canônico usa `brandId = public.marcas.id` como tenant; `ownerUserId = marcas.owner_user_id`, `memberUserId = brand_memberships.member_user_id` e `actorUserId = auth.users.id/auth.uid()` são relações de ownership, membership e atuação. A rota pública usa `brandRef = slug-da-marca--brandId`. `brandUserId` permanece apenas alias de compatibilidade em código/documentação histórica e não é uma identidade adicional.

## Revisao da migration 0005 — 2026-07-24

O owner reconciliado localmente e a marca Adalba `95bef1bb-0a3d-4218-a01f-ac7281c55e45` para o usuario `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`. O papel global continua em `perfis.role`; a participacao por marca continua em `brand_memberships`.

O banco passa a proteger tambem keywords sem lista por `keywords_kgr.brand_id`; `lista_id` nao e evidencia exclusiva de acesso. A migration e transacional e as policies substitutas sao criadas antes da remocao das policies permissivas. Nenhum SQL remoto foi executado.
