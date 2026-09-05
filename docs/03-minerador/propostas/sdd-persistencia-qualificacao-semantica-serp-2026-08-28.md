# SDD — Persistência canônica da Qualificação Semântica (SERP) do Minerador

**Data:** 2026-08-28 · **Owner:** Minerador · **Status:** implementada e homologada em runtime (2026-08-29), com a CALL 3 no endpoint advanced e a derivação v2. Estado canônico em [estado-atual.md](../estado-atual.md).

## Problema

O processo **Resultados** executa CALL 1 (allintitle), CALL 2 (Keyword Overview) e CALL 3 (SERP orgânica da keyword natural). A evidência da CALL 3 é derivada e entra apenas na *working copy* React da sessão. Consequência provada em smoke real: F5, nova aba, outro navegador ou nova sessão perdem a Qualificação Semântica e o card some, embora a chamada paga já tenha sido executada e a evidência exista.

## Decisão

Persistir um artifact **keyword-scoped** de Qualificação Semântica, versionado, server-side. A working copy continua existindo apenas como estado transitório durante a execução.

## Auditoria do armazenamento existente

| Pergunta | `minerador_keywords.analise_semantica` | `editorial_artifact_versions` |
| --- | --- | --- |
| `EXISTING_SEMANTIC_STORAGE` | jsonb livre na própria keyword (volume/allintitle measurements, `human_review`, `ai_review` R5 legado) | store canônico de artifacts versionados por Marca |
| `CAN_STORE_KEYWORD_SERP_QUALIFICATION` | sim (blob) | sim (`entity_id` = keywordId) |
| `CAN_STORE_NORMALIZED_EVIDENCE` | sim | sim (`payload jsonb`) |
| `CAN_STORE_PROVENANCE` | parcial (convenção por chave) | sim (`origin`, `change_reason`, `created_by`, `created_at`) |
| `CAN_STORE_VERSION` | **não** (sem número de versão nem encadeamento) | sim (`version_number`, `previous_version_id`, `content_hash`, `UNIQUE(marca_id, artifact_type, entity_id, version_number)`) |
| `CAN_DISTINGUISH_LEGACY_R5` | frágil (mesmo blob do `ai_review`) | sim (`artifact_type` próprio) |
| `CAN_PRESERVE_HISTORY` | **não** (sobrescrita destrutiva) | sim (cada versão é uma linha) |

**Conclusão:** o blob resolveria o F5, mas não versionamento, histórico nem separação do R5 — exatamente o que o contrato exige. `editorial_artifact_versions` já é o modelo canônico com successor/version (§8: reutilizar, não inventar versionamento paralelo). Reuso escolhido, com **novo `artifact_type`**.

## Contrato

`KeywordSemanticQualification` (payload do artifact, `schemaVersion: "v1"`):

- **identity**: `id` (versionId), `brandId`, `keywordId`.
- **source**: `provider: "dataforseo"`, `operationRequestId`, `providerRequestId`, `collectedAt`.
- **query**: `keyword` natural, `locationCode`, `languageCode`, `device`, `resultLimit`.
- **evidence**: `observedResults`, amostra normalizada (posição, domínio, leitura de intenção e funil), `evidenceHash`. Payload bruto do provider **não** é persistido.
- **intent** / **funnel**: `observedValue | null`, `strength: conclusive | mixed | weak | insufficient`, `supporting`, `observed`, `distribution` — sinais próprios de cada eixo.
- **derivation**: `derivationVersion`, `thresholdsVersion`, `thresholdsStatus: "provisional_heuristic"`.
- **lifecycle**: `version`, `contentHash`, `createdAt`, `createdBy`, `supersedesVersionId`.

Colunas do artifact: `artifact_type = 'keyword_semantic_qualification'`, `entity_id = keywordId`, `marca_id = brandId`, `origin = 'dataforseo_serp'`, `change_reason` descrevendo a coleta.

## Escopo, tenant e consumidores

- Tenant: `brandId = public.marcas.id`; `keywordId` precisa pertencer à mesma Marca. Escrita server-side (`service_role`, único com `INSERT`); leitura pelo cliente autenticado sob a RLS `canonical_actor_can_access_brand`. Nenhum fallback cross-brand, por slug, texto ou owner.
- Consumidores: Perfil da Keyword, Qualificação Semântica, Decisão, gate de Status Aprovado, gate Minerador → Arquiteto.
- Não consumidores: R5 legado, IA Contextual e `editorial_serp_snapshots` (article-scoped do Arquiteto/Radar) — nenhum `articleId` inventado.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Leitura/escrita cross-brand | filtro por `marca_id` + RLS; `entity_id` validado contra a keyword da Marca |
| Falha sobrescrever evidência válida | falha **nunca** grava versão; a última versão válida continua sendo o read-model |
| Confundir Labs `main_intent` com SERP | o artifact não contém `main_intent`; o sinal Labs segue em outro campo |
| Persistência em localStorage | proibida; a working copy é transitória e não é fonte |
| Alterar KGR | o artifact não entra no cálculo nem na faixa visual |
| Aprovar sem evidência | gate exige artifact persistido **e** eixos consolidados |
| Perder proveniência | `version_number`/`previous_version_id`/`content_hash` + `derivationVersion` |

## Rollback

Desligar leitura e escrita do novo `artifact_type` (o read-model volta a "não coletada" e o gate conservador segue bloqueando). Nenhuma linha é apagada; as versões gravadas continuam legíveis.

## Migration

`supabase/migrations/20260828234500_keyword_semantic_qualification_artifact.sql` estende o CHECK de `artifact_type`, no mesmo padrão defensivo da migration de Brand Skills (falha se a constraint tiver drifted). **Não executada** — o usuário executa manualmente.

## Testes

Tenant/cross-brand, read-back após F5 e em outra sessão, versionamento e `supersedes`, falha de coleta preservando a versão anterior, falha de persistência sem sucesso falso, lote com isolamento por keyword, gates de aprovação e handoff, provenance e `REAL_PROVIDER_CALLS_IN_TESTS = 0`.
