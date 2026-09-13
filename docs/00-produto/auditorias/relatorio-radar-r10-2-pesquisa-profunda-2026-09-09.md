# RADAR R10.2 — Pesquisa profunda orientada pelo ArticleDNA completo

Data: 2026-09-09 · Lote: R10.2 · Implementação autorizada

```
PROVIDER_CALLS (testes) = 0
PROVIDER_CALLS (runtime) = 1 canônica + N auxiliares por investigação, por ação humana
MIGRATIONS           = 0
REMOTE_WRITES        = 0
MINERADOR_CHANGED    = 0
ARTICLEDNA_ENGINE_CHANGED = 0
SILODNA_CHANGED      = 0
LINKGRAPH_CHANGED    = 0
PLANEJADOR_CHANGED   = 0
AUTORIZAÇÃO          = inalterada (mesmo resolveArticle, mesma prova de Silo)
test:radar           = 386/386
test:arquiteto       = 2011/2012 (a falha é pré-existente e alheia: um teste do
                       Minerador procura a string "Processar lógica"; `git diff
                       --name-only | grep minerador` está vazio neste lote)
tsc --noEmit         = 0 erro em Radar
eslint (arquivos tocados) = 0 erro
MANUAL_UI_VALIDATED  = NÃO — a homologação manual é sua
```

---

## 1 · O que mudou de fato

O Radar pesquisava **uma keyword**. Passa a pesquisar **a unidade editorial
inteira**: quatro, cinco keywords com papel, volume, resultados, KGR, intenção,
funil, entidade e modificadores já decididos pelo Arquiteto — mais Silo, SERP de
formação e grafo de links.

Sete módulos novos, todos domínio puro (sem fetch, sem storage, sem provider):

| Módulo | Responsabilidade |
| --- | --- |
| `lib/radar/research-query-plan.ts` | Cada keyword vira uma **candidata a consulta** com disposição declarada |
| `lib/radar/competitor-universe.ts` | Universo competitivo por **recorrência entre consultas**, com classe e motivo |
| `lib/radar/editorial-comparison.ts` | ARTIGO DECLARA × SERP MOSTRA × CONCORRENTES COBREM |
| `lib/radar/link-and-source-research.ts` | Grafo aprovado como fato + candidatas a fonte externa |
| `lib/radar/foundation-usage-map.ts` | Prova de que **nenhum fundamento é ignorado em silêncio** |
| `lib/radar/deep-research.ts` | O registro da investigação: congelamento, execução por consulta, encerramento |
| `lib/radar/deep-research-view.ts` | A leitura única que a tela renderiza (a tela não decide nada) |

E uma autoridade existente ganhou um nível: `investigation-sufficiency.ts`.

---

## 2 · A hierarquia dos sinais — escrita, não implícita

Documentada no topo de `research-query-plan.ts` e verificada nos testes A–F:

1. **PAPEL** — principal > secundária > reforço. É decisão editorial do
   Arquiteto e **nenhuma métrica a sobrepõe**.
2. **INTENÇÃO E FUNIL** — dizem que TIPO de concorrente a consulta traz.
3. **ENTIDADE E MODIFICADORES** — preservam coerência temática.
4. **VOLUME, RESULTADOS E KGR** — dimensionam e contextualizam. **Nunca decidem
   sozinhos.**

Prova no teste F, com a fixture montada exatamente para isso: o reforço
`ácido salicílico` tem **volume 5400** (contra 3600 da principal) e **KGR 0,04**
(contra 0,12). Ele continua reforço, e a consulta central continua sendo a
principal.

### As disposições

| Disposição | Quando | Exemplo na fixture |
| --- | --- | --- |
| `EXECUTE` | principal; secundária com leitura própria; reforço com **entidade própria** | `skincare para pele oleosa`, `melhor sabonete para pele oleosa`, `ácido salicílico` |
| `CONTEXT_ONLY` | repete a principal em intenção, funil, entidade e termos; ou reforço sem entidade própria | `skincare pele oleosa` |
| `REUSE_FORMATION_EVIDENCE` | a SERP de formação já observou a keyword **e uma pessoa já decidiu** | secundária com `keywordUrlRelation` + `humanResolution` |
| `NOT_EXECUTABLE` | keyword sem texto resolvido | permanece no plano, **id nunca vira consulta** |

---

## 3 · Duas classes de SERP — a arquitetura definida em revisão

```
ArticleDNA
   ├── Principal    → SERP CANÔNICA DO ARTICLE   (snapshot · revisão · aprovação)
   ├── Secundária A → SERP AUXILIAR DE PESQUISA
   ├── Secundária B → SERP AUXILIAR DE PESQUISA
   └── Reforço      → SERP AUXILIAR, se necessária
                              ↓
                     CompetitorUniverse
                              ↓
                       Deep Research
```

A primeira versão deste lote parou na principal e **declarou** o limite em vez
de contorná-lo: a rota resolvia a keyword no servidor e não aceitava outra. A
revisão definiu a arquitetura certa — não "aceitar qualquer keyword", e sim
**duas classes de SERP que não se misturam**.

| | SERP canônica | SERP auxiliar de pesquisa |
| --- | --- | --- |
| Origem | keyword **principal** | secundária ou reforço |
| Ação | `collect` | `collect_auxiliary` |
| Vira snapshot do artigo | **sim** | **não** |
| Entra na cadeia de versões | sim (`snapshot_version`) | não (`version: 1`, sem antecessor) |
| Revisão e aprovação humana | **sim** | **não** |
| Onde persiste | `editorial_serp_snapshots` | evidência no registro da investigação |
| Alimenta o CompetitorUniverse | sim | sim |

**A autorização é a mesma.** `collect_auxiliary` passa pelo mesmo
`resolveArticle`: workflow da marca, envelope de resolução, ArticleDNA
pertencente à marca e **prova remota de posse do Silo**. Nada foi afrouxado.

**O texto nunca vem do cliente.** O navegador manda `keywordId`; o servidor:

1. prova que a keyword está em `article.payload.keywordReferences`;
2. **recusa** se for a principal — *"A keyword principal é coletada pela SERP
   canônica do artigo, não como pesquisa auxiliar."*;
3. resolve o texto em `minerador_keywords` (canônico) ou na hidratação
   transportada pelo Arquiteto — nunca no corpo da requisição.

Consulta paga com texto arbitrário do navegador continua impossível.

**A intenção esperada é a da keyword**, não a do artigo: `semanticQualificationRef.intent
→ normalizedIntent → mainIntent`. É a intenção da consulta que diz que tipo de
concorrente esperar.

**Zero migração.** A auxiliar não ganhou tabela nem coluna: ela persiste como
`evidence` dentro de `deepResearch.queries[]`, no payload da análise — posição,
URL, título, domínio e tipo, no máximo 10 por consulta. É o que o universo lê, e
nada além disso. A cadeia canônica de snapshots permanece intocada.

**Custo declarado:** cada consulta auxiliar é uma chamada DataForSEO
contabilizada em `recordIntegrationUsage` com `operationKind: "serp_auxiliary"`.
Um artigo com principal + duas secundárias + um reforço executável custa **4
coletas** por investigação. O aviso na tela diz quantas foram canônicas e
quantas auxiliares.

---

## 4 · O universo competitivo — recorrência é o sinal

Oito classes, cada URL com motivo legível, **nada eliminado em silêncio**:

| Classe | Critério |
| --- | --- |
| `EDITORIAL_COMPETITOR` | aparece na principal **ou** se repete entre consultas |
| `COMMERCIAL_COMPETITOR` | página comercial **recorrente**: disputa a intenção, sem ser benchmark |
| `PRODUCT_REFERENCE` | ficha/vitrine em uma consulta: evidência de intenção comercial |
| `FORMAT_REFERENCE` | vídeo e rede social: referência de formato, fora do benchmark |
| `AUTHORITY_SOURCE` | domínio de autoridade: candidato a **fonte**, não a concorrente |
| `SERP_FEATURE` | elemento da própria SERP |
| `LATERAL_REFERENCE` | só aparece em consulta de reforço |
| `NOT_RELEVANT` | não está na principal nem se repete |

Cada candidato carrega `appearedInQueries`, `queryCount`, `principalRank`,
`secondaryRanks`, `reinforcementRanks`, compatibilidade de intenção, de entidade
e de Silo (o próprio domínio é marcado `own_domain`, nunca vira concorrente), e
`formationSerpSeen`.

Correção encontrada pelos testes: `gov.br` não casava com `\.gov(\.|$)` — o
ponto não vem antes de "gov" no domínio do governo brasileiro. E
`pubmed.ncbi.nlm.nih.gov` era classificado como órgão oficial: a assinatura
específica (base de estudos) passou a vencer o TLD genérico.

---

## 5 · A comparação com o ArticleDNA

`buildRadarEditorialComparison` produz uma linha por confronto, com a mesma
gramática em todas — e evidência obrigatória em cada uma:

| Situação | Significado |
| --- | --- |
| `CONFIRMED` | o artigo declara **e** o mercado cobre |
| `GAP` | o mercado cobre **e** o artigo não declara |
| `DIFFERENTIATION` | o artigo declara e o mercado **não** cobre — diferencial observado, **nunca "erro do artigo"** |
| `CONFLICT` | as leituras se contradizem (intenção, formato) |
| `NOT_OBSERVED` | a amostra não permitiu observar |

**Lacuna exige recorrência E relevância** (teste M): um tópico sem relação com a
consulta, com a principal ou com o contexto editorial não vira oportunidade —
"política de trocas e devoluções" continua sendo o que é.

---

## 6 · Links e fontes — o que o Radar observa, o que o Planejador decide

`buildRadarInternalLinkResearch` lê o grafo **aprovado** como fato:
`relatedInternalPages` (entrada e saída), `relationType`, `anchorConcepts`,
`reason`, `priority` — mais o padrão observado nos concorrentes (mediana e faixa
de links internos e externos por página).

A fronteira está escrita no módulo e **verificada por teste** (N): a fonte não
contém `requiredAnchor`, `anchorText:`, `finalAnchor`, `insertAt` nem
`repeatCount`.

> O Radar observa: quantos links, onde, com que âncora conceitual, que fontes
> recorrem, que páginas internas deveriam se relacionar.
>
> O Planejador decide: quantos links entram, quantas vezes cada âncora se
> repete, em que seção, em que posição, e qual o texto final da âncora.

**Limitação declarada, não escondida**: a extração atual guarda a **contagem** de
links externos, não os domínios de destino. `buildRadarExternalEvidenceCandidates`
diz isso em vez de inventar fonte; quando os domínios existirem, ele já os
classifica (oficial, estudo, autoridade) com o número de concorrentes que os
citam.

---

## 7 · Suficiência: `CONFLICTING_SEARCH_INTENT`

O nível novo corrige uma injustiça do modelo anterior. Quando o artigo declara
comportamento transacional e a SERP devolve produto, **a coleta não falhou**:
ela confirmou o comportamento declarado. Chamar isso de "amostra insuficiente"
mandava recoletar uma SERP que já tinha respondido.

```
SUFFICIENT                · comparáveis bastam para faixa e padrão
PARTIAL_BUT_USABLE        · dá para ler, com limitação declarada
CONFLICTING_SEARCH_INTENT · sem benchmark editorial porque a busca é comercial
INSUFFICIENT              · sem amostra E sem explicação observada
BLOCKED                   · falta snapshot ou curadoria confirmada
```

`readRadarSearchIntent` separa dois casos, ambos conclusão legítima:

- **COHERENT_COMMERCIAL** — declarado comercial + SERP comercial: *a coleta
  confirma a intenção declarada*.
- **DIVERGENT** — declarado informacional + SERP comercial: *a divergência é
  fato observado, não erro de coleta* — e precisa de decisão humana antes do
  planejamento.

Em ambos: `canBuildCompetitiveModel = false`, `canDeriveCompetitiveNeeds = false`
(sem benchmark não há necessidade competitiva a derivar), `canApprove = true`
(existe achado para registrar). **Sem a evidência de intenção, o comportamento é
exatamente o de antes**: zero comparáveis continua `INSUFFICIENT` e continua sem
aprovar (teste P).

**Uma suficiência só.** A aba SERP recalculava a sua — sem a evidência de
intenção, porque não tinha o universo. Dois veredictos para a mesma amostra é o
começo do contador que discorda do contador: a aba passa a ler
`deepResearch.sufficiency` quando a investigação está resolvida, e só recalcula
como fallback.

---

## 8 · As duas ações humanas

```
[ Iniciar pesquisa profunda ]        →  investigação começa
        ...trabalho automático...
[ Finalizar investigação ]           →  investigação termina
```

- **Nada começa sozinho.** Abrir o artigo não coleta, não consulta provider, não
  analisa. Teste Q verifica que não existe `useEffect` disparando nenhuma das
  duas.
- **Nada termina sozinho.** `finalizeRadarDeepResearch` recusa quando a
  suficiência é `BLOCKED`/`INSUFFICIENT`, quando o fundamento mudou, e quando a
  investigação já foi finalizada.
- **Sem wizard, sem stepper global.** O bloco fica onde a decisão do artigo já
  acontece — fim do bloco operacional, antes da planilha — e a regra de **uma
  ação primária por vez** foi mantida: quando a investigação profunda oferece a
  ação, o slot genérico se recolhe.

### O congelamento (o que "Iniciar" registra)

`buildRadarResearchFingerprint` congela e persiste, em
`RadarAnalysisPayload.deepResearch` (aditivo, `.default(null)`):

```
articleDnaVersionId + articleDnaContentHash
keywordRefs[] = { keywordId, keywordDnaVersionId, semanticQualificationVersionId }
siloDnaVersionId + siloPageId
formationAssessmentId + formationBaseHash
internalLinkGraphVersionId
```

Se qualquer um mudar, a investigação anterior fica **`STALE`** — nunca atualizada
em silêncio, nunca descartada em silêncio. A ação vira `Refazer pesquisa
profunda`, com o motivo na tela.

---

## 9 · FOUNDATION_USAGE_MAP — a prova

A auditoria R10 encontrou volume, KGR, intenção, SERP de formação, Silo e grafo
atravessando o handoff, persistidos na linha do Radar, **sem um único leitor no
motor**. O problema não era transporte: era ninguém ter declarado o que cada dado
deveria fazer.

`RADAR_FOUNDATION_USAGE_MAP` tem **32 entradas**, cada uma com `field`, `usage[]`,
`consumers[]` e `note`. `CONTEXT_ONLY` é resposta legítima — "isto informa a
leitura sem entrar em cálculo". **`AVAILABLE_BUT_SILENTLY_IGNORED` não é uma
categoria**, e o teste 23 verifica que a string sequer existe na fonte.

O teste enumera as chaves reais do `strategy` do contexto resolvido: **um campo
novo sem mapeamento quebra o teste**. Foi assim que `strategicContribution`,
`purpose` e `overlapRisk` entraram no mapa neste lote.

---

## 10 · Testes

`tests/radar-r10-2-pesquisa-profunda.test.mts` — 21 testes, fixture "skincare
para pele oleosa": 4 keywords (principal, duas secundárias com intenções
diferentes, um reforço), Silo `skincare` com SiloPage `/skincare` publicada, SERP
de formação com divergência resolvida por pessoa, grafo com **entrada e saída**.

```
A · o plano nasce da unidade editorial inteira, não da principal
B · a principal é a consulta central e sempre executa
C · secundária com intenção própria amplia o universo
D · secundária que repete a principal fica como contexto, sem gastar coleta
E · reforço só vira consulta quando tem entidade própria
F · KGR e volume não promovem papel
G · keyword sem texto não vira consulta, não vira id e não some do plano
H · evidência da formação com decisão humana é reaproveitada
I · recorrência entre consultas classifica concorrente editorial
J · ficha de produto recorrente é comercial, não benchmark
K · formato, autoridade, domínio próprio e lateral têm cada um o seu nome
L · a comparação separa confirmado, lacuna, diferencial e conflito
M · lacuna exige relevância
N · o grafo é lido como fato — e a âncora final continua sendo do Planejador
O · fontes externas declaram a limitação em vez de inventar domínio
P · busca comercial coerente conclui em vez de acusar amostra falha
Q · começa por ação humana, congela o fundamento, não finaliza sozinha (×3)
R · o papel decide a classe: só a principal produz a SERP do artigo
R · a evidência auxiliar entra no universo sem virar snapshot do artigo
R · a rota recusa coletar a principal como auxiliar e nunca aceita texto do cliente
23 · todo fundamento resolvido tem uso declarado e consumidor nomeado
18 · o resumo conta o que foi observado e declara o que não pôde afirmar
```

O grupo R é o que guarda a fronteira entre as duas classes: verifica que existe
**uma** SERP canônica por artigo, que a recorrência entre a canônica e a auxiliar
é o que forma o concorrente editorial, que a rota recusa a principal como
auxiliar, que a auxiliar não usa `repository.save` nem
`SerpCollectionRecordSchema`, e que o transporte no cliente não escreve em
`serpRecords`.

Dois testes existentes foram **ajustados, não afrouxados**, porque a composição
mudou de verdade:

- `radar-post-collection.test.mts` — a criação da versão inicial saiu de dentro
  de `startSerpAnalysis` para `curationVersionFor`, compartilhada com a pesquisa
  profunda. O teste passou a cobrir as duas metades (o handler **e** a fábrica),
  mantendo as três garantias: não fala com o provider, usa o snapshot existente,
  não cria sucessora consolidada.
- `radar-composicao-ui.test.mts` — o slot da ação primária ganhou uma condição a
  mais. As asserções passaram a exigir o mesmo de antes **e** a exclusividade
  nova (quando a investigação profunda oferece a ação, o `PrimaryAction` se
  recolhe).

Duas correções encontradas pelo lint no caminho, ambas em código do lote
anterior no mesmo arquivo: `Lista` era criada **dentro do render** de
`SerpSummary` (remontava a lista a cada leitura) e passou a ser componente do
módulo; e um `import type` órfão de `RadarExtractionPage` foi removido. Nenhuma
das duas muda comportamento.

---

## 11 · O que este lote NÃO fez

- Não alterou Minerador, motor do ArticleDNA, SiloDNA, InternalLinkGraph nem
  Planejador.
- Não criou migração, não escreveu no banco, não chamou provider.
- Não mudou o contrato de coleta para forçar consulta por keyword — declarou a
  limitação.
- Não produziu `finalOutline`, `requiredH2Count`, `requiredWordCount`,
  `requiredKeywordDensity`, âncora final, posição ou quantidade de link.
- Não clicou no fluxo real: **a homologação manual é sua**.

---

## 12 · O que conferir na homologação

1. Abrir um artigo no Radar **não** dispara coleta nenhuma.
2. O bloco **Investigação profunda** aparece com o plano de consultas: quatro
   linhas (uma por keyword), cada uma com papel, decisão e motivo.
3. `Iniciar pesquisa profunda` coleta a SERP canônica (se não houver snapshot),
   **depois cada SERP auxiliar** das secundárias e do reforço executável, cria a
   versão da curadoria e grava o fundamento congelado. O aviso diz quantas foram
   canônicas e quantas auxiliares; a tabela mostra a classe de cada consulta.
4. **A aba SERP continua mostrando só a canônica** — nenhuma pesquisa auxiliar
   aparece no histórico de coletas, na revisão ou na aprovação do artigo.
5. A curadoria continua sendo sua: `Confirmar seleção (N)` segue igual.
6. `Finalizar investigação` recusa enquanto não houver do que concluir, e diz o
   motivo.
7. Reabrir depois de uma nova versão do ArticleDNA mostra **Fundamento mudou** e
   oferece `Refazer pesquisa profunda`.
