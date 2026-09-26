-- =============================================================================
-- M8 — ESCOPOS DA PLATAFORMA INTEIRA NO MCP
-- =============================================================================
--
-- SDD: docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md
--
-- ================== O QUE ESTA MIGRATION FAZ ==================
--
-- O MCP deixa de ser só do Redator. Uma IA conectada passa a ler a marca
-- inteira e a executar as etapas que já existem no servidor. Os escopos que o
-- usuário escolhe na tela de consentimento ganham cinco valores:
--
--   platform.read    ler o retrato da marca (Assuntos, keywords, silos, artigos, publicados)
--   minerador.write  declarar Assuntos aceitos, planejar pesquisa, importar candidatas
--   arquiteto.write  enviar ao Arquiteto keywords já aprovadas
--   radar.write      enviar ao Redator pacotes já finalizados
--   provider.spend   executar pesquisa paga depois do custo aceito
--
-- Nenhum escopo aprova, exclui ou publica: isso continua humano, na tela.
--
--   * `writer_mcp_grants_scopes_check` e `writer_mcp_delegations_scopes_check`
--     passam a aceitar os oito valores (os três do Redator não mudam).
--   * `writer_mcp_call_events.human_confirmation`: as palavras do usuário
--     aceitando a ação, gravadas pelas ferramentas que escrevem fora do
--     Redator. Opcional; linhas antigas ficam nulas.
--
-- ================== O QUE ELA NÃO FAZ ==================
--
-- * NÃO altera grant existente: ninguém ganha escopo novo sem reconsentir.
-- * NÃO cria policy: as tabelas continuam exclusivas de service_role.
-- * NÃO toca dado editorial.
--
-- ================== ORDEM ==================
--
-- Esta migration ANTES do deploy. O código novo pré-marca os escopos novos na
-- tela de consentimento; com o CHECK antigo, o banco recusaria o consentimento.
--
-- Executar: npx supabase db query --linked -f supabase/migrations/20260926120000_m8_platform_mcp_scopes.sql
-- Depois:   npx supabase migration repair --status applied 20260926120000 --linked
-- Nunca `supabase db push`.
-- =============================================================================

BEGIN;

ALTER TABLE public.writer_mcp_grants
  DROP CONSTRAINT IF EXISTS writer_mcp_grants_scopes_check;
ALTER TABLE public.writer_mcp_grants
  ADD CONSTRAINT writer_mcp_grants_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write', 'provider.spend'
    ]::text[]
  );

ALTER TABLE public.writer_mcp_delegations
  DROP CONSTRAINT IF EXISTS writer_mcp_delegations_scopes_check;
ALTER TABLE public.writer_mcp_delegations
  ADD CONSTRAINT writer_mcp_delegations_scopes_check CHECK (
    cardinality(scopes) > 0 AND
    scopes <@ ARRAY[
      'writer.read', 'writer.draft.write', 'writer.media.brief',
      'platform.read', 'minerador.write', 'arquiteto.write', 'radar.write', 'provider.spend'
    ]::text[]
  );

ALTER TABLE public.writer_mcp_call_events
  ADD COLUMN IF NOT EXISTS human_confirmation text
  CHECK (human_confirmation IS NULL OR char_length(human_confirmation) BETWEEN 1 AND 500);

COMMENT ON COLUMN public.writer_mcp_call_events.human_confirmation IS
  'Palavras do usuário aceitando a ação, repassadas pela IA (SDD plataforma para agentes, 2026-09-26).';

COMMIT;
