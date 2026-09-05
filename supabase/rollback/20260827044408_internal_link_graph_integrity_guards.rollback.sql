BEGIN;

DROP TRIGGER IF EXISTS internal_link_graph_working_copies_validate_references_trg
  ON public.internal_link_graph_working_copies;

DROP FUNCTION IF EXISTS public.internal_link_graph_validate_working_copy_references();

-- Restore the version-chain validator that existed immediately before this
-- successor. The runtime advisory-lock migration remains applied; this
-- rollback only restores the validator body and removes the new working-copy
-- guard. It does not touch data, tables or grants.
CREATE OR REPLACE FUNCTION public.internal_link_graph_validate_version_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  previous_graph public.internal_link_graphs%ROWTYPE;
BEGIN
  IF NEW.previous_graph_version_id IS NULL THEN
    IF NEW.version_number <> 1 THEN
      RAISE EXCEPTION 'internal_link_graph first version must be version 1';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
    INTO previous_graph
  FROM public.internal_link_graphs
  WHERE graph_version_id = NEW.previous_graph_version_id
  FOR SHARE;

  IF NOT FOUND
     OR previous_graph.marca_id IS DISTINCT FROM NEW.marca_id
     OR previous_graph.graph_id IS DISTINCT FROM NEW.graph_id
     OR previous_graph.version_number <> NEW.version_number - 1 THEN
    RAISE EXCEPTION 'internal_link_graph previous version must be the immediate predecessor of the same Brand and Graph';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
