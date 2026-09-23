# SDD — Radar nas quatro lentes, com cache primeiro — 2026-09-23

## Identificação

- **Módulo proprietário:** Radar.
- **Consumidores afetados:** Planejador/Redator (leitura passiva do bundle congelado), Minerador (lê entradas de cache que o Radar passaria a gravar), Arquiteto (divide as mesmas entradas).
- **Arquivos compartilhados tocados pela implementação:**
  - `lib/editorial/serp-cache.ts` e `lib/server/serp-cache*.ts`, com mudança aditiva;
  - `lib/editorial/contracts.ts`, só a parte da SERP.
- **Precedência:** abaixo das invariantes (27, 30, 35, 50, 51, 57, 59), da SDD de egress e da [SDD do cache](../../compartilhado/sdd-cache-serp-temporario-2026-09-23.md). Ela obedece a esta última e a estende de forma aditiva.
- **Estado:** **PROPOSTA.** Nada foi implementado. Nenhuma migration, nenhuma escrita remota, nenhuma chamada paga. O banco foi lido só com SQL agregado (duas consultas, §1.6).

### Autorização registrada

- Diretriz do dono do produto, 2026-09-23: *"utilizar as 4 lentes em todas as áreas e em todos os processos da plataforma"*.
- Em seguida, no mesmo dia, depois de rodar o dry-run do backfill do Minerador: *"sim, pode continuar em todas, Arquiteto, radar, e redator"*.
- **O que essa autorização cobre:** a direção (Radar nas 4 lentes, cache primeiro) e a escrita desta SDD.
- **O que ela não cobre:**
  - o código de R1, R2 e R3: a mudança é estrutural (contrato de pedido, snapshot `.strict()`, bundle congelado, significado do `serpStanding`), e pelo AGENTS §4 e pela seção de governança isso exige **aprovação desta SDD antes do código**;
  - nenhuma chamada paga, nem mesmo de medição;
  - nenhuma operação remota (capability, SQL).
- **As decisões pendentes estão na §11.**

---

## 1. Contrato atual (verificado no código)

### 1.1 Coleta da SERP canônica do artigo

Rota: `app/api/editorial/serp/route.ts`, `POST`, `action: "collect"`, linhas 488–527.

- **Pedido.** O pedido (`lib/radar/serp/request.ts:82-90`) exige `device: "desktop" | "mobile"`. O cliente envia sempre `"desktop"`, `language: "pt-BR"` e `location` da marca (`components/editorial-pipeline-context.tsx`: `collectSerp`, perto da linha 925; `collectAuxiliarySerp`, perto da 970).
- **Sem sistema operacional, endpoint regular, sem cache.** A rota monta o `SerpSearchInput` sem `operatingSystem`. Chama `collectDataForSeoSerpSnapshot` sem `payloadDepth`, ou seja, com o `regular` (`lib/server/dataforseo-serp-operation.ts:120`). O `resultLimit` vem de `SERP_DEFAULT_RESULTS`, com padrão 10.
- **Credencial e quota.** `resolveDataForSeoCanonicalSerpCompatibilityConfig({ quotaUnits: 1 })` é chamada **antes** de qualquer outra coisa, com capability `dataforseo.serp_compatibility`.
- **Versão nova a cada clique.** Todo clique pago gera uma **versão nova** (`version: lastVersion + 1`), com status `needs_review`, e grava em `editorial_serp_snapshots`. Não existe caminho sem versão nova.
- **A trava não é consultada.** A rota não pergunta se a investigação está congelada. A trava `radarGoogleResearchWriteLock` (`lib/radar/google-research-write-lock.ts:104-144`, campos em `:48-66`) só é chamada por `app/api/editorial/radar-analysis/route.ts:133-136`.

### 1.2 Pesquisa auxiliar e apoio do Google ao perfil Amazon

- **Auxiliar** (`route.ts:409-486`):
  - mesmo caminho da canônica: `regular`, desktop, sem `os`, sem cache;
  - não vira snapshot: volta como `not_persisted_as_article_snapshot` e fica fora de `serpRecords`.
- **Apoio Amazon** (`lib/server/radar-support-research.ts`):
  - se já existe snapshot real do artigo, **reaproveita** o último (linhas 44–52);
  - senão, paga `regular` com `device: "desktop"` fixo e `language: "pt-br"`, e grava uma versão nova.

### 1.3 Snapshot

`SerpResearchSnapshotSchema` (`lib/radar/serp/contracts.ts:87-143`) é `.strict()`.

- **Campos atuais:**
  - `operatingSystem` é opcional, com padrão `null`;
  - `providerEndpoint` é o literal `"/search"`;
  - não há campo de lente extra, de profundidade do provider nem de proveniência de cache.
- **Registro que embrulha o snapshot.** `SerpCollectionRecordSchema` (`lib/editorial/contracts.ts:64-73`) o embrulha e é validado **no cliente** também (`editorial-pipeline-context.tsx`).
- **O que o hash cobre.** `contentHash` (`lib/server/dataforseo-serp-normalizer.ts:196`) cobre:
  - consulta, códigos de local e idioma, `device`, `operatingSystem`;
  - orgânicos, PAA, relacionadas, knowledge graph;
  - `diagnostic`.

  Ele **não** cobre `serpFeatures`, `collectedAt` nem `providerRequestId`. O `diagnostic` depende do artigo (`expectedIntent`, `requiredTopics`), então o hash também depende.
- **Quem se prende ao hash:**
  - `analysis.serpSnapshotHash`;
  - a curadoria (`lib/radar/serp-curation.ts:38,128`);
  - a extração (`lib/radar/extraction-request.ts:188`);
  - a autoridade remota (`lib/radar/remote-authority.ts:223`);
  - `evidence-bundle-runtime.ts:384`.

### 1.4 Congelamento e dossiê

- **Onde o FINALIZE acontece.** `freezeRadarEvidenceBundle` (`lib/radar/investigation-finalization.ts:405-…`) é chamada no cliente (`modules/radar/radar-page.tsx:3106`). A escrita passa pela rota de análise, que aplica a trava.
- **O bundle congelado.** `RadarFrozenEvidenceBundleSchema` e `FrozenSearchSchema` são `.strict()`. O `bundleHash` é FNV sobre a serialização canônica de **todas as chaves presentes** (`:376-390`).
- **Nenhum registro de lente nem de standing.** O bundle não registra lente nem `serpStanding`.
- **O dossiê é remontado a cada entrega.** `lib/server/radar-canonical-dossier.ts:131-156` remonta o dossiê a partir do payload congelado a cada entrega (invariante 51).
  - **O standing é fixo hoje.** O builder usa `serp: { current: true, sufficient: true, valid: true }` por padrão (`lib/radar/evidence-bundle-runtime.ts:425`). Portanto, todo dossiê declara a SERP **autoritativa** (`evidence-authority.ts:268-292`).
  - **O standing entra na identidade.** `serpStanding` faz parte do bundle V3, e o hash do dossiê cobre todas as chaves (`evidence-bundle.ts`, `canonico`).

### 1.5 Ledger de uso

- **Regra da gravação.** `recordIntegrationUsageForResource` devolve `null` sem gravar quando `resource.capability` é nulo (`lib/server/integrations-runtime.ts:1034`).

### 1.6 Medições desta SDD

| Medida | Valor | Como |
| --- | ---: | --- |
| Capabilities DataForSEO no catálogo | só `dataforseo.allintitle` (production) | **MEDIDO**: SQL agregado em `integration_capabilities` |
| Eventos no ledger por módulo | arquiteto 307, minerador 924, **radar 0** | **MEDIDO**: SQL agregado em `integration_usage_events` |
| Snapshot legado (`regular`) | ~10,8 KB | MEDIDO no plano, 10 snapshots remotos |
| Snapshot `advanced`, corpo podado depth 20 | 20.980 B (`serpFeatures` 12.690 B) | **MEDIDO** offline na fixture `dataforseo-google-skincare-facial-advanced-desktop-windows.json` |
| Snapshot `advanced`, corpo recortado a 10 | 19.622 B | **MEDIDO**, mesma fixture |
| Observação de cache (1 lente) | 929 B | **MEDIDO**, mesma fixture |
| `organicDigest` (1 lente) | 5.612 B | **MEDIDO**, mesma fixture |
| Corpo podado depth 20 / depth 10 | 33.512 B / 26.179 B | **MEDIDO**, mesma fixture |
| Hash do corpo cru vs. do corpo podado (depth 20) | **igual** | **MEDIDO**: a poda é neutra para o normalizador |
| Hash depth 20 vs. o mesmo corpo recortado a 10 | **diferente** | **MEDIDO**: só `diagnostic.rawItemTypeCounts` muda (organic 18→10, popular_products 6→5) |

**Leitura das medições:**

1. **Radar sem ledger e sem quota.** A falta de eventos do Radar é explicada: `dataforseo.serp_compatibility` não existe no catálogo. A capability resolvida é nula, e a linha 1034 descarta o evento. As rotas de YouTube e Amazon do Radar usam o mesmo resolvedor. **Consequência provável, ainda não verificada:** sem `capability_id`, nenhuma política de quota se aplica ao Radar.
2. **O hash depende da janela de profundidade.** Para o acerto de cache e a coleta nova produzirem o **mesmo** snapshot, a normalização precisa de uma janela fixa (R2.5).

---

## 2. Problema

1. **Uma só lente.** O Radar lê só `desktop` sem `os`, no `regular`. O `regular` anuncia PAA e AI Overview e não os entrega: foram 0 perguntas contra 4, medido em 2026-09-20.
2. **Paga de novo o que já está pago.** O Radar paga uma SERP que o Minerador já coletou nas 4 lentes em até 30 dias.
3. **"Atualizar SERP" abre versão nova sempre.** Isso acontece até sob investigação congelada: a rota não consulta a trava.
4. **O dossiê declara a SERP sempre autoritativa.** Se o `serpStanding` fosse calculado **na leitura**, como o plano original propunha, um artigo finalizado passaria a entregar outra conclusão e outro hash com o tempo, violando as invariantes 30, 57 e 59 e a etapa identity/hash da 51.
5. **O gasto do Radar não aparece em lugar nenhum** (§1.6).

---

## 3. Proposta

### R1 — `serpStanding` calculado UMA vez, no FINALIZE

1. **Onde é calculado.** `freezeRadarEvidenceBundle` recebe o necessário e grava no bundle congelado a chave **opcional** `serpStanding`:

   ```text
   serpStanding: {
     current, sufficient, valid, authoritative, reason,
     basis: { snapshotId, snapshotHash, reviewStatus, sufficiencyLevel }
   }
   ```

   O cálculo é `radarSerpEvidenceStanding` (`evidence-authority.ts:268`), sem regra nova.
2. **Entradas, avaliadas no instante do congelamento:**
   - **`current`**: `true` por construção. A prontidão já recusa congelar investigação `stale` (`investigation-finalization.ts`, `radarFinalizationReadiness`). Um ArticleDNA que muda depois é tratado pelo vínculo do dossiê (invariante 56), não pelo standing.
   - **`sufficient`**: `sufficiency.level ∈ {SUFFICIENT, PARTIAL_BUT_USABLE, CONFLICTING_SEARCH_INTENT}`, e `false` em `INSUFFICIENT`. `BLOCKED` não congela. **Decisão D2.**
   - **`valid`**: todas as condições abaixo são verdadeiras:
     - o snapshot canônico é real e não é mock;
     - o `contentHash` dele é igual a `analysis.serpSnapshotHash`;
     - `research.articleDnaVersionId` é igual ao `binding.articleDnaVersionId`;
     - a revisão **não** está `rejected`.

     `needs_review` conta como válida. **Decisão D1:** exigir `approved` tiraria a autoridade de 10 de 10 snapshots remotos, todos em `needs_review` (MEDIDO no plano). Isso seria mudança de significado (invariante 35).
3. **O dossiê só lê a cópia congelada.** `radar-canonical-dossier.ts` passa a mandar ao builder `payload.finalizedBundle.serpStanding` quando existe. **Nada é calculado na leitura.** Tempo, snapshot novo e revisão posterior não mudam a conclusão nem o hash.
4. **Bundles antigos**, sem a chave: o builder continua com o padrão legado `{true, true, true}`, **byte a byte**. O hash de todo dossiê já entregue permanece idêntico (invariantes 57 e 59). A tela pode mostrar "standing não avaliado (congelado antes de 2026-09-23)" **fora** do bundle. **Decisão D3.**
5. **Chave ausente, nunca `null`.** A chave só existe quando foi avaliada. Gravá-la nula mudaria a serialização de bundles que não mudaram, pelo mesmo padrão de `keywordContext` (`evidence-bundle-runtime.ts:431-438`).

### R1b — trava `FINALIZED_LOCKED` na rota da SERP

1. **Onde a trava entra.** `app/api/editorial/serp/route.ts` consulta a investigação corrente, pela mesma leitura da rota de análise (`findCurrentRadarAnalysisForWriteLock`), e aplica `radarGoogleResearchIsFinalized`. A consulta vem **antes** de ler o cache, resolver credencial ou chamar o provider.
2. **Recusas com 409 e `code: RADAR_GOOGLE_RESEARCH_FINALIZED`** (estado `FINALIZED_LOCKED`):
   - `collect`, **inclusive quando tudo viria do cache**, porque um hash diferente abriria versão nova sob investigação congelada;
   - `collect_auxiliary`;
   - "Recoletar agora (pago)".
3. **Continua livre:** `review`, que é anotação e não troca a amostra, e o `GET` de leitura e recuperação.
4. **Destravar é só por reabertura.** Reabrir, que limpa o `finalizedBundle`, destrava sem segundo mecanismo, como já acontece na rota de análise.

### R2 — pedido com lentes decididas no servidor e cache primeiro

1. **Pedido.**
   - `device` deixa de ser lido. Ele continua **aceito e ignorado** durante a transição, para um cliente antigo não receber 400.
   - Entra `recollect: { confirmed: true }` opcional, o "Recoletar agora (pago)". Sem ele, **nunca** se paga uma lente presente e válida.
   - As lentes são `SERP_CACHE_LENSES`, decididas no servidor. O cliente não escolhe lente, endpoint nem profundidade.
2. **Alvo da consulta.**
   - Locale e idioma vêm de `readDataForSeoTargetCodes(env)`, a mesma função do Minerador. Assim as chaves de cache coincidem: um idioma diferente divide a chave, e o acerto some.
   - Endpoint: `advanced` nas 4 lentes.
3. **Cache primeiro, antes de credencial e quota:**
   - **canônica** (`desktop-windows`): `lookupSerpCache` em modo `body` com pedido de profundidade 10, atendido por qualquer entrada ≥ 10, inclusive a do Minerador (20);
   - **extras:** modo `observation`, sem `digest`, que o Radar não lê;
   - a validade usa `maxAgeMs` do Radar (**Decisão D4**, padrão 30 dias do cache).
4. **Faltas.**
   - Só depois do cache resolve-se a credencial, com `quotaUnits` = número de lentes faltantes.
   - **A canônica paga em profundidade 20**, para a CALL 3 do Minerador não pagar de novo: a escrita recusa entrada mais rasa, conforme `serp-cache-store.ts`.
   - As extras pagam em 10, com `storeBody: false`. O digest é gravado pelo próprio `collectAndCacheSerp`, como já acontece com o Arquiteto.
   - `collectedBy: "radar"`, estágio `minerador`, que é o estágio do cache.
   - Falha numa extra vira lacuna declarada e não derruba a canônica.
5. **Normalização determinística:**
   - o snapshot sai **sempre** de `trimSerpBodyToDepth(pruneSerpBody(corpo), 10)`, venha o corpo de uma coleta agora ou de um acerto;
   - `collectedAt` do snapshot = `meta.collectedAt` da entrada, normalizado por `new Date(x).toISOString()`, para aceitar `+00:00`;
   - pela medição da §1.6, sem essa janela fixa o mesmo corpo em depth 20 e em depth 10 dá hashes diferentes.
6. **Snapshot com a proveniência e as lentes COPIADAS.** Todos os campos novos são opcionais em `SerpResearchSnapshotSchema`:
   - `payloadDepth: "advanced"`;
   - `providerDepth`: a profundidade gravada na entrada usada;
   - `cacheProvenance: { source: "cache" | "paid", collectedBy, providerRequestId, cacheCollectedAt }`, **sem** id de entrada de cache, porque ele seria ponteiro;
   - `lensSet: { version: "radar-lens-set-v1", lenses: [...] }`, com as 4 lentes na ordem de `SERP_CACHE_LENSES`. Cada lente leva `{ lens, status: "observed" | "missing", missingReason?, source, collectedBy, collectedAt, depth, providerRequestId, observation? }`.
   - A `observation` é a `SerpCacheObservation` copiada, com ~0,93 KB. **Ela nunca leva o `digest`**, e a observação da canônica também entra, para comparação uniforme.
7. **Hash cobrindo as lentes.**
   - Para snapshot com `lensSet`, o `contentHash` passa a incluir `endpoint: "advanced"` e, por lente, `{ lens, status, observation }`. `collectedAt` e `providerRequestId` ficam fora, como já ficam hoje na canônica.
   - Snapshot sem `lensSet` mantém a fórmula atual. **Nenhum hash gravado é recalculado.**
8. **"Atualizar SERP" sem versão nova quando nada muda:**
   - **leitura só de metadados primeiro:** se as 4 lentes do cache têm o mesmo `providerRequestId` e `collectedAt` que o `lensSet` do último snapshot, a rota devolve o registro anterior com `unchanged: true`, sem ler o corpo;
   - **caso contrário,** normaliza. Se o `contentHash` sair igual ao do último snapshot, também devolve `unchanged: true` e **não grava**;
   - **só um hash diferente abre versão nova.**
9. **"Recoletar agora (pago)".**
   - É um botão separado de "Atualizar SERP", com confirmação que mostra "até N chamadas pagas". Ele passa `refresh: true` ao `lookupSerpCache`.
   - Padrão: as 4 lentes, para manter as datas alinhadas. **Decisão D5:** a alternativa é só a canônica.
   - É recusado depois do FINALIZE (R1b).
   - Nunca é disparado por diferença de datas entre lentes. Datas com mais de 7 dias de diferença só são **marcadas** (AGENTS §7).
10. **Uso registrado.**
    - Um `recordIntegrationUsage` por chamada paga, com `metadata { operationKind, articleId, lens, snapshotId, cacheHits }`. A chave de idempotência inclui o rótulo da lente.
    - Acerto não registra uso (SDD do cache, §2).
    - **Enquanto a capability não existir (§1.6), o registro continua sendo descartado.** **Decisão D6.**

### R3 — bundle congelado e FrozenSearch com as lentes copiadas

1. **`FrozenSearchSchema` ganha a chave opcional `lenses`** quando o snapshot canônico da rodada tem `lensSet`:

   ```text
   lenses: {
     canonicalSnapshotId, canonicalSnapshotHash, lensSetHash,
     lenses: [ { label, status, source, collectedBy, collectedAt, organicCount,
                 competitorDomains, aiOverviewDomains, questions, itemTypes,
                 commercialSignals } ],
     auxiliary: [ { keywordId, snapshotHash, lensesObserved } ],
     datesSpreadDays
   }
   ```

   A chave fica **ausente**, não `null`, em rodada sem lentes, e o hash dos bundles antigos não muda.
2. **Cópia, nunca ponteiro (invariante 30).** O bundle guarda os valores. Regravar ou vencer a entrada de cache não altera o `bundleHash`, e existe teste para isso.
3. **O dossiê V3 ganha a chave opcional `serpLenses`.** Ela é lida **só** do bundle congelado, e o Planejador e o Redator a recebem por ele. Eles não chamam provider (invariante 50; E1 do Redator).
4. **A lente é registro, não reforço.**
   - Concordância e divisão entre aparelhos são **registradas**, não reforçam conclusão: é a mesma regra do Minerador (`LENS_AGREEMENT_IS_REINFORCEMENT = NO`).
   - O `diagnostic` e a leitura competitiva continuam saindo da canônica.
   - Divergência entre lentes vira limitação escrita, nunca resolução silenciosa (invariante 27).

### R4 — pesquisa auxiliar e apoio Amazon pelo mesmo caminho

1. **Auxiliar.** Usa o mesmo núcleo de R2: cache primeiro, 4 lentes, canônica paga em 20.
   - Continua **fora** de `serpRecords` e fora da cadeia de versões. O merge por posição (`lib/radar/serp-merge.ts:66-76`) misturaria lentes.
   - O `lensSet` volta na resposta e entra no registro da investigação (`RadarQueryEvidence`), como cópia.
   - **Decisão D7:** 4 lentes na auxiliar, pela diretriz, ou só a canônica, para reduzir o custo no KGR.
2. **Apoio Amazon.**
   - Continua reaproveitando o último snapshot do artigo.
   - Sem snapshot, usa o núcleo de R2, e não mais `regular` com desktop fixo.
   - O idioma sai de `readDataForSeoTargetCodes`, não do literal `"pt-br"`.
3. **Um núcleo só.** O núcleo fica numa função server-only do Radar (por exemplo `lib/server/radar-serp-lenses.ts`), chamada pelas três portas. Isso evita a segunda cópia da regra.

### R5 — YouTube e Amazon Merchant em lente única

1. **Nada muda nos pedidos** de `/v3/serp/youtube/organic/live/advanced` e de `/v3/merchant/amazon/products/live/advanced`: continuam sem `device` e sem `os`.
2. **O eco não prova efeito.** O eco `desktop/windows`, ou `mobile/android` numa fixture manual, prova só que o campo existe na task. Não prova que os itens mudam nem que macOS e iOS são aceitos.
3. **Enquanto não houver medição:** lente única, com o eco gravado na proveniência.
4. **Adoção:** só depois de 1 a 4 chamadas **autorizadas** com os smokes existentes (`scripts/radar-youtube-smoke.mts`, `scripts/radar-amazon-discovery.mts`), e por adendo a esta SDD. **Decisão D8.**

---

## 4. Consumidores

| Consumidor | Hoje | Depois | Preservação |
| --- | --- | --- | --- |
| `modules/radar/*` (painel SERP, workbench, lote "Atualizar SERP selecionada") | lê `SerpCollectionRecord` | lê os mesmos campos; mostra lentes, idade e "sem mudança" | campos novos opcionais; a tela antiga ignora |
| Curadoria, extração, autoridade remota (presas ao `serpSnapshotHash`) | versão nova a cada clique | versão nova só com hash novo | **menos** invalidação: um clique sem mudança não troca o hash sob a curadoria |
| `radar-canonical-dossier.ts` e o envio ao Redator (inv. 51) | standing fixo | standing lido do bundle; legado idêntico | hash dos dossiês já entregues inalterado (teste dourado) |
| Planejador/Redator | bundle V3 | `serpLenses` opcional | chave ausente em legado |
| Minerador (CALL 3 e v4) | lê entradas `minerador`/`arquiteto` | também lê as `collectedBy: "radar"` | **depende de mudança no Minerador:** mostrar `collectedBy` na proveniência da Qualificação (verificadores, AGENTS §3); ver D9 |
| Arquiteto (formação, territorial, SERP por keyword) | divide o cache | idem | sem mudança de contrato; entrada canônica do Radar em depth 20 atende a todos |
| Exclusão de keyword | remove entradas por `source_entity_id` | idem: o Radar grava `keywordId` da principal/auxiliar | igual à SDD do cache |

---

## 5. Compatibilidade

- **Snapshots antigos** (`regular`, sem `operatingSystem`, sem `lensSet`) continuam legíveis. Os campos novos têm `.optional()` ou `.default(null)`, e nenhum `contentHash` gravado é recalculado.
- **Primeira atualização depois da mudança.** Num artigo com snapshot legado, a primeira "Atualizar SERP" **sempre** abre uma versão nova, porque a fórmula e o endpoint mudaram. Isso acontece uma vez só e fica declarado. A curadoria presa ao hash antigo pede revisão, como qualquer versão nova.
- **Bundles antigos** não são reescritos: sem `serpStanding` e sem `lenses`, o dossiê é montado exatamente como hoje (R1.4).
- **`.strict()` em cliente e servidor.** O Next entrega os dois juntos. O risco está numa cópia local (`localStorage`) com campos novos lida por código antigo depois de um rollback, e o rollback (§8) trata disso.
- **Cache.** A mudança é aditiva: `collectedBy: "radar"` já existe no enum (`SerpCacheCollectorSchema`). Nenhuma mudança de schema do cache é exigida. Se for preciso expor `maxAgeMs` ou a leitura só de metadados em lote, a mudança é aditiva, dentro de `lib/server/serp-cache*.ts`.
- **Migration:** nenhuma. Os campos novos vivem no `payload` jsonb de `editorial_serp_snapshots` e de `editorial_workflow_items`.

---

## 6. Riscos

1. **O conteúdo da SERP muda ao trocar de endpoint.** A troca de `regular` para `advanced` faz aparecerem PAA e citações de AI Overview. `diagnostic`, `rawItemTypeCounts` e o veredito podem mudar em relação aos snapshots antigos. É o objetivo, e fica declarado.
2. **Efeito entre módulos.** Uma SERP paga pelo Radar pode virar Qualificação nova no Minerador, na próxima execução de Resultados, e rebaixar uma aprovada. **Mitigação:** `collectedBy` visível. **Opção D9:** o Minerador ignora as entradas `radar`.
3. **Ordem de profundidade.** Um coletor que grave a canônica em depth 10 obriga a CALL 3 a pagar de novo. O Radar paga em 20 (R2.4). O Arquiteto está na onda 2 do outro workflow.
4. **Janela sem digest.** Entradas extras gravadas antes do digest contam como `missing_digest` para o Minerador. O Radar lê em modo `observation` e **as aceita**: ele não paga de novo por falta de digest.
5. **Quota e ledger.** Sem a capability `dataforseo.serp_compatibility`, o Radar não tem registro de uso e provavelmente não tem quota (§1.6). O cache reduz o gasto, mas não fecha a lacuna.
6. **Egress.** `SerpSnapshotRepository.list` relê **todas** as versões, e o snapshot cresce de ~10,8 para ~23 KB (ESTIMADO: 19,6 KB MEDIDO + lensSet de 4 × 0,93 KB MEDIDO + metadados). O R2.8 reduz as versões novas.
7. **Concorrência.** Dois cliques simultâneos pagam duas vezes. A segunda gravação no cache vira `concurrent`. `claimSerpAction` no cliente continua sendo a primeira barreira.
8. **Hash por conteúdo.** Uma recoleta idêntica não abre versão, e a idade exibida continua a da versão gravada: conservadora, nunca mais nova que a real. **Decisão D10.**

---

## 7. Custo por artigo

**Preços:**
- `advanced` em depth 20 custa US$ 0,0035 (campo `cost` da fixture, MEDIDO).
- depth 10 **não foi medido**:
  - estimativa por página de 10: ~US$ 0,002;
  - teto: US$ 0,0035.
- O preço do `regular`, usado hoje, não está no repositório.

| Cenário | Chamadas | US$ |
| --- | ---: | ---: |
| Hoje, por clique em "Atualizar SERP" | 1 `regular` | não medido, fora do ledger |
| Principal com Minerador/Arquiteto rodados em até 30 dias | 0 | 0 |
| Principal com tudo faltando (1 × d20 + 3 × d10) | 4 | 0,0095–0,014 (ESTIMADO) |
| Artigo com k keywords, auxiliares nas 4 lentes, tudo faltando | 4k | k × 0,0095–0,014 |
| Pior caso KGR (k = 6) | 24 | 0,057–0,084 (ESTIMADO) |
| Idem, com auxiliares só na canônica (D7) | 4 + (k−1) = 9 | 0,027–0,032 (ESTIMADO) |
| "Recoletar agora (pago)", 4 lentes | 4 | 0,0095–0,014 |
| "Atualizar SERP" repetido sem mudança | 0 | 0; lê só metadados (~1 KB) |

**Banco, quando o Radar paga:**
- canônica: corpo podado de 33,5 KB;
- cada extra: observação + digest, ~6,5 KB;
- snapshot: ~23 KB por versão.

**Egress num acerto que muda o hash:** corpo canônico de 33,5 KB + 3 × 0,93 KB ≈ 37 KB por keyword.

---

## 8. Rollback

- **Comportamento.** Voltar a rota ao caminho `regular` e sem cache. **Os campos novos dos schemas ficam**: snapshots e bundles já gravados com `lensSet`, `serpStanding` e `lenses` precisam continuar legíveis pelo `.strict()`.
- **Standing.** Remover a leitura de `finalizedBundle.serpStanding` no dossiê **não** pode ser feito para bundles que já o têm: mudaria o hash entregue (invariante 59). O rollback de R1 só impede **novos** congelamentos de gravarem a chave.
- **Entradas de cache `radar`.** Continuam válidas para os outros módulos e somem por idade ou por exclusão da keyword. A limpeza é do usuário.
- **Trava (R1b).** É só recusa e pode ser removida sem efeito em dados.

---

## 9. Testes

Todos usam fixture e mock, sem rede e sem chamada paga. Os arquivos são `tests/radar-*.test.mts` e `tests/serp-cache*.test.mts`. Os testes estruturais são feitos sobre código sem comentários, e os timestamps usam `+00:00`.

1. **Pedido.** `device` é ignorado. As lentes, o endpoint `advanced` e a profundidade são decididos no servidor. Um cliente antigo com `device: "mobile"` não muda a lente.
2. **Cache antes da credencial.** Com as 4 lentes em cache, o resolvedor de credencial **não** é chamado e a quota não é lida.
3. **Quota e cobrança.**
   - A quota é igual ao número de faltas.
   - A canônica é paga em depth 20 com `os: windows`.
   - As extras são pagas em depth 10, com `storeBody: false`.
   - O `collectedBy` gravado é `radar`.
4. **Equivalência.** O snapshot de um acerto é **igual** ao de uma coleta nova sobre o mesmo corpo da fixture, com o mesmo `contentHash`, janela de 10 e entrada depth 20 ou 10.
5. **`lensSet`.** Não contém `digest`, conferido pelas chaves. Tem 4 lentes na ordem canônica. Lente faltante é declarada com motivo.
6. **Hash.**
   - Mudar a observação de uma extra muda o `contentHash`.
   - `collectedAt` e `providerRequestId` não mudam o hash.
   - Snapshot legado mantém o hash gravado.
7. **Sem mudança, sem versão.** Um hash igual devolve `unchanged: true` e não chama `save`. Os metadados iguais não leem o corpo.
8. **Trava `FINALIZED_LOCKED`.**
   - `collect`, `collect_auxiliary` e o recoletar são recusados com `RADAR_GOOGLE_RESEARCH_FINALIZED`, **antes** do cache, com tudo em cache inclusive.
   - `review` continua permitido.
9. **Recoletar.** Exige `recollect.confirmed`. Sem essa confirmação, nunca paga lente válida. Diferença de datas só marca.
10. **Uso.** É registrado só para chamada paga, com a lente na metadata e idempotência por lente.
11. **Standing (R1).**
    - O standing é congelado no FINALIZE.
    - O dossiê de um bundle novo **não muda** de hash com o tempo, com snapshot novo nem com revisão posterior.
    - Um bundle antigo sem a chave dá o dossiê **byte a byte igual** ao de hoje (teste dourado).
12. **Cópia, não ponteiro (R3).** Regravar a entrada de cache depois do FINALIZE não altera o `bundleHash` nem o `serpLenses` do dossiê.
13. **Auxiliar.** Fica fora de `serpRecords` e leva o `lensSet` na resposta.
14. **Apoio Amazon.** Reaproveita o snapshot existente e usa o núcleo de R2 sem ele.
15. **YouTube e Amazon Merchant.** O corpo do pedido fica inalterado, sem `device` nem `os`.
16. **Mutantes** do núcleo, da trava, do hash e do standing, rodados em cópias no scratchpad, com a suíte verde antes.
17. **Suítes, comparadas por nome com a linha de base:**
    - `npm run test:radar` (2313/2313);
    - `npm run test:serp-cache`;
    - `npm run test:editorial` (4 falhas anteriores);
    - Minerador `tests/minerador-*.test.mts` (28 anteriores).

    Também `npx tsc --noEmit` e ESLint nos arquivos tocados.

**Validação manual, pelo usuário:**
1. "Atualizar SERP" num artigo cujas keywords já passaram por Resultados:
   - 0 chamadas;
   - 4 lentes do cache;
   - versão nova só na primeira vez.
2. Repetir: a resposta traz `unchanged` e não cria versão.
3. Finalizar e tentar "Atualizar SERP": o pedido é recusado.
4. Conferir `serpStanding` e `lenses` no `finalizedBundle`.

---

## 10. Fora desta SDD

1. **Capability `dataforseo.serp_compatibility`** no catálogo. É operação remota do usuário, na fundação de integrações congelada, e pede gate próprio (D6).
2. **Minerador exibindo `collectedBy`** na proveniência da Qualificação. É do workflow do Minerador (D9).
3. **Adendo à SDD do cache** registrando o Radar como consumidor ligado. É do coordenador, ao implementar.
4. **Medição de `device`/`os` no YouTube e na Amazon** (D8).
5. **Atualização de `spec.md`, `estado-atual.md` e `backlog.md` do Radar.** É do coordenador.

---

## 11. Decisões do usuário

- **D0.** Aprovar esta SDD, R1 a R4, antes de qualquer código.
- **D1.** Definir `valid` no standing.
  - **Recomendado:** "não rejeitada", com `needs_review` válida.
  - **Alternativa:** exigir `approved`, que tira a autoridade de 10 de 10 snapshots.
- **D2.** Definir quais níveis de suficiência contam como `sufficient`.
  - **Recomendado:** SUFFICIENT, PARTIAL_BUT_USABLE e CONFLICTING_SEARCH_INTENT.
- **D3.** Tratar os bundles antigos.
  - **Recomendado:** manter o padrão legado sem reescrever, com aviso só na tela.
  - **Alternativa:** marcar "standing não avaliado" dentro do dossiê. Isso muda o hash entregue e viola as invariantes 57 e 59.
- **D4.** Definir o teto de idade da SERP para o Radar (`maxAgeMs`).
  - Padrão: 30 dias.
  - Marcar lentes com mais de 7 dias de diferença.
- **D5.** Escolher o alcance de "Recoletar agora (pago)".
  - **Recomendado:** as 4 lentes (4 chamadas).
  - **Alternativa:** só a canônica (1 chamada).
- **D6.** Resolver o ledger e a quota do Radar.
  - **Opção 1:** criar a capability `dataforseo.serp_compatibility`, por SQL do usuário, com gate próprio.
  - **Opção 2:** decidir outra capability.
  - Até lá, o gasto do Radar continua fora do ledger.
- **D7.** Escolher as lentes da pesquisa auxiliar.
  - Nas 4 lentes: até 24 chamadas no KGR.
  - Só na canônica: até 9 chamadas.
- **D8.** Autorizar de 1 a 4 chamadas de medição de device no YouTube e na Amazon antes de qualquer adoção.
- **D9.** Decidir se as SERPs pagas pelo Radar alimentam o Minerador.
  - **Opção 1:** alimentam, com `collectedBy` visível.
  - **Opção 2:** o Minerador ignora as entradas `radar`.
- **D10.** Confirmar que a identidade do snapshot é o conteúdo. Uma recoleta idêntica não abre versão, e a idade exibida é a da versão gravada.

```text
RADAR_SERP_LENSES = 4 (proposto) · YOUTUBE_LENSES = 1 · AMAZON_LENSES = 1
SERP_STANDING_COMPUTED_AT = FINALIZE (nunca na leitura)
REFRESH_AFTER_FINALIZE = RECUSADO (inclusive por cache)
SNAPSHOT_LENSSET_HAS_DIGEST = NO
BUNDLE_POINTS_TO_CACHE = NO (cópia)
LEGACY_SNAPSHOTS_REHASHED = NO · LEGACY_BUNDLES_REWRITTEN = NO
MIGRATIONS = 0 · SQL_REMOTO = 2 agregados de leitura · CHAMADAS_PAGAS = 0
IMPLEMENTED = NO — aguarda D0
```
