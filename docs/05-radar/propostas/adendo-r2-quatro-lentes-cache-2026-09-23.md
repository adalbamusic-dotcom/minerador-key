# Adendo R2 — SERP canônica do Radar nas quatro lentes, cache primeiro — 2026-09-23

- **Módulo proprietário:** Radar.
- **Base:** [SDD do Radar nas quatro lentes](./sdd-radar-quatro-lentes-cache-2026-09-23.md), etapa R2. Depois do [adendo R1](./adendo-r1-standing-congelado-e-ledger-2026-09-23.md).
- **Autorização:** falas do usuário de 2026-09-23 ("pode continuar em todas, Arquiteto, radar, e redator"), repassadas pelo coordenador para implementar R2.
- **Estado:** R2 **implementado no código e coberto por teste**, só na SERP canônica do artigo (`action: "collect"`). Nenhuma migration, nenhuma escrita remota, nenhuma chamada paga, nenhum SQL. A tela (`modules/radar`) **não** foi alterada (§6).

## 1. O que mudou

| Antes | Depois |
| --- | --- |
| Uma lente: `desktop` sem sistema, que o cliente escolhia | As quatro lentes de `SERP_CACHE_LENSES`, decididas no servidor. `device` do pedido é aceito e ignorado |
| Endpoint `regular` | `advanced` nas quatro lentes |
| Profundidade de `SERP_DEFAULT_RESULTS` (padrão 10) | Janela fixa de 10 no snapshot. A canônica é **paga** em 20; as extras em 10 |
| Sem cache: todo clique pagava 1 chamada | Cache primeiro. Paga só as lentes faltantes, com `collectedBy: "radar"` |
| Locale e idioma da config | Os do **alvo da keyword**, pela função do Minerador (`resolveDataForSeoTargeting`) |
| Todo clique abria versão nova | Hash igual ao do último snapshot: nenhuma versão; a rota devolve o registro gravado com `unchanged: true` |
| Recoleta = clicar de novo | "Recoletar agora (pago)" explícito: `recollect: { confirmed: true }` |
| Um uso por clique (descartado pelo ledger, §4 do adendo R1) | Um uso por chamada paga, com a lente na metadata e idempotência por lente |

## 2. Contratos (aditivos)

- **Pedido** (`lib/radar/serp/request.ts`):
  - `CollectRequestSchema.device` passou a opcional. Continua aceito para cliente antigo não receber 400; não é lido.
  - `recollect: { confirmed: true }` opcional. `confirmed: false` é recusado (400).
  - `buildRadarSerpCollectPayload` não manda mais `device` e manda `recollect` só quando pedido.
  - A pesquisa auxiliar (`collect_auxiliary`) **não mudou**: ainda `regular`, desktop, sem cache. É a R4.
- **Snapshot** (`lib/radar/serp/contracts.ts`), quatro campos **opcionais, sem default**. O snapshot antigo relido não ganha chave nenhuma, e a serialização do registro antigo é idêntica (teste):
  - `payloadDepth: "advanced"`;
  - `providerDepth`: profundidade da entrada usada (20 quando veio do Minerador ou do Radar);
  - `cacheProvenance: { source: "cache" | "paid", collectedBy, providerRequestId, cacheCollectedAt }`, sem id de entrada de cache (seria ponteiro);
  - `lensSet` (`lib/radar/serp/lens-set.ts`, versão `radar-lens-set-v1`): as quatro lentes na ordem de `SERP_CACHE_LENSES`, cada uma com `status` `observed | missing`, `missingReason`, `source`, `collectedBy`, `collectedAt` (ISO com `Z`), `depth`, `providerRequestId` e a observação compacta **copiada**, sem digest.
- **Resposta** de `POST /api/editorial/serp` (collect): além de `record`, `resolvedKeyword` e `persistenceMode`, traz `unchanged`, `unchangedBy` (`cache_meta | content_hash | null`) e `lensCoverage { observed, total, paidCalls, cacheHits, codesSource }`.
- **Cliente** (`components/editorial-pipeline-context.tsx`, parte do Radar): `collectSerp(articleId, location, articleDnaVersionId, options?)`. `options.recollect` pede a recoleta paga; `options.onOutcome` recebe `radarSerpCollectOutcome` (mudou ou não, chamadas pagas, lentes). A assinatura antiga continua valendo.
- **Cache** (`lib/editorial/serp-cache.ts`, `lib/server/serp-cache*.ts`): **nenhuma mudança**. `collectedBy: "radar"` já estava no enum, e `lookupSerpCache` já tinha os modos e `maxAgeMs` necessários.

## 3. O núcleo e a ordem (`lib/server/radar-serp-lenses.ts`)

`collectRadarSerpLensSnapshot` é a única regra das lentes do Radar. A rota da SERP canônica a chama, e a R4 vai reusá-la na auxiliar e no apoio da Amazon.

1. **Trava antes de tudo** (R1b, inalterada). Investigação finalizada recusa `collect`, inclusive a recoleta e inclusive quando tudo viria do cache.
2. **Cache primeiro, leve.** Uma leitura em modo `observation` (meta + observação) das quatro lentes. A recoleta pula a leitura.
3. **Atalho sem corpo.** Se o último snapshot real é da mesma pergunta (mesmo artigo, versão do ArticleDNA, keyword, versão do KeywordDNA e consulta, já com `lensSet`) e as quatro lentes do cache são as **mesmas coletas** (`providerRequestId` e instante iguais), a rota devolve o registro gravado. Nenhum corpo, credencial ou quota é lido.
4. **Corpo da canônica**, só quando ela está no cache.
5. **Só com faltas:** credencial e quota (`quotaUnits` = lentes faltantes), depois o provider.
   - Canônica em 20, com corpo, para a CALL 3 do Minerador não pagar de novo.
   - Extras em 10, `storeBody: false`, com o digest que o núcleo do cache grava.
   - A canônica é paga primeiro. Se o provider a recusa, a coleta cai com o mesmo erro de antes do cache e as extras **não** são pagas.
   - Extra que falha (HTTP, task recusada, zero orgânicos) vira lente `missing` com motivo, e a canônica segue.
6. **Normalização determinística:** o snapshot sai sempre de `trimSerpBodyToDepth(pruneSerpBody(corpo), 10)`. A data é a da coleta gravada, normalizada para ISO com `Z`.
7. **Hash com as lentes** (`radarSerpLensedContentHash`, fórmula `radar-serp-lenses-v1`). Cobre o mesmo conteúdo da fórmula anterior, mais o endpoint e, por lente, rótulo, estado e observação, serializados com **chaves ordenadas**. Data, origem e `providerRequestId` ficam fora. Nenhum hash gravado é recalculado.
8. **Hash igual ao anterior (mesma pergunta):** nenhuma versão nova. A rota devolve o registro anterior e não grava.
9. **Uso:** um `recordIntegrationUsage` por chamada que voltou do provider. A chave é `dataforseo:radar:serp:<operação>:<artigo>:<lente>`. A metadata leva `operationKind` (`serp` ou `serp_recollect`), `lens`, `depth`, `snapshotId` (o novo, o anterior quando nada mudou, ou `null` quando a coleta falhou) e `cacheHits`. O custo sai de `tasks[0].cost`. Acerto não registra uso.

## 4. Decisões aplicadas (recomendação da SDD, até decisão do usuário)

| Decisão | Aplicado |
| --- | --- |
| D4 · idade máxima | 30 dias (`RADAR_SERP_MAX_AGE_MS` = padrão do cache). Datas com mais de 7 dias entre lentes só são **marcadas** no modelo de tela |
| D5 · recoleta | As 4 lentes (`RADAR_SERP_RECOLLECT_CALLS = 4`) |
| D9 · entradas `radar` no Minerador | Gravadas com `collectedBy: "radar"`. O Minerador as lê como qualquer entrada: a exibição do `collectedBy` na Qualificação é do workflow do Minerador |
| D10 · identidade do snapshot = conteúdo | Recoleta idêntica não abre versão, e a idade exibida continua a da versão gravada |
| D6 · ledger | Inalterado: sem a capability `dataforseo.serp_compatibility`, o registro continua descartado (adendo R1, §4) |

## 5. Desvios em relação ao texto da SDD

1. **O atalho lê meta + observação, não só meta.** A leitura leve já traz as observações das extras. O caso "mudou" fica com duas leituras em vez de três, e o "sem mudança" custa ~4,6 KB em vez de ~1 KB.
2. **Os códigos vêm do targeting gravado da keyword**, e não só de `readDataForSeoTargetCodes`. É a mesma regra do adendo A8 do Arquiteto: `resolveDataForSeoTargeting` sobre `analise_semantica->allintitle_measurement->targeting`, em coluna estreita, filtrada por marca e `deleted_at is null`. Sem keyword do acervo, ou com a leitura falha, valem os códigos do ambiente. A leitura é própria do Radar (`readRadarKeywordTargetCodes`) para não depender de `lib/arquiteto/serp-lens-targeting.ts`, arquivo não versionado do outro workflow.
3. **Hash com chaves ordenadas.** A SDD não previa isso. É necessário porque o corpo que volta do jsonb não preserva a ordem das chaves (atributos do knowledge graph), e o mesmo conteúdo daria dois hashes.
4. **Extra com zero orgânicos é `missing`**, como o cache já a trata (não grava resposta vazia).
5. **A task recusada pelo provider passa a ter uso registrado** (`failed`). Antes, a normalização lançava antes do registro. HTTP não-OK continua sem registro.
6. **A tela não foi alterada.** `modules/radar` está fora da lista de arquivos deste workflow. O modelo da tela está pronto e testado em `lib/radar/serp-lens-coverage.ts` (§6).

## 6. Tela — pronta no modelo, pendente no componente

`buildRadarSerpLensCoverage(research)` devolve:

- o rótulo `"SERP · K de 4 lentes"` (`"SERP · 1 lente (coleta anterior às quatro lentes)"` no snapshot antigo);
- uma linha por lente com nome ("Desktop · Windows", "Celular · iOS"…) e origem ("Cache · pago pelo Minerador", "Pago nesta coleta · Radar", "Faltou: …");
- `exclusive`: domínios, perguntas e citados pelo AI Overview que apareceram em **uma lente só**;
- a diferença de datas entre lentes, marcada acima de 7 dias;
- frases de limitação ("registro, não reforço").

`radarSerpRecollectConfirmation()` devolve o texto da confirmação com "até 4 chamadas".

**Ligar no componente** (dono: `modules/radar`), sem regra nova, com os tokens de `docs/compartilhado/sistema-visual.md`:

- em `radar-r3-serp-panel.tsx`, bloco "Coleta da SERP": um `<Meta label="Lentes" value={cobertura.label} />`, a lista de `rows` e `exclusive`, e as `notes`;
- um botão secundário "Recoletar agora (pago)", com confirmação por `radarSerpRecollectConfirmation()`, que chama `collectSerp(..., { recollect: true, onOutcome })`;
- a mensagem de "sem mudança" a partir de `onOutcome.unchanged`.

## 7. Medições (offline, fixture advanced desktop-windows; nenhuma chamada)

| Medida | Valor |
| --- | ---: |
| Snapshot com as 4 lentes (janela 10) | 24.662 B |
| `lensSet` inteiro / por lente | 4.602 B / 1.130–1.145 B |
| Entrada de cache canônica paga pelo Radar (depth 20, com corpo) | 35.202 B (corpo 33.887 B) |
| Entrada de cache extra (depth 10, sem corpo, com digest) | ~7.030 B (digest 5.720 B) |

Custo por clique em "Atualizar SERP":

| Caso | Chamadas |
| --- | ---: |
| Minerador (ou Arquiteto) já pagou as 4 lentes em até 30 dias | 0 |
| Nada no cache | 4 (1 × d20 + 3 × d10; US$ 0,0095–0,014, ESTIMADO na SDD §7) |
| Repetido sem mudança | 0 (uma leitura leve) |
| "Recoletar agora (pago)" | 4 |

## 8. Riscos e pendências

1. **Primeira atualização depois da mudança abre versão nova** em todo artigo com snapshot antigo: a fórmula, o endpoint e a janela mudaram. Acontece uma vez, e a curadoria presa ao hash antigo pede revisão, como qualquer versão nova.
2. **"Sem mudança" devolve o snapshot gravado, inclusive rejeitado.** Uma revisão `rejected` continua valendo para o mesmo conteúdo, até alguém revisar de novo.
3. **Depois de uma recoleta idêntica, o cache fica com coletas mais novas que as do snapshot.** Cada "Atualizar SERP" seguinte lê o corpo da canônica (~34 KB) e normaliza para concluir "sem mudança". Custa egress, não chamada.
4. **Extra com corpo gravado e válido não é trocada por uma recoleta sem corpo** (`kept` do store). Hoje nenhum coletor grava corpo nas extras.
5. **Banco fora na leitura do cache:** tudo vira falta, e a coleta paga as 4 lentes (antes pagava 1).
6. **Entradas `radar` alimentam o Minerador (D9).** A exibição de `collectedBy` na Qualificação é do workflow do Minerador.
7. **Ledger (D6):** até a capability existir, nenhum uso do Radar aparece em `integration_usage_events`.
8. **R3 e R4 pendentes:**
   - o bundle congelado e o `FrozenSearch` ainda não copiam as lentes;
   - a auxiliar e o apoio da Amazon ainda usam `regular` sem cache.

## 9. Testes

`tests/radar-serp-quatro-lentes.test.mts` (29 testes, núcleo executado de verdade com banco em memória e `fetch` falso sobre a fixture real):

- pedido (`device` ignorado, recoleta com confirmação);
- chamadas pagas por caso (0, 3, 4), quota igual às faltas, canônica em 20 com `os: windows`, extras em 10 sem corpo e com digest, `collectedBy: radar`, estágio do cache e vínculo com a keyword;
- validade de 30 dias;
- equivalência acerto × coleta, entrada em 20 × em 10, e ordem de chaves do jsonb;
- data `+00:00`;
- `lensSet` sem digest nem ponteiro;
- lacuna declarada (HTTP, task, zero orgânicos);
- canônica recusada sem pagar as extras;
- hash (observação muda, proveniência não, idioma sim);
- legado (legível, sem chave nova, serialização idêntica, primeira atualização abre versão);
- "sem mudança" (atalho sem corpo, por hash, outra versão do DNA);
- recoleta (sem ler cache, igual, diferente);
- códigos do alvo (idioma do alvo, marca, excluída, falha);
- modelo da tela;
- R5 (YouTube e Amazon sem `device`/`os`);
- ordem estrutural no núcleo, na rota e no cliente.

Testes existentes ajustados, sem mudar o que exigem:

- `tests/radar-serp-standing-congelado.test.mts`: as duas asserções estruturais da R1b passam a apontar para `collectRadarSerpLensSnapshot(` (a releitura da trava entre a coleta paga e a gravação continua exigida, e a trava continua antes do núcleo e da leitura dos códigos);
- `tests/radar-188-regressao-start-google.test.mts` (18.8 · C): a âncora do trecho de `collectSerp` deixou de incluir o fechamento dos parâmetros, porque a função ganhou `options`. A ordem memória → cópia local continua exigida.

**Mutantes:** 36, em memória por hook de carga, sem tocar arquivo do repositório, com a suíte verde sob o hook antes. 35 mortos. `L4` (tirar o `status` do hash da lente) é equivalente: `observed` exige observação e `missing` a proíbe, então a observação já o determina.

```text
RADAR_SERP_LENSES = 4 (canônica) · ENDPOINT = advanced · JANELA = 10 · CANÔNICA_PAGA_EM = 20 · EXTRAS_PAGAS_EM = 10 (sem corpo)
CACHE_ANTES_DA_CREDENCIAL = SIM · PAGA_SÓ_FALTAS = SIM · COLLECTED_BY = radar
SNAPSHOT_LENSSET_HAS_DIGEST = NO · SNAPSHOT_POINTS_TO_CACHE = NO · LEGACY_SNAPSHOTS_REHASHED = NO
ATUALIZAR_SEM_MUDANÇA = sem versão · RECOLETA = explícita (4 chamadas) · REFRESH_AFTER_FINALIZE = RECUSADO
AUXILIAR/AMAZON = inalterados (R4) · BUNDLE/FROZENSEARCH = inalterados (R3) · TELA = modelo pronto, componente pendente
MIGRATIONS = 0 · ESCRITA_REMOTA = 0 · SQL_REMOTO = 0 · CHAMADAS_PAGAS = 0
```

## 10. Correções da revisão do R2 (2026-09-23)

Todas aditivas: nenhum campo removido, nenhum `contentHash` gravado recalculado, e o snapshot gravado antes relido não ganha chave.

**Proveniência dos códigos (achado 1).** `cacheProvenance` ganha `locationCode`, `languageCode`, `codesSource` (`keyword_targeting` | `environment`) e `snapshotOpenedAt`, todos opcionais. `location`/`language` do snapshot continuam o texto do pedido ("Brasil", "pt-BR"). Os códigos gravados são os que a consulta, a chave do cache e o hash usaram. A rota passa `codesSource: alvo.source` ao núcleo.

**Data da SERP × data da versão (achado 2).** Com cache, uma versão nova pode trazer `collectedAt` anterior ao da versão que substituiu, porque `collectedAt` é quando o provider observou a SERP. A data da versão fica à parte, em `cacheProvenance.snapshotOpenedAt`. O modelo da tela (`buildRadarSerpLensCoverage`) expõe `serpObservedAt` e `versionOpenedAt`. O rótulo correto é "SERP observada em". A ordenação por versão não mudou.

Fica para os donos:
- `lib/radar/portable-serp-observed.ts`, arquivo do workflow de export: em `radarPortableNewerSerpCollection`, rotular a data como "SERP observada em", ou ler `snapshotOpenedAt`;
- `modules/radar`: fazer o mesmo na tela.

**Lacuna definitiva não é paga a cada clique (achado 3).** A lente faltante ganha `missingKind` e `attemptedAt`, os dois opcionais e fora do hash. Os tipos:
- `provider_refused`: task 40xxx;
- `no_organic`;
- `request_failed`: rede, HTTP ou task 50xxx;
- `not_observed`.

A lacuna definitiva (recusa 40xxx ou zero orgânico) de um snapshot anterior comparável é copiada como está, desde que o cache continue sem a lente. Nesse caso nada é pago, e o atalho de metadados aceita a lacuna. Com a lente, o clique repetido sai com 0 chamadas, sem ler corpo, sem credencial e sem quota.

A lente volta a ser tentada:
- com "Recoletar agora (pago)";
- quando outro módulo grava a lente no cache, que é lido primeiro;
- quando a pergunta muda (outra versão do ArticleDNA ou do KeywordDNA).

Falha transitória é sempre tentada de novo. Lacuna gravada antes de `missingKind` é lida pelo texto que o próprio núcleo escreveu: `(provider 4xxxx` indica recusa, e a frase da SERP vazia indica zero orgânico.

**Desvio da sugestão do revisor.** Não há janela de 24 h. "Sem mudança" devolve o snapshot anterior sem gravar, então não existe onde guardar a data de uma nova tentativa. Uma janela contada da tentativa gravada venceria uma vez, e dali em diante cada clique voltaria a pagar a lente. O teste cobre 25 h e 5 dias depois, com 0 chamadas.

**Cache indisponível (achado 4).** O núcleo já devolvia `cacheReadFailed`, mas a rota o descartava. Agora `lensCoverage` traz `cacheReadFailed` e `reusedLensGaps`, e `radarSerpCollectOutcome` os repassa ao cliente.

O comportamento continua o mesmo: com o cache indisponível, as 4 lentes são pagas (antes do R2 era 1). O teste de custo fixa quota 4 e 4 usos. Pagar só a canônica nesse caso abriria uma versão com 3 lacunas e, no clique seguinte com o cache de volta, outra versão. Por isso a escolha fica como decisão do usuário:
- **D11**: com o cache indisponível, pagar as 4 lentes (atual) ou só a canônica.

**Achado 5 (consumidores em `modules/radar`)**, registrado para o dono da tela:
- o lote `explicit_refresh` chama `collect` sem `recollect`, então passou a ser cache primeiro;
- os avisos "SERP real vN coletada" e o `setState(WAITING_REVIEW)` não leem `onOutcome.unchanged` nem `paidCalls`;
- o apoio Google de YouTube e Amazon (`coletarSerpDoProvider`) passa a pagar até 4 chamadas.

A correção proposta:
- `explicit_refresh` passa `recollect: true` depois de `radarSerpRecollectConfirmation()`, ou é renomeado para "Atualizar (cache primeiro)";
- os avisos e o estado local passam a usar `onOutcome`;
- a confirmação do apoio diz "até 4 chamadas".

**Testes novos** em `tests/radar-serp-quatro-lentes.test.mts`, que passa de 29 para 38 testes:
- a proveniência dos códigos, com a legada sem chave nova;
- a data da SERP separada da data da versão;
- a lacuna recusada: 0 chamadas no 2º clique, 25 h depois e 5 dias depois; a recoleta paga 4;
- a lacuna copiada numa versão nova;
- a falha transitória e a lente que chega ao cache;
- a regra pura e a leitura da lacuna legada;
- o cache indisponível: quota 4 e `cacheReadFailed`;
- a estrutura da rota;
- a task 50xxx como transitória.

Também foram ajustadas 3 asserções existentes (campos aditivos em `cacheProvenance` e no resultado da coleta) e acrescentado o tipo na lacuna de SERP vazia.

**Mutantes.** 20 mutantes em memória, pelo hook `scratchpad/r2/mut-register.mjs`, mais um mutante nulo de controle, que ficou verde (38/38). Nenhum arquivo do repositório foi tocado. Os 20 morreram.
