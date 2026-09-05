# Backlog — Minerador

## Aplicabilidade do KGR na planilha e em lote — 2026-09-03

- [x] Mostrar na coluna KGR o score técnico e o seletor da decisão humana de
  aplicabilidade, reutilizando a ação `kgr` da Revisão Humana.
- [x] Oferecer a decisão de aplicabilidade em lote na barra inferior, ao lado
  do Status, com persistência por keyword, readback e resumo do que mudou.
- [x] Revisar a spec (seção 22) e os testes que fixavam a tabela como
  informativa para KGR.
- [x] Oferecer `Concluir revisão` em lote na barra inferior, antes do Status,
  com o contrato da conclusão individual e sem transformar a revisão em gate.
- [ ] Decidir explicitamente se a mudança de status para `aprovado` deve
  exigir revisão concluída; hoje `REVIEW_REQUIRED_FOR_APPROVAL = NO` (adendo de
  2026-08-29) e nenhum gate foi restaurado.
- [ ] Validar manualmente na UI com marca real: altura das linhas com o
  seletor, seleção em lote grande e comportamento com revisão em edição aberta.

## Google Ads — diagnóstico OAuth e cache de token — 2026-09-03

- [ ] Capturar `error` e `error_description` do endpoint de token em
  `lib/google/ads/auth.ts` para o aviso do Minerador informar `invalid_grant`
  em vez da mensagem genérica de autorização.
- [ ] Corrigir o cache de access token, que usa o objeto de configuração como
  chave e nunca reaproveita o token entre requisições do resolver canônico.
- [ ] Conferir no Google Cloud se a tela de consentimento OAuth está em modo
  Testing; se estiver, publicar para evitar expiração do refresh token em 7 dias.

## Consolidação canônica da infraestrutura — 2026-08-25

- [x] Registrar DataForSEO, DeepSeek, Google Cloud, YouTube e Telegram como
  infraestrutura compartilhada, sem provider ou quota por módulo.
- [x] Registrar a governança Plataforma → Agência → Marca e o tenant
  `brandId = public.marcas.id`.
- [x] Registrar `READY_FOR_RADAR_DEVELOPMENT = YES` e o consumo de SERP
  compartilhada pelo Radar.
- [ ] Manter separado o gate de operação real, persistência/readback e o gate
  de ausência do provider SERP legado; não restaurar fallback.

> Entradas posteriores abaixo preservam o backlog de cada fase. Quando uma
> entrada anterior à consolidação menciona Serper, OpenRouter ou provider por
> módulo, ela é histórica/supersedida pela seção acima e não é autorização de
> runtime, fallback ou remoção de dados.

## Google Ads — rotação OAuth e resolver canônico — 2026-08-24

- [x] Separar configuração estática server-side do OAuth Refresh Token
  operacional no Secret Store.
- [x] Fazer Discovery, Metrics e health check usarem o resolver canônico sem
  fallback automático para ENV.
- [x] Manter a UI Admin limitada à rotação do refresh token, com Connection
  `pending` e health check explícito após a troca.
- [x] Cobrir criação de nova referência, preservação da referência anterior
  quando o ponteiro falha, ausência de exposição do segredo e readback seguro.
- [ ] Executar rotação, health check e smoke autenticado reais após configurar
  a Connection; nenhuma chamada paga foi executada nesta implementação.

## R5 Semantic Reviewer — leitura independente e gate de valor semântico — 2026-08-21

- [x] Registrar na spec permanente do Minerador que a leitura semântica
  independente precede a comparação com a hipótese da Lógica.
- [x] Fazer a keyword original ser o objeto primário da Phase 1 e separar a
  hipótese lógica da interpretação independente; disponibilizar `rawKeyword` nas
  três fases sem repetir o snapshot semântico completo.
- [x] Aplicar gate determinístico de no-op e de evidência de baixa qualidade antes
  de expandir divergências para o contrato R6/R6.1; preservar ambiguidade legítima
  e impedir BOFU especulativo baseado apenas em técnica/produto.
- [x] Reforçar Phase 2/3 para usar métricas somente como evidência relacionada,
  sem transformar Volume, Resultado, KGR ou KD em proxy semântico.
- [x] Expor telemetria interna de valor por `executionRequestId`, sem migration,
  schema persistido novo ou ruído técnico no usuário final; manter budgets
  `1100/1100/600` e as três chamadas existentes.
- [x] Cobrir no-op, BOFU especulativo, BOFU local explícito, MOFU comparativo,
  ambiguidade + TOFU e resumo de revisão sem correções.
- [ ] Executar smoke autenticado real e confirmar, com resposta atual do provider,
  a qualidade semântica, uso, persistência, readback e a preservação das métricas.

`R5_INDEPENDENT_READING_IMPLEMENTED = YES`;
`R5_SEMANTIC_QUALITY_SMOKE = PENDING`.

## R5/R6 — auditoria vertical de execução e separação de estados — 2026-08-21

- [x] Rastrear no código a origem da linha `Não informado → Não informado` e
  confirmar que ela vinha do adaptador R6 de campos estratégicos desconhecidos,
  não de uma nova heurística R5.
- [x] Separar `DECISÕES PENDENTES` de `CORREÇÕES PROPOSTAS`, preservando
  `Confirmar desconhecido`, `Editar`, o gate humano e o readback existentes.
- [x] Manter concordâncias compactadas/recolhidas e adicionar regressão para a
  distinção visual entre divergência real e campo sem leitura consolidada.
- [ ] Repetir smoke autenticado com `executionRequestId`, `unhas em acrilico` e
  uma keyword com divergência lexical concreta; conferir payloads das fases,
  telemetria Value Gate, `ai_review` persistido e readback.

`EXECUTION_AUDITED = STATIC_CODE_TRACE_ONLY`;
`NO_OP_ORIGIN = R6_STRATEGIC_UNKNOWN_ROW_MAPPING`;
`READY_FOR_NEXT_REAL_SMOKE = YES`.

## Histórico — Fase 3 — preflight e runbook para homologação real DeepSeek — 2026-08-19

- [x] Criar o preflight remoto read-only com result set único, sem secrets,
  TEMP, DDL ou DML.
- [x] Confirmar a fundação remota, capability `ai_generation` com
  `unit_name = request`, Secret Store/ACL e Usage sem modificar o estado.
- [x] Registrar o mecanismo real de Connection, secret, health, R5 e Usage no
  [runbook da Fase 3](../compartilhado/runbook-homologacao-deepseek-fase-3-2026-08-19.md).
- [x] Implementar a configuração administrativa local DeepSeek: API Key
  password, endpoint/modelo canônicos, writer server-side, Secret Store,
  Connection idempotente e readback sanitizado.
- [ ] Resolver o provider DeepSeek ausente e a Connection OpenRouter ativa em
  etapa remota/autorizada separada.
- [ ] Executar manualmente a configuração DeepSeek pela UI e confirmar o
  readback remoto, sem duplicar provider/Connection.
- [ ] Executar health check real, smoke R5 autenticado e readback de Usage;
  somente depois avaliar homologação.

`DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED`; `DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN`.

## R5 DeepSeek Oficial — contrato de divergências e non-thinking — 2026-08-19

- [x] Auditar os `max_tokens` reais enviados pelas três fases: `700/700/600`.
- [x] Forçar as três fases a enviar `thinking.type = disabled`, sem alterar o
  default global da Connection ou outros módulos.
- [x] Alinhar o contrato da Phase 1: toda divergência exige
  `evidenceUsed: string[]` não vazio, com exemplo JSON explícito e somente
  evidências lógicas.
- [x] Adicionar diagnóstico sanitizado por issue Zod (`path`, `code`,
  `expected`, tipo `received`) sem persistir conteúdo do modelo.
- [x] Expor no diagnóstico sanitizado o budget solicitado, modo efetivo,
  configuração explícita e `reasoningEffort` quando disponível.
- [x] Preservar JSON mode, `JSON.parse`, Zod, truncamento, `ai_review` anterior,
  execução sequencial e zero fallback OpenRouter.
- [ ] Executar novo smoke autenticado/pago manual com `unhas de gel decoradas`,
  confirmando `finishReason = stop`, `reasoning = false`, contrato Phase 1,
  conteúdo, usage e readback.

## Histórico — Fase 2 — cutover local OpenRouter → DeepSeek — 2026-08-19

- [x] Implementar a camada compartilhada oficial DeepSeek com Connection,
  segredo server-side, modelo allowlisted, JSON mode e validação local.
- [x] Migrar R5 e consumidores estruturados sem fallback, roteamento paralelo
  ou troca automática de provider; preservar Usage e estado anterior em falha.
- [x] Retirar OpenRouter de resolver ativo, rotas ENV, Admin/UI e health check;
  manter somente histórico e fixtures/guards explícitos.
- [x] Cobrir ausência de Connection, provider divergente, JSON vazio,
  truncamento, schema inválido, thinking por operação e zero requisições
  OpenRouter em fixtures.
- [ ] Confirmar remotamente a Connection DeepSeek, secret, capability,
  autorização e modelo permitido.
- [ ] Executar health check e smoke autenticado/pago manual, com readback de
  `ai_review` e Usage; somente depois avaliar homologação real.

`DEEPSEEK_LOCAL_CUTOVER = PASS`; `DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN`.

Itens posteriores que citam OpenRouter pertencem a backlog/histórico de fases
anteriores e não reabrem provider, fallback ou smoke real nesta fase.

## Histórico — Fase 1: adendo e auditoria OpenRouter → DeepSeek — 2026-08-19

- [x] Registrar DeepSeek Official API como destino canônico da primeira fase,
  em Connection `platform`, com modelo explícito e sem fallback.
- [x] Mapear resolver ENV, Connection/Secret Store, capability, binding,
  Usage, consumidores, Admin/UI, testes, fixtures e documentação OpenRouter.
- [x] Confirmar localmente que o schema `integration_*` é genérico e não exige
  migration específica para representar DeepSeek.
- [x] Preservar Usage, Connections e referências históricas OpenRouter; não
  alterar runtime, schema, dados ou provider nesta etapa.
- [ ] Confirmar catálogo remoto e Connection DeepSeek em auditoria read-only.
- [ ] Implementar o adapter/resolver DeepSeek somente após aprovação da fase
  seguinte, migrando R5, rotas legadas, Arquiteto e Redator sem fallback.
- [ ] Executar smoke autenticado manual explícito e provar zero requisições
  OpenRouter antes de qualquer limpeza histórica.

## Integridade de reprocessamento e freshness do Processador — 2026-08-19

- [x] Separar a identidade do motor lógico (`logicProcessorVersion`) da
  versão do schema do DNA, sem migration.
- [x] Reprocessar keywords novas e históricas somente após seleção explícita,
  com persistência, readback canônico e projeção compartilhada na tabela e no
  KeywordDNA.
- [x] Impedir que snapshots da Descoberta, estado React ou projeções locais
  promovam lógica, Volume, Resultados ou KGR como etapas validadas.
- [x] Recalcular/projetar KGR somente com Volume e Resultado atuais válidos;
  preservar zero e `null` de KD sem conversão para zero.
- [ ] Executar smoke autenticado do Processador com uma keyword nova e uma
  histórica, revalidar Volume/Resultados e conferir visualmente a consistência
  tabela → KeywordDNA após reload.


## Histórico — Minerador R5.2 pré-cutover — 2026-08-19

- [x] Remover `provider.require_parameters = true` do request das três fases;
  o routing normal do OpenRouter volta a operar sem fixar provider ou modelo.
- [x] Preservar `session_id`, reasoning best-effort, `json_schema`/`json_object`,
  validação server-side e budgets `700/700/600`.
- [x] Diagnosticar HTTP 4xx com `error.code`, `error.type`, mensagem sanitizada
  e categoria operacional quando reconhecível, sem credencial, prompt ou
  headers.
- [x] Confirmar localmente o request sem filtro e o diagnóstico de 404
  pré-provider; contagem de endpoints elegíveis não está disponível sem
  consulta adicional do OpenRouter.
- [ ] Executar smoke autenticado com `campanha de trafego pago`; o primeiro
  gate esperado é HTTP 200, provider/modelo/request ID resolvidos e Fase 1
  iniciada.

- [x] Remover `reviewStatus` dos schemas intermediários da Fase 1 e Fase 2; manter o campo somente na síntese/final `ai_review`.
- [x] Tornar os schemas por fase estritos e manter o prompt de cada fase limitado às suas próprias chaves.
- [x] Resolver reasoning pelo metadata do modelo: `enabled:false` quando opcional e menor effort suportado quando obrigatório, sem regra por slug.
- [x] Enviar `session_id` estável nas três chamadas da mesma execução sem impor `provider.require_parameters`.
- [x] Expor usage sanitizado por fase: prompt, completion, total, reasoning, custo, limite e finish reason.
- [x] Validar localmente sem chamada paga, provider fixo, fallback, migration ou alteração do schema persistido.
- [ ] Executar smoke autenticado com `campanha de trafego pago` e depois `marketing digital`; confirmar schema, routing, tokens, persistência e readback.

## Minerador R5.2 — revisão IA em três fases — 2026-08-19

- [x] Separar a revisão por keyword em semântica, evidências normalizadas e síntese final, sem reenviar o universo bruto da keyword em cada fase.
- [x] Manter Google Ads, DataForSEO, KGR e o KeywordDNA lógico como fatos de entrada; a IA não altera números nem substitui a intenção canônica.
- [x] Expandir a síntese no servidor para o contrato `ai_review`/`fieldReviews[]` existente e persistir somente após as três fases e a validação final.
- [x] Integrar o progresso NDJSON à bulk bar existente com `1/3`, `2/3` e `3/3`, registrar usage/diagnóstico por chamada e respeitar a capability de reasoning do modelo selecionado sem fallback.
- [x] Validar localmente sem chamadas pagas, migration ou mudança de schema/provider.
- [ ] Executar smoke autenticado real com `campanha de trafego pago`; confirmar três chamadas OpenRouter, usage por fase, readback e invariância das métricas.
- [ ] Corrigir separadamente o diagnóstico `DATAFORSEO_PARTIAL_RESULTS` para distinguir allintitle de Keyword Overview por suboperação.

## Concluído localmente — R5 OpenRouter: diagnóstico real de truncamento — 2026-08-19

- [x] Preservar no diagnóstico sanitizado modelo solicitado/retornado,
  `finishReason`, `nativeFinishReason`, presença/tamanho de conteúdo, usage,
  reasoning tokens, formato resolvido e metadados de provider/roteamento sem
  prompt, reasoning, headers ou credencial.
- [x] Diferenciar o parâmetro realmente enviado: `max_tokens` ou
  `max_completion_tokens`, incluindo o limite efetivo.
- [x] Propagar o diagnóstico da resposta R5 para o `copyPayload` do notice do
  bulk; antes desta correção `handleBatchSemanticReview` descartava
  `resData.diagnostic` ao montar `failedDetails`.
- [x] Manter o request operacional atual em `max_tokens = 1800`; nenhuma troca
  de modelo/provider, aumento de orçamento, retry ou fallback foi aplicada
  antes do novo smoke.
- [ ] Executar uma única tentativa autenticada pelo usuário com `marketing
  digital` e devolver o diagnóstico copiado para confirmar a causa real. Não
  repetir automaticamente nem executar chamada paga nesta etapa local.

## Concluído localmente — KD DataForSEO no Processador — 2026-08-19

- [x] Adicionada a evidência `keyword_difficulty` do DataForSEO Labs ao passo `Resultados`, com proveniência/histórico no JSONB existente e sem migration/schema.
- [x] KD exposto na tabela, DataForSEO, Revisão Humana, Decisão e detalhes técnicos; ordenação numérica preserva zero e mantém ausentes no fim.
- [x] Discovery/importação permanece distinta de revalidação oficial; IA recebe KD como contexto somente leitura e não cria regra editorial, limiar ou aprovação automática.
- [ ] Executar smoke autenticado real do Processador para confirmar resposta Keyword Overview, custo/usage, persistência e readback visual. A chamada complementar é necessária porque o endpoint SERP allintitle atual não entrega KD.

- [ ] Aplicar, somente após autorização específica e preflight remoto aprovado, `0044_google_ads_metrics_time_zone_compatibility.sql`; executar imediatamente o post-verifier bound.
- [ ] Publicar a correção local de readback da Discovery e repetir pela utilização normal somente Descobrir Keywords e Atualizar métricas, sem nova auditoria global.

## Concluído — 0043 Historical Metrics Google Ads

- [x] Preflight remoto e baseline bound aprovados.
- [x] Migration 0043 aplicada manualmente e post-verifier remoto aprovado.
- [x] Confirmados nullable, tipo, default, CHECK, dados e invariantes estruturais.
- [x] Testes e lint direcionados aprovados; PostgreSQL local indisponível registrado sem mascarar falha.
- [x] Encerrar a 0043 e seguir para o Master Refresh Manifest, sem novo smoke de provider nesta frente.

## Pendente — smoke único do Usage Google Ads Discovery

- Executar somente após revisão/autorização: uma Discovery real representativa, sem retries, para confirmar `integration_usage_events.result_status = succeeded`, chave idempotente, `actorUserId`, `agencyId`, `brandId`, provider `google_ads` e capability `google_ads_keyword_discovery`.
- Não repetir a Discovery já persistida, não executar Metrics e não alterar migration/schema.

## Homologação pendente — importação manual/CSV sem silo

- Validar manualmente uma marca sem silos: importar três keywords manualmente como `Sem silo`, recarregar e confirmar `lista_id = null` sem criação de lista.
- Validar CSV sem coluna Silo, com Silo vazio, lote misto e referência explícita inexistente; a última deve ser reportada sem bloquear as demais linhas válidas.

## Pendente — recuperação canônica dos guards históricos do handoff

- SDD aprovada: `docs/compartilhado/sdd-autorizacao-excepcional-recovery-historico-minerador-arquiteto.md` define `historical_import_recovery:execute` como grant excepcional, temporal, revogável e por Brand.
- [x] Preparada localmente a migration 0030, preflight, post-verifier, plano de rollback e testes estáticos; nenhum artefato foi aplicado remotamente.
- [ ] Executar futuramente o preflight remoto da 0030, registrar snapshot e só então decidir a aplicação manual.
- Depois da implementação autorizada, selecionar IDs reais individualmente, validar Brand, criar guards auditados e confirmar readback remoto. Não usar SQL direto, backfill automático ou reimportação histórica.

## Runtime de governança de integrações — revisão local — 2026-08-11

- **Implementado localmente:** `lib/server/integrations-runtime.ts` fornece `resolveIntegrationEntitlement`, `resolveIntegrationResource`, `evaluateIntegrationQuota` e `recordIntegrationUsage` com dependências injetáveis para fixtures e mocks.
- **Próximo gate:** revisão do contrato server-side e decisão explícita de cada consumidor antes de adaptar Google Ads, DataForSEO ou IA. Nenhum consumidor atual deve ler `integration_*` diretamente.
- **Obrigatório na adaptação futura:** fornecer capability, operação, ambiente, Agency/Brand e binding explícitos; preservar `brandId` como tenant dos dados; registrar usage após a operação real; nunca escolher provider/connection por first-match ou fallback.
- **Fora deste gate:** UI, providers reais, chamadas pagas, Vault, secrets, Serper, Communication, SQL remoto, migration, backfill e criação de usage remoto.
- **Dívida preservada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED` exige política global de default ACL antes de uma migration futura que crie tabelas; não foi alterada pelo runtime.

## Governança de integrações — próximo gate 0024 — 2026-08-11

- **Preparado localmente:** revisar `supabase/migrations/0024_integrations_resource_governance.sql`, gerar snapshot pré-0024 e somente depois decidir a aplicação manual.
- **Preflight remoto futuro:** gerar primeiro o snapshot com `supabase/scripts/integrations-0024-pre-apply-snapshot-read-only.sql`; depois executar `supabase/scripts/integrations-0024-preflight-read-only.sql` v2 e exigir que as sete relações novas, indexes, constraints e funções estejam ausentes, com dependências e legado essenciais preservados.
- **Pós-verificação remota futura:** após aplicação autorizada, executar apenas `supabase/scripts/integrations-0024-post-verification-read-only.sql` e exigir zero `FAIL` no result set único `2026-08-11-integrations-0024-post-v1`.
- **Bloqueio ACL:** antes de qualquer adaptação, executar `supabase/scripts/integrations-0024-acl-diagnostic-read-only.sql` v1 para distinguir grant real de `integration_usage_events` e bug de classificação do verifier. Não executar `GRANT`/`REVOKE` remoto; se houver divergência, preparar hardening sucessor.
- **Não fazer neste gate:** seed de providers/capabilities, backfill, configuração de Vault, provider real, adaptação Google Ads/DataForSEO/IA, UI, quota operacional, chamada paga, rollback ou limpeza de legado.
- **Revisão estrutural concluída:** capability não fica presa a um provider único; grants Agency→Brand e bindings validam `agency_brands` ativo; quota continua independente e usage permanece append-only/idempotente.
- **Próximas fases separadas:** resolver connections/grants/bindings server-side; migrar Google Ads preservando a tabela por Brand; dar origem explícita a DataForSEO por Agency/Platform; registrar usage real; decidir o corte de Serper sem novo contrato ou fallback.

## Security hardening de ACL — próximo gate 0025 — 2026-08-11

- **Preparado localmente:** `supabase/migrations/0025_integrations_usage_acl_hardening.sql` é sucessora da 0024 e atua somente sobre ACL das sete tabelas existentes; não cria schema, não altera ownership e não modifica dados.
- **Ordem manual futura:** executar `supabase/scripts/integrations-0025-acl-hardening-preflight-read-only.sql`; somente com precondições PASS aplicar manualmente a 0025; depois executar `supabase/scripts/integrations-0025-acl-hardening-post-verification-read-only.sql` e exigir zero FAIL.
- **Contrato final:** catálogo com `service_role` SELECT/INSERT/UPDATE; ledger com SELECT/INSERT; authenticated somente SELECT sob RLS; anon/PUBLIC sem acesso privado.
- **Dívida separada:** `DEFAULT_ACL_GLOBAL_POLICY_REQUIRED`; não alterar default ACL nesta fase.
- **Não fazer neste gate:** adaptar consumers, provider, Vault, UI, criar usage real, alterar runtime ou executar rollback.

## IA — pós-correção do fallback silencioso — 2026-08-10

- Configurar explicitamente `AI_PROVIDER=deepseek` ou `AI_PROVIDER=openrouter` por ambiente, sem manter a seleção implícita por presença de chave.
- Homologar cada capability com provider/modelo escolhido, erro de credencial, autenticação, indisponibilidade e rate limit, sem chamada real em testes automatizados.
- Futuramente migrar credenciais para o contrato canônico de connections/entitlements/usage da SDD de Integrações; esta correção não cria schema nem interface.
- Manter como dívida separada a remoção de chamadas diretas/contratos legados de Serper e a migração de Google Ads/DataForSEO.

## Fase 1.5 — Administração global de agências

- Implementação local concluída: aba `/admin?tab=agencias`, contratos e rotas administrativas protegidas para criar agências, definir administradores explícitos, vincular marcas e ativar/desativar agência, membership e vínculo.
- Pendente de homologação manual: cadastrar Agência Adalba, selecionar administrador, vincular Adalba/Lindisse, recarregar, conferir dados existentes, testar usuário sem acesso e dark mode.
- Não migrar providers nesta fase. Google Ads por marca, DataForSEO global provisória e Serper do Radar permanecem como estão.

## Arquitetura aprovada — provedores por plataforma e agência — Fase 1 local em andamento — 2026-08-05

- O desenho antigo com `agency_provider_connections` e `provider_usage_events` foi supersedido pelo schema canônico `integration_connections`, `integration_grants`, `integration_bindings`, `integration_quota_policies` e `integration_usage_events` da 0024. Marca continua o tenant; agência apenas compartilha operação/credencial autorizada.
- Implementar resolvedor server-side canônico: autorização da marca → vínculo agência ativo → conexão do provider autorizada para a finalidade → execução → persistência em `brand_id` → auditoria de uso por agência e marca. Sem fallback por owner, admin, slug, e-mail, marca ou outra agência.
- Migrar DataForSEO primeiro no Minerador e depois, com contratos próprios, para evidências do Arquiteto e SERP do Radar. A substituição de Serper só pode ocorrer após paridade automatizada e smoke autenticado; Serper permanece produtivo no Radar até então.
- Migrar Google Ads com compatibilidade: OAuth/Developer Token/MCC técnico globais no servidor; preservar `minerador_google_ads_connections` por marca até a nova resolução estar validada. Não apagar conexões, métricas ou histórico durante a transição.
- Decisões pendentes antes da migration: criador inicial de agência, secret manager/rotação, troca de agência da marca, quota por agência e contrato DataForSEO para SERP orgânica Radar.
- SDD: `docs/03-minerador/propostas/arquitetura-provedores-plataforma-agencia.md`. Esta entrada não autoriza migration, código, chamadas externas ou remoção de Serper.

### Fase 1 — fundação local concluída; aplicação manual pendente

- Preparada a migration aditiva `0014_agency_foundation.sql` com `agencies`, `agency_memberships`, `agency_brands`, RLS e funções `can_access_agency`/`can_manage_agency`. Ela não migra provider, não altera `marcas`/`brand_memberships` e não faz backfill.
- Antes de aplicar, definir e revisar manualmente os pares iniciais marca → agência. Não inferir agência por owner, slug, e-mail ou marca. Marcas existentes ficam sem vínculo até decisão humana explícita.
- Próximo passo depois da aplicação: smoke autenticado de criação de agência, membership, vínculo único, isolamento A/B e regressão das rotas existentes. Só depois a Fase 2 poderá administrar conexões DataForSEO por agência.

## Decisão vigente — DataForSEO no allintitle — 2026-08-05

- Concluído: remoção da pasta `minerador-extensao/`, scripts, assets, adaptadores, listeners, filas Chrome, rotas `/api/extensao/...` exclusivas e consumidores produtivos da bridge.
- Concluído: Descoberta e Processador continuam carregando sem a Extensão; Google Ads, importação, seleção, pintura, métricas atuais e dados históricos permanecem preservados.
- Concluído localmente: ações explícitas de allintitle nas duas abas usam DataForSEO server-side; sem credenciais, a ação informa configuração ausente e não chama o provider.
- Concluído localmente: resultados já existentes não são mais tratados como idempotência da ação nova; cada clique mede todos os alvos selecionados, atualiza a projeção atual por `update/upsert`, preserva o anterior no histórico e informa primeiras medições versus atualizações.
- Confirmado em smoke pago direto: a task DataForSEO para `allintitle:marketing digital` retornou `se_results_count = 134` com status `20000`. Persistência autenticada e atualização visível ainda exigem smoke manual pela interface.
- Preservado: `lib/minerador/allintitle.ts`, `lib/minerador/allintitle-persistence.ts`, `lib/minerador/discovery-current-metrics.ts`, KGR, histórico e migration 0013 como base de domínio/persistência para o futuro executor interno.
- Preservado: DataForSEO é provider de allintitle; Google Ads continua provider de volume/métricas e Serper continua canônico do Radar. Não restaurar bridge/background como solução provisória.
- As referências à Extensão e ao executor nas seções históricas abaixo não são itens produtivos atuais; devem ser lidas como histórico do desenvolvimento.

## Fase 7 — fechamento da Descoberta Keywords — 2026-08-04

**Descobrir Keywords — MVP funcionalmente concluído.**

### Validações manuais concluídas

- Rota tenantizada, pesquisa nacional Google Ads e targeting com uma, duas e sete UFs.
- São Paulo, Minas Gerais e São Paulo + Minas Gerais.
- Filtro de volume, persistência da execução, restauração após reload e preservação da última pesquisa válida em falha.
- Importação explícita de candidata nova, persistência remota da keyword, aparecimento no Processador e criação como `bruto`, sem lista automática.
- Núcleo de importação compartilhado entre Extensão e Descoberta.

### Pendências reais, sem bloquear o MVP

- Candidata já existente; repetição sem duplicação; retry idempotente; isolamento da importação entre Adalba e Lindisse.
- Conferência visual completa em dark mode e nos breakpoints.

### Decisões e backlog pós-MVP

- Google Ads Keyword Ideas é a fonte canônica da Descoberta para volume, histórico, CPC e concorrência Ads. Concorrência Ads não é KD; KGR e allintitle permanecem no Processador.
- A Extensão foi removida do produto. DataForSEO é o executor server-side de allintitle nas duas abas, sem restaurar bridge, background ou dependências Chrome.
- Permanecem no backlog, sem bloquear o MVP: Exportar candidatas; Resultados; KD; SERP; histórico navegável de pesquisas; municípios; conexão Google Ads por agência; remoção futura da RPC antiga; remoção futura do código legado da Extensão.
- Legado preservado sem remoção: `public.import_minerador_discovery_candidates`, `minerador_discovery_normalize_keyword`, migrations 0011/0012 como histórico da RPC antiga e `executeMining`/`extractSuggestionsLegacy` como candidatos a remoção futura.

## Fase 8 — integrar allintitle e atualização de métricas — implementação local; migration pendente — 2026-08-04

- Auditoria confirmou que `minerador_discovery_candidates` não possui allintitle atual, status, executor, erro sanitizado ou histórico de medição.
- O protocolo atual da Extensão exige `keywordId` oficial de `keywords_kgr`; candidatas não importadas não podem ser medidas sem importação silenciosa ou persistência paralela.
- O executor Chrome foi substituído por DataForSEO server-side. A rota usa `se_results_count`, não cria leitor/parser/fila local e não restaura a Extensão.
- A migration 0013 continua somente como estrutura existente; não foi criada, alterada ou executada nesta fase.
- Regra aprovada para a próxima fase: sucesso confirmado substitui os valores operacionais atuais e recalcula KGR; falha preserva integralmente valores, `measured_at` e KGR anteriores.

### SDD mínima para desbloqueio

- Persistência tenantizada de medições allintitle de `DiscoveryCandidate`, incluindo valor atual, estado, provider/executor, erro sanitizado, `measured_at`, lote e histórico.
- Extensão do protocolo para aceitar `subjectType = keyword | discovery_candidate`, com `candidateId` validado server-side e `keywordId` opcional somente para candidatas ainda não importadas.
- Transferência transacional da medição de candidata para a keyword oficial durante importação, sem nova medição automática.
- Leitura única do valor atual: keyword oficial quando importada; medição da candidata enquanto não importada.
- Testes de tenantização, substituição após confirmação, preservação em falha, partial, CAPTCHA, retry e importação sem duplicação.

O contrato e o código server-side desta fase estão implementados localmente; permanecem pendentes somente o smoke pago e a aplicação autorizada da migration 0013.

### DataForSEO — pendências manuais sem bloquear o contrato

- Conferir por smoke autenticado na interface uma primeira medição, uma atualização de resultado já existente e a persistência após reload.
- Aplicação autorizada da migration 0013, quando o usuário decidir executar a persistência remota.
- Catálogo DataForSEO validado para UFs; até lá, o MVP mede Brasil e rejeita targeting estadual sem somar contagens.

## Descobrir Keywords — targeting por UF — correcao local — 2026-08-03

- Corrigido o catalogo brasileiro com os IDs oficiais atuais da Google Ads; a falha real vinha de IDs antigos/incorretos, nao da preservacao da tabela.
- Adicionado diagnostico sanitizado de resource names, UFs, idioma, rede, quantidade, Brasil, customer mascarado, request ID, codigo e campo do erro provider-side.
- Histórico superado: smoke manual confirmado com Brasil, SP, MG, SP+MG e sete UFs; importação explícita e Processador foram validados nas fases seguintes.

## Fase 4 — persistência tenantizada da Descoberta — histórica, superada pelo fechamento da Fase 7 — 2026-08-03

- A estrutura `minerador_discovery_runs`/`minerador_discovery_candidates` foi validada no fluxo tenantizado, com proveniência, `operation_request_id` idempotente e reload sem nova chamada Google Ads.
- O registro histórico da migration local `0009_minerador_discovery_persistence.sql` permanece preservado; persistência, reload e preservação da última pesquisa válida foram confirmados manualmente.
- Importação seletiva ao Processador, retenção/exclusão de histórico e qualquer alteração em `keywords_kgr` continuam em fases separadas.

## Descobrir Keywords — prioridade da coluna Keyword — concluído localmente — 2026-08-03

- Concluído: dimensionamento por consumidor via `colgroup`; Keyword recebe a maior largura-base e as colunas auxiliares usam faixas compactas sem alterar o Processador.
- Preservado: conteúdo, filtros, organização, seleção, ordenação, hover, barra sticky e scroll horizontal da tabela. Validação manual visual permanece pendente.

## MineradorSectionTabs — padronização visual — concluído localmente — 2026-08-03

- Concluído: abas Descobrir/Processar usam dimensões compactas idênticas e o wrapper do Processador não cria rolagem vertical própria.
- Preservado: estado derivado da rota, ordem Descobrir → Processar, tabela, barra operacional, filtros e rolagens legítimas. Validação manual visual permanece pendente.

## MineradorSectionTabs — padronização visual — concluído localmente — 2026-08-03

- Concluído: abas Descobrir/Processar usam dimensões compactas idênticas e o wrapper do Processador não cria rolagem vertical própria.
- Preservado: estado derivado da rota, ordem Descobrir → Processar, tabela, barra operacional, filtros e rolagens legítimas. Validação manual visual permanece pendente.

## Descobrir Keywords — controle de keywords adultas — concluído localmente — 2026-08-03

- Concluído: checkbox movido da Linha 1 para a Linha 2, preservando o estado `includeAdultKeywords`, o payload da próxima execução e a responsividade da composição.
- Preservado: targeting, Google Ads, tabela, organização, seleção, snapshot e Processador. Validação manual visual permanece pendente.

## Descobrir Keywords — Fase 1 concluída localmente — 2026-08-03

- Concluído: rota privada, navegação Descobrir/Processar, duas linhas compactas de controles, capability states, estado vazio e cabeçalho estrutural da futura tabela.
- Ajuste visual concluído: Modo da pesquisa é um select junto da semente; Idioma antecede País; o botão Descobrir foi movido ao final dos filtros. A linha separada de modo foi removida sem alterar estado local, popovers, provider ou persistência.
- Ajuste visual concluído: `MineradorSectionTabs` unifica Descobrir/Processar no canto direito dos respectivos cabeçalhos; a faixa separada do Processador foi removida e o estado ativo vem da rota.
- Preservado: Processador, Extensão, Google Ads, schema, migrations, persistência, seleção existente e Arquiteto.
- Concluído na Fase 2: shell, cabeçalho, células de seleção, empty state e casca da barra inferior extraídos como infraestrutura neutra. O Processador preserva handlers, ordenação, filtros e operações; a Descoberta usa somente a estrutura vazia e suas colunas futuras.
- Correção responsiva local: removida a expansão horizontal da página de Descoberta sem ocultar o documento globalmente. O scroll horizontal permanece restrito à grade; Estados/UF reutiliza o popover ancorado e limitado à viewport.
- Concluído localmente: descoberta em memória com Google Ads, normalização, filtros no ciclo de execução, targeting brasileiro e resumo de candidatas. Homologação visual/manual permanece pendente. Esta etapa não autoriza persistência, schema, importação ou remoção da Extensão.

- **Aplicação manual pendente — exclusão de keyword medida (2026-08-03):** revisar snapshot e aplicar `supabase/migrations/0008_minerador_keyword_measurement_delete_cascade.sql`. Ela permite exclusão atômica de keyword não publicada e de suas métricas Google Ads vinculadas; publicados permanecem protegidos. Nenhuma migration foi executada remotamente.

## Decisão arquitetural aprovada — Google Ads e retirada completa da Extensão — 2026-08-02

- Migração local de Volume implementada em 2026-08-03: rota Google Ads tenantizada, conexão por marca, medição versionada, lote interno e projeção após persistência. A migration `0007_minerador_google_ads_volume.sql`, cadastro da conexão e validação manual continuam pendentes.
- Caminho de cadastro implementado localmente: `POST /api/minerador/marcas/[brandId]/google-ads/conexao` valida a conta antes de gravar. Pendente cadastrar a conexão real da Adalba e validar Lindisse sem conexão.
- RapidAPI está congelada nos endpoints de volume; sua remoção física, dos normalizadores e testes legados só ocorre depois da paridade confirmada e de uma busca de consumidores vazia.

- SDD aprovada em `propostas/migracao-google-ads-retirada-extensao.md`; a decisão ainda não está implementada e não autoriza código automaticamente.
- Decisão: preservar `allintitle`/KGR históricos; keywords novas podem existir sem ambos; ausência permanece indisponível, nunca zero; Google Ads centraliza ideias, volume, histórico, CPC, lances e concorrência Ads server-side.
- Fronteira preservada: Serper continua provider canônico do Radar para primeira página e evidências SERP. Google Ads não substitui nem altera Serper, os contratos ou o fluxo do Radar; provider aproximado de allintitle seria frente separada e não requisito.
- Gates: definir conta anunciante por marca, aprovar targeting/cache, implementar com fixtures, executar smoke manual de uma keyword, comprovar paridade e somente então congelar/remover Extensão e RapidAPI.
- Restrições: não chamar APIs reais em testes, não expor credenciais, não confundir MCC com conta anunciante, não presumir BRL, não apagar métricas históricas nem alterar Arquiteto/Radar silenciosamente.
- Fundação local corrigida em 2026-08-03: cliente com somente as três rotas REST oficiais, `v25` em allowlist, providerVersion derivada do cliente, int64 ProtoJSON, close variants, validação de conta antes de fetch, MCC efetivo e cache OAuth isolado por configuração. Testes usam fixtures e `fetch` simulado; não houve chamada real. Continuam pendentes conta por marca, rota/tela/persistência e smoke manual; RapidAPI e Extensão seguem ativas até paridade.
- Correção final da fundação: proveniência histórica agora relaciona somente correspondências entre canônica/close variants e entradas solicitadas, mantendo não associadas no envelope. SearchStream rejeita envelopes ou `results` malformados com erro estruturado; MCC configurada prevalece sobre `null` operacional.
- Smoke manual preparado: uma keyword, conta e targeting explicitamente informados, saída sanitizada e sem persistência. A execução real, comparação com Keyword Planner e definição de conta por marca continuam pendentes; RapidAPI e Extensão seguem ativas.
- Diagnóstico do smoke: `--check-config` carrega `.env`/`.env.local` e valida apenas nomes de configuração, sem API. CustomerId inválido falha antes das credenciais; a chamada real manual continua pendente.

## Alta prioridade — homologar falha allintitle com diagnóstico preservado

- Recarregar a extensão a partir desta pasta e executar uma medição pequena autenticada; se a persistência falhar, registrar o código exibido e o diagnóstico copiável para corrigir a causa remota sem mascará-la como `no_persisted_allintitle_results`.
- Confirmar que resultado confirmado atualiza a tabela diretamente, sem prévia, e que falha preserva o valor anterior.

> **Estado vigente — 2026-07-27:** 0005/0006 não são tarefas pendentes de aplicação. O resultado remoto registrado em `estado-atual.md` e `docs/compartilhado/supabase.md` informa 0006 aplicada com validation `READY`; não reexecutar nem executar rollback. Pendências de browser autenticado, RLS real e smoke test continuam manuais.

## Formação compartilhada KGR — registrado em 2026-07-21

- Feito localmente: evidência de Site preservada sem confirmação automática.
- Pendente: qualificação humana/real no Minerador, snapshot SQL/RLS e validação manual autenticada.
## Homologacao da selecao e do retorno allintitle - 2026-07-29

- Pendente manual: depois de recarregar a extensao, repetir uma medicao ja processada e confirmar que cada resultado confirmado aparece diretamente na tabela, sem painel de previa ou confirmacao adicional.
- Pendente manual: recarregar a extensao e testar clique comum, Ctrl/Cmd, Shift e pintura no popup e na tabela, iniciando em checkbox marcado e desmarcado; confirmar que o clique seguinte nao fica suprimido e que nao ha atraso perceptivel.
- Pendente manual: repetir a consulta que avancou `3 de 3` sem item na tabela, conferir `ITEM_EVENT_DISPATCHED` e validar que sucesso e zero atualizam diretamente a linha somente com `persistenceOutcome: persisted`; erro preserva o valor anterior, inclusive apos reload.
- Pendente manual: com a extensao recarregada, iniciar lista longa, sair da pagina do Minerador, aguardar o contador progredir, confirmar alerta nativo e foco da aba Google em CAPTCHA/consentimento, liberar manualmente e retomar sem perder o indice.
- Restricao: nao executar automaticamente Google real, SQL, migration, limpeza, commit, push ou deploy.

## Agora
- **Reconciliacao de seguranca 0006:** preparação e validação pré-aplicação preservadas como histórico; o resultado remoto posterior registrou `READY`. **Não executar novamente:** permanecem apenas smoke test autenticado e RLS remoto como validações externas.
- **FK `lista_id` canônica:** o resultado registrado mantém `fk_keywords_kgr_lista_0005` com `ON DELETE RESTRICT`; a remoção da FK legada `CASCADE` não é pendência de aplicação. **Não executar migration/rollback.**
- **Endurecimento final da migration 0005:** guards e ordem operacional são históricos; os efeitos são considerados existentes conforme o registro posterior. **Não iniciar nova janela de aplicação.**
- **Compatibilização `keywords_kgr.brand_id` obrigatório:** implementada localmente em `modules/minerador`, import Site/Sitemap e APIs de análise; validar apenas rollout/smoke test manual quando autorizado.

## Resultado remoto da 0006 — 2026-07-24

- 0006 aplicada remotamente; validation pós-migration retornou `READY`.
- O `42P01` foi somente um erro do diagnóstico pós-`COMMIT` ao acessar snapshot temporário descartado; sem perda de dados reportada.
- Não reexecutar 0006 e não executar rollback. O epílogo local foi corrigido para futuras instalações.

## Proposta — contrato autenticado de marcas para a extensão — 2026-07-24

- SDD criada em `propostas/contrato-autenticado-marcas-extensao.md`; implementação local aditiva concluída conforme aprovação.
- Entregue: endpoint Bearer Supabase específico da extensão, resolução server-side das marcas/listas autorizadas e handshake v2 com `activeBrandId`.
- Guardrails: não reutilizar cookies NextAuth, não consultar `marcas`/`listas_kgr` diretamente pelo popup, não inferir acesso por papel, e-mail, `brandId` ou `brandRef`.
- Dependências remanescentes: confirmar em smoke test o vínculo `sub` Supabase ↔ perfil ↔ sessão NextAuth, validar capacidades no ambiente e substituir o rate limit local por proteção distribuída se necessário.
- Nenhuma migration, RLS, chamada autenticada, escrita remota ou limpeza de armazenamento foi executada nesta etapa.
  - **Histórico pré-aplicação:** a aplicação de 0005 não deve ser iniciada novamente; executar somente smoke test/validação manual se autorizado.
  - **Fora do escopo desta rodada:** consumidores de Arquiteto, Radar, Planejador, Inteligência e SERP editorial.
- **Coleta de `results_allintitle` pela extensão:** ver `propostas/coleta-allintitle-pela-extensao.md`.
  - **Estado:** implementada localmente; validação manual autenticada/Google pendente.
  - **Entregue:** lote explícito por keyword/marca, uma aba Google reutilizável, leitor com fallbacks, pausa por CAPTCHA, cancelamento, prévia e confirmação antes da persistência localizada.
  - **Guardrails:** zero somente explícito; falhas nunca apagam resultado anterior; volume e resultados seguem independentes; sem consulta Google automatizada em testes.
  - **Pendente:** recarregar a extensão, conectar a aba do Minerador, revisar permissões e executar lote manual pequeno sob autorização do usuário.
  - **Correção local 2026-07-23:** seleção individual usa persistência direta somente após retorno válido; a prévia fica restrita a lotes com duas ou mais keywords. Validação manual pendente.
  - **Correção local 2026-07-23:** handshake real por aba implementado. Recarregar a extensão e validar manualmente no Chrome que o popup mostra `Conectado a .../minerador` somente depois do ACK; em refresh, troca ou fechamento de aba, reconectar antes de qualificar.
  - **Correção local 2026-07-23:** executar uma única validação manual de allintitle para confirmar a etapa retornada pelo diagnóstico. Não executar lote nem contornar CAPTCHA/consentimento.
  - **Correção local 2026-07-23:** popup abre `/minerador` a partir da origem configurada, nunca o destino legado de `PANEL_URL`. Validar manualmente o roteiro admin incompatível → Abrir Minerador → conectar com ACK.
- **Objetivo:** confirmar por teste/manual controlado o caminho KeywordDNA → Arquiteto e resolver o diagnóstico M-01/M-05 sem perder dados.
  - **Módulo proprietário:** Minerador
  - **Arquivos permitidos:** testes do Minerador e `docs/03-minerador/**`
  - **Arquivos proibidos:** migrations e Arquiteto sem proposta conjunta
  - **Dependências:** marca e dados de teste
  - **Riscos:** escrita em dados reais
  - **Critério de aceite:** proveniência e localização de cada keyword demonstradas
  - **Testes obrigatórios:** domínio, regressão operacional e manual isolado
- **Diagnóstico adicional:** M-02 e M-03 registram mutações durante carregamento e persistência parcial; não corrigir sem snapshot, rollback e autorização.
## Próximo
- **Objetivo:** preparar SDD para escopo por marca, mutações automáticas, publicação e transferência persistida.
  - **Dependências:** resultado do snapshot/SQL e validação manual.
  - **Critério de aceite:** consumidores, contrato, rollback e regressão definidos.
### Implementação local - Site/Sitemap -> Minerador - 2026-07-21
- SDD implementada na camada compatível em `propostas/sincronizacao-site-sitemap-minerador.md`.
- Entregue: prévia explícita, confirmação, idempotência, atualização aditiva de evidência existente, IDs reais para novas keywords, filtros separados e isolamento por marca/lista.
- Pendente: validação Supabase/RLS/browser autenticado, eventual persistência durável do catálogo e correções estruturais M-01–M-05; nenhuma migration ou escrita remota foi executada.
## Depois
Avaliar decomposição da tela somente via proposta SDD.
## Bloqueado
Validação remota, browser autenticado, extensão carregada e mudanças estruturais aguardam operação/autorização do usuário.
## Descartado
Reescrita funcional durante migração documental.
## Concluídos recentes
Auditoria documental e auditoria de saúde não destrutiva em 2026-07-20; ver relatório em `propostas/auditoria-de-saude-do-minerador.md`.
## Fase B - implementacao local - 2026-07-22

- Concluido localmente: aplicabilidade KGR humana, historico KeywordDNA, filtros de aplicabilidade/medicao, ordenacao e exportacao aditiva.
- Concluido localmente: remocao do briefing exclusivo do Minerador e reposicionamento da conferencia Site/Sitemap no rodape operacional.
- Concluido localmente: consolidacao aditiva de URL/canonical/publicacao e associacao a silo existente apos confirmacao persistida.
- Pendente: validacao manual autenticada, RLS/Supabase remoto, cenarios de publicado real e acompanhamento dos riscos M-01-M-05.
## Fase B.1 - concluida localmente - 2026-07-22

- Concluido: conferencia Site/Sitemap na barra de selecao, somente para keywords selecionadas, sem barra adicional.
- Concluido: KGR read-only, decisoes em massa com gate de medicao e preservacao de volume/resultados.
- Concluido: Intencao read-only na tabela, processo logico como caminho de classificacao e adaptador para valores legados.
- Concluido: painel `Organizar`, filtros preservados e tipografia de controles ampliada discretamente.
- Concluido: remocao de refetch completo apos qualificacao/importacao e deduplicacao do carregamento inicial.
 - Pendente: validacao visual/manual autenticada, RLS/Supabase remoto e riscos estruturais de hidratacao M-01-M-05.

## Fase B.2 - concluida localmente - 2026-07-22
- Concluido: qualificacao fail-closed; erro, payload invalido ou keyword sem medicao nao transforma metadados existentes em `null`.
- Concluido: normalizacao interna de respostas de volume e patch aditivo de `volume_search`, `volume_source` e `kgr_score`.
- Concluido: bloqueio explicito de API RapidAPI de auditoria de site na rota de volume, sem chamada externa nesta tarefa.
- Pendente: escolher e validar, com autorizacao, um provedor real de keyword volume e seu payload documentado.

## Fase B.3 - concluida localmente - 2026-07-22
- Concluido: contrato Google Keyword Insight com GET, `keyword`, `location=BR` e `lang=pt`.
- Concluido: normalizacao por correspondencia exata em `text` e `volume`, com estados por keyword.
- Concluido: fixture anonimizada e teste sem chamadas externas.
- Pendente: observar o fluxo autenticado do Minerador com uma selecao controlada; nao executar lote de producao nesta tarefa.

## Fase B.4 - concluida localmente - 2026-07-22
- Concluido: fixture literal da API Trending Insight e normalizador que bloqueia uso de `value` como volume.
- Concluido: cobertura para keyword divergente, schema parcial e preservacao do patch sem medicao.
- Pendente: selecionar um provedor cujo contrato retorne volume mensal real antes de adaptar `/api/volume` para a nova URL.

## Fase B.5 - normalizador Keyword Magic Tool - 2026-07-22
- Concluido: normalizador fixture-based para `keyword_ideas[].keyword` e `keyword_ideas[].search volume`, com falha segura por correspondencia ausente ou volume invalido.
- Pendente: obter do Playground o metodo HTTP e parametros/corpo documentados de `/searchby-country-url` antes de autorizar a troca da configuracao da rota. Nenhuma chamada externa sera feita para descobrir esse contrato.

## Fase B.6 - SEO Keyword Research - concluida localmente - 2026-07-22
- Concluido: rota de volume usa `GET /keyword-research` com `keyword` e `country=br`, autenticada no servidor e limitada ao host/endpoint confirmados.
- Concluido: normalizacao por correspondencia exata em `result[].keyword`/`avg_monthly_searches`, fixture sem chamadas externas e preservacao de `results_allintitle`/KGR em ausencia ou erro.
- Pendente: validar manualmente o fluxo autenticado do Minerador com uma keyword de controle; nao executar lote de producao.

## Fase B.3 complementar - concluida localmente - 2026-07-22
- Concluido: derivacao pura e memoizada da tabela, status padrao `Todos` e regressao de hidratacao sem depender do painel `Organizar`.
- Concluido: `results_allintitle` existente permanece a unica fonte de resultados nesta fase; nao houve nova rota, API ou provedor.
- Concluido: barra inferior unica com contador integrado e decisao KGR agrupada.
- Pendente: validacao visual/manual autenticada e confirmacao de persistencia remota controlada; nao executar lote de producao.

## Fase B.4 - concluída localmente - 2026-07-22

- Concluído: restauração automática e não destrutiva da última organização por usuário e marca, sem depender de abrir `Organizar`.
- Concluído: resumo nominal dos filtros ativos e adaptação segura de preferência legada, inválida ou com silo inexistente.
- Pendente: validação manual autenticada de reload e troca de marca; não executar escrita remota, migration, commit, push ou deploy.
- Complemento concluído: hidratação única por chave, sem `setTimeout`, e resumo estável limitado a três critérios mais `+N`.

## Métricas independentes da aplicabilidade KGR - concluída localmente - 2026-07-22

- Concluído: taxonomia de medição por volume/resultados e apresentação independente da estratégia KGR.
- Pendente: validação manual autenticada do detalhe e confirmação do consumidor existente do Arquiteto; não alterar Arquiteto sem escopo autorizado.

## Política da keyword principal publicada - concluída localmente - 2026-07-22

- Concluído: política aditiva travada/revisável/livre, histórico humano e identidade publicada protegida.
- Pendente: validação manual autenticada da persistência e futura proposta controlada no Arquiteto; não há troca automática de principal nesta fase.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/minerador; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Acesso autenticado a listas_kgr — 2026-07-24

- Causa diagnosticada: o cliente browser era anônimo porque não enviava o `session.accessToken` do NextAuth ao PostgREST; o erro de permissão em `listas_kgr` era consequência disso.
- Correção local: o Minerador usa `lib/supabase/browser-authenticated-client.ts`, exige sessão autenticada antes de consultar e mantém os filtros por `marca_id`/`brand_id`.
- Sem alteração de RLS, grants, migration, keywords, `lista_id`, `brand_id`, owner ou memberships.
- Pendente: smoke test manual autenticado e confirmação online; nenhum SQL remoto foi executado nesta correção.

## Ciclo JWT NextAuth → Supabase — concluído localmente — 2026-07-24

- Implementado refresh server-side do JWT Supabase com margem de 60 segundos e lock por refresh token.
- Cliente browser usa callback `accessToken` dinâmico; sessão ausente, JWT vencido ou falha de refresh bloqueiam a consulta sem fallback anon.
- Google OAuth foi separado do JWT Supabase; nenhum token Google é enviado ao PostgREST.
- Pendente: reiniciar o servidor, sair/entrar novamente e executar smoke test manual autenticado no Minerador. Migrations 0005/0006 não devem ser reexecutadas.

## Diagnóstico final da sessão NextAuth → Supabase — concluído localmente — 2026-07-24

- Concluído: códigos seguros para carregamento, ausência de sessão, troca Google, token ausente, claims, expiração, refresh e sessão pronta.
- Concluído: mensagem de expiração deixou de mascarar falhas de troca Google, ausência de token e claims inválidos.
- Pendente: login Google real e confirmação da configuração remota do provider; nenhuma operação remota foi executada.

## Fechamento da sessão incompleta Google → Supabase Auth — concluído localmente — 2026-07-24

- Concluído: troca Google incompleta interrompe o callback Auth.js e não permite acesso parcial ao workspace.
- Concluído: `session.supabaseAuth` expõe somente status, reason e expiresAt; o access token só aparece quando a sessão está pronta.
- Pendente: smoke test Google real e confirmação da configuração remota do provider.

## Marcas autenticadas e handshake v2 da extensão — concluído localmente — 2026-07-24

- Concluído: endpoints Bearer server-side para marcas autorizadas e listas tenantizadas do Minerador.
- Concluído: popup sem consulta direta de `marcas`/`listas_kgr`, com seleção por lista real autorizada, retry persistente e rota `/{brandRef}/minerador`.
- Concluído: handshake v2 por usuário/marca/aba, com `activeBrandId` e `activeBrandRef`; divergência bloqueia mineração e allintitle.
- Concluído: testes fixture-based e rate limit local de melhor esforço.
- Pendente: smoke test manual autenticado no Chrome, confirmação online do vínculo `sub` Supabase ↔ perfil e proteção distribuída de rate limit. Não executar consulta Google, escrita remota, migration, commit, push ou deploy nesta validação.
## Diagnóstico do erro genérico no endpoint de marcas — concluído localmente — 2026-07-24

- Concluído: URL canônica da API derivada de `PANEL_URL`, com validação de origem e prefixo `/api/extensao/`.
- Concluído: popup interpreta respostas HTTP não-OK, mostra mensagem por código e oferece retry/diagnóstico copiável sem token.
- Concluído: sessão da extensão passou a preservar expiração e refresh seguro; token expirado tenta uma renovação única antes de exigir novo login.
- Pendente: executar o roteiro manual autenticado e registrar status HTTP, código, requestId e marca retornada; não declarar a lista real homologada antes dessa evidência.

## Fechamento da divergência popup ↔ Minerador — 2026-07-25

- Concluído localmente: preflight operacional estruturado por `tabId`, ator, marca, rota canônica, origem e protocolo.
- Concluído localmente: recuperação da sessão por `chrome.storage.session` após fechamento do popup ou reinício do service worker, com revalidação por novo ping.
- Concluído localmente: mensagens específicas para sessão ausente, outra aba, outra marca, ator divergente, rota divergente, protocolo incompatível, timeout, bridge indisponível e acesso não confirmado.
- Pendente: roteiro manual autenticado com popup fechado, service worker suspenso, duas abas e duas marcas; não executar consulta Google, RapidAPI, escrita remota, migration, commit, push ou deploy para validar esta pendência.

## Consulta allintitle sem resultado final — 2026-07-26

- Concluído localmente: execução individual não permanece indefinidamente em `Consultando resultados allintitle...`; erro do bridge, resposta ausente, timeout, cancelamento e conclusão sem resultado agora encerram a operação.
- Concluído localmente: `requestId` percorre Minerador → bridge → background → reader → resultado; respostas divergentes recebem códigos `request_mismatch`, `keyword_mismatch`, `brand_mismatch`, `reader_response_mismatch` ou `response_missing`.
- Concluído localmente: reader e bridge sempre devolvem resposta estruturada, e timeout preserva dados anteriores e oferece retry apenas da keyword atual.
- Pendente: validar manualmente uma keyword no Chrome autenticado, incluindo sucesso, zero, indisponibilidade, CAPTCHA, bloqueio, timeout e cancelamento; não executar essa consulta nesta validação automatizada.

## Correlacao do requestId no retorno individual allintitle — 2026-07-26

- Concluido localmente: a bridge nao permite que a resposta substitua o `requestId` criado no workspace; o background exige o ID no pedido e nao gera um novo.
- Concluido localmente: eventos e respostas individuais carregam `requestId`, `batchId`, `keywordId` e `brandId` quando aplicavel; `batch_completed` tambem informa `brandId` e `keywordIds`.
- Concluido localmente: retorno sem ID e classificado como `response_missing_request_id`; divergencia e `request_mismatch`; resposta antiga e ignorada como `stale_response`.
- Pendente: roteiro manual autenticado com uma keyword e consulta Google real; nenhum trafego externo foi executado nesta rodada.

## Coerencia de volume zero e KGR — 2026-07-26

- Concluido localmente: volume zero explicito nao preserva KGR numerico atual; o score anterior permanece em historico aditivo e `results_allintitle` nao e alterado.
- Concluido localmente: resultados de volume bem-sucedidos recebem fonte, data e correspondencia exata; ausencia/erro nao grava zero.
- Concluido localmente: registros com volume zero e KGR numerico sao detectados e exibidos em previa diagnostica sem saneamento automatico.
- Pendente: revisar a previa em ambiente autenticado e confirmar manualmente qualquer correcao de dados; nao executar lote remoto, SQL, migration ou chamada externa.

## Auditoria classificatória dos 71 registros — pendente de decisão humana — 2026-07-27

- Concluído em modo somente leitura: os 71 candidatos foram separados em 55 registros sem métricas observáveis, 14 zeros com resultados e KGR incompatível sem confirmação de origem, e 2 registros não aplicáveis sem score comprovável.
- Classificação conservadora: os 71 permanecem em `INSUFFICIENT_EVIDENCE`; nenhum foi promovido automaticamente a zero confirmado, recuperação histórica, divergência positiva ou score armazenado não aplicável.
- Risco localizado: a prévia atual mistura ausência de volume com incompatibilidade porque volume nulo é classificado como `inconsistent`.
- Pendente: corrigir a separação classificatória em proposta própria, obter exportação/consulta somente leitura com IDs e proveniência, e então submeter qualquer patch localizado à confirmação humana. Não executar lote remoto, SQL, migration ou medição externa.
## Bridge obsoleta após reload e prévia classificatória — concluído localmente — 2026-07-27

- Concluído: bridge versionada/disposable com `bridge_ready`, `instanceId`, `extensionVersion`, `dispose` e códigos para contexto invalidado, bridge não pronta e versão incompatível.
- Concluído: background reinjeta e valida a bridge antes do handshake v2; a sessão armazena diagnóstico aditivo da instância confirmada.
- Concluído: 71 registros deixam de ser tratados como incompatibilidades homogêneas; a interface mostra contagens reais de medição pendente, zero sem confirmação, não aplicável e incompatibilidade comprovada, com filtro somente leitura.
- Pendente: validação manual em Chrome após reload da extensão, service worker suspenso e reconexão; não executar consulta Google, lote remoto, SQL, migration, commit, push ou deploy.
## Qualificação simplificada e ACK da página — concluído localmente — 2026-07-27

- Concluído: volume e allintitle possuem ações explícitas separadas; a qualificação de volume não depende mais silenciosamente da extensão.
- Concluído: erros reais do provedor aparecem na notificação quando a resposta fornece status ou mensagem segura.
- Concluído: a UI principal não exibe mais a prévia classificatória de 71 registros; a auditoria continua preservada como evidência técnica.
- Concluído: listener de handshake independente do ciclo do lote, ACK negativo estruturado e janela de preflight ampliada sem mudança de autenticação.
- Pendente: confirmar manualmente no Chrome a conexão após reload da extensão e executar uma medição allintitle real, operação não realizada nesta validação.
## Fechamento localizado — métricas, KGR, ACK e 429 — 2026-07-27

- Concluído localmente: separar qualificação de volume, medição allintitle e decisão KGR; KGR é cálculo local, não medição de provedor.
- Concluído localmente: responder de prontidão da página na rota contextual e diagnóstico do handshake por estágio, sem depender do estado do lote.
- Concluído localmente: HTTP 429 da RapidAPI exibe somente mensagem genérica, encerra o lote e preserva dados anteriores; sem retry automático.
- Pendente: validar manualmente no Chrome autenticado, com RapidAPI e Supabase configurados. Nenhuma chamada externa ou escrita remota foi feita nesta execução.

## SDD — Simplificação da extração da extensão — proposta — 2026-07-27

- Proposta criada em `docs/03-minerador/propostas/simplificacao-extracao-extensao.md`.
- Escopo proposto: remover lista/projeto/categoria/silo do popup, preservar `brandId` como escopo, usar intenção/funil como preferências preliminares, filtrar resultados e volume antes da confirmação e importar keywords brutas sem agrupamento.
- Auditoria confirmou `brand_id` obrigatório e `lista_id` anulável; a implementação ainda depende de definir o endpoint canônico de importação, a fonte de municípios e a compatibilidade com o fluxo legado.
- Não implementado: nenhum código, schema, migration, SQL, chamada externa, escrita remota ou alteração de dados.

## Bloqueio da implementação da simplificação da extensão — 2026-07-27

- A implementação foi interrompida antes do código porque a SDD não aprova endpoint canônico, payload persistente final ou estratégia de compatibilidade entre popup, service worker e aplicação.
- O caminho obrigatório `docs/00-produto/contratos/importacoes.md` não existe neste checkout.
- Não criar rota, payload ou persistência por inferência; retomar somente após registrar o contrato aprovado.
## Simplificacao da extensao do Minerador Key - implementacao local - 2026-07-27

- SDD aprovada e implementada localmente no popup, service worker, contratos puros e rotas server-side autenticadas.
- Removida a exigencia de lista/projeto/silo/categoria da nova importacao. Keywords novas entram como `bruto`, com `brand_id` real e `lista_id` nulo; duplicidades por marca e texto normalizado preservam o registro existente e agregam evidencia.
- Pendencia de homologacao: executar manualmente Chrome autenticado com troca de marca/aba, extracao de sugestoes, allintitle, volume, confirmacao e leitura remota. Nao executar provider real ou escrita remota durante testes automatizados.
## Ajuste localizado da interface e preferencias da Extensao - 2026-07-27

- Implementado localmente: hierarquia do popup, painel de conexao, funil multiplo BOFU/MOFU/TOFU, controle Local sobre localidades, filtros com Sem maximo e preferencias por usuario + `brandId`.
- Pendente manual: recarregar a extensao no Chrome, confirmar a ordem visual, trocar Adalba/Lindisse, validar preferencias isoladas, testar rota divergente e executar uma extracao pequena sem alterar dados remotos durante a homologacao automatizada.

## Correcao urgente da inicializacao do popup da Extensao - concluida localmente - 2026-07-27

- Corrigir regressao `Cannot access 'sectionLabel' before initialization` no bootstrap do popup; concluido localmente com teste de ordem de inicializacao.
- Separar validacao real da sessao pelo endpoint de marcas da exibicao do email e da restauracao das preferencias; concluido localmente sem limpar armazenamento ou fazer logout automatico.
- Preservar marcas autorizadas quando a restauracao de filtros/preferencias locais falhar; concluido localmente com tratamento localizado e diagnostico explicito.
- Exibir mensagens acionaveis para aba nao conectada, rota divergente e outra marca; concluido localmente.
- Pendente manual: recarregar a extensao no Chrome, validar login invalido/valido, duas marcas com preferencias isoladas, rota correta/incorreta e reconexao explicita.

## Correcao localizada Abrir Minerador -> Conectar aba - concluida localmente - 2026-07-27

- Registrar e reutilizar a aba aberta por `brandId`, ativando a rota `/{brandRef}/minerador`; concluido localmente.
- Desabilitar conexao durante carregamento e liberar somente com `status=complete`; concluido localmente.
- Tornar a leitura de conexao passiva e reservar bridge/ping para a acao explicita `Conectar`; concluido localmente.
- Diferenciar aba ausente, aba carregando, bridge sem resposta, rota divergente e marca divergente; concluido localmente.
- Reordenar visualmente Abrir/Conectar e TOFU/MOFU/BOFU; concluido localmente sem alterar o contrato de importacao.
- Pendente manual: recarregar a extensao e a aba do Minerador, testar Adalba, Lindisse, troca de marca, rota incorreta, aba previamente aberta e reconexao apos bridge ausente.

## Diagnostico tecnico da bridge no Chrome - concluido localmente - 2026-07-27

- Instrumentar a cadeia `executeScript -> bridge -> sendMessage -> probe -> ACK -> handshake` com codigos tecnicos e estagios seguros; concluido localmente.
- Diferenciar `INJECTION_PERMISSION_DENIED`, `INJECTION_FILE_NOT_FOUND`, `INJECTION_EXECUTION_ERROR`, `PROBE_NO_RECEIVER`, `PROBE_TIMEOUT`, `ACK_INVALID` e protocolo incompativel; concluido localmente.
- Exibir detalhes tecnicos copiaveis no popup sem tokens, cookies, senhas ou payloads de keywords; concluido localmente.
- Confirmar manualmente no Chrome a pasta carregada, o service worker, `INJECTION_OK`, `PROBE_ACK` e `HANDSHAKE_OK` com Adalba e Lindisse; pendente.

## Compactacao do estado de conexao - concluida localmente - 2026-07-27

- Compactar o estado conectado para nome da marca e indicador verde, mantendo o diagnostico fora do uso normal; concluido localmente.
- Adicionar `Ver diagnostico`/`Ver detalhes` expansivel e preservar `Copiar detalhes tecnicos`; concluido localmente.
- Manter handshake, conexao efemera, importacao e medicao de volume sem alteracao; concluido localmente.
- Validar manualmente no Chrome o resumo conectado, diagnostico recolhido/expandido, copia, fechamento/reabertura do popup e legibilidade; pendente.

## Correcao do estado conectado sobrescrito - concluida localmente - 2026-07-27

- Retornar `HANDSHAKE_OK`/`connected` na leitura passiva quando o registro efemero da aba continuar valido; concluido localmente.
- Trocar `session_missing` por `panel_not_checked`/`idle` para aba autenticada ainda sem handshake; concluido localmente.
- Ignorar leitura inicial, listener de aba pronta e resposta antiga depois de conexao explicita por `connectionOperationId` e `connectRequestId`; concluido localmente.
- Manter a homologacao manual no Chrome para conectar, fechar/reabrir popup, recarregar a aba, trocar Adalba/Lindisse e confirmar invalidacoes reais; pendente.

## Correcao da transicao PROBE_ACK -> HANDSHAKE - concluida localmente - 2026-07-27

- Corrigir o listener da bridge para confirmar `handshake_sent` ao `tabs.sendMessage`; concluido localmente.
- Impedir que um `PROBE_ACK` valido seja convertido em `bridge_unavailable`; concluido localmente.
- Separar `connectRequestId`, `probeRequestId` e `handshakeRequestId`, validando aba, marca e tentativa ativa; concluido localmente.
- Dar precedencia ao resultado explicito de Conectar sobre leituras passivas e ignorar respostas antigas; concluido localmente.
- Exibir `HANDSHAKE_OK`/`connected` ou `handshake_error` com status estruturado; concluido localmente.
- Confirmar manualmente no Chrome `INJECTION_OK -> PROBE_ACK -> HANDSHAKE_SENT -> HANDSHAKE_OK -> CONNECTED` com Adalba e depois Lindisse; pendente.

## Fluxo pos-extracao, previa e importacao da Extensao - concluido localmente - 2026-07-27

- Concluido localmente: executor sequencial em background com estado temporario por ator, marca, aba e run, restauracao da semente/previa e progresso apos fechar/reabrir popup.
- Concluido localmente: Local desligado nacional; Local ligado com Brasil/UF/municipios; pausa, retomada, cancelamento parcial e descarte explicito.
- Concluido localmente: previa selecionavel, crescente e rolavel, linhas fora de filtro visiveis, deduplicacao por run com evidencias de contexto, contadores e erros.
- Concluido localmente: allintitle sequencial com zero/error preservados e volume opcional server-side; importacao sem exigir metricas, com confirmacao, resposta real, resultados por linha e retry de falhas.
- Testes locais: `tests/minerador-extension-extraction.test.mts`, sintaxe dos scripts e `git diff --check`.
- Pendente manual: recarregar a extensao, testar popup fechado durante execucao, pausar/retomar/cancelar, confirmar previsualizacao e importacao controlada com Adalba/Lindisse; nao executar lote real, SQL, migration, limpeza, commit, push ou deploy.

## Ajuste localizado da tabela - concluído localmente - 2026-07-27

- Concluído: colunas explícitas `Funil` e `Principal`, com badges alinhados fora da coluna `Keyword`.
- Concluído: `Keyword` como coluna elástica principal; links/canonicals ficam abaixo da keyword e truncam somente quando necessário.
- Concluído: funil neutro quando não existe hint persistido; sem inferência ou mudança de contrato.
- Pendente: validação visual manual da densidade e responsividade em 360px, 768px, 1024px e 1440px, além da conferência em dark mode.

## Correção da distribuição das colunas da tabela - concluída localmente - 2026-07-27

- Concluído: ordem explícita `Keyword`, `Principal`, `Resultados`, `Volume`, `KGR`, `Intenção`, `Nicho de mercado`, `Funil`, `Silo/Categoria`, `Status`.
- Concluído: Keyword como maior coluna flexível e tabela mínima de `110rem`, com rolagem horizontal no contêiner existente quando a viewport for menor.
- Concluído: larguras fixas para Principal, métricas, intenção, nicho, funil, silo/categoria e status, sem ocultar colunas ou alterar comportamento.
- Pendente: validação visual manual de alinhamento, keywords longas, viewports menores e dark mode.

## Qualificação explícita e Funil na barra de ações - concluída localmente - 2026-07-27

- Concluído: remoção da qualificação automática durante o carregamento; keywords sem processamento continuam neutras.
- Concluído: ação primária `Qualificar selecionadas`, limitada à seleção atual, com resultado individual por keyword.
- Concluído: Funil lógico opcional em `analise_semantica.funnel`, com valores `TOFU`, `MOFU` e `BOFU`, origem, confiança, evidência e revisão de conflito.
- Concluído: hints da Extensão preservados como pista, sem aprovação automática; decisões humanas reconhecidas permanecem protegidas.
- Concluído: barra inferior reorganizada com ações de organização, métricas, qualificação, decisão KGR, `Mais ações` e `Excluir` separado.
- Pendente: validação manual autenticada com dados reais, conferência visual em light/dark e execução real de endpoints de IA; testes locais não consumiram APIs pagas.

## Correção definitiva do chevron de Silo/Categoria - concluída localmente - 2026-07-27

- Concluído: seta nativa removida somente do select de `Silo/Categoria`; texto selecionado e `ChevronDown` customizado formam uma unidade visual compacta.
- Concluído: truncamento ocorre no texto, com `title` para o valor completo, foco perceptível e select nativo preservado para menu e teclado.
- Concluído: colunas, Status, demais selects, handler, persistência e dados não foram alterados.
- Pendente: conferir a mesma composição em 360px, 768px e 1024px.

## Padronização do select Silo/Categoria com Nicho de mercado - concluída localmente - 2026-07-27

- Concluído: `Silo/Categoria` reutiliza a base visual do select `Nicho de mercado`, sem fonte maior, peso diferente ou wrapper customizado.
- Concluído: largura total da célula, truncamento, `title`, foco e menu nativo foram preservados.
- Concluído: nenhum valor, opção, handler, persistência, coluna ou dado foi alterado.
- Pendente: conferir responsividade nos viewports de 360px, 768px e 1024px.

## Preflight just-in-time da medição allintitle - concluída localmente - 2026-07-27

- Concluído localmente: conexão efêmera antiga não é mais aceita como prova; `ensureMineradorConnection(...)` executa preflight atual por aba, contexto e operação.
- Concluído localmente: reload/navegação marca a conexão para revalidação e a bridge é preparada novamente no `complete`; a operação executa probe e handshake antes de criar lote.
- Concluído localmente: há uma única recuperação controlada para falhas de probe/ACK/handshake; falha final não abre Google, não inicia query e não altera métricas existentes.
- Concluído localmente: `batchId` do popup só é atribuído após a resposta de lote criado; diagnósticos carregam IDs e estágio real, sem `stage: null` no preflight.
- Pendente manual: recarregar a extensão, conectar Adalba, medir, recarregar a página na mesma rota sem clicar em Conectar, confirmar renovação automática, testar zero/erro e repetir fechando/reabrindo o popup. Não executar Google real automatizado, SQL, migration, limpeza, commit, push ou deploy.

## Renovacao automatica antes do allintitle - concluida localmente - 2026-07-28

- Concluido localmente: preflight JIT usa `ensureMineradorConnection(...)` como fluxo canonico de conectar, com registro obsoleto invalidado antes da reinjecao.
- Concluido localmente: reload/navegacao marca a sessao efemera no `loading`; a bridge e preparada uma unica vez no `complete`, enquanto a operacao explicita continua responsavel por handshake.
- Concluido localmente: uma unica recuperacao controlada, sem lote ou aba Google antes de `HANDSHAKE_OK`, preservando selecao, limite, sequencia, CAPTCHA, zero, erro e IDs do contrato allintitle.
- Concluido localmente: diagnostico estruturado com IDs, tabId, bridge anterior/atual, eventos, estagio e resultado da recuperacao.
- Pendente manual: validar no Chrome o reload na mesma URL, recuperacao automatica, falha orientada, reconexao, popup fechado/reaberto e medicao real. Nao executar operacoes remotas, Google real automatizado, SQL, migration, limpeza, commit, push ou deploy.
- Correcao definitiva apos reload - 2026-07-28: pendente somente homologacao manual no Chrome para confirmar `loading -> stale -> complete -> injection_ok -> probe_ack -> ready_for_validation -> handshake_ok -> batch_created`.
- Implementado localmente: uma reinjecao por ciclo de reload, sem polling; rota diferente, marca diferente, aba fechada ou falha de permissao nao reinjetam a bridge.
- Implementado localmente: popup deixa de mostrar conexao verde durante reload e recebe os estados de atualizacao, pronto para validacao e falha de preparacao.
- Implementado localmente: ausencia do canal da pagina retorna `page_bridge_unreachable`/`page_bridge_dispatch`; lote e metricas permanecem intocados antes do handshake. A remocao fica restrita ao registro efemero stale.

## Seleção complementar por intervalo e arraste - correção local - 2026-07-29

- Concluído localmente: seleção individual, Ctrl/Cmd, Shift e Ctrl/Cmd+Shift pela ordem visual atual.
- Concluído localmente: arraste adicional na coluna de seleção com tolerância, modo selecionar/desmarcar e deduplicação por gesto.
- Concluído localmente: cabeçalho limitado às linhas visíveis, estado indeterminado e preservação de selecionadas ocultas.
- Pendente: homologação visual e de teclado no Chrome em light/dark e viewports 360px, 768px, 1024px e 1440px.

## Allintitle sem dependência de silo - correção local - 2026-07-29

- Concluído localmente: remover a pré-condição indevida de `lista_id`/silo no início e na confirmação da medição allintitle.
- Concluído localmente: validar ID, texto e `brand_id` com códigos `invalid_keyword_id`, `invalid_keyword_text`, `keyword_not_persisted` e `keyword_brand_mismatch`.
- Preservado: endpoint server-side, transporte background-owned, persistência de `results_allintitle`, vínculos de silo/lista, volume, importação, qualificação e fronteira do Arquiteto.
- Pendente: homologação manual no Chrome com keywords sem silo e com silo, incluindo reload e persistência.

## Allintitle background-owned e persistencia server-side - 2026-07-29

- Concluido localmente: SDD aprovada e endpoint dedicado `POST /api/extensao/marcas/[brandId]/keywords/resultados-allintitle` criado sem migration ou schema novo.
- Concluido localmente: autenticacao server-side, tenant canonico, validacao por keyword, limite de 10, outcomes individuais e preservacao em falhas.
- Concluido localmente: background chama o endpoint por resultado confirmado e o workspace nao mantem escrita direta concorrente no fluxo allintitle.
- Concluido localmente: relay declarado e limitado as origens locais aprovadas; contexto invalidado orienta uma unica recarga da pagina, sem tentativa de reviver bridge.
- Pendente: homologar Chrome autenticado com reload da Extensao/pagina, popup fechado, lote em andamento, CAPTCHA, zero, erro, persistencia e Adalba/Lindisse. Nao executar Google real automatizado, SQL, migration, limpeza, commit, push ou deploy.

## Seleção por pintura e leitura localizada do allintitle - 2026-07-29

- Implementado localmente: seleção por arraste baseada em coordenadas e `elementFromPoint`, limitada à coluna de seleção e compatível com os modos de clique existentes.
- Implementado localmente: parser localizado para `Aproximadamente`, `Cerca de`, `About` e `Approximately`, separadores de milhar e sufixo de tempo, com abertura única de Ferramentas quando o seletor conhecido não apresenta o contador.
- Implementado localmente: contador ausente não é classificado como zero; a prévia usa mensagem, código, estágio e diagnóstico estruturados.
- Concluído no Chrome: pintura seleciona e desmarca 10 linhas; o Google exibiu `Aproximadamente 282 resultados (0,21 s)` após `Ferramentas` e o Minerador refletiu 282.
- Concluído após reload da página do Minerador: a keyword permaneceu com 282.
- Pendente de homologação: recarregar a Extensão pelo gerenciador do Chrome e repetir a medição com o background atualizado; a automação não pode acessar `chrome://extensions`.

## Modo pintar real e reconciliação de lote órfão - 2026-07-29

- Implementado localmente: handle de pintura cobre a célula de seleção, mantém `elementFromPoint`/`closest`, captura/libera ponteiro e preserva clique, Ctrl/Cmd, Shift, cabeçalho e teclado.
- Implementado localmente: active pointer por `brandId`, reconciliação de registros sem executor, estados `orphaned`/`interrupted`, histórico com resultados e cleanup terminal.
- Implementado localmente: nova operação viva bloqueia em `operation_guard`; operação órfã oferece retomada ou descarte, e cancelamento libera a marca.
- Pendente: homologação manual pelo usuário após reload da Extensão; não declarar o gesto concluído por automação ou evento simulado.

## Restauração do fluxo de seleção e medição allintitle - 2026-07-29

- Concluído localmente: remover o limite de 10 da seleção total; o limite permanece apenas no sublote técnico interno.
- Concluído localmente: acompanhar resultados por operação e não somente pelo primeiro `batchId`, com progresso geral e diagnóstico por keyword.
- Concluído localmente: restaurar clique normal de checkbox e seleção por intervalo/pintura na tabela e na prévia do popup, sem cursor de cruz.
- Pendente: homologar no Chrome os modos de seleção, 51 keywords em seis grupos, popup fechado, reload da página, pausa/continuação/cancelamento e o caso `allintitle:"alternativas ao facebook ads para dentistas"` com a contagem 323 refletida na prévia e na tabela após persistência.

## Homologação pendente — popup e lote parcial - 2026-07-29

- Validar no Chrome: no popup, clique livre, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura, teclado e persistência da desmarcação após fechar e reabrir.
- Validar no Chrome: após importar, allintitle e volume aparecem e funcionam somente na tabela do Minerador; o popup não oferece medição para candidatos temporários.
- Validar no Chrome: lote de 3 e de 10 com um retorno faltante mostra sucesso parcial e permite repetir somente o ID sem resultado confirmado.

## Homologação pendente — navegação e CAPTCHA - 2026-07-29

- Confirmar no Chrome que abas transitórias sem URL não produzem `navigation_failed` e que a página inicial do Google não é tratada como redirecionamento inesperado.
- Confirmar que `/sorry/index`, reCAPTCHA ou consentimento pausam o lote, abrem a aba necessária e mostram aviso com feito/restante e Retomar/Cancelar.

## Homologação pendente — lote longo interrompido - 2026-07-29

- Validar com lista longa que o primeiro CAPTCHA em português pausa o lote no item atual; os restantes não podem virar `query_mismatch` em cascata.
- Validar que, ao abrir a tabela durante uma operação ativa, a interface reassocia o lote e mostra feito, total, restante, Retomar e Cancelar.

## Homologação pendente — pausa de CAPTCHA retomável - 2026-07-29

- Validar que `batch_paused` aparece como aviso informativo, com `Retomar` e `Cancelar lote`, e não como falha terminal.
- Validar que a liberação do CAPTCHA seguida de `Retomar` continua no índice preservado e que as demais ações da tabela permanecem utilizáveis.

## Homologação pendente — notificação de CAPTCHA sem foco automático - 2026-07-30

- Validar que CAPTCHA não troca a aba em primeiro plano, enquanto a notificação persistente da Extensão e o badge `!` continuam perceptíveis.
- Validar que clicar na notificação ou em `Abrir Google` é o único caminho que abre a aba do desafio.

## Homologação pendente — classificação parcial de intenção e nicho - 2026-07-30

- Repetir manualmente as três keywords que receberam resposta incompleta e confirmar que respostas equivalentes de `intent`/`nicho` são persistidas.
- Confirmar que resposta ainda incompleta informa aviso parcial, preserva os dados anteriores e não aparece como erro de console.

## Homologação pendente — pintura imediata de keywords - 2026-07-30

- Validar no Chrome que cada checkbox muda durante o arraste, sem aguardar `pointerup`, e volta ao estado anterior quando o ponteiro retorna.
- Validar clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, seleção de visíveis, teclado, mouse e touchpad em light e dark mode.

## Proposta pendente — fonte secundária de volume - 2026-07-30

- O endpoint `GET /global-volume` do provedor `seo-keyword-research-tool1.p.rapidapi.com` respondeu em leitura com seção `BR`, volume, global, CPC e tendência mensal. Os volumes recebidos são estimativas do provedor, não uma confirmação independente de dados Google.
- Avaliar o provedor `ai-google-keyword-research-planner.p.rapidapi.com` como fonte secundária somente após assinatura e teste controlado do contrato/payload.
- Estratégia proposta: manter uma fonte primária por medição; usar a secundária apenas para indisponibilidade, falha de contrato ou cota da primária. Nunca disparar as duas para a mesma keyword por padrão, nunca misturar valores, e registrar `volume_source`, data e resposta normalizada da fonte efetivamente usada.
- Antes de implementar: comparar keywords brasileiras de controle, normalizar valores abreviados como `1.3k`, definir ausência/parcial/erro sem gravar zero e revisar custo, quota, termos e limites de cada assinatura. A troca de provedor no endpoint server-side exige escopo próprio, fixtures/testes e validação manual; nenhuma integração, escrita remota ou chamada adicional foi feita por este registro.

## Descobrir Keywords — planejamento aprovado — histórico superado pelo fechamento da Fase 7 — 2026-08-03

### Separação de pesquisa e targeting — implementação local — 2026-08-03

- Implementado localmente: draft da próxima pesquisa separado do snapshot executado e da organização local; falha de nova consulta preserva a tabela anterior.
- Implementado localmente: volume, CPC, relação, inclusão e exclusão aplicados somente no ciclo de descoberta; busca e Organizar permanecem locais.
- Implementado localmente: catálogo brasileiro com códigos internos de UF, resolução server-side, Brasil exclusivo no modo nacional, máximo de 10 UFs e targeting humano agregado.
- Histórico superado: a homologação manual confirmou pesquisa nacional, São Paulo, Minas Gerais, São Paulo + Minas Gerais e sete UFs; a preservação da última pesquisa válida em falha também foi confirmada.

- SDD criada em `propostas/aba-descobrir-keywords.md`: separa Descobrir Keywords do Processador, contrata as três linhas, pipeline, componentes compartilháveis, importação e entidades conceituais.
- Fases 1 e 2 concluídas localmente: rota, navegação, tela estática, shell, seleção e barra compartilhada, com regressões direcionadas do Processador.
- Fase 3, persistência e importação foram validadas no fluxo manual de fechamento; Resultados/KD continuam futuros e dependentes de contrato próprio, sem bloquear o MVP.

## Fase 5 — enviar candidatas selecionadas ao Processador — histórico superado pelo fechamento da Fase 7 — 2026-08-03

- A candidata nova, a persistência remota, o aparecimento no Processador e os defaults `bruto`/sem lista foram confirmados manualmente.
- Permanecem somente as regressões não bloqueantes listadas no bloco Fase 7: candidata existente, repetição sem duplicação, retry idempotente, isolamento entre marcas e validação visual completa.

### Arquitetura futura — conexão operacional com agência Google Ads

- A conexão Google Ads deve permanecer vinculada à marca por `brandId`, com credenciais somente no servidor, conta anunciante/MCC validados e targeting/moeda/timezone sanitizados no navegador.
- A Descoberta pode usar a conexão validada para ideias e métricas oficiais, mas a Fase 5 não cria consulta paga nem altera o provider; filtros e importação usam apenas candidatas persistidas da execução válida.
- A integração futura deve preservar provider/version, métricas, targeting e proveniência no lote/origem; não transformar concorrência Ads em KD, não misturar contas/moedas e não substituir o Serper do Radar.

## Elegibilidade por volume oficial - concluído localmente - 2026-08-03

- A regra aprovada de corte `>= 120` foi implementada como metadado aditivo e filtro operacional; não houve migration, exclusão nem mudança em status editorial.
- Pendente de homologação manual: validar lote Google Ads com volume elegível, abaixo do corte e sem média, além de verificar a legibilidade dos selos no Chrome.

## Homologação pendente — volume brasileiro pelo novo provedor - 2026-07-30

- Repetir uma medição autenticada após a renovação da cota e confirmar que `GET /global-volume?keyword=<keyword>&country=br` retorna volume somente de `Keyword Overview.BR` para a keyword exata.
- Confirmar que `1.3k` é persistido como `1300`, que ausência de BR não usa `global`/outro país e que falha/429 preserva volume, resultados allintitle e KGR anteriores.
- Conferir o limite e custo efetivos da assinatura antes de medição em lote. A fonte secundária permanece somente proposta; não há fallback automático.

## Homologação pendente — conclusão sem volume BR e avisos - 2026-07-30

- Confirmar no Chrome que keyword sem entrada exata em `Keyword Overview.BR` encerra como conclusão normal, sem etapa/código técnico e sem aparência de erro.
- Confirmar no dark mode que avisos de sucesso, informação e erro têm fundo opaco, texto legível, borda discreta e ações acessíveis; validar também viewport estreita.

## Homologação pendente — KGR com volume zero e selos textuais - 2026-07-30

- Validar no Chrome que uma keyword com `volume_search = 0` mostra `Não calculável`, inclusive se ainda estiver pendente, e que tentar aprová-la como KGR mostra apenas o aviso informativo.
- Confirmar que `Pendente`, `Não calculável`, `Não aplicável`, `Inconsistente`, `Inválido` e `Sem medição` usam a mesma altura, tipografia, borda e alinhamento dos selos de Principal, sem mudar o estilo dos valores numéricos KGR.
- Confirmar que a política `Principal revisável` continua decisão explícita e que nenhuma ação KGR altera slug, canonical ou dados da keyword.

## Homologação pendente — destaque de volume confirmado - 2026-07-30

- Validar no Chrome que `0 confirmado` aparece somente para zero retornado pela medição exata e que zero sem evidência permanece normal.
- Validar que números positivos confirmados pelo provedor usam o azul de confirmação, enquanto valores legados, estimados ou sem `volume_measurement` continuam na cor neutra.
- Conferir título acessível, legibilidade em dark mode e ausência de alteração em KGR, filtros, ordenação, persistência ou largura da coluna.

## Homologação pendente — selos da coluna Intenção - 2026-07-30

- Confirmar no Chrome que intenções conhecidas e pendentes usam selos compactos coerentes com Principal e KGR, sem alteração de valor, filtro ou classificação.
- Conferir truncamento, `title`, dark mode e viewport estreita, garantindo que a coluna Nicho de mercado não seja invadida.

## Homologação pendente — grade e hover da planilha - 2026-07-30

- Confirmar no Chrome que as linhas horizontais e verticais estão mais fáceis de identificar sem criar contraste agressivo.
- Confirmar hover em linha comum, selecionada e publicada, no dark mode e nas larguras de 360px, 768px, 1024px e 1440px.
- Confirmar que o divisor horizontal tem a mesma intensidade do vertical e que somente o hover se destaca mais.

## Homologação pendente — Busca e Histórico - 2026-07-30

- Confirmar no Chrome que Buscar comporta aproximadamente 60 caracteres e continua filtrando normalmente.
- Confirmar que Histórico abre abaixo do botão, fecha ao clicar fora ou pressionar Escape e preserva restaurar/fechar; conferir que os demais módulos continuam com o painel lateral.

## Homologação pendente — rótulo de keyword livre - 2026-07-30

- Confirmar no Chrome que o estado `free` mostra `Keyword livre` na coluna Principal, sem alteração da política técnica, persistência ou dos selos de keywords publicadas.

## Homologação pendente — densidade dos botões selecionados - 2026-07-30

- Confirmar no Chrome que os botões da barra inferior têm a mesma altura, padding, tamanho de texto, ícones e radius dos controles no topo, preservando foco, hover, estados desabilitados e quebra de linha em viewport estreita.

## Homologação pendente — redistribuição de largura da tabela - 2026-07-30

- Confirmar no Chrome que Principal, Intenção e Funil ficaram justas ao conteúdo e que Palavra-Chave absorveu a largura liberada, sem truncamento inadequado, invasão da coluna seguinte ou alteração dos selects.

## Fase 8 - metricas atuais e allintitle nas duas areas - implementada localmente; migration pendente - 2026-08-04

- Criada a migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql`, sem execucao remota. Ela separa snapshot de DiscoveryRun, projecao atual por candidata e historico append-only tenantizado.
- O protocolo da Extensao agora aceita keyword oficial ou `discovery_candidate`; o executor, leitor, parser, fila, CAPTCHA, pausa, retomada e notificacoes continuam compartilhados.
- Descoberta ganhou acoes locais para medir allintitle e atualizar metricas Google Ads usando `candidateId`; Processador preserva o fluxo de `keywordId`.
- Confirmados substituem o valor operacional apos persistencia; falhas preservam dados anteriores. Candidatas importadas mantem o vinculo `keyword_id` para refletir a mesma medicao na keyword oficial.
- Validacao local concluida: testes direcionados, TypeScript e lint direcionado. Smoke autenticado, aplicacao manual da 0013, idempotencia, retry, candidata existente, isolamento entre marcas e validacao visual permanecem pendentes.

## Fase 5 - convergencia do importador Extensao/Descoberta - núcleo confirmado no fechamento da Fase 7 - 2026-08-04

- Implementado localmente `lib/minerador/keyword-import-core.ts`; Extensao e Descoberta agora usam o mesmo nucleo TypeScript para normalizacao, deduplicacao, criacao, preservacao e retorno de `keywordId`.
- A Descoberta grava lote e proveniencia server-side fora da RPC legada, preserva retry do mesmo `importRequestId` e aceita apenas `completed` ou `partial` com `completed_at`.
- A RPC `import_minerador_discovery_candidates` e os objetos SQL de `0010`, `0011` e `0012` permanecem sem alteracao e sem novos consumidores; nao criar `0013` nem reaplicar migrations nesta tarefa.
- Validação manual concluída: candidata nova, persistência remota, confirmação no Processador e defaults `bruto`/sem lista. Pendências não bloqueantes: candidata existente, repetição sem duplicação, retry idempotente e isolamento Adalba/Lindisse.

## Fase 5 - correcao da RPC de importacao - histórico sem consumidor produtivo - 2026-08-04

- Smoke autenticado revelou `column reference "candidate.brand_id" is ambiguous`: a variavel record PL/pgSQL `candidate` colidia com o alias SQL usado nas validacoes da RPC da `0010`.
- Preparado `supabase/migrations/0011_fix_minerador_discovery_import_candidate_alias.sql`, que preserva a assinatura e troca os aliases de validacao para `selected_candidate`; a `0010` nao foi editada nem reaplicada.
- A RPC e o patch permanecem documentados como histórico; o fluxo produtivo convergido não os chama. Não criar migration corretiva nesta tarefa documental.

## Fase 5 - partial finalizada elegivel para importacao - histórico da RPC antiga - 2026-08-04

- `0012_fix_minerador_discovery_import_finalized_run.sql` permanece somente como histórico da RPC antiga; o importador compartilhado é o núcleo produtivo da Descoberta.

## Fase 5 - botao de importacao sem resposta - correcao local - 2026-08-04

- Corrigir o retorno silencioso quando a barra tinha IDs selecionados, mas nenhum candidato correspondente no estado atual.
- Manter a selecao por `DiscoveryCandidate.candidateId`, gerar `importRequestId`, bloquear clique duplicado e mostrar erro local sanitizado antes do POST.
- O POST tenantizado e o sucesso da candidata nova foram confirmados manualmente; preservar como regressões futuras a candidata existente, repetição sem duplicação, retry e isolamento entre marcas.

## Handoff canônico Minerador -> Arquiteto - implementado localmente - 2026-08-11

- [x] Manter `keywords_kgr` como origem e transportar apenas identidade, proveniência e decisão para o ledger editorial.
- [x] Exigir rota server-side protegida, Brand explícita e confirmação remota antes de apresentar sucesso.
- [x] Usar a unicidade de `editorial_workflow_items` para idempotência; repetição deve retornar `UNCHANGED`.
- [ ] Executar smoke autenticado com uma keyword aprovada, repetir a importação e confirmar o mesmo item remoto em duas sessões. Nenhuma operação remota foi executada pelo agente.
## Zero Legacy — Google Ads — auditoria concluída localmente — 2026-08-12

- **Resultado:** `public.minerador_google_ads_connections` permanece `MIGRATE_THEN_DROP`. Ela ainda é fonte de configuração operacional por Brand para conexão, Descoberta e métricas; não é seguro removê-la.
- **Paridade canônica:** o schema 0024/0025 já separa authorization, capability/entitlement, connection, binding, quota e usage, mas a substituição ainda tem gaps semânticos para Customer/MCC, targeting, moeda/timezone, validação, secret manager e resolução runtime.
- **Consumidores:** `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts`, `descobrir-keywords/route.ts`, `metricas-keywords/route.ts` e o painel de conexão. Migrations, scripts e testes que citam a tabela são evidência/compatibilidade, não consumidores produtivos adicionais.
- **Sequência futura:** (1) definir o mapeamento aprovado; (2) adaptar leitura canônica em paralelo com readback; (3) adaptar escrita/painel e integrar grant, binding, quota e usage; (4) executar smoke autenticado explícito; (5) provar zero consumidores; (6) só então preparar uma única migration sucessora de remoção.
- **Restrições:** não copiar a tabela para outro nome, não remover dados, não testar provider automaticamente, não usar fallback silencioso e não executar migration/SQL remoto neste gate.
- **Referência:** matriz completa em `docs/compartilhado/banco-canonico-pos-reset.md` na seção `ZERO LEGACY — GOOGLE ADS`.
## Google Ads — canonical migration blocked — 2026-08-12

- [ ] Approve the semantic destination for `login_customer_id`/MCC, Brand-specific targeting, external-account metadata and current validation state.
- [ ] Associate the server-side Google Ads secret with an approved canonical `integration_connection`; never expose or copy the secret to the client or legacy table.
- [ ] Adapt configuration, Discovery and metrics to the canonical provider/capability/grant/binding/quota/usage path with explicit errors and no fallback.
- [ ] Prove canonical readback, authenticated Brand isolation, provider smoke by explicit action, and `RUNTIME_CONSUMERS = 0` before preparing structural removal of `minerador_google_ads_connections`.

Current gate: `GOOGLE_ADS_CANONICAL_SCHEMA_GAP`; no code, migration, backfill, provider call or remote operation is authorized by this item.

## Google Ads Research Customer ID global — 2026-08-15

- [x] Persistir o Research Customer ID normalizado em metadata não secreta da Connection global.
- [x] Resolver Discovery/Metrics pela Connection global + Research Customer ID, preservando `brandId` como tenant/dono dos dados.
- [x] Retirar da Marca a exigência de Customer ID para pesquisa e preservar o contrato de conta publicitária futura.
- [ ] Configurar o Research Customer ID real da Plataforma e executar os smokes pagos de Discovery e Metrics pela Marca Adalba.

## Histórico superseded — Google Ads — infraestrutura fixa por env — 2026-08-16

- [x] Implementar `getGoogleAdsPlatformConfig()` como fonte exclusiva server-side para Google Ads.
- [x] Retirar o formulário de credenciais Google Ads da UI ativa e manter o health check explícito.
- [x] Remover do runtime Discovery/Metrics a resolução por Connection, Vault, metadata, binding, grant e quota, sem apagar contratos ou dados.
- [x] Confirmar as seis variáveis Google Ads no `.env.local` e executar os smokes reais sem expor valores.
- [x] Remover `SearchStream` como gate de Discovery/Metrics e preservar `resolveGoogleAdsAdvertiserAccount()` para outros consumidores.
- [x] Fechar o diagnóstico pós-`apiRequestStarted` com classificação de transporte, OAuth, HTTP, sucesso e erro interno; o smoke final com MCC como Research Customer retornou sucesso.
- [ ] Definir em etapa posterior o ledger de Usage para infraestrutura env; o schema atual exige `connection_id` e não foi alterado nesta task.

Estado local histórico de 2026-08-16: `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV`; a regra vigente de 2026-08-24 separa estáticos em ENV do OAuth Refresh Token no Secret Store. `SCHEMA_CHANGE_REQUIRED = NO`; `DATABASE_SCHEMA_CHANGED = NO`.

## Google Ads Research — pacote de migration preparado localmente — 2026-08-16

- [x] Preparar localmente o pacote `0041`: migration mínima das duas `source_contract` CHECKs, preflight read-only, post-verifier read-only e rollback guarded.
- [x] Confirmar `DATA_MIGRATION_REQUIRED = NO`, `EXPECTED_DATA_DELTA = 0` e preservação de manual/CSV, RLS, policies, ACL, owners, índices, FKs e triggers.
- [ ] Aplicação remota manual pelo usuário; executar o post-verifier e somente depois um único smoke real de Discovery.
- [ ] Manter separado o `GOOGLE_ADS_DISCOVERY_USAGE_GAP`; não incluí-lo na migration.

## Google Ads Historical Metrics — 0043 — 2026-08-17

- [x] Executar preflight remoto read-only e capturar baseline estrutural real sem drift.
- [x] Preparar migration mínima, rollback fail-closed, post-verifier bound e testes reversíveis.
- [x] Apply remoto executado manualmente pelo usuário.
- [x] Post-verifier bound e readback independente retornaram `PASS`; nenhum smoke de provider foi executado ou ficou necessário para fechar esta migration.

`0043_CLOSED = YES`.

## Notification Center global — 2026-08-18

- [x] Transformar o sino em histórico operacional compartilhado por escopo,
  com abertura, reabertura, badge de não lidos, leitura individual/coletiva e
  preservação ao fechar o painel.
- [x] Conectar bridges aditivos aos avisos existentes das áreas de Minerador,
  Arquiteto, Radar, Marca, Planejador, Publicações, Conta e Admin.
- [x] Manter feedback inline compatível e tornar o painel a apresentação padrão;
  toast externo só existe por solicitação explícita.
- [x] Separar histórico por módulo e `brandId`/`agencyId`, sem usar slug como
  identidade ou misturar Brand/áreas.
- [x] Abrir automaticamente o sino para preview curto de aviso novo, fechar
  sem apagar e interromper o timer durante interação.
- [x] Validar contrato e comportamento com testes focados, sem provider real,
  escrita remota ou alteração estrutural.
- [x] Executar validação manual autenticada em Minerador, Arquiteto e Radar;
  auto-open, auto-close, isolamento e retorno ao histórico foram confirmados.
- [ ] Avaliar posteriormente persistência entre sessões; F5/logout/login
  continuam fora do escopo atual.

Estado local: `NOTIFICATION_CENTER_GLOBAL = IMPLEMENTED_SESSION_SCOPED`;
`DATABASE_CHANGED = NO`; `SCHEMA_CHANGE_REQUIRED = NO`.

## Minerador R1.2 — Perfil da Keyword por processo — 2026-08-18

- [x] Organizar o perfil em uma caixa Bento por processo, sem caixa individual por campo.
- [x] Separar identidade, leitura lógica, Google Ads, DataForSEO, KGR, revisão IA, decisão humana e proveniência técnica.
- [x] Manter históricos, request IDs, versões, payloads e campos internos preservados em detalhes recolhidos por padrão.
- [x] Cobrir a ordem visual e a separação dos dados com testes focados; nenhuma migration, API, provider ou contrato de persistência foi alterado.
- [ ] Executar smoke autenticado e revisão visual do perfil expandido em viewport estreito, desktop e dark mode.

## Minerador R1.3 — compactação visual do Perfil da Keyword — 2026-08-18

- [x] Omitir placeholders e campos vazios, mantendo situação, confiança e estados de processo legíveis.
- [x] Condicionar URL/canonical ao contexto publicado e retirar origem técnica do bloco principal.
- [x] Mostrar Google Ads/DataForSEO, KGR e IA em estados vazios compactos; expandir somente com dados reais.
- [x] Aplicar Bento responsivo por processo, wrapping seguro e decisão humana compacta sem repetir pendências.
- [x] Preservar payloads, históricos, request IDs, versões e proveniência em detalhes técnicos recolhidos.
- [x] Validar localmente com 28 testes focados, lint direcionado, guard visual e `git diff --check`.
- [ ] Executar smoke visual autenticado em 360/768/1024/1440, light/dark mode, e confirmar interação real do acordeão.

## Minerador R5 — OpenRouter compact output — 2026-08-19

- [x] Compactar a saída do provider para concordâncias por nome, divergências,
  enriquecimentos e ambiguidades remanescentes.
- [x] Expandir a resposta compacta no servidor para o `fieldReviews[]` já
  consumido pelo `ai_review`, checklist humano R6/R6.1 e KeywordDNA.
- [x] Diagnosticar truncamento com `finish_reason`, limite enviado, uso de
  tokens, reasoning sanitizado, modelo e modo de `response_format`.
- [x] Adaptar `json_schema`/`json_object` pela capacidade declarada sem trocar
  modelo/provider e bloquear explicitamente quando nenhum formato mínimo é
  compatível.
- [x] Validar localmente sem chamada paga: testes focados e loader canônico
  aprovados; schema, migration, provider, Connection e métricas quantitativas
  preservados.
- [ ] Repetir smoke autenticado real de R5 com `marketing digital`; confirmar
  `finish_reason = stop`, readback de `ai_review` e Volume/Resultado/KGR/CPC
  invariáveis. Não repetir automaticamente enquanto o smoke não for autorizado.
## Descoberta — filtros SEO por Resultado e KD — 2026-08-19

- [x] Adicionar intervalos locais mínimo/máximo para Resultado e KD sem chamada automática DataForSEO.
- [x] Reutilizar a ação explícita existente de enriquecimento DataForSEO para atualizar Resultado + Keyword Overview/KD nas candidatas selecionadas.
- [x] Preservar zero, `null`, snapshot da Descoberta, tenant `brandId` e revalidação posterior no Processador.
- [x] Cobrir filtros, ausência, ausência≠zero, separação de providers e ausência de `fetch` nos controles locais com testes direcionados.
- [ ] Executar smoke autenticado: pesquisar no Google Ads, medir explicitamente SEO em lote, aplicar Resultado/KD e confirmar visualmente em 360/768/1024/1440 e dark mode.

## Descoberta — reorganização da bulk bar — 2026-08-19

- [x] Ordenar a barra como `Atualizar métricas`, `Medir resultados` e `Enviar selecionadas ao Processador`.
- [x] Manter contadores à esquerda e `Limpar seleção` separado à direita.
- [x] Remover `Exportar` somente da bulk bar da Descoberta.
- [x] Manter medições opcionais e permitir envio sem volume, Resultado ou KD previamente medidos.
- [x] Cobrir ordem, ações explícitas, ausência de chamadas automáticas e ausência de gate no envio.
- [ ] Executar smoke autenticado visual e confirmar o handoff com snapshots presentes e ausentes.

## Minerador — distribuição inicial de InfoHint — 2026-08-19

- [x] Reutilizar o `InfoHint` global sem criar tooltip local, query selector ou implementação por página.
- [x] Explicar conceitos e métricas do primeiro lote: Volume, KGR, Intenção, Nicho, Funil, Silo/Categoria, Status e Perfil da keyword.
- [x] Explicar ações operacionais sem alterar handlers: Processar lógica, Atualizar métricas, Revisar com IA, Revisar e Enviar ao Arquiteto.
- [x] Manter pré-condições, erros e controles autoexplicativos visíveis sem depender do tooltip.
- [x] Validar localmente com testes focados, lint direcionado, guard visual e `git diff --check`.
- [ ] Executar revisão manual autenticada em Minerador/Descoberta, incluindo hover, foco por teclado, dark mode e viewport estreito.
- [ ] Distribuir o próximo lote no Arquiteto somente após essa revisão manual; depois seguir Radar, Planejador, Redator, Publicações e Marca.

## Minerador — exclusão e ciclo de vida da keyword — 2026-08-20

- [x] Auditar FKs e referências de medições, descoberta, proveniência, DNA, workflow e publicação antes da exclusão.
- [x] Bloquear exclusão definitiva quando houver histórico ou publicação e exigir readback antes de refletir remoção na UI.
- [x] Remover a exclusão automática de duplicatas durante o carregamento e manter a ação explícita tenant-scoped.
- [x] Preservar medições, histórico, proveniência e dados de outras marcas; não adicionar `CASCADE`, migration ou ferramenta de purge.
- [ ] Definir em SDD um contrato próprio de arquivamento/soft delete, caso o produto precise retirar keywords com histórico sem exclusão definitiva.

## Minerador — homologação / purge controlado de dados de teste — 2026-08-20

- [x] Preparar dry-run read-only com `PURGE_PLAN`, IDs exatos, contagens de dependências e inventário de FKs.
- [x] Preparar helper manual isolado, Admin-only, gated por homologação, com `approvedPlanHash`, subtransação por keyword e readback.
- [x] Bloquear publicação, histórico protegido, cross-brand, drift e referências estruturais desconhecidas; preservar o botão normal `Excluir`.
- [x] Validar localmente com testes estáticos, sem provider, SQL remoto, schema, migration ou escrita de dados.
- [ ] Executar manualmente somente após revisão do plano e autorização operacional dos IDs de teste; nenhum purge é disparado ao abrir o Minerador.

## Minerador — pre-delete dependency audit — 2026-08-20

- [x] Remover do catálogo ativo o descriptor legado `brand_site_keyword_candidates`, cuja migration 0004 permanece preparada/não aplicada e sem consumidor remoto canônico confirmado.
- [x] Manter dependências canônicas obrigatórias em fail-closed e distinguir `clear`, dependência bloqueante e falha de auditoria.
- [x] Registrar diagnóstico sanitizado com chave, tabela, coluna, código e categoria do erro sem expor segredos.
- [x] Validar localmente com 13 testes focados, sem provider, SQL remoto, migration, schema, purge ou dados.
- [ ] Executar smoke autenticado do botão normal `Excluir` e confirmar readback no ambiente alvo.

## Minerador — camada InfoHint e barra de processos — 2026-08-20

- [x] Reutilizar o `InfoHint` compartilhado nos seis processos, com glyph independente do botão e textos funcionais curtos.
- [x] Aplicar glyph visível somente aos conceitos de tabela/Descoberta que precisam de atenção; manter headers e campos comuns como triggers textuais sem glyph adicional.
- [x] Dar forma compacta e perceptível a cada processo, preservando estado ativo, disabled, progresso e handlers existentes.
- [x] Cobrir Processor/Descobrir com 10 testes focados e passar o guard visual.
- [ ] Executar homologação visual autenticada em 360/768/1024/1440, light/dark mode, foco, Escape e tooltip próximo às bordas.

## Plataforma/Minerador — lifecycle global e exclusão canônica — aplicado — 2026-08-20

- [x] Formalizar que keyword não publicada exige confirmação digitada pelo nome exato e pode receber hard delete imediato, sem bloqueio por processamento, métricas, proveniência, DNA ou histórico próprio.
- [x] Formalizar que somente publicação server-side real — vínculo formal de site ou linhagem até `PublicationRecord` — ativa tombstone recuperável de 24 horas; status legado isolado não basta.
- [x] Preparar RPC transacional de hard delete, remoção recuperável, restore e purge vencido; manter `partialDelete = false` e sem CASCADE genérico.
- [x] Limpar dependências próprias, preservar referências compartilhadas, artefatos editoriais, hashes, anotações, eventos append-only e publicação downstream.
- [x] Retirar tombstones das grades/consumidores operacionais e adicionar painel de recuperação com restore e tempo aproximado, sem countdown por segundo.
- [x] Implementar a camada compartilhada `lib/lifecycle/`, confirmação digitada/impacto/recuperação e integração do Minerador sem `delete` client-side.
- [x] Validar manualmente a variante hard delete autenticada em viewport mobile, tablet e desktop, incluindo match, Enter inválido, Escape e limpeza ao reabrir; a variante publicada permanece dependente de registro publicado elegível.
- [x] Aplicar manualmente 0047 somente após preflight, baseline/fingerprint e drift gate; post-verifier remoto passou antes do cleanup.
- [x] Limpar a allowlist de homologação com a RPC tipada: três raízes removidas, dois ArticleDNA preservados, zero PublicationRecord tocado e readback PASS.
- [ ] Executar smoke autenticado de não publicado processado, publicado formal recuperável, restore dentro de 24 horas e purge somente após vencimento.
- [ ] Adotar handlers de lifecycle nos demais módulos editoriais quando seus contratos de exclusão forem habilitados; não inferir publicação por labels ou workflow.
- [ ] Executar o pipeline novo gradualmente em Minerador → Arquiteto → Radar → Planejador → Redator → Publicações.

## Minerador — respiro horizontal das barras superiores do Descobrir — 2026-08-20

- [x] Aplicar padding horizontal responsivo somente nas barras superiores de busca e filtros do Descobrir.
- [x] Preservar tabela/planilha, handlers, filtros funcionais, InfoHints, providers, APIs e persistência.
- [x] Adicionar teste focado para o wrapper de espaçamento e os invariantes da tabela.
- [ ] Homologar visualmente em 360/768/1024/1440, incluindo dark mode e ausência de overflow.

## Minerador — integridade de intenção, nicho, funil e confirmação humana — 2026-08-20

- [x] Corrigir os sinais determinísticos de `a domicilio` e de serviço de estética sem transformar heurística em verdade semântica final.
- [x] Preservar a projeção pelo read-model canônico e manter a intenção externa do DataForSEO independente da intenção lógica/humana.
- [x] Bloquear conclusão humana enquanto divergências, enriquecimentos, aplicabilidade KGR ou campos estratégicos sem evidência permanecerem sem decisão.
- [x] Permitir confirmação explícita de desconhecido para Intenção, Nicho e Funil sem inventar valor.
- [x] Fazer o status final consumir confirmação humana válida, não apenas marcador legado de revisão.
- [x] Cobrir engine, read-model, revisão humana, freshness, revalidação e R5.2 com testes locais; nenhum provider pago foi chamado.
- [ ] Repetir smoke autenticado da keyword real `manicure e pedicure a domicilio`, conferir persistência/readback remoto e validar visualmente a revisão em desktop/mobile.

## Minerador — consistência canônica, completude e reabertura da revisão — 2026-08-20

- [x] Criar um snapshot/read-model único para tabela, Perfil da Keyword, Revisão Humana e Decisão.
- [x] Preservar o score KGR atual quando calculável e separar score de aplicabilidade, sem alterar o cálculo.
- [x] Projetar CPC, KD, Resultado, Volume, intenção canônica, intenção externa, Nicho e Funil pelos mesmos dados canônicos.
- [x] Diferenciar campo resolvido, indeterminado confirmado e não resolvido; impedir confirmação com pendência estratégica.
- [x] Permitir `Revisar novamente` e `Cancelar` em cópia de trabalho, sem reexecutar provider nem alterar medições.
- [x] Cobrir o contrato com testes focados, lint central e guard visual.
- [ ] Executar smoke autenticado com keyword nova, reload/readback e validação visual da consistência entre as quatro superfícies.

## Plataforma — ajuda contextual global Fase 1 — 2026-08-20

- [x] Criar o contrato tipado compartilhado para áreas, tópicos, busca local e
  ausência explícita de conteúdo, sem fallback cruzado.
- [x] Integrar trigger contextual na `GlobalTopbar` somente nas áreas
  tenantizadas Marca → Publicações, preservando Conta/Admin fora do escopo.
- [x] Implementar drawer responsivo com busca, detalhe, Escape, foco, portal e
  tokens visuais existentes.
- [x] Publicar o piloto local do Minerador com Sobre, Conferir site, Lógica,
  Volume, Resultados, IA e Revisão Humana, sem alterar handlers ou providers.
- [x] Atualizar o contrato compartilhado, o sistema visual e a skill
  `app-visual-system`.
- [ ] Criar e validar conteúdo próprio das demais áreas; não liberar fallback
  global enquanto os contratos locais não estiverem confirmados.
- [ ] Repetir homologação visual autenticada em light mode quando o ambiente
  oferecer o alternador de tema.

## Minerador — proteção de largura de Resultados e Volume — 2026-08-20

- [x] Preservar `Resultados` e `Volume` com presets e mínimos legíveis nas
  tabelas de Descobrir e Processar.
- [x] Fazer a projeção responsiva reduzir primeiro colunas flexíveis e
  secundárias, mantendo scroll horizontal quando necessário.
- [x] Manter InfoHint, ordenação, resize manual, handlers, dados e tabela sem
  redesign funcional.
- [x] Validar o contrato local com 28 testes focados, guard visual e diff check.
- [ ] Executar screenshot autenticado em 1024/1440/1920px, F5 e resize manual;
  não criar persistência de largura sem requisito posterior explícito.

## Minerador — contrato rígido de processamento e estabilização R5 — 2026-08-20

- [x] Centralizar a completude de site, lógica, Volume, Resultados, KGR, IA e Revisão em `resolveMineradorProcessState()`.
- [x] Diferenciar tentativa (`not_run/running/success/failed`) de artefato (`missing/current_valid/stale/invalid`) sem apagar evidência anterior em falha.
- [x] Exigir validação e readback antes da promoção verde; conferir `measuredAt` nas revalidações Google Ads/DataForSEO.
- [x] Manter KGR automático dependente de Volume e Resultado atuais, aceitando zero real e sem botão próprio.
- [x] Vincular a conclusão da IA ao parse/schema/readback e ao `inputHash` atual; vincular a Revisão Humana à mesma revisão de IA.
- [x] Compactar a Phase 2 do R5 para três itens curtos por categoria e teto local de 1100 tokens.
- [x] Adicionar no máximo um retry de truncamento da Phase 2, somente em DeepSeek e ação explicitamente iniciada pelo usuário, com Usage/progresso identificáveis.
- [x] Manter três fases, provider/modelo/connection e contratos Google Ads/DataForSEO sem fallback ou migration.
- [ ] Executar smoke autenticado real com `unhas de gel preço`, confirmar Phase 2 PASS, persistência/readback e check verde da IA.
- [ ] Validar no navegador que truncamento duplo mantém dados anteriores, deixa retry manual disponível e não deixa a keyword presa em estado intermediário.
- [ ] Avaliar futuramente se a distinção de tentativa após reload exige evolução estrutural; não criar schema neste bloco.

## Minerador — rollout de conteúdo da ajuda contextual — 2026-08-20

- [x] Expandir o catálogo local com tópicos gerais, Descobrir, Processar,
  Perfil da Keyword e Revisão/Decisão.
- [x] Preservar os IDs do piloto e adicionar aliases de busca para os termos
  reais da interface.
- [x] Manter a ajuda como orientação: não criar fallback, provider, chamada
  paga, alteração de dados ou decisão automática.
- [x] Validar o catálogo com 5 testes focados e o guard do sistema visual.
- [ ] Homologar visualmente o conteúdo no drawer autenticado em Descobrir e
  Processar, em 360/768/1024/1440 e nos temas disponíveis.
- [ ] Avaliar uma extensão futura de escopo por aba somente em bloco próprio,
  caso o contrato compartilhado passe a suportar esse contexto sem quebrar as
  áreas existentes.

## Minerador — R5 Phase 3: alinhamento de schema e reparo único — 2026-08-20

- [x] Auditar o schema Zod real e manter o contrato estrito sem permissividade
  ou campos semânticos inventados.
- [x] Alinhar o prompt da Phase 3 com os objetos reais de divergência e
  enriquecimento e incluir exemplo JSON mínimo válido.
- [x] Implementar no máximo uma tentativa `repair_1` somente para schema
  inválido da Phase 3 em ação explícita; não repetir Phase 1/2.
- [x] Preservar distinção entre schema inválido, JSON inválido e truncamento.
- [x] Adicionar `responseShape`, `schemaIssuePaths` e `schemaIssues` ao
  diagnóstico/Usage sanitizado.
- [x] Cobrir saída válida, reparo bem-sucedido, reparo inválido, ausência de
  ação explícita e truncamento com 20 testes focados.
- [ ] Executar smoke autenticado real com DeepSeek para `manicure proximo a
  mim`, confirmar repair/readback e check verde da IA.

## Minerador — convergência do pipeline e confiabilidade R5 — 2026-08-20

- [x] Centralizar as três fases no envelope compartilhado com teto de duas
  chamadas por fase e recuperação somente na fase que falhou.
- [x] Compactar a Phase 1 para o contrato necessário à Phase 3/R6 e elevar seu
  teto local para 1100 tokens; manter Phase 2 em 1100 e Phase 3 em 600.
- [x] Preservar o reparo estrutural único da Phase 3 e impedir loops ou
  reinício de fases já válidas.
- [x] Registrar fase, tentativa, retry, tokens, custo, provider/modelo e
  `executionRequestId` no progresso/Usage; sucesso só após persistência e
  readback finais.
- [x] Exigir `logical_output_contract` completo para promover Lógica e para os
  gates que a consomem, sem inventar valores ausentes.
- [x] Preservar artefato lógico anterior quando uma reexecução falha e cobrir
  a convergência com fixtures sem provider pago.
- [ ] Executar smoke autenticado real do pipeline completo e confirmar retry,
  persistência, readback e correlação dos notices após reload.

## Minerador — Funil lógico sem `Pendente` final — 2026-08-20

- [x] Resolver TOFU para termos amplos reconhecíveis sem sinal mais forte,
  inclusive com Intenção ambígua.
- [x] Resolver MOFU/BOFU por comparação, consideração, ação, contratação,
  preço e localidade explícita.
- [x] Registrar desconhecido semântico pelo contrato lógico existente e
  apresentar `Indefinido` no read-model comum.
- [x] Adicionar InfoHint visível à coluna Funil e atualizar o tópico detalhado
  do ContextHelp.
- [x] Cobrir a mudança com testes de lógica, contrato, read-model e tabela.
- [ ] Fazer smoke visual autenticado e confirmar a leitura em todos os
  consumidores do KeywordDNA.

## Minerador — Funil: InfoHint visível e label de apresentação — 2026-08-21

- [x] Manter glyph InfoHint global visível no header da coluna Funil com a
  explicação completa de TOFU, MOFU e BOFU.
- [x] Impedir propagação do clique do InfoHint para qualquer ordenação da
  tabela, sem criar tooltip local ou alterar handlers de sort.
- [x] Atualizar o read-model de apresentação para `Indefinido` quando a Lógica
  terminou sem evidência suficiente; `Pendente` continua reservado a processo
  incompleto.
- [x] Atualizar o tópico do ContextHelp para “Entender TOFU, MOFU e BOFU” e
  incluir aliases de funil, jornada, topo/meio/fundo e Indefinido.
- [ ] Homologar visualmente o glyph, tooltip e label em 360/768/1024/1440px,
  nos temas claro/escuro e com cabeçalho de tabela em uso.

## Minerador — R5 como revisora semântica acionável — 2026-08-21

- [x] Restringir divergências da IA aos campos semânticos revisáveis e manter
  fatos de Google Ads, DataForSEO, KGR, targeting e identidade somente como
  evidência imutável.
- [x] Filtrar divergências que repetem a lógica, sugestões de Funil pendente,
  fatos medidos, duplicações e enriquecimentos genéricos; limitar
  enriquecimentos úteis a três itens.
- [x] Compactar concordâncias na Revisão Humana e deixar correções,
  enriquecimentos e ambiguidades como o caminho operacional principal.
- [x] Humanizar referências de evidência na interface e apresentar o Funil
  processado sem classificação como `Indefinido`.
- [ ] Executar smoke autenticado real com IA, confirmar divergências úteis,
  enriquecimentos filtrados, persistência/readback e reabertura sem chamada
  automática.
- [ ] Homologar visualmente a Revisão Humana e a proveniência nos breakpoints
  360/768/1024/1440px e nos temas disponíveis.

## Minerador — R6: artefatos independentes, freshness e revisão humana — 2026-08-24

- [x] Criar SDD e auditoria estrutural sem chamadas de provider, escrita
  remota, migration ou alteração de runtime.
- [x] Documentar o acoplamento atual do read-model, os hashes existentes,
  tentativas locais, readbacks e a preservação de artefatos anteriores.
- [x] Definir a matriz formal de reprocessamento para Lógica, Volume,
  Resultados, IA e Revisão.
- [x] Definir a política de conclusão explícita da Revisão Humana:
  divergência → `keep_logic`, enriquecimento → `ignore`, desconhecido
  estratégico → `confirm_unknown`.
- [ ] Aprovar o SDD antes de alterar o envelope de artefatos, hashes,
  freshness ou o gate de conclusão humana.
- [ ] Implementar o contrato aprovado com regressões de independência,
  preservação, readback, reload e smoke autenticado.

## Próxima sequência — consolidação semântica do KeywordDNA após front-first — 2026-08-28

O Perfil foi validado manualmente pelo usuário como composição front-end. Os itens abaixo são posteriores, independentes e não são considerados entregues por preview local, teste de interface ou cópia de trabalho.

1. [ ] Implementar a qualificação semântica real por SERP no Minerador.
2. [ ] Executar smoke real de Intenção/Funil com evidência semântica SERP.
3. [ ] Definir e aprovar critérios de força para a evidência semântica.
4. [ ] Implementar persistência e versionamento de KeywordDNA consolidado.
5. [ ] Implementar handoff real Minerador → Arquiteto com versão imutável.
6. [ ] Implementar consumidor do Arquiteto para a versão consolidada.
7. [x] Fornecer contexto de marca à IA sem transferir-lhe autoridade canônica; o consumidor contextual local foi implementado sem autoridade canônica.
8. [x] Criar a Skill de voz da Marca; a fundação persistente e o gabarito `brand_voice` já estão disponíveis.
9. [x] Implementar plano de apresentação da keyword por IA como saída contextual, não como decisão de Intenção/Funil; smoke real permanece pendente.

## Minerador — primeiro consumo real de Brand Skill por IA — 2026-08-28

- [x] Conectar o Perfil da Keyword à Apresentação Contextual por ação explícita, usando o provider canônico vigente e sem mutar KeywordDNA.
- [x] Resolver BrandDNA aprovado quando existir e a `brand_voice` corrente válida da mesma Brand, com contexto compacto e proveniência de Skills efetivamente aplicadas.
- [x] Preservar Intenção/Funil canônicos, fatos medidos, SERP, KGR e decisões humanas fora da autoridade da IA.
- [x] Tratar ausência de Skill corrente válida como apresentação neutra não bloqueante; rascunhos persistidos entram explicitamente pela política canônica.
- [ ] Executar smoke autenticado real na Care Glow com a `brand_voice` v1 `draft` e comparar a apresentação com KeywordDNA, BrandDNA (quando disponível) e Skill aplicada.
- [ ] Definir persistência/versionamento da apresentação somente em tarefa própria, caso o produto aprove a saída como artefato não canônico.

## Minerador — IA contextual congelada e próxima frente estrutural — 2026-08-28

Substitui a entrada parcial anterior desta frente. Smokes reais **PASS** com Care Glow em `skin care noturno`, `retinol principia antes e depois` e `mascara skin care`. Working copy não é persistência: a apresentação existe apenas na sessão.

- [x] Tornar o processo IA a Apresentação Contextual, com gatilho único na barra e sem revisão semântica R5 no fluxo operacional.
- [x] Consumir a Voz da Marca pela infraestrutura compartilhada da Marca, por `brandId`, com proveniência de versão (`definitionKey`, `versionId`, `versionNumber`, `contentHash`, `lifecycleStatus`).
- [x] Adotar saída em texto puro do provider com contrato `ContextualPresentation { text }` montado pela aplicação.
- [x] Manter a IA opcional e sem autoridade sobre Intenção, Funil, SERP, KGR ou status editorial.
- [x] Retirar Volume, Resultados, KD, KGR, Intenção, Funil, SERP e status editorial dos insumos da apresentação.
- [x] Corrigir a semântica de lifecycle: disponível para uso não é sinônimo de aprovada.
- [x] Recovery de conteúdo truncado: `TRUNCATED_EMPTY_CONTENT_RECOVERY` com `MAX_PROVIDER_ATTEMPTS_PER_OPERATION = 2`, sem retry para erros não recuperáveis e com accounting por tentativas reais.

### Próxima frente estrutural — persistência e versionamento da Apresentação Contextual

Status: **REQUIRES_SDD**. Não implementar antes da SDD aprovada. O desenho precisa decidir, no mínimo:

1. [ ] Entidade/artefato proprietário da apresentação — **não reutilizar `ai_review` R5**.
2. [ ] `brandId` como escopo canônico.
3. [ ] `keywordId` da apresentação.
4. [ ] `inputKeywordDnaRef` da execução.
5. [ ] `text` da apresentação.
6. [ ] `version` do artefato.
7. [ ] `contentHash` do conteúdo.
8. [ ] `appliedSkillRefs` com versão, hash e lifecycle das Skills aplicadas.
9. [ ] Referência da versão de BrandDNA quando existir.
10. [ ] Proveniência de execução (provider, modelo, request/operation ids, usage).
11. [ ] Lifecycle do artefato.
12. [ ] Imutabilidade da versão publicada.
13. [ ] Sucessão de versão.
14. [ ] Rollback aditivo e reversível.
15. [ ] Handoff downstream.
16. [ ] Consumo pelo Planejador.
17. [ ] Consumo pelo Redator.

### Observação não prioritária — orçamento de reasoning

Se as falhas de conteúdo vazio persistirem mesmo após as 2 tentativas, avaliar **A.** completion budget específico da Apresentação Contextual ou **B.** `thinkingMode` explícito para esta operação. Não implementar agora; enquanto o recovery estiver funcionando, isto **não** é débito bloqueante.

### Outras pendências relacionadas

- [ ] BrandDNA aprovado da Care Glow (hoje é lacuna declarada).
- [ ] Loader canônico server-side de materiais aprovados da Marca.
- [x] SERP real da Qualificação Semântica para Intenção/Funil canônicos — CALL 3 implementada e smoke real PASS.

### Persistência canônica da Qualificação Semântica — 2026-08-28 · homologada em 2026-08-29

SDD: [sdd-persistencia-qualificacao-semantica-serp-2026-08-28.md](propostas/sdd-persistencia-qualificacao-semantica-serp-2026-08-28.md).

- [x] Aplicar o CHECK de `keyword_semantic_qualification` (operação manual do responsável).
- [x] Smoke manual de F5 e de outro navegador, sem chamada DataForSEO no read.
- [x] Keyword inconclusiva mantendo "SERP · Analisada · sem consolidação" após F5.
- [ ] Smoke do gate de aprovação e do handoff com Qualificação consolidada.
- [ ] Reprocessar keywords cuja Qualificação existia apenas em sessão (não há backfill: exige nova execução do Resultados).
- [ ] Avaliar exibição de histórico de versões da Qualificação no Perfil (hoje só a versão corrente é lida).

### SERP advanced + Apresentação Contextual — fechamento de 2026-08-29

Estado canônico em [estado-atual.md](estado-atual.md#minerador--serp-advanced--apresentação-contextual-persistida-estado-homologado--2026-08-29).

Concluído nesta frente:

- [x] CALL 3 da Qualificação Semântica migrada de `regular` para `advanced` (3 chamadas por keyword, sem quarta).
- [x] Derivação v2 com cobertura e dominância separadas, sinais estruturais e reforço fora do denominador.
- [x] Persistência e F5 da Qualificação Semântica.
- [x] CHECK aceitando `keyword_contextual_presentation`.
- [x] Store da Apresentação: write, readback, v2 com `previous_version_id`, idempotência e isolamento por Marca.
- [x] Apresentação Contextual sobrevivendo a F5 (fim do "sumiu depois do reload").
- [x] Thinking desabilitado só nesta operação, com raciocínio zerado medido.
- [x] Teto do parser da apresentação ajustado para conteúdo válido real (2.200 → 3.200).
- [x] Domínios de falha da IA separados: geração, resposta e persistência deixaram de se confundir.
- [x] Overflow horizontal do Perfil (nowrap herdado pelo `td colSpan`).
- [x] Estado visual da IA: "falhou" deixou de ser exibido como "não executada".

Pendências operacionais desta frente:

- [ ] Validação manual cross-browser da Apresentação Contextual persistida.
- [ ] F5 do lote de 8 keywords (a geração e a persistência do lote já passaram; a reidratação do lote não foi verificada).
- [ ] Smoke manual ponta a ponta Minerador → Arquiteto transportando a `presentationRef`.
- [ ] Validação manual mais ampla de navegação e seleção da planilha (só o overflow foi reproduzido e corrigido).
- [ ] Acumular amostra real de SERPs para eventual recalibração ou consolidação dos thresholds da derivação v2 — hoje `PROVISIONAL_HEURISTIC`.
- [ ] Reconciliação do migration ledger (frente separada; `db push` não é seguro enquanto ela existir).

## Aprovação humana sem gates editoriais e independência dos processos — 2026-08-29

Estado canônico em [estado-atual.md](estado-atual.md#minerador--aprovação-humana-sem-gates-editoriais-e-independência-dos-processos--2026-08-29). SDD em [propostas/sdd-aprovacao-humana-sem-gates-editoriais-2026-08-29.md](propostas/sdd-aprovacao-humana-sem-gates-editoriais-2026-08-29.md).

Concluído nesta frente:

- [x] Aprovar/rejeitar deixou de exigir Revisão Humana, SERP persistida e SERP consolidada.
- [x] `gateReason()` do handoff reduzido a integridade técnica (Brand ativa + status editorial).
- [x] Recusas `INVALID_ARTIFACT` por evidência semântica removidas de `prepareCanonicalHandoff`.
- [x] `lib/minerador/serp-canonical-evidence.ts` removido: o vocabulário de impedimento não tem mais consumidor.
- [x] `semanticState` (`conclusive` | `non_conclusive`) no contrato do handoff, com `intent`/`funnel` honestamente nulos quando a SERP não conclui.
- [x] Estado canônico da Revisão Humana (`no_decision_needed` | `decision_available` | `decisions_recorded`); "Revisão pendente" saiu do KeywordDNA.
- [x] Cobertura A–Q em `tests/minerador-aprovacao-sem-gates.test.mts`, incluindo a regressão de `retinol principia antes e depois`.

Pendências operacionais desta frente:

- [ ] Validação manual na UI autenticada: aprovar keyword com SERP mista, sem IA e sem revisão; reprocessar IA e SERP e confirmar que seleção, linha expandida, aprovação e revisão sobrevivem.
- [ ] Revisar se a Revisão Humana deve ganhar novas decisões humanas reais além da aplicabilidade do KGR — hoje o painel é majoritariamente leitura.
