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
SERP avançada com Coleta/Concorrentes/Análise/Evidências/Revisão/Histórico e readback de aprovação. Próximas frentes: homologação final DataForSEO, ExternalEvidence, ExpertBrief/Telegram, ExpertContribution, transcrição, ExpertEvidence, relatório consolidado e RadarApprovedPackage/handoff.

## Planejador
ContentPlan determinístico possui implementação local relevante. Persistência remota e smoke autenticado completo devem permanecer separados de testes locais.

## Redator
Responsável por executar ContentPlan em ContentDocument com Tiptap, save, versionamento, revisão e aprovação. Não deve reabrir estratégia.

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


