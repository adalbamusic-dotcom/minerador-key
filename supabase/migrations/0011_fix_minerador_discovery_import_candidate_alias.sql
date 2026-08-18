BEGIN;

-- Corrige a ambiguidade entre a variavel PL/pgSQL `candidate` e o alias
-- SQL usado nas validacoes anteriores ao processamento do lote. A migration
-- 0010 permanece imutavel; esta substituicao e aditiva e deve ser aplicada
-- manualmente no mesmo projeto Supabase.
CREATE OR REPLACE FUNCTION public.import_minerador_discovery_candidates(
  p_brand_id uuid,
  p_actor_user_id uuid,
  p_import_request_id uuid,
  p_candidate_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  normalized_ids uuid[];
  batch public.minerador_discovery_import_batches%ROWTYPE;
  candidate public.minerador_discovery_candidates%ROWTYPE;
  run public.minerador_discovery_runs%ROWTYPE;
  keyword_id uuid;
  inserted_origin integer;
  expected_count integer;
  found_count integer;
  run_count integer;
  v_created_count integer := 0;
  v_already_existing_count integer := 0;
  v_linked_count integer := 0;
  v_failed_count integer := 0;
  v_failure_reasons jsonb := '[]'::jsonb;
  v_result_items jsonb := '[]'::jsonb;
  v_candidate_outcome text;
  final_status text;
  source_snapshot jsonb;
BEGIN
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL OR p_import_request_id IS NULL
    OR p_candidate_ids IS NULL OR cardinality(p_candidate_ids) = 0
    OR cardinality(p_candidate_ids) > 1000 THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_INVALID_REQUEST';
  END IF;

  normalized_ids := ARRAY(
    SELECT DISTINCT candidate_id
    FROM unnest(p_candidate_ids) AS candidate_id
    ORDER BY candidate_id
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.marcas brand
    WHERE brand.id = p_brand_id
      AND (
        brand.owner_user_id = p_actor_user_id
        OR EXISTS (
          SELECT 1 FROM public.perfis profile
          WHERE profile.id = p_actor_user_id AND profile.role = 'admin'
        )
        OR EXISTS (
          SELECT 1
          FROM public.brand_memberships membership
          JOIN public.brand_member_permissions permission ON permission.membership_id = membership.id
          WHERE membership.marca_id = p_brand_id
            AND membership.member_user_id = p_actor_user_id
            AND membership.status = 'active'
            AND permission.module = 'minerador'
            AND permission.action = 'create'
            AND permission.granted = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO batch
  FROM public.minerador_discovery_import_batches
  WHERE brand_id = p_brand_id AND import_request_id = p_import_request_id
  FOR UPDATE;

  IF batch.id IS NOT NULL THEN
    IF batch.candidate_ids IS DISTINCT FROM normalized_ids THEN
      RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED';
    END IF;
    RETURN jsonb_build_object(
      'batchId', batch.id,
      'status', batch.status,
      'selected', batch.selected_count,
      'created', batch.created_count,
      'alreadyExisting', batch.already_existing_count,
      'linked', batch.linked_count,
      'rejected', batch.rejected_count,
      'failed', batch.failed_count,
      'failureReasons', batch.failure_reasons,
      'resultItems', batch.result_items,
      'idempotent', true
    );
  END IF;

  SELECT count(*) INTO expected_count FROM unnest(normalized_ids);
  SELECT count(*) INTO found_count
  FROM public.minerador_discovery_candidates selected_candidate
  WHERE selected_candidate.brand_id = p_brand_id
    AND selected_candidate.id = ANY(normalized_ids);
  IF found_count <> expected_count THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_CANDIDATE_NOT_FOUND';
  END IF;

  SELECT count(DISTINCT selected_candidate.discovery_run_id) INTO run_count
  FROM public.minerador_discovery_candidates selected_candidate
  WHERE selected_candidate.brand_id = p_brand_id
    AND selected_candidate.id = ANY(normalized_ids);
  IF run_count <> 1 THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_MULTIPLE_RUNS';
  END IF;

  SELECT selected_run.* INTO run
  FROM public.minerador_discovery_runs selected_run
  JOIN public.minerador_discovery_candidates selected_candidate
    ON selected_candidate.discovery_run_id = selected_run.id
  WHERE selected_candidate.brand_id = p_brand_id
    AND selected_candidate.id = ANY(normalized_ids)
  LIMIT 1;

  IF run.status <> 'completed' THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_RUN_NOT_COMPLETED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.minerador_discovery_candidates selected_candidate
    WHERE selected_candidate.brand_id = p_brand_id
      AND selected_candidate.id = ANY(normalized_ids)
      AND selected_candidate.filter_outcome <> 'approved'
  ) THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_CANDIDATE_NOT_APPROVED';
  END IF;

  INSERT INTO public.minerador_discovery_import_batches (
    brand_id, actor_user_id, import_request_id, discovery_run_id, candidate_ids,
    status, selected_count
  ) VALUES (
    p_brand_id, p_actor_user_id, p_import_request_id, run.id, normalized_ids,
    'pending', expected_count
  )
  ON CONFLICT (brand_id, import_request_id) DO NOTHING;

  SELECT * INTO batch
  FROM public.minerador_discovery_import_batches
  WHERE brand_id = p_brand_id AND import_request_id = p_import_request_id
  FOR UPDATE;

  IF batch.candidate_ids IS DISTINCT FROM normalized_ids THEN
    RAISE EXCEPTION 'MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED';
  END IF;

  FOR candidate IN
    SELECT source.*
    FROM public.minerador_discovery_candidates source
    WHERE source.brand_id = p_brand_id AND source.id = ANY(normalized_ids)
    ORDER BY source.id
  LOOP
    BEGIN
      keyword_id := NULL;

      IF candidate.import_status = 'imported' AND candidate.imported_keyword_id IS NOT NULL THEN
        keyword_id := candidate.imported_keyword_id;
      ELSE
        SELECT keyword.id INTO keyword_id
        FROM public.keywords_kgr keyword
        WHERE keyword.brand_id = p_brand_id
          AND public.minerador_discovery_normalize_keyword(keyword.keyword) = candidate.canonical_keyword
        ORDER BY (keyword.status = 'publicado') DESC, keyword.created_at ASC, keyword.id
        LIMIT 1
        FOR UPDATE;
      END IF;

      source_snapshot := jsonb_build_object(
        'candidate', to_jsonb(candidate),
        'run', to_jsonb(run),
        'importedAt', now(),
        'actorUserId', p_actor_user_id
      );

      IF keyword_id IS NULL THEN
        INSERT INTO public.keywords_kgr (
          brand_id, keyword, location, results_allintitle, volume_search,
          kgr_score, intent, status, lista_id, volume_source, analise_semantica
        ) VALUES (
          p_brand_id,
          candidate.keyword_original,
          run.country_label,
          NULL,
          candidate.average_monthly_searches,
          NULL,
          NULL,
          'bruto',
          NULL,
          'google_ads',
          jsonb_build_object(
            'discovery_import', jsonb_build_object(
              'discoveryRunId', candidate.discovery_run_id,
              'discoveryCandidateId', candidate.id,
              'seedOriginal', run.seed_original,
              'relationshipMode', run.relationship_mode,
              'preliminaryIntent', candidate.preliminary_intent,
              'preliminaryFunnel', candidate.preliminary_funnel,
              'targeting', candidate.targeting,
              'provider', candidate.provider,
              'providerVersion', candidate.provider_version,
              'measuredAt', candidate.measured_at,
              'metrics', jsonb_build_object(
                'averageMonthlySearches', candidate.average_monthly_searches,
                'monthlySearchVolumes', candidate.monthly_search_volumes,
                'competition', candidate.competition,
                'competitionIndex', candidate.competition_index,
                'lowTopOfPageBidMicros', candidate.low_top_of_page_bid_micros,
                'highTopOfPageBidMicros', candidate.high_top_of_page_bid_micros,
                'averageCpcMicros', candidate.average_cpc_micros,
                'currencyCode', candidate.currency_code,
                'timeZone', candidate.time_zone
              ),
              'sourceSnapshot', source_snapshot
            )
          )
        ) RETURNING id INTO keyword_id;
        v_created_count := v_created_count + 1;
        v_candidate_outcome := 'created';
      ELSE
        v_already_existing_count := v_already_existing_count + 1;
        v_candidate_outcome := 'already_existing';
      END IF;

      INSERT INTO public.minerador_discovery_keyword_origins (
        brand_id, keyword_id, discovery_candidate_id, discovery_run_id,
        import_batch_id, actor_user_id, source_snapshot
      ) VALUES (
        p_brand_id, keyword_id, candidate.id, candidate.discovery_run_id,
        batch.id, p_actor_user_id, source_snapshot
      ) ON CONFLICT (keyword_id, discovery_candidate_id) DO NOTHING;
      GET DIAGNOSTICS inserted_origin = ROW_COUNT;
      IF inserted_origin > 0 THEN v_linked_count := v_linked_count + 1; END IF;

      v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
        'candidateId', candidate.id,
        'keywordId', keyword_id,
        'outcome', v_candidate_outcome
      ));

      UPDATE public.minerador_discovery_candidates
      SET import_status = 'imported', imported_keyword_id = keyword_id
      WHERE id = candidate.id AND brand_id = p_brand_id;
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_failure_reasons := v_failure_reasons || jsonb_build_array(jsonb_build_object(
        'candidateId', candidate.id,
        'reason', 'candidate_persist_failed'
      ));
      v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
        'candidateId', candidate.id,
        'keywordId', NULL,
        'outcome', 'failed',
        'reason', 'candidate_persist_failed'
      ));
    END;
  END LOOP;

  final_status := CASE
    WHEN v_failed_count = 0 THEN 'completed'
    WHEN v_created_count + v_already_existing_count > 0 THEN 'partial'
    ELSE 'failed'
  END;

  UPDATE public.minerador_discovery_import_batches
  SET status = final_status,
      created_count = v_created_count,
      already_existing_count = v_already_existing_count,
      linked_count = v_linked_count,
      rejected_count = 0,
      failed_count = v_failed_count,
      failure_reasons = v_failure_reasons,
      result_items = v_result_items,
      completed_at = now()
  WHERE id = batch.id;

  RETURN jsonb_build_object(
    'batchId', batch.id,
    'status', final_status,
    'selected', expected_count,
    'created', v_created_count,
    'alreadyExisting', v_already_existing_count,
    'linked', v_linked_count,
    'rejected', 0,
    'failed', v_failed_count,
    'failureReasons', v_failure_reasons,
    'resultItems', v_result_items,
    'idempotent', false
  );
END;
$$;

COMMIT;
