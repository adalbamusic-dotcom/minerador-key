# Pré-voo de produção — MCP do Redator na Vercel — 2026-09-19

## Resultado deste corte

O código está pronto para um deploy de validação do transporte MCP em HTTPS.
O endpoint é `/api/mcp/redator` e o diagnóstico público é
`/api/mcp/redator/health`.

O smoke test remoto usa a delegação bearer emitida pela Integração da Agência.
Esse modo é deliberadamente explícito e temporário. Ele prova a conexão, os
escopos, a autorização por Marca, o lock/readback e a auditoria; ele não é o
OAuth de produção para um cliente ChatGPT/Claude/Gemini.

Estado objetivo:

```ini
MCP_TRANSPORT = STREAMABLE_HTTP
MCP_DEPLOY_TARGET = VERCEL_HTTPS
MCP_REMOTE_BEARER_SMOKE = CONFIGURÁVEL_EXPLICITAMENTE
MCP_OAUTH_REMOTE = AINDA_NÃO_HOMOLOGADO
MCP_MIGRATION_NOVA = NÃO
MCP_DEPLOY_EXECUTADO_PELO_AGENTE = NÃO
```

## Variáveis da Vercel

Configure-as no projeto Vercel, nos ambientes em que o teste será executado.
Os valores de Supabase existentes continuam sendo os do projeto vinculado;
nunca copie uma chave de service role para o navegador ou para um prompt.

```ini
NEXT_PUBLIC_APP_URL=https://SEU-PROJETO.vercel.app
MCP_PUBLIC_BASE_URL=https://SEU-PROJETO.vercel.app
MCP_ALLOWED_HOSTS=SEU-PROJETO.vercel.app
MCP_ALLOW_REMOTE_BEARER=true
```

`MCP_ALLOW_REMOTE_BEARER=true` só deve ficar ativo durante o smoke test
privado. A URL precisa ser HTTPS. Depois da prova, revogue a delegação na
Agência e volte a variável para `false` até o OAuth remoto estar homologado.

O código adiciona automaticamente o host de `MCP_PUBLIC_BASE_URL` à allowlist;
manter `MCP_ALLOWED_HOSTS` explícito reduz erro de configuração e documenta o
domínio aceito.

## Ordem de execução manual

1. Rode localmente `pnpm run test:mcp:runtime`, `pnpm run test:redator:mcp`,
   `npx tsc --noEmit` e `pnpm run build`.
2. Publique o projeto pela Vercel usando o fluxo normal do repositório.
3. Abra `https://SEU-PROJETO.vercel.app/api/mcp/redator/health`.
4. O resultado esperado antes da conexão é HTTP `200` e um JSON com
   `ok: true`, `transport: "streamable_http"`, `https: true` e o endpoint
   `/api/mcp/redator`.
5. Na página de Integrações da Agência, registre o provider correspondente,
   escolha somente `writer.read` para o primeiro teste e emita uma delegação
   para a Marca. O token completo é mostrado uma vez; não o salve em arquivo,
   captura de tela ou chat.
6. Use um cliente MCP compatível para chamar `initialize`, `tools/list`,
   `get_writer_connection_profile`, `list_writer_documents` e
   `get_writer_brief` com `Authorization: Bearer <token>`.
7. Confirme na mesma página da Agência os eventos de auditoria e, depois,
   revogue a delegação. Uma chamada posterior deve receber
   `401 delegation_invalid`.
8. Para testar escrita, emita outra delegação com `writer.draft.write`, use um
   documento de teste e forneça o `expectedLockVersion`. O servidor só confirma
   depois do write/readback; não há ferramenta MCP de aprovação, publicação ou
   exclusão.

No PowerShell, a checagem inicial pode ser feita assim:

```powershell
Invoke-RestMethod `
  -Uri "https://SEU-PROJETO.vercel.app/api/mcp/redator/health" `
  -Method Get
```

## Diagnósticos esperados

- `mcp_public_endpoint_not_configured`: falta `MCP_PUBLIC_BASE_URL` ou
  `NEXT_PUBLIC_APP_URL`.
- `mcp_https_required`: a URL pública não usa HTTPS.
- `mcp_remote_bearer_disabled`: o smoke test remoto não foi habilitado de
  forma explícita.
- `host_not_allowed`: o domínio acessado não está na allowlist.
- `delegation_invalid`: token revogado ou expirado.

Nenhum desses estados significa que o Redator perdeu documentos. São falhas
de transporte ou autorização, separadas do conteúdo editorial.

## O que ainda não é conexão ChatGPT

O endpoint bearer prova o servidor e a governança da aplicação, mas não
substitui o fluxo OAuth 2.1 + PKCE exigido por clientes remotos. Para habilitar
essa etapa, é necessário ativar o OAuth Server do projeto Supabase, publicar
consentimento e metadados do recurso protegido, associar o usuário OAuth à
Agência/Marca e implementar a validação de audience e escopos no endpoint. Isso
é um corte de autenticação separado; não se deve declarar ChatGPT conectado
apenas porque o smoke test bearer passou.

## Rollback operacional

Sem mudança de schema. Para interromper o teste remoto, revogue a delegação na
Agência e remova ou defina `MCP_ALLOW_REMOTE_BEARER=false` na Vercel. O endpoint
local continua disponível para desenvolvimento.

