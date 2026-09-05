# Auditoria da interface e dos contratos de integrações — 2026-08-10

## Escopo e classificação da evidência

Auditoria local, sem implementação visual, alteração de schema, migration,
operação remota, chamada paga, provider, Vault, Communication, notificação,
commit, push ou deploy.

As conclusões abaixo distinguem código local, API interna, persistência
remota prevista pelo código, estado local e mock/placeholder. Nenhum estado
remoto atual de provider foi revalidado nesta auditoria.

### Precedência documental — Google Ads (revisada em 2026-08-24)

As linhas de Google Ads abaixo são um retrato local/histórico da interface e
dos consumidores na data da auditoria. O contrato atual separa configuração
estática em ENV do OAuth Refresh Token no Secret Store, apontado pela
Connection global e rotacionável somente pelo Admin global. DataForSEO e
OpenRouter permanecem Connections governáveis; fatos de implementação e smokes
continuam separados.

## Matriz de superfícies

| Área | Rota | Provider/recurso | Contexto | Campos atuais | Fonte dos dados | Contrato correto | Problema encontrado | Ação recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Administração geral | `/admin?tab=visao-geral` | Empresas, acessos, alertas e falhas | Plataforma | empresas administradas, acessos delegados, alertas, falhas | `useBrand()` para empresas; os demais valores são `0` hardcoded | Resumo de plataforma baseado em usage/auditoria reais | Métricas de acesso, alertas e falhas não são dados operacionais; a UI informa que não há persistência aplicada | Manter como placeholder explícito até existirem entidades e consultas aprovadas |
| Planos | `/admin?tab=planos` | Plano/entitlement | Plataforma | apenas título e mensagem de dependência | UI hardcoded; sem API ou schema confirmado | Entitlement separado de conexão e quota | Não existe implementação funcional | Não criar campos ou estados antes do contrato de entitlement |
| Consumo | `/admin?tab=consumo` | Quota/usage | Plataforma | apenas título e mensagem de dependência | UI hardcoded; sem API ou schema confirmado | Uso, custo, limite e saldo auditáveis | Não existe implementação funcional | Criar depois do contrato de `integration_usage_events`/quota aprovado |
| Configuração global | `/admin?tab=configuracoes` | Communication/Resend | Plataforma | provider, status, health, remetente, domínio, credencial configurada | API interna `/api/admin/communication`; fora do escopo desta auditoria | Connection e health de comunicação separados | Superfície existe, mas Communication permanece estacionada por decisão do módulo | Não ampliar nesta frente |
| Configuração da Agência | `/agencias/{agencyRef}/configuracoes` | Dados operacionais da Agency | Agência | nome, status, referência técnica, data de criação | `getAgencyWorkspaceData` server-side e formulário interno | Agency operacional separada de integrações, grants e quota | Não há configuração de provider, connection, entitlement ou uso | Preparar futura superfície `/agencias/{agencyRef}/integracoes` somente após SDD/contrato |
| Configuração Google Ads | `/{brandRef}/?secao=configuracoes` | Google Ads | Marca | customer ID mascarado, MCC mascarada, idioma, localidades, rede, adult keywords, moeda, timezone, `validatedAt`, status | GET/POST interno `/api/minerador/marcas/{brandId}/google-ads/conexao`; POST chama Google OAuth/Google Ads e grava `minerador_google_ads_connections` | Connection explícita, capability, binding e uso separados | A UI mistura configuração operacional da marca com a futura arquitetura de conexão global da Plataforma; não mostra entitlement nem quota | Preservar como contrato de transição; não redesenhar antes da decisão de corte |
| Descoberta | `/{brandRef}/minerador/descobrir` | Google Ads Keyword Ideas | Marca, com operação do Minerador | seed, país, estados, idioma, rede, adult keywords, filtros de volume/CPC, execução, candidatas, targeting, provider/version | API interna tenantizada e persistência de `discovery_runs`/candidates; chamada externa somente no submit | Capability e connection resolvidas server-side; resultado e uso atribuídos a Agency/Brand/Actor | A interface mostra targeting e resultado, mas não mostra origem efetiva da conexão, entitlement ou quota | Adicionar somente numa futura superfície de integração/usage aprovada |
| Medição de volume | `/{brandRef}/minerador` | Google Ads | Marca | volume, histórico, CPC, concorrência, status da medição, provider, data, erros | POST `/api/minerador/marcas/{brandId}/google-ads/metricas-keywords`; persistência de medição e projeção em `keywords_kgr` | Usage separado de projeção editorial; falha preserva medição anterior | Botão “Atualizar métricas” é explícito, mas a UI não apresenta custo, saldo, quota ou origem efetiva | Preservar a ação; expor usage apenas após contrato de quota/auditoria |
| Medição allintitle | `/{brandRef}/minerador` | DataForSEO | Marca, com operação do Minerador | resultados allintitle, estado, executor, provider, data, erro, `operationRequestId` | POST `/api/minerador/marcas/{brandId}/dataforseo/allintitle`; DataForSEO lê `DATAFORSEO_*` do ambiente server-side | Connection DataForSEO de Agência/Plataforma, capability e usage por Agency/Brand/Actor | Não existe UI de connection; credencial única global de env contraria o destino futuro por Agência, embora seja o contrato provisório documentado | Não criar tela isolada sem migration/SDD; migrar primeiro o resolvedor e a auditoria de uso |
| Radar SERP | `/{brandRef}/radar` e `/{brandRef}/radar/{articleId}` | Serper | Marca, módulo Radar | provider, origem, `isMock`, estado, snapshot, diagnóstico, modo de persistência, custo | API interna `/api/editorial/serp` e provider server-side Serper; mocks/estado local também existem | Provider legado separado da origem do snapshot; coleta real explícita e sem fallback | Serper ainda é consumidor produtivo, apesar de estar classificado como legado a remover; “real” não é connection health e `cost` chega nulo | Não reintroduzir nem ampliar Serper; manter apenas até paridade/corte aprovado |
| Validação SERP de formação | `/{brandRef}/arquiteto` | Serper | Marca, módulo Arquiteto | consultas previstas, modo editorial, número de keywords, snapshots e aviso de crédito | `/api/arquiteto/serp`, chamadas Serper server-side e snapshots locais/remote conforme repositório | Capability de evidência do Arquiteto, sem alterar ArticleDNA automaticamente | A ação é explícita, mas pode disparar várias consultas em paralelo; provider e quota não aparecem como connection/entitlement | Manter bloqueada a qualquer troca de provider até paridade aprovada |
| IA editorial | Arquiteto, Minerador, Redator e APIs de análise | DeepSeek/OpenRouter | Marca/módulo | origem “IA aplicada”, estados de tarefa, proposta e revisão humana | APIs internas; chaves server-side por env; providers externos em ações explícitas | Provider/connection escolhido explicitamente, capability, limite e usage auditável | `lib/server/structured-ai.ts` e várias rotas fazem fallback automático DeepSeek → OpenRouter; isso conflita com a regra de não haver fallback silencioso | Exigir decisão de provider/capability antes de qualquer ajuste visual ou estrutural |

## Inventário por conceito

### Authorization

- Acesso às rotas Google Ads é validado server-side por sessão, `brandId` e
  `minerador:manage`/permissão do módulo.
- Descoberta, métricas, allintitle, Radar e Arquiteto validam sessão e marca
  antes da chamada externa.
- Nenhuma interface de integração da Agência concede atualmente autorização
  de provider; memberships e capacidades da Agency são outra camada.

### Entitlement

- Não há tela nem entidade funcional de entitlement de integração.
- “Conectada e validada”, “SERP real” e “IA aplicada” não significam recurso
  liberado por capability.
- `volume_eligibility` e filtros de descoberta são resultados/parâmetros da
  operação, não entitlement.

### Connection / credential

- Google Ads possui conexão operacional por marca em
  `minerador_google_ads_connections`, com credenciais técnicas globais no
  ambiente do servidor.
- DataForSEO usa `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` globalmente no
  processo; não há conexão por Agência.
- Serper usa `SERP_PROVIDER`, `SERPER_API_KEY` e parâmetros `SERPER_*` no
  servidor; não há tela de configuração.
- IA usa `DEEPSEEK_API_KEY` ou `OPENROUTER_API_KEY` no servidor; não há tela de
  connection.

### Quota / consumo

- O código possui erros de quota/rate limit para Google Ads e guarda custo ou
  metadados técnicos em alguns históricos, mas a interface não apresenta
  quota, saldo, custo agregado ou distribuição por Agency/Brand.
- `/admin?tab=consumo` é placeholder e não prova usage real.
- Não existe fallback de provider para resolver ausência de quota de forma
  legítima; o fallback de IA encontrado é um problema separado de seleção de
  provider.

### Usage / auditoria

- Google Ads registra `operationRequestId`, provider/version, `measuredAt` e
  históricos de métricas.
- DataForSEO registra `operationRequestId`, resultado, erro, provider/version,
  histórico e custo quando retornado pelo provider.
- Radar preserva snapshots, origem e modo de persistência, mas a rota atual
  monta `cost: null`.
- Esses registros são auditoria de operação, não substituem entidade de
  connection, entitlement ou quota.

### Status

| Integração | Status encontrado | Semântica real observada | O que não representa |
| --- | --- | --- | --- |
| Google Ads | `validated` / “Conectada e validada” | Conta consultada e configuração persistida após chamada externa | Não prova entitlement, quota disponível ou uso restante |
| DataForSEO | erro `dataforseo_configuration`, medição atual/failed | Configuração ausente ou resultado da medição | Não existe status de connection administrável |
| Serper | `not_configured`, `provider_http`, registro `needs_review`, origem `real`/`mock` | Estado da chamada ou do snapshot editorial | Não é health/entitlement/quota |
| IA | estado da tarefa/proposta e `origin: ai` | Proposta gerada e sujeita a revisão humana | Não identifica provider efetivo nem limite |

## Providers e segredos

### Google Ads

Encontrado e ativo no código. O servidor lê `GOOGLE_ADS_DEVELOPER_TOKEN`,
`GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
`GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_API_VERSION` e o MCC opcional. A UI
envia somente customer/MCC/targeting e recebe IDs mascarados; não recebe
refresh token, client secret ou developer token.

“Validar e conectar Google Ads” é uma ação explícita, server-side, que chama
OAuth/Google Ads e persiste a conexão. Não é executada ao abrir a tela. Pode
consumir quota do provider; não existe uma ação separada de health sem chamada.

### DataForSEO

Encontrado e ativo para allintitle. A credencial global é lida server-side de
`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`; a UI não exibe nem edita esses
valores. A chamada só ocorre em “Medir resultados”/ações equivalentes. Sem
credencial, a rota falha antes do provider.

### Serper

Encontrado como consumidor produtivo do Radar e da validação SERP do
Arquiteto. A chave `SERPER_API_KEY` e a URL-base são server-side. A coleta é
explícita e há aviso de crédito; não foi localizada chamada automática ao
abrir a tela. Serper permanece legado ativo e não deve ser usado em nova
superfície ou como fallback.

### IA

Foram encontrados DeepSeek e OpenRouter. Também há configuração de
`openai_api_key` no `supabase/config.toml`, mas não foi localizado consumidor
da aplicação para classificá-lo como provider ativo do produto.

As chaves de IA permanecem server-side. O problema confirmado é semântico:
quando DeepSeek não está configurado, o runtime escolhe OpenRouter
automaticamente. Isso oculta a origem efetiva e pode alterar custo, modelo e
quota sem decisão explícita.

### Providers não confirmados

Não foi localizada configuração funcional de WordPress, conexão de Agência,
OpenAI direto no runtime da aplicação ou outro provider operacional para esta
frente. Não devem ser inventados na interface.

## Ações “Testar conexão”

| Provider | Ação existente | Chamada real | Server-side | Pode gerar custo/quota | Altera status/persistência |
| --- | --- | --- | --- | --- | --- |
| Google Ads | “Validar e conectar Google Ads”; “Revalidar e substituir conexão” | Sim | Sim | Sim, ao consultar OAuth/conta | Sim, grava/atualiza conexão como `validated` |
| DataForSEO | Não há botão de connection; “Medir resultados” é operação real | Sim | Sim | Sim | Atualiza medição/histórico, não connection status |
| Serper | “Coletar SERP” e “Confirmar validação SERP” | Sim | Sim | Sim | Cria snapshot/assessment e pode persistir revisão |
| IA | Ações de geração/análise, não “testar conexão” | Sim | Sim | Sim | Cria proposta/resultado da ação; não há connection status |

Todas as ações identificadas são iniciadas por interação explícita. A
abertura das telas faz apenas leituras, restauração de snapshot ou leitura de
configuração; não foi localizada chamada externa automática de provider no
carregamento dessas superfícies.

## Auditoria visual

### Pontos conformes

- Google Ads usa labels visíveis, campos com foco, botões de aproximadamente
  40px, estados de carregamento/erro/sucesso e composição responsiva.
- Admin e Agência exibem estados vazios explícitos quando entidades ainda não
  existem, sem inventar consumo ou planos.
- Radar e Arquiteto distinguem dados reais de dados simulados em texto e
  estados de revisão.

### Divergências encontradas

- A interface de integração está fragmentada entre Admin, Marca, Minerador,
  Radar e Arquiteto; não há hierarquia Plataforma → Agência → Marca para
  connection, grant, entitlement e usage.
- Há uso intenso de classes visuais hardcoded (`bg-slate-*`, `text-slate-*`,
  `bg-black` e valores hex inline) em telas de integração/editoriais, em vez
  dos tokens semânticos centrais.
- Minerador, Radar e Arquiteto usam textos de `9px`, `10px`, `11px` e `12px`
  em labels, tabelas, ações ou feedback essencial, abaixo do mínimo de 14px
  definido para interface.
- Admin overview usa métricas `0` e textos pequenos para blocos que parecem
  operacionais, embora sejam placeholders.
- Não há prova manual nesta auditoria de light mode, dark mode, 360/768/1024/
  1440px, teclado ou estados interativos completos. A revisão foi estática.

## Riscos e decisões

1. **Conflito confirmado:** fallback automático DeepSeek → OpenRouter em
   `lib/server/structured-ai.ts` e em rotas antigas. Isso viola a regra de
   provider explícito e precisa de decisão antes de uma nova UI de IA.
2. **Divergência de arquitetura em transição:** Google Ads ainda é operado por
   marca; DataForSEO ainda usa env global; a SDD aprovada planeja Google Ads
   global e DataForSEO por Agência. O código e a spec atual reconhecem essa
   transição; não autoriza uma tela nova a fingir que o destino já existe.
3. **Legado Serper:** há chamadas reais e cópias de contrato `provider:
   serper` no Radar/Arquiteto. Não é fallback aceitável nem provider para uma
   nova superfície.
4. **Quota ausente na interface:** status de conexão e resultado de operação
   não informam limite, saldo, custo ou distribuição por escopo.
5. **Segredos:** não foi encontrada exposição clara de chaves de Google Ads,
   DataForSEO, Serper ou IA no browser. A proteção observada é server-side;
   a futura gestão deve continuar sem retornar segredo, Authorization ou
   credencial completa.

## Ordem recomendada, sem implementar nesta tarefa

1. Fechar a decisão de provider explícito para IA e remover a ambiguidade de
   fallback no contrato antes de criar estados visuais.
2. Aprovar a matriz Platform/Agency/Brand de connections, grants, bindings,
   capabilities, environments, quota e usage.
3. Auditar e definir o corte Google Ads global e DataForSEO por Agência, sem
   alterar a UI transitória atual prematuramente.
4. Definir a substituição de Serper por DataForSEO com paridade de contratos,
   fixtures, persistência e smoke autenticado; somente depois remover legado.
5. Criar primeiro a superfície de leitura sanitizada de integrações, depois
   ações explícitas de cadastrar/testar/rotacionar/revogar e, por último,
   quota/usage agregado.
6. Fazer revisão visual das superfícies afetadas usando tokens semânticos,
   tipografia mínima, estados vazios, dark/light e larguras responsivas.

## Resultado

`INTEGRATIONS_CONTRACT_CONFLICT_FOUND`

Motivo: a auditoria encontrou o fallback silencioso de IA, além de providers
legados e conexões ainda em transição. Nenhuma implementação visual nova está
autorizada por este relatório.
## Google Ads — canonical cutover gate — 2026-08-12

The first runtime migration is blocked by a concrete schema/contract gap, not by a provider failure. The shared integration layers exist, but current Google Ads routes still read/upsert `minerador_google_ads_connections` and do not resolve canonical capability, grant, binding, quota and usage. The approved SDD does not provide typed destinations for the Customer-to-MCC relationship, Brand-specific targeting parameters, current external-account metadata or last validation state.

Do not place Brand configuration into Platform connection metadata, create a mirror table, or add a silent legacy fallback. The next gate is an explicit structural decision, followed by a coordinated server-side cutover and readback. `GOOGLE_ADS_CANONICAL_SCHEMA_GAP = YES`; `REMOTE_OPERATION = NONE`.
