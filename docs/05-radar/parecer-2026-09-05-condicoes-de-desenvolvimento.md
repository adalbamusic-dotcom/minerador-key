# Parecer para o Planejador do Radar — condições de desenvolvimento

**Data:** 2026-09-05 · **Origem:** corte do Arquiteto (Fase 2C) que atravessou a fronteira do Radar.
**Resposta curta:** sim, pode continuar. Mas há um achado que muda o que "com testes" significa hoje.

---

## 1. O achado que precisa de decisão antes de qualquer coisa

**36 dos 38 arquivos de teste do Radar nunca rodam.**

Não existe script `test:radar` no `package.json`. As suítes existentes
(`test:arquiteto`, `test:marca`, `test:operational`, `test:authz`,
`test:editorial`, `test:redator`) listam arquivos explicitamente, e nenhuma
lista os testes do Radar.

```
arquivos de teste no repositório : 374
cobertos por alguma suíte        : 111
órfãos (nunca executam)          : 263

testes de Radar                  : 38
  rodando                        : 2   (e os dois são do lado do Arquiteto:
                                        arquiteto-radar-handoff-context,
                                        arquiteto-radar-handoff-gate)
  órfãos                         : 36
```

**O custo já se materializou.** Executei os 36 manualmente:

```
tests 169 · pass 167 · fail 2
```

As duas falhas são de **fixture desatualizada**, não de lógica:
`radar-hydration.test.mts:28` e `radar-persistence.test.mts` montam um objeto
sem `score`, `components.semanticCentrality` e `components.topicalBreadth`,
campos que o schema passou a exigir. O teste apodreceu no dia em que o schema
mudou, e ninguém soube — porque ele não roda.

Escrever mais teste nessa condição é escrever documentação que ninguém lê.

> **Diretriz 1 — criar `test:radar` antes de escrever o próximo teste.**
> E corrigir as duas fixtures no mesmo movimento, para a suíte nascer verde.
> Enquanto isso não existir, "cobri com teste" é uma afirmação sem lastro.

Observação de escopo: o problema é maior que o Radar (263 órfãos no total).
Mas o Radar é o caso mais grave em proporção — 95% dos seus testes são mortos.

---

## 2. Contrato Arquiteto → Radar: dois campos escritos e nunca lidos

Conferido campo a campo em `modules/radar/`, `lib/radar/` e `app/**/radar/`:

| Campo do `RadarItemSchema` | Escrito | Lido no Radar | Situação |
|---|---|---|---|
| `arquitetoStrategyContext` | sim | **sim** | consumido |
| `arquitetoKgrIdentity` | sim | **sim** | consumido |
| `arquitetoSerpProvenance` | sim | **não** | morto |
| `arquitetoInternalLinks` | sim | **não** | morto |

Os dois mortos aparecem em exatamente 2 lugares cada: a definição do schema e a
escrita em `importArticlesToRadar`. Zero leitores.

**O que se perde.** A investigação do Radar não sabe o verdict da SERP de
formação nem que houve resolução humana sobre ela — trata o Article como uma
decisão sem histórico. E o grafo de links aprovado não participa da priorização
competitiva.

**Isto não é bug de implementação.** O contrato declara os campos; não declara
obrigação de consumo. É proposta de evolução, e a decisão é sua:

> **Decisão 1 — consumir ou remover.**
> Consumir: a investigação passa a herdar o que o Arquiteto já decidiu.
> Remover do contrato: para de transportar peso morto e a fronteira fica honesta.
> O que não serve é continuar escrevendo campo que ninguém lê — isso vira
> contrato de fachada, e alguém no futuro vai confiar nele.

---

## 3. Duas autoridades de aprovação, ainda

O Workbench aprova em estado local ([radar-page.tsx:558](../../modules/radar/radar-page.tsx)):

> "Relatório aprovado localmente. Isso não cria uma versão remota nem envia ao
> Planejador."

A página de detalhe (`/radar/{articleId}`) faz o trabalho real: portão, relatório
competitivo, pacote de evidências, handoff do Planejador, sucessora, readback.

**Duas telas, dois significados para o mesmo verbo.** Aprovar no Workbench não
produz nada; o pacote só existe se alguém lembrar de abrir a página de detalhe.

Houve uma tentativa de unificar isso — um `lib/radar/report-approval.ts` que
seria a autoridade única. Ela veio de um corte do **Arquiteto**, que não devia
ter atravessado a fronteira, e **foi revertida** (commit `radar: desfazer a
extração de aprovação feita pelo corte do Arquiteto`). A reversão foi por
escopo, não por mérito: o módulo estava correto, e a unificação nunca chegou a
acontecer porque o Workbench nunca passou a consumi-lo.

> **Decisão 2 — unificar ou declarar a diferença.**
> Se unificar: `git revert` daquele commit traz o módulo de volta inteiro, e o
> que falta é o Workbench passar a chamá-lo.
> Se não unificar: a mensagem do Workbench precisa parar de usar o verbo
> "aprovar" para algo que não aprova nada.
> Em qualquer caso, a decisão é do Radar — não do Arquiteto.

---

## 4. Um defeito que era do editorial, já corrigido

Vale registrar porque explica por que o Radar parecia quebrado.

Importar do Arquiteto dizia "1 item(ns) enviado(s)", o item sobrevivia ao F5 e
não aparecia em nenhum outro navegador. A causa não estava no Radar nem no
Arquiteto: `sendWorkflowCommand` nunca lançava. Em caso de falha marcava
`persistenceMode` e retornava normalmente, então o `await` do importador não
protegia nada — o fluxo gravava `radarItems` local e reportava sucesso com o
banco vazio. O F5 sobrevivia pela recuperação em `localStorage`, que é por
navegador.

Corrigido: a função devolve `WorkflowCommandOutcome` e o importador recusa antes
de tocar no estado local, devolvendo cada artigo em `blocked` com o motivo do
servidor.

**Detalhe útil para depuração futura:** a leitura do Radar é por marca e não por
usuário (`.eq("marca_id", marcaId)`, sem filtro de autor). Por isso abrir em
outro navegador — mesmo em outra conta com acesso à Brand — é teste conclusivo:
se a linha existisse no banco, aquela sessão a veria.

---

## 5. Estado do `siloId`, e por que os artigos importam hoje

Os 8 ArticleDNA remotos têm `siloId: null`. O handoff resolve o Silo pelo
território — **leitura, não backfill**: nada é gravado de volta no artefato.

Isso agora é **declarado**: `ResolvedSiloContext.siloIdProvenance` distingue
`DECLARED` de `LEGACY_TERRITORY_HYDRATION`, `legacyHydratedHandoffArticleIds`
conta o lote, e o envio do Arquiteto avisa quantos artigos ainda dependem da
dedução. Antes o caminho legado era indistinguível de conformidade.

Quem quita a dívida é a sucessora criada no fechamento da fase Artigos, que
materializa `siloId` no próprio artefato. Depois disso a lista fica vazia para
artefatos novos. **Nada a fazer do lado do Radar.**

---

## 6. Diretrizes para trabalhar no Radar agora

1. **O git voltou a funcionar.** O `index.lock` estava morto desde 20/ago e
   bloqueava o índice; 19 dias de trabalho ficaram sem commit. Foi removido e a
   árvore foi commitada. **Commite cedo e com frequência** — foi a ausência
   disso que tornou irreversível cada edição feita aqui.

2. **Crie `test:radar` antes do próximo teste.** Sem isso, cobertura é ficção.

3. **A fronteira vale nos dois sentidos.** O Arquiteto não deve tocar em
   `modules/radar/` nem `lib/radar/` — e quando tocar, `RADAR_FILES_CHANGED`
   precisa voltar a zero. O inverso também: mudança de contrato é conversa entre
   planners, não commit unilateral.

4. **Readback é a autoridade.** Um POST que não lançou exceção não é prova de
   que o remoto guardou. Toda escrita do Radar já segue isso na página de
   detalhe; mantenha em qualquer caminho novo.

5. **`localStorage` nunca é fonte canônica.** Ele é recuperação. Se um estado
   sobrevive ao F5 mas não aparece em outro navegador, ele não existe.

6. **Recusa é declarada, nunca item mudo.** "N ignorados" sem motivo custou uma
   investigação inteira nesta rodada.

---

## Resumo executivo

| Item | Situação | De quem é a decisão |
|---|---|---|
| 36 testes do Radar órfãos | **bloqueia desenvolvimento com teste** | Radar — criar `test:radar` |
| 2 fixtures desatualizadas | falham; apodreceram sem ninguém ver | Radar — corrigir junto |
| 2 campos de contrato mortos | escritos, nunca lidos | Radar + Arquiteto |
| Duas autoridades de aprovação | Workbench não aprova de verdade | Radar |
| Importação fantasma | **corrigido** | — |
| `siloId` por hidratação legada | declarado e contável; some com as sucessoras | Arquiteto |

**Pode desenvolver? Sim.** A base está commitada, a importação parou de mentir e
o contrato de entrada funciona. O que falta antes de "desenvolver com testes" é
uma linha no `package.json`.
