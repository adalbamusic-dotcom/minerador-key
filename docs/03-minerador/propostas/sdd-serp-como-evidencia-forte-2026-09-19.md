# SDD — SERP como evidência forte: a SERP conclusiva muda a Lógica na origem

**Data:** 2026-09-19 · **Owner:** Minerador · **Status:** aprovada pelo usuário ("é a SERP que tem mais preferência e que pode mudar os dados da Lógica, e isso tem que se tornar como evidência forte"); implementada no mesmo dia.

## Problema

A autoridade está declarada desde 2026-08-28 (spec §58, adendo A.2): **SERP válida e conclusiva > decisão humana > Lógica**. Mas a declaração nunca chegou à linha da keyword:

1. **A SERP conclusiva não mora em `analise_semantica`.** Ela vive só no artifact `keyword_semantic_qualification` e na working copy da sessão. `readCanonicalKeywordDna` — o leitor da tabela, do Perfil, da Decisão e dos filtros — resolve humano > contrato lógico > `intencao_principal` e **nunca vê a SERP**. Resultado: a tabela mostra a hipótese da Lógica mesmo quando a SERP já concluiu outra coisa.

2. **O pacote aprovado não carrega a SERP como dado.** `ApprovedKeywordPackage.analiseSemantica` é a semântica da linha; a Qualificação viaja à parte, como `semanticQualification` no payload do handoff. Uma SERP nova depois da aprovação **não** altera a assinatura do pacote — a keyword não cai em revisão, e o Arquiteto pode ficar com intenção velha sem que ninguém seja avisado.

3. **Duas respostas para a mesma pergunta.** O Arquiteto prefere `semanticQualification.intent`; o Minerador mostra a Lógica. O contrato `KeywordDNA fechado` (spec §62) resolveu a ordem na leitura, mas a leitura da UI do Minerador ainda não passa por ele.

## Decisão

A SERP conclusiva é **evidência forte gravada na própria keyword**. Ela muda o que a Lógica responde, com proveniência, sem apagar a hipótese.

### 1. Registro `analise_semantica.evidencia_serp`

Gravado pela rota `Resultados` (`dataforseo/allintitle`) **imediatamente após** `persistKeywordSemanticQualification` confirmar a versão. Só keyword oficial recebe (candidato de Descoberta não tem `analise_semantica`).

```text
evidencia_serp: {
  schemaVersion: "v1",
  peso: "forte",
  versionId, version, contentHash, collectedAt, derivationVersion, thresholdsVersion,
  semanticState: "conclusive" | "non_conclusive",
  intent: { value: string | null, strength },   // value só quando conclusivo
  funnel: { value: string | null, strength },
  invalidada: null | { por, em, motivo }        // decisão humana sobre a evidência (A.2)
}
```

O valor por eixo só é preenchido quando o eixo é conclusivo — a mesma regra de `qualificationConsolidatedAxes` que monta a referência do handoff. SERP mista, fraca ou insuficiente grava o registro com `value: null` e força declarada: **a ausência fica registrada, nunca inventada.**

A hipótese da Lógica (`intencao_principal`, `funnel`, `logical_output_contract`) **não é sobrescrita**. A SERP muda a resposta canônica; a proveniência de quem propôs o quê continua legível.

### 2. Leitura canônica com a SERP na frente

`readCanonicalKeywordDna` passa a resolver, por eixo:

```text
evidencia_serp conclusiva e não invalidada   →  source = "serp"
senão, decisão humana                         →  source = "human"
senão, hipótese lógica                        →  source = "logic"
senão                                         →  null, com state honesto
```

O read model ganha `intentSource`, `funnelSource`, `nicheSource`. Nicho não tem eixo SERP; sua fonte é humano ou Lógica.

`HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO` continua valendo: uma decisão humana de intenção **não** vence a SERP conclusiva. O que o humano pode fazer é **invalidar a evidência** (`invalidateSerpEvidence`, com motivo obrigatório); a partir daí a leitura volta para humano > Lógica até nova coleta. A UI dessa invalidação não faz parte desta SDD.

Consumidores que precisam da hipótese lógica pura — a coluna "Lógica" do painel de consolidação — pedem `{ includeSerpEvidence: false }`.

### 3. Consequência na aprovação

`evidencia_serp` fica dentro de `analise_semantica`, portanto **dentro da assinatura do pacote aprovado**. Nova SERP depois da aprovação muda a assinatura → status efetivo `em_revisao` → nova aprovação → o Arquiteto recebe o pacote reescrito. Exatamente o contrato de 2026-09-18, agora cobrindo a evidência que tem mais autoridade.

O pacote aprovado passa a carregar a SERP **como dado próprio**, não só como referência lateral. `keywordDnaFromPackage` lê a evidência de dentro do pacote quando o payload não traz `semanticQualification`.

### 4. Backfill

Keywords com Qualificação persistida e sem `evidencia_serp` na linha ficam com a leitura antiga até o backfill. `scripts/minerador-backfill-evidencia-serp.mts` (dry-run por padrão, `--apply` grava) lê a versão vigente de cada artifact e grava o registro correspondente, com readback. Keyword aprovada cujo backfill mude a assinatura cai em `em_revisao` — é o comportamento correto, e o dry-run lista quantas.

## O que NÃO muda

- O artifact `keyword_semantic_qualification` continua sendo a fonte versionada e imutável; o registro na linha é projeção dele, com `versionId` e `contentHash` para conferência.
- `semanticQualification` continua viajando no handoff. O Arquiteto não é tocado.
- Volume, Resultados, KGR: intocados. A SERP semântica continua sem participar do KGR.
- Nenhuma migration: `analise_semantica` é `jsonb`.

## Validação

- `tests/minerador-evidencia-serp-forte.test.mts`: registro a partir da qualificação; SERP conclusiva vence Lógica e humano; SERP não conclusiva não inventa; invalidação humana devolve a leitura; `includeSerpEvidence: false` preserva a hipótese; nova SERP depois da aprovação rebaixa para `em_revisao`; pacote carrega a evidência.
- `tests/minerador-keyword-dna-fechado.test.mts`: fonte `serp` sai da própria linha, sem `serp` explícito.
- Suítes `minerador-*` e `test:arquiteto` contra o baseline (28 · 2).

```text
SERP_CONCLUSIVE_IS_STRONG_EVIDENCE = YES
SERP_EVIDENCE_LIVES_IN_KEYWORD_ROW = YES
SERP_OVERWRITES_LOGIC_HYPOTHESIS = NO      // muda a resposta, preserva a proveniência
HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO
HUMAN_CAN_INVALIDATE_BAD_SERP_EVIDENCE = YES
NEW_SERP_AFTER_APPROVAL_REQUIRES_REAPPROVAL = YES
```
