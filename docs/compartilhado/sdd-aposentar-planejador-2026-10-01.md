# SDD — Aposentar o Planejador (código, banco e documentação) — 2026-10-01

> **Status: APROVADA pelo dono em 2026-10-01** (com `brand_voice` → Redator). F1–F6 no código; F7 (migration) aplicada pelo usuário depois do deploy de F6.
> Migration, SQL remoto, commit, push e deploy continuam com o usuário
> (`AGENTS.md` §15). Nenhuma linha é apagada antes do preflight e do backup.

## 1. Resumo para o dono

A área Planejador não existe mais. O fluxo é
`Marca → Minerador → Arquiteto → Radar → Redator → Publicações`, e cada área segue
as próprias diretrizes.

A parte **funcional** já saiu em 2026-09-18:
- o "Corte 2" tirou os atos `import_planner`, `prepare_plan`, `approve_plan` e
  `start_writing`;
- a migration M1 tirou `'planner'` do CHECK de stage e está aplicada no remoto;
- o Radar envia direto ao Redator (`/api/editorial/radar-writer-handoff` e a
  ferramenta MCP `send_radar_to_writer`), e o Redator envia a Publicações
  (`/api/redator/publication-handoff`).

A SDD anterior (`docs/00-produto/propostas/sdd-remocao-planejador-e-retencao-48h-2026-09-18.md`,
§3.2) decidiu **manter** rota, código e contratos. Esta SDD reverte essa decisão e
retira o que sobrou: página, módulo, contratos, estado de tela, permissões,
CHECKs, documentação e regras. O banco fica limpo para qualquer destino,
inclusive a migração para a Turso (SDD própria, a seguir).

O Planejador **nunca teve tabela própria**. No banco, só sobram valores dentro de
tabelas compartilhadas. Segundo a auditoria de 2026-09-18, há 0 `content_plan`, 0
`planner` e 0 `sent_planner`. O preflight abaixo confirma isso de novo antes de
qualquer migration.

## 2. Contrato atual (o que ainda existe)

Fonte: inventário de 2026-10-01 (somente leitura) e auditorias
`docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md` e
`corte-2-remocao-funcional-planejador-2026-09-18.md`.

| Camada | O que sobrou | Classe |
|---|---|---|
| Rotas de página | `app/(brand)/[brandRef]/planejador/page.tsx`, `.../[contentPlanId]/page.tsx` | exclusivo |
| Módulo | `modules/planejador/**` (5 arquivos, só leitura) | exclusivo |
| Lib | `lib/planejador/*.ts` (9 arquivos) | exclusivo |
| Envio morto | `lib/server/radar-planner-send.ts` (sem rota), `importRadarToPlanner`, `parseOperationalPlan`, `createMockPlanAndDocument`, `toLegacyBrandSkill`, `modules/publicacoes/publications-page.tsx` | exclusivo/morto |
| Motor do Radar | `lib/radar/planner-handoff.ts` (prontidão e pacote do relatório; usado pelo Radar, pelo dossiê e pelo envio ao Redator) | **compartilhado** |
| Navegação e tenant | `ProductModule`, `MODULE_STAGE`, redirect `planejamento → /planejador`, topbar, shell, ajuda contextual, conta, `TENANT_MODULES`, seleção de marca | compartilhado |
| Autorização | `PermissionModuleSchema` (`"planejador"`), `CollaboratorRoleSchema` (`"planner"`), `ArtifactType` (`content_plan`), `WorkflowStage` (`planner`), editorial/canonical authorization, agency workspace | compartilhado |
| Marca | skill `brand_voice` com `ownerModule: "planejador"`; texto do fluxo em `modules/marca/brand-page.tsx:155` | compartilhado |
| Contratos | família `ContentPlan*` em `lib/arquiteto/contracts.ts`; `ContentDocumentV1` com `contentPlanRef`; `sent_planner`, `PlannerItem`, `plannerItemId`, `contentPlanVersionId`; payload do Radar com `plannerPackage`, `plannerTransfer` e `plannerBundle` | compartilhado |
| Estado da tela | `contentPlans` e `plannerItems` em `components/editorial-pipeline-context.tsx`, lidos por Arquiteto, Radar e Publicações | compartilhado |
| Servidor | `lib/server/editorial-repositories.ts` (lê `content_plan`, `stage in ('radar','planner')`); `app/api/editorial/workspace` devolve `plannerItems` e `contentPlans` | compartilhado |
| Banco | CHECK de `editorial_artifact_versions.artifact_type` com `'content_plan'` (vigente em `20260829120000:39`); `content_documents.content_plan_version_id` e `publication_records.content_plan_version_id` (FK nulável); funções `editorial_artifact_module` e `editorial_stage_module` (ramos inalcançáveis); CHECKs de módulo com `'planejador'` em `brand_member_permissions` (0005:308), CHECKs inline da 0002 e `editorial_saved_views` (0028:69); linha `('planejador','Planejador')` em `canonical_capabilities` (0021:68) | compartilhado (valores) |
| Testes | exclusivos: `planejador-*` (6), `planner-global-topbar`, `brand-ai-context`; compartilhados que leem arquivos do Planejador pelo caminho; cerca de 20 do Radar ligados a `planner-handoff.ts` e `radar-planner-send.ts` | misto |
| Documentação | `docs/06-planejador/**` (13 arquivos); `AGENTS.md` (l. 21, 70, 74, 88, 100, 170, 207, 320, 464); `README.md`; `docs/00-produto/{visao-geral, invariantes, glossario, fluxo-oficial l.49, pipeline-editorial-papeis-handoffs, mapa-estado-atual-plataforma}`; ADR-009 e ADR-010; SDDs e propostas que citam o Planejador; specs e estados do Radar e do Redator | normativo |

## 3. Proposta — fases

Cada fase é uma entrega própria, com testes verdes antes da seguinte.

**F0 · Preflight (só leitura, o usuário roda).**
`supabase/scripts/2026-10-01-aposentar-planejador-preflight-read-only.sql` devolve
um JSON com:
- contagens: `content_plan`, `planner`, `sent_planner`, documentos e publicações com
  `content_plan_version_id`, permissões, saved views e capabilities `planejador`;
- os CHECKs que citam o Planejador;
- as policies que usam `editorial_stage_module` ou `editorial_artifact_module`.

**Todas as contagens precisam ser 0**. Se alguma não for, a fase correspondente
ganha um passo de migração de dado, com snapshot.

**F1 · Documentação normativa.**
- Atualizar `AGENTS.md` (fluxo, artefatos, ordem de desenvolvimento), `README.md`,
  `visao-geral`, `invariantes`, `glossario`, `fluxo-oficial` (l.49: o caminho direto
  existe), `pipeline-editorial-papeis-handoffs` e `mapa-estado-atual-plataforma`.
- Marcar ADR-009 e ADR-010 como **superados**.
- O artefato `ContentPlan` sai da cadeia canônica:
  `… → RadarApprovedPackage → ContentDocument → PublicationRecord`.

**F2 · Extrair o motor do Radar.**
- `lib/radar/planner-handoff.ts` vira `lib/radar/handoff-readiness.ts`, com o mesmo
  comportamento e só os nomes novos. `radarPlannerHandoffReadiness` passa a se
  chamar `radarHandoffReadiness`, e os demais nomes mudam do mesmo jeito.
- Os imports do Radar, do dossiê, do envio ao Redator, da exportação portátil e do
  Redator são atualizados.
- As funções mortas do arquivo saem.
- Os testes do Radar mudam o caminho.
- Nenhuma regra de prontidão muda.

**F3 · Código morto.**
Apagar `radar-planner-send.ts` e seus testes, `importRadarToPlanner`,
`parseOperationalPlan`, `createMockPlanAndDocument`, `toLegacyBrandSkill` e
`PublicationsPage`.

**F4 · O módulo.**
- Apagar `app/(brand)/[brandRef]/planejador/**`, `modules/planejador/**`,
  `lib/planejador/**`, `scripts/verify-planejador-keyword-strategy.mts` e os testes
  exclusivos.
- Ajustar os testes compartilhados que leem esses arquivos e o
  `scripts/visual-system-baseline.json`.
- `/{brandRef}/planejador` e o redirect legado `planejamento` passam a levar ao
  Radar (redirect permanente), em vez de 404.

**F5 · Navegação, tenant, autorização e Marca.**
- Tirar `planejador` de `ProductModule`, `MODULE_STAGE`, topbar, shell, ajuda
  contextual, conta, `TENANT_MODULES` e seleção de marca.
- Tirar `planejador` e `planner` de `PermissionModuleSchema` e
  `CollaboratorRoleSchema`.
- A skill `brand_voice` ganha novo dono: **`redator`** (proposta: é quem escreve com
  a voz da marca). O texto do fluxo em `brand-page.tsx` é corrigido.

**F6 · Estado e contratos.**
- Tirar `contentPlans` e `plannerItems` do contexto da tela, de
  `/api/editorial/workspace` e de `editorial-repositories`.
- Tirar a família `ContentPlan*`.
- Retirar `sent_planner`, `PlannerItem`, `plannerItemId` e `contentPlanVersionId`
  dos contratos.
- Leitura tolerante do que é histórico, porque análises gravadas não podem
  quebrar:
  - os campos `plannerPackage`, `plannerTransfer` e `plannerBundle` do payload do
    Radar continuam aceitos e são ignorados na leitura (`.passthrough()` ou
    opcionais), sem nova escrita;
  - `writerTransfer` passa a ter schema próprio, hoje reaproveita
    `RadarPlannerTransferSchema`;
  - o documento v1 (`contentPlanRef`) sai **só se o preflight der 0 documentos v1**;
    senão, fica a leitura v1 isolada em um adaptador.

**F7 · Migration final (o usuário aplica).** Uma migration, com rollback.
Aplicação por `db query -f` + `migration repair`, **nunca** `db push`.
- `editorial_artifact_versions.artifact_type`: CHECK sem `'content_plan'`.
- CHECKs de módulo sem `'planejador'`: `brand_member_permissions` e
  `editorial_saved_views`, além dos CHECKs inline da 0002 que existirem no remoto
  (o preflight lista).
- `canonical_capabilities`: `active = false` na linha `planejador`. Apagar a linha
  só se `agency_membership_capabilities` estiver vazia para ela.
- `editorial_artifact_module` e `editorial_stage_module`: removidos os ramos
  `content_plan` e `planner`, depois de conferir as policies que as usam.
- `content_documents.content_plan_version_id` e
  `publication_records.content_plan_version_id`: removidos **se** o preflight der 0
  e F6 tiver tirado o código que os lê. A remoção de coluna é o último passo e tem
  rollback (re-adicionar a coluna nulável com a FK).

**F8 · Arquivo.**
- `docs/06-planejador/**` vai para `docs/_arquivo/06-planejador/` (histórico, não
  operacional).
- A SDD `sdd-radar-planejador-evidence-handoff-2026-08-26.md` e as propostas
  exclusivas também vão para o arquivo.
- Os specs e estados do Radar e do Redator perdem as referências operacionais ao
  Planejador.

## 4. Consumidores e compatibilidade

- **Radar:** a prontidão, a aprovação do relatório e o envio ao Redator continuam
  iguais. Muda só o nome do módulo (F2).
- **Redator:** o documento v2 nasce do Radar e não usa ContentPlan, então nada
  muda. A leitura de v1 depende do preflight.
- **Publicações:** nasce do v2 e não usa ContentPlan. A origem "Planejador
  (histórico)" sai.
- **Arquiteto:** lê `plannerItems` só para exibir. A leitura sai.
- **MCP e catálogo:** já não têm o estágio planejador. Sobra um texto no
  `platform-catalog.ts`, que sai. `npm run test:agent` continua verde.
- **Permissões:** nenhum membro tem `module='planejador'` (o preflight confirma).
  Se tiver, as linhas são apagadas na migration, com contagem antes e depois.

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Apagar `planner-handoff.ts` quebra o Radar e o envio ao Redator | F2 renomeia e extrai antes de qualquer remoção; os testes do Radar rodam inteiros |
| Análise gravada com `planner*` deixa de passar no parse | Leitura tolerante em F6, sem escrever os campos de novo |
| `sent_planner` em linha antiga do Radar | Preflight = 0; se não for, o enum aceita o valor só na leitura |
| CHECK de módulo recusa o ALTER por linha antiga | Preflight conta; a migration apaga as linhas `planejador` antes de trocar o CHECK |
| Policy RLS usa as funções de módulo | Preflight lista as policies; os ramos só saem depois disso |
| Link antigo `/planejador` vira 404 | Redirect permanente para o Radar |
| Skill `brand_voice` sem dono | Novo dono (`redator`) antes de tirar o valor do enum |

## 6. Rollback

- **Código:** reverter os commits de cada fase. As fases são independentes e F2 é
  só renomear.
- **Migration:** o arquivo em `supabase/rollback/` recoloca os valores nos CHECKs,
  reativa a capability, restaura as funções de módulo e re-adiciona as colunas
  `content_plan_version_id` nuláveis com a FK.
- **Dados:** nenhum dado operacional é apagado. A aposentadoria só remove
  vocabulário vazio (preflight = 0).

## 7. Testes

- Por fase: `test:radar`, `test:redator`, `test:editorial`, `test:arquiteto`,
  `test:agent`, `test:authz` e `test:visual-system` (contra a linha de base), além
  do tsc.
- Novo teste estrutural: nenhum arquivo de produção importa `lib/planejador`,
  `modules/planejador` ou `radar-planner-send`, e o código não cita mais
  `content_plan`, `planner` ou `planejador` (exceto o adaptador de leitura
  histórica e os falsos positivos do "Keyword Planner" do Google Ads).
- Navegação: `/{brandRef}/planejador` redireciona para o Radar.

## 8. Autorização necessária

1. **Aprovar esta SDD** e o novo dono da skill `brand_voice` (proposta: `redator`).
2. **Rodar o preflight F0** e colar o JSON. Ele decide F6 (documento v1) e F7
   (colunas).
3. **Aplicar a migration F7** quando chegar a hora. O agente entrega o arquivo e o
   rollback, e o usuário aplica.
4. **Commit/push/deploy** de cada fase: com o usuário.

## 8.1 Resultado do preflight F0 — 2026-10-01 (rodado pelo usuário, só leitura)

| Item | Resultado |
|---|---|
| `content_plan`, stage `planner`, state `sent_planner` | 0 · 0 · 0 |
| Documentos / publicações com `content_plan_version_id` | 0 · 0 |
| Permissões, saved views e capabilities de agência `planejador` | 0 · 0 · 0 |
| Capability `planejador` ativa | 1 (desativada na F7) |
| Policies que usam `editorial_stage_module` / `editorial_artifact_module` | nenhuma |
| CHECKs que citam o Planejador | `ck_brand_member_permissions_module_0005` (tem também `administracao`, que fica), `editorial_artifact_versions_artifact_type_check`, `editorial_saved_views_module_check` |

**Consequências:**
- F6 pode tirar a leitura do documento v1 (`contentPlanRef`).
- F7 pode apagar as duas colunas.
- As funções `editorial_*_module` não sustentam nenhuma policy. Ficam como estão
  nesta SDD, porque não afetam o banco, e saem na migração de banco (Turso).

A migration F7 e o rollback estão prontos e **só se aplicam depois do deploy de
F6**. Um guarda aborta se aparecer dado do Planejador.
- Migration: `supabase/migrations/20261001120000_aposentar_planejador.sql`
- Rollback: `supabase/rollback/20261001120000_aposentar_planejador.rollback.sql`

Se alguma view ou função depender das colunas, o `DROP COLUMN` falha e a transação
inteira volta, sem efeito parcial.

## 8.2 Execução no código — F1 a F6 (2026-10-01)

**Verificado no código** e **confirmado por teste** (tsc limpo, salvo os
`.next/types` gerados pelo `next dev`, que se refazem na próxima subida).
Nada foi gravado no banco remoto.

- **F2:** `lib/radar/planner-handoff.ts` virou `lib/radar/handoff-readiness.ts`;
  nomes sem "Planner" (`radarHandoffReadiness`, `buildRadarApprovedPackage`…).
- **F3:** saíram `radar-planner-send.ts`, o envelope V3 (`buildRadarPlannerEvidenceHandoff`,
  `RADAR_PLANNER_CONTRACT_VERSION`), `importRadarToPlanner`, `parseOperationalPlan`,
  `toLegacyBrandSkill` e `PublicationsPage`. O Relatório diz "Pronto para o
  Redator" e "Pacote para o Redator"; o título vazio diz "Título a definir no Redator".
- **F4:** apagados `app/(brand)/[brandRef]/planejador/**`, `modules/planejador/**`,
  `lib/planejador/**`, o script de estratégia e 7 testes exclusivos.
  `/{brandRef}/planejador` (e o cockpit) redireciona com **308** para
  `/{brandRef}/radar` no `proxy.ts` (`retiredBrandModuleTarget`); `/planejador` e
  `planejamento` legados levam ao Radar.
- **F5:** `planejador` saiu de `ProductModule`, `MODULE_STAGE` (agora Redator = 5,
  Publicações = 6, Conta = 7, igual ao AGENTS.md §18), topbar, shell, ajuda,
  Conta, `TENANT_MODULES`, seleção de marca, capabilities, `PermissionModuleSchema`
  e o papel `planner` de `CollaboratorRoleSchema`. `brand_voice` tem dono `redator`.
  Leitura tolerante: convite gravado com papel `planner` aparece como `viewer` e
  permissão de módulo `planejador` é ignorada; anotação de IA ou convite antigo no
  snapshot local é descartado sem derrubar o snapshot (`toleratedArray`).
- **F6:** saíram `contentPlans`/`plannerItems` (tela, `/api/editorial/workspace`,
  repositórios), `PlannerItem`, `sent_planner`, `plannerItemId`,
  `contentPlanVersionId`, a família `ContentPlan*` e o documento v1
  (`ContentDocumentSchema` é o v2). **Nenhuma escrita cita mais
  `content_plan_version_id`**: é o pré-requisito para a F7 apagar a coluna.
  O pacote aprovado do Radar ganhou campo próprio, `approvedPackage`; os campos
  `plannerPackage`, `plannerTransfer` e `plannerBundle` ficaram opcionais e só de
  leitura (`radarApprovedPackageOf` lê o novo e cai no legado). O reset ainda os
  zera, para um pacote antigo não voltar. `writerTransfer` usa
  `RadarTransferReceiptSchema`.

**Pendências registradas:**
- O pacote aprovado ainda grava a etiqueta interna `packageType:
  "radar_planner_handoff"` (valor do schema v2 já gravado). Trocar a etiqueta é
  mudança de contrato de dado gravado; fica para a migração de banco (Turso).
- `buildRadarPlannerPackage` (pacote v1 legado) só é usado por testes; sai na F8.
- F7: **aplicada pelo usuário em 2026-10-01** (`db query -f` + `migration repair`). Readback da
  própria migration: capability `planejador` ativa = 0, CHECKs que citam o Planejador = 0, colunas
  `content_plan_version_id` = 0. O código desta entrega precisa estar no deploy: o código antigo
  ainda gravava a coluna.
- F8: arquivar `docs/06-planejador` e limpar as docs do Radar e do Redator.

## 9. Fora desta SDD

- **Migração Supabase → Turso:** SDD de comparação própria, logo a seguir, com a
  divisão proposta pelo dono: Turso para a mesa de trabalho, Supabase para login,
  e-mail e administração.
- **Adendo do MCP:** orçamento por marca para os providers pagos, também a seguir.
