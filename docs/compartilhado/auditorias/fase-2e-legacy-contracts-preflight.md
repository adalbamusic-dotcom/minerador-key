# Fase 2E — preflight para remoção física de contratos legados

> Refinamento do preflight: perfis.marca_id é contado apenas como referência qualificada. Ocorrências genéricas de marca_id em tabelas canônicas não são consumidoras desse contrato legado.

**Escopo:** auditoria read-only concluída. A migration 0017 foi preparada apenas localmente e ainda não foi aplicada.

O preflight audita `brand_memberships.user_key`, `perfis.marca_id` e `agency_memberships.canonical_role`: presença física, funções, policies, triggers, views, constraints, índices, foreign keys, coerência do papel final e dependências de catálogo.

As dependências são agregadas e classificadas como `BLOCKING_FUNCTIONAL_DEPENDENCY`, `EXPECTED_DROP_DEPENDENCY`, `HISTORICAL_ONLY` ou `SAFE`. Índices e constraints presos à própria coluna são contabilizados como esperados para uma futura migration transacional; não são bloqueio por si só.

A futura 0017 só poderá ser proposta se `preflight_status = READY_FOR_LEGACY_DROP`, os consumidores funcionais forem zero, `agency_memberships.role` tiver somente `agency_admin` ou `agency_member`, e `canonical_role` não tiver informação exclusiva. O operador ainda deverá gerar um snapshot novo e revisar rollback antes da aplicação manual.

A preparação local posterior criou a 0017, seu manifest, rollback estrutural e pós-validação. A execução continua manual, posterior à revisão do manifest e do snapshot.

Nenhuma operação remota, alteração de schema, dados, owners, memberships ou runtime pertence a este preflight.
