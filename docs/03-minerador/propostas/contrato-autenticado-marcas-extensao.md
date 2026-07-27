# SDD â€” Contrato autenticado de marcas para a extensÃ£o do Minerador

**Status:** implementada localmente conforme aprovaÃ§Ã£o; validaÃ§Ã£o remota/manual pendente.
**MÃ³dulo proprietÃ¡rio:** Minerador.
**Data:** 2026-07-24.

> **Estado vigente â€” 2026-07-27:** o contrato foi implementado localmente com a API server-side de marcas, `brandId`/`brandRef`, seleÃ§Ã£o explÃ­cita e handshake v2. O servidor continua sendo a autoridade; a extensÃ£o somente entrega keywords ao Minerador. Login real, Chrome manual, RLS remoto, proteÃ§Ã£o distribuÃ­da e persistÃªncia remota permanecem validaÃ§Ãµes externas pendentes.

## DecisÃ£o registrada e implementaÃ§Ã£o local

Criar um contrato HTTP aditivo, especÃ­fico para a extensÃ£o Chrome, autenticado por um JWT Supabase enviado em `Authorization: Bearer <token>`. O servidor valida o token, resolve o perfil e as permissÃµes reais e devolve somente os tenants autorizados. A extensÃ£o deixa de consultar diretamente `marcas`, `perfis`, `listas_kgr` e `keywords_kgr`.

O contrato nÃ£o concede acesso por `brandId`, `brandRef`, e-mail, papel ou dados guardados no popup. Esses valores sÃ³ podem restringir ou conferir uma resposta jÃ¡ autorizada pelo servidor.

Na fase de proposta, este documento nÃ£o autorizava implementaÃ§Ã£o, migration, escrita remota, mudanÃ§a de RLS, chamada autenticada, consulta Google ou limpeza de armazenamento. A implementaÃ§Ã£o posterior foi autorizada separadamente e permaneceu local. O diagnÃ³stico tabular abaixo Ã© um snapshot dessa fase; os blocos de fechamento posteriores registram o estado local atual.

## DiagnÃ³stico confirmado

| Ãrea | Estado atual | ConsequÃªncia |
| --- | --- | --- |
| SessÃ£o da extensÃ£o | O popup grava o resultado de `auth/v1/token?grant_type=password` em `chrome.storage.local` como `supabase_session`. | HÃ¡ um JWT Supabase, mas nÃ£o uma sessÃ£o NextAuth acessÃ­vel ao servidor por cookie. |
| Marcas no popup | `popup.js` mostra a marca apenas para `profile.role === "admin"`; para outros papÃ©is usa somente `perfil.marca_id`. | Um colaborador com mÃºltiplas marcas nÃ£o Ã© representado. |
| Falha de marcas | A resposta de `GET /rest/v1/marcas` sÃ³ Ã© processada quando `response.ok`; o ramo nÃ£o-OK nÃ£o produz estado persistente de erro. | O seletor pode parecer vazio sem explicar a falha. |
| Listas | O popup lÃª `listas_kgr` diretamente por `marca_id`. | A lista pode ser consultada antes de uma marca autorizada estar resolvida. |
| AplicaÃ§Ã£o | `GET /api/marcas` usa `requireSessionProfile` e `listAccessibleTenantIds`; a rota contextual usa `resolveTenantContext`. | Essa Ã© a fonte canÃ´nica, mas requer a sessÃ£o NextAuth do navegador. |
| Rota | A rota canÃ´nica Ã© `/{brandRef}/minerador`, e `brandRef` contÃ©m slug legÃ­vel e UUID tÃ©cnico. | A extensÃ£o ainda deriva `/minerador` e seus validadores nÃ£o reconhecem integralmente a rota tenant. |
| Handshake | O ACK v1 confirma requestId, origem, mÃ³dulo e versÃ£o, mas nÃ£o `activeBrandId`. | Uma conexÃ£o de aba nÃ£o prova que o tenant da extensÃ£o coincide com o tenant da pÃ¡gina. |

O cÃ³digo tambÃ©m confirma que `listAccessibleTenantIds` jÃ¡ considera administrador global, proprietÃ¡rio, `perfil.marcaId`, memberships ativas e a compatibilidade legada de membership. `resolveTenantContext` Ã© a validaÃ§Ã£o final de estado da marca, ownership, membership e permissÃµes de mÃ³dulo.

## Identidades e fonte de autorizaÃ§Ã£o

### Estado observado

O login por credenciais da aplicaÃ§Ã£o e o popup usam Supabase Auth. Na aplicaÃ§Ã£o, o callback NextAuth guarda um JWT Supabase apenas apÃ³s validar suas claims e o associa a `session.user.id`. No popup, o token Ã© emitido diretamente pelo endpoint de senha do Supabase e o `sub` Ã© lido apenas para a consulta legada de perfil.

Isso Ã© evidÃªncia de que o identificador candidato de vÃ­nculo Ã© o `sub` validado pelo Supabase, nÃ£o o e-mail. NÃ£o Ã© prova suficiente para aceitar qualquer JWT decodificado no cliente nem para assumir equivalÃªncia entre uma sessÃ£o da extensÃ£o e uma sessÃ£o NextAuth ativa.

### Regra proposta

O novo endpoint deve validar o bearer diretamente no Supabase Auth do projeto configurado e obter o usuÃ¡rio da resposta validada. O `id` desse usuÃ¡rio Ã© o Ãºnico identificador de ator aceito para resolver `perfis`, owner e memberships. Nenhum `userId`, `email`, `role`, `brandId` ou `brandRef` enviado pelo popup participa da concessÃ£o de acesso.

Antes da implementaÃ§Ã£o, confirmar por teste autenticado controlado que:

1. o `sub` do bearer emitido para a extensÃ£o corresponde a `perfis.id`;
2. o mesmo `sub` Ã© o `session.user.id` usado por `requireSessionProfile` no login por credenciais;
3. o caminho Google â†’ Supabase mantÃ©m a mesma associaÃ§Ã£o ou retorna `identity_not_linked` sem fallback por e-mail;
4. JWT de outro projeto, `aud` incompatÃ­vel, expiraÃ§Ã£o e assinatura invÃ¡lida sÃ£o rejeitados.

Se qualquer item falhar, a implementaÃ§Ã£o para antes de criar fallback. A menor correÃ§Ã£o posterior serÃ¡ uma associaÃ§Ã£o de identidade explÃ­cita, versionada e aprovada; nÃ£o serÃ¡ uso de e-mail como prova Ãºnica.

## Contratos propostos

### 1. Marcas autorizadas

**Rota candidata:** `GET /api/extensao/minerador/marcas`.

O nome final deve permanecer sob `api/extensao` para nÃ£o parecer uma variaÃ§Ã£o de `/api/marcas`, que continua exclusiva da sessÃ£o NextAuth. A rota deve usar um adaptador server-side novo para bearer Supabase e reutilizar, sem alterar sua semÃ¢ntica, a lÃ³gica canÃ´nica de tenant (`listAccessibleTenantIds`, `resolveTenantContext` e `canAccessTenantModule`).

RequisiÃ§Ã£o:

```http
GET /api/extensao/minerador/marcas
Authorization: Bearer <supabase_access_token>
```

Resposta de sucesso (`200`):

```json
{
  "requestId": "uuid",
  "brands": [
    {
      "brandId": "uuid",
      "brandRef": "adalba-pro--uuid",
      "name": "Adalba Pro",
      "capabilities": ["minerador:view", "minerador:create"],
      "isActive": true
    }
  ]
}
```

`brandRef` Ã© produzido exclusivamente no servidor com `buildBrandRef(name, brandId)`. `capabilities` deve ser a menor projeÃ§Ã£o necessÃ¡ria para o popup bloquear ou liberar a operaÃ§Ã£o; se a operaÃ§Ã£o atual exigir apenas leitura/conexÃ£o, retornar somente a capacidade pertinente em vez de papel completo.

Erros estruturados, sem token ou dados sensÃ­veis:

| HTTP | `code` | Regra do popup |
| --- | --- | --- |
| 401 | `unauthorized` | Exibir login; bloquear tudo. |
| 401 | `token_expired` | Exigir novo login; nÃ£o repetir com token antigo. |
| 403 | `identity_not_linked` | Exibir erro persistente e suporte; nÃ£o usar e-mail. |
| 200 | `no_brands` com `brands: []` | Exibir â€œNenhuma marca disponÃ­vel para esta contaâ€; permitir retry. |
| 403 | `access_denied` | Bloquear a marca/aÃ§Ã£o pedida. |
| 404 | `brand_not_found` | AplicÃ¡vel somente Ã  rota de listas; limpar apenas a seleÃ§Ã£o transitÃ³ria. |
| 429 | `rate_limited` | Exibir espera e nÃ£o fazer retry automÃ¡tico. |
| 500/503 | `internal_error` | Exibir falha persistente e retry manual. |

Todos os erros incluem `requestId`; nenhum inclui JWT, e-mail, membership, SQL ou stack trace.

### 2. Listas da marca

**DecisÃ£o proposta:** rota separada, nÃ£o listas embutidas em cada marca.

**Rota candidata:** `GET /api/extensao/minerador/marcas/{brandId}/listas`.

Motivos: listas podem crescer, precisam ser revalidadas apÃ³s troca de marca e nÃ£o devem elevar o custo nem o escopo do primeiro carregamento de marcas.

Resposta (`200`):

```json
{
  "requestId": "uuid",
  "brandId": "uuid",
  "lists": [
    { "listId": "uuid", "name": "Silo facial", "brandId": "uuid", "status": "active" }
  ]
}
```

O servidor valida novamente o bearer, verifica a capacidade exigida no Minerador, resolve o tenant para o `brandId` da URL e filtra `listas_kgr.marca_id` pelo mesmo ID. Lista de outro tenant, marca inativa ou brandId adulterado nunca retorna dados. A extensÃ£o compara `brandId` da resposta com sua seleÃ§Ã£o e descarta resposta atrasada de uma marca anterior.

## Fluxo de interface e operaÃ§Ã£o

```text
restaurar sessÃ£o Supabase da extensÃ£o
â†’ GET marcas autorizadas (bearer validado no servidor)
â†’ 0: erro persistente e bloqueio
â†’ 1: seleÃ§Ã£o automÃ¡tica, campo somente leitura
â†’ 2+: dropdown somente com retorno autorizado
â†’ GET listas da marca selecionada
â†’ usuÃ¡rio escolhe lista, quando a aÃ§Ã£o exigir lista
â†’ Abrir /{brandRef}/minerador
â†’ pÃ¡gina autoriza tenant pelo servidor
â†’ ping/ACK v2 com activeBrandId
â†’ comparar IDs e liberar conexÃ£o
â†’ sÃ³ entÃ£o liberar mineraÃ§Ã£o e allintitle
```

Regras de UI:

- O campo **Marca** Ã© sempre visÃ­vel depois do carregamento: somente leitura para uma marca, dropdown para duas ou mais, e mensagem persistente para zero ou erro.
- O campo **Lista/projeto** Ã© sempre rotulado, fica desabilitado enquanto nÃ£o hÃ¡ marca vÃ¡lida e nÃ£o conserva opÃ§Ãµes de marca anterior.
- PreferÃªncia de marca pode ser guardada apenas depois de a resposta do servidor confirmar que o `brandId` ainda estÃ¡ autorizado. PreferÃªncia invÃ¡lida nÃ£o Ã© aplicada nem apagada automaticamente; a UI pede nova escolha.
- O botÃ£o **Abrir Minerador** permanece desabilitado atÃ© existir marca autorizada e `brandRef` recebido do servidor. Ele abre exatamente `/{brandRef}/minerador`; query e hash podem ser acrescentados somente por uma funÃ§Ã£o pura e testada.
- Conectar Ã  aba nÃ£o abre, redireciona ou troca a marca da pÃ¡gina silenciosamente.

## Rota contextual e validaÃ§Ã£o pura

O popup pode usar `brandRef` somente como segmento opaco recebido do endpoint. Ele nÃ£o chama `parseBrandRef`, nÃ£o extrai UUID e nÃ£o tenta construir slug.

O background deve ter um extrator/validador puro, testÃ¡vel, que aceite apenas a origem local explicitamente permitida ou a origem configurada e pathname:

```text
/{brandRef}/minerador
/{brandRef}/minerador/
/{brandRef}/minerador?status=publicado#keyword-1
```

Deve rejeitar raiz, `/minerador` legado apÃ³s o rollout, `/admin`, `/marca`, outro mÃ³dulo, segmento vazio, origem inesperada e caminhos filhos. O validador pode checar a forma sintÃ¡tica segura de `brandRef`, mas nÃ£o transforma o valor em `brandId`; a pÃ¡gina continua sendo a autoridade que o resolve e autoriza.

## Handshake v2 consciente de marca

O protocolo deve evoluir de forma aditiva para versÃ£o 2. A bridge mantÃ©m parse do ACK v1 somente para informar incompatibilidade; ACK v1 jamais autoriza allintitle ou mineraÃ§Ã£o multi-marca.

Ping v2 proposto:

```json
{ "action": "minerador_handshake_ping", "requestId": "uuid", "protocolVersion": 2 }
```

ACK v2 proposto, produzido pela pÃ¡gina apÃ³s o tenant da rota jÃ¡ ter sido autorizado:

```json
{
  "requestId": "uuid",
  "ack": true,
  "protocolVersion": 2,
  "module": "minerador",
  "authenticated": true,
  "actorId": "uuid",
  "activeBrandId": "uuid",
  "activeBrandRef": "adalba-pro--uuid",
  "activeBrandName": "Adalba Pro",
  "accessConfirmed": true,
  "timestamp": "2026-07-24T12:00:00.000Z"
}
```

A conexÃ£o Ã© vÃ¡lida somente quando requestId, origem, mÃ³dulo, versÃ£o, `authenticated`, `accessConfirmed`, `activeBrandId` e marca selecionada sÃ£o compatÃ­veis. `actorId` deve coincidir com o ator validado pelo endpoint de marcas quando ambos usam o mesmo contrato de identidade; a divergÃªncia Ã© bloqueante.

ApÃ³s ACK vÃ¡lido, o service worker grava somente em `chrome.storage.session`:

```text
tabId, origin, module, protocolVersion, actorId,
brandId, brandRef, brandName, confirmedAt, lastPingAt
```

Essa sessÃ£o Ã© evidÃªncia transitÃ³ria, nÃ£o uma concessÃ£o. Ela Ã© removida em logout da extensÃ£o, fechamento da aba, troca de marca, troca de conta, ACK invÃ¡lido e reinÃ­cio que nÃ£o consiga revalidar. Antes de carregar listas, iniciar mineraÃ§Ã£o, iniciar/retomar allintitle, aceitar resultado ou persistir sugestÃ£o, a extensÃ£o revalida sessÃ£o, seleÃ§Ã£o, conexÃ£o e IDs.

### DivergÃªncia de marca

Se extensÃ£o e pÃ¡gina tiverem marcas diferentes, nÃ£o conectar nem iniciar operaÃ§Ã£o. Exibir:

> A marca selecionada na extensÃ£o nÃ£o corresponde Ã  marca aberta no Minerador.

Oferecer somente **Abrir Minerador da marca selecionada** e **Cancelar**. Abrir a rota correta nÃ£o cria conexÃ£o: exige novo ping e ACK v2.

## AutorizaÃ§Ã£o por operaÃ§Ã£o

| OperaÃ§Ã£o | PrÃ©-condiÃ§Ãµes mÃ­nimas |
| --- | --- |
| Listar marcas | Bearer vÃ¡lido, identidade vinculada, autorizaÃ§Ã£o resolvida no servidor. |
| Carregar listas | Todas as anteriores + `brandId` autorizado + capacidade necessÃ¡ria do Minerador. |
| Abrir pÃ¡gina | `brandRef` retornado pelo servidor; a rota autoriza novamente no servidor. |
| Conectar Ã  aba | Marca selecionada + aba contextual vÃ¡lida + ACK v2 da mesma marca. |
| MineraÃ§Ã£o | ConexÃ£o v2 vÃ¡lida, lista da mesma marca e capacidade de criaÃ§Ã£o confirmada. |
| Allintitle | ConexÃ£o v2 vÃ¡lida, seleÃ§Ã£o da mesma marca e lote com `brandId` idÃªntico. |
| Resultado atrasado | Aplicar somente se batch, tabId, actorId e brandId ainda coincidirem; caso contrÃ¡rio descartar sem persistir. |

Nenhuma chamada Google inicia em qualquer falha dessas prÃ©-condiÃ§Ãµes. Falhas nÃ£o apagam listas, keywords, volume, resultados ou mÃ©tricas existentes.

## SeguranÃ§a, limite e observabilidade

- Validar bearer no servidor, nunca apenas com `parseJwt` do popup.
- NÃ£o copiar cookies NextAuth, refresh tokens nem `service_role` para a extensÃ£o.
- NÃ£o registrar Authorization, JWT, e-mail, nome de membership ou corpo bruto de erro.
- Aplicar rate limit por identidade validada e IP/origem, com limite conservador para leitura de marcas/listas; resposta 429 estruturada, sem retry automÃ¡tico.
- Gerar `requestId` no servidor ou aceitar correlaÃ§Ã£o opaca validada, devolvendo-o em sucesso e erro.
- Registrar somente evento, status, cÃ³digo seguro, duraÃ§Ã£o, endpoint, versÃ£o do protocolo e IDs pseudonimizados/permitidos pela polÃ­tica de logs.
- Revalidar token e autorizaÃ§Ã£o em cada endpoint; cache no popup Ã© de apresentaÃ§Ã£o, nunca autorizaÃ§Ã£o.

## Arquivos, consumidores e classificaÃ§Ã£o prevista

| Arquivo/Ã¡rea | Papel | MudanÃ§a prevista | ClassificaÃ§Ã£o |
| --- | --- | --- | --- |
| `app/api/extensao/minerador/marcas/route.ts` | novo contrato bearer | listar tenants autorizados | aditiva, compartilhada de autenticaÃ§Ã£o |
| `app/api/extensao/minerador/marcas/[brandId]/listas/route.ts` | novo contrato bearer | listar listas autorizadas | aditiva, Minerador + autenticaÃ§Ã£o |
| adaptador server-side de bearer Supabase | validar token e construir perfil seguro | novo, sem alterar NextAuth | aditiva, compartilhada |
| `lib/server/tenant-context.ts` | fonte atual | reutilizar listagem/resoluÃ§Ã£o; alterar sÃ³ se a API atual nÃ£o aceitar perfil bearer seguro | compartilhada; requer revisÃ£o explÃ­cita |
| `lib/tenant-routing.ts` | fonte de `brandRef` | reutilizar `buildBrandRef`; sem expor parser ao popup | compartilhada consumida, sem mudanÃ§a esperada |
| `app/(brand)/[brandRef]/layout.tsx` | autoriza tenant de rota | preservar comportamento | compartilhada consumida, sem mudanÃ§a esperada |
| mÃ³dulo/tela do Minerador | produzir ACK v2 a partir do contexto autorizado | incluir identidade e tenant confirmados | proprietÃ¡ria do Minerador, aditiva |
| `minerador-extensao/popup.html` e `popup.js` | UI e chamadas do contrato | marca/lista, erro/retry e rota contextual | proprietÃ¡ria da extensÃ£o |
| `minerador-extensao/background.js` | sessÃ£o transitÃ³ria e gate operacional | validador contextual e ACK v2 | proprietÃ¡ria da extensÃ£o |
| `minerador-extensao/minerador-panel-bridge.js` | transporte de mensagens | encaminhar protocolo v2 | proprietÃ¡ria da extensÃ£o, compatÃ­vel |
| `manifest.json` | permissÃµes | avaliar somente origem da aplicaÃ§Ã£o, se necessÃ¡ria | extensÃ£o; nÃ£o ampliar sem justificativa |
| testes de tenant, handshake e popup | regressÃ£o | fixtures e mocks | proprietÃ¡rios/compartilhados conforme alvo |

Consumidores a auditar antes do cÃ³digo: `BrandProvider`, `/api/marcas`, `/api/tenants`, seletor de marca, rotas tenant, rotas legadas, tela do Minerador, bridge, service worker, popup, fluxos de mineraÃ§Ã£o e allintitle. Se o adaptador bearer exigir mudanÃ§a incompatÃ­vel em `requireSessionProfile`, `BrandProvider`, RLS, schema ou uma rota compartilhada existente, a implementaÃ§Ã£o deve parar para uma nova aprovaÃ§Ã£o.

## Compatibilidade e rollout

1. Criar os endpoints e testes sem remover o login ou preferÃªncias existentes da extensÃ£o.
2. Publicar protocolo v2; o popup atualizado exige ACK v2 para operaÃ§Ãµes tenantizadas.
3. ACK v1 continua parseÃ¡vel apenas para diagnÃ³stico: â€œAtualize a extensÃ£o para conectar por marcaâ€.
4. Manter aÃ§Ãµes legadas somente se comprovadamente nÃ£o dependem de tenant; nÃ£o rotulÃ¡-las como conexÃ£o multi-marca segura.
5. Rodar smoke test manual autenticado com uma marca, mÃºltiplas marcas, zero marcas, marca revogada e duas abas.
6. SÃ³ depois habilitar mineraÃ§Ã£o/allintitle pelo gate v2.

NÃ£o hÃ¡ reescrita de dados, migration, limpeza de `chrome.storage.local`, localStorage ou IndexedDB no rollout.

## Rollback

Rollback sem perda de dados:

1. desativar as rotas especÃ­ficas da extensÃ£o por configuraÃ§Ã£o/implantaÃ§Ã£o reversÃ­vel;
2. desabilitar allintitle e mineraÃ§Ã£o multi-marca quando nÃ£o houver ACK v2;
3. manter login da extensÃ£o, preferÃªncias e dados de keywords/listas/mÃ©tricas intactos;
4. invalidar apenas as chaves transitÃ³rias de `chrome.storage.session` do protocolo v2;
5. nÃ£o reverter dados de domÃ­nio, nÃ£o limpar armazenamento persistente e nÃ£o alterar marca ativa na aplicaÃ§Ã£o.

## Plano de testes proposto

Usar mocks de token e fixtures de perfil/tenant/lista; nenhum teste automatizado chama Supabase, Google ou RapidAPI.

### Endpoint

- bearer ausente, invÃ¡lido, vencido e de outro projeto;
- identidade sem vÃ­nculo, usuÃ¡rio inexistente e acesso revogado;
- uma marca, vÃ¡rias, nenhuma, inativa, owner, admin global com acesso parcial e colaborador multi-marca;
- brandId adulterado, lista de outro tenant, erro interno, rate limit e logs sem token.

### Popup e rota

- carregando, uma marca automÃ¡tica/readonly, vÃ¡rias marcas, preferÃªncia vÃ¡lida/invÃ¡lida, zero marcas, erro persistente e retry;
- lista desabilitada atÃ© marca vÃ¡lida, troca de marca e resposta de lista fora de ordem;
- `/{brandRef}/minerador`, slash, query e hash aceitos; raiz, legado, outro mÃ³dulo e origem invÃ¡lida rejeitados;
- provar que o popup nÃ£o extrai nem fabrica `brandId` a partir de `brandRef`.

### Handshake e operaÃ§Ãµes

- ACK v2 da mesma marca; brandId divergente; actor divergente; `activeBrandId` ausente; acesso falso; requestId, origem e versÃ£o invÃ¡lidos;
- ACK v1 legÃ­vel porÃ©m bloqueado; duas abas; aba fechada; logout; troca de conta/marca; service worker reiniciado;
- mineraÃ§Ã£o e allintitle bloqueados antes do ACK, liberados apÃ³s ACK correspondente e bloqueados de novo apÃ³s invalidaÃ§Ã£o;
- resultados atrasados, lote interrompido e falha parcial nÃ£o cruzam tenant nem apagam mÃ©tricas;
- assertiva explÃ­cita de que falhas de gate nÃ£o iniciam consulta Google.

## Riscos e decisÃµes pendentes de aprovaÃ§Ã£o

1. **Adaptador bearer:** aprovar a nova fronteira de autenticaÃ§Ã£o server-side e sua localizaÃ§Ã£o definitiva.
2. **VÃ­nculo de identidade:** confirmar em ambiente autenticado que `sub` Supabase â†” `perfis.id` â†” `session.user.id` Ã© vÃ¡lido para credenciais e Google. Sem isso, bloquear implementaÃ§Ã£o.
3. **Capacidade necessÃ¡ria:** definir se a extensÃ£o precisa de `minerador:view`, `minerador:create` ou outra capacidade para listas, mineraÃ§Ã£o e allintitle.
4. **Rate limit:** definir valor operacional e destino dos logs conforme infraestrutura disponÃ­vel.
5. **PermissÃµes de extensÃ£o:** confirmar se a origem de produÃ§Ã£o jÃ¡ estÃ¡ em `host_permissions`; ampliar somente com necessidade comprovada.
6. **Legado:** decidir se a mineraÃ§Ã£o que ainda escreve diretamente no Supabase deve ser migrada para rota server-side antes de ser liberada no novo gate. A SDD nÃ£o autoriza essa migraÃ§Ã£o.

## LimitaÃ§Ãµes desta SDD

Esta proposta foi baseada em leitura local de cÃ³digo. RLS, claims reais, resposta de Supabase Auth, associaÃ§Ã£o real de identities, sessÃ£o browser e persistÃªncia remota continuam nÃ£o verificadas. A implementaÃ§Ã£o registrada abaixo nÃ£o executou escrita remota nem alterou dados.

## Registro da implementaÃ§Ã£o local â€” 2026-07-24

- Criados os endpoints Bearer somente leitura `/api/extensao/marcas` e `/api/extensao/marcas/{brandId}/listas`.
- O Bearer Ã© validado pelo Supabase Auth server-side; o `sub` validado resolve o perfil e as autorizaÃ§Ãµes canÃ´nicas existentes. O popup nÃ£o consulta mais `marcas`, `perfis` ou `listas_kgr` diretamente para montar a interface.
- O popup apresenta Marca sempre, seleciona automaticamente uma marca, oferece dropdown para vÃ¡rias, mostra erro persistente/retry e mantÃ©m Lista/Projeto desabilitada atÃ© a marca ser confirmada.
- `brandRef` Ã© retornado pelo servidor e usado somente como segmento opaco na rota `/{brandRef}/minerador`.
- O protocolo v2 exige `activeBrandId`, `activeBrandRef`, `actorUserId`, autenticaÃ§Ã£o, acesso confirmado e coincidÃªncia com a seleÃ§Ã£o da extensÃ£o. A sessÃ£o transitÃ³ria permanece em `chrome.storage.session`.
- MineraÃ§Ã£o e allintitle exigem conexÃ£o v2 da mesma marca; divergÃªncia invalida a operaÃ§Ã£o antes de abrir Google ou persistir.
- Rate limit local de melhor esforÃ§o: 60 requisiÃ§Ãµes por usuÃ¡rio por minuto. ProteÃ§Ã£o distribuÃ­da continua pendente.
- NÃ£o foram executados login real, chamada Supabase autenticada, Chrome manual, consulta Google, RapidAPI, migration, escrita remota, commit, push ou deploy.
## CorreÃ§Ã£o localizada do diagnÃ³stico â€” 2026-07-24

- A URL da API no popup Ã© construÃ­da exclusivamente pela origem validada de `PANEL_URL` e pelos caminhos `/api/extensao/...`.
- O popup preserva e interpreta respostas nÃ£o-OK, incluindo `status`, `code`, `message` e `requestId`, sem registrar tokens.
- A sessÃ£o local agora preserva expiraÃ§Ã£o e refresh token; uma resposta `token_expired` tenta uma renovaÃ§Ã£o Ãºnica antes de solicitar novo login.
- O diagnÃ³stico copiÃ¡vel Ã© limitado a endpoint, status, code, requestId, tokenPresent, tokenExpired, timestamp e extensionVersion.
- A causa final do erro observado continua pendente de um smoke test real no Chrome; a correÃ§Ã£o remove a ocultaÃ§Ã£o que impedia identificÃ¡-la.

## CorreÃ§Ã£o localizada: preflight operacional â€” 2026-07-25

O contrato v2 passa a separar quatro estados: marca autorizada carregada,
contexto pronto para conectar, sessÃ£o conectada e conexÃ£o operacional validada.
Somente o Ãºltimo libera o allintitle. O popup nÃ£o infere conexÃ£o a partir da
lista de marcas.

A sessÃ£o transitÃ³ria em `chrome.storage.session` Ã© lida pela mesma chave
`minerador:panel-connection:{tabId}` usada na gravaÃ§Ã£o e deve conter
`tabId`, `origin`, `pathname` canÃ´nico, `module`, `protocolVersion`,
`actorUserId`, `brandId`, `brandRef`, `brandName`, `confirmedAt` e `lastPingAt`.
O pathname canÃ´nico tem o formato `/{brandRef}/minerador`; query string e hash
nÃ£o participam da comparaÃ§Ã£o.

O preflight recebe `requestId` e o contexto atual da pÃ¡gina, relÃª a sessÃ£o da
aba, rejeita mistura de abas/marcas/atores e revalida o ACK v2 sem polling. Seu
resultado Ã© `{ connected, code, message, session }`, com os cÃ³digos
`connected`, `session_missing`, `tab_mismatch`, `brand_mismatch`,
`actor_mismatch`, `route_mismatch`, `protocol_mismatch`, `ack_timeout`,
`bridge_unavailable` e `access_not_confirmed`. DiagnÃ³sticos nÃ£o contÃªm tokens.

Esta implementaÃ§Ã£o local nÃ£o altera endpoints autenticados, volume, KGR,
parser Google, schema, RLS ou Arquiteto. A validaÃ§Ã£o autenticada no Chrome e a
consulta real ao Google continuam pendentes.
