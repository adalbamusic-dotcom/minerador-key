-- Apresentação Contextual (IA) do Minerador como artifact keyword-scoped.
-- Reutiliza editorial_artifact_versions: entity_id = keywordId, marca_id = brandId.
-- Única mudança material: o CHECK de artifact_type passa a aceitar
-- keyword_contextual_presentation. Nenhuma tabela, coluna, RLS ou grant novo;
-- nenhum dado alterado; migration ledger fora de escopo.

begin;

-- Guarda por dados, não por texto do constraint: recusa se existir algum
-- artifact_type gravado fora da lista final. Assim nenhuma linha existente
-- passa a violar o novo CHECK, mesmo que a definição atual tenha outro formato.
do $$
declare
  unexpected text;
begin
  select string_agg(distinct v.artifact_type, ', ') into unexpected
  from public.editorial_artifact_versions v
  where v.artifact_type not in (
    'article_dna', 'silo_dna', 'silo_page', 'content_plan',
    'brand_dna', 'brand_skill', 'keyword_semantic_qualification',
    'keyword_contextual_presentation'
  );
  if unexpected is not null then
    raise exception using errcode = 'P0001',
      message = 'contextual presentation migration refused: artifact_type fora da lista final',
      detail = unexpected;
  end if;
end $$;

alter table public.editorial_artifact_versions
  drop constraint if exists editorial_artifact_versions_artifact_type_check;

alter table public.editorial_artifact_versions
  add constraint editorial_artifact_versions_artifact_type_check
  check (artifact_type = any (array[
    'article_dna'::text,
    'silo_dna'::text,
    'silo_page'::text,
    'content_plan'::text,
    'brand_dna'::text,
    'brand_skill'::text,
    'keyword_semantic_qualification'::text,
    'keyword_contextual_presentation'::text
  ]));

commit;
