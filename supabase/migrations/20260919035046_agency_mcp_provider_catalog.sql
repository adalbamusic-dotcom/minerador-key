-- Catálogo de clientes MCP para a integração do Redator na Agência.
-- Não armazena tokens ou credenciais: as conexões usam apenas metadados
-- sanitizados e delegações bearer com hash em writer_mcp_delegations.
BEGIN;

INSERT INTO public.integration_providers (provider_key, display_name, status)
VALUES
  ('chatgpt', 'ChatGPT', 'active'),
  ('claude', 'Claude', 'active'),
  ('gemini', 'Gemini', 'active'),
  ('custom_mcp', 'Outro cliente MCP', 'active')
ON CONFLICT (provider_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    status = 'active',
    updated_at = now();

COMMIT;
