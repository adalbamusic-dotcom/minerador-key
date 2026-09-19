-- =============================================================================
-- M3 — ÂNCORA E LIFECYCLE DA MÍDIA DO REDATOR
-- =============================================================================
-- Data: 2026-09-18
-- Base: invariantes.md §69; sdd-remocao-planejador-e-retencao-48h-2026-09-18.md §4.5
--
-- NÃO APLICADA. Arquivo escrito para revisão.
--
-- ================== POR QUE ÂNCORA E RETENÇÃO VÊM JUNTAS ==================
--
-- A invariante diz: "substituição de mídia só conta quando o sucessor está
-- confirmado NO MESMO ANCHOR". Hoje `writer_media_assets` liga o ativo ao
-- documento e, opcionalmente, ao entregável — nunca ao bloco, cena ou slide.
-- Sem âncora não existe "mesmo vínculo" para o sucessor assumir, e a frase da
-- invariante não teria onde ser executada. Por isso as duas coisas estão no
-- mesmo arquivo: a âncora é PRÉ-REQUISITO da retenção, não um extra.
--
-- ================== O QUE ESTE ARQUIVO NÃO FAZ ==================
--
-- * Não configura cron. `pg_cron` e `pg_net` não existem neste projeto
--   (confirmado no preflight). A purga é disparada por rota server-side.
-- * Não apaga objeto do Storage por SQL. Apagar a linha de `writer_media_assets`
--   não remove o arquivo do bucket; quem remove é a API de Storage, no servidor.
--   Por isso a purga é CLAIM (lê o que apagar) + CONFIRM (apaga a linha depois
--   que o objeto se foi). Fazer só o DELETE da linha deixaria arquivo órfão no
--   bucket — sem dono e sem rastro.
-- * Não toca DNA, SERP, evidências, eventos MCP nem `editorial_artifact_versions`.
-- * Não altera o CHECK `writer_media_assets_file_state_check` existente.
--
-- ================== IMPACTO EM LINHAS ATUAIS ==================
--
-- writer_media_assets            0 linhas
-- storage.objects (writer-media) 0 objetos
--
-- Todas as colunas novas são nuláveis. Nenhuma linha entra em janela de purge
-- pela aplicação desta migration.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ÂNCORA ESTÁVEL
-- =============================================================================
-- `anchor_ref` é texto porque os alvos têm identificadores de formatos
-- diferentes: `blocks[].id` do ContentDocument, `scenes[].id` do roteiro e
-- `slides[].id` do carrossel — todos strings geradas na aplicação. A capa do
-- artigo é uma por documento e não tem entidade própria, então ancora no
-- próprio `document_id`; o índice único abaixo garante que continue sendo uma.
--
-- Os dois campos andam juntos ou não andam: âncora com tipo e sem referência
-- (ou o contrário) descreveria um vínculo que ninguém consegue resolver.
--
-- `article_break` (respiro) NÃO entra. Não existe bloco de respiro no
-- `ContentBlockSchema`, e `metadata.plannedImages` é lista de strings soltas —
-- não há identidade estável para ancorar. Uma convenção do tipo "depois do
-- bloco X" migraria o respiro de lugar, em silêncio, no dia em que X fosse
-- apagado. O papel `breath` continua existindo sem âncora e sem substituição
-- atômica até que exista identidade de verdade. Ver §2.8 da auditoria pré-M3.
-- -----------------------------------------------------------------------------
ALTER TABLE public.writer_media_assets
  ADD COLUMN anchor_kind text,
  ADD COLUMN anchor_ref text;

ALTER TABLE public.writer_media_assets
  ADD CONSTRAINT writer_media_assets_anchor_kind_check
  CHECK (anchor_kind IS NULL OR anchor_kind IN
         ('article_cover', 'article_block', 'script_scene', 'carousel_slide'));

-- -----------------------------------------------------------------------------
-- O CHECK de `role` nasceu com quatro valores — cover, breath, storyboard,
-- slide — e nenhum deles descreve uma imagem DENTRO de um bloco do artigo.
-- Sem isto, `anchor_kind = 'article_block'` seria inalcançável: não haveria
-- briefing possível para ancorar.
--
-- O valor é acrescentado, nunca removido: os quatro antigos continuam válidos,
-- então nenhuma linha existente passa a violar o CHECK.
-- -----------------------------------------------------------------------------
ALTER TABLE public.writer_media_assets
  DROP CONSTRAINT writer_media_assets_role_check;

ALTER TABLE public.writer_media_assets
  ADD CONSTRAINT writer_media_assets_role_check
  CHECK (role IN ('cover', 'breath', 'storyboard', 'slide', 'article_block'));

ALTER TABLE public.writer_media_assets
  ADD CONSTRAINT writer_media_assets_anchor_pair_check CHECK (
    (anchor_kind IS NULL AND anchor_ref IS NULL)
    OR (anchor_kind IS NOT NULL AND anchor_ref IS NOT NULL AND char_length(btrim(anchor_ref)) > 0)
  );

COMMENT ON COLUMN public.writer_media_assets.anchor_kind
  IS 'Onde a imagem vive: capa do artigo, bloco do artigo, cena do roteiro ou slide do carrossel. Respiro (article_break) nao entra: nao ha identidade estavel para ancorar.';
COMMENT ON COLUMN public.writer_media_assets.anchor_ref
  IS 'Id do bloco, da cena ou do slide; para a capa, o proprio document_id. Junto com anchor_kind forma o vinculo fino que a substituicao precisa preservar.';

-- =============================================================================
-- 2. SUBSTITUIÇÃO E RETENÇÃO
-- =============================================================================
-- `replaced_by_asset_id` é `ON DELETE RESTRICT`, e não `SET NULL`, por causa do
-- CHECK abaixo: uma linha em janela DECLARA por quem foi substituída, e anular
-- esse campo violaria a própria declaração. Com RESTRICT, o sucessor não pode
-- ser apagado enquanto o predecessor existir — e não precisa: o predecessor tem
-- `purge_after` mais antigo e sai primeiro.
-- -----------------------------------------------------------------------------
ALTER TABLE public.writer_media_assets
  ADD COLUMN replaced_by_asset_id uuid REFERENCES public.writer_media_assets(id) ON DELETE RESTRICT,
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN purge_after timestamptz;

ALTER TABLE public.writer_media_assets
  ADD CONSTRAINT writer_media_assets_retention_check CHECK (
    (superseded_at IS NULL AND purge_after IS NULL AND replaced_by_asset_id IS NULL)
    OR (superseded_at IS NOT NULL AND replaced_by_asset_id IS NOT NULL
        AND purge_after = superseded_at + interval '48 hours')
  );

ALTER TABLE public.writer_media_assets
  ADD CONSTRAINT writer_media_assets_no_self_replace_check
  CHECK (replaced_by_asset_id IS NULL OR replaced_by_asset_id <> id);

CREATE INDEX writer_media_assets_purge_idx
  ON public.writer_media_assets (purge_after)
  WHERE superseded_at IS NOT NULL;

-- =============================================================================
-- 3. QUAL ASSET É O ATUAL DE CADA ÂNCORA
-- =============================================================================
-- Índice único PARCIAL: no máximo um ativo COM ARQUIVO e não substituído por
-- âncora. É o que torna "o atual" uma garantia do banco, e não uma convenção.
--
-- `prompt_ready` fica de fora de propósito: briefing é rascunho de intenção, e
-- deve ser possível registrar duas alternativas para a mesma cena antes de
-- decidir qual vira imagem. Quem ocupa a âncora é o arquivo, não o prompt.
--
-- ESTE BLOCO PRECISA VIR DEPOIS DAS COLUNAS DE RETENÇÃO. Ele estava antes, e o
-- `WHERE superseded_at IS NULL` referenciava coluna que ainda não existia: a
-- aplicação abortou com 42703. A transação desfez tudo, mas o defeito só
-- aparece executando — revisão de texto não o encontra, porque cada bloco está
-- correto isoladamente e só a ORDEM entre eles está errada.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX writer_media_assets_current_anchor_uidx
  ON public.writer_media_assets (marca_id, document_id, anchor_kind, anchor_ref)
  WHERE anchor_kind IS NOT NULL
    AND superseded_at IS NULL
    AND status IN ('uploaded', 'reviewed');

COMMENT ON COLUMN public.writer_media_assets.purge_after
  IS 'Fim da janela de recuperação: superseded_at + 48h. Só existe com sucessor declarado. Idade sozinha nunca cria este valor.';

-- =============================================================================
-- 4. SUBSTITUIR — VÍNCULO PRIMEIRO, JANELA DEPOIS, NA MESMA TRANSAÇÃO
-- =============================================================================
-- A ordem é o ponto inteiro desta função:
--
--   1. valida marca, documento e que o sucessor TEM ARQUIVO CONFERIDO
--   2. TRANSFERE a âncora para o sucessor
--   3. confirma que o sucessor está ancorado
--   4. SÓ ENTÃO abre a janela do predecessor
--
-- Os passos 2 e 4 na mesma transação garantem que nunca existe instante em que
-- o bloco ficou sem imagem enquanto o antigo já contava o tempo.
--
-- "Substituição só após upload + hash + readback" é verificado pelo ESTADO do
-- sucessor: `status IN ('uploaded','reviewed')` com `storage_path` e `file_hash`
-- preenchidos só acontece depois de `uploadWriterMediaAsset` ter subido o
-- arquivo, baixado de volta e conferido o sha256. Esta função não confia na
-- palavra do chamador; ela confere o rastro que aquele caminho deixa.
--
-- Idempotente: repetir com o MESMO par devolve o estado sem mover a janela.
-- Par diferente para um ativo já substituído é RECUSADO, não sobrescrito.
-- -----------------------------------------------------------------------------
-- `p_actor_id` existe porque a substituição é um ato humano e `updated_by` é
-- NOT NULL: sem atualizá-lo, as duas linhas ficariam creditadas a quem criou o
-- briefing, e a troca não deixaria rastro de quem a fez. A autoria vem da
-- sessão validada no servidor, nunca do corpo da requisição.
CREATE FUNCTION public.writer_replace_media_asset(
  p_brand_id uuid,
  p_old_asset_id uuid,
  p_new_asset_id uuid,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_old public.writer_media_assets%ROWTYPE;
  v_new public.writer_media_assets%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_old_asset_id = p_new_asset_id THEN
    RAISE EXCEPTION 'media_self_replace' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_old FROM public.writer_media_assets
    WHERE id = p_old_asset_id AND marca_id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media_old_not_found' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_new FROM public.writer_media_assets
    WHERE id = p_new_asset_id AND marca_id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media_new_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_new.document_id IS DISTINCT FROM v_old.document_id THEN
    RAISE EXCEPTION 'media_document_mismatch' USING ERRCODE = 'P0001';
  END IF;

  -- Repetição do mesmo par: devolve o estado, sem tocar na janela.
  IF v_old.replaced_by_asset_id = p_new_asset_id THEN
    RETURN jsonb_build_object('oldAssetId', v_old.id, 'newAssetId', v_new.id,
      'supersededAt', v_old.superseded_at, 'purgeAfter', v_old.purge_after, 'unchanged', true);
  END IF;
  IF v_old.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'media_already_replaced_by_other' USING ERRCODE = 'P0001';
  END IF;

  -- UPLOAD + HASH + READBACK: o rastro que o caminho de upload deixa.
  IF v_new.status NOT IN ('uploaded', 'reviewed')
     OR v_new.storage_path IS NULL
     OR v_new.file_hash IS NULL THEN
    RAISE EXCEPTION 'media_successor_not_confirmed' USING ERRCODE = 'P0001';
  END IF;

  -- O sucessor não pode estar ele mesmo em janela de retenção: dar a âncora a
  -- quem já tem `purge_after` faria a posição apontar para algo agendado para
  -- sumir. O índice único parcial não pega este caso — ele exige
  -- `superseded_at IS NULL` para contar como atual, então a linha ficaria com
  -- âncora e sem ser a atual de ninguém.
  IF v_new.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'media_successor_already_superseded' USING ERRCODE = 'P0001';
  END IF;

  IF v_old.anchor_kind IS NULL THEN
    RAISE EXCEPTION 'media_old_without_anchor' USING ERRCODE = 'P0001';
  END IF;

  -- Âncora incompatível é recusada ANTES de qualquer escrita.
  IF v_new.anchor_kind IS NOT NULL
     AND (v_new.anchor_kind IS DISTINCT FROM v_old.anchor_kind
       OR v_new.anchor_ref IS DISTINCT FROM v_old.anchor_ref) THEN
    RAISE EXCEPTION 'media_anchor_divergent' USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================================
  -- 2. O PREDECESSOR SAI DO POSTO ANTES DE O SUCESSOR ENTRAR
  -- ===========================================================================
  -- Esta ordem é exigência do índice único parcial, não preferência de estilo.
  -- `writer_media_assets_current_anchor_uidx` cobre
  -- (marca_id, document_id, anchor_kind, anchor_ref) enquanto
  -- `superseded_at IS NULL` e o status tem arquivo. Se o sucessor recebesse a
  -- âncora primeiro, existiriam DUAS linhas com a mesma chave e sem
  -- `superseded_at` — e o índice, que não é deferrable, recusaria o UPDATE com
  -- 23505. A substituição falharia sempre, e só na primeira troca real.
  --
  -- Inverter não enfraquece nada: tudo aqui é uma transação. A ordem entre
  -- comandos não é observável de fora; o que é observável é o estado commitado,
  -- e nele o sucessor está ancorado. Se o passo 3 falhar, o ROLLBACK devolve o
  -- predecessor intacto e ele continua sendo o atual.
  --
  -- O predecessor MANTÉM `anchor_kind`/`anchor_ref`: é o registro de onde ele
  -- vivia, e é isso que torna a recuperação dentro das 48h possível. Ele deixa
  -- de ser o atual por causa de `superseded_at`, que o tira do índice — não por
  -- perder a referência.
  -- ---------------------------------------------------------------------------
  UPDATE public.writer_media_assets
     SET replaced_by_asset_id = v_new.id,
         superseded_at = v_now,
         purge_after = v_now + interval '48 hours',
         updated_by = p_actor_id, updated_at = v_now
   WHERE id = v_old.id RETURNING * INTO v_old;

  -- ===========================================================================
  -- 3. AGORA O SUCESSOR ASSUME A POSIÇÃO
  -- ===========================================================================
  IF v_new.anchor_kind IS NULL THEN
    UPDATE public.writer_media_assets
       SET anchor_kind = v_old.anchor_kind, anchor_ref = v_old.anchor_ref,
           updated_by = p_actor_id, updated_at = v_now
     WHERE id = v_new.id RETURNING * INTO v_new;
  END IF;

  -- 4. Sem sucessor ancorado não há substituição: aborta e desfaz o passo 2.
  IF v_new.anchor_kind IS NULL OR v_new.anchor_ref IS NULL
     OR v_new.anchor_kind IS DISTINCT FROM v_old.anchor_kind
     OR v_new.anchor_ref IS DISTINCT FROM v_old.anchor_ref THEN
    RAISE EXCEPTION 'media_successor_not_anchored' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('oldAssetId', v_old.id, 'newAssetId', v_new.id,
    'anchorKind', v_new.anchor_kind, 'anchorRef', v_new.anchor_ref,
    'supersededAt', v_old.superseded_at, 'purgeAfter', v_old.purge_after, 'unchanged', false);
END;
$$;

-- =============================================================================
-- 5. PURGA — CLAIM E CONFIRM, IDEMPOTENTES
-- =============================================================================
-- SQL não apaga arquivo de Storage. A rota server-side:
--   1. chama CLAIM e recebe (id, storage_path) do que está elegível;
--   2. remove cada objeto pela API de Storage — objeto ausente conta como
--      sucesso, porque a operação precisa ser repetível;
--   3. chama CONFIRM por ativo, que apaga a linha.
--
-- Se o processo morrer entre 2 e 3, sobra uma linha sem arquivo — recuperável,
-- e a próxima execução resolve. A ordem inversa deixaria arquivo órfão no
-- bucket, sem dono e sem rastro, que é o estado irrecuperável.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.lifecycle_claim_writer_media_purge(
  p_brand_id uuid,
  p_limit integer DEFAULT 50
) RETURNS TABLE (asset_id uuid, storage_path text, purge_after timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT a.id, a.storage_path, a.purge_after
    FROM public.writer_media_assets a
   WHERE a.marca_id = p_brand_id
     AND a.purge_after IS NOT NULL
     AND a.purge_after <= now()
   ORDER BY a.purge_after
   LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
$$;

CREATE FUNCTION public.lifecycle_confirm_writer_media_purge(
  p_brand_id uuid,
  p_asset_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.writer_media_assets%ROWTYPE;
  v_referenciado boolean;
BEGIN
  SELECT * INTO v_row FROM public.writer_media_assets
    WHERE id = p_asset_id AND marca_id = p_brand_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('assetId', p_asset_id, 'result', 'already_purged');
  END IF;

  IF v_row.purge_after IS NULL OR v_row.purge_after > now() THEN
    RETURN jsonb_build_object('assetId', p_asset_id, 'result', 'not_eligible',
      'purgeAfter', v_row.purge_after);
  END IF;

  -- Rede contra vínculo órfão: alguma cena ou slide ainda aponta para o ativo?
  SELECT EXISTS (
    SELECT 1 FROM public.writer_deliverables d
     WHERE d.marca_id = p_brand_id AND d.document_id = v_row.document_id
       AND (jsonb_path_exists(d.payload, '$.scenes[*].storyboard.assetId ? (@ == $alvo)',
              jsonb_build_object('alvo', p_asset_id::text))
         OR jsonb_path_exists(d.payload, '$.slides[*].visual.assetId ? (@ == $alvo)',
              jsonb_build_object('alvo', p_asset_id::text)))
  ) INTO v_referenciado;
  IF v_referenciado THEN
    RETURN jsonb_build_object('assetId', p_asset_id, 'result', 'referenced');
  END IF;

  DELETE FROM public.writer_media_assets WHERE id = p_asset_id AND marca_id = p_brand_id;
  RETURN jsonb_build_object('assetId', p_asset_id, 'result', 'purged',
    'storagePath', v_row.storage_path);
END;
$$;

-- =============================================================================
-- 6. GRANTS
-- =============================================================================
REVOKE ALL ON FUNCTION public.writer_replace_media_asset(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lifecycle_claim_writer_media_purge(uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lifecycle_confirm_writer_media_purge(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.writer_replace_media_asset(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_claim_writer_media_purge(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lifecycle_confirm_writer_media_purge(uuid,uuid) TO service_role;

-- RLS não é ampliada: `writer_media_assets` segue com política de SELECT para
-- `authenticated`, e escrita continua sendo por `service_role`.

COMMIT;

-- =============================================================================
-- READBACK PÓS-APLICAÇÃO
-- =============================================================================
-- 1) Colunas novas, todas nuláveis:
-- npx supabase db query --linked "
--   select column_name, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='writer_media_assets'
--      and column_name in ('anchor_kind','anchor_ref','replaced_by_asset_id','superseded_at','purge_after')
--    order by 1;
-- "   ESPERADO: 5 linhas, todas is_nullable=YES
--
-- 2) CHECKs pareados:
-- npx supabase db query --linked "
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname like 'writer_media_assets_%check' order by 1;
-- "   ESPERADO: anchor_kind_check, anchor_pair_check, file_state_check (INTACTA),
--              no_self_replace_check, retention_check
--
-- 3) Um atual por âncora:
-- npx supabase db query --linked "
--   select indexdef from pg_indexes
--    where schemaname='public' and indexname='writer_media_assets_current_anchor_uidx';
-- "   ESPERADO: UNIQUE ... WHERE anchor_kind IS NOT NULL AND superseded_at IS NULL
--              AND status = ANY (ARRAY['uploaded','reviewed'])
--
-- 4) Nada entrou em janela:
-- npx supabase db query --linked "
--   select count(*)::int as em_janela from public.writer_media_assets
--    where purge_after is not null;
-- "   ESPERADO: 0
--
-- 5) Bucket intocado:
-- npx supabase db query --linked "
--   select count(*)::int as objetos from storage.objects where bucket_id='writer-media';
-- "   ESPERADO: 0 (igual ao de antes)
-- =============================================================================

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Reversível sem perda enquanto nenhum ativo tiver sido purgado. Depois de uma
-- purga, o rollback devolve a ESTRUTURA — não devolve o arquivo removido do
-- bucket. Ordem de homologação: aplicar, conferir readback, e só então habilitar
-- a rota que chama CLAIM/CONFIRM.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.lifecycle_confirm_writer_media_purge(uuid,uuid);
-- DROP FUNCTION IF EXISTS public.lifecycle_claim_writer_media_purge(uuid,integer);
-- DROP FUNCTION IF EXISTS public.writer_replace_media_asset(uuid,uuid,uuid,uuid);
-- DROP INDEX IF EXISTS public.writer_media_assets_purge_idx;
-- DROP INDEX IF EXISTS public.writer_media_assets_current_anchor_uidx;
-- ALTER TABLE public.writer_media_assets
--   DROP CONSTRAINT writer_media_assets_no_self_replace_check,
--   DROP CONSTRAINT writer_media_assets_retention_check,
--   DROP CONSTRAINT writer_media_assets_anchor_pair_check,
--   DROP CONSTRAINT writer_media_assets_anchor_kind_check,
--   DROP COLUMN purge_after,
--   DROP COLUMN superseded_at,
--   DROP COLUMN replaced_by_asset_id,
--   DROP COLUMN anchor_ref,
--   DROP COLUMN anchor_kind;
-- COMMIT;
--
-- `writer_media_assets_file_state_check` não é tocada nem no rollback.
-- =============================================================================
