# Backlog — Radar

## Continuidade entre sessões — base validada — 2026-09-06

- [x] Isolar os leitores por linha para que um registro incompatível não esconda
  os demais (`safeParse` em workflow, artefatos e eventos).
- [x] Isolar os oito repositórios do `GET` do workspace, nomeando a seção que
  falha em vez de devolver a marca como vazia.
- [x] Separar dado persistido inválido (502 `persisted_data_invalid`) de entrada
  inválida (400 `invalid_brand_id`).
- [x] Distinguir os cinco desfechos da leitura: completo, parcial, vazio
  confirmado, acesso negado e falha.
- [x] `requestId` rastreável em toda resposta e no log, sem segredos.
- [x] Falha da escrita remota deixa de ser reportada como importação concluída.
- [x] Validar recuperação entre duas sessões após limpeza de cache — Care Glow.

### Abertas

- [ ] **Unificar os indicadores da investigação corrente.** "Análise reaberta"
  não pode coexistir com um indicador que apresente a mesma investigação como
  concluída.
- [ ] **Mostrar a aprovação histórica separada da revisão atual.**
- [ ] Homologar nova importação, nova aprovação e entrega ao Planejador.
- [ ] Readback por artigo na importação: o POST devolver os `RadarItem`
  canônicos relidos, e o cliente aplicar só os confirmados.
- [ ] Reconstruir a investigação SERP a partir dos dois snapshots já existentes
  da máscara, **sem nova coleta paga**.
- [ ] Criar `test:radar`: 36 dos 38 arquivos de teste do Radar não rodam em
  suíte nenhuma, e dois falham por fixture desatualizada.
- [ ] Decidir os dois campos de contrato escritos e nunca lidos
  (`arquitetoSerpProvenance`, `arquitetoInternalLinks`).
- [ ] Decidir as duas autoridades de aprovação: o Workbench aprova localmente e
  não cria versão remota nem envia ao Planejador.

### Preservar como regressão

- [ ] Carregamento do workspace com um repositório falhando: os demais precisam
  continuar chegando, com a seção nomeada.
- [ ] Isolamento por marca na leitura e na importação.
- [ ] Recuperação entre sessões após limpeza de cache.

### Fora do escopo do Radar

- Fechamento humano e aprovação em lote do Arquiteto seguem no escopo próprio.
- A fundação global permanece congelada; reabrir só com defeito reproduzido,
  evidência do ponto de falha e escopo delimitado.

## Correção funcional — aprovação SERP pós-F5 — 2026-08-27

- [x] Substituir a confirmação global/fallback local por readback remoto
  estreito, autenticado e identificado por marca, artigo, ArticleDNA e
  snapshot, sem escrever nova revisão.
- [x] Preservar aprovações append-only no histórico e liberar somente a
  aprovação cujo fingerprint de curadoria ainda é o atual.
- [x] Cobrir concorrência de readback/write, troca de snapshot, mudança de
  curadoria e aprovação histórica sem fingerprint com testes direcionados.
- [x] Validar sessão autenticada após F5: a Revisão mostra `SERP aprovada`
  para o snapshot v3 e seleção atual da Care Glow.
- [ ] Executar uma nova coleta DataForSEO somente em gate próprio e com
  autorização explícita; esta correção não executou provider nem criou
  snapshot novo.

## Regressão funcional — identidade do Radar e SERP real — 2026-08-26

- [x] Separar a identidade técnica `row.id` da identidade editorial
  `row.articleId` na seleção, foco, fila, estado local, SERP, snapshots e
  ações do Workbench, preservando `row.id` somente nos adaptadores que exigem
  a linha de workflow.
- [x] Corrigir o falso conflito entre o UUID remoto do workflow e o alias
  local legado do `RadarItem`, mantendo bloqueio para marca, artigo ou
  `articleDnaVersionId` divergentes.
- [x] Adicionar regressões para o transporte de `articleDnaVersionId`,
  compatibilidade de identidade e ausência de provider durante o render.
- [ ] Executar uma única coleta manual autenticada DataForSEO e confirmar
  request/status/IDs, normalização, INSERT compatível, readback, reload sem
  nova chamada, histórico e revisão humana sem aprovação automática.
- [ ] Retomar o ExpertBrief somente após o gate do smoke SERP e a existência
  de especialista/binding reais; não criar especialista nesta correção.

## Gate estrutural fechado e abertura funcional — 2026-08-26

- [x] Registrar `RADAR_STRUCTURAL_PREREQUISITES=READY`.
- [x] Registrar `RADAR_SERP_FOUNDATION=READY` com novas coletas limitadas a
  DataForSEO e snapshots históricos Serper somente para leitura/proveniência.
- [x] Registrar `RADAR_TELEGRAM_FOUNDATION=READY` após verificação remota da
  fundação, RLS, claim/lease/retry/backoff, writeback e isolamento cross-brand.
- [x] Registrar `RADAR_PLANNER_HANDOFF=READY`, `RADAR_PLANNER_HANDOFF_V2=PASS`
  e `HANDOFF_DATABASE_CHANGE_REQUIRED=NO`.
- [x] Abrir a fase funcional `Radar → Especialista / ExpertBrief /
  ExpertContribution / Evidence`.
- [ ] Executar inbound Telegram real, texto/áudio E2E e Speech real em smoke
  manual próprio; esses gates não são promovidos por este registro.
- [ ] Validar no navegador o handoff real aprovado, readback/reload e decisão
  humana do primeiro ContentPlan, sem alterar a fronteira do Planejador.

## Handoff canônico Radar → Planejador — 2026-08-26

- [x] Criar envelope v2 aprovado, versionado, hashado e tenant-safe sem
  duplicar ArticleDNA ou transformar evidência em ContentPlan.
- [x] Adaptar a importação explícita para transportar o envelope no
  `PlannerItem` sem quebrar itens históricos.
- [x] Permitir handoff de pacote histórico Serper válido/aprovado, preservando
  a provenance; novas coletas continuam restritas a DataForSEO.
- [ ] Validar com SERP DataForSEO real, aprovação humana, persistência remota,
  reload e isolamento entre marcas.
- [x] Aplicar e auditar manualmente a fundação Telegram antes do E2E real;
  a verificação remota e o smoke JWT cross-brand foram concluídos. Não
  executar migration novamente.

## Consolidação canônica e abertura da fase — 2026-08-25

- [x] Registrar `READY_FOR_RADAR_DEVELOPMENT = YES` e a infraestrutura SERP
  compartilhada DataForSEO como contrato do Radar.
- [x] Preservar a fronteira: Radar investiga ArticleDNA recebido, não forma
  artigo, não troca principal/slug/canonical e não envia direto ao Redator.
- [x] Registrar `ExpertBrief`, `ExpertContribution`, camadas original/
  transcrição/organização e Local Worker como contratos compartilhados.
- [ ] Executar coleta DataForSEO autenticada, readback/reload/persistência e
  validação visual em tarefa própria; nenhuma chamada paga foi feita aqui.
- [ ] Configurar webhook e validar inbound Telegram E2E; Bot global e
  `getMe = PASS` não equivalem a webhook pronto.

> Itens datados anteriores a esta consolidação que citam o provider SERP
> legado são históricos/supersedidos. Permanecem para proveniência e não
> autorizam restauração, fallback ou provider próprio do Radar.

## ExpertBrief / ExpertContribution — 2026-08-25

- [x] Preparar contratos compartilhados, persistência de brief/contribuição e adapter de leitura para futuro consumidor Radar.
- [x] Preservar original, proveniência, transcript e organização em campos separados; sem aprovação automática ou alteração de ArticleDNA.
- [ ] Aplicar migration e validar contribuição Telegram real com um brief, depois desenvolver a experiência editorial do Radar em tarefa própria.

## Consumo somente leitura da formação — 2026-07-21

- O contexto estratégico do Arquiteto permanece opcional e compatível com itens antigos.
- Pendente: validação manual autenticada da leitura no navegador; nenhuma SERP real ou escrita remota foi executada.

## Agora

- Validar manualmente a hidratação do artigo publicado existente: texto da keyword, `KeywordDNA`, `ArticleDNA`, `SiloDNA`, nome do silo, SERP `Não pesquisada` e botão de coleta habilitado.
- Não aplicar `supabase/migrations/0003_radar_serp_snapshots.sql`; o ambiente remoto já possui as relações do schema canônico `0027`.
- Executar uma única coleta manual autenticada com keyword real e confirmar DataForSEO, INSERT compatível, readback, reload, histórico e revisão.
- Fazer validação visual da planilha, detalhe expandido, revisão humana e integração com o Planejador.

## Depois

- Integrar provider de fontes externas e sinalização de originalidade, mantendo proveniência e revisão humana.
- Evoluir classificação manual de resultado sem substituir o diagnóstico determinístico histórico.
- Avaliar rate limit/observabilidade operacional para consultas pagas, com política de custo explícita.

## Histórico supersedido — provider SERP legado — 2026-07-20

- Provider SERP legado server-side com configuração lazy, timeout, normalização e erros explícitos.
- Fallback local para coleta real quando a persistência editorial/migration remota está indisponível, preservando `origin: real`, `isMock: false` e `needs_review`.
- Erros estruturados de configuração, migration, conexão, autenticação, permissão e provider.
- Separação explícita entre UUID canônico, alias `pub-k-*`, ID de origem e texto; nenhum alias é enviado para colunas UUID.
- Ação `Abrir no Radar`, painel expandido e ação separada `Ver no Arquiteto`, sem loop de deep-link.
- Rota autenticada de coleta/revisão com bloqueio de keyword técnica e verificação de marca.
- Snapshots versionados, hash SHA-256, PAA, related searches, Knowledge Graph e diagnóstico.
- Persistência remota append-only preparada e fallback local identificável.
- UI real separada do mock e evidência real condicionada à aprovação humana.
- Integração do snapshot aprovado como referência opcional no plano do Planejador.
- Fixtures do provider e regressões editoriais/operacionais passando.
- Snapshot aditivo de hidratação no item Radar, reconciliação segura de registros antigos e resolução de aliases `pub-k-*` no cliente e no servidor.
- Inclusão de keywords sem `lista_id` no snapshot editorial quando pertencem ao conjunto de silos autorizado; nenhum conteúdo do Arquiteto é recriado ou alterado.
- Envelope editorial versionado e hashado na transferência cliente→Radar, com validação server-side, bloqueio de conflitos antes do provedor e registro de `resolutionMode`/`canonicalRemoteVerified`.

## Fora do MVP

- Scraping direto do Google.
- Retry, polling, coleta em lote implícita ou aprovação automática.
- Execução de migration remota e consulta paga automática durante testes.
## Novos itens - 2026-07-20

- Validar manualmente a pagina `/radar/[articleId]`: abas, curadoria, extracao controlada, aprovacao e recovery apos reload.
- Confirmar no Planejador a visualizacao do pacote Radar aprovado e decidir humanamente entre manter o plano atual ou criar sucessora.
- Integrar fontes externas e originalidade sem transformar observacao em aprovacao automatica.
- Validar manualmente a navegação tenantizada do Radar em artigo real: `Abrir no Radar`, retorno ao Radar, deep-link do Arquiteto e link do Planejador em Adalba e Lindisse.
- Adicionar sincronizacao posterior do recovery local sem nova coleta ou extracao.

## Correção estrutural de evidência — 2026-07-20

- Validar manualmente que a URL canônica usa `articleDnaVersionId` limpo e que `/radar/radar%3Apub-k-*` redireciona uma única vez.
- Confirmar os nove resultados no Resumo, SERP e Concorrentes após reload com remoto parcial e recovery local completo.
- Confirmar estados específicos para PAA, relacionadas, Knowledge Graph, extração não iniciada, amostra insuficiente e conflito de hash.
- Confirmar no Planejador que `RadarEvidencePackage` aparece como evidência e que ContentPlan existente não é sobrescrito.

## Validacao manual da correcao de hidratacao — 2026-07-20

- Abrir uma linha real pela planilha e confirmar que a URL usa `RadarItem.id`; abrir também uma URL antiga `pub-k-*` e confirmar redirecionamento canônico com `?tab=serp` preservado.
- Confirmar nas sete abas o mesmo snapshot SERP v1, seus resultados orgânicos/PAA/relacionados/Knowledge Graph, ArticleDNA, KeywordDNA, SiloDNA e revisão legada.
- Recarregar a página e confirmar recovery local/servidor sem nova chamada ao provider SERP legado, sem perda de resultados e sem substituição por estado vazio.
- Só após essa conferência, iniciar a análise uma vez e confirmar que ela referencia o mesmo snapshot, sem duplicar coleta ou versão por duplo clique/reload.

## Identidade e proteção — implementado em 2026-07-20

- Identidade editorial, proteção de publicados, DNAs, silo, comparação DNA x SERP e orientação por próxima ação.
- Justificativa de keyword exigida somente para conflito que encaminha revisão ao Arquiteto.
- Validar manualmente selo `Publicado e protegido`, URL publicada em nova aba, proveniência recolhida e campos preservados em artigo publicado e novo.

## Fechamento operacional — implementado em 2026-07-21

- Estados separados de investigação, publicação e transferência, com progresso real condicionado à revisão da SERP orgânica.
- Registro versionado de transferência ao Planejador, com distinção entre corrente, aprovada, enviada e atualização disponível, sem duplicar artigo ou `ContentPlan`.
- Mensagens canônicas para dado não recebido nesta etapa, proteção compreensível de publicados e orientação de artigos novos para o Arquiteto.
- Benchmark limitado a artigos editoriais completos e semântica com categorias de ruído e recuperação explícita.
- Cobertura automatizada de formatos, semântica, estados, transferência e chaves React duplicadas em `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.

## Validação manual restante

- Conferir um artigo novo e um publicado, preservando identidade, canonical, URL estrutural e controles somente leitura.
- Conferir uma SERP com itens orgânicos pendentes e outra com todos revisados, verificando a diferença real no progresso e na próxima ação.
- Aprovar e enviar uma versão; criar uma sucessora; confirmar que a atualização é indicada sem duplicar artigo ou plano.
- Executar uma coleta DataForSEO real somente por ação manual autenticada, com uma keyword, após confirmar configuração e persistência autorizadas. As referências anteriores ao provider SERP legado permanecem históricas.

## Contexto KGR e identidade estratégica — implementado em 2026-07-21

- Exibir no Resumo a estratégia KGR recebida, origem, principal, score, volumes, composição, limite, papéis, hierarquia, slug e situação de publicação.
- Preservar classificação recebida; sugerir KGR leve sem recalcular classificação pela SERP; manter ausência como estado explícito.
- Comparar principal e slug sem alteração automática; encaminhar artigo novo desalinhado ao Arquiteto e proteger publicado historicamente desalinhado.
- Transportar `kgrStrategy` de forma aditiva no `RadarEvidencePackage`, com aviso de sobreposição e sem metas finais de ContentPlan.
- Manter referências acima de seis visíveis em recovery/fixture e bloquear somente a consolidação de novo pacote até revisão no Arquiteto.

## Validação manual KGR restante

- Cenário A: artigo KGR novo, slug alinhado, até seis keywords, sugestão KGR leve e primeiro envio ao Planejador.
- Cenário B: artigo KGR publicado com slug desalinhado, campos protegidos e oportunidade de atualização sem troca de URL.
- Cenário C: artigo não KGR, sugestão competitiva completa, composição preservada e nenhuma classificação inventada.
- Cenário D: artigo com mais de seis referências em recovery/fixture, conflito visível, nenhuma referência apagada e revisão indicada no Arquiteto.
- Cenário E: KGR ausente, estado honesto e escolha humana de profundidade.

## Relatorio competitivo - pendencias

- Validar manualmente a leitura do relatorio em artigo completo, amostra pequena, video/formato e SERP ausente, sem recolher dados durante o teste.
- Confirmar no Planejador que o `RadarEvidencePackage.competitiveReport` aparece como contexto e nao preenche outline ou metas automaticamente.
- Evoluir a extracao somente com contrato aprovado quando houver necessidade de frequencia por title/H1/intro/headings, fontes detalhadas de links, comentarios ou fontes externas; hoje esses campos ficam explicitamente indisponiveis.
- Avaliar em tarefa propria uma aba dedicada para o relatorio se o volume do Resumo deixar de ser suficiente; esta rodada manteve a composicao existente e adicionou a leitura consolidada sem alterar a navegacao dos consumidores.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/radar; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.


## Fluxo por modo — validação manual restante

- Abrir um artigo KGR publicado e um artigo KGR novo em Adalba e Lindisse; confirmar sugestão KGR leve, motivo humano, proteção da identidade e isolamento entre marcas.
- Abrir um artigo sem KGR; confirmar sugestão competitiva completa, estado honesto de KGR ausente e ausência de classificação inventada.
- Na seleção, conferir todos os resultados orgânicos, artigo próprio, vídeos/redes sociais, PAA, relacionadas e Knowledge Graph; confirmar que somente páginas externas selecionadas podem ser analisadas.
- Validar amostra KGR com uma a três referências e amostra competitiva com três a cinco páginas quando disponíveis; confirmar benchmark sem vídeo, social, parcial ou artigo próprio.
- Conferir semântica em caso de repetição, termo central, navegação, legal, plataforma e termo pontual; recuperar manualmente um termo ignorado e verificar nova versão de evidência.
- Conferir a ordem das cinco áreas, a próxima ação única, estados de carregamento/erro/desabilitado, foco de teclado e legibilidade em 360, 768, 1024 e 1440 px, em light e dark.
- Aprovar e enviar ao Planejador; confirmar pacote como contexto, sem criação automática de outline, metas ou nova entidade.

## Seleção e relatório — pendências após a correção localizada

- Validar manualmente a troca de função de um resultado entre principal, apoio, formato, próprio e excluído, confirmando que apenas uma função fica visível por vez.
- Validar manualmente a permanência das decisões após recarregar a aba e a não reextração de uma URL já analisada.
- Confirmar em navegador uma prévia com uma página comparável, incluindo limitação explícita e ausência de média de mercado, e uma prévia com duas ou mais páginas, incluindo média/mediana/mínimo/máximo.
- Confirmar que apoio, formato e conteúdo próprio são exibidos no relatório sem contaminar a leitura principal do benchmark.
- Completar smoke test DataForSEO autenticado e persistência remota; esta rodada não acionou provider real nem alterou storage remoto.

## Lote Radar R2 — implementação concluída localmente — 2026-08-25

- Workbench com navegação direta por etapa e preservação de tenant/artigo; SERP usa a aba canônica `serp` e aliases legados continuam resolvidos.
- Tela SERP avançada, curadoria de Referências com filtros e Análise SERP com sinais de necessidades, lacunas, conflitos, oportunidades e fontes.
- Evidências adicionais com navegação interna e fixture local; atividade compacta no Workbench; Perfil expandido com links para as áreas detalhadas.
- Testes automatizados R2 e direcionados passam; build permanece pendente por indisponibilidade do Google Fonts; validação visual autenticada permanece pendente por ausência de sessão no navegador local.
- Telegram real continua bloqueado por `DATABASE_CHANGE_REQUIRED=YES` e `PLANNER_GERAL_REQUIRED=YES`; não criar schema, migration ou conexão nesta frente.

## Lote Radar R3 — implementação concluída localmente — 2026-08-25

- Workbench reorganizado em quatro áreas expansíveis: SERP, Amazon, Conteúdo e Especialista, com relatório consolidado abaixo.
- Tabela e Perfil usam o mesmo read model R3; Amazon é opcional/local e a fixture do Especialista não representa Telegram real.
- Validar manualmente a viewport 1024 px, tema claro e aprovação/transferência no navegador autenticado; as quatro expansões, o Perfil, a tabela e as viewports 360/768/1440 px no tema escuro já foram conferidos.
- Não iniciar provider Amazon, integração Telegram, migration ou mudança de schema nesta frente.

## Lote Radar R3.1 — refinamento do Workbench — 2026-08-25

- Remover ações globais e superfícies redundantes do Workbench: `Detalhe compatível` e a faixa `Área ativa`.
- Manter aprofundamentos dentro de SERP, Amazon, Conteúdo, Especialista e Relatório, sem navegação global obrigatória.
- Exibir no Conteúdo os dados editoriais primeiro e recolher IDs, snapshots, version IDs e hashes em `Proveniência / detalhes técnicos`.
- Validado no tema escuro em sessão autenticada nos breakpoints 768/1024/1440 px: 4 cards, expansões, Perfil, tabela, ausência de overflow e detalhes técnicos recolhidos. Tema claro e aprovação/transferência por interação permanecem pendentes; deep links e não criação de versão seguem cobertos por código/testes.

## Lote Radar R3.2 — fila sequencial — implementado localmente — 2026-08-25

- [x] Exigir seleção explícita da planilha; sem artigo, manter Workbench compacto, cards desabilitados e mensagem `Selecione um artigo para trabalhar`.
- [x] Fazer o Workbench inteiro acompanhar um único artigo selecionado, preservando isolamento de SERP, Amazon, Conteúdo, Especialista, relatório, próxima ação e ArticleDNA.
- [x] Manter SERP → Amazon → Conteúdo → Especialista em cards compactos, com no máximo uma expansão e Amazon explicitamente não aplicável sem provider.
- [x] Recolher o relatório em faixa compacta e deixar a planilha ocupar o restante flexível da viewport, sem altura rígida no Workbench fechado.
- [x] Cobrir seleção, troca de contexto, estado vazio, relatório e não criação de versão/provider com testes direcionados.
- [x] Validar render autenticado em tema escuro nos breakpoints 1440/1024/768/360 px; tema claro, aprovação/transferência e smoke remoto continuam pendentes.

## Lote Radar R4 — fila sequencial — implementação local — 2026-08-25

- [x] Workbench fechado compacto, sem relatório/metadados redundantes, com quatro cards fixas e planilha dominante.
- [x] Separar `focusedArticleId` de `selectedArticleIds[]`; checkbox não muda obrigatoriamente o foco.
- [x] Manter estado local independente por artigo para SERP, tópicos, especialista e relatório, sem vazamento ao trocar o foco.
- [x] Transformar a barra inferior em Bulk Operations Bar com elegibilidade `eligible / alreadyDone / blocked` por operação.
- [x] Criar fila SERP local sequencial, estados por artigo, revisão pendente e navegação anterior/próxima pendente.
- [x] Preparar tópicos e aprovação em lote localmente com gate humano e sem envio automático.
- [x] Preparar estados do especialista, avisos de sessão e status processuais específicos na planilha.
- [x] Auditar `external_processing_jobs`/Local Worker: reuso parcial; não criar queue/table/migration paralela.
- [ ] Validar execução real de lote, readback/reload remoto e worker genérico após gate do Planner Geral.
- [ ] Validar navegador autenticado no estado sem seleção, com foco, seleção múltipla e artigos em estágios A/B/C/D; validar tema claro.
- [ ] Integrar Telegram/contribuição real somente após migration, contrato e autorização estrutural.

## Lote Radar R4.1 — fechamento local da fila sequencial — 2026-08-26

- [x] Separar foco operacional e seleção coletiva, mantendo o Workbench inteiro no artigo focado.
- [x] Exibir elegibilidade por processo com `eligible`, `alreadyDone`, `blocked` e `notApplicable`.
- [x] Manter fila SERP sequencial local com revisão e aprovação explícitas, sem provider ao selecionar ou abrir artigo.
- [x] Representar Amazon aplicável/não aplicável/pendente/revisada sem chamada externa.
- [x] Montar contexto local do especialista e permitir edição, remoção, adição e reordenação de tópicos antes do envio.
- [x] Manter relatório, avisos e estados processuais como estado de sessão, sem nova entidade remota.
- [ ] Validar tema claro por screenshot, lote real, persistência/readback remoto e aprovação/transferência autenticadas.
- [ ] Evoluir jobs genéricos, Telegram, DeepSeek, STT, Storage e worker somente após `DATABASE_CHANGE_REQUIRED=YES` e gate do Planner Geral.

## RADAR R5 — fila sequencial e especialista — 2026-08-26

- [x] Auditar artigos reais, elegibilidade, snapshots existentes e estágios sem criar dados de teste; Care Glow apresentou 1 artigo real elegível e 0 snapshots SERP reais nesta sessão.
- [x] Usar o handler canônico existente para lote SERP sequencial, com estados por artigo, continuidade após falha e retry individual.
- [x] Bloquear reprocessamento implícito; disponibilizar refresh somente como ação explícita.
- [x] Recuperar `WAITING_REVIEW`/`COMPLETED` de snapshots e revisões existentes após reload, sem criar fila remota paralela.
- [x] Conectar a revisão individual ao `pipeline.reviewSerp` e manter anterior/próximo no contexto do artigo correto.
- [x] Exibir progresso compacto somente enquanto a fila estiver ativa, com foco de pendentes e falhas.
- [x] Preparar contexto real disponível para pautas, chamar o consumidor canônico DeepSeek somente por ação explícita e manter resposta como cópia de trabalho local.
- [x] Implementar fila de revisão individual das pautas, gate coletivo, edição, remoção, adição, reordenação, desfazer e refazer.
- [ ] Executar smoke autenticado de lote SERP, retry, revisão individual, reload/readback remoto e DeepSeek; nenhum provider foi acionado nesta rodada.
- [x] Auditar a fundação remota, incluindo `external_processing_jobs`, RLS,
  claim/lease/retry/backoff e isolamento cross-brand. O gate estrutural foi
  fechado em 2026-08-26; a idempotência de envio real ainda é smoke separado.
- [ ] Executar texto Telegram end-to-end manual antes de qualquer áudio/STT; áudio permanece fora do escopo executável até o texto ser comprovado.

## RADAR R6 — contexto real, revisão de pautas e relatório consolidado — 2026-08-26

- [x] Congelar o Workbench, as quatro cards, a planilha, o foco/seleção e a Bulk Operations Bar do R5.
- [x] Consolidar estados independentes de SERP, Amazon, Especialista e Relatório, sem status global substituto.
- [x] Criar `buildExpertTopicContext(articleId)` com ArticleDNA, KeywordDNA, SiloDNA, SERP, referências, necessidades, lacunas, conflitos, Amazon, conteúdo existente e proveniência real.
- [x] Integrar o consumer canônico DeepSeek por ação explícita, exigir 3–5 perguntas e manter o retorno em `TOPICS_READY_FOR_REVIEW` local.
- [x] Exibir proveniência, origem combinada, necessidade, motivo, referência e material complementar sem inventar IDs ou transformar perguntas em evidência.
- [x] Implementar revisão sequencial individual, edição, adição, remoção, reordenação, restauração e gate coletivo de pautas.
- [x] Implementar o modelo local de relatório consolidado e separar `REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED`, incluindo os caminhos sem especialista e aguardando especialista.
- [x] Manter o relatório recolhido/compacto, sincronizar o Dossiê Conteúdo somente como leitura e validar a continuidade visual do Workbench.
- [x] Auditar o handoff Radar → Planejador: `PLANNER_HANDOFF_CONTRACT=STRUCTURAL_CHANGE_REQUIRED`; registrar `BLOQUEADO — PLANNER GERAL` sem alterar o Planejador.
- [x] Registrar entradas locais de YouTube/podcast/vídeo/áudio/documento nos três estados permitidos, sem download; confirmar prontidão contratual de áudio sem implementar STT.
- [ ] Executar smoke real DeepSeek somente com autorização explícita; estado atual `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- [x] Confirmar remotamente as oito relações Telegram, ExpertBrief/binding e
  o routing cross-brand antes do E2E; `TELEGRAM_REMOTE_FOUNDATION=READY`.
  Texto e contribuição real permanecem pendentes.
- [ ] Auditar/alterar o contrato do Planejador somente em frente estrutural autorizada; não criar adapter especulativo para Amazon/ExpertEvidence.

## RADAR R7 — evidência, fixtures e relatório — 2026-08-26

- [x] Formalizar matriz SERP/Amazon/Conteúdo/Especialista/Relatório com distinção entre dado real derivado, persistência, reconstrução, estado local e fixture.
- [x] Validar contexto real por artigo/marca/versão e impedir que fixture médica contamine artigo de marketing; fixture visual exige modo de teste explícito.
- [x] Validar resposta DeepSeek localmente em 3–5 pautas, duplicidade, proveniência ausente, necessidade relacionada, truncamento, schema inválido e origem fora do escopo.
- [x] Preservar tópicos válidos existentes quando uma tentativa de IA falhar; somente o estado da tentativa recebe retry local.
- [x] Separar `NEED`, `QUESTION`, `CONTRIBUTION` e `ExpertEvidence` no Dossiê Conteúdo, mantendo origem, estado e proveniência visíveis.
- [x] Cobrir relatório sem especialista, especialista pendente, `ExpertEvidence` revisada e Amazon pendente; manter gerar/atualizar, revisar e aprovar como ações distintas.
- [x] Impedir que evidência nova apareça silenciosamente em relatório local já aprovado; fingerprint exige nova geração/revisão.
- [x] Preparar fixtures locais de texto/áudio com original, transcrição e organização separados; preservar faixa temporal na evidência local sem STT/Storage real.
- [x] Auditar Local Worker, `original_asset_uri`, claim/lease/retry/backoff e estados sem alterar schema ou writeback remoto não comprovado.
- [x] Auditar Radar → Planner: campos aceitos, campos faltantes, proveniência e decisões; classificar `PLANNER_CONTRACT_AUDIT=STRUCTURAL_CHANGE_REQUIRED` e `PLANNER_ADAPTER=BLOCKED_BY_PLANNER_GERAL`.
- [ ] Executar smoke real DeepSeek somente com autorização explícita; estado atual `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- [x] Confirmar remotamente as oito relações Telegram, RLS, worker, writeback
  `originalAssetUri` e isolamento; `TELEGRAM_REMOTE_FOUNDATION=READY`.
  Inbound/texto/áudio E2E permanecem pendentes.
- [ ] Validar visualmente R7 em sessão autenticada nos temas claro/escuro e nos breakpoints 360/768/1024/1440 px; não propagar redesign do Workbench congelado.

## RADAR — Fase funcional 1: Especialista / ExpertBrief — 2026-08-26

- [x] Listar especialistas reais e utilizáveis da Marca por `brandId`, sem
  criar especialista silenciosamente e sem expor identificadores Telegram.
- [x] Filtrar briefs pela combinação exata de Marca, artigo, versão do
  ArticleDNA e especialista, preservando histórico/múltiplas pautas sem
  assumir o último registro.
- [x] Integrar seleção de especialista, binding informativo, necessidades,
  lacunas, perguntas editáveis e contexto do artigo no Workbench e no detalhe
  canônico.
- [x] Diferenciar `Criar pauta`, `Salvar pauta`, revisão humana, contribuição
  recebida e `ExpertEvidence`; editar uma pauta existente usa PATCH e não
  duplica o registro.
- [x] Persistir em `expert_briefs` usando o status remoto já existente e
  exigir confirmação/readback compatível antes de informar sucesso.
- [x] Permitir `Gerar sugestões` somente por ação explícita e manter a saída
  de IA como cópia revisável, sem aprovação ou envio automático.
- [x] Retirar a fixture médica da rota real do artigo; mantê-la apenas no modo
  explícito de teste.
- [x] Cobrir contexto, isolamento, status, readback, criação/atualização e
  transporte pendente em testes direcionados.
- [ ] Executar smoke autenticado autorizado de leitura, criação, atualização,
  readback, F5 e negativo cross-tenant em uma única Marca; o smoke parcial de
  2026-08-26 confirmou a sessão e a leitura contextual, mas retornou
  `EXPERT_LIST_REMOTE=PASS_EMPTY` para Care Glow e parou antes de qualquer
  escrita.
- [ ] Implementar/homologar envio Telegram explícito após pauta salva, revisada
  e binding válido; não transformar esse item em envio automático.
- [ ] Validar screenshots desta fase em tema claro/escuro e nos breakpoints
  360/768/1024/1440 px sem alterar a planilha dominante ou o Workbench R3/R7.

## Fase funcional real — ExpertBrief, Telegram, contribuição e áudio — 2026-08-26

- [x] Implementar criação/atualização/readback de ExpertBrief e envio Telegram
  somente por ação explícita, com claim, contexto exato e idempotência.
- [x] Roteiar inbound pelo binding e `selected_brief_id`, rejeitando brief não
  enviado e evitando heurística de última pauta.
- [x] Persistir contribuição original e transição `awaiting_review` sem
  converter automaticamente contribuição em `ExpertEvidence`.
- [x] Implementar projeção/revisão humana de ExpertEvidence, separando
  solicitação, original, transcrição e organização; preservar IDs apenas em
  proveniência técnica recolhida.
- [x] Implementar writeback do asset original, transcrição fiel e organização
  DeepSeek em camadas distintas sobre o schema já existente.
- [x] Implementar worker local de um ciclo com claim, lease/heartbeat,
  retry/backoff, follow-ups de áudio e comando operacional
  `local-worker:once`.
- [x] Bloquear relatório/handoff quando a leitura remota estiver pendente,
  ilegível ou divergente do fingerprint aprovado; nova evidência exige nova
  revisão humana.
- [ ] Executar gates reais G1–G11 com especialista ativo, binding válido e
  interação humana Telegram; o último smoke autenticado encontrou a lista de
  especialistas Care Glow vazia e nenhum provider foi chamado nesta
  continuidade.
- [ ] Validar visualmente o fluxo completo em tema claro/escuro e confirmar
  readback remoto, GCS, STT, transcript fidelity e Planejador sem criar dados
  artificiais ou migrations.

## Correção funcional imediata — SERP unificada no Workbench — 2026-08-26

- [x] Auditar a curadoria legada e transportar para a expansão SERP a coleta,
  resultados orgânicos, seleção, exclusão, classificação, análise, revisão,
  aprovação e histórico necessários ao fluxo normal.
- [x] Usar `RadarAnalysisVersion.payload.serpDecisions` como fonte única,
  preservar as chaves históricas e vincular toda projeção ao snapshot atual;
  impedir que análise antiga seja aplicada a snapshot novo.
- [x] Persistir decisões como sucessoras da análise existente, exigir
  readback remoto antes de sucesso e atualizar a recuperação local sem chamar
  provider ao abrir, selecionar ou analisar.
- [x] Analisar somente concorrentes/referências selecionados; manter PAA,
  relacionadas e Knowledge Graph como evidências complementares recolhíveis.
- [x] Remover `Curadoria detalhada` do fluxo normal sem apagar a rota legada;
  manter deep links, histórico, relatório detalhado e evidências adicionais
  compatíveis.
- [x] Cobrir seleção estável em rerender, troca de snapshot, análise somente
  da seleção e bloqueio de aprovação stale em testes direcionados.
- [x] Manter PAA, relacionadas e Knowledge Graph como contexto complementar
  recolhível sem transformar suas linhas legadas pendentes em bloqueio da
  aprovação dos resultados orgânicos.
- [ ] Executar smoke autenticado com snapshot SERP real: seleção A/B/C,
  write/readback, F5, análise, revisão e aprovação. Requer snapshot disponível
  e autorização imediatamente antes de qualquer escrita/provider.
- [x] Corrigir o readback específico da análise Radar, normalizar timestamps
  remotos e distinguir `row.id` do identificador lógico do payload; o caminho
  local foi validado em 63 testes e o reload não chama provider.
- [ ] Retomar o gate remoto somente com confirmação imediata: selecionar e
  persistir A/B/C, analisar a seleção, aprovar uma vez, atualizar uma única
  vez via DataForSEO e registrar screenshots/readback sem declarar PASS antes
  de cada evidência.

## Bug prioritário — seleção SERP visível versus ação desabilitada — 2026-08-26

- [x] Unificar checkbox, contagem, referências, análise e aprovação na
  projeção canônica `buildRadarSerpSelectionProjection`.
- [x] Preservar o contrato histórico de decisão e manter a chave visual
  ligada ao snapshot/URL, sem misturar artigo ou snapshot anterior.
- [x] Bloquear readback concorrente/obsoleto com revisão de request, writes em
  andamento, fingerprint local e `lockVersion` monotônico.
- [x] Cobrir troca de artigo/snapshot, rerender, reabertura e dez ciclos de
  seleção em fixtures imutáveis sem chamadas externas.
- [ ] Homologar no navegador autenticado dez ciclos A/B/C sem F5 ou restart,
  confirmando no DOM `VISIBLE_SELECTED_COUNT = CANONICAL_SELECTED_COUNT`;
  requer autorização imediatamente antes do write/readback remoto.
- [ ] Somente após `SERP_SELECTION_STABILITY=PASS`, retomar smoke remoto de
  seleção, readback, análise, aprovação e atualização única DataForSEO.

## Correção urgente — foco da linha versus seleção coletiva — 2026-08-27

- [x] Separar semanticamente `focusedArticleId` e `selectedArticleIds`,
  preservando `articleId` no estado editorial e `row.id` somente como
  identidade técnica da linha do grid.
- [x] Fazer clique normal de linha focar somente o artigo; fazer checkbox de
  linha/cabeçalho controlar somente seleção em lote; bloquear propagação de
  `pointerdown`/`click` nos controles e no chevron.
- [x] Fazer Workbench depender do foco e Bulk Bar depender exclusivamente das
  linhas selecionadas pelo checkbox.
- [x] Diferenciar visualmente foco e lote com borda/indicador contextual e
  tokens semânticos, preservando defaults dos consumidores existentes do grid.
- [x] Cobrir o contrato de identidade, eventos e visual em testes direcionados;
  lint, guardião visual oficial e `git diff --check` passaram.
- [ ] Executar os seis cenários físicos no navegador autenticado, incluindo
  centro do checkbox, texto, área vazia e chevron, sem reload/restart. O
  conector de navegador/Chrome não está disponível nesta continuidade.

## Correção do modelo de seleção da planilha — 2026-08-27

- [x] Unificar `selectedArticleIds[]` e `activeArticleId` em transições locais
  que impedem check sem Workbench e Workbench em artigo desmarcado.
- [x] Fazer checkbox e clique normal selecionar e ativar a mesma linha;
  preservar multiseleção e a contagem integral da Bulk Operations Bar.
- [x] Cobrir seleção de cabeçalho, fallback ao desmarcar ativo, limpeza do
  último artigo e os dois estados impossíveis em teste unitário.
- [ ] Homologar os sete passos no navegador autenticado sem reload/restart,
  verificando checkbox, rótulo `Em foco`, Workbench e contagem coletiva. Não
  requer provider nem escrita remota.

## SERP — subnavegação contextual do processo — 2026-08-27

- [x] Organizar a expansão SERP em Coleta, Concorrentes, Análise, Evidências,
  Revisão e Histórico sem criar rota, nova página ou alteração de Workbench.
- [x] Centralizar a sugestão de etapa em nextSerpStep, preservar a curadoria
  como fonte exclusiva dos concorrentes e rebaixar Anterior/Próxima para
  Revisão.
- [x] Preparar Evidências com separação explícita entre SerpEvidence,
  ExternalEvidence, ExpertEvidence e ProductEvidence sem novo schema.
- [ ] Validar no navegador autenticado o percurso completo, a análise reaberta
  após alteração de concorrente e o retorno a Concorrentes sem reload.

## Gate remoto da aprovação SERP — 2026-08-27

- [x] Homologar a curadoria delegada das posições 6, 8, 9 e 10 com motivos
  específicos e confirmar visualmente a seleção reidratada após F5.
- [x] Confirmar análise explícita com somente os quatro concorrentes humanos
  selecionados.
- [ ] Corrigir ou diagnosticar com readback remoto verificável por que a
  aprovação aparece no Histórico após F5, mas a Revisão permanece em
  `local_fallback`. Não criar schema/migration/RLS nem repetir a aprovação
  append-only sem necessidade técnica comprovada.
- [ ] Somente após `SERP_APPROVAL_RELOAD=PASS`, executar uma única atualização
  DataForSEO autorizada, com snapshot, readback, histórico e reload; manter
  `SERPER_CALLS=0`.
- [ ] Somente após `RADAR_SERP_OPERATIONAL=PASS`, iniciar ExternalEvidence
  conforme o contrato já aprovado.
