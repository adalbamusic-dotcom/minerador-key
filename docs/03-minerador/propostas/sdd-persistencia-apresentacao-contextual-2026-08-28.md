# SDD — Persistência canônica da Apresentação Contextual (IA) do Minerador

**Data:** 2026-08-28 · **Owner:** Minerador · **Status:** implementada e homologada em runtime (2026-08-29). CHECK aplicado, store verificado contra o banco real, geração única e lote de 8 keywords persistidos. Cross-browser desta apresentação segue pendente de validação manual. Estado canônico em [estado-atual.md](../estado-atual.md).

## Problema

A Apresentação Contextual é gerada com sucesso (Voz da Marca + BrandDNA + DeepSeek), aparece no Perfil e **desaparece** em F5, nova aba, outro navegador ou nova sessão: o resultado vive apenas na working copy React. É o último bloco session-only do Perfil, agora que a Qualificação Semântica já persiste.

## Decisão

Persistir um artifact **keyword-scoped** e versionado da Apresentação Contextual, reidratado no carregamento do Perfil. A working copy continua existindo apenas como estado transitório de uma execução.

## Escopo

- `OWNER = Minerador` · `SCOPE = keyword-scoped` · `TENANT = brandId` (`public.marcas.id`) · `ENTITY = keywordId`.
- **Consumidores**: Perfil da Keyword; Revisão Humana como aporte **opcional**; Planejador/Redator apenas por contrato explícito futuro.
- **Não consumidores**: Intenção, Funil, SERP, KGR, Status editorial e ArticleDNA. Persistir não cria autoridade: `AI_CAN_DEFINE_INTENT/FUNNEL/SERP/KGR/STATUS = NO`.

## Storage (decisão final)

`editorial_artifact_versions` já é o store canônico versionado por Marca e resolveu a mesma classe de problema na Qualificação Semântica: `entity_id = keywordId`, `version_number`, `previous_version_id`, `content_hash`, `origin`, `change_reason`, `created_by`. Reuso com **artifact_type próprio**: `keyword_contextual_presentation`.

Proibido reutilizar `ai_review` (R5 legado, sem autoridade operacional), `keyword_semantic_qualification`, `brand_skill`, `brand_dna` ou `article_dna`.

**Decisão fechada:** o armazenamento canônico desta frente é `editorial_artifact_versions`. **Não existe tabela dedicada planejada nem pendente** — uma rodada futura não deve "resolver" este problema criando storage próprio. A única mudança material esperada é o `CHECK` de `artifact_type` passar a aceitar `keyword_contextual_presentation`, mantendo os sete tipos já materiais. Nada de nova coluna, nova RLS ou novo grant; o migration ledger permanece fora de escopo (`MIGRATION_LEDGER_RECONCILIATION = DEFERRED`).

## Append-only

`editorial_artifact_versions` é append-only. É proibido DELETE de artifact de teste, UPDATE destrutivo, limpeza de versão ou desabilitar trigger para remover probe. Repetição de teste funcional usa keyword nova; o artifact histórico permanece.

## Handoff ao Arquiteto

Quando existir apresentação persistida, o handoff transporta `{ versionId, versionNumber, contentHash, keywordId, brandId, generatedAt }`. Quando não existir, a referência é `null` e o envio segue normalmente: `PRESENTATION_REQUIRED_FOR_HANDOFF = NO`. O Arquiteto consome a referência como contexto upstream do Minerador/Marca — não regenera, não chama provider no import, não altera o artifact, não o aprova e não o usa para decidir Intenção ou Funil.

## Contrato

`KeywordContextualPresentation` (payload, `schemaVersion: "v1"`):

- **identity**: `id` (versionId), `brandId`, `keywordId`.
- **input**: `keyword` (texto), `inputKeywordDnaRef`, `brandDnaVersionRef` (opcional), `appliedSkillRefs[]` com `definitionKey`, `versionId`, `versionNumber`, `contentHash`, `lifecycleStatus`.
- **output**: `text`.
- **provenance**: `provider`, `model`, `operationRequestId`, `executionRequestId`, `generatedAt`, `actorUserId`.
- **lifecycle**: `version`, `contentHash`, `createdAt`, `createdBy`, `supersedesVersionId`.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Ressuscitar autoridade do R5 | artifact_type próprio; nada é lido de `ai_review` |
| Sucesso falso de persistência | UI só declara "persistida" após write confirmado |
| Perder resultado quando o write falha | working copy da sessão preservada e rotulada "não persistida" |
| Sobrescrever versão válida | store append-only; nova geração cria sucessora com `previous_version_id` |
| Cross-brand | filtro por `marca_id` + `entity_id`, payload revalidado, RLS por Marca |
| IA virar blocker | gates inalterados: revisão, aprovação e handoff seguem sem exigir IA |

## Rollback

Desligar leitura e escrita do novo `artifact_type`: a UI volta ao comportamento de sessão e nenhuma linha é apagada.

## Migration

`supabase/migrations/20260828235500_keyword_contextual_presentation_artifact.sql` estende o CHECK de `artifact_type`, no padrão defensivo já usado. **Aplicada manualmente pelo responsável em 2026-08-29**; o arquivo permanece como registro do estado final do CHECK. A reconciliação do migration ledger continua sendo frente separada (`DEFERRED`).

## Testes

Write/readback, versionamento com `supersedes`, idempotência, preservação da última versão válida, falha de write sem sucesso falso, reidratação em F5 e outro navegador, isolamento por Marca, `appliedSkillRefs` preservados, independência dos demais processos e `REAL_DEEPSEEK_CALLS_IN_TESTS = 0`.
