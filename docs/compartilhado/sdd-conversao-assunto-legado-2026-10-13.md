# SDD — Converter o Assunto do formato anterior para o formato novo — 2026-10-13

> **Status: APROVADA PELO DONO em 2026-10-13 para implementação em fases (§20).**
> Decisão de abrir a SDD: dono do produto, 2026-10-13 ("escreve sim").
> Autorização de implementação, 2026-10-13, literal: "pode implementar, que seja
> tudo para melhorar e acelerar esse fluxo, desde o início até os entregáveis, e
> sobre os entregáveis não muda nem apaga nada das últimas arrumações que fizemos,
> ainda falta pequenos ajustes mas hoje ele já entrega o artigo com bom embasamento
> e argumentação útil." As decisões D1–D10 (§19) foram tomadas pela recomendação.
> Complementa a SDD `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md`
> (§11.1/C7 e o backlog do Minerador, item "WifiConecta · laranja") e a SDD
> `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`. ADR-022
> (D1-bis, D1-ter) continua valendo sem emenda nova, exceto o que a §13 pede.
> Este documento não altera código, não escreve no banco, não cria migration e
> não faz chamada paga. Commit, push e deploy são do dono (`AGENTS.md` §15).

## 0. Resumo para o dono

Hoje existem dois jeitos de um Assunto morar na plataforma:

- **formato anterior** — o Assunto é uma keyword própria, cujo texto é o
  título ("Claro, Vivo ou TIM: qual internet residencial escolher?"); a
  principal do artigo é outra keyword;
- **formato novo** (cadastro único) — o Assunto mora DENTRO da keyword que
  carrega o artigo (`keyword_subject.entry`), com a trava travada/livre; "na
  planilha só existem keywords".

A conversão leva cada artigo do formato anterior para o novo **sem perder
nada e sem refazer o que já foi feito**:

1. **No Minerador**, no card "Cadastrar Assuntos" (destino "Silo existente"),
   as linhas do formato anterior aparecem com o botão **"Converter para o
   formato novo"**. Para cada artigo você escolhe qual keyword passa a carregar
   o Assunto (a sugestão é a principal que o artigo já tem no Arquiteto), revisa
   o título e os detalhes e vê a prévia do que muda. Um clique grava o Assunto
   dentro da keyword escolhida, reaprova essa keyword (só a Lógica, D2-bis) e a
   reenvia ao Arquiteto.
2. **No Arquiteto**, o artigo mostra "Assunto mudou de keyword · atualização
   disponível". Um clique em **"Atualizar o Assunto do artigo"** grava a versão
   nova do ArticleDNA apontando para a keyword nova (as versões anteriores ficam
   no histórico). Com o plano do grupo, o painel de sempre **"Aplicar o plano
   declarado ao Silo"** atualiza o SiloDNA e a SiloPage.
3. **A linha-título não vai para a lixeira.** A lixeira do Minerador, para
   keyword não publicada, é exclusão **definitiva** (verificado no banco, §2.6).
   Recomendação: a linha-título fica **arquivada por derivação** — continua viva
   e inalterada, deixa de valer como Assunto em todas as telas e leitores, aparece
   com o selo "Linha-título convertida → <keyword>" e fica fora da formação.
   Nenhum clique extra e nada a desfazer nela.

Na WifiConecta (grupo laranja): **7 artigos** no Arquiteto a converter, **1
Assunto sem artigo** e **1 artigo sem Assunto** no mesmo Silo; nenhum item no
Radar, no Redator ou em Publicações (§3).

## 1. Identificação

- **Módulo proprietário:** Minerador (dono do contrato do Assunto,
  `keyword_subject`). **Consumidor com mudança obrigatória:** Arquiteto (versão
  nova do ArticleDNA pelo writer e pela guarda de sempre; leitura da linha
  convertida). Consumidores sem mudança de contrato: Radar, Redator, Publicações
  (leem `ArticleDNA.subject.phrase`, que não muda de texto). MCP/catálogo
  (`AGENTS.md` §17.1).
- **Tipo:** estrutural (`AGENTS.md` §4): muda o lugar do Assunto em dados já
  aprovados e transportados, toca workflow (reaprovação, envio, versão nova do
  ArticleDNA) e a regra de conservação (§10). Por isso SDD antes do código.
- **Fontes lidas:** `AGENTS.md` (§3, §4, §9, §10, §11, §15, §17.1),
  `docs/00-produto/invariantes.md`, ADR-022 (D1-bis, D1-ter), as duas SDDs
  citadas, `docs/compartilhado/template-proposta-evolucao-modular.md`,
  `docs/03-minerador` e `docs/04-arquiteto` (spec, estado-atual, backlog).

## 2. Contrato atual (verificado no código e no banco em 2026-10-13)

### 2.1 O Assunto no Minerador

| # | Onde | Verificado |
|---|---|---|
| M1 | `lib/minerador/keyword-subject.ts` | `keyword_subject = { declared, note, destinationUrl, destinationCheck, plan?, entry? }`; `resolveKeywordSubject`; `subjectPhraseOf(texto, { entry })` = `entry.title` ou o texto da linha; `setKeywordSubject` (idempotente: `changed:false` sem mudança real; histórico append-only); `withdrawKeywordSubject` sem chamador desde a C7. |
| M2 | `lib/minerador/declared-plan.ts` | `DeclaredArticlePlanSchema.strict()` com `lock?`; `SubjectEntrySchema.strict()` com `source: z.literal("cadastro")`; `declaredPrincipalLock` (manual → valor; Assunto na própria keyword → travada com Volume validado > 0, livre sem; plano anterior → travada `declared`). |
| M3 | `lib/minerador/declared-plan-import-core.ts` | `importDeclaredPlanWithCore` (preview/apply, `importRequestId`, releitura, reciprocidade). Artigo já gravado do formato anterior é casado e **mantido** como `legacy` (o Assunto "continua na linha dele"); título igual a um Assunto anterior declarado SEM plano é **adotado** como `legacy` (linhas 567-572). Não existe hoje caminho que mude um artigo de `legacy` para `cadastro`. |
| M4 | `lib/minerador/approved-package.ts` | O pacote aprovado congela `analise_semantica`; qualquer mudança no conteúdo muda o hash e a linha volta a "Em revisão" (derivado). D2-bis: a marca `keyword_declared_principal` aprova só com a Lógica. |
| M5 | `lib/minerador/keyword-dna.ts` | `KeywordDna.subject` `.strict()` (com `plan?`, `entry?`). É **vista** (§62 do spec): não é persistida, então campo novo opcional não tem risco de rollback. |
| M6 | `lib/minerador/subject-article-view.ts` | O painel "Assunto deste artigo" lê os dois formatos. Assunto com `entry` e **sem** plano mostra "Protegida pela página publicada" — rótulo errado para uma keyword não publicada (§6.4). |

### 2.2 O Assunto no Arquiteto

| # | Onde | Verificado |
|---|---|---|
| A1 | `lib/arquiteto/contracts.ts` | `ArticleDNA.subject = DeclaredSubjectSchema.strict()` = `{ keywordId, approvedPackageRef, phrase, note, destinationUrl, attachedBy, attachedAt }`. O Assunto não pode ser secundária nem reforço do mesmo artigo (superRefine). A identidade do artigo é `articleId` (= `entity_id` das versões). |
| A2 | `lib/arquiteto/declared-subject.ts` | `readArchitectSubjectStanding` lê do **pacote aprovado**; `planSubjectAttachment` (recusa `NOT_RECEIVED`, `NO_APPROVED_PACKAGE`, `NOT_DECLARED`, `SUPPORT_ROLE`, `PRINCIPAL_WITHOUT_VOLUME`…); `attachSubjectToArticleDna` recusa **outro** Assunto (`ANOTHER_SUBJECT_ATTACHED`: "solte antes"); `resolveAttachedSubjectStanding` → `update_available` quando o pacote do Assunto mudou. Conservação: `isAnchoredSubject`, `splitUngroupedBySubjectAnchor` (Assunto sem artigo fica em "não agrupadas"), `subjectFormationSets`. |
| A3 | `lib/arquiteto/declared-plan-formation.ts`, `article-formation-priority.ts`, `serp-subject-diagnosis.ts`, `lib/server/arquiteto-article-improvement.ts` | Os alvos "Assunto" da formação e da melhoria saem de toda keyword **declarada e recebida** que não é membro de outro alvo; o artigo existente é achado por `subject.keywordId === <keyword>`. A "lista do Assunto" é `subject_discovery.subjectKeywordIds ∋ <id do Assunto>`. |
| A4 | `lib/server/arquiteto-persistence.ts` + `lib/server/arquiteto-subject-guard.ts` | Toda gravação de ArticleDNA com `subject` passa pela guarda do Assunto (ator humano, pacote, Q7) e pela guarda de retrabalho (`article_dna_write`, `contradicts_declared`, `parallel_path`). |
| A5 | `lib/arquiteto/silo-declared-plan-application.ts` (+ servidor, rota, painel e MCP `apply_declared_plan_to_silo`) | "Aplicar o plano declarado ao Silo": SiloDNA e SiloPage v+1 com `articleReferences` nas **versões vigentes**, Pilar e ordem do plano; recusa artigo fora do plano ainda no Silo ("Retirar artigo do Silo"); avisa que o grafo de links fica desatualizado. |
| A6 | `lib/editorial/rework-guard.ts` | Uma guarda só; tipos de operação fechados em `REWORK_OPERATION_KINDS` (aditivo); registro em `editorial_workflow_items` (`operation_ledger`). |

### 2.3 O que a lixeira faz (verificado no banco, só SELECT)

`public.lifecycle_delete_minerador_keywords` (definição remota lida por
`pg_get_functiondef`, igual à migration `20260921100000_exclusao_publicada_exige_declaracao.sql`):

- keyword **publicada** → `deleted_at` + `purge_after = +24h` (recuperável);
- keyword **não publicada** → **`DELETE`** da linha, das medições e origens, e
  dos `editorial_workflow_items` dela sem evento de decisão (inclusive o item
  `keyword/architect/received`). `lifecycle_keyword_deletion_impact` só bloqueia
  por ContentDocument; ArticleDNA é "preservado" (não bloqueia), e a contagem
  olha `principalKeywordId`/`keywordReferences`, **não** `subject.keywordId`.

Conclusão: "mandar a linha-título para a lixeira" seria **exclusão definitiva**
de uma keyword importada ao Arquiteto e deixaria as versões anteriores do
ArticleDNA apontando para um id inexistente. Viola `AGENTS.md` §10 ("nenhuma
keyword importada ao Arquiteto pode desaparecer"). Esta SDD não usa a lixeira.

## 3. Os dados reais da WifiConecta (SELECT em 2026-10-13)

Marca `d4fa133a-13bd-4bf7-bfd1-d0f22253f223`. Leitura por
`npx supabase db query --linked -f` (só SELECT, JSON por `jsonb_build_object`).

### 3.1 Panorama

| Item | Medido |
|---|---|
| Keywords da marca | 63 vivas, 0 na lixeira |
| Grupo laranja `a9d5c87b-59aa-4e49-8357-3fa893d4cd2d` | `origin=manual`, **`plan=null`, `plan_version=0`**, `silo_id=null`; 56 keywords (51 aprovadas, 5 brutas) |
| Grupo azul `07fec332…` ("Wi-Fi e fibra óptica") | plano v1 (7 artigos); 7 keywords brutas com a marca de principal apontando para si mesmas e **sem** `keyword_subject` (efeito do "Assunto: Não", C7) — fora do escopo desta SDD |
| Assuntos declarados na marca | **8**, todos no laranja, todos `aprovado`, todos formato anterior: sem `plan`, sem `entry`, `note=null`, `destinationUrl=null`, origem `import` |
| Itens `keyword/architect/received` | 51 (as 51 aprovadas do laranja, inclusive as 8 linhas-título) |
| ArticleDNA | 19 versões em 8 artigos (7 com `subject` = linha-título + 1 artigo de território sem Assunto), todas `approved`, origem `human` |
| SiloDNA / SiloPage | 1 + 1, v1 `approved` (`territory:9c75c3a7…`, "planos de internet", slug `planos-de-internet`, Pilar `6d5d87cd…`, SiloPage `noindex`, `publicationStatus=new`); `articleReferences` fixa a **última** versão de cada um dos 8 artigos; `keywordPackageRefs` = 33 (nenhuma linha-título); `linkMap` 7; grafo de links não consolidado |
| Radar / Redator / Publicações | **0** itens de workflow no Radar, 0 `radar_analysis_runs`, 0 `content_documents`, 0 `publication_records` |
| `editorial_group_articles` | 0 linhas |

**Divergências com o que se supunha:** o grupo laranja **não tem plano**
(a §5 da SDD do cadastro supunha "o plano gravado" do Silo 1 com 8 artigos);
as versões vão de **1 a 4** (não de 2 a 7); as sustentações ligadas às
linhas-título são **35 ligações / 34 keywords** (não ~25); e um dos 8 Assuntos
**não tem artigo**.

### 3.2 Por artigo (versão vigente do ArticleDNA)

"Sustentações" = keywords cujo `subject_discovery.subjectKeywordIds` aponta
para a linha-título. Volumes de `volume_search` (validação do Volume a conferir
na prévia, §6.1).

| # SiloDNA | Linha-título (T) | ArticleDNA | Principal vigente (vol.) | Secundárias | Sustentações → T | Slug vigente |
|---|---|---|---|---|---|---|
| 1 · Pilar | `6d5d87cd` Claro, Vivo ou TIM: qual internet residencial escolher? | 3 versões, v3 | claro ou vivo `3048743b` (590) | 5 | 2 | `claro-ou-vivo` |
| 3 | `4ac4d315` Internet residencial sem fidelidade: quais são as vantagens e desvantagens? | 1 versão, v1 | internet residencial sem fidelidade `e764443e` (170) | 0 | 2 | `residencial-sem-fidelidade` |
| 4 | `f6c2f85e` Como saber quais operadoras de internet atendem meu CEP? | 2 versões, v2 | internet disponível no meu cep `814c9e3b` (260) | 4 | **0** (as 4 do CEP apontam para `5387e9b4` "internet para meu cep", que não é Assunto) | `disponivel-no-meu-cep` |
| 5 | `d59f40a5` Combo de internet, celular e TV: quando vale a pena contratar? | 3 versões, v3 | combo internet celular e TV `64d3cdbd` (20) | 5 | 9 | `combo-celular-e-tv` |
| 6 | `a1306160` Como contratar internet residencial em São Paulo: cobertura, planos e instalação | 4 versões, v4 | contratar internet residencial `668b10ae` (390) | 5 | 11 | `contratar-residencial` |
| 7 | `4339882e` Como escolher o melhor plano de internet residencial para sua casa? | 2 versões, v2 | melhor plano de internet residencial `149dc6aa` (260) | 2 | 4 | `melhor-residencial` |
| 8 | `04320a9b` Internet residencial barata: como encontrar um plano que vale a pena? | 3 versões, v3 | internet residencial barata `0aa3684e` (1.600) | 4 | 6 | `residencial-barata` |
| — | `9df07c7b` Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar? | **sem ArticleDNA** (em "não agrupadas") | — | — | 1 (assine claro internet, que é secundária do artigo 6) | — |
| 2 | (sem Assunto) `article-candidate:territory:…:679b1bb2…` | 1 versão, v1 | plano vivo controle `679b1bb2` (49.500) | 0 | — | `vivo-controle` |

Fatos que pesam na conversão:

- **A identidade do artigo é o id da linha-título** (`articleId` = `entity_id`
  = id de T). O Silo, o `linkMap` e o `narrativeOrder` referenciam esse id.
- Todos os ArticleDNAs vigentes têm `hierarchy = "Suporte"`, inclusive o Pilar
  do SiloDNA (`6d5d87cd`); `primaryKeywordPolicy = free` nos 7 do Assunto.
- Status de todos: aprovado no Minerador, recebido no Arquiteto; nenhum
  publicado, nenhum no Radar.
- Linhas brutas do laranja que parecem as "Palavra-chave" do texto original:
  `65bf5bc8` "Claro Vivo ou TIM internet", `11a34ba3` "contratar internet
  residencial em São Paulo", `f7a6c14b` "quantos Mega de internet preciso" (sem
  volume); e duas sobras de import: `5ea8448a` "Planos e contratação" (nome do
  Silo) e `e2fe761a` "Palavra-chave: internet disponível no meu CEP".
- 11 aprovadas do laranja não estão em artigo nem são tronco (entre elas
  "planos de internet" 5.400 e "vivo internet casa" 880): continuam em "não
  agrupadas"; a conversão não mexe nelas.

## 4. Proposta — visão geral

A conversão é **por artigo**, executada **em lote por grupo** com seleção por
linha, em **duas etapas humanas** (uma por módulo, cada uma no núcleo do seu
dono) e um estado **derivado** para a linha-título:

```
Etapa M (Minerador)  → K recebe o Assunto (entry + plano do grupo + marca recíproca + bloco de conversão)
                     → K é reaprovada (só a Lógica, D2-bis) e reenviada ao Arquiteto
Etapa A (Arquiteto)  → ArticleDNA v(n+1): subject = K (pacote novo), plano aplicado (papel, promessa)
                     → [com plano] "Aplicar o plano declarado ao Silo" → SiloDNA/SiloPage v+1
Linha-título T       → "convertida" por derivação (nenhuma escrita em T)
```

Termos: **T** = linha-título (o Assunto do formato anterior); **K** = a keyword
escolhida para carregar o Assunto; **artigo X** = o ArticleDNA cujo `subject`
aponta para T.

## 5. Etapa M — o Minerador grava o Assunto dentro de K

### 5.1 A escolha de K (por artigo)

| Opção | Quando | Efeito no ArticleDNA |
|---|---|---|
| **Principal vigente do artigo X** (padrão sugerido) | sempre que existir | `subject.keywordId = principalKeywordId`; nada mais muda na composição, no slug nem no KGR. Q7 revista (D1-ter): K carrega o Assunto, pode ser a principal. |
| Keyword **fora** do artigo X (ex.: sustentação com volume não incorporada, ou a "Palavra-chave" bruta do texto original) | o dono prefere outra âncora | K vira o tronco (`subject`), **fora** das seis keywords; a principal do artigo continua. A trava de K segue a regra (sem volume = livre: o Arquiteto pode propor K como principal depois, com decisão humana). |
| Secundária ou reforço do artigo X | — | **Recusada** nesta SDD: o contrato proíbe o Assunto como secundária/reforço do mesmo artigo (A1). Para promover uma secundária, converte-se pela principal e depois usa-se "Melhorar artigos" (troca com prévia e decisão). |
| Keyword publicada, de outro grupo, Assunto de outro artigo ou principal declarada de outro | — | Recusada pelas mesmas recusas do cadastro (`published`, `other_plan`, `is_other_subject`, `declared_elsewhere`). |

### 5.2 O que é gravado (pelo MESMO núcleo do cadastro)

A conversão é um **modo novo** de `importDeclaredPlanWithCore`
(`mode: "convert"`), não um núcleo paralelo. Na mesma sequência e com a mesma
releitura do cadastro:

1. **Plano do grupo (recomendado, §5.4):** grava o Silo planejado em
   `editorial_groups.plan` (nome, slug e objetivo do SiloDNA vigente, editáveis
   na prévia) pelo caminho de sempre (`plan_version` +1, `plan_hash`).
2. **Em K:** `setKeywordSubject` com `entry = { title: <texto de T>, source:
   "cadastro" }`, `note`/`destinationUrl` copiados de T (hoje `null` nos 8),
   `plan = { groupId, planVersion, order, role, scope, declaredPrincipal: { K },
   lock? }`; `setDeclaredPrincipal` com a marca recíproca de K para si mesma;
   `group_id` = o grupo do artigo.
3. **Bloco de proveniência em K (novo, aditivo, jsonb):**
   `keyword_subject_conversion = { fromKeywordId: T, fromPhrase, articleId: X,
   convertedAt, actorId, conversionHash }` + entrada no histórico do Assunto
   (`entryTitle`). Nenhum valor novo em enum `.strict()`: `entry.source` continua
   `"cadastro"`, a origem continua `"import"`.
4. **Reaprovação de K** pelo núcleo de aprovação de sempre (`applyApproval`): o
   conteúdo de K mudou, então o hash muda; a D2-bis aprova só com a Lógica (K
   tem a marca de principal do plano). Se a Lógica faltar, a etapa para aqui e
   diz por quê (nada é aprovado sem o portão).
5. **Envio de K ao Arquiteto** pelo handoff de sempre (o mesmo de "Enviar ao
   Arquiteto" e do MCP `send_keywords_to_arquiteto`): o item recebido de K passa
   a carregar o pacote novo ("Atualização disponível" no Arquiteto).
6. **Releitura:** K declarada com o `entry` certo, reciprocidade confirmada,
   pacote aprovado novo e item recebido com esse pacote. Sucesso só depois disso.

**Por que um clique faz 4–5:** aprovar e enviar são atos do Minerador sobre o
estado atual da keyword, e a prévia mostra exatamente o que será gravado,
aprovado e enviado (decisão humana explícita, com `conversionHash`). Alternativa
(decisão D4): três cliques separados (gravar, aprovar, enviar), com a tela
guiando o próximo passo.

**T não é tocada.** Nenhuma escrita em T: continua aprovada, recebida, com o
pacote antigo e a declaração antiga (que agora é histórico).

### 5.3 A trava

Pela regra da D1-ter, sem exceção nova: com **K = principal vigente** e Volume
validado > 0, a trava automática fica **travada** (cabeceira fixa, como o artigo
já está); sem Volume validado, **livre**. A prévia mostra a trava efetiva e
deixa o dono escolher à mão ("Trava: travada/livre/automática"). Planos
anteriores não existem neste grupo, então a origem `declared` não se aplica.

### 5.4 Com plano do grupo (recomendado) ou sem

- **Com plano (recomendado):** o Silo consolidado vira o plano declarado do grupo
  (nome/slug/objetivo do SiloDNA; ordem do `narrativeOrder`; papel do SiloDNA:
  Pilar = `6d5d87cd`). É o formato do cadastro para destino de Silo, dá ao
  Arquiteto o caminho existente para atualizar o Silo ("Aplicar o plano
  declarado ao Silo", A5) e faz o plano mandar na formação dali em diante. Exige
  os **detalhes** (escopo, 1–1.200 caracteres) de cada artigo: a prévia
  pré-preenche com a `promise` do ArticleDNA vigente, editável. Exige decidir o
  artigo sem Assunto do mesmo Silo (§9, D5), porque "Aplicar o plano" recusa
  artigo fora do plano ainda no Silo.
- **Sem plano (alternativa, para Assunto anterior fora de Silo):** só `entry`
  (com `details`, como no destino publicado) e nenhuma marca de plano. O Silo
  não ganha versão por esta SDD (fica fixando as versões anteriores do
  ArticleDNA); o efeito disso no portão do Radar **ainda não foi verificado**
  (tarefa da V0). Por isso não é o caminho recomendado para a WifiConecta.

### 5.5 Prévia por artigo (o que o dono vê antes de clicar)

- **Minerador:** K ganha o Assunto (título, detalhes, papel/ordem, trava, cor);
  K volta a "Em revisão" e é reaprovada no mesmo ato (ou não, se faltar a
  Lógica); quantas aprovadas voltam a revisão (só K); o grupo ganha o plano
  vN (ou não muda).
- **ArticleDNA (o que a Etapa A vai gravar):** `subject.keywordId` T → K;
  `phrase` igual (o título é o texto de T); `approvedPackageRef` de K;
  `hierarchy` = papel do plano; `promise` = detalhes; principal, secundárias,
  slug e KGR inalterados (quando K = principal).
- **Silo:** "Aplicar o plano declarado ao Silo" vai gerar SiloDNA/SiloPage v2
  (Pilar e ordem do plano, versões vigentes dos artigos); links internos a
  reprocessar (o grafo ainda não existe na WifiConecta).
- **Linha-título T:** fica viva e inalterada; passa a aparecer como "Linha-título
  convertida → K"; deixa de valer como Assunto; nada vai para a lixeira.
- **Sustentações:** as 35 ligações a T passam a valer como lista do Assunto de K
  por **alias derivado** (§6.2); nenhuma é regravada (regravar 34 keywords
  mandaria todas para "Em revisão").

## 6. A linha-título e os leitores (o "arquivamento por derivação")

### 6.1 Por que T não pode sumir, e como deixa de ser "Assunto" legitimamente

T foi **importada ao Arquiteto** (item `received`) e é referenciada pelo
`subject` de 1 a 4 versões imutáveis do ArticleDNA (`AGENTS.md` §9). A regra do
§10 ("toda keyword importada deve estar em artigo ou em Keywords não agrupadas")
fica cumprida assim:

- T **continua existindo** (sem `deleted_at`), com o pacote e o item recebido;
- T fica em **"Keywords não agrupadas"** do Arquiteto, como sempre ficou o
  Assunto sem artigo — mas com o selo **"Linha-título convertida → <K> · não
  forma artigo"** em vez de "Assunto · aguardando sustentação";
- T sai da formação automática, dos alvos da melhoria e das sugestões (o mesmo
  mecanismo de `heldOut`), porque o Assunto dela agora mora em K.

"Convertida" é **derivado**, sem escrita em T: T está convertida quando existe
uma keyword viva K cujo **pacote aprovado** traz `keyword_subject_conversion.
fromKeywordId = T` (no Arquiteto) ou cuja linha traz esse bloco (no Minerador).
Desfazer a conversão em K devolve T ao estado de Assunto automaticamente.

### 6.2 Leitores que aprendem a conversão (V1)

| Leitor | Mudança |
|---|---|
| `resolveKeywordSubject`/novo `readSubjectConversion` (Minerador) | lê o bloco de K; `convertedSubjectIndex(rows)` devolve T → K da marca. |
| `KeywordDna.subject` | `conversion?` opcional (vista não persistida, M5). |
| `readArchitectSubjectStanding` | T convertida: `declared` continua verdadeiro no pacote, mas `convertedTo = K` e `heldOutOfFormation = true`; K: `conversionArticleId = X`. |
| Alvos da melhoria, formação prioritária, diagnóstico da SERP, estado do agente (`agent-platform-state.ts`) | T convertida não vira alvo nem candidata; K acha o artigo por `subject.keywordId === K` **ou** `articleId === conversionArticleId` (evita formar um artigo novo para K no intervalo entre as Etapas M e A). |
| "Lista do Assunto" (`subject_discovery.subjectKeywordIds`) nos 4 leitores (A3) | alias: a lista de K = ligações a K ∪ ligações a T. |
| `splitUngroupedBySubjectAnchor` | terceiro selo: "Linha-título convertida → K". |
| Cadastro (`classify`) | T convertida nunca é adotada como `legacy` nem casada como artigo gravado; o título casa com K (`outraKeyword` já recusa título repetido em outra keyword). |
| Painel "Assunto deste artigo" (`subject-article-view.ts`) | K: formato `cadastro` com "Convertido de <T>"; T: novo `kind: "converted_title"` com o link para K; Assunto com `entry` sem plano e **não publicado** deixa de dizer "Protegida pela página publicada" (M6). |
| Grade do Minerador | filtro padrão esconde T convertida (atalho "Linhas-título convertidas"); nada é apagado. |

### 6.3 Alternativas para T (decisão D1)

| Opção | Efeito | Recomendação |
|---|---|---|
| **(a) Arquivada por derivação** | nenhuma escrita em T; selo e filtro; reversível ao desfazer K | **Recomendada** |
| (b) Marca explícita em T (`keyword_subject_retired`) por clique | muda o conteúdo de T → T vai para "Em revisão" e não pode ser reaprovada como keyword comum (não tem volume); fila de revisão poluída para sempre | não recomendada |
| (c) Lixeira | exclusão **definitiva** da linha e do item recebido (§2.3); versões antigas do ArticleDNA apontam para id inexistente; viola §10 | **não** — só com SDD própria de "lixeira recuperável para não publicadas" |

## 7. Etapa A — o Arquiteto grava a versão nova do ArticleDNA

- **Onde aparece:** o artigo X mostra "Assunto mudou de keyword: <T> → <K> ·
  atualização disponível" (estende `resolveAttachedSubjectStanding` com o estado
  `moved`), e a aba de artigos ganha o painel "Conversões pendentes (N)" com
  seleção e "Atualizar o Assunto dos artigos".
- **O que grava:** função pura nova `reanchorSubjectOnArticleDna(article,
  subjectFromK)` — exige `article.subject.keywordId === T` e que o pacote de K
  traga `conversion.fromKeywordId === T` e `articleId === X`; monta o `subject`
  por `planSubjectAttachment` (pacote de K, ator humano); troca T por K numa
  versão só (não é "soltar e prender": a regra "um Assunto por unidade" continua
  valendo); aplica o plano no mesmo ato (`applyDeclaredPlanToArticleDna`:
  `hierarchy` = papel, `promise` = detalhes) e atualiza a referência do pacote
  de K em `keywordReferences` quando K é membro. Grava pelo writer de sempre
  (`arquiteto-persistence.ts`), com a guarda do Assunto (Q7 aceita K porque K
  carrega o Assunto) e a guarda de retrabalho (`article_dna_write`;
  `contradicts_declared` com a trava).
- **Versionamento:** `version_number` n+1, `previous_version_id` = vigente,
  `origin = human`, `change_reason = "Conversão do Assunto para o formato novo:
  <T> → <K>"`; versões anteriores intocadas. Mesmo Assunto do mesmo pacote =
  `UNCHANGED` (sem versão).
- **Releitura:** a versão vigente tem `subject.keywordId = K` e o pacote de K.
- **Silo (com plano):** depois dos artigos, o painel existente "Aplicar o plano
  declarado ao Silo" (prévia com `decisionHash`) gera SiloDNA/SiloPage v+1 com as
  versões vigentes; título escrito por gente na SiloPage fica; URL e canonical
  nunca mudam. Os links internos ficam desatualizados e são reprocessados pela
  aba Links internos (caminho existente `rebaseInternalLinkGraph`).
- **Sem plano:** o Silo não é tocado por esta SDD (§5.4).

## 8. Efeitos nas etapas seguintes e em publicados

- **Radar:** se o artigo estiver no Radar com a versão anterior, o item recebe
  "Atualização disponível" (status de transferência), como em toda versão nova.
  O Radar se adapta (regra do dono de 2026-10-09): lê o artigo como está, não
  pede reenvio nem mudança no Arquiteto; a frase do Assunto é a mesma. Na
  WifiConecta não há item no Radar.
- **Redator:** o ContentDocument fixa `article_dna_version_id`; nada muda até o
  próximo envio. Na WifiConecta não há documento.
- **Publicações / artigo publicado:** URL, slug, canonical e marca nunca mudam
  (`AGENTS.md` §11). Para artigo publicado, K = a keyword publicada (principal
  protegida) e a conversão usa o formato do destino publicado (`entry` com
  `details`, sem plano); trocar a principal publicada continua fora desta SDD.
  Na WifiConecta nada está publicado.

## 9. Casos especiais do grupo laranja

- **Assunto sem artigo (`9df07c7b`, Mega/Giga):** a conversão é só a Etapa M (não
  há ArticleDNA a versionar). K sugerida: `f7a6c14b` "quantos Mega de internet
  preciso" (bruta, sem volume → **livre**; entra como Bruto e é aprovada pela
  D2-bis). Com plano, vira o artigo 8 do plano e nasce pelo caminho normal
  (formação/melhoria obedecendo ao plano). Alternativa: deixar como está.
- **Artigo sem Assunto no Silo (`679b1bb2` "plano vivo controle", 49.500):** com
  plano, precisa (a) sair do Silo por "Retirar artigo do Silo" (ArticleDNA
  preservado; volta a "sem Silo") ou (b) entrar no plano como artigo com
  Assunto novo cadastrado na própria keyword (travada pelo volume). "Vivo
  Controle" é plano de celular, fora de "planos de internet residencial":
  recomendação (a).
- **Pilar:** o SiloDNA tem Pilar `6d5d87cd` (decisão humana na consolidação) e
  todos os ArticleDNAs dizem "Suporte". Com plano, o Pilar do plano vira o
  `hierarchy` do artigo e o Pilar do Silo. Recomendação: manter `6d5d87cd`.
- **Sobras de import** (`5ea8448a`, `e2fe761a`): a prévia já as aponta como
  sobra; continuam onde estão. Excluí-las é ato separado e explícito do dono e
  **apaga de vez** (keyword não publicada não tem janela de recuperação, §2.3);
  a conversão nunca as exclui. O aviso da prévia do cadastro que dizia
  "mande para a lixeira se quiser (recuperável)" foi corrigido em 2026-10-13.

## 10. Idempotência, retomada, guarda de retrabalho e desfazer

- **Estado por artigo, derivado dos dados** (nenhuma tabela): `não convertido` →
  `Assunto gravado em K, aguardando aprovação` → `K aprovada, aguardando envio` →
  `K no Arquiteto, aguardando versão nova` → `ArticleDNA v(n+1) confirmado` →
  `[com plano] Silo a atualizar` → `concluído`. A tela mostra o próximo passo de
  cada artigo; uma conversão interrompida retoma do passo em que parou.
- **`conversionHash`** = hash de (marca, X, T, K, título, detalhes, papel, ordem,
  trava, plano do grupo). Cada passo é idempotente: gravar de novo o mesmo
  Assunto em K = `changed:false`; aprovar pacote igual não cria versão; reenviar
  o mesmo pacote não muda o item; versão do ArticleDNA com o mesmo `subject` =
  `UNCHANGED`. A prévia vencida (versão do grupo, pacote de K ou versão vigente
  do artigo mudaram) é recusada.
- **Guarda de retrabalho:** tipo novo `subject_conversion` em
  `REWORK_OPERATION_KINDS` (aditivo) para a Etapa M (`same_inputs_reuse`: "já
  convertido em <data>"); a Etapa A usa `article_dna_write`. Concorrência:
  `importRequestId`/`inFlight` como no cadastro.
- **Desfazer (por artigo, por clique, com prévia):**

| Depois de | Como desfazer |
|---|---|
| Etapa M | "Desfazer conversão" em K: retira `entry`, `plan`, marca e bloco de conversão (histórico mantido); K volta a "Em revisão" e é reaprovada como keyword comum; reenvio. T volta a ser Assunto sozinha (derivação). |
| Etapa A | Versão n+2 do ArticleDNA com `subject` = T (o pacote de T nunca mudou, então `planSubjectAttachment` aceita), depois o desfazer da Etapa M. |
| "Aplicar o plano ao Silo" | Nova aplicação do plano anterior ou "Tirar do plano" + aplicação; as versões aprovadas anteriores ficam no histórico. |
| Plano do grupo | "Tirar do plano" (`declared-plan-withdraw-core.ts`) e nova versão do plano. |

Nada é apagado em nenhum desfazer.

## 11. Conversão em lote ou por artigo

Lote **por grupo**, com seleção por linha: o dono pode converter os 7 de uma vez
ou um a um. Cada artigo é independente (falha num não desfaz os outros; o
resultado lista sucesso, sem mudança e falha por artigo, como o cadastro). O plano
do grupo é gravado uma vez por lote.

## 12. Permissões e isolamento

- Etapa M: as mesmas permissões do card (escrita no Minerador) **e** de aprovação
  e envio (o clique faz os três; sem uma delas, a prévia diz qual falta e não
  grava). Etapa A: edição e aprovação no Arquiteto (como "Aplicar o plano").
- Ator = `auth.users.id`; IA nunca converte sozinha (§13).
- Tudo por `brandId`; T, K, X e o grupo da mesma marca; leitura sem fallback.

## 13. MCP e catálogo (`AGENTS.md` §17.1)

- Catálogo (`lib/agent/platform-catalog.ts`): operação "Converter Assunto do
  formato anterior" (Minerador) e "Atualizar o Assunto do artigo" (Arquiteto),
  com pré-condições, quem decide e onde clicar; playbook do grupo laranja.
- Ferramentas (mesmo núcleo das telas): `convert_legacy_subjects` (prévia com
  `platform.read`; aplicar com escrita do Minerador + `platform.decide`, aceite
  do usuário no chat e `conversionHash` vigente) e `update_article_subject`
  (idem no Arquiteto). Alternativa (decisão D9): só a prévia no MCP.
- `declare_silo_plan` passa a recusar adotar T convertida; `npm run test:agent`
  cobre rota, ferramenta, guia e escopo.

## 14. Compatibilidade e migration

- **Migration: nenhuma.** Tudo é jsonb aditivo em `analise_semantica` de K
  (`keyword_subject_conversion`) e o plano em `editorial_groups.plan` (já existe).
  ArticleDNA, SiloDNA e SiloPage mudam só de versão, com o contrato de hoje.
- **Leitores do formato anterior continuam:** Assunto anterior não convertido
  segue igual em todas as telas (os 8 da WifiConecta até o dono converter).
- **Rollback de código:** o código anterior ignora o bloco de conversão. Risco
  real: abaixo da V1, com conversões já feitas, T voltaria a parecer "Assunto
  sem artigo" e a melhoria poderia oferecer formar um artigo para ela (oferta
  com prévia e decisão humana, nunca automática). Por isso a ordem é: V1–V5 num
  deploy só; nenhuma conversão antes desse deploy; rollback abaixo dele só sem
  conversão feita.

## 15. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Artigo duplicado para K entre as Etapas M e A | `conversionArticleId` nos leitores (§6.2); teste do intervalo. |
| R2 | T reaparecer como Assunto (formação, melhoria, MCP, cadastro) | índice T → K em todos os leitores; teste por leitor. |
| R3 | Lista do Assunto vazia em K (sustentações apontam para T) | alias derivado; teste com as 35 ligações da fixture. |
| R4 | Reaprovação de K falhar (Lógica ausente) | a etapa para com o motivo; nada é enviado. |
| R5 | Silo fixando versões antigas sem plano | caminho recomendado é com plano; V0 verifica o portão do Radar. |
| R6 | Plano recusar o Silo por artigo fora do plano (`679b1bb2`) | decisão D5 antes de aplicar. |
| R7 | Pilar mudar de lugar | prévia mostra; D7 mantém o do SiloDNA. |
| R8 | Lixeira usada por engano em T | o painel de T diz "não exclua: a exclusão é definitiva"; a prévia de exclusão do Minerador passa a listar `subject.keywordId` de ArticleDNA como "histórico canônico" (aditivo na leitura de impacto, sem mudar a RPC). |
| R9 | Dois formatos convivendo por muito tempo | leitores únicos; o painel indica "formato anterior · converter". |

## 16. Testes (fixtures; sem chamada paga, sem banco remoto)

- `tests/minerador-conversao-assunto-legado.test.mts`: escolha de K (principal,
  fora do artigo, recusa de secundária/publicada/outro grupo), prévia, aplicar,
  releitura, `conversionHash`, idempotência, retomada de cada passo, desfazer,
  isolamento por marca, plano do grupo a partir do SiloDNA, Assunto sem artigo,
  fixture com os números da §3 (8 Assuntos, 35 ligações, versões 1–4).
- `tests/arquiteto-conversao-assunto.test.mts`: `reanchorSubjectOnArticleDna`
  (troca, recusas, `UNCHANGED`), plano aplicado na mesma versão, guarda do
  Assunto e de retrabalho, estado `moved`, T convertida fora da formação e da
  melhoria, K achada por `conversionArticleId` no intervalo, alias da lista,
  selo em "não agrupadas", conservação (nenhuma keyword some), "Aplicar o plano
  ao Silo" com as versões novas.
- Ajustes declarados: painel do Assunto, cadastro (`classify`), MCP e catálogo.
- Suítes: Minerador por glob, `test:arquiteto`, `test:arquiteto:servidor`,
  `test:arquiteto:lentes`, `test:radar`, `test:redator`, `test:redator:mcp`,
  `test:agent`, `test:editorial`, `tsc`, eslint dos arquivos tocados,
  `git diff --check`. Mutantes só com suíte verde.
- **Validação manual (do dono):** o runbook da §18, com readback no banco.

## 17. Fases de entrega (um deploy só, V1–V5)

| Fase | Conteúdo | Tamanho |
|---|---|---|
| V0 · Caracterização | fixture da WifiConecta; verificar como o portão do Radar trata Silo que fixa versão anterior; confirmar Volume validado das 7 principais | P (meia sessão) |
| V1 · Leitores | bloco de conversão, índice T → K, alias da lista, standing, alvos, conservação, painel, cadastro, MCP state | M (1 sessão) |
| V2 · Núcleo e rota do Minerador | `importDeclaredPlanWithCore` modo `convert`; aprovação e envio encadeados; `conversionHash`; guarda `subject_conversion`; desfazer | G (1–2 sessões) |
| V3 · Arquiteto | `reanchorSubjectOnArticleDna`, servidor pelo writer e guardas, estado `moved`, rota | M/G (1–1,5 sessão) |
| V4 · Telas | seção "Formato anterior" no card (Silo existente) e painel "Conversões pendentes" no Arquiteto; dark mode e 360/768/1024/1440 px | M (1 sessão) |
| V5 · MCP e catálogo | duas ferramentas, catálogo, playbook, `test:agent` | P/M (meia a 1 sessão) |

Documentação ao concluir: `estado-atual.md` e `backlog.md` do Minerador e do
Arquiteto; o andamento desta SDD.

## 18. Runbook — WifiConecta, grupo laranja (o dono executa)

Pré-condição: deploy com V1–V5. Nada é executado antes.

1. **Readback inicial** (SELECT): 8 Assuntos anteriores, grupo sem plano, 19
   versões, SiloDNA v1 — como na §3.
2. **Antes do passo 9**, D5 (`679b1bb2` "plano vivo controle", decidido: retirar):
   Arquiteto → aba Silos → "Retirar artigo do Silo" → confirmar (ArticleDNA
   preservado; as keywords voltam para "Keywords não agrupadas").
3. **Minerador → Cadastrar Assuntos → "Converter formato anterior" → grupo
   Laranja.** O diálogo lista as 8 linhas-título (todas marcadas). Conferir o
   topo do plano: nome "planos de internet", slug `planos-de-internet`,
   objetivo do SiloDNA (editáveis).
4. Para cada linha, conferir K sugerida e escrever os detalhes:

   | Ordem | Papel | T (título) | K sugerida |
   |---|---|---|---|
   | 1 | Pilar | Claro, Vivo ou TIM: qual internet residencial escolher? | claro ou vivo |
   | 2 | Suporte | Internet residencial sem fidelidade: … | internet residencial sem fidelidade |
   | 3 | Suporte | Como saber quais operadoras de internet atendem meu CEP? | internet disponível no meu cep |
   | 4 | Suporte | Combo de internet, celular e TV: … | combo internet celular e TV |
   | 5 | Suporte | Como contratar internet residencial em São Paulo: … | contratar internet residencial |
   | 6 | Suporte | Como escolher o melhor plano de internet residencial … | melhor plano de internet residencial |
   | 7 | Suporte | Internet residencial barata: … | internet residencial barata |
   | 8 | Suporte | Internet de 300, 500, 600 Mega ou 1 Giga: … | quantos Mega de internet preciso (livre) |

5. **Prévia** → conferir por artigo: trava, "K volta a revisão e é reaprovada",
   "T fica arquivada (não vai para a lixeira)", plano v1 do grupo. **Converter.**
6. **Readback da Etapa M:** 8 K com `keyword_subject.entry.title` = texto de T,
   marca recíproca para si, `keyword_subject_conversion.fromKeywordId` = T; K
   aprovadas com pacote novo; itens recebidos com o pacote novo; grupo laranja
   com `plan_version = 1`; T inalteradas (mesmo `analise_semantica`, mesmo status).
7. **Arquiteto → aba Silos → Silo "planos de internet" → "Conversões pendentes do
   Assunto"** → prévia (7 artigos: linha-título → keyword, versão nova, papel,
   promessa) → **Atualizar o Assunto dos artigos**.
8. **Readback da Etapa A:** 7 versões novas (6d5d87cd v4, 4ac4d315 v2, f6c2f85e
   v3, d59f40a5 v4, a1306160 v5, 4339882e v3, 04320a9b v4) com `subject.keywordId`
   = K e `change_reason` da conversão; versões anteriores intactas.
9. **Aba Silos → "Aplicar o plano declarado ao Silo"** → prévia → aplicar.
   Readback: SiloDNA e SiloPage v2 com as versões novas e o Pilar do plano.
10. **Links internos:** processar de novo na aba Links internos (opcional agora;
    o grafo ainda não existe).
11. **Conferir na tela:** T aparece só com o filtro "Linhas-título convertidas" e
    em "não agrupadas" com o selo "convertida → K"; nenhuma keyword sumiu (51
    recebidas continuam recebidas); o artigo 8 aparece como Assunto à espera de
    formação (caminho normal).

## 19. Decisões do dono (com recomendação)

Todas **decididas pela recomendação, autorizado pelo dono em 2026-10-13** (frase
literal no topo). Mudar qualquer uma depois é decisão nova do dono.

| # | Decisão | Recomendação (decidida) |
|---|---|---|
| D1 | Destino da linha-título | (a) arquivada por derivação, sem lixeira |
| D2 | Converter com plano do grupo ou sem | com plano (o Silo consolidado vira o plano do laranja) |
| D3 | K padrão | a principal vigente do artigo; permitir keyword fora do artigo; recusar secundária |
| D4 | Um clique no Minerador (gravar + reaprovar + enviar) ou três | um clique, com a prévia listando tudo |
| D5 | "plano vivo controle" no Silo | retirar do Silo (fora do tema); alternativa: 9º artigo com Assunto novo |
| D6 | Assunto Mega/Giga sem artigo | converter para "quantos Mega de internet preciso" (livre) e deixar o artigo nascer pelo caminho normal |
| D7 | Pilar do plano | `6d5d87cd` "Claro, Vivo ou TIM…" (o do SiloDNA) |
| D8 | Detalhes de cada artigo | o dono escreve; a prévia pré-preenche com a promessa vigente |
| D9 | MCP | prévia e aplicação, com aceite no chat e hash |
| D10 | Trava | automática (com Volume validado = travada) |

## 20. Autorização

- [x] SDD aprovada e decisões D1–D10 pela recomendação — dono, 2026-10-13 (frase
      no topo).
- [x] Implementação autorizada em fases V0–V5, num deploy só, sem migration.
- [x] Entregáveis intocados (pedido do dono): o CSV "Para escrever", o
      artigo-modelo/blueprint do Radar, `get_article_for_writing`/`get_writer_*` e
      o Redator não mudam de comportamento; a conversão não os toca (a frase do
      Assunto no ArticleDNA é o mesmo texto).
- [ ] A conversão real da WifiConecta (runbook §18) é feita pelo dono, depois do
      deploy, com readback no banco a cada etapa.

## 21. Andamento (2026-10-13)

| Fase | Estado |
|---|---|
| V0 Caracterização | feito: dados reais da §3 (SELECT); fixtures no formato da WifiConecta nos testes; Volume validado das principais é lido na prévia (`volumeOf`); portão do Radar com SiloDNA fixando versão anterior **não verificado** (sem caso real) |
| V1 Leitores | feito: `lib/minerador/subject-conversion.ts` (bloco, índice T → K); `readArchitectSubjectStanding.conversion` (do pacote) e `readArchitectSubjectStandings`/`architectConvertedTitles` (linha-título fora da formação, "não agrupadas" com selo); alias da lista do Assunto (`suggestSubjectSupport`, melhoria); melhoria espera a atualização (R1); cadastro nunca readota a linha-título convertida; painel do DNA (K "Convertido de…", T "Linha-título convertida → …"). MCP `get_platform_state` deixa de listar a linha-título convertida em `minerador.subjects` (`lib/server/agent-platform-state.ts`) |
| V2 Núcleo e rota do Minerador | feito: `importDeclaredPlanWithCore` com `conversions`; `subject-conversion-draft.ts`; `subject-conversion-core.ts`; `lib/server/minerador-subject-conversion.ts` (Lógica, aprovação D2-bis, envio); `GET/POST …/plans/convert`. Guarda de retrabalho: idempotência pelo núcleo (repetir não regrava) — o tipo `subject_conversion` no `REWORK_OPERATION_KINDS` **não** foi criado. Botão "Desfazer conversão" **não** implementado (procedimento da §10) |
| V3 Arquiteto | feito: `lib/arquiteto/subject-conversion.ts`, `lib/server/arquiteto-subject-conversion.ts`, `POST /api/arquiteto/subject-conversion` |
| V4 Telas | feito: diálogo `modules/minerador/subject-conversion-dialog.tsx` (aberto pelo card "Cadastrar Assuntos"); painel `modules/arquiteto/subject-conversion-panel.tsx` no cartão do Silo consolidado. Filtro da planilha para esconder linhas-título convertidas **não** implementado |
| V5 MCP e catálogo | feito: `convert_legacy_subjects`, `update_article_subject`; operações `minerador.convert_legacy_subjects` e `arquiteto.update_article_subject` |

Entregáveis intocados (pedido do dono): nenhum arquivo do CSV "Para escrever", do artigo-modelo/blueprint, de `get_article_for_writing`/`get_writer_*` ou do Redator foi alterado; a frase do Assunto no ArticleDNA é o mesmo texto; teste estrutural confere que esses módulos não leem a conversão.

Aviso corrigido junto (achado da revisão): a prévia do cadastro dizia "mande para a lixeira se quiser (recuperável)" para as sobras de import; a exclusão de keyword não publicada é definitiva, e o texto agora diz isso.

Esta SDD não autoriza: migration, SQL de escrita, exclusão de keyword (inclusive
pela lixeira), chamada paga, mudança de URL/slug/canonical de publicado, troca de
principal fora da prévia da melhoria, nem commit/push/deploy.

## Nota de correção — 2026-10-13 (SDD `sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 13, D14)

Correção de texto, sem reescrever o histórico acima: o §8 diz que o item do Radar "recebe 'Atualização disponível'
(status de transferência), como em toda versão nova". Isso **não** acontece no código de hoje: no Radar, "Atualização
disponível" é o rótulo da **publicação** (`lib/radar/editorial-identity.ts`); a versão nova do ArticleDNA não aparece
no item, que segue na versão transportada. O aviso próprio — **"Atualização disponível do Arquiteto"**, com adoção por
clique — é o item 14 da SDD de aceleração (F5, outra frente).
