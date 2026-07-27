# Minerador Chrome extension configuration

## Local configuration

Copy the fake example and fill the public values for the intended environment:

```powershell
Copy-Item .\minerador-extensao\config.example.js .\minerador-extensao\config.local.js
```

`config.local.js` is ignored by Git and is loaded by both the popup and the
background service worker. It centralizes:

- `PANEL_URL`;
- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`.

The anon key is public by Supabase design, but access still depends on verified
RLS policies. Never place Service Role or a user password in extension files.

The manifest uses `https://*.supabase.co/*` because Chrome host permissions are
static and cannot interpolate the local configuration. Review this permission
before publishing the extension. Local app origins are included for the
authenticated extension endpoints; production must add the exact configured
`PANEL_URL` origin to the packaged manifest instead of using a broad wildcard.

## Tenant da mineração

O payload de mineração envia o `brand_id` real confirmado pelo contrato de
marcas e pela conexão v2. A lista continua sendo carregada pelo `marca_id` de
`listas_kgr`, mas a keyword criada fica tenantizada em `keywords_kgr.brand_id`.
Não há fallback para inserir uma keyword sem tenant.

## Allintitle measurement

The Minerador page cannot call `chrome.runtime` directly. To connect it without
granting a broad host permission, open the extension popup while the Minerador
tab is active and select **Conectar esta aba do Minerador**. This uses the
user-granted `activeTab` permission only for that tab and its current page load.

The extension then measures a user-selected batch in one reusable Google tab,
with a 5-keyword default, a 10-keyword maximum and one request at a time. The
new `scripting` permission injects a local reader only into that measurement
tab. Google host permissions are limited to `google.com` and `google.com.br`.
No result is written by the extension: the Minerador preview requires a human
confirmation before its existing `results_allintitle` field is updated.

If Google shows CAPTCHA, consent or a block, the batch pauses. Resolve the
challenge manually in the focused Google tab, then use **Retomar**, or cancel
the batch. Never reload aggressively or attempt to bypass a challenge.

## Diagnóstico de coleta

O handshake confirma apenas a comunicação com o painel. Cada medição agora
emite etapas transitórias (`opening_google_tab`, `loading_query`,
`injecting_reader`, `reading_page` e `returning_result`) e mantém a primeira
falha com código seguro para a interface. A URL deve terminar em uma busca
Google com a query exata; redirecionamento inesperado, leitor sem resposta e
timeout não são convertidos em zero.

## Marcas autenticadas e handshake v2

O popup usa o `access_token` Supabase somente no header `Authorization: Bearer`
dos endpoints da aplicação `/api/extensao/marcas` e
`/api/extensao/marcas/{brandId}/listas`. O servidor resolve as marcas
autorizadas; o popup não consulta tabelas de marcas ou listas diretamente para
montar os seletores.

O campo Marca é sempre apresentado. Uma marca é selecionada automaticamente;
duas ou mais exigem escolha entre as marcas retornadas pelo servidor; zero
marcas e falhas bloqueiam a operação e mostram retry. Lista/Projeto só é
habilitada depois da marca ser confirmada e é descartada ao trocar de marca.

O botão abre `/{brandRef}/minerador`, usando `brandRef` como referência opaca
retornada pelo servidor. A extensão não converte `brandRef` em `brandId`.

O handshake v2 confirma `actorUserId`, `activeBrandId`, `activeBrandRef`,
autenticação e acesso da página. Mineração e allintitle exigem que essa sessão
transitória por aba corresponda à marca selecionada. O protocolo antigo não
autoriza operações multi-marca.

O rate limit atual do contrato é local, de melhor esforço, com 60 leituras por
usuário/minuto. A proteção distribuída e o smoke test autenticado no Chrome
continuam pendentes.
## Diagnóstico da API de marcas

O popup chama somente a origem de `PANEL_URL` através de
`/api/extensao/marcas` e `/api/extensao/marcas/{brandId}/listas`. A URL é
construída por uma função única; origem relativa, rota legada e origem da aba
ativa não são aceitas.

Respostas não-OK são interpretadas antes de serem exibidas. O popup diferencia
rede, token ausente/inválido, sessão expirada, identidade sem vínculo, acesso
negado e falha interna. Em falha, **Copiar diagnóstico** inclui somente
endpoint, status, code, requestId, presença/expiração do token, timestamp e
versão da extensão. Nunca inclui JWT, refresh token, e-mail ou segredo.

O login preserva `access_token`, `refresh_token`, `expires_at` e `user_id`. Um
token expirado tenta refresh uma única vez; se o refresh falhar, a extensão
solicita novo login.

## Sessão operacional e preflight

Marca carregada, aba pronta, conexão confirmada e conexão operacional validada
são estados diferentes. O popup só mostra conexão depois de ACK v2 real. A
sessão confirmada fica em `chrome.storage.session`, indexada por `tabId`, com
`origin`, `pathname`, `module`, `protocolVersion`, `actorUserId`, `brandId`,
`brandRef`, `brandName`, `confirmedAt` e `lastPingAt`.

Antes de iniciar ou retomar allintitle, a página envia o contexto atual e o
background lê a sessão da mesma aba, compara ator/marca/rota/protocolo e envia
um novo ping. A resposta estruturada usa `connected` e os códigos
`session_missing`, `tab_mismatch`, `brand_mismatch`, `actor_mismatch`,
`route_mismatch`, `protocol_mismatch`, `ack_timeout`, `bridge_not_ready`,
`bridge_context_invalidated`, `bridge_version_mismatch`, `bridge_unavailable` e
`access_not_confirmed`. Falhas não são reduzidas a `extension_not_connected`,
não abrem Google e não apagam resultados anteriores.

O fluxo real em Chrome autenticado ainda precisa validar popup fechado, service
worker suspenso, duas abas, troca de marca e consulta Google. Essa validação
não foi executada nesta alteração.

Each operation has one root `requestId` created by the Minerador page. The
bridge forwards the background response without allowing it to replace that
ID; `batchId` remains the operational batch ID and does not substitute it.
Progress, result, pause, cancellation, resume and `batch_completed` envelopes
carry the root correlation plus the real `brandId` and keyword IDs. A missing
ID is rejected as `response_missing_request_id`, a different ID as
`request_mismatch`, and a response from an older batch is ignored as
`stale_response`.
### Bridge após reload da extensão

A bridge da página usa uma instância versionada (`bridgeVersion: 2`) com `instanceId` e `dispose()`. Uma nova injeção descarta a instância anterior, remove os listeners nomeados e limpa operações pendentes; a página não precisa ser recarregada. O background faz `minerador_bridge_probe`, aguarda `bridge_ready` e só então envia o ping do handshake v2. Erros de `chrome.runtime.lastError`, exceção síncrona ou contexto invalidado são devolvidos como diagnóstico estruturado, permitindo reinjeção segura.
### ACK da página e reconexão

O listener do painel responde ao ping de handshake independentemente do estado
de um lote allintitle. Quando consegue identificar uma divergência, envia ACK
negativo com `errorCode` (`brand_mismatch` ou `access_not_confirmed`) para que o
background mostre a causa sem esperar um timeout. A conexão aguarda a bridge
reinjetada, `bridge_ready` e a janela operacional do service worker antes de
declarar `ack_timeout`.
### Handshake da página e falha externa de volume

O handshake v2 exige que a rota contextual do Minerador confirme usuário, marca, rota e acesso antes do ACK. O background registra o último estágio confirmado para distinguir página não pronta, ACK negativo e timeout. A coleta de volume permanece externa à extensão; HTTP 429 não é repetido automaticamente e o aplicativo mostra apenas `Não foi possível coletar volume.`.
