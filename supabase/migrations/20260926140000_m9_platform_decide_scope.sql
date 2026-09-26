-- =============================================================================
-- M9 — DECISÕES HUMANAS DELEGADAS PELO CHAT NO MCP
-- =============================================================================
--
-- SDD: docs/compartilhado/sdd-adendo-decisao-humana-delegada-pelo-chat-2026-09-26.md
--
-- Adiciona `platform.decide` às listas de escopos aceitas nos grants OAuth e
-- bearer existentes. Não altera grants nem delegações: cada cliente só ganha
-- esta permissão depois de reconsentir e marcá-la.
--
-- `platform.decide` é opt-in e não vem pré-marcado. A ferramenta exige uma
-- prévia, `decisionHash` vigente e `userConfirmation` específico; a ação
-- também revalida a permissão editorial do usuário em cada módulo.
--
-- Esta migration não cria novas policies, não muda dados editoriais e não
-- amplia o que pode ser publicado, excluído ou restaurado.
--
-- ORDEM: aplicar depois da m8 e antes do deploy que registra as ferramentas
-- de decisão. Aplicação remota fica a cargo do usuário.
-- =============================================================================

BEGIN;

ALTER TABLE public.writer_mcp_grants
  DROP CONSTRAINT IF EXISTS writer_mcp_grants_scopes_check;
ALTER TABLE public.writer_mcp_grants
  ADD CONSTRAINT writer_mcp_grants_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write',
      'platform.decide', 'provider.spend'
    ]::text[]
  );

ALTER TABLE public.writer_mcp_delegations
  DROP CONSTRAINT IF EXISTS writer_mcp_delegations_scopes_check;
ALTER TABLE public.writer_mcp_delegations
  ADD CONSTRAINT writer_mcp_delegations_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write',
      'platform.decide', 'provider.spend'
    ]::text[]
  );

COMMIT;
