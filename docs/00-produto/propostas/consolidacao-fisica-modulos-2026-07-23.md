# Auditoria e snapshot da consolidacao fisica dos modulos

## Objetivo

Mover as implementacoes proprietarias apontadas pelos barrels de `modules/` para dentro da area dona, preservando comportamento, contratos, rotas, persistencia e dados locais. Este snapshot foi registrado antes das movimentacoes. Nao autoriza Supabase, migration, commit, push ou deploy.

## Inventario dos index.ts

| Modulo | Export atual | Origem real atual | Consumidores localizados | Dependencias exclusivas | Compartilhados | Destino proposto |
| --- | --- | --- | --- | --- | --- | --- |
| admin | `AdminConsole` | `features/admin/admin-console.tsx` | `app/(admin)/admin/page.tsx` | `features/admin/brands-admin-panel.tsx` | `ProductShell`, admin routing | `modules/admin/admin-console.tsx` e `modules/admin/brands-admin-panel.tsx` |
| admin | `BrandsAdminPanel` | `features/admin/brands-admin-panel.tsx` | `features/admin/admin-console.tsx` | cadastro administrativo | `useBrand`, APIs de marcas | `modules/admin/brands-admin-panel.tsx` |
| marca | `MarcaPageEntry` | `components/marca/marca-page-entry.tsx` | `app/(brand)/[brandRef]/page.tsx` | `site-sitemap-panel`, `brand-dna-panel`, `brand-page` | `BrandProvider`, tenant routing | `modules/marca/` |
| conta | `AccountPage` | `components/product/operational-pages.tsx` | `app/(brand)/[brandRef]/conta/page.tsx` | nenhum identificado | `ModuleHeader`, `Field`, estilos | `modules/conta/account-page.tsx` |
| minerador | `MineradorScreen` | `features/minerador/minerador-workspace.tsx` | `app/(brand)/[brandRef]/minerador/page.tsx` | restorer e domínio exclusivo após auditoria | Supabase/auth e contratos compartilhados | `modules/minerador/` |
| arquiteto | `ArquitetoScreen` | `features/arquiteto/arquiteto-workspace.tsx` | `app/(brand)/[brandRef]/arquiteto/page.tsx` | componentes exclusivos do workspace após auditoria | ArticleDNA, SiloDNA, contratos e pipeline | `modules/arquiteto/` |
| radar | `RadarPage` | `components/product/operational-pages.tsx` | `app/(brand)/[brandRef]/radar/page.tsx` | tela Radar e detalhe inline | DataGrid, pipeline, contratos SERP | `modules/radar/radar-page.tsx` |
| radar | `RadarAnalysisPage` | `components/radar/radar-analysis-page.tsx` | `app/(brand)/[brandRef]/radar/[articleId]/page.tsx` | análise Radar | contratos e pipeline compartilhados | `modules/radar/radar-analysis-page.tsx` |
| planejador | `PlannerPage` | `components/product/operational-pages.tsx` | `app/(brand)/[brandRef]/planejador/page.tsx` | editor/cockpit do Planejador | DataGrid, pipeline e contratos editoriais | `modules/planejador/planner-page.tsx` |
| planejador | `PlannerCockpitWorkspace` | `components/planejador/planner-cockpit-workspace.tsx` | deep link `app/(brand)/[brandRef]/planejador/[contentPlanId]/page.tsx` | outline editor e content plan editor | contratos editoriais | `modules/planejador/` |
| redator | `WriterPage` | `components/product/operational-pages.tsx` | `app/(brand)/[brandRef]/redator/page.tsx` | editor/ContentBlockView | Tiptap, Guardiao e contratos | `modules/redator/writer-page.tsx` |
| publicacoes | `PublicationsWorkspace` | `components/publicacoes/publications-workspace.tsx` | `app/(brand)/[brandRef]/publicacoes/page.tsx` | fila, exportacao e acoes de Publicacoes | contratos e DataGrid | `modules/publicacoes/` |
| publicacoes | `PublicationsPage` | `components/product/operational-pages.tsx` | nenhum consumidor operacional atual localizado | tela legada de Publicacoes | pipeline compartilhado | `modules/publicacoes/publications-page.tsx` |

## Dependencias classificadas

`components/product/operational-pages.tsx` nao e compartilhado: ele contem implementacoes de varias areas. Seus helpers de apresentacao, carregamento do pipeline e importacao generica serao isolados em `components/editorial/operational-screen-shared.tsx`, pois possuem consumidores em mais de uma area. `ProductShell`, `BrandProvider`, `EditorialPipelineProvider`, DataGrid, autenticacao, tenant routing, contratos editoriais e clientes server-side permanecem compartilhados.

Os arquivos `lib/*` foram classificados por consumidores reais. Contratos usados por APIs, pipeline e mais de uma area permanecem compartilhados nesta etapa; somente arquivos sem consumidor externo e exclusivos de uma area poderao ser movidos.

## Rollback

Para reverter localmente: restaurar cada arquivo ao caminho indicado na tabela, restaurar os imports anteriores dos consumidores e remover os novos arquivos internos de `modules/`. Nenhum storage local, IndexedDB, localStorage, Supabase ou schema sera alterado.

## Resultado da consolidacao

- Implementacoes proprietarias foram movidas para `modules/admin`, `modules/marca`, `modules/conta`, `modules/minerador`, `modules/arquiteto`, `modules/radar`, `modules/planejador`, `modules/redator` e `modules/publicacoes`.
- O monolito `components/product/operational-pages.tsx` foi removido depois da migracao dos consumidores; o helper genuinamente compartilhado ficou em `components/editorial/operational-screen-shared.tsx`.
- Os wrappers canonicos continuam finos e as rotas, contratos, persistencia e estado local nao foram alterados por esta consolidacao.
- Validacao: suite focada 212/212 e `git diff --check` sem erros de whitespace. TypeScript/build e browser autenticado permanecem separados por causa do estado do `.next` e do servidor Next ativo.
