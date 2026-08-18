BEGIN;

LOCK TABLE public.minerador_keyword_metric_measurements, public.keywords_kgr IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  existing_constraint name;
  matching_constraints integer;
BEGIN
  IF to_regclass('public.minerador_keyword_metric_measurements') IS NULL
    OR to_regclass('public.keywords_kgr') IS NULL THEN
    RAISE EXCEPTION 'MINERADOR_0008_PRECONDITION: tabelas de keyword ou métricas ausentes';
  END IF;

  SELECT count(*), max(c.conname::text)::name
  INTO matching_constraints, existing_constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'public.minerador_keyword_metric_measurements'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public.keywords_kgr'::regclass
    AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.minerador_keyword_metric_measurements'::regclass AND attname = 'keyword_id' AND NOT attisdropped)];

  IF matching_constraints <> 1 THEN
    RAISE EXCEPTION 'MINERADOR_0008_PRECONDITION: esperada uma única FK de métricas para keyword; encontradas %', matching_constraints;
  END IF;

  EXECUTE format('ALTER TABLE public.minerador_keyword_metric_measurements DROP CONSTRAINT %I', existing_constraint);
END $$;

ALTER TABLE public.minerador_keyword_metric_measurements
  ADD CONSTRAINT minerador_keyword_metric_measurements_keyword_id_fkey
  FOREIGN KEY (keyword_id) REFERENCES public.keywords_kgr(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT minerador_keyword_metric_measurements_keyword_id_fkey
  ON public.minerador_keyword_metric_measurements IS
  'Métricas oficiais são removidas somente junto da exclusão permanente e autorizada de sua keyword não publicada.';

COMMIT;
