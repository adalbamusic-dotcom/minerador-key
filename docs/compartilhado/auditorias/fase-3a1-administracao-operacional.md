# Fase 3A.1 — Administração operacional

## Objetivo

Preparar localmente a criação administrativa de agências e marcas pelo Admin global, sem alterar identidade, RLS, schema, ownership existente ou contratos editoriais.

## Contratos confirmados no código e migrations aplicadas

- Admin global: `public.perfis.role = 'admin'`, validado por `requireCanonicalPlatformAdmin()`.
- Agência: `public.agencies.id`, `owner_user_id`, `name`, `slug` e `status`; a rota é produzida por `buildAgencyRef()`.
- Membership de agência: `agency_memberships.user_id` e `role` final (`agency_admin` ou `agency_member`). Owner e membership permanecem conceitos distintos.
- Marca: `public.marcas.id` e `owner_user_id`; a rota é produzida por `buildBrandRef()`.
- Vínculo administrativo: `agency_brands(agency_id, brand_id, status)`, com uma agência ativa por marca.
- Identidades pesquisadas: somente no servidor, por `auth.admin` depois de validação de Admin global.

## Fluxos locais

1. Nova agência confirma o usuário Auth escolhido e persiste `owner_user_id` na mesma escrita da agência. Não cria membership de agência para o owner e não concede nada ao Admin global.
2. Nova marca confirma owner e agência ativa, cria `marcas` e cria o link ativo em `agency_brands`. O link não cria `brand_memberships` nem permissões editoriais.
3. Como o cliente PostgREST não expõe transação multi-escrita por request, uma falha ao criar o link executa compensação síncrona da marca recém-criada; nenhuma resposta de sucesso é enviada sem confirmação das duas persistências.

## Limites

- Convites, permissões avançadas, transferências, integrações e dados editoriais continuam fora de escopo.
- O débito de segurança legado permanece `PENDING_SEPARATE_HARDENING`.
- Persistência e isolamento remoto exigem a validação manual autorizada; esta fase não executou operações remotas.
