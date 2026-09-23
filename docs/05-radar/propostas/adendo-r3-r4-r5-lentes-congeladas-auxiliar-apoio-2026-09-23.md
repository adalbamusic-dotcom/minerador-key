# Adendo R3, R4 e R5 — lentes congeladas, auxiliar e apoio nas quatro lentes — 2026-09-23

- **Módulo proprietário:** Radar.
- **Base:** [SDD do Radar nas quatro lentes](./sdd-radar-quatro-lentes-cache-2026-09-23.md), etapas R3, R4 e R5. Depois do [adendo R1](./adendo-r1-standing-congelado-e-ledger-2026-09-23.md) e do [adendo R2](./adendo-r2-quatro-lentes-cache-2026-09-23.md).
- **Autorização:** falas do usuário de 2026-09-23 ("pode continuar em todas, Arquiteto, radar, e redator"), repassadas pelo coordenador para esta etapa.
- **Estado:** implementado no código e coberto por teste. Nenhuma migration, nenhuma escrita remota, nenhuma chamada paga, nenhum SQL. A tela (`modules/radar`) **não** foi alterada.

## 1. O que mudou

| Antes | Depois |
| --- | --- |
| O bundle congelado não registrava lente nenhuma | `finalizedBundle.search.lenses`: a **cópia** das quatro lentes da SERP que a análise leu, montada no FINALIZE, no servidor |
| O dossiê V3 não dizia o que cada aparelho viu | `serpLenses` no dossiê (perfil Google), lido **só** da cópia congelada; lacunas e divergências entram nas `limitations` |
| Auxiliar: `regular`, desktop, sem cache, 1 chamada | Mesmo núcleo da canônica: cache primeiro nas quatro lentes, só as faltantes pagas, gravadas como `radar` |
| Apoio Google da Amazon: `regular`, desktop fixo, idioma `"pt-br"` literal | Mesmo núcleo, com os códigos do alvo da keyword; SERP real existente continua reaproveitada |
| Corrida da Amazon sem aparelho na proveniência | `provenance.device`/`os` com o **eco** do provider; o pedido continua sem aparelho |

## 2. R3 — lentes congeladas

### 2.1 Contrato (`lib/radar/serp/frozen-lenses.ts`, novo, puro)

`RadarFrozenSerpLensBlockSchema` (`radar-frozen-lenses-v1`), `.strict()`:

- `canonicalSnapshotId`, `canonicalSnapshotHash`: a SERP que a análise congelada leu;
- `lensSetHash`: `lenses:<fnv>` sobre o **conteúdo** das quatro lentes (rótulo, estado, orgânicos, domínios, citados do AI Overview, perguntas, tipos de bloco, sinal comercial). Proveniência fica fora, como no hash do snapshot. O schema recalcula e recusa um bloco editado;
- `lenses`: as quatro, na ordem de `SERP_CACHE_LENSES`, cada uma com `lens, status, source, collectedBy, collectedAt, organicCount, competitorDomains, aiOverviewDomains, questions, itemTypes, commercialSignals, missingReason`. **Sem** digest, sem buscas relacionadas, sem `providerRequestId`, sem id de entrada de cache;
- `auxiliary`: `{ queryId, keywordId, keyword, snapshotHash, lensesObserved, missingLenses }` por auxiliar executada nas quatro lentes;
- `datesSpreadDays`;
- `limitations`: lente que faltou, datas com mais de 7 dias de diferença, o que apareceu num aparelho só ("registro de divergência, não reforço"), auxiliar com lente faltante, auxiliar anterior às lentes.

A chave `search.lenses` é **opcional e ausente** quando a rodada não tem lentes: o hash de todo bundle anterior não muda.

### 2.2 Onde é montado

No servidor, na mesma escrita do FINALIZE que já carimba o standing (R1): `stampRadarSerpStandingAtFreeze` chama `evaluateRadarFrozenSerpLenses` (`lib/radar/frozen-serp-standing.ts`) e depois `radarStampFrozenSerpLenses` (`lib/radar/investigation-finalization.ts`).

- A canônica só é copiada quando o snapshot gravado é o que a análise leu: real, não simulado, com o mesmo `contentHash`. Revisão não entra: ela decide autoridade (R1); lente é registro do observado.
- As auxiliares vêm da evidência da investigação (`deepResearch.queries[].evidence.lenses`), o único lugar onde a auxiliar persiste. Desde a correção da seção 10, só entram quando conferem com a versão **gravada** (seção 10.2).
- `search.lenses` declarado pelo navegador é **descartado**; `null` remove a chave. Bundle adulterado é recusado antes (`RADAR_FROZEN_BUNDLE_MUTATED`).
- Nenhum cache é lido: a leitura é a mesma dos snapshots que o standing já fazia.

### 2.3 O dossiê

`buildRadarEvidenceBundleFromAnalysis` lê `radarFrozenSerpLensesOf(finalizedBundle)` só no perfil GOOGLE e entrega a cópia como está em `serpLenses`, somando as `limitations` do bloco às do dossiê. Sem bloco, a chave fica ausente e o dossiê sai byte a byte como antes (dourado `bundle-hash:e32e330f` conferido de novo).

**Invariante 30 provada em teste:** depois do FINALIZE, o cache é regravado nas quatro lentes (outra tarefa, outro domínio na Android) e depois esvaziado; o `bundleHash`, a integridade, o hash do dossiê e o `serpLenses` entregue não mudam.

## 3. R4 — auxiliar e apoio pelo mesmo núcleo

- **Núcleo** (`lib/server/radar-serp-lenses.ts`): ganhou `purpose` (`canonical` | `auxiliary` | `support`) e `usageMetadata`. Muda só o registro de uso: `operationKind` (`serp`, `serp_auxiliary`, `serp_support`) e o prefixo de idempotência (`dataforseo:radar:serp`, `…:serp-auxiliar`, `…:support`), com a lente no fim. A regra das lentes é uma só.
- **Auxiliar** (`app/api/editorial/serp/route.ts`, `collect_auxiliary`): códigos do alvo da **própria** keyword auxiliar; `previous: null`, `recollect: false`; `version: 1, previousSnapshotId: null`. Continua fora de `serpRecords` e não é gravada como snapshot. A resposta ganhou `lensCoverage`. `device` do pedido passou a opcional e ignorado, como na canônica; o cliente deixou de mandá-lo.
- **Merge por posição não mistura lentes:** os `organicResults` da auxiliar saem só da Desktop · Windows; as outras três vivem no `lensSet`. `radarQueryEvidenceFrom` copia as quatro lentes para `evidence.lenses` **só na auxiliar** (a canônica vive no snapshot). Evidência antiga não ganha chave.
- **Apoio da Amazon** (`lib/server/radar-support-research.ts`): com SERP real no artigo, reaproveita (0 leitura de cache, 0 chamada). Sem ela, o núcleo com `purpose: "support"`, códigos do alvo da principal, `device`/`os` da canônica. O idioma do pedido passa a ser o código consultado (`pt`), não o literal `"pt-br"`. A função ganhou um segundo parâmetro opcional (`deps`) para teste; os chamadores de produção não mudaram.

## 4. R5 — YouTube e Amazon Merchant em lente única

- Nenhum pedido mudou: YouTube e Amazon continuam sem `device` e sem `os` (teste de R2 e deste adendo).
- **YouTube:** o eco já era gravado na proveniência da corrida (`device`/`os` a partir de `search`); agora coberto por teste.
- **Amazon:** `RadarAmazonProvenanceSchema` ganhou `device` e `os` opcionais, sem default (corrida gravada antes não ganha chave). A coleta passa ao adapter um `fetchImpl` (`lib/server/radar-provider-echo.ts`) que entrega a **mesma** resposta e lê, de uma cópia, só `tasks[].data.device/os` (`lib/radar/provider-device-echo.ts`). A porta ao provider continua uma só.
- Adotar outras lentes nesses endpoints continua dependendo de medição autorizada (D8).

## 5. Decisões aplicadas

| Decisão | Aplicado |
| --- | --- |
| D7 · lentes da auxiliar | As 4 lentes, pela diretriz e pelo pedido desta etapa. Pior caso KGR com tudo faltando: 4 + 4 × 5 = 24 chamadas |
| D8 · YouTube e Amazon | Inalterado: lente única, eco gravado |
| D6 · ledger | Inalterado: sem a capability, o uso do Radar continua descartado |
| D9 · entradas `radar` no Minerador | O que a auxiliar e o apoio pagam fica no cache com `collectedBy: "radar"`, como a canônica |

## 6. Desvios em relação ao texto da SDD

1. O bloco é montado **no servidor**, na escrita do FINALIZE (como o standing de R1), e não em `freezeRadarEvidenceBundle`: o navegador não tem o snapshot gravado, e quem chama o congelamento (`modules/radar`) está fora deste workflow.
2. A forma do bloco acrescenta `version`, `limitations`, `missingReason` por lente e, na auxiliar, `queryId`, `keyword` e `missingLenses`. A identidade da canônica é anulável para o caso "só auxiliares nas quatro lentes, canônica anterior a elas", declarado nas limitações.
3. As limitações do bloco também entram nas `limitations` do dossiê (só em bundle novo; o legado não muda).
4. A evidência da auxiliar guarda a **cópia compacta** das quatro lentes (a mesma forma do bloco), não o `lensSet` inteiro.
5. O eco da Amazon é lido por um `fetchImpl` que copia a resposta, porque o adapter (`lib/server/dataforseo-amazon-operation.ts`) não devolve `device`/`os` e não está na lista de arquivos deste workflow. A correção direta (o normalizador expor o eco em `search`) fica registrada para quem for dono do adapter.
6. Quatro testes existentes tiveram só a âncora trocada, sem afrouxar a exigência: a porta paga da rota da SERP deixou de ser `collectDataForSeoSerpSnapshot(`/`recordIntegrationUsage(` e passou a ser o núcleo (`collectRadarSerpLensSnapshot(`, `recordUsage: recordIntegrationUsage`). Em `radar-serp-standing-congelado`, a ausência das portas antigas passou a ser **exigida**.

## 7. Medições (offline, fixture advanced desktop-windows; nenhuma chamada)

| Medida | Valor |
| --- | ---: |
| Cópia das quatro lentes (bloco) / por lente | 3.523 B / 864–900 B |
| Bloco da canônica / com 5 auxiliares | 4.195 B / 5.164 B |
| `serpLenses` no dossiê | 4.195 B |
| Evidência de uma auxiliar sem / com lentes | 2.486 B / 6.019 B (+3.533 B) |
| `lensSet` do snapshot (referência) | 4.716 B |

Custo em chamadas:

| Caso | Chamadas |
| --- | ---: |
| Auxiliar com as 4 lentes no cache (Minerador/Arquiteto em até 30 dias) | 0 |
| Auxiliar com tudo faltando | 4 (1 × d20 + 3 × d10) |
| Apoio com SERP real no artigo | 0 |
| Apoio sem SERP, 4 lentes no cache | 0 |
| Apoio sem SERP e sem cache | 4 (antes: 1 `regular`) |
| FINALIZE | 0 chamadas; nenhuma leitura nova (usa a leitura dos snapshots do standing). Os bytes dessa leitura crescem: ver 10.5 |

## 8. Riscos e pendências

1. **Evidência da auxiliar mais pesada:** +3,5 KB por auxiliar em cada versão da análise (a versão sucessora copia o registro). No KGR com 5 auxiliares, ~17,7 KB por versão.
2. **Apoio e auxiliar podem pagar mais que antes** quando nada está no cache (até 4 em vez de 1).
3. **Perfil Amazon:** o snapshot do apoio carrega `lensSet`, mas a investigação congelada da Amazon guarda só a referência dele (`supportRefs`); o dossiê AMAZON não recebe `serpLenses`.
4. **A tela mostra o hash calculado no navegador** na mensagem do FINALIZE (risco de R1): agora ele difere também pelas lentes.
5. **O Redator ainda não lê `serpLenses`** (`lib/server/writer-evidence-*`, `lib/redator/radar-foundations.ts`): a chave chega no dossiê gravado.
6. O `fetchImpl` do eco parseia a resposta da Amazon duas vezes (a do adapter e a cópia).
7. Ledger (D6) inalterado.

## 9. Testes

`tests/radar-serp-lentes-congeladas.test.mts` (23 testes; núcleo real, banco em memória, `fetch` falso sobre as fixtures reais):

- R3: cópia sem digest/relacionadas/ponteiro; bloco com identidade, hash recalculável, limitações (exclusivos, lente faltante, 7 × 19 dias); FINALIZE copia e o hash fecha; sem lentes, sem chave (legado, hash que não confere, simulado, outro snapshot); lentes do navegador descartadas; **invariante 30** (cache regravado e esvaziado); dossiê com `serpLenses` sem digest e lacunas nas limitações; perfil YouTube sem `serpLenses`; dourado de antes de R1; estrutural sem leitura de cache no caminho do dossiê.
- R4: auxiliar com cache (0 chamada) e sem (4, uso `serp_auxiliary` com a keyword); orgânicos só da Windows e lentes na evidência; FINALIZE com auxiliar nas lentes, auxiliar antiga declarada e canônica não contada; rota e cliente (estrutural); apoio reaproveita, usa o cache com o idioma do alvo, e paga 4 com uso `serp_support`.
- R5: eco lido da tarefa; gravador entrega a mesma resposta e não registra recusa; proveniência nova com eco e antiga sem chave; YouTube.

Âncoras ajustadas: `radar-serp-standing-congelado`, `radar-dataforseo-serp`, `radar-planner-handoff`, `radar-youtube-search-12-autoridade-de-modo`.

**Mutantes:** 32 em memória, pelo hook `scratchpad/r2/mut-register.mjs` (lista em `scratchpad/r3/mutantes.mjs`), nenhum escrito no repositório. O controle nulo ficou verde (23/23); os 32 morreram.

```text
FROZEN_SEARCH_LENSES = cópia (sem digest, sem ponteiro) · MONTADO_EM = FINALIZE, servidor
DOSSIE_SERP_LENSES = opcional, só perfil Google, lido da cópia · LEGADO = byte a byte igual
AUXILIAR = núcleo das 4 lentes, fora de serpRecords · ORGÂNICOS_DA_AUXILIAR = só desktop-windows
APOIO_AMAZON = núcleo das 4 lentes quando não há SERP real · IDIOMA = código do alvo
YOUTUBE/AMAZON_MERCHANT = lente única, eco de device/os na proveniência
MIGRATIONS = 0 · ESCRITA_REMOTA = 0 · SQL_REMOTO = 0 · CHAMADAS_PAGAS = 0
```

## 10. Correções depois da revisão (2026-09-23)

### 10.1 O apoio da Amazon respeita a trava do FINALIZE

Sem SERP real no artigo, o apoio gravava um snapshot novo (vN+1) mesmo com a investigação Google finalizada. Isso podia acontecer inteiro por acerto de cache, sem chamada paga, o que é exatamente o que a R1b recusa na rota da SERP.

`collectRadarGoogleSupport` passou a consultar a trava pela leitura leve (`radarGoogleSerpWriteLockAtSave`, sem corridas e sem `finalizedBundle` no arquivo do apoio):

- **antes** do alvo, do cache, da credencial e da quota. Com `FINALIZED_LOCKED`, devolve `SKIPPED` sem ler nem gravar nada;
- **de novo** entre a coleta e `repositorio.save`, como a rota. Se o FINALIZE foi gravado durante a coleta, o uso fica registrado e o snapshot não é gravado (`SKIPPED`).

Nada muda quando o artigo já tem SERP real: ela é reaproveitada sem perguntar à trava, como antes. `SKIPPED` não aciona o retry do pacote (`radarPackageNeedsSupportRetry` só olha `FAILED` e `PENDING`). A porta `deps.googleSerpLock` é opcional e existe só para teste. A janela de milissegundos entre a segunda leitura e o insert continua a mesma da rota (risco 5 do adendo R1).

### 10.2 As lentes das auxiliares são conferidas com a evidência gravada

Antes, no FINALIZE, as lentes das auxiliares eram tiradas do `deepResearch` **do pedido**, ou seja, declaradas pelo navegador. Só a canônica era relida do snapshot gravado.

Agora `evaluateRadarFrozenSerpLenses` recebe `storedDeepResearch`, o `deepResearch` da versão corrente gravada (parte leve da linha, a mesma leitura da trava). Uma auxiliar com lentes só entra no bloco quando a versão gravada tem a mesma consulta executada (mesmo `queryId`), com o mesmo `contentHash` e as mesmas lentes (comparadas por `canonicalJson`). A cópia sai da **gravada**.

A que não confere, ou não existe na gravada, não entra, e vira a limitação "N pesquisa(s) auxiliar(es) com lentes não conferem com a evidência gravada da análise e não tiveram as lentes copiadas". Sem versão gravada, nenhuma auxiliar é conferida.

Cada auxiliar do bloco passa a declarar `source: "stored_analysis_evidence"` (opcional no schema, para que um bloco montado antes continue legível). A confiança é a mesma dos `results` daquela auxiliar: evidência gravada da análise, não snapshot relido.

**O descarte do que o navegador declara vale integralmente para a canônica e para `search.lenses`.** Nas auxiliares, a garantia é outra: a cópia é igual à evidência já gravada, nunca mais do que isso.

Limite: se só houver auxiliares não conferidas e nenhuma canônica com lentes, o bloco continua ausente (a mesma regra de "bloco vazio não é gravado"), e a limitação não é registrada.

### 10.3 Os códigos do alvo, provados em teste

Os testes do apoio passavam por coincidência: sem linha em `minerador_keywords`, a leitura caía no ambiente, que já era `pt`. Agora há um teste com a principal em `en` no targeting:

- com o cache semeado em `en`, 0 chamada;
- sem cache, 4 chamadas, todas com `language_code: "en"`;
- a leitura do alvo usa o id da principal.

Na rota, o teste estrutural da auxiliar passou a exigir `codes: alvoDaAuxiliar.codes`, `codesSource: alvoDaAuxiliar.source` e `cacheKeywordId: alvoDaAuxiliar.cacheKeywordId`.

### 10.4 A lacuna definitiva é paga de novo na auxiliar e no apoio

A auxiliar e o apoio chamam o núcleo com `previous: null`. O reaproveitamento de lacuna definitiva (40xxx ou zero orgânicos) da R2 depende do snapshot anterior comparável, então **não vale** nesses dois caminhos, e o cache não grava a lacuna. Na prática:

- **Auxiliar:** a lente recusada naquele local é tentada uma vez por auxiliar. Num KGR com 5 auxiliares e a macOS recusada, são 5 tentativas recusadas, e `resolveConfig` (credencial e quota) roda em cada auxiliar mesmo com as outras 3 lentes no cache. Não se repete para a mesma auxiliar, porque `radarResearchResumption` não recoleta auxiliar que já tem evidência.
- **Apoio:** no máximo uma vez por artigo. Depois dele o artigo tem SERP real, que é reaproveitada.

Não implementei o reaproveitamento entre keywords diferentes. A regra da R2 vale para a mesma pergunta; estender a lacuna de uma keyword a outra do mesmo local é regra nova, e fica para decisão.

### 10.5 Egress por clique (medido offline ou derivado das medições; nenhuma chamada)

| Caso | Leitura |
| --- | ---: |
| Cada auxiliar com a canônica no cache | ~4,6 KB (leve, 4 lentes) + ~34 KB (corpo da canônica em d20, recortado a 10 só no processo) ≈ 38 KB |
| "Iniciar pesquisa" com N auxiliares, tudo no cache | ≈ 38 KB × N (KGR com 5 auxiliares ≈ 190 KB); antes não havia leitura de cache |
| Apoio da Amazon sem SERP real, com cache | ≈ 38 KB, uma vez por artigo |
| FINALIZE com V snapshots no artigo | V × 24.984 B com `lensSet` (legado: ~10,8 KB por snapshot), mais a versão corrente gravada, que já era lida pela trava |
| Evidência de cada auxiliar | +3.533 B por auxiliar, repetidos em cada versão da análise (a sucessora copia o registro) |

### 10.6 Testes e mutantes

`tests/radar-serp-lentes-congeladas.test.mts` passou de 23 para 29 testes:

- códigos do alvo no apoio (`en`, com e sem cache);
- apoio com a Google finalizada: 0 leitura, 0 chamada, 0 gravação;
- FINALIZE gravado durante a coleta do apoio;
- estrutural da ordem trava → alvo → núcleo → trava → gravação no apoio;
- auxiliar conferida com a gravada: lentes adulteradas, outro hash, consulta ausente, sem versão gravada, ordem de chaves do jsonb, `source` e bloco antigo legível;
- estrutural do carimbo lendo `input.current`.

Os testes existentes ganharam `storedDeepResearch` nas chamadas diretas e `source` no bloco esperado.

**Mutantes:** 12 mutantes (C1–C12) mais o controle nulo C0, todos em memória pelo hook `scratchpad/r2/mut-register.mjs` (lista em `scratchpad/r3fix/lista.mjs`). Nenhum foi escrito no repositório. O controle ficou verde (29/29) e 11 morreram.

C8, que troca `canonicalJson` por `JSON.stringify`, sobreviveu e é equivalente: o `safeParse` do zod reconstrói os objetos das lentes na ordem do schema, então a ordem de chaves do jsonb já não chega à comparação. `canonicalJson` fica como guarda.
