# Auditoria — MCP do Redator na Agência — 2026-09-19

## Resultado

O primeiro corte moveu a administração do MCP para a página de Integrações da
Agência. Não foi criado um servidor diferente para cada fornecedor: ChatGPT,
Claude, Gemini e clientes compatíveis apontam para o mesmo endpoint do Redator
e recebem uma delegação por Marca com escopo explícito.

## Implementado

- `readAgencyIntegrationWorkspace` lê providers MCP, conexões da Agência e
  delegações do Redator sem retornar segredos.
- `registerAgencyMcpClient` grava apenas metadados sanitizados em
  `integration_connections` (`kind`, endpoint, transporte, modo de autenticação,
  escopos e nome do cliente).
- `create_writer_mcp_delegation` chama a autoridade já existente de emissão,
  mas somente depois de confirmar a Agência, a Marca e o papel administrativo.
- `revoke_writer_mcp_delegation` permite revogação administrativa no escopo da
  Agência e da Marca.
- A UI mostra o endpoint, estado pendente, escopos, validade, prefixo e
  revogação. O bearer completo fica somente no retorno da criação.

## Limites

- A migration de catálogo
  `20260919035046_agency_mcp_provider_catalog.sql` ainda não foi aplicada ao
  Supabase remoto.
- O discovery OAuth do projeto continua desabilitado; portanto a conexão de
  ChatGPT/Claude/Gemini por OAuth remoto não está homologada.
- `pending` é o estado correto até que o cliente externo seja conectado por
  HTTPS e a autorização remota esteja disponível.
- A homologação funcional de escrita no Redator é manual e separada deste
  corte.

## Evidência

- TypeScript: passou.
- ESLint nos três arquivos alterados: passou.
- `pnpm run build`: passou.
- `pnpm run test:redator`: 204/204.
- `pnpm run test:redator:mcp`: 2/2.
- O banco remoto foi consultado somente em leitura; o catálogo atual ainda
  não contém os providers `chatgpt`, `claude`, `gemini` ou `custom_mcp`.

## Próxima ação autorizável

Aplicar a migration no projeto Supabase correto, reler o catálogo, registrar um
cliente na página da Agência e validar o endpoint em HTTPS com um cliente MCP.
Essa operação remota não foi executada por esta alteração.

## Atualização após a aplicação do catálogo — 2026-09-19

O responsável aplicou a migration no projeto Supabase vinculado ao repositório
e confirmou, por consulta somente leitura, os quatro providers ativos:
`chatgpt`, `claude`, `gemini` e `custom_mcp`. A migration não cria segredo,
token ou conexão; ela apenas torna o catálogo elegível para o cadastro na
Agência.

O corte seguinte fechou a fronteira de autoridade: `POST` e `DELETE` da rota
legada `/api/redator/mcp-delegations` agora respondem `410
MCP_DELEGATION_AGENCY_ONLY`. O `GET` permanece somente para compatibilidade de
leitura. Emissão e revogação acontecem exclusivamente em
`/api/agencies/{agencyRef}/integrations`, com verificação de administrador,
Agência e Marca.

Também foram adicionados revogação explícita do cliente MCP e uma leitura dos
últimos 40 eventos de `writer_mcp_call_events` na página de Integrações. A
trilha mostra apenas metadados operacionais (Marca, ferramenta, código,
documento, request id e data); nenhum token ou payload editorial é exibido.

## Evidência atualizada

- Catálogo remoto: confirmado pelo responsável; quatro providers `active`.
- `pnpm run test:redator:mcp`: 2/2.
- `pnpm run test:redator`: 224/224.
- `npx tsc --noEmit`: passou.
- ESLint direcionado: sem erros nos arquivos alterados.

Ainda não é homologação de cliente externo: OAuth remoto/discovery continua
desabilitado no projeto e o endpoint de produção precisa de HTTPS e
`MCP_PUBLIC_BASE_URL`. O registro da conexão permanece `pending` até essa
configuração operacional.

## Pré-voo Vercel — 2026-09-19

O endpoint recebeu uma checagem de runtime em
`/api/mcp/redator/health`. Em produção, `MCP_PUBLIC_BASE_URL` precisa ser uma
URL HTTPS e o smoke test bearer precisa ser habilitado explicitamente por
`MCP_ALLOW_REMOTE_BEARER=true`. Sem esses valores, o servidor responde um
diagnóstico nomeado e não tenta autenticar uma credencial remota. O passo a
passo está em `docs/07-redator/mcp-vercel-preflight-2026-09-19.md`.

Isso prepara o deploy e o teste privado do transporte. Não altera a conclusão
anterior: OAuth remoto do ChatGPT/Claude/Gemini continua não homologado.

### Evidência do pré-voo

- `pnpm run test:mcp:runtime`: 3/3.
- `pnpm run test:redator:mcp`: 2/2.
- `pnpm run build`: passou; a rota `/api/mcp/redator/health` entrou no inventário
  de produção.
- `GET http://localhost:3000/api/mcp/redator/health`: HTTP 200 com transporte,
  endpoint e modo de autenticação identificados.
- `pnpm run test:redator`: 240/241 no working tree atual; a única falha é a
  asserção estrutural preexistente sobre `fieldset disabled={finalizado}` em
  `redator-finalizacao-entregavel.test.mts`, fora do código deste pré-voo.
