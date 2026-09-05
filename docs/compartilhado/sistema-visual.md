# Sistema visual canônico — Minerador Key

**Status documental:** `IMPLEMENTED INCREMENTALLY` — o contrato de Inline Label / Affordance Cluster foi implementado sem redesenhar o shell; a fundação visual global continua parcial.<br>
**Estado verificado:** `CURRENTLY IMPLEMENTED = PARTIAL`; os tokens base, o `ProductShell`, o `InfoHint` e o contrato de `InlineLabelCluster` existem, enquanto a topbar global e outras áreas da fundação permanecem incrementais.<br>
**Módulo proprietário:** infraestrutura compartilhada / sistema visual.<br>
**Limite desta revisão:** esta atualização cobre somente Inline Label / Affordance Cluster e seus consumidores visuais; não altera shell, lógica de módulos, Supabase/schema ou operação remota.

## 1. Objetivo

A interface do Minerador Key deve ser legível, calma, profissional e coerente entre módulos. Deve ser confortável em dark mode, adequada para uso prolongado e funcional antes de decorativa.

Não deve parecer neon, excessivamente futurista, poluída, apertada, composta apenas por cards ou agressivamente contrastada.

Este documento orienta a composição visual sem autorizar redesign global, alteração de fluxos ou mudança de comportamento dos módulos.

## 2. Fonte de verdade

A precedência visual é:

1. a skill `app-visual-system` (`.agents/skills/app-visual-system/SKILL.md`);
2. este documento (`docs/compartilhado/sistema-visual.md`);
3. tokens e estilos globais existentes;
4. componentes compartilhados existentes;
5. padrões visuais já validados;
6. regra específica do módulo.

A skill é a fonte executável do contrato: ela é carregada em toda tarefa de
frontend e concentra as regras que o guard automatizado verifica. Este
documento permanece canônico para o produto e para governança. Quando os dois
divergirem, vale a skill e este documento deve ser corrigido na mesma tarefa —
não se mantém duas versões da mesma regra.

### Caminhos reais confirmados

- estilos globais: `app/globals.css`;
- componentes compartilhados: `components/`, incluindo `components/product-shell.tsx`, `components/editorial/operational-data-grid.tsx`, `components/editorial/operational-screen-shared.tsx` e `components/editorial/workflow-status.tsx`;
- implementação proprietária: `modules/`;
- Tailwind: v4, importado por `app/globals.css` com `@import "tailwindcss"` e `@theme inline`;
- não há `src/styles/`, `src/components/` nem `tailwind.config.*` neste checkout — o Tailwind v4 é configurado por CSS;
- guard visual: `scripts/check-visual-system.mjs`, executado por `pnpm run check:visual-system`;
- baseline de dívida visual: `scripts/visual-system-baseline.json`;
- skill: `.agents/skills/app-visual-system/`, com as referências `operational-grid-layout.md`, `color-contract.md`, `inline-label-clusters.md` e `visual-rules.md`.

O estado atual de `app/globals.css` foi auditado. Ele possui a paleta oficial completa em `:root`, os derivados de superfície por `color-mix` e os mapeamentos Tailwind em `@theme inline`. Os tokens-alvo estão implementados; a dívida remanescente está no consumo, não na definição.

O `ProductShell` é o shell compartilhado atual e já oferece acesso pessoal pela rota `/conta`. `GlobalTopbar`, `GlobalNoticeCenter`, `publishNotice` e `NotificationBell` **existem** como componentes canônicos em `components/global-topbar.tsx` e `components/global-notice-center.tsx`, com o contrato de severidade em `lib/visual-notice-contract.ts`. Alguns módulos ainda mantêm notices locais; a absorção continua gradual, sem big-bang.

## 3. Tipografia

### Linguagem visível

Nomes técnicos canônicos são independentes dos labels exibidos na interface. A UI deve preferir linguagem curta e compreensível sem renomear contratos internos.

Essa regra é permanente na fase pós-refresh: `technical canonical name != display label`.
Por exemplo, `BrandDNA` aparece como **Identidade da marca**, `KeywordDNA`
como **Perfil da keyword**, `ArticleDNA` como **Definição do artigo**,
`SiloDNA` como **Arquitetura do silo**, `ContentPlan` como **Plano editorial**,
`ContentDocument` como **Conteúdo do artigo** e `PublicationRecord` como
**Registro de publicação**. Os nomes técnicos continuam sendo usados em tipos,
APIs, rotas, persistência e contratos.

- Texto corrido: 15px ou 16px.
- Texto de interface, tabela e controles: mínimo de 14px.
- Controles compactos da `GlobalTopbar`: 12px com line-height de 20px.
- Texto auxiliar: 12px ou 13px somente para IDs, datas, contadores e metadados.
- Botões: mínimo de 14px.

**Piso absoluto: 12px.** Nenhum texto da plataforma fica abaixo disso, em
nenhuma superfície, incluindo planilhas e painéis de detalhe. Densidade se
obtém com espaçamento e altura de linha, não encolhendo a fonte. O guard falha
em qualquer `text-[Npx]` com `N < 12`.
- Título principal da tela: aproximadamente 24px.
- Título de seção: 18px ou 20px.
- Título de painel: 16px.
- Line-height de corpo: entre 1.5 e 1.6.
- No máximo três pesos de fonte por tela.

Não usar `text-xs` para texto essencial, contraste insuficiente para instruções importantes, títulos excessivamente grandes em telas operacionais ou mistura arbitrária de fontes. Reutilizar a família definida pelos estilos globais; não introduzir fonte nova sem decisão explícita.

## 4. Dark mode

Usar três níveis semânticos:

- **canvas:** fundo geral da tela;
- **surface:** agrupamento ou painel principal;
- **elevated surface:** menu, popover, diálogo ou elemento temporariamente elevado.

Regras:

- não usar preto puro como fundo principal;
- não usar branco puro em grandes blocos de texto;
- texto principal deve ser off-white;
- texto secundário deve continuar legível;
- bordas devem ser discretas;
- hierarquia deve vir de superfície, espaçamento e tipografia;
- evitar glow, neon e gradientes excessivos;
- não colocar bordas fortes em todos os containers;
- dark mode não é simples inversão do light mode.

## 5. Cores e contrato oficial

O alvo aprovado possui uma paleta única. Os valores brutos devem ficar somente
nos arquivos centrais de tokens; componentes consomem nomes semânticos e não
escolhem a cor a partir do módulo.

| Token semântico | Valor oficial | Uso canônico |
| --- | --- | --- |
| `background` | `#131413` | canvas global no dark mode |
| `foreground` | `#f3f4f6` | texto e elementos principais |
| `action-accent` | `#193cb8` | ação principal e seleção forte |
| `context-accent` | `#12A1E0` | contexto, título da área e informação neutra |
| `module-accent` | `#10DDE0` | interação: hover, focus, ring e tab ativa |
| `positive-soft` | `#63F1AF` | seleção, reforço e marcação positiva auxiliar |
| `highlight` | `#C8FF00` | fixação, marcação especial ou re-encontro rápido |
| `success` | `#1fcb0a` | conclusão confirmada |
| `warning` | `#f79001` | atenção, risco ou degradação |
| `pending` | `#E6CE00` | revisão, espera ou decisão humana |
| `danger` | `#A61E1E` | falha, bloqueio ou ação destrutiva |
| `keyword` | `#e0fbff` | **exclusivo da keyword** em toda a plataforma (ver 5.0.1) |
| `divider-dark` | `#212121` | divisor no dark mode |
| `divider-light` | `#d1d1d1` | divisor no light mode |

Os nomes CSS finais podem ser adaptados à convenção existente, desde que
preservem este contrato semântico e tenham uma única fonte central. A tabela
está integralmente implementada em `app/globals.css`.

### 5.0 Separação obrigatória entre os três accents

Confundir os três é a origem da maior parte da dívida visual do projeto:

- `action-accent` significa **eu ajo** — botão primário, seleção forte;
- `context-accent` significa **eu informo** — título da área, `INFO`, contexto;
- `module-accent` significa **eu reajo ao ponteiro ou ao teclado** — hover,
  focus, ring, borda de input em interação, tab ativa.

`module-accent` **não** é identidade do módulo e não pinta conteúdo. É o
feedback de interação da plataforma inteira, idêntico em todas as áreas. Um
módulo não tem cor própria.

### 5.0.1 Papéis fixos de identidade e keyword

Três papéis editoriais têm cor obrigatória em toda a plataforma, expostos como
aliases semânticos em `app/globals.css`:

| Papel | Alias | Token base | Valor | Onde se aplica |
| --- | --- | --- | --- | --- |
| identidade nova | `identity-new` | `module-accent` | `#10DDE0` | slug, link e canonical de conteúdo ainda não publicado |
| identidade publicada | `identity-published` | `action-accent` | `#193cb8` | slug, link e canonical **somente** quando o status é publicado |
| keyword | `keyword` | — (valor próprio) | `#e0fbff` | toda keyword renderizada: planilha, cards, painéis, listas e detalhes |

Regras:

- usar sempre as classes `text-identity-new`, `text-identity-published` e
  `text-keyword`; nenhum componente repete o valor bruto;
- a distinção entre identidade nova e publicada é obrigatória: as duas cores
  nunca podem ser trocadas entre si, e `identity-published` só vale quando o
  status do item é publicado — slug protegido por outro motivo continua novo;
- keyword mantém a mesma cor em qualquer módulo — o papel é da keyword, não da
  tela onde ela aparece.

**`#e0fbff` é cor oficial da paleta e existe exclusivamente para a keyword.**
Não é alias de outro papel: a keyword é o dado central do produto e não pode
herdar a cor de um estado (`pending`, `warning`, `success`) que muda por outro
motivo. Nenhum outro elemento da plataforma usa `#e0fbff`, e a keyword não usa
nenhuma outra cor — nem quando está selecionada, publicada, com conflito ou
desativada. Nesses casos o estado é comunicado por badge, borda ou fundo, nunca
recolorindo a keyword.

Fica explícito o que **não** é keyword e portanto não recebe `text-keyword`:
contagens (`3 keywords`), identificadores (`principalKeywordId`), rótulos de
coluna, nomes de lista e textos de origem. O papel vale para o **valor textual
da keyword**.

### 5.1 Semântica obrigatória de status

| Status | Token | Significado |
| --- | --- | --- |
| `SUCCESS` | `success` | operação concluída, aprovação, publicação, persistência confirmada ou validação aprovada |
| `INFO` | `context-accent` | informação neutra, contexto ou orientação |
| `PENDING` | `pending` | revisão, aprovação aguardada, dado ausente, processamento incompleto ou decisão humana |
| `WARNING` | `warning` | atenção, risco, resultado parcial, condição degradada ou ação sensível |
| `ERROR` / `DANGER` | `danger` | falha, erro, bloqueio, destruição ou impossibilidade |

`SUCCESS` só pode ser emitido depois de uma confirmação real da operação. Não
se deve confundir `success` com `positive-soft`: o primeiro significa “deu
certo”; o segundo é apenas apoio visual. `highlight` não é sucesso genérico e
fica reservado para fixação, exceção ou destaque que precise ser reencontrado.

### 5.2 Cores proibidas e valores brutos

**Roxo é bloqueio absoluto, não dívida gradual.**

`purple`, `violet`, `indigo`, `fuchsia`, `lavender`, `lilac`, roxo, violeta,
lilás e qualquer equivalente azul-lilás ficam proibidos em toda a plataforma —
como classe Tailwind, hex, `rgb`, `hsl`, `oklch`, nome de token, nome de
variável ou comentário descrevendo intenção visual. Não há período de
transição e não há allowlist: o guard falha e a tarefa não conclui.

O frontend ativo também não pode introduzir hex, `rgb`, `rgba`, `hsl`, `hsla`,
`oklch` ou cores Tailwind fora do contrato. Valores brutos ficam somente em
`app/globals.css`. `transparent`, `currentColor`, `inherit` e derivações por
alpha ou `color-mix` dos tokens oficiais são permitidos.

Classes de cor com tom inexistente no Tailwind — `slate-850` e similares — são
igualmente proibidas: não geram CSS algum e produzem bordas e fundos que
simplesmente não são renderizados.

Assets e logos externos de terceiros (por exemplo o ícone oficial do Google)
são a única exceção. Devem ser classificados explicitamente e nunca copiados
para a linguagem visual da plataforma.

O mapeamento de conversão de cor legada para token está em
`.agents/skills/app-visual-system/references/color-contract.md`.

## 6. Botões

Variantes canônicas:

- `primary`;
- `secondary`;
- `ghost`;
- `danger`;
- `icon`.

Dimensões e regras:

- altura normal: 36px ou 40px;
- botão compacto de tabela: mínimo de 32px;
- botão somente com ícone: área mínima de 36 × 36px;
- texto mínimo de 14px;
- radius preferencial de 8px ou 10px;
- não usar texto minúsculo;
- não colorir todos os botões;
- não criar estilo exclusivo por tela;
- ícone sem texto deve ter tooltip ou nome acessível;
- implementar hover, focus-visible, active, disabled e loading quando aplicável.

## 7. Inputs e controles

Inputs e controles devem ter texto mínimo de 14px, labels visíveis, foco perceptível, erro e estado inválido visíveis e altura coerente com botões. Placeholder não substitui label. Controles compactos só devem ser usados quando a densidade da tabela ou planilha exigir.

## 8. Tabelas e planilhas

Para Minerador, Arquiteto, Radar, Planejador e Publicações:

- texto das células: mínimo de 14px;
- cabeçalho: 13px ou 14px;
- altura normal de linha: aproximadamente 44px;
- modo compacto: aproximadamente 40px;
- ações em área clicável adequada;
- seleção com fundo sutil;
- não usar cores saturadas em linhas completas;
- cabeçalhos, filtros e rodapés devem manter consistência.

Priorizar leitura e densidade controlada, sem reduzir texto essencial para caber mais conteúdo.

### 8.1 Operational Grid

O padrão compartilhado para mesas e listas operacionais densas é a família
**Operational Grid**. A referência principal é o Minerador, nas superfícies
Processar Keywords e Descobrir Keywords; essa referência não declara que os
demais módulos já foram migrados.

O contrato **estrutural** está em [Operational Grid](operational-grid.md). Ele
define uma composição comum de cabeçalho, linhas, seleção, pintura de seleção,
ordenação manual, sort, resize, scroll horizontal, detalhe expandido, ações em
lote e estado vazio. As regras de domínio permanecem nos adapters de cada
módulo; a primitive compartilhada não interpreta KeywordDNA, ArticleDNA,
ContentPlan ou PublicationRecord.

O contrato **visual** — geometria do cabeçalho, densidade da linha, badges,
painel de detalhe em bento numerado, pares label/valor, estado vazio e barra de
lote — está em
`.agents/skills/app-visual-system/references/operational-grid-layout.md`.
Toda planilha nova ou tocada segue aquele arquivo. Não existe um segundo estilo
de tabela na plataforma.

Aplicação planejada não é implementação concluída. O Minerador é a
**REFERENCE IMPLEMENTED**; a adoção **PLATFORM-WIDE** permanece planejada e
deve seguir a task de adoção gradual, com DOM real, interação manual e
aprovação além de testes/build.

## 9. Cards, seções e painéis

Usar card somente quando representar uma unidade conceitual real. Preferir agrupamento, espaçamento, títulos, divisores discretos e superfícies graduais.

Evitar card dentro de card, borda em todo bloco, sombra em todo painel, excesso de radius e caixas usadas para compensar falta de hierarquia.

## 9.1 InfoHint

`InfoHint` é o primitive canônico de ajuda contextual curta. Módulos devem
reutilizá-lo em vez de criar tooltips locais equivalentes. O conteúdo segue a
Quiet UI, abre por hover e foco e não contém links, ações, formulários ou
documentação extensa. Informação essencial não pode depender exclusivamente
do `InfoHint`; para conteúdo interativo ou maior, usar um padrão apropriado,
como Popover, em contrato separado.

O visual compartilhado usa o amarelo canônico `pending` somente como assinatura
de contexto: ícone próprio, título, seta e estados hover/foco do trigger. O
fundo, a borda e o corpo permanecem neutros, sem semântica de warning. Corpo e
título usam 14px com line-height próximo de 1.4–1.5, e a largura fica em torno
de 320px com contenção pelo viewport.

### 9.2 Inline Label / Affordance Cluster

`InlineLabelCluster` é o primitive compartilhado para manter um texto e suas
affordances imediatamente associadas como uma unidade visual. O espaçamento é
centralizado nos tokens `--ui-label-info-gap: 2px` e
`--ui-label-control-gap: 4px` em `app/globals.css`.

Contrato:

- label → InfoHint: `2px`;
- InfoHint → controle trailing: `4px`;
- label → controle trailing sem InfoHint: `4px`;
- `inline-flex`, `align-items: center`, `white-space: nowrap` e slots de
  glyph/controle sem shrink;
- sem `justify-between`, `flex-grow`, posicionamento absoluto ou offsets
  negativos por consumidor;
- somente a mesa pode resolver compressão com largura mínima/scroll
  horizontal; o cluster nunca invade a coluna vizinha.

O trigger padrão do `InfoHint` mantém um glyph visual compacto e uma área
interativa maior centralizada no primitive, sem ampliar o afastamento percebido
entre o texto e o glyph. Em botões de processo, o ícone funcional permanece
com o espaçamento normal do botão e o `InfoHint` fica anexado ao label dentro do
`InlineLabelCluster`. O `InfoHint` envolve o botão de ação existente como
trigger customizado, enquanto o glyph compartilhado ocupa o slot `info`,
preservando a ação original sem criar nested button.

A implementação foi aplicada aos cabeçalhos e ações compartilhados do
Minerador e da Descoberta; a ordenação, handlers e conteúdo dos InfoHints não
foram alterados.

### 9.3 Ajuda contextual por área

O padrão **Contextual Help Drawer** é a camada de ajuda complementar da
`GlobalTopbar` para as áreas operacionais tenantizadas. Ele não substitui o
`InfoHint`: o InfoHint explica um controle em poucas palavras; o drawer reúne
busca, tópicos e detalhe da área atual.

Contrato visual e comportamental:

- trigger compacto de `CircleHelp` ao lado do sino, com `InfoHint` e nome
  acessível `Ajuda desta área`;
- drawer fixo à direita, sem reflow, com `max-w-sm` no desktop e largura total
  em viewport estreita;
- superfície `surface-elevated`, borda `divider`, texto `foreground` e foco
  `context-accent`, sem nova paleta ou cards decorativos;
- cabeçalho `Ajuda — <área>`, fechar, busca local, lista de tópicos e detalhe
  com retorno à lista;
- busca somente nos tópicos carregados, normalizando acentos, maiúsculas e
  espaços;
- Escape, fechamento explícito, foco visível e retorno de foco ao trigger;
- ausência de conteúdo exibida explicitamente, sem fallback para outra área;
- conteúdo estático e versionado, de propriedade do módulo, sem HTML remoto,
  IA, links, CTA, formulário ou chamada externa;
- disponível em Marca, Minerador, Arquiteto, Radar, Planejador, Redator e
  Publicações; fora de Admin, Conta/Perfil, autenticação, seleção de contexto,
  agência e rotas públicas.

O contrato detalhado está em
[Contrato de ajuda contextual](contrato-ajuda-contextual.md). A implementação
incremental deve validar 360, 768, 1024 e 1440px em light/dark mode, além de
hover, foco, Escape, busca, detalhe e mudança de área.

## 10. Espaçamento e radius

Escala preferencial de espaçamento:

- 4px;
- 8px;
- 12px;
- 16px;
- 24px;
- 32px;
- 48px.

Radius permitidos:

- 6px;
- 10px;
- 14px;
- pill somente quando semanticamente necessário.

Evitar valores arbitrários sem justificativa de layout.

## 11. Badges e estados

Badges devem representar estados reais e não ser usados apenas como decoração. A semântica deve ser consistente para aprovado, aguardando aprovação, conflito, erro, sucesso, publicado, bloqueado, simulado, local e remoto.

Não depender apenas de cor para comunicar estado: combinar texto, ícone, posição ou outro sinal acessível.

## 12. Responsividade

Validar pelo menos 360px, 768px, 1024px e 1440px.

Em telas menores:

- preservar tamanho legível;
- empilhar quando necessário;
- evitar scroll horizontal fora das planilhas;
- manter ações acessíveis;
- reduzir decoração antes de reduzir texto.

## 13. Movimento

Usar animação somente quando ajudar a compreender abertura, mudança de estado, feedback ou navegação. Respeitar `prefers-reduced-motion`. Não usar animação apenas como decoração.

## 14. Padrões proibidos

São proibidos ou exigem decisão explícita:

- fontes pequenas para informações importantes;
- botões com baixa legibilidade;
- cores hardcoded espalhadas;
- novos gradientes aleatórios;
- glassmorphism;
- neon;
- glow;
- excesso de cards;
- excesso de sombras;
- vários radius concorrentes;
- mistura de bibliotecas de ícones;
- redesign fora do escopo;
- linguagem visual exclusiva para um módulo.

## 15. Checklist obrigatório

Antes de concluir uma tarefa frontend:

- verificar tipografia;
- verificar dark mode;
- verificar contraste confortável;
- verificar botões;
- verificar estados;
- verificar responsividade;
- verificar reutilização de componentes;
- verificar cores hardcoded;
- verificar que não houve redesign fora do escopo;
- realizar validação manual orientada.

Qualquer exceção visual deve ser registrada na documentação da tarefa, com justificativa e limite de escopo.

## 16. Fundação global: alvo e estado atual

O contrato abaixo é o destino compartilhado da plataforma. `TARGET APPROVED`
significa que a regra está aprovada para planejamento; não significa que o
componente já exista.

| Área | `TARGET APPROVED` | `CURRENTLY IMPLEMENTED` |
| --- | --- | --- |
| Tokens e paleta | paleta oficial e tokens semânticos únicos | implementado: `app/globals.css` possui a paleta completa, derivados por `color-mix` e `@theme inline` |
| Ausência de roxo | zero ocorrência em todo o frontend ativo | implementado: 34 linhas convertidas para tokens; guard bloqueia reintrodução |
| Topbar | `GlobalTopbar` integrado ao `ProductShell` | implementado: `components/global-topbar.tsx`, 40px, slots registráveis de página e de módulo |
| Notices | `publishNotice()` → `GlobalNoticeCenter` → toast e sino | implementado: `components/global-notice-center.tsx` e `lib/visual-notice-contract.ts`; módulos legados ainda mantêm notices locais |
| Perfil | avatar 28×28 com popover de conta | implementado no `GlobalTopbar` |
| Sidebar | preservada, sem redesign nesta fase | existente no `ProductShell`, colapsável com preferência persistida por cookie |
| Planilhas | Operational Grid único, com painel de detalhe em bento numerado | referência implementada no Minerador; adoção nos demais módulos em andamento |
| Guard visual | falha em cor proibida, valor bruto, classe inválida e fonte < 12px | implementado: `scripts/check-visual-system.mjs` varre `app/`, `components/` e `modules/` com baseline que só pode diminuir |
| Light mode | tema completo com toggle | **não implementado**: os tokens existem em `app/globals.css`, mas nada escreve `data-theme` e não há `prefers-color-scheme`. Decisão pendente: implementar o toggle ou remover o bloco |

## 17. Contrato de temas

### Dark mode

O dark mode usa `background = #131413`, `foreground = #f3f4f6` e
`divider-dark = #212121`. Hover, seleção, foco e disabled devem derivar dos
tokens oficiais, sem criar tonalidades independentes. A validação deve cobrir
contraste, legibilidade, foco perceptível e distinção entre superfície,
superfície elevada e canvas.

`foreground` não é cor de borda. `divider-light` **não deve ser usado no dark**
para estrutura, hover ou focus: visualmente vira branco e cria a linha forte
que o princípio de estrutura neutra proíbe. Hover e focus no dark usam
`module-accent` em baixa intensidade, conforme a seção 7.

### Light mode

Se o produto oferecer light mode, o background deve derivar de `#f3f4f6`, o
foreground deve ser `#131413` e os divisores devem usar `divider-light =
#d1d1d1`. Os acentos permanecem os mesmos; não se cria uma segunda paleta de
marca.

**Estado atual: o light mode não está implementado.** O bloco `[data-theme="light"]`
existe em `app/globals.css`, mas nenhum código escreve `data-theme` ou a classe
`.light` no `<html>`, e não há `@media (prefers-color-scheme)`. O único leitor é
`modules/arquiteto/arquiteto-workbench.tsx`, que sempre resolve para `dark`.

Isso é ambiguidade aberta e precisa de decisão explícita: implementar o toggle
(persistido junto da preferência de shell) ou remover o bloco. Enquanto não for
decidido, nenhuma tarefa deve afirmar "validado em light mode" — não há light
mode para validar.

Scrollbars, bordas, focus, selected e disabled pertencem ao mesmo contrato de
tokens. Um módulo não pode definir essas cores de forma independente.

A barra de rolagem vertical encosta na borda direita da tela: não se reserva
`scrollbar-gutter` nem padding ao lado dela. Cada tela tem uma única barra
vertical; área operacional com rolagem própria usa `h-[calc(100vh-2.5rem)]`
com `overflow-hidden`, descontando a `GlobalTopbar`, e nunca `h-screen`.

## 18. GlobalTopbar — arquitetura alvo

A arquitetura aprovada é:

```text
ProductShell
├── Sidebar
├── GlobalTopbar
└── Workspace
```

`GlobalTopbar` terá altura fixa de 40px, será persistente durante a navegação
normal e não deverá desmontar por troca comum de módulo. A integração futura
fica limitada à topbar; a Sidebar existente não está autorizada para
redesign.

Slots canônicos:

- **left:** título de página/área em `context-accent`; em `PAGE MODE`, título e
  abas; em `MODULE MODE`, título, voltar, avançar, histórico e pesquisa
  responsiva com largura máxima aproximada de 60ch;
- **center:** ações e ferramentas específicas do módulo, sem permitir que o
  módulo controle a estrutura global;
- **right:** `NotificationBell` e avatar/perfil; o avatar mantém o acesso à
  rota `/conta`.

Esta é uma arquitetura alvo. Não há `GlobalTopbar` implementado ou validado
no checkout atual.

## 19. GlobalNoticeCenter — contrato alvo

O fluxo compartilhado será:

```text
módulo → publishNotice() → GlobalNoticeCenter
       → toast imediato → NotificationBell / avisos recentes
```

Toast e sino representam o mesmo evento. Não devem existir dois sistemas
independentes de aviso para uma mesma operação. O contrato conceitual é:

```ts
publishNotice({
  severity,
  title,
  message,
  details?,
  copyPayload?,
  source?,
})
```

As únicas severidades são `SUCCESS`, `INFO`, `PENDING`, `WARNING` e `ERROR`.
O módulo escolhe a severidade; não escolhe a cor. `SUCCESS` só aparece depois
de persistência ou validação realmente confirmada.

### Retenção e diagnóstico

Na primeira fase, avisos operacionais permanecem apenas em memória/sessão:

```text
NOTICE_RETENTION_MS = 120000
```

O toast dura poucos segundos; o sino mantém o aviso recente até o TTL. Não
fazem parte deste escopo Supabase, banco, polling, websocket ou histórico
persistente. Notificação persistente será um sistema futuro separado.

Diagnósticos podem oferecer copiar, ver detalhes e fechar. O payload copiado
deve excluir tokens, cookies, secrets, credenciais, headers sensíveis,
`service_role` e dados privados desnecessários.

`GlobalNoticeCenter`, `publishNotice` e `NotificationBell` não foram
encontrados como implementação canônica no estado auditado; sua criação é
fase futura.

## 20. Planilhas

Nesta fundação, planilhas e grids somente herdam background, foreground,
bordas, scrollbars, seleção, foco, estados e notices. Não haverá redesenho de
grid, mudança de densidade estrutural ou alteração de contrato de dados. A
padronização estrutural das planilhas é uma tarefa sucessora.

## 21. Sequência futura e guard automatizado

Não será feito big-bang. A sequência planejada é:

1. consolidar tokens globais;
2. implementar e validar `GlobalTopbar`;
3. implementar e validar `GlobalNoticeCenter`;
4. inventariar topbars atuais;
5. inventariar notices atuais;
6. migrar gradualmente cada área, preservando consumidores;
7. remover duplicações somente após regressões e smoke manual;
8. tratar planilhas em etapa sucessora.

O guard existe e está ativo: `scripts/check-visual-system.mjs`, executado por
`pnpm run check:visual-system`.

Comportamento:

- varre `app/`, `components/` e `modules/` (`.tsx`, `.ts`, `.css`);
- **roxo é sempre fatal**, em qualquer arquivo, inclusive `app/globals.css` —
  detectado por nome e por matiz do hex, e nunca aceito no baseline;
- valor bruto, classe Tailwind crua, tom inexistente e fonte abaixo de 12px
  entram em `scripts/visual-system-baseline.json`, que só pode diminuir: se a
  dívida de um arquivo aumenta, o guard falha;
- `--strict` exige zero dívida (estado-alvo);
- `--update-baseline` trava um ganho depois de uma limpeza;
- `--files a b c` verifica arquivos específicos em modo estrito.

Assets e logos externos de terceiros continuam classificados manualmente antes
de qualquer automação.

## 22. Registro estrutural e governança

O registro estrutural mínimo está em [SDD — fundação visual global](sdd-fundacao-visual-global.md).
Ele descreve alvo, escopo, migração gradual, gates, riscos e rollback visual.
Esta implementação permanece limitada ao contrato Inline Label / Affordance
Cluster e aos consumidores mapeados acima; não reabre a fundação visual
global nem autoriza mudança de shell.

Não foi criado ADR novo: não há ADR visual aceito no conjunto auditado que
precise ser duplicado, e a decisão compartilhada fica registrada neste
documento canônico e na SDD específica. Caso a implementação altere uma
invariante arquitetônica posteriormente, a necessidade de ADR deverá ser
reavaliada antes do código.

## 23. Aceite documental

```text
GLOBAL_VISUAL_FOUNDATION_PLANNED = YES
OFFICIAL_COLOR_CONTRACT = PALETTE_AND_SEMANTIC_TOKENS_DEFINED
STATUS_COLOR_CONTRACT = SUCCESS_INFO_PENDING_WARNING_ERROR_DEFINED
PURPLE_VIOLET_INDIGO_LILAC_BAN = PLANNED_AS_ACTIVE_FRONTEND_GUARD
DARK_MODE_CONTRACT = DEFINED
LIGHT_MODE_CONTRACT = DEFINED_AS_OPTIONAL_TARGET
GLOBAL_TOPBAR_TARGET = DEFINED_NOT_IMPLEMENTED
GLOBAL_NOTICE_CENTER_TARGET = DEFINED_NOT_IMPLEMENTED
NOTICE_RETENTION = 120000_MS_MEMORY_OR_SESSION_ONLY
PERSISTENT_NOTIFICATION_SCOPE = OUT_OF_SCOPE_FUTURE_SYSTEM
SPREADSHEET_STANDARDIZATION = SUCCESSOR_TASK
IMPLEMENTATION_STATUS = PARTIAL_INCREMENTAL; INLINE_LABEL_CLUSTER = IMPLEMENTED
ADR_DECISION = NOT_CREATED_NON_REDUNDANT
SDD_DECISION = MINIMAL_SDD_CREATED_FOR_PLANNING
CODE_CHANGED = INLINE_LABEL_CLUSTER_AND_MAPPED_CONSUMERS
SHELL_CHANGED = NO
MODULES_CHANGED = MINERADOR_CONSUMERS_ONLY
REMOTE_OPERATION = NONE
```

## 24. Atualização operacional — Notification Center global — 2026-08-18

Esta seção atualiza o snapshot de planejamento da seção 23 para o estado
operacional abaixo.

O alvo documental acima foi implementado de forma incremental, sem redesenhar
o shell compartilhado:

- `GlobalNoticeProvider` permanece acima das páginas no `app/layout.tsx` e
  mantém históricos independentes por escopo durante a sessão SPA. O escopo
  usa o módulo da rota e, quando aplicável, o `brandId` ou `agencyId` canônico;
  slugs não participam do isolamento.
- `NotificationBell` abre e fecha o painel ancorado, permite reabertura,
  fechamento por clique externo e `Escape`, restaura foco e expõe estados de
  não lido/lido. Avisos novos abrem o painel em preview curto e o fechamento
  automático não remove o registro; interação ativa interrompe o timer.
- `publishNotice` é a ponte compartilhada entre feedback operacional e o
  histórico; o painel é a superfície padrão dos avisos. Toast externo só é
  emitido por solicitação explícita (`showToast`), e nenhum produtor atual o
  solicita.
- A retenção permanece em memória durante a sessão SPA, sem expiração
  arbitrária. Fechar o painel ou marcar como lido não remove o aviso; reload,
  logout e novo login iniciam estado limpo. Não há persistência após F5/login,
  tabela, migration, polling ou websocket nesta etapa.
- Bridges aditivos foram conectados aos avisos existentes de Minerador,
  Arquiteto, Radar, Marca, Planejador, Publicações, Conta e Admin. Os
  contratos locais continuam válidos onde a mensagem inline ainda é útil.
- Testes automatizados visuais passaram; a validação manual autenticada foi
  concluída em Minerador, Arquiteto e Radar. O painel ficou ancorado ao sino,
  contido no viewport, com scroll interno, conteúdo visível, auto-open/preview
  e isolamento ao navegar entre áreas.
- Correção incremental da regressão do perfil: o slot direito da GlobalTopbar
  não recorta mais o popover local do avatar; a área de ações do Minerador
  mantém seu clipping próprio. A validação autenticada confirmou abertura,
  fechamento externo, `Escape`, reabertura e interação independente com o sino
  em Minerador, Radar e Marca, no dark mode.
