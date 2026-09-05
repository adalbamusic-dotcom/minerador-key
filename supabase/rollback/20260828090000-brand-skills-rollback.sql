begin;

do $$
declare
  expected_definition text := 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text, ''brand_skill''::text]))';
  actual_definition text;
begin
  if exists (select 1 from public.editorial_artifact_versions where artifact_type = 'brand_skill') then
    raise exception using errcode = 'P0001', message = 'brand skills rollback refused: persisted brand_skill versions exist', hint = 'This rollback never deletes or rewrites artifacts.';
  end if;
  select pg_get_constraintdef(c.oid, true) into actual_definition
  from pg_constraint c
  where c.conrelid = 'public.editorial_artifact_versions'::regclass
    and c.conname = 'editorial_artifact_versions_artifact_type_check';
  if actual_definition is distinct from expected_definition then
    raise exception using errcode = 'P0001', message = 'brand skills rollback refused: target constraint drifted', detail = coalesce(actual_definition, '<missing>');
  end if;
end $$;

alter table public.editorial_artifact_versions drop constraint editorial_artifact_versions_artifact_type_check;
alter table public.editorial_artifact_versions add constraint editorial_artifact_versions_artifact_type_check check (artifact_type = any (array['article_dna'::text, 'silo_dna'::text, 'silo_page'::text, 'content_plan'::text, 'brand_dna'::text]));

commit;
