# Operational Grid — layout canônico das planilhas

Referência visual e comportamental de **toda** superfície densa da plataforma:
Minerador, Arquiteto, Radar, Planejador, Publicações e qualquer lista
operacional futura.

A implementação de referência é **Minerador → Processar Keywords**, com a linha
expandida abrindo o **Perfil da Keyword**. Essa tela é o padrão aprovado. Não
existe um segundo estilo de tabela na plataforma.

O nome conceitual é `Operational Grid` — não `KeywordTable`. Keywords são
apenas um dos domínios.

## 1. Estrutura da tela

```
GlobalTopbar (40px)
└── área operacional (largura total, sem card externo)
    ├── cabeçalho da grade   ← sticky
    ├── linhas
    │   └── linha expandida → ExpandedDetailSlot (painel de detalhe)
    └── barra de ações em lote  ← fixa ao viewport quando há seleção
```

A grade ocupa a largura total da área operacional. Não envolver a planilha em
card, painel decorativo ou container com margem lateral.

Não criar scroll vertical interno adicional quando o workspace já tem rolagem
principal. Scroll horizontal é progressivo e pertence à grade.

## 2. Cabeçalho da grade

- `sticky` no topo da área de rolagem, acima das linhas;
- fundo `surface-subtle`, borda inferior `divider`;
- label da coluna em `text-muted`, peso 500, mínimo 12px;
- affordance de ordenação imediatamente após o label, dentro do
  `InlineLabelCluster` (label + InfoHint 2px, InfoHint + controle 4px);
- coluna de índice `#` e checkbox de seleção fixas à esquerda (`sticky`), com o
  mesmo fundo do cabeçalho para não vazar conteúdo por baixo;
- redimensionamento de coluna por handle na borda direita, com hover em
  `module-accent` discreto.

Nunca usar `justify-between` ou `flex-grow` para posicionar a affordance de
ordenação — o cluster é inline e atômico.

## 3. Linhas

- densidade controlada: a linha respira, mas cabe muita informação;
- altura de linha redimensionável;
- handle explícito de reorder à esquerda (`GripVertical`), separado do checkbox;
- primeira coluna de conteúdo carrega o identificador do domínio (a
  palavra-chave, o título do artigo) e é o alvo de expansão;
- o chevron de expansão fica antes do identificador, não no fim da linha;
- linha expandida marca o identificador em `module-accent` e a linha inteira
  recebe `bg-selected`;
- seleção nativa de texto e cópia continuam funcionando;
- hover, focus, selected e a linha ativa são estados distintos e simultâneos.

### Gestos de seleção

- checkbox individual;
- `Ctrl`/`Cmd` adiciona ou remove item;
- `Shift` seleciona intervalo;
- painting selection (arrastar) seleciona ou desseleciona continuamente;
- checkbox do cabeçalho alterna os itens visíveis.

Não criar gestos concorrentes para a mesma superfície.

## 4. Badges na linha

Badge é estado real, não decoração. Geometria única:

```
inline-flex items-center rounded border px-1.5 py-0.5 text-[12px] font-medium leading-none
```

Tom pelo significado, nunca pelo módulo:

| Significado | Classe |
|---|---|
| neutro / livre / sem vínculo | `border-divider bg-surface-subtle text-text-muted` |
| informação, em contexto | `border-context-accent/40 bg-context-accent/10 text-context-accent` |
| concluído, elegível, aprovado | `border-success/35 bg-success-soft text-success` |
| aguardando, revisão, decisão humana | `border-pending/40 bg-pending-soft text-pending` |
| atenção, parcial, degradado | `border-warning/40 bg-warning-soft text-warning` |
| falha, bloqueio, reprovado | `border-danger/45 bg-danger-soft text-danger` |

O badge nunca pinta a célula inteira nem a linha inteira.

## 5. Painel de detalhe da linha expandida

O `ExpandedDetailSlot` abre **dentro da grade**, ancorado à linha, ocupando a
largura total. Não é modal, não é drawer, não é nova rota.

### Marcação da linha aberta (obrigatória)

A linha aberta e o painel dela formam um bloco visual contínuo, identificado
por uma faixa vertical de `module-accent` na borda esquerda:

```
linha aberta →  border-l-2 border-l-module-accent  + fundo destacado
painel        →  border-l-2 border-l-module-accent  no próprio <td> do detalhe
```

A faixa fica no `<td>` do painel, **não** numa `<section>` interna: dentro do
padding ela descola da linha e quebra a continuidade. Usar o accent cheio, sem
alpha — meia opacidade some no dark. Referência implementada: Minerador →
Processar Keywords.

Quando a linha também puder estar selecionada ou protegida, a precedência é
protegida (`danger`) → selecionada (`bg-selected`) → aberta (`module-accent`),
e a faixa esquerda é o que distingue aberta de selecionada.

### Cabeçalho do painel

```
LABEL DA ENTIDADE (caixa alta, 12px, tracking largo, context-accent) + InfoHint
Identificador em tamanho de título de seção (18–20px, peso 600, foreground)
Badges de estado à direita do identificador
```

O label em caixa alta identifica o **tipo** (`PERFIL DA KEYWORD`); o
identificador preserva a caixa original do dado (`marketing online`).

### Corpo em bento numerado

O corpo é uma malha de seções numeradas, não uma pilha de cards decorativos:

```
grid gap-3 lg:grid-cols-2   (ou lg:grid-cols-3 quando o conteúdo comporta)
```

Cada seção (`ProfileBento` em `components/editorial/dna-panels.tsx`):

```
section  → rounded-md border border-divider bg-surface-subtle p-2.5
header   → número (12px, bold, uppercase, tracking-[0.16em], context-accent)
         + título (16px, 600, foreground)
         + slot de status à direita
corpo    → mt-1.5
```

O número é sequencial e estável (`1 LEITURA LÓGICA`, `2 GOOGLE ADS`). Ele é a
âncora de leitura e de conversa entre time e suporte — não reordenar sem
decisão.

**Não aninhar bento dentro de bento.** Subdivisão dentro de uma seção usa
espaçamento e um título de 14px, não uma nova borda.

### Pares label/valor

Duas apresentações, ambas em `<dl>`:

- **stacked** — label acima, valor abaixo, separador `border-divider/70` entre
  os pares. Para blocos de leitura corrida.
- **rows** — grade `grid-cols-[8rem_minmax(0,1fr)]` (ou `6rem` na variante
  compacta), label e valor alinhados por baseline. Para fatos densos.

Regras:

- label: 14px, peso 500, `text-muted`;
- valor: 14px, `foreground`, `break-words` e `[overflow-wrap:anywhere]`;
- valor numérico de destaque pode subir para 16px, peso 600;
- **valor essencial nunca em `text-muted`** — muted é para o label, não para o
  dado;
- campo sem valor significativo não é renderizado — não imprimir `—` em massa;
- `font-mono` só em ID, hash e slug.

### Blocos de leitura vs. blocos de decisão

Seções de fato medido são **somente leitura** e devem declarar isso no próprio
título (`FATOS MEDIDOS · somente leitura`). Seções que aceitam ação humana
mostram os controles agrupados no fim da seção, nunca dispersos entre os
valores.

### Progresso de etapas

Quando a entidade tem pipeline, a régua de etapas fica no cabeçalho do painel,
alinhada à direita, como sequência de badges com o mesmo contrato de tom acima:
concluída `success`, em espera `pending`, executando `context-accent`, falha
`danger`, desatualizada `pending` com affordance de atualizar.

## 6. Estado vazio

O estado vazio vive **dentro da área da grade**, com o cabeçalho preservado.
Não substituir a tela inteira por ilustração. Conteúdo: uma frase do que
falta e a ação que resolve.

## 7. Barra de ações em lote

Aparece somente quando há seleção. Fixa ao viewport, largura da área
operacional, fundo `surface-elevated`, borda `divider`. Mostra a contagem, as
ações de lote e uma ação explícita de limpar seleção. Ações destrutivas usam
`danger` e exigem confirmação.

## 8. Divisão de responsabilidade

O shell compartilhado não interpreta regra editorial. O domínio fornece:
definição das colunas, dados, id estável da linha, renderer do detalhe, ações
de lote, permissões já resolvidas, mapeamento de status e handlers.

Permanecem do domínio: `KeywordDNA`, KGR e decisão KGR, principal/secundária/
reforço, nicho, funil, silo (Minerador); `ArticleDNA` e arquitetura (Arquiteto);
evidências (Radar); `ContentPlan` (Planejador); `PublicationRecord`
(Publicações).

## 9. Linguagem visível

Nome técnico canônico ≠ label exibido. A UI usa linguagem curta e compreensível
sem renomear contratos internos:

| Técnico | Exibido |
|---|---|
| `BrandDNA` | Identidade da marca |
| `KeywordDNA` | Perfil da keyword |
| `ArticleDNA` | Definição do artigo |
| `SiloDNA` | Arquitetura do silo |
| `ContentPlan` | Plano editorial |
| `ContentDocument` | Conteúdo do artigo |
| `PublicationRecord` | Registro de publicação |

Os nomes técnicos continuam em tipos, APIs, rotas, persistência e contratos.

## 10. Proibições específicas da grade

- fonte abaixo de 12px para ganhar densidade;
- classe de cor inexistente (`slate-850` e similares) — não renderiza nada;
- hex cru na célula, no cabeçalho ou no painel;
- card decorativo envolvendo a planilha;
- segunda busca dentro da área quando a busca da GlobalTopbar já cobre;
- modal para detalhe de linha;
- scroll vertical interno duplicado;
- cor de linha por módulo.
