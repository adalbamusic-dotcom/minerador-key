# Corte 3.5 — a fronteira Redator → Publicações, e o layout consolidado

**Data:** 2026-09-18
**Não executado:** migration, SQL remoto, DDL, deploy, commit, push, purge. **M3 não aplicada.**
**Status:** fechado em 2026-09-18 (§4.2).

Duas tarefas na mesma rodada, com o mesmo fio: **finalizar não é entregar**, e **cada controle mora em um lugar só**.

---

## Parte 1 — a fronteira

### 1.1 O defeito de semântica

A projeção do corte anterior colapsava tudo num estado só e mapeava `document.status = 'aprovado'` direto para `PRONTO`. Lido na biblioteca de Publicações, `PRONTO` diz "Publicações tem isto" — quando o artigo podia nunca ter sido entregue.

Agora são **três eixos**, com três autoridades:

| Eixo | Autoridade | Valores |
| --- | --- | --- |
| `writerStatus` | `content_documents.status` | `RASCUNHO` · `FINALIZADO` |
| `deliveryStatus` | existe `publication_record` | `NAO_ENTREGUE` · `RECEBIDO` · `PUBLICADO` |

A entrada continua sendo `sendWriterToPublications → publication_record persistido → readback confirmado`. Sem o registro, `deliveryStatus` é `NAO_ENTREGUE`, **por mais finalizado que o documento esteja**.

Na tela, dois selos em vez de um: o do Redator e o de Publicações. Um selo só voltaria a dizer que finalizar é entregar.

### 1.2 A biblioteca continua sendo read model

`documentId` segue como identidade única da linha. `ContentDocument` fornece título, conteúdo, `updatedAt`, formato, metadados e referência à versão corrente; `PublicationRecord` fornece prova de entrega, estado e destino. **Nenhuma linha duplica quando os dois existem** — o `id` da linha é o documento.

Sobre "se a Biblioteca for exclusiva de Publicações, documentos sem registro não entram": em vez de uma segunda projeção, o filtro ganhou **`ENTREGUES`**, que esconde tudo que ainda não tem registro. A leitura continua unificada; quem quiser a visão exclusiva a tem com um clique, sem lista paralela.

### 1.3 A Fila deixou de ter caminho local-first

`importApprovedToPublications` atualizava o workspace local e disparava `void sendWorkflowCommand(...)` sem esperar. A tela dizia "importado" antes de qualquer confirmação. Era uma **segunda autoridade de entrada**, e ela discordava da primeira.

Removido, por inteiro, em vez de remendado:

- o método saiu do contexto;
- os botões "Importar aprovados" e "Importar do Redator" saíram das duas telas de Publicações;
- o comando `import_publications` saiu do contrato **e** da rota.

Deixar a ação viva no servidor sem cliente seria arma carregada — o mesmo raciocínio que fechou as quatro ações do Planejador no Corte 2.

**A Fila ficou somente leitura.** Ela lista o que já foi recebido; ela não recebe.

### 1.4 A invariante de versionamento

Registrada em `invariantes.md` §70-74:

```text
Salvar rascunho               = NÃO cria versão histórica
Finalizar pela primeira vez   = cria a versão final
Refinalizar conteúdo alterado = cria sucessora
Só predecessora finalizada e substituída entra na janela de 48h
Autosaves intermediários NÃO entram no lifecycle de retenção
```

Autosave é estado corrente, não histórico. Guardar cada tecla como versão encheria a retenção de ruído e esconderia as substituições que importam.

---

## Parte 2 — o layout

### 2.1 O que a tela tinha

Três faixas horizontais empilhadas: a GlobalTopbar, a barra de abas (`Artigo · Roteiro · Carrossel · Conectar IA`) e a barra de controles (`Em redação · 17 palavras · Sem alterações pendentes · Tela cheia · Salvar rascunho · Finalizar artigo`). Mais um rodapé de ações. O documento ficava espremido no meio.

A barra de controles foi minha, do corte anterior. Ela resolvia o problema de dois controles concorrentes criando uma faixa nova — e faixa nova é o problema que o produto não quer.

### 2.2 O que ficou

Tudo na **GlobalTopbar, que já existia**:

- `tabs`: as três abas de ambiente — `Artigo`, `Roteiro e storyboard`, `Carrossel`.
- `actions`: `[Status] · palavras · estado do save · [Salvar rascunho] · [Finalizar artigo]`.

**Os handlers são os mesmos.** `saveDraftNow` e `finalizeArticle` não foram reimplementados; mudaram de lugar. `saveDraftNow` continua reusando o autosave com flush, e `finalizeArticle` continua reusando `requestStatus("aprovado")` com o gate do Guardião.

### 2.3 O que saiu

| Removido | Por quê |
| --- | --- |
| Barra de abas própria | virou `tabs` da GlobalTopbar |
| Barra de controles do documento | virou `actions` da GlobalTopbar |
| Rodapé de ações | controle duplicado |
| **Tela cheia** | apagada, sem substituta, como pedido |
| **Conectar IA** | a autoridade de integração é `/agencias/{agencyRef}/integracoes` |

`modules/redator/writer-mcp-connections.tsx` foi **apagado** — era o consumidor exclusivamente visual daquela aba. A infraestrutura MCP server-side (`/api/mcp/redator`, `/api/redator/mcp-delegations`, `lib/server/writer-mcp-delegation.ts`) **não foi tocada**.

### 2.4 Onde foi parar a entrega

`Enviar a Publicações` **não** virou barra nem rodapé. Ele aparece no **painel direito**, num bloco contextual, e **só quando o documento está finalizado** — antes disso, mostrá-lo convidaria a clicar cedo. Finalizar e entregar continuam sendo atos diferentes.

O resto das laterais segue como está: esquerda com rascunhos, `Importar do Radar`, outline e navegação; direita com Guardião, metadados e revisão. O centro é do documento.

---

## 3. Testes

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 60/60 | **64/64** | +4 novos |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 — 4 falhas | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 — 10 falhas | **41/51 — as mesmas 10** | 0 |
| `redator-global-topbar` | 3/3 | **3/3** | 0 |
| `publicacoes-domain` + `publicacoes-global-topbar` | 6/6 | **6/6** | 0 |
| `radar-to-writer-handoff-1` (loader) | 26/26 | **26/26** | 0 |
| `eslint` nos arquivos tocados | — | **0 erros** | 0 novos |

### 3.1 Cobertura pedida

| Item | Teste |
| --- | --- |
| finalizado sem registro não é "recebido" | biblioteca 02 |
| envio confirmado cria/atualiza uma única linha | biblioteca 04 |
| repetição idempotente não duplica | biblioteca 04 + `sendWriterToPublications` (`ALREADY_SENT`) |
| falha de write/readback não cria sucesso visual | biblioteca 16 + lifecycle 02 |
| publicado não aparece como apenas "pronto" | biblioteca 03 |
| Fila sem caminho local-first | biblioteca 15 |
| rascunho não cria versão | lifecycle 14 (`createVersion` desligado) |
| finalização e envio são ações diferentes | biblioteca 17 + o bloco contextual do painel direito |
| `Conectar IA` fora do Redator | biblioteca 17 |
| `Tela cheia` fora | biblioteca 17 + topbar |
| sem segunda barra de tabs / status / rodapé | biblioteca 17 |
| GlobalTopbar com abas, estado, palavras, salvar e finalizar | topbar (2º teste) |
| handlers continuam os mesmos | lifecycle 14 |
| `Importar do Radar` funcional | biblioteca 18 |

### 3.2 Seis testes precisaram ser atualizados

Todos porque descreviam superfícies que este corte removeu, e nenhum por ter encontrado defeito:

1. `redator-global-topbar` — exigia `Importar do Planejador`, `Tela cheia` e `Publicações` na barra. Também carregava asserções sobre `canUndo`/`canRedo` numa forma que o código já não usava desde a correção do editor nulo.
2. `operational-flow` · `assertRadarIsTheOnlyWriterEntry` — olhava a toolbar; passou a olhar os controles na GlobalTopbar.
3. `operational-flow` · "interface operacional…" — exigia `Importar do Redator`, o botão local-first.
4. `operational-flow` · "todos os popups…" — exigia o texto do diálogo de importação que saiu.
5. `planejador-fora-do-pipeline` 09 — listava `import_publications` entre os comandos que deviam permanecer.
6. `publicacoes-global-topbar` — exigia `Importar aprovados`.

---

## 4. Arquivos

**Alterados:**
```
lib/publicacoes/editorial-library.ts             (três eixos; filtro ENTREGUES)
lib/editorial/persistence-contracts.ts           (import_publications fora)
app/api/editorial/workflow/route.ts              (bloco import_publications fora)
components/editorial-pipeline-context.tsx        (importApprovedToPublications fora)
components/editorial/professional-writer.tsx     (GlobalTopbar; sem toolbar, rodapé, fullscreen e MCP)
modules/publicacoes/publications-workspace.tsx   (dois selos; Fila somente leitura)
modules/publicacoes/publications-page.tsx        (botão local-first fora)
docs/00-produto/invariantes.md                   (§70-74)
tests/…                                          (6 atualizados, 4 novos)
```

**Apagado:** `modules/redator/writer-mcp-connections.tsx`

**Não tocados:** banco, migrations, contratos editoriais, `sendRadarToWriter`, `sendWriterToPublications`, infraestrutura MCP server-side, Radar, Arquiteto, Minerador.

---

## 4.1 Correção — a barra de rolagem na GlobalTopbar

O corte acima deixou um defeito visível: sob os controles do documento aparecia
um **trilho de rolagem horizontal**, que rouba altura de uma barra de 40px fixos.

### A causa não era o scroller

`overflow-x-auto` era o sintoma. A causa é a divisão da barra: os três blocos são
`flex-1`, ou seja, **um terço cada um independentemente do que carregam**. À
esquerda moram um título e três ícones; no centro, cinco controles do documento.
O centro recebia 459px para conteúdo de 524px, e o scroller escondia a diferença.

| | antes | depois |
| --- | --- | --- |
| esquerda (título + histórico) | `flex-1` · 459px | `flex-initial` · **162px** |
| centro (controles do documento) | `flex-1` · 459px, com scroller | `flex-1` · **770px**, sem scroller |
| direita (abas + sino + ajuda + perfil) | `flex-1` · 459px | `flex-initial` · **360px** |

As laterais passam a ser dimensionadas pelo conteúdo e o centro fica com a folga.
`flex-initial` (`flex: 0 1 auto`) não cresce, mas ainda encolhe — não é `shrink-0`.

Nada de `flex-wrap`: a barra tem altura fixa e a segunda linha ficaria cortada.

### O defeito que a correção quase introduziu

Medido no navegador a **1024px**, a primeira versão da correção transbordava o
centro em 9px e **`Finalizar artigo` colidia com a aba `Artigo`** — pior que o
scrollbar, porque escondia um controle em vez de apenas deslocá-lo.

Duas regras fecharam isso, na ordem de quem deve ceder espaço primeiro:

1. a contagem de palavras é decorativa e **some abaixo de `xl`** (`hidden xl:inline`);
2. o texto de estado do save **trunca** (`min-w-0 max-w-64 truncate`) — os botões
   nunca encolhem, porque `GLOBAL_TOPBAR_ACTION_CONTROL` já é `shrink-0`.

### Medição na página real

Com o dev server na 3000 e o Redator aberto em `/{marca}/redator`:

| | 1379px (largura real) | 1024px (aperto) |
| --- | --- | --- |
| elementos com trilho de rolagem | **0** | **0** |
| altura da barra | **40px** | **40px** |
| blocos esquerda / centro / direita | 162 / 770 / 360 | 162 / 415 / 360 |
| controles do documento | 524px, **247px de folga** | 399px, cabe |
| colisão entre blocos | **não** | **não** |
| itens truncados | nenhum | selo e estado do save |

Os dois `<span>` com `scrollWidth > clientWidth` a 1024px são `truncate` fazendo
o seu trabalho — `overflow-x: hidden`, reticências, sem trilho.

### Teste

`redator-global-topbar` ganhou um quarto teste que trava as duas metades: nenhuma
classe de rolagem ou `flex-wrap` no registro, e as duas laterais em `flex-initial`
na GlobalTopbar. A comparação ignora os comentários do bloco, que citam as classes
proibidas — sem isso o teste casaria com o próprio comentário.

| Suíte | Baseline | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** |
| `redator-global-topbar` | 3/3 | **4/4** (+1) |
| `test:redator` | 64/64 | **64/64** |
| `test:radar` | 2236/2236 | **2236/2236** |
| `publicacoes` (3 arquivos) | 24/24 | **24/24** |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `eslint` nos arquivos tocados | — | **0 erros** |

**Arquivos:** `components/global-topbar.tsx`, `components/editorial/professional-writer.tsx`,
`tests/redator-global-topbar.test.mts`. Banco, migrations e contratos intocados.

---

## 4.2 Fechamento — o escopo da Biblioteca é a entrega

```text
ContentDocument   = conteúdo produzido
PublicationRecord = prova de entrega a Publicações
```

### O que estava errado

A §1.1 separou os eixos no read model, mas a TELA continuava neutra: o default
era `TODOS` e a lista de recortes era `TODOS · RASCUNHO · FINALIZADO · ENTREGUES
· PUBLICADO`. `RASCUNHO` e `FINALIZADO` são estados do **Redator**. Usados como
recorte de Publicações, eles punham na lista — como item normal, lado a lado com
o que já havia sido recebido — documento que Publicações nunca recebeu.

Ou seja: a confusão entre finalizar e entregar, fechada no contrato, voltava pela
porta do filtro.

### O que ficou

O escopo virou contrato, e não valor inicial de `useState`:

```ts
PUBLICATIONS_LIBRARY_DEFAULT_FILTER = "ENTREGUES"
PUBLICATIONS_LIBRARY_FILTERS        = ["ENTREGUES", "RECEBIDO", "PUBLICADO", "NAO_ENTREGUE"]
belongsToPublications(row)          = row.deliveryStatus !== "NAO_ENTREGUE"
```

Todos os recortes são do **eixo de entrega**. `NAO_ENTREGUE` continua no read
model — a projeção não descarta documento nenhum, e não há lista paralela —, mas
só é alcançável por um recorte explicitamente nomeado, **“Ainda no Redator”**,
nunca como parte normal da lista e nunca apresentado como algo já recebido.

O eixo do Redator não sumiu: continua em `writerStatus`, no selo de cada linha.
O que ele não faz mais é decidir o que a biblioteca mostra.

| Regra pedida | Onde |
| --- | --- |
| default `ENTREGUES` | `PUBLICATIONS_LIBRARY_DEFAULT_FILTER`, teste 19 |
| sem registro não é item normal da biblioteca | recortes só do eixo de entrega, teste 20 |
| `NAO_ENTREGUE` existe, mas não como recebido | testes 21 e 02 |
| `aprovado` não vira estado de entrega | `deliveryStatusOf` só lê o registro, teste 02 |
| `documentId` é a identidade | `id: document.id`, testes 04 e 22 |
| eixos separados | dois selos por linha, testes 03 e 21 |

### O defeito que a verificação encontrou

Abrindo Publicações no navegador para conferir o default, apareceu outra coisa: o
switcher `Biblioteca · Fila · Publicados · Atualizações` **não renderizava**.

Ele vivia dentro de `renderTopbarActions`, que só é chamado pelo
`OperationalDataGrid`. A Biblioteca não é planilha, então o grid não renderiza
nela — e como a Biblioteca é a área padrão, ao abrir Publicações as outras três
áreas ficavam **inalcançáveis**. Defeito do próprio Corte 3.5, não desta rodada.

Correção: o switcher virou um nó único (`areaTabs`), registrado como `tabs` da
GlobalTopbar pelas duas superfícies — a ponte do grid ganhou a passagem
`topbar.tabs`, e a Biblioteca monta `PublicacoesAreaTabs`. As duas são
mutuamente exclusivas, então o slot de controles do módulo tem sempre
exatamente um dono. Nenhuma barra horizontal nova.

Conferido no navegador nos dois sentidos: Biblioteca → Fila mantém as abas e traz
as ações do grid; Fila → Biblioteca mantém as abas, tira as ações do grid e
preserva o recorte `Entregues`.

### Bateria pedida

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | limpo | **limpo** | 0 |
| `test:redator` | 64/64 | **68/68** | +4 novos (19-22) |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `publicacoes-global-topbar` | 2/2 | **4/4** | +2 novos |
| `eslint` nos arquivos tocados | — | **0 problemas** | 0 |

As 14 falhas herdadas foram conferidas uma a uma pelo nome: são as mesmas de
antes desta rodada, sobre rotas, layout Admin, Marca e as superfícies do
Arquiteto/Minerador. Nenhuma toca a Biblioteca nem Publicações.

**Arquivos:** `lib/publicacoes/editorial-library.ts`,
`modules/publicacoes/publications-workspace.tsx`,
`components/editorial/operational-data-grid.tsx`, mais os dois arquivos de teste.
Banco, migrations e contratos editoriais intocados.

---

## 5. Dois pontos que ficam registrados

**`modules/redator/writer-page.tsx` ainda tem `LegacyWriterPrototype`**, marcado `@deprecated`, com um controle de tela cheia próprio. Nenhuma rota o renderiza — `WriterPage` só devolve `ProfessionalWriter`. Não o apaguei porque `tests/operational-flow.test.mts` lê o arquivo como texto e a remoção sairia do escopo desta tarefa. É código morto, e está nomeado.

**A homologação visual continua sendo sua.** Na correção da §4.1 medi o layout na página real — larguras dos blocos, transbordo, colisão e altura da barra — e tirei captura em 1379px e 1024px. Isso prova geometria, não prova que a composição ficou boa nem que o fluxo funciona: não salvei, não finalizei e não entreguei nada pelo Redator. `VALIDADO_MANUALMENTE = não`.

---

```text
PARALLEL_EDITOR_LIBRARY = NO
COPY_TO_PUBLICATIONS = NO
SAME_CONTENT_DOCUMENT = YES
DELIVERY_REQUIRES_PUBLICATION_RECORD = YES
QUEUE_LOCAL_FIRST = NO
SECOND_HANDOFF_IMPLEMENTATION = NO
FULLSCREEN = REMOVED
CONNECT_AI_TAB = REMOVED
EXTRA_HORIZONTAL_BARS = 0
TOPBAR_SCROLLBAR = 0
TOPBAR_CONTROL_COLLISION = NONE
PUBLICATIONS_DEFAULT_SCOPE = ENTREGUES
PUBLICATIONS_FILTERS_ON_DELIVERY_AXIS_ONLY = YES
NAO_ENTREGUE_AS_RECEIVED = NEVER
PUBLICATIONS_AREAS_REACHABLE = 4/4
CUT_3_5_CLOSED = YES
M3_APPLIED = NO
PURGE_IMPLEMENTED = NO
REGRESSIONS = NONE
```
