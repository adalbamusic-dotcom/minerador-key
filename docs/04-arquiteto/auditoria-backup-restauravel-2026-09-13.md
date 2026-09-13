# Auditoria — o que o Arquiteto possui e o que o backup restaura

**Data:** 2026-09-13 · **Revisada no mesmo dia** · **Módulo proprietário:**
Arquiteto · **Classificação:** auditoria de leitura. Nenhuma migration, nenhum
SQL, nenhuma escrita remota.

> **Correção da primeira versão desta auditoria.** Ela afirmava que faltava
> writer canônico para território, working copy de Silo e pareceres. Estava
> errada: `lib/server/arquiteto-*-store.ts` já expõe autoridade tipada para
> cada um deles. A lacuna era de leitura da auditoria, não do código — e a
> restauração implementada reutiliza esses writers em vez de criar rota nova.

## 1. Inventário dos artefatos do Arquiteto

Fonte: escopo do reset de homologação
(`supabase/scripts/arquiteto-homologation-reset.sql`), conferido contra os
writers e readers do código.

### 1.1 `editorial_artifact_versions` — versionados, append-only

| Artefato | `artifact_type` | Identidade | Writer canônico |
| --- | --- | --- | --- |
| ArticleDNA | `article_dna` | `articleId` | `appendArquitetoArtifact` |
| SiloDNA | `silo_dna` | `siloId` | idem |
| SiloPage | `silo_page` | `siloPageId` | idem (exige SiloDNA fonte) |
| Revisão arquitetural de IA | `article_architecture_ai_review` | `articleId` | idem |

O estado de cada versão é a coluna `status` da própria linha, escrita pelo
mesmo append. `preserved_artifact_types` — qualificação semântica,
apresentação contextual e brand skill — **não** é do Arquiteto e não entra no
backup.

### 1.2 InternalLinkGraph

| Artefato | Writer canônico |
| --- | --- |
| Grafo aprovado | `persistInternalLinkGraph` (RPC `persist_internal_link_graph`) |
| Working copy | `persistInternalLinkGraphWorkingCopy` (RPC) |
| Proposta de IA | rota de proposals — fora do escopo da restauração |

### 1.3 `editorial_workflow_items`, `stage = 'architect'`

| `subject_type` | Writer canônico |
| --- | --- |
| `territory` | `createTerritoryWorkflowItem` / `updateTerritoryWorkflowItem` |
| `silo_working_copy` | `createSiloWorkingCopy` / `updateSiloWorkingCopy` (RPC) |
| `territorial_serp_assessment` | `saveTerritorialSerpAssessment` |
| `article_formation_serp_assessment` | `saveArticleFormationSerpAssessment` |
| `territorial_ai_review` | `saveTerritorialAiProposal` |
| `architecture_analysis` | `saveArchitectureMarker` |
| `article_formation_analysis` | `saveArticleFormationMarker` |
| `article` (status operacional) | `WorkflowRepository` com a mesma validação da rota |
| `keyword` (membership) | `WorkflowRepository.update` |
| `arquiteto_homologation_round` | fora do escopo: é estado de homologação, não da mesa |

## 2. Cobertura do BACKUP_RESTORABLE_V1

Todos os quinze `record_type` restauram por writer canônico
(`BACKUP_RESTORE_CAPABILITY` é uniformemente `canonical`, e o teste verifica
isso). A restauração não faz INSERT direto em tabela — há teste que recusa o
padrão no código-fonte.

### Identidade emitida pelo servidor

`TERRITORY` e `SILO_WORKING_COPY` têm o identificador emitido na escrita:
`createTerritoryWorkflowItem` gera o `territoryRef` e nunca o aceita do
chamador. Eles voltam com identidade NOVA, entram no mapa
`id antigo → id restaurado`, e tudo o que aponta para eles é religado antes de
ser gravado. Esses são os registros classificados como `REMAP`.

### Classificação do preview

`CREATE` · `NO_OP` · `REMAP` · `CONFLICT` · `BLOCKED`. Um `CONFLICT` ou
`BLOCKED` recusa o lote inteiro: restauração parcial silenciosa não existe.

## 3. O que ficou provado e o que não ficou

**Provado por teste automatizado** (`tests/arquiteto-backup-roundtrip.test.mts`),
rodando a autoridade real sobre um driver de banco simulado:

- ida e volta `estado A → export → ambiente vazio → restore → estado B` com
  comparação semântica equivalente;
- idempotência: a segunda restauração é toda `NO_OP` e não cria sucessora;
- `CONFLICT` sobre identidade divergente, sem gravar nada;
- readback reprovando conteúdo adulterado depois da escrita;
- `REMAP` real de território, com o id antigo ausente no destino.

**Não provado.** O driver simulado substitui o **driver**, não a regra: os
writers, os schemas e as validações são os de produção. Mas duas escritas
passam por stored procedure (`persist_internal_link_graph` e
`persist_silo_working_copy_atomic`), e o comportamento delas não está neste
repositório. Emular um procedimento que não se pode ler seria inventar a
prova. Para esses dois, o teste confere a chamada e o payload religado.

Também não foi executado o ciclo contra o banco real: o reset de homologação
continua bloqueado pela falta de `GRANT DELETE` ao `service_role`, então não
existe ambiente onde a limpeza controlada tenha acontecido de verdade.

## 4. Estado declarado

```text
ARQUITETO_ARTIFACT_INVENTORY = COMPLETE
BACKUP_EXPORT_COMPLETE = YES
BACKUP_IMPORT_PREVIEW_COMPLETE = YES
BACKUP_REMOTE_RESTORE_COMPLETE = IMPLEMENTED_NOT_EXECUTED_AGAINST_DATABASE
BACKUP_REMOTE_READBACK_COMPLETE = IMPLEMENTED_NOT_EXECUTED_AGAINST_DATABASE
RESTORE_IDEMPOTENT = YES (teste automatizado)
ROUNDTRIP_EQUIVALENT = YES_AGAINST_SIMULATED_DRIVER · NO_AGAINST_DATABASE
EDITORIAL_EXPORT_UNCHANGED = YES
MIGRATIONS_ADDED = 0
MANUAL_UI_VALIDATED = NO
```

Enquanto `ROUNDTRIP_EQUIVALENT` não for `YES` contra o banco,
`BACKUP_RESTORABLE_V1` não é promessa de produto.
