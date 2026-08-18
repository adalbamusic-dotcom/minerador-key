# Matriz schema × consumidores × corte de legado

**Companheira da auditoria profunda de Supabase — 2026-08-06.** Esta matriz não autoriza mudança de código, schema, dados, RLS ou providers.

| Entidade ou contrato | Consumidores locais localizados | Classificação | Gate antes do corte |
| --- | --- | --- | --- |
| keywords, listas, discovery, métricas e históricos | Minerador, Arquiteto e repositórios | CANÔNICO DA NOVA GERAÇÃO | preservar FKs, tenant `brandId` e proveniência |
| ArticleDNA, versões, documentos, snapshots, publicações e eventos | módulos editoriais e `editorial-repositories` | CANÔNICO DA NOVA GERAÇÃO | preservar ID, versão, hash, status e publicação |
| `brand_memberships.member_user_id` | `tenant-context`, `authz`, provisionamento | CANÔNICO DA NOVA GERAÇÃO | confirmar FKs, unicidade, RLS e actor Auth |
| `marcas.owner_user_id` após resolução por `brandRef`/`brandId` | `tenant-context`, provisionamento e autorização | CANÔNICO DA NOVA GERAÇÃO | não usar para resolver tenant; autorizar owner na marca já resolvida |
| `brand_memberships.user_key` | físico e migrations históricas; nenhum consumidor runtime | SAFE_TO_REMOVE_LATER | ponte 0016 manual, validação e depois migration destrutiva aprovada |
| `perfis.marca_id` e `brandUserId` | físico/documental histórico; nenhum consumidor runtime | SAFE_TO_REMOVE_LATER | todo acesso por `brandId`, actor UUID e membership canônica |
| `ADMIN_EMAIL` | sem consumidor de autorização runtime | SAFE_TO_REMOVE_LATER | papel global persistido, despromoção auditável e nenhum bypass por env |
| NextAuth e bridge `session.accessToken` | lockfile e histórico de teste; nenhum consumidor runtime | SAFE_TO_REMOVE_LATER | `pnpm install` manual e smoke autenticado Supabase SSR |
| `brand_roles` com `marca_id null` | provisionamento e autorização editorial | RISCO NÃO CONFIRMADO | auditar propósito, consumidores e futura separação plataforma/agência/marca |
| bootstrap de Admin em membership de marca | `editorial-authorization.ts` | LEGADO ATIVO A REMOVER | Admin global autorizado sem materializar membership/permissão de tenant |
| `tenant_0005_migration_guard` | migrations, rollback e testes | RISCO NÃO CONFIRMADO — ARTEFATO HISTÓRICO DE MIGRATION | auditar RLS/grants/consumidores/rollback/retenção e decidir exportação ou remoção futura |
| Agency, AgencyMembership e AgencyBrand | `agency-context`, `agency-admin`, Admin | CANÔNICO DA NOVA GERAÇÃO | preservar como domínio e validar o contrato instalado |
| implementação atual da 0014 agência–marca | migration 0014, `agency-context`, `agency-admin` | RISCO NÃO CONFIRMADO — FUNDAÇÃO CANÔNICA NÃO HOMOLOGADA | catálogo, RLS, índice parcial, bootstrap e isolamento comprovados |
| Google Ads por marca | rotas Google Ads e Minerador | LEGADO ATIVO A MIGRAR | separar capacidade global, configuração por marca e consumo |
| Google Ads global da plataforma | destino técnico de credenciais e consumo | CANÔNICO DA NOVA GERAÇÃO | contrato persistido, autorização e consumo comprovados |
| DataForSEO por env | `dataforseo-serp-core.ts` e rota allintitle | LEGADO ATIVO A MIGRAR | conexão privada/consumo por agência e paridade validada |
| DataForSEO por agência | destino de conexão privada e consumo | CANÔNICO DA NOVA GERAÇÃO | contrato persistido, autorização e consumo comprovados |
| Serper | provider server-side Radar | LEGADO ATIVO A REMOVER | paridade DataForSEO; sem fallback no runtime final |
| RapidAPI | consumidores legados identificados no inventário futuro | LEGADO ATIVO A REMOVER | gate de substituição e remoção integral |
| Extensão | bridge e ingestão de keywords | LEGADO ATIVO A REMOVER | ingestão server-side autenticada, paridade e corte autorizado |

## Regra de transição

Dupla leitura/escrita só existe durante janela de migração aprovada. Cada compatibilidade tem gate e tarefa de remoção. O corte remove também código, rotas, envs, testes, fixtures, mensagens e documentos antigos; o runtime final não admite fallback para contrato anterior. Nenhuma remoção alcança versões, documentos, publicações, snapshots, discovery, históricos, keywords ou DNAs canônicos.
