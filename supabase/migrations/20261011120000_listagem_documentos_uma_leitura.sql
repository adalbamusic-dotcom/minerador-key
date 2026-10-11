-- 2026-10-11 · A LISTAGEM DOS DOCUMENTOS DO REDATOR LÊ CADA PAYLOAD UMA VEZ.
--
-- Medido em produção (marca adalbapro, 2 documentos, 8,43 MB de payload, quase tudo
-- em importedContext.dossier.bundle): a listagem pedia ~40 caminhos JSON por
-- linha (`apelido:payload->campo`), e cada caminho descomprime o payload inteiro
-- de novo. 11,7 s no banco, acima do statement_timeout de 8 s do authenticator:
-- a seção "documents" da mesa caía, e o CPU ocupado derrubava junto a seção
-- "workflow" (a planilha do Radar ficava na cópia local do navegador).
--
-- Esta função lê o payload numa variável (uma descompressão), tira só o bundle do
-- dossiê e marca `bundleOmitted`, como a listagem já fazia no TypeScript. Medido
-- com o mesmo corpo: 186 ms e 6 KB de saída para os 2 documentos.
--
-- Só leitura; SECURITY INVOKER; execução só para service_role (o repositório
-- server-side). Rollback: DROP FUNCTION public.editorial_content_documents_listing(uuid);
-- o código volta sozinho ao select antigo quando a função não existe.

BEGIN;

CREATE OR REPLACE FUNCTION public.editorial_content_documents_listing(p_marca_id uuid)
RETURNS TABLE (id text, content_hash text, lock_version integer, updated_at timestamptz, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  linha record;
  v jsonb;
  contexto jsonb;
  dossie jsonb;
BEGIN
  FOR linha IN
    SELECT d.id, d.content_hash, d.lock_version, d.updated_at, d.payload
    FROM public.content_documents d
    WHERE d.marca_id = p_marca_id
    ORDER BY d.updated_at DESC
  LOOP
    v := linha.payload;
    contexto := v -> 'importedContext';
    IF jsonb_typeof(contexto) = 'object' THEN
      dossie := contexto -> 'dossier';
      IF jsonb_typeof(dossie) = 'object' THEN
        contexto := jsonb_set(contexto, '{dossier}', (dossie - 'bundle') || '{"bundleOmitted": true}'::jsonb);
      END IF;
      v := jsonb_set(v, '{importedContext}', contexto);
    END IF;
    id := linha.id;
    content_hash := linha.content_hash;
    lock_version := linha.lock_version;
    updated_at := linha.updated_at;
    payload := v;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.editorial_content_documents_listing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.editorial_content_documents_listing(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.editorial_content_documents_listing(uuid) TO service_role;

COMMIT;
