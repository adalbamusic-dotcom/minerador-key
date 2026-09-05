-- Qualificação Semântica (SERP) do Minerador como artifact keyword-scoped.
-- Reutiliza o store canônico editorial_artifact_versions: entity_id = keywordId,
-- marca_id = brandId, version_number/previous_version_id/content_hash já existentes.
-- Nenhuma tabela nova, nenhuma coluna nova, nenhum dado alterado.

begin;

do $$
declare
  expected_definition text := 'CHECK (artifact_type = ANY (ARRAY[''article_dna''::text, ''silo_dna''::text, ''silo_page''::text, ''content_plan''::text, ''brand_dna''::text, ''brand_skill''::text]))';
  actual_definition text;
begin
  select pg_get_constraintdef(c.oid, true) into actual_definition
  from pg_constraint c
  where c.conrelid = 'public.editorial_artifact_versions'::regclass
    and c.conname = 'editorial_artifact_versions_artifact_type_check';
  if actual_definition is distinct from expected_definition then
    raise exception using errcode = 'P0001', message = 'keyword semantic qualification migration refused: editorial artifact type constraint drifted', detail = coalesce(actual_definition, '<missing>');
  end if;
end $$;

alter table public.editorial_artifact_versions drop constraint editorial_artifact_versions_artifact_type_check;
alter table public.editorial_artifact_versions add constraint editorial_artifact_versions_artifact_type_check check (artifact_type = any (array['article_dna'::text, 'silo_dna'::text, 'silo_page'::text, 'content_plan'::text, 'brand_dna'::text, 'brand_skill'::text, 'keyword_semantic_qualification'::text]));

commit;
