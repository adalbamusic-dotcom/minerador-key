# Operational Grid — contrato compartilhado

Status: **Planejado — documentação somente; não autoriza implementação**  
Data: 2026-08-15  
Módulo proprietário: Infraestrutura compartilhada / sistema visual

Este documento formaliza o padrão global de mesas e listas operacionais densas
da plataforma. Ele é sucessor específico da [SDD da fundação visual global](sdd-fundacao-visual-global.md)
para o caso de planilhas e listas; não reabre nem altera a SDD aprovada.

O contrato não autoriza alteração de frontend, migração de módulo, mudança de
persistência visual, schema, APIs, providers, IA ou operação remota.

## 1. Decisão canônica

`Operational Grid` é o nome conceitual global da família. O contrato não deve
ser chamado de `KeywordTable`, porque keywords são apenas um dos domínios que
podem usar a superfície.

A referência principal é **Minerador — Processar Keywords**, com **Descobrir
Keywords** como referência complementar. A referência já validada no Minerador
é evidência do padrão, não prova de adoção nos outros módulos.

### Estado da decisão

- `REFERENCE IMPLEMENTED`: comportamento observado e validado nas superfícies
  operacionais do Minerador, conforme o estado do módulo.
- `PLATFORM-WIDE IMPLEMENTATION`: não iniciada como migração global.
- `DATABASE_CHANGE`: `NO`.
- `SCHEMA_CHANGE`: `NO`.
- `CODE_CHANGE`: `NO` nesta tarefa.
- `REMOTE_OPERATION`: `NONE`.

## 2. Composição conceitual

A família deve ser pensada como uma composição de primitives, sem obrigar
todos os consumidores a exibir todos os elementos:

```text
OperationalGridShell
├── GridHeader
├── GridRows
├── SelectionController
├── PaintingSelection
├── ManualOrderController
├── SortController
├── ColumnResize
├── RowResize
├── HorizontalScroll
├── ExpandedDetailSlot
├── BulkActionBar
└── EmptyState
```

Esses nomes representam responsabilidades compartilháveis. Não significam que
novos componentes ou arquivos já existam no código.

## 3. Contrato compartilhado

Quando aplicável, a superfície deve oferecer:

- largura total da área operacional;
- densidade controlada, preservando leitura e controles;
- cabeçalho e linhas alinhados;
- seleção por checkbox;
- Ctrl/Cmd para adicionar ou remover itens;
- Shift para selecionar intervalo;
- painting selection para selecionar ou desselecionar continuamente;
- seleção nativa de texto e cópia;
- handle explícito para reorder;
- ordem manual e ordenação por coluna;
- resize de colunas e de altura de linhas;
- scroll horizontal progressivo;
- ausência de scroll vertical interno adicional quando o workspace já possui
  rolagem principal;
- estado vazio dentro da própria área da grade;
- linha expansível e `ExpandedDetailSlot` conectado à linha;
- busca local quando fizer sentido;
- ações em lote e barra fixa ao viewport quando houver seleção;
- estados de hover, focus, selected e acessibilidade de mouse e teclado;
- tokens globais de tipografia, cor, espaçamento, borda e scrollbar.

O consumidor pode omitir interações que não façam sentido para o domínio, mas
não deve criar gestos concorrentes para a mesma superfície.

## 4. Limites do shared primitive

A infraestrutura compartilhada não interpreta regras editoriais. O domínio
fornece, no mínimo:

- definição das colunas;
- dados das linhas;
- identificador estável da linha;
- renderer do detalhe;
- ações em lote;
- permissões já resolvidas;
- mapeamento de status;
- handlers de domínio.

Permanecem específicos do Minerador, entre outros:

- KeywordDNA;
- KGR e decisão KGR;
- principal, secundária e reforço;
- nicho, funil, silo e categoria;
- medição de keyword.

O mesmo limite vale para os demais módulos: ArticleDNA e arquitetura no
Arquiteto, evidências no Radar, ContentPlan no Planejador e PublicationRecord
em Publicações são responsabilidade dos respectivos adapters.

## 5. Adapters por domínio

O modelo de adoção é um shell compartilhado com adapters específicos:

| Módulo | Adapter planejado | Detalhe de domínio |
| --- | --- | --- |
| Minerador | `KeywordOperationalGrid` | KeywordDNA e qualificação |
| Arquiteto | `ArticleOperationalGrid` | ArticleDNA e arquitetura |
| Radar | superfície operacional de artigo/evidência | diagnóstico e evidências |
| Planejador | superfície operacional de ContentPlan | plano e estados do plano |
| Publicações | superfície operacional de PublicationRecord | fila, publicação e histórico |
| Marca/Admin/Agência | caso a caso | somente listas realmente densas |

O editor Tiptap do Redator não deve ser transformado em grid. Apenas listas
auxiliares podem avaliar o padrão se houver necessidade real.

## 6. Gestos e estados de interação

O contrato de gestos é:

| Superfície | Gesto |
| --- | --- |
| Checkbox | seleção individual |
| Ctrl/Cmd | adicionar ou remover itens |
| Shift | seleção de intervalo |
| Área de pintura | seleção/desseleção contínua |
| Drag handle | reorder |
| Cabeçalho | sort |
| Divisor do cabeçalho | resize de coluna |
| Superfície de altura da linha | resize de linha |
| Chevron | expandir detalhe |
| Texto | seleção nativa e cópia |
| Select/input | edição do controle |

Não usar a mesma área para dois gestos concorrentes. O foco, o teclado e o
pointer devem deixar a ação possível identificável.

### Ordem manual e sort

- `MANUAL ORDER`: drag habilitado.
- `COLUMN SORT`: drag desabilitado.
- Retorno a `MANUAL ORDER`: drag novamente habilitado.

A troca entre os modos deve ser explícita. Não pode haver conflito silencioso
entre a ordem manual e uma ordenação temporária.

### Estado visual

Por padrão, são estados de UI e não entidades de negócio:

- largura de coluna;
- altura de linha;
- linhas expandidas;
- seleção;
- sort;
- busca local;
- ordem manual visual.

Não criar campos como `position`, `sort_position`, `display_order`,
`column_width` ou `row_height` sem decisão estrutural própria e necessidade
comprovada. Persistência cross-device fica fora do contrato inicial.

## 7. Detail slot

O detalhe expandido pertence visualmente à linha imediatamente anterior. A
grade fornece o slot e a ligação visual; o conteúdo interno é do domínio.

Exemplos de contrato:

- Keyword → KeywordDNA;
- Article → ArticleDNA;
- Publication → PublicationRecord ou detalhe da publicação.

O detalhe não deve parecer um segundo objeto desconectado da linha que o abriu.

## 8. Bulk actions e bulk bar

`BulkActionBar` é uma primitive compartilhada, mas as ações são fornecidas pelo
adapter. A barra:

- aparece somente quando `selectedCount > 0`;
- permanece fixa ao viewport;
- tem altura alvo aproximada de 44–45px;
- usa uma única linha e não possui scrollbar própria;
- reduz gaps e padding em larguras menores;
- prioriza ações e move secundárias para “Mais ações” quando necessário.

O sucesso de uma operação só deve ser comunicado após a confirmação real da
persistência, quando a ação persistir dados.

## 9. Responsividade e rolagem

O comportamento é progressivo:

1. ocupar a largura disponível;
2. comprimir colunas flexíveis;
3. reduzir gaps e padding dentro dos limites aprovados;
4. preservar legibilidade e controles;
5. usar scroll horizontal somente quando necessário.

A superfície continua sendo uma tabela/lista; não deve virar cards
automaticamente. Validar pelo menos em 1440, 1024 e 768px. Em 360px o scroll
horizontal é permitido.

O workspace deve preferir uma única rolagem vertical principal. Evitar a
combinação de scroll da página, scroll vertical interno da grade e scroll
vertical independente do detalhe. Scroll horizontal usa o contrato global de
Quiet UI.

## 10. Visual, avisos e acessibilidade

Usar somente tokens do sistema visual compartilhado:

- superfícies neutras e graduais;
- texto off-white em dark mode;
- bordas discretas;
- controles e texto essencial com legibilidade mínima do sistema;
- seleção e expansão com accent do módulo em baixa intensidade;
- ação principal com accent de ação;
- status `INFO`, `SUCCESS`, `PENDING`, `WARNING` e `ERROR`.

Não introduzir roxo, violeta, índigo, fúcsia, lilás, lavanda ou equivalentes
como linguagem visual. Não hardcodar cores dentro de adapters.

Operações devem usar o `GlobalNoticeCenter` compartilhado definido pelo sistema
visual, quando esse contrato estiver implementado:

```text
operação → toast curto → mesmo notice disponível no sino
```

Validação contextual permanece inline. O grid não cria um sistema próprio de
toast, nem substitui a hierarquia do shell global.

## 11. Tenant e autorização

O grid não resolve tenant, membership, owner ou autorização. Recebe o contexto
já autorizado pelo módulo consumidor.

Para entidades editoriais, o dataset recebido deve estar limitado ao
`brandId = public.marcas.id` corrente. A primitive não pode misturar dados na
troca de marca:

```text
Brand A → dataset A
Brand B → dataset B
```

Validação multi-Brand e multi-navegador realizada no Minerador é evidência da
referência, não prova automática para os demais módulos.

## 12. Quando usar e quando não usar

Usar quando houver combinação relevante de muitos registros, comparação,
seleção, inspeção, edição direta, ações em lote, organização e alta densidade.

Não usar automaticamente em perfil, formulário simples, configuração de API,
página institucional, card de resumo, editor de texto ou tela com poucos
objetos.

Padronização não significa transformar toda página em planilha.

## 13. Referência do Minerador

O Minerador já demonstrou, em suas superfícies de referência, seleção,
Ctrl/Cmd, Shift, painting, texto selecionável, reorder por handle, ordem
manual, sort, resize de coluna e linha, responsividade, scroll horizontal,
detail panel integrado, bulk actions, bulk bar fixa, GlobalTopbar,
GlobalNoticeCenter, persistência real de dados e isolamento multi-Brand.

Essa lista deve ser lida como `REFERENCE IMPLEMENTED`, separada de
`PLATFORM-WIDE IMPLEMENTATION`, que permanece não iniciada. A adoção não deve
reconstruir o Minerador: a primeira etapa futura é auditar e extrair o que for
realmente compartilhável.

## 14. Adoção gradual

Nenhuma fase autoriza implementação automaticamente. A sequência planejada é:

| Fase | Escopo | Condição de avanço |
| --- | --- | --- |
| R0 | documentar o padrão | contrato compartilhado revisado |
| R1 | auditar/extrair primitives do Minerador | sem reconstruir o Minerador |
| R2 | Descobrir e Processar na mesma família | regressões de interação e persistência |
| R3 | Arquiteto | fluxo real e testável disponível |
| R4 | Radar | ArticleDNA e APIs reais aptos a smoke |
| R5 | Planejador | fluxo ContentPlan verificável |
| R6 | Publicações | fluxo PublicationRecord verificável |

Marca, Admin e Agência entram caso a caso quando houver listas densas. Redator
fica limitado a listas auxiliares, se fizer sentido.

## 15. Gate de cada adoção

Cada consumidor precisa passar por:

```text
código → testes → DOM/render real → screenshot →
mouse/teclado real → validação manual → aprovação
```

Testes, TypeScript, lint, build ou screenshot isolado não provam painting,
drag, resize, scroll, bulk bar fixa, responsividade, cópia/seleção de texto
ou detalhe expandido. A evidência deve separar resultado local de validação
manual autenticada e persistência real.

## 16. Compatibilidade, risco e rollback

O risco principal é transformar um padrão de interação validado em abstração
que apague regras de domínio ou que introduza rolagens/gestos concorrentes.
Mitigações: adapter por domínio, contrato de gestos congelado, gates de DOM e
interação real, isolamento por `brandId` e adoção faseada.

Rollback de uma adoção futura deve remover ou desativar o adapter/composição do
módulo, preservando dados, contratos editoriais e persistência. Nenhum rollback
visual autoriza limpeza de dados ou mudança remota.

## 17. Decisões ainda pendentes

- quais primitives podem ser extraídas sem duplicar ou reconstruir o
  Minerador;
- composição técnica final e API dos adapters;
- limites de densidade por módulo e por viewport;
- quais listas de Marca/Admin/Agência realmente se beneficiam do padrão;
- prova manual autenticada de cada adoção;
- qualquer persistência visual cross-device, que exige decisão estrutural
  própria.

## 18. Resultado do planner

```text
OPERATIONAL_GRID_STANDARD_PLANNED = YES
REFERENCE = Minerador / Processar Keywords; Descobrir Keywords como complemento
GLOBAL_PRIMITIVES = OperationalGridShell e primitives de interação listadas
DOMAIN_ADAPTER_MODEL = shell compartilhado + adapter, dados e handlers do módulo
DETAIL_SLOT_CONTRACT = detalhe pertence à linha imediatamente anterior
BULK_BAR_CONTRACT = selectedCount > 0, fixa ao viewport, 44–45px, ações do domínio
SELECTION_CONTRACT = checkbox, Ctrl/Cmd, Shift, painting, texto nativo preservado
RESPONSIVE_CONTRACT = progressivo; tabela permanece tabela; 360px aceita horizontal scroll
SCROLL_CONTRACT = uma rolagem vertical principal; horizontal somente quando necessário
VISUAL_CONTRACT = Quiet UI, tokens globais, estados semânticos e sem cores proibidas
TENANT_CONTRACT = contexto já autorizado; dataset limitado ao brandId corrente
MINERADOR_REFERENCE_STATUS = REFERENCE IMPLEMENTED
PLATFORM_ADOPTION_STATUS = PLANNED; NOT STARTED
DATABASE_CHANGE = NO
SCHEMA_CHANGE = NO
CODE_CHANGE = NO
REMOTE_OPERATION = NONE
```

## 19. Correção do expansor da linha — 2026-09-11

Correção de interface, sem regra de domínio. Não vira invariante editorial.

O botão do expansor (`renderExpanded`) media 12×12 px dentro de uma célula de
29×34 px — 12% da área. Um clique nos 88% restantes atingia o `<td>`, subia até
o `onClick` da linha, cujo guarda `target.closest("button, input, a, …")` não
casa com uma célula, e a linha era **ativada** em vez de expandida. O efeito
visível era "o chevron não abre o detalhe".

Medido num navegador real, antes e depois:

```text
antes   botão 12,0 × 12,0 em célula 29,3 × 34,0  =  12%
        zona morta 8,9px esquerda · 8,4px direita · 9px topo · 13px base
depois  botão 28,8 × 28,0 em célula 29,3 × 34,0  =  81%
```

O botão passou a ocupar a célula (`p-0` na célula, `flex h-full w-full … py-2`
no botão). O `stopPropagation` do botão permanece: expandir não seleciona a
linha, e marcar o checkbox não expande.

Guardado por `tests/radar-fix-expansor-planilha.test.mts`, com cliques reais no
DOM. `happy-dom` não calcula layout, então a geometria fica travada pelas
classes que a produzem; os pixels acima vieram do navegador.

```text
CODE_CHANGE = YES (components/editorial/operational-data-grid.tsx)
DOMAIN_RULE = NO
DATABASE_CHANGE = NO
REMOTE_OPERATION = NONE
```
