# Contrato compartilhado — InfoHint

**Status:** implementado localmente e disponível para reutilização gradual.<br>
**Módulo proprietário:** Interface / sistema visual compartilhado da Plataforma.

## Objetivo

`InfoHint` é o primitive canônico para explicações contextuais curtas sobre
botões, campos, métricas, status, ferramentas e conceitos da interface. Ele
evita que cada módulo crie seu próprio tooltip.

Informação essencial para concluir uma tarefa deve continuar visível na tela;
ela não pode existir exclusivamente dentro do `InfoHint`.

## Escopo e semântica

O componente usa `@radix-ui/react-tooltip` e abre por hover ou foco de teclado.
O conteúdo é uma pequena superfície informativa, sem interação interna. O
Radix fornece abertura/fechamento acessíveis, `Escape`, navegação por `Tab` e
reposicionamento por colisão com o viewport.

O Provider é único no `ProductShell`, com `delayDuration = 300ms` e
`skipDelayDuration = 150ms`. Consumidores não criam Provider próprio.

## API pública

```tsx
type InfoHintProps = {
  title?: string;
  description: string;
  children?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};
```

- `description` é obrigatória e curta.
- `title` é opcional.
- Sem `children`, o componente renderiza o trigger padrão com ícone de
  informação e nome acessível.
- Com `children`, deve ser fornecido um único elemento interativo compatível
  com `Tooltip.Trigger asChild`. O controle original permanece sendo o
  trigger; seu clique e seus handlers continuam intactos.
- `side` e `align` orientam o posicionamento. O componente centraliza largura,
  cores, radius, sombra e delay; não há customização visual arbitrária por
  instância.
- Em botões de processo, o `InfoHint` explícito já existente envolve o botão
  como trigger customizado; o glyph compartilhado pode ocupar o slot `info` do
  `InlineLabelCluster`. Isso mantém hover, foco, Escape e a área interativa,
  sem criar nested button nem substituir a ação original.

## Conteúdo permitido e proibido

Permitido:

- título curto;
- descrição objetiva em poucas linhas;
- orientação contextual que não seja necessária para descobrir a ação.

Proibido no `InfoHint`:

- links;
- botões, CTA ou outras ações;
- formulários;
- imagens;
- documentação extensa;
- conteúdo que exija interação ou seleção.

Para conteúdo interativo, usar um contrato futuro de `InfoPopover` ou outro
padrão apropriado. Não aumentar o `InfoHint` para acomodar esse caso.

## Acessibilidade e comportamento

- O trigger padrão é um `button type="button"`, com `aria-label`, foco visível
  e área clicável mínima adequada.
- O trigger customizado usa `asChild`, portanto não cria um botão dentro de um
  botão e preserva a ação do controle existente.
- O conteúdo pode ser aberto com mouse e teclado, fecha com `Escape` e não
  bloqueia a interação normal da tela.
- A informação não depende exclusivamente de hover e estados não são
  comunicados apenas por cor.
- O componente deve funcionar em bordas do viewport e em larguras estreitas.

## Regras visuais

O primitive segue o `sistema-visual.md` e a Quiet UI da Plataforma:

- superfície elevada neutra;
- borda discreta;
- texto mínimo de interface de 14px;
- o amarelo canônico `pending` identifica o ícone próprio, o título, a seta e os estados hover/foco do trigger;
- o corpo permanece neutro/off-white e nunca usa fundo amarelo ou semântica de warning;
- corpo e título usam 14px, com line-height aproximado de 1.4–1.5;
- largura máxima aproximada de 320px, limitada pelo viewport;
- nenhuma cor, sombra, radius ou gradiente hardcoded no componente.

Quando o trigger padrão aparece ao lado de um label ou de um controle de
ordenação, ele deve ser composto por `InlineLabelCluster`. O glyph ocupa o
slot visual compacto e a área interativa adicional permanece no primitive;
consumidores não devem compensar o trigger com margem negativa ou `gap`
próprio. Os tokens canônicos são `--ui-label-info-gap` (2px) e
`--ui-label-control-gap` (4px).

Em botões de processo, o ícone funcional permanece no botão com seu gap
normal, e o label com o `InfoHint` explícito ocupa o `InlineLabelCluster`
seguinte. Não adicionar novos glyphs nem mover o `InfoHint` para a extremidade
do botão.

## InfoHint x Popover

`InfoHint` é uma explicação curta, sem interação interna e sem responsabilidade
de executar ações. `Popover` é apropriado para conteúdo maior ou interativo,
como filtros, detalhes, links, formulários e ações. Não usar `InfoHint` como
substituto de Popover nem criar um Popover dentro dele.

## Exemplos

Correto, com trigger padrão:

```tsx
<InfoHint title="Intenção" description="Mostra o objetivo provável do usuário nesta busca." />
```

Correto, envolvendo um controle já existente:

```tsx
<InfoHint description="Atualiza as métricas da keyword.">
  <button type="button" onClick={refresh}>Atualizar</button>
</InfoHint>
```

Incorreto:

```tsx
<InfoHint description="Saiba mais">
  <button type="button">Abrir documentação</button>
</InfoHint>
```

O último exemplo usa o `InfoHint` como CTA. Links, documentação e ações
devem permanecer fora deste primitive.
