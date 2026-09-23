# SDD — Cache temporário de SERP por keyword e lente — 2026-09-23

## Identificação

- **Módulo proprietário:** compartilhado. **Dono do dado:** Minerador — é quem primeiro paga a SERP de cada keyword. **Consumidores:** Arquiteto (agora) e Radar (preparado, não ligado).
- **Data:** 2026-09-23.
- **Autorização:** dada pelo dono do produto em conversa, em 2026-09-23: *"ele do tipo temporário muito bom, só faz um novo chamado quando expirar […] teria que salvar em todas as lentes […] pode implementar"*.
- **Estado:** implementado e confirmado por teste; **validação manual pendente**, do usuário. Nenhuma migration, nenhum SQL remoto, nenhuma escrita remota feita pelo agente.

Precedência: abaixo de invariantes, ADRs e da SDD de egress (`sdd-uso-supabase-orcamento-egress-2026-09-23.md`), cujas regras R1–R16 esta SDD obedece.

---

## 1. Problema, medido

A mesma SERP era paga várias vezes. O Minerador consulta a SERP **completa** de cada keyword para qualificar (desktop, `advanced`, 20 resultados). Depois o Arquiteto pagava de novo:

| Onde | Unidade | Lente / endpoint | Reaproveitava? |
| --- | --- | --- | --- |
| Minerador — qualificação | 1 por keyword | desktop sem `os`, `advanced`, 20 | — |
| Arquiteto — formação de artigos | 1 por keyword do grupo | desktop sem `os`, `regular`, 10 | não |
| Arquiteto — SERP territorial | 1–2 por pergunta | desktop sem `os`, `regular`, 10 | não |
| Arquiteto — SERP por keyword | 4 por keyword | 4 lentes, `advanced`, 10 | não |
| Radar — SERP do artigo | por artigo | desktop sem `os`, `regular`, 10 | não |

O Minerador guardava só as **conclusões** (intenção, funil); os domínios e blocos ficavam para trás na entrega ao Arquiteto.

**Medições que definiram o desenho (chamadas reais, 2026-09-23):**

1. **`desktop` sem `os` é `desktop-windows`.** A DataForSEO devolve no eco da tarefa o sistema que usou: a consulta sem `os` voltou com `task.data.os = "windows"`. Fixture: `tests/fixtures/dataforseo-eco-desktop-sem-os.json`.
2. **Recoletar traz ruído, não verdade.** Duas consultas idênticas com segundos de diferença: Jaccard **0,35** nos domínios da 11ª à 20ª posição; top 6 estável.
3. **O corpo `advanced` bruto tem 76–90 KB.** 200 keywords × 4 lentes × 85 KB ≈ **68 MB** se guardado e relido bruto — acima do orçamento diário de 100 MB sozinho.
4. **O que os três leitores reais tocam** — medido com um `Proxy` que registrou cada acesso de `normalizeDataForSeoSerpResponse`, `buildRadarSerpFeatureIntelligence` e `deriveSerpSemanticEvidence` sobre três corpos reais. `popular_products` pesava 38 KB e só título, preço, nota e vendedor são lidos; dos chips de refinamento só o título; os `items` do AI Overview, `xpath` e `highlighted` não são lidos.

---

## 2. Decisões

| Decisão | Evidência |
| --- | --- |
| Cache **por marca**, em `editorial_workflow_items`, `subject_type: serp_cache_entry`, `stage: minerador` | `marca_id` é `NOT NULL` (AGENTS §5); sem DDL; `minerador` é o único estágio sem leitor amplo (`architect` entra no reset de homologação, `radar` na listagem do Radar) |
| Chave = keyword × localidade × idioma × **lente explícita** × endpoint | medição 1; nada é suposto |
| Keyword na chave: só `trim` + minúsculas | o Minerador recusa corpo cujo `result.keyword` não bate, comparando **com** espaços |
| Chave em hexadecimal (`serp:v1:<16 hex>`) | `postgrest-js` não escapa aspas em `.in(...)`; colisão vira **ausência** porque a leitura confere a consulta gravada em `meta` |
| Profundidade fora da chave: entrada serve quem pede **igual ou menos**, recortada | a coleta do Minerador (20) atende o Arquiteto (10) |
| **Duas camadas:** `observation` (~1 KB) e `body` podado | R8: quem agrupa lê só a observação |
| Observação sempre no **top 10** | medição 2: a régua precisa ser igual entre keywords e estável |
| Validade padrão **30 dias**, teto por consumidor, relógio injetável | "só chama quando expirar"; medição 2 |
| `source_entity_id` = id da keyword | a exclusão de keyword remove toda linha da marca com esse `source_entity_id`; sem isso a entrada ficaria órfã (não há DELETE para o servidor nem cron) |
| Separar acertos de faltantes **antes** de resolver credencial/quota | a quota recusa `quotaUnits <= 0`; com tudo em cache, o Secret Store nem é lido |
| Uso (`recordIntegrationUsage`) só para faltantes | não há `result_status` de acerto; criar exigiria migration |

---

## 3. Contrato

`lib/editorial/serp-cache.ts` (puro):

- `SERP_CACHE_LENSES` — desktop/windows, desktop/macos, mobile/android, mobile/ios. `SERP_CACHE_CANONICAL_LENS` = desktop/windows.
- `serpCacheSubjectId(query)`, `normalizeSerpCacheKeyword`, `serpCacheFreshness`, `serpCacheEntryServes`.
- `pruneSerpBody(body)` — lista de campos por tipo de item, medida; **tipo desconhecido passa inteiro**; nunca remove item, só campo (a posição do PAA é o índice).
- `trimSerpBodyToDepth(body, n)` — corta após o n-ésimo orgânico e recalcula `item_types`.
- Payload: `{ contractVersion: "serp-cache-v1", meta, observation, body }`.

`lib/server/serp-cache-observation.ts` — observação a partir do corpo, pelo mesmo normalizador, com entrada neutra.

`lib/server/serp-cache-store.ts` (server-only) — leitura por modo (`meta` / `observation` / `body`) com `payload->campo` e apelido, lotes de 100 ids; escrita devolve só `id,lock_version`; corrida (`23505` ou lock vencido) vira `concurrent`, sem nova tentativa.

`lib/server/serp-cache.ts` (server-only) — `lookupSerpCache` e `collectAndCacheSerp`. Falha ao gravar **não** derruba quem chamou.

Ajustes feitos na integração (seção 8):

- `collectAndCacheSerp` **não lança** em corpo recusado pelo provider (task ≠ 20000, raiz inválida): devolve `observation: null` + `observationError`, o corpo cru e o `diagnostic`. Quem chama normaliza o corpo cru e recebe o mesmo erro de antes, já com o diagnóstico do provider na mão.
- Só se grava SERP de verdade: corpo recusado **ou sem nenhum orgânico** volta com `write: "skipped"`. Uma resposta vazia transitória serviria de acerto por 30 dias a todos os módulos.
- `writeSerpCacheEntry`: coleta sem keyword (pergunta territorial por texto) que sucede entrada presa a uma keyword **herda** a keyword. Sem isso a entrada se soltaria e sobreviveria à exclusão da keyword. O vínculo é o do último declarante: pode apontar para uma keyword de texto equivalente (mesma chave), não necessariamente idêntico.
- `writeSerpCacheEntry` **só anda para a frente**: uma coleta mais velha que a gravada (duas requisições pagando a mesma chave; a que começou antes termina depois) não sobrescreve — volta `concurrent`. A procura lê `id,lock_version,source_entity_id,collectedAt:payload->meta->>collectedAt`, nunca o payload.

`lib/minerador/dataforseo-serp-core.ts` ganhou `readDataForSeoTargetCodes(env)`, extraído de `buildDataForSeoSerpConfig` sem mudar comportamento.

---

## 4. Orçamento de egress

Com a poda, o corpo `advanced` de 20 resultados cai de **90 KB para 33,9 KB (38%)**; a observação tem **~0,9 KB**. Estimativa por essas medidas, para 200 keywords:

| Operação | Lê | Bytes |
| --- | --- | ---: |
| Agrupar nas 4 lentes (acertos) | `meta` + `observation` de 800 entradas | ~1 MB |
| Validar a formação (acertos) | `body` de 1 lente por keyword | ~6,8 MB, só ao rodar a validação |
| Escrever | devolve `id,lock_version` | desprezível |

Gravações não contam como egress; o que sai é a leitura.

---

## 5. Riscos e limites

- **Mudança de comportamento no Arquiteto:** formação e SERP territorial passam de `regular` para `advanced` com lente explícita. Chegam perguntas do PAA e citações do AI Overview que antes não chegavam; `breadth` e competição podem mudar. É o objetivo — registrado, não silencioso.
- **Radar não ligado.** O Radar consulta `regular` sem `os`; ligar exige mudança no contrato de pedido dele (lente e profundidade) e decisão sobre o botão "Atualizar SERP" ignorar o cache. Fica para o corte do Radar, com o ponto de plug documentado: `collectDataForSeoSerpSnapshot` / `app/api/editorial/serp/route.ts`.
- **Cache entre marcas** exigiria tabela própria (migration e SDD). Fora do escopo.
- **Idioma:** o Minerador consulta com o idioma do alvo; o Arquiteto com o do ambiente. Só dividem entrada quando coincidem — hoje, `pt`.
- **Linha nunca some por idade** (sem cron): uma entrada vencida é sobrescrita na próxima coleta. Entradas sem keyword (consultas territoriais por texto) não somem com exclusão.
- **Prévia de exclusão de keyword** passa a contar as entradas de cache como itens operacionais dela.
- **Variância da cauda** (medição 2) afeta limiares de agrupamento medidos no top 20; a observação usa top 10 por isso.

## 6. Compatibilidade e rollback

Aditivo. Sem schema, sem migration. Rollback: remover as chamadas ao cache nas rotas — as linhas `serp_cache_entry` ficam inertes (nenhum leitor as vê fora do cache).

## 7. Testes

- `tests/serp-cache.test.mts` — equivalência da poda nos três leitores sobre corpo **real**; recorte; chave; validade; linha; observação; forma das leituras (R4/R5/R6/R8).
- Testes por consumidor — ver seção 8.

## 8. Execução

```text
CONSUMIDORES_LIGADOS = 4 · Minerador (CALL 3) · Arquiteto: formação, territorial, SERP por keyword
RADAR_LIGADO = NÃO · ponto de plug na seção 5
LENTES_GRAVADAS = as que cada consumidor pede · a SERP por keyword grava as 4
RECOLETA_ANTES_DE_30_DIAS = só evidência SERP invalidada por humano (Minerador)
MIGRATIONS_ADDED = 0 · SQL_REMOTO = 0 · CHAMADAS_PAGAS_EM_TESTE = 0
MANUAL_UI_VALIDATED = NO — homologação do usuário
```

**Verificado no código e confirmado por teste.** Nada foi validado na interface
real nem no banco remoto.

### 8.1 Por consumidor

| Consumidor | Leitura do cache | Lente / endpoint / profundidade | Na falta | Arquivos |
| --- | --- | --- | --- | --- |
| Minerador — CALL 3 (Resultados) | `body` (normaliza a evidência semântica) | desktop-windows · `advanced` · 20 | paga, grava `collectedBy: minerador` | `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts` |
| Arquiteto — formação de artigos | `meta` para todas; `body` em lote só de quem vai normalizar | desktop-windows ou mobile-android · `advanced` · `resultLimit` | paga, grava `collectedBy: arquiteto` | `app/api/arquiteto/serp/route.ts`, `lib/arquiteto/dataforseo-serp-compatibility.ts` |
| Arquiteto — SERP territorial | `body` | lente do pedido · `advanced` · 10 | paga uma vez por chave na requisição | `app/api/arquiteto/territorial-serp/route.ts` |
| Arquiteto — SERP por keyword (4 lentes) | `observation` (~1 KB) | as 4 lentes · `advanced` · 10 | paga, grava; lente recusada vira lacuna declarada | `app/api/arquiteto/keyword-serp/route.ts`, `modules/arquiteto/published-serp-panel.tsx`, `modules/arquiteto/arquiteto-workspace.tsx` |

Em todos: o cache é consultado **antes** de credencial e quota; a quota conta
só as faltas; o uso (`recordIntegrationUsage`) só é registrado para chamadas
pagas; leitura do cache que falha faz a rota pagar como antes; gravação que
falha só vira aviso no log.

### 8.2 Mudanças de comportamento — ditas, não silenciosas

- **Formação e territorial: `regular` → `advanced`, com `os` explícito.**
  Chegam perguntas do People Also Ask e citações do AI Overview que o
  `regular` anunciava e não entregava. `breadth`, competição e vereditos podem
  mudar em relação a pareceres antigos. O `contentHash` do snapshot passa a
  incluir `operatingSystem: "windows"`: a mesma SERP gera hash diferente dos
  pareceres antigos, uma vez só.
- **Mobile da formação passa a enviar `os=android`.** Não há eco medido de
  mobile sem `os`; não está provado que o padrão antigo já era android.
- **O botão "Validar SERP" e "Consultar de novo nas 4 lentes" não forçam
  SERP nova** enquanto houver entrada válida (até 30 dias). É o pedido do
  produto: "só faz um novo chamado quando expirar". Não há `refresh` exposto
  na UI.
- **SERP por keyword:** o registro por escopo (`keyword_serp_observations`,
  estágio `architect`) deixou de ser gravado; o cache passou a ser a
  persistência. `lib/server/arquiteto-keyword-serp-store.ts` foi removido e
  `lib/arquiteto/keyword-serp-record.ts` ficou só com as lentes, que agora são
  as do cache (`SERP_CACHE_LENSES`). As linhas remotas antigas ficam inertes,
  sem leitor; limpar é operação do usuário. A mescla entre lotes passou da
  rota para o cliente.
- **Minerador — Qualificação Semântica sem versão repetida (AGENTS §9).** Um
  acerto do cache que não traz nada novo **não** grava versão nova: a vigente
  continua sendo a resposta (`persisted: true, unchanged: true`;
  `semanticQualificationUnchangedCount` na resposta). "Nada novo" é:
  - a mesma coleta que a vigente já registrou — mesmo `providerRequestId` e
    `collectedAt`, mesma consulta (caixa do texto não conta: keyword e
    candidata dividem a entrada), mesma derivação e o mesmo conteúdo gravado,
    comparado em JSON canônico porque a vigente volta do jsonb com as chaves
    reordenadas (`repeatsCurrentSemanticQualification`);
  - ou uma coleta **mais velha** que a vigente
    (`predatesCurrentSemanticQualification`). Sem isso o tempo andaria para
    trás, e uma SERP recusada por humano poderia voltar.

  Nesse ramo a projeção na keyword (`evidencia_serp`) é conferida e, se não
  aponta para a vigente — vigente gravada pela Descoberta, ou projeção que
  falhou —, é regravada, sem versão nova. Para as datas baterem, a coleta paga
  passou a gravar a Qualificação com `collectedAt` = a data gravada no cache
  (antes, a hora da normalização).
- **Minerador — evidência SERP invalidada por humano pula o cache**
  (`refresh`). O cache devolveria justamente a SERP recusada, e gravá-la
  limparia a invalidação em silêncio. Hoje `invalidateSerpEvidence` ainda não
  tem rota que a chame; a guarda vale para quando tiver.

### 8.3 Testes

| Arquivo | Casos | O que prova |
| --- | ---: | --- |
| `tests/serp-cache-runtime.test.mts` (`test:serp-cache`) | 14 | **executa** `collectAndCacheSerp`, `lookupSerpCache` e o store contra um banco em memória e um `fetch` falso com o corpo real: task recusada e raiz inválida não lançam e não gravam; SERP vazia não grava; HTTP 500 lança; gravação que falha não derruba; herança da keyword; cache só anda para a frente; `refresh` não lê; colunas por modo; isolamento por marca; vencida/outra lente/mais rasa é falta. Nove mutantes do núcleo e do store, rodados em cópias, todos mortos |
| `tests/serp-cache.test.mts` | 24 | equivalência da poda nos 3 leitores sobre corpo real; chave; validade; observação; forma das leituras (inclusive o modo `meta` e o `COLUNAS[mode]`) |
| `tests/minerador-serp-cache.test.mts` | 18 | CALL 3 consulta o cache antes; acerto real gera a mesma evidência; acerto que repete ou precede a vigente não versiona e reprojeta; caixa do texto e jsonb reordenado não contam como mudança; recoleta da invalidada |
| `tests/arquiteto-serp-cache-formacao.test.mts` | 28 | chave igual à do Minerador; quota só das faltas e reavaliada quando um acerto degrada; diagnóstico do provider numa task recusada, aplicado sem condição; uso só no caminho pago |
| `tests/arquiteto-territorial-serp.test.mts` | 22 (7 novos) | acerto/falta/memo por chave; quota das faltas distintas; corpo real → PAA muda `breadth` |
| `tests/arquiteto-origem-do-silo.test.mts` | 84 (K2, K3, K6, M4, P2 reescritos; K6b novo) | lentes = as do cache; registro por escopo não volta; cache antes da quota; mescla no cliente; lente recusada vira lacuna com o motivo do provider |

Suítes na linha de base: `test:arquiteto` 2.165/2.167 (as 2 falhas são
asserções de texto de UI anteriores), `test:editorial` 105/109 (4 anteriores),
`test:radar` 2.313/2.313, `test:marca` 106/106, `test:redator` 296/296,
`test:operational` 41/51 (10 anteriores), `test:serp-cache` 14/14,
`tests/minerador-*.test.mts` 666/694 (28 anteriores, todas de tela).
`npx tsc --noEmit` (que inclui os `.mts`) e ESLint limpos.

Uma segunda revisão adversarial (3 lentes, 12 verificadores) confirmou dois
defeitos reais no Minerador — acerto mais velho que a vigente virava versão
nova, e o ramo sem versão nova não corrigia a projeção na keyword — e sete
buracos de cobertura. Todos corrigidos acima.

### 8.4 Limites que ficaram

- **Radar não ligado** (seção 5).
- **Sem recoleta forçada na UI.** Se o produto quiser, falta um parâmetro de
  pedido que chegue a `lookupSerpCache({ refresh })`.
- **Idade da SERP não aparece na tela da SERP por keyword**: uma lente de até
  30 dias aparece igual a uma coletada agora. `meta.collectedAt` existe para
  expor numa evolução.
- **`collectedAt` é o início da requisição**, não o instante exato da
  resposta: num lote longo, erra por no máximo a duração do lote. É o preço de
  uma entrada gravada na requisição não parecer "do futuro" para outra leitura
  da mesma requisição.
- **Quota avaliada sobre o teto de faltas possíveis** na formação: secundárias
  de KGR leve que nunca serão pagas entram na conta. Não é regressão (antes era
  o total de keywords).
- **Pedidos repetidos na mesma requisição** (duas keywords com o mesmo texto
  normalizado, ou a mesma keyword em grupo e em candidatas a Silo) pagam duas
  vezes; a segunda gravação vira `concurrent`. Já era assim antes do cache.
- `collectDataForSeoCompatibilitySnapshot` ficou sem consumidor em `app/`;
  só `tests/arquiteto-dataforseo-serp.test.mts` o exercita. Candidato a remoção
  em tarefa própria.
- **Reexecutar Resultados no Minerador lê o corpo** de cada acerto (~34 KB)
  para concluir que nada mudou: ~7 MB para 200 keywords dentro dos 30 dias.
  Otimização possível: ler `meta` em lote antes e, quando `providerRequestId`,
  `collectedAt` e a derivação baterem com a vigente, pular o corpo. Mexe no
  formato da resposta (evidência ausente sem erro) e pede homologação da UI —
  fica para uma frente própria.
- **Territorial:** a mesma consulta usada por várias perguntas é paga uma vez
  e a promessa é compartilhada — uma falha transitória (HTTP 500) derruba todas
  as perguntas que a usam, onde antes cada uma tentava de novo.
- **`keywordId` vem do pedido** nas rotas do Arquiteto e vira
  `source_entity_id` sem conferir que é da marca. Não vaza nada (toda leitura e
  escrita filtra `marca_id`), mas um id estranho deixa a entrada órfã.
- **Entrada vazia gravada antes desta correção** (se algum teste manual de
  hoje gravou) continua servindo até vencer. Conferir na homologação (8.5).

### 8.5 Homologação — do usuário

1. Processar Resultados no Minerador para algumas keywords (paga e grava).
2. No banco, conferir as linhas `editorial_workflow_items` com
   `subject_type = 'serp_cache_entry'` da marca: `payload->meta` com a lente
   `desktop/windows`, `collectedBy = minerador`, `source_entity_id` = id da
   keyword.
3. Processar de novo as mesmas keywords: a resposta traz `serpReusedCount > 0`,
   `semanticQualificationUnchangedCount > 0`, e nenhuma versão nova da
   Qualificação no banco.
4. No Arquiteto, "Validar SERP" da formação para um artigo com essas keywords:
   `diagnostic.cacheHits > 0`, `paidQueries` só das que faltavam.
5. SERP por keyword de um Silo: o painel mostra "N lente(s) do cache · M
   coletada(s) agora"; na segunda vez, tudo do cache.
6. Excluir uma keyword de teste: as entradas de cache dela somem junto.
7. Antes de tudo, conferir que não há entrada vazia gravada por teste anterior
   a esta correção — `subject_type = 'serp_cache_entry'` com
   `payload->'observation'->>'organicCount' = '0'`. Se houver, a remoção é do
   usuário.

---

## Adendo — 2026-09-23 — As quatro lentes desde a primeira SERP (Minerador)

**Autorização.** Decisões do dono do produto em 2026-09-23:
- *"a SERP paga vai para o cache no banco […] desde a primeira vez que a SERP é acionada, já seja no descobrir ou no processador […] tem que ser nas 4 janelas, não pode ser só para desktop"*;
- depois: *"utilizar as 4 lentes em todas as áreas e em todos os processos da plataforma"*.

**Estado.** Implementado e confirmado por teste; validação manual pendente, do usuário. Nenhuma migration, nenhum SQL remoto além de um SELECT agregado, nenhuma chamada paga em teste.

### O que mudou

A rota de Resultados do Minerador (`app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts`) atende o Processador e o "Medir resultados" da Descoberta. Agora ela garante as quatro lentes no cache sempre que aciona a SERP de um alvo, inclusive de candidata sem keyword.

| Lente | Quem paga | Profundidade | Grava | Deriva Qualificação? |
| --- | --- | ---: | --- | --- |
| desktop-windows (canônica) | CALL 3 (`collectSemanticSerp`), sem mudança | 20 | meta + observação + corpo | sim, **por enquanto** só ela |
| desktop-macos, mobile-android, mobile-ios | `lib/server/minerador-serp-lens-coverage.ts` (novo) | 10 | meta + observação, sem corpo | ainda não |

**Leitores verificados no código:**
- Minerador, CALL 3: desktop-windows, depth 20, corpo.
- Arquiteto, formação e territorial: desktop-windows, depth 10, corpo. Aceitam mobile-android, mas nenhuma tela envia.
- Arquiteto, SERP por keyword: as 4 lentes, depth 10, observação.
- Radar: não ligado.

**Regras:**
1. **Cache primeiro, por lente, antes de credencial e quota.** `planSerpLensCoverage` lê as três lentes em modo `meta`.
2. **Quota** = alvos + consultas **distintas** que faltam. Com saldo parcial, paga as lentes que cabem, na ordem dos alvos; o resto vira lacuna.
3. **As lentes extras correm em paralelo com a cadeia do alvo**, com concorrência 3. A mesma consulta é paga uma vez por requisição. Falha vira lacuna com motivo e não derruba Resultado, KD nem a Qualificação.
4. **Escrita sem corpo** (`collectAndCacheSerp({ storeBody: false })`; `body` opcional no contrato):
   - nunca substitui uma entrada com corpo ainda válida **e com profundidade gravada ≥ a pedida** (resultado `kept`);
   - uma entrada mais rasa é substituída;
   - o `lock_version` protege o corpo que chegar depois da procura;
   - ler em modo `body` uma entrada sem corpo é **falta**.
5. **Uso:** um registro por alvo para as lentes, `…:serp-lenses`. Um registro `succeeded` conta só as lentes coletadas; as falhas não entram na quota.
6. **Resposta:** campo aditivo `serpLensCoverage`, com contagem por lente (paid, cached, failed, skipped) e as lacunas.

**Números** (simulação com o corpo real do fixture, lista de 200):

| | Antes | Depois |
| --- | ---: | ---: |
| SERP pagas sem cache | 200 | 800 |
| Chamadas pagas totais sem cache (com allintitle e KD) | 600 | 1.200 |
| Gravado por lista | 6,71 MB | 7,46 MB |
| Egress da reexecução em cache | 6,53 MB | 6,75 MB |
| SERP pagas na reexecução em cache | 0 | 0 |

Custo das 600 SERP extras: até ~US$ 2,10 por lista (ESTIMADO; o preço em depth 10 não foi medido).

**Testes:**
- `test:serp-cache` 27/27, contra banco em memória e provider falso.
- Guardas em `tests/minerador-serp-cache.test.mts`.
- Ajustes pontuais, por causa da decisão, em `minerador-semantic-serp`, `minerador-dataforseo-allintitle-route` e `serp-cache.test.mts`.
- 35 mutantes mortos no total, rodados em cópias.
- Minerador e Arquiteto com as mesmas falhas da base.
- `tsc` e ESLint limpos.

**Limites:**
- A reexecução ainda lê o corpo da canônica: pular essa leitura mudaria a evidência que a tela recebe.
- A SERP por keyword do Arquiteto grava corpo nas 4 lentes quando é ela quem paga primeiro.
- Corrida inversa: uma entrada sem corpo inserida no meio pode vencer um insert com corpo, e a próxima leitura paga uma vez.
- Entradas de candidata sem keyword ficam órfãs, agora 4 por texto.
- A prévia de exclusão conta até 4 itens de cache por keyword.
- A rota não tem `maxDuration`.

**Próxima onda, já autorizada:** a intenção e o funil passam a usar as 4 lentes. Com isso, o Minerador vira leitor do corpo das 3 lentes extras. Pela regra "corpo só onde há leitor", elas passam a gravar corpo: são +15 MB por lista de 200, medido. O plano e o ganho do classificador serão registrados aqui ao implementar.

**Homologação (usuário):**
1. Processar Resultados de algumas keywords e medir algumas candidatas na Descoberta.
2. No banco, conferir 4 linhas `serp_cache_entry` por texto:
   - windows com `payload->body` e `meta.depth = 20`;
   - as outras 3 sem `body` e com `depth = 10`;
   - `collectedBy = minerador`.
3. Reprocessar: `serpLensCoverage.paidCount = 0` e nenhuma versão nova da Qualificação.
4. No Arquiteto, "SERP por keyword" dessas keywords: tudo do cache.
5. Excluir uma keyword de teste: as 4 entradas somem.

### Revisão — digest das lentes extras (onda 1, 2026-09-23)

- **O que é:** toda lente que não é a canônica passa a gravar `payload.digest`, com o top 10 orgânico e todos os campos que o classificador v4 do Minerador lê, mais os sellers de `popular_products` e os tipos de bloco. Isso vale também quando quem coleta é o Arquiteto. A canônica não grava digest, porque tem o corpo.
- **Leitura:** novo modo `digest` (`payload->digest`). O modo `observation` não mudou de tamanho (teste).
- **Tamanho:** de 2,8 a 5,7 kB por lente extra, contra ~26,5 kB do corpo em depth 10.
- **Entrada sem digest:** uma entrada extra gravada antes desta revisão conta como lente faltante (`missing_digest`) até ser recoletada.
- Regra e efeitos: §77 da spec do Minerador e seção 8 do [adendo](../03-minerador/propostas/adendo-derivacao-v4-quatro-lentes-2026-09-23.md).

### Revisão — consumidores ligados (onda 2 e 3, 2026-09-23)

- **Arquiteto:** formação, territorial e SERP por keyword leem a canônica em corpo e as extras pelo modo `digest`. Todo coletor da canônica grava em depth 20. O plano de chamadas lê só em modo `meta` e é mostrado antes de pagar. Ver o [adendo das 4 lentes do Arquiteto](../04-arquiteto/propostas/adendo-quatro-lentes-arquiteto-2026-09-23.md).
- **Radar:** a SERP do artigo, a pesquisa auxiliar e o apoio Google da Amazon usam cache primeiro nas 4 lentes, com `collectedBy: radar`. As entradas pagas pelo Radar servem ao Minerador e ao Arquiteto (D9: a proveniência na Qualificação ainda não mostra `collectedBy`). Ver a [SDD do Radar](../05-radar/propostas/sdd-radar-quatro-lentes-cache-2026-09-23.md).
- **Redator:** o leitor de evidências só lê, nunca coleta: modo `observation` e `digest` nas extras, e o corpo da canônica sob demanda.
- **Pendente do dono do cache:** o digest ainda não traz itens `video` com título e URL próprios e usa `rank_group`. A diferença fica declarada no marcador de lentes.
