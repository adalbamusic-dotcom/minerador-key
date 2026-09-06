# Adendo 01 ao relatório de situação do Radar — keywords ausentes do universo de candidatos — 2026-09-05

Adendo a [relatorio-situacao-radar-2026-09-05.md](relatorio-situacao-radar-2026-09-05.md).

Escopo: explicar a divergência entre `assignment`, working copy, ArticleDNA
aprovado v5 e os candidatos resultantes para três keywords do silo de skin care.
Diagnóstico apenas. Nenhuma mudança funcional, escrita remota, provider,
migration, restauração, commit ou deploy. Nenhum clique é recomendado nesta
rodada.

**Módulo proprietário da causa: Arquiteto.** O Radar aparece aqui só como
consumidor do contrato — a seção 8 registra o encaminhamento.

---

## 0. O que este adendo pode e não pode afirmar

**Pode:** a cadeia canônica inteira, os portões de exclusão, os limiares
numéricos, a ordem em que rodam, quais funções decidem cada papel, e a
aritmética exata do casamento com publicados. Tudo isso está no código deste
checkout e foi reproduzido.

**Não pode:** dizer qual portão removeu cada uma das três keywords. Os IDs
completos, o `assignment` de cada keyword, o ArticleDNA v5 e o catálogo do site
são **estado remoto** — não existem no repositório. A seção 2 entrega a grade de
rastreio pronta, com a célula exata onde cada valor aparece, e a seção 7 diz
qual leitura fecha cada linha.

O que **não** é aceitável e este adendo evita: concluir "split" ou "absorção"
por parecer. Cada hipótese abaixo vem com a assinatura falsificável que a
confirma ou derruba.

---

## 1. A cadeia canônica e seus sete portões

Entre a keyword no banco e o candidato na mesa há sete pontos onde ela pode
sumir, mudar de papel ou trocar de dono. Todos foram lidos no código.

| # | Etapa | Função · arquivo:linha | Regra exata | Efeito |
| :-: | --- | --- | --- | --- |
| 0 | **masterList** | `buildCanonicalWorkflowWorkspaceItems` · `lib/arquiteto/canonical-workspace.ts:393` | o item de workflow precisa ter `marcaId === brandId`, `subjectType === "keyword"`, `stage === "architect"` **e** `state === "received"` | fora disso a keyword não entra no masterList — e some de **todas** as etapas seguintes |
| 1 | **cabeceira de Silo** | `reservedSiloPageHeadIds` · `modules/arquiteto/arquiteto-workspace.tsx:4297`, aplicado em `:4340` e `:4376` | keyword reservada como cabeceira sai do pool de Article | correto por desenho: *"Cabeceira de silo não é artigo: ela É o silo"* |
| 2 | **Silo confirmado** | `confirmedTerritoryRefs` · `arquiteto-workspace.tsx:4304`, aplicado em `:4337-4338` | `territoryRef` presente **e** o território em `confirmed`/`consolidated` | sem isso a keyword não entra em nenhum universo |
| 3 | **grupos provisórios** | `buildProvisionalGroups` → `describeProvisionalGroup` · `lib/arquiteto/engine.ts:372` e `:304` | âncoras publicadas semeiam grupos primeiro; cada fresh entra no melhor grupo com `comparison.intent > 0` e `combined ≥ 0.52` (grupo com publicado) ou `≥ 0.6` (grupo novo) | quem não atinge o limiar vira grupo próprio |
| 4 | **portão de publicados** | `buildArticleFormationUniverse` · `lib/arquiteto/article-formation.ts:367-378` | `overlap(tokensOf(keyword), tokensOf(publicado.label ‖ publicado.path)) ≥ 0.7` | **sai de `disponiveis`**: não vira candidato, não entra em `ungroupedKeywordIds`, não aparece em lugar nenhum |
| 5 | **precedência humana** | idem · `article-formation.ts:388-455` | keywords com `humanFormationRef` são agrupadas por esse ref e reservadas em `usadas` | protege contra reagrupamento — **mas roda depois do portão 4** |
| 6 | **grupos do engine** | idem · `article-formation.ts:459-524` | membros = `group.keywordIds` menos os já `usadas` menos os removidos no portão 4; principal = `membros.find(id === group.principalKeywordId)` **‖ `membros[0]`** | perder o principal do grupo faz a liderança cair no primeiro sobrevivente da lista, **sem pontuação nenhuma** |
| 7 | **reconciliação com o ArticleDNA** | `partitionMaterializedArticles` · `lib/arquiteto/formation-materialization.ts:85-126` | casa por **mesma principal + mesmo pai + mesmo conjunto de keywords** (`sameSet`) | não casando, o ArticleDNA aprovado vai para `legacy` — *"isolado, nunca apagado"*, mas fora da mesa |

Os portões 0, 2, 4 e 7 são os únicos que produzem **desaparecimento**. Os
portões 3 e 6 produzem **mudança de papel e de principal**.

---

## 2. Grade de rastreio das três keywords

Uma linha por keyword, uma coluna por etapa. As células marcadas `⟨remoto⟩`
dependem de leitura que não está no repositório; a coluna "onde o valor mora"
diz exatamente de onde cada uma sai.

| Etapa | Onde o valor mora | `skin care pele oleosa` | `skin care rosto` | `skin care barato` |
| --- | --- | --- | --- | --- |
| ID canônico | `minerador_keywords.id` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Está no masterList? | portão 0 | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| `clusterId` (assignment) | `editorial_workflow_items.payload.clusterId` → `canonical-workspace.ts:403` | *relatado: 6* | *relatado: 6* | *relatado: 6* |
| `role` / `reviewRole` (assignment) | `payload.role ‖ payload.reviewRole` → `canonical-workspace.ts:407` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| `territoryRef` (assignment) | `payload.territoryRef` → `canonical-workspace.ts:462` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| `isPublished` | `minerador_keywords.status`/`isPublished` → `canonical-workspace.ts:409` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| `articleFormationRef` / `…Decision.role` | `payload` → `canonical-workspace.ts:466-467` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Principal no ArticleDNA **v5 aprovado** | `editorial_artifact_versions.payload.principalKeywordId` | *relatado: esta* | — | — |
| Composição no v5 | `payload.keywordReferences[]` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Grupo provisório | `describeProvisionalGroup.id` · `engine.ts:343` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Papel no grupo provisório | `roles` · `engine.ts:332-340` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Saiu no portão 4? | `universe.matchedToPublished[]` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |
| Candidato resultante | `universe.candidates[].candidateRef` | *relatado: ausente* | *relatado: reforço de "barato"* | *relatado: principal* |
| ArticleDNA reconciliado? | `partitionMaterializedArticles` | ⟨remoto⟩ | ⟨remoto⟩ | ⟨remoto⟩ |

Os valores em *itálico* são o que foi relatado na investigação anterior. Eles
entram como **relato**, não como fato verificado por esta auditoria — a seção 6
separa os dois.

**A célula que decide tudo é `matchedToPublished`**, e ela é a única da grade
que hoje **não tem como ser lida em lugar nenhum** — ver seção 5.

---

## 3. A divergência do cluster 6: são projeções distintas, não um conflito

**Resposta direta: projeções distintas.** "Juntas no cluster 6" e "rosto como
reforço de barato" descrevem camadas diferentes, produzidas por autoridades
diferentes, que nunca foram desenhadas para coincidir.

### 3.1 "Cluster 6" é membership legada, não formação

`clusterId` sai de `assignment.clusterId ?? assignment.provisionalGroupId ??
keyword.clusterId` (`canonical-workspace.ts:403`). É uma projeção de leitura do
payload do item de workflow — a mesma linha onde mora a membership territorial.
**Nenhuma função da cadeia de formação lê `clusterId`.** Ele não entra em
`buildProvisionalGroups`, nem em `buildArticleFormationUniverse`, nem no
`articleSerpBaseHash`. As três continuarem no cluster 6 não afirma nada sobre a
composição do artigo — e não conflita com nada.

### 3.2 "Reforço" tem três nascedouros diferentes

| Origem | Onde | Regra |
| --- | --- | --- |
| **A** — engine | `engine.ts:332-337` | `if (id === principal) "principal"`; senão `reviewRole` explícito; senão **`anchor ? "reforco_narrativo" : "secundaria"`** — ou seja, **basta o grupo ter uma âncora publicada para todo o resto virar reforço** |
| **B** — universo, por afinidade | `article-formation.ts:493` (grupos do engine) e `:578` (sementes) | `sameArticleAffinity(principal, keyword) ≥ 0.75 ? "secundaria" : "reforco"` |
| **C** — decisão humana | `article-formation.ts:427` | `keyword.humanRole` lido de `articleFormationDecision.role` |

E aqui está a divergência estrutural que ninguém declarou:

> **O mapa `roles` do engine é descartado.** No call site
> (`arquiteto-workspace.tsx:4402-4405`) só viajam `principalKeywordId` e
> `keywordIds`. O `roles` calculado pela origem **A** nunca chega ao universo;
> o candidato recalcula tudo pela origem **B**.

Consequência: o painel de grupos provisórios e a mesa de candidatos podem
mostrar papéis diferentes para o mesmo par de keywords, sem que nada tenha
mudado no estado. **Isso não é bug de dado — é duas projeções respondendo a
mesma pergunta com autoridades diferentes.**

### 3.3 Por que "rosto" cairia em reforço

`sameArticleAffinity` (`article-formation.ts:156-206`) desconta os tokens do
tema do Silo antes de comparar (`siloThemeTokens`, `:215-240`). Num silo de skin
care, `{skin, care}` sai dos dois lados:

- resta `{rosto}` de um lado e `{barato}` do outro → `overlap = 0` → parcela
  lexical `0 × 0.6 = 0`;
- mesma intenção soma `+0.2`; mesma entidade `+0.1`; mesmo problema `+0.15`;
- teto realista **≈ 0,45**, bem abaixo do `CANNIBAL_FLOOR = 0.75`
  (`article-formation.ts:244`).

Portanto, **com "barato" como principal, "rosto" cai em `reforco` por
aritmética, não por decisão**. O símbolo observado é consistente com a origem
**B** operando normalmente. A pergunta que sobra não é "por que rosto é
reforço" — é **"por que barato virou principal"**.

---

## 4. Por que "barato" viraria principal: a cascata de um único evento

Esta é a hipótese principal. Ela explica os quatro sintomas com **uma** causa, e
tem assinatura verificável.

Ambos os seletores de principal dão vitória automática ao publicado:

- `engine.ts:219-224` — havendo publicado, `score = anchor` (1 para ele, 0 para
  todos os outros);
- `article-formation.ts:260-263` — `const publicada = keywords.find(k =>
  k.isPublished); if (publicada) return { keywordId: publicada.keywordId, … }`.

Ou seja: **enquanto "skin care pele oleosa" estiver no grupo e marcada como
publicada, nenhum cálculo consegue tirar dela a principal.** Para "barato"
liderar, "pele oleosa" precisa ter **saído do grupo antes da escolha**.

O portão 4 faz exatamente isso. E então:

```
portão 4 remove "pele oleosa" de `disponiveis`      (article-formation.ts:367-378)
   ↓
grupo do engine perde a âncora; membros = os sobreviventes
   ↓
principal = membros.find(id === group.principalKeywordId) || membros[0]
                                                    ↑ fallback SEM pontuação
   ↓  (article-formation.ts:474)
"barato" assume por ser o primeiro sobrevivente da lista
   ↓
role de "rosto" = affinity(barato, rosto) ≈ 0,45 < 0,75  →  "reforco"
   ↓  (article-formation.ts:493)
composição do candidato ≠ composição do v5
   ↓
partitionMaterializedArticles → legacy: DIFFERENT_PRINCIPAL ou DIFFERENT_COMPOSITION
   ↓  (formation-materialization.ts:99-120)
o ArticleDNA v5 aprovado sai da mesa
```

Quatro sintomas, uma causa. **Ordem dos membros:** `rawGroups` nasce com a
âncora publicada no índice 0 (`engine.ts:376-382`) e os fresh são anexados
depois, então `membros[0]` após a remoção é o primeiro fresh que entrou naquele
grupo — determinístico, mas sem nenhum critério editorial.

### 4.1 A aritmética do portão 4, reproduzida

`overlap` (`article-formation.ts:139-144`) divide pelo **menor** conjunto:

```
overlap(A, B) = |A ∩ B| / min(|A|, |B|)
```

Isso não pergunta "são a mesma coisa?" — pergunta "**um é subconjunto do
outro?**". Reproduzi a função verbatim e calculei contra formatos plausíveis do
rótulo publicado (`label = h1 ‖ title ‖ segment`,
`published-site-architecture.ts:208`):

| Rótulo do publicado | tokens | `pele oleosa` | `rosto` | `barato` |
| --- | :-: | :-: | :-: | :-: |
| `Skin Care` | 2 | **1.000 EXCLUI** | **1.000 EXCLUI** | **1.000 EXCLUI** |
| `Skin Care para Pele Oleosa` | 4 | **1.000 EXCLUI** | 0.667 mantém | 0.667 mantém |
| segmento `rosto` (sem h1) | 1 | 0.000 | **1.000 EXCLUI** | 0.000 |
| segmento `pele-oleosa` (sem h1) | 2 | **1.000 EXCLUI** | 0.000 | 0.000 |
| segmento `skin-care-pele-oleosa` | 4 | **1.000 EXCLUI** | 0.667 mantém | 0.667 mantém |

**Leitura:** um rótulo de **2 tokens contidos nas três** (`{skin, care}`) derruba
as três de uma vez. Um rótulo de 4 tokens derruba só a keyword exata — as outras
duas param em 0.667, a três centésimos do limiar. E um rótulo que degradou para
**um único segmento** absorve qualquer keyword que contenha aquele token.

> **Assinatura falsificável:** se as três keywords aparecerem em
> `universe.matchedToPublished` com o **mesmo `normalizedUrl`**, o rótulo daquele
> nó publicado tem ≤ 2 tokens contidos nas três, e a causa é o portão 4. Se
> aparecerem com URLs diferentes, ou não aparecerem, a hipótese cai e a causa
> está no portão 0 ou 2.

### 4.2 Duas propriedades do portão 4 que ninguém declarou

**(i) Ele roda antes da precedência humana.** O bloco de decisão humana
(`:388`) abre com o comentário *"Revisão humana primeiro… por isso elas não
podem ser reabsorvidas por um cluster calculado"*. Mas o portão de publicados
está em `:367` — **vinte linhas acima**. Uma keyword com `articleFormationRef`
gravado é removida pelo portão sem que a decisão humana seja sequer consultada.
A promessa do comentário vale contra reagrupamento; **não vale contra o portão
de publicados**, e o código não diz isso em lugar nenhum.

**(ii) Ele absorve N keywords e registra 1.** No laço de `:367-378`, cada
keyword que casa é empurrada para `matchedToPublished`, mas
`publicado.matchedKeywordId = publicado.matchedKeywordId ?? keyword.keywordId`
guarda **apenas a primeira**. O nó publicado passa a alegar uma correspondência
1:1 que pode ser 1:N.

### 4.3 Por que os scripts de auditoria não enxergam o portão 4

`publishedArticles` é **opcional** em `buildArticleFormationUniverse`
(`article-formation.ts:362`). A tela passa
(`arquiteto-workspace.tsx:4389-4398`); **nenhum dos dois scripts passa** —
`scripts/arquiteto-audit-drift.mts:92-108` e
`scripts/arquiteto-audit-formation-base.mts:128-152` chamam sem o argumento.
Logo `publicados = []` e o portão 4 **nunca dispara ali**.

Isto tem duas consequências que mudam como o material anterior deve ser lido:

1. Nenhum `NOT_PROJECTED` do `audit:drift` pode ter sido causado pelo portão 4.
2. Se a **tela** não mostra a keyword e o **script** mostra, essa diferença
   **é** o portão 4 — e isso, por si só, já é o teste discriminante.

O `audit:drift` também não fecha o caso sozinho: seu bloco `SEM EXPLICAÇÃO`
(`:174-177`) só verifica ausência no **masterList** (portão 0). Uma keyword
barrada pelos portões 2 ou 4 sai como `NOT_PROJECTED` sem explicação nenhuma.

---

## 5. O casamento com a página publicada

### 5.1 Qual identidade canônica sustenta o vínculo

**Nenhuma.** O vínculo é **lexical**, não canônico:

```js
publicados.find(item => overlap(tokensOf(keyword.keyword),
                                tokensOf(item.label || item.path)) >= 0.7)
```

O que entra na comparação é o **texto da keyword** contra o **h1, ou o title, ou
o último segmento da URL** da página. Não participam: `canonical`,
`normalizedUrl`, `verificationStatus`, `keywordDnaRef`, `publishedIdentityRef`
nem qualquer id. O `normalizedUrl` só é **registrado depois** que o casamento já
foi decidido — ele é o recibo, não o critério.

Isso contraria diretamente a regra que o próprio pedido enuncia: *slug
coincidente, isoladamente, não comprova publicação nem identidade editorial*.
Aqui um slug coincidente — ou pior, **um pedaço dele** — está decidindo sozinho.

### 5.2 `computedSlug` é sinal ou está decidindo?

Precisa separar em três lugares:

| Onde | O que decide | Veredito |
| --- | --- | --- |
| Portão 4, keyword × publicado | usa `keyword.keyword` (texto) × `label ‖ path` | `computedSlug` **não participa** — mas o **path do publicado** decide sozinho quando o h1 falta |
| Segunda checagem de slug · `article-formation.ts:604-616` | `suggestedSlug` do candidato × `caminhosPublicados` | **só sinal**: anula a sugestão e levanta conflito; **não exclui** o candidato — comportamento correto |
| Raiz do Silo · `arquiteto-workspace.tsx:4383-4387` | `slugState.publishedSlug ‖ confirmed ‖ **proposals[0].slug**` | **decide**: define `raiz`, e `raiz` filtra quais leaves entram em `publishedArticles` |

O terceiro é o mais delicado: **um slug apenas *proposto*** — nem publicado, nem
confirmado — já é suficiente para o código tratar as páginas sob aquele caminho
como patrimônio publicado daquele Silo. Uma proposta humana passa a ter efeito
de exclusão sobre keywords.

### 5.3 SiloPage está sendo confundida com Article/Pilar?

**No caminho normal, não.** Duas separações estão corretas:

- a cabeceira do Silo é excluída do pool de Article
  (`arquiteto-workspace.tsx:4340`, `:4376`) — *"ela É o silo"*;
- `publishedArticles` só aceita `node.role === "leaf"` com
  `structuralRootPath === raiz` (`:4390-4391`). A raiz editorial é
  `editorial_root`, não `leaf`, e portanto não entra.

**Mas a classificação tem uma borda estreita.** Em
`published-site-architecture.ts:188-198`, uma página de primeiro nível só vira
`editorial_root` se tiver **pelo menos um filho no catálogo**; sem filhos ela cai
em `unresolved`. E `role = "leaf"` exige um ancestral publicado
(`nearestPublishedAncestor`, `:183`). Então:

- catálogo incompleto (silo publicado sem filhos capturados) → a raiz vira
  `unresolved`, não entra em `publishedArticles`, e **nenhuma** keyword é
  excluída — falso negativo;
- página publicada em dois níveis sob a raiz (`/skin-care/x/y`) → `leaf` com
  `structuralRootPath = /skin-care` e `confidence: "moderate"`, entrando no
  portão 4 **com o mesmo peso** de um filho direto.

A confusão possível, portanto, não é SiloPage↔Pilar: é **catálogo↔realidade**. O
portão 4 confia no catálogo do site como se ele fosse completo e rotulado.

### 5.4 A ausência entre os candidatos é comportamento correto?

**Para a unidade já publicada, sim — em intenção. Na execução, não.**

Correto: uma keyword que já tem página no ar não deve gerar Article novo. É a
regra do teste `arquiteto-article-formation.test.mts:209-220`, e ela passa.

Incorreto em três pontos:

1. **Sumiço mudo.** A keyword sai de `disponiveis` (`:377 continue`) e por isso
   não aparece nem em `candidates` nem em `ungroupedKeywordIds` — este último é
   calculado sobre `disponiveis` (`:653`). Ela não está em lugar nenhum da mesa.
2. **Ninguém lê o recibo.** `matchedToPublished` e `ungroupedKeywordIds` são
   devolvidos por `buildArticleFormationUniverse` e **nenhum dos dois é lido em
   `modules/arquiteto/arquiteto-workspace.tsx`** — a busca retorna zero
   referências; do universo só `singletonAudits` é consumido, uma vez, em
   `:7749`. O dado que explicaria a ausência existe e é descartado.
3. **Fluxo de destino inexistente.** Uma keyword casada com página publicada
   deveria aparecer em alguma superfície de *conteúdo existente* — "esta busca
   já é atendida por esta URL, confirme ou separe". Essa superfície não existe.
   O `PublishedArticleRef.matchedKeywordId` foi criado para ela e fica sem
   consumidor.

Isto viola a regra que o próprio repositório enuncia em
`lib/arquiteto/radar-handoff-context.ts:222-224`: *"Quem não passa NÃO some:
volta em `blocked`, com o motivo em português"*. O handoff cumpre; a formação,
não.

---

## 6. Fatos, relatos e hipóteses

### Fatos verificados neste checkout

| # | Fato | Evidência |
| :-: | --- | --- |
| F1 | O portão de publicados usa overlap lexical ≥ 0.7 com denominador `min()` | `article-formation.ts:139-144`, `:372` — reproduzido |
| F2 | Um rótulo publicado de 2 tokens contidos nas três exclui as três | reprodução verbatim da função, tabela §4.1 |
| F3 | O portão de publicados roda **antes** da precedência humana | `:367` vs `:388` |
| F4 | Keyword excluída no portão 4 não entra em `ungroupedKeywordIds` | `:377 continue` + `:653` |
| F5 | `matchedToPublished` e `ungroupedKeywordIds` não têm nenhum leitor na UI | busca em `modules/arquiteto/` → 0 ocorrências |
| F6 | Perdido o principal do grupo, a liderança cai em `membros[0]`, sem pontuação | `:474` |
| F7 | Keyword publicada vence a principal em ambos os seletores | `engine.ts:219-224`, `article-formation.ts:260-263` |
| F8 | O mapa `roles` do engine é descartado no call site | `arquiteto-workspace.tsx:4402-4405` |
| F9 | `clusterId` não é lido por nenhuma função de formação | busca na cadeia inteira |
| F10 | Os dois scripts de auditoria não passam `publishedArticles` | `audit-drift.mts:92-108`, `audit-formation-base.mts:128-152` |
| F11 | `articleSerpBaseHash` inclui principal, papéis, slug sugerido e intents | `article-serp-gate.ts:54-63` |
| F12 | Composição divergente joga o ArticleDNA aprovado em `legacy` | `formation-materialization.ts:99-120` |
| F13 | Um slug apenas **proposto** do Silo já define `raiz` | `arquiteto-workspace.tsx:4383-4387` |

### Relatos recebidos — não verificados aqui

| # | Relato | O que falta |
| :-: | --- | --- |
| R1 | As três estão no cluster 6 | leitura do `assignment` |
| R2 | "rosto" aparece como reforço de "barato" | qual projeção mostrou: grupo provisório (origem A) ou candidato (origem B)? |
| R3 | O v5 aprovado tem "pele oleosa" como principal | leitura do artefato |
| R4 | As três estão ausentes dos candidatos | ausentes de `candidates`, ou de uma lista já filtrada por elegibilidade? |
| R5 | Três hashes foram reproduzidos | **validam aqueles três casos e nada além**: `articleSerpBaseHash` é por candidato; reproduzir três não valida a cadeia nem os demais candidatos do lote |

### Hipóteses, em ordem de probabilidade

| # | Hipótese | Confirma se… | Cai se… |
| :-: | --- | --- | --- |
| **H1** | Portão 4 removeu ao menos "pele oleosa"; a cascata de §4 fez o resto | as três (ou "pele oleosa") estão em `matchedToPublished`; as três com o **mesmo** `normalizedUrl` explicam a ausência tripla | `matchedToPublished` vazio para elas |
| H2 | Portão 0: os itens saíram de `stage=architect`/`state=received` | não aparecem no masterList — é o que `audit:drift` já marca como `SEM EXPLICAÇÃO` | aparecem no masterList |
| H3 | Portão 2: `territoryRef` mudou ou o território saiu de confirmado | `assignment.territoryRef` diverge do `territoryRef` do v5 — o `audit:drift` imprime como `MOVEU` | territoryRef igual e território confirmado |
| H4 | Decisão humana (`articleFormationDecision.operation = "principal"`) trocou a principal deliberadamente | `articleFormationDecision` presente com `source: "human"` e `reason` preenchida | campo ausente |

**Sobre `manualEdit`:** o campo indica que houve edição manual, e o
`audit:drift` o imprime junto de `manualEditAt` (`:161-163`). Mas ele **não
identifica a ação nem o ator**. `articleFormationDecision` é o único registro
que carrega `operation`, `reason`, `source` e `decidedAt`
(`article-formation-decision.ts:44-52`) — e é ele, não `manualEdit`, que prova o
que foi feito. `manualEdit = true` sem `articleFormationDecision` significa
"alguém mexeu, não sabemos no quê": é indício, não evento.

### Mudança de principal ≠ mudança de composição

Reportadas separadamente, como pedido:

| | Mudança de **principal** | Mudança de **composição** |
| --- | --- | --- |
| Operação canônica | `operation: "principal"` | `"move"` / `"merge"` / `"split"` / `"role"` |
| Efeito no `articleSerpBaseHash` | altera `principalKeywordId` **e** `suggestedSlug` (dois componentes) | altera `roles[]` (um componente) |
| Efeito na reconciliação | `legacy: DIFFERENT_PRINCIPAL` | `legacy: DIFFERENT_COMPOSITION` |
| Pode ocorrer sem ação humana? | **Sim** — fallback `membros[0]` (F6) | **Sim** — recálculo por afinidade (origem B) |

As duas podem acontecer no mesmo evento — e na cascata de §4 acontecem juntas.

---

## 7. Devolver a principal para "skin care pele oleosa" resolve?

### É suficiente?

**Não, se a causa for H1.** A ordem dos portões decide: o portão 4 (`:367`) roda
**antes** da leitura de `humanFormationRef`/`humanRole` (`:388`). Uma keyword
removida pelo portão de publicados **não está em `disponiveis`**, e nenhuma
decisão de principal a traz de volta — a decisão humana só é consultada sobre
keywords que já sobreviveram. Gravar `operation: "principal"` para uma keyword
excluída no portão 4 produz um grupo humano sem ela.

**Sim, se a causa for H3 ou H4** e a keyword continuar disponível: aí a decisão
humana é lida, o grupo se forma com ela como principal e o portão 6 nem é
alcançado.

### É permitido?

Sim como **working state**: `"principal"` é uma das operações canônicas
(`article-formation-decision.ts:39`), grava no payload do item de workflow da
própria keyword, sem coluna nova, sem migration, sem tocar RLS. E é explícito
que **não é ArticleDNA**: *"a materialização continua sendo um passo humano
separado"* (`:24-25`).

### É coerente com a v5 e com a proteção de publicação?

**Coerente com a v5:** a v5 é imutável e permanece. Devolver a principal
**realinha** a working copy com ela — e é exatamente isso que faz
`partitionMaterializedArticles` voltar a casar, tirando o artefato de `legacy`.
Mas o casamento exige os **três** critérios: mesma principal, mesmo pai, **mesmo
conjunto de keywords** (`formation-materialization.ts:108-120`). Devolver só a
principal não basta se algum membro continuar fora.

**Coerente com a proteção de publicação:** sim, e o código já protege. Com a
principal publicada, `suggestedSlug` vira `null` nos três ramos
(`article-formation.ts:432`, `:500`, `:581`) — o Arquiteto não propõe endereço
para identidade publicada. Slug, canonical, URL e marca não são tocados por
nenhuma dessas operações.

### Efeito esperado sobre a validade da SERP

Pelos validadores canônicos, sem supor reaproveitamento:

`articleSerpBaseHash` (`article-serp-gate.ts:54-63`) fecha sobre
`territoryRef`, `principalKeywordId`, `roles[]` ordenados, `suggestedSlug`,
`intents[]`, `centralEntity` e `macroIntent`. Então:

1. **Trocar a principal muda o hash — sempre.** E muda **dois** componentes de
   uma vez, porque `suggestedSlug` acompanha a principal (e vai a `null` se ela
   for publicada).
2. **Hash novo ⇒ o parecer persistido vira `STALE`**: o comparador é
   `p.formationBaseHash === hash`, e a falha classifica `STALE`
   (`audit-formation-base.mts:172-186`).
3. **A resolução humana anterior não migra.** `resolucaoVale` exige
   `humanResolution.formationBaseHash === hash` — a decisão está presa ao hash
   antigo. Nenhuma aprovação é herdada.
4. **O handoff ao Radar trava.** Em `radar-handoff-gate.ts:170-179`,
   `SERP_CURRENT.ok = serpState !== "stale" && serpState !== "failed"` → falha
   com `"A composição mudou depois da coleta; a evidência não descreve mais este
   artigo"`. E `SERP_RESOLVED` (`:184-192`) exige um dos três estados resolvidos,
   nenhum deles alcançável a partir de `stale`.
5. **Mudar apenas papéis tem o mesmo efeito**, porque `roles[]` está no hash.
   Não existe "correção pequena" que preserve a SERP.

**Portanto:** devolver a principal é uma operação de working copy que
**necessariamente invalida a SERP de formação** daquele candidato e exige nova
coleta ou nova resolução humana antes de qualquer envio ao Radar. Isso não é
efeito colateral — é o gate funcionando como especificado. O que **não** se pode
fazer é assumir que a aprovação anterior continua valendo.

---

## 8. Impacto no handoff Arquiteto → Radar e encaminhamento

### Impacto

| Gate | Estado esperado na situação descrita | Origem |
| --- | --- | --- |
| `ARTICLE_DNA_CURRENT` | **falha** — o v5 caiu em `legacy`, logo `belongsToCurrentScenario = false` | `formation-materialization.ts:99-120` |
| `SERP_CURRENT` | **falha** se a base mudou → `stale` | `article-serp-gate.ts:54-63` |
| `SERP_RESOLVED` | **falha** — resolução presa ao hash antigo | idem |
| `CANONICAL_SILO_BINDING` | depende de `siloId`; inalterado por este caso | `radar-handoff-gate.ts:130-140` |

Com qualquer um deles vermelho, `resolveRadarEligibility` devolve `eligible:
false` e o artigo **não chega ao Radar** — o que, aqui, é o comportamento
correto. O risco não é o bloqueio: é o artigo passar com identidade divergente,
porque a única coisa que o Radar recebe sobre esse histórico é
`arquitetoSerpProvenance` — e o Radar **não lê esse campo** (achado P-10 do
relatório principal). Um artigo cuja principal trocou silenciosamente chegaria
ao Radar sem nenhum vestígio disso.

### Encaminhamento

**A causa está inteiramente no Arquiteto.** Todos os pontos citados vivem em
`lib/arquiteto/article-formation.ts`, `lib/arquiteto/engine.ts`,
`lib/arquiteto/canonical-workspace.ts`,
`lib/arquiteto/formation-materialization.ts` e
`modules/arquiteto/arquiteto-workspace.tsx`.

**O Radar não deve compensar nada disso.** Ele recebe `RadarItem` com `siloId`
obrigatório e composição fechada (`lib/editorial/operational-flow.ts:33-78`);
reagrupar, redefinir papéis ou "consertar" a principal está fora da sua
fronteira por invariante. A ação do Radar nesta frente é uma só: **consumir
`arquitetoSerpProvenance`**, para que uma divergência já vista e resolvida
apareça na investigação em vez de ser redescoberta. Isso já está registrado como
C10 no relatório principal.

---

## 9. Próximo passo mínimo

**Um passo, sem decisão arquitetural, sem schema, sem migration: tornar o
portão 4 visível.**

O dado já existe — `universe.matchedToPublished` e `universe.ungroupedKeywordIds`
são devolvidos hoje e descartados (F5). Falta renderizá-los na mesa de formação,
por keyword, com a URL correspondente e o motivo em português. Nenhum cálculo
novo, nenhuma escrita, nenhuma alteração de contrato.

Isso fecha o caso sem nova investigação: **se as três aparecerem casadas com a
mesma URL, H1 está provada e a causa é o portão 4.** Se não aparecerem, H1 cai e
sobram H2/H3, que o `audit:drift` já sabe distinguir.

Enquanto isso não existir, o caminho de leitura para o usuário fechar a grade da
seção 2 é:

1. `npm run audit:drift -- <marcaId>` → responde portões 0, 2, 3 e 7 (`MOVEU`,
   `FALTAM`, `ENTRARAM`, `SEM EXPLICAÇÃO`);
2. `npm run audit:formation -- <marcaId> skin care` → responde o estado do hash e
   da SERP por candidato;
3. **a diferença entre o que esses scripts mostram e o que a tela mostra é,
   por construção, o portão 4** (F10).

Ambos são somente-SELECT e declaram `PROVIDER_CALLS = 0`. Pela regra
operacional, quem os executa é o usuário — não foram rodados nesta auditoria.

### O que fica registrado como dívida, sem ação nesta rodada

| # | Item | Natureza |
| :-: | --- | --- |
| D-A1 | Portão de publicados decide por overlap lexical com denominador `min()`; um rótulo curto absorve keywords não relacionadas | correção no Arquiteto — **exige decisão**: o casamento deveria exigir identidade canônica, não texto |
| D-A2 | Portão de publicados roda antes da precedência humana, contrariando o comentário do próprio bloco | correção ou, no mínimo, correção do comentário |
| D-A3 | `membros[0]` como fallback de principal, sem pontuação | correção no Arquiteto |
| D-A4 | `roles` do engine descartado; duas projeções, dois papéis | decisão: qual é a autoridade do papel antes da materialização |
| D-A5 | `matchedToPublished` / `ungroupedKeywordIds` sem leitor | é o passo mínimo acima |
| D-A6 | `matchedKeywordId` guarda 1 de N casamentos | correção no Arquiteto |
| D-A7 | Scripts de auditoria divergem da tela por não passarem `publishedArticles` | correção nos scripts |
| D-A8 | Slug apenas proposto do Silo define `raiz` e habilita exclusão por publicado | decisão de fronteira |
| D-A9 | Sem cobertura de teste para: N keywords em uma URL, rótulo curto, keyword com decisão humana barrada pelo portão 4, fallback `membros[0]` | teste no Arquiteto |

---

## 10. Verificações desta rodada

| Verificação | Resultado |
| --- | --- |
| `node --test tests/arquiteto-article-formation.test.mts tests/article-formation-rules.test.mts tests/arquiteto-formation-scenario.test.mts` | **43/43 passaram** |
| Reprodução verbatim de `tokensOf`/`overlap` contra 6 formatos de rótulo publicado | tabela §4.1 |
| Cobertura existente do portão 4 | **só o caso feliz** — 1 keyword × 1 página, casamento exato (`arquiteto-article-formation.test.mts:209-220`) |
| Leitores de `matchedToPublished` / `ungroupedKeywordIds` em `modules/arquiteto/` | **zero** |
| `publishedArticles` nos scripts de auditoria | **ausente nos dois** |

`PROVIDER_CALLS = 0` · `REMOTE_READS = 0` · `REMOTE_WRITES = 0` ·
`MIGRATIONS = 0` · nenhum arquivo do projeto alterado; o único arquivo criado é
este adendo. A reprodução aritmética rodou em arquivo de scratch fora do
repositório.

**Limitação principal:** nenhum dado remoto foi lido. Os IDs, o `assignment`, o
ArticleDNA v5 e o catálogo do site continuam ⟨remoto⟩ na grade da seção 2. Este
adendo prova o **mecanismo** e entrega a assinatura que identifica **qual** deles
disparou; não substitui essa leitura.
