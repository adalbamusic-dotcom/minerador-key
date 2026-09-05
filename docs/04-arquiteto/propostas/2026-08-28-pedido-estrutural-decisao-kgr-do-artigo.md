# PEDIDO ESTRUTURAL PARA O PLANNER GERAL — Decisão KGR do Artigo

```text
STRUCTURAL_KGR_DECISION_REQUIRED = YES
ARTICLE_KGR_DECISION_PERSISTENCE = BLOCKED
```

Documento de pedido. Não autoriza schema, migration, escrita remota nem
alteração de contrato. Proposta não aprovada não muda o estado do produto.

## 1. Fatos separados

- **KeywordDNA:** `kgrScore` (score real recebido) e aplicabilidade explícita
  lida por `readKgrApplicability` (`lib/minerador/kgr-applicability.ts`) a
  partir de `minerador_keywords.analise_semantica.kgr_aplicabilidade` e
  aliases. O Arquiteto lê os dois como estão: não recalcula, não sobrescreve,
  não converte ausência em zero.
- **Article:** classificação KGR do artigo, sempre a partir da Principal
  aprovada, com proveniência própria (`ARTICLE_KGR_DECISION` e
  `ARTICLE_KGR_DECISION_SOURCE`).

## 2. Regra vigente já implementada (sem persistência)

Implementada em `lib/arquiteto/article-kgr-decision.ts`:

| Condição na Principal | ARTICLE_KGR_DECISION | SOURCE |
| --- | --- | --- |
| decisão humana já registrada no contrato canônico | `YES` / `NO` | `HUMAN_DECISION` |
| vínculo KGR confirmado (principal + slug) | `YES` / `NO` | `CONFIRMED_KGR_BINDING` |
| score `>= 0` e `< 0.25` | `YES` (`Sim · KGR pleno`) | `FULL_KGR_RULE` |
| score `>= 0.25` + `Aplicável` | `PENDING_HUMAN_DECISION` (`A decidir`) | `AWAITING_HUMAN_DECISION` |
| score `>= 0.25` + `Não aplicável` | `NO` | `KEYWORD_APPLICABILITY_RULE` |
| score `>= 0.25` + aplicabilidade pendente | `PENDING_APPLICABILITY` (`Pendente`) | `AWAITING_KEYWORD_APPLICABILITY` |
| score ausente ou inválido | `ABSENT` (`—`) | `MISSING_KGR_SCORE` |

`0.25` exato não é KGR pleno: a condição é estritamente `kgr < 0.25`.
Secundárias e reforços preservam score e aplicabilidade individuais e nunca
classificam o artigo por média, maioria ou quantidade.

O KGR pleno é determinístico e não depende de persistência: é derivado do score
canônico da Principal a cada leitura. O caso `PENDING_HUMAN_DECISION` é o único
que exige registro.

## 3. Contrato atual auditado

- `ArticleDNA.kgrIdentity` (`ArticleKgrIdentitySchema`, `lib/arquiteto/contracts.ts`)
  existe e é persistido no payload versionado do ArticleDNA
  (`/api/arquiteto/artifacts`), sobrevivendo a F5 e ao downstream.
- O campo é binário (`isKgrArticle: boolean`) somado a `bindingStatus` e
  `status`; não há estado próprio para "a decidir" nem para a distinção entre
  KGR pleno e decisão humana.
- A identidade só existe depois da consolidação do ArticleDNA. Entre a formação
  do Article e a consolidação, o estado vive na working copy remota
  (`arquiteto_workflow_items.payload`), cujo contrato de escrita
  (`AssignmentSchema`, `app/api/arquiteto/workspace/route.ts`) é `.strict()` e
  não possui campo de decisão KGR.
- Consequência: exatamente onde a decisão humana precisa ser registrada, não há
  campo canônico. O select `A decidir / Sim / Não` aparece na Revisão inerte,
  com o motivo explícito, para não criar decisão humana volátil.

## 4. O que está bloqueado

- Registro da decisão humana `Sim/Não` do Article.
- Propagação da decisão ao Radar e ao Planejador junto do ArticleDNA.
- Uso da decisão `Sim` como insumo de slug exact/near-exact.

## 5. Pedido

Definir e aprovar o contrato canônico da decisão KGR do artigo, cobrindo:

1. campo próprio com os estados `YES`, `NO` e `PENDING_HUMAN_DECISION`,
   separado de `isKgrArticle` e de `bindingStatus`, mais a origem
   (`ARTICLE_KGR_DECISION_SOURCE`);
2. existência desde a formação do Article, antes da consolidação do ArticleDNA;
3. autoria, data, justificativa e histórico da decisão humana;
4. propagação com o ArticleDNA até Radar e Planejador, sem substituir o
   `kgrScore` nem a aplicabilidade de cada KeywordDNA;
5. compatibilidade com artigos publicados e com vínculo KGR já confirmado;
6. migração, rollback e testes exigidos.
