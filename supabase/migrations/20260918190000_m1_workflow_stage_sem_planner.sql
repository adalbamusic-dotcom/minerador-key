-- =============================================================================
-- M1 — REMOÇÃO OPERACIONAL DO PLANEJADOR
-- =============================================================================
-- Data: 2026-09-18
-- Base: docs/00-produto/auditorias/auditoria-remocao-planejador-2026-09-18.md (rev. 2)
--       docs/00-produto/auditorias/corte-2-remocao-funcional-planejador-2026-09-18.md
--
-- NÃO APLICADA. Arquivo escrito para revisão.
--
-- ================== O QUE ESTA MIGRATION FAZ, E SÓ ==================
--
-- Tira `'planner'` do CHECK de `editorial_workflow_items.stage`. Nada mais.
--
-- Ela é a ÚLTIMA etapa da remoção, não a primeira: o Corte 2 já removeu
-- `import_planner` do contrato e da rota, então nenhum código consegue gravar
-- esse valor. Esta migration fecha a porta no banco depois de a porta já estar
-- fechada no código — a ordem inversa deixaria a constraint recusando escrita
-- que a aplicação ainda tentaria fazer.
--
-- ================== POR QUE NÃO HÁ MIGRAÇÃO DE DADOS ==================
--
-- Leitura do banco real em 2026-09-18:
--   editorial_workflow_items WHERE stage = 'planner'                  →  0 linhas
--   editorial_workflow_items WHERE state = 'sent_planner'             →  0 linhas
--   editorial_artifact_versions WHERE artifact_type = 'content_plan'  →  0 de 531
--   tabelas content_plans / planner_items                             →  não existem
--
-- Não há ContentPlan nem PlannerItem para converter. Fabricar uma migração de
-- dados aqui seria trabalho sobre dado inexistente.
--
-- ================== O QUE ESTA MIGRATION NÃO TOCA ==================
--
-- * `editorial_workflow_items.state` — o CHECK é só de comprimento (1..80), e
--   `'sent_planner'` precisa continuar aceito: linha antiga tem de fazer parse.
--   O que saiu no Corte 2 foi a TRANSIÇÃO que produzia o valor.
-- * `content_documents.content_plan_version_id` — coluna nulável, preservada
--   para leitura de documento v1.
-- * `publication_records.content_plan_version_id` — idem.
-- * Versões, mídia, DNA, SERP, evidências e qualquer módulo anterior.
-- * `public.editorial_stage_module(text)` — ver a nota no fim do arquivo.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- GUARDA: a migration ABORTA se alguma linha ainda usar o valor.
--
-- A leitura disse zero, mas a leitura foi feita antes desta transação. Trocar o
-- CHECK sem conferir faria o `ALTER` falhar com uma mensagem genérica de
-- violação; esta guarda falha com o motivo, e sem deixar nada pela metade.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_restantes bigint;
BEGIN
  SELECT count(*) INTO v_restantes
    FROM public.editorial_workflow_items WHERE stage = 'planner';
  IF v_restantes > 0 THEN
    RAISE EXCEPTION
      'M1_ABORTADA: % linha(s) ainda em stage=''planner''. Decida o destino delas antes de fechar a constraint.',
      v_restantes;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- O CHECK efetivo é o da 0027 (confirmado no catálogo remoto):
--   CHECK (stage = ANY (ARRAY['minerador','architect','radar','planner','writer','publications']))
-- -----------------------------------------------------------------------------
ALTER TABLE public.editorial_workflow_items
  DROP CONSTRAINT editorial_workflow_items_stage_check;

ALTER TABLE public.editorial_workflow_items
  ADD CONSTRAINT editorial_workflow_items_stage_check
  CHECK (stage = ANY (ARRAY['minerador', 'architect', 'radar', 'writer', 'publications']));

COMMENT ON CONSTRAINT editorial_workflow_items_stage_check ON public.editorial_workflow_items
  IS 'Estágios do pipeline vigente. `planner` saiu em 2026-09-18 (M1): o Planejador foi removido do pipeline operacional e nenhum código grava esse valor desde o Corte 2.';

COMMIT;

-- =============================================================================
-- READBACK PÓS-APLICAÇÃO — rodar e conferir os três resultados
-- =============================================================================
-- npx supabase db query --linked "
--   select pg_get_constraintdef(oid) as definicao
--     from pg_constraint
--    where conname = 'editorial_workflow_items_stage_check';
-- "
--   ESPERADO: CHECK ((stage = ANY (ARRAY['minerador'::text, 'architect'::text,
--             'radar'::text, 'writer'::text, 'publications'::text])))
--   NÃO PODE CONTER: 'planner'
--
-- npx supabase db query --linked "
--   select stage, count(*)::int as linhas
--     from public.editorial_workflow_items group by 1 order by 1;
-- "
--   ESPERADO: architect 25, radar 3 — total 28, igual ao de antes.
--
-- npx supabase db query --linked "
--   select count(*)::int as ainda_planner
--     from public.editorial_workflow_items where stage = 'planner';
-- "
--   ESPERADO: 0
-- =============================================================================

-- =============================================================================
-- ROLLBACK — reversão completa, sem perda
-- =============================================================================
-- Nenhuma linha é criada, alterada ou apagada por esta migration, então a
-- reversão é apenas devolver o valor ao CHECK. Não há dado a restaurar.
--
-- BEGIN;
-- ALTER TABLE public.editorial_workflow_items
--   DROP CONSTRAINT editorial_workflow_items_stage_check;
-- ALTER TABLE public.editorial_workflow_items
--   ADD CONSTRAINT editorial_workflow_items_stage_check
--   CHECK (stage = ANY (ARRAY['minerador', 'architect', 'radar', 'planner', 'writer', 'publications']));
-- COMMIT;
--
-- A reversão do BANCO não reabre o caminho: `import_planner` continua fora do
-- contrato e da rota. Para voltar a gravar `stage='planner'` seria preciso
-- reverter também o Corte 2 no código.
-- =============================================================================

-- =============================================================================
-- NOTA DE ESCOPO — `public.editorial_stage_module(text)`
-- =============================================================================
-- Essa função (0002:280) mapeia 'planner' → 'planejador' e era usada pela policy
-- `workflow_write`, que NÃO existe mais: a leitura de `pg_policies` mostrou
-- apenas `editorial_workflow_items_select_policy` (SELECT, authenticated).
--
-- Com o CHECK fechado, o ramo 'planner' da função vira inalcançável — e um ramo
-- inalcançável é inerte, não é defeito. NÃO a alterei aqui por uma razão
-- honesta: verifiquei as políticas de seis tabelas, não TODOS os chamadores da
-- função no banco. Mexer numa função sem conhecer seus chamadores é o tipo de
-- mudança que parece limpeza e vira incidente.
--
-- Antes de tocá-la, rodar:
--   npx supabase db query --linked "
--     select p.proname, pg_get_functiondef(p.oid)
--       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname='public'
--        and pg_get_functiondef(p.oid) ilike '%editorial_stage_module%';
--   "
-- =============================================================================
