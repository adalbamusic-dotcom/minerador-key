# SDD — Aprovação versionada e pacote fechado para o Arquiteto

**Data:** 2026-09-18 · **Owner:** Minerador · **Status:** aprovada pelo usuário; em implementação.

## Problema

Três buracos no contrato de entrega, medidos no código e no banco:

**1. "Aprovado" não significa "pronto".** `handleUpdateStatus` não tem trava editorial nenhuma — decisão registrada no SDD de aprovação sem gates. Dá para aprovar e enviar keyword sem Lógica, sem Volume e sem Resultados.

**2. O pacote enviado é uma fotografia que nunca se atualiza.** `buildMineradorArquitetoHandoffPlan` só cria linha para keyword nova; reenviar é no-op e a UI nem oferece, porque `WORKFLOW_RECEIVED` sai da lista. O `payload.semanticQualification` é escrito uma vez e congela — e é dele que sai a intenção canônica do Arquiteto (`keyword-dna-signals.ts:99`). Remedir a SERP depois não chega lá.

**3. O pacote não carrega o KeywordDNA.** Ele leva só referências; o Arquiteto lê o resto da **linha viva** de `minerador_keywords`. Isso é o oposto de "manter a versão aprovada": qualquer edição no Minerador vaza para o Arquiteto na hora, sem aprovação.

## Decisão

Aprovação passa a ser um **ato versionado**. O pacote entregue ao Arquiteto é o retrato do que foi aprovado, e só muda quando há nova aprovação.

### 1. Trava na aprovação

Aprovar exige **processos executados**, não conclusões alcançadas:

- Lógica processada (contrato lógico completo e readback confirmado);
- Volume validado no Processador;
- Resultados validado no Processador;
- aplicabilidade do KGR decidida **quando o KGR for calculável**.

Intenção e Funil não consolidados **não travam**. SERP mista é resultado legítimo da análise, não pendência — travar aqui impediria para sempre a aprovação de keyword com evidência dividida.

### 2. Status `em_revisao`

`MINERADOR_EDITORIAL_STATUSES` passa a ser `["bruto", "em_revisao", "aprovado", "rejeitado"]`, rótulo "Em revisão".

`minerador_keywords.status` é `text` **sem CHECK** — só existe `minerador_keywords_global_lifecycle_check`, sobre `deleted_at`/`purge_after`. **Nenhuma migration.**

### 3. Rebaixamento por mudança material

Aprovar grava em `analise_semantica.aprovacao` o **hash do pacote aprovado**, mais autor, timestamp e número da versão.

A partir daí o status efetivo é **derivado**: se o hash atual do pacote diverge do hash aprovado, a keyword é `em_revisao`, mesmo que a coluna ainda diga `aprovado`. A coluna passa a ser proveniência ("o último status que o humano escolheu"); a autoridade é o resolvedor.

Derivar em vez de depender de cada writer lembrar de rebaixar é o que impede o buraco: não existe caminho de escrita que "esqueça" de invalidar.

Reexecutar Volume e obter o mesmo número **não** rebaixa: o hash não muda.

### 4. O pacote carrega o KeywordDNA aprovado inteiro

`MineradorKeywordHandoffSource` ganha `approvedDna`: keyword, intent, volume, resultado, KGR, lista, `analise_semantica` integral, autor e data da aprovação, e o hash. Vai no `payload` do item de workflow.

O Arquiteto passa a ler o DNA **desse pacote**, não da linha viva.

### 5. Propagação automática

Enquanto a keyword está `em_revisao`, o Arquiteto segue usando o pacote aprovado anterior. Nova aprovação **reescreve o pacote** do item de workflow já existente. O trigger `pipeline_editorial_touch_lock_version` incrementa `lock_version` sozinho: a cadeia de versões é auditável sem tabela nova.

Fluxo explícito (o humano escolher enviar) vale **só para keyword nova**. Keyword já recebida que for reaprovada atualiza sozinha.

### 6. ArticleDNA já formado

`ArticleKeywordReference` **copia** `volume`, `resultCount`, `kgrScore`, `normalizedIntent` e `originalIntentLabel` — não é ponteiro. Atualizar artigo já formado, portanto, é **criar versão nova do ArticleDNA**, porque `editorial_artifact_versions` é append-only.

Decisão do usuário: **atualiza automaticamente**, sem fluxo explícito, inclusive para artigo já formado. Isto substitui a regra 7 do SDD de 2026-08-27 para o caso de reprocessamento.

Artigo **publicado** é o único recorte separado: o pacote atualiza e o artigo recebe marcador visível de insumo atualizado, mas o ArticleDNA publicado não é reescrito sozinho — ele descreve o que está no ar.

## Fora de escopo

Migration de qualquer tipo. Voz da Marca no Redator. Radar, Planejador e Publicações.

## Flags de aceite

- `APPROVAL_GATED = YES` — Lógica, Volume, Resultados e KGR tratado
- `SERP_NAO_TRAVA_APROVACAO = YES`
- `STATUS_EM_REVISAO = derivado por hash, não por writer`
- `MIGRATION = NONE` · `DADO_ALTERADO = só pelo fluxo de aprovação`
- `PACOTE_CARREGA_DNA = YES`
- `ARQUITETO_LE_DO_PACOTE = YES`
- `REAPROVACAO_ATUALIZA_PACOTE = YES`
- `TYPESCRIPT = 0 erros`
- `TESTES_MINERADOR`: sem falha nova contra o baseline de 28
- `MANUAL_UI_VALIDATED` — do usuário
