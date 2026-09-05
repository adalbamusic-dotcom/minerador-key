# Master Refresh Batch 7 — baseline canônico final

Projeto Supabase: `hjjlntdpdgvpnazdztqw`  
Data canônica: `2026-08-17`  
Módulo proprietário: fundação global  
Estado: `DATABASE_REFRESH = COMPLETE`

## Resultado

O verificador final foi executado remotamente em transação `READ ONLY`, com
`ROLLBACK` explícito. Os 32 gates retornaram `PASS`; falhas: zero. Nenhuma
migration, DML, DDL, alteração de Auth, leitura de payload secreto ou chamada
de provider foi executada no Batch 7.

O ledger remoto `supabase_migrations.schema_migrations` não integra o contrato
de prova e não foi reconstruído. O artefato reproduzível é
`supabase/scripts/master-refresh-batch-7-canonical-baseline-read-only.sql`.

## Fingerprint estrutural de `public`

| Categoria | Objetos | Fingerprint MD5 determinístico |
| --- | ---: | --- |
| columns | 604 | `861e7fd3bc7b6ad616f813ceb1e30474` |
| constraints, incluindo PK/FK/CHECK | 418 | `8fc0266810a0d9924603ec9c54e9a7c7` |
| functions/RPCs | 70 | `096fcc2e2e5f6a57df55facaa645194b` |
| indexes | 143 | `4dc1df6eb384ae03fbd2a8388fa7f5eb` |
| policies | 58 | `4443a39d3b5c9ba63e8825bb3f6f84a3` |
| relations | 48 | `b374937e4b732f0533e13a4bc45f8cfc` |
| triggers | 27 | `128f6cd0e1bf8ee095e48135a4f022de` |
| **Total** | **1.368** | **`f058b86b56e6d99ab24dac967241c221`** |

As definições incluem tipos, nullability, defaults, identity/generated,
owners, ACL, RLS, constraints validadas, ações de FK, índices, triggers,
SECURITY DEFINER/INVOKER, `search_path` e policies.

## Baseline sanitizada de dados públicos

| Tabela | Rows | Fingerprint |
| --- | ---: | --- |
| `agencies` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_access_periods` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_applications` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_brands` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_invitation_token_generations` | 1 | `f894df2933a8838b94e2244ec08cb17b` |
| `agency_invitations` | 1 | `cce99a69df3f0cea439e85e3b3e24878` |
| `agency_membership_capabilities` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_memberships` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `agency_onboardings` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `brand_agency_capability_restrictions` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `brand_member_permissions` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `brand_memberships` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `brand_roles` | 1 | `bdd5dbb83459c1ffe14d365670dfc72f` |
| `briefings_artigos` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `canonical_capabilities` | 11 | `58b87e497d472413e89035d69cdef7db` |
| `communication_delivery_events` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `communication_messages` | 1 | `560a49310cf629a1a5d1cf16a39d7970` |
| `communication_templates` | 2 | `100f22770a8eb863cb9253d35c5ba347` |
| `content_document_user_states` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `content_document_versions` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `content_documents` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_artifact_versions` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_decision_events` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_saved_views` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_serp_reviews` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_serp_snapshots` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_version_status_events` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `editorial_workflow_items` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `integration_bindings` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `integration_capabilities` | 4 | `c39931ee2aefdcc998950aaad01d618a` |
| `integration_connections` | 3 | `4fc9f863bb77fa665942107a88bd94c8` |
| `integration_grants` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `integration_providers` | 3 | `08c1b555b2250c875cb876f4504937d9` |
| `integration_quota_policies` | 2 | `0b6265310b75f45c5536cf6cbb4e379b` |
| `integration_usage_events` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `marcas` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_candidate_current_metrics` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_candidate_metric_history` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_candidates` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_import_batches` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_keyword_origins` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_discovery_runs` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_keyword_lists` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_keyword_metric_measurements` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `minerador_keywords` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `perfis` | 1 | `f85a3988eb1fd6b2bd86ea294275c206` |
| `platform_communication_config` | 1 | `b0eff52ed84b7aab0ecbf998824f7788` |
| `publication_records` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

Identidades: `auth.users = 4`, fingerprint
`653fd98baacff90426ecb9eb31e76230`; `adalbapro@gmail.com` permanece com
`perfis.role = admin`. Vault: 4 registros, fingerprint sanitizado
`96f757bda7ddb6d1fb84c1f9eb060b9a`.

## Fundação validada

- Agency/Brand: zero Agencies, Brands, memberships, links ou órfãos; schema
  permanece pronto para novos cadastros.
- Segurança: todas as 48 tabelas públicas têm RLS; ACL perigosa de anon = 0;
  SECURITY DEFINER exposta a anon/PUBLIC = 0; hardening de
  `briefings_artigos` e seis `search_path` preservados.
- Google Ads: `PLATFORM_ENV`; quatro objetos dinâmicos legados ausentes; zero
  grant/binding/quota comercial; provider e duas capabilities preservados.
- DataForSEO/OpenRouter: Connections canônicas e Vault preservados.
- Usage: estrutura preservada e linhas antigas de homologação = 0.
- Minerador: dez relações alvo preservadas; `currency_code` continua `text`,
  nullable e com CHECK validada de três letras maiúsculas.
- Editorial: dez relações 0027–0029/Batch 3 preservadas; `brand_dna` aceito;
  ledgers de status/decisão e duas proteções append-only presentes.
- Legado removido: `migration_backup` ausente e Google Ads dinâmico ausente.

## Drift e dívida não bloqueadora

`BLOCKING_SCHEMA_DRIFT = 0` e `CRITICAL_SECURITY_FINDINGS = 0`.

Permanecem fora do refresh, sem impedir o fechamento:

1. Serper ainda possui consumidores ativos e segue `MIGRATE_THEN_DROP` no
   trabalho funcional do Radar/Arquiteto.
2. Rotas legadas de IA ainda leem configuração por ENV; migração por área para
   OpenRouter Connection permanece futura.
3. `briefings_artigos` permanece `KEEP_COMPATIBILITY` até a migração dos
   consumidores ativos.
4. O repositório editorial ainda referencia `brand_invitations` e
   `brand_invitation_permissions`, ausentes por decisão do Batch 3; a
   reconciliação pertence ao domínio Auth/Marca.
5. `tenant_0005_validate_keyword_brand()` é SECURITY INVOKER, trigger-only e
   conserva EXECUTE herdado por PUBLIC/anon. Não há bypass de privilégio nem
   exposição SECURITY DEFINER; a revogação pode ser feita em hardening futuro
   específico, sem reabrir o refresh.

## Antes e depois

**ANTES:** ambiente de homologação com tenants/dados descartáveis, Usage de
teste, backups da migration 0005, legado Google Ads dinâmico, hardening
pendente e drift editorial.

**DEPOIS:** baseline canônico pós-refresh, sem tenants de teste, sem Usage de
homologação, sem `migration_backup`, com Auth/Admin preservados, integrações
canônicas preservadas, hardening aplicado e contratos Minerador/editorial
validados.

`DATABASE_REFRESH = COMPLETE`  
`GLOBAL_FOUNDATION = READY`  
`READY_FOR_FRESH_AREA_DEVELOPMENT = YES`
