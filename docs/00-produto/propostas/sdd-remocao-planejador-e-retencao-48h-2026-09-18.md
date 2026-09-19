# SDD — Remoção do Planejador do pipeline e retenção de 48h no Redator

**Estado:** proposta. **Nenhum código, banco, migration ou UI foi alterado.**
**Data:** 2026-09-18
**Proprietários:** Redator (produção e retenção), Publicações (destino), infraestrutura compartilhada (navegação e estágios).
**Base factual:** `docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md` (revisão 2).
**Não altera:** Minerador, Arquiteto, Radar, ArticleDNA, KeywordDNA, SiloDNA, SiloPage, InternalLinkGraph, SERP.
**Gate:** os blocos [2], [2b], [3], [3b] e [5] do preflight somente-leitura precisam retornar antes de qualquer migration ser escrita.

---

## 1. Problema

O Planejador saiu do fluxo documentado em 2026-09-17, mas continua sendo **a única porta por onde um registro de publicação nasce**. `publication_records` só é criado pela ação `start_writing`, que exige `ContentPlan` aprovado no Planejador. O resultado medido no banco real: **`publication_records` tem 0 linhas** e o único documento existente — v2, vindo do Radar — não tem como chegar a Publicações.

Em paralelo, o modelo de histórico é append-only permanente: versões imutáveis de documento, de entregável e ativos de mídia que nunca são substituídos nem removidos. Isso não é o produto desejado.

## 2. Decisões

1. **O Planejador é removido do pipeline operacional.** Rota e código permanecem como arquivo histórico e como base da futura aba de planejamento da Marca; o que deixa de existir é **qualquer caminho de escrita nova** por ele.
2. **Nenhuma migração de dados de ContentPlan ou PlannerItem.** O banco real comprovou zero persistência dessas entidades: as tabelas não existem e `editorial_artifact_versions` tem 0 linhas de `content_plan`. Migrar o quê seria inventar trabalho.
3. **Redator → Publicações passa a ser direto**, sem `ContentPlan`, sem `PlannerItem`, com `servidor → readback → sucesso`.
4. **`sendRadarToWriter` continua autoridade única de handoff, com dois gatilhos**: a ação no Radar e o botão "Importar do Radar" no Redator. O botão apenas lista elegíveis e chama o serviço existente.
5. **Retenção de 48h por substituição confirmada**, nunca por idade, e apenas sobre artefatos do processo novo do Redator.
6. **Estágios declarados como identificadores**, não como índices: Redator 6, Publicações 7, Conta 8, Planejador NONE.

## 3. Escopo

### 3.1 Dentro

- Remoção dos caminhos de escrita do Planejador em código, contrato, constraint, estado e navegação.
- Criação do caminho Redator → Publicações.
- Gatilho "Importar do Radar" no Redator.
- Retenção de 48h para artigo, roteiro, carrossel e mídia do Redator.
- Vínculo fino de mídia a bloco, cena e slide — pré-requisito técnico da retenção de mídia.
- Documentação.

### 3.2 Fora

- **Módulos anteriores.** ArticleDNA, KeywordDNA, SiloDNA, SiloPage, InternalLinkGraph, evidências e snapshots do Radar, trilhas de auditoria e eventos MCP seguem a política do módulo dono e **não entram nesta reforma**, salvo dependência técnica comprovada e autorização posterior.
- **Renomear `lib/radar/planner-handoff.ts`.** O arquivo tem nome de Planejador e é motor do Radar: cinco arquivos de produção do Radar o importam, inclusive o `radar-writer-send.ts` novo, e dez testes o leem por caminho literal. Renomear tocaria Radar. Se o nome incomodar, é tarefa própria.
- **Apagar arquivos do Planejador.** Seis testes do Radar e dois do fluxo operacional leem esses arquivos como texto; apagá-los quebraria suíte do Radar, fora do corte.
- Redesenho visual do Redator, painel MCP da Agência e OAuth remoto — auditados em `docs/07-redator/auditorias/auditoria-redator-mcp-agencia-2026-09-18.md`, entram depois.

## 4. Contratos e dados

### 4.1 Publicações sem plano

`OperationalPublicationSchema` já aceita `plannerItemId` e `contentPlanVersionId` nulos, e já tem `radarOrigin`. O banco também: `publication_records.content_plan_version_id` é nulável no schema efetivo. **O bloqueio é só de código.**

Muda:

- `createPublicationDraft(item: PlannerItem, plan, document, article)` sai.
- Entra `createWriterPublication(document, article, radarOrigin)`, sem plano e sem item.
- A invariante "todo registro declara alguma origem" continua; no fluxo novo a origem é sempre o pacote do Radar.
- **Nota do preflight:** `publication_records.document_id` é nulável no banco. Um registro sem documento passa no schema. A garantia de que isso não acontece precisa ser de contrato Zod, explicitamente.

### 4.1-bis Invariantes de retenção — vigentes a partir de 2026-09-18

```text
PURGE_BY_AGE_ONLY = NO
ONLY_AFTER_CONFIRMED_REPLACEMENT = YES
RECOVERY_WINDOW_AFTER_REPLACEMENT = 48H
DNA_AND_RADAR_RETENTION = OUT_OF_SCOPE
```

Registradas também em `docs/00-produto/invariantes.md`, §65-69. **O purge não é implementado nesta rodada** — estas invariantes existem para que a M2 e a M3 nasçam certas, não para autorizar eliminação de nada.

### 4.2 Máquina de estado de substituição

Quatro estados **derivados de duas colunas**, sem enum paralelo:

```
   current ──────► superseded ──────► recoverable_until ──────► purge_eligible
   superseded_at   sucessor            now() < purge_after       now() >= purge_after
   IS NULL         persistido E
   purge_after     relido com sucesso
   IS NULL         → superseded_at = now()
                     purge_after = superseded_at + 48h
```

CHECK que torna a regra estrutural, não disciplinar:

```sql
CHECK ( (superseded_at IS NULL AND purge_after IS NULL AND superseded_by_version_id IS NULL)
     OR (superseded_at IS NOT NULL AND superseded_by_version_id IS NOT NULL
         AND purge_after = superseded_at + interval '48 hours') )
```

O banco passa a **recusar** `purge_after` sem substituição declarada. "Antes da substituição não existe `purge_after`" deixa de depender do código acertar.

### 4.3 Onde `superseded` nasce

```
TX1   writer_save_article_draft / writer_save_deliverable
      (estado corrente + versão imutável, sob lock, mesma transação — já existe)
COMMIT
      readback: compara content_hash, lock_version, current_version_id
                e canonicalJson(blocks) contra a leitura remota — já existe
TX2   writer_mark_superseded(predecessor, sucessor)   ← NOVO
```

`writer_mark_superseded` recusa se o sucessor não existir, não pertencer ao mesmo documento/entregável ou não for a versão corrente; recusa se o predecessor for a corrente; é **idempotente** e **nunca move `purge_after`** numa repetição — repetir uma chamada não pode encurtar a janela de ninguém.

**Se a TX2 não rodar, nada é marcado e nada é apagado.** O modo de falha é guardar demais.

### 4.4 Assimetria a corrigir

`content_documents` tem `current_version_id` com FK. `writer_deliverables` **não tem coluna equivalente** — a versão corrente seria deduzida por `max(version_number)`. Deduzir a corrente é frágil exatamente na operação que apaga as outras.

→ M2 acrescenta `current_version_id` a `writer_deliverables`, espelhando `content_documents`, preenchido por `writer_save_deliverable` na mesma transação que já cria a versão.

### 4.5 Mídia: vínculo antes da janela

`writer_media_assets` hoje liga o ativo ao documento e, opcionalmente, ao entregável — **nunca a bloco, cena ou slide**. `VisualBrief.assetId` existe no contrato e nunca é escrito. Sem âncora, "o novo asset assume o mesmo vínculo" não tem onde acontecer: **o vínculo fino é pré-requisito da retenção de mídia, e entra na mesma migration.**

`writer_replace_media_asset(antigo, novo)` — uma transação, nesta ordem:

```
1. valida mesma marca e mesmo documento; novo com status='uploaded' e file_hash não nulo
2. TRANSFERE O VÍNCULO  novo.anchor_kind/anchor_ref := antigo.anchor_kind/anchor_ref
                        (ou exige âncora idêntica já no novo — nunca divergente)
3. confirma que o novo está ancorado
4. SÓ ENTÃO  antigo.replaced_by_asset_id := novo.id
             antigo.superseded_at        := now()
             antigo.purge_after          := now() + interval '48 hours'
COMMIT
```

Passos 2 e 4 na mesma transação garantem que **nunca existe instante em que o bloco ficou sem imagem enquanto o antigo já contava**. Repetir com o mesmo par é no-op; chamar com par diferente para ativo já substituído é recusado, não sobrescrito.

### 4.6 Purge idempotente

`lifecycle_purge_editorial_history` e `lifecycle_purge_writer_media` nunca lançam erro por "já feito":

| Situação | Retorno |
| --- | --- |
| linha ausente | `already_purged` |
| `purge_after` nulo ou futuro | `not_eligible` |
| é a versão corrente / ainda referenciada por cena ou slide | `not_eligible` |
| apagada agora | `purged` |

Mídia: **objeto antes da linha**. Apagar a linha primeiro deixaria arquivo órfão no bucket, sem dono e sem rastro; objeto ausente é tratado como sucesso.

## 5. Handoff — invariante nova

Texto que substitui o atual em `docs/00-produto/invariantes.md`:

> A transferência Radar → Redator tem **autoridade única**: `sendRadarToWriter`. Ela pode ser **disparada de duas pontas** — pela ação no Radar e pelo botão "Importar do Radar" no Redator. O gatilho do Redator não constitui segunda autoridade: ele lista elegíveis e chama o mesmo serviço, sem validação, aprovação ou escrita próprias. Não existe segunda aprovação entre Radar e Redator.

O botão lista artigos da marca com `state = 'approved'` no estágio `radar` e chama o serviço com o mesmo `articleId`. A ordem interna do serviço não muda. A idempotência já existe por `radarDocumentId` determinístico, que devolve `ALREADY_IMPORTED`.

## 6. Navegação e estágios

```ts
MODULE_STAGE: Record<ProductModule, number | null> = {
  marca: 1, minerador: 2, arquiteto: 3, radar: 4,
  redator: 6, publicacoes: 7, conta: 8,
  planejador: null,   // PLANEJADOR_STAGE = NONE
  admin: null,
}
```

São **identificadores declarados, não índices**. A posição 5 fica declarada e não atribuída; **nenhuma etapa foi criada para preenchê-la**. Implementar como mapa impede que qualquer leitor derive uma etapa inexistente a partir de um índice de array.

`PRODUCT_FLOW` passa a `["marca","minerador","arquiteto","radar","redator","publicacoes","conta"]`. `planejador` sai de `PRODUCT_MODULES` e some da navegação; `/planejador` continua respondendo por link direto.

## 7. Migrations

Três, aditivas. Nenhuma toca dado existente. Nenhuma migra ContentPlan ou PlannerItem. **Nenhuma é executada nesta rodada.**

> **Renumeração — 2026-09-18.** A numeração passou a ser M1 = corte do `stage`, M2 = retenção de histórico editorial, M3 = âncora e substituição de mídia. A revisão anterior usava outra ordem; esta é a vigente e é a referenciada pelas decisões de produto.

> **Estado em 2026-09-18:** `M1_DDL_APPLIED = YES`, `M1_VERIFIED = YES` — aplicada pelo usuário e conferida por readback do schema efetivo e por prova comportamental reversível (`docs/00-produto/auditorias/m1-pos-aplicacao-2026-09-18.md`). **M2 e M3 continuam PENDENTES**, e cada uma depende do código que a usa estar pronto e auditado antes.

**M1 — `stage` sem `planner`** (fecha a remoção lógica no banco) — **APLICADA E VERIFICADA**
O CHECK efetivo é o da `0027`. Passa a `('minerador','architect','radar','writer','publications')`, e `editorial_stage_module()` deixa de mapear `planner → planejador`. Com **0 linhas** em `stage='planner'`, não há dado a converter. É a única que toca constraint usada pela policy `workflow_write`, então vai sozinha.

**M2 — retenção de histórico editorial** — **APLICADA E VERIFICADA** em 2026-09-18 (`docs/00-produto/auditorias/m2-pos-aplicacao-2026-09-18.md`). M3 segue pendente.
`content_document_versions` e `writer_deliverable_versions` recebem `superseded_at`, `purge_after`, `superseded_by_version_id`, o CHECK de 4.2 e índice parcial. Funções `writer_mark_superseded()` e `lifecycle_purge_editorial_history()`.

Dois pré-requisitos registrados para quando a M2 for escrita:

1. **`writer_deliverables` precisa de `current_version_id` explícito.** Hoje a coluna não existe e a versão corrente de roteiro e carrossel seria deduzida por `max(version_number)` — deduzir a corrente é frágil exatamente na operação que apaga as outras, porque uma leitura errada apagaria a versão viva. `content_documents` já tem a coluna com FK; a M2 espelha isso, preenchida por `writer_save_deliverable` na mesma transação que já cria a versão.
2. **O purge precisa resolver com segurança os `previous_version_id` protegidos.** Três FKs `ON DELETE RESTRICT` e duas triggers append-only estão no caminho: `content_documents.current_version_id` (que deve **permanecer** RESTRICT — é a garantia de que a corrente nunca é apagada), `content_document_versions.previous_version_id` e `writer_deliverable_versions.previous_version_id` (que passam a `ON DELETE SET NULL`), mais `content_document_versions_append_only_trg` e `writer_deliverable_versions_append_only_trg`, ambas `BEFORE UPDATE OR DELETE`, que precisam liberar `DELETE` de linha com `purge_after <= now()` e `UPDATE` restrito aos campos de retenção, continuando a bloquear o resto. A cadeia `previous_version_id` vira buraco quando um elo é purgado, e isso é desejado: `SET NULL` registra "havia algo aqui" em vez de impedir a política.

**M3 — âncora e substituição de mídia**
`writer_media_assets` recebe `anchor_kind`, **`anchor_ref`**, `replaced_by_asset_id` (`ON DELETE SET NULL`), `superseded_at`, `purge_after` e o mesmo CHECK pareado. Funções `writer_replace_media_asset()` e `lifecycle_purge_writer_media()`.

Registrado para quando a M3 for escrita:

1. **A âncora precisa ser estável** — `anchor_kind` (`article_block` | `scene` | `slide`) + `anchor_ref` (o id do bloco, da cena ou do slide). Hoje `writer_media_assets` liga o ativo ao documento e, opcionalmente, ao entregável, **nunca ao bloco, cena ou slide**, e `VisualBrief.assetId` existe no contrato e nunca é escrito.
2. **Substituição significa sucessor confirmado no mesmo anchor.** Não é "existe um arquivo novo": é o sucessor `uploaded`, com `file_hash`, ancorado em `anchor_kind`/`anchor_ref` idênticos aos do predecessor, confirmado **antes** de o predecessor ganhar `superseded_at`. Par com âncora divergente é recusado, não corrigido em silêncio.
3. Sem âncora não existe "mesmo vínculo" para o sucessor assumir. **A âncora é pré-requisito da retenção de mídia**, e as duas coisas entram na mesma migration.

### 7.1 Preflight — concluído em 2026-09-18

Os sete blocos foram executados com `npx supabase db query --linked`, que roda SQL arbitrário no remoto sem Docker e sem senha. Resultados na §2.5 da auditoria rev. 2.

Três consequências para estas migrations:

1. **`pg_cron` e `pg_net` não existem no projeto.** O purge de M2 e M3 **não pode ser agendado no banco** — precisa de rota server-side disparada de fora. Isso muda o desenho, e é o único achado do preflight que muda.
2. **`pipeline_editorial_protect_append_only` é incondicional** e cobre `BEFORE DELETE OR UPDATE` em **três** tabelas, incluindo `editorial_artifact_versions` — que está **fora** desta reforma. A M2 reescreve a função liberando dois casos específicos, e precisa fazê-lo sem afrouxar a proteção da tabela de DNA.
3. **RLS não muda.** As seis tabelas do corte têm só política de `SELECT` para `authenticated`; escrita é por `service_role`.

**O gate de leitura caiu.** O que resta para escrever M1, M2 e M3 é autorização de DDL.

## 8. Compatibilidade

- Documento v1 com `ContentPlan` continua legível; `.strict()` de v2 já recusa a chave.
- `plannerItemId`, `contentPlanVersionId` e o valor `sent_planner` **permanecem** nos contratos como legado de leitura. O que sai é a transição, não o vocabulário.
- Rótulo "Importado no Planejador" continua existindo para linha antiga — e nunca mais será produzido.
- Colunas novas são nuláveis e sem efeito até que algo as escreva.
- Nenhuma linha existente entra em janela de purge: as três tabelas alvo têm **0 linhas** e o bucket tem **0 objetos**.

## 9. Rollback

Por camada, sem perda:

- **Código:** ocultar as superfícies novas; o caminho do Planejador não é apagado do disco, apenas desligado.
- **M1/M2:** colunas nuláveis e funções novas são inertes se nada as chamar. Reverter = parar de chamar. As alterações de FK (`RESTRICT → SET NULL`) e de trigger são as únicas com efeito observável e precisam de reversão explícita declarada na própria migration.
- **M3:** reversível recolocando `'planner'` no CHECK — sem dado a restaurar, porque não há linha com esse valor.
- **Purge:** nada é apagado antes de 48h após substituição confirmada, e a janela é restaurável durante todo esse período.

## 10. Testes obrigatórios

| Teste | Prova |
| --- | --- |
| `test:redator`, `test:redator:mcp` | fundação atual continua verde (baseline de hoje: 28/28 e 2/2) |
| `test:editorial`, `test:operational` | leitura do caminho histórico não regrediu |
| `test:radar` | Radar intocado |
| novo `redator-publicacoes-origem-radar` | v2 sem plano cria registro; readback falho = **erro**, não sucesso; repetição não duplica |
| novo `redator-importar-do-radar` | botão lista só `approved`; chama o mesmo serviço; segunda chamada devolve `ALREADY_IMPORTED` |
| novo `retencao-substituicao` | `purge_after` **não** nasce sem sucessor; nasce após readback; repetir `mark_superseded` não move a janela; versão corrente nunca fica elegível |
| novo `retencao-purge-idempotente` | purgar duas vezes devolve `already_purged`; linha não elegível é recusada; cadeia `previous_version_id` sobrevive ao `SET NULL` |
| novo `midia-substituicao-vinculo` | sucessor assume a âncora **antes** de o antigo ganhar janela; par divergente é recusado; objeto ausente não falha o purge |
| novo `planejador-sem-escrita` | `prepare_plan`, `approve_plan` e `start_writing` não existem mais no contrato de comando |

Nenhum desses substitui homologação manual.

## 11. Homologação manual — do usuário

1. Enviar do Radar e conferir o documento no Redator; recarregar; segunda aba; segundo navegador.
2. Usar "Importar do Radar" no Redator e confirmar que lista só artigos aprovados e que repetir não duplica.
3. Enviar a Publicações **sem passar pelo Planejador** e confirmar chegada com texto, imagens, links, metadados e estado.
4. Interromper a rede no meio de um envio e confirmar que a tela **não** mostra sucesso.
5. Substituir um texto e uma imagem; confirmar que o anterior continua recuperável, que a janela é de 48h e que o bloco nunca ficou sem imagem.
6. Confirmar que nada é apagado sem substituição: editar, salvar, esperar, e verificar que a versão anterior não entrou em contagem sozinha.
7. Confirmar que o Planejador sumiu da navegação e que nenhuma tela oferece caminho de escrita por ele.
8. Confirmar que nenhuma tela de Radar, Arquiteto ou Minerador mudou.

## 12. Arquivos que o dev pretende alterar

**Criar:**
```
lib/server/writer-publication-handoff.ts
lib/server/writer-retention.ts
app/api/redator/publication-handoff/route.ts
app/api/redator/radar-import/route.ts
app/api/redator/retention-purge/route.ts
lib/publicacoes/publication-identity.ts          (movido de lib/planejador/)
supabase/migrations/<ts>_writer_retention_editorial_history.sql
supabase/migrations/<ts>_writer_media_anchor_and_retention.sql
supabase/migrations/<ts>_workflow_stage_sem_planner.sql
tests/redator-publicacoes-origem-radar.test.mts
tests/redator-importar-do-radar.test.mts
tests/retencao-substituicao.test.mts
tests/retencao-purge-idempotente.test.mts
tests/midia-substituicao-vinculo.test.mts
tests/planejador-sem-escrita.test.mts
```

**Alterar:**
```
lib/editorial/operational-flow.ts              (remove PlannerItem/plan; origem Radar)
lib/editorial/persistence-contracts.ts         (remove prepare_plan/approve_plan/start_writing)
lib/editorial/providers.ts                     (remove mock de plano)
lib/editorial/navigation.ts                    (MODULE_STAGE, PRODUCT_FLOW, sai do menu)
lib/server/editorial-repositories.ts           (publicação a partir do Redator)
lib/server/writer-deliverables.ts              (current_version_id, mark_superseded, âncora)
lib/redator/multiformat-contracts.ts           (âncora no media brief; assetId escrito)
app/api/editorial/workflow/route.ts            (remove as três ações)
app/api/redator/deliverables/route.ts          (âncora)
components/editorial-pipeline-context.tsx      (remove os 3 acoplamentos; sem estado local antes do servidor)
components/editorial/professional-writer.tsx   ("Importar do Radar" no lugar do diálogo do Planejador)
components/editorial/workflow-status.tsx       (rótulo legado permanece, sem produção nova)
docs/00-produto/{fluxo-oficial,invariantes,pipeline-editorial-papeis-handoffs,glossario}.md
docs/07-redator/{spec,estado-atual,backlog}.md
docs/06-planejador/*                           (cabeçalho de saída do pipeline)
package.json                                   (novos scripts de teste)
```

**Explicitamente fora:**
```
lib/arquiteto/**      lib/radar/**      lib/minerador/**
modules/arquiteto/**  modules/radar/**  modules/minerador/**
app/api/arquiteto/**  app/api/radar/**  app/api/editorial/radar-writer-handoff/**
lib/planejador/**     modules/planejador/**   (congelados, não apagados)
```

## 13. Gate de aprovação

Esta SDD descreve o destino. A implementação só abre depois de:

1. **retorno do preflight** — blocos [2], [2b], [3], [3b], [5];
2. **aprovação desta SDD** pelo responsável de produto;
3. **commit da fundação untracked** — 23 arquivos, incluindo 4 migrations e 7 testes, seguem fora do git.

Migrations não são executadas pelo dev. DDL é declarada e aprovada antes.
