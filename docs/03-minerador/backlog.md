# Backlog — Minerador

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

## Google Ads — infraestrutura fixa por env — 2026-08-16

- [x] Implementar `getGoogleAdsPlatformConfig()` como fonte exclusiva server-side para Google Ads.
- [x] Retirar o formulário de credenciais Google Ads da UI ativa e manter o health check explícito.
- [x] Remover do runtime Discovery/Metrics a resolução por Connection, Vault, metadata, binding, grant e quota, sem apagar contratos ou dados.
- [x] Confirmar as seis variáveis Google Ads no `.env.local` e executar os smokes reais sem expor valores.
- [x] Remover `SearchStream` como gate de Discovery/Metrics e preservar `resolveGoogleAdsAdvertiserAccount()` para outros consumidores.
- [x] Fechar o diagnóstico pós-`apiRequestStarted` com classificação de transporte, OAuth, HTTP, sucesso e erro interno; o smoke final com MCC como Research Customer retornou sucesso.
- [ ] Definir em etapa posterior o ledger de Usage para infraestrutura env; o schema atual exige `connection_id` e não foi alterado nesta task.

Estado local: `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV`; `SCHEMA_CHANGE_REQUIRED = NO`; `DATABASE_SCHEMA_CHANGED = NO`.

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
