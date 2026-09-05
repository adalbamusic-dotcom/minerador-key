## Fase 2C — consolidação de Silo a partir de Território confirmado — 2026-09-03

```text
SILO_WORKING_COPY_AUTHORITY   = REMOTE (buildCopy só origina proposta inicial)
SILO_PAGE_APPROVAL_GATE       = PRESENT (decisão própria, independente do SiloDNA)
CONSOLIDATION_PATH            = POST /api/arquiteto/silo-consolidation -> persist_silo_from_working_copy_atomic
RETRY_ENVELOPE_OWNER          = silo-consolidation-operation.ts (envelope congelado)
SILO_PAGE_APPROVAL_UI         = MISSING (gate existe; falta a tela que monta a decisão)
NEW_DDL = 0 · NEW_MIGRATION = 0 · PROVIDER_CALLS = 0
```

- **Relatório completo:** `docs/04-arquiteto/relatorio-fase-2c-silo-first.md` —
  o que foi feito, por quê, as invariantes que passaram a valer e como continuar.
- **Autoridade remota da working copy** (`silo-working-copy-bridge.ts`): a linha
  remota vence o estado local. Pilar, Suportes e exclusões persistem com o
  `expectedLock` da cópia carregada; sucesso é o readback, não o `setState`.
  `STALE_WORKING_COPY` recarrega e informa o conflito sem sobrescrever e sem
  retry automático; `WORKING_COPY_ALREADY_CONSUMED` deixa a tela somente-leitura.
- **Gate próprio da SiloPage** (`silo-page-approval.ts`): SiloDNA aprovado não
  aprova SiloPage. A decisão carrega ator, momento, motivo e a versão/hash sobre
  a qual decidiu. IA não aprova. `refuseStatusEscalation` consome a readiness já
  resolvida em vez de recalcular — recalcular criaria duas autoridades.
- **Envelope de retry** (`silo-consolidation-operation.ts`): o envelope é
  construído uma vez e reenviado byte a byte. Reconstruí-lo geraria
  `versionId`/`createdAt` novos e a RPC não reconheceria o replay. Falha
  indeterminada guarda a operação; só o readback encerra.
- **Caminho canônico único:** a interface ainda chamava `persistArquitetoSiloPair`,
  travado em draft-only desde a 2C.4.6 — na prática a consolidação estava
  quebrada na tela. Agora vai pela rota canônica, partindo do snapshot remoto.
- **Narrativa territorial preservada:** `SiloDNA.territoryNarrative` é cópia fiel
  de `Territory.narrative`, comparada como snapshot exato. Ausência tem código
  próprio (`TERRITORY_NARRATIVE_MISSING`), separado de divergência.
- **Recuperação do `territory.ts`:** reconstruído a partir do JS transpilado após
  um script de faixa de linhas apagar 814 linhas de um arquivo untracked. 1.032
  linhas, 61 exports conferidos. Scripts de splice por faixa ficam proibidos.
- **Validação:** `test:arquiteto` 735/734/1 (falha restante pré-existente),
  `test:marca` 81/81, `test:redator` 3/3. TypeScript 5 pré-existentes e 0 novos,
  lint limpo nos 7 módulos novos e alterados, `git diff --check` limpo.
  `test:operational` (9) e `test:authz` (2) seguem falhando por deriva
  pré-existente em trechos não tocados. Interface não validada manualmente;
  smoke em `docs/04-arquiteto/smoke-silo-consolidacao-2c.md` pendente.

## SERP: reexecução, versionamento e vigente x tentativa — 2026-08-29

```text
SERP_LOGICAL_ID = articleId (estável entre execuções)
SERP_VERSION_ID = serp-formation:{brandId}:{articleId}:v{N}
SERP_CURRENT_SELECTOR = currentSerpAssessments / latestActiveSerpFormationAssessment
CURRENT_VERSION_COUNT = 1 por Article · HISTORY_VERSION_COUNT = N-1 (imutável)
REFRESH_FAILURE_INVALIDATES_CURRENT = NO
```

- **Registro canônico** (`lib/arquiteto/serp-assessment-registry.ts`): uma única
  avaliação vigente por Article, histórico preservado como `outdated`, resposta
  repetida para o mesmo Article resolvida pela última, e reexecução com conteúdo
  idêntico mantendo a versão vigente sem duplicar nem gerar falso erro.
- **Readback por versão nova:** a confirmação passou a comparar apenas o que
  acabou de ser escrito (`confirmTargets`), não o histórico com a mesma
  identidade lógica — origem do erro "Não confirmados: group-tsxaq3,
  group-tsxaq3".
- **Projeção sem revalidação:** mover a versão anterior para o histórico não
  reprocessa o schema; uma avaliação antiga gravada em formato anterior não
  derruba mais uma atualização válida.
- **Seleção deduplicada:** o mesmo Article não é enviado duas vezes na mesma
  execução, o que criava duas avaliações vigentes concorrentes.
- **Vigente x tentativa:** `CURRENT_SERP_STATE` e `LAST_REFRESH_ATTEMPT` são
  estados distintos. Com avaliação vigente, uma atualização que falha mostra
  "Última atualização da SERP falhou" + `[Repetir atualização]`, mantendo o
  processo em `Concluída`. Só sem avaliação vigente o Article fica em
  `SERP · Erro`. O gate da IA continua olhando a avaliação vigente.
- **Validação:** `test:arquiteto` 281 testes, 280 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## SERP: veredito humano único e readback por assessment — 2026-08-29

```text
SERP_HUMAN_VERDICT_SOURCE = resolveSerpFormationVerdict (COMPATIBLE | INCONCLUSIVE | DIVERGENCE)
COMPATIBLE_HUMAN_DECISION_REQUIRED = NO
INCONCLUSIVE_HUMAN_DECISION_REQUIRED = NO
DIVERGENCE_HUMAN_DECISION_REQUIRED = YES
READBACK_EXPECTATION_BEFORE = confirmed.assessments.length === assessments.length
READBACK_EXPECTATION_AFTER  = confirmação por assessment (id + hash + snapshots + recomendações)
```

- **Veredito único:** o estado que governa a decisão humana passou a ser só o
  veredito canônico. Campos técnicos legados (`Conclusão arquitetural: Revisar`,
  `Com conflito observado`, cards `PENDING`, `Seguir recomendação`/`Ignorar`)
  saíram da superfície humana quando o veredito é compatível ou inconclusivo:
  ficam preservados dentro de `Detalhes técnicos da SERP` e foram relabelados
  como sinais, não conflitos. Nada foi apagado do histórico.
- **Observações da SERP:** com veredito não divergente, os fatos por keyword
  aparecem como observação — intenção upstream, comportamento observado,
  sobreposição, página dominante, força da evidência e impacto arquitetural
  `Nenhum` — sem ações obrigatórias.
- **Conflito técnico deixou de contaminar gates:** indicador da planilha,
  status de aprovação e gate do Radar só tratam `assessment.conflicts` como
  pendência quando o veredito é `DIVERGENCE`.
- **Causa raiz do readback:** ao reexecutar, o mesmo `assessmentId` voltava e a
  lista guardava a versão anterior marcada como desatualizada junto com a nova;
  o mapa de readback (indexado por id) devolvia só a nova e a comparação por
  hash acusava perda inexistente. Correção: a versão anterior de mesmo id sai da
  lista, e a confirmação passou a ser por assessment, informando exatamente
  quais artigos não confirmaram.
- **Mensagem legada removida:** "a execução da SERP é atômica hoje" não existe
  mais; o contrato vigente é `PARTIAL_BY_ARTICLE`.
- **Validação:** `test:arquiteto` 271 testes, 270 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## SERP de formação com sucesso parcial por Article — 2026-08-29

```text
SERP_BATCH_POLICY_BEFORE = ALL_OR_NOTHING (Promise.all)
SERP_BATCH_POLICY_AFTER  = PARTIAL_BY_ARTICLE (Promise.allSettled)
```

- **Isolamento:** cada Article vira um assessment independente. Falha de uma
  unidade não apaga as demais; o route devolve `assessments`, `failures[]`
  (articleId, principalKeywordId, stage, code, message, retryable) e `summary`
  (requested/completed/failed), tudo aditivo.
- **Erro global x específico:** `DataForSeoCanonicalError` (conexão, credencial,
  capability) e `IntegrationRuntimeError` (quota) continuam encerrando o lote;
  falha de provider, normalização, snapshot, refs ou assessment de uma unidade
  vira `failure` daquele Article. A classificação usa estágio e código reais do
  diagnóstico, sem categoria inventada.
- **Persistência:** apenas assessments válidos são gravados e passam pelo
  readback; falha nunca é persistida como avaliação concluída. A validação de
  integridade passou a ser por Article — um assessment incompleto vira falha da
  unidade em vez de invalidar o lote.
- **UI:** toast informa `SERP concluída: 5 de 5` ou
  `SERP parcial: 4 de 5 · 1 com erro` com o motivo de cada falha; o artigo com
  erro mostra estágio, código, motivo e o botão `Repetir SERP deste artigo`,
  que reexecuta somente aquela unidade.
- **IA:** o gate ficou por Article — artigos com SERP válida seguem para a
  revisão com IA e os sem SERP ficam de fora com aviso explícito. Nenhuma
  chamada automática: SERP e IA continuam saindo de ação humana.
- **Validação:** `test:arquiteto` 261 testes, 260 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo, `git diff --check`
  limpo. Interface não validada manualmente.

## Gate de importação simplificado: aprovado é suficiente — 2026-08-29

```text
IMPORT_GATE = status canônico Aprovado + Brand correta + lifecycle + sem duplicação
SEMANTIC_GATE = REMOVIDO
INCONCLUSIVO = informação, nunca bloqueio
```

- **Regra vigente:** se a keyword está canonicamente **Aprovada** no Minerador,
  ela está apta a ser importada. O Arquiteto não adiciona um segundo juiz
  semântico depois que o humano aprovou.
- **Deixaram de bloquear:** `semanticQualification.semanticState`, intenção
  ambígua/indeterminada, funil indefinido, nicho indeterminado, evidência SERP
  insuficiente ou inconclusiva, estado da IA do Minerador, ausência de
  Apresentação Contextual, KGR e aplicabilidade. Nada disso é erro: são
  resultados legítimos da análise.
- **Continuam bloqueando:** status diferente de aprovado, cross-brand,
  workflow remoto incompatível, keyword já recebida ou já incorporada em
  ArticleDNA.
- **Qualificação Semântica** segue transportada integralmente no handoff como
  informação somente leitura, incluindo o estado `non_conclusive`.
- **Linguagem corrigida:** o painel do Arquiteto mostra
  `Minerador · Aprovado` e, quando houver dimensões sem conclusão, apenas
  "Algumas dimensões permanecem indeterminadas pela evidência disponível".
  `Dados upstream incompletos` foi removido como diagnóstico de erro.
- **Apresentação Contextual:** permanece `OPTIONAL` e `NON_BLOCKING`; nenhuma
  decisão sobre removê-la foi tomada nesta frente.
- **Validação:** `test:arquiteto` 243 testes, 242 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## IA do Arquiteto: execução visível e contadores separados — 2026-08-29

```text
AI_STATE_AFTER_EXECUTION = COMPLETED_NO_PROPOSALS | COMPLETED_WITH_PROPOSALS
AI_TAB_STATE = espelha o read-model (nunca "Não executada" após execução real)
TOAST_COUNT_SOURCE = classificação final (propostas materiais)
```

- **Causa raiz:** a execução da IA só era percebida pela existência de proposta
  material. Com a classificação de no-op (correta), um artigo de uma keyword
  cuja IA devolveu `manter_no_artigo` ficava com `pendingProposalCount = 0`,
  sem anotação aplicada, e o read-model caía em `NOT_RUN` — enquanto o toast
  anunciava a contagem bruta do provider. Dois números, duas fontes.
- **Correção:** o read-model recebe `aiCompletedWithoutProposals` quando existe
  decisão da IA para o artigo e nenhuma é material; o toast passou a anunciar a
  classificação final (`Revisão arquitetural concluída. Nenhuma alteração
  estrutural foi recomendada.`).
- **Leitura da aba** (`lib/arquiteto/article-ai-readout.ts`): separa
  `Propostas da IA` de `Decisões pendentes do artigo`, explica quando a
  diferença existe, mostra o resumo do no-op (uma única keyword, formação
  mantida, SERP considerada, nenhuma mutação) e, para proposta material,
  keyword, estado atual, proposta, motivo, evidência considerada e impacto.
  A leitura é filtrada pelas keywords do próprio artigo.
- **Validação:** `test:arquiteto` 242 testes, 241 passando (falha restante
  pré-existente). TypeScript sem erros novos, lint limpo,
  `check:visual-system` exit 0. Interface não validada manualmente.

## Fronteira de aprovação do Article e ficha do ArticleDNA — 2026-08-29

```text
ARTICLE_APPROVAL_CREATES_RADAR = NO
ARTICLE_APPROVAL_REQUIRES_SILO = NO
READY_FOR_SILOS != READY_FOR_RADAR
RADAR_HANDOFF_REQUIRES_SILO = YES
RADAR_HANDOFF_REQUIRES_INTERNAL_LINK_GRAPH = YES
ARTICLE_FULL_DEFINITION_LAYOUT = ficha vertical por tópicos
ARTICLE_FULL_DEFINITION_READONLY = YES
```

- **Causa do crash:** `handleConfirmArticleArchitecture` e
  `confirmSelectedArchitectures` agendavam `pendingRadarSmoke`, e um efeito
  chamava `importApprovedToRadar` logo após o evento `approved`. Com o gate
  novo (artigo aprova sem Silo), `RadarItemSchema` recebia `siloId: null` e
  lançava ZodError. O acoplamento — não o schema — era o defeito.
- **Fronteira corrigida:** aprovar consolida, persiste, faz readback, marca
  aprovado e `Pronto para Silos`. Não cria RadarItem, PlannerItem nem
  PublicationItem. O handoff ao Radar continua sendo ação explícita e agora
  alimenta o readback do envio.
- **Nullable revertido:** `RadarItemSchema`, `PlannerItemSchema` e
  `OperationalPublicationSchema` voltaram a exigir `siloId: string`.
  `importArticlesToRadar` ignora versão sem Silo, então nenhuma unidade
  incompleta chega ao Radar mesmo por caminho indireto.
- **Dois derivadores distintos:** `resolveArticleSiloReadiness`
  (`READY_FOR_SILOS`) e `resolveArticleRadarReadiness` (`READY_FOR_RADAR`,
  exigindo Silo com SiloDNA/SiloPage aprovados, InternalLinkGraph aprovado e
  SERP íntegra). O gate `articleRadarGateIssues` ganhou as duas checagens.
- **Ficha do ArticleDNA:** `lib/arquiteto/article-dna-projection.ts` +
  `components/editorial/article-dna-readonly-panel.tsx` substituem o resumo
  anterior, no mesmo padrão do KeywordDNA: resumo compacto fechado e ficha
  vertical com Identidade, Arquitetura, Semântica, KGR, SERP, IA, Revisão,
  Proteções, Silo, Links e Proveniência técnica. Tudo somente leitura; os
  controles humanos continuam na aba Revisão.
- **Nota legada:** promessa, CTA e enriquecimento aparecem em "Notas e alertas"
  da ficha, explicitamente não bloqueantes.
- **Validação:** `test:arquiteto` 235 testes, 234 passando; `test:operational`
  50/41; `test:editorial` 20/16 — falhas restantes pré-existentes. TypeScript
  sem erros novos, lint limpo, `check:visual-system` exit 0. Interface não
  validada manualmente.

## Fechamento funcional da fase Artigos — 2026-08-29

```text
KEYWORD_FULL_PROFILE = ficha vertical por tópicos (sem grade ampla)
SERP_VERDICT = COMPATIBLE | INCONCLUSIVE | DIVERGENCE
ARTICLE_REVIEW = checklist único de decisões humanas
ARTICLE_APPROVAL_CTA = [Aprovar ArticleDNA] na aba Revisão
ARTICLE_STATUS_FLOW = Em formação → Aguardando revisão humana → Pronto para aprovação → Aprovado → Pronto para Silos
```

- **Perfil da keyword:** o resumo horizontal permanece; o accordion virou ficha
  vertical por tópicos (Identidade, Leitura lógica, Demanda, Competição SEO,
  Qualificação Semântica, KGR, Revisão upstream, Publicação, Apresentação
  Contextual e Proveniência técnica). `Revisão Minerador` saiu do resumo: é
  proveniência upstream, não decisão do Arquiteto. Legado incompleto abre com
  o aviso de que foi recebido antes do gate atual.
- **SERP (`lib/arquiteto/serp-formation-verdict.ts`):** evidência insuficiente
  passa a ser `Inconclusivo` — sem conflito bloqueante, sem decisão humana,
  estrutura mantida e botão `Atualizar SERP`. Divergência só existe com
  evidência suficiente e mostra keyword, papel atual, fato upstream, evidência
  observada, sobreposição, página dominante, força, recomendação, motivo e
  impacto, com as ações `Manter no artigo` e `Aplicar recomendação`. Artigo com
  uma única keyword nunca recebe conflito de agrupamento.
- **IA:** a aba explicita a função — segunda leitura arquitetural
  (pertencimento, Principal, papéis, canibalização, coerência com a SERP).
  Execução sem mutação continua concluída sem pendência.
- **Revisão humana (`lib/arquiteto/article-review-checklist.ts`):** painel
  único com todas as decisões obrigatórias (KGR do artigo, tipo de unidade,
  divergências SERP, propostas da IA, conflitos), cada uma respondendo o que
  falta, por quê e como resolver. Linguagem passou a ser "decisão pendente".
- **Aprovação explícita:** com zero pendências o artigo fica `Pronto para
  aprovação` e a aba exibe `[Aprovar ArticleDNA]`, que consolida, persiste e
  faz readback antes de virar `Aprovado`. O gate não exige Silo, categoria,
  CTA, promessa nem briefing do Planejador.
- **Tipo de unidade:** `Página de categoria` saiu da fase Artigos (é decisão de
  cluster/SiloPage); o rótulo canônico continua no contrato para publicados.
- **Validação:** `test:arquiteto` 227 testes, 226 passando (falha restante é
  pré-existente, em `modules/minerador/minerador-workspace.tsx`). TypeScript
  sem erros; lint limpo. Interface não validada manualmente.

## Perfil completo da KeywordDNA no Arquiteto — somente leitura e sem perda — 2026-08-29

```text
KEYWORD_PROFILE_MODE = READ_ONLY
KEYWORD_FULL_PROFILE_LOSSLESS = YES
MUTATION_CONTROLS = 0
ARTICLE_KGR_SEPARATE = YES
```

- **Correção do lote anterior:** `READ_ONLY` não significa parcial. A projeção
  passou a entregar resumo horizontal denso sempre visível (Volume, Resultados,
  Intenção, Funil, KGR, Aplicabilidade na primeira linha; CPC, KD, Tendência,
  Entidade, Confiança e Revisão Minerador na segunda) e todo o restante do DNA
  recebido dentro de `Ver perfil completo da keyword`.
- **Seções do perfil completo:** Identidade, Leitura lógica, Demanda · Google
  Ads, Competição SEO · DataForSEO, Qualificação Semântica do Minerador, KGR da
  keyword, Revisão humana do Minerador e Publicação/proteção. Seção sem dado
  recebido aparece com a explicação, em vez de sumir.
- **Losslessness:** qualquer chave de `analise_semantica` sem seção própria, a
  referência da versão, o payload do handoff e os estados de processo ficam
  acessíveis no subaccordion `Proveniência técnica`. Campo recebido não
  desaparece.
- **Apresentação Contextual restaurada:** o snapshot canônico do Arquiteto
  passou a transportar a apresentação persistida (`keywordPresentations`,
  aditivo e retrocompatível). O painel mostra texto integral, "Voz da Marca
  aplicada", versão, hash, provider/modelo e origem. Sem apresentação no
  handoff: "Não disponível para esta versão da KeywordDNA", sem IA e sem
  fallback.
- **Empilhamento:** Principal, Secundárias e Reforços usam o mesmo componente
  readonly, um abaixo do outro. O único controle do bloco é o select de papel
  no artigo, injetado pelo painel do artigo (`headerExtra`) — decisão de
  ArticleDNA, não de KeywordDNA.
- **Sem mutação:** o componente não tem input, textarea, select próprio,
  onChange, onClick nem ação de revisão upstream. KGR da keyword (score e
  aplicabilidade) e KGR do artigo continuam camadas distintas.
- **Validação:** `test:arquiteto` 216 testes, 215 passando (falha restante é
  pré-existente, em `modules/minerador/minerador-workspace.tsx`). TypeScript
  sem erros de código; lint limpo. Interface não validada manualmente.

## Gates de entrada e saída da fase Artigos — 2026-08-29

```text
IMPORT_ELIGIBILITY_SOURCE = resolveCanonicalMineradorArquitetoImportEligibility + semanticQualification.semanticState
INCOMPLETE_KEYWORD_IMPORT_FIXED = YES
ARTICLE_CONFIRM_REQUIRES_SILO = NO
READY_FOR_SILOS_DERIVER = resolveArticleSiloReadiness (lib/arquiteto/article-phase.ts)
AI_NOOP_PROPOSAL_BEHAVIOR = COMPLETED_NO_PROPOSALS (sem pendência humana)
LEGACY_EDITORIAL_GATE_FIELDS = promessa/CTA/enriquecimento → alerta informativo
```

- **Gate Minerador → Arquiteto:** a importabilidade canônica passou a exigir
  KeywordDNA consolidada. A fonte é a Qualificação Semântica persistida
  (`semanticQualification.semanticState === "conclusive"`), não rótulos da
  interface. Keyword aprovada sem qualificação conclusiva recebe
  `KEYWORD_DNA_NOT_READY`, aparece desabilitada com motivo legível e é
  recusada no writer canônico (`409`). Publicado protegido continua entrando
  pela identidade já existente; a importação segue seletiva e idempotente.
- **Sem requalificação no Arquiteto:** intenção, funil e fatos de KGR
  permanecem fatos upstream. A SERP do Arquiteto valida compatibilidade
  arquitetural e não completa KeywordDNA incompleta.
- **Article não depende de Silo:** `articleApprovalIssues` não exige mais
  `siloId` nem hierarquia Pilar/Suporte — ambos pertencem à etapa Silos,
  posterior a Artigos. A dependência circular (artigo não fechava sem Silo,
  Silo só nasce depois do ArticleDNA aprovado) foi removida.
- **Pronto para Silos:** derivador único `resolveArticleSiloReadiness` exige
  ArticleDNA consolidado, revisão humana resolvida, conflitos obrigatórios
  resolvidos, aprovação concluída e decisão KGR resolvida quando exigida. Os
  três pontos da interface (coluna Silo, resumo e seção Silo) passaram a ler o
  mesmo derivador, eliminando o estado incoerente
  "Em revisão + Com conflitos + Pronto para Silos".
- **IA sem mutação:** proposta `manter_no_artigo` + `manter_silo` + mesmo papel
  + sem ponto de decisão + sem conflito é registrada como execução sem
  alteração estrutural (`structuralChange: false`, `reviewState: reviewed`) e
  não gera pendência humana artificial. Propostas com mutação real continuam
  gerando revisão.
- **Campos editoriais fora do gate:** "Estratégia, promessa, CTA e fronteira"
  saiu de `humanPendingDecisions` do ArticleDNA-base e permanece como alerta
  informativo; ownership é do Planejador/Redator. Nada foi apagado do legado.
- **Consequência conhecida:** enquanto a decisão KGR do artigo não tiver campo
  canônico, um artigo não pleno com Principal aplicável permanece bloqueado
  para Silos por `kgrDecisionPending`. Ver
  `propostas/2026-08-28-pedido-estrutural-decisao-kgr-do-artigo.md`.
- **Validação:** `test:arquiteto` 204 testes, 203 passando; `test:operational`
  e `test:editorial` mantêm apenas falhas pré-existentes de asserções sobre
  arquivos em refatoração fora desta tarefa. TypeScript sem erros de código,
  lint sem novos problemas. Interface não validada manualmente.

## Regra final de KGR do artigo — 2026-08-28

```text
KEYWORD_KGR_SCORE = minerador_keywords.kgr_score / kgr (KeywordDNA.kgrScore) — lido, nunca recalculado
KEYWORD_KGR_APPLICABILITY = analise_semantica.kgr_aplicabilidade (readKgrApplicability) — lida, nunca sobrescrita
ARTICLE_KGR_DECISION = YES | NO | PENDING_HUMAN_DECISION | PENDING_APPLICABILITY | ABSENT
ARTICLE_KGR_DECISION_SOURCE = FULL_KGR_RULE | HUMAN_DECISION | CONFIRMED_KGR_BINDING | KEYWORD_APPLICABILITY_RULE | AWAITING_HUMAN_DECISION | AWAITING_KEYWORD_APPLICABILITY | MISSING_KGR_SCORE
FULL_KGR_THRESHOLD = 0.25 (estritamente kgr < 0.25)
ARTICLE_KGR_DECISION_UI = IMPLEMENTED_LOCAL
ARTICLE_KGR_DECISION_PERSISTENCE = WORKING_COPY_PAYLOAD_LOCAL
STRUCTURAL_KGR_DECISION_REQUIRED = NO
```

- **Regra vigente** (`lib/arquiteto/article-kgr-decision.ts`), sempre a partir da
  Principal aprovada: decisão humana já registrada no contrato canônico
  prevalece; score válido `>= 0` e `< 0.25` é **KGR pleno** (`Sim · KGR pleno`,
  token verde, sem pedir decisão humana); `0.25` exato não é pleno; `>= 0.25`
  com aplicabilidade `Aplicável` fica `A decidir` para o humano; `>= 0.25` com
  `Não aplicável` é `Não`; `>= 0.25` com aplicabilidade pendente permanece
  `Pendente`; score ausente permanece `—` e nunca vira zero.
- **Proveniência preservada:** `KEYWORD_KGR_SCORE`,
  `KEYWORD_KGR_APPLICABILITY`, `ARTICLE_KGR_DECISION` e
  `ARTICLE_KGR_DECISION_SOURCE` são fatos distintos. Secundárias e reforços
  mantêm score e aplicabilidade próprios; não há média, maioria nem contagem
  que classifique o artigo — a contagem de secundárias aplicáveis existe apenas
  como evidência para eventual proposta de revisão da Principal.
- **UI:** o resumo do artigo exibe a classificação do artigo com tom próprio; as
  keywords exibem `Aplicável / Não aplicável / Pendente`; o score decimal segue
  exclusivo do perfil completo da KeywordDNA. Na Revisão, o select
  `A decidir / Sim / Não` é decisão do Article e não reutiliza o select de
  aplicabilidade do KeywordDNA.
- **SERP:** para artigo não pleno com Principal aplicável, a aba mostra KGR da
  Principal, aplicabilidade upstream, competição observada, força da evidência
  e recomendação `Favorável / Desfavorável / Inconclusiva` quando derivável do
  assessment ativo. A SERP não altera score nem aplicabilidade upstream.

- **Persistência e versão:** a decisão humana usa o `payload` durável de
  `editorial_workflow_items`, validado server-side por Brand e `lock_version`.
  O envelope aditivo guarda estado, source, Principal/KeywordDNA (id, versão e
  hash quando disponíveis), score, aplicabilidade, ator, data e histórico. Uma
  mudança material da decisão ou da Principal cria sucessora do `ArticleDNA`;
  a versão aprovada anterior permanece imutável.
- **Gates:** `PENDING_HUMAN_DECISION` bloqueia a aprovação estrutural e o
  handoff real ao Radar. O Radar recebe `ArticleDNA.kgrIdentity` e não
  recalcula score ou aplicabilidade.
## SERP como evidência prioritária no Arquiteto — 2026-08-27

- **Evidência atual:** testes locais concluídos; homologação autenticada,
  persistência remota e F5 continuam pendentes de smoke manual. Não houve
  migration, DDL, DML administrativo ou chamada de provider nesta etapa.

- **Implementado localmente:** assessment ativo com cobertura completa,
  snapshots observáveis, recomendação e observação por KeywordDNA recebe
  precedência de recomendação na UI. A prioridade explica que Lógica é
  hipótese, IA interpreta e humano consolida; ela não aciona handler de
  regrouping, principal, slug ou aprovação.
- **Explicabilidade:** o painel mantém objeto/hipótese, intenção esperada e
  observada, compatibilidade, sobreposição, página dominante, competição,
  conflito, recomendação, motivo e insuficiência nas evidências já recebidas.
  Slug atual/provisório é exibido sem inventar recomendação SERP ausente.
- **Dependência estrutural registrada:**
  `propostas/2026-08-27-pedido-estrutural-serp-slug-structural-review.md`
  descreve a persistência de recomendação de slug e de
  `STRUCTURAL_REVIEW_REQUIRED` downstream. Radar, Planejador e Redator não
  foram alterados.
- **Validação:** testes SERP focados 32/32 passaram. Provider real, Chrome,
# Estado atual — Arquiteto

## Fundação InternalLinkGraph e atomicidade do par — estado vigente 2026-08-27

```text
INTERNAL_LINK_GRAPH_LOCAL = IMPLEMENTED
SILO_PAIR_ATOMICITY_LOCAL = IMPLEMENTED
MIGRATIONS_LOCAL = READY
ROLLBACK_LOCAL = READY_NOT_AUTOMATIC
REMOTE_MIGRATIONS = APPLIED_MANUALLY
REMOTE_PREFLIGHT = PASS_PRE_APPLY_READ_ONLY
REMOTE_POST_APPLY_READBACK = PASS
REMOTE_TRANSACTIONAL_SMOKE = PASS_ROLLED_BACK
REMOTE_CROSS_BRAND_SMOKE = PASS_ROLLED_BACK
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

- **InternalLinkGraph:** o contrato compartilhado e o domínio local agora
  preservam um grafo por `brandId = public.marcas.id` e Silo, com versões-base
  de SiloDNA/SiloPage, ArticleDNAs participantes, nós tipados, arestas
  dirigidas, hashes determinísticos, stale, propostas separadas e aprovação
  humana. KeywordDNA não é nó; SiloPage não é Pilar.
- **Persistência local preparada:**
  `20260826225145_internal_link_graph_foundation.sql` cria as quatro tabelas,
  constraints/FKs `RESTRICT`, seis guards SQL, nove triggers, RLS, policies e
  a RPC server-side do grafo. `20260826225154_silo_pair_atomicity.sql` cria a
  RPC transacional do par sem fundir as entidades.
- **Código consumidor:** a consolidação humana usa
  `persistArquitetoSiloPair()` → `/api/arquiteto/silo-pair` →
  `persist_silo_pair_atomic(...)`, com readback das duas entidades. O graph
  possui rotas server-side de leitura, persistência e propostas. O handoff do
  Radar recebeu apenas `internalLinkGraphRef` opcional e retrocompatível.
- **Limite explícito:** a atualização de catálogo de listas e o workflow não
  fazem parte da transação do par de artefatos. React Flow, localStorage e
  IndexedDB continuam projeções/recuperação e não são fonte canônica.
- **Evidência:** o readback remoto pós-aplicação e o smoke transacional do
  InternalLinkGraph passaram; o smoke terminou com rollback e não deixou
  fixtures, membership ou Brand temporária. A fundação foi aplicada
  manualmente em `20260827044408_internal_link_graph_integrity_guards.sql`;
  nenhuma chamada paga foi realizada.
- **Silo Pair:** o smoke transacional passou com readback de SiloDNA e SiloPage,
  rollback forçado e rejeição de versão obsoleta. A fixture técnica usou o
  owner `postgres` porque `service_role` não possui `UPDATE` em
  `editorial_artifact_versions`; isso permanece uma nota operacional, sem
  alteração de grants.
- **Próxima frente:** implementar e validar a experiência funcional da aba
  Links Internos sobre o contrato persistente. React Flow continua sendo
  projeção, não fonte de verdade. Rollbacks estão em `supabase/rollback/` e
  não são automáticos.

## Consolidação canônica de integrações — 2026-08-25

- **DataForSEO:** Connection compartilhada `READY` para compatibilidade SERP;
  o Arquiteto não possui capability, grant, binding, quota ou provider de SERP
  próprio.
- **DeepSeek:** Connection compartilhada e modelo permitido são resolvidos por
  operação/capability; o módulo não administra segredo.
- **Fronteira:** Radar recebe ArticleDNA formado e investiga pela infraestrutura
  compartilhada; não há restauração de provider SERP legado.

As entradas históricas abaixo preservam decisões e evidências anteriores; o
bloco acima é o estado vigente desta consolidação.

## Correção do ciclo da GlobalTopbar e validação visual — 2026-08-14

- **Causa confirmada no código:** o Arquiteto reconstruía `globalTopbarControls` quando handlers locais eram recriados. O efeito de registro dependia do objeto inteiro; cada nova identidade executava cleanup, `unregisterControls` e novo `setControls` no provider, que re-renderizava a árvore e podia terminar em `Maximum update depth exceeded`.
- **Correção local:** `GlobalTopbarControlsProvider` mantém callbacks estáveis, ignora registros com a mesma identidade e expõe atualização separada por `moduleId`. O Arquiteto guarda handlers mutáveis em `topbarHandlersRef`, registra uma vez por montagem/troca de módulo e atualiza somente o valor dos controles. O cleanup valida o módulo antes de remover o registro, protegendo contra cleanup obsoleto.
- **Preservação:** busca, filtros, histórico, undo/redo, processamento lógico, importação, criação de silo, exportação, navegação entre módulos, seleção, persistência, workflow, contratos e dados não foram redesenhados nem alterados por esta correção.
- **Histórico visual:** o botão global agora identifica seu módulo. O `HistoryControls` recebeu variante semântica opt-in usada somente pelo Arquiteto; o popover é ancorado no botão da GlobalTopbar, abre abaixo dele e fecha por clique externo, Escape ou botão de fechar. O consumidor legado permanece disponível para os demais módulos.
- **Tokens:** o conteúdo ativo do Arquiteto usa superfícies/divisores/estados semânticos e não contém classes roxo/violeta/índigo, hex ou `bg-black`/`text-white`/`border-white`. A GlobalTopbar foi preservada visualmente.
- **Verificado por testes:** testes direcionados do ciclo/visual/seleção `30/30` (4 topbar, 9 seleção, 17 fundação visual), `test:arquiteto` `101/101` e `check:visual-system = PASS`.
- **Validado manualmente no Chrome:** rota Arquiteto, topbar, workspace vazio, busca, filtros, histórico ancorado, fechamento externo, modal de silo sem submissão, modal de importação vazio, exportação e navegação foram exercitados. Após recarga limpa, não houve erro novo durante essas interações.
- **Limitação real:** a Brand ativa retornou `0 artigos` no workspace canônico. Não foram criadas keywords, importações ou escritas remotas para fabricar dados; estados carregado, selecionado, expandido, conflito, revisável, ArticleDNA/SiloDNA e teste físico de pintura em linhas reais continuam pendentes. As capturas dessa validação ficaram fora do repositório e não são referências operacionais.
- **Bloqueios do checkout:** `pnpm run build` compilou o código, mas falhou no type-check por três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts` (flags regex ES2018). `test:operational` mantém quatro asserções antigas incompatíveis com o código atual, fora da causa desta tarefa. O lint amplo mantém erros legados de `any`/imports na página; não foi usado para declarar a correção como inválida.

## Fase 2 — preflight da limpeza estrutural — 2026-08-12

- **Preparado localmente:** `supabase/scripts/structural-cleanup-preflight-read-only.sql` executa uma única consulta read-only para os candidatos exclusivos de 0030 e `tenant_0016_agency_role_rollback`.
- **Cobertura:** existência, contagens, FKs de entrada/saída e `ON DELETE`, `pg_depend`, views/materialized views, funções/procedures, referências de source, índices, constraints, RLS, policies, ACL, owner e trigger real dos execution events.
- **Preservação explícita:** `pipeline_editorial_protect_append_only()` e seus consumidores canônicos 0027/0028 permanecem fora do conjunto de remoção.
- **Classificação local esperada:** 0030 (duas tabelas, helper e trigger exclusivo) e 0016 rollback são `DROP_CANDIDATE`; a confirmação `DROP_SAFE` depende do catálogo remoto e de zero linhas/dependências externas.
- **Numeração registrada na preparação:** migrations locais chegavam a `0030`; `0031` não pode ser reutilizada; `0032` foi o próximo número sucessor preparado.
- **Estado naquele gate:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`; a aplicação e o post-verifier da 0032 estão registrados nas seções posteriores deste documento.

## Fase 1 — zero legacy runtime do recovery histórico — 2026-08-12

- **Removido localmente após auditoria de consumidores:** `lib/arquiteto/legacy-handoff-reconciliation.ts`, `app/api/arquiteto/handoff/preview/route.ts` e `app/api/arquiteto/handoff/rebaseline/route.ts`.
- **Removidos junto:** schemas/clientes de prévia, modal sem disparador, tipos, planos, mensagens e testes exclusivos do rebaseline histórico.
- **Handoff normal preservado:** `POST /api/arquiteto/handoff` agora usa somente `prepareCanonicalHandoff()` e `createMineradorArquitetoHandoff()`. Ele aceita `aprovado`/`publicado`, cria apenas `keyword/architect/received`, confirma o readback e trata workflow remoto não-`received` como conflito; não converte marcador histórico em `received`.
- **Preservado por consumidor ativo:** `resolvePipelineContext()`, `editorial_workflow_items`, `pipeline-repositories.ts`, `editorial-repositories.ts`, `/api/arquiteto/workspace`, `/api/arquiteto/artifacts`, `/api/editorial/*`, `browser-artifact-store.ts`, `briefings_artigos`, `/api/editorial/workspace`, adapters atuais e recovery local do Arquiteto/Redator.
- **Preservado por consumidor ativo:** `lib/legacy-routing.ts` continua importado por `proxy.ts` e coberto pelos testes de tenant/routing; não foi removido por não satisfazer `RUNTIME_CONSUMERS = 0`.
- **Não tocado:** banco, migrations, 0030, `tenant_0016_agency_role_rollback`, `minerador_google_ads_connections`, localStorage e IndexedDB.
- **Estado:** `REMOVED_RUNTIME_LEGACY`; `ZERO_RUNTIME_CONSUMERS = PASS` para o conjunto removido e `FAIL` para `lib/legacy-routing.ts`/recovery local ativo. Nenhuma operação remota foi executada.

## Correção do read-model do handoff canônico — 2026-08-12

- **Verificado no código:** o POST de `Importar do Minerador` chama `POST /api/arquiteto/handoff`, resolve `brandId` e `actorUserId` no servidor por `resolvePipelineContext()`, lê `keywords_kgr` da mesma Brand, grava `editorial_workflow_items` como `keyword/architect/received` e confirma o readback antes de responder `PERSISTED` ou `UNCHANGED`.
- **Corrigido localmente:** o merge do workspace removia todos os itens com origem `CANONICAL_REMOTE`, inclusive handoffs `received` sem ArticleDNA. O read-model agora preserva o handoff canônico até que um ArticleDNA da mesma keyword o substitua por identidade técnica.
- **Preservado como histórico fora do runtime normal:** eventual guard `historical_import_protected` não é lido nem convertido pelo handoff normal; nenhum recovery, backfill, storage local, migration ou RPC excepcional foi alterado.
- **Diagnóstico preparado:** `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql` conta somente metadados por `brandId` canônico informado manualmente; não usa nome, slug, owner ou conteúdo editorial.
- **Validado manualmente pelo usuário:** `SMOKE_NOVO_PIPELINE_PERSISTENCE = PASS`. Em dois navegadores, uma keyword nova aprovada gerou workflow remoto, formou ArticleDNA e o artefato permaneceu após F5, reinício da aplicação e retorno ao outro navegador.

## Correção da autoridade de importabilidade entre navegadores — 2026-08-12

- **Causa confirmada no código:** `architectImportedKeywordIds` é um campo legado de recovery salvo no `localStorage`, sob a chave `minerador-pro:workflow-recovery:${actorUserId}:${brandId}`. O modal o tratava como bloqueio definitivo; por isso navegadores com snapshots locais diferentes exibiam elegibilidade diferente para a mesma Brand.
- **Corrigido localmente:** `GET /api/arquiteto/workspace` agora calcula a importabilidade no servidor a partir de `keywords_kgr`, de todos os workflows `keyword/architect` da Brand e das referências de ArticleDNA canônicas. O cliente recebe essa classificação e não usa `localStorage`, IndexedDB ou marcador transitório para habilitar ou desabilitar a importação.
- **Decisão canônica atual:** workflow remoto `received`, outro workflow remoto incompatível ou keyword já referenciada por ArticleDNA determinam a elegibilidade. `publicado` recebe a classificação de proteção editorial, mas permanece elegível para reconstrução conforme o handoff normal; marcadores e guards históricos não são consultados pelo runtime.
- **Storage preservado:** nenhuma chave foi apagada. `architectImportedKeywordIds`, artefatos de recovery em IndexedDB e cópias legadas em `localStorage` permanecem somente como material de recovery/auditoria; não são autoridade de elegibilidade.
- **Pendente de validação manual:** abrir `Importar do Minerador` nos navegadores A e B, mesma conta e Brand, comparar as mesmas keywords e repetir logout/login, confirmando a mesma decisão canônica e a permanência do ArticleDNA. Nenhuma conclusão operacional é declarada antes dessa comparação.

## Histórico arquivado — Historical Import Guard do handoff legado (2026-08-12)

O runtime de recovery/rebaseline histórico foi abandonado na Fase 1. Esta
seção preserva o contexto documental, mas não descreve uma superfície ativa.
Não há writer, rota de recovery, criação de `historical_import_protected`,
backfill ou operação remota autorizada por este registro. O handoff normal usa
somente o caminho canônico descrito no bloco da Fase 1 acima.

> **Estado documental vigente — 2026-07-27:** a rota atual é `app/(brand)/[brandRef]/arquiteto/page.tsx`; a referência posterior a `/{brandUserId}/arquiteto` é alias histórico. O reparo de leitura/recovery continua sem reagrupamento automático e a conclusão operacional ainda depende de validação manual com snapshot, localização e isolamento por marca.

## Planilha operacional — padrão visual do Minerador (2026-07-31)

- **Referência verificada no código:** `modules/minerador/minerador-workspace.tsx` usa barra operacional compacta, `table-fixed`, `border-collapse`, `min-w-[110rem]`, overflow horizontal no container da planilha, cabeçalho escuro fixo, células com separadores `border-slate-800/60`, linhas neutras, hover cinza e seleção índigo discreta.
- **Aplicação local no Arquiteto:** `modules/arquiteto/arquiteto-workspace.tsx` agora reutiliza essa geometria para barra superior e inferior, container, tabela, cabeçalho, colunas técnicas, linhas de artigo, badges, selects e checkbox. A keyword principal é a única coluna textual elástica; silos continuam linhas agrupadoras compactas e preservam somente seu indicador semântico lateral.
- **Preservação:** nenhuma alteração em contratos, persistência, dados, filtros, ordenação, handlers, ArticleDNA, SiloDNA, SERP ou no controlador `article-selection.ts`. Clique, Ctrl/Cmd, Shift, pintura por arraste, teclado e ações em lote permanecem fora desta alteração.
- **Ainda pendente:** comparação manual autenticada Minerador × Arquiteto em 360/768/1024/1440px, inclusive hover, seleção, foco, disabled e scrollbar. Nenhuma equivalência visual é declarada antes dessa verificação.

## Histórico de segurança como popover (2026-07-31)

- **Correção local:** o Arquiteto passa `presentation="popover"` para `HistoryControls`; o histórico deixa de abrir como drawer lateral e aparece abaixo do botão Histórico, antes da planilha.
- **Interação preservada:** o popover fecha por clique fora, `Escape` ou botão de fechar. A ancoragem compartilhada foi corrigida de forma retrocompatível para alinhar a borda esquerda ao botão disparador e respeitar a viewport; o Minerador, único outro consumidor do modo popover, preserva seus handlers e passa a receber o mesmo alinhamento correto.

## Entrada sem recarga duplicada da planilha (2026-07-31)

- **Causa confirmada:** após autenticar/entrar no Arquiteto, a sincronização de sessão e o efeito da assinatura de importação chamavam `fetchMasterList` em paralelo, reapresentando a mesma planilha duas vezes.
- **Correção:** a sincronização de sessão agora atualiza somente os silos; a assinatura `importedKeywordSignature` continua como fonte única do carregamento inicial e de recargas por alteração efetiva de importação. Recargas explícitas após salvar, importar ou usar `Tentar novamente` foram preservadas.

## Superfície operacional sem barra de recovery e sem refresh visível (2026-07-31)

- **Removido da interface:** a barra `Recuperação segura`, `Resetar não-publicados` e o contador passivo de conflitos lógicos. Nenhum artefato, snapshot, função de recovery ou regra de integridade foi apagado.
- **Refresh:** quando a planilha já possui itens recuperados ou carregados, a atualização de silos ocorre em segundo plano e não substitui a tabela por um spinner. O spinner permanece reservado ao primeiro carregamento sem itens.

## Regra compartilhada de formação — 2026-07-21

Implementados localmente o gate de uma principal/até cinco apoios, a estratégia aditiva do ArticleDNA (`keywordStrategy`) e sinais de hierarquia do SiloDNA. Volume ausente permanece parcial/indisponível; score, slug ou similaridade não confirmam KGR. Artigos publicados permanecem protegidos e o Radar recebe somente contexto de leitura.

## Correção do avaliador SERP, intenção e KGR leve (2026-07-21)

- **Implementado:** `intentProfile` no ArticleDNA, normalização determinística de intenção com preservação do rótulo original e compatibilidade individual das secundárias/reforços; CTA e hierarquia não alteram a intenção central.
- **Implementado:** sanitização proprietária no Arquiteto para eliminar falsos conflitos de labels equivalentes, hierarquia comparada como formato e ausência em snippets. A evidência fraca aparece como limitação e não gera separação.
- **Implementado:** `validationProfile` com `kgr_light`; principal obrigatória, secundárias condicionais à ambiguidade, referências integrais preservadas e `queriedKeywordDnaIds` explícitos. Confiança baixa/inconclusiva impede ações destrutivas.
- **Implementado:** ingestão aditiva preserva URL publicada, canonical, slug e status; ArticleDNA exibe intenção/origem, arquitetura, KGR, publicação e identidade URL/canonical quando recebidos.
- **Implementado:** assessment anterior permanece no histórico e é marcado `Desatualizado por correção do avaliador`; nova execução explícita gera v2.
- **Verificado em fixtures:** `test:arquiteto` 70/70. Nenhuma chamada real Serper, escrita remota, migration, limpeza de armazenamento ou validação browser autenticada foi executada.
- **Limitações:** ainda pendem validação manual autenticada do preview/URL/reload/troca de marca e confirmação do schema remoto/RLS. O Radar não foi alterado.
- **Correção de deep-link (2026-07-20):** a seleção externa Radar → Arquiteto agora usa solicitação consumível por marca, compara expansão/seleção antes de chamar setters e remove `articleId` da URL após encontrar o artigo. O artigo publicado continua sendo apenas selecionado; não é recriado nem reimportado.
- **Reparo de integridade (2026-07-20):** a leitura do workspace voltou a incluir keywords aprovadas cujo ID está no índice de importação, sem deixar de preservar linhas já renderizadas. A leitura continua sem reagrupar automaticamente e uma falha de leitura não marca a assinatura como carregada.
- **Evidências do reparo:** `test:arquiteto` (48/48), `test:operational` (49/49), `npm run build` e `git diff --check` passaram.
- **Limitações:** a validação visual autenticada do deep-link e do snapshot ainda não foi repetida nesta execução; lint amplo do monólito pode continuar exibindo avisos legados, mas o lint do escopo alterado e o build passam.
- **Critério ainda aberto:** não marcar a tarefa como concluída enquanto a validação manual com snapshot não confirmar localização, recuperação e isolamento por marca.
- **Última auditoria:** 2026-07-20, leitura de código e testes de domínio/fluxo.
- **Funcionando:** agrupamento lógico, agrupamento por IA, ArticleDNA, SiloDNA, anotações, proteção de publicados e envio ao Radar existem no código. **Verificado no código; regras principais confirmadas por teste.**
- **Parcial:** SiloPage possui contrato e rota; hidratação/persistência no workspace ainda não foi confirmada como completa.
- **Simulado:** parte do pipeline pode usar fallback/local; não confundir com persistência server-side.
- **Local:** recovery por marca em `localStorage`; artefatos do Arquiteto em IndexedDB. **Verificado no código.**
- **Persistido:** ArticleDNA/SiloDNA e eventos possuem repositórios/migration previstos; execução remota não verificada.
- **Corrigido em código:** o loop `Maximum update depth exceeded` no recebimento de navegação externa; a busca continua dependente de `masterList`, mas a solicitação já consumida não reaplica estado.
- **Regressões/bugs:** a correção visual ainda aguarda reprodução manual autenticada; os testes cobrem resolução, idempotência, IDs ausentes, Sets já corretos e mudança para outro artigo.
- **Arquivos centrais:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`.
- **Testes:** `tests/arquiteto-domain.test.mts`, `tests/operational-flow.test.mts` cobrem contratos, published guard, recovery e preflight.
- **Última validação manual:** ainda não verificada nesta sprint.
- **Diferença spec/implementação:** não marcar como concluído; integridade de importação/hidratação é pré-requisito aberto.

## Implementação SERP e identidade publicada (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-serp-formacao-identidade-publicada.md`, contratos opcionais de snapshot integral da KeywordDNA, assessment SERP versionado, decisões por keyword, identidade publicada coerente/divergente/ausente e verificação server-side.
- **Interface:** botão `Validar agrupamento pela SERP` imediatamente depois de `Detectar viés SiloDNA (IA)`, preview com custo/consultas, recomendações `Seguir recomendação`/`Ignorar`, link publicado com `noopener noreferrer` e coluna independente `APROVAÇÃO`.
- **Persistência:** assessments, snapshots, decisões, histórico e verificações são armazenados por marca no artefato IndexedDB existente, com fallback local já identificado; a UI só anuncia sucesso após a escrita.
- **Transferência:** itens aprovados enviados ao Radar carregam referências KeywordDNA e assessment de formação de modo aditivo; UI e workflow Radar não foram alterados.
- **Verificado em código/testes:** `test:arquiteto` 54/54, `test:operational` 49/49, `tsc --noEmit` e `git diff --check` passaram. Nenhuma chamada real Serper, escrita remota ou validação browser autenticada foi executada.
- **Limitações abertas:** o build atual compilou e terminou TypeScript, mas falhou na prerenderização fora do escopo em `/admin/marcas` com `Invariant: Expected workStore to be initialized`; ainda é necessária validação manual autenticada do preview, uma coleta explícita, reload/troca de marca, link e verificação online.

## Correção de visibilidade SERP por keyword (2026-07-21)

- **Causa confirmada:** o assessment era persistido no artefato IndexedDB brand-scoped, mas a planilha só o mostrava como uma lista solta dentro do artigo expandido; não havia indicador na linha, abertura automática após confirmação nem vínculo visual obrigatório com cada keyword.
- **Correção:** cada linha de artigo exibe `SERP não analisada`, `SERP processando`, `SERP pronta · vN`, `SERP com conflito`, `SERP desatualizada` ou `SERP com erro`. Após persistência bem-sucedida, o artigo é expandido, a aba de suporte é aberta e a linha recebe foco sem reload.
- **Associação:** a renderização usa `articleId`, `keywordId` e `keywordDnaVersionId` contra as referências do assessment. Recomendações não associadas ou com versão divergente aparecem explicitamente com `KeywordDNA` e `ArticleDNA`; nunca são descartadas silenciosamente.
- **Preservação:** falhas e assessments incompletos não substituem o assessment anterior válido; ações em publicados continuam protegidas e as recomendações permanecem sujeitas a decisão humana.
- **Verificado:** `test:arquiteto` 56/56, `test:operational` 49/49, `tsc --noEmit` e `git diff --check`. O build compilou o código, mas a geração estática falhou em `/admin/marcas`, fora do Arquiteto. Ainda pendem validação browser autenticada e uma coleta real explícita.

## Separação SERP de formação e fortalecimento (2026-07-21)

- **Causa:** o assessment anterior possuía somente o modo de coleta `keyword_individual`; o domínio não recebia o estado editorial publicado e aplicava semântica de formação ao principal protegido.
- **Correção:** assessments novos recebem `assessmentMode: formacao|fortalecimento`. Publicados usam `SERP de fortalecimento`, com a principal como âncora e recomendações de intenção/conteúdo ao redor da identidade existente.
- **Proteções:** `tornar_principal`, `separar_artigo` e `retirar_do_artigo` continuam bloqueados para a principal publicada no domínio. A interface não oferece `Seguir recomendação` para ela; oferece registro de proposta de atualização ou ignorar.
- **Secundárias:** podem receber manutenção, remoção ou proposta complementar na cópia de trabalho, sem alterar principal, slug, canonical ou URL.
- **Codificação:** corrigidas as duas strings corrompidas da UI; o teste agora rejeita mojibake no arquivo da planilha.
- **Pendente:** validação manual autenticada com artigo novo e publicado, sem provider real nos testes.

## Contexto rico de URL, arquitetura e KGR (2026-07-21)

- **Implementado:** contratos opcionais para relação keyword↔URL, situação arquitetural e `ArticleKgrIdentity`, com aliases português/legado normalizados no consumidor do Arquiteto.
- **ArticleDNA:** referências preservam relação/evidência; o payload preserva situação arquitetural, designação KGR, principal KeywordDNA, slug vinculado e proveniência. Score KGR ou coincidência textual não confirmam vínculo.
- **SERP:** resolução determinística em `formacao`, `arquitetura_publicado` e `fortalecimento`; publicados sem confirmação não entram automaticamente em fortalecimento.
- **Proteções:** publicado sempre protege URL, slug, canonical e marca; principal só quando arquitetura/principal estão confirmadas ou KGR está explicitamente confirmado. KGR confirmado também protege o par principal+slug fora da publicação.
- **Transferência:** Radar recebe campos opcionais aditivos; UI/workflow do Radar não foram alterados.
- **Verificado em código/testes:** fixtures cobrem aliases, três modos, candidata editável, KGR protegido, nova versão na confirmação arquitetural e preservação ao Radar; `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram. Validação browser/authenticated e provider real permanecem pendentes.

## ArticleDNA estratégico de KGR, volume e hierarquia (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md` e projeções aditivas `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose` no ArticleDNA.
- **Implementado:** referências individuais preservam papel, volume conhecido/desconhecido, contribuição e propósito. `null` não é convertido em volume zero; reforços narrativos não recebem volume incremental artificial.
- **Implementado:** KGR explícito nasce candidato com slug derivado da principal, divergência vira conflito e confirmação arquitetural humana cria sucessora com o par principal–slug confirmado.
- **Implementado:** `ArticleControlContext` concentra intenção herdada, KGR, volume, hierarquia, propósito e ações protegidas. Radar recebe essa projeção em campo opcional único; nenhuma UI/workflow de consumidor foi alterada.
- **Implementado:** painel expandido do Arquiteto exibe propósito, volume, score/racional de hierarquia e contribuição por KeywordDNA.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, `tsc --noEmit`, lint focado e `npm run build` passaram. Nenhuma chamada real de IA/Serper, escrita remota, migration, limpeza de storage ou validação browser autenticada foi executada.
- **Limitações:** provider real, SERP real, navegador autenticado e schema remoto/RLS permanecem não verificados; mudanças de consumidores continuam limitadas ao transporte opcional.

## Perfis estratégicos de unidades e SERP (2026-07-22)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-perfis-unidades-kgr-nao-kgr-serp.md` e ADR-015. ArticleDNA e `ArticleControlContext` receberam campos opcionais para classificação da unidade, propósito e estratégia SERP.
- **Tipos:** artigo, página de serviço, landing page, página de categoria e outro; landing mantém finalidade SEO, campanha, híbrida ou desconhecida. Sugestões mostram evidências e não equivalem a confirmação.
- **Estratégia:** ciclo, competição e perfil SERP são resolvidos em dimensões independentes. KGR confirmado usa `kgr_light`; não KGR explícito usa `competitive`; ausência/candidato/conflito usa `unknown`.
- **Interface:** painel expandido permite confirmar, alterar, marcar conflito ou manter desconhecido. A decisão cria sucessora humana do ArticleDNA, preserva identidade publicada e marca assessments anteriores como desatualizados sem apagar histórico.
- **Transporte:** o Radar recebe a projeção opcional pelo `ArticleControlContext`; sua UI/workflow não foram alterados. `EditorialUnitType` operacional permanece `article|silo_page`.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript após a implementação. Ainda pendem `test:operational`, build, validação browser autenticada, provider/SERP real e schema remoto/RLS.

## Criador manual de SiloDNA e SiloPage (2026-07-21)

> Registro histórico supersedido pela simplificação de 2026-08-24. O fluxo básico atual não cria SiloDNA/SiloPage e não solicita keyword ou entidade central.

## Consumo da política da principal do Minerador — 2026-07-22

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md` e ADR-016 registram o consumo aditivo de `primary_keyword_policy` e seu contexto humano.
- **Campos recebidos:** o adaptador reconhece política, principal publicada original/atual, ator, data, versão, motivo, histórico, `kgr_decisao`/`kgr_aplicabilidade`, intenção, volume, resultados, score, URL, slug, canonical, relação e evidências; snapshots integrais continuam no `KeywordDnaProvenanceSnapshot`.
- **Resolução:** `locked`/confirmação consolidada usa `fortalecimento`; `reviewable` usa `arquitetura_publicado`; unidade nova usa `formacao`; publicado sem política fica `unknown`. `not_applicable` explícito usa competição `competitive`; KGR confirmado usa `kgr_light`; ausência/candidato fica `unknown`.
- **Proteções:** URL, slug, canonical e marca publicados são independentes da proteção da principal. Principal revisável permanece editável; principal travada não pode ser substituída por recomendação estrutural.
- **ArticleDNA/Contexto:** política efetiva, origem/histórico, métricas, candidatas, decisão e `protectionReason` são opcionais e retrocompatíveis. A confirmação humana cria sucessora e recalcula a próxima SERP para fortalecimento sem alterar a identidade publicada.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e `npm run build` passaram. O lint da página completa mantém apenas dívida legada; reload autenticado e provider real permanecem validações manuais separadas desta etapa.

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-criador-manual-silo-silopage.md` e decisão `docs/00-produto/decisoes/ADR-014-criacao-manual-silo-silopage.md`.
- **Modal:** removido `Nicho (opcional)`. O formulário agora exige nome do silo e keyword/entidade central, sem transformar a entidade automaticamente em principal de artigo.
- **SiloDNA:** criação manual pode iniciar sem artigos, preserva marca, nome, entidade central, origem manual e referência real opcional de KeywordDNA.
- **SiloPage:** criação opcional com slug, situação `Novo`/`Publicado`, URL publicada obrigatória em publicado e verificação inicial `not_applicable`/`not_checked`. A URL é preservada e publicada não significa verificada.
- **Proteções:** slug inválido/conflitante e URL fora do domínio da marca ativa são rejeitados; canonical permanece separado; nenhum artigo, grupo ou KeywordDNA existente é alterado.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build com 50 páginas. Nenhuma verificação online real foi executada.
- **Limitações:** reload autenticado, conferência online, schema remoto/RLS e persistência remota ponta a ponta permanecem pendentes.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/arquiteto; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/arquiteto`; nenhum contrato interno de formação foi refeito.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa compartilhada confirmada: o cliente browser não propagava corretamente o token da sessão Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também filtra `keywords_kgr` por `brand_id`.
- O erro de carregamento agora preserva código, tabela, operação, status e mensagem no log interno, sem tokens. RLS, grants e regras editoriais permanecem intactos; smoke test autenticado segue pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- Arquiteto e Minerador usam a mesma factory dinâmica; consultas revalidam a sessão, aplicam margem de 60 segundos e preservam `marca_id`/`brand_id`.
- Erros registram somente operação, tabela, código, status, diagnóstico seguro e `tokenExpired`; a UI reserva “sessão expirada” para expiração efetiva ou falha de refresh, sem expor JWT ou refresh token.
- SELECT do ecossistema pode repetir uma vez após JWT expirado; escritas não recebem retry automático. Smoke test autenticado e Google OAuth real seguem pendentes.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Arquiteto compartilha o mesmo resultado estruturado e os mesmos códigos seguros do Minerador.
- SELECTs tenantizados só prosseguem com `SUPABASE_SESSION_READY`; ausência de sessão, troca Google, token, claims e refresh são diferenciados sem fallback anon.
- A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Arquiteto quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

## Refinamento visual do Arquiteto — 2026-07-27

- **Verificado no código:** a rota tenantizada `app/(brand)/[brandRef]/arquiteto/page.tsx` continua fina e a implementação proprietária permanece em `modules/arquiteto/arquiteto-workspace.tsx`; nenhuma regra, contrato, handler, persistência ou workflow foi alterado.
- **Diagnóstico visual:** a tela usava `font-mono` como fonte global, controles e informações essenciais abaixo de 14px, barra superior sem grupos funcionais, estados com baixo contraste/áreas clicáveis pequenas e expansão com caixas concorrentes.
- **Ajustes visuais:** barra superior agrupada em inspeção, processamento/importação e operações secundárias; tabela com cabeçalho, linha, seleção, foco, keyword principal e URL mais legíveis; resumo expandido reorganizado visualmente para intenção, política, KGR, publicação, propósito, unidade, ArticleDNA, SERP, abas e recomendações; recuperação, badges e ações receberam variantes com foco visível e áreas maiores.
- **Componentes/tokens reutilizados:** `WorkflowStatusBadge`, `HistoryControls`, `ArticleDnaSummary`, `ArchitectRecoveryPanel`, tokens `background`/`foreground` e escala Tailwind existente; foi adicionada apenas a prop visual aditiva `density` ao badge/histórico compartilhados, sem alterar o padrão dos consumidores atuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` e `git diff --check`; o build gerou 47 páginas estáticas. O lint direcionado reproduz a dívida legada da página consolidada.
- **Ainda não verificado:** navegador autenticado, light/dark real, 360/768/1024/1366/1440px, teclado, hover, loading, erro e conflito. O lint da página consolidada mantém dívida legada já existente; não foi corrigida nesta tarefa visual.

## Correção da regressão visual e densidade operacional — 2026-07-27

- **Relatado e confirmado no código:** o refinamento anterior elevou o topo para `min-h-16`, aplicou badges confortáveis nas linhas, manteve a tabela em `min-w-[1360px]` sem rolagem horizontal própria, comprimiu a keyword em uma única linha e deixou o rodapé com ações em `text-[9px]`.
- **Correção visual aplicada:** topo em 48px com controles compactos; recuperação como barra secundária; linhas e cabeçalho com densidade controlada; keyword separada em principal + identidade técnica; rodapé com controles de 32px e texto legível; superfícies, bordas e sombras suavizadas.
- **Scroll:** rolagem horizontal ficou confinada ao container da tabela e o scroll vertical ao canvas do Arquiteto. Foi criado estilo de scrollbar escopado `.architect-scrollbar`, usando `--foreground`, sem alterar outros módulos.
- **Preservação:** nenhum handler, estado, contrato, entidade, seleção, filtro, rota, API, persistência, hidratação ou regra editorial foi alterado. O scrollbar e as classes são exclusivamente visuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` com 47 páginas e `git diff --check`.
- **Ainda não verificado:** navegador autenticado real em 100% nos tamanhos 1366×768, 1440×900 e 1920×1080, além de light/dark, estados de interação e ausência de truncamento em dados reais.

## Diagnóstico do contrato de readback canônico — 2026-08-11

- **Causa confirmada do erro:** no caminho idempotente, `ArtifactVersionRepository` consultava apenas `version_id`, `version_number` e `content_hash` para produzir `UNCHANGED`. O mapeador server-side exigia o envelope completo (`entity_id`, origem, timestamps, autor, payload e demais campos), portanto a validação do `Versioned*Schema` falhava antes de a resposta chegar ao cliente.
- **Correção local:** a leitura da versão mais recente agora usa a linha completa; `PERSISTED` e `UNCHANGED` passam pelo mesmo mapeamento canônico. A rota traduz explicitamente `status` do repositório para `persistence` no contrato HTTP consumido pelo cliente.
- **Diagnóstico seguro:** falhas de forma registram somente tipos/presença de campos e caminhos de validação, sem payload, UUID, token, sessão ou segredo; a mensagem pública continua genérica.
- **Fonte atual da tela:** `MIXED`: a hidratação canônica usa `/api/arquiteto/artifacts`, enquanto o contexto editorial legado ainda lê `/api/editorial/workspace` e os mecanismos de recovery local/IndexedDB continuam preservados. Isso não é prova de readback remoto exclusivo.
- **Verificado localmente:** contrato canônico 6/6, `test:arquiteto` 89/89, runtime do pipeline 7/7, TypeScript, ESLint direcionado e `git diff --check` passaram.
- **Pendente:** smoke autenticado de leitura/persistência contra o schema remoto já aplicado. Nenhuma operação remota, chamada de IA/SERP ou aprovação artificial de ArticleDNA foi executada.

## Fresh-origin readback canônico — 2026-08-12

- **Reprodução:** na origem `s-smoke`, com a mesma identidade e Brand ativa, o GET canônico retornou uma linha `article_dna` e falhou no mapper por `createdAt` em formato de timestamp do banco incompatível com o `z.string().datetime()` estrito. O diagnóstico foi sanitizado por linha; nenhum payload editorial foi impresso.
- **Correção:** o mapper server-side normaliza somente timestamps de banco reconhecíveis para ISO UTC antes do schema parser. Formatos realmente inválidos continuam falhando explicitamente com `rowIndex`, `artifactType`, `versionNumber`, `payloadType`, schema, path e código sanitizados.
- **Invariantes:** o GET agora confirma também `marca_id`, `payload.brandId` e a correspondência entre `entity_id` e a identidade do payload. Não há fallback de recovery para mascarar erro canônico.
- **Resultado observado:** após reload em `s-smoke`, a mensagem de artifact inválido desapareceu; o parser atual aceitou o retorno canônico. A UI ainda exibe estado vazio porque sua reconstrução visual depende da lista editorial, o que não invalida o readback do artifact.
- **Fonte:** `CANONICAL_REMOTE` no readback do artifact; `LOCAL_RECOVERY` não foi usado como prova nem inspecionado/limpo. O workspace de `localhost` permanece uma superfície `MIXED` e não é baseline do smoke.
- **Estado:** `ARQUITETO_CANONICAL_READBACK_CONTRACT_FIXED`; nenhum artifact foi criado, apagado ou alterado remotamente. IA/SERP permanecem indisponíveis.

## Histórico arquivado — Rebase canônico do patrimônio Minerador → Arquiteto — 2026-08-12

O rebaseline histórico, seu bootstrap e seus preflights permanecem apenas
como contexto/artefatos arquivados. Não existe mais rota runtime de
`rebaseline`, não existe transição automática de `historical_import_protected`
para `received` e nenhum writer ou backfill deve ser criado nesta Fase 1.
O fluxo vigente é o handoff normal server-side e idempotente descrito no
registro da Fase 1.

## Inventário e preparação do reset downstream da Adalba — 2026-08-12

- **Escopo preservado:** `listas_kgr`, `keywords_kgr`, status de keyword, evidências de URL/canonical do Minerador, identidades, marcas e Agências ficam fora de qualquer manifesto de reset. Publicações/briefings com status publicado ou URL/canonical não podem ser selecionados.
- **Inventário preparado:** `supabase/scripts/adalba-editorial-downstream-inventory-read-only.sql` usa a Brand fixa Adalba, uma única tabela sanitizada e somente leitura. As contagens e a classificação real continuam **PENDENTES DE CONFIRMAÇÃO NO CATÁLOGO REMOTO**.
- **Ordem e bloqueio técnico:** `editorial_artifact_versions`, `content_document_versions`, `editorial_serp_snapshots` e `editorial_serp_reviews` são append-only pelas migrations 0027/0028. O SQL proposto se recusa a tocar esses objetos; não existe reset canônico completo sem decisão estrutural futura. Somente workflow selecionado, estado por usuário, view salva, documento sem versão, PublicationRecord não publicado e briefing legado não publicado podem sequer entrar na proposta atual, sempre por manifesto explícito e revisado.
- **Estado:** nenhum SQL remoto, dado, migration, 0031, recovery histórico, provider ou limpeza de storage foi executado.

## Reset de dados de desenvolvimento e nova época canônica — 2026-08-12

- **Scripts de reset locais:** `supabase/scripts/development-data-reset-dry-run.sql` é agora uma única consulta CTE/`VALUES` 100% read-only, sem transação auxiliar, temporárias ou objetos de sessão. Retorna um único result set sanitizado com manifesto, FKs, ordem, self-FKs, proteções, Admin, ambiente, contagens e veredicto final. `supabase/scripts/development-data-reset-real.sql` mantém `BEGIN`/`COMMIT` na própria execução e usa somente arrays, records e variáveis locais para o manifesto, snapshot das proteções e contagens; nenhuma relação auxiliar é criada. Falha em qualquer gate provoca `RAISE` e rollback transacional automático. `supabase/scripts/development-data-reset-verifier-read-only.sql` continua somente leitura e sem temporárias.
- **Correção de preflight:** dry-run v6, reset-real v7 e verifier v4 consideram `O`, `R` e `A` como modos de trigger habilitados e somente bloqueiam `D`/ausência. O `FK_ORDER_GATE` considera apenas FKs entre tabelas diferentes; o `SELF_FK_GATE` inventaria cada self-FK em tabela do manifesto e só aprova reset integral. Os quatro self-FKs reportados no catálogo remoto ficam cobertos como `SAFE_FULL_TABLE_RESET`. O ciclo cruzado `content_documents.current_version_id`/`content_document_versions.document_id` continua tratado pelo `UPDATE` do ponteiro antes das exclusões. A abordagem anterior com `_development_reset_manifest` e `_development_reset_gate_results` foi abandonada após falhas repetidas de lifecycle no SQL Editor.
- **FK gate endurecido:** o primeiro reset real foi revertido integralmente antes do `COMMIT` por `tenant_0016_agency_role_rollback.membership_id → agency_memberships.id ON DELETE RESTRICT`. A tabela é captura histórica da transição 0016, não fonte de verdade do runtime canônico; suas linhas de homologação entram no reset antes de `agency_memberships`. O manifesto agora cobre dependências conhecidas e o catálogo reprova, em uma única execução, qualquer FK filha externa ao plano ou ordem topológica inválida. A única aresta cíclica explicitamente neutralizada é `content_documents.current_version_id → content_document_versions`, anulada na mesma transação antes de apagar as versões e o documento.
- **Dados propostos para limpeza:** Discovery/Minerador, editorial canônico, comunicação/onboarding, dados de Agency/Brand, conexões de integração não-plataforma, uso de integrações e dados excepcionais 0030. O script bloqueia se houver dependência catalogada fora do conjunto revisado ou tabela de activity/notification ainda não classificada.
- **Append-only:** as proteções de publicado, DiscoveryRun, artifacts, SERP, versões de documento, usage events e execution events 0030 são capturadas, desabilitadas apenas durante a transação e verificadas como restauradas antes do resultado. Falha em qualquer etapa reverte a transação inteira.
- **Guards de mutação:** o catálogo/migrations foi auditado para 45 triggers não internos de `UPDATE`/`DELETE` nas 60 tabelas: 23 `SUSPEND_DURING_DEV_RESET` e 22 `SAFE_TO_KEEP_ENABLED`, sem classificação `INVESTIGATE` conhecida localmente. A trigger real `public.brand_memberships.trg_tenant_0005_protect_last_owner`, função `public.tenant_0005_protect_last_owner()`, é suspensa somente durante a mesma transação e entra no snapshot/restauração. O `MUTATION_TRIGGER_GATE` reprova qualquer trigger adicional, divergente ou sem classificação exata; os guards diferidos da 0021 (`agencies`/`agency_memberships`) e os append-only legados e canônicos também fazem parte do registro.
- **Legado para limpeza posterior ao smoke:** `historical_import_protected`/0030 e `architectImportedKeywordIds` não voltam a autorizar bloqueio normal; recovery em navegador (`architect-recovery`, `browser-artifact-store` e rascunho local do Redator) fica **INVESTIGAR**; `/api/editorial/workspace`, `briefings_artigos` e consumidores legados ficam **REMOVER APÓS SMOKE** ou **INVESTIGAR** conforme o inventário remoto. Os resolvedores server-side canônicos e `resolvePipelineContext()` ficam **MANTER**.
- **Gate de reimportação:** **PASS_WITH_MANUAL_REBUILD**. A ausência de `Silo`/`Lista` no CSV não é blocker: após recriar a Brand, o usuário recria manualmente cada lista/grupo, seleciona-a como destino e importa o CSV correspondente. A ausência de `site_origin/site_origins`, URL e canonical também é deliberada: o CSV separado de `publicado` preserva o dado-fonte e o mecanismo atual do Minerador será executado novamente para reconstruir/comprovar evidência de Site/Sitemap, URL e canonical. Não há restauração de IDs, lista antiga, `brand_id`, markers do Arquiteto ou qualquer outro estado histórico.
- **Pendente:** executar manualmente somente o dry-run v6 e revisar `MANIFEST_COUNT = PASS`, `FK_DEPENDENCY_GATE = PASS`, `FK_ORDER_GATE = PASS`, `SELF_FK_GATE = PASS`, `PROTECTION_GATE = PASS`, `ADMIN_GATE = PASS`, `VERDICT_FINAL = PASS` e zero `FAIL` antes de qualquer novo reset real. O reset e o verifier continuam operações manuais; a reconstrução posterior deve ocorrer somente pelos fluxos correntes do produto.
- **Correção do reset real v7:** após o abort por `42702` no `MUTATION_TRIGGER_GATE`, todas as agregações sobre FKs/self-FKs/triggers e todas as leituras de `jsonb_to_recordset` foram revisadas com aliases explícitos (`l`, `fc`, `sfc`, `mi`, `x`), sem alterar o dry-run v6, o manifesto ou os gates. A validação local confirmou uma transação `BEGIN`/`COMMIT`, sem `TEMP`/`pg_temp`, e o reset real fica liberado diretamente para nova execução manual, sujeito ao acknowledgment e aos gates remotos.

## Seleção livre, intervalos e arraste na planilha (2026-07-29)

- **Implementado no Arquiteto:** `selectedArticleIds` continua sendo o único conjunto de seleção. Clique comum e Ctrl/Cmd alternam somente a linha e atualizam `lastSelectionAnchorId`; Shift usa a ordem visual filtrada e agrupada; Ctrl/Cmd+Shift adiciona o intervalo.
- **Arraste:** Pointer Events iniciados exclusivamente no checkbox de artigo usam tolerância de 5px, modo de marcar/desmarcar definido pela linha inicial, processamento idempotente por ID e encerramento por `pointerup`, `pointercancel`, perda de captura e `blur`. O clique final não duplica o gesto.
- **Cabeçalho e filtros:** o checkbox do cabeçalho usa somente artigos visíveis, possui estado indeterminado e preserva seleções ocultas. A contagem distingue total e visíveis; filtros, busca, ordenação, agrupamento e troca de marca não reutilizam seleção de outro contexto.
- **Acessibilidade:** os checkboxes nativos preservam Tab, foco, Space, `aria-label` e `aria-checked`; a mudança visual ficou restrita ao estado indeterminado e ao contador solicitado.
- **Verificado:** teste direcionado `tests/arquiteto-selection.test.mts` 8/8, `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, lint dos arquivos novos, build com 47 rotas e `git diff --check` passaram.
- **Limites:** lint da página consolidada ainda reproduz a dívida legada de `any`/hooks; nenhuma API, persistência, storage, migration, chamada paga, Minerador ou outro módulo foi alterado. Arraste e teclado ainda aguardam validação manual real no navegador autenticado.

## Correção do arraste por coordenadas (2026-07-29)

- **Causa confirmada no código:** o gesto dependia de `pointerenter` nos checkboxes e não capturava o ponteiro inicial; ao sair do primeiro controle, o navegador podia continuar a seleção nativa de texto sem processar as linhas atravessadas.
- **Correção:** o checkbox inicial usa `setPointerCapture`; as `<tr>` visíveis são registradas por ID, seus limites vêm de `getBoundingClientRect()` e `clientY` resolve a linha atual. A aplicação percorre os índices intermediários da ordem visual, sem depender de `event.target` ou `pointerenter`.
- **Proteção:** após 5px, o gesto chama `preventDefault()`, aplica `user-select: none` temporário no `body`, bloqueia o clique posterior, libera a captura e restaura o estilo original. Clique sem deslocamento continua sendo clique normal.
- **Verificado no código/teste:** `tests/arquiteto-selection.test.mts` 8/8, incluindo faixa nos dois sentidos, `getBoundingClientRect`, captura/liberação e ausência de `pointerenter`. Validação manual no Chrome ainda precisa ser repetida pelo usuário; não declaro o arraste manualmente validado nesta etapa.

## Pintura por snapshot durante o arraste (2026-07-30)

- **Correção:** a pintura agora congela `initialSelectedIds`, `anchorId` e `mode` no `pointerdown`. Cada `pointermove` usa `document.elementFromPoint(clientX, clientY)` e `data-article-selection-id` para localizar a checkbox atual.
- **Comportamento:** `applySelectionPaint` recalcula imediatamente o intervalo inclusivo desde a âncora; avançar amplia a pintura e voltar reduz o intervalo, restaurando a seleção inicial fora dele. Seleções ocultas permanecem preservadas.
- **Proteções:** a tolerância passou a 4px; somente após ultrapassá-la ocorre `preventDefault`, bloqueio temporário de seleção de texto e atualização de `selectedArticleIds`. `pointerup`/`pointercancel` apenas encerram e suprimem o clique sintético.
- **Verificado:** testes direcionados 9/9 cobrem pintura para frente, retorno, modo desmarcar e seleção oculta. No Chrome autenticado, o caminho de mouse foi validado para avanço, retorno e ausência de seleção nativa de texto; touchpad físico específico permanece pendente.
## Métricas Ads e KGR opcional — 2026-08-03

- **Verificado no código:** o contrato do Arquiteto aceita `demandEvidence` opcional, com KGR histórico, métricas Ads normalizadas, séries mensais, CPC/competição Ads, tendência/sazonalidade, close variants e referência de snapshot.
- **Verificado no código:** ausência e `null` permanecem indisponíveis; zero recebido continua zero. KGR ausente não impede a formação.
- **Verificado no código:** ArticleDNA e ArticleControlContext transportam a evidência sem alterar o limite de uma principal e até cinco apoios; snapshot de proveniência remove identificadores de conta e payload bruto.
- **Verificado no código:** o Arquiteto não chama Google Ads e não altera o Minerador; Serper permanece independente.
- **Verificado por teste:** KGR opcional, preservação de null/zero, separação Ads, close variants, snapshot e não escolha por volume.
- **Ainda não verificado:** importação autenticada de uma keyword realmente enriquecida no Minerador e persistência remota da medição. Nenhuma chamada paga ou migration foi executada.

## Reconciliação do KeywordDNA enriquecido — 2026-08-24

- **Causa confirmada:** o Minerador grava a medição Google Ads atual em `analise_semantica.volume_measurement`, mas o normalizador do Arquiteto consultava apenas `google_ads_measurement`; isso podia omitir silenciosamente a evidência enriquecida.
- **Correção local:** o Arquiteto aceita prioritariamente um `volume_measurement` válido e usa `google_ads_measurement` somente como fallback legado. Envelope ausente ou inválido continua sem `googleAds` em `demandEvidence`, sem bloquear a KeywordDNA.
- **Campos preservados:** média mensal (`averageMonthlySearches`), série (`monthlySearchVolumes`), `metricStatus`/elegibilidade, `measuredAt`, provider/version, targeting, `currencyCode`, `timeZone`, keyword canônica do provider, keywords correspondentes, close variants, tendência/sazonalidade, picos, crescimento recente, cobertura histórica, competição/CPC/lances e referência segura do snapshot.
- **Proveniência:** `ArticleKeywordReference` continua carregando `demandEvidence` e o bootstrap canônico agora hidrata essa evidência no read-model da planilha. `sourceKeywordSnapshot`, IDs, hash, URL/slug/canonical e decisões humanas permanecem intactos; identificadores de conta e payload bruto continuam sanitizados.
- **Fronteiras preservadas:** nenhum código do Minerador, DataForSEO, DeepSeek, SERP, persistência remota, layout ou módulo vizinho foi alterado.
- **Verificado localmente:** testes direcionados cobrem precedência atual/legado, zero, null, aliases reais, evidência temporal e hidratação canônica. Smoke autenticado com dado real do Minerador e readback remoto continuam pendentes.
- **Persistência canônica do primeiro consumidor — 2026-08-11:** ArticleDNA, SiloDNA e SiloPage agora passam por `resolvePipelineContext()` e pelo `ArtifactVersionRepository` server-side, com `brandId` explícito, actor Supabase SSR, append-only, hash idempotente e confirmação `PERSISTED`/`UNCHANGED` antes do sucesso.
- **SiloPage:** a persistência exige `source_version_id` de SiloDNA canônico da mesma Brand; referências locais ausentes não são convertidas em sucesso remoto.
- **Leitura:** `/api/arquiteto/artifacts` reconcilia os artefatos canônicos por Brand. Recuperação local/IndexedDB continua preservada como compatibilidade e não substitui uma falha remota.
- **Escopo:** `sendWorkflowCommand()`, Radar, Minerador, migrations, schema e handoffs não foram alterados. A tabela de status-events prevista no legado ainda não faz parte de 0027; a UI reconstrói o status atual do artefato somente para leitura.
- **Verificado localmente:** teste canônico 6/6, `test:arquiteto` 89/89, runtime 7/7, TypeScript, ESLint dos arquivos novos/rotas e `git diff --check`. Nenhum smoke remoto foi executado.
- **Estado:** `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `REMOTE_SMOKE_PENDING`; próximo gate: `READY_FOR_ARQUITETO_CANONICAL_PERSISTENCE_REMOTE_SMOKE`.

## Bootstrap canônico do workspace em fresh origin — 2026-08-11

- **Cadeia anterior:** as linhas exibidas nascem em `masterList`, montada por `fetchMasterList()` a partir de `listas_kgr`, `keywords_kgr` e `briefings_artigos`; o contexto editorial também continua consumindo `/api/editorial/workspace` e recovery local como superfície legada/mista. O GET `/api/arquiteto/artifacts` apenas preenchia os mapas `acceptedArticleDnas`, `acceptedSiloDnas` e `acceptedSiloPages`.
- **Causa confirmada:** o readback `CANONICAL_REMOTE` era válido, mas não havia adapter entre `VersionEnvelope<ArticleDNA>` e as linhas mínimas que `articlesList` deriva de `masterList`; por isso a tela podia ficar vazia mesmo com ArticleDNA remoto aceito.
- **Implementação local:** `lib/arquiteto/canonical-bootstrap.ts` materializa somente campos já presentes no contrato. A keyword é lida do snapshot sanitizado `keywordDnaSnapshot.sourceKeywordSnapshot.keyword`; slug, hierarquia, intenção, métricas, silo, Brand e entidade vêm do próprio payload/envelope. Sem esse snapshot, o resultado é `INVALID_ARTIFACT`/contract gap explícito, sem defaults editoriais.
- **Precedência:** `CANONICAL_REMOTE` substitui cópia equivalente usando somente `keywordId` ou identidade de entidade (`entityId`/cluster); `LOCAL_RECOVERY` exclusivo é preservado; itens legados recebem `LEGACY_REMOTE`. Não há comparação por nome, slug, owner ou e-mail, e o adapter ignora outra Brand.
- **Erros:** a rota mantém `NO_DATA` como lista vazia; `QUERY_FAILURE`, `SCHEMA_MISSING`, `NOT_AUTHORIZED` e `INVALID_ARTIFACT` preservam código e não são convertidos em empty state. Readback estrutural inválido agora usa `INVALID_ARTIFACT` com diagnóstico sanitizado.
- **Verificado localmente:** fresh-origin, precedência, recovery-only, não duplicação, isolamento de Brand, contract gap e `NO_DATA` estão cobertos; persistência/readback canônico 11/11, `test:arquiteto` 89/89, pipeline runtime 7/7, TypeScript, ESLint dos arquivos afetados e `git diff --check` passaram.
- **Validação manual:** a sessão autenticada abriu `s-smoke`, mas o servidor local ficou preso em `Failed to fetch` de uma chamada legada e não permitiu concluir o smoke visual. Nenhum storage foi inspecionado, limpo ou promovido; nenhuma escrita remota, IA ou SERP foi executada.
- **Estado:** `READY_FOR_ARQUITETO_FRESH_ORIGIN_SMOKE`; não declarar homologação total. O handoff Minerador → Arquiteto e SiloDNA/SiloPage continuam fora desta etapa.

## Regressão do bootstrap após nova sessão — 2026-08-11

- **Causa confirmada:** o efeito de bootstrap dependia de comandos recriados pelo `EditorialPipelineContext`; os próprios setters do bootstrap atualizavam esse contexto e disparavam novas leituras canônicas em ciclo. O loading da origem legada também não podia governar a renderização canônica.
- **Correção local:** `modules/arquiteto/arquiteto-workspace.tsx` agora mantém estado explícito `LOADING`/`LOADED`/`EMPTY`/`ERROR`, finaliza sucesso, erro e cancelamento, materializa o remoto sem exigir `masterList` legado e mantém legacy/recovery como fontes complementares. Nenhuma nova importação, persistência ou operação remota foi adicionada.
- **Validação manual autenticada:** após reload/restart, o workspace exibiu 2 artigos sem spinner nem erro canônico, mesmo com a chamada legada `/api/editorial/workspace` falhando. IA, SERP, escrita remota e limpeza de storage não foram executadas.
- **Estado:** `READY_FOR_ARQUITETO_BOOTSTRAP_REGRESSION_SMOKE`; homologação remota e o handoff Minerador → Arquiteto continuam fora desta etapa.

## Handoff canonico Minerador -> Arquiteto - implementacao local - 2026-08-11

- **Entrada protegida:** `POST /api/arquiteto/handoff` recebe `brandId` e IDs de keywords; `resolvePipelineContext({ brandId, module: "arquiteto", action: "create" })` resolve actor, sessao e autorizacao no servidor.
- **Ledger:** cada keyword valida da mesma Brand gera, quando necessario, um `editorial_workflow_items` com `subject_type = keyword`, `stage = architect`, `source_entity_id` igual ao ID canonico da keyword, origem `MINERADOR` e estado `received`. Nao ha copia do conteudo de `keywords_kgr`.
- **Idempotencia:** a unicidade de Brand, tipo, subject e etapa evita duplicacao; a rota retorna `PERSISTED` ou `UNCHANGED` depois da operacao remota.
- **Workspace:** `GET /api/arquiteto/workspace?brandId=...` monta o read model a partir do ledger, das keywords referenciadas e dos ultimos ArticleDNA/SiloDNA/SiloPage relacionados. Keyword sem ArticleDNA permanece visivel sem agrupamento.
- **Precedencia:** `CANONICAL_REMOTE` e a origem operacional. `/api/editorial/workspace`, localStorage e IndexedDB continuam apenas como legado/recovery e nao determinam o `masterList` novo.
- **Ainda nao verificado:** smoke autenticado remoto, repeticao idempotente, isolamento entre duas Brands e leitura apos nova sessao. IA, SERP, schema, migration e providers nao foram tocados.

## Diagnostico da divergencia do handoff canonico - 2026-08-12

- **Marcador do modal:** `effectiveImportedKeywordIdsForUi` nao e uma leitura direta do ledger. Sua precedencia e recovery plan/audit em memoria, `masterList` renderizada e, como fallback, `architectImportedKeywordIds` do contexto editorial.
- **Persistencia do marcador:** `architectImportedKeywordIds` e recuperado e salvo em `localStorage` por actor + Brand. Portanto, o rotulo `Ja importado no Arquiteto` pode ser `LOCAL_STORAGE`/`IN_MEMORY`, mesmo sem workflow canônico remoto.
- **Fonte do workspace:** `GET /api/arquiteto/workspace` filtra `editorial_workflow_items` por `marca_id` e `stage = architect`; a projecao aceita somente `subject_type = keyword` cujo `subject_id` resolve para `keywords_kgr` da mesma Brand. `state`, `source_entity_id`, `source_version_id` e payload sao carregados, mas nao filtram a entrada atual.
- **Estado:** divergencia relatada pelo usuario e confirmada no contrato local. O diagnostico remoto read-only foi preparado; nao houve repair, reimportacao forcada, backfill, limpeza de storage ou operacao remota.

## Limpeza estrutural sucessora 0032 — 2026-08-12

- **Evidência remota relatada:** o targeted preflight read-only classificou como `DROP_SAFE` as tabelas vazias e o helper exclusivos do recovery histórico 0016/0030; não foram encontrados consumidores runtime locais ou dependências externas bloqueadoras.
- **Preservação:** `public.pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos — `content_document_versions_append_only_trg`, `editorial_artifact_versions_append_only_trg`, `editorial_serp_reviews_append_only_trg` e `editorial_serp_snapshots_append_only_trg` — permanecem fora do manifesto de remoção.
- **Preparação local:** SDD curta, migration sucessora 0032, preflight read-only, post-verifier read-only e rollback local/documental foram preparados. O nome real truncado da trigger 0030 é `brand_exceptional_operation_execution_events_append_only_trg_00`.
- **Estado de preparação:** `0030 runtime/schema = REMOVAL_PREPARED`, `0016 rollback table = REMOVAL_PREPARED`, `STRUCTURAL_CLEANUP_0032 = READY_FOR_MANUAL_APPLY`. 0031 continua reservada/abandonada; o resultado de aplicação está registrado abaixo.

## Resultado remoto da limpeza estrutural 0032 — 2026-08-12

- **Aplicação:** o usuário informou `MIGRATION_0032 = APPLIED` com sucesso.
- **Remoção:** helper 0030, três tabelas candidatas e trigger exclusiva foram confirmados ausentes pelo post-verifier.
- **Preservação:** 12/12 tabelas não-alvo, RLS/ACL/policies reportadas, `pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos passaram; `TARGET_REMOVAL = PASS`, `PRESERVED_OBJECT_CHECKS = PASS` e `SHARED_APPEND_ONLY = PASS`.
- **Lacuna:** nenhum artefato pré-aplicação com o fingerprint do mesmo conjunto `public/non-target-catalog` foi encontrado localmente. `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`; o hash pós-aplicação não será usado como baseline retroativo.
- **Verifier local:** `supabase/scripts/structural-cleanup-0032-post-verification-read-only.sql` está na versão v3; relações/função removidas são verificadas somente por catálogo, e o placeholder continua como `EVIDENCE_GAP`, sem falso FAIL estrutural.
- **Estado:** `STRUCTURAL_CLEANUP_0032 = PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP`. Não reaplicar 0032, não restaurar objetos e não alterar o schema por causa desta lacuna documental.

## Simplificação da criação manual de silo — 2026-08-24

- **Contrato confirmado:** `minerador_keyword_lists` representa o registro operacional do silo e aceita uma lista sem keywords; `SiloDNA` continua sendo o contrato estratégico posterior e exige entidade central/contexto válido.
- **Correção local:** o modal agora exige somente `NOME DO SILO` e `SLUG`. O slug reaproveita a validação existente, exige `/` na entrada e é persistido normalizado no catálogo legado `marcas.silos_existentes`.
- **Proteções:** foram removidos do modal o campo de keyword/entidade central, a criação opcional de SiloPage, situação de publicação e URL publicada. O nome e o slug não são convertidos em entidade, KeywordDNA, principal ou ID sintético.
- **Persistência/workflow:** a criação manual grava apenas o silo operacional vazio. Nenhuma keyword é associada, nenhum `SiloDNA` ou `SiloPage` é criado e a formação posterior continua dependente dos processos do Arquiteto.
- **Verificado no código:** o handler mantém o escopo da marca ativa, a lista começa sem keywords e a documentação registra a regra permanente: “Criação manual de silo exige apenas nome e slug. KeywordDNAs e entidade central são definidos posteriormente pelo processo arquitetural.”
- **Ainda não verificado:** criação autenticada, readback remoto, isolamento entre duas marcas, reload e inspeção visual no Chrome; nenhum SQL, migration, provider, IA ou módulo vizinho foi alterado nesta etapa.

## Correção da regra do criador manual — gate estrutural (2026-08-24)

- **Auditoria:** a simplificação anterior removeu indevidamente a criação pareada de `SiloDNA` e `SiloPage`. O comportamento correto exige somente nome e slug na UI, mas cria os dois artefatos canônicos: SiloDNA em formação e SiloPage `Novo`.
- **Bloqueio confirmado:** o `SiloDNASchema` atual exige `centralEntity` e contexto estratégico completo; não existe estado draft/em formação válido. O `SiloPageSchema` também exige conteúdo derivado do SiloDNA. Usar o nome do silo, `A confirmar` ou qualquer placeholder como entidade violaria a regra de não criar entidade artificial.
- **Persistência:** `minerador_keyword_lists` e `marcas.silos_existentes` são registros operacionais/índice legado e não substituem SiloDNA/SiloPage. O endpoint canônico atual valida schemas estritos e não fornece criação atômica dos dois artefatos.
- **Ação:** criada a SDD `docs/04-arquiteto/propostas/2026-08-24-silo-draft-pareado-silopage-novo.md`. Nenhum código ou persistência foi alterado nesta etapa bloqueada.
- **Próximo gate:** aprovar a extensão estrutural do estado de formação, do esqueleto inicial da SiloPage, da normalização canônica do slug e da persistência pareada antes de implementar.

## Fechamento do fluxo mínimo até o Radar — 2026-08-24

- **Implementado no Arquiteto:** a criação manual usa somente nome + slug e
  chama `POST /api/arquiteto/silos`, que grava o catálogo operacional e cria o
  par canônico `SiloDNA draft` + `SiloPage new`, sem KeywordDNA, entidade,
  principal, intenção, conteúdo ou publicação inventados.
- **Contrato:** `SiloDNASchema` e `SiloPageSchema` receberam
  `formationStatus = "draft"` de forma aditiva. Artefatos formados continuam
  sujeitos às validações estritas; o slug é normalizado para `/segmento` e
  conflitos na mesma Brand são explícitos.
- **Cópia de trabalho:** atribuição de silo, desanexação, slug, hierarquia,
  agrupamento lógico, revisão IA, recomendação SERP seguida e undo/redo usam o
  PATCH canônico de `editorial_workflow_items`, com lock otimista e proteção de
  identidade publicada. A seleção continua sendo estado de ação, não fonte de
  dados.
- **Edição manual de papéis:** em artigos novos, a expansão permite definir cada
  keyword como `Principal`, `Secundária` ou `Reforço`; tornar uma keyword principal
  rebaixa a anterior, grava `role` no mesmo payload da cópia de trabalho e é
  reaplicado no readback. Publicados permanecem bloqueados também contra troca de
  papel ou reagrupamento.
- **Entrada da IA:** cada candidato enviado à revisão DeepSeek conserva um
  `keywordDnaSnapshot` com o objeto enriquecido recebido do Minerador; SERP
  normalizada, silos e proteções publicadas entram no mesmo envelope de contexto.
- **Fluxo visível:** a barra contextual ficou reduzida a `Validar SERP`,
  `Revisar com IA`, `Confirmar arquitetura`, `Enviar ao Radar` e `Limpar
  seleção`. A confirmação é a única consolidação do ArticleDNA e o envio ao
  Radar continua dependente de status aprovado.
- **Providers:** o endpoint `/api/arquiteto/serp` não usa Serper/RapidAPI;
  solicita somente a Connection global DataForSEO já disponível para uma
  consulta SERP normal. A revisão opcional usa a conexão oficial DeepSeek já
  existente, sem OpenRouter ou fallback.
- **Entrada sem recarga duplicada:** o carregamento do catálogo de silos é
  protegido por Brand durante a sessão e só é repetido por troca de Brand ou
  ação explícita de criação. O handler de criação não chama mais
  `refreshBrands()`.
- **Limite:** a criação pareada é `READBACK_GUARDED_SEQUENTIAL`, não uma
  transação atômica. Em falha posterior, o endpoint informa par incompleto e
  não mascara sucesso; nenhuma migration/RPC, escrita manual, provider real ou
  rollback destrutivo foi executado pelo agente.
- **Verificação local:** testes puros DataForSEO `2/2` e cópia de trabalho
  `4/4`; `test:arquiteto` mantém `108/109`, com uma falha estática preexistente
  em asserção do Minerador;
  TypeScript mantém somente os erros preexistentes registrados no handoff.
  Chrome autenticado, Supabase readback remoto, DataForSEO/DeepSeek reais e
  touchpad ainda aguardam validação manual autorizada.

### Ajuste do gate de quantidade do ArticleDNA

- **Regra vigente:** uma keyword principal é suficiente para confirmar um
  ArticleDNA; podem existir até cinco secundárias/reforços; seis é teto, não
  meta. Nenhuma keyword é inventada para completar o artigo.
- **Implementação:** `MIN_KEYWORDS_PER_APPROVED_ARTICLE = 1` e
  `articleApprovalIssues` agora validam 1–6, mantendo exatamente uma principal,
  silo, hierarquia, slug e aprovação humana como gates independentes.
- **Compatibilidade:** ArticleDNAs existentes com 2–6 keywords permanecem
  válidos; não houve migration, regravação de dados ou alteração interna do
  Radar.
- **SDD:** [`propostas/2026-08-24-article-dna-uma-a-seis-keywords.md`](propostas/2026-08-24-article-dna-uma-a-seis-keywords.md).

## DataForSEO SERP compartilhada — correção do consumidor — 2026-08-25

- **Auditoria do contrato DataForSEO:** o runtime canônico efetivamente
  confirmado no baseline expõe `dataforseo.allintitle` como caminho disponível
  para resolver a Connection global. Esse metadado não define a consulta do
  Arquiteto: o adapter monta SERP orgânica normal, sem o prefixo
  `allintitle:"<keyword>"`, porque allintitle não é SERP geral.
- **Correção local:** o consumidor deixou de depender da ausência/presença de
  `dataforseo.serp_compatibility`. `Validar SERP` chama o resolvedor canônico
  já existente para localizar a Connection global DataForSEO READY no contexto
  autorizado de Brand; não há uma Connection ou capability específica de SERP
  do Arquiteto. A Connection continua compartilhada com o Minerador.
- **Operação compartilhada:** o executor server-side DataForSEO usa
  `POST /v3/serp/google/organic/live/regular` com a keyword normal, normaliza
  organic/PAA/related em `SerpResearchSnapshot`, registra `module_operation`
  no ledger como `serp_validation` e uma unidade por consulta. A operação não
  é executada no mount, em testes ou automaticamente.
- **Limitação explícita:** falha de autorização, Connection, secret ou
  provider retorna erro sanitizado e não aplica assessment parcial; o estado
  de trabalho anterior permanece. `allintitle` não é usado como SERP, não há
  Serper/RapidAPI/fallback e o Radar poderá reutilizar a infraestrutura sem
  receber decisões de agrupamento do Arquiteto.
- **Validação remota pendente:** executar um smoke autenticado explícito e
  confirmar a coleta e o diagnóstico; nenhuma chamada paga foi executada pelo
  agente.
- **Contrato DeepSeek:** `Revisar com IA` usa
  `resolveDeepSeekCanonicalConfig` + `generateStructuredAI`, com o model,
  endpoint, JSON mode e thinking definidos pela Connection global. A revisão
  explicita `maxTokens = 4000` e `thinkingMode = disabled` somente nesta
  operação, mantém o snapshot completo do KeywordDNA, assessments SERP, silos
  e proteções de publicados; o endpoint rejeita o lote sem um assessment SERP
  ativo por artigo. O diagnóstico server-side separa resolução, request,
  conteúdo vazio/reasoning-only, truncamento, JSON, Zod e validação da proposta;
  falhas não aplicam estado parcial.
- **Verificado no código/testes:** não há chamada ativa a OpenRouter, Serper,
  RapidAPI ou capability SERP inventada dentro do Arquiteto. A extensão da
  fundação compartilhada foi aditiva; nenhuma alteração remota ou operação de
  schema foi executada nesta correção.
- **Ainda não verificado:** catálogo remoto/Connection real, smoke autenticado
  DataForSEO/DeepSeek e browser real; nenhum provider pago foi chamado pelo
  agente.

## Experiência funcional sem infraestrutura — 2026-08-24

- **Implementado no frontend do Arquiteto:** removidas dos títulos, subtítulo,
  aviso e ação do preview SERP as referências a DataForSEO, crédito, retry e
  consulta técnica. O fluxo agora apresenta `Validar SERP` e contexto editorial.
- **Implementado na revisão IA:** o botão e os estados visíveis usam somente
  `Revisar com IA`; títulos não expõem modelo, provider, Connection, tokens,
  thinking, quota ou custo.
- **Falhas traduzidas:** respostas de SERP usam
  `Validação SERP indisponível no momento.`; respostas das operações de IA usam
  `Não foi possível concluir a revisão com IA.`. A rota continua preservando
  código e detalhe técnico internamente, sem renderizá-los na área.
- **Controles manuais preservados:** a correção não altera seleção, movimento
  de artigos/silos, papéis de keywords, hierarquia, confirmação manual ou envio
  ao Radar.
- **Fronteira:** nenhuma API global, provider, Connection, capability, quota,
  Usage, migration, schema, persistência remota ou módulo vizinho foi alterado.
- **Verificado localmente:** teste `arquiteto-global-providers` passou 4/4;
  validação de browser real e chamada de provider continuam pendentes.

## Seleção individual e readback de silos — 2026-08-25

- **Seleção:** cada linha usa `workingArticleId`, `articleId` ou outro ID
  persistente da cópia de trabalho, resolvido em
  `resolveWorkingArticleId`; `clusterId`, silo, keyword principal, array de
  keywords e índice visual não participam da seleção. Quando a cópia ainda não
  possui artigo, o fallback é o ID persistente do workflow; ao formar um artigo
  provisório, um `workingArticleId` é atribuído uma vez e enviado no payload da
  cópia de trabalho.
- **Controles distintos:** o checkbox da linha possui `data-article-selection-id`;
  o checkbox do cabeçalho possui `data-article-group-selection-id` e atua
  somente sobre artigos visíveis daquele grupo. O checkbox da Página do Silo
  possui `data-silo-page-selection-id` e permanece separado.
- **Sem Silo:** continua sendo `siloId = null` na cópia de trabalho e somente
  uma seção visual `ARTIGOS SEM SILO`. O seletor canônico rejeita IDs sentinela
  como `sem-silo`; nenhum SiloDNA, SiloPage ou slug de fallback é criado.
- **Silos reais:** o seletor é hidratado pelo readback de SiloDNA/SiloPage
  canônicos. Quando um SiloDNA legado não contém `name`, a etiqueta é derivada
  somente de breadcrumb, H1 ou slug da SiloPage já persistida. A criação manual
  atualiza a opção imediatamente e dispara uma única confirmação canônica,
  sem recarga duplicada na entrada da Brand.
- **Arraste:** o pointerdown permanece candidato a clique; somente após 6px o
  listener chama `preventDefault`, aplica `user-select: none` e faz
  `setPointerCapture`. A linha é localizada por `elementFromPoint` +
  `data-article-selection-id`; a pintura recalcula o intervalo a cada mudança
  de linha e ignora movimentos repetidos ou Sets semanticamente iguais.
- **IA:** `Revisar com IA` usa o resolver global DeepSeek, força `disabled`
  apenas na chamada estruturada e limita a resposta a 4.000 tokens. Uma
  resposta válida fica como proposta pendente; nenhum movimento, seleção,
  troca de silo, principal ou confirmação de ArticleDNA acontece sem ação
  humana explícita.
- **Verificação:** testes focados de seleção, cópia canônica e providers
  passaram `24/24`; o typecheck mantém somente os quatro erros preexistentes do
  Minerador/testes de regex. Chrome autenticado, mouse/touchpad e logs reais
  do endpoint ainda aguardam validação manual porque a sessão disponível estava
  na tela de login.

## Verificação final da correção de seleção e DeepSeek — 2026-08-25

- **Suite oficial do Arquiteto:** `120/121` testes passaram. O único erro é o
  teste estático legado de `tests/arquiteto-domain.test.mts` que ainda procura
  a marcação antiga do botão `Processar lógica` no componente do Minerador;
  não é causado por este módulo.
- **Suite focada da alteração:** `24/24` testes passaram, cobrindo identidade
  persistente, F5/readback, clique, Ctrl/Cmd, Shift, grupos, silos, pintura,
  propagação e diagnóstico sanitizado da IA.
- **TypeScript:** permanecem os quatro erros já existentes: um erro de
  nulabilidade em `lib/minerador/keyword-qualification.ts` e três flags de
  regex ES2018 no teste interno da plataforma. Nenhum erro novo do Arquiteto
  foi introduzido.
- **Limitação de ambiente:** o teste de persistência canônica isolado não pode
  ser executado diretamente pelo Node 24 em modo strip-only porque o fixture
  usa parameter properties; o script oficial do módulo não inclui esse arquivo.
- **Validação ainda pendente:** Chrome autenticado com mouse e touchpad e
  leitura dos valores reais do diagnóstico de `/api/revalidate-structure`.
  Nenhuma API paga, provider real, gravação remota ou infraestrutura global foi
  acionada pelo agente.

## Latência da seleção — 2026-08-25

- **Causa localizada no caminho de renderização:** `setSelectedArticleIds`
  atualizava o estado no componente da planilha, e o componente pai reconstruía
  cada linha e seu conteúdo pesado a cada toggle. A seleção também não pode
  participar de dados derivados, persistência, readback ou bootstrap.
- **Correção local:** a linha agora é `MemoizedArticleRow`, a célula do
  checkbox é `MemoizedArticleSelectionCell` e as células/paineis caros usam
  `MemoizedArticleSubtree`. A comparação recebe somente `selected` e uma
  revisão dos dados da tabela; `selectedArticleIds` não integra essa revisão.
  Assim, o checkbox e a classe visual da linha alterada atualizam, enquanto
  linhas não afetadas e células pesadas permanecem memoizadas.
- **Handlers estáveis:** clique, Ctrl/Cmd, Shift e pintura consultam refs
  atualizadas no efeito, evitando que cada mudança de seleção recrie handlers
  ou inclua o `Set` inteiro nos props. A pintura continua recalculando o
  intervalo imediatamente e usando comparação semântica de `Set`.
- **Fronteira preservada:** o toggle não chama persistência da cópia de
  trabalho, fetch/readback canônico, refresh, agrupamento, ordenação, SERP ou
  IA. O rodapé, contadores, indeterminate e a seleção de grupo continuam
  podendo renderizar porque dependem legitimamente da seleção.
- **Verificado no código/testes:** o teste focado da seleção passou `15/15`,
  incluindo regressão que verifica a memoização e a ausência de persistência
  no handler do clique. TypeScript não acusa erro no Arquiteto.
- **Medição pendente:** não foi possível coletar os tempos reais A/B/C/D com
  `performance.now()` no Chrome autenticado porque nenhum backend Chrome estava
  disponível nesta sessão. Portanto não há números reais antes/depois
  declarados aqui.
- **Validação manual pendente:** mouse e touchpad em Chrome autenticado,
  incluindo clique simples, Ctrl/Cmd, Shift, pintura e retorno no arraste.

## Histórico — Consolidação canônica A1–A20 — 2026-08-25

### IMPLEMENTADO / verificado no código

- O conceito do Arquiteto foi consolidado em três áreas: Artigos, Silos e
  Links Internos. A planilha continua como mesa operacional e não foi
  redesenhada nesta fila.
- Artigos possuem working copy, grupos, papéis manuais, ArticleDNA,
  referências KeywordDNA, hashes, versões, SERP de formação e revisão IA como
  proposta pendente.
- Silos possuem assignments, SiloDNA draft, SiloPage distinta, Pilar/Suportes
  no contrato e criação manual pareada com readback guardado.
- A UI ativa do Arquiteto não solicita Serper, RapidAPI ou OpenRouter; não foi
  criada infraestrutura de provider no módulo.
- A seleção permanece efêmera e não dispara persistência editorial.
- Não foi alterado nenhum módulo vizinho, provider global, Connection,
  capability, quota, schema, RLS, migration ou contrato compartilhado
  estrutural.

### VALIDADO LOCALMENTE / auditoria estática

- Foram confrontados docs canônicos, ADRs, contratos, adapters, workspace,
  routes, repositories, migrations locais e testes.
- O código possui `ArticleDNA.internalLinks`, `SiloDNA.linkMap`,
  `ContentPlanInternalLink` e `InternalLinkAssignment`, mas não possui
  `InternalLinkGraph`, repository, artifact type ou route canônico.
- A criação de Silo atual é `READBACK_GUARDED_SEQUENTIAL`, não transacional.
- O schema atual de Silo formado ainda aceita `pillarArticleId` nulo; a regra
  de produto consolidada exige exatamente um Pilar e precisa de gate local no
  lote de Silos.
- O Arquiteto usa contexto básico de Brand (id/nome/nicho); o Brand Context
  Pack selecionado e o gabarito final de docs/skills ainda não existem no
  caminho do módulo.
- A resolução DataForSEO e a execução SERP usam adapter global/compartilhado;
  smoke autenticado e contrato global em runtime não foram verificados.
- A regressão automatizada do módulo executada após a consolidação passou
  `120/121`; a única falha é uma asserção estática legada do teste do Minerador
  sobre a marcação antiga do botão `Processar lógica`.
- O relatório histórico consolidado está em
  `docs/_arquivo/2026-08-documentacao-legada/arquiteto-auditoria-consolidacao-canonica-2026-08-25.md`.

### VALIDADO MANUALMENTE

- Nenhuma validação manual Chrome, provider real, Supabase remoto ou
  persistência remota foi executada nesta fila documental.
- O histórico manual registrado anteriormente continua separado e não é
  reutilizado como evidência de validação desta consolidação.

### PLANEJADO

- Fechar proveniência/working copy e estados independentes de lógica, SERP, IA
  e revisão.
- Formalizar candidata a Silo sem promoção automática.
- Reforçar o gate de exatamente um Pilar antes de Silo formado.
- Fechar verticalidade e regras locais de slug sem alterar publicados.
- Implementar SERP/IA como evidência/proposta em lotes locais.
- Implementar o InternalLinkGraph somente depois de decisão estrutural.
- Implementar React Flow somente como projeção depois do grafo.
- Definir Brand Context Pack e docs/skills em decisão própria de Marca/Planner
  Geral.

### BLOQUEADO POR PLATAFORMA

- `InternalLinkGraph` canônico: faltam contrato compartilhado, persistência,
  tenant/RLS, versionamento, readback e handoffs.
- Handoff completo de Links ao Planejador/Redator/Publicações depende do grafo.
- Brand Context Pack formal depende de contrato entre Marca e Planner Geral.
- Atomicidade transacional do pair SiloDNA/SiloPage permanece uma dívida; uma
  garantia forte requer boundary da Plataforma.

### DÍVIDA E DIVERGÊNCIAS

- A UI ainda não expõe três áreas operacionais explícitas; o conceito foi
  documentado sem iniciar redesign.
- `SiloDNA.linkMap` é uma relação mínima de suporte/Pilar, não o grafo
  completo.
- `InternalLinkAssignment` pertence ao fluxo operacional/ContentPlan e não
  deve ser promovido silenciosamente a grafo.
- Entradas antigas do backlog descrevendo criação catalogue-only ou ausência de
  pair são históricas; o código atual cria drafts pareados com readback.
- A presença remota de migrations downstream, tabelas e RLS não foi confirmada
  nesta fila, pois não houve SQL nem consulta remota.

### Documentos desta consolidação

- `docs/04-arquiteto/visao-canonica-artigos-silos-links.md`;
- `docs/_arquivo/2026-08-documentacao-legada/` para auditoria, plano e pedido;
- `docs/04-arquiteto/links-internos-estado-e-contrato.md` para o contrato atual.

## Lote 1 — proveniência KeywordDNA → ArticleDNA — 2026-08-25

### IMPLEMENTADO / verificado no código

- A working copy do Arquiteto passa a carregar um snapshot de proveniência do
  KeywordDNA recebido, sem reconstruí-lo a partir de texto ou reduzi-lo a
  keyword e volume.
- A referência individual do ArticleDNA reutiliza o `keywordDnaRef` e o
  snapshot íntegro quando disponíveis; o payload compatível legado fica
  separado da fonte bruta recebida.
- `null` permanece `null`, zero real permanece zero e campos ausentes não são
  inventados. Identidade, brand, demanda, competição, comercial, KGR,
  publicação, decisão humana, histórico e refs ficam preservados no snapshot
  de origem, com sanitização apenas de material privado.
- O bootstrap/F5 local projeta novamente `keywordDnaRef` e o snapshot; o
  handoff preserva `source_version_id` e `content_hash` quando o Minerador os
  fornece.
- A cópia de trabalho não perde slug, hierarquia ou papel já recebido quando
  não existe assignment explícito; assignment explícito continua tendo
  precedência.
- Não houve mudança de regra de agrupamento, schema, migration, RLS,
  provider, API global, Minerador ou Radar.

### CAMPOS EVIDENCIADOS

- Identidade: `keywordId`, texto original/normalizado, versão/hash explícitos,
  origem e `brandId`.
- Lógica: intenção, intenção canônica, entidade, modificadores, nicho,
  funil, confiança, ambiguidade, maturidade e decisão humana presentes no
  registro de origem.
- Demanda/competição/comercial/KGR: volume, status, tendência, sazonalidade,
  picos, histórico/ref, targeting, medição/provider, resultados, KD,
  backlinks, CPC, competição Ads, índice, bids/currency e campos KGR quando
  presentes; ausência continua ausência.
- Publicação/humano/proveniência: status, URL, slug, canonical, política da
  principal, revisão/aprovação/decisão, snapshots e refs de provider.

### VALIDADO LOCALMENTE

- Testes focados de workspace, bootstrap, ArticleDNA, readback local e
  handoff: `19/19`.
- Testes focados de evidência de demanda e handoff: `21/21`.
- `test:arquiteto`: `122/123`; a única falha é a asserção estática legada do
  teste do Minerador sobre a marcação antiga de `Processar lógica`, fora do
  módulo proprietário e sem correção nesta tarefa.
- ESLint direcionado: `0` erros; os dois arquivos de teste são ignorados pela
  configuração global. TypeScript continua com os erros preexistentes em
  `lib/minerador/keyword-qualification.ts` e no teste de regex TS1501, sem
  erro novo nos arquivos alterados. `git diff --check` passou.

### NÃO VERIFICADO / LIMITAÇÕES

- Não houve Supabase remoto, F5 autenticado no Chrome, persistência remota,
  provider real ou chamada paga. O readback comprovado neste lote é local e
  baseado em fixtures.
- O teste isolado da persistência canônica não executou por limitação já
  existente do runner Node/TypeScript com resolução de imports `.ts`; isso não
  foi contornado com alteração estrutural.

### PEDIDO ESTRUTURAL PARA O PLANNER GERAL

- O repositório ativo não expõe um artifact/repository canônico separado de
  KeywordDNA no caminho de persistência do Arquiteto. Quando a linha recebida
  não fornece versão/hash explícitos, o adaptador usa referência de
  compatibilidade `legacy:` e preserva o registro bruto, mas isso não é prova
  de uma versão canônica persistida. Se a identidade versionada for
  obrigatória para toda keyword, é necessário contrato/fundação estrutural do
  Planner Geral. Nenhuma migration, schema, RLS ou escrita remota foi feita.

## Lote 2 — baseline operacional da working copy — 2026-08-25

### IMPLEMENTADO / verificado no código

- A seleção continua sendo estado efêmero de `workingArticleId` e seus
  handlers não chamam persistência, fetch, readback, rebuild de ArticleDNA ou
  SiloDNA, SERP, IA, hash, recovery ou regrouping.
- A causa observável da falha visual foi corrigida: o clique normal cancelava o
  comportamento nativo do checkbox com `preventDefault()`. A linha e o estado
  já mudavam, mas o checkbox permanecia visualmente desmarcado. O bloqueio
  nativo continua somente no ramo de supressão após pintura por arraste.
- A medição temporária dev-only `architect.selection.click-to-commit` registra
  o intervalo entre a interação e o commit visual via `useLayoutEffect`, sem
  persistir ou transmitir dados.
- Clique individual, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura, grupos,
  indeterminate, filtros e seleção oculta continuam usando o controlador
  existente e não foram substituídos por uma regra nova.
- `Validar SERP` agora executa diretamente `confirmSerpValidation(groups)`;
  o modal intermediário foi removido. O status permanece inline na planilha,
  com `SERP processando` e o botão desabilitado enquanto a ação está em curso.
  Executor, adapter DataForSEO e persistência funcional não foram alterados.

### MEDIÇÃO REAL NO CHROME

- No workspace Care Glow, com quatro artigos, dez ciclos consecutivos de
  marcar/desmarcar por mouse mediram `11,10–23,20 ms` de click-to-commit.
- Shift mediu `23,80 ms`; Ctrl/Cmd aditivo mediu `34,60 ms`; pintura contínua
  mediu `35,40–37,70 ms`. O feedback visual foi imediato nos ciclos observados.
- O gesto contínuo de ponteiro foi validado por arraste; hardware de touchpad
  não esteve disponível para uma medição física separada.
- Foram conferidos também seleção de cabeçalho, seleção múltipla, estados
  checked/unchecked e responsividade em larguras `360`, `768`, `1024` e
  `1440` pixels.

### TESTES E LIMITAÇÕES

- Testes focados de seleção e fluxo global: `20/20`.
- `test:arquiteto`: `122/123`; a única falha é a asserção estática legada do
  teste do Minerador sobre a marcação antiga de `Processar lógica`, fora do
  módulo proprietário.
- TypeScript continua bloqueado pelos quatro erros preexistentes em
  `lib/minerador/keyword-qualification.ts` e nos testes de regex `TS1501`;
  nenhum erro novo foi identificado nos arquivos alterados.
- ESLint direcionado não passou no componente existente do Arquiteto, com
  regras React de refs já presentes no arquivo; testes são ignorados pela
  configuração. Não foi feita limpeza fora do escopo.
- `git diff --check` passou.
- O clique manual de `Validar SERP` não abriu confirmação secundária e exibiu
  processamento inline. A execução permaneceu em processamento durante a
  janela observada; não há prova de conclusão do provider, persistência remota
  ou readback, e nenhum provider real foi declarado como homologado.

### NÃO ALTERADO

- Nenhuma lógica SERP, IA, provider, adapter, Minerador, Radar, schema,
  migration, RLS, RPC ou API global foi alterada.

### PRÓXIMO LOTE

- O pacote do Lote 3 foi recebido e implementado na seção seguinte. O pacote
  do Lote 4 também foi recebido e está registrado na seção posterior.

## Lote 3 — lógica canônica de artigos e candidata a Silo — 2026-08-25

### IMPLEMENTADO / verificado no código

- O Arquiteto possui uma primeira leitura determinística separada de SERP e
  IA. A análise considera, nesta ordem, volume/demanda, resultados e
  competitividade, intenção, entidade/coerência, KGR, sinais comerciais
  secundários e demais evidências disponíveis.
- Volume alto não cria candidata sozinho. A hipótese exige liderança relativa
  no universo, termo curto/abrangente, capacidade de sustentar cobertura e
  evidência competitiva ou KGR; necessidade específica bloqueia a reserva por
  volume isolado.
- A oportunidade KGR só é marcada quando volume é `>= 120` e resultados são
  menores que o volume. `null` permanece desconhecido, zero permanece zero,
  KGR não aprova e não define Pilar automaticamente.
- Grupos provisórios recebem `groupingReasons` estruturadas com mesma intenção,
  mesma entidade, mesma necessidade, variação semântica, possível separação,
  ambiguidade ou conflito. O resultado continua sendo hipótese revisável.
- Candidatas fortes recebem `siloCandidate` com status, origem, score, sinais e
  razões; ficam reservadas na working copy, fora dos grupos usados para formar
  artigos, sem criar SiloDNA, SiloPage ou ArticleDNA.
- A interface expõe as candidatas provisórias, permite remover a marcação ou
  transformá-las em artigo provisório. A decisão humana recebe `origin:
  human` e não é sobrescrita por novo processamento determinístico.
- A reserva atravessa o payload existente da working copy, o readback do
  workspace canônico e o overlay de recovery local. A extensão é aditiva; não
  houve migration, schema SQL, RLS, RPC ou nova entidade persistida.

### VALIDADO LOCALMENTE

- Suíte específica do Lote 3: `9/9`.
- Suíte focada de regressão do Arquiteto: `81/82`; a única falha é a asserção
  estática legada do Minerador sobre a marcação antiga de `Processar lógica`.
- `test:arquiteto`: `122/123`, com a mesma falha estática fora do módulo.
- TypeScript não acusa erros novos em Arquiteto, contratos, rota ou testes;
  permanecem quatro erros preexistentes fora do escopo.
- ESLint dos arquivos de domínio, contrato, recovery, rota e teste passou sem
  erros. O componente completo mantém a dívida preexistente de `69` erros e
  `27` avisos.
- `git diff --check` permanece obrigatório na conferência final deste lote.

### VALIDADO NO CHROME / LIMITAÇÃO OPERACIONAL

- A rota tenantizada do Arquiteto carregou em Chrome com a planilha existente
  e quatro artigos após a hidratação.
- A ação `Processar lógica` não foi clicada no workspace autenticado: ela
  persiste a working copy remota. O estado candidato específico foi validado
  por fixtures e testes locais, sem escrita remota, SERP ou IA.

### NÃO ALTERADO

- Nenhuma chamada SERP, provider, IA, Radar, Minerador ou regra de agrupamento
  baseada em SERP foi adicionada. Nenhum ArticleDNA consolidado é produzido
  pelo Lote 3.

### PRÓXIMA FRENTE

- O pacote do Lote 4 foi recebido e implementado na seção seguinte. IA e
  revisão continuam aguardando o pacote operacional do Lote 5.

## Lote 4 — SERP de formação dos artigos — 2026-08-25

### IMPLEMENTADO / verificado no código

- O assessment SERP mantém `formationEvidence` por `keywordId` e
  `keywordDnaVersionId`, com compatibilidade observada, sobreposição,
  intenção observada, tipo dominante de página, competição, conflito,
  canibalização provável, necessidade de separar, possibilidade de juntar,
  principal possivelmente inadequada e evidência insuficiente.
- A sobreposição usa URLs e domínios observados nos snapshots e permanece
  vinculada por IDs estáveis; texto, ordem ou índice não são identidade.
- As diretrizes persistidas deixam explícito que SERP observa e não move,
  divide, junta, troca principal, cria Silo ou consolida ArticleDNA. A ausência
  de resultados permanece insuficiência, nunca conflito automático.
- Candidatas a Silo podem ser consultadas pelo mesmo fluxo DataForSEO e recebem
  `SerpSiloCandidateAssessment` separado, com KeywordDNA integral e evidência
  de categoria/hub, amplitude e múltiplas necessidades. Nenhuma candidata é
  promovida e nenhum Silo é criado.
- O readback local valida hash, quantidade de snapshots/recomendações e a
  evidência das candidatas. Falha de nova consulta não substitui assessment ou
  snapshot válido anterior.
- A planilha continua visível, os resultados são inline e a ação `Validar
  SERP` não reintroduz modal intermediário.

### VALIDADO LOCALMENTE

- `tests/arquiteto-serp-formation.test.mts`: `31/31`.
- `test:arquiteto`: `126/127`; a única falha é a asserção estática legada do
  Minerador sobre a marcação antiga de `Processar lógica`, fora deste lote.
- TypeScript não acusa erros novos no Arquiteto, rota ou contratos; permanecem
  os quatro erros preexistentes já registrados fora do escopo.
- ESLint dos arquivos de domínio e rota passou sem erros. O componente de
  workspace mantém a dívida preexistente do compilador React/ESLint.
- `git diff --check` foi executado após a implementação.

### LIMITAÇÕES / NÃO VERIFICADO

- Nenhum provider real, chamada paga, persistência Supabase, readback remoto ou
  reload autenticado foi executado. A persistência verificada neste lote é o
  artefato local do workspace.
- A validação manual Chrome de dez cliques, touchpad, Shift e drag permanece a
  evidência operacional do Lote 2; não foi repetida nem ampliada por este lote.
- Não houve migration, SQL, schema remoto, RLS, RPC, provider, Minerador,
  Radar ou mudança de infraestrutura.

### ARQUIVOS PRINCIPAIS

- `lib/arquiteto/serp-formation.ts`
- `app/api/arquiteto/serp/route.ts`
- `modules/arquiteto/arquiteto-workspace.tsx`
- `tests/arquiteto-serp-formation.test.mts`
- `docs/04-arquiteto/estado-atual.md`
- `docs/04-arquiteto/backlog.md`

### PRÓXIMO LOTE

- O pacote do Lote 5 foi recebido e implementado na seção seguinte. A SERP
  continua apenas como evidência para a revisão da IA.

## Lote 5 — IA de arquitetura dos artigos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `Revisar com IA` mantém lotes compactos e explicita as subtarefas internas
  `diagnosticar_grupos`, `revisar_pertencimento`, `revisar_papeis`,
  `revisar_canibalizacao` e `consolidar_proposta`.
- O plano A–E é derivado dos grupos, catálogo, pré-análise lógica e assessment
  SERP recebidos. Ele marca insuficiência de evidência e não inventa fatos.
- A Marca envia somente o contexto já disponível e pertinente: `id`, nome,
  nicho e `dna_diretrizes` como `guidelines`. Não foi criada persistência nova.
- A saída é compacta por IDs, com `proposalId`, `approvalStatus:
  pending_human`, rastreio das etapas e diff. O KeywordDNA integral permanece
  na entrada e não é repetido na resposta.
- A proposta não altera versão consolidada, ArticleDNA, SiloDNA ou aprovação.
  A aplicação gera `AIReviewAnnotation` em `pending_fine_review`, mantém undo
  e aguarda confirmação do salvamento antes do sucesso.
- A revisão humana pode rejeitar decisões individualmente antes da aplicação.
  Resposta incompleta não chega à UI como proposta: o lote inteiro precisa
  passar pela validação.
- Proteções de publicado permanecem no route e no aplicador; URL, slug,
  canonical e política não são alterados pela IA.

### VALIDADO LOCALMENTE

- `test:arquiteto`: `127/128`; a única falha é a asserção estática legada do
  Minerador sobre a marcação antiga de `Processar lógica`.
- Teste novo confirma as cinco etapas, diff por IDs, ausência de KeywordDNA na
  resposta enriquecida e estado `pending_human`.
- ESLint focado dos contratos, domínio, rota e novo módulo passou sem erros. O
  lint completo do workspace mantém a dívida preexistente (`68` erros e `28`
  avisos no componente `arquiteto-workspace.tsx`).
- TypeScript foi executado pelo binário local; permanecem apenas os quatro
  erros preexistentes já conhecidos em Minerador/testes de infraestrutura.
- `git diff --check` passou. Nenhum provider real, chamada paga, Supabase,
  persistência remota ou reload autenticado foi executado.

### GAPS / GOVERNANÇA

- Não houve necessidade de Plataforma, Supabase, schema, RLS, RPC ou provider;
  nenhum pedido estrutural foi aberto ao Planner Geral neste lote.
- A validação manual Chrome da revisão com IA, rejeição parcial e undo permanece
  não verificada por exigir sessão autenticada e chamada DeepSeek real.

### PRÓXIMO LOTE

- O pacote do Lote 6 foi recebido e implementado na seção seguinte. A área
  ARTIGOS agora possui gate de consolidação e handoff controlado.

## Lote 6 — consolidação ArticleDNA e publicados — 2026-08-25

### IMPLEMENTADO / verificado no código

- A confirmação exige principal definida, de 1 a 6 refs individuais, papéis
  válidos, cobertura exata das refs, evidência SERP referenciada, ausência de
  decisões IA pendentes e ausência de conflitos associados ao artigo.
- A confirmação cria sucessora humana e persiste status `approved`; nenhuma
  versão consolidada é sobrescrita diretamente.
- O gate preserva `brandId`, URL publicada, slug e canonical. `locked` e
  `unknown` não permitem troca silenciosa da principal; `reviewable/revisable`
  permite sucessora com a identidade publicada protegida.
- Após persistir, o Arquiteto consulta novamente o workspace canônico e
  compara `versionId`, hash, marca, principal, slug, canonical e status
  `approved` antes de liberar o handoff.
- O ArticleDNA recém-confirmado dispara o primeiro smoke pelo handoff já
  existente para o Radar. O readback local confere versão, hash e o conjunto
  de refs individuais KeywordDNA. O Radar não foi alterado e
  `InternalLinkGraph` não é requisito deste lote.
- A geração de ArticleDNA passa a anexar a ref versionada do assessment SERP
  ativo quando ele existe; sem essa evidência a confirmação é fail-closed.

### VALIDADO LOCALMENTE

- Teste focado novo: `4/4`.
- Boundary global do Arquiteto: `11/11`.
- `test:arquiteto`: a nova cobertura passa; permanece a falha estática legada
  do Minerador sobre a marcação antiga de `Processar lógica`.
- ESLint do novo módulo passou. O lint do workspace continua com a dívida
  preexistente do componente grande `arquiteto-workspace.tsx`.
- TypeScript foi executado pelo binário local; os erros retornados são os
  conhecidos fora deste lote em Minerador e fixtures de testes.
- `git diff --check` passou; os avisos exibidos são apenas normalização de
  finais de linha do checkout.

### GAPS / GOVERNANÇA

- O readback implementado é canônico no fluxo, mas não foi executado contra
  sessão Supabase autenticada nem por reload Chrome nesta rodada.
- Nenhum provider real, chamada paga, SQL, migration, schema, RLS, RPC,
  alteração no Radar, Minerador ou infraestrutura foi executado.
- Não houve necessidade de Plataforma/Supabase/schema/RLS/RPC; nenhum pedido
  estrutural foi aberto ao Planner Geral.

### PRÓXIMO LOTE

- Lote 7 — aguardando pacote operacional próprio; não foi inferido escopo.

## Lote 7 — formação canônica dos Silos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `lib/arquiteto/silo-formation.ts` forma uma working copy determinística a
  partir de ArticleDNAs já confirmados, mantendo para cada artigo a versão,
  hash e refs compactas individuais de KeywordDNA.
- A formação considera entidade, intenção, proximidade semântica, centralidade,
  amplitude, capacidade de suportes, competitividade e risco de colisão. Volume
  é sinal de demanda e não vence sozinho; `null` permanece desconhecido.
- Silo existente semanticamente equivalente é fortalecido na hipótese. Novo
  Silo só é marcado como candidato quando há arquitetura mínima para
  verticalização; grupo insuficiente permanece visível e rastreado.
- Cada working copy mantém exatamente um candidato provisório a Pilar e
  separa explicitamente os Suportes. KGR aparece como evidência secundária e
  não promove Pilar automaticamente.
- SiloPage fica representada como universo/categoria independente do Pilar,
  com detecção de slug coincidente e colisão com outra SiloPage. Novos nomes e
  slugs são curtos, limitados a dois termos e não repetitivos.
- Publicados não são alterados: a projeção marca proteção de brand, URL, slug
  e canonical. A UI permite revisar o Pilar provisório sem criar versão
  consolidada.
- A ação `Formar Silos` é local e reversível. Não chama SERP, IA, provider,
  fetch, Supabase, migration, schema, RLS, RPC ou persistência de SiloDNA/
  SiloPage.

### VALIDADO LOCALMENTE

- Teste focado do Lote 7: `6/6`.
- `test:arquiteto`: `139/140`; a única falha permanece a asserção estática
  legada do Minerador sobre a marcação antiga de `Processar lógica`, sem falha
  nos testes de Silos.
- `pnpm exec tsc --noEmit` e ESLint direcionado não puderam ser executados:
  os binários não estão disponíveis neste checkout/ambiente.
- Não houve provider real, chamada paga, sessão Chrome autenticada, F5,
  persistência Supabase remota ou readback remoto neste lote.
- `git diff --check` foi executado e passou; os avisos exibidos são apenas de
  normalização LF/CRLF. O checkout já contém alterações preexistentes extensas
  e não foi limpo.

### GAPS / GOVERNANÇA

- A working copy de Silos desta etapa é projeção local em memória. Persistência
  canônica, nova entidade, transação pareada SiloDNA/SiloPage e RLS continuam
  fora do escopo; não houve necessidade de abrir pedido estrutural ao Planner
  Geral neste lote.
- SERP e IA ainda precisam revisar a hipótese antes de qualquer consolidação.

### PRÓXIMO LOTE

- Lote 8 — validação e consolidação dos Silos implementado abaixo.

## Lote 8 — validação e consolidação dos Silos — 2026-08-25

### IMPLEMENTADO / verificado no código

- `lib/arquiteto/silo-consolidation.ts` fecha o gate humano da working copy:
  exatamente um Pilar, Suportes correspondentes, refs individuais de
  ArticleDNA, Brand correta, ArticleDNAs aprovados e conflitos/colisões
  resolvidos antes da formação.
- Diretrizes SERP são compactas e reaproveitam a `serpAssessmentRef` do
  ArticleDNA ou o assessment ativo existente. Esta etapa não cria consulta,
  snapshot ou movimento estrutural novo.
- `app/api/arquiteto/silo-review/route.ts` usa o DeepSeek canônico somente para
  produzir uma proposta por IDs. A proposta aceita juntar, dividir, mover,
  eliminar hipótese rasa, sugerir nome/slug, revisar Pilar/Suportes e avaliar
  verticalidade; não grava, não aprova e não repete o KeywordDNA inteiro.
- A UI mantém a proposta inteira pendente, permite rejeição parcial e aplica
  apenas à working copy. A última aplicação possui desfazer local; SiloDNA e
  SiloPage consolidados não são alterados pela IA.
- A confirmação humana gera sucessoras independentes: SiloDNA com status
  `approved` e SiloPage com status `proposed`. Publicados preservam
  `brandId`, URL, slug e canonical.
- A persistência usa o mecanismo canônico existente em sequência:
  SiloDNA → readback → SiloPage → readback. Uma falha da segunda gravação é
  reportada como par parcial; nenhuma atomicidade falsa foi criada.

### VALIDADO LOCALMENTE

- Teste focado do Lote 8: `7/7`.
- Boundary global relacionado + teste do Lote 8: `14/14`.
- `test:arquiteto`: `146/147` na execução final; a única falha é uma
  asserção estática legada fora do Lote 8 sobre a marcação antiga do Minerador.
  A cobertura própria do Arquiteto passa.
- `pnpm exec tsc --noEmit --pretty false` não executou: `tsc` não foi
  reconhecido neste checkout/ambiente. ESLint direcionado também permanece
  não verificável pelo mesmo motivo.
- `git diff --check` e testes sem provider real foram mantidos como próximos
  gates. Não houve chamada paga, escrita Supabase ou readback remoto nesta
  sessão.

### GAPS / GOVERNANÇA

- O readback remoto está implementado no fluxo da UI, mas não foi executado
  com sessão autenticada nem validado por reload Chrome nesta rodada.
- A persistência pareada ainda não é transacional; o mecanismo atual é
  `READBACK_GUARDED_SEQUENTIAL`. Uma transação compartilhada nova continua
  dependência do Planner Geral, mas não foi necessária para o código deste
  lote e nenhum pedido estrutural foi aberto.
- O grafo estrutural de links internos ainda não está disponível. Não foi
  implementado nem usado para bloquear a consolidação dos Silos.

### PRÓXIMO LOTE

- Parar antes do Lote 9 até que o InternalLinkGraph estrutural esteja
  disponível e autorizado pelo Planner Geral.

## Rodada de homologação dos Lotes 1–8 — 2026-08-25

### ESCOPO E LIMITES

- Rodada somente de validação, sem nova funcionalidade, provider real, chamada
  paga, escrita Supabase, migration, schema, RLS, RPC ou alteração em Radar.
- Código, testes automatizados, Chrome, provider, persistência remota,
  readback e handoff foram avaliados separadamente.
- O pedido estrutural do `InternalLinkGraph` continua proposto, não aprovado e
  não implementado. O Lote 9 não foi iniciado.

### RESULTADOS DOS GATES

- **H1 — parcial:** no Chrome real, 10 alternâncias individuais responderam
  imediatamente; Ctrl/Cmd, Shift, pintura por arraste e seleção oculta sob filtro
  foram preservados. A telemetria observada ficou entre `8,7 ms` e `66,1 ms`.
  Touchpad físico não foi comprovado pelo ambiente automatizado, portanto o gate
  não é PASS integral.
- **H2 — bloqueado por readback:** antes do F5 havia assessment SERP e refs
  visíveis; após o F5 permaneceram keywords, papéis, slugs e ArticleDNA v2
  human de `marketing online`, mas os assessments desapareceram e voltaram a
  `SERP não analisada`. Esperado: working copy integral após F5. Observado:
  hidratação parcial. Causa ainda não conclusiva; não houve erro de console.
  Módulo proprietário: Arquiteto.
- **H3 — não homologado:** o estado real não oferece sequência completa pronta
  para confirmação: três artigos estão `Em processo`/`SERP não analisada` e o
  quarto é `Importado no Radar`; não foi disparada IA nem confirmação humana
  nesta rodada. Não é evidência suficiente para declarar ArticleDNA novo
  consolidado.
- **H4 — parcial:** o Radar recebeu `marketing online` com ArticleDNA v2,
  principal e versão visíveis antes do reload, sem reconstrução observável.
  Após F5, o Radar retornou `Marca sem dados`; readback remoto/autenticado não
  ficou comprovado. Módulo proprietário do handoff: Arquiteto; consumidor:
  Radar.
- **H5 — bloqueado por pré-condição:** todos os quatro artigos permaneceram
  `Sem silo`; não havia SiloDNA/SiloPage real disponível para validar. `Revisar
  Silos com IA` e `Consolidar Silos` ficaram desabilitados. Nenhuma formação ou
  consolidação foi fabricada durante a homologação.

### TESTES E PENDÊNCIAS

- Suíte focada executada: `105/106` testes passaram. O único não executado foi
  `arquiteto-canonical-persistence.test.mts`, por limitação do runner Node em
  TypeScript strip-only (`parameter property` no fixture); isso não foi tratado
  como falha funcional nem corrigido nesta rodada.
- `git diff --check` executado; os avisos existentes são de LF/CRLF. Não foram
  executados providers reais.
- Não houve correção automática: os achados de F5 foram registrados como
  comportamento esperado versus observado, causa ainda não conclusiva e
  proprietário Arquiteto. Próxima ação é diagnosticar a hidratação/readback e
  repetir somente H2/H4 após correção autorizada.

### PRÓXIMO GATE

- Manter o Lote 9 parado até homologação estrutural do pedido do
  `InternalLinkGraph` pelo Planner Geral.

## Próxima fila — integridade de F5 e workspace único — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- O readback local do assessment SERP agora exige sessão `authenticated`,
  `actorUserId` e `brandId` canônico. O efeito não lê nem grava durante o
  estado intermediário da sessão e não usa mais a chave `anonymous`.
- O mesmo gate foi aplicado às recuperações locais de ArticleDNA, SiloDNA,
  revisão da working copy e à reconciliação do handoff usado pelo Radar.
- O bootstrap visual do Radar aguarda o snapshot enquanto a marca canônica
  está carregando; `Marca sem dados` só aparece quando o bootstrap termina sem
  snapshot e com erro. Não foi criado fallback por slug, owner ou marca
  anônima.
- O Arquiteto passou a expor uma única página operacional com o workbench
  contextual `Artigos`, `Silos` e `Links internos`. A seleção continua
  efêmera; IDs de SiloPage usam o namespace `silo-page:` separado dos artigos.
- Artigos mantêm a planilha existente e suas expansões de identidade,
  demanda, lógica, SERP, IA/humano e proveniência. Silos ganharam a mesma
  superfície contextual com expansão de SiloDNA, SiloPage, working copy e
  proteção de publicação. A busca global filtra os dois contextos.
- `Links internos` é somente uma superfície bloqueada, informando a ausência
  de fundação do `InternalLinkGraph`; nenhum grafo falso, React Flow ou contrato
  estrutural foi criado.
- Projeções visuais de volume/KGR preservam `null` como desconhecido e não
  materializam zero quando a métrica não existe.

### TESTADO / VISUAL / F5

- `tests/arquiteto-f5-integrity.test.mts` e
  `tests/radar-f5-brand-bootstrap.test.mts` usam os helpers de produção para
  cobrir identidade autenticada, ausência de fallback anônimo e espera do
  bootstrap.
- Suíte focada do bloco: `57/58`; a falha é o fixture legado de
  `tests/radar-hydration.test.mts`, que não preenche `score` e componentes
  exigidos por `fallbackHierarchyStrategy`. Os testes de Arquiteto e o teste
  de handoff que preserva ArticleDNA/brandId passaram.
- `test:visual-system`: `20/20` e `check:visual-system`: PASS.
- Chrome autenticado: após F5 do Arquiteto, os quatro artigos, versões, slugs
  e assessments `SERP com conflito` permaneceram visíveis; a tab Silos abriu
  sem inventar SiloDNA e a tab Links exibiu bloqueio explícito. Após F5 do
  Radar, `marketing online · v2` permaneceu visível e não apareceu `Marca sem
  dados`.
- TypeScript global continua bloqueado por erros prévios em
  `lib/minerador/keyword-qualification.ts` e três regex de fixtures
  (`TS1501`). Nenhum erro novo foi emitido para os arquivos adicionados pelo
  bloco. ESLint dos arquivos novos passou; o workspace legado ainda possui
  erros anteriores.
- Não houve provider real, chamada paga, escrita Supabase, migration, SQL,
  RLS, RPC ou readback remoto. O readback comprovado nesta fila é local e o
  Chrome é uma validação operacional autenticada, não prova de persistência
  remota.

### PENDÊNCIAS

- Corrigir o fixture/contrato do teste Radar sem ampliar o escopo do Arquiteto.
- Validar persistência remota e readback remoto em execução autorizada.
- Manter o Lote 9 parado até o Planner Geral homologar a fundação do
  `InternalLinkGraph`.

## Workbench de processos e tabs na GlobalTopbar — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- As áreas `Artigos`, `Silos` e `Links internos` agora são tabs registradas
  na `GlobalTopbar`; o workbench abaixo da barra ficou dedicado aos processos
  da área ativa.
- `Lógica`, `SERP`, `IA` e `Revisão` são controles acionáveis que reutilizam os
  handlers existentes do Arquiteto. Não foram criados providers, endpoints,
  filas, jobs ou regras editoriais novas.
- Estados visuais distinguem disponível (neutro), processando (accent com
  progresso), concluído (sucesso), aguardando humano, parcial/conflito, erro e
  bloqueado. A IA continua sendo proposta e a confirmação continua humana.
- A área contextual atual ficou recolhível, com resumo do processo ativo e
  limite visual de aproximadamente um terço da altura útil. A planilha,
  seleção, busca, filtros, expansão, histórico e working copy não foram
  reconstruídos.
- As ações de processo foram retiradas do rodapé para evitar duplicação. O
  rodapé mantém apenas ferramentas de seleção e o handoff final para o Radar,
  quando há artigos selecionados.

### TESTADO / LIMITAÇÕES

- `tests/arquiteto-workbench.test.mts`: `3/3` testes focados passaram,
  cobrindo tabs na GlobalTopbar, os quatro controles, estados semânticos,
  área contextual e ausência de duplicação no rodapé.
- `test:arquiteto`: `147/148` passaram nesta execução. Permanece uma falha
  legada fora do escopo: uma asserção do Minerador sobre o rótulo antigo de
  `Processar lógica`; nenhuma falha envolve provider, persistência ou contrato
  estrutural do novo workbench.
- TypeScript continua com os mesmos quatro erros prévios em
  `lib/minerador/keyword-qualification.ts` e regex de fixtures `TS1501`;
  nenhum erro novo foi emitido para o workbench.
- Lint direcionado do workspace continua contaminado por erros legados do
  arquivo monolítico; o componente novo não introduz alteração estrutural.
- Não foi executado Chrome nesta implementação, nem provider real, escrita
  Supabase, migration, SQL, RLS, RPC ou readback remoto.

### PRÓXIMA FILA

- Fazer validação manual no Chrome da troca de tabs, abertura/fechamento do
  contexto e acionamento dos quatro processos, preservando a visibilidade da
  planilha.
- Se necessário, planejar posteriormente fila/job/worker para progresso
  persistente; isso é dependência estrutural e não foi implementado neste
  lote.
- Manter o Lote 9 bloqueado até homologação estrutural do `InternalLinkGraph`.

## Mapa comparativo de arquitetura — 2026-08-26

### IMPLEMENTADO NO CÓDIGO

- O Workbench expandido agora separa processo, progresso, diagnóstico,
  comparativo e ações humanas à esquerda de uma única projeção visual limpa à
  direita, mantendo a planilha visível e a área contextual limitada a
  aproximadamente `33vh`.
- O mapa alterna os cenários `Atual`, `Lógica`, `SERP` e `IA`. A troca é
  efêmera e não chama persistência, provider, SERP, IA ou reconstrução de
  DNA.
- A projeção de Artigos mostra grupos, keywords, principal destacada e lista
  simples de secundárias, com apenas indicadores mínimos de candidata,
  conflito e publicado. Não exibe métricas, hashes, versões ou proveniência
  extensa.
- A projeção de Silos mostra SiloPage → Pilar → Suportes; cada ArticleDNA usa
  principal e secundárias resumidas, e as edges representam apenas
  hierarquia/membership, nunca o `InternalLinkGraph`.
- A comparação explicita ganhos, perdas e movimentos na coluna esquerda. Não
  foi criado score SEO global nem regra editorial nova.
- O detalhe e as ações humanas ficam na coluna esquerda. Os selects de keyword
  → grupo e ArticleDNA → Silo são limitados à working copy e delegam aos
  handlers canônicos, mantendo proteção de publicados e readback existente.
- Alterações manuais refletem a working copy e suas projeções; fotografias de
  Lógica, SERP e IA são capturadas em memória quando produzidas e não são
  recalculadas depois da edição humana.
- No modo Silos, a movimentação pelo mapa sincroniza o `SiloWorkingCopy` local;
  quando o destino ainda é provisório, permanece uma alteração reversível sem
  fingir consolidação remota.
- A tab Links internos continua apenas como bloqueio visual. Nenhum
  InternalLinkGraph, nó persistido, edge ou anchor foi criado.

### TESTADO / LIMITAÇÕES

- `tests/arquiteto-workbench.test.mts`: `7/7` testes passaram, incluindo
  React Flow derivado dos snapshots, cenários controlados, comparação à
  esquerda, bloqueio de grafo em Links internos, instância única e vínculo ao
  handler canônico de seleção/movimentação.
- Os testes focados de formação/consolidação de Silos executados junto ao
  workbench passaram: `17/17`.
- TypeScript continua bloqueado pelos quatro erros prévios: um em
  `lib/minerador/keyword-qualification.ts` e três `TS1501` em fixture de
  agência. Nenhum erro novo foi emitido nos arquivos do mapa.
- O lint isolado de `modules/arquiteto/arquiteto-workbench.tsx` e do teste
  focado passou. O lint do workspace monolítico continua com falhas legadas
  fora do trecho alterado.
- O mapa usa `@xyflow/react` `12.11.5`, já presente no contrato de dependências.
  Nodes/edges são projeções derivadas dos snapshots; nodes não são arrastáveis
  nem conectáveis, e não há `onConnect`, `onNodesChange` ou persistência local
  do canvas.
- A antiga descrição de SVG deste bloco foi superada por esta implementação:
  a fotografia de Artigos usa grupos compactos com principal e keywords
  relacionadas; Silos usam SiloPage → Pilar → Suportes; Links internos não
  renderiza React Flow.
- O Chrome conectado pelo agente confirmou mapa normal/expandido, divisão
  desktop em duas colunas de aproximadamente 50%, quatro cenários, comparação
  à esquerda, uma tabela e estado vazio de Silos sem inventar dados. Isso é
  validação local do agente, não homologação manual do usuário.
- Provider real, escrita Supabase e readback remoto não fazem parte desta
  implementação e permanecem não verificados.

### PRÓXIMA FILA

- Validar no Chrome a troca dos quatro cenários, comparação, foco de nós,
  movimentação manual, proteção de publicados e responsividade.
- Manter o Lote 9 bloqueado até a fundação estrutural do `InternalLinkGraph`
  ser homologada pelo Planner Geral.

## Planilha única nos três modos — 2026-08-26

### VERIFICADO NO CÓDIGO

- A página do Arquiteto mantém uma única composição da planilha principal de
  artigos. O mesmo conjunto `filteredArticles`/`groupedArticles` continua
  montado em `Artigos`, `Silos` e `Links internos`.
- A troca de modo altera o Workbench e o contexto operacional, mas não troca a
  entidade central, não monta uma segunda tabela e não desmonta a planilha por
  ausência de `SiloDNA` ou pela fundação pendente do `InternalLinkGraph`.
- Artigos sem Silo permanecem visíveis como `ARTIGOS SEM SILO`; controles de
  Silo e Página do Silo continuam na mesma planilha quando aplicáveis.
- A seleção de artigos, a seleção explícita de Página do Silo e a expansão
  usam o estado do workspace e não um estado criado por tab. `selectedCount`
  agrega os itens selecionados na mesma superfície.
- O bloqueio de `Links internos` continua somente no Workbench. Nenhum
  `InternalLinkGraph`, link local substituto ou contrato estrutural foi criado.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: composição única da planilha, ausência
  de substituição por `Silos`/`Links internos`, dataset compartilhado e estados
  de seleção/expansão cobertos; `7/7` testes focados passaram.
- A arquitetura de renderização da planilha não foi alterada neste refinamento;
  React Flow foi ajustado somente como projeção acima dela.

### OBSERVADO NO CHROME, SEM HOMOLOGAÇÃO FINAL

- Em execução local autenticada, a troca `Artigos → Silos → Links internos →
  Artigos` manteve `1` tabela, os quatro artigos, a seleção de `marketing
  online` e o DNA expandido. O Workbench mostrou o bloqueio do
  `InternalLinkGraph` em Links internos sem substituir a planilha.
- Essa observação foi feita pelo agente no Chrome e não substitui a conferência
  manual do usuário nem comprova persistência remota.

### PENDENTE DE VALIDAÇÃO MANUAL NO CHROME

- Usuário deve abrir `Artigos`, selecionar e expandir uma linha, alternar para
  `Silos`, depois `Links internos` e retornar a `Artigos`, confirmando os mesmos
  artigos, seleção, expansão e working copy.
- Persistência remota/readback remoto e provider real não fazem parte desta
  implementação e permanecem não verificados.

## Refinamento visual do Workbench e React Flow — 2026-08-26

### VERIFICADO NO CÓDIGO

- A área contextual normal mantém o mapa visível; ao expandir, continua
  limitada a `max-h-[33vh]`. A grade desktop começa no topo do Workbench e
  divide o espaço em duas colunas equivalentes: processo/decisão à esquerda e
  mapa à direita.
- `Atual`, `Lógica`, `SERP` e `IA` são um seletor vertical no canto superior
  direito do canvas. O botão `Comparar com Atual` vive no painel esquerdo e não
  disputa espaço com os cenários.
- `Mostrar/Ocultar contexto` foi removido. O contexto e as decisões ficam
  permanentemente na coluna esquerda; não há estado de contexto concorrente.
- `buildArchitectFlowProjection` deriva a projeção exclusivamente do snapshot
  do cenário. A edição visual do canvas não altera working copy, ArticleDNA,
  SiloDNA, persistência ou contratos.
- No mapa de Artigos, cada grupo é somente um frame visual e cada KeywordDNA é
  um node próprio: há exatamente uma Principal visível e keywords relacionadas
  conectadas apenas à Principal. Não existe node de ArticleDNA, placeholder ou
  edge entre grupos; grupo com uma keyword não recebe edge artificial. Métricas,
  hashes, versões e proveniência extensa continuam fora do mapa.
- A projeção de Artigos segue a visibilidade e a seleção da planilha: sem
  seleção mostra todos os grupos visíveis; com uma ou várias linhas mantém
  todos os grupos visíveis, destacando os selecionados e deixando os demais
  como fantasmas, sempre separados. Silos usam builder distinto, com
  ArticleDNA como nodes e hierarquia SiloPage → Pilar → Suportes.
- `Links internos` permanece bloqueado e retorna projeção vazia; não há edges,
  anchors, estado substituto ou persistência fake.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` testes focados passaram,
  cobrindo derivação por snapshot, seletor controlado, preservação histórica,
  bloqueio de mutação via React Flow, planilha única, layout normal/expandido
  e ausência de grafo em Links internos.
- `pnpm check:visual-system`: passou (`VISUAL_SYSTEM_GUARD = PASS`).
- Lint isolado do componente do Workbench e do teste focado passou.
- `git diff --check` passou nos arquivos alterados deste lote.

### VALIDADO LOCALMENTE PELO CODEX NO CHROME

- A página local autenticada exibiu `1` `.react-flow` e `1` tabela em Artigos;
  o mapa permaneceu visível no estado normal e exibiu `Controls`/`MiniMap` no
  estado expandido.
- A grade desktop medida no viewport `1920×953` apresentou `906px` para cada
  coluna. A alternância `Atual → Lógica → SERP → IA` manteve um React Flow e
  uma tabela, e o comparativo apareceu na coluna esquerda.
- Silos sem dados exibiu vazio somente no canvas, sem criar Silo; Links internos
  exibiu bloqueio sem montar `.react-flow`.

### PENDENTE DE HOMOLOGAÇÃO MANUAL

- O usuário ainda deve conferir no Chrome mouse/touchpad, pan, zoom, foco,
  contraste em tema claro/escuro e larguras `360/768/1024/1440px`.
- A validação local não comprova provider real, escrita Supabase, readback
  remoto nem consolidação editorial. O Lote 9 continua bloqueado.

## Correção semântica do mapa de Artigos — 2026-08-26

### VERIFICADO NO CÓDIGO

- `buildArchitectFlowProjection` não cria mais um node de ArticleDNA no modo
  `Artigos`. Ele cria um frame visual por grupo e nodes de KeywordDNA com
  `Keyword principal`, `Keyword secundária N` ou `Keyword reforço N`.
- A Principal é escolhida de forma determinística; cada keyword relacionada
  recebe uma edge visual da Principal para si. Não há edge entre grupos, cadeia
  por numeração ou construção de InternalLinkGraph.
- `visibleArticleIds` define o conjunto que aparece no mapa na mesma ordem da
  planilha filtrada. `selectedArticleIds` apenas dá destaque: sem seleção todos
  os grupos ficam normais; com seleção, artigos não selecionados continuam
  visíveis como fantasmas, sem filtrar a working copy.
- Keywords e nomes de grupos usam quebra de linha integral; não há `truncate`
  nem `line-clamp`, nem métricas, hashes, versões ou proveniência extensa no
  mapa.
- Os grupos de Artigos são empilhados verticalmente com posições determinísticas
  e espaçamento independente. O React Flow não cria conexões manuais, não move
  nodes e não conecta grupos. A moldura compacta mantém uma área interna
  navegável. Em Artigos o `fitView` automático fica desativado para preservar
  escala natural e topo da lista; o controle de fit continua disponível no
  estado expandido.
- Clique em node do mapa apenas seleciona/foca o artigo. A expansão do DNA
  continua exclusiva da planilha e requer o controle explícito de chevron do
  mapa; expandir aumenta o canvas e libera `Controls`/`MiniMap` sem alterar
  cenário, seleção ou arquitetura.
- A grade `lg:grid-cols-2` envolve o Workbench desde o topo: processos,
  contexto, comparativo e ações humanas ficam à esquerda; canvas, cenários e
  exploração mínima ficam à direita. A planilha canônica continua única e
  abaixo da composição.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` testes focados passaram,
  incluindo keyword completa sem truncamento, ordem vertical, ghosting,
  seleção sem expansão, chevron explícito, área interna navegável e Controls
  restritos à expansão, ausência de mutação por React Flow, snapshots
  históricos, builder distinto de Silos, planilha única e bloqueio de Links
  internos.
- `pnpm test:visual-system`: `20/20` passou após alinhar o contrato visual à
  remoção definitiva de `contextExpanded`. `pnpm test:arquiteto` terminou com
  `155/156`: a única falha é a asserção legada do Minerador em
  `tests/arquiteto-domain.test.mts:307`; nenhum teste do Arquiteto falhou.
- ESLint isolado do Workbench e do teste focado passou; o guard do sistema
  visual passou para o novo componente.

### VALIDADO LOCALMENTE PELO CODEX NO CHROME

- A fixture local autenticada exibiu uma planilha e um React Flow com quatro
  grupos, doze nodes e edges apenas dentro do respectivo grupo. A ordem do DOM
  foi `unhas de gel decoradas` → `alongamento de unhas` → `manicure perto de
  mim a domicílio` → `marketing online`; a Principal foi a origem das edges.
- O canvas normal mediu `176px`, com área interna navegável de `1020px` e
  escala inicial `1`; Controls/MiniMap ficaram ausentes. Após selecionar um ou
  dois artigos, todos os grupos continuaram presentes, os selecionados ficaram
  sólidos e os demais receberam ghosting; o clique em keyword manteve as cinco
  linhas da tabela sem abrir DNA.
- O filtro `Pilar` reduziu a projeção ao único grupo visível correspondente. A
  troca para `IA` manteve a ordem e a seleção. O chevron alternou `176px` ↔
  `240px`, preservou a seleção e mostrou Controls/MiniMap somente expandido.
- Silos manteve uma única planilha e projeção separada; Links internos manteve
  a planilha, sem React Flow, com o bloqueio estrutural visível.

### LIMITES

- A implementação removeu a expansão acionada pelo clique do mapa e a seleção
  filtrada do canvas. A homologação física do usuário (mouse, touchpad, drag,
  pan/zoom, responsividade e temas) e F5/readback remoto continuam pendentes.
- O TypeScript continua com quatro erros fora do Arquiteto (`keyword-qualification`
  e três fixtures de agência); o lint do workspace monolítico continua com
  débitos legados fora deste refinamento.
- Não houve provider real, escrita Supabase, migration, alteração de schema,
  RLS, RPC ou mudança em Radar. InternalLinkGraph permanece bloqueado pelo
  gate estrutural do Planner Geral.

## Ajuste horizontal do mapa do Arquiteto — 2026-08-26

### VERIFICADO NO CÓDIGO

- O mapa de Artigos usa a largura para expressar a relação editorial:
  Principal à esquerda e cada Secundária/Reforço diretamente à direita. Não há
  cadeia entre keywords relacionadas nem elementos artificiais para grupos de
  uma única keyword.
- Cada grupo de Artigos permanece uma faixa horizontal independente; as faixas
  seguem a ordem recebida da planilha e são empilhadas verticalmente com altura
  calculada pelo número de keywords. A Principal fica centralizada em relação
  às relacionadas, sem reduzir ou ocultar o texto.
- Grupos com uma única keyword usam moldura e largura compactas; grupos com até
  seis keywords têm cinco posições relacionadas distribuídas sem sobreposição.
- O mapa de Silos agora usa colunas fixas `SiloPage → Pilar → Suportes`. Os
  Suportes são distribuídos verticalmente somente dentro do mesmo Silo; cada
  novo Silo começa após a altura real do conjunto anterior. As edges continuam
  sendo projeções de hierarquia/membership, não `InternalLinkGraph`.
- Nodes continuam não arrastáveis/não conectáveis, e nenhuma alteração foi feita
  na planilha única, na working copy, nos handlers canônicos, na persistência,
  nos contratos ou no domínio editorial.

### CONFIRMADO POR TESTE

- `tests/arquiteto-workbench.test.mts`: `9/9` passou, cobrindo colunas
  Principal/relacionadas, edges diretas, ausência de cadeia secundária,
  empilhamento determinístico, grupo unitário compacto, limite de seis
  keywords, ordem da planilha, ghosting, expansão e orientação horizontal dos
  Silos.
- ESLint direcionado de `arquiteto-workbench.tsx` e do teste focado passou.
- Não houve mudança em schema, migration, RLS, RPC, provider ou Radar.

### PENDÊNCIAS DE VALIDAÇÃO

- O Chrome, a conferência manual de mouse/touchpad, pan/zoom, responsividade,
  temas e F5/readback remoto devem ser repetidos pelo gate correspondente após
  esta alteração. Nenhuma execução de provider real ou escrita remota foi
  realizada.
- O Lote 9 continua bloqueado até a fundação estrutural do `InternalLinkGraph`
  ser homologada pelo Planner Geral.

## Links Internos funcional / working copy real — 2026-08-27

### VERIFICADO NO CÓDIGO


## Passos 2 e 3 — Silos, identidade de URL e Links Internos — 2026-08-27

Módulo proprietário: Arquiteto. A implementação reutiliza SiloDNA, SiloPage,
InternalLinkGraph e seus writers canônicos existentes. Não houve migration,
schema, RLS, provider, API global ou escrita remota nesta rodada.

### IMPLEMENTADO

- A aba Silos mantém os três caminhos explícitos: criação manual via `+ Silo`,
  formação a partir de candidatas reservadas na working copy e fortalecimento
  de Silo existente somente quando ArticleDNA/SiloDNA/SiloPage reais o sustentam.
  Nenhum desses caminhos é acionado pela aba Artigos.
- SiloPage continua entidade de página distinta de SiloDNA e do Pilar; seu
  DNA preserva slug/canonical, publicação, versão e identidade sem transformá-la
  em ArticleDNA.
- Links mantém somente IA e Revisão como processos; não cria Lógica/SERP. Seus
  nodes têm exclusivamente refs `SILO_PAGE` ou `ARTICLE_DNA`.
- O mapa de Links agora resolve slug e canonical a partir das versões
  referenciadas, apenas como identificação visual. Nenhum valor é inferido
  quando o canonical não foi recebido.
- Ao criar uma edge humana, `anchorConcepts` recebe sugestões editáveis do
  contexto do destino: intenção, entidade, secundárias/reforços, SiloPage e
  seções. A principal não é copiada como âncora final.

### TESTED

- Testes locais focados: 29/29, incluindo formação de Silos, contrato do
  grafo, projeção do Workbench e sugestões de âncora.
- TypeScript: não houve erro novo do lote; permanecem quatro erros externos
  conhecidos em Minerador e fixture de Agência.

### PENDENTE

- Chrome autenticado, F5/readback remoto, criação/aprovação real do par
  SiloDNA/SiloPage e do Graph permanecem pendentes. Não foram chamados SERP,
  IA ou providers pagos.

```text
SILO_SLUG_SOURCE = SiloPage canônica ou rascunho manual validado
ARTICLE_SLUG_SOURCE = ArticleDNA suggestedSlug ou identidade publicada protegida
INTERNAL_LINK_CANONICAL_RESOLUTION = somente referência recebida; nunca inventada
ANCHOR_CONCEPTS_FROM_KEYWORD_CONTEXT = SIM; editável; não é âncora final
REMOTE_SCHEMA_CHANGES = 0
NEW_MIGRATIONS = 0
MANUAL_UI_VALIDATION = PENDING
REMOTE_FLOW_VALIDATION = PENDING
- O gate recebido para este lote é `INTERNAL_LINK_GRAPH_REMOTE_FOUNDATION =
  READY`, com isolamento por Brand e suporte a working copy, `lock_version`,
  aprovação append-only e referência downstream. Nenhuma migration, schema,
  RLS, grant ou provider foi alterado neste lote.
- A aba `Links internos` deixou de exibir o bloqueio antigo e usa somente os
  processos canônicos `IA` e `Revisão`; a IA permanece explicitamente
  desabilitada e não há chamada DeepSeek, SERP ou provider.
- A planilha de Artigos continua única nos três modos. Links trabalha com o
  contexto de `SiloDNA + SiloPage + ArticleDNA` já aprovado e não cria tabela,
  dataset ou grafo paralelo.
- A entrada da aba lê a Brand ativa, lista os Graphs aprovados e carrega a
  working copy persistente por `graphId`. Sem working copy, a UI abre uma base
  nova a partir das referências canônicas; com Graph aprovado, cria sucessora
  sem editar a versão anterior.
- `InternalLinkGraph` é projetado no React Flow com apenas nodes `SILO_PAGE` e
  `ARTICLE_DNA`, edges dirigidas com seta, distinção visual de SiloPage/Pilar/
  Suporte e layout horizontal. A versão aprovada é somente leitura; arraste e
  conexão ficam disponíveis apenas na working copy. Posição, zoom, viewport e
  seleção ficam somente na camada visual e não participam do hash ou da versão.
- Criação, edição e remoção de edge passam pelo domínio e pela working copy.
  Self-link e duplicata dirigida são rejeitados; `reason`, `priority` e
  `anchorConcepts` são editáveis na coluna esquerda. Âncoras são conceitos
  semânticos, não frases HTML nem split mecânico.
- O salvamento usa `PATCH` com o `lock_version` confirmado. A rota/repository
  existentes fazem readback canônico antes de a UI mostrar `Salvo`; stale
  permanece como conflito e oferece recarregar, sem merge automático. A
  aprovação cria nova versão imutável e a edição futura parte de uma sucessora.
- O retorno de persistência preserva o `InternalLinkGraphRef` opcional para
  consumidores downstream. O Radar não foi alterado nem recebeu bypass; a
  integração existente continua disponível pela rota canônica de referência.

### CONFIRMADO POR TESTE LOCAL

- Testes focados do grafo, Workbench e guard de provider passaram: `28/28` no
  conjunto executado nesta rodada.
- `test:visual-system`: `20/20`; `check:visual-system`:
  `VISUAL_SYSTEM_GUARD = PASS`.
- O TypeScript não introduziu erro nos arquivos do lote. A execução global
  ainda acusa quatro erros preexistentes fora deste escopo:
  `lib/minerador/keyword-qualification.ts:157` e três regexes `TS1501` em
  `tests/agency-adalba-platform-internal.test.mts`.
- `test:arquiteto` ainda possui a falha preexistente do Minerador na asserção
  de `Processar lógica`; os testes do Arquiteto e do InternalLinkGraph
  passaram. A expectativa antiga do teste de providers foi ajustada para
  escopar a independência do fluxo de ArticleDNA, sem rejeitar a nova aba de
  Links.

### AINDA NÃO VERIFICADO

- Chrome/manual: criação de working copy, conexão A→B/B→A, edição dos campos,
  stale, F5, aprovação, sucessora, dark mode e expansão ainda aguardam
  execução manual autenticada. A expansão foi ajustada para aproximadamente
  `48vh` no desktop.
- Persistência remota real/readback autenticado do Graph e conferência do
  `InternalLinkGraphRef` no handoff do Radar não foram executados nesta rodada.
  O código está conectado às rotas canônicas, mas isso não é prova remota.
- Não houve chamada real de DataForSEO, DeepSeek ou qualquer provider pago.
- A IA de Links Internos permanece para o próximo lote; nenhuma Proposal foi
  criada ou aplicada.

## Correção de integridade da fase Artigos — 2026-08-27

Módulo proprietário: Arquiteto. Esta rodada corrigiu a fronteira entre a
formação de artigos e a formação posterior de Silos, sem iniciar um novo lote
editorial nem alterar Radar, Links Internos, providers ou a infraestrutura
remota.

```text
ARTICLES_BOUNDARY_FIXED = SIM (código local)
PROCESS_STATUS_SEMANTICS_FIXED = SIM (código/helper local)
SERP_PRESENTATION_FIXED = SIM (execução separada de diagnóstico)
ARTICLE_DNA_GATE_FIXED = SIM (gate local + readback no fluxo existente)
SILO_PREMATURE_CREATION_FIXED = SIM (criação explícita somente em Silos)
```

### AUDITORIA DOS RÓTULOS E CONTROLES

- `Silo sem nome`: fallback do read model de `groupedArticles` e do handler de
  exclusão de grupo, restrito ao modo Silos. Classificação:
  `READ_MODEL_DERIVED` / `LEGACY_UI`; não há literal persistido identificado.
- `/silo-sem-nome`: não existe como literal no código; seria derivado por
  `toSlug` a partir do fallback anterior. Classificação:
  `READ_MODEL_DERIVED` / `LEGACY_UI`.
- `PILAR` e `SUPORTE 1`: projeções de hierarquia da tabela de Silos. Não são
  decisões operacionais da tabela de Artigos; o contrato do grafo de Links
  Internos permanece separado e congelado.
- `ARTIGOS SEM SILO`: rótulo derivado da projeção do modo Silos, não exibido na
  formação plana de Artigos.
- `+ Silo`: controle React que abre a criação manual e só é renderizado no modo
  Silos. O submit continua protegido pela rota canônica existente; nenhum
  submit remoto foi executado nesta rodada.
- `SILO_SEM_NOME_SOURCE = fallback de read model em groupedArticles/handler de exclusão`.
- `SILO_SEM_NOME_PERSISTED = NÃO VERIFICADO (remote read não executado)`.
- `SILO_SEM_NOME_CREATED_BY = não comprovado; nenhum criador persistente foi identificado no código auditado`.
- `SILO_SEM_NOME_SAFE_REMEDIATION = manter dados intactos, remover apenas a projeção operacional na fase Artigos e tratar eventual ocorrência remota em auditoria/readback autorizado; nenhuma limpeza foi executada`.

### FRONTEIRA IMPLEMENTADA

- A fase Artigos trabalha com grupos planos de ArticleDNA em formação, roles,
  lógica, evidência SERP, proposta de IA, revisão humana e consolidação.
- Novas keywords não recebem `siloId`, `silo_id` ou `siloName` na working copy
  dessa fase; proteção de Silo já existente em conteúdo publicado é mantida.
- O bootstrap do handoff canônico não converte mais `lista_id` do Minerador em
  atribuição de Silo para keyword nova; `lista_id` continua disponível como
  proveniência. O vínculo legado só é recuperado para identidade publicada ou
  por assignment explícito da working copy.
- A lógica aguarda a confirmação do writer canônico da working copy antes de
  expor o resultado. A proposta de IA de “criar artigo” não materializa
  `tmp-ai-silo-*`; fica registrada como proposta/proveniência reversível.
- Não há criação de SiloDNA, SiloPage, slug, Pilar ou Suporte na fase Artigos.
  A criação explícita de Silo e a formação de SiloPage continuam exclusivas do
  modo Silos.
- A planilha permanece única e compartilhada pelos três modos. Artigos usa a
  projeção plana em ordem canônica; Silos usa a projeção agrupada. A troca de
  modo não cria Silo automaticamente.
- Em Artigos, a coluna de hierarquia é neutra (`Pendente para Silos`) e o
  controle de criação de Silo não é operacional. O painel legado foi ocultado
  dessa experiência e permanece disponível como `Briefing legado` no modo
  Silos, com seus consumidores e dados preservados.

### ESTADOS E GATES

- Lógica concluída significa execução e resultado da hipótese determinística;
  não significa ArticleDNA aprovado, revisão terminada, Silo criado ou Radar
  liberado.
- SERP separa execução de diagnóstico: 3/3 consultas com conflito continuam
  execução completa e exibem conflito; parcial significa consulta, snapshot ou
  recomendação obrigatória ausente/falha. SERP não movimenta a working copy.
- IA concluída significa proposta gerada; a revisão humana permanece pendente.
  IA não aprova.
- ArticleDNA é “ainda não consolidado” antes da confirmação e o gate do Radar
  exige ArticleDNA aprovado, sem pendências/conflitos, refs preservadas e
  readback do contrato aplicável.
- ArticleDNA aprovado deixa a área pronta para a etapa Silos, mas não cria um
  Silo. A regra de exatamente um Pilar por Silo continua pertencendo ao modo
  Silos.

### MATRIZ DE EXECUÇÃO

| Gate | Resultado | Evidência | Problema encontrado | Próxima ação |
| --- | --- | --- | --- | --- |
| Artigos → ArticleDNA | Corrigido localmente | Código e testes focados | Antes, projeções de Silo contaminavam a leitura da fase | Homologar fluxo H3 no Chrome |
| Artigos → Silos | Separação aplicada | Modo, guards e projeções derivados | Readback remoto de eventual legado não executado | Auditar remoto somente com autorização |
| SERP | Preservada como evidência | Handler não altera working copy | Provider real não chamado | Validar manualmente com fixture/conta autorizada |
| IA | Proposta reversível | IDs/anotações, sem aprovação | Provider real não chamado | Revisão humana manual |
| Radar | Gate mais estrito | `articleRadarGateIssues` | Handoff remoto não comprovado | Executar H4 após ArticleDNA real |
| Links Internos | Não iniciado nesta rodada | Código não alterado | Gate estrutural/escopo fora do lote | Permanecer congelado |

### VALIDAÇÃO E LIMITES

- `tests/arquiteto-article-phase.test.mts` e `tests/arquiteto-article-logic.test.mts`:
  17/17 testes focados passaram; com `tests/arquiteto-canonical-workspace.test.mts`,
  a verificação focada da fronteira/bootstrapping ficou em 24/24. Incluindo as
  regressões relacionadas de seleção e Silo, o conjunto final executado ficou
  em 39/39.
- Testes visuais anteriores do sistema: 20/20; testes focados anteriores do
  Arquiteto/Graph: 28/28. A suíte `test:arquiteto` ainda conserva uma falha
  preexistente do teste do Minerador que espera o texto antigo de `Processar
  lógica`; ela não foi alterada nesta correção.
- Lint direcionado dos helpers, bootstrap/projeções e regressões passou pelo
  binário local do ESLint.
  O lint do workspace/componente continua com falhas preexistentes e não foi
  tratado como bloqueio desta correção localizada.
- TypeScript global foi executado pelo binário local e manteve somente quatro
  erros preexistentes: `lib/minerador/keyword-qualification.ts:157` e três
  expressões regulares em `tests/agency-adalba-platform-internal.test.mts`.
  Não restou erro novo nos arquivos desta correção.
- `git diff --check` passou (somente avisos de conversão LF/CRLF do checkout).
  Chrome, provider real, `REMOTE_WRITE` e `REMOTE_READ` não foram executados/
  realizados. Não houve migration, mudança de schema/RLS/RPC, limpeza de dados
  ou chamada paga.

### CAMPOS DE RELATÓRIO

```text
ARTICLES_CREATED_SILO_BEFORE = não há evidência de criação persistente; havia projeções derivadas/legadas
ARTICLES_CREATED_SILO_AFTER = 0 no fluxo de Artigos
ARTICLES_TABLE_PROJECTION = grupos planos de Artigos em formação / ArticleDNAs
SILOS_TABLE_PROJECTION = grupos de Silos, SiloPage, Pilar e Suportes somente no modo Silos
SAME_GRID_PRESERVED = SIM
LOGIC_EXECUTION_STATUS = execução concluída somente após confirmação do writer da working copy
LOGIC_OUTPUT = grupos provisórios, roles e candidatas a Silo reservadas; sem criação de Silo
SERP_EXECUTION_STATUS = helper separa completo de parcial por cobertura obrigatória
SERP_DIAGNOSTIC_STATUS = avaliação/evidência com conflito explícito quando aplicável
SERP_ASSESSMENT_SOURCE = artefato local da operação/assessment existente
SERP_SNAPSHOT_SOURCE = snapshot existente ou fixture/local fallback; origem remota não comprovada
SERP_REMOTE_PERSISTENCE_PROVEN = NÃO
AI_EXECUTION_STATUS = proposta gerada não equivale a aprovação
HUMAN_REVIEW_STATUS = pendente até confirmação humana real
ARTICLE_DNA_LEGACY_PANEL = briefing legado de briefings_artigos; oculto em Artigos, preservado em Silos
FIELDS_CANONICAL_TO_ARCHITECT = principal, secundárias, reforços, intenção, refs KeywordDNA, ArticleDNA, decisões e proveniência
FIELDS_BELONG_TO_PLANNER = briefing/plano editorial derivado após o handoff, conforme contrato do módulo
FIELDS_BELONG_TO_WRITER = execução textual, ângulo/CTA final e conteúdo de publicação, conforme contrato do módulo
FIELDS_WITHOUT_ACTIVE_OWNER = não identificado nesta auditoria; campos legados permanecem preservados até confirmação do consumidor
ARTICLE_DNA_CONSOLIDATION_GATE = principal, até 6 keywords, papéis/conflitos resolvidos, decisão humana, persistência/readback
READY_FOR_SILOS_GATE = ArticleDNA consolidado sem pendências; pronto para propor, não para criar automaticamente
RADAR_HANDOFF_GATE = bloqueado enquanto ArticleDNA não estiver consolidado/aprovado
TESTS = focados 24/24 (article-phase/logic: 17/17), 39/39 com seleção relacionada; test:arquiteto 181/182 com 1 falha preexistente do Minerador
VISUAL_TESTS = test:visual-system 20/20 e guard visual PASS; Chrome desta correção pendente
LINT = helper e regressão direcionados PASS; workspace/componente possui falhas preexistentes
TYPESCRIPT = executado; quatro erros preexistentes fora da correção
NEW_TYPESCRIPT_ERRORS = 0
PREEXISTING_TYPESCRIPT_ERRORS = quatro erros já conhecidos em Minerador/fixture de agência
GIT_DIFF_CHECK = PASS (avisos LF/CRLF somente)
REMOTE_SCHEMA_CHANGES = 0
NEW_MIGRATIONS = 0
PAID_PROVIDER_CALLS = 0
MANUAL_UI_VALIDATION = PENDING
```

## Painel expandido da linha do artigo — 2026-08-27

Módulo proprietário: Arquiteto. Esta alteração reorganiza exclusivamente o
painel aberto pelo chevron de uma linha de artigo; a planilha principal, a
working copy, persistência, contratos, Radar e a formação de Silos não foram
alterados.

### VERIFICADO NO CÓDIGO

- O painel exibe um resumo superior próprio com Volume, Resultados, Intenção,
  Funil, KGR, proteção e contexto de Silo. Soma e média são explicitamente
  derivadas para comparação arquitetural; `null` continua exibido como dado
  ausente e zero real é preservado.
- A composição responsiva divide o detalhe em duas metades: à esquerda,
  definição/fatos acumulados e perfis completos das keywords em accordions; à
  direita, uma única etapa selecionada entre Lógica, SERP, IA e Revisão.
- SERP permanece observacional; IA permanece proposta reversível; revisão
  humana não é inferida como aprovação. A mudança de papel usa o handler
  canônico da working copy e respeita publicação protegida.
- O contexto de Silo e de Links Internos só aparece quando já há referências
  reais. O painel não cria Silo, SiloPage ou grafo.
- Campos legados de briefing deixaram de integrar o detalhe de Artigos. Não
  foram apagados nem promovidos a definição canônica do artigo; ownership
  definitivo continua pendente de confirmação com Planejador/Redator.

### CONFIRMADO POR TESTE LOCAL

- `tests/arquiteto-article-expanded-panel.test.mts` e
  `tests/arquiteto-article-phase.test.mts`: 10/10, cobrindo métricas derivadas,
  `null`, zero real, conflitos de intenção, funil, KGR individual, duas
  metades, accordions e os quatro processos.
- Lint direcionado do helper e da regressão nova passou.
- TypeScript global manteve apenas os quatro erros preexistentes de Minerador e
  fixtures de Agência; não restou erro novo do painel.

### LIMITES

- O lint de `arquiteto-workspace.tsx` continua com dívida preexistente de um
  componente grande e não foi corrigido neste lote visual.
- Validação manual em Chrome, temas e larguras 360/768/1024/1440 permanece
  pendente. Não houve provider real, escrita remota ou readback remoto.

```text
ARTICLE_EXPANDED_PANEL = IMPLEMENTADO_LOCALMENTE
ARTICLE_SUMMARY = IMPLEMENTADO_COM_DADOS_DERIVADOS_ROTULADOS
ARTICLE_DNA_SECTION = IMPLEMENTADO_EM_ACCORDION
PRIMARY_KEYWORD_SECTION = IMPLEMENTADO
SUPPORT_KEYWORDS_SECTION = IMPLEMENTADO
KEYWORD_DNA_ACCORDION = IMPLEMENTADO
LOGIC_PANEL = IMPLEMENTADO
SERP_PANEL = IMPLEMENTADO
AI_PANEL = IMPLEMENTADO
HUMAN_REVIEW_PANEL = IMPLEMENTADO
SILO_CONTEXT_SECTION = CONDICIONAL_A_REFERENCIA_REAL
INTERNAL_LINK_CONTEXT_SECTION = CONDICIONAL_A_GRAFO_REAL
LEGACY_ARTICLE_FIELDS_AUDIT = NAO_CANONICOS_NO_ARTIGOS; DADOS_PRESERVADOS
MANUAL_UI_VALIDATION = PENDING
```

## Planilha principal de Artigos — padronização operacional — 2026-08-27

- A única planilha do workspace agora apresenta, após `#`, seleção e chevron:
  `Artigo`, `Keyword principal`, `Quantidade de keywords`, `Revisão IA`,
  `Definição do artigo`, `Silo`, `Ações`, `Aprovação` e `Status`.
- A numeração é ordinal visual. Checkbox seleciona sem expandir; chevron abre
  sem selecionar. A linha expandida recebe superfície elevada, preservando a
  seleção como estado independente.
- Em Artigos, não há cabeçalho de grupo/Silo e a coluna Silo mostra somente
  `Não iniciado` ou `Pronto para Silos`; a troca de modo não cria SiloDNA,
  SiloPage, Pilar ou Suporte.
- Em Silos/Links, a mesma tabela pode exibir o Silo existente e sua hierarquia
  real. `Silo sem nome` permanece apenas fallback legado dessa projeção; não
  há literal persistido identificado e nenhum dado foi apagado.
- O painel expandido continua sendo inserido abaixo da linha pelo mesmo
  `expandedIds`; não houve mudança de contrato, schema, persistência, Radar ou
  InternalLinkGraph.

```text
PREMATURE_SILO_SOURCE = groupedArticles read-model fallback

## Planilha principal de Artigos — padronização operacional — 2026-08-27

- A única planilha apresenta, após `#`, seleção e chevron: `Artigo`, `Keyword principal`, `Quantidade de keywords`, `Revisão IA`, `Definição do artigo`, `Silo`, `Ações`, `Aprovação` e `Status`.
- A numeração é ordinal visual. Checkbox seleciona sem expandir; chevron abre sem selecionar. A linha expandida recebe superfície elevada, preservando a seleção como estado independente.
- Em Artigos, não há cabeçalho de grupo/Silo e a coluna Silo mostra somente `Não iniciado` ou `Pronto para Silos`; a troca de modo não cria SiloDNA, SiloPage, Pilar ou Suporte.
- Em Silos/Links, a mesma tabela pode exibir o Silo existente e sua hierarquia real. `Silo sem nome` permanece fallback legado dessa projeção; não há literal persistido identificado e nenhum dado foi apagado.
- O painel expandido continua abaixo da linha pelo mesmo `expandedIds`; não houve mudança de contrato, schema, persistência, Radar ou InternalLinkGraph.

```text
PREMATURE_SILO_SOURCE = groupedArticles read-model fallback
PREMATURE_SILO_PERSISTED = NOT_VERIFIED
PREMATURE_SILO_UI_DERIVED = YES; only outside Articles mode
MANUAL_UI_VALIDATION = PENDING
```

## Correção final de Artigos — escopo dos processos e painel expandido — 2026-08-27

- **Lógica:** no modo Artigos, exige seleção explícita. A entrada do algoritmo contém somente KeywordDNAs dos artigos selecionados; keywords e grupos não selecionados são preservados ao recompor a working copy. Não há fallback de seleção vazia para todo o workspace.
- **SERP e IA:** os controles já recebiam grupos selecionados; o resumo do Workbench agora deriva somente desses artigos. A coluna de IA permanece por artigo e a tab distingue `IA concluída` de `revisão humana pendente`.
- **Tabs internas:** a causa de não navegar era a memoização do subtree sem a tab ativa. `processTab` entrou apenas na chave de renderização local; clique continua sendo leitura/navegação, sem provider, persistência ou mutação.
- **SERP:** cabeçalho separa execução, conclusão arquitetural e força da evidência; conflito e evidência fraca são dimensões diagnósticas distintas. A ausência de recomendação de slug continua explícita e compacta.
- **Visual:** keyword e slug provisório usam accent semântico; publicado usa o tratamento contextual existente. Linha expandida recebe rail própria e chevron destacado, independente de checkbox/seleção.
- **Validação local:** 13/13 regressões de fase/escopo/tabs passaram. Chrome, provider real, persistência remota e readback permanecem pendentes.

## Correção crítica — mutation scope de Artigos e diagnóstico IA — 2026-08-27

- **Causa raiz comprovada:** o executor recebia o recorte selecionado, mas recompunha o workspace inteiro e passava todas as rows ao writer canônico; por isso write/payload e a mensagem podiam parecer globais.
- **Correção:** o escopo é capturado no entrypoint da Topbar, a composição preserva objetos não selecionados na mesma ordem e o writer recebe somente `mutationItems`.
- **Mensagem:** separa artigos processados do total confirmado na working copy; não chama o total do workspace de processado.
- **IA:** aplicação de proposta também é limitada ao `mutationKeywordIds` registrado ao gerar a proposta. O cliente preserva `HTTP`, `code` e `failureStage` sanitizados devolvidos pela rota, em vez de apagar o diagnóstico com mensagem genérica.
- **Prova local:** fixture A/B/C/D, com apenas D selecionado, preserva A/B/C por identidade estrutural e permite alteração somente em D. Teste focal passou (`7/7`).
- **Limites:** nenhum provider foi chamado; não há log histórico do clique real disponível neste ambiente. Chrome, F5 remoto e a classificação factual do erro anterior de IA continuam pendentes.
- **Escopo:** sem migration, schema, RLS, alterações de Silos/Links/Radar ou chamada paga.

## Correção pontual — Revisão com IA — 2026-08-27

- O pós-provider agora completa a fotografia da proposta com `mutationArticleIds` e `mutationKeywordIds`; o tipo `PendingKeywordReview` volta a ser satisfeito e a proposta válida chega à revisão humana sem mutar a working copy.
- O catálogo de destinos enviado à IA é limitado aos grupos selecionados no lote. Artigos externos não recebem proposta de mutação.
- Diagnósticos sanitizados de truncamento/formato agora exibem mensagens específicas no cliente; não há logs ou chamada real desta rodada para atribuir a falha histórica a um estágio do DeepSeek.
- Testes locais cobriram fixture válida, fixture truncada, rota/configuração por contrato e regressão direta de escopo. Não houve chamada de provider, persistência remota ou readback remoto.
- A proposta pendente ainda é estado de sessão até a aplicação humana; persistência independente de proposta antes da decisão não existe no contrato atual e exige avaliação estrutural antes de ser criada.

## Correção pontual — painel de processos do Artigo — 2026-08-27

- A linha `Revisão IA`, o Workbench para a seleção atual e as abas internas agora derivam o estado de um único read model por artigo: Lógica, SERP, IA e Revisão. A tab continua estado local de navegação e não executa processo, provider ou persistência.
- A IA separa `NOT_RUN`, processamento, conclusão sem propostas, conclusão com propostas e erro; a revisão separa não necessária, pendente, em revisão e concluída. Três propostas significam IA concluída e três pendências humanas, não três execuções.
- Proposta ainda na fila e proposta aplicada à working copy permanecem visíveis na aba Revisão. `Aplicar proposta para revisar` não aprova ArticleDNA; somente o pente-fino humano encerra a pendência.
- A projeção da SERP conserva o resumo explicável existente e passa a expor o estado por artigo, sem tratar conflito ou evidência fraca como execução parcial.
- Auditoria dos erros relatados: a mensagem de workflow nasce do update otimista por `id`, `marca_id` e `lock_version`; sem log da tentativa não é possível distinguir lock obsoleto de identidade incompatível. A mensagem de working copy nasce do retorno `false` do writer; o handler retorna imediatamente, portanto não há sucesso na mesma tentativa de aplicação.
- Validação local: 17/17 testes focados passaram. `test:arquiteto` ficou 182/183 por teste estático preexistente do Minerador que espera o label antigo `Processar lógica`. TypeScript não apontou erro novo do Arquiteto; permanecem 4 falhas preexistentes (1 em Minerador e 3 regex TS1501). Chrome, provider real, persistência remota e readback remoto não foram executados.

## Revisão IA do artigo persistida no artefato canônico — 2026-08-29

- **Decisão do Planner:** reutilizar `editorial_artifact_versions` com o tipo
  `article_architecture_ai_review`, escopo `marca_id + artifact_type +
  entity_id(articleId)`. Nenhuma tabela nova.
- **O que passou a sobreviver ao F5:** execução, NO_OP, propostas materiais com
  `proposalId` estável e a decisão humana por proposta. Antes o resultado vivia
  só no estado de sessão e o artigo voltava para "IA · Não executada".
- **Base revisada:** `articleId` + `baseArticleContentHash` (+ versão do
  ArticleDNA quando consolidado). O hash da base entra no `contentHash` do
  artefato, então mesma base com mesmo resultado devolve `UNCHANGED` e base
  alterada gera versão nova mesmo com resultado idêntico.
- **STALE:** revisão de base antiga vira histórico, não vigente. A aba IA avisa
  que a estrutura mudou e sugere reexecutar; a aprovação do ArticleDNA continua
  liberada.
- **Decisão humana:** aceitar/rejeitar grava sucessora do próprio artefato, sem
  reescrever o resultado da IA. Aceitar proposta continua distinto de aprovar o
  ArticleDNA.
- **Readback obrigatório:** só existe SUCCESS depois de reler os artefatos
  canônicos e conferir `versionId`/`contentHash` de cada revisão gravada.
- **Schema:** somente ampliação do CHECK de `artifact_type`, na migration
  `20260829120000_article_architecture_ai_review_artifact.sql`. Aplicação
  remota e smoke A–F são do produto.
- **Validação local:** 15/15 testes novos de persistência; `test:arquiteto`
  310/311, com a única falha sendo a asserção estática preexistente do
  Minerador. TypeScript mantém os cinco erros preexistentes fora deste lote.

## IA por Article: payload estratégico, 413 e durabilidade — 2026-08-29

- **Unidade de execução:** a revisão com IA passou a ser por Article
  (`buildArticleReviewBatches`). Antes o lote era uma fração de artigo — até 4
  keywords por request —, então um artigo de 6 keywords virava dois requests e
  qualquer falha derrubava a execução inteira. Agora cinco artigos selecionados
  produzem cinco execuções independentes, sequenciais (concurrency = 1).
- **Causa do HTTP 413:** o payload carregava o registro cru da keyword
  (`keywordDnaSnapshot: { ...keyword }`), os snapshots completos da SERP
  (`organicResults`, `peopleAlsoAsk`, `knowledgeGraph`) e todos os SiloDNAs
  inteiros. Em fixture de um artigo com 6 keywords isso dava 418 409 caracteres,
  acima do limite de 250 000 do provider — daí o `AI_REQUEST_INVALID` ao rodar
  vários artigos e o sucesso ao rodar um pequeno. O limite não foi aumentado.
- **Projeção estratégica:** `lib/arquiteto/ai-strategic-payload.ts` projeta
  keyword, SERP e Silo para o que decide arquitetura — entidade, intenção,
  funil, modificadores, público, volume, resultados, KGR e aplicabilidade, CPC,
  KD, tendência, competição Ads, política da principal e status upstream; e, na
  SERP, veredito, competição, tipos dominantes, recomendações e observações. O
  mesmo fixture caiu para 11 679 caracteres (−97,2%). A UI somente leitura da
  KeywordDNA continua lossless: a redução é do payload, não da leitura humana.
- **Guard determinístico:** `measureStrategicPayload` mede o contexto antes da
  chamada. Exceder o limite vira erro daquele Article, com bytes e maiores
  contribuintes na mensagem, e a fila segue para o próximo artigo.
- **Isolamento:** falha de um artigo não cancela os demais. O lote reporta
  `IA · Parcial N/M artigo(s)` e lista, por artigo, o motivo real; as propostas
  válidas dos outros permanecem.
- **Contador:** bancada e aba do artigo passaram a contar propostas materiais
  pelo mesmo classificador (`materialKeywordArticleDecisions`). Uma decisão
  bruta que apenas confirma o estado atual não aparece mais como
  "1 proposta gerada" enquanto o artigo mostra zero.
- **Durabilidade:** não existe storage canônico para a revisão da IA. A cópia de
  trabalho canônica (`AssignmentSchema`, `.strict()`) não tem campo para
  execução, proposta ou NO_OP; a única continuidade é a recuperação local do
  navegador, que preserva a anotação já aplicada e não é canônica. Nada foi
  criado para simular durabilidade: o pedido estrutural está em
  `propostas/2026-08-29-pedido-estrutural-persistencia-revisao-ia.md` com
  `STRUCTURAL_AI_REVIEW_PERSISTENCE_REQUIRED = YES`.
- **Validação local:** 15/15 testes novos e `test:arquiteto` 295/296 — a única
  falha é a asserção estática preexistente do Minerador. TypeScript mantém os
  cinco erros preexistentes fora deste lote; `git diff --check` passou. Sem
  provider real, sem chamada paga, sem validação em Chrome.

## Ajuste pontual — resumo de intenção, funil e KGR — 2026-08-27

- O resumo e os cards do painel expandido agora projetam a intenção e o funil canônicos da KeywordDNA Principal. Uma secundária ou reforço divergente não substitui esses fatos.
- A divergência de intenção e/ou funil aparece em `Compatibilidade` como conflito por keyword de apoio; a mudança é somente de leitura e não altera Lógica, SERP, IA, consolidação ou persistência.
- O resumo exibe KGR apenas como `Sim`/`Não` quando a aplicabilidade humana upstream está definida; ausência permanece `—`. O valor decimal é preservado no perfil completo da KeywordDNA.
- Validação local: 4/4 testes focados e guard visual PASS. `test:arquiteto` ficou 182/183 por asserção estática preexistente do Minerador; TypeScript mantém quatro erros preexistentes fora deste ajuste. Chrome, provider real, persistência remota e readback remoto não foram executados.

## Bug pontual — tabs internas do painel expandido — 2026-08-27

- **Causa raiz:** `MemoizedArticleRow` ignorava a tab ativa no comparador. O clique atualizava `expandedProcessTabs`, mas a row memorizada bloqueava a renderização antes de `MemoizedArticleSubtree` receber o novo `processTab`.
- **Correção:** a tab ativa passou a ser prop e dependência explícita de `MemoizedArticleRow`; o handler local usa `selectArticlePanelProcessTab`, que apenas atualiza o estado visual por `articleId`.
- **Limites preservados:** sem provider, processo editorial, mutação de working copy, alteração de read-model, SERP, IA ou Revisão.
- **Prova:** reprodução no Chrome mostrou botão no topo da pilha com `pointer-events: auto`, mas conteúdo/`aria-selected` congelados; após o ajuste e recarga do bundle, Lógica → SERP → IA → Revisão → Lógica trocou tab ativa e conteúdo. O contexto transitório original de processos não foi reidratado após a recarga, portanto a validação manual completa com aqueles artefatos permanece pendente.
- **Validação local:** 15/15 testes focados passaram. TypeScript mantém quatro erros preexistentes fora do Arquiteto; `git diff --check` passou.
## Exclusao selecionada pelo lifecycle canonico - 2026-08-28

- A acao Excluir voltou ao rodape da planilha somente quando ha artigos selecionados no modo Artigos. Ela resolve apenas Principal e secundarias desses artigos, sem selecionar clusters, artigos ou Keywords de fora.
- A pre-visualizacao e a execucao reutilizam os endpoints existentes do Minerador: `POST /api/minerador/marcas/{brandId}/keywords/delete/preview` e `POST /api/minerador/marcas/{brandId}/keywords/delete`. Nenhum endpoint, RPC, schema, migration ou RLS foi criado pelo Arquiteto.
- O dialogo compartilhado `DeleteConfirmation` trata KeywordDNAs nao publicadas; `PublishedDeleteConfirmation` trata selecao publicada ou mista pelo fluxo recuperavel de 24 horas. Versoes, eventos, publicacao, URL, canonical e proveniencia continuam sob o lifecycle canonico.
- A grade somente remove a projecao apos resposta transacional completa e `loadCanonicalArquitetoWorkspace` confirmar que nenhum ID da selecao continua ativo. Falha de preview, transacao parcial ou readback preserva a working copy e a selecao.
- Prova local: 7/7 testes novos de selecao, preview, mistura publicada, falhas, resultado completo, readback e entrypoint; mais 6/6 testes existentes do lifecycle do Minerador. Nao houve chamada remota destrutiva, provider, limpeza de browser storage ou validacao manual em Chrome.
- TypeScript nao reportou erro no adaptador novo. O comando segue bloqueado por erros preexistentes em `components/editorial/dna-panels.tsx`, `lib/minerador/keyword-qualification.ts` e tres fixtures TS1501. O lint e o guard visual tambem reportam divida preexistente ampla em `arquiteto-workspace.tsx`; este lote reutiliza tokens e os dialogs compartilhados, sem novo componente visual.

## Identidade estrutural da revisão IA: Silo fora da base — 2026-09-02

- **Regra permanente:** atribuir ou alterar o Silo de um Article **não** invalida a
  revisão arquitetural por IA. Silo pertence à etapa posterior — Artigos vêm antes
  de Silos — e não integra a identidade estrutural revisada.
- **`baseArticleContentHash` inclui:** identidade do Article, `principalKeywordId`,
  o conjunto de keywords e o papel arquitetural canônico de cada uma. Quando existe
  ArticleDNA consolidado, a base é o `contentHash` dele.
- **`baseArticleContentHash` NÃO inclui:** `siloId`, SiloDNA, SiloPage,
  InternalLinkGraph, `reviewRole` transitório, estado visual, seleção de UI,
  timestamps ou evidência contextual. A referência da SERP continua registrada como
  proveniência em `serpAssessmentId/Version/ContentHash`, fora do hash da base.
- **Papéis:** `principalKeywordId` é a única autoridade da Principal —
  `canonicalArticleKeywordRole` impede duas Principais no hash. A distinção
  Secundária × Reforço narrativo é estrutural e continua alterando o hash.
- **STALE:** estrutura realmente diferente mantém a revisão como histórico
  explícito (`IA · Desatualizada`), nunca como `NOT_RUN`. STALE não bloqueia a
  aprovação do Article, não aplica proposta antiga e tem pendência ativa zero;
  a reexecução é sempre explícita.
- **Histórico:** revisões gravadas com a fórmula anterior permanecem imutáveis.
  Elas aparecem como desatualizadas até o usuário reexecutar a IA; nenhum hash,
  payload ou versão foi reescrito, e não houve migration de conteúdo.
- **Validação local:** 18/18 testes de base/STALE, incluindo a regressão real de
  `group-ogg12k` e o caso de pipeline Artigos → Silos. `test:arquiteto` 355/356,
  com a única falha sendo a asserção estática preexistente do Minerador.

## Revisão Humana operacional: edição estrutural da working copy — 2026-09-02

- **Regra permanente:** a Revisão Humana é a superfície canônica para decisões
  estruturais manuais da working copy do Article. Lógica forma a hipótese, SERP
  observa, IA propõe — o humano decide e altera.
- **Ações disponíveis por keyword, na aba Revisão:** definir como Principal,
  alternar Secundária × Reforço narrativo, mover para outro artigo, retirar do
  artigo (volta para Keywords não agrupadas) e criar um artigo novo. Ações de
  maior impacto pedem confirmação curta com antes, depois e impacto.
- **Invariante:** `WORKING_ARTICLE_EFFECTIVE_PRINCIPAL_COUNT = 1`. Mover ou
  retirar a Principal exige eleger a nova Principal da origem na mesma operação;
  nenhum caminho humano deixa duas Principais nem artigo sem Principal.
- **KeywordDNA continua somente leitura:** as operações mexem apenas em
  pertencimento, papel e composição. Nenhum fato upstream — keyword, volume,
  resultados, CPC, KD, intenção, funil, KGR, qualificação semântica ou
  apresentação contextual — é alterado.
- **Mudanças estruturais invalidam a atualidade de SERP e IA sem apagar
  histórico:** trocar a Principal, mover keyword ou alterar Secundária × Reforço
  muda a base revisada, então a revisão IA anterior fica `STALE` e o assessment
  SERP anterior deixa de governar a formação atual. Nada é reexecutado
  automaticamente; a mensagem pede atualização explícita.
- **Silo não pertence a esta edição.** A aba Revisão não cria SiloDNA, SiloPage,
  Pilar, Suporte nem InternalLinkGraph, e atribuir Silo continua sem desatualizar
  a revisão IA.
- **Publicado protegido:** artigo publicado não aceita troca de Principal, troca
  de papel, movimentação, retirada nem separação de keyword pela Revisão.
- **Persistência:** toda ação passa por `persistWorkingCopyAssignments` →
  `persistArchitectWorkingCopy`, o mesmo contrato canônico já usado pelas demais
  mutações da working copy. Nenhuma tabela, migration ou `localStorage` novo.
- **Read-model único:** cada ação atualiza `masterList` e `provisionalGroups`, de
  onde planilha, painel expandido, abas e mapa derivam. Não existe estado manual
  paralelo dentro da aba.
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE. **Smoke manual do usuário:
  PENDENTE** — não considerar homologado antes disso.

## Fiação da Revisão Humana: controles operacionais de fato — 2026-09-02

- **Correção:** o primeiro smoke manual mostrou os controles como enfeite —
  escolher o destino em "Mover para outro artigo" não abria confirmação e nada
  acontecia. Causa: o painel expandido é renderizado dentro de
  `MemoizedArticleSubtree`, memoizado por `articleTableRenderRevision`, e o
  estado da confirmação não fazia parte dessa revisão. O `onChange` disparava e
  o estado mudava, mas o subtree nunca re-renderizava.
- **Fiação extraída:** `lib/arquiteto/manual-architecture-interaction.ts` contém
  intenção (`requestManualArchitecture`), execução (`resolveManualArchitecture`)
  e confirmação da gravação (`commitManualArchitecture`). O componente só liga
  os controles a essas funções — a etapa que quebrou passou a ser exercitável
  sem navegador.
- **Regra:** destino cheio, artigo publicado e Principal sem sucessora são
  recusados **antes** da confirmação, com motivo. Sucesso só é anunciado depois
  de `persistWorkingCopyAssignments` confirmar; falha de gravação mantém a
  confirmação aberta e não mente sobre persistência.
- **Estado:** IMPLEMENTADO e TESTADO LOCALMENTE (12 testes de fiação com estado
  real e persistência injetada, além dos 20 de domínio). **Smoke manual do
  usuário: PENDENTE.** A camada DOM em si não tem teste automatizado — o
  repositório não tem renderer de componentes — então o clique real continua
  sendo a única prova de ponta a ponta.

## Cenários arquiteturais — Fase 1: contrato, invariantes e diff — 2026-09-02

- **Entregue:** `lib/arquiteto/architecture-scenario.ts` — contrato comum
  `ArchitectureScenario` para os cinco cenários (base, logic, serp, ai, human,
  current), validador estruturado, normalizador determinístico e diff derivado.
  Domínio puro: sem storage, sem artifact, sem UI, sem provider.
- **Um contrato só.** Não existem `LogicScenarioModel`/`SerpScenarioModel`
  independentes: Lógica, SERP, IA, Humano e Atual usam a mesma forma, o mesmo
  validador e o mesmo diff.
- **Universo declarado:** todo cenário carrega `universe { keywordIds[], contentHash }`
  com IDs ordenados e sem duplicata. Cenários de universos diferentes não são
  comparáveis — o diff devolve `comparable: false` e o validador reporta
  `UNIVERSE_HASH_MISMATCH`. Impede comparar silenciosamente 10 keywords com 12.
- **Capability:** `complete` particiona todo o universo; `partial` representa só o
  que a fonte histórica reconstrói. Lacuna continua lacuna explícita — nada é
  preenchido por inferência.
- **Identidade do Article:** `articleRef` estável, na mesma política de
  `articleKeyOf` (`provisionalGroupId || clusterId || id`). Nunca label, slug
  provisório ou índice visual.
- **Proveniência múltipla:** `sourceRefs` é lista — um cenário SERP futuro será
  sustentado por vários assessments.
- **Política Principal × papel:** a troca de Principal gera um único
  `PRINCIPAL_CHANGED`; as duas keywords envolvidas não geram `ROLE_CHANGED`, para
  não duplicar o mesmo fato na contagem.
- **Split/merge por membership, não por contagem de Articles:** exigem 2+ keywords
  materiais em cada lado. Uma keyword que muda de Article é `KEYWORD_MOVED`.
- **Limites desta fase:** `NEW_CURRENT_ARTIFACT = PROIBIDO`,
  `SERP_ARTIFACT_CREATED = NO`, `AI_ENUM_CHANGED = NO`. `scenarioType: "current"`
  existe no read-model, sem storage. Um teste trava esses limites.
- **Validação local:** 20/20 testes novos; `test:arquiteto` 412/413, com a única
  falha sendo a asserção estática preexistente do Minerador.
- **Não entregue:** materialização de qualquer cenário, mapa, trilho, ganhos/perdas,
  adoção de candidato e confirmação de Atual. Fases 2 a 6.

## Auditoria Silo-first — Fase 0, sem implementação — 2026-09-02

- **Natureza da entrega:** `ARCHITECTURE_AUDITED` + `SDD_READY_FOR_APPROVAL`.
  Nenhum arquivo de produto foi alterado; nenhuma migration, SQL, DDL, operação
  remota ou chamada paga foi executada.
- **Fluxo atual verificado no código (Article-first):**
  `buildDeterministicArticleArchitecture` (`engine.ts:441`) recebe todas as
  keywords da Brand, reserva candidatas a Silo e agrupa o resto em Articles;
  `formSiloWorkingCopies` (`silo-formation.ts:279`) só depois recebe
  `articleVersions`. `normalizeArticleWorkingCopyKeyword` (`article-phase.ts:31`)
  zera `siloId`/`siloName`/`hierarquia` de toda keyword não publicada.
  `resolveArticleSiloReadiness` (`article-phase.ts:162`) devolve `not_started`
  enquanto não houver ArticleDNA. `articleApprovalIssues`
  (`operational-flow.ts:104`) documenta a dependência circular que Silo-first
  resolve na origem.
- **Working copy do Arquiteto:** linhas de `editorial_workflow_items`
  (`subject_type='keyword'`, `stage='architect'`, `state='received'`), payload com
  a atribuição e `lock_version` por item. A tabela `editorial_architect_work_copy`
  citada na SDD anterior **não existe**.
- **Working copy de Silos:** não persistida — `useState<SiloWorkingCopy[]>`
  (`arquiteto-workspace.tsx:510`). Não sobrevive ao F5 e não está em
  `architect-recovery.ts`. A proposta de IA de Silos (`/api/arquiteto/silo-review`)
  também não é persistida.
- **Identidade do Silo:** `siloId = minerador_keyword_lists.id`
  (`app/api/arquiteto/silos/route.ts`). Criar Silo manual hoje grava linha no
  Minerador + SiloDNA draft + SiloPage draft + entrada em `marcas.silos_existentes`.
- **Cenários:** `lib/arquiteto/architecture-scenario.ts` (Fase 1 da SDD anterior)
  está implementado e é Article-only. A SDD Silo-first o estende de forma aditiva
  com `level: "silo" | "article"`, sem alterar teste existente.
- **Persistência disponível sem DDL:** `editorial_workflow_items.subject_type` é
  texto livre (`CHECK char_length BETWEEN 1 AND 80`), `stage='architect'` já é
  aceito, RLS deriva de `editorial_stage_module(stage)`, `lock_version` já tem
  trigger e existe `UNIQUE (marca_id, subject_type, subject_id, stage)`.
  `editorial_artifact_versions.artifact_type` continua sendo o único ponto com
  CHECK — DDL só na Fase 6.
- **Baseline medida nesta auditoria:** `test:arquiteto` 413 testes, 412 pass,
  1 falha pré-existente (asserção estática do Minerador em
  `arquiteto-domain.test.mts:307`). TypeScript: 5 erros pré-existentes, nenhum no
  Arquiteto. ESLint em `lib/arquiteto` + `app/api/arquiteto`: limpo; 96 problemas
  pré-existentes concentrados em `modules/arquiteto/arquiteto-workspace.tsx`.
  `git diff --check`: 0 problemas reais.
- **Documento:** `propostas/2026-09-02-sdd-arquitetura-silo-first.md`.
  `SDD_STATUS = PROPOSED_AWAITING_APPROVAL`. A implementação da Fase 1 depende de
  aprovação explícita do usuário e das quatro decisões devolvidas ao Planner
  Geral (C1–C4).

## Silo-first — SDD revisão 2, ainda sem implementação — 2026-09-02

- **Natureza da entrega:** documentação. `PRODUCT_IMPLEMENTATION = NOT_STARTED`.
  Nenhum arquivo de produto alterado; `DDL = 0`, `MIGRATION = 0`,
  `REMOTE_MUTATIONS = 0`, `PAID_PROVIDER_CALLS = 0`.
- **Decisões do Planner incorporadas:** C1 `EXTEND_ADDITIVELY` do
  `ArchitectureScenario` já em `main`; C2 `LEGACY_CREATION_PATH` congelado para
  `POST /api/arquiteto/silos`; C3 `relatedKeywordCount >= 2` rebaixado a
  `LEGACY_SIGNAL`; C4 separação definitiva `territoryRef` × `siloId` × `lista_id`.
- **Fonte canônica da membership:** o item de workflow da **keyword**
  (`territoryRef` + `territoryAssignment`). `territory.keywordRefs` não é
  persistido — projeção derivada na leitura. Motivo verificado no código: o
  `PATCH /api/arquiteto/workspace` percorre o lote em laço, sem transação; com a
  fonte no lado da keyword, uma falha parcial mantém cada keyword em exatamente
  um lugar e nunca viola a partição, nem transitoriamente.
- **Identidade territorial:** `territoryRef = "territory:" + uuid`, opaco, gerado
  no servidor, estável a renome/fronteira/slug/moves. Split preserva a ref da
  origem e cria refs novas para as partes; merge preserva a ref do sobrevivente e
  marca os absorvidos `superseded`; rejeitado preserva ref e histórico. Na
  consolidação a ref é **referenciada**, nunca reaproveitada como `siloId`.
- **Consolidação de território novo:** cunha `siloId` canônico próprio, **sem**
  criar linha em `minerador_keyword_lists`. Verificado que
  `editorial_artifact_versions.entity_id` é `text` sem FK e que
  `canonicalSiloOptions` monta o seletor somente a partir de SiloDNA/SiloPage
  versionados — um Silo novo sem lista aparece corretamente.
- **`silo_architecture_scenario`:** retirado da proposta. Volta a hipótese, a ser
  provada apenas na fase da SERP territorial.
- **Documento:** `propostas/2026-09-02-sdd-arquitetura-silo-first.md`,
  `SDD_REVISION = 2`, `SDD_READY_FOR_FINAL_APPROVAL = YES`,
  `SDD_APPROVED = NO`. A SDD anterior ficou marcada como
  `SUPERSEDE_ON_NEW_SDD_APPROVAL`, com Fase 1 `PRESERVE_AND_EXTEND` e Fases 2–6
  canceladas na aprovação.
- **Baseline reconfirmada após a edição documental:** `test:arquiteto` 413 testes,
  412 pass, 1 falha pré-existente (`arquiteto-domain.test.mts:307`).
  `git diff --check` sem problemas reais.

## Silo-first — Fase 1: fundação de contratos de território e cenário — 2026-09-02

```
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED
SILO_FIRST_ARCHITECTURE        = NOT_COMPLETE  (Fases 2 a 13 pendentes)
```

- **Entregue:** `lib/arquiteto/territory.ts` — contrato, lifecycle, identidade,
  linhagem, semântica de membership, consistência e readiness do território; e a
  extensão aditiva de `lib/arquiteto/architecture-scenario.ts` com o
  discriminador `level`. Domínio puro: sem persistência, sem API, sem UI, sem
  React Flow, sem provider, sem DDL, sem SQL.
- **`level` obrigatório (C1):** `ArchitectureScenarioSchema` virou união
  discriminada `article | silo`. `safeParseArchitectureScenario` recusa payload
  sem nível com `LEVEL_REQUIRED`; `deriveArchitectureScenarioDiff` recusa níveis
  diferentes com `incomparableReason: "LEVEL_MISMATCH"` e devolve zero entradas.
  O default de nível existe em **um único lugar**, a borda
  `parseArchitectureScenarioWithLegacyLevel`, e um teste trava essa contagem em 1.
- **Payloads semanticamente distintos:** o cenário de Silo usa
  `territories[] + unassignedKeywords[]`; nunca `articles[] + ungroupedKeywordIds[]`.
  Validador, normalizador e diff atendem os dois níveis com códigos próprios
  (`DUPLICATE_TERRITORY_KEY`, `TERRITORY_CREATED/REMOVED/SPLIT/MERGED`,
  `KEYWORD_TERRITORY_MOVED/ASSIGNED/UNASSIGNED`, `BOUNDARY_CHANGED`,
  `SLUG_PROPOSAL_CHANGED`).
- **Identidade (C4):** `territoryRef = "territory:<uuid>"`, opaco.
  `territoryIdentityIssues` recusa `territoryRef` derivado de `siloId` ou de
  `lista_id`. Nenhum ponto do módulo cita `minerador_keyword_lists`,
  `createCanonicalManualSilo`, persistência ou provider — há teste travando isso.
- **Membership:** fonte única no item da keyword
  (`KeywordTerritoryAssignment`); `projectTerritoryMembership` é projeção
  derivada. `TerritoryCandidate` **não** guarda `keywordRefs`.
- **E1 — operação parcial:** `pendingOperation: MembershipOperation | null` no
  payload do território, `status` derivado (`applied | in_progress | partial`).
  `partial` emite `PARTIAL_MEMBERSHIP_OPERATION`, bloqueia
  `resolveTerritoryConfirmationReadiness` e bloqueia
  `resolveArticleFormationReadiness`. Nenhuma keyword é corrigida
  automaticamente; nenhuma tabela nova.
- **E2 — split:** `planTerritorySplit` exige `continuingPartId` declarado. Sem
  ele, recusa `SPLIT_CONTINUATION_NOT_DECLARED` — posição, tamanho, volume, SERP
  e IA não escolhem. A origem mantém a ref e registra
  `lineage.splitIntoTerritoryRefs`; cada parte criada registra
  `lineage.splitFromTerritoryRef`. Também recusa `SPLIT_KEYWORD_LOST` e
  `SPLIT_DUPLICATE_KEYWORD`.
- **E3 — merge:** `planTerritoryMerge` exige `survivingTerritoryRef` declarado.
  Sem ele, recusa `MERGE_SURVIVOR_NOT_DECLARED`. Absorvidos recebem
  `supersededByTerritoryRef`; o sobrevivente registra `absorbedTerritoryRefs`.
  Duas âncoras `existingSiloRef` distintas → `MERGE_OF_TWO_EXISTING_ANCHORS`.
  Absorver um território publicado → `PUBLISHED_PROTECTION_VIOLATION`.
- **`EMPTY_TERRITORY` decidido, não generalizado:** diagnóstico em `candidate`
  para qualquer origem — um `MANUAL_STRATEGIC` pode ser declarado antes de
  reservar keywords e um split esvazia um lado por um instante — e **bloqueador
  na porta `candidate → confirmed`**, porque confirmar é o que libera a formação
  de Article.
- **Gate de Article:** `resolveArticleFormationReadiness` só libera com
  `lifecycleStatus='confirmed'`, `decisionState='confirmed'`, sem bloqueadores e
  com keywords que pertencem ao território. `consolidated` recusa com
  `SUCCESSOR_REQUIRED`; `candidate`, `rejected` e `superseded` recusam com
  `TERRITORY_NOT_CONFIRMED`; keyword de fora recusa com
  `KEYWORD_OUTSIDE_TERRITORY`.
- **Validação local:** 46 testes nos dois arquivos da frente (26 novos em
  `tests/arquiteto-territory.test.mts` + 20 preservados). `test:arquiteto` passou
  de 413 para 439 testes, 438 pass, com a única falha sendo a asserção estática
  pré-existente do Minerador. TypeScript: 5 erros, exatamente os mesmos de antes
  do lote — zero erro novo. ESLint em `lib/arquiteto/territory.ts` e
  `lib/arquiteto/architecture-scenario.ts`: limpo. `git diff --check`: limpo.
- **Alteração em teste existente, declarada:** o fixture de
  `tests/arquiteto-architecture-scenario.test.mts` ganhou `level: "article"` e
  passou a ser tipado como `ArticleArchitectureScenario`. Nenhuma asserção foi
  alterada, removida ou enfraquecida; os 20 testes continuam passando.
- **Não entregue (fora do escopo da Fase 1):** persistência do território,
  APIs, UI, React Flow, Lógica territorial, SERP, IA, consolidação
  SiloDNA/SiloPage, formação de Article escopada, migration e SQL.
- **Smoke manual do usuário:** não se aplica — a Fase 1 não tem superfície de
  interface.

## Silo-first — Fase 1 estendida (Etapa 0) e BLOQUEIO da Fase 2 — 2026-09-02

```
SILO_FIRST_CONTRACT_FOUNDATION = IMPLEMENTED
TERRITORIAL_BASE_CONTRACT      = IMPLEMENTED
TERRITORIAL_BASE_READ_MODEL    = BLOCKED  (ver bloqueio abaixo)
MARCA_SITE_INTEGRATION         = BLOCKED  (não há fonte canônica reutilizável)
SILO_FIRST_ARCHITECTURE        = NOT_COMPLETE
```

- **Entregue nesta rodada:** `lib/arquiteto/territorial-base.ts` (Base
  Territorial, `PublishedStructureEvidence`, estados de reconciliação,
  divergência site × banco, promoção humana, afinidade territorial, resíduo e
  ordem operacional dos processos) e a extensão de `lib/arquiteto/territory.ts`
  com `narrative` e `discovery`. Domínio puro.
- **Evidência nunca vira território:** `planTerritoryPromotion` recusa sem
  decisão humana declarada (`PROMOTION_REQUIRES_HUMAN_DECISION`), recusa entrada
  ignorada, já promovida ou de outra Brand. `classifyUrlStructuralHint` devolve
  apenas pista (`editorial_candidate | technical | unknown`) e não decide nada.
- **Autoridade de publicação:** `PublicationRecord`/estado editorial é autoridade
  interna; sitemap é inventário externo. Divergências viram
  `PUBLISHED_UNRESOLVED`, `DATABASE_ONLY` e `CANONICAL_CONFLICT` — nenhuma
  correção automática.
- **`SERP_CAN_CREATE_KEYWORDDNA = NO`** provado por
  `suggestionUsableAsKeywordId`, que só devolve id depois do retorno do Minerador.
- **`NEW_TERRITORY = EXCEPTION_REQUIRING_JUSTIFICATION`:**
  `resolveTerritorialResidue` só considera `no_match`, `ambiguous` e
  `conflicting`; universo inteiramente absorvido não pede território novo.
- **Validação:** `test:arquiteto` 453 testes, 452 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript: 5 erros, os mesmos de antes.
  Lint dos três módulos: limpo. `git diff --check`: limpo.

### BLOQUEIO da Fase 2 — auditoria da aba Site da Marca

Regra de parada §41 acionada. Fatos verificados no código:

- **`BRAND_SITE_UI_FILE`** = `modules/marca/site-sitemap-panel.tsx` (61 KB).
- **`BRAND_SITE_CONTRACT`** = `lib/marca/site-contracts.ts` —
  `BrandSiteWorkspaceSchema` com sitemaps, syncRuns, catalog, verifications,
  candidates, importBatches e events.
- **`BRAND_SITE_STORAGE`** = `lib/marca/site-store.ts` → **browser artifact
  store** (IndexedDB/localStorage), chave
  `minerador-pro:site-workspace:${actorUserId}:${brandId}`, com
  `persistenceMode` gravado sempre como `"local_fallback"`.
- **`BRAND_SITEMAP_STORAGE`** = o mesmo workspace de navegador. Não há tabela
  remota em uso.
- **`BRAND_SITE_READ_PATH`** = `loadBrandSiteWorkspace(actorUserId, brandId)` —
  leitura do navegador do próprio ator, indisponível no servidor.
- **`BRAND_SITE_SYNC_PATH`** = `POST /api/marca/site/sitemap/sync` →
  `crawlAuthorizedSitemap()` — **stateless**: baixa o sitemap ao vivo, devolve as
  URLs e **não persiste nada**.
- **`BRAND_SITE_EXISTING_REPOSITORY`** = **não existe**. `grep` por `brand_site_`
  em `lib/`, `app/`, `modules/` e `components/` retorna zero ocorrências.
- **`BRAND_SITE_EXISTING_API`** = `sitemap/test`, `sitemap/sync`, `page/verify`,
  `lists`, `import/keywords`, `import/keywords/preview` — todas sem persistência
  do catálogo.
- **`supabase/migrations/0004_brand_site_catalog.sql`** declara
  `brand_site_sitemaps`, `brand_site_catalog_entries`, `brand_site_sync_runs`,
  `brand_site_page_verifications`, `brand_site_keyword_candidates`,
  `brand_site_import_batches`, `brand_site_import_items` e `brand_site_events`,
  mas o cabeçalho diz **"PROPOSTA PARA APLICAÇÃO MANUAL. NÃO APLICADA PELO
  CODEX"** e o corpo referencia `listas_kgr`, renomeada pela 0036 para
  `minerador_keyword_lists` — não aplicaria como está.

**Conclusão:** a única fonte canônica remota do site é `marcas.site_url`. O
catálogo de URLs do sitemap só existe no navegador do usuário, por ator, o que
`AGENTS.md` §10 proíbe tratar como fonte canônica. Consumir sitemap no servidor
hoje exigiria nova coleta externa, vetada por `SITEMAP_EXTERNAL_FETCH_FROM_ARCHITECT = 0`.

Fase 2 **não foi iniciada** para a fonte site/sitemap. As demais fontes da Base
(SiloDNA, SiloPage, ArticleDNA, PublicationRecord, `marcas.silos_existentes`,
BrandDNA, workflow items) **são** canônicas e legíveis no servidor — o read-model
parcial é viável, mas depende de decisão do Planner Geral.

## Silo-first — Delta Etapa 0 concluído (SDD revisão 4) — 2026-09-02

```
PHASE_1_CORE          = PASS
PHASE_1_ETAPA_0_DELTA = PASS
PHASE_2               = NÃO INICIADA — regra de parada §30 acionada
```

- **Correção de defeito próprio:** a revisão 3 tinha um `reconciliationState` de
  oito valores que ainda misturava decisão (`confirmed_existing`), origem
  (`published_legacy`, `strategic_declared`) e lifecycle (`candidate`). A
  revisão 4 separa cinco eixos ortogonais — `observationState`, `decisionState`,
  `architecturalOrigin`, `ingestionOrigin`, `publicationState` — e os
  vocabulários de observação e decisão passaram a ter interseção vazia, travada
  por teste. Os quatro recortes da Base são derivados por `resolveBaseBucket`
  com precedência declarada e total, nunca lidos de um campo único.
- **Ausência continua ausência:** `PublishedStructureEvidenceSchema` recusa
  `site_only` com `publicationRef` e recusa `database_only` com `url` ou
  `sitemapRef`. O contrato impede fabricar o que não foi observado.
- **`StrategicDeclaration`:** contrato próprio, com `keywordDnaIds: []` como
  estado legítimo. Declaração estratégica entra na Base como `decisionState:
  "pending"` e `territoryRef: null` — não é território confirmado e não cria
  lista, SiloDNA, SiloPage, publicação, URL ou canonical.
- **Campos acrescentados à evidência:** `normalizedUrl`, `normalizedCanonical`,
  `observedAt` e `provenance { collectedBy, collectedAt, sourceRef }`. A
  deduplicação usa identidade normalizada, nunca substring.
- **Validação:** `test:arquiteto` 460 testes, 459 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript: 5 erros, os mesmos de antes do
  lote. Lint dos três módulos: limpo. `git diff --check`: limpo.
- **Rastreamento Git:** `lib/arquiteto/architecture-scenario.ts`,
  `lib/arquiteto/territory.ts`, `lib/arquiteto/territorial-base.ts` e os testes
  correspondentes estão **untracked** no repositório, apesar de já serem
  consumidos por `test:arquiteto`. Não são código consolidado até o usuário
  executar o Git.

## Silo-first — Fase 2A: working copy territorial e readiness — 2026-09-02

```
PHASE_2A = IMPLEMENTED (domínio + fiação de persistência)
UI = NÃO TOCADA · ArticleDNA/SiloDNA/SiloPage/graph = NÃO TOCADOS
NEW_DDL = 0 · NEW_MIGRATION = 0 · PROVIDER_CALLS = 0
```

- **Auditoria da membership atual:** os working items são linhas de
  `editorial_workflow_items` (`subject_type='keyword'`, `stage='architect'`,
  `state='received'`), lidas por `loadCanonicalArquitetoWorkspace` e gravadas por
  `PATCH /api/arquiteto/workspace` com `expectedLock`. O `AssignmentSchema`
  `.strict()` guardava `workingArticleId`, `clusterId`, `provisionalGroupId`,
  `siloId`/`silo_id`, `siloName`, `computedSlug`, `computedHierarquia`, `role`,
  `principalKeywordId`, `siloCandidate`, `articleKgrDecision`, `manualEdit` —
  e **nenhum** `territoryRef`. Membership paralela na UI: `masterList`,
  `provisionalGroups` e `siloWorkingCopies`, todas em React state.
- **Persistência classificada:** REMOTE + API_REAL (`editorial_workflow_items.payload`,
  jsonb, com lock por item). `architect-recovery.ts` é recuperação LOCAL e
  explicitamente não canônica. Como `payload` é jsonb, os dois campos novos são
  aditivos: **zero DDL, zero migration**.
- **Fonte canônica única:** `territoryRef` + `territoryAssignment` no payload da
  própria keyword. `TerritoryProjection.keywordRefs` é derivada em
  `deriveTerritorialWorkingView` e não existe no contrato persistido —
  há teste lendo `territory.ts` para garantir que não há como persistí-la.
- **Operações** em `lib/arquiteto/territory-working-copy.ts`: `planMembershipChange`
  (atribuir, desatribuir, mover, multi-keyword), `settleMembershipOperation`,
  `attachPendingOperation`, `deriveTerritorialWorkingView`,
  `resolveLegacyArticleReconciliation`, `listaIdIsNeverTerritory`. Split e merge
  seguem em `territory.ts`, com escolha humana obrigatória. Funções puras que
  devolvem PLANO; quem persiste é a rota canônica que já existia.
- **Gate de operação parcial:** um lote incompleto vira `MembershipOperation`
  `partial`, é anexado aos territórios participantes e bloqueia confirmação **e**
  formação de Article. A resposta declara `appliedKeywordIds` e
  `failedKeywordIds` — nenhuma autocorreção.
- **Readiness separada:** `resolveTerritoryConfirmationReadiness` passou a exigir
  também conteúdo — `TERRITORY_WITHOUT_CENTRAL_ENTITY`,
  `TERRITORY_WITHOUT_MACRO_INTENT`, `TERRITORY_WITHOUT_BOUNDARY` e
  `TERRITORY_NARRATIVE_UNRESOLVED`. Similaridade lexical não sustenta território:
  `continuity`/`brandAlignment` em `unknown` bloqueiam.
  `resolveArticleFormationReadiness` continua exigindo território `confirmed`.
- **`DEFERRED_EXTERNAL_EVIDENCE`:** a conferência contra o catálogo publicado da
  Marca ainda não existe em runtime. Territórios ancorados em Silo existente
  recebem o marcador de adiamento — que **não bloqueia** e **não é simulado**.
- **Legado preservado:** `lista_id` nunca vira território (guard + teste);
  ArticleDNA sem Silo vira `LEGACY_NEEDS_RECONCILIATION` sem inferir destino;
  âncoras publicadas continuam âncoras.
- **Ajuste declarado num teste da Fase 1:** "MANUAL_STRATEGIC com uma única
  keyword" usava narrativa vazia e passou a ser bloqueado pela readiness nova. A
  fixture ganhou narrativa resolvida — a intenção original (contagem não é
  autoridade) foi preservada, e o teste ganhou a asserção complementar de que o
  bloqueio vem da descrição ausente, não da quantidade.
- **Validação:** `test:arquiteto` 475 testes, 474 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 erros pré-existentes, 0 novos.
  Lint limpo nos três arquivos tocados. `git diff --check` limpo.
- **Hold externo:** `readBrandSiteSnapshot`, catálogo Site/Sitemap remoto e
  `publishedConfirmed` da Etapa 0 continuam fora. A A1 da Marca está APPLIED
  (materialização remota PASS); o que falta são A2, repositories, runtime real
  de sync e leitura remota — Fases 3 a 6 daquela frente.


## Fase 2A.1 — fechamento de persistência e autoridade territorial — 2026-09-02

- **Defeito próprio corrigido:** `territoryAssignment` era
  `KeywordTerritoryAssignmentSchema.omit({ keywordId, brandId })` e continuava
  carregando `territoryRef` dentro de si. Duas referências no mesmo payload,
  capazes de divergir, sem regra de desempate. O shape persistido agora é
  `KeywordTerritoryDecisionSchema` = `{ state, reason, source, decidedAt }`.
  `payload.territoryRef` é o único ponteiro de membership.
- **UNASSIGNED != UNADDRESSED aprovado e implementado** como projeção derivada:
  `resolveKeywordTerritoryState` lê o par (`territoryRef`, `territoryAssignment`)
  e devolve `assigned | explicit_unassigned | unaddressed | incoherent`.
  `projectKeywordTerritoryStates` recalcula os baldes a cada leitura — nenhum
  array é persistido. Estado incoerente é RECUSADO, nunca normalizado.
- **Autoridade remota do território — antes inexistente.** A auditoria provou que
  `subject_type = "territory"` não era lido nem escrito em lugar nenhum: a 2A
  tinha persistido a membership da keyword e deixado o objeto territorial sem
  dono. Resolvido sem DDL: um item de `editorial_workflow_items` por território,
  `subject_type='territory'`, `stage='architect'`, `subject_id=territoryRef`,
  `state` espelhando `lifecycleStatus`, `payload.territory` = TerritoryCandidate.
  A UNIQUE `(marca_id, subject_type, subject_id, stage)` que já existe passa a
  garantir um único registro por território por Brand.
- **Operação parcial:** vive em `payload.territory.pendingOperation`, no mesmo
  registro e sob o mesmo `lock_version`. Não é replicada nas keywords.
- **`territoryRef` passa a ser emitido pelo servidor.** Antes: `NOT_IMPLEMENTED`
  — `buildTerritoryRef` existia e nenhuma rota o chamava. Agora o store impõe
  `territoryRef` e `brandId` depois do draft, e a rota recusa um draft de criação
  que já traga `territoryRef`.
- **Retrocompatibilidade provada:** payload legado sem os dois campos parseia,
  resolve `unaddressed` e não é reescrito na leitura. `siloId`, `lista_id`,
  `clusterId` e `workingArticleId` não são convertidos em território.
- **Next.js:** `route.md` e `15-route-handlers.md` consultados. Route Handlers
  não são cacheados por padrão e `PATCH` nunca é cacheável; o `GET` já era
  dinâmico por ler `searchParams`. Nenhuma regressão de contrato.
- **Validação:** `test:arquiteto` 488 testes, 487 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 erros pré-existentes, 0 novos.
  Lint sem erros. `git diff --check` limpo. `NEW_DDL = 0`, `NEW_MIGRATION = 0`.

## Fase 2A.2 — gate de contrato do registro territorial remoto — 2026-09-02

- **`state` auditado:** o CHECK no banco é de COMPRIMENTO (1..80), não de
  vocabulário. `stage` é o único com enum fechado, e `architect` já está nele.
  A coluna já carrega vocabulários diferentes por tipo de sujeito: `radar`/
  `planner` guardam lifecycle de domínio (`imported`, `approved`, ...), e o
  item de keyword do Arquiteto guarda `received`. Espelhar `lifecycleStatus`
  segue o contrato estabelecido em vez de reinterpretá-lo.
  `CAN_STATE_DIRECTLY_MIRROR_TERRITORY_LIFECYCLE = YES`.
- **Consumers de `state` verificados um a um.** O único com vocabulário fechado
  é `allowed[item.state]` em `operational-flow.ts` (lookup indexado — chave
  ausente lançaria TypeError), e ele só recebe `RadarItem`, que nasce de
  `stage=radar`. Toda leitura da tabela é estreitada por stage ou
  subject_type; a única sem estreitamento é a `list()` de pipeline-repositories,
  que não tem chamador — e um teste impede que ganhe um.
- **`source_entity_id` CORRIGIDO.** A 2A.1 usava `existingSiloRef.siloId` com
  fallback para o ref. Duas descobertas derrubaram isso: (1) as RPCs de purga
  0046/0047 apagam itens de workflow por `source_entity_id = keyword.id::text`,
  e em 0047 esse DELETE NÃO filtra por `subject_type`; (2) `siloId` pode
  originar-se de `lista_id` (engine.ts), que é UUID cru — exatamente o formato
  que colide com aquele predicado. Agora é SEMPRE `territoryRef`, cujo prefixo
  torna a colisão estruturalmente impossível. NULL não era alternativa: a
  coluna é NOT NULL com CHECK de comprimento > 0.
- **Identidade duplicada sob invariante rígida:** `subject_id` e
  `payload.territory.territoryRef` guardam o mesmo valor. CREATE emite no
  servidor e grava nos dois; UPDATE toma a identidade da linha; READ recusa a
  divergência (`SUBJECT_ID_DOES_NOT_MATCH_PAYLOAD`) em vez de escolher um lado.
  Mesma disciplina para `marca_id` × `payload.territory.brandId`
  (`CROSS_BRAND_RECORD`), sem fallback.
- **Classificação honesta:** `TERRITORY_REMOTE_CODE_PATH = IMPLEMENTED`,
  `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN_UNTIL_USER_SMOKE`. O round-trip por
  JSON prova serialização, não persistência: não exercita RLS, CHECK, UNIQUE,
  o gatilho de `lock_version` nem o readback real. Dois testes que se chamavam
  "sobrevive ao reload/readback" foram renomeados, e um teste impede que este
  arquivo passe a falar com o banco ou a se declarar smoke.
- **Validação:** `test:arquiteto` 495 testes, 494 pass, 1 falha pré-existente.
  TypeScript 5 pré-existentes, 0 novos. Lint sem erros. `NEW_DDL = 0`,
  `NEW_MIGRATION = 0`, zero mutação remota executada.

## Fase 2B — formação de Article dentro de território confirmado — 2026-09-02

### Auditoria do modelo de Article (antes de tocar em código)

- **Working copy:** `ProvisionalArticleGroup` no domínio + `payload.workingArticleId`
  no item de workflow da keyword — este é REMOTO e canônico, gravado pela rota
  `PATCH /api/arquiteto/workspace`. `provisionalGroups`/`siloWorkingCopies` em
  React state NÃO são autoridade.
- **ArticleDNA canônico:** `editorial_artifact_versions`, `artifact_type =
  'article_dna'` (já no CHECK), payload jsonb, versionado e imutável, via
  `lib/server/arquiteto-persistence.ts`. Persistência REMOTE + API_REAL.
- **Campos:** articleId · brandId · principalKeywordId · secondaryKeywordIds
  (max 5) · narrativeReinforcementIds · keywordReferences (min 1, max 6, com
  role principal/secundaria/reforco_narrativo) · siloId · hierarchy ·
  suggestedSlug · canonical · mainIntent · publishedIdentityRef ·
  architectureStatus · humanPendingDecisions · kgrIdentity.
- **Reaproveitado sem reescrever:** `inspectArticleFormation`,
  `assertArticleFormation`, `MAX_SECONDARY_KEYWORDS`, `enforceAssignedKeywordLimit`,
  `resolveArticleFormationReadiness` (já existia da 2A) e o envelope de cenário.

### territoryRef no Article — não era blocker

`ArticleDNASchema` é `.strict()` e não tinha onde guardar o território. Mas o
artefato mora em `payload` jsonb com `artifact_type` já permitido: acrescentar um
campo OPCIONAL é aditivo, sem DDL e sem migration — o mesmo padrão já aprovado
para a membership da keyword. Ausência do campo significa
LEGACY_NEEDS_RECONCILIATION, nunca "sem território por decisão".

Para evitar ciclo de import (`territory.ts` já importa `contracts.ts`), o
primitivo de identidade foi extraído para `lib/arquiteto/territory-ref.ts`.
`territory.ts` reexporta tudo — nenhum consumidor existente mudou.

### O que a fase entregou

- `planArticleFormationForTerritory` — separa proposals · preserved · conflicts ·
  unallocatedKeywords · issues. Não muta persistência.
- `resolveArticleConfirmationReadiness` — SEPARADA da formação. FORMATION
  responde "podemos propor?"; CONFIRMATION responde "está resolvido a ponto de
  consolidar?". 11 bloqueadores, incluindo definição incompleta e operação
  territorial parcial.
- `confirmArticleStructure` — só `actor: "human"` fecha. IA, Lógica e SERP são
  recusadas por contrato (`ONLY_HUMAN_MAY_APPROVE`), não por convenção.
- Teto de 6 é TETO: um Article de 1 keyword é confirmável; nada completa a lista.
- Cobertura garantida: toda keyword endereçada está alocada OU listada em
  `unallocatedKeywords` com motivo — e `NOT_ADDRESSED` continua distinto de
  `EXPLICITLY_UNASSIGNED` até o fim do plano.

- **Validação:** `test:arquiteto` 517 testes, 516 pass, 1 falha pré-existente
  (asserção estática do Minerador). TypeScript 5 pré-existentes, 0 novos. Lint
  sem erros. `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`.
- **Territory remote smoke:** PENDING FUTURE INTEGRATION VALIDATION. Não bloqueou
  a 2B — o roteiro está em `smoke-territory-record-2a3.md`.

## Fase 2B.1 — fechamento de invariantes — 2026-09-02

### Correção do diff cross-level

O código já RETORNAVA `LEVEL_MISMATCH` antes de `UNIVERSE_HASH_MISMATCH` — a
precedência do resultado estava certa. O defeito era de ordem de AVALIAÇÃO:
`sameScenarioUniverse` era chamado antes do teste de nível, então um par
cross-level com universo ausente lançava exceção em vez de recusar por nível.
Agora o nível é decidido sem tocar no universo, e `universeMatch` no relatório
de uma recusa por nível é apenas informativo.

### Dois defeitos reais no teto de keywords

A auditoria do §5 encontrou o teto TOTAL correto (1 principal + 5 adicionais,
soma <= 6) mas a coerência de PAPÉIS quebrada:

- a mesma keyword em `secondaryKeywordIds` E `narrativeReinforcementIds` era
  ACEITA — o `Set` colapsava a duplicata e o teto era medido sobre o conjunto
  deduplicado, escondendo a incoerência;
- a principal repetida entre as secundárias também era ACEITA, porque o filtro
  `id !== principalKeywordId` a removia silenciosamente.

`ArticleDNASchema.superRefine` passou a exigir que os papéis não se repitam.

### territoryRef: leitura legada x consolidação nova

`ArticleDNASchema.territoryRef` continua OPCIONAL — obrigatoriedade global
quebraria a leitura de todo o histórico anterior à 2B. A exigência mora no gate
`planArticleDnaConsolidation`: todo ArticleDNA NOVO do fluxo Silo-first precisa
de território, brand compatível e todas as keywords dentro do mesmo território.
`NEW_SILO_FIRST_ARTICLE_WITHOUT_TERRITORY` é recusa explícita.

Território de versão consolidada é identidade: trocar exige
`TERRITORY_CHANGE_REQUIRES_SUCCESSOR`, nunca update in-place.

### Proteção unknown — defeito meu da 2B, corrigido

A 2B tratava "a principal não mudou" como decisão suficiente. Não é: descreve o
estado, não a decisão. `resolveUnknownProtectionState` resolve os quatro estados
do contrato — HUMAN_DECISION_REQUIRED, PROTECTION_CONFLICT, RESOLVED_PRESERVED e
STRUCTURAL_CHANGE_REQUIRES_SUCCESSOR — e exige um registro humano explícito
(ator, momento, motivo), seguindo o precedente do KGR do artigo em vez de um
booleano paralelo.

### Working membership x composição consolidada

No momento da consolidação, `payload.workingArticleId` e a composição gravada
precisam coincidir nos DOIS sentidos: nada da composição fora da working copy, e
nada da working copy fora da composição. Depois disso o ArticleDNA não acompanha
alteração silenciosa do workingArticleId — mudança real vira sucessora.

### Validação

- `test:arquiteto` 532 testes, 531 pass, 1 falha pré-existente do Minerador.
- Suítes mais amplas rodadas por causa da mudança em `contracts.ts`:
  `test:editorial` 20/16/4 e `test:authz` 25/23/2 são IDÊNTICAS com o
  `contracts.ts` revertido para HEAD; `test:operational` 50/41/9 é IDÊNTICA com e
  sem a checagem de papéis. Todas pré-existentes. `test:redator` 3/3/0.
- TypeScript 5 pré-existentes, 0 novos. Lint sem erros. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`.

### Classificação honesta da persistência

`ARTICLE_REMOTE_PERSISTENCE_EXISTING_PATH = REAL` (editorial_artifact_versions).
`NEW_TERRITORY_REF_PERSISTENCE_PATH = IMPLEMENTED_BY_PAYLOAD_CONTRACT` — nenhum
Article territorial novo foi persistido remotamente ainda. Não é smoke validado.

## Fase 2C.2 — contratos e invariantes de consolidacao de Silo — 2026-09-02

### territoryRef nos contratos de Silo

`SiloDNASchema.territoryRef` e `SiloPageSchema.territoryRef` sao OPCIONAIS, pelo
mesmo motivo do ArticleDNA: todo Silo anterior a 2C nao tem territorio, e
obrigatoriedade no schema base quebraria a leitura do historico. A exigencia
vive no gate de NOVA consolidacao, que recusa territoryRef ausente e recusa
divergencia entre SiloDNA, SiloPage e Territory.

### Tres defeitos da auditoria 2C.0, corrigidos no dominio

O `SiloDNASchema.superRefine` aceita hoje — e continua aceitando, por
compatibilidade — Silo `formed` sem Pilar, `formed` com zero Articles e o mesmo
Article como Pilar e Suporte. `planTerritorialSiloComposition` recusa os tres na
consolidacao Silo-first, junto com Suporte duplicado, referencia incoerente,
Article de outro territorio e Article sem versao consolidada de ArticleDNA.

### Cobertura e exclusao explicita

Todo Article termina em EXATAMENTE um de `pillar`, `support` ou
`explicitly_excluded`. Article que nao aparece em nenhum dos tres e
`ARTICLE_COVERAGE_GAP`, nao silencio. A exclusao exige ator, momento e motivo.
`explicitly_excluded` NAO e papel de ArticleDNA — e decisao da consolidacao; um
teste varre contracts.ts e prova que o termo nao existe la.

### READY_FOR_SILO_CONSOLIDATION

`resolveSiloConsolidationReadiness` — separada de confirmacao de Territorio, de
formacao de Article, de confirmacao de Article e da aprovacao do Silo. 16
bloqueadores. Evidencia de estrutura publicada que depende da Etapa 0 da Marca
vira `DEFERRED_EXTERNAL_EVIDENCE`: adiada, nao falha e nao fabricada.

`confirmSiloConsolidation` so aceita `actor: human`, e exige que a decisao
descreva a MESMA arquitetura que sera consolidada — aprovar uma composicao e
gravar outra e o defeito que esse gate impede.

### SiloWorkingCopy — autoridade NONE

`SILO_WORKING_COPY_AUTHORITY = NONE`. `formSiloWorkingCopies` e
`chooseSiloWorkingCopyPillar` sao funcoes puras; nenhuma rota persiste o
resultado e `siloWorkingCopies` nao existe no codigo. Reload perde Pilar,
Suportes e exclusoes. React state NAO e canonico.

`editorial_workflow_items` comporta a persistencia aditivamente
(`subject_type=silo_working_copy`), sem DDL — contrato PROPOSTO, nao
implementado, conforme o gate.

### Validacao

- `test:arquiteto` 562 testes, 561 pass, 1 falha pre-existente do Minerador.
- `contracts.ts` mudou: rodadas as suites consumidoras. `test:editorial` 20/16/4,
  `test:operational` 50/41/9, `test:authz` 25/23/2, `test:redator` 3/3/0 —
  numeros IDENTICOS ao baseline da 2B.1. Nenhuma regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint sem erros nem avisos.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`, `RPC_INTEGRATED = NO`.

### Estado de validacao remota — nada declarado E2E

- 2C.1 materializacao remota: PASS (probe de assinatura/grants).
- 2C.1 behavioral smoke: PENDING.
- Territory remote smoke: PENDING.
- Article territorial remote smoke: PENDING.
- Marca Site/Sitemap: HOLD.

## Fase 2C.3 — working copy remota de Silo + Pilar automatico removido — 2026-09-02

### Autoridade

`SILO_WORKING_COPY_AUTHORITY = REMOTE`. Um item de `editorial_workflow_items`
por working copy: `subject_type=silo_working_copy`, `stage=architect`,
`subject_id=source_entity_id=silo-working-copy:<uuid>`, `article_id` nulo,
`state` espelhando `formationStatus`. Zero DDL, zero migration, zero indice novo.

Identidade propria porque `SiloWorkingCopy.id` nao serve: para copias novas e
`working-silo:<n>` derivado da POSICAO no laco de formacao, e para existentes e
o `siloId`, que pode ser UUID cru vindo de `lista_id`. O prefixo tambem protege
`source_entity_id` do predicado de purga da 0047.

React state passa a ser projecao. O GET do workspace devolve `siloWorkingCopies`
do remoto; recuperacao local segue sendo recuperacao e nao e lida pelo store.

### Pilar automatico

Dois caminhos escolhiam Pilar sozinhos:

- `silo-consolidation.ts:373` usava `selectedIds[0]` — Pilar por ordem do array,
  numa proposta de IA. CORRIGIDO: a copia nova nasce sem Pilar e sem Suportes.
- `silo-formation.ts` `buildCopy` usa `scores[0]?.articleId` — Pilar pelo maior
  `pillarScore`. NAO alterado: e a formacao legada em memoria, sem autoridade.

A imunidade e contratual: `pillarSuggestionArticleId` e sugestao,
`pillarSelection` e decisao humana com ator, momento, motivo e a composicao
sobre a qual se decidiu. A consolidacao le a selecao. Decisao de ator nao-humano
e decisao obsoleta sao recusadas.

### Pos-consolidacao

Territorio `consolidated` recusa escrita com `WORKING_COPY_ALREADY_CONSUMED`;
`rejected`/`superseded`/`archived` recusam com `TERRITORY_NOT_EDITABLE`. A copia
vira historico pre-consolidacao, imutavel.

### Validacao

- `test:arquiteto` 592 testes, 591 pass, 1 falha pre-existente do Minerador.
- Suites consumidoras: `test:editorial` 20/16/4, `test:operational` 50/41/9,
  `test:authz` 25/23/2, `test:redator` 3/3/0 — baseline identico as rodadas
  anteriores. Nenhuma regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- Next.js: `route.md` e `15-route-handlers.md` consultados antes de alterar a
  rota. PATCH nao e cacheavel; o GET ja era dinamico por ler searchParams.

### Estado de validacao remota

- 2C.1 materializacao remota: PASS · 2C.1 behavioral smoke: PENDING
- 2C.2 dominio: CLOSED_FOR_DEVELOPMENT
- Territory remote smoke: PENDING · Article territorial remote smoke: PENDING
- Marca Site/Sitemap: HOLD
- RPC 2C.1 NAO integrada: nenhum arquivo desta fase a referencia (teste prova).

## Fase 2C.3A — identidade derivada e idempotencia da working copy — 2026-09-02

- **Defeito da 2C.3 corrigido:** ref aleatorio nao dava idempotencia logica.
  Agora `workingCopyRef = silo-working-copy:<territoryRef>`, deterministico e
  server-side, para que duas criacoes do mesmo territorio colidam na UNIQUE
  `editorial_workflow_items_subject_stage_unique` que ja existe.
- **Limites auditados:** `subject_id` e `source_entity_id` sao `text` com CHECK
  apenas de `> 0`, sem maximo. O ref tem 64 caracteres. Nada truncado.
- **Quatro lugares de identidade** precisam concordar na leitura; divergencia da
  derivacao e `REF_NOT_DERIVED_FROM_TERRITORY`.
- **Create idempotente:** SELECT antes do INSERT, sem sobrescrever; corrida vira
  releitura e `idempotentReplay`. Somente SQLSTATE 23505 com o nome da constraint
  canonica vira replay — qualquer outro erro propaga.
- **Validacao:** `test:arquiteto` 604 testes, 603 pass, 1 falha pre-existente.
  12 testes novos de identidade e idempotencia (42 no arquivo). TypeScript 5
  pre-existentes, 0 novos. Lint limpo. `NEW_DDL = 0`, `NEW_MIGRATION = 0`.

## Fase 2C.4.2 — writers transacionais e proveniencia da working copy — 2026-09-02

### Proveniencia no SiloDNA

`workingCopyRef` + `workingCopyLockVersion`, aditivos e OPCIONAIS. Legado sem os
dois continua parseando; o par pela metade e RECUSADO por superRefine — meia
proveniencia nao diz de qual versao da working copy o Silo veio, descreve a
metade que sobrou. NAO foram para a SiloPage: ela ja referencia o SiloDNA por
`siloDnaRef`, e duplicar criaria dois lugares para divergir.

### Migration

`20260902150000_silo_working_copy_transactional_writers.sql` — DUAS funcoes,
`STORAGE_SCHEMA_DDL = 0`. As historicas `20260826225154` e `20260902140000` nao
foram tocadas.

- `persist_silo_working_copy_atomic` — writer canonico da WC, create e update.
  Trava o Territorio, prova editabilidade NA MESMA TRANSACAO, trava a WC.
  Create nunca vira update: mesmo estado material devolve replay sem escrever;
  estado diferente e `WORKING_COPY_ALREADY_EXISTS`.
- `persist_silo_from_working_copy_atomic` — ENTRYPOINT CANONICO. Trava
  Territorio, deriva o workingCopyRef, trava a WC, valida snapshot e
  proveniencia, e COMPOE a 2C.1 sem copiar seu corpo.

Ordem global de locks: Territory -> SiloWorkingCopy -> advisory -> artifacts.
Nenhum writer canonico pega a WC antes do Territorio.

A consolidacao NAO fencea a working copy: nao muda state, nao incrementa lock,
nao grava `consumed`. A protecao pos-consolidacao vem da RPC B, que trava o
Territorio, ve `consolidated` e recusa.

### Honestidade sobre o que foi provado

Sem Postgres neste ambiente, as regras foram implementadas TAMBEM como espelho
de dominio (`lib/arquiteto/silo-consolidation-provenance.ts`) e testadas
COMPORTAMENTALMENTE em TypeScript: stale working copy, mismatch de ref, mismatch
de lock, replay independente do expectedLock, create replay x conflito, ordem de
locks. As asserções sobre o arquivo SQL sao ESTATICAS e estao rotuladas como
tais no proprio teste: provam que o SQL foi escrito conforme o desenho, NAO que
o PostgreSQL se comporta assim. Isso depende de smoke, ainda pendente.

### Validacao

- `test:arquiteto` 622 testes, 621 pass, 1 falha pre-existente do Minerador.
- `contracts.ts` mudou: `test:editorial` 20/16/4, `test:operational` 50/41/9,
  `test:authz` 25/23/2, `test:redator` 3/3/0 — baseline identico. Zero regressao.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `REMOTE_MUTATIONS = 0`, `SQL_EXECUTED = 0`.

### O que ainda NAO esta resolvido no runtime

`OLD_DIRECT_WC_WRITER_STILL_PRESENT = YES`. `updateSiloWorkingCopy` e
`createSiloWorkingCopy` continuam escrevendo pelo store, em transacoes
separadas. As duas corridas seguem abertas no runtime ate a migracao completa
dos callers. `RUNTIME_RACES_FULLY_ELIMINATED = NO`.

## Fase 2C.4 funcional — callers migrados para as RPCs — 2026-09-02

### Writers canonicos

`createSiloWorkingCopy` e `updateSiloWorkingCopy` passam por
`persist_silo_working_copy_atomic`. O writer PostgREST antigo foi REMOVIDO, nao
desativado: `readTerritoryGuard`, `assertWritable`, `isCanonicalUniqueViolation`,
`findByRef` e o INSERT direto sairam do arquivo. O store nao tem mais nenhuma
escrita PostgREST — so leitura.

Consolidacao entra por `POST /api/arquiteto/silo-consolidation` →
`persist_silo_from_working_copy_atomic`. A 2C.1 e a primitiva do par nao sao
chamadas pelo caminho canonico (teste 25 prova nos dois arquivos).

### Pilar automatico removido

`silo-formation.ts` `buildCopy` nao elege mais Pilar: `scores[0]?.articleId`
virou `null`. A consequencia tambem foi corrigida — `supportArticleIds` nasce
VAZIO e nenhum `articleReferences` recebe papel estrutural. Antes, marcar todos
como `support` era a outra metade do mesmo defeito: presumia a estrutura porque
um deles tinha sido eleito automaticamente.

`pillarScores` continua produzindo candidatos ordenados e justificados — e o que
a heuristica tem direito de fazer. `siloWorkingCopyIssues` passou a dizer que a
pendencia e decisao humana.

### Erros preservados

14 codigos de dominio (`STALE_WORKING_COPY`, `WORKING_COPY_ALREADY_CONSUMED`,
`PROVENANCE_MISMATCH`, ...) sao extraidos da mensagem da RPC e mapeados
individualmente. Erro sem codigo propaga como falha real. Nada colapsa em
`PERSISTENCE_FAILED`.

### Estabilidade do envelope — risco tratado

`createVersionEnvelope` gera `versionId` e `createdAt` novos a cada invocacao.
Se o adapter fabricasse o envelope, um retry produziria outra identidade e o
replay idempotente nao reconheceria a operacao. Por isso o adapter e a rota
RECEBEM os envelopes prontos e os repassam sem reconstruir — provado por teste
nos dois arquivos. Repetir a operacao significa repetir o mesmo envelope.

### Validacao

- `test:arquiteto` 658 testes, 657 pass, 1 falha pre-existente do Minerador.
- 36 testes novos de migracao de callers; 5 testes da 2C.3/2C.3A reapontados
  para o caminho canonico novo (fixavam a implementacao que o gate mandou remover);
  5 testes de formacao/consolidacao ajustados porque fixavam o Pilar automatico.
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `PROVIDER_CALLS = 0`, `REMOTE_MUTATIONS = 0`.
- Next.js: `route.md` e `15-route-handlers.md` consultados antes da rota nova.

### Estado de validacao remota

- 2C.4.2 materializacao remota: PASS · behavioral smoke: PENDING
- Territory remote smoke: PENDING · Article territorial remote smoke: PENDING
- Marca Site/Sitemap: HOLD
- LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY: RESOLVIDO

## Fase 2C.4.6 — binding semantico server-side + bypass manual fechado — 2026-09-02

### O buraco que o gate 2C.4.5 encontrou

O adapter validava APENAS proveniencia: `workingCopyRef` e `workingCopyLockVersion`.
Os dois sao legiveis pelo GET do workspace, entao qualquer chamador com esses
valores podia enviar OUTRO Pilar, outros Suportes ou artigos excluidos de volta
como Suporte, e a consolidacao acontecia. Readiness e decisao humana nao rodavam
no servidor.

### O que passou a existir

`lib/arquiteto/silo-dna-binding.ts` — dominio puro. DERIVA a expectativa da
decisao ja registrada e compara; nao recalcula arquitetura, nao usa IA, nao
escolhe Pilar e nao corrige o envelope recebido.

O adapter agora carrega, do REMOTO: o Territorio canonico com todos os guards, a
working copy INTEIRA parseada pelo contrato, e os ArticleDNA versionados pelas
referencias que a working copy registrou. Sobre esse snapshot roda
`resolveSiloConsolidationReadiness` e `confirmSiloConsolidation` — que existiam
desde a 2C.2 e nunca tinham sido ligados.

Ordem dos gates, toda ANTES da RPC A: territorio → working copy → versoes de
ArticleDNA → decisao de Pilar → readiness → confirmacao humana → binding do
SiloDNA → binding da SiloPage → escalonamento de status.

### O que e comparado, e o que NAO e

Comparado: brandId, territoryRef, workingCopyRef, workingCopyLockVersion, ancora
de Silo existente, Pilar, Suportes (por conjunto), cobertura completa,
referencias versionadas com hash, papeis, articleRoles.

NAO comparado: centralEntity, objective, boundary textual, dominantIntent. A
working copy nao decide esses campos; exigir igualdade neles seria inventar uma
autoridade que ela nao tem.

### Status

`SiloDNA approved` exige decisao humana de consolidacao confirmada.
`SiloPage approved` e FAIL-CLOSED: `siloPageApprovalIssues` existe em
`operational-flow.ts`, mas exige eventos de status de uma versao ja persistida —
nao serve como gate desta rota. `SILO_PAGE_APPROVAL_SERVER_GATE = MISSING`.

### Rotas manuais

`/api/arquiteto/silos` = LEGACY_MANUAL_STRATEGIC_DRAFT_PATH. So produz rascunho.

`/api/arquiteto/silo-pair` = LEGACY_DRAFT_ONLY. Aceitava `approved` e
materializava par final sem Territorio, working copy, Pilar humano nem
proveniencia. A recusa foi posta em DOIS lugares — no route handler e no proprio
helper `persistArquitetoSiloPair` — porque confiar so no guard da rota deixaria
um import futuro reabrir a porta lateral.

### Validacao

- `test:arquiteto` 688 testes, 687 pass, 1 falha pre-existente do Minerador.
- 30 testes novos de binding (comportamentais, no dominio) + 5 da rodada anterior
  reapontados: eles fixavam o adapter fraco.
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- Next.js: `15-route-handlers.md` consultado antes de alterar as rotas.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `REMOTE_MUTATIONS = 0`, `PROVIDER_CALLS = 0`.

## Fase 2C.4.6A — binding Territory -> SiloDNA — 2026-09-02

### Correcao conceitual aceita

Nao usar a working copy como autoridade de `centralEntity`, `macroIntent` e
fronteira estava certo. Concluir dai que sao LIVRES estava errado: no Silo-first
eles pertencem ao TERRITORIO confirmado, que o SiloDNA consolida.

### Mapa de equivalencia REAL

```
Territory.centralEntity      -> SiloDNA.centralEntity     (string, direta)
Territory.macroIntent        -> SiloDNA.dominantIntent    (string, direta)
Territory.boundary.includes  -> SiloDNA.includedTopics    (conjunto)
Territory.boundary.excludes  -> SiloDNA.excludedTopics    (conjunto)
```

SEM equivalencia canonica, portanto NAO comparados:

- `SiloDNA.boundary` e prosa livre; `Territory.boundary` e o par includes/excludes.
- `Territory.narrative` (statement, continuity, brandAlignment, rationale) nao tem
  campo correspondente no SiloDNA. `narrativeOrder` e ordem de artigos, nao
  narrativa territorial — igualar os dois seria inventar equivalencia.

### Ordem dos gates

O gate territorial roda ANTES do de composicao, e os dois antes da RPC A. Um
SiloDNA que traz entidade induzida pelos ArticleDNAs e recusado com
`TERRITORY_STRUCTURE_MISMATCH` mesmo com proveniencia e composicao impecaveis.
Mudanca real desses campos volta a revisao territorial, nao consolida.

### Validacao

- `test:arquiteto` 699 testes, 698 pass, 1 falha pre-existente do Minerador.
- 11 testes novos de binding territorial (41 no arquivo).
- `test:editorial` 20/16/4, `test:operational` 50/41/9, `test:authz` 25/23/2,
  `test:redator` 3/3/0 — baseline identico. Zero regressao nova.
- TypeScript 5 pre-existentes, 0 novos. Lint limpo. `git diff --check` limpo.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0`, `REMOTE_MUTATIONS = 0`, `PROVIDER_CALLS = 0`.

### Fechamento da Fase 2C

`SILOPAGE_APPROVAL_SERVER_GATE = MISSING`, `approved` fail-closed.
`FULL_PHASE_2C_COMPLETION_BLOCKER = YES` ate existir aprovacao propria da SiloPage.
