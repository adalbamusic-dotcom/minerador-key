# Runbook — homologação real da DeepSeek — Fase 3

- **Data:** 2026-08-19
- **Módulo proprietário:** Plataforma / Integrações compartilhadas de IA
- **Escopo:** preflight remoto read-only, configuração administrativa local e runbook para homologação manual
- **Operação remota nesta fase:** nenhuma escrita
- **Chamada paga nesta fase:** nenhuma

Este documento não autoriza execução remota, health check real, chamada R5,
migration, alteração de schema ou limpeza de OpenRouter. A Fase 3A abriu
localmente o fluxo administrativo seguro; o primeiro cadastro real continua
dependendo da ação manual do usuário e de um gate explícito.

## Estado desta fase

```text
DEEPSEEK_LOCAL_CUTOVER = PASS
DEEPSEEK_ADMIN_CONFIGURATION_UI = IMPLEMENTED
DEEPSEEK_SECRET_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONNECTION_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONFIGURATION_READBACK = IMPLEMENTED
DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED
DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

O diagnóstico foi executado pelo artefato
`supabase/scripts/deepseek-homologation-preflight-read-only.sql`. Ele produziu
um único relatório sanitizado, sem ler conteúdo de segredo. O bloqueio não é
inferido pelo código local: foi observado no catálogo remoto.

Comando de leitura usado na auditoria:

```text
supabase db query --linked --file supabase/scripts/deepseek-homologation-preflight-read-only.sql
```

## 1. CONNECTION_CREATION_MECHANISM

O contrato local confirmado está nestes pontos:

- `app/api/admin/integrations/route.ts` recebe ações administrativas somente
  após `requireCanonicalPlatformAdmin()`;
- `createPlatformIntegrationProvider` em
  `lib/server/platform-integrations-admin.ts` cadastra o registro do provider
  em `public.integration_providers`;
- `createPlatformIntegrationConnection` valida provider, ambiente e escopo e
  cria em `public.integration_connections` uma Connection `platform` em
  `lifecycle_status = 'draft'`, sem segredo, com a identificação não secreta
  em `metadata`;
- `configureSupportedPlatformProvider` é o caminho operacional da Fase 3A:
  localiza ou cria o provider suportado, reutiliza a única Connection
  `platform/production`, grava a credencial pelo Secret Store/Vault, atualiza
  a Connection para `pending` e retorna somente o readback sanitizado;
- o formulário administrativo fica em `/admin?tab=integracoes`, em
  **Configurações das APIs** e no **Catálogo técnico (avançado)**.

O caminho canônico da DeepSeek é o formulário operacional da visão geral:

1. **Configurar** abre API Key, modelo fixo `deepseek-v4-pro` e endpoint fixo
   `https://api.deepseek.com`;
2. **Salvar configuração** chama apenas a rota administrativa protegida e não
   executa health check;
3. o seletor de Connection técnica continua excluindo DeepSeek para evitar um
   DRAFT paralelo sem segredo e sem o contrato de idempotência.

O caminho está implementado localmente, mas não foi executado contra o remoto
nesta tarefa. Provider e Connection continuam ausentes no catálogo observado.

## 2. SECRET_STORAGE_MECHANISM

O segredo não fica no navegador, em `metadata`, em localStorage, no SQL de
preflight ou em uma coluna com o valor da chave. O caminho canônico é:

```text
server route
  → createIntegrationSecretStore(...)
  → integration_secret_store_upsert(text,text,text,text)
  → Secret Store / Vault
  → secret_ref UUID em integration_connections
```

Para DeepSeek, o payload validado pelo código é um objeto JSON com o único
campo `DEEPSEEK_API_KEY`. O registro não secreto usa o nome
`deepseek_platform` e a descrição `DeepSeek platform credential`, definidos
em `lib/server/platform-integrations-admin.ts`.

As funções `integration_secret_resolve` e
`integration_secret_store_upsert` são funções server-side. O catálogo remoto
confirmou `EXECUTE` para `service_role` e ausência de `EXECUTE` para `PUBLIC`,
`anon` e `authenticated`. Não executar essas RPCs manualmente no SQL e não
colar a chave em chat, migration, log ou histórico de terminal.

## 3. CAPABILITY_BINDING_REQUIREMENTS

O contrato técnico atual usa `unit_name`, não `unit_key`:

```text
capability_key = ai_generation
operation_kind = ai_generation
environment = production
unit_name = request
status = active
```

A capability acima já existe remotamente em exatamente uma linha compatível.
Não criar outra capability.

O resolver atual, em `lib/server/integrations-runtime.ts`, mapeia
`ai_generation → deepseek` e seleciona uma única Connection global da
Plataforma que esteja ativa, em `production`, `READY` e com `secret_ref`.
Nesse caminho de homologação vigente, grants e bindings dinâmicos não são
gate de autorização e o resolver devolve quota ilimitada; ele registra o
contexto de ator, Agency e Brand para a operação e para o Usage.

O preflight encontrou zero binding e zero grant de `ai_generation`, além de
uma quota ativa de Plataforma sem limite. Isso é o estado atual do contrato,
não uma instrução para criar registros. Não aplicar bootstrap, política de
homologação ou distribuição manual nesta etapa.

## 4. CURRENT_REMOTE_STATE_READ_ONLY

Resultado capturado no preflight remoto de 2026-08-19:

| Verificação | Resultado observado | Classificação |
| --- | --- | --- |
| Tabelas `integration_*`, colunas, RLS e constraints | Fundação presente; RLS conforme o contrato; checks estruturais PASS | PASS |
| Provider `deepseek` | Ausente | BLOQUEADOR |
| Provider `openrouter` | `active` | CONFLITO REMOTO |
| Connection DeepSeek `platform/production` | `0` não revogada; `0` `READY` com segredo | NOT_CONFIGURED |
| Connection OpenRouter `platform/production` | `1` `READY`, com segredo e metadata de modelo | CONFLITO REMOTO |
| Capability `ai_generation` | `production · ai_generation · request · active`, exatamente uma | PASS |
| Grants relevantes | `0` | INFO; não criar nesta fase |
| Bindings relevantes | `0` | INFO; não criar nesta fase |
| Quota `ai_generation` | `1` ativa, escopo Plataforma, sem limite | INFO |
| Secret Store e ACL | Funções presentes; `service_role` permitido; demais roles negados | PASS |
| Usage DeepSeek | `0` eventos | NOT_RUN |
| Usage OpenRouter | `37` eventos históricos/remotos | HISTÓRICO PRESERVADO |

O preflight terminou com:

```text
PREFLIGHT_GATE = OPENROUTER_CONFIGURATION_CONFLICT
DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED
```

A Connection OpenRouter ativa não prova que o runtime local ainda faça novas
requisições, mas impede declarar uma fundação remota sem conflito. Não
desabilitar, apagar ou reclassificar essa Connection nesta tarefa.

## 5. EXACT_MANUAL_CONFIGURATION_STEPS

As etapas abaixo são o runbook para uma fase futura autorizada. Elas não foram
executadas.

### 5.1 Obter a chave

Obter uma API key na conta oficial da DeepSeek e mantê-la somente no fluxo
server-side autorizado. Não registrar a chave neste repositório, no Supabase
SQL Editor, no chat ou em screenshots.

### 5.2 Confirmar o provider

O primeiro caminho é abrir `/admin?tab=integracoes` e usar **Configurar** no
card DeepSeek. O writer confirma ou cria o registro necessário. O registro
esperado é:

```text
provider_key = deepseek
display_name = DeepSeek
status = active
```

O preflight mostrou que esse registro ainda não existe. Nenhuma criação foi
feita nesta fase. O catálogo técnico avançado permanece somente para leitura
e governança dos registros já persistidos.

### 5.3 Criar/configurar a Connection

O contrato pretendido é uma Connection global:

```text
provider_key = deepseek
owner_scope_type = platform
owner_agency_id = NULL
owner_brand_id = NULL
environment = production
lifecycle_status inicial = draft
secret_ref = NULL antes do cadastro do segredo
```

Na UI, abrir `/admin?tab=integracoes` → **Configurar** no card DeepSeek. O
servidor garante o provider ativo quando necessário, cria a Connection se ela
não existir ou reutiliza a existente, sempre no escopo global da Plataforma.
Não executar `INSERT` manual nem usar o catálogo técnico avançado para esse
provider.

### 5.4 Registrar o segredo

O formulário usa a ação server-side `configure_supported_platform_provider`
com o contrato sanitizado abaixo, sem substituir
`<CHAVE_FORA_DO_REPOSITÓRIO>` por um valor real neste documento:

```json
{
  "action": "configure_supported_platform_provider",
  "providerKey": "deepseek",
  "environment": "production",
  "label": "DeepSeek Platform",
  "secretPayload": "{\"DEEPSEEK_API_KEY\":\"<CHAVE_FORA_DO_REPOSITÓRIO>\"}"
}
```

Após a confirmação server-side, o resultado seguro é apenas
`secretConfigured = true`, `secret_ref` não nulo e Connection em estado
`pending`; o valor do segredo nunca deve voltar para a UI. O sucesso da tela
somente aparece depois desse readback confirmado.

### 5.5 Readback sem segredo

Usar `GET /api/admin/integrations` ou a visão
`/admin?tab=integracoes` para confirmar somente provider, escopo, ambiente,
status, label, modelo e o booleano de configuração. Nunca selecionar ou
exibir o conteúdo do Secret Store.

Não criar capability, grant, binding ou quota duplicados: o preflight já
confirmou a capability e a quota existentes, e o runtime atual não exige
entitlement/binding dinâmico para `ai_generation`.

## 6. HEALTH_CHECK_PROCEDURE

O backend de health check já existe em
`healthCheckPlatformIntegrationConnection`, acionado por
`POST /api/admin/integrations` com a ação `health_check_platform_connection`.
Na UI, a ação é o botão **Testar conexão** na visão geral de
`/admin?tab=integracoes`.

O botão de DeepSeek só fica habilitado depois de uma Connection com segredo
confirmado. Como a Connection ainda não existe no remoto observado, nenhum
health check foi executado.

Depois de uma Connection configurada e somente com autorização explícita:

1. abrir a visão geral de Integrações;
2. confirmar que a Connection é `platform/production`, o provider é
   `deepseek` e o segredo está apenas indicado como configurado;
3. clicar uma única vez em **Testar conexão**;
4. confirmar no readback que o estado persistido virou `ready`.

O probe server-side realiza somente:

```text
GET https://api.deepseek.com/models
Authorization: Bearer <segredo somente no servidor>
```

O gate manual exige `HTTP = 200`, array `data`,
`deepseek-v4-pro` presente, nenhum segredo no cliente e nenhum request
OpenRouter. O código registra `provider_request_ref`, status sanitizado,
modelo atual e disponibilidade do modelo em `metadata.health_check`; o
health check é mutável porque atualiza o lifecycle da Connection.

## 7. R5_SMOKE_PROCEDURE

Só iniciar depois do health check aprovado. O smoke deve ser uma operação
pequena e explícita no Minerador:

1. entrar em `/{brandRef}/minerador` com sessão autenticada;
2. escolher uma única keyword da Brand ativa que já tenha Processar lógica
   concluído e evidências quantitativas atuais exigidas pelo contrato;
3. clicar na ação de toolbar **IA** (**Revisão semântica**), não executar lote;
4. confirmar no stream as fases `1/3`, `2/3` e `3/3`;
5. confirmar `provider = deepseek`, `model = deepseek-v4-pro` e host
   `api.deepseek.com` no diagnóstico sanitizado;
6. confirmar `JSON.parse = PASS`, validação Zod/schema = PASS e somente então
   a atualização de `ai_review`;
7. confirmar que uma falha em qualquer fase preserva o `ai_review` anterior e
   não promove um resultado parcial.

O consumidor é `POST /api/process-intent-niche` com
`mode = semantic_review`. A operação registra um Usage por fase com
`units = 1`, `unit_name = request`, `module = minerador`, actor, Agency,
Brand, Connection, capability, request reference e metadata sanitizada.
Thinking continua sendo decisão da operação; este runbook não cria uma
política global `thinking = disabled`.

## 8. USAGE_READBACK_PROCEDURE

Após o smoke, conferir primeiro a aba **Consumo** em
`/admin?tab=integracoes`. Para a prova completa, essa visão deve ser
complementada por uma leitura autenticada read-only de
`public.integration_usage_events`, porque tokens, custo e modelo ficam na
metadata sanitizada do evento e não são todos exibidos no card resumido.

Consulta de conferência futura, sem escrita e sem segredo:

```sql
SELECT
  u.occurred_at,
  p.provider_key,
  c.id AS connection_id,
  cap.capability_key,
  u.actor_user_id,
  u.agency_id,
  u.brand_id,
  u.module,
  u.operation_kind,
  u.environment,
  u.units,
  u.unit_name,
  u.result_status,
  u.cost_amount,
  u.provider_request_ref,
  u.metadata->>'model' AS model,
  u.metadata->>'promptTokens' AS prompt_tokens,
  u.metadata->>'completionTokens' AS completion_tokens,
  u.metadata->>'totalTokens' AS total_tokens,
  u.metadata->>'cost' AS provider_cost
FROM public.integration_usage_events AS u
JOIN public.integration_providers AS p ON p.id = u.provider_id
JOIN public.integration_connections AS c ON c.id = u.connection_id
JOIN public.integration_capabilities AS cap ON cap.id = u.capability_id
WHERE p.provider_key = 'deepseek'
  AND u.module = 'minerador'
ORDER BY u.occurred_at DESC;
```

O aceite exige Connection DeepSeek, capability `ai_generation`, Brand do
smoke, `module = minerador`, três fases com resultado coerente e
`result_status` correto. Log local sozinho não é prova de Usage remoto.

## 9. OPENROUTER_ZERO_REQUEST_PROOF

Não chamar OpenRouter para testar se ele está desligado. A prova futura deve
combinar:

- busca estática sem caminho ativo de requisição OpenRouter;
- logs/telemetria sanitizados do health e do smoke;
- `provider_request_ref` e host observados na operação;
- Usage remoto do intervalo, mostrando somente DeepSeek para o smoke;
- ausência de nova operação OpenRouter no readback.

Como a Connection OpenRouter está atualmente `READY` no catálogo remoto, não
é possível declarar zero OpenRouter remoto global nesta fase. O resultado
correto é bloqueado/conflito, não “homologado”.

## 10. RISKS / BLOCKERS

| Item | Estado | Tratamento |
| --- | --- | --- |
| Provider DeepSeek ausente | BLOQUEADOR | Abrir o cadastro somente em etapa remota autorizada |
| Connection/configuração DeepSeek rejeitada pelo código atual | BLOQUEADOR | Alteração local controlada + novo gate; não usar SQL manual |
| OpenRouter Connection ativa com segredo | CONFLITO REMOTO | Preservar até decisão específica; não apagar nesta fase |
| Grants/bindings DeepSeek inexistentes | INFO no contrato atual | Não fabricar distribuição; runtime atual usa Connection global READY |
| Health ainda não executado | PENDENTE | Executar somente depois da configuração e autorização |
| R5 real ainda não executado | PENDENTE | Executar somente depois do health PASS |
| Chamada paga | NÃO AUTORIZADA nesta fase | Nenhuma foi feita |

## Aceite da Fase 3

```text
DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED
DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN
REMOTE_OPERATION = NONE
```

O próximo avanço seguro depende de resolver os dois bloqueadores remotos e
abrir, com evidência e testes, o caminho administrativo atualmente bloqueado.
