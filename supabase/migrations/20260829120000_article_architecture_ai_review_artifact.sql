-- Revisão arquitetural por IA do Arquiteto como artifact article-scoped.
-- Reutiliza editorial_artifact_versions: entity_id = articleId, marca_id = brandId.
-- Única mudança material: o CHECK de artifact_type passa a aceitar
-- article_architecture_ai_review. Nenhuma tabela, coluna, RLS ou grant novo;
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
    'keyword_contextual_presentation', 'article_architecture_ai_review'
  );
  if unexpected is not null then
    raise exception using errcode = 'P0001',
      message = 'ai review migration refused: artifact_type fora da lista final',
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
    'keyword_contextual_presentation'::text,
    'article_architecture_ai_review'::text
  ]));

commit;

-- Rollback: repetir o bloco acima sem 'article_architecture_ai_review' na lista.
-- Linhas já gravadas com o tipo novo passariam a violar o CHECK, então o
-- rollback exige antes decidir o destino delas; nenhum dado é apagado aqui.
