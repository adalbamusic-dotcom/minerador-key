-- ---------------------------------------------------------------------------
-- Publicada pode ser aprovada: status deixa de ser campo estrutural.
--
-- O DEFEITO, ENCONTRADO EM TESTE DE FLUXO
--
-- Com a keyword publicada `skincare facial`, a Logica rodou, o Volume rodou,
-- a SERP consolidou e a revisao humana concluiu. Na hora de mudar o status
-- para `aprovado`, a tela respondeu "Falha ao salvar status" -- e o console
-- mostrava um objeto vazio, sem causa.
--
-- A causa: `protect_published_keyword` trata `status` como campo estrutural
-- e recusa qualquer mudanca dele numa publicada:
--
--   status sozinho, publicada ......... PUBLICADO_PROTEGIDO
--   status + semantica, publicada ..... PUBLICADO_PROTEGIDO
--   so semantica, publicada ........... OK   <- por isso os processos passaram
--   status, NAO publicada ............. OK
--
-- POR QUE ERA ASSIM, E POR QUE NAO PODE MAIS SER
--
-- O gatilho e de quando 'publicado' era VALOR da coluna `status`. Congelar a
-- coluna protegia o marcador de publicacao. Com os tres eixos (spec 66 e 67),
-- publicacao saiu do status e virou marcador proprio em `site_origin`:
-- congelar `status` deixou de proteger o que quer que seja e passou a
-- bloquear o eixo editorial inteiro numa pagina no ar.
--
-- O que permanece: a despromocao de uma linha LEGADA, cujo status ainda seja
-- 'publicado'/'published' -- sair dele apagaria o unico sinal que ela tem.
-- Nenhuma linha assim existe hoje (80 bruto, 29 aprovado), mas a guarda cobre
-- importacao antiga e nao custa nada.
--
-- LIMPEZA DE CODIGO MORTO, DE CARONA
--
-- As comparacoes de `slug` e `canonical` referiam COLUNAS que
-- `minerador_keywords` nao tem: `old_json ? 'slug'` e sempre falso, e os dois
-- ramos nunca executaram. Induziam a leitura de que o endereco estava
-- protegido aqui -- e nao estava. Quem protege o endereco de verdade e
-- `minerador_keywords_trava_identidade_publicada` (20260921050000), dentro do
-- `analise_semantica`, onde slug e canonico realmente moram.
--
-- Estava no backlog "limpar quando houver outra razao para tocar na funcao".
-- Esta e a razao.
--
-- O QUE CONTINUA PROTEGIDO
--
-- `keyword`, `lista_id` e `location` seguem congelados numa publicada, como
-- antes. A exclusao segue exigindo o fluxo declarado (20260921100000), e o
-- endereco segue congelado (20260921050000).
--
-- O corpo abaixo e a definicao VIVA lida do banco, alterada so nesse ponto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_published_keyword()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  structural_changed boolean := false;
  old_json jsonb;
  new_json jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('lifecycle.keyword_operation', true) = 'purge'
      AND OLD.deleted_at IS NOT NULL
      AND OLD.purge_after IS NOT NULL
      AND OLD.purge_after <= current_timestamp THEN
      RETURN OLD;
    END IF;
    IF public.lifecycle_keyword_is_published(OLD.brand_id, OLD.id) THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NOT NULL
      AND current_setting('lifecycle.keyword_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_RECOVERABLE_DELETE_FAILED';
    END IF;

    IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.purge_after IS DISTINCT FROM OLD.purge_after
      OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by)
      AND current_setting('lifecycle.keyword_operation', true) IS DISTINCT FROM 'internal' THEN
      RAISE EXCEPTION 'KEYWORD_DELETE_TRANSACTION_FAILED';
    END IF;

    IF public.lifecycle_keyword_is_published(OLD.brand_id, OLD.id) THEN
      old_json := to_jsonb(OLD);
      new_json := to_jsonb(NEW);
      -- STATUS NAO E MAIS ESTRUTURAL.
      --
      -- Congelar o status vinha de quando 'publicado' era VALOR de status:
      -- travar a coluna protegia o marcador. Com os tres eixos, publicacao
      -- saiu do status e virou marcador proprio em `site_origin`, e congelar
      -- a coluna passou a bloquear o eixo editorial -- uma pagina no ar nunca
      -- podia ser aprovada.
      --
      -- O que resta proteger e a DESPROMOCAO de uma linha legada: se o status
      -- ainda for 'publicado'/'published', sair dele apagaria o unico sinal de
      -- publicacao que aquela linha tem. Hoje nao existe nenhuma assim (80
      -- bruto, 29 aprovado), mas a guarda custa nada e cobre importacao antiga.
      IF (lower(coalesce(OLD.status, '')) IN ('publicado', 'published')
            AND lower(coalesce(NEW.status, '')) NOT IN ('publicado', 'published'))
        OR NEW.keyword IS DISTINCT FROM OLD.keyword
        OR NEW.lista_id IS DISTINCT FROM OLD.lista_id
        OR (old_json ? 'location' AND new_json->>'location' IS DISTINCT FROM old_json->>'location') THEN
        structural_changed := true;
      END IF;
      IF structural_changed THEN
        RAISE EXCEPTION 'PUBLICADO_PROTEGIDO: campos estruturais de keywords publicadas nao podem ser alterados.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;
