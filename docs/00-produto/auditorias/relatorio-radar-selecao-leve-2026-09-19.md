# Relatório — RADAR_SELECTION_LIGHT_1 — selecionar uma linha sem recalcular a página — 2026-09-19

## O que o USER viu

Selecionar ou desselecionar uma linha na planilha do Radar demora um instante
perceptível, local e na Vercel. Ao selecionar, os quatro cards do topo
(Pesquisa · Vídeos · Especialista · Relatório) crescem de uma linha para três
ou quatro, cheios de dados que ninguém pediu ainda.

## Causa, lida no código

`rowWorkbenchData(row)` é o modelo inteiro da linha — SERP, projeção de
seleção, estado de revisão, extrações, relatório consolidado (`R6`). Ele era
uma função pura recriada a cada render e chamada em **~20 pontos**:

- nove colunas da planilha (uma chamada por célula);
- o texto de busca do grid (`applyGridQuery` chama `column.value(row)` de
  **todas** as colunas para **todas** as linhas — e `columns` é recriado a cada
  render, então o `useMemo` do grid nunca aproveita);
- o workbench do artigo ativo, os cards, a barra de lote, a fronteira do Redator.

Selecionar muda estado → render → **N linhas × ~20 modelos** recalculados para
mostrar uma seleção. O mesmo valia, em menor escala, para
`projecaoDePesquisa` (2 chamadas por linha) e `blueprintCanonico` (a montagem
mais cara da página, 3 chamadas por render).

## Correção

**Cache de UM render.** `cacheDaLinha` (`WeakMap` por objeto de linha),
`cacheDaProjecao` e `cacheDoBlueprint` (`Map` por id) nascem no corpo do
componente e morrem com o render. Cada modelo é calculado uma vez por render e
servido aos vinte consumidores.

Por que não `useMemo` entre renders: o modelo lê catorze insumos (registros de
SERP, revisões, versões de artigo, estado local R4, evidência de especialista,
coleta, rascunho de pesquisa, modo de busca…). Uma lista de dependências
incompleta faria uma linha mostrar o estado anterior — o defeito que o Radar já
pagou caro para fechar. O cache de render elimina o fator 20 sem esse risco;
se ainda faltar, o próximo passo é memoizar `columns` e virtualizar linhas.

**Card fechado do tamanho do card vazio.** `AreaCard` fechado mostra título,
UMA linha (as duas primeiras frases do resumo, truncadas) e a marca de estado
— a mesma estrutura de `DisabledAreaCard`. Aberto, mostra as linhas inteiras
junto do painel. Os painéis das áreas já renderizavam só quando abertos.

## Testes

`tests/radar-selecao-leve-1.test.mts` (5): cache por linha com um único
chamador do cálculo cru; projeção e blueprint na mesma disciplina; caches sem
`useMemo`/`useRef` (não atravessam renders); card fechado com uma linha; painéis
só quando abertos.

```text
tsc --noEmit        limpo
eslint (2 arquivos) 0 erros · avisos pré-existentes
test:radar          2255/2255
mutantes            não aplicável — cache de render é fiação, coberto por A–E
MEDIÇÃO EM RUNTIME  pendente do USER (F5 e comparar); se persistir, perfil no
                    navegador com sessão real
PROVIDER_CALLS = 0 · AI_CALLS = 0 · MIGRATIONS = 0
```
