# SDD — Remoção da IA do Minerador · corte 3: Apresentação Contextual e processo `ai`

**Data:** 2026-09-18 · **Owner:** Minerador · **Status:** aprovada e implementada em 2026-09-18. Homologação manual do fluxo real é do usuário. O corte 1 (código morto do R5) já está implementado e registrado em [estado-atual.md](../estado-atual.md).

## Problema

O KeywordDNA em produção não tem contribuição de IA. Medido no banco remoto: as 103 keywords de `minerador_keywords` têm `dna_origem = logico_deterministico` e `dna_modelo = keyword-concept-ptbr-v1`; **nenhuma** carrega payload `ai_review`. Intenção e Funil vêm da Lógica determinística e da evidência SERP.

O que restou de IA viva no módulo é a **Apresentação Contextual**: um texto gerado com DeepSeek + Voz da Marca, persistido como artifact `keyword_contextual_presentation`. Ela custa chamada paga, ocupa um dos sete processos do Processador e não alimenta decisão nenhuma.

## Três achados que definem o escopo

**1. A Apresentação Contextual é decoração somente-leitura.** O rastreamento do consumo mostra que `keywordPresentations` sai de `lib/server/arquiteto-workspace.ts`, atravessa `canonical-workspace.ts` e termina em dois `presentation={...}` de um painel somente-leitura do Arquiteto. Ela **não** entra em prompt, **não** entra em ArticleDNA, **não** entra em SiloDNA e **não** chega ao Redator. Consulta ao banco: `0` ArticleDNA citam a apresentação.

> Isto corrige a avaliação anterior desta frente, que tratava a remoção como dependente da Voz da Marca no Redator. A dependência não existe: a Voz da Marca aplicada aqui produz um texto que nenhuma produção de conteúdo consome. Onde ela importa é na escrita, que é exatamente onde a outra frente está construindo — **fora do escopo deste SDD**.

**2. Os artifacts não podem ser apagados, e não é uma escolha nossa.** `editorial_artifact_versions` tem o trigger `editorial_artifact_versions_append_only_trg`, que dispara `pipeline_editorial_protect_append_only` em **UPDATE e DELETE** e levanta exceção. O SDD de 2026-08-28 que criou o artifact já fecha a questão: "é proibido DELETE de artifact de teste, UPDATE destrutivo, limpeza de versão ou desabilitar trigger". Os 252 registros (237 keywords) **permanecem**, exatamente como os ~134 que já estão órfãos de keywords excluídas.

**Consequência direta:** sem apagar as linhas, o `CHECK` de `artifact_type` **não pode** ser estreitado — passaria a ser violado pelos dados existentes. Logo este corte é **só código**: `MIGRATION = NONE`, `SQL_REMOTO = NONE`, `DADO_ALTERADO = NONE`.

**3. A IA morta está travando a maturidade do DNA.** `deriveDnaMaturity` exige `aiReviewCompleted` para chegar a `COMPLETA PARA REVISÃO`, e esse valor vem de `process.ai.complete`, que é sempre falso porque nenhuma keyword tem `ai_review`. Verificado na tela autenticada: a planilha mostra `PARCIAL` e nunca `COMPLETA PARA REVISÃO` nem `CONFIRMADA`. **Nenhuma keyword da plataforma consegue subir a escada de maturidade hoje.**

## Decisão

Remover do Minerador a Apresentação Contextual e o processo `ai`, em uma única mudança de código coerente, sem tocar em dado remoto.

- `AI_IN_MINERADOR = NONE` · `MINERADOR_PROCESSES = 6` (`site`, `logic`, `volume`, `results`, `kgr`, `review`).
- `ARTIFACTS_PRESERVADOS = YES` — os 252 `keyword_contextual_presentation` continuam no banco, íntegros e inalcançáveis pela UI.
- `CHECK_ARTIFACT_TYPE = INALTERADO`.
- `PROVIDERS_COMPARTILHADOS = INTOCADOS`.

## Escopo — o que sai

**Minerador — UI:** botão `IA` da barra do Processador, card `IA` do Perfil, seção "IA · Apresentação contextual" da Revisão Humana, passo `ai` da barra de progresso em lote.

**Minerador — execução:** `handleBatchContextualPresentation` e o estado `presentationBriefs`; `lib/minerador/presentation-brief.ts`, `keyword-contextual-presentation.ts`, `keyword-contextual-presentation-row.ts`, `contextual-presentation-ui-state.ts`; `lib/server/keyword-contextual-presentation-store.ts`; a rota `app/api/minerador/marcas/[brandId]/ia/brief-apresentacao`.

**Minerador — contratos:** `MineradorProcessName` perde `"ai"`; `aiCompleted` sai de `MineradorArquitetoHandoffGate`; `aiReviewCompleted` sai de `canonical-keyword-snapshot` e de `deriveDnaMaturity`; `lib/minerador/semantic-review.ts` (o leitor legado que o corte 1 preservou) sai inteiro; `human-review.ts` perde os ramos de divergência e enriquecimento de IA.

**Arquiteto — consumo:** o bloco "Apresentação" de `keyword-dna-projection.ts`, `keywordPresentations` em `canonical-workspace.ts` e `lib/server/arquiteto-workspace.ts`, e os dois pontos de uso em `arquiteto-workspace.tsx`. Sem isso o painel fica permanentemente vazio, o que é pior que removê-lo.

## Fora de escopo

Voz da Marca no Redator (outra frente, em desenvolvimento). Providers compartilhados de IA — Arquiteto, Radar e Redator dependem deles. `/api/mine` e `/api/inteligencia`, que apesar do nome não são IA. Qualquer migration, SQL remoto ou exclusão de dado.

## Efeito visível esperado

A maturidade do KeywordDNA destrava. Keyword com Lógica processada, Volume e Resultados validados e KGR tratado passa de `PARCIAL` para `COMPLETA PARA REVISÃO`, e para `CONFIRMADA` com a revisão humana concluída. É correção de um defeito, não regressão — mas muda rótulo na tela e precisa estar declarado antes, não descoberto depois.

## Risco e contenção

O risco concentrado está em `MineradorProcessName` ser um union type: qualquer consumidor esquecido vira erro de compilação, não bug silencioso. `tsc --noEmit` é a rede.

Tudo aqui é código, logo reversível por git. Nenhum passo destrói dado. O corte é feito de uma vez, não em fatias, porque estados intermediários deixariam a suíte afirmando coisas contraditórias — foi o que já aconteceu com o R5, que ficou meses meio-ligado.

## Flags de aceite

- `AI_IN_MINERADOR = NONE`
- `MINERADOR_PROCESSES = 6`
- `MIGRATION = NONE` · `SQL_REMOTO = NONE` · `DADO_ALTERADO = NONE`
- `ARTIFACTS_PRESERVADOS = 252`
- `CHECK_ARTIFACT_TYPE = INALTERADO`
- `PROVIDERS_COMPARTILHADOS = INTOCADOS`
- `TYPESCRIPT = 0 erros`
- `TESTES_MINERADOR`: sem falha nova contra o baseline de 28, comparado nome por nome
- `DNA_MATURITY_DESTRAVADA = YES`, verificado na tela autenticada
- `REAL_PROVIDER_CALLS = 0`
- `MANUAL_UI_VALIDATED` — do usuário, não do Dev
