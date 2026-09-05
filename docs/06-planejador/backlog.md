# Backlog — Planejador

## ContentPlan determinístico e cockpit — 2026-08-27

- [x] Implementar a construção determinística v2 com gabarito, faixas por seção, cobertura de evidências, preservação de referências e plano visual sem geração automática.
- [x] Expor no editor central as decisões humanas e as restrições necessárias para o Redator, sem escrever o artigo final nem criar FAQ automaticamente.
- [x] Normalizar o cockpit com o sistema visual compartilhado e manter a rota tenantizada canônica.
- [x] Cobrir a fatia local com fixtures: plano com pacote Radar, plano sem pacote, estabilidade determinística, proteção de publicação e regressões do cockpit.
- [ ] Validar manualmente em sessão autenticada um ContentPlan real/fixture, salvar sucessora, recarregar, aprovar e transferir ao Redator.
- [ ] Confirmar persistência/readback remoto e hidratação de destinos de links/fontes; nenhuma operação remota foi executada nesta implementação.

## Gate de leitura do Radar fechado — 2026-08-26

- [x] Registrar `RADAR_HANDOFF_V2=READY` e `PLANNER_READ_CONTRACT=READY`.
- [x] Preservar `CONTENTPLAN_BOUNDARY`: `RadarPlannerHandoff` é evidência,
  não `ContentPlan`.
- [x] Registrar `RADAR_PLANNER_HANDOFF_V2=PASS`, retrocompatibilidade PASS e
  `HANDOFF_DATABASE_CHANGE_REQUIRED=NO`.
- [x] Confirmar que a fundação Telegram/Experts remota está READY para o
  consumo futuro de `ExpertEvidence`.
- [ ] Validar contribuição Telegram real, texto/áudio E2E e Speech real; a
  fundação READY não substitui esses smokes.
- [ ] Validar o fluxo real aprovado, readback, reload e sucessora do plano sem
  sobrescrever plano existente.

## Handoff canônico do Radar — 2026-08-26

- [x] Receber `RadarPlannerHandoff` v2 como evidência versionada e manter
  `ContentPlan` como contrato decisório próprio.
- [x] Preservar compatibilidade de itens legados e isolamento por `brandId`.
- [x] Manter Serper histórico legível no handoff sem permitir nova coleta;
  novas coletas usam DataForSEO.
- [ ] Validar o fluxo real aprovado, readback, reload e sucessora do plano sem
  sobrescrever plano existente.
- [x] Confirmar a fundação Telegram remota antes de consumir `ExpertEvidence`
  real; o consumo da contribuição real ainda permanece pendente.
## Concluído recentemente - estratégia KGR, volume e cobertura - 2026-07-21

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas foram movidas para modules/planejador; consumidores e contratos foram mantidos.
- Pendente: validacao manual autenticada e qualquer persistencia remota fora do escopo local.
- SDD `propostas/estrategia-kgr-volume-e-cobertura.md` criado antes da alteração estrutural.
- Snapshot opcional de estratégia no ContentPlan, derivado de ArticleDNA, com principal, apoios, volume conhecido, KGR, hierarquia, slug e mapa de cobertura.
- Cockpit exibe o painel interpretativo e mantém apoio como cobertura possível, não como H2 automático.
- Fixtures de principal única, volume parcial, conflito KGR e cobertura por tópico adicionadas e aprovadas.
- Pendente: validação visual autenticada, persistência remota e correção independente do erro anterior em `lib/minerador/site-sync-adapter.ts`.

## Agora
- **Objetivo:** validar manualmente um ContentPlan v2 completo com carga real/fixture aprovada.
  - **Módulo proprietário:** Planejador
  - **Arquivos permitidos:** `docs/06-planejador/**`
  - **Arquivos proibidos:** domínio compartilhado e Redator sem SDD
  - **Dependências:** decisão editorial humana
  - **Riscos:** congelar regra incompleta
  - **Critério de aceite:** estrutura, fontes, links, CTA, imagens, metadados e evento de aprovação conferidos no navegador
  - **Testes obrigatórios:** fixtures de ContentPlan e uma revisão manual sem chamada paga
## Próximo
- Confirmar persistência remota dos sucessores e eventos de aprovação depois da migration vigente.
- Hidratar destinos de links internos e fontes aprovadas sem expor IDs técnicos como copy.
## Depois
- Executar a validação manual do cockpit com um artigo real e confirmar reload, sucessora, aprovação e transferência idempotente.
- Confirmar persistência remota dos sucessores e eventos depois da migration vigente.
- Validar no navegador a troca das cinco etapas, o resumo fixo, a próxima ação e o editor central com dados reais.

## Correção recente — abertura do cockpit — 2026-07-29
- Corrigido o link legado `/planejador/{contentPlanId}` para a rota canônica tenantizada `/{brandRef}/planejador/{contentPlanId}`.
- Adicionada regressão para impedir o retorno do link sem `brandRef`.
- A grade autenticada já exibe o destino tenantizado correto; falta reiniciar o `next dev` atual para reindexar a rota dinâmica e confirmar o clique no cockpit.
## Bloqueado
Decisões editoriais pendentes.
## Descartado
Avançar mock como plano aprovado.
## Concluídos recentes
- Auditoria documental inicial em 2026-07-20.
- SDD e implementação do ContentPlan definitivo, com testes direcionados, em 2026-07-20.
- SDD e implementação inicial do cockpit hidratado, gabarito e briefing de transferência, com 75 testes direcionados, em 2026-07-20.
- Organização guiada em cinco etapas, resumo/progresso e editor central de outline, com 77 testes e build, em 2026-07-20.
- Correção de seleção do cockpit para ContentPlans legados sem `planning`, com regressão automatizada e 78 testes focados, em 2026-07-20.

## Concluido recentemente — integridade editorial — 2026-07-20

## Concluido recentemente - contexto estrategico e identidade publicada - 2026-07-21

- SDD `propostas/contexto-estrategico-identidade-publicada.md` criado.
- Contexto da marca filtrado por marca, selecao explicita e aplicacao idempotente na copia de trabalho; origem e conflitos ficam registrados.
- `publishedIdentityRef` opcional adicionado ao ArticleDNA; PublicationRecord/OperationalPublication continua a fonte canonica e divergencias permanecem protegidas.
- Roteiro manual criado; 145 testes direcionados, typecheck e ESLint direcionado passaram.

- SDD `propostas/integridade-editorial-e-protecao-de-publicados.md` e roteiro manual adicionados.
- Hidratação keyword/Radar, separação Silo/SiloDNA e resolução de publicação implementadas sem reescrever DNAs.
- Guarda de sucessora e aprovação protege identidade publicada; estado desconhecido/conflitante não vira `Novo`.
- 83 testes focados, typecheck, ESLint direcionado e build Next.js passaram; diff-check sem erros.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/planejador; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
## Dependência de Fase 2A — 2026-08-06

- Manter o gate atual do Planejador até o smoke de Marca/Conta/Admin. A migração de autorização editorial é tarefa posterior e não deve introduzir fallback por e-mail ou `user_key`.

## Incidente 3B-R1 — bloqueio preservado — 2026-08-09

- Não avançar para sino interno, notificações, preferências, templates, outbox, fila, delivery events ou provider global até o login real e as sessões estarem estáveis.
- Validar o Planejador somente depois do smoke autenticado do Admin e da conta comum; grants e suporte auditado continuam em frente posterior.

## Complemento documental Agência/Brand — 2026-08-09

- [x] Registrar que sino, notifications, activity e monitoring permanecem contratos futuros compartilhados, sem runtime nesta tarefa.
- [x] Registrar comunicação única para Admin, Agência e Brand, com provider global e escopo de evento.
- [x] Registrar que activity da Agência é agregada/sanitizada e activity da Brand é detalhada, sem substituir entidades editoriais.
- [ ] Não retomar a sequência operacional enquanto a exclusividade actor → Agency e os gates de identidade/sessão não estiverem aprovados.

## Brand Skills + IA — próximo gate

- [x] Preparar builder compartilhado para `brandId + module + purpose` e proveniência compacta.
- [ ] Conectar a primeira chamada IA real do Planejador ao builder, após existir operação autorizada.
- [ ] Executar smoke controlado com a Skill ativa Care Glow e conferir `appliedSkillRefs` sem duplicar Markdown no ContentPlan.
