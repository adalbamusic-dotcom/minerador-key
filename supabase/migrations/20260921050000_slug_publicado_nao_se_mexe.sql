-- ---------------------------------------------------------------------------
-- O endereco da pagina publicada nao se mexe.
--
-- O QUE JA EXISTIA E O QUE NAO PEGAVA
--
-- `protect_published_keyword` ja recusa, na keyword publicada, mudanca de
-- `status`, `keyword`, `lista_id` e `location`. Ela TENTA proteger tambem
-- slug e canonical:
--
--   OR (old_json ? 'slug' AND new_json->>'slug' IS DISTINCT FROM ...)
--   OR (old_json ? 'canonical' AND ...)
--
-- So que `minerador_keywords` nao tem coluna `slug` nem `canonical`. Os dois
-- ramos sao codigo morto: a guarda `old_json ? 'slug'` e sempre falsa. O slug
-- e o canonico moram dentro de `analise_semantica`, que aquele gatilho nao
-- olha. Na pratica, o endereco da publicada estava desprotegido no banco.
--
-- POR QUE CONGELAR E REGISTRAR, EM VEZ DE RECUSAR
--
-- Quem escreve `analise_semantica` e o Minerador, as rotas de medicao e o
-- import de site da Marca. O import e o caso que decide o desenho: se a
-- pagina publicada mudar de endereco no site, uma RECUSA derrubaria o import
-- inteiro e o sistema nunca aprenderia o endereco novo.
--
-- Entao o declarado permanece, a tentativa e REGISTRADA, e o humano decide.
-- E o mesmo espirito do `urlSituation = 'canonical_conflict'` que o codigo ja
-- usa: divergencia entre o declarado e o lido e sinal, nao acidente.
--
-- Difere de proposito do gatilho de series (20260921030000), que restaura o
-- que um UPDATE OMITE. Aqui o caso e outro: nao e omissao, e sobrescrita
-- ativa -- por isso fica registro, e nao so a restauracao silenciosa.
--
-- QUAL PUBLICACAO CONTA
--
-- `minerador_keyword_is_published(status, semantic)`, que le o `site_origin`
-- pelo leitor tolerante (objeto e string JSON). Nao se usa aqui o
-- `lifecycle_keyword_is_published`, que cruza publication_records e artefatos
-- editoriais: sao varios joins por LINHA ATUALIZADA, e o que se protege aqui
-- e justamente o endereco declarado no `site_origin`. Sem declaracao de site
-- nao ha endereco a congelar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.minerador_keywords_trava_identidade_publicada()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  caminho text[];
  antes jsonb;
  depois jsonb;
  resultado jsonb := NEW.analise_semantica;
  bloqueios jsonb := '[]'::jsonb;
  historico jsonb;
  excedente integer;
  agora text := to_char(current_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF resultado IS NULL OR OLD.analise_semantica IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.minerador_keyword_is_published(OLD.status, OLD.analise_semantica) THEN
    RETURN NEW;
  END IF;

  -- A identidade: o slug e as tres fontes de endereco que `actualUrl` le, em
  -- ordem de precedencia. Congelar so o `canonicalUrl` nao bastaria -- a URL
  -- que a tela mostra sai de `declaredCanonicalUrl || resolvedUrl ||
  -- sourceUrl`, entao mexer numa dessas moveria o endereco exibido com o
  -- canonico intacto.
  FOR caminho IN SELECT p FROM (VALUES
    (ARRAY['slug_sugerido']),
    (ARRAY['site_origin','canonicalUrl']),
    (ARRAY['site_origin','declaredCanonicalUrl']),
    (ARRAY['site_origin','resolvedUrl']),
    (ARRAY['site_origin','sourceUrl'])
  ) AS t(p)
  LOOP
    antes := OLD.analise_semantica #> caminho;
    depois := resultado #> caminho;

    CONTINUE WHEN antes IS NULL;
    CONTINUE WHEN depois IS NOT DISTINCT FROM antes;

    -- Se o bloco pai inteiro sumiu, restaurar a folha inventaria estrutura
    -- que o escritor nao mandou. Deixa passar; o pai e outra conversa.
    CONTINUE WHEN array_length(caminho, 1) > 1
      AND resultado #> caminho[1:array_length(caminho, 1) - 1] IS NULL;

    resultado := jsonb_set(resultado, caminho, antes, true);
    bloqueios := bloqueios || jsonb_build_object(
      'field', array_to_string(caminho, '.'),
      'previous', antes,
      'attempted', coalesce(depois, 'null'::jsonb),
      'blockedAt', agora
    );
  END LOOP;

  IF jsonb_array_length(bloqueios) = 0 THEN
    RETURN NEW;
  END IF;

  historico := CASE
    WHEN jsonb_typeof(resultado -> 'publication_identity_lock_history') = 'array'
      THEN resultado -> 'publication_identity_lock_history'
    ELSE '[]'::jsonb
  END || bloqueios;

  -- Teto: o historico e sinal para o humano, nao arquivo. Sem limite, uma
  -- rotina que insista na sobrescrita engorda a linha a cada passada -- e a
  -- linha inteira viaja na listagem.
  excedente := jsonb_array_length(historico) - 50;
  IF excedente > 0 THEN
    SELECT coalesce(jsonb_agg(elemento ORDER BY ordem), '[]'::jsonb)
    INTO historico
    FROM jsonb_array_elements(historico) WITH ORDINALITY AS entrada(elemento, ordem)
    WHERE ordem > excedente;
  END IF;

  resultado := jsonb_set(resultado, ARRAY['publication_identity_lock_history'], historico, true);
  NEW.analise_semantica := resultado;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.minerador_keywords_trava_identidade_publicada() IS
  'Congela slug e endereco da keyword publicada e registra a tentativa de sobrescrita em publication_identity_lock_history.';

DROP TRIGGER IF EXISTS minerador_keywords_trava_identidade_publicada ON public.minerador_keywords;
CREATE TRIGGER minerador_keywords_trava_identidade_publicada
  BEFORE UPDATE ON public.minerador_keywords
  FOR EACH ROW
  WHEN (OLD.analise_semantica IS DISTINCT FROM NEW.analise_semantica)
  EXECUTE FUNCTION public.minerador_keywords_trava_identidade_publicada();
