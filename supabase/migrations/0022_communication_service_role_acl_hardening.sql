-- 0022: normaliza somente os ACLs dos quatro objetos criados pela 0020.
-- Nao altera ALTER DEFAULT PRIVILEGES, RLS, dados, owners ou funcoes.
-- Aplicacao manual somente apos snapshot, adendo aprovado e preflight PASS.

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.communication_templates,
  public.communication_messages,
  public.communication_delivery_events,
  public.agency_invitation_token_generations
FROM service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.communication_templates, public.communication_messages
  TO service_role;

GRANT SELECT, INSERT
  ON TABLE public.communication_delivery_events
  TO service_role;

GRANT SELECT
  ON TABLE public.agency_invitation_token_generations
  TO service_role;

COMMIT;
