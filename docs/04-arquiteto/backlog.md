# Backlog — Arquiteto

## Ciclo GlobalTopbar e interface semântica — 2026-08-14

- [x] Auditar o ciclo de registro Arquiteto ↔ GlobalTopbar e confirmar a origem da identidade instável dos controles.
- [x] Separar registro, atualização e cleanup: callbacks estáveis, guarda de identidade, `updateControls` por módulo, refs estáveis para handlers e cleanup protegido contra módulo obsoleto.
- [x] Preservar operações da topbar e do Arquiteto sem alterar contratos, dados, workflow, persistência ou layout da planilha.
- [x] Aplicar tokens semânticos no conteúdo ativo do Arquiteto e variante visual opt-in no popup de histórico; ancorar o popup no botão global e manter fechamento externo/Escape.
- [x] Criar regressão para registro idempotente, atualização de busca, cleanup por módulo, ciclo, seleção por pintura e guard visual.
- [x] Validar localmente `30/30` testes direcionados, `test:arquiteto 101/101`, guard visual, busca/filtros/popups/ações no Chrome e capturas do estado vazio/popover.
- [ ] Repetir validação autenticada com workspace canônico populado: linhas carregadas, seleção individual/Ctrl/Cmd/Shift, pintura com mouse/touchpad, expansão, conflitos, revisável, ArticleDNA/SiloDNA e ações em lote.
- [ ] Revalidar responsividade em 360/768/1024/1440px e light mode quando disponível.
- [ ] Corrigir separadamente os três `TS1501` de `tests/agency-adalba-platform-internal.test.mts` e atualizar as quatro asserções obsoletas de `tests/operational-flow.test.mts`; não misturar essa dívida ao reparo do Arquiteto.

## Fase 2 — preflight da limpeza estrutural — 2026-08-12

- [x] Auditar localmente os objetos exclusivos de 0030 e `tenant_0016_agency_role_rollback`, sem remover migrations aplicadas.
- [x] Confirmar zero consumidor runtime local para as duas tabelas 0030, o helper `canonical_actor_can_execute_brand_exceptional_operation(...)` e a tabela de rollback 0016.
- [x] Preparar `supabase/scripts/structural-cleanup-preflight-read-only.sql` com um único result set catalog-only, contagens, dependências, FKs, RLS, policies, ACL, owner, índices, constraints, views, funções/procedures e triggers.
- [x] Registrar que `pipeline_editorial_protect_append_only()` é compartilhada por consumidores canônicos 0027/0028 e não pode ser removida com 0030.
- [x] Confirmar localmente que a próxima migration existente é `0030`; `0031` permanece reservada/abandonada e `0032` é somente o próximo número elegível, sem arquivo criado.
- [ ] Executar manualmente o preflight remoto e classificar cada objeto como `DROP_SAFE`, `BLOCKED` ou `INVESTIGATE`.
- [ ] Somente após `DROP_SAFE`, gerar snapshot/fingerprint remoto aprovado e propor uma única migration sucessora; não criar migration nesta fase.

**Estado:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`; `REMOTE_OPERATION = NONE`.

## Fase 1 — remoção do runtime histórico abandonado — 2026-08-12

- [x] Auditar imports diretos, referências dinâmicas, route handlers, testes e documentação operacional de recovery/rebaseline.
- [x] Remover `lib/arquiteto/legacy-handoff-reconciliation.ts`, as rotas `/api/arquiteto/handoff/preview` e `/api/arquiteto/handoff/rebaseline`, além dos tipos/schemas/testes exclusivos.
- [x] Separar o handoff normal do fluxo histórico: `prepareCanonicalHandoff()` só cria `keyword/architect/received` para `aprovado`/`publicado` e rejeita workflow remoto incompatível.
- [x] Confirmar que `resolvePipelineContext()`, repositories canônicos, workspace/artifacts, `/api/editorial/*`, `briefings_artigos`, adapters atuais, browser artifact store e recovery local ativo continuam preservados.
- [x] Confirmar que `lib/legacy-routing.ts` permanece ativo por `proxy.ts` e testes de tenant/routing; não é zero-consumidor.
- [x] Não alterar banco, migrations, 0030, rollback 0016, Google Ads legado ou storage do navegador.

O item anterior de recuperação/rebaseline histórico fica **ABANDONADO PARA O
RUNTIME**. SDDs, migrations e scripts read-only permanecem como histórico
`ARCHIVE_ONLY`; não há writer, backfill ou operação remota autorizada.

Pendente separado: migrar os consumidores legados ainda ativos (`briefings_artigos`,
`/api/editorial/workspace`, adapters/operational-flow, recovery local e Google
Ads) antes de qualquer nova limpeza estrutural.

## Smoke pendente — handoff canônico Minerador → Arquiteto após correção do read-model (2026-08-12)

- [x] Preservar no read-model a keyword com workflow remoto `keyword/architect/received` quando ainda não existir ArticleDNA equivalente.
- [x] Manter ArticleDNA canônico como precedência sobre o handoff equivalente por `keywordId`, sem fallback por texto, slug, owner ou storage.
- [x] Preparar `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql` para contagens sanitizadas por `brandId` canônico.
- [x] Smoke autenticado validado pelo usuário em dois navegadores: keyword nova aprovada, workflow remoto, ArticleDNA, F5, reinício da aplicação e leitura pela outra origem. Nenhum recovery histórico, backfill ou SQL mutável foi executado.
- [ ] Validar manualmente a igualdade de elegibilidade no modal `Importar do Minerador` nos navegadores A e B (mesma conta e Brand), inclusive após logout/login. Marcadores legados de `localStorage`/IndexedDB não podem alterar a decisão recebida do servidor.

## Histórico arquivado — recuperação canônica de guards históricos (não executar)

- Validar na UI que `received`, guard remoto e publicado possuem bloqueios e mensagens canônicos distintos; marcador local transitório não pode bloquear a importação.
- [x] Fundação local 0030 de grants/eventos e helper preparada; não inclui writer, rota ou guard remoto.
- [ ] Executar o preflight remoto e obter autorização específica antes de aplicar a 0030; `POST /api/arquiteto/handoff` continua exclusivo de novas keywords e deve rejeitar guard histórico.

## Entregue localmente — padrão visual da planilha do Minerador (2026-07-31)

- Referência extraída de `modules/minerador/minerador-workspace.tsx`: grade fixa e compacta, cabeçalho/fundo escuros, bordas discretas, linha selecionada índigo, hover neutro, controles compactos e barra inferior operacional.
- Aplicação exclusiva em `modules/arquiteto/arquiteto-workspace.tsx`; não houve alteração no Minerador nem em componente compartilhado.
- Colunas e comportamentos do Arquiteto foram preservados; a keyword principal ficou como a única coluna textual elástica e a seleção por pintura não foi modificada.
- Pendente: validação visual manual autenticada lado a lado, em dark mode e nas larguras 360/768/1024/1440px; conferir também clique, Ctrl/Cmd, Shift, pintura, foco, filtros e ordenação.

## Entregue localmente — histórico ancorado (2026-07-31)

- O histórico do Arquiteto usa o popover existente, ancorado abaixo do botão Histórico e fechado por clique externo, Escape ou fechar.
- Ajuste compartilhado retrocompatível em `components/editorial/history-controls.tsx`: o modo popover alinha-se à borda esquerda do disparador e permanece contido na viewport. Consumidor preservado: Minerador.
- Pendente: validação manual autenticada no Arquiteto e no Minerador.

## Entregue localmente — entrada sem recarga duplicada (2026-07-31)

- Removida a segunda chamada automática de `fetchMasterList` na sincronização de sessão do Arquiteto.
- A planilha continua carregando pela assinatura de importação e atualiza somente após mudança efetiva ou ação explícita do usuário.

## Entregue localmente — superfície operacional limpa (2026-07-31)

- Removidos da planilha o painel de recuperação segura, `Resetar não-publicados` e o contador passivo de conflitos lógicos.
- Atualizações de silos não escondem mais uma planilha já recuperada/carregada; o primeiro carregamento vazio continua com feedback de carregamento.

## Regra compartilhada KGR/formação — concluído localmente em 2026-07-21

- SDD e ADR registrados.
- Contratos e gate determinísticos adicionados sem reprocessamento ou migration.
- Fixtures cobrem limite de seis, intenção incompatível, cobertura de volume e KGR não confirmado.
- Pendente: aprovação/validação humana autenticada e confirmação remota do Minerador.

## Entregue nesta etapa — correção semântica do avaliador SERP (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-correcao-avaliador-serp-intencao-kgr.md`; ADR: `docs/00-produto/decisoes/ADR-012-avaliador-serp-intencao-e-kgr-leve.md`.
- `ArticleIntentProfile` ancorado na principal, labels equivalentes normalizadas e sinais de secundárias preservados sem sobrescrever a intenção central.
- Hierarquia separada de formato; snippets tratados como evidência parcial; confiança explícita e gating de recomendações destrutivas.
- Perfil `kgr_light` reduz consultas e mantém todas as referências KeywordDNA; assessment v1 permanece e pode ser marcado desatualizado antes da v2.
- Proveniência Minerador→Arquiteto corrigida para URL publicada, canonical, slug e status.
- **Verificado:** `test:arquiteto` 70/70; testes de provider somente com fixtures. **Pendente:** `test:operational`, TypeScript, lint/build finais e validação browser autenticada.
- **Andamento 2026-07-20:** reparada a regressão que deixava keywords aprovadas recém-importadas fora da `masterList`; a seleção agora é reconciliada com o workspace existente sem reagrupar durante a leitura.
  - **Arquivos alterados nesta etapa:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `tests/operational-flow.test.mts`, `docs/04-arquiteto/estado-atual.md`, `docs/04-arquiteto/backlog.md`
  - **Evidências:** `test:arquiteto` 48/48, `test:operational` 49/49, `npm run build` e `git diff --check` passaram.
  - **Pendente:** validação manual com snapshot exportado e leitura real por marca; `tsc` completo e lint permanecem bloqueados por problemas fora/anteriores ao reparo.
## Agora
- **Objetivo:** restaurar a integridade de importação e hidratação sem executar IA nova.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`, testes e docs do módulo
  - **Arquivos proibidos:** migrations, Minerador e módulos consumidores sem SDD
  - **Dependências:** snapshot completo, dados de diagnóstico e autorização para leitura
  - **Riscos:** perder recovery válido ou promover índice inconsistente
  - **Critério de aceite:** cada keyword importada tem localização; grupos/artigos recuperáveis reaparecem; nenhuma origem é apagada
  - **Testes obrigatórios:** `test:arquiteto`, `test:operational`, validação manual com snapshot
## Próximo
- **Objetivo:** formalizar proposta de persistência/hidratação de SiloPage, se necessária.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `docs/04-arquiteto/propostas/**`
  - **Arquivos proibidos:** código e migrations antes de aprovação
  - **Dependências:** resultado da reconciliação
  - **Riscos:** mudar contrato compartilhado
  - **Critério de aceite:** SDD com consumidores, rollback e testes
  - **Testes obrigatórios:** revisão de contrato
## Depois
Nenhuma tarefa aprovada.

## Entregue nesta etapa — política da principal do Minerador (2026-07-22)

- SDD: `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md`; decisão: `docs/00-produto/decisoes/ADR-016-politica-principal-minerador-arquiteto.md`.
- Consumo determinístico de `primary_keyword_policy` (`locked`, `reviewable`, `free`) com efetivos `locked`, `revisable`, `free`, `conflict` e `unknown`; publicado sozinho não trava a principal.
- ArticleDNA preserva política original/efetiva, contexto humano, métricas da principal, candidatas, decisão, URL, slug, canonical, publicação, relação e snapshots KeywordDNA.
- `ArticleControlContext` separa política/proteção da principal de URL/slug/canonical/marca e expõe o motivo da proteção.
- `kgr_decisao=NAO`/`not_applicable` explícito vira `competitive`; KGR confirmado continua `kgr_light`; ausência não vira não-KGR.
- Confirmação humana permite substituir candidata, cria sucessora versionada, trava a nova principal e conduz a SERP seguinte para `fortalecimento`.
- **Validação:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e build passaram; lint completo da página mantém dívida legada. Browser autenticado, reload real, Supabase/RLS e provider real ainda pendentes.
## Bloqueado
Novas operações de IA até confirmação da integridade.
## Descartado
Limpar localStorage/IndexedDB para "resolver" inconsistência.

## Entregue nesta etapa — SERP de formação e identidade publicada (2026-07-21)

- SDD e ADR registrados.
- Preservação integral da KeywordDNA nos `ArticleKeywordReference` e na transferência aprovada ao Radar.
- Assessment SERP por artigo/keyword, snapshots, hash, recomendações e decisões humanas persistidas por marca.
- Proteção de publicados, identidade sem URL inventada, link seguro e verificação server-side de URL/canonical/sitemap quando fornecido.
- Coluna independente `APROVAÇÃO`, sem criar estado novo.
- **Pendente:** validação manual autenticada; nenhum provider real foi chamado. O build compilou, mas a geração estática falhou em `/admin/marcas` com erro de invariável do Next fora do escopo.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.

## Entregue nesta correção — visibilidade SERP por keyword (2026-07-21)

- Indicador de estado SERP na linha do artigo, com versão e estados de erro/conflito/desatualização.
- Fechamento do preview somente após persistência; expansão automática, aba de suporte e foco na linha sem reload.
- Recomendação renderizada junto à keyword principal ou de suporte, com justificativa, status, data, conflitos e ações `Seguir recomendação`/`Ignorar`.
- Associação determinística por `articleId + keywordId + keywordDnaVersionId`; ordem da lista, texto e índice não participam do vínculo.
- Resultado incompleto ou não hidratado é visível como `Recomendação SERP não associada`, com IDs de KeywordDNA e ArticleDNA.
- **Pendente:** validação manual autenticada do fluxo completo, sem executar chamada paga automaticamente.

## Entregue nesta correção — modos SERP (2026-07-21)

- `assessmentMode: formacao` para artigos novos e `assessmentMode: fortalecimento` para publicados.
- Principal publicada exibida como protegida; conflitos viram oportunidades de fortalecimento, não troca de identidade.
- Ações estruturais antigas permanecem bloqueadas no domínio, inclusive remoção da principal.
- Recomendações de atualização e artigo complementar são registradas como decisão humana sem criar artigo automaticamente.
- Textos corrompidos da UI corrigidos e cobertos por teste de fonte UTF-8.
- **Pendente:** validação manual autenticada dos dois modos e confirmação visual de reload/persistência.

## Entregue nesta etapa — contexto URL/arquitetura/KGR (2026-07-21)

- Contratos aditivos e retrocompatíveis para relação keyword↔URL, situação arquitetural e identidade KGR.
- Três modos SERP resolvidos pelo contexto recebido, com `arquitetura_publicado` para publicado ainda não consolidado.
- Proteção independente de URL/slug/canonical/marca, principal confirmada e vínculo KGR confirmado.
- Confirmação arquitetural cria sucessora real do ArticleDNA e preserva a identidade publicada.
- Radar recebe os campos sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram.
- **Pendente:** validação manual autenticada de candidato publicado, confirmação, KGR confirmado/candidato, reload, troca de marca e envio ao Radar; nenhuma chamada real foi executada.

## Entregue nesta etapa — ArticleDNA estratégico (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md`; decisão registrada em `docs/00-produto/decisoes/ADR-013-article-dna-contexto-estrategico.md`.
- ArticleDNA agora entrega estratégias determinísticas de intenção, KGR, volume, hierarquia, propósito e contribuição individual, sem duplicar a origem KeywordDNA.
- `ArticleControlContext` é a projeção compartilhada e retrocompatível; o Radar recebe apenas um campo opcional, sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, TypeScript, lint focado e `npm run build`.
- **Pendente:** validação manual autenticada, provider/SERP reais e confirmação do schema remoto/RLS.

## Entregue nesta etapa — perfis de unidades KGR/não KGR e SERP (2026-07-22)

- Classificação aditiva de artigo, serviço, landing, categoria e outro, com evidências e confirmação humana.
- Propósito editorial com objetivo, necessidade de busca, conversão e indexação.
- Estratégia SERP combinando ciclo editorial, competição e perfil da unidade sem enumeração única.
- KGR confirmado em `kgr_light`, não KGR explícito em `competitive`, ausência/candidato/conflito em `unknown`.
- Proteção de publicados, histórico de assessments e sucessor versionado para decisões humanas.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript.
- **Pendente:** `test:operational`, build, validação manual autenticada, providers reais e schema remoto/RLS.

## Entregue nesta etapa — criador manual de SiloDNA/SiloPage (2026-07-21)

- Modal não solicita mais `Nicho`; exige nome e keyword/entidade central.
- Criação somente de SiloDNA funciona mesmo sem artigos e não inventa KeywordDNA.
- Criação opcional de SiloPage preserva slug, situação, URL publicada e verificação inicial em contratos separados.
- `published` exige URL no domínio da marca ativa, mas inicia como `not_checked`; URL, slug e canonical não são sobrescritos automaticamente.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build.
- **Pendente:** roteiro manual autenticado, conferência online explícita e confirmação do schema remoto/RLS.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/arquiteto; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Acesso autenticado a listas_kgr — 2026-07-24

- Causa compartilhada diagnosticada: o cliente browser não propagava corretamente o token Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção local: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também restringe keywords por `brand_id` antes de aceitar keywords sem `lista_id`.
- O log de falha de `listas_kgr` preserva código, tabela, operação, status e mensagem, sem expor tokens.
- Sem alteração de RLS, grants, migration, keywords, `lista_id`, `brand_id`, owner ou memberships.
- Pendente: smoke test manual autenticado e confirmação online; nenhum SQL remoto foi executado nesta correção.

## Ciclo JWT NextAuth → Supabase — concluído localmente — 2026-07-24

- Implementado refresh server-side do JWT Supabase com margem de 60 segundos e lock por refresh token.
- Cliente compartilhado usa callback `accessToken` dinâmico; SELECT do ecossistema possui no máximo um retry após JWT expirado.
- Google OAuth foi separado do JWT Supabase; erros registram somente código, tabela, operação, status e `tokenExpired`.
- Pendente: reiniciar o servidor, sair/entrar novamente e executar smoke test manual autenticado no Arquiteto. Migrations 0005/0006 não devem ser reexecutadas.

## Diagnóstico final da sessão NextAuth → Supabase — concluído localmente — 2026-07-24

- Concluído: Arquiteto e Minerador compartilham resultado estruturado e diagnóstico seguro da sessão Supabase.
- Concluído: erro de sessão expirada é reservado para `SUPABASE_TOKEN_EXPIRED`; falha de refresh possui mensagem própria.
- Pendente: login Google real e confirmação da configuração remota do provider; nenhuma operação remota foi executada.

## Fechamento da sessão incompleta Google → Supabase Auth — concluído localmente — 2026-07-24

- Concluído: o Arquiteto não é alcançado com `supabaseAuth.status = error`; o callback falho retorna reason seguro e exige novo login.
- Concluído: Credentials continua validando access/refresh token real do Supabase.
- Pendente: smoke test Google real e confirmação da configuração remota do provider.

## Entregue nesta etapa — refinamento visual do Arquiteto (2026-07-27)

- Barra superior agrupada por função sem remover ações; tabela e expansão preservam a densidade operacional, mas elevam hierarquia, legibilidade e foco.
- Política da principal, intenção, KGR, aprovação, publicação, ArticleDNA, SERP e recomendações receberam agrupamento visual mais claro; URL publicada continua clicável e protegida.
- `WorkflowStatusBadge` e `HistoryControls` receberam apenas opções aditivas de densidade; consumidores existentes preservam o estilo compacto.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, `npm run build` com 47 páginas e `git diff --check`.
- **Pendente:** validação manual real no navegador autenticado em dark/light, 360/768/1024/1366/1440px e estados de interação. Lint integral da página continua com dívida legada.

## Entregue nesta etapa — correção da regressão visual e densidade operacional (2026-07-27)

- Corrigidos somente os trechos visuais responsáveis pela regressão: topo alto, badges grandes nas linhas, tabela sem scroll horizontal interno, célula da keyword sobrecarregada, recuperação pesada e rodapé com ações pequenas.
- A tela retorna a um cockpit compacto em 100%: topo de 48px, controles compactos, tabela com min-width reduzido e scroll horizontal interno, keyword em duas linhas e rodapé com ações legíveis.
- Scrollbar discreta foi aplicada somente aos containers do Arquiteto; nenhum estilo global ou módulo vizinho foi alterado.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, `npm run build` com 47 páginas e `git diff --check`.
- **Pendente:** validação visual manual autenticada em 1366×768, 1440×900 e 1920×1080, zoom 100%, light/dark, responsividade e estados interativos. ESLint mantém dívida legada da página consolidada.

## Entregue nesta etapa - seleção livre, intervalos e arraste (2026-07-29)

- Controlador local aditivo em `lib/arquiteto/article-selection.ts`: clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, cabeçalho visível e arraste idempotente.
- A ordem do intervalo vem de `groupedArticles` após busca, filtros, ordenação e agrupamento; cabeçalhos de silo e itens ocultos não entram. Seleção oculta permanece no conjunto e o contador informa total/visíveis.
- A âncora é reiniciada com segurança ao trocar `brandId`, remover artigo ou limpar seleção. Nenhuma seleção é persistida remotamente e nenhuma ação editorial é executada pelo gesto.
- **Verificado:** `tests/arquiteto-selection.test.mts` 8/8, `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, lint dos arquivos novos, build e `git diff --check`.
- **Pendente:** roteiro manual no navegador autenticado em zoom 100%, incluindo arraste para marcar/desmarcar, pointercancel, foco/Space, estado mixed, filtros/ordenação, contador total/visível e isolamento ao trocar de marca. O arraste não é declarado validado sem esse teste.

## Correção do arraste que selecionava texto (2026-07-29)

- Removida a dependência de `pointerenter` entre checkboxes. O gesto captura o ponteiro no checkbox inicial e resolve a linha atravessada por coordenadas e `getBoundingClientRect()` das linhas visíveis.
- Ao ultrapassar 5px, o controlador impede seleção nativa de texto, aplica a ação aos IDs intermediários, evita a duplicação do clique final e restaura `user-select`/captura ao encerrar.
- **Verificado:** teste direcionado atualizado para 8/8, TypeScript e lint dos arquivos novos. Build, suítes completas e validação manual no Chrome permanecem no roteiro final desta correção.

## Pintura imediata por snapshot (2026-07-30)

- Implementada `applySelectionPaint({ initialSelectedIds, visibleIds, anchorId, currentId, mode })`, sem conjunto de IDs visitados.
- O `pointermove` localiza a checkbox sob o ponteiro por `elementFromPoint` e recalcula a seleção inteira do gesto imediatamente; voltar desfaz visualmente as linhas que saíram do intervalo.
- Clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, cabeçalho, foco, teclado, dark mode e ações em lote permanecem fora da alteração.
- **Verificado parcialmente:** Chrome autenticado validado com caminho de mouse para avanço, retorno, modo desmarcar e ausência de seleção nativa de texto. **Pendente:** repetir com touchpad físico, além de clique sem movimento e preservação de seleção filtrada.
## Entregue nesta etapa — métricas Ads e KGR opcional (2026-08-03)

- SDD: `docs/04-arquiteto/propostas/metricas-google-ads-kgr-opcional.md`.
- Extensão aditiva do contrato do Arquiteto para consumir somente o envelope normalizado do Minerador, preservando proveniência e decisões humanas.
- KGR/allintitle opcionais; ausência não vira zero nem bloqueia agrupamento, formação ou aprovação.
- Volume deixou de ser critério exclusivo de seleção da principal; CPC e competição Ads não são dificuldade orgânica.
- **Verificado:** teste específico, `test:arquiteto` 89/89, `test:operational` 49/49 e TypeScript.
- **Pendente:** smoke autenticado com dados Ads persistidos pelo Minerador; sem alteração do Minerador, migration ou chamada remota nesta etapa.
- [x] Migrar o primeiro consumidor: ArticleDNA, SiloDNA e SiloPage usam o runtime canônico server-side e `editorial_artifact_versions` append-only.
- [x] Cobrir Brand explícita, actor Supabase SSR, `PERSISTED`/`UNCHANGED`, no overwrite e referência canônica de SiloDNA para SiloPage.
- [x] Preservar recuperação local como compatibilidade sem apresentá-la como persistência canônica.
- [ ] Executar smoke remoto autenticado do Arquiteto e confirmar leitura/persistência no schema já aplicado; nenhum SQL, migration, provider ou deploy foi executado nesta etapa.

## Fechamento do contrato de retorno canônico — 2026-08-11

- [x] Corrigir o retorno `UNCHANGED` para validar a linha canônica completa, preservando o comportamento idempotente sem criar versão duplicada.
- [x] Alinhar o contrato HTTP da rota (`persistence`) com o parser client-side e cobrir `PERSISTED`, `UNCHANGED`, campo ausente e `artifact_type` incompatível.
- [x] Registrar diagnóstico estrutural sanitizado para divergência de forma sem expor payload ou identificadores sensíveis.
- [ ] Separar/fechar a composição `MIXED` da tela e executar smoke autenticado de readback remoto; não confundir teste local com prova do schema remoto.

## Fresh-origin readback — 2026-08-12

- [x] Diagnosticar por linha o GET canônico: `article_dna`, versão 1, payload objeto e falha em `createdAt` por formato de timestamp remoto incompatível com o parser estrito.
- [x] Normalizar timestamps de banco no mapper e preservar erro explícito para timestamp realmente inválido.
- [x] Confirmar no readback as invariantes de Brand e entidade e reproduzir reload autenticado em `s-smoke` sem a mensagem de artifact inválido.
- [x] Corrigir a hidratação visual da lista editorial quando a origem fresh não possui o bootstrap legado; não criar ArticleDNA, não usar recovery como prova e não chamar IA/SERP.

## Bootstrap canônico em fresh origin — 2026-08-11

- [x] Auditar a precedência real: `masterList`/`fetchMasterList` legado criava as linhas; o GET canônico preenchia somente mapas de versões.
- [x] Adicionar adapter/read-model local para materializar ArticleDNA remoto válido sem `localStorage`/IndexedDB, preservando `CANONICAL_REMOTE`, `LEGACY_REMOTE` e `LOCAL_RECOVERY`.
- [x] Fazer o remoto prevalecer sobre cópia equivalente por IDs/entidade e preservar recovery local-only sem duplicação ou fallback por nome/slug.
- [x] Diferenciar `NO_DATA`, `QUERY_FAILURE`, `SCHEMA_MISSING`, `NOT_AUTHORIZED` e `INVALID_ARTIFACT`; falha canônica não vira empty state.
- [x] Cobrir fresh origin, fonte, Brand, lacuna contratual, precedência, recovery-only, não duplicação e erro sanitizado.
- [x] Repetir o smoke visual autenticado após a correção do ciclo de bootstrap; a falha legada não bloqueou a exibição canônica e não foi confundida com falha do adapter.
- [ ] Implementar posteriormente o handoff Minerador → Arquiteto; esta etapa não altera produtor, IA, SERP, schema, migration ou storage.

## Handoff canonico Minerador -> Arquiteto - implementado localmente - 2026-08-11

- [x] Criar read model remoto do workspace por `editorial_workflow_items` + keywords referenciadas + artefatos relacionados.
- [x] Migrar o comando de importacao para POST protegido e idempotente, com confirmacao `PERSISTED`/`UNCHANGED`.
- [x] Preservar ArticleDNA como overlay; keywords sem ArticleDNA aparecem como nao agrupadas.
- [x] Manter recovery local e rota legacy sem promove-los a fonte operacional.
- [ ] Executar smoke remoto com a mesma Brand em dois navegadores/sessoes, incluindo reload e repeticao da importacao. O agente nao executou operacao remota.

## Divergencia do marcador de importacao - 2026-08-12

- [x] Identificar que o bloqueio `Ja importado no Arquiteto` pode usar `architectImportedKeywordIds` persistido localmente, sem consultar o workflow canônico.
- [x] Preparar diagnostico remoto somente leitura para correlacionar keyword, workflow e metadados de ArticleDNA sem expor conteudo editorial.
- [ ] Executar manualmente o diagnostico por Brand e decidir separadamente qualquer repair/backfill idempotente. Nenhuma limpeza local ou alteracao remota esta autorizada neste gate.

## Histórico arquivado — rebase canônico do patrimônio Minerador → Arquiteto — 2026-08-12

O runtime de rebaseline foi abandonado na Fase 1. Os itens abaixo preservam a
decisão histórica e não autorizam preflight, writer, backfill ou operação
remota.

- [x] Remover marcador local e `historical_import_protected` como autoridade permanente da elegibilidade do novo fluxo.
- [x] Permitir entrada de keyword publicada preservando integralmente o status e as proteções editoriais.
- [x] Preparar bootstrap server-side idempotente e preflight sanitizado por Brand, sem migration e sem criação de ArticleDNA.
- [x] Preparar inventário read-only do downstream, classificando patrimônio Minerador como `PRESERVAR` e PublicationRecord como `INVESTIGAR` obrigatório.
- [ ] Executar manualmente o preflight da Adalba; revisar `INVESTIGATE_REMOTE_WORKFLOW = 0`, as contagens e as amostras sanitizadas antes de autorizar o POST de bootstrap.
- [ ] Após aprovação humana, executar uma única vez o bootstrap autenticado, repetir o preflight e realizar o smoke manual de keywords antigas aprovadas, previamente importadas e publicadas em dois navegadores, seguido de F5 e logout/login.
- [ ] Usar o inventário remoto para propor, em tarefa separada, o reset seletivo de Arquiteto → Publicações. Não há DELETE, TRUNCATE ou CASCADE autorizado nesta fase.

## Inventário/reset downstream da Adalba — 2026-08-12

- [x] Preparar inventário remoto sanitizado, com uma única saída, para a Brand Adalba e para a fronteira Arquiteto → Publicações.
- [x] Preparar SQL de reset apenas como proposta transacional bloqueada por manifesto e por proteção de publicado/URL/canonical.
- [ ] Executar manualmente o inventário read-only e revisar cada classificação `PRESERVAR`, `RESETAR_CANDIDATE` e `INVESTIGAR`; nenhuma contagem local prova o estado remoto.
- [ ] Decidir separadamente se existe autorização estrutural para qualquer objeto append-only. As triggers de 0027/0028 impedem apagar ou alterar artifacts, versões de documento, snapshots e reviews; 0031 continua congelada.
- [ ] Somente depois de snapshot, manifesto com IDs aprovados e autorização humana específica, revisar o reset parcial possível. Dados do Minerador e publicações reais permanecem fora do escopo.

## Nova época canônica por reset de desenvolvimento — 2026-08-12

- [x] Preparar reset transacional local de dados de homologação, com preflight, contagens before/after, proteção do único Admin e restauração obrigatória das triggers append-only.
- [x] Preparar verifier read-only para dados zerados, estrutura/RLS/funções preservadas, triggers reativadas e Admin autenticável.
- [x] Incluir `tenant_0016_agency_role_rollback` e gate de catálogo para todas as FKs de entrada do manifesto, com ordem topológica e falha agregada para dependências não classificadas.
- [ ] Executar manualmente somente o dry-run v6; confirmar manifesto com 60 entradas, gates de FK/dependência/ordem/self-FK/mutação de triggers/proteções/Admin aprovados, `VERDICT_FINAL = PASS` e zero `FAIL`; não repetir o reset real enquanto qualquer gate falhar.
- [x] Abandonar a implementação com TEMP TABLEs: reescrever o dry-run em CTEs/`VALUES` read-only e o reset real com arrays/records/variáveis locais, sem `pg_temp` ou objetos auxiliares persistentes.
- [ ] Executar backup final, confirmar manualmente o projeto de desenvolvimento, revisar a contagem de usuários Auth não-Admin e autorizar a confirmação literal do script.
- [ ] Executar reset e verifier manualmente; remover usuários Auth de teste apenas pelo Dashboard, preservando o Admin.
- [ ] Executar reconstrução manual após reset: recriar listas/grupos, importar cada CSV para o destino selecionado e rodar novamente a confirmação Site/Sitemap para as keywords `publicado`, sem restaurar `brand_id`, IDs técnicos ou marcadores legados de Arquiteto; depois executar o smoke completo do pipeline antes de remover recovery/fallbacks legados.

## Limpeza estrutural sucessora 0032 — 2026-08-12

- [x] Registrar em SDD a remoção pós-reset dos objetos mortos exclusivos de 0016/0030, preservando a função append-only compartilhada e os contratos editoriais canônicos.
- [x] Preparar `supabase/migrations/0032_structural_legacy_cleanup.sql` com ordem explícita, sem `CASCADE`, sem editar migrations históricas e sem reutilizar 0031.
- [x] Preparar preflight e post-verifier read-only específicos, incluindo fingerprint pré-aplicação das estruturas não-alvo.
- [x] Preparar rollback local/documental que recria somente estruturas vazias e exige nova decisão humana.
- [x] Executar manualmente o preflight 0032 e revisar o fingerprint e os gates antes da aplicação.
- [x] Aplicar manualmente 0032 após autorização específica e executar o post-verifier; o fingerprint pré-aplicação não foi capturado.

## Fechamento remoto da 0032 — 2026-08-12

- [x] Registrar a aplicação remota da migration 0032 conforme relato do usuário.
- [x] Confirmar remoção do helper, três tabelas alvo e trigger exclusiva.
- [x] Confirmar 12/12 estruturas preservadas, função append-only compartilhada e quatro triggers editoriais canônicas.
- [x] Classificar `TARGET_REMOVAL = PASS`, `PRESERVED_OBJECT_CHECKS = PASS` e `SHARED_APPEND_ONLY = PASS`.
- [x] Registrar `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`; não usar o hash pós-aplicação como baseline retroativo.
- [x] Corrigir o post-verifier v2 para retornar `EVIDENCE_GAP` no placeholder e não produzir falso FAIL estrutural.
- [x] Preparar o post-verifier v3 sem referências executáveis às relações/função removidas; ausência é verificada somente por catálogo.
- [ ] Executar, se necessário, somente o post-verifier v3 read-only e arquivar seu resultado; nenhuma reaplicação ou correção de schema é necessária para esta lacuna.
