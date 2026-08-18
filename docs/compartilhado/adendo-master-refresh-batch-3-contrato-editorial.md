# Adendo — Master Refresh Batch 3: contrato editorial

Status: preparado; aplicação remota não autorizada.

## Decisões

- BrandDNA continua sob propriedade do módulo Marca. O ledger compartilhado `editorial_artifact_versions` é infraestrutura de versionamento e passa a aceitar `brand_dna`; isso não transfere formação ou aprovação de BrandDNA ao pipeline downstream.
- `editorial_version_status_events` é histórico append-only canônico de status de versões. Não foi substituído pelas tabelas 0027–0029.
- `editorial_decision_events` é histórico append-only de decisões humanas e transições. `editorial_workflow_items` preserva estado corrente e não substitui essa auditoria.
- `brand_invitations` e `brand_invitation_permissions` pertencem a Auth/Marca. A ausência remota é real, mas sua reconstrução fica fora do Batch 3.
- `briefings_artigos` permanece em compatibilidade enquanto houver consumidores ativos. A migração de consumidores precede qualquer decisão futura de remoção.

## Delta autorizado para preparação

### SCHEMA_CHANGE

- ampliar apenas a CHECK fechada de `editorial_artifact_versions.artifact_type` com `brand_dna`;
- criar os dois ledgers de eventos com UUID de ator, FKs restritivas, RLS, ACL mínima e proteção append-only.

### CODE_CHANGE

- alinhar o repositório operacional ainda consumido às colunas canônicas de 0027: `status`, `subject_type`, `subject_id`, `snapshot_version`, `created_at` e `payload`;
- preservar a separação de ContentDocument, PublicationRecord, SERP e workflow.

### COMPATIBILITY_ONLY

- manter `briefings_artigos` sem alteração neste Batch;
- manter convites fora do delta;
- não criar nomes históricos sem consumidor atual comprovado.

## Rollback e gate

O rollback recusa execução se houver evento novo ou versão `brand_dna`. A aplicação futura exige preflight bound sem drift e autorização exclusiva do Batch 3.
