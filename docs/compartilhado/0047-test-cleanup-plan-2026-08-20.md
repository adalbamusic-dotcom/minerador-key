# TEST_CLEANUP_PLAN — lifecycle global 0047

Data da auditoria: 2026-08-20
Projeto: `hjjlntdpdgvpnazdztqw`
Brand allowlisted: `09762023-d0d4-4c24-b34e-d0fdfd43f891` (Care Glow)
Actor administrativo de homologação: `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`

## Allowlist exata

| keyword | keywordId | candidateId | originId | workflowId | ArticleDNA | PublicationRecord | modo |
|---|---|---|---|---|---|---|---|
| campanha de trafego pago | `1d42a051-d574-4a7e-a916-98faa4393792` | `d8519001-5774-4a75-815d-3a3f3f181304` | `46745ab4-24f5-45d5-9b2f-3151b4133bf8` | `7eec8fec-f369-46c5-a03d-28abddcdcf0f` | `bd678db2-5304-4dbc-82dc-89043b2a0101` | nenhum | hard |
| gel de unha volia | `e1eef13a-cdfb-4cb8-a91e-764cc14b7dfb` | `e3ee3449-0592-4ac9-9112-b1485f16ad01` | `7d4b6c9f-b34d-4c80-8b22-922ab6a93bfe` | `2dc6c213-bddb-4a55-a9c3-11f7ed57d244` | `90ca5061-2b39-4296-ad8b-7b6e6e56d51c` | nenhum | hard |
| marketing digital | `f08f3a56-3e1b-43dd-82fb-cfc29b1c3432` | `dc6c2a12-5197-4f50-88d9-b241b48a3f82` | `fc16288b-a83b-4d7c-8fcf-9fd25996d96d` | nenhum | nenhum | nenhum | hard |

Os três roots são os registros de homologação confirmados no escopo da
tarefa. O texto foi usado apenas para localizar candidatos; a operação é
allowlist por UUID, brandId e readback, nunca por texto.

## Evidência de impacto antes da operação

`lifecycle_preview_minerador_keywords` retornou:

- `hardDeleteIds`: os três UUIDs acima;
- `blockedIds`: vazio;
- `publishedIds`: vazio;
- `partialDelete`: `false`;
- `PublicationRecord` publicado: zero;
- ContentDocument downstream: zero;
- ArticleDNA: dois registros append-only, preservados como
  `CANONICAL_HISTORY`;
- workflows sem decision event: removíveis na mesma transação;
- medições, origens e métricas Discovery: removidas explicitamente;
- candidatos Discovery: preservados, apenas com a referência à keyword
  desvinculada.

O status `publicado` de `gel de unha volia` foi reavaliado pelo resolver
server-side e resultou `isPublished = false`: não havia vínculo formal de
site nem PublicationRecord. Portanto não há janela recuperável falsa.

## Operação autorizada e readback

Executar somente a RPC tipada
`public.lifecycle_delete_minerador_keywords(brandId, keywordIds, actorId)`.
Não executar SQL direto, `TRUNCATE`, `CASCADE`, cleanup genérico ou a antiga
rotina administrativa de purge.

Após a RPC, confirmar:

- os três roots ausentes;
- medições/origens/current metrics/history desses roots ausentes;
- referências `existing_keyword_id`/`imported_keyword_id` dos candidatos
  removidas;
- workflows sem evento ausentes;
- os dois ArticleDNA continuam presentes e imutáveis;
- zero PublicationRecord foi tocado;
- nenhuma outra brand ou keyword foi alterada;
- `partialDelete = false`.

Se qualquer ID, brand, publicação ou contagem divergir, abortar antes da
mutação e registrar `TEST_DATA_CLEANUP_AMBIGUOUS = YES`.

TEST_DATA_CLEANUP_AMBIGUOUS = NO (allowlist e preflight resolvidos)
TEST_DATA_DELETED = YES
READBACK = PASS
ROOTS_REMAINING = 0
OWNED_CHILDREN_REMAINING = 0
SHARED_DISCOVERY_REFERENCES_REMAINING = 0
WORKFLOWS_REMAINING = 0
CANONICAL_ARTICLE_DNA_PRESERVED = 2
PUBLICATION_RECORDS_TOUCHED = 0
