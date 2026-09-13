BEGIN;

-- =============================================================================
-- RADAR / VÍDEOS — GATE 2.3 — A BIBLIOTECA É DA MARCA
--
-- A DECISÃO: a fonte deliberada pertence à MARCA; o artigo apenas SELECIONA
-- quais fontes usar.
--
-- O exemplo que a motivou: um especialista deu 25 palestras e podcasts. Alguns
-- falam de tudo um pouco, outros aprofundam um assunto. Amarrar a fonte ao
-- artigo obrigaria a registrá-la — e transcrevê-la — uma vez por artigo.
--
--   ANTES   brand + article + url   →  a mesma palestra virava N fontes
--   AGORA   brand + url             →  uma fonte, N seleções
--
-- E a transcrição é propriedade da FONTE: um segundo artigo que selecione a
-- mesma palestra reusa o texto, não o refaz.
--
-- ADITIVA POR DESENHO. `20260911120000` está aplicada (VIDEOS_1 homologado em
-- runtime real) e `20260911180000` pode ou não estar. Nenhuma das duas é
-- editada aqui; esta roda depois e é correta sob os dois estados.
--
-- NADA DE HARD DELETE. Duplicatas herdadas do modelo antigo são reapontadas e
-- ARQUIVADAS, nunca apagadas: uma fonte pode sustentar evidência congelada, e
-- proveniência que some quebra histórico.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · O VÍNCULO ARTIGO ↔ FONTE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.radar_article_video_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.marcas(id) ON DELETE RESTRICT,
  article_id text NOT NULL CHECK (char_length(btrim(article_id)) BETWEEN 1 AND 256),
  video_source_id uuid NOT NULL,

  -- REMOVED é desassociação, não exclusão: a fonte segue na biblioteca e em
  -- outros artigos. Guardar o estado em vez de apagar a linha preserva a
  -- história de que o artigo usou aquela fonte um dia.
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),

  selected_by uuid,
  selected_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,

  CONSTRAINT fk_article_video_source_brand
    FOREIGN KEY (brand_id, video_source_id)
    REFERENCES public.radar_video_sources (brand_id, id)
    ON DELETE RESTRICT,

  -- Um vínculo por par: marcar duas vezes não cria duas seleções.
  CONSTRAINT uq_article_video_source UNIQUE (brand_id, article_id, video_source_id)
);

-- `ADD CONSTRAINT` não aceita IF NOT EXISTS. Sem o guarda, reexecutar a
-- migration para de dar erro justamente na linha que já tinha dado certo — e o
-- operador fica sem saber se o resto rodou. Mesmo padrão de `0005`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.radar_article_video_sources'::regclass
       AND conname = 'uq_radar_article_video_sources_brand_id'
  ) THEN
    ALTER TABLE public.radar_article_video_sources
      ADD CONSTRAINT uq_radar_article_video_sources_brand_id UNIQUE (brand_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_article_video_sources_article
  ON public.radar_article_video_sources (brand_id, article_id, status);
CREATE INDEX IF NOT EXISTS ix_article_video_sources_source
  ON public.radar_article_video_sources (brand_id, video_source_id, status);

-- ---------------------------------------------------------------------------
-- 2 · O QUE JÁ EXISTE VIRA SELEÇÃO
--
-- Cada fonte registrada sob o modelo antigo já declarava, pelo `article_id`,
-- que aquele artigo a usava. Essa informação é preservada como vínculo em vez
-- de ser descartada na mudança de modelo.
-- ---------------------------------------------------------------------------
INSERT INTO public.radar_article_video_sources (brand_id, article_id, video_source_id, selected_by, selected_at)
SELECT s.brand_id, s.article_id, s.id, s.registered_by, s.created_at
  FROM public.radar_video_sources AS s
 WHERE s.article_id IS NOT NULL
ON CONFLICT (brand_id, article_id, video_source_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3 · DUPLICATAS HERDADAS: REAPONTAR E ARQUIVAR
--
-- Sob o modelo antigo, a mesma URL em dois artigos da mesma marca produzia
-- DUAS linhas. A identidade nova (marca + url) não aceita isso.
--
-- A sobrevivente é a mais antiga — ela é quem carrega o histórico. Tudo que
-- pendurava nas outras (vínculos, textos, jobs) passa a apontar para ela, e as
-- perdedoras são ARQUIVADAS. Nada é apagado.
-- ---------------------------------------------------------------------------
-- `ON COMMIT DROP` já limpa no fim da transação; o DROP explícito cobre o
-- executor que roda os comandos fora de uma transação só.
DROP TABLE IF EXISTS radar_video_source_merge;

CREATE TEMP TABLE radar_video_source_merge ON COMMIT DROP AS
SELECT
  s.id AS loser_id,
  first_value(s.id) OVER (PARTITION BY s.brand_id, s.normalized_url_hash ORDER BY s.created_at ASC, s.id ASC) AS winner_id,
  s.brand_id
FROM public.radar_video_sources AS s
WHERE s.registration_status <> 'ARCHIVED';

DELETE FROM radar_video_source_merge WHERE loser_id = winner_id;

-- Os vínculos migram para a sobrevivente; um par que já exista é descartado.
UPDATE public.radar_article_video_sources AS a
   SET video_source_id = m.winner_id
  FROM radar_video_source_merge AS m
 WHERE a.video_source_id = m.loser_id
   AND a.brand_id = m.brand_id
   AND NOT EXISTS (
     SELECT 1 FROM public.radar_article_video_sources AS existente
      WHERE existente.brand_id = a.brand_id
        AND existente.article_id = a.article_id
        AND existente.video_source_id = m.winner_id
   );

-- O que sobrou apontando para a perdedora é vínculo REDUNDANTE: o mesmo artigo
-- já tem a sobrevivente. Ele sai da vista como REMOVED em vez de ser apagado —
-- a mesma regra que o resto do gate segue, e pelo mesmo motivo.
UPDATE public.radar_article_video_sources AS a
   SET status = 'REMOVED', removed_at = now()
  FROM radar_video_source_merge AS m
 WHERE a.video_source_id = m.loser_id
   AND a.brand_id = m.brand_id
   AND a.status <> 'REMOVED';

-- O texto e os jobs seguem a fonte sobrevivente — QUANDO EXISTEM.
--
-- `radar_video_source_texts` e `external_processing_jobs.video_source_id`
-- nascem em `20260911180000`. Referenciá-los sem guarda quebraria esta
-- migration em um banco onde aquela ainda não rodou, contradizendo a promessa
-- do cabeçalho de ser correta sob os dois estados. O guarda é de ESTRUTURA, não
-- de dado: onde a tabela existe, o reapontamento acontece igual.
DO $$
BEGIN
  IF to_regclass('public.radar_video_source_texts') IS NOT NULL THEN
    UPDATE public.radar_video_source_texts AS t
       SET video_source_id = m.winner_id
      FROM radar_video_source_merge AS m
     WHERE t.video_source_id = m.loser_id AND t.brand_id = m.brand_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'external_processing_jobs'
       AND column_name = 'video_source_id'
  ) THEN
    UPDATE public.external_processing_jobs AS j
       SET video_source_id = m.winner_id
      FROM radar_video_source_merge AS m
     WHERE j.video_source_id = m.loser_id AND j.brand_id = m.brand_id;
  END IF;
END $$;

UPDATE public.radar_video_sources AS s
   SET registration_status = 'ARCHIVED', updated_at = now()
  FROM radar_video_source_merge AS m
 WHERE s.id = m.loser_id;

-- ---------------------------------------------------------------------------
-- 4 · A IDENTIDADE PASSA A SER DA MARCA
--
-- O índice é PARCIAL: arquivadas ficam de fora, senão uma duplicata herdada
-- impediria o próprio índice de nascer — e, no futuro, arquivar e registrar de
-- novo a mesma URL seria recusado sem motivo.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_radar_video_source_identity;

CREATE UNIQUE INDEX IF NOT EXISTS uq_radar_video_source_brand_identity
  ON public.radar_video_sources (brand_id, normalized_url_hash)
  WHERE registration_status <> 'ARCHIVED';

-- `article_id` deixa de ser identidade. A coluna FICA, sem NOT NULL, como
-- registro de qual artigo originou o cadastro — proveniência, nunca autoridade.
ALTER TABLE public.radar_video_sources ALTER COLUMN article_id DROP NOT NULL;

COMMENT ON COLUMN public.radar_video_sources.article_id IS
  'DEPRECIADO como identidade: a fonte pertence a marca. Mantido apenas como proveniencia do cadastro original. A selecao por artigo vive em radar_article_video_sources.';

CREATE INDEX IF NOT EXISTS ix_radar_video_sources_library
  ON public.radar_video_sources (brand_id, registration_status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5 · SEGURANÇA — o mesmo padrão das demais tabelas editoriais.
-- ---------------------------------------------------------------------------
ALTER TABLE public.radar_article_video_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.radar_article_video_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.radar_article_video_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.radar_article_video_sources TO service_role;

DROP POLICY IF EXISTS radar_article_video_sources_select ON public.radar_article_video_sources;
CREATE POLICY radar_article_video_sources_select
  ON public.radar_article_video_sources FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

COMMENT ON TABLE public.radar_article_video_sources IS
  'Declara que um Article utiliza uma fonte da biblioteca de video da marca. A fonte e o transcript dela sao da MARCA e reutilizaveis; esta tabela e o uso especifico de cada artigo.';

COMMIT;
