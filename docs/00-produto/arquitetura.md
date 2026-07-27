# Arquitetura

Perfis editoriais: `ArticleDNA.unitClassification`, `unitPurpose` e `serpStrategy` são projeções aditivas do Arquiteto. O tipo de unidade não é inferido como aprovação; o ciclo (`formacao`, `arquitetura_publicado`, `fortalecimento`) e a competição (`kgr_light`, `competitive`, `unknown`) são resolvidos separadamente. O `ArticleControlContext` transporta essa decisão para o Radar sem ampliar o enum operacional compartilhado nem alterar os workflows consumidores.

## Monólito modular

O produto é uma aplicação Next.js App Router em um único repositório. Os módulos de negócio são proprietários de suas telas, regras e documentação; contratos explícitos podem ser consumidos entre módulos. Código em `lib/editorial`, `lib/server`, `components/*context*` e `components/product-shell.tsx` é compartilhado e não deve ser alterado incidentalmente. A árvore tenantizada vigente é `app/(brand)/[brandRef]`; referências a `(workspace)` são históricas ou compatibilidade controlada, não uma segunda superfície funcional.

## Mapa arquitetural vigente — 2026-07-27

`app/` contém rotas, layouts, boundaries, parâmetros, composição e Route Handlers. Os grupos `(admin)` e `(brand)` não aparecem na URL: o Admin global usa `/admin`; o contexto de marca usa `/{brandRef}`. As rotas globais incluem `/`, `/login`, `/cadastro` e `/selecionar-marca`. As rotas tenantizadas incluem `/{brandRef}/`, `/minerador`, `/arquiteto`, `/radar`, `/radar/{articleId}`, `/planejador`, `/redator`, `/publicacoes` e `/conta`.

`modules/` contém a implementação funcional proprietária: Admin global; Marca e BrandDNA/Site/Sitemap/equipe; Minerador e keywords/listas/KGR/KeywordDNA/Extensão; Arquiteto e ArticleDNA/SiloDNA/SiloPage/keywords não agrupadas; Radar e SERP/evidências/curadoria; Planejador, Redator, Publicações e Conta. O Radar recebe ArticleDNA e não reagrupa nem troca principal; Planejador não refaz SERP; Redator não redefine ContentPlan silenciosamente.

`lib/` contém infraestrutura e contratos: `lib/server/auth-users.ts` consulta usuários Auth somente server-side; `lib/server/brand-provisioning.ts` resolve owner real, cria marca/membership/listas e compensa falhas; `lib/server/authz.ts` e `lib/server/tenant-context.ts` autorizam por ator, tenant, papel e permissão; `lib/supabase/` contém cliente browser autenticado sem `service_role`; `lib/editorial/` e `lib/*` de cada domínio guardam contratos, serviços, recuperação e regras compartilhadas. `app/api/` concentra operações server-side e integrações, incluindo `/api/admin/owners`, `/api/marcas`, APIs editoriais e Site/Sitemap. `supabase/` contém migrations, dry-runs, validações e rollbacks, sem significar que uma migration foi aplicada nesta tarefa.

## Tenant, identidades e autorização

`brandId = public.marcas.id` é o tenant; `brandRef = slug-da-marca--brandId` é sua referência pública e nunca é resolvido somente por slug. `auth.users.id` é o usuário; `marcas.owner_user_id` é owner; `brand_memberships.member_user_id` é membro; `auth.uid()` é o ator corrente. `public.perfis` pode conter papéis globais e não representa todas as contas; Admin global pode ter `marca_id = null`. Owner não é tenant.

O contrato SQL local define `is_global_admin`, `can_access_brand`, `can_manage_brand`, `can_access_list` e `tenant_actor_has_permission`. As policies tenantizadas protegem marcas, listas, keywords, memberships, papéis e permissões; `anon` não recebe acesso às tabelas privadas nem execução dessas funções, `authenticated` opera sob RLS e `service_role` fica restrito ao servidor. A validação remota não foi executada nesta passada.

Operações administrativas sensíveis exigem Admin global, consultam `auth.users` no servidor, retornam apenas o necessário e não expõem segredos. A criação server-side revalida o owner selecionado, cria a marca com `owner_user_id`, cria membership owner ativa e só informa sucesso após confirmar consistência; falhas posteriores tentam compensação e não são apresentadas como sucesso.

## Integridade de listas e keywords

`listas_kgr.marca_id` delimita a marca da lista. `keywords_kgr.brand_id` é obrigatório e delimita diretamente a marca mesmo quando `lista_id` é nulo. Quando existe lista, ela deve pertencer à mesma marca. A FK canônica `keywords_kgr.lista_id → listas_kgr.id` usa `ON DELETE RESTRICT`: excluir lista não apaga keywords; keywords sem lista continuam válidas, visíveis e recuperáveis.

## Dependências permitidas

A regra compartilhada de formação é proprietária do Arquiteto. Site/Sitemap fornece apenas evidência observada, Minerador qualifica keywords e Radar consome ArticleDNA formado em leitura; os consumidores não podem acessar estado interno uns dos outros para reagrupar ou confirmar KGR.

Módulos podem depender de contratos (`lib/arquiteto/contracts.ts`, `lib/editorial/contracts.ts`, `lib/editorial/operational-flow.ts`) e APIs publicadas. Não devem acessar estado interno de outro módulo nem alterar suas tabelas sem proposta SDD. Uma mudança compartilhada requer: motivo, consumidores mapeados, proposta, aprovação, snapshot, rollback e testes de regressão.

## Persistência e fallback

O Minerador usa tabelas legadas via Supabase no cliente. O pipeline editorial tem repositórios server-side para artefatos, workflow, documentos, publicações, convites e views, protegidos por permissões e `lock_version` previstos na migration `0002`. Quando a persistência está indisponível, o provider usa `local_fallback` e recovery por marca em `localStorage`; artefatos de recuperação do Arquiteto usam IndexedDB. Fallback local não é fonte única de verdade.

## Integrações externas

Supabase, NextAuth, Google Sheets, provedores de volume, DeepSeek/IA e Serper são integrações observadas no código. Disponibilidade, credenciais e execução em produção não foram verificadas nesta sprint. Mocks de SERP, evidência de produto e parte do fluxo editorial existem deliberadamente e devem continuar explícitos.

Extensão Arquiteto–SERP: a rota de formação reutiliza o núcleo Serper server-side e persiste assessments, snapshots, decisões e verificações no artefato IndexedDB brand-scoped. A transferência aprovada para Radar leva referências KeywordDNA/assessment como campos opcionais; UI e workflow Radar permanecem inalterados.
