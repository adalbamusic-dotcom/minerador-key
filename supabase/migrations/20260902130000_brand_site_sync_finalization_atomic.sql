-- Finalização atômica do sync de Site/Sitemap da Marca.
-- SDD: docs/02-marca/propostas/2026-09-02-sdd-site-sitemap-persistencia-canonica.md
--      (adendo A1 — atomicidade e idempotência durável da finalização)
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- 1. ATOMICIDADE. O runtime acessa Postgres só por PostgREST
--    (@supabase/supabase-js e @supabase/ssr); não há driver de banco no projeto
--    e não existe BEGIN/COMMIT na aplicação. Promover uma execução `completed`
--    envolve quatro escritas — inferir ausência, transicionar o run, promover o
--    last-known-good e carimbar o sitemap — que não podem ficar parcialmente
--    aplicadas. Mesmo padrão de `persist_silo_pair_atomic`.
--
-- 2. IDEMPOTÊNCIA DURÁVEL. Validar um retry contra
--    `catalog.last_seen_run_id = p_run_id` só funciona enquanto nenhuma execução
--    posterior tiver reobservado aquelas URLs — é estado TEMPORAL, não histórico.
--    Por isso a execução passa a guardar o próprio fingerprint imutável do
--    conjunto observado, e o replay compara contra ele, nunca contra o catálogo.
--
-- ESCOPO: apenas finalização. A coleta continua em Node, com o crawler seguro
-- existente. Nenhum acesso de rede a partir do Postgres.
--
-- NÃO aplicada automaticamente. O usuário executa. Sem db push, sem migration repair.
-- Transacional: erro antes do COMMIT aborta tudo; aplicação parcial não é esperada.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.brand_site_sitemaps') IS NULL
     OR to_regclass('public.brand_site_sync_runs') IS NULL
     OR to_regclass('public.brand_site_catalog_entries') IS NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: fundação brand_site_* ausente';
  END IF;

  IF to_regprocedure('public.canonical_assert_rpc_actor(uuid)') IS NULL
     OR to_regprocedure('public.canonical_actor_can_use_brand_action(uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: helpers canônicos de autorização ausentes';
  END IF;

  -- A RPC depende semanticamente destes dois guards.
  IF to_regprocedure('public.brand_site_sync_run_guard()') IS NULL
     OR to_regprocedure('public.brand_site_sitemap_last_known_good_guard()') IS NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: guards da fundação brand_site_* ausentes';
  END IF;

  -- O fingerprint usa sha256(bytea), função de núcleo do PostgreSQL desde a 11.
  -- NÃO depende de pgcrypto e NENHUMA extensão é instalada aqui. A dependência é
  -- provada agora, não presumida: se o built-in não existir, a migration recusa.
  IF to_regprocedure('pg_catalog.sha256(bytea)') IS NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: sha256(bytea) de núcleo ausente; não instalar extensão automaticamente';
  END IF;

  -- Execuções terminais já gravadas não teriam fingerprint e violariam o CHECK
  -- de coerência. Nenhum código escreve nesta tabela hoje, então o esperado é
  -- zero linhas terminais; se houver, o backfill precisa ser decidido antes.
  IF EXISTS (SELECT 1 FROM public.brand_site_sync_runs WHERE status <> 'running') THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: existem execuções terminais sem fingerprint; decidir backfill antes';
  END IF;

  IF to_regprocedure('public.finalize_brand_site_sync(uuid, uuid, uuid, text, text[], integer, integer, integer, integer, integer, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync recusada: função já existe';
  END IF;
END $$;

-- ─── Fingerprint imutável do conjunto observado ──────────────────────────────
-- Guarda a IDENTIDADE do conjunto, não o conjunto: contagem + hash. O array de
-- URLs continua fora do run — URLs vivem no catálogo.

ALTER TABLE public.brand_site_sync_runs
  ADD COLUMN observed_count integer NOT NULL DEFAULT 0 CHECK (observed_count >= 0),
  ADD COLUMN observed_set_hash text;

-- Espelha `brand_site_sync_runs_completion_coherent`: execução em andamento não
-- tem fingerprint; execução terminal sempre tem. O conjunto vazio de um `failed`
-- legítimo recebe o hash da representação canônica de zero elementos — nunca
-- NULL — para que a comparação de replay seja sempre hash contra hash.
ALTER TABLE public.brand_site_sync_runs
  ADD CONSTRAINT brand_site_sync_runs_fingerprint_coherent CHECK (
    (status = 'running' AND observed_set_hash IS NULL)
    OR (status <> 'running' AND observed_set_hash IS NOT NULL)
  );

-- ─── Guard do run: allowlist ampliada ────────────────────────────────────────
-- Mesmas proteções de antes — DELETE recusado, terminal imutável, identidade
-- congelada, conclusão obrigatória — mais os dois campos de fingerprint na
-- transição `running → terminal`. Como o guard só admite UMA transição, tudo o
-- que está na allowlist fica imutável depois dela.
CREATE OR REPLACE FUNCTION public.brand_site_sync_run_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'brand_site_sync_runs is append-only: delete refused';
  END IF;

  IF OLD.status <> 'running' THEN
    RAISE EXCEPTION 'brand_site_sync_runs terminal record cannot be changed (status=%)', OLD.status;
  END IF;

  IF NEW.status NOT IN ('completed', 'partial', 'failed') THEN
    RAISE EXCEPTION 'brand_site_sync_runs only accepts a terminal transition, got %', NEW.status;
  END IF;

  IF NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'brand_site_sync_runs terminal transition requires completed_at';
  END IF;

  IF NEW.observed_set_hash IS NULL THEN
    RAISE EXCEPTION 'brand_site_sync_runs terminal transition requires observed_set_hash';
  END IF;

  -- Allowlist explícita: só campos de CONCLUSÃO podem mudar. Comparar o restante
  -- do registro por diferença de jsonb congela, por padrão, qualquer coluna
  -- futura — o inverso (lista de imutáveis) deixaria colunas novas mutáveis sem
  -- ninguém perceber.
  IF (to_jsonb(NEW)
        - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
        - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message'
        - 'observed_count' - 'observed_set_hash')
     IS DISTINCT FROM
     (to_jsonb(OLD)
        - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
        - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message'
        - 'observed_count' - 'observed_set_hash') THEN
    RAISE EXCEPTION 'brand_site_sync_runs allows only completion fields to change';
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── Fingerprint determinístico ──────────────────────────────────────────────
-- Identidade do conjunto em BYTEA, não em texto.
--
-- Cada URL é convertida para os seus bytes UTF-8 e é sobre esse `bytea` que
-- acontecem `DISTINCT` e `ORDER BY`. Igualdade e ordenação de `bytea` são
-- sempre byte a byte, sem collation nenhuma — enquanto igualdade de `text`,
-- numa collation não-determinística, pode considerar iguais duas strings com
-- bytes diferentes. Nem o texto cru nem o hex participam da identidade.
--
-- O hex entra APENAS na serialização. Como usa somente [0-9a-f], nenhum
-- elemento pode conter o separador ':', o que elimina a ambiguidade de
-- concatenação: ["a\nb", "c"] e ["a", "b\nc"] produzem hashes diferentes —
-- coisa que um join sobre o texto cru não garantia, nem com prefixo de contagem.
--
-- Devolve contagem E hash na MESMA definição: a guarda de duplicata e o
-- fingerprint compartilham exatamente a mesma noção de identidade, sem risco de
-- divergirem. Não é mecanismo de segurança: é identidade de conjunto para
-- decidir se um retry descreve o mesmo resultado.
CREATE FUNCTION public.brand_site_observed_set_fingerprint(p_urls text[])
RETURNS TABLE (observed_count integer, observed_set_hash text)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $function$
  WITH canonical AS (
    SELECT DISTINCT convert_to(t.u, 'UTF8') AS url_bytes
    FROM unnest(COALESCE(p_urls, ARRAY[]::text[])) AS t(u)
  )
  SELECT
    (SELECT count(*) FROM canonical)::integer,
    encode(
      sha256(
        convert_to(
          (SELECT count(*) FROM canonical)::text
          || ':'
          || COALESCE(
               (
                 SELECT string_agg(encode(c.url_bytes, 'hex'), ':' ORDER BY c.url_bytes)
                 FROM canonical c
               ),
               ''
             ),
          'UTF8'
        )
      ),
      'hex'
    );
$function$;

REVOKE ALL ON FUNCTION public.brand_site_observed_set_fingerprint(text[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brand_site_observed_set_fingerprint(text[]) TO service_role;

-- ─── Finalização ─────────────────────────────────────────────────────────────

CREATE FUNCTION public.finalize_brand_site_sync(
  p_marca_id uuid,
  p_actor_user_id uuid,
  p_run_id uuid,
  p_status text,
  p_observed_urls text[],
  p_found_count integer,
  p_new_count integer,
  p_updated_count integer,
  p_error_count integer,
  p_duration_ms integer,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_run public.brand_site_sync_runs%ROWTYPE;
  v_sitemap public.brand_site_sitemaps%ROWTYPE;
  v_urls text[] := COALESCE(p_observed_urls, ARRAY[]::text[]);
  v_input_count integer := 0;
  v_input_distinct_count integer := 0;
  v_db_observed_count integer := 0;
  v_matched_count integer := 0;
  v_input_hash text;
  v_missing integer := 0;
  v_error_message text := NULLIF(btrim(COALESCE(p_error_message, '')), '');
  v_sitemap_status text;
BEGIN
  IF p_marca_id IS NULL OR p_actor_user_id IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'finalize_brand_site_sync requires Brand, actor and run';
  END IF;
  IF p_status NOT IN ('completed', 'partial', 'failed') THEN
    RAISE EXCEPTION 'finalize_brand_site_sync only accepts a terminal status, got %', p_status;
  END IF;

  PERFORM public.canonical_assert_rpc_actor(p_actor_user_id);
  IF NOT public.canonical_actor_can_use_brand_action(p_marca_id, p_actor_user_id, 'marca', 'manage') THEN
    RAISE EXCEPTION 'finalize_brand_site_sync actor is not authorized for this Brand';
  END IF;

  -- ── Locking canônico desta operação: run e depois sitemap. ────────────────
  SELECT * INTO v_run
    FROM public.brand_site_sync_runs
    WHERE id = p_run_id AND marca_id = p_marca_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalize_brand_site_sync: run not found for this Brand';
  END IF;

  SELECT * INTO v_sitemap
    FROM public.brand_site_sitemaps
    WHERE id = v_run.sitemap_id AND marca_id = p_marca_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalize_brand_site_sync: sitemap not found for this Brand';
  END IF;

  -- ── Higiene do conjunto declarado (vale para os dois branches) ────────────
  v_input_count := COALESCE(array_length(v_urls, 1), 0);

  IF EXISTS (SELECT 1 FROM unnest(v_urls) AS u WHERE u IS NULL OR btrim(u) = '') THEN
    RAISE EXCEPTION 'OBSERVED_SET_INVALID_VALUE: null or empty URL declared';
  END IF;

  -- Contagem distinta E hash saem da MESMA definição de identidade: a guarda de
  -- duplicata não pode usar uma regra e o fingerprint outra. `count(DISTINCT u)`
  -- sobre texto foi descartado — em collation não-determinística ele poderia
  -- considerar iguais duas URLs com bytes diferentes.
  SELECT f.observed_count, f.observed_set_hash
    INTO v_input_distinct_count, v_input_hash
    FROM public.brand_site_observed_set_fingerprint(v_urls) AS f;

  IF v_input_count <> v_input_distinct_count THEN
    RAISE EXCEPTION 'OBSERVED_SET_MISMATCH: duplicate URL declared (input=% distinct=%)',
      v_input_count, v_input_distinct_count;
  END IF;

  IF p_status = 'failed' AND v_input_count > 0 THEN
    RAISE EXCEPTION 'finalize_brand_site_sync: failed does not accept observed URLs (declared=%)', v_input_count;
  END IF;

  -- ── Retry idempotente sobre execução já terminal ──────────────────────────
  -- Compara contra o FINGERPRINT gravado na própria execução, nunca contra o
  -- catálogo: uma execução posterior pode ter reobservado as mesmas URLs sem
  -- que o retry deixe de ser legítimo. Zero UPDATE, zero inferência de ausência.
  IF v_run.status <> 'running' THEN
    IF v_run.status <> p_status THEN
      RAISE EXCEPTION 'FINALIZATION_STATE_CONFLICT: run is % but % was requested', v_run.status, p_status;
    END IF;

    -- `missing_count` não vem do caller e por isso não entra na comparação.
    IF v_run.observed_count IS DISTINCT FROM v_input_count
       OR v_run.observed_set_hash IS DISTINCT FROM v_input_hash
       OR v_run.found_count IS DISTINCT FROM GREATEST(COALESCE(p_found_count, 0), 0)
       OR v_run.new_count IS DISTINCT FROM GREATEST(COALESCE(p_new_count, 0), 0)
       OR v_run.updated_count IS DISTINCT FROM GREATEST(COALESCE(p_updated_count, 0), 0)
       OR v_run.error_count IS DISTINCT FROM GREATEST(COALESCE(p_error_count, 0), 0)
       OR v_run.duration_ms IS DISTINCT FROM GREATEST(COALESCE(p_duration_ms, 0), 0)
       OR v_run.error_message IS DISTINCT FROM v_error_message THEN
      RAISE EXCEPTION 'FINALIZATION_REPLAY_CONFLICT: payload differs from the persisted finalization';
    END IF;

    RETURN jsonb_build_object(
      'atomicity', 'TRANSACTIONAL_RPC',
      'idempotentReplay', true,
      'status', v_run.status,
      'observedCount', v_run.observed_count,
      'observedSetHash', v_run.observed_set_hash,
      'missingCount', v_run.missing_count,
      -- EVENTO histórico: esta finalização promoveu o last-known-good quando ocorreu.
      'lastKnownGoodPromoted', v_run.status = 'completed',
      -- ESTADO corrente: um sync mais novo pode já ter assumido o posto.
      'isCurrentLastKnownGood', v_sitemap.last_successful_run_id = v_run.id,
      'run', to_jsonb(v_run),
      'sitemap', to_jsonb(v_sitemap)
    );
  END IF;

  -- ── Primeira finalização ──────────────────────────────────────────────────
  -- Enquanto o run está `running`, o catálogo AINDA é a prova da ingestão:
  -- INPUT = { linhas cujo last_seen_run_id = p_run_id }. As três contagens
  -- juntas provam igualdade de conjunto. `p_found_count` é metadado do run e
  -- NÃO participa desta prova.
  SELECT count(*) INTO v_db_observed_count
    FROM public.brand_site_catalog_entries c
    WHERE c.marca_id = p_marca_id AND c.last_seen_run_id = p_run_id;

  SELECT count(*) INTO v_matched_count
    FROM public.brand_site_catalog_entries c
    WHERE c.marca_id = p_marca_id
      AND c.last_seen_run_id = p_run_id
      AND c.normalized_url = ANY (v_urls);

  IF p_status = 'failed' AND v_db_observed_count > 0 THEN
    RAISE EXCEPTION 'finalize_brand_site_sync: % observations already persisted; use partial instead of failed', v_db_observed_count;
  END IF;

  IF v_input_count <> v_db_observed_count OR v_input_count <> v_matched_count THEN
    RAISE EXCEPTION 'OBSERVED_SET_MISMATCH: input=% db=% matched=%',
      v_input_count, v_db_observed_count, v_matched_count;
  END IF;

  -- Ausência é conclusão, e só `completed` conclui. O escopo é o PRÓPRIO
  -- sitemap, determinado pela execução que fez a última observação: uma URL
  -- vista por outro sitemap da Brand, ou de origem manual (last_seen_run_id
  -- nulo), não some porque esta coleta não a listou.
  IF p_status = 'completed' THEN
    UPDATE public.brand_site_catalog_entries c
      SET presence_state = 'missing', updated_by = p_actor_user_id
      WHERE c.marca_id = p_marca_id
        AND c.presence_state = 'present'
        AND c.last_seen_run_id IS NOT NULL
        AND c.last_seen_run_id <> p_run_id
        AND EXISTS (
          SELECT 1 FROM public.brand_site_sync_runs r
          WHERE r.id = c.last_seen_run_id AND r.sitemap_id = v_run.sitemap_id
        );
    GET DIAGNOSTICS v_missing = ROW_COUNT;
  END IF;

  -- Transição terminal do run, com o fingerprint gravado na MESMA operação.
  -- Precede o passo do sitemap de propósito: o gatilho de last-known-good exige
  -- que a execução apontada JÁ esteja `completed`.
  UPDATE public.brand_site_sync_runs
    SET status = p_status,
        completed_at = now(),
        found_count = GREATEST(COALESCE(p_found_count, 0), 0),
        new_count = GREATEST(COALESCE(p_new_count, 0), 0),
        updated_count = GREATEST(COALESCE(p_updated_count, 0), 0),
        missing_count = v_missing,
        error_count = GREATEST(COALESCE(p_error_count, 0), 0),
        duration_ms = GREATEST(COALESCE(p_duration_ms, 0), 0),
        error_message = v_error_message,
        observed_count = v_input_count,
        observed_set_hash = v_input_hash
    WHERE id = p_run_id AND marca_id = p_marca_id
    RETURNING * INTO v_run;

  -- Estado do sitemap. `last_successful_run_id` só avança em `completed`; em
  -- `partial` e `failed` o last-known-good anterior permanece como estava.
  v_sitemap_status := CASE p_status
    WHEN 'completed' THEN 'synced'
    WHEN 'partial' THEN 'partial'
    ELSE 'error'
  END;

  UPDATE public.brand_site_sitemaps
    SET status = v_sitemap_status,
        last_synced_at = now(),
        last_successful_run_id = CASE WHEN p_status = 'completed' THEN p_run_id ELSE last_successful_run_id END,
        updated_by = p_actor_user_id
    WHERE id = v_run.sitemap_id AND marca_id = p_marca_id
    RETURNING * INTO v_sitemap;

  RETURN jsonb_build_object(
    'atomicity', 'TRANSACTIONAL_RPC',
    'idempotentReplay', false,
    'status', p_status,
    'observedCount', v_run.observed_count,
    'observedSetHash', v_run.observed_set_hash,
    'missingCount', v_missing,
    'lastKnownGoodPromoted', p_status = 'completed',
    'isCurrentLastKnownGood', v_sitemap.last_successful_run_id = v_run.id,
    'run', to_jsonb(v_run),
    'sitemap', to_jsonb(v_sitemap)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_brand_site_sync(uuid, uuid, uuid, text, text[], integer, integer, integer, integer, integer, text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_brand_site_sync(uuid, uuid, uuid, text, text[], integer, integer, integer, integer, integer, text)
TO service_role;

COMMENT ON FUNCTION public.finalize_brand_site_sync(uuid, uuid, uuid, text, text[], integer, integer, integer, integer, integer, text)
IS 'Finaliza uma execução de sync de Site na mesma transação: prova de igualdade do conjunto observado, fingerprint imutável, retry idempotente sem mutação, inferência de ausência (só completed), transição terminal do run, promoção do last-known-good e estado do sitemap. A coleta permanece fora do banco.';

COMMIT;

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- As tabelas brand_site_* JÁ EXISTEM no remoto e NÃO são derrubadas aqui.
-- Nenhum histórico PRÉ-EXISTENTE À A1 é destruído: o rollback remove apenas o
-- que esta migration acrescentou e restaura o guard anterior, com a allowlist de
-- nove campos.
--
-- Ressalva honesta: execuções finalizadas DEPOIS da A1 perdem, no rollback, os
-- campos de fingerprint — e com eles a capacidade de replay idempotente
-- durável. As linhas continuam lá, com status, contagens e histórico intactos;
-- o que some é a prova de identidade do conjunto observado.
--
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.finalize_brand_site_sync(uuid, uuid, uuid, text, text[], integer, integer, integer, integer, integer, text);
--   DROP FUNCTION IF EXISTS public.brand_site_observed_set_fingerprint(text[]);
--
--   CREATE OR REPLACE FUNCTION public.brand_site_sync_run_guard()
--   RETURNS trigger
--   LANGUAGE plpgsql
--   SECURITY INVOKER
--   SET search_path = pg_catalog, public, pg_temp
--   AS $rollback$
--   BEGIN
--     IF TG_OP = 'DELETE' THEN
--       RAISE EXCEPTION 'brand_site_sync_runs is append-only: delete refused';
--     END IF;
--     IF OLD.status <> 'running' THEN
--       RAISE EXCEPTION 'brand_site_sync_runs terminal record cannot be changed (status=%)', OLD.status;
--     END IF;
--     IF NEW.status NOT IN ('completed', 'partial', 'failed') THEN
--       RAISE EXCEPTION 'brand_site_sync_runs only accepts a terminal transition, got %', NEW.status;
--     END IF;
--     IF NEW.completed_at IS NULL THEN
--       RAISE EXCEPTION 'brand_site_sync_runs terminal transition requires completed_at';
--     END IF;
--     IF (to_jsonb(NEW)
--           - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
--           - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message')
--        IS DISTINCT FROM
--        (to_jsonb(OLD)
--           - 'status' - 'completed_at' - 'found_count' - 'new_count' - 'updated_count'
--           - 'missing_count' - 'error_count' - 'duration_ms' - 'error_message') THEN
--       RAISE EXCEPTION 'brand_site_sync_runs allows only completion fields to change';
--     END IF;
--     RETURN NEW;
--   END;
--   $rollback$;
--
--   ALTER TABLE public.brand_site_sync_runs
--     DROP CONSTRAINT IF EXISTS brand_site_sync_runs_fingerprint_coherent;
--   ALTER TABLE public.brand_site_sync_runs
--     DROP COLUMN IF EXISTS observed_set_hash,
--     DROP COLUMN IF EXISTS observed_count;
-- COMMIT;
--
-- Depois do rollback, a finalização volta a não ter caminho atômico: o runtime
-- deve então recusar promover `completed` em vez de aplicá-la em etapas soltas.
