-- FASE 2D / 0016. MANUAL, COM ESCRITA. NAO EXECUTAR SEM NOVO SNAPSHOT E REVISAO.
-- Reverte a transicao do papel de agencia. As colunas textuais originais nao
-- sao removidas pela 0016; a reversao do aplicativo usa o snapshot aprovado.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.tenant_0016_agency_role_rollback') IS NULL THEN
    RAISE EXCEPTION 'PHASE_2D_0016_ROLLBACK_BLOCKED: snapshot de papel ausente';
  END IF;
END $$;

UPDATE public.agency_memberships membership
SET role = snapshot.legacy_role
FROM public.tenant_0016_agency_role_rollback snapshot
WHERE snapshot.membership_id = membership.id;

ALTER TABLE public.agency_memberships DROP CONSTRAINT IF EXISTS ck_agency_memberships_role_0016;

COMMIT;

-- A reversao integral das policies/funcoes requer restaurar o snapshot
-- schema-only aprovado antes da 0016. Nao recrie autorizacao por chave
-- textual por um script parcial.
