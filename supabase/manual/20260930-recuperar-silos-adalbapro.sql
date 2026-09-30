-- Recuperação dos Silos da AdalbaPro (2026-09-30), pedida pelo dono ("recupera eles por favor").
-- Desfaz o que a adoção de Silo publicado fez às 11:57:
--   * 3 Silos duplicados (Captação, Crescimento, Estratégia) dos que já estavam consolidados;
--   * 19 keywords publicadas movidas para esses duplicados;
--   * 2 candidatos recriados (botox para o rosto, tratamento estético para o rosto) que o dono já tinha desfeito.
-- Nada é apagado. Uma transação só; qualquer contagem diferente do observado aborta tudo.
begin;

create temp table mapa (novo text primary key, original text not null) on commit drop;
insert into mapa values
  ('territory:d0fa7569-5950-4ca5-b713-254a46d277d9', 'territory:2892f12d-6f8e-4436-b8d2-91632f6c2c97'),  -- Captação de Pacientes
  ('territory:c295b112-144b-4cd8-97d0-b86cb4a61773', 'territory:58fe7dea-2f18-4213-a82d-cafa830903b6'),  -- Crescimento de Clínicas
  ('territory:7cde53f0-34de-423d-9041-29aeefaf0dc3', 'territory:767f713b-4cdd-438c-ad17-5b0a7b335b2f');  -- Estratégia de Negócios

-- 1. As 19 keywords voltam para o Silo consolidado de origem (o mesmo Silo do ArticleDNA delas).
create temp table passo1 on commit drop as
with alvo as (
  select w.id, m.original
  from editorial_workflow_items w
  join mapa m on m.novo = w.payload->>'territoryRef'
  where w.marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and w.subject_type = 'keyword'
), feito as (
  update editorial_workflow_items w
  set payload = jsonb_set(w.payload, '{territoryRef}', to_jsonb(alvo.original))
  from alvo where w.id = alvo.id
  returning w.id
)
select count(*) as n from feito;

do $$ begin
  if (select n from passo1) <> 19 then raise exception 'passo 1: esperava 19 keywords, achou %', (select n from passo1); end if;
end $$;

-- 2. Os 3 Silos duplicados ficam rejeitados (como "Desfazer Silo"), apontando o original que os substitui.
create temp table passo2 on commit drop as
with feito as (
  update editorial_workflow_items w
  set state = 'rejected',
      payload = jsonb_set(jsonb_set(jsonb_set(w.payload,
        '{territory,lifecycleStatus}', '"rejected"'),
        '{territory,decisionState}', '"rejected"'),
        '{territory,lineage,supersededByTerritoryRef}', to_jsonb(m.original))
  from mapa m
  where w.marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and w.subject_id = m.novo and w.state = 'confirmed'
  returning w.id
)
select count(*) as n from feito;

do $$ begin
  if (select n from passo2) <> 3 then raise exception 'passo 2: esperava 3 Silos duplicados, achou %', (select n from passo2); end if;
  if exists (select 1 from editorial_workflow_items w join mapa m on m.novo = w.payload->>'territoryRef' where w.subject_type = 'keyword') then
    raise exception 'passo 2: ainda há keyword nos Silos duplicados';
  end if;
end $$;

-- 3. Os 2 candidatos recriados voltam a rejeitados (só se continuarem vazios).
create temp table passo3 on commit drop as
with feito as (
  update editorial_workflow_items w
  set state = 'rejected',
      payload = jsonb_set(jsonb_set(w.payload,
        '{territory,lifecycleStatus}', '"rejected"'),
        '{territory,decisionState}', '"rejected"')
  where w.marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3'
    and w.subject_id in ('territory:5fb06c7c-09f8-44bf-8c08-d557850fd1f9', 'territory:7639fa52-5af5-4a87-aa65-82426018aaff')
    and w.state = 'candidate'
    and not exists (select 1 from editorial_workflow_items k where k.subject_type = 'keyword' and k.payload->>'territoryRef' = w.subject_id)
  returning w.id
)
select count(*) as n from feito;

do $$ begin
  if (select n from passo3) <> 2 then raise exception 'passo 3: esperava 2 candidatos vazios, achou %', (select n from passo3); end if;
end $$;

-- 4. A formação do "como atrair clientes pelo whatsapp" volta a apontar o artigo ORIGINAL
--    (8bcd8ff3…). O "Concluir" das 12:09 criou um ArticleDNA duplicado (article-formation:62ade5c4…)
--    e religou a formação a ele; o original está no SiloDNA de Captação.
create temp table passo4 on commit drop as
with marcador as (
  select id, payload from editorial_workflow_items
  where marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and subject_type = 'article_formation_analysis' and subject_id = 'current'
), novo as (
  select m.id, jsonb_set(m.payload, '{concludedFormations}', (
    select jsonb_agg(case
      when f->>'candidateRef' = 'article-formation:62ade5c4-1894-47f2-b64c-19e391e420f2'
        then jsonb_set(f, '{materializedArticleId}', '"8bcd8ff3-3207-48a7-8089-262488fba4ab"')
      else f end order by ord)
    from jsonb_array_elements(m.payload->'concludedFormations') with ordinality as t(f, ord)
  )) as payload,
  (select count(*) from jsonb_array_elements(m.payload->'concludedFormations') f
     where f->>'candidateRef' = 'article-formation:62ade5c4-1894-47f2-b64c-19e391e420f2') as achadas
  from marcador m
), feito as (
  update editorial_workflow_items w set payload = novo.payload
  from novo where w.id = novo.id and novo.achadas = 1
  returning w.id
)
select count(*) as n from feito;

do $$ begin
  if (select n from passo4) <> 1 then raise exception 'passo 4: esperava 1 marcador com a formação do whatsapp, achou %', (select n from passo4); end if;
end $$;

commit;

-- Releitura (é o único resultado que o db query -f devolve).
select
  (select count(*) from editorial_workflow_items where marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and subject_type = 'keyword'
     and payload->>'territoryRef' in ('territory:d0fa7569-5950-4ca5-b713-254a46d277d9','territory:c295b112-144b-4cd8-97d0-b86cb4a61773','territory:7cde53f0-34de-423d-9041-29aeefaf0dc3')) as keywords_nos_duplicados,
  (select string_agg(payload->'territory'->>'name' || ' = ' || state, ' · ' order by subject_id) from editorial_workflow_items
     where marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and subject_id like 'territory:%' and state <> 'rejected') as silos_ativos,
  (select f->>'materializedArticleId' from editorial_workflow_items w, jsonb_array_elements(w.payload->'concludedFormations') f
     where w.marca_id = '61d2e019-f44f-4fa3-af2f-d86b95628ab3' and w.subject_type = 'article_formation_analysis' and w.subject_id = 'current'
       and f->>'candidateRef' = 'article-formation:62ade5c4-1894-47f2-b64c-19e391e420f2') as whatsapp_aponta_para;
