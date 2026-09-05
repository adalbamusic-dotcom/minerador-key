> **HISTÓRICO — NÃO OPERACIONAL — 2026-08-27**
>
> Registro preservado durante a consolidação documental. Não é fonte de verdade nem autoriza implementação; consulte as fontes canônicas ativas em `docs/README.md`.

# Arquiteto — plano de implementação canônica por lotes

**Data:** 2026-08-25
**Base:** auditoria A1–A20
**Regra:** cada lote é pequeno, verificável e não ultrapassa a fronteira do
Arquiteto. Nenhum lote abaixo autoriza migration, SQL, provider real,
alteração remota, contrato estrutural compartilhado, React Flow ou MCP.

## Estado de partida

- Artigos, grupos, papéis, ArticleDNA, SERP de formação e IA pendente têm base
  local no código.
- Silos possuem working copy, SiloDNA draft, SiloPage draft, papéis e criação
  manual com readback guardado.
- A área Links Internos ainda não possui InternalLinkGraph canônico.
- A UI atual é uma planilha operacional com grupos de Silo; não há wizard nem
  área de grafo.
- Readback remoto, provider real e Chrome autenticado permanecem gates manuais.
- O único bloqueador estrutural confirmado é o
  [InternalLinkGraph](./arquiteto-pedido-estrutural-internal-link-graph-2026-08-25.md).

## Regras para todos os lotes

- preservar checkout sujo e dados existentes;
- não usar docs/_arquivo como fonte;
- não apagar KeywordDNA nem reduzir proveniência;
- não converter null em zero;
- não alterar publicado, URL, slug, canonical ou marca sem regra aprovada;
- não aplicar IA automaticamente;
- não fazer SERP mover ou aprovar grupos;
- seleção não dispara persistência editorial;
- usar fixtures/mocks em testes;
- separar resultado local, remoto, provider e browser;
- atualizar estado/backlog somente após evidência.

## Fase 0 — baseline operacional

**Objetivo:** proteger o que já existe antes de qualquer mudança local.

**Pré-condições:** checkout preservado; testes direcionados identificados;
nenhuma escrita remota.

**Arquivos prováveis:** testes do Arquiteto, contratos, canonical workspace,
estado atual e backlog.

**Contratos:** ArticleDNA, SiloDNA, SiloPage, KeywordDNA e status/eventos
vigentes.

**Proibido:** redesenho, migration, provider real, limpeza de storage.

**Testes:** suite focada do Arquiteto, testes de domínio/SERP/handoff/workspace,
TypeScript direcionado e git diff --check.

**Aceite:** nenhum erro novo atribuído ao lote; baseline e limitações
registrados.

**Documentação:** estado atual com resultado e classificação.

**Gate manual:** Chrome autenticado somente quando disponível; não declarar
PASS por teste local.

**Dependência estrutural:** nenhuma.

## Fase 1 — Artigos: working copy e proveniência

**Objetivo:** garantir que a cópia de trabalho mantenha cada KeywordDNA
completo, inclusive evidências ausentes como null e referências de versão.

**Pré-condições:** baseline verde ou falhas legadas classificadas.

**Arquivos prováveis:** lib/arquiteto/contracts.ts,
lib/arquiteto/canonical-workspace.ts, lib/arquiteto/demand-evidence.ts,
modules/arquiteto/arquiteto-workspace.tsx e fixtures de handoff.

**Contratos:** KeywordDnaProvenanceSnapshot, ArticleKeywordReference,
GoogleAdsDemandEvidence e ArticleDNA.

**Proibido:** criar novo envelope se já houver equivalente; mudar Minerador;
persistir estado de seleção.

**Testes:** payload rico e payload parcial; null versus zero; provider refs;
hash/version; Brand isolation; keyword importada não localizada.

**Aceite:** toda referência do ArticleDNA aponta para KeywordDNA individual;
nenhuma métrica ausente é inventada; cópia de trabalho não apaga payload.

**Documentação:** atualizar estado somente com campos comprovados.

**Gate manual:** conferir uma keyword com métricas e uma sem métricas em Chrome.

**Dependência estrutural:** nenhuma enquanto se usar contrato existente.

## Fase 2 — Artigos: lógica e candidata a Silo

**Objetivo:** distinguir hipótese de grupo, papéis provisórios e candidata a
Silo sem consumir a keyword automaticamente.

**Pré-condições:** Fase 1.

**Arquivos prováveis:** lib/arquiteto/adapters.ts, estratégia de agrupamento,
contracts.ts e workspace.

**Contratos:** ProvisionalArticleGroup, hierarchy signals e grupos existentes.

**Proibido:** promoção automática, remoção de keyword, nova tabela de
candidatas, regra baseada só em volume.

**Testes:** alta demanda sem centralidade; candidata reservada; retorno ao fluxo
normal; Silo equivalente; grupos com principal única.

**Aceite:** sugestão é reversível e visível; decisão humana controla promoção;
ArticleDNA continua com uma principal e até cinco apoios.

**Documentação:** atualizar backlog e registrar campos que permanecem
provisórios.

**Gate manual:** revisar candidato e desfazer sem alterar o artigo original.

**Dependência estrutural:** nenhuma se o estado ficar na working copy; se exigir
persistência nova, abrir pedido antes.

## Fase 3 — Artigos: SERP

**Objetivo:** manter SERP como evidência independente da lógica e da decisão.

**Pré-condições:** Fases 1 e 2; contrato DataForSEO global confirmado pela
Plataforma.

**Arquivos prováveis:** lib/arquiteto/serp-formation.ts,
lib/arquiteto/dataforseo-serp-compatibility.ts, app/api/arquiteto/serp/route.ts
e fixtures.

**Contratos:** snapshot/review/assessment e resolução global existente.

**Proibido:** chamar Serper, RapidAPI, allintitle como SERP, criar capability,
alterar DataForSEO, fazer regrouping ou usar API real nos testes.

**Testes:** compatibilidade, conflito, sobreposição, insuficiência, snapshot
stale e falha sem apagar grupo.

**Aceite:** DataForSEO fornece evidência normalizada; Arquiteto interpreta;
indisponibilidade não bloqueia edição manual.

**Documentação:** registrar eventual divergência do resolver global sem
corrigi-la dentro do módulo.

**Gate manual:** Validar SERP em ambiente autenticado, se explicitamente
autorizado pelo usuário, sem fabricar crédito/provider.

**Dependência estrutural:** se o contrato global não suportar a operação
necessária, parar o lote e abrir pedido para Planner Geral.

## Fase 4 — Artigos: IA e revisão

**Objetivo:** produzir proposta pendente com KeywordDNA completo, SERP,
publicados, Silos e contexto selecionado.

**Pré-condições:** SERP válida ou estado explícito de insuficiência; contrato
DeepSeek global disponível.

**Arquivos prováveis:** app/api/revalidate-structure/route.ts,
app/api/arquiteto/article-dna/route.ts, adapters e testes.

**Contratos:** proposta/annotation/version envelope/approval status.

**Proibido:** OpenRouter, provider próprio, prompt que exponha segredo,
aplicação automática, alteração da Plataforma.

**Testes:** resposta estruturada válida, vazia, inválida, thinking desabilitado,
falha sem apagar estado, IDs desconhecidos rejeitados, proposta não aprovada.

**Aceite:** IA nunca aprova; proposta é comparável, reversível e preserva
decisões humanas.

**Documentação:** registrar provider real apenas se validado manualmente; caso
contrário marcar não verificado.

**Gate manual:** revisão explícita pelo usuário.

**Dependência estrutural:** Brand Context Pack formal é futura; usar apenas o
contexto atualmente disponível.

## Fase 5 — Artigos: consolidação e readback

**Objetivo:** fechar ArticleDNA e handoff apenas após gates humanos.

**Pré-condições:** principal, apoios, conflitos e identidade válidos.

**Arquivos prováveis:** operational-flow.ts, persistence, ArticleDNA route e
workspace.

**Contratos:** immutable version envelope, events, ArticleDNA refs.

**Proibido:** sobrescrever decisão humana, remover payload original, declarar
persistido antes do readback.

**Testes:** 1 keyword, 6 keywords, 7 rejeitadas, sem principal, conflito
publicado, successor e rollback local.

**Aceite:** ArticleDNA consolidado tem hash, refs, uma principal e no máximo
cinco apoios; handoff ao Radar não reagrupa.

**Documentação:** estado e backlog com readback local/remoto separados.

**Gate manual:** confirmar arquitetura com artigos reais sem publicar.

**Dependência estrutural:** nenhuma para contrato já existente; existência
remota continua não verificada.

## Fase 6 — Silos: working architecture

**Objetivo:** representar Silo candidato, SiloDNA draft, SiloPage draft, Pilar,
Suportes e hierarquia sem confundir SiloPage com Pilar.

**Pré-condições:** ArticleDNAs válidos e Fase 5.

**Arquivos prováveis:** lib/arquiteto/adapters.ts, silo-workspace.ts,
contracts.ts, operational-flow.ts e UI local.

**Contratos:** SiloDNA, SiloPage, ArticleDNAReference e status de publicação.

**Proibido:** Silo como pasta, Pilar automático só por volume, nova entidade
remota para candidate, slug publicado alterado.

**Testes:** um Pilar obrigatório para formado; draft sem Pilar; Suportes;
SiloPage distinta; conflito de intenção/slug; published protected.

**Aceite:** Silo formado não passa sem exatamente um Pilar; draft continua
válido; página de Silo não compete silenciosamente com Pilar.

**Documentação:** registrar validator de slug/verticalidade como local ou
futuro.

**Gate manual:** mover artigo entre Silos e revisar o impacto sem publicar.

**Dependência estrutural:** nenhuma para gate local; atomicidade pair permanece
dívida da Plataforma.

## Fase 7 — Silos: lógica, SERP, IA e revisão

**Objetivo:** aplicar processos independentes para agrupamento de ArticleDNAs,
diretrizes SERP e propostas de IA.

**Pré-condições:** Fase 6; avaliações SERP disponíveis quando necessárias.

**Arquivos prováveis:** silo-dna route, silo-page route, serp-formation,
workspace e fixtures.

**Contratos:** SiloDNA/SiloPage versions, SERP refs, proposal statuses.

**Proibido:** reorganização automática, IA aprovada, SiloPage/Pilar duplicados,
provider novo.

**Testes:** Silo raso, Silo equivalente, conflito, revisão humana, stale
isolado por insumo.

**Aceite:** lógica/SERP/IA/revisão têm estados próprios; decisão consolidada
permanece até mudança real.

**Documentação:** atualizar estado por evidência.

**Gate manual:** revisar proposta e rejeitá-la mantendo a cópia anterior.

**Dependência estrutural:** Brand Context Pack formal é futuro; usar contexto
local atual.

## Fase 8 — Silos: consolidação e publicação estrutural

**Objetivo:** consolidar SiloDNA e SiloPage com refs, hierarchy e proteção de
publicados.

**Pré-condições:** um Pilar, Suportes, slug e conflitos resolvidos.

**Arquivos prováveis:** persistence, silo/page routes, operational-flow,
contracts.

**Contratos:** append-only artifacts, SiloPage source ref e publication guard.

**Proibido:** criar publicação por aprovação de SiloDNA, alterar URL/canonical
legado, declarar atomicidade inexistente.

**Testes:** readback, version successor, pair partial, rollback lógico,
Brand isolation.

**Aceite:** SiloDNA e SiloPage possuem versões/aprovações independentes; status
de publicação separado.

**Documentação:** manter a dívida de atomicidade explícita.

**Gate manual:** nenhum publish real nesta fila; apenas leitura/revisão.

**Dependência estrutural:** boundary transacional só se aprovado como requisito.

## Fase 9 — InternalLinkGraph

**Objetivo:** implementar a área Links com fonte de verdade versionada.

**Pré-condições:** pedido estrutural aprovado e contrato/persistência
disponíveis.

**Arquivos prováveis:** contracts, artifact repository, route, workspace,
handoffs e testes dos módulos consumidores, conforme decisão do Planner Geral.

**Contratos:** somente o contrato aprovado do grafo; não improvisar tipo local
incompatível.

**Proibido:** usar linkMap ou ContentPlan como banco do grafo; localStorage como
fonte; React Flow antes do contrato.

**Testes:** nodes/edges, direction, relation, anchors, stale, hash, approval,
tenant/RLS, readback, downstream handoffs.

**Aceite:** grafo canônico é fonte; Radar não reagrupa; Planner não recebe
âncora literal obrigatória; Redator recebe contexto; Publicações valida URL.

**Documentação:** SDD/adendo aprovado e estado dos consumidores.

**Gate manual:** mesa de Links e edição humana após persistência real estar
disponível.

**Dependência estrutural:** total; depende do pedido
2026-08-25-pedido-estrutural-internal-link-graph.

## Fase 10 — React Flow

**Objetivo:** projetar visualmente o InternalLinkGraph.

**Pré-condições:** Fase 9 com readback e testes.

**Arquivos prováveis:** componente frontend do Arquiteto e testes visuais.

**Contratos:** somente leitura/escrita pelo contrato do grafo.

**Proibido:** persistir estado interno como fonte única; alterar layout
consolidado sem aprovação visual.

**Testes:** projeção, seleção de aresta, origem/destino, status, Brand isolation,
keyboard/focus e dark mode.

**Aceite:** ao clicar aresta, mostrar origem, destino, relação, prioridade,
motivo, anchor concepts e status.

**Documentação:** registrar como projeção, não entidade.

**Gate manual:** Chrome real com mouse/touchpad e foco visível.

**Dependência estrutural:** Fase 9.

## Fase 11 — Handoffs

**Objetivo:** garantir continuidade até Radar, Planejador, Redator e
Publicações sem reescrever decisões.

**Pré-condições:** ArticleDNA/SiloDNA/SiloPage e, quando aplicável, grafo
aprovados.

**Arquivos prováveis:** adapters/operational-flow, hydration dos módulos e
testes de contratos.

**Contratos:** ArticleDNA como unidade do Radar; ContentPlan como unidade do
Planejador; ContentDocument e PublicationRecord nas etapas seguintes.

**Proibido:** Radar reagrupar; Planner redefinir principal; Redator criar
arquitetura; Publicações alterar identidade.

**Testes:** proveniência ponta a ponta, published identity, stale, human
approval, no-loss e tenant isolation.

**Aceite:** cada etapa recebe o contrato correto e conserva a origem.

**Documentação:** estado do Arquiteto e relatório de handoff.

**Gate manual:** smoke autenticado somente com autorização específica; provider
real não é parte de teste automático.

## Primeiro lote autorizado a recomendar

O primeiro lote depois da aprovação é a Fase 1. Ela é local, reduz risco de
perda de KeywordDNA e não depende do bloqueador InternalLinkGraph. A Fase 2
vem em seguida. Não iniciar React Flow, MCP ou contrato de grafo antes do
pedido estrutural.


