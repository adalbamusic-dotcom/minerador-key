# Mapa de Estado Atual da Plataforma

Data de referência: 2026-08-27

## Fundação global
- DATABASE_REFRESH concluído.
- Fundação global pronta.
- Desenvolvimento atual: áreas funcionais.
- Tenant editorial: brandId = public.marcas.id.
- actor humano = auth.uid().
- colaborador por membership ativa.
- Admin global não vira owner automaticamente.
- sem fallback por slug/nome/owner/localStorage.

## Sistema visual global
GlobalTopbar, Quiet UI, dark mode, avatar/sino, busca integrada, InfoHint e padrões principais já estão consolidados. GlobalTopbar deve ser tratada como congelada nesta fase, salvo regressão ou necessidade aprovada.

## Minerador
Módulo mais funcional. Discovery, métricas Google Ads, allintitle DataForSEO, lógica determinística, Nicho/Intenção, KGR, CSV/manual, Perfil da Keyword, InfoHint, lifecycle e ajuda contextual possuem evidências de funcionamento. Processos são independentes. Pendências principais: revisão humana consolidada, sinais úteis ao Arquiteto e handoff/snapshot mais transparente.

## Arquiteto
InternalLinkGraph:
- REMOTE FOUNDATION READY;
- working copy/editável;
- lock_version;
- approval atomicity;
- append-only;
- v1/v2;
- stale predecessor;
- duplicate successor;
- same-content prevention;
- advisory locks;
- same-brand reference guards;
- cross-brand isolation;
- proposal/previousVersion/handoff guards;
- anon block.

Próxima frente: aba Links Internos funcional com React Flow real, edição humana, save/readback, aprovação, successor e Proposal de IA depois da experiência base.

Silo Pair: smoke transacional positivo. Manter observação explícita sobre uso de postgres na preparação de fixture por ausência de UPDATE do service_role em editorial_artifact_versions, sem conceder grant automaticamente.

## Radar

Pesquisa Google — Fase 1: **HOMOLOGADA** em runtime real (2026-09-11), no fluxo
`RESET → START → ANALYZE → FINALIZE → F5` com DataForSEO real, persistência
remota, readback, concorrência otimista e bundle congelado preservado após F5.

Áreas operacionais: `Pesquisa`, `Vídeos`, `Especialista`, `Relatório`. O
workflow antigo por abas Coleta/Concorrentes/Análise/Evidências/Revisão saiu do
fluxo operacional.

Perfis competitivos da `Pesquisa`, os três implementados (2026-09-17): Google
(homologado em runtime real), YouTube e Amazon (aguardando aceitação manual do
USER). Perfil de pesquisa não é saída editorial — Google produz blueprint
editorial, YouTube produz blueprint audiovisual, Amazon produz blueprint
comercial.

Entregues: `RadarCompetitiveObservedModel`, `SemanticConceptModel`,
`AiDiscoveryContext`, `RadarEditorialBlueprint`, blueprint audiovisual e
comercial, `SpecialistBriefs`, `VideoBriefs`, `RadarVideoEvidenceLayer`,
`RadarSpecialistEvidenceLayer`, `RadarFrozenEvidenceBundle`, o dossiê canônico
entregue ao Redator e o dossiê editorial portátil (CSV).

O dossiê canônico é resolvido uma vez — `loadRadarCanonicalAuthorities →
resolveRadarCanonicalDossier` — e alimenta o envio ao Redator
(`sendRadarToWriter`) e o export com o mesmo conteúdo semântico.
`RadarEvidenceBundle` permanece V3.

Em aberto: aceitação manual de YouTube, Amazon, do export e da entrega ao
Redator; e as dívidas registradas no
[backlog do Radar](../05-radar/backlog.md).

## Planejador — fora do fluxo operacional (2026-09-17)
Não é etapa entre o Radar e o Redator. O `ContentPlan` determinístico e a rota `/planejador` permanecem para leitura do histórico; nenhum artigo novo passa por aqui e nada é movido automaticamente.

## Redator
Recebe o dossiê canônico do Radar e é responsável por PLANEJAR e ESCREVER: estrutura final, sequência, evidência por seção, links, mídia, metadados de SEO, CTA e o texto, com Tiptap, save, versionamento, revisão e aprovação. Pode montar um `ContentPlan` interno. Não reabre a estratégia nem redefine o que o Article é.

## Publicações
Responsável por PublicationRecord, URL, slug, canonical, versão, histórico e exportação/publicação.

## Status padrão nos docs
Separar sempre:
- IMPLEMENTED
- TESTED
- REMOTE VERIFIED
- MANUAL UI VALIDATION
- PENDING
- BLOCKED


