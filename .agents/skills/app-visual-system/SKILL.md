---
name: app-visual-system
description: Sistema visual e de layout canônico do Minerador Key. Usar sempre que a tarefa criar, editar, refatorar ou revisar interface — páginas, telas, componentes, GlobalTopbar, sidebar, planilhas operacionais, tabelas, painéis de detalhe, cards, popovers, formulários, tipografia, cores, espaçamento, responsividade, dark mode, light mode, estados de interação. Também usar ao revisar PR de frontend ou ao investigar inconsistência visual. Não usar em tarefa exclusivamente de backend, API, banco ou provider.
---

# Sistema Visual — Minerador Key

## Regra 0 — proibição absoluta de roxo

**Roxo não pode existir em nenhuma parte da plataforma.**

Ficam proibidos, sem exceção e sem período de transição: `purple`, `violet`,
`indigo`, `fuchsia`, `lilac`, `lavender`, roxo, violeta, lilás e qualquer
equivalente azul-lilás — seja como classe Tailwind, hex, `rgb`, `hsl`, `oklch`,
nome de token, nome de variável ou comentário descrevendo intenção visual.

Isto não é dívida gradual. É bloqueio. O guard falha e a tarefa não conclui.

Se um valor roxo aparecer, substituir pelo token semântico correto conforme a
tabela de mapeamento em [references/color-contract.md](references/color-contract.md).
Único caso fora do escopo: logo/asset externo de terceiro (ex.: ícone oficial
do Google), que deve ser classificado explicitamente e nunca copiado para a
linguagem visual da plataforma.

## Princípio visual

> Estrutura neutra. Conteúdo legível. Destaque raro. Status semântico.
> Cor forte somente quando existe significado.

A interface não fica colorida porque existem cores disponíveis. Cor serve para
contexto, interação, prioridade, estado, alerta e seleção real. Cor não é
decoração.

## Fonte de verdade

Precedência, do mais forte para o mais fraco:

1. Esta skill.
2. `docs/compartilhado/sistema-visual.md` (documento canônico do produto).
3. Tokens e estilos globais em `app/globals.css`.
4. Componentes existentes em `components/` e `modules/`.
5. Referências auxiliares desta skill (`references/`).

Nunca criar um design system paralelo. Se o token ou componente já existe,
reutilizar. Divergência entre esta skill e um documento antigo resolve-se pela
skill; o documento deve ser corrigido na mesma tarefa.

## Paleta oficial

Estes são os únicos valores de cor da plataforma. Valores brutos existem
somente em `app/globals.css`; componentes consomem exclusivamente os nomes
semânticos.

| Token | Valor | Uso |
|---|---|---|
| `background` | `#131413` | fundo principal dark |
| `foreground` | `#f3f4f6` | texto principal |
| `action-accent` | `#193cb8` | ação principal, seleção forte |
| `context-accent` | `#12A1E0` | título de área, contexto, informação neutra |
| `module-accent` | `#10DDE0` | interação: hover, focus, tab ativa |
| `positive-soft` | `#63F1AF` | marcação positiva auxiliar |
| `highlight` | `#C8FF00` | fixação e destaque especial para reencontro |
| `success` | `#1fcb0a` | aprovado, publicado, concluído |
| `warning` | `#f79001` | atenção, risco, resultado parcial |
| `pending` | `#E6CE00` | revisão, aguardando, pendência humana |
| `danger` | `#A61E1E` | erro, bloqueio, falha, destrutivo |
| `keyword` | `#e0fbff` | **exclusivo da keyword**, em toda a plataforma |
| `divider-dark` | `#212121` | bordas e divisórias no dark |
| `divider-light` | `#d1d1d1` | bordas e divisórias no light |

### Papéis fixos: identidade e keyword

Três papéis editoriais têm cor obrigatória e não negociável:

| Papel | Classe | Valor | Onde |
|---|---|---|---|
| identidade **nova** | `text-identity-new` | `#10DDE0` | slug, link e canonical ainda **não** publicados |
| identidade **publicada** | `text-identity-published` | `#193cb8` | slug, link e canonical **só** quando o status é publicado |
| **keyword** | `text-keyword` | `#e0fbff` | **toda** keyword renderizada — planilha, card, painel, lista, detalhe |

Regras invioláveis:

- as duas cores de identidade **nunca** se trocam; `identity-published` exige
  status publicado — slug protegido por outro motivo continua `identity-new`;
- a keyword usa `#e0fbff` **sempre**, em qualquer módulo e qualquer estado.
  Selecionada, publicada, com conflito ou desativada, ela não muda de cor: o
  estado vai em badge, borda ou fundo;
- `#e0fbff` não pertence a mais nada na plataforma, e a keyword não usa nenhuma
  outra cor;
- nunca repetir o valor bruto num componente — só as classes acima;
- **não** é keyword: contagem (`3 keywords`), id (`principalKeywordId`), rótulo
  de coluna, nome de lista, texto de origem. O papel vale para o valor textual
  da keyword. Componente genérico recebe um `tone` opcional; não se pinta o
  componente inteiro.

Derivados disponíveis: `surface`, `surface-subtle`, `surface-elevated`, `text`,
`text-muted`, `border`, `focus`, `selected`, `success-soft`, `warning-soft`,
`pending-soft`, `danger-soft`.

### Separação obrigatória entre os três accents

Confundir os três é o erro mais comum do projeto:

- `action-accent` = **eu ajo**. Botão primário, seleção forte.
- `context-accent` = **eu informo**. Título da área, INFO, contexto, metadado
  de identidade.
- `module-accent` = **eu reajo ao ponteiro/teclado**. Hover, focus, ring, tab
  ativa, borda de input em interação.

`module-accent` não é identidade do módulo e não pinta conteúdo. É o feedback
de interação da plataforma inteira.

### Semântica obrigatória de status

| Status | Token | Significado |
|---|---|---|
| `INFO` | `context-accent` | informação neutra, contexto, orientação |
| `SUCCESS` | `success` | concluído, aprovado, publicado, persistido |
| `PENDING` | `pending` | revisão, espera, decisão humana, dado ausente |
| `WARNING` | `warning` | atenção, risco, parcial, degradado |
| `ERROR` / `DANGER` | `danger` | falha, erro, bloqueio, destruição |

`SUCCESS` só pode ser emitido após confirmação real da operação — readback
quando houver persistência. `positive-soft` é apoio visual, não sucesso.
`highlight` é fixação, não sucesso.

## Bordas e divisores

No dark, linhas estruturais usam `divider` (`divider-dark #212121`).

**`foreground` não é cor de borda.** `divider-light` não deve ser usado no dark
para estrutura ou focus — visualmente vira branco. Evitar linhas brancas,
cinza-claro sólido e contornos fortes atravessando a tela.

## Inputs, busca, textarea e selects

| Estado | Regra |
|---|---|
| normal | fundo neutro (`surface-subtle`), borda `divider`, sem glow |
| hover | `module-accent` 20–30% na borda, glow 10–20% |
| focus/active | `module-accent` 40–50% na borda, ring/glow até 20–30% |

Nunca no focus: branco, cinza-claro chamativo, azul principal forte, roxo,
glow neon. A cor nesses estados significa **interação**, não status.

## Scrollbars

Track transparente ou neutro, thumb discreto derivado dos tokens de divisor,
largura fina, sem branco, sem accent colorido. Hover/active aumentam o
contraste discretamente por alpha ou `color-mix`. Nenhum módulo cria scrollbar
própria — o contrato global já está em `app/globals.css`.

**A barra vertical encosta na borda direita da tela.** Não usar
`scrollbar-gutter: stable` nem padding reservado: uma faixa morta ao lado da
barra é regressão. Cada tela tem **uma única** barra vertical — se aparecerem
duas, há um `h-screen` aninhado dentro do `<main>` do `ProductShell`, que já
contém a `GlobalTopbar` de 40px. Área operacional com rolagem própria usa
`h-[calc(100vh-2.5rem)]` com `overflow-hidden`, nunca `h-screen`.

Superfície com navegação própria — canvas React Flow, mapa, viewport de zoom —
**não** rola: o container é o viewport (`h-full` + `overflow-hidden`) e quem
navega é pan/zoom. Dimensionar o conteúdo interno pela altura do grafo e rolar
por fora cria barra concorrente com o gesto do mapa. Quando a rolagem sai,
o enquadramento (`fitView` ou equivalente) passa a ser obrigatório em todos os
modos, senão o conteúdo fora da área visível fica sem caminho de acesso.

## Tipografia

Família única, definida pelos estilos globais (`--font-sans`, Geist). Não
introduzir fonte nova. Não usar monoespaçada fora de ID, hash e código.

| Uso | Tamanho | Peso |
|---|---|---|
| título principal da tela | ~24px | 600 |
| título de seção | 18–20px | 600 |
| título de painel | 16px | 600 |
| texto corrido | 15–16px, line-height 1.5–1.6 | 400 |
| interface, tabela, controles, botões | mínimo 14px | 400–500 |
| controles compactos da GlobalTopbar | 12px, line-height 20px | 500 |
| auxiliar (ID, data, contador, hash) | 12–13px | 400–500 |

**Piso absoluto: 12px.** Nada abaixo disso, em nenhuma superfície, incluindo
planilhas. Texto abaixo de 12px é regressão, não densidade.

Máximo de três pesos por tela. Não usar caixa alta em títulos longos — a caixa
alta é reservada ao título de área na GlobalTopbar e a labels curtos de seção.

## Espaçamento e radius

Escala: 4, 8, 12, 16, 24, 32, 48, 64px. Evitar valores arbitrários (13, 17, 22,
29, 37px) sem razão concreta de layout.

Radius: 6px (pequeno), 10px (padrão), 14px (grande), 999px (pill). Não
transformar todo retângulo em pill. Não misturar radius concorrentes na mesma
superfície.

Elementos relacionados ficam mais próximos entre si do que de grupos não
relacionados. Hierarquia fraca não se resolve adicionando cards.

## GlobalTopbar

Altura canônica **40px**. O cabeçalho superior da Sidebar também tem 40px e as
duas linhas inferiores devem ficar perfeitamente alinhadas.

O título da área vem **sempre primeiro**, em caixa alta e `context-accent`:
`MINERADOR`, `ARQUITETO`, `RADAR`, `MARCA`, `PUBLICAÇÕES`. Isso é apresentação
visual; nomes de entidades (`Adalba`, `AdalbaPro`, nomes de pessoas, títulos de
artigo) preservam a caixa original.

**Áreas operacionais** (Minerador, Arquiteto, Radar, Planejador, Redator,
Publicações):

```
TÍTULO → DESFAZER → REFAZER → HISTÓRICO → BUSCA → FERRAMENTAS DO MÓDULO → SINO → AVATAR
```

**Páginas** (Marca, Agência, Perfil, Admin):

```
TÍTULO → ABAS DA PÁGINA → AÇÕES DA PÁGINA → SINO → AVATAR
```

Não adicionar undo/redo/histórico a páginas só porque a topbar oferece esses
recursos em áreas operacionais.

Regras invioláveis:

- as setas curvas são **undo/redo internos do módulo**, nunca `router.back()`
  ou histórico do navegador;
- o relógio abre o **mesmo** histórico operacional do módulo;
- a busca consome o **mesmo estado e handler** já existentes no módulo, com
  largura visual de aproximadamente `50ch` em desktop (`50ch` é largura, não
  `maxLength`);
- não criar store paralelo, segundo undo/redo, segundo histórico ou segundo
  estado de busca só para a topbar;
- mover a superfície visual, não recriar a funcionalidade: handlers,
  permissões, loading, disabled e contratos permanecem os existentes.

A GlobalTopbar está **congelada** nesta fase salvo regressão comprovada ou
necessidade aprovada. Alterar estrutura da topbar exige decisão explícita.

### Absorção das barras locais

A GlobalTopbar absorve gradualmente a barra superior de cada área. A barra
local só é removida após paridade comprovada de undo, redo, histórico, busca e
ações. Nunca deixar barra vazia, título duplicado, espaço morto, borda órfã,
segunda busca ou segundo histórico.

Toolbars de segunda camada continuam locais quando pertencem ao conteúdo — por
exemplo a toolbar de formatação do Redator (`H1`, `H2`, `B`, `I`, listas,
alinhamento, link, imagem). A GlobalTopbar cuida do topo operacional; a toolbar
de formatação cuida do documento.

## Tabs

Mesma altura, mesma tipografia, mesmo radius, mesmo padding, posição estável ao
trocar de tela. Referência: `Descobrir Keywords` / `Processar Keywords` no
Minerador, imediatamente antes de sino e avatar.

Normal: neutro. Hover: `module-accent` discreto, glow leve permitido. Ativa:
`module-accent` moderado. Evitar hover cinza genérico.

Reutilizar `GLOBAL_TOPBAR_PAGE_TAB`, `GLOBAL_TOPBAR_PAGE_TAB_ACTIVE` e
`GLOBAL_TOPBAR_PAGE_TABS` de `components/global-topbar-control.ts`.

## Sino e avisos

O sino fica ao lado do avatar. Nesta fase representa avisos operacionais
recentes da sessão. O mesmo evento alimenta o toast imediato e o painel do
sino. Retenção de sessão ~120s; toast ~4,5s. Sem persistência em banco agora.

Severidades usam os tokens da tabela de status. `SUCCESS` só após sucesso real.

## Avatar

Na topbar aparece somente o avatar circular, **28×28px**. Nome e e-mail não
ficam permanentemente na barra. Ao clicar, abre popover com avatar, nome,
e-mail, papel, Perfil e Sair.

## Cards, popovers e notices

Referência visual: o popover aprovado do avatar. Superfície neutra, borda
discreta, radius consistente, sombra leve, texto principal claro, texto
secundário suave.

Não pintar o card inteiro de verde, amarelo ou vermelho. A cor semântica entra
em ícone, badge, indicador, label de status, pequeno detalhe ou ação principal.

Sombra somente em elementos flutuantes (menu, popover, diálogo, drawer). Card
de página usa superfície e borda, não sombra pesada.

## Planilhas e painéis de detalhe

A superfície operacional densa é o **Operational Grid**, e o padrão visual e
comportamental está em
[references/operational-grid-layout.md](references/operational-grid-layout.md).

Toda planilha nova ou tocada deve seguir aquele contrato — grade, cabeçalho,
seleção, ordenação, linha expansível e painel de detalhe em bento numerado.
Não criar um novo estilo de tabela por módulo.

## Ajuda contextual e clusters de label

`InfoHint` é o padrão global para ajuda curta. Não criar tooltip próprio por
módulo. Para conteúdo com links, ações ou texto longo, usar o padrão
Contextual Help Drawer da área operacional.

Para labels, cabeçalhos de tabela, ordenação e affordances trailing, aplicar o
contrato de [references/inline-label-clusters.md](references/inline-label-clusters.md)
— `InlineLabelCluster`, label + InfoHint em 2px, InfoHint + controle em 4px,
label + controle sem InfoHint em 4px, inline e atômico.

## Estados obrigatórios

Todo componente interativo suporta: default, hover, focus-visible, active,
disabled, loading, erro/inválido e selected quando aplicável. Foco sempre
visível — não remover outline sem substituto usável.

Estados de persistência devem ser distinguíveis: não salvo, salvando,
salvo/readback, conflito, erro, aguardando revisão, aprovado. Não depender só
de cor: combinar texto, ícone ou posição.

## Responsividade

Validar 360px, 768px, 1024px e 1440px. Em telas menores: preservar tamanho
legível, empilhar quando necessário, evitar scroll horizontal fora das
planilhas, manter ações alcançáveis, reduzir decoração antes de reduzir texto.

Mobile é comportamento desenhado, não desktop encolhido.

## Movimento

Animação só quando ajuda a compreender abertura, mudança de estado, feedback ou
navegação. Durações: 120ms feedback rápido, 180ms interação normal, 220ms
entrada/saída de overlay. `ease-out` para entrada, `ease-in` para saída.
Respeitar `prefers-reduced-motion`.

## Padrões proibidos

- roxo em qualquer forma (Regra 0);
- hex, `rgb`, `hsl`, `oklch` fora de `app/globals.css`;
- classes de cor Tailwind cruas (`slate-*`, `emerald-*`, `sky-*`, `white`,
  `black`…) em componentes;
- classes de cor inexistentes (ex.: `slate-850`), que silenciosamente não
  renderizam nada;
- fonte abaixo de 12px;
- gradientes aleatórios, glassmorphism, neon, glow;
- sombra em todo card;
- múltiplos radius concorrentes;
- mistura de bibliotecas de ícones — usar `lucide-react`;
- placeholder no lugar de label visível;
- card dentro de card dentro de card;
- linguagem visual exclusiva de um módulo;
- redesign fora do escopo da tarefa.

## Front-First

Ordem obrigatória de toda mudança visual:

```
experiência → frontend → teste → validação manual → contratos existentes → backend mínimo → banco só por impossibilidade comprovada
```

Nenhuma migration é criada porque "talvez a interface precise".

## Gate de implementação

Para layout, **teste automatizado não é aprovação visual**:

```
código → DOM/render real → screenshot → validação manual → aprovação
```

Só depois o padrão é propagado para o próximo módulo.

## Fluxo da tarefa

Antes de escrever frontend:

1. Ler esta skill e `docs/compartilhado/sistema-visual.md`.
2. Inspecionar os tokens em `app/globals.css`.
3. Procurar componente equivalente em `components/` e `modules/`.
4. Decidir: componente novo ou apenas composição? Preferir composição.
5. Definir o comportamento em dark e, quando aplicável, light.

Durante:

1. Consumir tokens semânticos; nunca escolher cor no componente.
2. Reutilizar componentes; usar variantes em vez de copiar e alterar.
3. Manter tipografia, espaçamento e radius da escala.
4. Implementar todos os estados relevantes.
5. Preservar comportamento responsivo.

Depois:

1. `pnpm lint`
2. `pnpm run check:visual-system`
3. `pnpm run test:visual-system`
4. Revisar em dark mode e, se existir, light mode.
5. Revisar em 360, 768, 1024 e 1440px.
6. Revisar hover, focus, active, disabled, loading e erro.
7. Screenshot e validação manual (o gate acima).

## Relatório final

Ao concluir, reportar: componentes reutilizados, componentes criados, tokens
reutilizados, tokens adicionados ou alterados, validação em dark, validação em
light, larguras verificadas, comandos executados e qualquer exceção visual
com justificativa e limite de escopo.
