# Adendo à spec do Arquiteto — As quatro lentes na SERP (onda 2) — 2026-09-23

## Identificação

- **Módulo proprietário:** Arquiteto.
- **Arquivos do módulo que a implementação tocaria:**
  - `app/api/arquiteto/serp/route.ts`;
  - `app/api/arquiteto/territorial-serp/route.ts`;
  - `app/api/arquiteto/keyword-serp/route.ts`;
  - `lib/arquiteto/article-serp-interpretation.ts`;
  - `lib/arquiteto/territorial-serp.ts`;
  - `lib/arquiteto/serp-competitive-evidence.ts`;
  - `lib/arquiteto/silo-primary-keyword.ts`;
  - `lib/arquiteto/dataforseo-serp-compatibility.ts`;
  - `lib/arquiteto/article-serp-record.ts`;
  - `lib/arquiteto/territorial-serp-record.ts`;
  - `lib/arquiteto/territory.ts`;
  - `modules/arquiteto/arquiteto-workspace.tsx`.
- **Arquivos de outros donos que só são consumidos:**
  - o cache de SERP (`lib/editorial/serp-cache.ts`, `lib/server/serp-cache*.ts`): modos `meta`, `observation`, `body` e `digest`, e `collectAndCacheSerp({ storeBody, storeDigest })`;
  - o resolvedor de targeting do Minerador (`lib/minerador/dataforseo-targeting.ts`);
  - o normalizador (`lib/server/dataforseo-serp-normalizer.ts`).
  Nenhum deles é alterado por este adendo. O que o Arquiteto precisa deles está na seção 6.
- **Autorização do usuário.** As citações estão em `docs/03-minerador/propostas/adendo-derivacao-v4-quatro-lentes-2026-09-23.md` e na mensagem de 2026-09-23:
  - *"utilizar as 4 lentes em todas as áreas e em todos os processos da plataforma"*;
  - *"processar de maneira inteligente, com o fim de obter dados precisos"*;
  - depois do dry-run do backfill: *"pode continuar em todas, Arquiteto, radar, e redator"*.
- **O que essa autorização cobre:** a direção, ou seja, as 4 lentes em todo ponto de SERP orgânica do Arquiteto.
- **O que ela não cobre:**
  - chamadas pagas implícitas (`AGENTS.md` §7);
  - troca silenciosa de principal ou de primária publicada (§11);
  - versão nova sem mudança real (§9).
  Os itens marcados **structural** mudam o conteúdo de um parecer, o contrato de pedido ou o fluxo. Pela seção de governança do `AGENTS.md`, o código deles só começa depois que este texto for aprovado.
- **Estado:** **PROPOSTA.** Nada do que está descrito aqui foi implementado. Este arquivo não altera `spec.md`, `estado-atual.md` nem `backlog.md`: quem registra é o coordenador, depois da aprovação.
- **Base:**
  - plano `plataforma-desenho.txt`, pontos 5 a 8 e onda 2;
  - veredictos `plataforma-veredictos.txt`, cujas correções prevalecem sobre o desenho;
  - leitura do código às 11h de 2026-09-23;
  - SQL agregado de leitura (seção 2).

---

## 1. Como está hoje (verificado no código)

| Ponto | Lente | Profundidade gravada | Leitura do cache | O que pesa |
| --- | --- | ---: | --- | --- |
| Formação de artigos, `app/api/arquiteto/serp/route.ts` | uma só. A tela manda `device: "desktop"` (`arquiteto-workspace.tsx:3588`), que vira desktop-windows (`formationSerpLens`) | `resultLimit` = 10 (`route.ts:268-270`) | `meta` para todas; `body` em lote só para quem é normalizado | o parecer é interpretado só na canônica (`route.ts:630-647`) |
| SERP territorial, `app/api/arquiteto/territorial-serp/route.ts` | uma só. A tela não envia `device` (`arquiteto-workspace.tsx:8214-8218`), o que resulta em desktop-windows | 10 | `body` | consulta o **texto** da entidade central (`territory:<ref>`). Quase nunca reaproveita o Minerador |
| SERP por keyword, `app/api/arquiteto/keyword-serp/route.ts` | as 4 | 10, nas 4 | `observation` | grava **corpo nas 4** (`storeBody` padrão, `route.ts:205-210`), contra a R19. `paraObservacao` (`:82-90`) descarta `aiOverviewDomains` e `relatedSearches`, que a observação do cache já tem |
| Eleição da primária do Silo, `lib/arquiteto/silo-primary-keyword.ts` | — | — | — | `measureCompetitiveStrength` e `electPrimaryFromSerp` **não têm chamador em produção** (grep em `app/`, `lib/`, `modules/`) |

Três defeitos verificados:

1. **Canônica gravada em profundidade 10 faz a CALL 3 pagar de novo.**
   - A formação, a territorial e a SERP por keyword pagam a desktop-windows com `depth: resultLimit` (10) e gravam corpo.
   - A chave do cache não inclui profundidade (`serpCacheSubjectId`). A entrada nova substitui a do Minerador quando esta está ausente ou vencida.
   - Depois, a CALL 3 do Minerador pede 20, e `serpCacheEntryServes` recusa a entrada mais rasa (`lib/editorial/serp-cache.ts:311`). Resultado: paga e regrava.
2. **kgr_light: secundária não consultada vira "de fora".**
   - No perfil `kgr_light` com principal clara, só a principal é consultada (`route.ts:543-548`).
   - Mas `members` inclui todas as keywords do grupo com `results: []` (`route.ts:630-641`).
   - Com isso, `pairwiseOverlap` dá `nenhuma` e `observedIntentOf([])` dá `indefinido`, diferente da principal. A secundária vira *outsider*, e o parecer sai `DIVERGENCE / SPLIT_RECOMMENDED`.
   - O mesmo acontece ao reconstruir registro legado (`articleSerpParecerFromAssessment`, `article-serp-interpretation.ts:466-478`).
3. **Concordância contada em dobro com 2 lentes.**
   - Com divergência ≥ 0,5, `measureKeywordAffinity` dobra a concordância (`serp-competitive-evidence.ts:205-207`), e `measureCompetitiveStrength` soma `divergentLensesHolding` (`silo-primary-keyword.ts:204, 220`).
   - Com só 2 lentes observadas, **uma** lente concordante já atinge o mínimo de 2. Na prática, uma lente decide sozinha.

## 2. Medido

- **Pareceres de formação no remoto:** 5 no total (SQL agregado, contagem por veredito).
  - 4 são de artigo de uma keyword: `PRINCIPAL_SUPPORTED`, grupo `INCONCLUSIVE`, `total = 0`, 1 snapshot, veredito `INCONCLUSIVE`.
  - 1 é `COMPATIBLE`, com 3 buscas de apoio e 4 snapshots.
  - O veredito próprio para artigo de uma keyword tem SDD separada: `sdd-veredito-artigo-uma-keyword-2026-09-23.md`.
- **Pareceres territoriais:** 2. **Entradas `serp_cache_entry`:** 0. Nada foi coletado ainda com o cache.
- **Defeito 2, confirmado offline** (`scratchpad/kgr-light-outsider.mts`, sem rede): principal com 8 resultados e secundária com `results: []` dão `{"verdict":"DIVERGENCE","group":"SPLIT_RECOMMENDED","outsiders":1,"principal":"PRINCIPAL_INCONCLUSIVE"}`.
- **Divergência entre lentes medida no provider em 2026-09-20:** 0,061 e 0,174, abaixo do limiar de 0,5. A diferença entre aparelhos aparece no **formato** (blocos), não na lista de concorrentes.

## 3. Regras propostas

Cada item traz regra, classe e testes. Classes: **localized** é correção ou mudança aditiva sem mudar o que um parecer significa. **structural** muda o parecer, o contrato de pedido ou o fluxo.

### A1. kgr_light: secundária não consultada é "não observada" — **localized** (onda 2a; pode ir antes, sem depender do digest)

- Só entra em `members` quem tem snapshot nesta execução. A keyword do grupo sem consulta fica registrada como `notObserved` e não conta em `total` nem em `outsiders`.
- A mesma regra vale em `articleSerpParecerFromAssessment`: keyword sem snapshot no registro não vira membro vazio.
- Consequência: um artigo kgr_light com principal clara passa a ter só a principal observada e cai no caso de "uma busca só" (hoje `INCONCLUSIVE`; ver SDD do veredito de uma keyword). Nunca `DIVERGENCE` por ausência de dado.
- **Testes:**
  - regressão com a entrada do probe: deixa de sair `SPLIT_RECOMMENDED`;
  - secundária **consultada** e de fato distinta continua sendo *outsider*;
  - registro legado reconstruído segue a mesma regra.

### A2. Todo coletor da lente canônica grava em profundidade 20 — **localized**

- Quando a formação, a territorial ou a SERP por keyword **pagam** a desktop-windows, pedem ao provider `depth = 20` e gravam com essa profundidade. É o mesmo valor da CALL 3 (`SEMANTIC_SERP_DEPTH`, constante local de `allintitle/route.ts:169`). O Arquiteto declara a própria constante, e um teste estrutural confere que as duas continuam iguais.
- A **leitura** continua pedindo `resultLimit`. Uma entrada de 20 atende um pedido de 10, recortada por `trimSerpBodyToDepth`.
- **Equivalência:** na falta, o corpo cru é recortado a `resultLimit` pelo mesmo `trimSerpBodyToDepth` do acerto antes de normalizar. Assim, acerto e falta produzem o mesmo snapshot, e o parecer não muda por ter pago mais fundo.
- As lentes extras continuam em 10 (`SERP_LENS_COVERAGE_DEPTH`): nenhum leitor delas pede mais que isso.
- **Custo:** a falta canônica fica mais cara, de ~US$ 0,002 para ~US$ 0,0035 (preço de depth 10 NÃO MEDIDO, inferido de 0,002 + 0,75 × 0,002 = 0,0035). Em troca, evita a CALL 3 pagar de novo: US$ 0,0035 mais uma regravação.
- **Banco:** a entrada canônica paga pelo Arquiteto passa de 26,5 para 33,9 KB (MEDIDO offline na fixture).
- **Testes:**
  - o pedido pago da canônica leva `depth: 20` nas três rotas;
  - acerto de 20 e falta paga produzem o mesmo snapshot para `resultLimit` 10;
  - as extras continuam com `depth: 10`.

### A3. Formação de artigos nas 4 lentes — **structural** (onda 2b; depende do digest, já implementado na onda 1)

1. **Pedido.**
   - `device` dá lugar a `lenses`, padrão `SERP_CACHE_LENSES`.
   - `device` continua aceito como forma legada, igual a uma lente só, para cliente antigo.
   - A tela passa a mandar `lenses`.
2. **Leitura.**
   - `meta` para keyword × lente, o que monta o plano (A6).
   - Canônica: `body` só de quem é normalizado. Esse corpo gera o snapshot do assessment e do ArticleDNA, como hoje.
   - Extras: modo **`digest`**, nunca `body`.
3. **Lente extra paga.** Grava sem corpo (`storeBody: false`). O digest é gravado por padrão em lente não canônica (`storeDigest`, `lib/server/serp-cache.ts:215`).
4. **Fatos por lente.**
   - Canônica: o snapshot normalizado, como hoje.
   - Extras: o top 10 do digest, convertido em `SerpResultFact` pela **mesma** classificação do normalizador (`classifyResult`; seção 6).
5. **Voto por lente.** `pairwiseOverlap` e `observedIntentOf` rodam por lente, só onde as duas keywords do par foram observadas.
   - **Converge** com sobreposição `forte` ou `parcial` em **≥ 2 lentes**.
   - É **de fora** só com sobreposição `nenhuma` em **todas** as lentes observadas **e** intenção observada diferente na **maioria** (mais da metade) delas.
   - Fora desses dois casos, o par não converge nem é de fora, e a divergência entre lentes fica registrada.
   - **Equivalência:** com 1 lente observada para o par, o voto é o de hoje.
6. **Principal.** `resolvePrincipalVerdict` usa a convergência agregada do item 5. `PRINCIPAL_ALTERNATIVE_BETTER` continua sendo **apontamento**. A troca é humana (§11), e na publicada nunca sai da proposta.
7. **Viabilidade** (`distinctDomains`, `totalResults`) continua medida **só na canônica**. Os limiares (≥ 8 domínios, ≥ 25 resultados) foram calibrados em uma lente, e a união das 4 os inflaria. A união fica registrada à parte.
8. **Sem dobra.** A concordância entre lentes **não** é reforço no parecer de formação: as lentes compartilham a maior parte do top 10 (divergência 0,061 e 0,174). Ela é registrada e exibida (4/4, 3/4).
9. **Testes:**
   - 1 lente dá o mesmo parecer de hoje;
   - par convergente em 1 de 4 lentes não converge;
   - *outsider* exige ausência de sobreposição nas 4 lentes;
   - lente faltante não vira "de fora";
   - digest e corpo da mesma SERP dão os mesmos fatos (fixture real);
   - viabilidade só da canônica.

### A4. SERP territorial nas 4 lentes — **structural** (onda 2b)

- **Pedido:** `lenses`, com o mesmo padrão e o mesmo legado de A3.
- **Canônica:** `body`, como hoje. `breadth`, `competition`, `dominantType` e o PAA continuam saindo dela, porque o digest não traz as perguntas.
- **Extras:** `digest`. Contribuem com:
  - o voto de sobreposição (URLs do top 10);
  - os formatos por lente (`digest.blocks`).
- **Sobreposição `high`** só com `high` na **maioria** das lentes em que as duas consultas foram observadas, e em pelo menos 2.
  - `high` em algumas lentes e não na maioria é **fronteira para decisão humana**: `compatibility: "parcialmente_coerente"`, conflito "Sobreposição alta em k de n lentes" e recomendação `manter_silo`, com o motivo. Nunca `usar_silo_existente` por uma lente só.
- Consultas `territory:<ref>` são texto, sem keyword do acervo (`keywordId: null` no cache). Usam os códigos do ambiente (seção A8).
- **Testes:**
  - `high` em 1 de 4 lentes não recomenda `usar_silo_existente`;
  - `high` em 3 de 4 recomenda;
  - 1 lente dá o parecer de hoje;
  - `breadth` e `competition` iguais aos de hoje com as mesmas entradas.

### A5. Marcador de lentes nos pareceres — **structural** (vai com A3 e A4)

Campo aditivo e opcional `lenses` no parecer de formação (`interpretation.lenses`) e no territorial (`TerritorialSerpAssessment.lenses`):

```text
lenses: {
  requested: string[]                   // rótulos serpCacheLensLabel
  observed: string[]
  missing: { lens, reason: "sem entrada" | "sem digest" | "vencida" | "falha" | "não paga" }[]
  perLens: { lens, collectedAt, providerRequestId, collectedBy, pairs?: { left, right, level }[], overlap? }[]
  agreement: string                     // "3/4"
  collectedAtSpreadDays: number
  datesDiverge: boolean                 // A8
}
```

- Ausência do campo significa parecer legado de uma lente.
- **Schema:**
  - `ArticleFormationSerpPayloadSchema` é `.strict()` na raiz, mas `interpretation` não é. Um campo novo ali seria **descartado em silêncio** por um leitor antigo (zod remove chave desconhecida). Por isso, schema e escrita precisam entrar no mesmo deploy.
  - `TerritorialSerpAssessmentSchema` é `.strict()`: o campo entra como `.optional()`, e linha antiga continua válida.
- **Tamanho:** ~1,5 a 2,5 KB por parecer de artigo com k = 4 (6 pares × 4 lentes, mais a proveniência; ESTIMADO).
- **Tela:**
  - "SERP · 4 lentes" ou "3 de 4 lentes";
  - uma linha por lente;
  - "lentes de datas diferentes" quando for o caso;
  - componentes e tokens do `docs/compartilhado/sistema-visual.md`.
- **Testes:**
  - parser preserva o bloco;
  - linha antiga sem bloco continua legível;
  - readback devolve o bloco gravado.

### A6. Plano de chamadas faltantes mostrado antes de pagar — **structural** (contrato de pedido, aditivo)

- As três rotas (formação, territorial e SERP por keyword) ganham `mode: "plan" | "execute"`.
- **`plan`** só lê `meta` (e `digest` das extras, para saber se o digest existe) e **não paga nada**. Devolve:
  - por lente: acertos, faltas, entradas sem digest, vencidas;
  - chamadas pagas previstas, como teto. As secundárias de kgr_light são condicionais e aparecem como tal;
  - custo em faixa (ESTIMADO);
  - espalhamento de datas.
- **`execute`** exige `authorizedPaidQueries`. Se as faltas passarem do autorizado (o cache mudou entre o plano e a execução), a rota **não paga nada** e devolve `409 PAID_PLAN_CHANGED` com o plano novo.
- Com tudo em cache, `execute` não exige o campo.
- A quota continua avaliada como hoje (`createFormationSerpQuotaLedger`), sobre as faltas.
- **Mudança de comportamento, dita:** hoje "Validar SERP", "Validar SERP dos silos" e "Consultar nas 4 lentes" pagam no clique. Passam a mostrar "N chamadas pagas (≈ US$ x)" e a pagar só na confirmação.
- **Testes:**
  - `plan` não chama o provider (fetch falso que falha se chamado);
  - `execute` acima do autorizado não paga;
  - tudo em cache não pede autorização.

### A7. SERP por keyword — **localized** nos três primeiros pontos; **structural leve** no quarto (onda 2c)

1. **Extras sem corpo** (`storeBody: false`). O digest continua gravado por padrão. A canônica continua com corpo, porque tem leitores (CALL 3, formação), e grava em depth 20 (A2). Economia de ~20 a 23 KB por lente extra paga no banco (26,5 KB de corpo contra 2,8 a 5,7 KB de digest mais 0,93 KB de observação; MEDIDO offline).
2. **`aiOverviewDomains` e `relatedSearches` opcionais em `SerpCompetitiveObservation`**, preenchidos por `paraObservacao` a partir da observação do cache, que já os tem.
   - `aiOverviewDomains` carrega **só** os citados pela resposta de IA. Não é somado de novo aos orgânicos.
   - `competitorDomains` **não muda de significado nesta onda**: continua sendo orgânicos mais citados. Separar é decisão D5, porque o mesmo `observationFromSnapshot` alimenta a observação gravada no cache (`lib/server/serp-cache-observation.ts:55-61`), que é de outro dono, e mudaria `lensDivergenceOf` e a afinidade.
   - O modo `observation` não muda de tamanho: os dois campos já estão nele.
3. **Consumidores preservados:** `lib/arquiteto/published-keyword-readout.ts` e o painel da SERP por keyword recebem campos opcionais a mais.
4. **Concordância em dobro só com ≥ 3 lentes observadas** (structural leve).
   - `efetivaPorLente` (`serp-competitive-evidence.ts:205-207`) e `divergentLensesHolding` (`silo-primary-keyword.ts:204`) só dobram quando `devicesObserved ≥ 3`.
   - Com 2 lentes, a dobra deixaria uma lente sozinha atingir o mínimo.
   - Isso **restringe** a regra aprovada em 2026-09-20 (divergência como sinal de força). Não a remove, mas exige decisão do usuário (D4).
   - Na medição real (0,061 e 0,174), a dobra não dispara. O efeito prático hoje é nulo, e a trava vale para quando disparar.
- **Testes:**
  - lente extra paga não grava `body`;
  - `aiOverviewDomains` chega à observação sem duplicar domínio;
  - 2 lentes com divergência ≥ 0,5 e 1 concordante não sustentam o agrupamento;
  - 3 lentes sustentam.

### A8. Portão de datas entre lentes e mesmos targeting codes do Minerador — **structural** (onda 2d; E7, correções 6 e 7)

- **Datas.**
  - Por keyword, `collectedAtSpreadDays = max − min` do `collectedAt` das lentes lidas.
  - Acima de **7 dias** (limiar a confirmar, D3), o parecer marca `datesDiverge` e a tela mostra "lentes de datas diferentes (N dias)".
  - **Recoleta só manual:** o plano (A6) oferece "Recoletar as lentes antigas (pago, X chamadas)", que vira `refresh` só nessas entradas.
  - Nunca há recoleta automática (`AGENTS.md` §7). O parecer é calculado mesmo assim, com a marca.
- **Targeting.**
  - Hoje o Arquiteto monta a chave com os códigos do ambiente (`readDataForSeoTargetCodes()`). O Minerador usa os do **alvo**: `resolveDataForSeoTargeting({ geoTargetConstants, languageCode, locationCode })` sobre o `targeting` da keyword (`allintitle/route.ts:97-101, 320`).
  - A chave só coincide quando os dois batem.
  - **Regra:** para keyword do acervo, o Arquiteto resolve os códigos **pela mesma função**, a partir do `targeting` da keyword **da marca ativa**.
    - O `targeting` é lido no servidor, com filtro por `brand_id` e colunas estreitas, nunca vindo do cliente.
    - `ArchitectKeywordSchema` já tem `targeting` opcional (`lib/arquiteto/contracts.ts:113`).
    - `collectAndCacheSerp` envia os códigos da **consulta**, então a chave é o que vai ao provider.
  - Consultas territoriais por texto e keyword sem `targeting` continuam com os códigos do ambiente.
  - A checagem de divergência da config (`formationSerpCodesMatch`) passa a valer só para esse caso.
- **Testes:**
  - keyword com `targeting` gera a mesma chave que o Minerador gravaria;
  - `targeting` de outra marca não é lido;
  - datas espalhadas em 8 dias marcam `datesDiverge` e não disparam chamada;
  - "Recoletar" só paga as lentes antigas.

### A9. Eleição da primária do Silo por SERP, ligada à origem "lista nova" — **structural** (onda 2e)

- Na origem 1 (lista nova), `measureCompetitiveStrength` e `electPrimaryFromSerp` passam a ser chamados com as observações das 4 lentes lidas do cache (modo `observation`, 0 chamada quando o Minerador ou a SERP por keyword já coletaram). Lentes faltantes entram no plano (A6).
- **Sempre proposta:**
  - o resultado `ELECTED` por SERP **não** grava `primaryKeyword` no território. Vira proposta pendente (`PrimaryKeywordDecision { status: "pending" }` ou equivalente), com evidência, lentes e `dissent`;
  - a primária só é materializada quando uma pessoa aceita. O aceite grava quem e quando: campo aditivo opcional `confirmedBy { actorUserId, confirmedAt }` na variante `serp` de `TerritoryPrimaryKeywordSchema`, que é `.strict()` e por isso precisa do campo no schema;
  - sem candidata forte, a recusa aparece com os bloqueios de cada uma. Nada é eleito por falta de concorrente melhor.
- **Precedência inalterada:** humano > publicado > SERP (`electSiloPrimaryKeyword`). Primária publicada nunca é trocada por SERP: a discordância vira `dissent` e proposta (`AGENTS.md` §11).
- A trava de ≥ 3 lentes para a dobra (A7.4) vale aqui. Com 1 lente, a eleição continua recusando, como já recusa (MEDIDO no mapa).
- **Testes:**
  - eleição por SERP não escreve `primaryKeyword` sem aceite;
  - o aceite grava `confirmedBy`;
  - publicada vence e gera `dissent`;
  - 1 lente recusa;
  - território antigo sem `confirmedBy` continua válido.

### A10. Lentes do KeywordDNA na tela do Arquiteto — **localized** (pendência do adendo do Minerador, §8)

O handoff já leva `lenses { observadas, concordancia }`, opcional (`lib/arquiteto/minerador-handoff.ts:52-55`). A tela do Arquiteto mostra "Intenção: 3/4 lentes" onde já mostra a intenção recebida. É só leitura: o Arquiteto não decide nada por esse campo. Ausente, nada aparece.

## 4. Custo por artigo

Preços da DataForSEO:
- `advanced` depth 20: US$ 0,0035, MEDIDO no campo `cost` da fixture real;
- depth 10: NÃO MEDIDO. Faixa usada: US$ 0,002 a 0,0035;
- os eventos de uso do Arquiteto no ledger têm `cost` nulo.

Valores ESTIMADOS.

| Situação | Chamadas | US$ |
| --- | ---: | ---: |
| Formação, k keywords, Minerador rodou Resultados há < 30 dias (entradas com digest) | 0 | 0 |
| Formação, canônica em cache, extras gravadas antes do digest | 0 por padrão (lentes marcadas "sem digest"); 3k só se o usuário pedir | 0 / 3k × 0,002–0,0035 |
| Formação sem nada em cache, perfil competitivo | 4k (k em depth 20 + 3k em depth 10) | k × 0,0095–0,014 → k = 4: 0,038–0,056; k = 6: 0,057–0,084 |
| Formação kgr_light, principal clara, sem cache | 4 | 0,0095–0,014 |
| Territorial, lote de 10 perguntas, até 20 textos distintos, sem cache | até 80 (hoje: até 20) | 0,19–0,28 (hoje 0,04–0,07) |
| SERP por keyword, k keywords | 4k sem cache; 0 com a cobertura do Minerador | igual à formação |
| Eleição da primária (A9) | 0 (lê o cache) | 0 |

**Egress num acerto, por keyword da formação:**
- canônica: 26,5 a 33,9 KB (corpo);
- extras: 3 × (2,8 a 5,7) KB (digest);
- total: 35 a 51 KB, contra 26,5 a 33,9 KB hoje;
- k = 4: ~140 a 205 KB por artigo validado.

**Banco:**
- a SERP por keyword deixa de gravar ~20 a 23 KB por lente extra paga;
- a canônica paga pelo Arquiteto sobe 7,4 KB (A2);
- o parecer cresce ~2 KB (A5).

## 5. Consumidores e compatibilidade

- **Pareceres gravados** (`article_formation_serp_assessment`, `territorial_serp_assessment`): sem `lenses`, continuam legíveis como parecer de uma lente. Nenhum é reescrito.
- **Gate** (`lib/arquiteto/article-serp-gate.ts`): lê só o veredito e a base, e não muda. Um veredito calculado nas 4 lentes pode diferir do calculado em uma. Isso aparece como avaliação nova da mesma base, nunca como troca silenciosa.
- **Minerador:** as entradas gravadas pelo Arquiteto em depth 20 na canônica servem à CALL 3, e as extras com digest servem à derivação v4. Nenhuma escrita do Arquiteto toca Qualificação, `evidencia_serp` ou pacote aprovado.
- **Radar:** não é afetado por este adendo.
- **Tela:** `modules/arquiteto/arquiteto-workspace.tsx` tem CRLF e é grande. A edição preserva o fim de linha.
- **Isolamento:** toda leitura do cache e do `targeting` filtra pela marca ativa (`AGENTS.md` §5).

## 6. Dependências de arquivos de outros donos (não editados aqui)

1. **`classifyResult` do normalizador** (`lib/server/dataforseo-serp-normalizer.ts:23`) é privado. A3 precisa classificar o item do digest pela **mesma** função, porque duplicá-la faria canônica e extras divergirem. Pedido: exportá-la (aditivo).
2. **O digest não inclui itens `video`** (só `type === "organic"`, `lib/editorial/serp-cache.ts:535-556`). O normalizador os conta como resultado, com `inferredType: "video"`. Também a posição difere: `rank_group` no digest, `rank_absolute` no snapshot.
   - Enquanto isso não muda, o voto por lente compara as extras só com orgânicos. Essa assimetria fica declarada no marcador de lentes.
   - Opção, do dono do cache (workflow do Radar): incluir `video` no digest.
3. **Regra de profundidade do store** (`serp-cache-store.ts:196-201`): nenhuma mudança é pedida. A2 resolve do lado do Arquiteto.
4. **Registro na `spec.md`, `estado-atual.md` e `backlog.md` do Arquiteto:** feito pelo coordenador depois da aprovação.

## 7. Rollback

- A1, A2 e A7.1 a A7.3: reverter o código. Não há dado a migrar.
- A3 a A6, A8 e A9: os campos são opcionais. Reverter as rotas faz a tela voltar a uma lente, e os pareceres gravados com `lenses` continuam legíveis.
- Sem migration, sem SQL, sem DDL. As entradas de cache gravadas ficam válidas para todos os leitores.

## 8. Decisões do usuário

- **D1.** Aprovar A3, A4, A5, A6, A8 e A9 (**structural**) antes do código.
- **D2.** Confirmar a mudança de comportamento de A6: nenhuma SERP paga no clique; o plano aparece antes.
- **D3.** Limite de dias entre lentes. Sugestão: 7.
- **D4.** Restringir a dobra da concordância a ≥ 3 lentes observadas (A7.4). Isso restringe a decisão de 2026-09-20.
- **D5.** Separar `competitorDomains` em orgânicos puros. Recomendação: **não agora**. Primeiro medir com fixtures reais das 4 lentes, porque a mudança altera a observação gravada no cache e os limiares de afinidade.
- **D6.** Aprovar a SDD do veredito de artigo de uma keyword. Ela é separada e não está incluída aqui.
- **D7.** Autorizar 3 chamadas pagas (mobile-android, mobile-ios, desktop-macos) para gravar fixtures reais. Sem elas, os testes das extras são só sintéticos.

## 9. Ordem sugerida

1. A1 e A2: localized, sem dependência.
2. A7.1 a A7.3: localized.
3. Depois de D1, D2 e D3: A6, depois A3 e A4 com A5, depois A8.
4. Depois de D4: A7.4 e A9.
5. A10 a qualquer momento.

Cada etapa exige:
- `npx tsc --noEmit`;
- ESLint dos arquivos;
- `npm run test:arquiteto` comparado por nome com a linha de base (2 falhas anteriores, de texto de UI);
- `npm run test:arquiteto:servidor`;
- `npm run test:serp-cache`.

A validação na tela é do usuário.
