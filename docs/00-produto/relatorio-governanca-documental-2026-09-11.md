# Relatório de governança documental — Radar / Pesquisa Google Fase 1 — 2026-09-11

Tarefa de documentação apenas. Nenhum código, componente, API, migration, SQL,
banco, provider, teste ou configuração foi alterado nesta rodada.

Objetivo: remover o drift entre a documentação canônica e o produto realmente
implementado, depois da homologação manual da Fase 1 da Pesquisa Google.

## Drift encontrado

Sete divergências, todas do tipo "intenção antiga descrita como estado atual".

**1. O workflow legado aparecia como fluxo operacional.**
`pipeline-editorial-papeis-handoffs.md` descrevia
`Coleta → Concorrentes → Análise → Evidências → Revisão → Histórico` como o
fluxo do Radar. Esse workflow saiu da superfície e não faz parte do fluxo
atual, que é `NOT_STARTED → START → ANALYZE → FINALIZE → FINALIZED` com `RESET`
separado.

**2. Contratos com nome que não existe no código.**
`RadarApprovedPackage` (pipeline) e `RadarEvidencePackage` (invariantes) eram
apresentados como a entrega ao Planejador. Os contratos reais são
`RadarEvidenceBundle`, `RadarFrozenEvidenceBundle` e `PlannerHandoff v3`.

**3. A SDD do handoff declarava v2.**
O código está em `RADAR_PLANNER_CONTRACT_VERSION = 3`, com o Blueprint incluído
diretamente no envelope.

**4. Pendências já vencidas descritas como abertas.**
`fluxo-oficial.md` dizia "Testes usam fixtures. Coleta real autenticada e
persistência remota permanecem pendentes". `visao-geral.md` dizia que a coleta
real "ainda aguarda validação manual". `mapa-estado-atual-plataforma.md` listava
"homologação final DataForSEO" como próxima frente.

**5. As áreas e os modos não estavam documentados em lugar nenhum.**
As quatro áreas operacionais (`Pesquisa`, `Vídeos`, `Especialista`,
`Relatório`), os três modos competitivos (`Google`, `YouTube`, `Amazon`) e a
distinção entre `Pesquisa → YouTube` e a área `Vídeos` não existiam na
documentação canônica.

**6. A fronteira de links internos parava no Arquiteto.**
`links-internos-estado-e-contrato.md` atribuía ao Planejador a decisão de
"seção/contexto/obrigatoriedade editorial". A aplicação evidencial — quantidade,
contextos, afinidade de seção, âncora, variantes, distribuição, confiança — é do
Radar; o Planejador integra.

**7. Toda a Fase 1 estava ausente dos documentos do Radar.**
`estado-atual.md` e `backlog.md` do Radar param em 2026-09-08. Nada entre os
Gates 8 e 18.7 havia sido registrado.

## Documentos atualizados

| Documento | O que mudou |
| --- | --- |
| `05-radar/estado-atual.md` | seção datada da Fase 1 com IMPLEMENTED / TESTED / REMOTE VERIFIED / MANUAL UI VALIDATION / PENDING / BLOCKED |
| `05-radar/spec.md` | contrato canônico permanente: fronteira, áreas, modos, lifecycle, START, ANALYZE, concorrência otimista, verificação de fontes, intenção, modelo competitivo, semântica, links internos, YMYL, descoberta por IA, Blueprint, briefs, FINALIZE, RESET, handoff v3 e contratos de UI |
| `05-radar/backlog.md` | Fase 1 fechada; cinco próximos eixos (A–E) declarados como não iniciados; decisão planejada sobre tradução de vídeos |
| `00-produto/fluxo-oficial.md` | linha do Radar na tabela; parágrafo de fronteira, áreas e modos |
| `00-produto/pipeline-editorial-papeis-handoffs.md` | diagrama, seção do Radar e entrada do Planejador |
| `00-produto/invariantes.md` | nome do contrato corrigido; invariantes 23–33 do Radar |
| `00-produto/glossario.md` | 16 termos canônicos da investigação competitiva |
| `00-produto/mapa-estado-atual-plataforma.md` | seção do Radar reescrita |
| `00-produto/visao-geral.md` | linha do Radar na tabela de módulos e no fluxo operacional |
| `00-produto/backlog.md` | primeira área funcional registrada como escolhida e com fase fechada |
| `compartilhado/sdd-radar-planejador-evidence-handoff-2026-08-26.md` | sucessão v2 → v3 |
| `compartilhado/operational-grid.md` | correção do expansor da linha, com a medição |
| `04-arquiteto/links-internos-estado-e-contrato.md` | papel do Radar e relação exigida sem contexto sustentado |
| `README.md` | índice do Radar |

## Documentos criados

- `00-produto/auditorias/relatorio-radar-google-fase1-homologacao-2026-09-11.md`
  — registro datado e congelado da rodada, com os números e seus limites.
- este relatório.

## Documentos auditados e mantidos

- `05-radar/diretriz-autoridade-evidencial.md` — conferido contra
  `lib/radar/evidence-authority.ts`: a hierarquia documentada corresponde ao
  enum `RadarEvidenceSource` na ordem exata. Nenhuma alteração necessária.
- `00-produto/contratos/README.md`, ADRs 001–021 — nenhum contradiz o estado
  atual do Radar.

Nenhum documento foi arquivado. As seções históricas de `05-radar/spec.md` e
`05-radar/estado-atual.md` permanecem onde estão, marcadas como histórico pela
seção nova que as precede.

## Pendências de decisão — não decididas aqui

**P1 · A engine do modo YouTube tem dois vocabulários.**
`RADAR_SEARCH_MODE_ENGINE` declara `YOUTUBE: "partial"`, com a justificativa de
que universo, separação e modelo de vídeo existem e a coleta usa o bloco de
vídeos da SERP do Google. A leitura de governança é "não homologada / gate
próprio". Os dois estão corretos e descrevem coisas diferentes — capacidade
técnica e estado de homologação. Documentei os dois lado a lado em vez de
escolher um. Se o produto quiser um vocabulário só, é decisão de gate.

**P2 · `RadarEvidencePackageSchema` continua no código.**
`lib/radar/analysis-contracts.ts` ainda exporta `RadarEvidencePackageSchema` e
`RadarPlannerPackageSchema`, aceitos como união legada em `plannerPackage`. A
documentação passou a descrever o `PlannerHandoff v3` como contrato vigente. A
remoção do legado é decisão de código, com gate próprio — não foi feita aqui.

**P3 · Área `Vídeos` sem estado próprio.**
Não existe `estado-atual` separado para a área. Enquanto ela não tiver engine,
descrevi o estado dentro do Radar. Se a Fase de Vídeos virar frente própria,
vale abrir documento de módulo.

## Entrega

```text
GOVERNANCE_RADAR_GOOGLE_PHASE1 = PASS

DOCUMENTS_AUDITED = 19
DOCUMENTS_UPDATED = 14
DOCUMENTS_CREATED = 2
DOCUMENTS_ARCHIVED = 0

GOOGLE_PHASE1_DOCUMENTED_AS_HOMOLOGATED = YES
RADAR_AREAS_ALIGNED = YES
YOUTUBE_SEARCH_VS_VIDEOS_DISTINCTION_DOCUMENTED = YES (invariante 24)
EVIDENCE_AUTHORITY_ALIGNED = YES (já estava; conferida contra o código)
INTERNAL_LINK_BOUNDARY_ALIGNED = YES (invariante 28)
AI_DISCOVERY_ALIGNED = YES
EDITORIAL_BLUEPRINT_ALIGNED = YES (invariante 32)
SPECIALIST_BRIEF_ALIGNED = YES (invariante 29)
VIDEO_BRIEF_ALIGNED = YES
FINALIZE_RESET_ALIGNED = YES (invariantes 30 e 31)
PLANNER_HANDOFF_V3_ALIGNED = YES

BACKLOG_UPDATED = YES (Radar e global)

CODE_CHANGED = NO
MIGRATIONS = 0
DATABASE_CHANGED = NO
PROVIDERS_CALLED = 0
TESTS_MODIFIED = NO

DRIFT_FOUND = 7
PENDING_DECISIONS = 3 (P1 · P2 · P3)

NEXT_RECOMMENDED_GATE = VIDEOS_GATE_0
```
