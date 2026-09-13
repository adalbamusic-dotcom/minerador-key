## Reset da homologação — 2026-09-08

- [x] Script de reset com ensaio por padrão e escopo por tipo de artefato.
- [x] Sonda de permissão antes de qualquer escrita, com os GRANT necessários.
- [x] Rodapé da fase 1 com contagem e Limpar seleção.
- [x] Controles manuais e Fresh fora do caminho básico, sem remoção de código.
- [ ] **Do proprietário do banco — bloqueia os PASSOS 1 e 2:**

  ```sql
  GRANT DELETE ON public.editorial_version_status_events TO service_role;
  GRANT DELETE ON public.editorial_artifact_versions TO service_role;
  GRANT DELETE ON public.editorial_workflow_items TO service_role;
  GRANT DELETE ON public.internal_link_graph_edges TO service_role;
  GRANT DELETE ON public.internal_link_graph_nodes TO service_role;
  GRANT DELETE ON public.internal_link_graph_proposals TO service_role;
  GRANT DELETE ON public.internal_link_graph_working_copies TO service_role;
  GRANT DELETE ON public.internal_link_graphs TO service_role;
  GRANT DELETE ON public.editorial_serp_reviews TO service_role;
  GRANT DELETE ON public.editorial_serp_snapshots TO service_role;
  ```

  Depois: `npm run reset:arquiteto -- 09762023-d0d4-4c24-b34e-d0fdfd43f891`
  (ensaio) e só então `--confirm`.
- [ ] Decidir o que fazer com os 4 itens `stage=radar` que ficarão órfãos.
- [ ] PASSO 3 em diante (§17): importar 6–10 keywords novas, 1 Silo, 2–3
  Articles — com 1 single-keyword e 1 multi-keyword — e rodar a cadeia até
  `READY_FOR_RADAR`.

## Fronteira da rodada — 2026-09-06

- [x] Marcador canônico da rodada ativa, sem migration.
- [x] Fronteira aplicada na entrada, para ArticleDNA, SiloDNA, SiloPage e grafos.
- [x] Rodada lida antes da carga, não só ao abrir o preview.
- [x] Regra de `canonical-version-authority` intocada; só o universo muda.
- [x] SERP e KeywordDNA atravessam rodada; estado canônico não.
- [x] `npm run audit:rodada` com a pergunta que libera a execução.
- [ ] **Do produto:** com `ARQUITETO_HOMOLOGATION_MODE=true` e
  `NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE=true`, rodar `audit:rodada` antes e
  depois do fresh. Esperado depois: `ACTIVE_ARTICLES = 0`, `ACTIVE_SILOS = 0`,
  `OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT = NO` com o histórico intacto.
- [ ] §14 — importar 6–10 keywords de 1 Silo, com 1 Article single-keyword e 1
  multi-keyword, e rodar a cadeia inteira até `READY_FOR_RADAR`.
- [ ] Se a segunda passada de publicados precisar religar SiloDNA aprovado a
  território, isso é corte próprio: o fresh deixa o par no acervo sem
  território de trabalho correspondente.

## Reiniciar homologação — 2026-09-06

- [x] Autoridade pura com lista de permissão e motivo por tipo.
- [x] Rota com modo server-only, escopo por marca e frase ligada ao plano.
- [x] Preview de duas etapas mostrando o que some e o que fica.
- [x] Limpeza do estado local junto com o remoto.
- [x] Testes A–I do corte.
- [ ] **Do produto:** definir `ARQUITETO_HOMOLOGATION_MODE=true` e
  `NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE=true` no ambiente de homologação.
  Sem as duas, o botão não aparece e a rota recusa.
- [ ] Do produto (§9/§10): depois do fresh, importar 5–10 keywords de 1 Silo e
  rodar a cadeia inteira — arquitetura, artigos, SERP, conclusão, links.
- [ ] §12 — conferir na rodada nova que a SERP histórica é reaproveitada quando
  o `formationBaseHash` coincide e coletada quando não.
- [ ] Territórios entram na limpeza: o par SiloDNA/SiloPage aprovado permanece
  no acervo como histórico, mas passa a não ter território de trabalho
  correspondente. É o comportamento pedido em §4/§8; se a segunda passada de
  publicados precisar religar os dois, isso é corte próprio.

## Restauração e formação limpa — 2026-09-06

- [x] Autoridade pura de restauração com baseline no artefato aprovado.
- [x] Preview obrigatório e aplicação atômica com desfazer.
- [x] Controle na aba Silos, explicando por que Reprocessar não resolve.
- [x] Painel da fase Artigos lendo o escopo da autoridade única.
- [x] Resultado explicável do Reprocessar.
- [ ] **§9–§12 — `Reiniciar formação` (FRESH).** Não entrou neste corte: ele
  precisa decidir o que acontece com `humanFormationRef`/`humanRole` (a
  restauração os preserva; o fresh recomeça), e essa é uma decisão editorial
  que muda o que a pessoa perde. Fica para corte próprio, depois da
  restauração provar 8/8.
- [ ] Do produto: `Restaurar cópia de trabalho` (1º clique = preview, 2º
  aplica) e depois `npm run audit:drift` até `8/8`.
- [ ] §18 — homologar num conjunto limpo (1 Silo, 3–5 keywords) antes de voltar
  às 28.
- [ ] Links continua parado: `LINKS_READY = NO` enquanto os Articles não
  estiverem limpos.

## Processamento automático da fase Artigos — 2026-09-06

- [x] Auditar a contradição da SERP em `skin care rosto` antes de mexer na UI.
- [x] Uma autoridade visual de SERP: badge e parecer pela mesma chave.
- [x] Política de fase declarada para evidência vigente e indecisa.
- [x] Fallback `STRUCTURAL_BASELINE_PRESERVED` como resultado terminal.
- [x] Artigo de uma keyword: compatibilidade `NOT_APPLICABLE`.
- [x] Auditorias alinhadas à política da fase.
- [ ] Do produto (§16): smoke com `skin care rosto` — Reprocessar artigos →
  conferir `FORMATION_DECISIONS_PENDING = 0` → Concluir formação, sem abrir
  Ajustes avançados. Depois (§17), um Article multi-keyword.
- [ ] §7 — incorporar ajuste determinístico seguro na divergência dentro do
  mesmo Silo, com proveniência. Hoje a divergência vigente preserva baseline;
  o ajuste automático ainda não existe.
- [ ] Registrar `UPSTREAM_SILO_REVIEW_SUGGESTED` quando a SERP apontar outro
  Silo. A constante existe; falta o ponto que a emite.

## Simplificação da fase 1 — 2026-09-06

- [x] Uma autoridade de seleção para o rodapé e as duas ações.
- [x] Recusa que nomeia a linha fora do cenário em vez de repetir "selecione".
- [x] Remover a etapa "Enviar para aprovação" do fluxo.
- [x] Rótulo de fase coerente com o estado real do artefato.
- [x] Controles manuais sob "Ajustes avançados".
- [ ] §3/§4/§5 — fazer `Reprocessar artigos` fechar sozinho intenção, funil,
  KGR, aplicabilidade e compatibilidade, com `STRUCTURAL_BASELINE_PRESERVED`
  quando a SERP não sustentar mudança. Hoje a resolução terminal já existe
  (`article-classification-closure`), mas 1 candidato do lote está em
  `CURRENT_INCONCLUSIVE_UNRESOLVED` e ainda pede decisão.
- [ ] §10 — auditar `SERP_DISPLAY_SOURCE` × `SERP_STATE_SOURCE`: não renderizar
  "Parecer da SERP" quando não há assessment; rotular fallback lógico como tal.
- [ ] §11 — Article de uma keyword: compatibilidade `NOT_APPLICABLE` e Principal
  automática, sem decisão manual.
- [ ] Do produto: smoke do §16 com um Article realmente incompleto.

## Fechamento da fase Silos — 2026-09-06

- [x] Preview obrigatório antes de qualquer escrita de `Confirmar arquitetura`.
- [x] Confirmação amarrada à assinatura do plano previsto.
- [x] Preview mostra Silos, atribuições, SiloPage, canonical e publicação.
- [x] Recusa de quebra e de restauração parcial preservadas.
- [x] Verificado que a restauração parte de `humanFormationRef`/`humanRole`.
- [x] Verificado que `audit:drift` ignora proposta no-op.
- [ ] **Do produto:** clicar `Confirmar arquitetura` (1º clique = preview,
  2º = aplica) e rodar `npm run audit:silopage` para o readback.
- [ ] **Do produto:** restaurar as 3 atribuições locais e rodar `audit:drift`
  até `8/8`. Se o plano da confirmação não trouxer as três, é isso que o
  preview vai mostrar — e aí falta um caminho de restauração dirigido.
- [ ] `territory:17a6da12` (Anti-idade e Retinol candidate) deve terminar com
  `ACTIVE_ASSIGNMENTS = 0`; `superseded` fica para corte próprio, sem bloquear.
- [ ] Continua parado: SERP, Concluir formação, Processar links, Radar.

## Guarda de no-op na conclusão — 2026-09-06

- [x] Comparador editorial normalizado contra a canônica aprovada.
- [x] `Concluir formação` recusa criar sucessora sem diff substantivo.
- [x] No-op vira mensagem, não silêncio.
- [x] Auditoria e mesa compartilham a mesma autoridade de diff.
- [ ] Do produto: escolher para o smoke um Article que REALMENTE precise de
  formação/revisão. `skin care principia` já está formado e canônico em v10 —
  usá-lo só produziria `NO_NEW_VERSION`.
- [ ] Restaurar o drift LOCAL para 8/8 ANTES de processar links: o grafo é do
  Silo/conjunto, e com Article em drift estrutural `LINK_GRAPH_REBASE_SAFE = NO`.
- [ ] Limpeza das propostas no-op de `principia` (v11–v17) fica para quando
  existir mecanismo de abandono/supersessão de proposta. Não promover nem
  deletar para limpar tela.

## Passada planejada e reconciliação de publicados — 2026-09-06

- [x] Declarar o cenário de publicação em um lugar só, com o porquê.
- [x] `publishedVerificationRequired` com padrão `true` na portaria da SiloPage.
- [x] Aplicar a bandeira no servidor, nunca pelo corpo da requisição.
- [x] Manter `canonical_mismatch` bloqueando mesmo no cenário planejado.
- [x] Corrigir a seleção da canônica na auditoria (`audit:arquiteto`).
- [ ] **PUBLISHED_STRUCTURE_RECONCILIATION** — segunda passada: conteúdo
  publicado vs planejado, sitemap, canonical, redirects, slug protegido,
  keyword principal publicada, SiloPage publicada, catálogo do site, duplicatas
  de raiz publicada e `publishedStructureRef`. Quando entrar, virar
  `CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION = true`.
- [ ] Do produto (smoke ponta a ponta com `skin care principia`): Confirmar
  arquitetura → Reprocessar artigos → Concluir formação → Processar links →
  Confirmar links internos → conferir `READY_FOR_RADAR`. Sem importar ao Radar.
- [ ] Continua parado: as 3 assignments do drift LOCAL e o rebase dos 6 grafos.

## Preflight da SiloPage — 2026-09-06

- [x] Auditar a autoridade de identidade/publicação e confirmar o consumo pela
  consolidação (`CONFIRM_ARCHITECTURE_USES_IT = YES`).
- [x] Preflight read-only por SiloPage (`npm run audit:silopage`).
- [x] `siloPageApprovalPreflight` reusando a portaria existente.
- [x] Preflight visível na aba Silos antes de `Confirmar arquitetura`.
- [x] Testes A–G do corte.
- [ ] Do produto: rodar `Confirmar arquitetura` para as três — a identidade já
  resolvida entra no payload e a portaria libera 3/3. Conferir no readback
  `SILO_PAGE_APPROVED = 3/3` com entityId, versionId, slug, canonical e
  `published`.
- [ ] Continua parado de propósito: SERP/formação, rebase dos 6 grafos
  (`baseStale`, reaproveitáveis) e as 3 assignments do drift LOCAL.

## Canônica × proposta e SiloPage — 2026-09-06

- [x] Separar `canonical` (última aprovada) de `workingProposal` na leitura.
- [x] Proposta em edição deixa de rebaixar a versão aprovada.
- [x] Invalidação estrutural exige motivo declarado, nunca "há versão mais nova".
- [x] Grade mostra a versão aprovada e a revisão em andamento separadas.
- [x] Links consome a canônica aprovada, não a proposta.
- [x] Tipo de unidade vira fato derivado; some a pendência artificial.
- [x] Auditoria read-only de diff entre canônica e proposta (`audit:versoes`).
- [x] Classificar SiloPage 0/3: NEVER_APPROVED nas três.
- [ ] Mostrar na aba Silos os bloqueios de aprovação da SiloPage ANTES do
  clique — hoje a recusa só existe no servidor.
- [ ] Do produto: verificar identidade das duas SiloPages publicadas e planejar
  o canonical da nova, para `Confirmar arquitetura` fechar 3/3.
- [ ] Do produto: a proposta v16 de `principia` é no-op; ela fica no histórico
  até existir mecanismo de abandono de proposta. Não promover para limpar tela.

## Ownership das fases e autoridade única — 2026-09-06

- [x] Remover o fallback provisório da leitura de conflito do artigo.
- [x] Manter o conflito de fronteira de Silo na fase Silos.
- [x] Remover a segunda autoridade de aprovação do ArticleDNA.
- [x] Recusar por escrito a ação `approve` na porta de persistência do fechamento.
- [x] Fase Links nomeia a dependência de Artigos antes do estado da tela.
- [x] Liberar o latch de `linksSaveState` ao sair de `processarLinks`.
- [ ] Decisão do Planejador: registrar "Tipo de unidade" deve reabrir a
  aprovação do ArticleDNA? Hoje ela rebaixa para `proposed` sem dizer.
- [ ] Decisão do Planejador: qualificar os rótulos das colunas Aprovação e
  Status. O badge é compartilhado com outros módulos.
- [ ] Do produto: reprocessar `skin care principia` com SERP e concluir a
  formação, conferindo que os dois conflitos não reaparecem.

## Fechamento humano e ações por aba — 2026-09-06

- [x] Separar, na leitura, a versão aprovada da revisão corrente.
- [x] Papel do artigo com fonte única (decisão humana vigente).
- [x] Serviço único de fechamento para aprovação individual e em lote.
- [x] Seletor "Alterar status" com enviar para aprovação, aprovar e reabrir
  revisão, com contagem de elegíveis e bloqueados antes do clique.
- [x] Bloqueio que nomeia o problema e o controle que o resolve.
- [x] Remover `changeSelectedArticleStatus` em vez de reconectá-lo.
- [x] Revalidação da aprovação no servidor, aditiva na rota de artefatos.
- [x] Reabertura como sucessora em `proposed`, sem rebaixar a versão aprovada.
- [x] Corrigir a fronteira das ações por aba (Silo em Artigos, Radar em Links).
- [x] Marcar a revisão de links como desatualizada quando o artigo ganha
  sucessora, preservando o grafo aprovado.
- [ ] Do produto: aprovar artigos na tela, recarregar e conferir em outra sessão
  que voltam aprovados com a mesma versão e hash.
- [ ] Do produto: provocar gravação sem readback e conferir que a tela manda
  recarregar em vez de repetir.
- [ ] Restaurar os três vínculos territoriais divergentes — fora deste corte,
  precisa de impacto demonstrado antes de qualquer restauração.

## Persistência canônica da revisão IA — 2026-08-29

- [x] Reutilizar `editorial_artifact_versions` com `article_architecture_ai_review`.
- [x] Persistir NO_OP como resultado válido.
- [x] Persistir propostas materiais com `proposalId` estável.
- [x] Registrar decisão humana como sucessora do artefato.
- [x] Incluir a base revisada no `contentHash` e aplicar a política de STALE.
- [x] Readback obrigatório antes do SUCCESS.
- [x] Hidratar a revisão vigente por Article no carregamento e no F5.
- [x] Migration versionada ampliando apenas o CHECK de `artifact_type`.
- [ ] Do produto: aplicar o SQL no remoto e rodar o smoke A–F.

## IA por Article e durabilidade da revisão — 2026-08-29

- [x] Tornar o Article a unidade de execução da IA, com concurrency = 1.
- [x] Substituir o registro cru da keyword por projeção estratégica no payload.
- [x] Enviar a SERP como veredito e observações, sem snapshots crus.
- [x] Enviar o Silo como fronteira, sem grafo completo de artigos e links.
- [x] Medir o payload antes da chamada e falhar só o Article que excede.
- [x] Isolar falha por Article e reportar execução parcial.
- [x] Contar propostas materiais na bancada e na aba do artigo pelo mesmo
  classificador.
- [x] Auditar a durabilidade da revisão e emitir o pedido estrutural em vez de
  criar fallback local.
- [ ] Bloqueado por decisão estrutural: persistir execução, NO_OP, propostas,
  `contentHash`, proveniência e decisão humana para sobreviver ao F5.
- [ ] Validação manual: selecionar cinco artigos, confirmar cinco execuções,
  provocar falha em um e conferir que os outros quatro mantêm as propostas.

## Fronteira de aprovação do Article — 2026-08-29

- [x] Desacoplar a aprovação do ArticleDNA do handoff automático ao Radar.
- [x] Reverter `siloId: nullable` nos contratos downstream e impedir projeção
  de unidade incompleta.
- [x] Separar `READY_FOR_SILOS` de `READY_FOR_RADAR` com derivadores próprios.
- [x] Exigir Silo aprovado e InternalLinkGraph aprovado no gate do Radar.
- [x] Transformar "Ver definição completa do artigo" em ficha vertical
  somente leitura no padrão do KeywordDNA.
- [x] Manter CTA/promessa como nota não bloqueante.
- [ ] Validação manual: aprovar um artigo sem Silo, confirmar que nada vai ao
  Radar e que a ficha abre completa.

## Fechamento funcional da fase Artigos — 2026-08-29

- [x] Transformar o perfil completo da keyword em ficha vertical por tópicos.
- [x] Tirar `Revisão Minerador` do resumo e tratá-la como proveniência.
- [x] Classificar a SERP em compatível, inconclusiva e divergente, sem conflito
  bloqueante quando a evidência é insuficiente.
- [x] Mostrar objeto, evidência, motivo, impacto e ações na divergência real.
- [x] Impedir conflito de agrupamento em artigo com uma única keyword.
- [x] Explicitar a função da IA do Arquiteto na própria aba.
- [x] Centralizar as decisões humanas do artigo em um checklist com o que
  falta, por quê e como resolver.
- [x] Criar a aprovação explícita `[Aprovar ArticleDNA]` e o fluxo de status.
- [x] Remover `Página de categoria` da fase Artigos.
- [ ] Validação manual do ciclo completo: Importação → Lógica → SERP → IA →
  Revisão → Aprovar ArticleDNA → Pronto para Silos.

## Perfil completo da KeywordDNA no Arquiteto — 2026-08-29

- [x] Restaurar o resumo horizontal denso da keyword no painel do artigo.
- [x] Levar todo o KeywordDNA recebido para dentro do accordion, em seções.
- [x] Garantir projeção lossless com subaccordion de proveniência técnica.
- [x] Restaurar a Apresentação Contextual com texto integral e proveniência,
  transportando-a no snapshot canônico do Arquiteto.
- [x] Empilhar Principal, Secundárias e Reforços no mesmo componente readonly.
- [x] Manter zero controles de mutation e o KGR do artigo separado.
- [ ] Validação manual: abrir o artigo, conferir densidade das duas linhas,
  abrir o perfil completo e conferir seções, apresentação e proveniência.

## Gates de entrada e saída da fase Artigos — 2026-08-29

- [x] Exigir KeywordDNA consolidada (Qualificação Semântica conclusiva) para a
  importação normal, com motivo legível e recusa no writer canônico.
- [x] Manter intenção, funil e KGR como fatos upstream: o Arquiteto não
  completa a qualificação do Minerador.
- [x] Remover Silo e hierarquia Pilar/Suporte do gate de aprovação do Article.
- [x] Criar derivador único de `READY_FOR_SILOS` e aplicá-lo nos três pontos
  da interface, eliminando o estado incoerente.
- [x] Classificar proposta de IA sem mutação como execução concluída sem
  alteração estrutural, sem pendência humana artificial.
- [x] Tirar promessa, CTA e enriquecimento editorial do gate estrutural,
  preservando-os como alerta.
- [ ] Repetir o teste operacional com uma KeywordDNA realmente consolidada e
  validar manualmente a interface (importação recusada, artigo fechando sem
  Silo, "Pronto para Silos" só após o fechamento).
- [ ] Depende do pedido estrutural da decisão KGR: enquanto não houver campo
  canônico, artigo não pleno com Principal aplicável não fica pronto para
  Silos.

## Regra final de KGR do artigo — 2026-08-28

- [x] Ler score e aplicabilidade reais da KeywordDNA Principal sem recalcular
  nem sobrescrever.
- [x] Classificar KGR pleno com `kgr >= 0` e `kgr < 0.25` (0.25 exato fora),
  exibindo `Sim · KGR pleno` em token verde e sem pedir decisão humana.
- [x] Encaminhar `>= 0.25` + `Aplicável` para decisão humana; `>= 0.25` +
  `Não aplicável` para `Não`; `>= 0.25` + pendente para `Pendente`; score
  ausente permanece `—`.
- [x] Preservar score e aplicabilidade individuais de secundárias e reforços,
  sem média, maioria ou contagem definindo o artigo.
- [x] Exibir na aba SERP, apenas para artigo não pleno com Principal aplicável,
  KGR da Principal, aplicabilidade upstream, competição observada, força da
  evidência e recomendação para estratégia KGR.
- [x] Manter o select do Article separado do select de aplicabilidade do
  KeywordDNA e distinguir `KEYWORD_KGR_SCORE`, `KEYWORD_KGR_APPLICABILITY`,
  `ARTICLE_KGR_DECISION` e `ARTICLE_KGR_DECISION_SOURCE`.
- [x] **APROVADO E IMPLEMENTADO LOCALMENTE:** local canônico da
  decisão KGR do artigo (estados, autoria, data, justificativa e histórico),
  conforme `propostas/2026-08-28-pedido-estrutural-decisao-kgr-do-artigo.md`.
- [x] Habilitar o registro humano `Sim/Não` na Revisão,
  propagar a decisão ao Radar e ao Planejador sem substituir o KGR de cada
  KeywordDNA e usar `KGR = Sim` como insumo (não automático) do slug
  exact/near-exact.
- [ ] Executar smoke autenticado de Article KGR com casos FULL, limite 0.25,
  Sim, Não, troca de Principal, stale `lock_version`, F5 e handoff ao Radar.
- [ ] Só marcar `ARTICLE_KGR_REMOTE_HOMOLOGATION = PASS` após readback real de
  decisão/source/ator/data, sucessora de ArticleDNA e bloqueio de pendência.

## SERP prioritária e retorno estrutural downstream — 2026-08-27

- [x] Apresentar precedência de recomendação para assessment SERP ativo,
  completo e observável, mantendo Lógica/IA como hipótese/proposta e humano
  como consolidador.
- [x] Manter explícita a insuficiência/desatualização sem desempate automático
  e sem mutação da working copy.
- [x] Registrar o slug atual/provisório sem gerar recomendação de slug por
  heurística ausente.
- [ ] **PEDIDO ESTRUTURAL PARA O PLANNER GERAL:** aprovar persistência
  versionada da recomendação SERP de slug e de
  `STRUCTURAL_REVIEW_REQUIRED`, conforme
  `propostas/2026-08-27-pedido-estrutural-serp-slug-structural-review.md`.
- [ ] Após a fundação aprovada, implementar nos módulos proprietários a emissão
  downstream sem mutação e o retorno humano ao Arquiteto; não iniciar nesta
  tarefa.
# Backlog — Arquiteto

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

- [x] Consolidar um único script administrativo, substituindo os dois anteriores.
- [x] Fixar o alvo e validar a identidade da marca antes de remover.
- [x] Lista explícita dos registros, com condições positivas para `architect` e
  `radar` no lugar de `stage <> 'architect'`.
- [x] Mapear dependências por FK **e dentro dos payloads**; Planejador, Redator,
  Publicações ou outra marca abortam mostrando os identificadores.
- [x] Exportação prévia somente-leitura com manifesto de ids, contagens, hashes
  do preservado e procedimento de restauração.
- [x] Uma transação, dependentes antes das origens, sem anular referência.
- [x] Gatilhos append-only nomeados, suspensos e restaurados no mesmo escopo,
  com verificação — sem remover função, FK ou validação.
- [x] Verificação de conjunto zerado, preservação por hash de ids e ausência de
  órfãos, com rollback integral em qualquer divergência.
- [x] Modo `:simular` para ensaio e para provar idempotência sobre estado vazio.

### Abertas — execução

- [ ] Rodar com `v_simular := true` e conferir o manifesto impresso.
- [ ] Rodar com `:simular = true` e conferir o manifesto.
- [ ] Executar a purga e registrar o resultado por tabela.
- [ ] Conferir Arquiteto e Radar vazios **nas duas sessões**, pelo servidor.
- [ ] Confirmar que recuperação local não repovoou o servidor.
- [ ] Reexecutar em simulação sobre o estado vazio (idempotência).
- [ ] Validar o script em ambiente isolado: dependência externa, falha
  intermediária e execução repetida.

### Correção funcional separada

- [ ] **Aba Silos sem seleção e sem exclusão.** Registrado como defeito próprio;
  não é motivo desta purga nem é resolvido por ela.

## Fundação estrutural de Links Internos — 2026-08-26

- [x] Auditar o versionamento atual de ArticleDNA, SiloDNA, SiloPage,
  versionamento, hashes, readback, autorização canônica e consumidor Radar →
  Planejador.
- [x] Implementar localmente os contratos determinísticos de
  `InternalLinkGraph`, nós ArticleDNA/SiloPage, arestas dirigidas, propostas,
  stale, sucessora e aprovação humana separada.
- [x] Criar a migration local
  `20260826225145_internal_link_graph_foundation.sql` com quatro tabelas,
  FKs/constraints, guards append-only, RLS/policies e RPC server-side.
- [x] Implementar localmente a persistência transacional pareada
  `persist_silo_pair_atomic(...)` e adaptar a consolidação humana sem fundir
  SiloDNA/SiloPage.
- [x] Criar rollback local explícito, sem `CASCADE`, e preflights remotos
  catalog-only.
- [x] Cobrir domínio e estrutura local: `10/10 PASS`.
- [x] Executar os preflights remotos read-only e registrar catálogo,
  pré-condições e ausência dos alvos antes de qualquer apply manual.
- [x] Aplicar manualmente a fundação do InternalLinkGraph e a atomicidade do
  par; confirmar preflight, readback e integridade dos guards.
- [x] Executar post-readback e smoke transacional/cross-brand sem dados reais;
  confirmar RLS, isolamento, append-only, versões, hashes e rollback técnico.
- [ ] Implementar a experiência funcional da aba Links Internos sobre o
  contrato remoto confirmado; React Flow continua sendo projeção e não fonte
  de verdade.

**Limite:** catálogo de listas/workflow permanece fora da transação do par;
Radar/Planejador receberam apenas referência opcional e não podem reescrever o
grafo. As migrations foram aplicadas manualmente e o próximo gate é funcional,
não uma nova alteração estrutural.

## Fechamento do fluxo mínimo até o Radar — 2026-08-24

- [x] Implementar criação manual pareada `minerador_keyword_lists` +
  `SiloDNA draft` + `SiloPage new`, com somente nome/slug na UI, slug
  normalizado, referência canônica e readback guardado.
- [x] Preservar a cópia de trabalho no workflow canônico para agrupamento,
  silo, desanexação, slug, hierarquia, revisão IA, recomendação SERP e
  undo/redo, sem alterar identidade publicada.
- [x] Liberar edição manual de papel em artigos novos (`Principal`,
  `Secundária`, `Reforço`), com demotion automático da principal anterior e
  persistência/readback pelo mesmo workflow canônico.
- [x] Entregar o snapshot enriquecido de cada KeywordDNA à revisão DeepSeek,
  junto com assessments SERP disponíveis, silos e proteções dos publicados.
- [x] Fechar a barra contextual no fluxo `Validar SERP` → `Revisar com IA`
  opcional → `Confirmar arquitetura` → `Enviar ao Radar`.
- [x] Manter DataForSEO como único provider da compatibilidade SERP e conectar
  o consumidor à Connection global READY já disponível, sem usar allintitle,
  Serper, RapidAPI ou OpenRouter. O consumidor não exige capability,
  grants/bindings ou quota específica; readback e smoke real permanecem gates
  manuais.
- [x] Evitar recarga duplicada do catálogo de silos ao entrar no Arquiteto;
  troca de Brand e criação explícita continuam atualizando o dado necessário.
- [x] Alinhar o gate de confirmação para 1–6 keywords: uma principal
  obrigatória, até cinco apoios e seis como teto, sem preenchimento artificial.
- [x] Substituir a sequência guardada da criação pareada por boundary
  transacional/RPC aprovado, sem migration automática nesta etapa.
- [ ] Validar manualmente no Chrome autenticado: criação, F5/nova aba/logout,
  isolamento por Brand, seleção, mouse/touchpad, SERP DataForSEO, revisão
  DeepSeek, confirmação e handoff ao Radar.

> Nota: as entradas históricas abaixo que descrevem o criador manual como
> catálogo-only ou o provider como Serper estão superseded pela seção acima;
> permanecem apenas como trilha de decisão.

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

> Registro histórico supersedido pela criação manual de silo simplificada em 2026-08-24.

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

## Entregue nesta etapa — reconciliação do KeywordDNA enriquecido (2026-08-24)

- [x] Corrigir a divergência de envelopes: `volume_measurement` atual tem precedência e `google_ads_measurement` é aceito somente como compatibilidade legada.
- [x] Preservar null como indisponível, zero como medição válida e transportar os campos ricos já existentes sem usá-los para substituir decisões humanas ou validar SERP.
- [x] Hidratar `demandEvidence` no read-model do bootstrap canônico sem alterar layout, persistência, provider ou módulos vizinhos.
- [x] Cobrir precedência, aliases do contrato Google Ads, evidência temporal e preservação da proveniência em testes direcionados.
- [ ] Validar manualmente no workspace autenticado uma keyword enriquecida pelo Minerador e confirmar readback remoto; nenhuma operação remota foi executada pelo agente.
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

## Entregue nesta etapa — criação manual de silo simplificada (2026-08-24)

- [x] Reduzir o modal a `NOME DO SILO` e `SLUG`, mantendo placeholders legíveis e validação de slug existente.
- [x] Remover keyword/entidade central, criação manual de SiloPage, situação de publicação e URL publicada do fluxo básico.
- [x] Persistir somente o registro operacional vazio e o slug normalizado; não criar KeywordDNA, entidade sintética, SiloDNA ou SiloPage.
- [x] Preservar formação posterior de SiloDNA/SiloPage e o contrato estratégico que exige entidade central quando essa etapa for executada.
- [x] Cobrir no teste direcionado a ausência dos campos removidos, a obrigatoriedade de nome/slug e a ausência de criação artificial de artefatos.
- [ ] Validar manualmente no Chrome criação, cancelamento, reload, readback remoto e isolamento entre marcas.

## Bloqueado — criação pareada de SiloDNA/SiloPage (2026-08-24)

- [ ] Aprovar extensão contratual para representar `SiloDNA` `draft`/`em_formacao` sem entidade artificial.
- [ ] Aprovar esqueleto inicial de `SiloPage` `Novo` sem conteúdo/canonical/URL inventados.
- [ ] Implementar persistência canônica pareada com readback dos dois artefatos e falha sem sucesso parcial.
- [ ] Ajustar normalização para aceitar `manicure` e `/manicure`, com formato canônico `/manicure`.
- [ ] Executar testes de relação, Brand, reload, falha de persistência, lint, TypeScript/build e Chrome.
- **Bloqueio:** `SiloDNASchema`/`SiloPageSchema` atuais não representam esse estado. Ver SDD `docs/04-arquiteto/propostas/2026-08-24-silo-draft-pareado-silopage-novo.md`.

## Providers globais — DataForSEO SERP compartilhada (corrigido em 2026-08-25)

- [x] Auditar o contrato global efetivo de DataForSEO e identificar que
  `allintitle` não é uma operação SERP geral.
- [x] Corrigir o resolvedor server-side para reutilizar a Connection global
  DataForSEO sem criar recurso específico do Arquiteto nem bloquear a coleta
  por uma capability específica de SERP do Arquiteto.
- [x] Conectar `Validar SERP` ao executor compartilhado, normalizador de
  fixtures e ledger `integration_usage_events`, com falha fechada e sem
  alteração parcial do estado.
- [x] Adaptar `Revisar com IA` ao resolver DeepSeek global, JSON mode, thinking
  da Connection, limite explícito de tokens e erro sanitizado.
- [x] Cobrir a fronteira com fixtures/testes sem chamadas reais.
- [ ] Executar smoke autenticado real de `Validar SERP`, registrar o readback
  sanitizado e liberar a homologação operacional. Não há migration,
  capability, grant, binding ou quota específica de SERP para configurar neste
  consumidor.

## Entregue nesta etapa — experiência funcional sem infraestrutura (2026-08-24)

- [x] Remover do preview SERP as referências visíveis a DataForSEO, créditos,
  retries e consulta técnica; manter `Validar SERP` como ação funcional.
- [x] Remover do botão IA a referência a provider/Connection e manter somente
  `Revisar com IA`.
- [x] Traduzir falhas de SERP e IA para mensagens funcionais sem apagar o
  detalhe técnico mantido nas rotas internas.
- [x] Preservar controles manuais, contratos, ações em lote e layout da
  planilha.
- [ ] Validar manualmente no Chrome os estados de sucesso, indisponibilidade,
  fechamento do modal e continuidade da edição manual; nenhum provider real
  foi chamado nesta etapa.

## Entregue nesta etapa — seleção individual e silos canônicos (2026-08-25)

- [x] Restaurar a projeção de keywords sem `clusterId` como linhas individuais,
  sem compartilhar selection ID entre artigos.
- [x] Preservar clique simples, Ctrl/Cmd, Shift, pintura por arraste, seleção
  de cabeçalho, indeterminate, filtros e seleção oculta.
- [x] Separar semanticamente os checkboxes de artigo, grupo de silo e Página
  do Silo, com atributos `data-*` e acessibilidade explícita.
- [x] Manter `Sem Silo` como `siloId = null`, sem entidade, slug ou artefato
  canônico artificial.
- [x] Reidratar opções pelo par SiloDNA/SiloPage persistido, com etiqueta
  canônica de breadcrumb/H1/slug quando o nome legado estiver ausente.
- [x] Cobrir seleção, identidade, readback de silo e isolamento por membro em
  testes com fixtures, sem chamadas externas.
- [ ] Validar manualmente no Chrome autenticado: clique A/B/C, cabeçalho do
  silo, pintura, troca individual para silo real, F5 e isolamento entre Brands.

## Correção de seleção e revisão DeepSeek — 2026-08-25

- [x] Trocar a identidade de seleção derivada de `clusterId`/keywords por
  `workingArticleId`, `articleId` ou ID persistente do workflow, preservando o
  campo na cópia de trabalho sem migration.
- [x] Separar handlers `row` e `group`, interromper propagação do checkbox da
  linha e manter o cabeçalho de silo independente.
- [x] Reconhecer pintura somente após 6px, capturar o ponteiro depois do
  threshold, bloquear texto nativo somente no modo pintura e encerrar também
  em `pointercancel`/`blur`.
- [x] Recalcular a faixa imediatamente ao mudar de linha, preservando o
  snapshot inicial e evitando `setState` para a mesma linha ou o mesmo Set.
- [x] Adaptar `Revisar com IA` ao override por chamada `thinking: disabled`,
  reduzir o orçamento de saída e manter o diagnóstico sanitizado de
  `finishReason`, content, JSON e Zod.
- [x] Manter a resposta da IA como proposta pendente; aplicação na cópia de
  trabalho exige ação humana explícita.
- [x] Cobrir identidade, F5/readback do ID, cliques, intervalos, pintura,
  silos, propagação, diagnóstico e proposta com fixtures locais.
- [ ] Validar manualmente no Chrome autenticado com mouse e touchpad,
  incluindo clique A/C, retorno no arraste, header indeterminate, troca de
  silo, F5 e execução da revisão após SERP válida.
- [ ] Registrar os valores reais do diagnóstico do endpoint em uma execução
  autenticada; nenhum log/provider real foi acessado pelo agente nesta etapa.

## Histórico — Consolidação canônica A1–A20 — 2026-08-25

### Lotes locais

- [x] Consolidar documentalmente Artigos, Silos e Links Internos.
- [x] Auditar contratos ArticleDNA, SiloDNA, SiloPage, ContentPlan e links
  operacionais.
- [x] Auditar workspace, routes, repositories, adapters, migrations locais,
  testes e UI em modo somente leitura.
- [x] Registrar divergências entre docs históricos e implementação vigente.
- [x] Registrar que a seleção é efêmera e não persiste arquitetura.
- [~] Fechar working copy/proveniência completa de todos os campos do
  KeywordDNA.
- [~] Separar estados de lógica, SERP, IA e revisão até o nível necessário.
- [~] Formalizar candidata a Silo sem promoção automática.
- [~] Reforçar gate local de exatamente um Pilar antes de Silo formado.
- [~] Fechar verticalidade e validator local de slug, preservando publicados.
- [~] Confirmar manualmente SERP/IA/readback/Chrome quando houver gate e
  autorização específicos.

### Bloqueador estrutural

- [ ] Levar ao Planner Geral o
  InternalLinkGraph: contrato canônico, nós, arestas, relações, anchor
  concepts, versionamento, tenant/RLS, readback e handoffs.
- [ ] Não implementar React Flow antes do contrato e persistência do grafo.
- [ ] Não implementar MCP nesta fila.
- [ ] Não promover SiloDNA.linkMap, ArticleDNA.internalLinks ou
  InternalLinkAssignment a grafo por conveniência.
- [ ] Decidir em fila própria se a atomicidade do pair SiloDNA/SiloPage exige
  boundary transacional/RPC.
- [ ] Definir em fila própria o Brand Context Pack e o gabarito de docs/skills
  com Marca/Planner Geral.

### Links Internos — dependentes do pedido estrutural

- [ ] Modelo canônico do grafo.
- [ ] Inbound/outbound e relações direcionadas.
- [ ] Anchor concepts e candidatos por aresta.
- [ ] Proposta IA, revisão e aprovação humana.
- [ ] Handoff ao Planejador.
- [ ] Handoff ao Redator.
- [ ] Validação de URL/integridade em Publicações.
- [ ] React Flow como projeção.

### Ordem recomendada

1. [ ] Fase 0 — baseline e regressões.
2. [ ] Fase 1 — working copy/proveniência de Artigos.
3. [ ] Fase 2 — lógica e candidata a Silo.
4. [ ] Fase 3 — SERP como evidência.
5. [ ] Fase 4 — IA como proposta.
6. [ ] Fase 5 — ArticleDNA e readback.
7. [ ] Fase 6 — working architecture de Silos.
8. [ ] Fase 7 — lógica/SERP/IA de Silos.
9. [ ] Fase 8 — consolidação de Silos.
10. [ ] Fase 9 — InternalLinkGraph após aprovação estrutural.
11. [ ] Fase 10 — React Flow.
12. [ ] Fase 11 — handoffs.

O plano, a auditoria e o pedido estrutural estão preservados em
`docs/_arquivo/2026-08-documentacao-legada/`; o contrato vigente está em
`docs/04-arquiteto/links-internos-estado-e-contrato.md`.



## Correção localizada de latência da seleção — 2026-08-25

- [x] Auditar o caminho de `selectedArticleIds` e confirmar que o toggle é
  estado efêmero, sem efeito de persistência, fetch, readback ou refresh.
- [x] Memoizar linha, célula de seleção e subárvores pesadas; props de seleção
  carregam apenas o booleano da linha afetada.
- [x] Manter dados derivados, agrupamento e ordenação independentes do `Set`
  de seleção; preservar contadores, indeterminate, grupos e filtros.
- [x] Preservar clique simples, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift e pintura
  imediata com comparação semântica do resultado.
- [x] Adicionar regressão estática da fronteira de renderização e ausência de
  persistência no handler do clique; teste focado atual `15/15`.
- [ ] Coletar no Chrome autenticado os tempos A/B/C/D com `performance.now()`
  e comparar antes/depois; esta sessão não disponibilizou backend Chrome.
- [ ] Validar manualmente com mouse e touchpad e registrar a quantidade de
  linhas/células que efetivamente rerenderizam.

### Verificação final registrada

- [x] Suite focada da correção: `24/24`.
- [x] Suite oficial `test:arquiteto`: `120/121`; o único erro permanece no
  teste estático legado que inspeciona a marcação do botão do Minerador.
- [x] Typecheck sem erros novos do Arquiteto; quatro erros preexistentes fora
  do escopo continuam documentados no estado atual.

## Lote 1 — proveniência KeywordDNA → ArticleDNA — 2026-08-25

- [x] Preservar o registro bruto do KeywordDNA dentro da working copy, com
  snapshot e referência individual.
- [x] Preservar identidade, métricas, KGR, publicação, decisão humana,
  histórico e refs sem converter `null` em zero ou inventar campos ausentes.
- [x] Reprojetar snapshot/ref no bootstrap e preservar versão/hash explícitos
  no handoff Minerador → Arquiteto.
- [x] Cobrir import, F5/readback local, ArticleDNA individual, brand isolation,
  KGR, publicação, decisão humana, demanda, competição e proveniência.
- [x] Registrar a suíte focada `19/19`, a evidência complementar `21/21` e
  `test:arquiteto` `122/123` com uma falha estática legada do Minerador.
- [ ] Confirmar readback remoto/autenticado e provider real em fila autorizada.
- [ ] Resolver no Planner Geral a ausência de artifact/repository versionado
  de KeywordDNA quando a origem não fornece versão/hash canônicos.

### Próximo lote

- [x] Lote 2 — baseline operacional da working copy, sem alterar regras de
  agrupamento, SERP, IA ou providers.

## Lote 2 — baseline operacional da working copy — 2026-08-25

- [x] Medir temporariamente o intervalo click → setState → commit visual com
  `architect.selection.click-to-commit` em ambiente de desenvolvimento.
- [x] Corrigir a causa visual da seleção: remover `preventDefault()` do clique
  normal, preservando o bloqueio nativo somente após pintura por arraste.
- [x] Preservar clique individual, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura,
  grupos, indeterminate, filtros e seleção oculta.
- [x] Provar por regressão que a seleção não chama persistência, fetch,
  readback, SERP, IA, rebuild de DNA ou recovery.
- [x] Remover o modal intermediário de `Validar SERP` e iniciar o processo
  diretamente, mantendo status inline na planilha.
- [x] Validar no Chrome dez ciclos mouse, Shift, Ctrl/Cmd, pintura/arraste e
  larguras responsivas `360/768/1024/1440`.
- [~] Validar hardware de touchpad separadamente; o gesto contínuo de ponteiro
  foi validado, mas não houve touchpad físico disponível nesta sessão.
- [~] Concluir provider real, persistência remota e readback SERP; a ação
  manual permaneceu em `SERP processando` e não autoriza declarar homologação.
- [x] Registrar `20/20` nos testes focados, `122/123` em `test:arquiteto` com
  uma falha estática legada do Minerador e `git diff --check` aprovado.

### Próximo lote

- [x] O pacote operacional do Lote 3 foi recebido e implementado na seção
  seguinte.
- [x] O pacote operacional do Lote 4 foi recebido e implementado após a seção
  do Lote 3.

## Lote 3 — lógica canônica de artigos e candidata a Silo — 2026-08-25

- [x] Priorizar volume/demanda, resultados/competitividade, intenção,
  entidade/coerência, KGR, sinais comerciais secundários e demais evidências.
- [x] Não criar candidata com volume alto isolado; bloquear termo específico
  que só tenha volume como argumento.
- [x] Marcar oportunidade KGR somente com volume `>= 120` e resultados menores
  que o volume; preservar KGR como evidência, não aprovação ou Pilar.
- [x] Produzir razões determinísticas de agrupamento e manter grupos como
  hipótese provisória da pergunta “devem competir na mesma página?”.
- [x] Reservar candidatas a Silo fora dos grupos de artigo e sem criar
  ArticleDNA, SiloDNA ou SiloPage.
- [x] Preservar cada keyword, ref individual, `null`, zero real e decisão
  humana; ausência de métrica não descarta a keyword.
- [x] Expor na working copy os controles `Usar em artigo`, `Remover marcação`
  e `Reservar como candidata`, com decisão humana protegida contra reprocesso.
- [x] Preservar a marcação no payload da working copy, readback canônico e
  recovery local sem migration, schema SQL, RLS, RPC ou provider.
- [x] Teste específico: `9/9`; `test:arquiteto`: `122/123` com falha estática
  legada do Minerador.
- [~] Executar manualmente `Processar lógica` no workspace autenticado e
  confirmar readback remoto da candidata; requer ação explícita do usuário
  porque grava a working copy remota.

### Próximo lote

- [x] O pacote operacional do Lote 4 foi recebido e implementado na seção
  seguinte.
- [ ] Lote 5 — IA e revisão — aguarda pacote operacional próprio, evidência da
  hipótese e autorização do fluxo de revisão humana.

## Lote 4 — SERP de formação dos artigos — 2026-08-25

- [x] Produzir evidência observacional por keyword e versão, sem mover,
  dividir, juntar, trocar principal ou consolidar ArticleDNA.
- [x] Persistir compatibilidade, sobreposição por URLs/domínios, intenção
  observada, tipo de página, competição, conflito, canibalização provável,
  separação/junção, principal possivelmente inadequada e insuficiência.
- [x] Vincular evidências por IDs estáveis e preservar os snapshots integrais
  do KeywordDNA, sem reconstruir por texto.
- [x] Tratar ausência de resultados como insuficiência e não como conflito.
- [x] Acrescentar assessment separado para candidata a Silo, com evidência de
  hub/amplitude/múltiplas necessidades, sem criar SiloDNA, SiloPage ou artigo.
- [x] Manter `Validar SERP` direto e resultados inline na planilha.
- [x] Preservar assessment/snapshot anterior quando uma nova consulta falha e
  validar o readback local por hash e IDs.
- [x] Testes focados: `31/31`; `test:arquiteto`: `126/127`, com falha estática
  legada do Minerador.
- [ ] Executar provider real, readback remoto e reload autenticado; dependem de
  autorização explícita e não foram executados neste lote.

### Próximo lote

- [x] O pacote do Lote 5 foi recebido e implementado na seção seguinte.

## Lote 5 — IA de arquitetura dos artigos — 2026-08-25

- [x] Dividir internamente a revisão em diagnóstico de grupos, pertencimento,
  papéis, canibalização e consolidação, mantendo a UI com apenas `Revisar com IA`.
- [x] Enviar KeywordDNA integral como fato, SERP como evidência, working copy
  como hipótese e Brand Context pertinente já existente.
- [x] Limitar Brand Context ao contexto disponível na Marca; não criar
  persistência nova nem inventar campos ausentes.
- [x] Retornar proposta compacta por IDs, com `proposalId`, rastreio A–E,
  `approvalStatus: pending_human` e diff sem repetir KeywordDNA.
- [x] Manter a proposta sem alterar versão consolidada, ArticleDNA, SiloDNA ou
  aprovação automaticamente.
- [x] Marcar aplicação como IA, preservar undo, permitir rejeição parcial e
  aguardar confirmação do salvamento antes do sucesso visual.
- [x] Preservar proteção de publicados e URL, slug, canonical e política.
- [x] Cobrir subtarefas, IDs, contexto, proposta pendente e contrato local.
- [x] `test:arquiteto`: `127/128`; falha única estática legada do Minerador.
- [x] ESLint focado e `git diff --check` aprovados.
- [~] Chrome autenticado, DeepSeek real, persistência/readback remoto e reload
  não verificados; provider real não foi executado.

### Próximo lote

- [x] Lote 6 — pacote recebido e implementado na seção seguinte.

## Lote 6 — consolidação ArticleDNA e publicados — 2026-08-25

- [x] Exigir principal, 1–6 KeywordDNAs, papéis válidos, refs exatas, SERP
  referenciada, conflitos explícitos e revisão humana das decisões IA.
- [x] Criar somente sucessora versionada humana com status `approved` após a
  confirmação; manter versões anteriores imutáveis.
- [x] Proteger `brandId`, URL, slug e canonical publicados; distinguir
  `locked`, `reviewable/revisable` e `unknown` no gate da principal.
- [x] Executar readback canônico pós-persistência por versão, hash, identidade
  e status antes do handoff.
- [x] Repassar ao Radar as refs individuais e contexto já existente, com smoke
  local de versão/hash/ref; não exigir `InternalLinkGraph`.
- [x] Cobrir gate, políticas publicadas, readback e handoff com fixtures sem
  provider real.
- [x] Nenhuma mudança estrutural foi necessária; nenhum pedido foi aberto ao
  Planner Geral.
- [~] Executar confirmação, F5 autenticado, readback remoto e smoke real
  ArticleDNA → Radar no Chrome; depende de sessão/autorização operacional e
  permanece não verificado nesta rodada.

### Próximo lote

- [x] Lote 7 — formar working copy determinística de Silos a partir de
  ArticleDNAs, sem consolidar SiloDNA/SiloPage.
- [x] Considerar equivalência semântica de Silo existente antes de propor novo
  agrupamento; manter candidatos sem arquitetura suficiente visíveis.
- [x] Manter um único Pilar provisório, Suportes explícitos, refs individuais,
  proteção de publicados e separação SiloPage/Pilar.
- [x] Cobrir volume sem promoção isolada, KGR não automático, `null`, refs,
  equivalência, colisão de slug, proteção publicada, escolha humana de Pilar
  e isolamento por Brand.
- [~] Validar manualmente a ação Formar Silos em Chrome e testar reload/
  readback remoto; a ação local desta etapa não substitui a homologação
  autenticada.

### Próximo lote

- [x] Lote 8 — validar e consolidar Silos a partir de ArticleDNAs, com
  reaproveitamento de evidências SERP, revisão IA reversível, decisão humana,
  proteção de publicados e geração independente de SiloDNA/SiloPage.
- [x] Usar a persistência canônica existente com readback após SiloDNA e após
  SiloPage; registrar par parcial sem simular atomicidade.
- [x] Cobrir Pilar único, Suportes, refs ArticleDNA, Brand, conflitos, SERP,
  rejeição parcial da IA, desfazer, publicados e readback.
- [~] Persistência remota autenticada, reload Chrome e provider DeepSeek real
  não verificados nesta rodada; nenhuma chamada paga foi executada.
- [ ] Lote 9 — bloqueado operacionalmente até InternalLinkGraph estrutural
  disponível e autorizado pelo Planner Geral.

## Homologação dos Lotes 1–8 — 2026-08-25

- [x] H1 executado no Chrome: clique individual, Ctrl/Cmd, Shift, pintura,
  seleção oculta e telemetria de latência verificados; touchpad físico permanece
  não verificável neste ambiente.
- [ ] H2 não homologado: F5 preservou keywords, papéis, slugs e ArticleDNA v2,
  mas perdeu os assessments SERP exibidos antes do reload e voltou a `SERP não
  analisada`. Diagnóstico de hidratação/readback pendente; proprietário:
  Arquiteto.
- [ ] H3 não homologado: estado real sem sequência completa pronta para nova
  confirmação humana; não foram disparadas IA nem provider.
- [ ] H4 parcialmente verificado: handoff `marketing online` apareceu no Radar
  com ArticleDNA v2 antes do reload; depois do F5 o Radar exibiu `Marca sem
  dados`, sem readback remoto autenticado comprovado.
- [ ] H5 bloqueado: não havia SiloDNA/SiloPage elegível; todos os artigos
  estavam `Sem silo`.
- [x] Não iniciar InternalLinkGraph; pedido estrutural continua proposto e
  aguardando Planner Geral.
- [x] Registrar sem correção automática, schema, migration, RLS, RPC, provider
  real ou alteração de outro módulo.

## Próxima fila — integridade de F5 e workspace único — 2026-08-26

- [x] Corrigir a corrida de identidade no readback local do Arquiteto:
  assessment SERP, ArticleDNA, SiloDNA e revisão só usam sessão autenticada e
  `brandId`; fallback `anonymous` removido.
- [x] Corrigir o estado transitório do Radar que apresentava `Marca sem dados`
  antes do snapshot canônico chegar.
- [x] Entregar uma página única com tabs contextuais `[ARTIGOS] [SILOS]
  [LINKS INTERNOS]`, sem duplicar GlobalTopbar, busca, undo ou histórico.
- [x] Entregar planilha contextual de Silos com IDs `silo-page:` distintos,
  busca compartilhada, expansão de identidade/proveniência e bloqueio visual
  do InternalLinkGraph.
- [x] Preservar `null` como desconhecido nas projeções de demanda/KGR.
- [x] Executar testes focados, `test:visual-system`, guard visual, TypeScript,
  ESLint direcionado e `git diff --check`, registrando limitações reais.
- [x] Homologar no Chrome o F5 do Arquiteto e do Radar, sem provider real ou
  escrita remota.
- [~] Teste Radar hidratation: fixture legado precisa preencher os campos
  numéricos exigidos pelo contexto estratégico.
- [~] Persistência/readback remoto continua não verificado.
- [ ] Lote 9 — InternalLinkGraph: bloqueado até fundação estrutural do Planner
  Geral.

## Workbench de processos + tabs na GlobalTopbar — 2026-08-26

- [x] Mover `Artigos`, `Silos` e `Links internos` para a `GlobalTopbar`, sem
  duplicar página, busca, histórico ou working copy.
- [x] Transformar `Lógica`, `SERP`, `IA` e `Revisão` em controles com estados
  semânticos e handlers já existentes.
- [x] Manter área contextual recolhível, compacta e limitada, sem ocultar ou
  reconstruir a planilha.
- [x] Remover duplicação das ações de processo no rodapé e preservar somente
  seleção e envio final ao Radar.
- [x] Cobrir composição e não duplicação com teste focado do workbench.
- [~] Validação manual Chrome e confirmação visual de todos os estados ainda
  pendentes nesta rodada.
- [ ] Fila/job/worker para progresso persistente: dependência estrutural,
  fora deste lote; registrar para o Planner Geral se for necessário.
- [ ] Lote 9 — InternalLinkGraph: permanece bloqueado pelo gate estrutural.

## Mapa comparativo de arquitetura — 2026-08-26

- [x] Adicionar uma única projeção comparativa no Workbench expandido,
  preservando a planilha e o limite contextual aproximado de `33vh`.
- [x] Expor cenários `Atual`, `Lógica`, `SERP` e `IA` sem efeitos colaterais;
  SERP permanece observacional e IA permanece proposta não consolidada.
- [x] Mapear Artigos com grupos/KeywordDNA resumidos e Silos com a hierarquia
  SiloPage → Pilar → Suportes, incluindo conflitos e publicados protegidos.
- [x] Comparar mudanças com ganhos/perdas explicáveis pelas dimensões já
  existentes, sem score SEO global ou nova regra editorial.
- [x] Delegar foco e movimentação manual aos handlers canônicos; o canvas não
  é fonte de verdade e não persiste estado próprio. Comparativo, detalhes e
  ações humanas ficam na coluna esquerda; destinos ficam limitados à working
  copy, incluindo Não agrupadas/Novo grupo provisório quando aplicável.
- [x] Manter o mapa enxuto: Artigos exibem keywords e papéis; Silos exibem
  SiloPage/Pilar/Suportes com principais e secundárias resumidas, sem métricas,
  hashes, versões ou proveniência extensa.
- [x] Preservar fotografias de Lógica, SERP e IA em memória para comparação,
  sem recalculá-las após edição humana da working copy.
- [x] Manter Links internos bloqueado; nenhum grafo falso foi criado.
- [x] Integrar `@xyflow/react` `12.11.5` como projeção visual, com nodes
  não arrastáveis/não conectáveis, controles de exploração somente no modo
  expandido e cenários controlados pelo snapshot.
- [~] Validação manual do usuário, F5 manual completo e readback remoto ainda
  pendentes; o Chrome do agente já confirmou o comportamento local básico.
- [ ] Lote 9 — InternalLinkGraph: bloqueado pelo gate estrutural do Planner
  Geral.

## Links Internos funcional / working copy real — 2026-08-27

- [x] Consumir o gate estrutural homologado sem reabrir schema, migration,
  RLS, grants, repositories ou provider.
- [x] Remover o bloqueio visual da aba e manter somente `IA`/`Revisão`, com IA
  desabilitada neste lote.
- [x] Carregar Graph aprovado e working copy pela Brand/Silo atual usando as
  rotas canônicas existentes.
- [x] Projetar `SILO_PAGE` e `ARTICLE_DNA` no React Flow horizontal, com edges
  dirigidas e posição/viewport/seleção fora do domínio.
- [x] Criar, editar e remover edges na working copy; validar self-link,

## Passos 2 e 3 — pendências de homologação — 2026-08-27

- [x] Reusar os fluxos canônicos de criação manual, candidata reservada e
  fortalecimento de Silo sem reconstruir ArticleDNA.
- [x] Manter SiloPage distinta do Pilar e exibir sua identidade/slug no
  read-model existente.
- [x] Exibir identificação derivada de slug/canonical em nodes de Links sem
  colocá-la no contrato do grafo.
- [x] Trocar o preenchimento automático da principal exata por sugestões de
  `anchorConcepts` do contexto editorial do destino.
- [x] Cobrir o helper e regressões de Silo/Graph/Workbench localmente.
- [ ] Homologar no Chrome: criar Silo manual, formar a partir de candidata
  reservada, reutilizar Silo publicado e confirmar estados de slug/canonical.
- [ ] Homologar no Chrome/F5: criar, salvar, editar e aprovar um Graph;
  conferir outbound/inbound, sugestões de âncora e mapa horizontal.
- [ ] Executar readback remoto autorizado para os objetos SiloDNA, SiloPage e
  InternalLinkGraph antes do handoff ao Radar.
  duplicata, conceitos de âncora, motivo e prioridade.
- [x] Salvar via `PATCH` com `lock_version`, confirmar readback, mostrar
  conflito de versão e preservar Graph aprovado/versões sucessoras.
- [x] Preservar `InternalLinkGraphRef` no retorno canônico downstream sem
  alterar o Radar ou criar bypass.
- [x] Manter uma única planilha nos três modos.
- [x] Testes focados `28/28`, visual `20/20`, guard visual PASS; erros globais
  preexistentes documentados.
- [~] Gate manual Chrome autenticado, F5/readback remoto, aprovação real,
  sucessora e handoff Radar ainda pendentes; não chamar o lote de homologado.
- [ ] Próximo lote: `IA → InternalLinkGraphProposal → comparação → revisão
  humana → aplicação parcial`; não iniciar automaticamente nesta entrega.

## Ajuste horizontal do mapa do Arquiteto — 2026-08-26

- [x] Orientar Artigos horizontalmente: Principal à esquerda, relacionadas à
  direita e edges sempre diretas a partir da Principal.
- [x] Calcular faixas por grupo, centralizar a Principal na altura das
  relacionadas, empilhar grupos na ordem da planilha e manter texto integral.
- [x] Compactar grupos unitários sem edge, coluna vazia ou container gigante;
  suportar até seis keywords sem sobreposição prevista.
- [x] Orientar Silos em três colunas `SiloPage → Pilar → Suportes`, preservando
  a distinção visual e as edges de membership/hierarquia.
- [x] Manter React Flow como projeção derivada, sem conexão/arraste, sem
  alteração da planilha única, working copy, contratos ou persistência.
- [x] Cobrir o ajuste em `tests/arquiteto-workbench.test.mts` e lint
  direcionado.
- [~] Repetir validação manual no Chrome, responsividade, temas e F5/readback
  após o ajuste; provider real e remoto continuam fora desta fila.
- [ ] Lote 9 — InternalLinkGraph: permanece bloqueado pelo gate estrutural do
  Planner Geral.

## Planilha única nos três modos — 2026-08-26

- [x] Remover a substituição da planilha por `ArchitectSiloModeTable` e pelo
  placeholder de `InternalLinkGraph` no render principal.
- [x] Manter a mesma planilha de artigos em `Artigos`, `Silos` e `Links
  internos`, com `Sem silo`/detalhes de Silo na própria superfície quando
  aplicável.
- [x] Preservar seleção, expansão, working copy e ArticleDNA no workspace;
  tabs não criam seleção ou dataset paralelo.
- [x] Manter o bloqueio de Links internos apenas no Workbench, sem grafo fake,
  alteração do `InternalLinkGraph` ou mudança estrutural.
- [x] Adicionar regressão focada para a composição única e a troca de modo.
- [~] Validação manual obrigatória no Chrome ainda pendente; não homologar
  antes de confirmar seleção/expansão nos três modos.

## Refinamento visual do Workbench e React Flow — 2026-08-26

- [x] Dividir o Workbench desktop em decisão/comparação à esquerda e mapa à
  direita, com aproximadamente metade da largura útil para cada lado.
- [x] Manter o mapa visível no estado normal e limitar a expansão a
  aproximadamente `33vh`, liberando Controls/MiniMap somente para exploração
  expandida.
- [x] Empilhar `Atual`, `Lógica`, `SERP` e `IA` na borda direita do canvas;
  mover `Comparar com Atual` para a coluna esquerda.
- [x] Integrar o `@xyflow/react` já instalado como projeção derivada dos
  snapshots, sem arrastar/conectar nodes e sem alterar domínio.
- [x] Mostrar Artigos de forma compacta, com principal e keywords relacionadas;
  mostrar Silos como SiloPage → Pilar → Suportes; não exibir métricas ou DNA
  extenso dentro do mapa.
- [x] Retirar `Mostrar/Ocultar contexto`; o contexto permanece disponível na
  coluna esquerda sem toggle concorrente.
- [x] Preservar a planilha única e o bloqueio de Links internos sem grafo fake.
- [x] Cobrir o lote com `9/9` testes focados e guard visual aprovado.
- [~] Chrome do agente validou layout desktop, cenários, expansão, vazio de
  Silos e bloqueio de Links; usuário ainda precisa homologar interação visual,
  responsividade e temas claro/escuro.
- [ ] Lote 9 — InternalLinkGraph: continua bloqueado pelo gate estrutural.

## Correção semântica do mapa de Artigos — 2026-08-26

- [x] Remover o node de ArticleDNA do mapa de Artigos e representar cada
  KeywordDNA como node dentro do grupo visual correspondente.
- [x] Destacar uma única Principal por grupo e criar edges visuais da Principal
  para Secundárias/Reforços; grupos não compartilham edges.
- [x] Aplicar a ordem atual da planilha filtrada ao canvas e manter todos os
  grupos visíveis; seleção deixa artigos não selecionados em estado fantasma,
  sem alterar working copy, snapshots ou handlers canônicos.
- [x] Remover truncamento/line-clamp dos nomes de keyword e usar rótulos
  determinísticos de Principal, Secundária N e Reforço N.
- [x] Empilhar grupos verticalmente, com posições e espaçamentos previsíveis,
  sem edges cruzando grupos; manter a área interna navegável e sem `fitView`
  automático em Artigos para preservar escala legível no canvas compacto.
- [x] Fazer o clique no mapa apenas focar/selecionar artigo; expansão do DNA
  permanece na planilha e o mapa possui chevron explícito para expandir/recolher.
- [x] Remover padding estrutural externo e manter Controls/MiniMap somente no
  canvas expandido, sem persistir viewport ou criar estado paralelo.
- [x] Manter o builder de Silos separado: ArticleDNA como node, com
  SiloPage → Pilar → Suportes, sem reaproveitar semântica de keywords.
- [x] Recompor o Workbench em duas colunas desde o topo, com decisões à
  esquerda e canvas enxuto à direita, sem alterar a planilha única.
- [~] Chrome manual do usuário, responsividade, temas, F5 completo e readback
  remoto ainda pendentes; a validação local do agente não substitui esses
  gates.
- [ ] Referência futura: interação de Context Menu do React Flow para Links
  internos somente depois da fundação homologada do `InternalLinkGraph`; não
  implementar menu, nodes, edges ou estado substituto neste lote.
- [ ] Lote 9 — InternalLinkGraph: bloqueado pelo gate estrutural do Planner
  Geral.

## Atualização de implementação — Links Internos — 2026-08-27

- [x] A fundação homologada foi conectada à aba Links Internos sem nova
  migration, schema, RLS, grant, provider ou alteração estrutural no Radar.
- [x] Working copy real, edição humana de edges, `lock_version`, readback,
  conflito stale, aprovação versionada e sucessora foram ligados às rotas
  canônicas existentes.
- [x] React Flow agora é projeção horizontal de `SILO_PAGE` e `ARTICLE_DNA`,
  com seta dirigida; approved é somente leitura e arraste/conexão ficam apenas
  na working copy; posição, viewport e seleção permanecem fora do hash.
- [x] A planilha continua única e a IA permanece desabilitada neste lote.
- [x] Testes focados `28/28`, testes visuais `20/20`, guard visual PASS e lint
  direcionado passaram.
- [~] Chrome autenticado, F5/readback remoto, aprovação real e conferência do
  handoff do Radar continuam pendentes; a implementação local não foi
  homologada sem essas evidências.
- [ ] Próximo lote: IA → Proposal → revisão humana → aplicação parcial.

## Integridade da fase Artigos — 2026-08-27

- [x] Separar a projeção plana de Artigos da projeção agrupada de Silos na
  planilha única.
- [x] Impedir que a fase Artigos crie SiloDNA, SiloPage, slug, Pilar, Suporte
  ou o fallback operacional `Silo sem nome`.
- [x] Preservar proteção de Silo já existente em conteúdo publicado sem usar
  lista de origem como Silo para keywords novas.
- [x] Manter SERP como evidência/diagnóstico e IA como proposta reversível;
  nenhuma delas movimenta ou aprova ArticleDNA automaticamente.
- [x] Separar estados de execução, diagnóstico, revisão, consolidação e gate do
  Radar.
- [x] Ocultar o painel legado de briefing da experiência ArticleDNA sem apagar
  dados ou alterar schema.
- [ ] Executar homologação manual H3 → H5 no Chrome, incluindo F5 e readback.
- [ ] Executar readback remoto autorizado para distinguir projeção local de
  eventual `Silo sem nome` persistido.
- [x] Validar localmente a fronteira com 24/24 testes focados (article-phase/
  logic: 17/17) e 39/39 incluindo regressões relacionadas de seleção, além de
  20/20 testes visuais, guard visual PASS, lint direcionado PASS e `git diff
  --check` PASS.
- [~] `test:arquiteto` ficou em 181/182 por uma asserção preexistente do
  Minerador que espera o rótulo antigo de `Processar lógica`; correção deve ser
  tratada pelo módulo proprietário do Minerador.
- [ ] Iniciar InternalLinkGraph somente quando o gate estrutural estiver
  comprovadamente homologado; esta correção não o inicia.

## Painel expandido da linha do artigo — 2026-08-27

- [x] Reorganizar exclusivamente o detalhe aberto pelo chevron, sem alterar a
  planilha única nem os contratos de persistência.
- [x] Mostrar resumo superior com métricas reais da principal e agregados
  derivados rotulados; `null` permanece ausente e zero permanece zero.
- [x] Mostrar definição/fatos à esquerda e processo ativo à direita, com
  Lógica, SERP, IA e Revisão em abas compactas.
- [x] Reutilizar `KeywordDnaPanel`, `ArticleDnaSummary` e `InfoHint`; perfis
  completos continuam acessíveis sem duplicar o DNA no node/painel.
- [x] Exibir contexto de Silo e Links Internos somente quando referências reais
  existirem; não criar entidades por desenho.
- [x] Cobrir helper e composição com 10/10 regressões focadas.
- [ ] Homologar manualmente o painel em Chrome nos tamanhos 360/768/1024/1440
  e em tema claro/escuro; testar hover, foco, disabled e detalhes expansíveis.
- [ ] Confirmar ownership dos campos legados de briefing com Planejador/Redator
  antes de removê-los ou promovê-los para qualquer contrato canônico.

## Planilha principal de Artigos — 2026-08-27

- [x] Reordenar a planilha única para as colunas canônicas e manter o prefixo `#`, checkbox e chevron.
- [x] Separar visualmente seleção e expansão; a expansão recebe destaque de linha completa e preserva o painel inline.
- [x] Remover da projeção de Artigos o cabeçalho precoce de Silo, sem limpar dados ou criar hierarquia.
- [x] Registrar `Silo sem nome` como fallback de read model em Silos/Links, não como evidência de persistência remota.
- [ ] Homologar no Chrome, lado a lado com o Minerador, em 360/768/1024/1440 e tema claro/escuro; confirmar checkbox, chevron, hover e linha expandida.

## Correção final de Artigos — escopo, tabs e legibilidade — 2026-08-27

- [x] Restringir Lógica a artigos selecionados e preservar não selecionados.
- [x] Impedir seleção vazia de executar Lógica global.
- [x] Restringir resumo do Workbench ao escopo selecionado e alinhar estado IA por artigo.
- [x] Corrigir navegação das tabs internas sem executar processo.
- [x] Separar execução, evidência e conflito na leitura SERP; manter slug SERP ausente sem dado inventado.
- [x] Destacar keyword/slug e conectar visualmente cada expansão à sua row.
- [ ] Homologar manualmente no Chrome o cenário A/B/C, tabs, SERP/IA e rail em dark mode; nenhuma homologação foi declarada nesta entrega.

## Bug crítico — processos fora da seleção + IA rastreável — 2026-08-27

- [x] Limitar write/payload de Lógica e aplicação de IA ao mutation scope capturado no botão real.
- [x] Separar mensagem de itens processados e total do workspace; regressão A/B/C/D cobre imutabilidade de não selecionados e múltipla seleção.
- [x] Preservar diagnóstico sanitizado de falha de IA no cliente.
- [ ] Executar roteiro manual: selecionar somente um artigo, Lógica, F5, SERP selecionada e IA manual; registrar `failureStage`, HTTP e code se falhar.

## Pendência estrutural — proposta de IA pendente de revisão

- [ ] **PEDIDO ESTRUTURAL PARA O PLANNER GERAL:** definir persistência e readback canônicos para proposta de repartição da IA antes da aplicação humana, caso a proposta precise sobreviver a F5. Não criar tabela, RPC, schema ou fallback local no Arquiteto sem aprovação.

## Homologação pendente — painel de processos do Artigo — 2026-08-27

- [ ] Validar manualmente no Chrome: abrir cada aba sem disparar processo; IA com três propostas; aplicar à working copy; confirmar que a Revisão mantém as três alterações até o pente-fino humano.
- [ ] Reproduzir com inspeção de rede o erro de workflow para classificar `lock_version` obsoleto versus item de outra Brand. Esta correção não mascara nem altera o caminho de persistência.
- [ ] Confirmar visualmente em 360/768/1024/1440 e tema claro/escuro; nenhuma chamada de provider deve ocorrer durante a navegação das abas.

## Homologação pendente — resumo canônico do painel expandido — 2026-08-27

- [ ] Validar no Chrome, em tema claro/escuro e 360/768/1024/1440, que intenção/funil da Principal aparecem sem atraso e que a compatibilidade de uma secundária divergente não substitui o resumo.
- [ ] Confirmar com KeywordDNA real os estados KGR `Sim`, `Não`, `—` e o perfil completo com decimal, sem chamar provider nem alterar persistência.

## Homologação pendente — tabs internas com contexto editorial real — 2026-08-27

- [ ] Repetir no Chrome o ciclo Lógica → SERP → IA → Revisão → Lógica com o mesmo Article em que SERP 3/3, propostas IA aplicadas e revisão pendente estejam reidratados; confirmar somente navegação local, sem provider ou mutação de working copy.
## Exclusao selecionada pelo lifecycle canonico - 2026-08-28

- [x] Restaurar Excluir no rodape de Artigos para a selecao explicita, resolvendo somente os IDs Principal/secundarias de cada artigo selecionado.
- [x] Reutilizar `DeleteConfirmation`, `PublishedDeleteConfirmation` e os endpoints canonicos do lifecycle de KeywordDNA; nenhuma exclusao client-side de `minerador_keywords`.
- [x] Exigir preview exato, resultado sem partial delete e readback remoto do workspace antes de remover a projecao local e limpar a selecao.
- [ ] Homologar manualmente no Chrome: nao publicada, publicada, mista, cancelar, falha de rede, F5/readback e reimportacao posterior. Nenhuma exclusao remota foi executada nesta entrega.

## Identidade estrutural da revisão IA — 2026-09-02

- [x] Tirar `reviewRole` transitório do `baseArticleContentHash`.
- [x] `principalKeywordId` como única autoridade da Principal no hash.
- [x] Preservar Secundária × Reforço como papel estrutural do hash.
- [x] Tornar STALE explícito no read-model, sem colapsar em `NOT_RUN`.
- [x] Tirar `siloId` da identidade estrutural: Silo é etapa posterior.
- [x] Cobrir Artigos → Silos: atribuir Silo não desatualiza a revisão.
- [ ] Do produto: reexecutar a IA nos Articles cujas revisões usam a fórmula
      anterior, para que voltem a ser vigentes.

## Revisão Humana operacional — 2026-09-02

- [x] Mutações canônicas: Principal, Secundária × Reforço, mover, retirar, separar.
- [x] Invariante de uma única Principal efetiva por Article em todos os caminhos.
- [x] Teto de 6 keywords respeitado na entrada de qualquer artigo.
- [x] Retirar keyword devolve para Keywords não agrupadas sem apagar registro.
- [x] Confirmação curta com antes, depois e impacto nas ações de maior impacto.
- [x] Proteções de publicado preservadas em todas as ações manuais.
- [x] Persistência pelo contrato canônico da working copy, sem storage novo.
- [ ] Unificar a aplicação de proposta da IA (`applyKeywordArticleReview`) com as
      mutações manuais: hoje são dois caminhos com as mesmas garantias, mas
      código separado.
- [ ] Ações estruturais diretas a partir de uma divergência da SERP.
- [ ] Controle de tipo de unidade para Article ainda em formação: o contrato
      existente (`applyHumanEditorialUnitDecision`) opera sobre ArticleDNA
      consolidado.
- [ ] Origem do estado transitório com duas Principais: o invariante cobre os
      caminhos humanos; a formação Lógica/IA ainda não foi auditada.

## Fiação da Revisão Humana — 2026-09-02

- [x] Corrigir a memoização que impedia a confirmação de aparecer.
- [x] Extrair intenção/execução/commit para módulo exercitável sem navegador.
- [x] Recusar destino cheio, publicado e Principal sem sucessora antes de confirmar.
- [x] Só anunciar sucesso depois da persistência canônica confirmar.
- [ ] Do produto: smoke manual das cinco ações no navegador.
- [ ] Teste de DOM real: o repositório não tem renderer de componentes; a camada
      de evento continua coberta só pelo smoke manual.

## Cenários arquiteturais completos — 2026-09-02

- [ ] **SDD proposta, aguardando aprovação do Planner:**
      `docs/04-arquiteto/propostas/2026-09-02-sdd-cenarios-arquiteturais-completos.md`
- [ ] Bloqueio confirmado: `SerpFormationAssessment` é por Article e não expressa
      destino, merge nem membership de artigo novo; `KeywordArticleDecision` não
      expressa retirar para não agrupadas.
- [ ] Comprovado que os cenários SERP e IA do mapa são snapshots da arquitetura
      vigente no instante da execução, não projeções das recomendações.
- [ ] Nada implementado nesta frente até a aprovação.

## Cenários arquiteturais — fases — 2026-09-02

- [x] SDD aprovada com emendas: escopo global do cenário SERP, universe hash,
      sourceRefs múltiplas, overlap sem provider, ganhos/perdas derivados,
      artifact de CURRENT não autorizado, ordem das fases.
- [x] **Fase 1** — contrato comum, invariantes, universo, validador,
      normalizador e diff. Domínio puro.
- [ ] **Fase 2** — materialização do cenário Lógica.
- [ ] Fase 3 — cenário Humano e adoção de candidato.
- [ ] Fase 4 — cenário IA derivado + enum `retirar_do_artigo`.
- [ ] Fase 5 — `serp_architecture_scenario` + overlap cross-Article + CHECK remoto.
- [ ] Fase 6 — mapa, trilho, ganhos/perdas e confirmação de CURRENT.
- [ ] Pré-requisito da Fase 6: auditar `confirmArticleArchitecture` + ArticleDNA
      aprovado antes de decidir se CURRENT precisa de artifact próprio.

## Rearquitetura Silo-first — auditoria e SDD — 2026-09-02

- [x] **Fase 0 concluída:** auditoria de código + SDD proposta em
      `docs/04-arquiteto/propostas/2026-09-02-sdd-arquitetura-silo-first.md`.
- [ ] **Aguardando aprovação explícita do usuário.** Nada implementado.
- [x] Confirmado no código que o fluxo é Article-first:
      `buildDeterministicArticleArchitecture` recebe todas as keywords da Brand;
      `formSiloWorkingCopies` recebe `articleVersions`;
      `normalizeArticleWorkingCopyKeyword` zera `siloId` de keyword não publicada;
      `resolveArticleSiloReadiness` devolve `not_started` sem ArticleDNA.
- [x] Confirmado que a working copy de Silos **não é persistida** (React state em
      `arquiteto-workspace.tsx:510`) e que a proposta de IA de Silos também não é.
- [x] Confirmado que `editorial_workflow_items.subject_type` não tem enum
      (`CHECK char_length BETWEEN 1 AND 80`): território cabe sem DDL.
- [x] Confirmado que `editorial_architect_work_copy`, citada na SDD anterior, não existe.
- [ ] **Decisões pendentes do Planner Geral (§4 e §21 da SDD):**
      C1 extensão aditiva do `ArchitectureScenario` já entregue;
      C2 destino do criador manual de Silo, que hoje cria SiloPage e linha em
      `minerador_keyword_lists`;
      C3 remoção da porta por contagem (`relatedKeywordCount >= 2`) na Lógica territorial;
      C4 separação definitiva entre `territoryRef` e `siloId = lista_id`.
- [ ] Fases 1–13 da SDD, na ordem, uma por vez, com parada em cada mudança estrutural.
- [ ] Única DDL prevista: ampliação do CHECK de `artifact_type` para
      `silo_architecture_scenario`, diferida até a Fase 6, com leitura do CHECK
      remoto material antes de escrever a migration.

## Silo-first — SDD revisão 2 (decisões C1–C4 incorporadas) — 2026-09-02

- [x] `FASE_0_AUDIT = PASS` pelo Planner Geral.
- [x] SDD revisão 2 com C1–C4 resolvidos e as duas seções obrigatórias novas:
      `KEYWORD_TERRITORY_MEMBERSHIP_CONSISTENCY` (§11) e
      `TERRITORY_IDENTITY_LIFECYCLE` (§12).
- [x] C1 `EXTEND_ADDITIVELY`: `level` explícito no contrato novo; default `article`
      só numa borda de compatibilidade isolada; SiloScenario nunca usa
      `articles[] + ungroupedKeywordIds[]`.
- [x] C2 `LEGACY_CREATION_PATH`: `POST /api/arquiteto/silos` congelado e preservado;
      novo `MANUAL_STRATEGIC` não cria lista, SiloDNA, SiloPage, publicação nem URL.
      Route marcado `DEPRECATED` só na Fase 13; deleção é decisão separada.
- [x] C3 `relatedKeywordCount >= 2` reclassificado como `LEGACY_SIGNAL`;
      `TERRITORY_MINIMUM_KEYWORD_COUNT = NENHUM`. Código legado intacto.
- [x] C4 separação definitiva `territoryRef` × `siloId` × `lista_id`, com ponte
      explícita na consolidação (§12.6).
- [x] `MEMBERSHIP_SOURCE_OF_TRUTH = keyword workflow item`; `territory.keywordRefs`
      não é persistido — a segunda fonte mutável foi eliminada, não sincronizada.
- [x] `DDL = 0` nesta rodada. `silo_architecture_scenario` **retirado** da proposta;
      volta a ser hipótese, a provar só na fase da SERP territorial.
- [x] Working storage provado contra o contrato atual (§8.1): isolamento por marca,
      unique key, `lock_version` com trigger, leitura current, conflito 409.
- [ ] **Aguardando `SDD_APPROVED = YES` do Planner Geral. Fase 1 não iniciada.**

## Silo-first — Fase 1 concluída, Fase 2 aguardando autorização — 2026-09-02

- [x] `SDD_APPROVED = YES`; emendas E1, E2 e E3 incorporadas na SDD (revisão 3).
- [x] **Fase 1** — `lib/arquiteto/territory.ts` + extensão aditiva de
      `lib/arquiteto/architecture-scenario.ts` com `level`. Domínio puro.
- [x] E1 `pendingOperation` + `PARTIAL_MEMBERSHIP_OPERATION` bloqueando
      confirmação e formação de Article.
- [x] E2 `continuingPartId` obrigatório no split; E3 `survivingTerritoryRef`
      obrigatório no merge. Ambos recusam em vez de inferir.
- [x] `EMPTY_TERRITORY` documentado: diagnóstico em `candidate`, bloqueador na
      porta `candidate → confirmed`.
- [x] 26 testes novos; `test:arquiteto` 439/438 com a falha pré-existente do
      Minerador; TypeScript sem erro novo; lint limpo.
- [ ] **Fase 2** — read-model `TerritorialLandscape` somente leitura, com
      `CONSISTENCY_CHECK` e `LEGACY_NEEDS_RECONCILIATION`. **Não iniciada:
      aguarda autorização do Planner Geral.**
- [ ] Fases 3 a 13 conforme §17 da SDD, uma por vez.
- [ ] `silo_architecture_scenario` permanece diferido; nenhuma DDL prevista até
      a Fase 6 provar necessidade.

## Silo-first — Etapa 0 contratada; Fase 2 bloqueada pela aba Site — 2026-09-02

- [x] Adendo Etapa 0 incorporado à SDD (§4.2), com todos os marcadores exigidos.
- [x] `lib/arquiteto/territorial-base.ts` + `narrative`/`discovery` em
      `lib/arquiteto/territory.ts`. 14 testes novos; suíte 453/452.
- [ ] **BLOQUEIO — Fase 2 (fonte site/sitemap).** A aba Site persiste o catálogo
      apenas em IndexedDB/localStorage por ator (`lib/marca/site-store.ts`);
      `brand_site_*` não é referenciada por nenhum código; a migration 0004 nunca
      foi aplicada e cita `listas_kgr` (renomeada pela 0036). O único caminho
      server-side é `crawlAuthorizedSitemap`, que é coleta externa — vetada.
      Regra §41 acionada: reportado ao Planner Geral, sem improviso.
- [ ] Decisão pedida ao Planner: (a) Fase 2 parcial sem site/sitemap, sobre as
      fontes já canônicas; (b) frente própria da Marca para persistir o catálogo;
      ou (c) aguardar.
- [ ] Fases 3 a 13 conforme §17 da SDD.

## Silo-first — Delta Etapa 0 PASS; Fase 2 permanece bloqueada — 2026-09-02

- [x] SDD revisão 4 com os cinco eixos ortogonais da Base (§4.2.4).
- [x] `observationState` × `decisionState` com interseção vazia, travado por teste.
- [x] `StrategicDeclaration` com zero keyword como estado legítimo.
- [x] Guards de ausência: `site_only` sem `publicationRef`, `database_only` sem
      `url`/`sitemapRef`.
- [x] 21 testes na Base + 26 no território; suíte 460/459.
- [ ] **Fase 2 bloqueada (inalterado):** a aba Site persiste o catálogo apenas em
      IndexedDB/localStorage por ator; `brand_site_*` não é referenciada por
      nenhum código; a migration 0004 nunca foi aplicada. O único caminho
      server-side é `crawlAuthorizedSitemap` — coleta externa, vetada.
- [ ] Decisão pedida ao Planner: (a) Fase 2 parcial sobre as fontes já canônicas
      com a fonte site declarada ausente; (b) frente própria da Marca para
      persistir o catálogo; (c) aguardar.
- [ ] Rastrear no Git os módulos novos do Arquiteto (ação do usuário).

## Silo-first — Fase 2A concluída; 2B aguardando — 2026-09-02

- [x] Auditoria da membership atual: `AssignmentSchema` não tinha `territoryRef`;
      membership paralela vivia só em React state.
- [x] `lib/arquiteto/territory-working-copy.ts` — operações, projeção derivada,
      gate de operação parcial, legado.
- [x] Readiness de confirmação estendida com entidade, intenção, fronteira e
      narrativa; `DEFERRED_EXTERNAL_EVIDENCE` para o que depende da Etapa 0.
- [x] `AssignmentSchema` estendido com `territoryRef` e `territoryAssignment` —
      aditivo no payload jsonb, sem DDL.
- [x] 15 testes novos; `test:arquiteto` 475/474 com a falha pré-existente.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.
- [ ] UI territorial: só depois de 2B, sem redesenho, planilha única.
- [ ] HOLD externo: a A1 da Marca está APPLIED (materialização remota PASS).
      `readBrandSiteSnapshot` ainda depende de A2, repositories, runtime real de
      sync e leitura remota — Fases 3 a 6 daquela frente.
- [ ] Blocker herdado: duas execuções `running` no mesmo sitemap continuam
      possíveis — gate de `createRunningSyncRun` na frente da Marca.


## Fase 2A.1 — persistência e autoridade territorial — 2026-09-02

- [x] `territoryAssignment` sem segunda referência (`KeywordTerritoryDecisionSchema`).
- [x] `unassigned` x `unaddressed` como projeção derivada, com recusa de incoerência.
- [x] Registro canônico remoto do território sobre `editorial_workflow_items`, sem DDL.
- [x] `territoryRef` emitido pelo servidor; criação com ref declarada é recusada.
- [x] Retrocompatibilidade do payload legado provada em teste.
- [x] 13 testes novos; `test:arquiteto` 488/487 com a falha pré-existente.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.
- [ ] Escrita territorial pela UI: só depois de 2B.

## Fase 2A.2 — gate de contrato do registro territorial — 2026-09-02

- [x] `state`, `subject_type`, `source_entity_id`, `subject_id` e `marca_id`
      auditados no DDL e em todos os consumers.
- [x] `source_entity_id` corrigido para `territoryRef` (colisão com o predicado
      de purga de keyword em 0047, que não filtra subject_type).
- [x] 7 testes de gate; `test:arquiteto` 495/494 com a falha pré-existente.
- [ ] **SMOKE REMOTO — do USUÁRIO.** create → GET → comparação → `lock_version`.
      Até lá `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN`.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.

## Fase 2A.3 — smoke remoto preparado, aguardando o usuário — 2026-09-02

- [x] Roteiro completo em `docs/04-arquiteto/smoke-territory-record-2a3.md`
      (CREATE · GET · UPDATE com lock · stale lock · identidade imutável ·
      sonda SQL read-only · cross-brand).
- [x] Payloads validados localmente contra `TerritoryCandidateSchema`.
- [ ] **USUÁRIO executa o smoke.** Até voltar:
      `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN_UNTIL_USER_SMOKE`.
- [ ] `CROSS_BRAND_REMOTE_SMOKE` depende de uma segunda Brand de teste.
- [ ] `pendingOperation` parcial fora deste smoke: exigiria ids de keyword
      inventados. Fica para o smoke de integração com keywords reais.
- [ ] **Fase 2B** — bloqueada até o smoke voltar.

### RISCO REGISTRADO — purge por source_entity_id sem subject_type

A migration `0047_global_lifecycle_delete_recovery_purge.sql` apaga itens de
workflow com `source_entity_id = current_keyword.id::text` **sem filtrar por**
`subject_type` — nas duas ramificações, delete e purge. A `0046` tem o filtro;
a `0047` não. O contrato atual do Território evita a colisão por construção:
`source_entity_id = territory:<uuid>`, que nunca é igual a um UUID cru.

**Não corrigir a 0047 agora** (migration histórica). Mas qualquer
`subject_type` futuro que grave UUID cru em `source_entity_id` será apagado
junto com uma keyword sem relação com ele. Reavaliar ao criar o próximo
subject_type.

## Fase 2B — formação de Article em território confirmado — 2026-09-02

- [x] Auditoria do modelo de Article (working copy, DNA canônico, consumers).
- [x] `territoryRef` aditivo e opcional em ArticleDNA e ProvisionalArticleGroup.
- [x] Primitivo `territory-ref.ts` extraído para quebrar ciclo de import.
- [x] `planArticleFormationForTerritory` + `resolveArticleConfirmationReadiness`
      + `confirmArticleStructure`.
- [x] 22 testes novos; `test:arquiteto` 517/516 com a falha pré-existente.
- [ ] **Territory remote smoke** — PENDING FUTURE INTEGRATION VALIDATION.
- [ ] UI territorial e de formação: planilha única, depois do domínio.
- [ ] **Fase 2C** — consolidação de ArticleDNA e sucessão de versões.
- [ ] Lógica/SERP/IA territoriais: a estrutura aceita cenário, os produtores
      ainda não existem. `PROVIDER_CALLS = 0` nesta fase.

## Fase 2B.1 — fechamento de invariantes — 2026-09-02

- [x] Diff cross-level decide por nível sem tocar no universo.
- [x] Coerência de papéis no ArticleDNA (mesma keyword em dois papéis recusada).
- [x] Gate de consolidação: território obrigatório no Article novo, opcional na
      leitura legada.
- [x] Território de versão consolidada exige sucessora para mudar.
- [x] Proteção unknown exige decisão humana explícita (4 estados).
- [x] Working membership x composição validadas nos dois sentidos.
- [x] 15 testes novos; `test:arquiteto` 532/531 com a falha pré-existente.
- [ ] **Fase 2C** — consolidação de SiloDNA/SiloPage. Não iniciada.
- [ ] Article territorial novo ainda não persistido remotamente.
- [ ] `.git/index.lock` obsoleto (0 bytes, 20/ago) impede escrita de índice pelo git.

## Fase 2C.2 — contratos e invariantes de Silo — 2026-09-02

- [x] territoryRef aditivo em SiloDNASchema e SiloPageSchema.
- [x] Invariantes Pilar/Suporte para nova consolidacao (Pilar unico, >=1 Article,
      papeis disjuntos, sem duplicatas, referencias versionadas e coerentes).
- [x] Modelo de cobertura com exclusao explicita por decisao humana.
- [x] `resolveSiloConsolidationReadiness` + `confirmSiloConsolidation`.
- [x] 30 testes novos; `test:arquiteto` 562/561 com a falha pre-existente.
- [ ] **SiloWorkingCopy sem autoridade persistida.** Contrato sobre
      `editorial_workflow_items` (`subject_type=silo_working_copy`) PROPOSTO,
      aguardando aprovacao antes de implementar.
- [ ] RPC 2C.1 NAO integrada ao adapter: falta working copy duravel.
- [ ] 2C.1 behavioral smoke PENDING · Territory remote smoke PENDING ·
      Article territorial remote smoke PENDING · Marca Site/Sitemap HOLD.

## Fase 2C.3 — working copy remota de Silo — 2026-09-02

- [x] Adendo 2C.3 na SDD Silo-first.
- [x] Registro remoto `silo_working_copy` sobre editorial_workflow_items, sem DDL.
- [x] Ref proprio server-side `silo-working-copy:<uuid>`.
- [x] Guards de territorio: ausente, incoerente, brand, consolidated, nao-editavel.
- [x] Pilar automatico removido do caminho de IA; sugestao separada de selecao.
- [x] Decisao humana de Pilar com ator, momento, motivo e composicao.
- [x] 30 testes novos; `test:arquiteto` 592/591 com a falha pre-existente.
- [ ] **UI ainda le a working copy legada em memoria.** Migrar para o remoto e a
      2C.4; ate la existem duas representacoes, sendo a remota a autoridade.
- [ ] `silo-formation.ts` `buildCopy` ainda sugere Pilar por `scores[0]`.
      E sugestao por contrato, mas convem remover a inferencia na 2C.4.
- [ ] RPC 2C.1 continua NAO integrada: falta a UI ler o remoto e a readiness PASS.
- [ ] 2C.1 behavioral smoke PENDING · Territory smoke PENDING · Article smoke
      PENDING · Marca Site/Sitemap HOLD.

## Fase 2C.3A — identidade e idempotencia — 2026-09-02

- [x] `workingCopyRef` deterministico derivado do territoryRef.
- [x] Create idempotente com SELECT-antes-do-INSERT e re-leitura na corrida.
- [x] Deteccao restrita a UNIQUE canonica; erro generico propaga.
- [x] 12 testes novos; `test:arquiteto` 604/603 com a falha pre-existente.
- [ ] **LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN.** `silo-formation.ts`
      `buildCopy` usa `scores[0]?.articleId` como atribuicao estrutural de Pilar.
      Nao pode sobreviver no fluxo final. Escopo da 2C.4.
- [ ] UI ainda le a working copy legada em memoria — 2C.4.
- [ ] RPC 2C.1 continua NAO integrada.

## Fase 2C.4.1 — adendo de concorrencia da SiloWorkingCopy — 2026-09-02

- [x] Adendo 2C.4.1 na SDD: duas corridas provadas, alternativas rejeitadas,
      duas RPCs, ordem global de locks, proveniencia, replay, entrypoint canonico.
- [x] Assinaturas desenhadas: `persist_silo_from_working_copy_atomic` (A) e
      `persist_silo_working_copy_atomic` (B).
- [ ] **SQL NAO escrito.** Aguardando autorizacao para a migration unica com as
      duas funcoes.
- [ ] Proveniencia `workingCopyRef` + `workingCopyLockVersion` no SiloDNASchema:
      desenhada, NAO aplicada — entra junto com as RPCs e seus testes.
- [ ] Migrar a UI e o adapter para o entrypoint canonico. Enquanto o caminho
      antigo existir em paralelo, as duas corridas continuam abertas nele.
- [ ] LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN_FOR_2C_4_FUNCTIONAL.

## Fase 2C.4.2 — writers transacionais escritos — 2026-09-02

- [x] Proveniencia `workingCopyRef` + `workingCopyLockVersion` no SiloDNASchema,
      com coerencia de par.
- [x] Migration `20260902150000` com as duas funcoes; storage DDL = 0.
- [x] Espelho de dominio testado comportamentalmente + 18 testes novos.
- [ ] **USUARIO executa a migration.** Nao executada.
- [ ] **Migrar os callers para as RPCs.** Enquanto o writer antigo existir em
      paralelo, as duas corridas continuam abertas no runtime.
- [ ] Smoke comportamental das duas RPCs contra o banco.
- [ ] LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN_FOR_2C_4_FUNCTIONAL.

## Fase 2C.4 funcional — migracao dos callers — 2026-09-02

- [x] Writers da working copy migrados para `persist_silo_working_copy_atomic`.
- [x] Writer PostgREST antigo REMOVIDO do arquivo (dead-code eliminado).
- [x] Adapter e rota de consolidacao usando `persist_silo_from_working_copy_atomic`.
- [x] Pilar automatico removido de `buildCopy`, com as consequencias corrigidas.
- [x] 14 codigos de erro preservados individualmente.
- [x] 36 testes novos; `test:arquiteto` 658/657 com a falha pre-existente.
- [ ] **Smoke comportamental das RPCs** — roteiro a preparar quando autorizado.
- [ ] UI ainda nao consome a working copy remota nem a rota de consolidacao.
      Enquanto isso, o fluxo existe no servidor mas nao e exercido pela tela.
- [ ] Territory smoke PENDING · Article territorial smoke PENDING · Marca HOLD.

## Fase 2C.4.6 — binding semantico + bypass fechado — 2026-09-02

- [x] Working copy remota carregada INTEIRA; ArticleDNA versionados conferidos.
- [x] Readiness e confirmacao humana executadas no servidor sobre o snapshot remoto.
- [x] `assertSiloDnaMatchesConfirmedWorkingCopy` e binding da SiloPage.
- [x] Identidade publicada protegida; conflito exige decisao humana.
- [x] `/silo-pair` fechado em draft-only na rota E no helper.
- [x] 30 testes novos; `test:arquiteto` 688/687 com a falha pre-existente.
- [ ] **SILO_PAGE_APPROVAL_SERVER_GATE = MISSING.** `approved` e fail-closed aqui.
      Gate proprio de aprovacao da SiloPage ainda precisa ser desenhado.
- [ ] Smoke comportamental das RPCs: roteiro a preparar quando autorizado.
- [ ] UI nao consome a working copy remota nem a rota de consolidacao.
- [ ] UI_REPLAY_ENVELOPE_OWNER = PENDING DESIGN.
- [ ] Marca Site/Sitemap = HOLD.

## Fase 2C.4.6A — binding territorial — 2026-09-02

- [x] `assertSiloDnaMatchesConfirmedTerritory` com as quatro equivalencias reais.
- [x] Gate territorial antes do de composicao, ambos antes da RPC A.
- [x] 11 testes novos; `test:arquiteto` 699/698 com a falha pre-existente.
- [ ] **FULL_PHASE_2C_COMPLETION_BLOCKER = YES** — aprovacao propria da SiloPage.
- [ ] Smoke de consolidacao: pode ser preparado quando autorizado, com SiloPage
      em status nao-final.
- [ ] UI nao consome a working copy remota nem a rota de consolidacao.
- [ ] Marca Site/Sitemap = HOLD.


## Descarte administrativo executado — 2026-09-08

Proprietário da operação: Arquiteto; participação do Radar explicitamente autorizada.
Projeto hjjlntdpdgvpnazdztqw; marca Care Glow (09762023-d0d4-4c24-b34e-d0fdfd43f891).
Descarte definitivo de testes autorizado pelo usuário, com backup dispensado.
Executado via Supabase CLI 2.111.0, db query --linked, em transação única.

- Confirmado no banco: removidos 21 workflows do Arquiteto e 4 do Radar; 115 ArticleDNA; 9 article_architecture_ai_review; 114 eventos de status; 10 eventos de decisão; 9 snapshots e 6 revisões SERP. Silos e tabelas do grafo já estavam vazios.
- Preservados: 29 keywords, 3 listas, 83 qualificações semânticas, 66 apresentações contextuais e 1 brand_skill. Comparação de conteúdo integral dos registros preservados nas 17 tabelas do script passou.
- Cinco triggers append-only restaurados exatamente ao estado O; nenhuma função, FK ou migration removida/aplicada.
- Primeiro ensaio detectou text versus uuid em version_id e desfez a transação. Script corrigido para text[], inclusão das revisões IA, exclusão por folhas de previous_version_id/source_version_id e previous_snapshot_id, locks e comparação de conteúdo preservado.
- Ensaio corrigido: PASS com rollback intencional. Execução definitiva: PASS. Readback SQL independente: PASS. Reexecução em simulação sobre vazio: PASS com rollback intencional. O erro P0001 SIMULACAO CONCLUIDA é deliberado, não falha da purga.
- Validação nas duas sessões da interface: AINDA NÃO VERIFICADA nesta execução. Cache local não foi apagado. Não declarar sincronização visual homologada com base apenas neste SQL.
- Script: supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql. Mantido em simulação por padrão. Ele aborta se grafos reaparecerem: não é reset universal para qualquer acervo futuro.
- Nenhum commit, push ou deploy executado nesta entrega.
