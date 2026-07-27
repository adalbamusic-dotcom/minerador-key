# Backlog — Minerador

> **Estado vigente — 2026-07-27:** 0005/0006 não são tarefas pendentes de aplicação. O resultado remoto registrado em `estado-atual.md` e `docs/compartilhado/supabase.md` informa 0006 aplicada com validation `READY`; não reexecutar nem executar rollback. Pendências de browser autenticado, RLS real e smoke test continuam manuais.

## Formação compartilhada KGR — registrado em 2026-07-21

- Feito localmente: evidência de Site preservada sem confirmação automática.
- Pendente: qualificação humana/real no Minerador, snapshot SQL/RLS e validação manual autenticada.
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
