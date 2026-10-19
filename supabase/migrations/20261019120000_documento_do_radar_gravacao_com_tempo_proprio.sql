-- 2026-10-19 · A GRAVAÇÃO DO DOCUMENTO DO RADAR TEM TEMPO PRÓPRIO.
--
-- PROPOSTA — NÃO APLICADA. O dono aplica (`npx supabase db query --linked -f`
-- deste arquivo + `migration repair`; nunca `db push`).
--
-- Defeito (WifiConecta, "Enviar ao Redator (1)", artigos 90326a17, 978165e0 e
-- de3573ab): POST /api/editorial/radar-writer-handoff → 500 com 57014. A
-- instrução que passa do limite é o INSERT do documento em
-- `public.content_documents` (`ContentDocumentRepository.create`). Medido no
-- banco (pg_stat_statements, 2026-10-18): os 4 INSERTs que passaram levaram
-- 5,2 s em média e 7,5 s no máximo, para documentos de 5,3 a 8,4 MB de JSON
-- (~0,9 s por MB: conversão do corpo do PostgREST em jsonb, TOAST e WAL). Os
-- três que falham montam 10 a 11 MB (quase tudo `importedContext.dossier.bundle.
-- observed`, que entra no hash do pacote e não pode ser podado) e passam dos
-- 8 s do `statement_timeout` do papel `authenticator` em toda tentativa. As
-- leituras do envio já estão estreitas (conserto anterior) e a escrita já volta
-- sem corpo (return=minimal): não há mais o que tirar do TypeScript sem mudar o
-- contrato do ContentDocument.
--
-- Esta função faz A MESMA escrita da rota (insert com ON CONFLICT (marca_id,
-- article_id) DO NOTHING: a idempotência de sempre, nada sobrescrito) e devolve
-- só o recibo estreito. O que muda é o tempo: `SET statement_timeout = '60s'`
-- na função. O PostgREST (v12+) "iça" esse ajuste para a transação da chamada
-- (`db-hoisted-tx-settings`, padrão inclui statement_timeout), então o limite
-- vale para a própria chamada RPC — e SÓ para ela. O papel continua com 8 s
-- para todo o resto.
--
-- Segurança: SECURITY INVOKER; execução só para service_role (o repositório
-- server-side, `getOperationalClient`). Nenhuma permissão nova a anon ou
-- authenticated. Sem mudança de tabela, coluna, índice, trigger ou RLS.
--
-- Compatibilidade: o código (`ContentDocumentRepository.create`) chama a função
-- e, enquanto ela não existir (PGRST202/42883), volta sozinho ao upsert antigo.
--
-- Rollback: DROP FUNCTION public.editorial_content_document_create_from_radar(text, uuid, text, text, text, text, text, jsonb, text, uuid);
-- o código volta sozinho ao upsert antigo.

BEGIN;

CREATE OR REPLACE FUNCTION public.editorial_content_document_create_from_radar(
  p_id text,
  p_marca_id uuid,
  p_article_id text,
  p_article_dna_version_id text,
  p_status text,
  p_title text,
  p_slug text,
  p_payload jsonb,
  p_content_hash text,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
SET statement_timeout = '60s'
AS $$
DECLARE
  criado boolean;
  recibo jsonb;
BEGIN
  INSERT INTO public.content_documents
    (id, marca_id, article_id, article_dna_version_id, status, title, slug, payload, content_hash, created_by, updated_by)
  VALUES
    (p_id, p_marca_id, p_article_id, p_article_dna_version_id, p_status, p_title, p_slug, p_payload, p_content_hash, p_actor_id, p_actor_id)
  ON CONFLICT (marca_id, article_id) DO NOTHING;
  criado := FOUND;

  SELECT jsonb_build_object(
    'id', d.id,
    'marca_id', d.marca_id,
    'article_id', d.article_id,
    'status', d.status,
    'content_hash', d.content_hash,
    'lock_version', d.lock_version,
    'updated_at', d.updated_at,
    'created', criado
  )
  INTO recibo
  FROM public.content_documents d
  WHERE d.marca_id = p_marca_id AND d.article_id = p_article_id;

  RETURN recibo;
END;
$$;

REVOKE ALL ON FUNCTION public.editorial_content_document_create_from_radar(text, uuid, text, text, text, text, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editorial_content_document_create_from_radar(text, uuid, text, text, text, text, text, jsonb, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editorial_content_document_create_from_radar(text, uuid, text, text, text, text, text, jsonb, text, uuid) TO service_role;

-- O PostgREST precisa enxergar a função (e o ajuste de tempo dela) sem esperar.
NOTIFY pgrst, 'reload schema';

COMMIT;
