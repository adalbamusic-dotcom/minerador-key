# SDD — Aprovação é autoridade humana; processos são independentes

**Data:** 2026-08-29 · **Owner:** Minerador · **Status:** **implementada** em 2026-08-29. Gates removidos do produto, `human-review-ui-state` criado, `semanticState` no handoff, cobertura em `tests/minerador-aprovacao-sem-gates.test.mts` (17/17). Estado canônico em [estado-atual.md](../estado-atual.md).

## Problema

O runtime passou a tratar **estado de processo** como **veto editorial**. Em keywords reais o usuário foi bloqueado por:

- `"Conclua a revisão do DNA antes da decisão final."`
- `"A SERP persistida não consolidou Intenção e Funil: a evidência não é conclusiva."`

Isso criou um loop operacional: SERP mista → aprovação bloqueada → reprocessar → estados parecem voltar a pendente → refazer revisão → reprocessar de novo, ou apagar a keyword de teste.

O erro conceitual: SERP mista **não** é falha, **não** é pendência humana e **não** é motivo para proibir decisão. Não existe nada para o humano "corrigir" quando a própria SERP não concluiu.

## Decisão

**Aprovar é uma decisão humana explícita sobre o estado atual da keyword.** Não é certificado de que todos os processos deram verde.

Aprovação exige apenas integridade técnica: keyword existente e não excluída, `brandId` correto, usuário autorizado e ação explícita. Nenhum gate editorial adicional.

É permitido aprovar com SERP conclusiva, mista, fraca ou ausente; com IA executada ou não; com revisão executada ou não; com KGR aplicável ou não decidido. Isso **não** converte SERP mista em conclusiva — significa apenas "eu, humano, aceito esta keyword neste estado".

## Independência dos processos

| Reexecutar | Altera | Nunca altera |
| --- | --- | --- |
| Lógica | Lógica | Volume, Resultados, SERP, IA, Revisão, Aprovação, Status |
| Volume | Volume + KGR derivado | Lógica, Resultados, SERP, IA, Revisão, Aprovação, Status |
| Resultados | Resultado/allintitle, sinais Labs, Qualificação Semântica, KGR derivado | Lógica, Volume, IA, Revisão, Aprovação, Status |
| IA | nova versão da Apresentação Contextual | todo o resto |
| Revisão | apenas decisões humanas explicitamente tomadas | todo o resto |
| Status | apenas Status | todo o resto |

Única dependência legítima: **Volume ou Resultado mudou → KGR pode recalcular**. Nada mais.

`APPROVAL_SURVIVES_RERUN = YES`, `REVIEW_SURVIVES_RERUN = YES`. Reprocessar é comportamento normal do produto: SERP v1→v4 e IA v1→v3 convivem sem exigir exclusão de keyword.

## Revisão Humana

Deixa de ser gate. Só existe quando há decisão humana real disponível (hoje: aplicabilidade do KGR e decisões estratégicas concretas). Sem decisão pendente, a UI diz "Sem decisões pendentes" — nunca "Revisão pendente" só porque ninguém clicou.

`REVIEW_REQUIRED_FOR_APPROVAL = NO` · `REVIEW_REQUIRED_FOR_STATUS = NO` · `REVIEW_REQUIRED_FOR_HANDOFF = NO`.

## Handoff ao Arquiteto

Sem blockers editoriais. O pacote transporta honestamente o que existe:

```
semanticQualificationRef = vN
intent = null
funnel = null
semanticState = non_conclusive
```

Nenhum valor é inventado para liberar o fluxo. Quando a SERP é conclusiva, os eixos viajam preenchidos e `semanticState = conclusive`.

## Não muda

DataForSEO advanced, `serp-semantic-derivation-v2`, thresholds provisórios, DeepSeek com thinking desabilitado nesta operação, Voz da Marca, BrandDNA, fórmula e faixa do KGR, storage dos artifacts, CHECK, migration ledger. Nenhuma alteração de schema.

## Rollback

Restaurar gates apenas por nova decisão explícita de produto. Os campos de estado continuam no read-model como **informação** — só deixaram de bloquear.
