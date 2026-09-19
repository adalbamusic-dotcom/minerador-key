# Relatório — REDATOR_DOSSIER_SURFACE_1 — consumir o dossiê já importado do Radar — 2026-09-19

## O que o USER viu

```text
ContentDocument selecionado corretamente
Roteiro e storyboard aberto
0 cenas · novo rascunho
nenhuma superfície mostrando o dossiê importado
```

O artigo "skin care noturno" chegou ao Redator com o `RadarEvidenceBundle` V3
inteiro em `importedContext.dossier` — 3 consultas, 38 vídeos comparáveis,
canais recorrentes, padrões de título, blueprint com gancho e estrutura em
6 blocos, limitações, `writerMayNot`. Nenhuma tela do Redator lia isso: o
roteiro nascia vazio ao lado do dossiê.

## O que foi feito

### Uma projeção, três ambientes

`lib/redator/radar-foundations.ts` — `radarFoundationsOf(document)` lê
`importedContext.dossier` (documento V2) e devolve `RadarFoundations`:
perfil e instante do congelamento, keyword, **recomendação editorial com
razões**, camadas de pesquisa (consultas, itens, papel), **pesquisa YouTube**
(comparáveis, long-form × shorts, duração, canais, padrões, lacunas),
**blueprint multimodal** (formato, gancho, tom, linguagem, estrutura),
**SERP/evidências** (fontes, standing, biblioteca de vídeos, especialista,
páginas comparáveis), `mustAnswer`/`mustCover` quando existirem (do blueprint;
senão das perguntas canônicas e conceitos recorrentes do modelo observado do
Google), limitações sem repetição e `writerMayNot`.

O bundle viaja no contrato como `record<string, unknown>`; a leitura é
defensiva em todo campo — dossiê parcial ou antigo projeta o que tem, sem
lançar.

### O painel

`modules/redator/writer-radar-foundations-panel.tsx` — somente leitura,
usado por:

- **Artigo** (`professional-writer.tsx`, painel direito, acima da mídia);
- **Roteiro e storyboard** e **Carrossel** (`writer-derived-environment.tsx`
  é o mesmo componente discriminado por `kind`): enquanto nenhuma cena/slide
  está selecionado, o painel direito mostra os fundamentos; ao selecionar,
  passa à mídia da cena. "Metadados opcionais" continua recolhido e
  secundário.

### `editorialOutput` é recomendação, não gate

O Radar recomendou `ARTICLE` para este artigo ("38 long-form e 0 Shorts…";
"6 resultados orgânicos: texto continua disputando"). O painel exibe isso
rotulado como *recomendação do Radar — não limita o formato*. As três abas
existem sempre; nenhuma condição sobre a recomendação entrou na tela do artigo
nem no ambiente derivado.

### O dossiê não é copiado para o entregável

`writer_deliverable.payload` continua contendo só o produto derivado (cenas,
gancho, CTA, âncoras de mídia). O documento de origem entra no ambiente
derivado como **prop de leitura**; o contrato `strict` recusa `dossier`/`bundle`
se alguém tentar gravá-los.

## Testes

`tests/redator-radar-foundations-1.test.mts` (11): projeção completa sobre a
forma REAL do bundle de YouTube; sem dossiê → `null`; bundle malformado não
lança; `mustAnswer/mustCover` do blueprint e do observado; rótulos; painel nos
três ambientes; recomendação sem poder de bloqueio; entregável sem dossiê;
painel e projeção sem escrita, sem provider, sem IA, sem migration.

Pino ajustado: `redator-roteiro-producao` 15 — sem cena aberta continua sem
painel de mídia (o que ocupa o lugar é o dossiê, que não tem imagem).

```text
tsc --noEmit            limpo
eslint (tocados)        0 erros
test:redator            277/277
test:radar              2250/2250 (professional-writer é pinado lá)
test:editorial/operational  falhas pré-existentes, nenhuma cita arquivo tocado
bateria de mutantes     verde antes: sim · 15/15 mortos · verde no fim: sim
                        (app fechado pelo USER; fontes restauradas)
```

## Critérios

```text
DOSSIER_VISIBLE_IN_SCRIPT = YES
DOSSIER_VISIBLE_IN_CAROUSEL = YES
DOSSIER_VISIBLE_IN_ARTICLE = YES
EDITORIAL_OUTPUT_BLOCKS_DERIVED_FORMATS = NO
RAW_DOSSIER_DUPLICATED_IN_DELIVERABLE = NO
PROVIDER_CALL_REQUIRED = NO
MIGRATION_REQUIRED = NO
AI_CALLS = 0
MANUAL_UI_VALIDATED = pendente do USER
```

## Fora deste corte

- Semear o roteiro com cenas a partir do blueprint (gancho → blocos → CTA):
  hoje o painel mostra a estrutura sugerida; o roteiro continua nascendo vazio
  por decisão de escopo.
- O documento de Google enviado antes das autoridades carregadas pode ter
  `observed`/blueprint vazios no bundle: o painel mostra o que há e declara o
  que falta.
