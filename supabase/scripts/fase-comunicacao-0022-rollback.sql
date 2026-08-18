-- Rollback manual da 0022. Nao executar neste gate.
-- Restaura o ACL anterior documentado para os quatro objetos, sem alterar
-- ALTER DEFAULT PRIVILEGES, RLS, dados, owners ou funcoes.

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.communication_templates,
  public.communication_messages,
  public.communication_delivery_events,
  public.agency_invitation_token_generations
FROM service_role;

GRANT ALL PRIVILEGES ON TABLE
  public.communication_templates,
  public.communication_messages,
  public.communication_delivery_events,
  public.agency_invitation_token_generations
TO service_role;

COMMIT;
