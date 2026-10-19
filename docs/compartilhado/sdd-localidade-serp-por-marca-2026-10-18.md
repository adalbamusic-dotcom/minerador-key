# SDD — Localidade da SERP por marca — 2026-10-18

> **Status: APROVADA (dono, 2026-10-18).** Direção e escopo. Na segunda rodada de perguntas, o dono escolheu "Seguir as recomendações" e "Cidade de São Paulo" para a AdalbaPro:
> - **Opção A:** o campo "Localização" da Marca (`marcas.localizacao`), com catálogo validado e sem migration.
> - Uma cidade por marca, por enquanto.
> - Google Ads, allintitle/KGR, Labs, YouTube e Amazon ficam nacionais.
> - O rótulo falso "São Paulo" das SERPs nacionais é corrigido.
> - Na mesa, a keyword com SERP só nacional mostra a SERP antiga marcada. A coleta local é pelo botão de sempre, com custo dito antes.
> - O D11 marca como fora do território os resultados que citam outra cidade, pela lista de capitais e municípios grandes do IBGE.
> - **Mercado da AdalbaPro:** cidade de São Paulo. **WifiConecta:** cidade de São Paulo. As duas localidades são postas pelo dono na Marca (L4).
> - O código da DataForSEO para a cidade de São Paulo tem de ser confirmado na lista de localidades antes da L2.
> - **L4, código conferido em 2026-10-18:** CSV público `locations_serp_google_2026_09_01.csv` da DataForSEO, baixado com autorização do dono, linha `1001773,"Sao Paulo,State of Sao Paulo,Brazil",20106,BR,City`. A entrada "São Paulo (cidade)" está ativa (catálogo `2026-10-18-br-sp`). Falta o dono (ou o coordenador, com confirmação) escrever "São Paulo (cidade)" no campo Localização da WifiConecta e da AdalbaPro.
>
> **Execução (2026-10-18): L1, L2 e L3 feitas no código, com testes (§14).** O código
> da cidade de São Paulo **não foi conferido na lista da DataForSEO** (o CSV público
> passa de 10 MB e não pôde ser lido; a lista por país é a API, que não foi chamada).
> Por isso a entrada "São Paulo (cidade)" está no catálogo **a confirmar** e ainda não
> vale: toda marca continua nacional até a L4. Candidato: **1001773** (lista oficial do
> Google Ads, "Sao Paulo,State of Sao Paulo,Brazil", City, pai 20106).
>
> O dono escolheu a direção ("Localidade por marca", §1). O coordenador apresenta o
> escopo (§9) e as perguntas (§12) antes de qualquer código.
>
> Escrita sem código de produção, sem escrita no banco e sem chamada paga. Leitura
> remota só por `SELECT` (`npx supabase db query --linked -f`), em 2026-10-18.
> Commit, push, deploy, migration e SQL de escrita são do dono (`AGENTS.md` §15).
>
> **Módulo proprietário:** Marca (contexto operacional: a localidade de mercado da
> marca).
>
> **Contrato compartilhado alterado:** os códigos-alvo da SERP Google orgânica:
>
> - `lib/minerador/dataforseo-serp-core.ts`;
> - `lib/arquiteto/serp-lens-targeting.ts`;
> - `lib/server/radar-serp-lenses.ts`;
> - a chave do cache (`lib/editorial/serp-cache.ts`), que **não muda de formato**.
>
> **Consumidores:** Arquiteto (coleta das 4 lentes, diferenciação de publicados) e
> Radar (pesquisa, auxiliar, leitura do cache no CSV, D11). A mudança mexe em
> provider e contrato compartilhado: exige esta SDD (`AGENTS.md` §4).
>
> **Linhas citadas:** lidas em 2026-10-18. Outras frentes editam `lib/radar/**`
> agora; a âncora é o símbolo citado.

## 0. Resumo para o dono

- **O defeito.** Toda SERP de toda marca é pedida para o **Brasil inteiro**
  (`location_code` 2076). O topo da WifiConecta (provedor na cidade de São Paulo)
  mostrou provedores de outras cidades, e o Radar os tratou como "relevantes".
- **Já existe um campo "Localização" na Marca** (`marcas.localizacao`). O Radar até o
  manda para a coleta, mas o servidor o ignora: pede 2076 e grava o texto como
  rótulo. A AdalbaPro tem "São Paulo" no campo; as SERPs dela foram nacionais e
  ficaram rotuladas "São Paulo".
- **A correção, na mesma linha** (`AGENTS.md` §0.1):
  - cada marca tem a localidade de mercado dela, resolvida no servidor pelo
    `brandId`;
  - toda coleta e toda leitura da SERP Google orgânica daquela marca usa essa
    localidade: Arquiteto (4 lentes), Radar e cache;
  - o concorrente de outra cidade ou estado sai da amostra como **fora do território**
    (D11), marcado e nunca escondido;
  - marca sem localidade continua nacional, como hoje.
- **Custo.** A coleta nova é paga, centavos por consulta, e o custo aparece antes,
  como sempre. Para refazer as 182 entradas da WifiConecta: ≈ US$ 0,64 (§4.9). A SERP
  nacional antiga fica legível como proveniência.
- **Fica nacional:** o volume do Google Ads, o allintitle (KGR), o DataForSEO Labs,
  o YouTube e a Amazon (§4.6, com o porquê).

## 1. Decisão do dono (2026-10-18)

**DECIDIDO pelo dono em 2026-10-18. Escolha literal: "Localidade por marca".**

O que a escolha significa, como o coordenador apresentou:

- Cada marca tem a sua localidade de mercado (WifiConecta: cidade de São Paulo).
- Todas as coletas de SERP daquela marca usam essa localidade: a coleta das 4 lentes
  do Arquiteto, a pesquisa do Radar e o cache.
- Resultado de outra cidade ou território é marcado **fora do território** (relevância
  D11), e não "relevante".
- Coleta nova é paga (centavos por consulta), com o custo dito antes, como sempre.

**SUBSTITUI**, a partir da fase L2 (§9):

- a parte de **localidade** da A8 do adendo das 4 lentes. A8 é a regra "os mesmos
  códigos do Minerador", pelo targeting da última medição da keyword
  (`lib/arquiteto/serp-lens-targeting.ts:4-22`; `lib/server/radar-serp-lenses.ts:145-154`).
  O **idioma** continua como está;
- a frase "Pesquisas do DataForSEO e resultados do Google: Brasil inteiro", no que
  diz da SERP Google (`docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md:407`).
  O Labs continua Brasil inteiro.

Os documentos antigos ganham **SUBSTITUÍDO (2026-10-18)** na mesma entrega
(`AGENTS.md` §0.5).

## 2. O caso real (verificado)

Leitura remota de 2026-10-18, só `SELECT`. **Verificado (banco).**

- **Cache de SERP** (`editorial_workflow_items`, `subject_type = 'serp_cache_entry'`).
  Todas as entradas são `locationCode` 2076 e `languageCode` "pt":

  | Marca | Entradas |
  |---|---:|
  | AdalbaPro | 842 |
  | WifiConecta | 182 |
  | Somatec Blocking | 44 |

- **`marcas.localizacao`** (coluna `text`, já existe):

  | Marca | Valor |
  |---|---|
  | AdalbaPro | "São Paulo" |
  | WifiConecta | "" (vazio) |
  | Somatec Blocking | "Brasil" |
  | Care Glow | "Brasil" |

- **A Skill de voz da WifiConecta** tem a seção "5. Particularidades de São Paulo"
  ("Considerar São Paulo como um mercado heterogêneo"; cobertura por CEP). O mercado
  é a capital.
- **BrandDNA:** nenhuma marca tem versão de `brand_dna` gravada (o `SELECT` devolveu
  vazio).
- **O topo com provedores de outras cidades:** relatado pelo dono e pelo
  coordenador. Não foi relido aqui.

## 3. Contrato atual (verificado no código)

### 3.1 De onde vêm os códigos hoje

- **Ambiente, para todos:** `readDataForSeoTargetCodes`
  (`lib/minerador/dataforseo-serp-core.ts:104-110`) lê `DATAFORSEO_LOCATION_CODE`.
  Sem a variável, vale `DATAFORSEO_DEFAULT_LOCATION_CODE = 2076` (`:12`) e
  `DATAFORSEO_DEFAULT_LANGUAGE_CODE = "pt"` (`:13`). A config da conexão usa o mesmo
  leitor (`buildDataForSeoSerpConfig`, `:112-124`). O cache acima prova que, na
  prática, é 2076.
- **Por keyword (A8):**
  - `mineradorSerpTargetCodes` / `readMineradorKeywordTargetCodes`
    (`lib/arquiteto/serp-lens-targeting.ts:40-53, 74-103`) e
    `readRadarKeywordTargetCodes` (`lib/server/radar-serp-lenses.ts:155-180`) leem o
    targeting da medição do Google Ads e passam por `resolveDataForSeoTargeting`;
  - `resolveDataForSeoTargeting` **só aceita Brasil**
    (`lib/minerador/dataforseo-targeting.ts:34-41`; erro em qualquer outro código,
    `:40`);
  - resultado: sempre 2076, ou o ambiente.
- **O pedido ao provider:** `collectDataForSeoSerpSnapshot` manda
  `options.config.locationCode` (`lib/server/dataforseo-serp-operation.ts:171-180`),
  não o texto `input.location`.
- **O rótulo gravado:** o snapshot grava `location: input.location`, o texto que o
  cliente mandou (`lib/server/dataforseo-serp-normalizer.ts:202`). O `contentHash`
  usa `config.locationCode`.
  - O Radar manda `brand.localizacao || "Brasil"` (`modules/radar/radar-page.tsx:1860,
    4202`; `modules/radar/radar-analysis-page.tsx:357`).
  - O Arquiteto manda `location` com padrão "Brasil" (`lib/server/arquiteto-serp-http.ts:72`).
  - **Consequência (Verificado no código):** as SERPs nacionais da AdalbaPro pedidas
    pelo Radar ficaram rotuladas "São Paulo". **Ainda não verificado:** quantos
    snapshots gravados têm esse rótulo.

### 3.2 Pontos de entrada da SERP Google orgânica (coleta e leitura)

| Arquivo:linha | O que faz |
|---|---|
| `lib/server/arquiteto-serp-http.ts:410, 435, 480` | `targetCodes` do ambiente; os códigos de cada keyword pela A8; `codesFor` |
| `arquiteto-serp-http.ts:748-771` | `formationSerpCodesMatch(targetCodes, resolution.config)`. Se a config diverge da chave, descarta os acertos do cache (`lib/arquiteto/dataforseo-serp-compatibility.ts:157-163`) |
| `arquiteto-serp-http.ts:869-908, 980-1005` | a coleta paga e a gravação, com `resolution.config.locationCode` |
| `lib/server/arquiteto-serp-rework-guard.ts:44-65` | a guarda de retrabalho põe `location` (o texto do pedido) na impressão digital |
| `app/api/arquiteto/keyword-serp/route.ts:187` | a coleta do lote, com os códigos do ambiente |
| `app/api/arquiteto/territorial-serp/route.ts:173, 297, 314-366` | a SERP do território, com o ambiente e a mesma conferência de divergência |
| `app/api/arquiteto/serp-subject/route.ts:48`; `lib/server/arquiteto-serp-subject-store.ts:109, 196` | leitura da pegada da mesa (D2.2), só do cache |
| `lib/server/arquiteto-differentiation-store.ts:270, 283, 290`; `lib/minerador/subject-discovery-search.ts:382-396` | a diferenciação de publicados coleta e lê a SERP das candidatas na chave 2076 do Labs |
| `app/api/editorial/serp/route.ts:502, 574` | a pesquisa do Radar (canônica e auxiliar), por `readRadarKeywordTargetCodes` com o ambiente |
| `lib/server/radar-support-research.ts:177` | a busca de apoio, idem |
| `lib/server/radar-portable-export-core.ts:570` | o CSV lê o cache com os códigos do ambiente |
| `lib/server/minerador-serp-lens-coverage.ts:343-352` | a cobertura de lentes do Minerador compara os códigos |
| `lib/editorial/serp-cache.ts:101-152, 299-314` | a chave `SerpCacheQuery` (keyword × `locationCode` × idioma × lente × endpoint, por marca: `marca_id`, `lib/server/serp-cache-store.ts:93, 168, 221, 248`); "outra localidade" não serve; validade de 30 dias (`:89`) |

### 3.3 O que é nacional por desenho

| O quê | Onde |
|---|---|
| allintitle (KGR) | `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts:311, 698`; `app/api/arquiteto/article-allintitle/route.ts:149-160`; só Brasil pelo resolvedor (`dataforseo-targeting.ts:40`) |
| DataForSEO Labs | travado em 2076 (`lib/minerador/dataforseo-labs-keyword-research-core.ts:30, 150-157`) |
| Google Ads | o Descobrir aceita Brasil ou UFs, por escolha do usuário (SP = `geoTargetConstants/20106`, `lib/minerador/google-ads-discovery-catalog.ts:21-27, 56-57`); não há código de cidade no repo |
| YouTube | `app/api/editorial/radar-youtube-search/route.ts:229, 300` (`config.locationCode`) |
| Amazon | `app/api/editorial/radar-amazon-search/route.ts:347, 473`; o locale sai da localidade (`lib/server/dataforseo-amazon-operation.ts:73-86`, `radarMerchantAmazonLocale`) |
| Saúde da integração | `lib/server/platform-integrations-health.ts:77` |

### 3.4 D11 hoje

- `radarCompetitiveRelevanceReasons` (`lib/radar/competitive-reading.ts:78-94`) tira
  da amostra quem está:
  - fora do leitor (outra profissão);
  - "fora do território" **temático** (área vizinha, loja ou consumo,
    `lib/radar/research-noise.ts:229-297`);
  - fora da curva de medida.
- A mesma régua marca a coluna `relevancia_d11` da SERP crua: "relevante" quando não
  há motivo (`lib/radar/serp-raw-export.ts:197-201, 285, 332-370`).
- A régua **não tem geografia**. `RadarResearchNoiseContext`
  (`research-noise.ts:32-41`) só leva núcleo, temas, leitor e domínios.

### 3.5 O campo da Marca

- `marcas.localizacao` é editado:
  - na página da Marca (campo "Localização", `modules/marca/brand-page.tsx:28, 89`),
    pelo `PUT /api/marcas` (`app/api/marcas/route.ts:120-134`), com
    `requireCanonicalBrandManageOrPlatformAdmin`;
  - na criação de marca pela agência ("Localização / área de atuação",
    `modules/conta/agency-brand-create-modal.tsx:86`).
- O tipo do cliente é `lib/editorial/contracts.ts:23`.

## 4. Proposta

### 4.1 Onde a localidade mora (decisão do dono, §12 Q1)

| Opção | Como | A favor | Contra |
|---|---|---|---|
| **A · `marcas.localizacao` + catálogo validado** (recomendada) | o texto do campo de sempre vale como localidade **só** quando casa com uma entrada de um catálogo puro e versionado (`BRAND_SERP_LOCATIONS`); o resto vale nacional, com aviso | sem migration; o campo e a tela já existem; o Radar já trata o campo como a localidade da SERP; é corrigir a linha, não criar outra | texto livre; a AdalbaPro tem "São Paulo" e mudaria para a capital se o catálogo casar (Q2) |
| B · coluna nova `marcas.serp_location jsonb` (código, rótulo, quem e quando) | migration que **o dono roda** (`db query -f` + `migration repair`; nunca `db push`) | código explícito, trilha | um segundo "local" ao lado de `localizacao` (cheiro de linha paralela); migration |
| C · campo no BrandDNA | aditivo opcional, como `authoritySources` | versionado e aprovado | nenhuma marca tem BrandDNA gravado (§2): exigiria criar e aprovar todos antes |

**Recomendação: A**, com estas regras:

- **Catálogo** (puro, versionado):
  - "Brasil" e vazio → 2076, nacional;
  - "São Paulo (cidade)" → o código da cidade, **só depois de confirmado** (§4.10).
  - Rótulo do catálogo, não palavra solta: "São Paulo" sozinho é ambíguo (estado ou
    capital) e **não casa**, salvo decisão do dono (Q2).
- **A página da Marca** mostra, debaixo do campo de sempre, a localidade que a SERP
  usa ("SERP: Brasil (nacional)" ou "SERP: São Paulo (cidade)"). O campo oferece as
  entradas do catálogo como sugestão. Sem botão novo.
- **Mudar a localidade não coleta nada.** Só muda a chave das próximas coletas.

### 4.2 Um resolvedor, no servidor

`resolveBrandSerpTarget(brandId)` devolve
`{ locationCode, languageCode, label, source: "brand" | "national", catalogVersion }`.

- Lê `marcas` pelo `brandId` do contexto autorizado, numa coluna estreita.
- **Nunca** aceita localidade vinda do cliente. O `location` que o Radar e o Arquiteto
  mandam passa a ser ignorado na decisão.
- O idioma continua o do ambiente ("pt").
- Falha de leitura → nacional, com o diagnóstico dito (como `readFailed` hoje).

### 4.3 Uma regra para toda SERP Google orgânica

Todos os pontos do §3.2 trocam os códigos do ambiente e da A8 pelos do resolvedor:

- a coleta e a leitura da mesa do Arquiteto;
- a SERP do território;
- a diferenciação de publicados;
- a pesquisa canônica e a auxiliar do Radar;
- a busca de apoio;
- a leitura do cache no CSV.

A keyword deixa de decidir a localidade, porque o targeting do Google Ads é da
medição de volume, não da SERP. Detalhes:

- **A config:** o `locationCode` da config DataForSEO passa a ser o do resolvedor na
  operação. Assim `formationSerpCodesMatch` continua verdadeiro e a chave é o que vai
  ao provider. Hoje a divergência descarta o cache (`arquiteto-serp-http.ts:756-769`).
- **A guarda de retrabalho:** recebe o **rótulo resolvido**, não o texto do pedido.
  Localidade nova = composição nova = a coleta não é barrada como "mesma composição".
- **O rótulo do snapshot:** `location` passa a ser o rótulo do que foi pedido,
  "Brasil" ou "São Paulo (cidade)". Isso fecha o rótulo falso do §3.1.

### 4.4 Cache

- **Sem mudança de formato.** A chave já inclui `locationCode` e é por marca
  (`marca_id`). Localidade nova = `subjectId` novo.
- **As entradas nacionais ficam:**
  - não são apagadas;
  - os pacotes congelados do Radar e os pareceres gravados continuam lendo o que
    gravaram, como proveniência;
  - vencem pela validade de sempre (30 dias).
- **Decisão só com a mesma localidade.** A formação, a pegada da mesa (D2.2), a
  pesquisa e a leitura competitiva usam só entradas da localidade da marca. Não
  misturar nacional com cidade na mesma medida.
  - Uma keyword sem a entrada nova aparece como "lente que falta", com o motivo
    "coletada só para o Brasil; a marca agora é São Paulo (cidade)".
  - Isso é leitura aditiva: o servidor calcula também a chave nacional só para dizer
    o motivo.
  - **SUBSTITUÍDO (2026-10-18, decisão do dono no status acima, Q6):** na mesa, a
    keyword com SERP só nacional **mostra a SERP antiga marcada** (não "lente que
    falta"); a coleta local é pelo botão de sempre, com o custo antes (§14.3).
- **Coleta nova só por ação paga explícita,** nos botões de sempre, com o plano pago e
  a quota (`quota.ensureCovered`) antes.

### 4.5 D11 geográfico (a mesma régua)

- **O contexto:** `RadarResearchNoiseContext` ganha `location?` (opcional, aditivo):
  rótulo, cidade, UF e apelidos.
- **O motivo novo** em `radarCompetitiveRelevanceReasons`:

  > `fora do território: outra localidade (<cidade ou UF citada>; a marca atende <rótulo>)`

  - Entra quando título, trecho, os 4 primeiros H2/H3 ou o caminho da URL citam uma
    cidade ou UF do gazetteer diferente da marca **e** não citam a da marca.
  - Página nacional (sem cidade) continua relevante. Por exemplo, um comparador
    nacional não sai.
- **Gazetteer:** puro e versionado, tirado da lista oficial do IBGE. São capitais, UFs
  e municípios acima de um corte de população a decidir (Q4); nada inventado.
  Apelidos explícitos ("Sampa", "capital paulista") vão ao catálogo da localidade.
- **Uma régua só:** a amostra relevante, as medidas (D12), `relevancia_d11` da SERP
  crua e a resposta "de fora do leitor" do PAA.
- **Sem localidade na marca, nenhum motivo geográfico.** O E0 e as marcas nacionais
  ficam iguais.

### 4.6 O que fica nacional, e por quê

- **Google Ads (volume do KeywordDNA) — recomendação: nacional, sem seguir a marca.**
  1. O volume decide a coleta. "Keyword sem volume nunca é coletada", e a principal
     sem volume só é paga quando é a de identidade (`arquiteto-serp-http.ts:414-475`,
     `serpCollectionAllowed`).
  2. O volume de cidade arredonda para zero em muita cauda longa. Muitas keywords
     perderiam a coleta das 4 lentes por "sem volume".
  3. O volume é dado canônico do KeywordDNA e da trava. Trocar a base pede
     remedição de todas as keywords e muda o sentido de versões gravadas e do KGR.
  4. O Descobrir já deixa o usuário escolher a UF quando quer. Isso continua como
     está.
  5. Um "volume local" como sinal extra, aditivo, pode ser outra SDD.
- **allintitle (KGR):** comparável só no nacional. O resolvedor aceita só Brasil, e o
  KGR é opcional desde 2026-09-28.
- **DataForSEO Labs:** travado em 2076 no código.
- **YouTube:** recomendação nacional (Q5). Vídeo não é busca local, e não foi
  verificado se o endpoint aceita cidade.
- **Amazon:** a loja é do país, e o locale é derivado da localidade. Um código de
  cidade arrisca a recusa 40501 que já aconteceu com o locale.

### 4.7 Isolamento por marca

- **A localidade:** lida pelo `brandId` do contexto autorizado, nunca do cliente.
- **O cache:** continua filtrado por `marca_id`. Duas marcas com a mesma keyword em
  localidades diferentes nunca dividem entrada, como hoje.
- **A troca:** mudar a localidade da marca A não muda nada da marca B.

### 4.8 Catálogo do MCP e telas

- **Catálogo:** `lib/agent/platform-catalog.ts` diz a regra nas notas da SERP do
  Arquiteto e do Radar: a localidade da marca, nacional sem ela, e o que fica
  nacional (`AGENTS.md` §17.1).
- **Telas:** a prévia de custo dos botões de sempre diz a localidade ("4 lentes ·
  São Paulo (cidade)").

### 4.9 Custo (dito antes, como sempre)

- **Preço por consulta `advanced`:** US$ 0,0035, medido em 2026-08-29 (comentário em
  `dataforseo-serp-core.ts:6-11`). Conferir a tabela vigente.
- **Ainda não verificado:** se a DataForSEO cobra diferente por cidade.
- **Refazer as 182 entradas da WifiConecta** (as 4 lentes das keywords dela):
  ≈ 182 × 0,0035 ≈ **US$ 0,64**.
- **Somam-se:**
  - a pesquisa do Radar por artigo (canônica e auxiliar), que gera pacote novo;
  - "Organizar o artigo-modelo" de novo, com IA, em até 2 chamadas por artigo.
- **AdalbaPro:** não muda se continuar nacional (Q2). Se passar à capital, refazer as
  842 entradas sai ≈ US$ 2,95.

### 4.10 O código da cidade de São Paulo

- **Não é fixado nesta SDD.** Precisa ser confirmado na lista de localidades da
  DataForSEO para a SERP Google (filtro Brasil, tipo cidade), ou no CSV de
  localidades da documentação dela.
- **Antes de rodar,** confirmar que a consulta da lista não é cobrada.
- **No repo só existe o Brasil:** 2076, nos dois providers
  (`dataforseo-serp-core.ts:12`; `google-ads-discovery-catalog.ts:4`). A UF SP do
  Google Ads é 20106 e não serve para a cidade.
- **Ainda não verificado:**
  - se a DataForSEO devolve a SERP Google orgânica `advanced` com localidade de
    cidade;
  - se o eco de `location_code` na resposta bate. O normalizador exige o eco hoje
    (`dataforseo-serp-core.ts:166-171`, no allintitle).

## 5. Compatibilidade e migração

- **Opção A:** sem migration, sem campo novo no payload, sem mudança na chave do
  cache.
- **Opção B:** um arquivo de migration que **o dono roda** manualmente. A coluna é
  nula; nulo = nacional, então o comportamento é o de hoje até alguém preencher.
- **Marca sem localidade = hoje, byte a byte:** mesma chave, mesmo pedido, mesmo
  snapshot. A exceção é o rótulo `location` do snapshot, que passa a dizer "Brasil"
  onde o cliente mandava outro texto. Essa é a correção do §4.3.
- **Ordem do deploy:** primeiro o código (L1–L3), com toda marca nacional. Depois, o
  dono põe a localidade da WifiConecta (L4). Por fim, as coletas pagas, por ação
  explícita.

## 6. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | A AdalbaPro muda para a capital sem querer ("São Paulo" no campo) | o catálogo não casa a palavra solta; o dono decide (Q2) |
| R2 | Mesa misturada (nacional + cidade) muda o agrupamento D2.2 | decisão só com a mesma localidade (§4.4); a lente que falta é dita |
| R3 | A cidade não é aceita no `advanced` ou o eco diverge | L0 confirma antes; o normalizador recusa o eco divergente, como hoje |
| R4 | Gazetteer gera falso positivo (nome de cidade em nome de produto ou de rua) | só cidade ou UF do gazetteer **e** sem a da marca; motivo dito, nunca escondido; fixture com casos |
| R5 | Algum ponto de entrada fica com o ambiente (porta velha rodando ao lado) | teste de forma que lista os pontos do §3.2 e prova que todos chamam o resolvedor (`AGENTS.md` §0.5) |
| R6 | Custo de recoleta sem querer | mudar a localidade não coleta; só os botões pagos, com prévia |
| R7 | Pacotes congelados nacionais × coleta nova | proveniência: o pacote diz a localidade; "Pesquisar de novo" gera versão nova, e o artigo-modelo pede reorganização (custo dito) |
| R8 | Outras frentes editam `lib/radar/**` | implementar depois que elas fecharem |

## 7. Rollback

- **Rollback de dado:** voltar a localidade da marca para "Brasil" ou vazio. As
  chaves voltam a 2076; as entradas nacionais que ainda valem servem de novo. As da
  cidade ficam como proveniência. Nada é apagado.
- **Rollback de código:** reverter pelo git (o dono faz o commit). Os pontos voltam ao
  ambiente.
- **Na opção B:** o rollback da coluna é um `DROP COLUMN` que o dono roda, só se ela
  estiver vazia.

## 8. Testes (fixtures, zero chamada paga)

1. **Resolvedor e catálogo:**
   - vazio, "Brasil", nulo e leitura falha → 2076, nacional;
   - "São Paulo (cidade)" → o código da fixture do catálogo;
   - texto desconhecido e "São Paulo" solto → nacional, com aviso;
   - a localidade do cliente é ignorada.
2. **Chave do cache:** códigos diferentes → `subjectId` diferente;
   `serpCacheEntryServes` diz "outra localidade"; a entrada nacional não serve a
   pedido da cidade.
3. **Pedido ao provider (fetch falso):** o corpo leva `location_code` da marca em
   cada um destes:
   - `/api/arquiteto/serp` e `/api/arquiteto/keyword-serp`;
   - `territorial-serp` e a diferenciação de publicados;
   - `/api/editorial/serp` (canônica e auxiliar) e a busca de apoio.

   E `formationSerpCodesMatch` fica verdadeiro, e o cache não é descartado.
4. **O que fica nacional:** allintitle, Labs, YouTube e Amazon continuam 2076 com a
   marca em São Paulo; o volume do Google Ads não muda.
5. **Isolamento:**
   - marca A em São Paulo e marca B sem localidade, mesma keyword → chaves e pedidos
     diferentes;
   - B continua 2076;
   - o cache de uma não serve à outra.
6. **Snapshot:** o rótulo `location` é o que foi pedido.
7. **D11 geográfico:** fixture de SERP com provedores de Curitiba, Belo Horizonte e
   um comparador nacional. Com a marca em São Paulo:
   - os dois de fora saem "fora do território: outra localidade…";
   - o nacional fica;
   - a amostra, as medidas e `relevancia_d11` batem.

   Sem localidade, nada muda.
8. **Forma da linha:** cada ponto do §3.2 chama o resolvedor; nenhum lê
   `readDataForSeoTargetCodes` direto para a SERP orgânica. Teste estrutural com os
   comentários limpos.
9. **DOM pelos botões de sempre:** a prévia de custo do Arquiteto e o "Pesquisar e
   finalizar" do Radar dizem a localidade e a contagem paga; a página da Marca mostra
   "SERP: …" debaixo do campo "Localização". Nenhum botão novo.
10. **Suítes:**
    - `test:radar`, `test:arquiteto` (ou equivalente), `test:agent`;
    - os cenários-ouro, com o cenário novo "marca com localidade" na mesma linha
      (`AGENTS.md` §0.3);
    - o E0, que precisa ficar **intocado**: as fixtures não têm localidade;
    - TypeScript e lint direcionado.

## 9. Fases (critério de pronto)

| Fase | O quê | Pronto quando |
|---|---|---|
| **L0** | O dono decide a opção (A ou B), o valor da AdalbaPro e o corte do gazetteer. O código da capital é confirmado na lista da DataForSEO, sem custo, ou o dono autoriza a consulta | decisões registradas aqui, com data |
| **L1** · **feita 2026-10-18 (§14)** | Resolvedor e catálogo puros (só "Brasil" no início), testes 1, 2, 5 e 6; na opção B, o arquivo da migration para o dono rodar | verde; nenhuma marca muda (todas nacionais) |
| **L2** · **feita 2026-10-18 (§14)**, com São Paulo a confirmar | Todos os pontos do §3.2 no resolvedor; config, guarda, rótulo; o que fica nacional com teste; catálogo do MCP; documentos SUBSTITUÍDO | testes 3, 4, 8 e 9 verdes; E0 intocado |
| **L3** · **feita 2026-10-18 (§14)** | D11 geográfico com o gazetteer | teste 7 verde; SERP crua e CSV dizem o motivo |
| **L4** | Entrada "São Paulo (cidade)" no catálogo com o código confirmado; o dono põe a localidade da WifiConecta; coletas pagas pelos botões de sempre, com custo antes; "Pesquisar de novo" e "Organizar de novo" onde ele decidir | readback no banco: entradas `locationCode` da capital para a WifiConecta; o relato do dono confirma o topo sem outras cidades (ou marcadas) |

## 10. O que NÃO muda

- O formato da chave do cache e do payload, a validade de 30 dias, as 4 lentes e o
  `advanced`.
- O volume do Google Ads, o KGR e allintitle, o Labs, o YouTube e a Amazon.
- O idioma ("pt").
- Os pacotes congelados e os pareceres já gravados, que continuam lendo o que
  gravaram.
- A régua D11 temática (leitor, área vizinha, loja, outlier).
- Nenhuma rota, botão, etapa ou painel novo.

## 11. Autorização necessária (o que ainda depende do dono)

1. Escolher a opção de armazenamento (A recomendada, sem migration; B exige migration
   que **o dono roda**).
2. Dizer a localidade de mercado da AdalbaPro (nacional ou capital) e das demais
   marcas.
3. Confirmar o código da cidade de São Paulo, ou autorizar a consulta à lista de
   localidades se ela for cobrada.
4. Pôr a localidade da WifiConecta na Marca.
5. Autorizar as coletas pagas: ≈ US$ 0,64 para as 4 lentes de hoje da WifiConecta,
   mais a pesquisa do Radar por artigo e "Organizar de novo" (IA). Sempre pelos
   botões, com o custo antes.
6. Commit, push e deploy.

## 12. Perguntas ao dono

- **Q1.** Onde guardar: opção A (o campo "Localização" de sempre com catálogo,
  recomendada) ou B (coluna nova com código explícito)?
- **Q2.** A AdalbaPro tem "São Paulo" no campo. O mercado dela é nacional
  (recomendado manter, sem custo) ou a capital?
- **Q3.** Uma marca pode atender mais de uma cidade (ex.: Grande SP)? Hoje a proposta
  é **uma** localidade por marca. Várias pediriam uma decisão de chave e de custo
  (× N).
- **Q4.** Corte do gazetteer do D11: capitais e UFs só, ou também municípios acima de
  N habitantes (IBGE)?
- **Q5.** YouTube fica nacional (recomendado)?
- **Q6.** Na mesa do Arquiteto, a keyword com SERP só nacional aparece como "lente que
  falta" (recomendado) ou continua mostrando a nacional marcada como "de antes"?

## 13. Ainda não verificado

- O código da cidade de São Paulo na DataForSEO, e se a SERP `advanced` aceita cidade
  e ecoa o código.
- Se o preço por consulta muda por localidade.
- O topo da WifiConecta com provedores de outras cidades (relatado; não relido).
- Quantos snapshots do Radar da AdalbaPro gravaram o rótulo "São Paulo" sendo
  nacionais.
- Se `DATAFORSEO_LOCATION_CODE` está definido em algum ambiente. O banco mostra só
  2076; a variável não foi lida.

## 14. Execução L1–L3 (2026-10-18)

Feita sem migration, sem SQL, sem escrita remota e sem chamada paga. Nenhuma
rota, botão, etapa ou painel novo (`AGENTS.md` §0.1). **Verificado no código** e
**Confirmado por teste** (fixtures); a validação manual pelos botões é do dono.

### 14.1 O código da cidade de São Paulo (§4.10)

- **Não conferido na lista da DataForSEO.** A página pública
  `docs.dataforseo.com/v3/serp/google/locations/` diz que a lista é grátis
  ("Your account will not be charged") e aponta o CSV
  `cdn.dataforseo.com/v3/locations/locations_serp_google_2026_09_01.csv`, que passa
  de 10 MB e não pôde ser lido aqui (nada foi baixado). A lista por país é a API
  (`GET /v3/serp/google/locations/br`), que esta entrega não chamou.
- **Candidato: 1001773.** A lista oficial de geotargets do Google Ads (arquivo de
  2022-08-03) traz 1001773 = "Sao Paulo,State of Sao Paulo,Brazil", tipo City, pai
  20106 (o mesmo 20106 de SP que o repo já usa no Descobrir). A DataForSEO usa os
  mesmos ids do Google como `location_code` (2076 = Brasil nos dois), mas isso não
  substitui a conferência.
- **Por isso:** a entrada "São Paulo (cidade)" está no catálogo **a confirmar**
  (`codeConfirmation: null`) e não vale para a SERP; toda marca segue nacional.

### 14.2 L1 · catálogo e resolvedor

- `lib/marca/brand-serp-location.ts` (puro): `BRAND_SERP_LOCATIONS` (versão
  `2026-10-18-br`): "Brasil" (nacional, códigos do ambiente) e "São Paulo
  (cidade)" (a confirmar, com o candidato e a fonte). `resolveBrandSerpLocation`
  (vazio/"Brasil" → nacional sem aviso; "São Paulo" solto → ambíguo; texto
  desconhecido → guardado e não usado; a confirmar → nacional com aviso),
  `brandSerpTargetOf`, `withBrandSerpLocation` (a config com a localidade da marca;
  marca nacional = o mesmo objeto), `brandSerpPlanLocation` e
  `brandSerpLocationHelperText` (a frase do campo da Marca).
- `lib/server/brand-serp-target.ts`: `resolveBrandSerpTarget(client, brandId)` lê
  `marcas` só em `id,localizacao`, filtrado pelo `id`; nunca lê localidade do
  cliente; leitura falha → nacional com `readFailed`.

### 14.3 L2 · todos os pontos no resolvedor

- **Arquiteto:** `lib/server/arquiteto-serp-http.ts` (chave, config com a
  localidade da marca, rótulo do snapshot nas 3 montagens, guarda de retrabalho
  com o rótulo resolvido, `diagnostic.serpLocation`, `plan.location`),
  `app/api/arquiteto/keyword-serp/route.ts`, `app/api/arquiteto/territorial-serp/route.ts`
  (o rótulo "Brasil" fixo saiu), `app/api/arquiteto/serp-subject/route.ts` e
  `lib/server/arquiteto-differentiation-store.ts` (a mesa e os publicados),
  `app/api/arquiteto/cannibalization/run/route.ts` e
  `app/api/arquiteto/published-reinforcement/search/run/route.ts` (a SERP das
  candidatas na chave da marca com cidade, `serpCodes`; marca nacional: a chave do
  Labs de sempre).
- **Radar:** `app/api/editorial/serp/route.ts` (canônica e auxiliar: códigos e
  rótulo da marca; o `location` do pedido não decide nem rotula),
  `lib/server/radar-support-research.ts` (apoio) e
  `lib/server/radar-portable-export-core.ts` (a leitura do cache no CSV).
- **A8:** `mineradorSerpTargetCodes` e `readRadarKeywordTargetCodes` só decidem o
  IDIOMA; a localidade é a base da marca (SUBSTITUÍDO no código e no adendo).
- **A mesa (decisão do dono, Q6):** com cidade, a lente que só tem a SERP antiga
  nacional é lida como proveniência e mostrada **marcada**
  (`nationalFallback`), e a linha da leitura diz quantas keywords estão assim; a
  coleta local é pelo botão de sempre, com o custo antes. Marca nacional: a
  leitura de antes, sem leitura a mais.
- **A prévia de custo** diz "SERP de São Paulo (cidade)" quando a marca tem cidade
  (`describeSerpPaidPlan`); marca nacional vê a frase de antes.
- **A Marca:** o campo "Localização" de sempre ganhou a frase da SERP que vale, os
  valores aceitos e as sugestões do catálogo (`datalist`), sem botão nem painel.
- **Ficam nacionais (teste):** allintitle (Minerador e artigo), Labs, YouTube e
  Amazon. A CALL 3 do Minerador (a SERP que acompanha o allintitle) segue
  nacional, como o allintitle.
- **Catálogo do MCP:** regra nova em `PLATFORM_SEO_RULES`
  (`lib/agent/platform-catalog.ts`).

### 14.4 L3 · D11 geográfico

- `lib/radar/territory-gazetteer.ts` (puro, versão
  `ibge-censo-2022-500mil-2026-10-18`): as 27 UFs, as 27 capitais e os 41
  municípios com 500 mil habitantes ou mais no Censo 2022 do IBGE (de São Paulo a
  Serra/ES, 520.653; o primeiro fora é Campos dos Goytacazes, 483.540). **O corte
  de 500 mil é a escolha desta entrega** para "municípios grandes" (Q4). Nome que é
  palavra comum (Natal, Serra, Contagem, Vitória, Salvador…) só conta com a UF ao
  lado ou "cidade de / prefeitura de / município de" antes.
- A mesma régua (`radarCompetitiveRelevanceReasons`) ganhou o motivo
  `fora do território: outra localidade (<citada>; a marca atende <rótulo>)`, lendo
  título, trecho, os 4 primeiros cabeçalhos e o endereço; vale para a amostra
  relevante, as medidas (D12), a resposta "de fora do leitor" do PAA e a coluna
  `relevancia_d11` da SERP crua. A montagem do export põe o território só na
  entrada da marca com cidade (`serpTerritory`). Marca nacional: nada muda (o E0
  segue intocado; a versão da leitura competitiva não mudou por isso).

### 14.5 Testes

- Novo: `tests/radar-localidade-serp-por-marca-2026-10-18.test.mts` (no
  `test:radar`): testes 1, 2, 5, 6, 7 e 8 desta SDD, o que fica nacional (4), a
  mesa com a SERP antiga marcada, a prévia de custo e o campo da Marca (estrutural:
  não há suíte DOM da página da Marca).
- Atualizados para a regra nova (SUBSTITUÍDO): `arquiteto-serp-cache-formacao`,
  `arquiteto-territorial-serp`, `arquiteto-origem-do-silo`,
  `radar-portable-export-integracao-serp-silo`, `radar-analise-competitiva-f3`,
  e o filtro de marca de `marcas` (`id`) em `arquiteto-diferenciacao-publicados-servidor`
  e `arquiteto-reforcar-publicados-servidor`.

- **Bateria `npm run test:regressao` (2026-10-18, depois desta entrega):** verdes
  TypeScript, `arquiteto` (3032), `arquiteto:servidor` (185), `arquiteto:dom`,
  `radar` (3730, com o E0 intocado), `agent`, `editorial` (teto 4), `marca`,
  `redator`, `authz` (teto 2). Vermelhas por outras frentes em andamento, não por
  esta: `arquiteto:cenarios` (C17, já vermelho na linha de base), `arquiteto:lentes`
  (o mock do Desfazer Silo sem `assertWholeSiloUndoConfirmed`; as duas rotas
  passaram 45/45 numa cópia temporária com o mock completo, apagada depois),
  `minerador:cenarios`/`minerador:dom` (G18 e a confirmação forte da exclusão) e
  `minerador:todos` (27 = as 25 antigas + as 2 da exclusão).

### 14.6 L4 (do dono)

1. Conferir o código da cidade de São Paulo na lista da DataForSEO (o CSV acima ou
   `GET /v3/serp/google/locations/br`, grátis segundo a documentação) e, com o
   código conferido, ativar a entrada (`codeConfirmation` preenchido, versão do
   catálogo nova, teste da entrada ativa).
2. Na Marca, no campo "Localização": **WifiConecta → `São Paulo (cidade)`**;
   **AdalbaPro → `São Paulo (cidade)`** (hoje está "São Paulo", que é ambíguo e vale
   nacional).
3. As coletas pagas pelos botões de sempre, com o custo antes (§4.9).
