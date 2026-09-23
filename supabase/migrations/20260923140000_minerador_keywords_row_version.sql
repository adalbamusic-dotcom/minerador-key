-- ---------------------------------------------------------------------------
-- Marcador de mudanca por linha em `minerador_keywords`: `row_version`.
--
-- ESTADO: NAO APLICADA. Escrita em 2026-09-23 junto com a SDD
-- `docs/compartilhado/sdd-cache-local-keywords-conferido-2026-09-23.md`
-- (opcao O2 da secao E8 de `sdd-uso-supabase-orcamento-egress-2026-09-23.md`,
-- regras R20-R24). Aplicar so depois de a SDD ser aprovada.
--
-- COMO APLICAR (usuario, manualmente):
--
--   npx supabase db query --linked -f supabase/migrations/20260923140000_minerador_keywords_row_version.sql
--   npx supabase migration repair --status applied 20260923140000 --linked
--
-- NUNCA `supabase db push`: so parte das migrations consta no historico
-- remoto e o push tentaria reaplicar a cadeia inteira.
--
-- POR QUE
--
-- `minerador_keywords` nao tem marcador de mudanca: nem `updated_at`, nem
-- versao, nem hash (MEDIDO em 2026-09-23 no catalogo: 16 colunas, nenhuma
-- delas muda a cada escrita). Sem marcador, um cache no navegador nao tem
-- como saber o que mudou e teria de baixar a listagem inteira a cada
-- abertura -- 380 a 607 kB por marca (MEDIDO, `length(k::text)` na view).
-- Com `row_version`, a abertura pede so a impressao digital (id +
-- row_version de cada keyword viva: 2,6 a 10,6 kB por marca, MEDIDO) e baixa
-- apenas as linhas cuja versao mudou.
--
-- O QUE ESTA MIGRATION FAZ
--
--   1. coluna `row_version bigint NOT NULL DEFAULT 1` (metadado so: default
--      constante nao reescreve a tabela no PostgreSQL 11+; o remoto e 17.6);
--   2. funcao de gatilho que, em INSERT, fixa 1 e, em UPDATE, grava
--      OLD.row_version + 1 -- ignorando o que o escritor mandou;
--   3. gatilho BEFORE INSERT OR UPDATE com nome que ordena DEPOIS dos quatro
--      gatilhos BEFORE existentes (o PostgreSQL dispara gatilhos do mesmo
--      evento em ordem alfabetica de nome);
--   4. a view `minerador_keywords_listagem` recriada com `row_version` no fim,
--      preservando a definicao atual exata, `security_invoker`, dono, grants
--      e comentario.
--
-- O QUE ELA NAO FAZ
--
-- Nao muda nenhum dado existente (todas as linhas nascem com 1), nao muda
-- RLS, nao muda grants da tabela, nao muda nenhum outro gatilho e nao liga o
-- cache: o cliente continua lendo como hoje ate a implementacao da SDD.
-- ---------------------------------------------------------------------------

BEGIN;

-- 0. Pre-condicoes -----------------------------------------------------------
-- Conferidas no catalogo em 2026-09-23 (consulta agregada a pg_trigger,
-- pg_class e information_schema). Se o banco divergir, a migration para aqui
-- em vez de sobrescrever as cegas.
DO $pre$
DECLARE
  gatilhos text;
  colunas_view text;
  opcoes text;
  definicao text;
BEGIN
  -- Os quatro gatilhos BEFORE de hoje. O novo precisa ordenar depois de todos.
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text COLLATE "C")
  INTO gatilhos
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.minerador_keywords'::regclass
    AND NOT t.tgisinternal
    AND t.tgname <> 'zz_minerador_keywords_row_version';

  IF gatilhos IS DISTINCT FROM
    'minerador_keywords_preserva_series,minerador_keywords_trava_identidade_publicada,trg_protect_published_keyword,trg_tenant_0005_validate_keyword_brand'
  THEN
    RAISE EXCEPTION 'ROW_VERSION_PRE: gatilhos de minerador_keywords divergem do conferido em 2026-09-23: %', gatilhos;
  END IF;

  -- A view, na forma de 20260921030000: 16 colunas, nesta ordem, ou 17 com
  -- row_version no fim se esta migration ja tiver sido aplicada.
  SELECT string_agg(c.column_name::text, ',' ORDER BY c.ordinal_position)
  INTO colunas_view
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'minerador_keywords_listagem';

  IF colunas_view IS DISTINCT FROM
       'id,keyword,location,results_allintitle,volume_search,kgr_score,intent,status,created_at,lista_id,analise_semantica,volume_source,brand_id,deleted_at,purge_after,deleted_by'
     AND colunas_view IS DISTINCT FROM
       'id,keyword,location,results_allintitle,volume_search,kgr_score,intent,status,created_at,lista_id,analise_semantica,volume_source,brand_id,deleted_at,purge_after,deleted_by,row_version'
  THEN
    RAISE EXCEPTION 'ROW_VERSION_PRE: colunas de minerador_keywords_listagem divergem: %', colunas_view;
  END IF;

  SELECT array_to_string(c.reloptions, ',')
  INTO opcoes
  FROM pg_class c
  WHERE c.oid = 'public.minerador_keywords_listagem'::regclass;

  IF opcoes IS DISTINCT FROM 'security_invoker=true' THEN
    RAISE EXCEPTION 'ROW_VERSION_PRE: minerador_keywords_listagem sem security_invoker=true: %', opcoes;
  END IF;

  -- A poda das quatro series de medicao (MEASUREMENT_SERIES_PATHS).
  definicao := pg_get_viewdef('public.minerador_keywords_listagem'::regclass, true);
  IF position('{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}' IN definicao) = 0
    OR position('{volume_measurement,monthlySearchVolumes}' IN definicao) = 0
    OR position('{dataforseo_keyword_overview_history}' IN definicao) = 0
    OR position('{allintitle_measurement_history}' IN definicao) = 0
  THEN
    RAISE EXCEPTION 'ROW_VERSION_PRE: a poda de series da view mudou; recriar a view a partir desta migration apagaria a mudanca.';
  END IF;
END;
$pre$;

-- 1. Coluna -------------------------------------------------------------------
ALTER TABLE public.minerador_keywords
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.minerador_keywords.row_version IS
  'Marcador de mudanca da linha. 1 no INSERT; +1 a cada UPDATE, pelo gatilho zz_minerador_keywords_row_version, ignorando o valor enviado. Base da impressao digital do cache conferido do Minerador (SDD 2026-09-23). Nao e versao editorial nem ID: e so "mudou desde a leitura?".';

-- 2. Funcao do gatilho ------------------------------------------------------
-- SECURITY DEFINER e search_path fixo seguem a regra dos gatilhos vizinhos
-- (20260921090000; `tests/minerador-gatilhos-security-definer.test.mts`).
-- Esta funcao nao le nada; o definer so impede que ela dependa, um dia, de
-- uma funcao auxiliar restrita ao dono. A RLS do UPDATE continua sendo a de
-- quem escreve. Disparar gatilho nao exige EXECUTE de quem escreve
-- (conferido: `authenticated` nao tem EXECUTE em protect_published_keyword,
-- que dispara em todo UPDATE da tela).
CREATE OR REPLACE FUNCTION public.minerador_keywords_incrementa_row_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Linha nova sempre comeca em 1: um INSERT que copie uma linha lida
    -- (com row_version) nao herda a versao da outra.
    NEW.row_version := 1;
    RETURN NEW;
  END IF;

  -- Todo UPDATE conta, inclusive o que nao muda nada: o custo de um falso
  -- positivo e rebaixar uma linha; o de um falso negativo seria o cache
  -- mostrar dado velho como atual.
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.minerador_keywords_incrementa_row_version() IS
  'Gatilho de minerador_keywords: row_version = 1 no INSERT e OLD + 1 no UPDATE. O valor enviado pelo escritor e ignorado.';

REVOKE ALL ON FUNCTION public.minerador_keywords_incrementa_row_version() FROM PUBLIC, anon, authenticated, service_role;

-- 3. Gatilho ------------------------------------------------------------------
-- Nome com prefixo `zz_`: gatilhos BEFORE do mesmo evento disparam em ordem
-- alfabetica, e este precisa rodar DEPOIS de
--   minerador_keywords_preserva_series
--   minerador_keywords_trava_identidade_publicada
--   trg_protect_published_keyword
--   trg_tenant_0005_validate_keyword_brand
-- Assim ele so incrementa se nenhum anterior abortou ou descartou a linha
-- (RETURN NULL interrompe a cadeia), e o incremento e a ultima palavra sobre
-- NEW. Gatilho novo em minerador_keywords precisa ordenar ANTES deste.
DROP TRIGGER IF EXISTS zz_minerador_keywords_row_version ON public.minerador_keywords;
CREATE TRIGGER zz_minerador_keywords_row_version
  BEFORE INSERT OR UPDATE ON public.minerador_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.minerador_keywords_incrementa_row_version();

-- 4. View de listagem -----------------------------------------------------------
-- CREATE OR REPLACE aceita coluna nova NO FIM da lista e preserva OID, dono,
-- grants e comentario. As 16 colunas abaixo sao a definicao viva lida por
-- pg_get_viewdef em 2026-09-23, identica a de 20260921030000; so
-- `k.row_version` e novo. `WITH (security_invoker = true)` e repetido de
-- proposito: o REPLACE substitui as opcoes da view pelas informadas, e sem
-- ele a view passaria a rodar com o papel do dono, contornando a RLS.
CREATE OR REPLACE VIEW public.minerador_keywords_listagem
WITH (security_invoker = true)
AS
SELECT
  k.id,
  k.keyword,
  k.location,
  k.results_allintitle,
  k.volume_search,
  k.kgr_score,
  k.intent,
  k.status,
  k.created_at,
  k.lista_id,
  ((((k.analise_semantica
    #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
    #- '{volume_measurement,monthlySearchVolumes}'::text[])
    #- '{dataforseo_keyword_overview_history}'::text[])
    #- '{allintitle_measurement_history}'::text[]) AS analise_semantica,
  k.volume_source,
  k.brand_id,
  k.deleted_at,
  k.purge_after,
  k.deleted_by,
  k.row_version
FROM public.minerador_keywords k;

COMMENT ON VIEW public.minerador_keywords_listagem IS
  'Mesma forma de linha de minerador_keywords, sem as séries de medição (209 kB/carregamento). O detalhe é hidratado ao expandir. security_invoker: a RLS continua sendo a da tabela. row_version (2026-09-23): marcador de mudança para a impressão digital do cache conferido.';

-- Idempotente: os grants ja existem e o REPLACE os preserva. Repetidos para
-- que a migration descreva sozinha o acesso que a view precisa.
GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;

-- 5. Pos-condicoes -------------------------------------------------------------
DO $pos$
DECLARE
  ultimo text;
  colunas_view text;
  opcoes text;
  ativo "char";
BEGIN
  SELECT max(t.tgname::text COLLATE "C")
  INTO ultimo
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.minerador_keywords'::regclass
    AND NOT t.tgisinternal;
  IF ultimo IS DISTINCT FROM 'zz_minerador_keywords_row_version' THEN
    RAISE EXCEPTION 'ROW_VERSION_POS: o gatilho de row_version nao e o ultimo na ordem de disparo (ultimo: %)', ultimo;
  END IF;

  SELECT t.tgenabled INTO ativo
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.minerador_keywords'::regclass
    AND t.tgname = 'zz_minerador_keywords_row_version';
  IF ativo IS DISTINCT FROM 'O'::"char" THEN
    RAISE EXCEPTION 'ROW_VERSION_POS: gatilho de row_version ausente ou desligado (%)', ativo;
  END IF;

  SELECT string_agg(c.column_name::text, ',' ORDER BY c.ordinal_position)
  INTO colunas_view
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'minerador_keywords_listagem';
  IF colunas_view IS DISTINCT FROM
    'id,keyword,location,results_allintitle,volume_search,kgr_score,intent,status,created_at,lista_id,analise_semantica,volume_source,brand_id,deleted_at,purge_after,deleted_by,row_version'
  THEN
    RAISE EXCEPTION 'ROW_VERSION_POS: colunas da view inesperadas: %', colunas_view;
  END IF;

  SELECT array_to_string(c.reloptions, ',')
  INTO opcoes
  FROM pg_class c
  WHERE c.oid = 'public.minerador_keywords_listagem'::regclass;
  IF opcoes IS DISTINCT FROM 'security_invoker=true' THEN
    RAISE EXCEPTION 'ROW_VERSION_POS: a view perdeu security_invoker: %', opcoes;
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.minerador_keywords_listagem', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.minerador_keywords_listagem', 'SELECT')
    OR has_table_privilege('anon', 'public.minerador_keywords_listagem', 'SELECT')
  THEN
    RAISE EXCEPTION 'ROW_VERSION_POS: grants da view divergem (authenticated e service_role leem; anon nao).';
  END IF;
END;
$pos$;

-- O PostgREST precisa ver a coluna nova da view e da tabela.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFICACAO DEPOIS DE APLICAR -- so agregados, sem payload, sem dado de
-- cliente. Rodar cada uma com `npx supabase db query --linked "<sql>"`.
--
-- 1) Coluna:
--    select count(*) as ok from information_schema.columns
--     where table_schema = 'public' and table_name = 'minerador_keywords'
--       and column_name = 'row_version' and data_type = 'bigint'
--       and is_nullable = 'NO' and column_default = '1';
--    -- esperado: 1
--
-- 2) Ordem dos gatilhos (o ultimo precisa ser o de row_version):
--    select string_agg(tgname::text, ' > ' order by tgname::text collate "C") as ordem,
--           max(tgname::text collate "C") as ultimo
--      from pg_trigger
--     where tgrelid = 'public.minerador_keywords'::regclass and not tgisinternal;
--    -- esperado: ultimo = zz_minerador_keywords_row_version
--
-- 3) View:
--    select count(*) as colunas,
--           max(ordinal_position) filter (where column_name = 'row_version') as posicao_row_version,
--           (select array_to_string(reloptions, ',') from pg_class
--             where oid = 'public.minerador_keywords_listagem'::regclass) as opcoes,
--           (select string_agg(grantee::text || ':' || privilege_type::text, ' ; ' order by grantee, privilege_type)
--              from information_schema.role_table_grants
--             where table_schema = 'public' and table_name = 'minerador_keywords_listagem') as grants
--      from information_schema.columns
--     where table_schema = 'public' and table_name = 'minerador_keywords_listagem';
--    -- esperado: 17, 17, security_invoker=true, authenticated:SELECT e service_role:SELECT
--
-- 4) Dados (todas nascem em 1):
--    select count(*) as linhas, min(row_version) as minimo, max(row_version) as maximo,
--           count(*) filter (where row_version is null) as nulas
--      from public.minerador_keywords;
--
-- 5) Tamanho da impressao digital por marca (bytes de fio, length(::text)):
--    select count(*) as marcas, min(b) as min_bytes, max(b) as max_bytes from (
--      select brand_id, sum(length(json_build_object('id', id, 'row_version', row_version)::text)) as b
--        from public.minerador_keywords_listagem where deleted_at is null group by brand_id) s;
--
-- 6) OPCIONAL, SO COM AUTORIZACAO EXPLICITA -- smoke sem residuo. Escreve
--    dentro de uma transacao que SEMPRE aborta: o RAISE EXCEPTION final
--    devolve os numeros e desfaz o UPDATE. `status = status` nao muda campo
--    estrutural nem `analise_semantica`, entao nenhum gatilho de protecao
--    recusa. Salvar em arquivo e rodar com `-f`:
--
--    DO $smoke$
--    DECLARE alvo uuid; antes bigint; depois bigint;
--    BEGIN
--      SELECT id, row_version INTO alvo, antes FROM public.minerador_keywords
--       WHERE deleted_at IS NULL ORDER BY id LIMIT 1;
--      UPDATE public.minerador_keywords SET status = status WHERE id = alvo;
--      SELECT row_version INTO depois FROM public.minerador_keywords WHERE id = alvo;
--      RAISE EXCEPTION 'SMOKE_ROW_VERSION antes=% depois=% (esperado depois = antes + 1; nada foi gravado)', antes, depois;
--    END;
--    $smoke$;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK -- manual, so depois que o cliente parar de ler row_version (o
-- cache conferido cai para a leitura remota quando a coluna some, mas a
-- impressao digital deixaria de existir). A view precisa de DROP + CREATE:
-- CREATE OR REPLACE nao remove coluna. Recria exatamente a forma anterior,
-- com comentario e grants de hoje.
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS zz_minerador_keywords_row_version ON public.minerador_keywords;
-- DROP FUNCTION IF EXISTS public.minerador_keywords_incrementa_row_version();
-- DROP VIEW IF EXISTS public.minerador_keywords_listagem;
-- CREATE VIEW public.minerador_keywords_listagem
-- WITH (security_invoker = true)
-- AS
-- SELECT
--   k.id, k.keyword, k.location, k.results_allintitle, k.volume_search,
--   k.kgr_score, k.intent, k.status, k.created_at, k.lista_id,
--   ((((k.analise_semantica
--     #- '{discovery_import,sourceSnapshot,metrics,monthlySearchVolumes}'::text[])
--     #- '{volume_measurement,monthlySearchVolumes}'::text[])
--     #- '{dataforseo_keyword_overview_history}'::text[])
--     #- '{allintitle_measurement_history}'::text[]) AS analise_semantica,
--   k.volume_source, k.brand_id, k.deleted_at, k.purge_after, k.deleted_by
-- FROM public.minerador_keywords k;
-- COMMENT ON VIEW public.minerador_keywords_listagem IS
--   'Mesma forma de linha de minerador_keywords, sem as séries de medição (209 kB/carregamento). O detalhe é hidratado ao expandir. security_invoker: a RLS continua sendo a da tabela.';
-- GRANT SELECT ON public.minerador_keywords_listagem TO authenticated, service_role;
-- ALTER TABLE public.minerador_keywords DROP COLUMN IF EXISTS row_version;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Depois: `npx supabase migration repair --status reverted 20260923140000 --linked`.
-- O rollback nao perde dado de negocio: row_version so conta escritas.
-- ---------------------------------------------------------------------------
