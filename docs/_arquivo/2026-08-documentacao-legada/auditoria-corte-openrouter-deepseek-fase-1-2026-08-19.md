> **HISTÓRICO — NÃO OPERACIONAL — 2026-08-27**
>
> Registro preservado durante a consolidação documental. Não é fonte de verdade nem autoriza implementação; consulte as fontes canônicas ativas em `docs/README.md`.

# Auditoria Fase 1 — OpenRouter → DeepSeek

- **Data:** 2026-08-19
- **Módulo proprietário:** Plataforma / Integrações compartilhadas de IA
- **Escopo:** código, testes, fixtures, ENV documentada e documentação ativa
- **Operação remota:** nenhuma
- **Chamada paga:** nenhuma
- **Runtime alterado:** nenhum

Esta auditoria prepara o corte arquitetônico. Ela não implementa DeepSeek, não
altera o resolver, não cadastra Connection, não muda schema e não remove
OpenRouter histórico.

## Resultado executivo

```text
DEEPSEEK_ARCHITECTURE_ADENDUM = READY
OPENROUTER_RUNTIME_MAP = COMPLETE
AI_CONSUMERS_MAP = COMPLETE
CONNECTION_RESOLUTION_MAP = COMPLETE
CAPABILITY_BINDING_MAP = COMPLETE
USAGE_IMPACT = DOCUMENTED
OPENROUTER_HISTORICAL_DATA_POLICY = PRESERVE
MIGRATION_REQUIRED = NO (formato genérico do schema local)
DEEPSEEK_IMPLEMENTATION_SCOPE = DEFINED
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
RUNTIME_FILES_CHANGED = 0
```

## Atualização de evidência — Fase 2 local — 2026-08-19

O mapa da Fase 1 foi executado localmente. A camada compartilhada agora exige
Connection DeepSeek de Plataforma, o R5 usa JSON mode com validação local
JSON/Zod, e as rotas estruturadas auditadas não resolvem provider por ENV.
Admin e health check não expõem OpenRouter; seus dados históricos continuam
preservados.

```text
DEEPSEEK_LOCAL_CUTOVER = PASS
R5_OPENROUTER_DEPENDENCY = REMOVED
ACTIVE_LEGACY_ENV_AI_ROUTES = 0
ACTIVE_OPENROUTER_ADMIN_SELECTION = 0
ACTIVE_OPENROUTER_HEALTH_CHECK = 0
OPENROUTER_FALLBACK_PATHS = 0
PARALLEL_PROVIDER_PATHS = 0
OPENROUTER_HISTORY_PRESERVED = YES
SCHEMA_CHANGED = NO
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
DEEPSEEK_REMOTE_CONNECTION_CONFIGURED = NO
DEEPSEEK_REAL_SMOKE = NOT_RUN
```

As tabelas e ocorrências OpenRouter descritas acima permanecem evidência
histórica da Fase 1; não são consumidores ativos após o corte local.

## Atualização de evidência — Fase 3 preflight remoto read-only — 2026-08-19

O preflight remoto foi executado sem escrita e sem chamada a provider. A
fundação `integration_*`, a capability `ai_generation` (`production`, unidade
`request`), constraints, RLS e ACL do Secret Store passaram. O provider
DeepSeek, porém, ainda não existe no catálogo remoto e não há Connection
DeepSeek da Plataforma.

O catálogo remoto também mantém uma Connection OpenRouter global em
`production`, `READY` e com segredo, além de 37 eventos OpenRouter no ledger.
Esse registro é um conflito de configuração remoto e não deve ser confundido
com um consumidor ativo confirmado no runtime local; nenhuma limpeza ou
alteração foi executada.

```text
DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED
DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

O relatório e o procedimento manual estão em
`docs/compartilhado/runbook-homologacao-deepseek-fase-3-2026-08-19.md`. O
próximo gate deve resolver o conflito remoto e abrir, com mudança local
controlada, o caminho de configuração DeepSeek hoje rejeitado pelo Admin.

`MIGRATION_REQUIRED = NO` é uma conclusão estrutural local: as tabelas
`integration_*` aceitam provider, capability, Connection, segredo referenciado
e metadata de modelo sem enumeração específica de OpenRouter. O catálogo
remoto, a existência de uma capability/Connection DeepSeek e seus estados não
foram consultados nesta fase; isso continua sendo gate da próxima etapa.

## 1. Critério de classificação

- **ACTIVE_RUNTIME:** caminho server-side alcançável que pode gerar ou
  persistir operação de IA.
- **ACTIVE_CONFIGURATION:** código de administração, catálogo, health check,
  ENV ou UI que pode habilitar/configurar um caminho ativo.
- **HISTORICAL_ONLY:** migration, snapshot, baseline ou relatório que não é
  carregado pelo runtime atual.
- **TEST_ONLY:** teste, mock ou fixture sem chamada real.
- **DOC_ONLY:** decisão, contrato ou proposta sem execução.
- **UNKNOWN:** endpoint ou referência que a busca local não conseguiu ligar a
  um consumidor atual; não é tratado como removível.

As classificações abaixo são evidência local. Nenhuma delas prova estado remoto
ou disponibilidade real de credencial.

## 2. Mapa do runtime OpenRouter

| Área | Arquivo/símbolo | Classificação | Evidência observada | Impacto do corte |
| --- | --- | --- | --- | --- |
| Resolver ENV | `lib/server/ai-provider-config.ts:1-77`, `resolveAIProvider` | ACTIVE_RUNTIME | Aceita `AI_PROVIDER = deepseek` ou `openrouter`; resolve `DEEPSEEK_API_KEY`/`OPENROUTER_API_KEY` e URLs diretamente | Precisa deixar de aceitar seleção OpenRouter e passar a resolver Connection DeepSeek |
| IA estruturada compartilhada | `lib/server/structured-ai.ts:26-111`, `generateStructuredAI` | ACTIVE_RUNTIME | Usa `resolveAIProvider()` e `requestProviderContent`; não consulta Connection, capability, binding ou Usage | Migrar todos os consumidores para a fronteira compartilhada governável; retirar retry automático no corte |
| Minerador R5 canônico | `lib/minerador/openrouter-canonical.ts:219-289`, `resolveOpenRouterCanonicalConfig` | ACTIVE_RUNTIME | Consulta resource `ai_generation`, Secret Store via `secret_ref`, metadata `openrouter_model` e URL OpenRouter | É o principal adaptador a substituir por DeepSeek; preserva contrato de diagnóstico/Usage |
| Minerador R5 transporte | `lib/minerador/openrouter-r5.ts:408-819` | ACTIVE_RUNTIME | Request, formato JSON, reasoning, usage e diagnóstico são específicos de OpenRouter | Reusar o contrato de domínio somente depois de separar capacidades oficiais DeepSeek |
| Orquestração R5 | `lib/minerador/semantic-review-orchestrator.ts:90-299` | ACTIVE_RUNTIME | Tipos, diagnósticos e provider literal `openrouter` | Adaptar para provider neutro/DeepSeek sem mudar o contrato editorial |
| Registro R5 | `lib/minerador/semantic-review.ts:740-754` | ACTIVE_RUNTIME | Persiste `provider: "openrouter"` no `ai_review` | Preservar histórico; nova versão deve registrar `deepseek` somente após o corte |
| Rota Minerador | `app/api/process-intent-niche/route.ts:192-412` | ACTIVE_RUNTIME | Modo `semantic_review` usa Connection/Secret Store/Usage; modo legado usa resolução ENV e chamada direta | Migrar os dois ramos e impedir que o ramo legado gere OpenRouter |
| Rotas legadas | `app/api/analyze/route.ts:31-101`, `app/api/clusterize/route.ts:19-72`, `app/api/generate-briefing/route.ts:26-177` | ACTIVE_RUNTIME / UNKNOWN caller | Usam `resolveAIProvider` + `fetchProviderResponse`; busca local não encontrou todos os chamadores de `clusterize`/`generate-briefing` | Auditar chamadas externas e migrar ou bloquear explicitamente antes do zero legado |
| Runtime de integrações | `lib/server/integrations-runtime.ts:29-30,576-664,887-914` | ACTIVE_RUNTIME | `ai_generation` mapeia para `openrouter`; ramo de homologação consulta capability e Connection global, mas retorna `binding: null` e quota ilimitada | Trocar o provider e eliminar o bypass de homologação para o contrato canônico |
| Usage | `lib/server/integrations-runtime.ts:987-1038` | ACTIVE_RUNTIME | R5 grava eventos com `connection_id`, `capability_id`, actor, brand, unidades e metadata sanitizado | Preservar ledger; rotas ENV não possuem o mesmo registro genérico e precisam ser cobertas na migração |
| Admin/health | `lib/server/platform-integrations-admin.ts:19-37,969-1327`; `lib/server/platform-integrations-health.ts:12-211` | ACTIVE_CONFIGURATION | OpenRouter é provider suportado, configurável e testável; DeepSeek direto é rejeitado | Substituir catálogo operacional, configuração e health check por DeepSeek |
| UI Admin | `modules/admin/platform-integrations-panel.tsx:12-68,240-299,404-455` | ACTIVE_CONFIGURATION | A UI oferece DataForSEO/Google Ads/OpenRouter, modelo `provider/model`, chave OpenRouter e health check | Não pode continuar oferecendo nova configuração OpenRouter no destino |
| ENV de exemplo | `.env.example:19-22` | ACTIVE_CONFIGURATION | Declara `AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` | Não é prova de ambiente real; deve ser revisada somente na fase de implementação |

### Conclusão do mapa

OpenRouter participa hoje por dois caminhos diferentes:

1. **Caminho governado parcial:** R5 do Minerador consulta uma Connection de
   Plataforma e Secret Store, mas o `ai_generation` entra no ramo de
   homologação, sem binding/grant/quota efetivos.
2. **Caminho legado por ENV:** resolver compartilhado e rotas antigas escolhem
   provider pelo ambiente e chamam o endpoint diretamente, fora de Connection,
   capability, binding e Usage genérico.

Portanto, o corte não é apenas trocar URL ou modelo. É uma mudança de fronteira
do resolver e de todos os consumidores.

## 3. Consumidores de IA

| Módulo | Consumidor confirmado | Resolução atual | Cliente direto? | Dependência OpenRouter | Impacto esperado |
| --- | --- | --- | --- | --- | --- |
| Minerador | `app/api/process-intent-niche/route.ts` → `resolveOpenRouterCanonicalConfig` → `runKeywordSemanticReview` | Connection global parcial + Secret Store no modo R5; ENV no modo legado | R5 usa adapter OpenRouter; legado chama `fetchProviderResponse` | Explícita no modo R5 e possível pelo ENV no legado | Migrar para DeepSeek compartilhado, manter `ai_review`, Usage e métricas imutáveis |
| Minerador | `app/api/analyze/route.ts`, acionado por `modules/minerador/minerador-workspace.tsx:1088` | `resolveAIProvider` por ENV | Sim, via provider client | Condicional a `AI_PROVIDER` | Migrar para resolver canônico e manter merge de `analise_semantica` |
| Arquiteto | `app/api/arquiteto/article-dna/route.ts:11,57`, `silo-dna/route.ts:9,48`, `silo-page/route.ts:9,54` | `generateStructuredAI` → ENV | Não no módulo; cliente é compartilhado | Condicional a `AI_PROVIDER` | Migrar sem permitir troca de principal, SiloDNA ou SiloPage fora dos contratos humanos |
| Arquiteto | `app/api/revalidate-structure/route.ts:10,59`, chamado por `modules/arquiteto/arquiteto-workspace.tsx:1634` | `generateStructuredAI` → ENV | Cliente compartilhado | Condicional a `AI_PROVIDER` | Migrar e preservar proposta/validação sem reagrupamento silencioso |
| Arquiteto / legado | `app/api/clusterize/route.ts` e `app/api/generate-briefing/route.ts` | `resolveAIProvider` por ENV | Sim, via provider client | Condicional a `AI_PROVIDER`; caller local não localizado para ambos | Confirmar caller externo/legado e migrar ou bloquear antes do corte |
| Radar | Nenhum consumidor de IA encontrado na busca ativa | Não aplicável | Não | Nenhuma dependência DeepSeek/OpenRouter encontrada | Não implementar nesta fase; Radar atual segue contrato SERP separado |
| Planejador | Nenhum consumidor de IA encontrado na busca ativa | Não aplicável | Não | Nenhuma dependência encontrada | Manter fora do corte até existir operação explícita |
| Redator | `app/api/redator/section/route.ts:5,22` e `improve/route.ts:5,16`, chamados por `components/editorial/professional-writer.tsx:114,128` | `generateStructuredAI` → ENV | Cliente compartilhado | Condicional a `AI_PROVIDER` | Migrar para DeepSeek sem alterar ContentPlan, aprovação ou persistência protegida |
| Outros | `app/api/analyze`, `clusterize`, `generate-briefing` | Resolver ENV | Sim, por `provider-client` | Potencial | Não declarar mortos sem fechar a busca de callers e rotas públicas |

Não foi encontrada instanciação de cliente DeepSeek em módulos. A única
implementação local de DeepSeek é a seleção direta por ENV em
`ai-provider-config.ts`; ela não é o adapter arquitetônico alvo.

## 4. Connection, Secret, Capability, Binding e Resolver

### Connection e Secret

O caminho R5 atual executa:

```text
process-intent-niche
  → resolveOpenRouterCanonicalConfig
  → resolveIntegrationResourceForActor
  → integration_connections / integration_providers
  → secret_ref
  → integration-secret-store
  → endpoint OpenRouter
```

O secret payload permitido é exclusivamente `OPENROUTER_API_KEY` em
`lib/minerador/openrouter-canonical.ts:194-209`. O segredo não é retornado ao
browser. O caminho `generateStructuredAI` não segue esse fluxo: usa variáveis
de ambiente diretamente.

### Capability e Binding

O R5 usa `MINERADOR_AI_CAPABILITY_KEY = "ai_generation"` e a tabela de
capability é consultada. Porém `INTEGRATION_RESOURCE_BY_OPERATION` associa
`ai_generation` a `openrouter`; `resolveResourceForActor` então usa
`resolveHomologationResourceForActor`, que seleciona Connection global READY,
não resolve entitlement/binding e devolve `binding = null`. A quota é exposta
como ilimitada pela política de homologação.

Esse é um gap de arquitetura atual, não uma prova de falha remota. A próxima
fase deve decidir e implementar o binding explícito da Connection DeepSeek da
Plataforma para a capability de IA, sem fallback e sem bypass de autorização.

### Usage

O R5 registra um evento por fase com `operation = module_operation`,
`module = minerador`, `units = 1`, `connection_id`, `capability_id`,
`actor_user_id`, `brand_id`, request reference, custo e metadata sanitizado.
Isso deve permanecer compatível no corte. As rotas ENV (`analyze`,
`clusterize`, `generate-briefing` e consumidores de `generateStructuredAI`)
não chamam `recordIntegrationUsageForResource` no código auditado; seu Usage
genérico é uma pendência de migração, não deve ser inventado nesta fase.

## 5. Schema e necessidade de migration

O schema local de `0024_integrations_resource_governance.sql` modela:

- `integration_providers.provider_key` como texto normalizado, sem enum fixo de
  providers;
- `integration_capabilities.operation_kind = ai_generation`;
- `integration_connections` com owner `platform`, `environment`,
  `lifecycle_status`, `secret_ref` e `metadata` JSONB;
- grants, bindings, quotas e Usage ligados por UUID e FKs restritivas.

Logo, a forma do schema consegue representar uma Connection DeepSeek de
Plataforma, sua referência de segredo e um modelo explicitamente resolvido no
metadata, sem tabela nova ou migration de provider. Ainda precisam ser
confirmados no catálogo remoto: provider/capability existentes, constraints
efetivas, Connection atual, estado, Secret Store, grants/bindings e eventuais
policies. Nenhuma consulta remota foi executada nesta fase.

```text
MIGRATION_REQUIRED = NO (schema shape)
REMOTE_CATALOG_STATE = NOT_VALIDATED
SCHEMA_WRITE = 0
```

Se a confirmação remota revelar uma constraint/provider catalog incompatível,
isso deverá abrir uma decisão estrutural separada; não se presume migration
por causa da troca de provider.

## 6. Testes, mocks, fixtures e documentação

### Testes que codificam OpenRouter

- `tests/ai-provider-selection.test.mts:18-125` valida seleção DeepSeek por ENV
  e seleção OpenRouter por ENV.
- `tests/minerador-openrouter-canonical.test.mts:39-161` valida Connection,
  Secret Store, metadata e ausência de ENV no caminho R5.
- `tests/minerador-openrouter-r5.test.mts:65-444` valida endpoint, formato,
  reasoning, usage, truncamento e diagnóstico OpenRouter.
- `tests/minerador-r5-2.test.mts` e `tests/minerador-semantic-review.test.mts`
  preservam contratos/diagnósticos com provider literal OpenRouter.
- `tests/platform-integrations-admin.test.mts:48-160` valida a UI/admin de
  OpenRouter e a rejeição de DeepSeek direto.
- `tests/platform-integrations-health.test.mts:112-188` usa fixtures do health
  check OpenRouter, sem chamada real.

Esses testes são `TEST_ONLY`, não evidência de provider real. Na próxima fase
deverão ser migrados para fixtures DeepSeek e para testes negativos que provem
ausência de fallback, ausência de roteamento paralelo e preservação do estado
anterior.

### Documentação ativa e histórico

As referências conflitantes foram localizadas em:

- `docs/compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md`:
  matriz de OpenRouter e Connections governáveis;
- `docs/compartilhado/sdd-contrato-canonico-integracoes-governanca-consumo-2026-08-10.md`:
  descrição histórica de DeepSeek escolhido primeiro com OpenRouter quando
  ausente;
- `docs/03-minerador/spec.md`, `estado-atual.md` e `backlog.md`: R5 e smoke
  atuais ainda descritos como OpenRouter;
- baselines, migrations e relatórios de refresh: referências históricas a
  provider/Connection/Usage OpenRouter.

Este adendo passa a ser a precedência para a decisão de IA. Referências de
estado anterior e baselines não são apagadas, pois são evidência histórica.

## 7. Plano mínimo da próxima fase

1. Confirmar remotamente, somente leitura, o catálogo de provider/capability,
   Connection, Secret Store, binding/grant, RLS e Usage atuais.
2. Implementar na camada compartilhada um adapter oficial DeepSeek com
   `base_url` controlado, modelo allowlisted e segredo resolvido somente pela
   Connection de Plataforma.
3. Adaptar o resolver para `ai_generation → Connection DeepSeek`, com
   capability/binding explícitos e sem `HOMOLOGATION_ALLOW_ALL` para operação
   de módulo.
4. Migrar primeiro o R5 do Minerador, preservando o contrato de revisão,
   diagnósticos sanitizados, Usage e invariantes quantitativas.
5. Migrar `generateStructuredAI` e as rotas de Arquiteto/Redator, depois
   auditar e migrar/bloquear as rotas legadas `analyze`, `clusterize` e
   `generate-briefing`.
6. Adaptar Admin/health check para DeepSeek e retirar a configuração ativa
   OpenRouter da interface somente após prova de zero consumidores.
7. Executar testes com fixtures, TypeScript/lint/build e smoke autenticado
   manual explícito. Nenhum teste automatizado chama provider pago.
8. Provar zero requisições OpenRouter no runtime, envs ativas, UI, mocks e
   documentação operacional. Só então classificar OpenRouter como retired;
   manter Usage e registros históricos legíveis.

## 8. Riscos, pendências e operações futuras

### Riscos

- O contrato R5 atual depende de capacidades específicas de JSON, reasoning,
  limites e diagnósticos do OpenRouter; equivalência DeepSeek deve ser
  confirmada por contrato e fixtures antes de qualquer smoke.
- O target pede `deepseek-v4-pro`, enquanto o resolver ENV atual usa
  `deepseek-chat` (`lib/server/ai-provider-config.ts:67`). Isso é divergência
  de configuração, não autorização para ajustar agora.
- O retry automático de timeout em `structured-ai.ts:59-111` contraria a regra
  de retry somente explícito e deve ser removido/adaptado na implementação.
- O bypass de homologação pode mascarar a ausência de grants/bindings reais;
  sua substituição precisa preservar isolamento e autorização.
- Rotas públicas legadas sem caller local identificado não podem ser removidas
  sem uma busca final de chamadas externas e um gate de zero consumidores.

### Pendências

- Catálogo remoto e Connection DeepSeek ainda não validados.
- Contrato oficial de modelo, formatos estruturados, reasoning, limites e
  códigos de erro ainda não validado por chamada real.
- Política de Usage para rotas legadas ainda não uniformizada.
- Testes e fixtures ainda codificam OpenRouter.
- Nenhuma decisão de limpeza de Connection/Usage/histórico foi tomada.

### Operações manuais futuras

Somente após aprovação da próxima fase, o usuário deverá executar manualmente
o preflight remoto read-only, configurar/validar a Connection DeepSeek no
secret store aprovado, executar health check explícito, fazer um smoke pago
controlado e confirmar readback/Usage. Nenhuma dessas operações ocorreu nesta
fase.

## Atualização — Fase 3A: configuração administrativa local — 2026-08-19

A Fase 3A implementou, sem operação remota, o caminho administrativo canônico
para a futura Connection DeepSeek da Plataforma. O card em
`/admin?tab=integracoes` abre um formulário com API Key password obrigatória,
modelo `deepseek-v4-pro` e endpoint `https://api.deepseek.com` somente leitura.

O writer protegido por `requireCanonicalPlatformAdmin` localiza ou cria o
provider suportado, reutiliza a única Connection `platform/production`, grava
o payload permitido no Secret Store/Vault e retorna somente o readback
sanitizado. A Connection fica `pending` até o health check explícito; não há
health check automático, OpenRouter selecionável, segredo no cliente ou
duplicação de Connection.

```text
DEEPSEEK_ADMIN_CONFIGURATION_UI = IMPLEMENTED
DEEPSEEK_SECRET_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONNECTION_SERVER_WRITER = IMPLEMENTED
DEEPSEEK_CONFIGURATION_READBACK = IMPLEMENTED
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
DEEPSEEK_REMOTE_CONFIGURATION = NOT_RUN
DEEPSEEK_PROVIDER_HOMOLOGATED = NOT_RUN
```

O preflight remoto permanece `DEEPSEEK_REMOTE_PREFLIGHT = BLOCKED`: provider e
Connection DeepSeek não existiam no snapshot observado, enquanto a Connection
OpenRouter histórica continuava ativa. Essa divergência não foi alterada.

## 9. Aceite da Fase 1

```text
DEEPSEEK_ARCHITECTURE_ADENDUM = READY
OPENROUTER_RUNTIME_MAP = COMPLETE
AI_CONSUMERS_MAP = COMPLETE
CONNECTION_RESOLUTION_MAP = COMPLETE
CAPABILITY_BINDING_MAP = COMPLETE
USAGE_IMPACT = DOCUMENTED
OPENROUTER_HISTORICAL_DATA_POLICY = PRESERVE
MIGRATION_REQUIRED = NO
DEEPSEEK_IMPLEMENTATION_SCOPE = DEFINED
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
RUNTIME_FILES_CHANGED = 0
```


