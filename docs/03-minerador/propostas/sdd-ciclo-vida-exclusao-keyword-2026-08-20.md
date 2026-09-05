# SDD — ciclo de vida de exclusão de keyword

Status: aprovada para implementação local e revisão de migration; aplicação
remota, smoke autenticado e purge de dados continuam não autorizados.
Módulo proprietário: Minerador
Data: 2026-08-20

## 1. Decisão congelada

- Keyword não publicada pode ser excluída definitivamente imediatamente,
  mesmo que tenha sido processada, medida, qualificada, enviada ao Arquiteto
  ou possua histórico próprio.
- Keyword publicada nunca é destruída no primeiro comando: sai da operação
  normal e permanece recuperável por 24 horas.
- A janela recuperável é ativada somente por `isPublished` resolvido no
  servidor. KeywordDNA, ArticleDNA, análise, handoff, workflow, métricas e
  proveniência isoladamente não constituem publicação.
- O read-model atual de publicação é `analise_semantica.site_origin`, com
  verificação técnica, `publicationStatus = published` e confirmação humana.
  O valor histórico `status = 'publicado'` continua como sinal de
  compatibilidade até ser corrigido formalmente; ele nunca é inferido a partir
  de DNA, workflow ou métricas.
- Nenhum delete é parcial. A operação mutável é uma única RPC transacional
  chamada pelo servidor; o navegador não executa uma sequência de deletes.

## 2. Auditoria estrutural local

O catálogo de migrations confirma as seguintes relações que apontam para a
keyword (após o rename 0036, os nomes físicos são os sucessores):

| Relação | Papel | ON DELETE | Decisão |
| --- | --- | --- | --- |
| `minerador_keyword_metric_measurements.keyword_id` | medição própria Google Ads | CASCADE histórico/intencional | delete explícito na RPC |
| `minerador_discovery_keyword_origins.keyword_id` | vínculo de proveniência | RESTRICT | apagar somente o vínculo |
| `minerador_discovery_candidates.existing_keyword_id` | referência compartilhada | RESTRICT | limpar a referência; preservar candidata |
| `minerador_discovery_candidates.imported_keyword_id` | referência compartilhada | RESTRICT | limpar a referência; preservar candidata |
| `minerador_discovery_candidate_current_metrics.keyword_id` | projeção da candidata | RESTRICT | apagar somente a projeção da keyword |
| `minerador_discovery_candidate_metric_history.keyword_id` | histórico da candidata | RESTRICT | apagar somente o vínculo histórico |

DataForSEO e análise do Minerador são atualmente embutidos em
`minerador_keywords.analise_semantica`; não há tabela filha DataForSEO
identificada nas migrations. A análise/DNA embutida deixa de existir com o
hard delete da linha não publicada. Versões editoriais imutáveis, hashes,
eventos append-only e artefatos compartilhados não são apagados; workflow do
Minerador só é removido quando não possui evento de decisão dependente.
`PublicationRecord` não possui `keyword_id` e fica fora do purge para
preservar publicação e proveniência mínima.

O schema atual não possui tombstone/`deleted_at`/`purge_after`. Portanto a
mudança estrutural local proposta é aditiva e mínima: duas colunas no
`minerador_keywords`, um índice de recuperação, guardas e RPCs. O estado remoto
precisa ser confirmado no preflight da migration antes de qualquer apply.

## 3. Contratos sucessores

- `delete_minerador_keyword(uuid, uuid, uuid)` mantém o contrato singular.
- `delete_minerador_keywords(uuid, uuid[], uuid, boolean)` é o contrato
  transacional usado pelo lote; a flag somente autoriza o fluxo recuperável,
  não substitui a revalidação server-side.
- `restore_minerador_keyword(uuid, uuid, uuid)` restaura antes do vencimento,
  com mesma Brand e ator autorizado, de forma idempotente.
- `purge_minerador_keyword(uuid, uuid, uuid)` destrói somente tombstones
  vencidos e nunca remove PublicationRecord ou artefato publicado.
- As RPCs são `SECURITY DEFINER`, têm `search_path` fixo, validam
  `canonical_actor_can_use_brand_action(..., 'minerador', 'manage')`, travam as
  linhas e só são executáveis pelo serviço server-side. Rotas autenticadas
  resolvem a sessão e o tenant antes de invocar a RPC.
- Códigos públicos são sanitizados: `KEYWORD_DELETE_NOT_FOUND`,
  `KEYWORD_DELETE_UNAUTHORIZED`, `KEYWORD_DELETE_BRAND_MISMATCH`,
  `KEYWORD_DELETE_TRANSACTION_FAILED`,
  `KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW`,
  `KEYWORD_RECOVERABLE_DELETE_FAILED`, `KEYWORD_RESTORE_WINDOW_EXPIRED`,
  `KEYWORD_RESTORE_FAILED`, `KEYWORD_PURGE_NOT_YET_ALLOWED` e
  `KEYWORD_PURGE_FAILED`.

## 4. Integridade e rollback

O purge é server-side/opportunista ou administrativo e respeita
`purge_after`; não depende do navegador e não será agendado automaticamente
sem infraestrutura de job auditada. A publicação, URL, canonical e
proveniência downstream permanecem intactas.

Antes da revisão remota, executar preflight de catálogo, aplicar a migration
manualmente em janela autorizada e executar post-verifier. Rollback local é a
recriação técnica da migration e das RPCs a partir deste arquivo; nenhum
rollback remoto é executado automaticamente.

## 5. Validação desta etapa

Os testes locais cobrem a política, o contrato das rotas/RPCs, delete de
keyword processada não publicada, recuperação, restore dentro/fora de 24 horas,
purge após a janela e rollback atômico quando houver fixture transacional
disponível. TypeScript, lint, build e `git diff --check` são evidências locais;
não substituem apply, readback autenticado ou smoke remoto.
