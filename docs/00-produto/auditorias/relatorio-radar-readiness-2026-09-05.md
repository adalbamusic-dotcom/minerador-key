# Relatório 5 — Readiness para retomada funcional do Radar — 2026-09-05

Síntese dos Relatórios 1 a 4. Somente diagnóstico.
`PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `CODE_FILES_CHANGED = 0`.

Fontes: [1 — harness](relatorio-radar-test-harness-2026-09-05.md) ·
[2 — contrato](relatorio-arquiteto-radar-contract-matrix-2026-09-05.md) ·
[3 — persistência](relatorio-arquiteto-radar-persistence-trace-2026-09-05.md) ·
[4 — aprovação](relatorio-radar-approval-authority-2026-09-05.md).

---

## 0. Parecer em uma frase

O Arquiteto melhorou de verdade nesta rodada — recusa declarada, hidratação
legada contável, duplicata por identidade estrutural, importação fantasma
fechada — **mas o canal Arquiteto → Radar está fechado por um `.strict()` que
ficou para trás**, e a suíte que provaria qualquer avanço do Radar não roda.
As duas coisas se resolvem sem tocar em contrato, schema remoto ou provider.

---

## A. O que o Arquiteto já entrega corretamente ao Radar

Somente o comprovado, com o nível de evidência de cada item.

| Entrega | Nível | Evidência |
| --- | --- | --- |
| Identidade editorial completa e validada — `brandId`, `articleId`, `articleDnaVersionId`, `articleDnaContentHash` | `IMPLEMENTED` + `TESTED` | 409 no servidor para cada divergência (`workflow/route.ts:41-45`); `test:arquiteto` 1480/1479/1 |
| Recusa declarada por artigo, com motivo em português | `IMPLEMENTED` + `TESTED` | `resolveRadarEligibility` 12 códigos (`radar-handoff-gate.ts:92-215`); `arquiteto-radar-handoff-gate.test.mts` verde |
| Silo canônico resolvido pelo território, sem alterar o artefato | `IMPLEMENTED` + `TESTED` | `resolveCanonicalSiloForArticle` (`radar-handoff-context.ts:67-124`); `arquiteto-radar-handoff-context.test.mts` verde |
| Silo obrigatório no `RadarItem`; item sem pai é recusa nomeada | `IMPLEMENTED` | `RadarItemSchema.siloId` obrigatório; `route.ts:37-39` |
| Keyword principal e apoios em **texto** com aliases, via `hydration` | `IMPLEMENTED` + consumido | `hydration.keywordSnapshots` lido em `route-resolution.ts:44` e `radar-page.tsx:101` |
| Pilar/Suporte declarado pelo artigo (`hierarchy`) | `IMPLEMENTED` + consumido | coluna da planilha, `format`, painel de especialista |
| `arquitetoKgrIdentity` | `IMPLEMENTED` + consumido | sugestão de modo em `radar-page.tsx:341` |
| `arquitetoStrategyContext` | `IMPLEMENTED` + consumido **só na rota de detalhe** | `radar-analysis-page.tsx:190` |
| Falha de escrita do import não vira estado local | `IMPLEMENTED` | commit `e4c5733`; `pipeline-context.ts:702-723` |
| Duplicata de território por identidade estrutural, fora da disputa | `IMPLEMENTED` | `territory-duplicate.ts`; 3 consumidores de leitura no Arquiteto |

**Nenhum item desta tabela está `REMOTE VERIFIED` nem
`MANUAL UI VALIDATION` nesta auditoria** — não houve leitura remota nem
navegador.

---

## B. O que ainda chega por compatibilidade legada

| Tema | Situação | Consequência |
| --- | --- | --- |
| **`siloId`** | Silo é obrigatório; **a origem canônica não é**. `resolveCanonicalSiloForArticle` mantém o ramo `LEGACY_TERRITORY_HYDRATION` (`radar-handoff-context.ts:81-104`) | `CANONICAL_SILO_REQUIRED = NO` |
| **provenance do `siloId`** | O Arquiteto passou a marcar (`siloIdProvenance`) e a contar (`legacyHydratedHandoffArticleIds`) — mas o campo **não entra no `RadarItem`** e é **recusado pelo schema do comando** | O Radar não distingue contrato de compatibilidade. E hoje isso **bloqueia o import inteiro** — §C.1 |
| **territory hydration no lado do Radar** | O pipeline do Radar **re-resolve** a arquitetura com `buildRadarHandoffContexts` (`pipeline-context.ts:673-685`); `siloIdOf` e `createRadarHydrationSnapshot` têm fallback em `article.payload.siloId` | 3 deduções que devem sumir quando o ArticleDNA sucessor declarar `siloId` |
| **contexto SERP de formação** | `arquitetoSerpProvenance` persiste (caminho A) e **não tem leitor**; `arquitetoSerpAssessment` é **descartado pelo servidor** (`route.ts:35`, `serpAssessments = {}`) | O Radar pode redescobrir divergência já resolvida por uma pessoa |
| **InternalLinkGraph** | `arquitetoInternalLinks` persiste e não tem leitor; `internalLinkGraphRef` do handoff v2 **não tem produtor** | Grafo aprovado não participa de nada no Radar |
| **decisões humanas da formação** | dentro de `arquitetoSerpProvenance.humanResolution` — morto junto | — |
| **`publicationContext`** | não existe campo; derivado no Radar de `operationalPublications` | `DERIVED_LEGACY` |

---

## C. O que está quebrado ou não consumido

Separando as três categorias, como pedido.

### C.1 Quebrado — impede operar hoje

| # | Item | Evidência | Dono |
| :-: | --- | --- | --- |
| **B1** | **Import Arquiteto → Radar recusado nas duas telas.** `ResolvedSiloContext` ganhou `siloIdProvenance` em `ae72add`; `WorkflowCommandSchema.handoffContext.silo` é `.strict()` e não o declara (`persistence-contracts.ts:80-96`, último commit `aa0e60d`) | `safeParse` reproduzido: `unrecognized_keys: "siloIdProvenance"` → 400 → `imported: 0` | **Arquiteto** (introduziu o campo) |
| B2 | `tests/radar-persistence.test.mts` **não carrega** — 3 imports sem extensão em `lib/server/serp-persistence-adapter.ts:1-3` | `ERR_MODULE_NOT_FOUND` | Radar |
| B3 | `npm test` **aborta em `test:authz`** (encadeamento `&&`), sem alcançar as demais suítes | execução por suíte: 16 falhas em 1578 testes | Plataforma |

### C.2 Implementado mas não validado

| Item | Falta |
| --- | --- |
| Readback estrito da revisão SERP após F5 | homologação com **snapshot novo** |
| Handoff v2 (`RadarPlannerHandoff`) | nunca gerado com dado real; `internalLinkGraphRef` sempre `null` |
| Envio e inbound Telegram (servidor completo: claim, readback, dedupe, worker) | webhook público não configurado; E2E pendente |
| Coleta DataForSEO na fila sequencial | nenhuma coleta nova registrada desde 2026-08-27 |
| Guard de duplicata de território | só leitura; `SUPERSEDE_WRITER_EXISTS = NO` |

### C.3 Não implementado

| Item | Estado |
| --- | --- |
| **Autoridade única de aprovação** | duas regras divergentes; `SINGLE_APPROVAL_AUTHORITY = NO`; módulo extraído revertido em `2e2e9a6`, recuperável |
| **`RadarEvidencePackage` / handoff v2 pelo Workbench** | único produtor é `radar-analysis-page.tsx` |
| **Persistência da revisão humana de `ExpertEvidence`** | `window.localStorage` (`radar-expert-brief-panel.tsx:268`) |
| **`ExternalEvidence`** | só rótulos de UI; sem contrato, schema, persistência; `SOURCE_REQUIRED` só existe em documento |
| **Leitores de `matchedToPublished` / `ungroupedKeywordIds`** | zero (Adendo 01) |
| **Consumo de 7 campos do handoff** | `DEAD_HANDOFF_FIELDS = 7` |

---

## D. Frentes do Radar — pode avançar sem o Arquiteto fechar?

| # | Frente | Classificação | Razão |
| :-: | --- | --- | --- |
| 1 | **Suíte / test harness** | `READY` | Inteiramente dentro do Radar. Não depende de import, remoto, provider nem contrato. É pré-requisito para provar qualquer outra frente. |
| 2 | **Autoridade única de aprovação** | `READY_WITH_LOCAL_LIMITATION` | A regra e a ordem são domínio puro; os builders existem e são testáveis por fixture. A limitação é de **prova**: validar ponta a ponta exige item importado, e o import está em B1. |
| 3 | **Persistência da revisão de `ExpertEvidence`** | `BLOCKED_BY_HUMAN_ACTION` | Falta decidir onde a decisão mora: campo aditivo no contrato de contribuição (já remoto) ou entidade de revisão própria. Aditivo dispensa SDD; estrutural não. |
| 4 | **`ExternalEvidence`** | `BLOCKED_BY_HUMAN_ACTION` | Exige contrato (necessidade → Source → Evidence → revisão), persistência e extensão **aditiva** do envelope v2, que é `.strict()`. É SDD, não acabamento de UI. |
| 5 | **Relatório consolidado** | `READY_WITH_LOCAL_LIMITATION` | Gerar e revisar já funcionam. Só a **aprovação** precisa deixar de ser local — é a frente 2 pelo outro nome. |
| 6 | **Package / handoff v2** | `READY_WITH_LOCAL_LIMITATION` | Construir: pronto (builders testados). Provar: `BLOCKED_BY_REMOTE_SMOKE`. Preencher `internalLinkGraphRef` depende de o Radar passar a ler `arquitetoInternalLinks`. |
| 7 | **Especialista / Telegram** | `BLOCKED_BY_HUMAN_ACTION` + `BLOCKED_BY_REMOTE_SMOKE` | Servidor completo. Faltam webhook público, especialista `active` e binding — todos atos do usuário. |
| 8 | **Nova coleta DataForSEO** | `BLOCKED_BY_HUMAN_ACTION` | Exige autorização explícita de chamada paga. **Não** está bloqueada por B1: itens já persistidos continuam coletáveis; B1 impede apenas importar artigos **novos**. |

Nenhuma frente está `BLOCKED_BY_ARQUITETO` no sentido de precisar de decisão do
Arquiteto para começar. B1 bloqueia **a chegada de artigos novos** e a
homologação ponta a ponta — não o trabalho de domínio do Radar.

---

## E. Próximo lote recomendado

### Lote R8 — Chão de prova do Radar

**Objetivo.** Fazer com que a suíte do Radar exista como suíte: um script
`test:radar` que execute os 36 arquivos hoje órfãos, com os dois impedimentos
conhecidos resolvidos, de forma que qualquer afirmação futura sobre o Radar
possa ser verificada por um comando.

**Por que é o próximo.** Três razões, em ordem de força:

1. **A frente mais valiosa (autoridade única de aprovação) não pode ser
   validada sem isto.** Ela mexe na ordem de portão → pacote → handoff →
   readback. Fazer essa mudança com 36 arquivos de teste que ninguém executa é
   trabalhar no escuro.
2. **B1 tira a urgência das frentes que dependem de import.** Enquanto o
   Arquiteto reabre o canal, o Radar tem exatamente uma frente útil que não
   depende dele.
3. **É o único lote com custo conhecido e risco quase nulo:** nenhum contrato,
   nenhum schema, nenhum remoto, nenhum provider.

**Dependências.** Nenhuma externa. Não depende de B1, nem do Planejador, nem de
decisão arquitetural.

**Arquivos prováveis.**

| Arquivo | Natureza da mudança |
| --- | --- |
| `package.json` | novo script `test:radar`; decidir se entra em `npm test` (ver "fora do escopo") |
| `lib/server/serp-persistence-adapter.ts` | 3 imports relativos ganham `.ts` — alinha com o padrão do resto de `lib/` |
| `tests/radar-hydration.test.mts` | fixture ganha `confidence` (o `ArticleDNASchema` já o exige) |

**Contratos afetados.** Nenhum. A mudança em `serp-persistence-adapter.ts` é de
resolução de módulo, invisível para o bundler (`moduleResolution: bundler`) e
sem efeito em runtime de produção.

**Testes que precisariam executá-lo.**

- `test:radar` novo, cobrindo `tests/radar-*.test.mts` (36 arquivos, 169 testes);
- critério de aceite: **169/169**, sem falha e sem arquivo que não carrega;
- regressão: `test:arquiteto` permanece 1480/1479/1 (a falha restante é a
  pré-existente do Minerador);
- `npx tsc --noEmit` sem erro novo — hoje 5, nenhum no Radar.

**Smoke / manual necessário.** Nenhum. É o único lote desta lista que não
precisa de navegador autenticado, banco ou provider.

**Explicitamente fora do escopo.**

- corrigir as 16 falhas das outras suítes (`authz`, `editorial`, `operational`)
  — são asserções de varredura de fonte defasadas, e são da Plataforma;
- desfazer o `&&` de `npm test`, ou incluir `test:radar` na cadeia agregada —
  isso muda o comando canônico do repositório e é decisão de governança, não do
  Radar;
- reverter `2e2e9a6` ou mexer em qualquer arquivo de `modules/radar`;
- corrigir B1 — é do Arquiteto;
- criar teste novo. O lote faz **rodar** o que existe; escrever cobertura nova
  vem depois, com o chão pronto.

### Encaminhamentos que saem deste lote

| Para | O quê |
| --- | --- |
| **Arquiteto** | **B1** — `siloIdProvenance` foi adicionado a `ResolvedSiloContext` sem atualizar `WorkflowCommandSchema.handoffContext.silo` (`.strict()`). O import Arquiteto → Radar está recusado nas duas telas. A correção mínima é aditiva; a decisão de *como* (aceitar o campo, ou não enviá-lo) é do Arquiteto. |
| **Arquiteto** | `arquitetoSerpAssessment` é descartado pelo handler (`serpAssessments = {}`), divergindo do que o cliente monta. |
| **Plataforma** | 263 de 375 arquivos de teste órfãos; `npm test` aborta na primeira suíte. |
| **Planner Geral** | decisões D3 (`ExpertEvidence` — campo aditivo ou entidade) e D4 (`ExternalEvidence` — contrato e extensão do envelope v2). |

---

## F. Limitações desta auditoria

1. **Nenhuma leitura remota.** Nada foi conferido contra o banco. Tudo sobre
   persistência descreve o que o código grava.
2. **Nenhuma validação em navegador.** `MANUAL UI VALIDATION` está vazio em
   todas as tabelas, por construção.
3. **Os flags do lote anterior do Arquiteto** (`ANTI_IDADE_*`, `SUPERSEDE_*`,
   `LOCAL_ASSIGNMENTS_TO_RESTORE = 3`, `EXACT_PUBLISHED_ROOT_DUPLICATE_GUARD`)
   foram usados como **contexto** e não promovidos a evidência. Confirmei o
   código que os sustenta, não o estado remoto que descrevem.
4. **B1 foi provado em bancada, não em produção.** O `safeParse` usou o schema
   real do checkout e a forma real de `ResolvedSiloContext`; não observei um
   `POST /api/editorial/workflow` recusado. A cadeia até o 400, porém, é leitura
   direta de código sem ramo alternativo.
5. A classificação das 16 falhas fora do Radar é por amostragem (uma por suíte).
