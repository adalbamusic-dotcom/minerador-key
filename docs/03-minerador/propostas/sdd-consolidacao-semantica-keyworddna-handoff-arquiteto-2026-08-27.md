# SDD — Consolidação semântica do KeywordDNA e handoff fechado Minerador → Arquiteto

Status: **DRAFT — READY_FOR_SDD_APPROVAL**
Módulo proprietário: **Minerador**
Data: **2026-08-27**
Tipo: **auditoria estrutural + decisão de contrato**

## 1. Gate desta etapa

Esta etapa documenta a decisão necessária antes de qualquer mudança de runtime, persistência ou provider. Não há implementação funcional nesta SDD.

| Item | Estado desta etapa |
| --- | --- |
| Código de aplicação | não alterado |
| UI/InfoHints | não alterados |
| Chamadas DataForSEO | 0 |
| Chamadas DeepSeek | 0 |
| Banco remoto | não acessado para escrita |
| Schema/migration/RLS | não alterados |
| Arquiteto | não alterado |
| Aprovação para implementação | pendente |

O working tree já continha alterações de tarefas anteriores. Elas foram preservadas e não são atribuídas a esta SDD.

## 2. Decisão que esta SDD pede

O Minerador é o proprietário canônico da consolidação semântica individual de uma keyword. Intenção e Funil consolidados saem do Minerador junto com a versão do KeywordDNA; o Arquiteto os consome como contexto upstream somente leitura e não pode reclassificá-los silenciosamente.

```text
Keyword original
  → Lógica determinística
  → IA independente/revisora
  → SERP de qualificação explícita
  → Revisão humana
  → KeywordDNA consolidado, versionado e imutável
  → handoff Minerador → Arquiteto com referência exata de versão
```

O Minerador qualifica uma keyword; o Arquiteto forma ArticleDNA, avalia compatibilidade entre keywords e decide agrupamento, papel, silo e arquitetura.

## 3. Escopo e não escopo

### Escopo da decisão

- definir autoridade, evidência, proveniência e governança humana para Intent e Funnel canônicos;
- definir a relação entre a SERP de qualificação do Minerador e a SERP de compatibilidade do Arquiteto;
- definir a unidade versionada que o handoff deve carregar;
- registrar lacunas concretas do contrato atual, consumidores, riscos, compatibilidade, rollback e plano de testes;
- propor uma sequência front-first antes de persistência estrutural.

### Não escopo desta etapa

- não criar campos, tabelas, migrations, RPCs, RLS ou backfill;
- não alterar Google Ads, DataForSEO, DeepSeek, prompts, quotas ou chamadas externas;
- não alterar motor lógico, KGR, status, tabela, Perfil, revisão ou handlers;
- não alterar ArticleDNA, SiloDNA/SiloPage, Radar, Planejador ou Publicações;
- não atualizar `estado-atual.md` ou `backlog.md` como se a decisão estivesse implementada.

## 4. Evidência auditada — estado atual

| Área | Evidência local auditada | Estado confirmado |
| --- | --- | --- |
| Leitura canônica do Minerador | `lib/minerador/logical-read-model.ts` | Resolve Intenção, Nicho e Funil a partir do contrato lógico, decisões humanas e campos legados; intenção externa DataForSEO é excluída do caminho canônico. |
| Snapshot de consumo | `lib/minerador/canonical-keyword-snapshot.ts` | Tabela, Perfil, revisão e decisão consomem projeção read-only comum; ela não cria versão consolidada. |
| Lógica | `lib/minerador/logical-processor.ts` e `logical_output_contract` | Há proposta determinística com versão do motor, `logicInputHash`, timestamp e estado por campo. |
| IA/R5 | `lib/minerador/semantic-review*.ts` e `app/api/process-intent-niche/route.ts` | IA é revisão com `inputHash`, fases e evidências; não é aprovação humana. |
| Revisão humana | `lib/minerador/human-review.ts` | Há decisões, overrides e vínculo ao hash da IA no JSON semântico atual. |
| Métricas/KGR | `lib/minerador/processor-revalidation.ts`, `dataforseo-*` e `kgr-*` | Volume/Resultado têm proveniência e revalidação; KGR é derivado de Volume + Resultado e aplicabilidade humana é separada. |
| Gate de saída | `lib/minerador/arquiteto-handoff-gates.ts` | Exige Lógica, Volume, Resultados, KGR tratado, IA, revisão e status; não exige uma versão semântica fechada separada. |
| Handoff atual | `lib/arquiteto/minerador-handoff.ts` e `app/api/arquiteto/handoff/route.ts` | Workflow registra `source_entity_id`, `source_version_id` e `source_content_hash`, mas estes podem ser nulos e o payload não contém consolidação semântica explícita. |
| Consumo no Arquiteto | `lib/arquiteto/canonical-workspace.ts` e `lib/arquiteto/adapters.ts` | O Arquiteto projeta `keyword.intent`/`analise_semantica` e adapta um KeywordDNA legado; não recebe contrato fechado de Intent/Funnel. |
| SERP do Arquiteto | `app/api/arquiteto/serp/route.ts`, `lib/arquiteto/dataforseo-serp-compatibility.ts`, `lib/arquiteto/serp-formation.ts` | Usa DataForSEO para compatibilidade de formação e monta snapshots/assessments próprios, vinculados ao artigo. |

### 4.1 Campos semânticos atuais

O estado atual consegue projetar valores, mas eles estão distribuídos entre `minerador_keywords.intent`, `analise_semantica.logical_output_contract`, `analise_semantica.funnel`, `analise_semantica.ai_review` e `analise_semantica.human_review`.

Isso é suficiente para leitura operacional, mas não prova uma única versão imutável que congele, no mesmo envelope, valor final, força, proveniência, decisão humana e referências de evidência de Intent e Funnel.

### 4.2 Contrato SERP atual

O Minerador possui DataForSEO para `allintitle` e Keyword Overview dentro do processo de Resultados. Eles preservam provider, query, targeting, timestamps, request/operation IDs e histórico, mas não constituem uma SERP semântica de qualificação versionada e referenciável pelo KeywordDNA consolidado.

O Arquiteto também usa DataForSEO, porém para compatibilidade de formação editorial. Seus snapshots pertencem ao assessment do artigo e não podem virar reclassificação individual da keyword.

### 4.3 Versão e handoff atuais

O workflow de handoff já comporta `sourceVersionId` e `sourceContentHash` de forma aditiva. Porém, o produtor atual não oferece um KeywordDNA consolidado persistido e imutável que preencha essas referências com segurança. O adaptador do Arquiteto cria uma referência legada a partir da linha atual; isso é compatibilidade de leitura, não prova de consolidação remota fechada.

## 5. Lacuna e conclusão da auditoria

O contrato atual não representa com segurança, na mesma versão de KeywordDNA:

1. Intent e Funnel independentes, com valor, força, proveniência, evidências e decisão humana;
2. referência imutável a cada evidência semântica, inclusive SERP de qualificação;
3. relação verificável entre versão consolidada e handoff;
4. identificação de mesmo snapshot por ID/hash, distinguindo-o de nova evidência;
5. pedido upstream de revisão disparado pelo Arquiteto sem mutar o Minerador.

Não é seguro declarar que o JSON atual mais referências opcionais resolve a consolidação/handoff propostos. A implementação futura requer contrato persistido aditivo e migration aprovada; não cabe criar uma convenção local no navegador ou em campos legados.

## 6. Contrato canônico proposto

### 6.1 Autoridade por camada

| Camada | Papel | Pode alterar Intent/Funnel canônicos? |
| --- | --- | --- |
| Keyword original | objeto primário | não; é entrada preservada |
| Lógica | hipótese determinística explicável | não sem revisão/consolidação |
| IA | leitura independente, comparação e proposta | não; nunca aprova sozinha |
| SERP de qualificação | evidência externa explícita | não; reforça, contradiz ou deixa inconclusivo |
| Revisão humana | decisão final e justificativa | sim, ao consolidar nova versão |
| Minerador | proprietário do KeywordDNA consolidado | sim, somente por comando humano persistido |
| Arquiteto | consumidor/read-only para a keyword | não; somente avalia compatibilidade editorial |

O humano governa a decisão, mas não é apresentado como “evidência”. Um override humano de SERP forte precisa de justificativa explícita na nova versão; isso preserva auditabilidade sem automatizar a decisão.

### 6.2 Intent e Funnel são dimensões independentes

Cada dimensão deve carregar decisão própria:

```text
SemanticDecisionField = {
  value: IntentValue | FunnelValue | explicit_unknown,
  strength: strong | moderate | weak | insufficient,
  provenance: logic | ai | serp | human | mixed,
  evidenceRefs: EvidenceRef[],
  humanDecision: keep_logic | accept_ai | override | confirm_unknown,
  rationale: string | null
}
```

`Funnel` não é derivado automaticamente de `Intent`. A IA e a SERP podem discordar de uma dimensão sem alterar a outra. Ausência de evidência suficiente produz `explicit_unknown`/`Indefinido`, jamais classificação fabricada ou `Pendente` apresentado como valor final.

### 6.3 SERP de qualificação

A futura ação de qualificação semântica por SERP deve ser explícita no Minerador, usando a infraestrutura DataForSEO já canônica. Ela recebe a keyword oficial e o targeting, produz evidência externa versionada e pode reforçar, contradizer ou ser inconclusiva. Não chama o Arquiteto, não altera métricas, não substitui IA e não promove status editorial. O desenho de endpoint, quota e payload é tarefa posterior.

### 6.4 Evidências e igualdade de snapshot

Todo `EvidenceRef` futuro deve identificar sem ambiguidade:

```text
{ evidenceId, kind, provider, providerVersion, contentHash,
  keywordId, brandId, targetingFingerprint, collectedAt }
```

Dois consumidores que usarem o mesmo `evidenceId` ou o mesmo par verificável `contentHash + targetingFingerprint` devem tratá-lo como a mesma evidência. Divergência derivada dela é `DERIVATION_INCONSISTENCY`, não nova contradição de SERP. Uma SERP nova, com nova identidade/hash ou targeting/materialidade distinta, é nova evidência. O Arquiteto pode emitir `INTENT_REVIEW_REQUIRED` para o Minerador; não pode sobrescrever KeywordDNA, ArticleDNA anterior ou decisão humana upstream.

### 6.5 Envelope consolidado e imutabilidade

Após aprovação, a unidade persistida proposta é um `KeywordDNAConsolidatedVersion` aditivo, com ao menos:

```text
{ versionId, keywordId, brandId, versionNumber, previousVersionId,
  contentHash, createdAt, createdBy, changeReason,
  semantic: { intent: SemanticDecisionField, funnel: SemanticDecisionField },
  evidenceRefs, logicRef, aiReviewRef, humanReviewRef,
  quantitativeEvidenceRefs, kgrRef, sourceSnapshotRef }
```

Uma versão consolidada é append-only. Revisão material cria sucessora com `previousVersionId`; reabrir sem mudança material não fabrica versão. Dados quantitativos, snapshots e decisões anteriores permanecem auditáveis. Essa forma é proposta de contrato, não nome definitivo de tabela nem autorização para migration.

### 6.6 Handoff fechado

O handoff aprovado deve apontar obrigatoriamente para a versão consolidada:

```text
Minerador → editorial_workflow_item
  source_entity_id      = keywordId
  source_version_id     = KeywordDNAConsolidatedVersion.versionId
  source_content_hash   = KeywordDNAConsolidatedVersion.contentHash
  payload               = identidade mínima e estado de transporte
```

O Arquiteto carrega a versão referida, não recompõe Intent/Funnel da linha viva do Minerador. Se a referência não estiver disponível ou não pertencer à mesma `brandId`, o handoff é bloqueado. A exigência preserva idempotência e não recria keyword publicada/incorporada.

## 7. Regras para o Arquiteto

1. Intent/Funnel recebidos são upstream/read-only para a keyword.
2. O Arquiteto pode comparar keywords e registrar compatibilidade, canibalização, conflito de formação e necessidade de revisão.
3. O Arquiteto não reclassifica nem persiste intenção/funil da keyword dentro de ArticleDNA ou working copy.
4. A SERP do Arquiteto permanece de compatibilidade da formação; não vira autoridade semântica individual por efeito colateral.
5. Mesma evidência com interpretação divergente registra `DERIVATION_INCONSISTENCY`, sem provider call e sem novo fato.
6. SERP materialmente nova registra `INTENT_REVIEW_REQUIRED` com referências, sem sobrescrever upstream.
7. Versão posterior do Minerador não troca o input de ArticleDNA já formado sem fluxo explícito de atualização.

## 8. Compatibilidade, consumidores e impacto

| Consumidor | Contrato a preservar | Ajuste futuro necessário |
| --- | --- | --- |
| Tabela/Perfil/Decisão do Minerador | `resolveCanonicalKeywordSnapshot` read-only | ler versão consolidada quando existir, com fallback legado explícito |
| Revisão humana | decisões e overrides existentes | materializar versão somente em conclusão humana válida; não apagar histórico |
| KGR e métricas | Volume + Resultado, null/zero e proveniência | permanecer independentes da consolidação semântica |
| Gate de handoff | gates atuais de Lógica/Volume/Resultados/KGR/IA/Revisão/status | exigir `sourceVersionId/contentHash` consolidado após rollout |
| `editorial_workflow_items` | idempotência e isolamento por brand | persistir referência obrigatória à versão consolidada |
| Workspace do Arquiteto | keyword disponível como não agrupada e refs legadas | ler envelope versionado; nunca sobrescrever semântica upstream |
| ArticleDNA e SERP de compatibilidade | referências de KeywordDNA e formação | distinguir assinatura de snapshot compartilhado de nova coleta |

Dados legados sem versão consolidada permanecem legíveis como `legacy/unconsolidated`; envio novo deve ser bloqueado ou exigir consolidação explícita conforme plano aprovado. Não haverá backfill inferido por `updated_at`, status, IA ou mera existência de `analise_semantica`.

## 9. Plano front-first proposto

### Fase A — read-model e UX sem mutação estrutural

- Exibir, nos painéis existentes, fontes por dimensão: Lógica, IA, SERP de qualificação (ausente até existir) e decisão humana.
- Exibir força, proveniência e divergência sem transformar ausência em fato.
- Mostrar estado de handoff como “consolidação necessária” onde aplicável.
- Reutilizar InfoHint e componentes existentes; sem redesenho de tabela.

### Fase B — comando humano e contrato de consolidação

- Definir persistência, autorização, readback, histórico, idempotência, rollback e migration em adendo/SDD de implementação.
- Persistir nova versão somente após revisão humana explícita e readback.
- Não retroescrever registros enviados/publicados.

### Fase C — handoff e consumidor do Arquiteto

- Exigir referência consolidada no gate e workflow item.
- Carregar a versão no Arquiteto como contexto somente leitura.
- Introduzir alertas de derivação/revisão upstream sem mutação intermodular silenciosa.

### Fase D — SERP semântica explícita

- Projetar request, persistência, cost/usage e freshness usando DataForSEO existente.
- Acrescentar evidência ao fluxo de consolidação, nunca como chamada ao abrir tela, selecionar linha ou formar artigo.

## 10. Mudança estrutural, migration e rollback

O contrato alvo requer mudança estrutural aditiva. A forma atual não garante imutabilidade de consolidação nem referências duráveis de evidência semântica por versão.

Antes de implementação, um adendo deve escolher entre nova entidade/tabela versionada ou extensão de infraestrutura versionada já capaz de garantir `brandId`, append-only, hash, predecessor, RLS e readback. JSONB mutável não é substituto suficiente sem prova específica de append-only/versionamento.

Rollback: rollout por leitura compatível sem remover campos atuais; novas versões apenas em caminho explicitamente habilitado; fallback legado visível sem promoção a consolidado; reversão do consumidor ao read-model atual se o envelope falhar; e migration futura com rollback compatível com append-only, sem apagar evidências nem decisões humanas.

## 11. Riscos e guardas

| Risco | Guarda exigida |
| --- | --- |
| Duas verdades entre `intent`, JSON e versão | versão consolidada como fonte do handoff; campos legados apenas compatibilidade explícita |
| SERP do Arquiteto reclassificar keyword | separação por propósito e evento upstream, sem mutação cruzada |
| Mesmo snapshot parecer conflito novo | `evidenceId`/hash/fingerprint e `DERIVATION_INCONSISTENCY` |
| Targeting distinto ser ignorado | fingerprint e instante na identidade da evidência |
| IA aprovar sozinha | consolidação somente por comando humano persistido/readback |
| KGR/métricas invalidados por revisão | artefatos independentes; KGR apenas Volume + Resultado |
| Drift entre marcas | todo ref, query e handoff verificado por `brandId` |
| Backfill inferir decisão humana | legado não consolidado; nenhuma inferência silenciosa |

## 12. Plano de testes futuro

Os testes são da implementação posterior e não foram executados nesta SDD:

1. Manicure convergente: Lógica, IA e SERP concordam; humano consolida e handoff aponta à versão exata.
2. SERP inconclusiva: mantém incerteza explícita; não inventa Intent/Funnel; humano pode confirmar desconhecido.
3. Divergência forte: revisão exige decisão e justificativa quando houver override de evidência forte.
4. Mesmo snapshot no Minerador e Arquiteto: `DERIVATION_INCONSISTENCY`, sem nova chamada provider.
5. Nova SERP no Arquiteto: `INTENT_REVIEW_REQUIRED`, sem alterar KeywordDNA/ArticleDNA existente.
6. Versão antiga versus nova: handoff/ArticleDNA anterior seguem apontando a versão recebida.
7. Processos independentes: consolidação não altera Volume, Resultado, KD, CPC, KGR, aplicabilidade ou histórico.
8. Handoff idempotente e proteção de publicada/incorporada.
9. Isolamento cross-brand de versão/evidência/handoff.
10. Falha de persistência: UI não promove versão/handoff antes de readback; estado anterior preservado.

## 13. Resultado da auditoria

```text
CURRENT_KEYWORDDNA_HANDOFF = workflow item com sourceVersionId/sourceContentHash opcionais; não há KeywordDNA semântico consolidado persistido
CURRENT_INTENT_FIELDS = keyword.intent + logical_output_contract + analise_semantica + human_review/read-model
CURRENT_FUNNEL_FIELDS = logical_output_contract + analise_semantica.funnel + human_review/read-model

CURRENT_SERP_SNAPSHOT_CONTRACT = Resultados/Overview no Minerador e snapshots de compatibilidade por ArticleDNA no Arquiteto; finalidades distintas
CURRENT_SERP_PERSISTENCE = measurements/histórico no Minerador; snapshots/assessments editoriais no Arquiteto
CURRENT_SERP_PROVIDER = DataForSEO compartilhado

CAN_REUSE_SERP_SNAPSHOT_WITHOUT_SCHEMA = NO
CAN_REPRESENT_SEMANTIC_CONSOLIDATION_WITH_EXISTING_CONTRACTS = NO

CURRENT_KEYWORDDNA_VERSIONING = adaptação legada/referências de leitura; não há versão semântica consolidada fechada no Minerador
CURRENT_HANDOFF_VERSIONING = suporta refs, mas aceita nulos e não exige versão consolidada

ARQUITETO_CURRENT_INTENT_CONSUMER = projeção de keyword.intent/analise_semantica e adaptador legado
ARQUITETO_CURRENT_FUNNEL_CONSUMER = não há contrato fechado de consumo; depende de payload vivo/adaptadores
ARQUITETO_CURRENT_SERP_CONSUMER = DataForSEO para compatibilidade de formação, não qualificação semântica canônica da keyword
```

## 14. Pedido de aprovação

Aprovar esta SDD autoriza somente planejamento detalhado de implementação aditiva. Não autoriza migration, schema, provider call, backfill, mudança RLS, troca de consumidor do Arquiteto ou escrita remota sem adendo estrutural correspondente.

```text
SDD_CREATED = YES
MINERADOR_SEMANTIC_CONSOLIDATION_CONTRACT = PROPOSED
SERP_EVIDENCE_AUTHORITY = STRONG_EXTERNAL_EVIDENCE_NOT_AUTOMATIC_DECISION
HUMAN_GOVERNANCE_AUTHORITY = FINAL_DECISION_WITH_EXPLICIT_JUSTIFICATION

CANONICAL_INTENT_OWNER = MINERADOR
CANONICAL_FUNNEL_OWNER = MINERADOR
ARQUITETO_CAN_RECLASSIFY_INTENT = NO
ARQUITETO_CAN_RECLASSIFY_FUNNEL = NO
SAME_SERP_CAN_CONTRADICT_AS_NEW_EVIDENCE = NO
NEW_SERP_CAN_TRIGGER_UPSTREAM_REVIEW = YES
KEYWORDDNA_CONSOLIDATED_VERSION_IMMUTABLE = YES

## Adendo documental A — front aprovado e autoridade da SERP semântica — 2026-08-28

Status: **DRAFT — regra canônica documentada; não autoriza mudança estrutural**.

### A.1 Evidência do front e limite desta etapa

O usuário confirmou manualmente, em navegador autenticado, a composição do Perfil: `Lógica 25% + Google Ads 25% + Qualificação Semântica 50%` e `Revisão Humana 50% + Decisão 50%`. O card independente DataForSEO foi retirado somente da composição; seus fatos permanecem na Decisão e na proveniência, recolhida sob Decisão. Esta confirmação não prova provider, persistência, readback, consolidação remota ou handoff real.

### A.2 Autoridade por Intenção e Funil

Lógica continua hipótese determinística inicial. IA continua revisão, enriquecimento e contexto, sem autoridade para definir ou votar Intenção/Funil canônicos. Intenção e Funil são independentes; `Local` não implica `BOFU`.

Uma futura SERP de qualificação individual válida e conclusiva fecha a dimensão que ela evidencia. A decisão humana não substitui arbitrariamente uma SERP válida e conclusiva: ela pode invalidar a evidência por defeito verificável de query, targeting, coleta, qualidade ou materialidade e exigir nova coleta. SERP inconclusiva preserva incerteza explícita; valor final sem evidência suficiente é `Indefinido`, nunca `Pendente`.

### A.3 Separação entre consumidores e próximos contratos

O Minerador usa SERP para qualificar uma keyword individual; o Arquiteto usa SERP para compatibilidade de formação; e o Radar investiga o ArticleDNA. O mesmo snapshot reaproveitado não constitui evidência independente. Nova evidência material no Arquiteto gera apenas `INTENT_REVIEW_REQUIRED` upstream e nunca muda silenciosamente KeywordDNA, ArticleDNA ou decisão humana.

KGR segue exclusivamente `Volume + Resultado`. O handoff futuro deverá usar KeywordDNA consolidado, persistido, imutável e referenciável; o Arquiteto lerá Intenção/Funil upstream em modo somente leitura. A escolha de entidade, migration, RLS, persistência, rollout, readback e testes de implementação continua dependente de adendo estrutural aprovado.

```text
FRONT_PROFILE_LAYOUT = MANUALLY_VALIDATED_BY_USER
REAL_SEMANTIC_SERP = PENDING
REMOTE_CONSOLIDATED_KEYWORDDNA = PENDING
REAL_HANDOFF_TO_ARCHITECT = PENDING
AI_CAN_DEFINE_INTENT = NO
AI_CAN_DEFINE_FUNNEL = NO
HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO
HUMAN_CAN_INVALIDATE_BAD_SERP_EVIDENCE = YES
```
