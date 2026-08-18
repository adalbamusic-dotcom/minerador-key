# SDD — contrato canônico de integrações e governança de consumo

- **Status:** Aprovada para implementação local do schema mínimo
- **Implementação:** Migration local 0024 preparada; consumidores não adaptados
- **Operações remotas:** Nenhuma
- **Módulo proprietário:** Integrações / APIs / Governança de consumo
- **Data:** 2026-08-10
- **Base:** `auditoria-interface-integracoes-2026-08-10.md`
- **Referência arquitetural:** `sdd-arquitetura-integracoes-plataforma-agencia-marca.md`

Esta SDD consolida os conflitos encontrados na auditoria local. Ela não
implementa interface, resolvedor, provider, segredo ou operação remota. A
migration local 0024 materializa somente o schema mínimo aditivo; ela não
executa backfill, seed, adaptação de consumidores, quota operacional ou
chamada remota. A SDD arquitetural de referência continua sendo a
base dos contratos de escopo, grants, bindings, segurança e transferência de
marca; este documento acrescenta o inventário de consumidores e o contrato de
governança necessário antes de qualquer nova UI.

### Precedência do adendo canônico de 2026-08-16

Para Google Ads, as passagens deste inventário que descrevem uma Connection,
Vault, `secret_ref`, grant ou binding como destino de configuração são
proposta/transição anterior e não prevalecem sobre a SDD arquitetural. O
destino aprovado agora é `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV`, com
disponibilidade global durante a homologação. As descrições de consumidores e
do estado local abaixo permanecem evidência histórica; não comprovam que o
target já foi implementado nem autorizam migration. DataForSEO e OpenRouter
continuam sujeitos ao contrato de Connection governável.

## 1. Decisão central

Os cinco conceitos abaixo são distintos e não podem ser representados por um
único campo `active`, por uma credencial ou por um nome de plano:

| Conceito | Significado canônico | Não significa |
| --- | --- | --- |
| **Authorization** | ator autenticado e autorizado a executar uma ação no escopo | provider disponível ou quota liberada |
| **Entitlement** | capability concedida ao escopo, no ambiente e período permitidos | membership, owner ou credencial |
| **Connection / Credential** | configuração concreta de um provider, com owner e pagador definidos | entitlement ou autorização editorial |
| **Quota / Consumption** | limite e unidades disponíveis/consumidas para uma capability e escopo | status da conexão |
| **Usage / Audit** | evento sanitizado e append-only da tentativa/consumo | estado atual ou autorização |

O runtime deve resolver nesta ordem: sessão/autorização → capability e
entitlement → binding explícito → connection concreta → quota → chamada
server-side → usage/auditoria. Uma falha não escolhe silenciosamente outro
provider, connection, agência, marca ou plano.

## 2. Hierarquia Platform → Agency → Brand

### Plataforma

- mantém o catálogo de providers e capabilities;
- pode possuir connections globais e definir limites por ambiente;
- concede entitlements/grants a Agências ou Marcas conforme política explícita;
- lê usage global e auditoria dentro do escopo autorizado;
- não se torna owner, membership ou tenant de uma Marca.

### Agência

- pode possuir connections próprias permitidas;
- recebe recursos globais por entitlement;
- distribui ou restringe capabilities entre suas Brands vinculadas;
- administra bindings e usage da própria Agência conforme permissões;
- não recebe segredo da Plataforma por causa de um grant.

### Marca

- continua tendo `brandId = public.marcas.id` como owner dos dados gerados;
- recebe a capability por origem `platform_granted`, `agency_granted`,
  `agency_owned` ou `brand_owned`, conforme o binding;
- pode manter uma restrição explícita (`unavailable`) para uma capability
  permitida pela Agência;
- visualiza apenas origem, estado, limites e uso sanitizados;
- nunca visualiza credencial ou segredo da Agência/Plataforma.

Membership, owner, authorization de módulo e entitlement são verificações
separadas. A Agência pode administrar os bindings das Brands às quais está
vinculada, mas uma restrição explícita da Brand não deve ser ultrapassada por
fallback ou inferência.

## 3. Provider, connection e pagador

`provider` identifica a tecnologia ou serviço: Google Ads, DataForSEO,
DeepSeek ou OpenRouter. `connection` identifica uma configuração concreta
desse provider, com owner de escopo único (`platform`, `agency` ou `brand`),
ambiente, status e material secreto protegido server-side.

Exemplo válido:

```text
provider = dataforseo
connection A = owner agency-X
connection B = owner platform
binding da Agency = connection A
```

O resolvedor usa somente o binding válido do escopo. Ele nunca escolhe “o
primeiro registro”, a connection mais recente, uma connection de outra
Agência ou outra credencial porque a escolhida falhou. A connection efetiva
define quem fornece e paga o recurso; `brandId` define onde o resultado
editorial é persistido.

## 4. Consumidores atuais e impacto

| Capability/provedor | Consumidores verificados | Contrato atual | Destino canônico | Impacto |
| --- | --- | --- | --- | --- |
| Google Ads | `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts`, `descobrir-keywords/route.ts`, `metricas-keywords/route.ts`, `modules/marca/google-ads-connection-panel.tsx` | metadados operacionais por Marca em `minerador_google_ads_connections`; OAuth/developer token em env server-side | connection global da Plataforma, entitlement para Agência e binding para Brand; conexão própria de Agência somente se capability futura for aprovada | preservar a tabela e os dados durante a transição; migrar o resolvedor antes de retirar a leitura por Marca |
| DataForSEO | `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts`, `lib/minerador/dataforseo-serp-core.ts`, ações do Minerador | `DATAFORSEO_LOGIN/PASSWORD` global por ambiente | connection própria da Agência ou connection da Plataforma explicitamente concedida | criar resolução por binding e usage; não atribuir a credencial global a uma Agência retroativamente sem prova |
| IA | `lib/server/structured-ai.ts`, `app/api/analyze/route.ts`, `clusterize/route.ts`, `generate-briefing/route.ts`, `process-intent-niche/route.ts`; consumidores estruturados do Arquiteto e Redator | DeepSeek escolhido primeiro e OpenRouter escolhido silenciosamente quando DeepSeek não existe | provider/connection selecionado explicitamente por capability e ambiente | remover o fallback atual; erro explícito quando a origem selecionada não estiver disponível |
| Serper | `lib/radar/serper-provider-core.ts`, `serper-provider.ts`, `app/api/editorial/serp/route.ts`, `app/api/arquiteto/serp/route.ts`, contratos Radar, testes e fixtures | consumidor produtivo legado com `SERPER_*` e literal `provider: serper` | inexistente na arquitetura futura; DataForSEO é o provider orgânico canônico | manter somente até paridade e gate de corte; não criar UI, connection ou fallback novos |

Os resultados Google Ads, DataForSEO e SERP continuam tenantizados por
`brandId`. O registro de consumo também deve carregar `agencyId` quando a
Marca estiver vinculada a uma Agência, além de `actorUserId` e da connection
efetivamente usada.

## 5. Google Ads — contrato canônico

Google Ads é capability global inicialmente fornecida pela Plataforma:

```text
Platform connection Google Ads
    → entitlement/grant para Agency
    → binding explícito da Brand
    → operação server-side
    → resultado persistido por brandId
    → usage por connection, agencyId, brandId e actorUserId
```

- a Plataforma controla OAuth operacional, developer token, MCC e demais
  segredos da connection global;
- a Agência não recebe a credencial por possuir ou operar uma Brand;
- a Brand fornece parâmetros de operação permitidos, não a credencial;
- `minerador_google_ads_connections` é contrato transitório por Marca, não
  prova de ownership da credencial e não deve ser apagada no corte;
- `validated` atual significa que a conta foi consultada e seus metadados
  foram persistidos; não significa entitlement nem quota disponível;
- descoberta e métricas não podem executar sem authorization, binding,
  entitlement e quota válidos;
- ausência, quota ou erro preserva resultados anteriores e retorna erro
  sanitizado.

O corte Google Ads exige backfill/associação comprovada de connection,
bindings explícitos por capability, leitura paralela controlada, smoke
autenticado por Brand e rollback para a leitura transitória sem apagar dados.

## 6. DataForSEO — contrato canônico

DataForSEO é o provider orgânico principal. A origem pode ser:

- `agency_owned`: connection criada e administrada pela Agência;
- `platform_granted`: connection da Plataforma concedida explicitamente;
- `unavailable`: nenhuma origem autorizada.

A escolha pertence ao binding da Agência e, quando necessário, à distribuição
para a Brand. Se a origem escolhida estiver inválida, suspensa, sem quota ou
indisponível, o runtime retorna erro explícito. Não troca para outra connection
ou provider automaticamente.

Cada operação registra, no mínimo, `actorUserId`, `agencyId`, `brandId`,
`connectionId`, provider, capability, operação, ambiente, unidades, custo
quando conhecido, resultado, timestamp e correlação sanitizada do provider.
O resultado allintitle permanece pertencente à Brand; usage e pagamento ficam
atribuídos à connection e à Agência/Plataforma que a fornece.

`DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD` permanecem apenas como contrato
transitório server-side até existir cadastro administrativo de connection. A
SDD não autoriza sua migração, leitura remota ou alteração nesta tarefa.

## 7. IA — remoção do fallback silencioso

O conflito confirmado está em dois formatos:

1. `lib/server/structured-ai.ts` escolhe OpenRouter quando
   `DEEPSEEK_API_KEY` não existe;
2. as rotas legadas de análise repetem a escolha DeepSeek → OpenRouter.

Consumidores auditados:

- `app/api/analyze/route.ts`;
- `app/api/clusterize/route.ts`;
- `app/api/generate-briefing/route.ts`;
- `app/api/process-intent-niche/route.ts`;
- `lib/server/structured-ai.ts`;
- `app/api/arquiteto/article-dna/route.ts`;
- `app/api/arquiteto/silo-dna/route.ts`;
- `app/api/arquiteto/silo-page/route.ts`;
- `app/api/arquiteto/revalidate-structure/route.ts`;
- `app/api/redator/section/route.ts`;
- `app/api/redator/improve/route.ts`.

Contrato canônico:

```text
provider/capability explicitamente selecionado
    → connection correspondente
    → tentativa server-side
    → sucesso ou erro explícito
```

Se o provider selecionado não estiver configurado, falhar com código
sanitizado de indisponibilidade. Não escolher outra chave, modelo, gateway ou
connection. Um fallback futuro só poderá existir após política própria,
capability, limite, pagador, auditoria e aprovação explícita; esta SDD não
define essa política.

Correção mínima futura, fora desta tarefa: centralizar a seleção explícita,
remover as quatro condições de fallback das rotas legadas e manter o provider
selecionado visível no resultado/usage. A repetição de uma tentativa contra o
mesmo provider, se mantida, deve continuar sendo distinguida de fallback e
ser limitada/auditada.

## 8. Serper — legado e retirada posterior

Serper permanece ativo no código e nos testes, apesar de a arquitetura futura
já o classificar como legado. O inventário atual inclui:

- `lib/radar/serper-provider-core.ts` e reexport `serper-provider.ts`;
- `app/api/editorial/serp/route.ts`;
- `app/api/arquiteto/serp/route.ts`;
- `lib/radar/evidence-package.ts` e `lib/radar/analysis-contracts.ts`;
- testes `radar-serper-provider`, `arquiteto-serp-formation`, persistência,
  merge, contexto KGR, relatório competitivo e análise Radar;
- fixtures com `provider: "serper"`;
- documentação ativa do Radar e proposta de providers do Minerador.

Não remover nem renomear snapshots nesta SDD. A retirada posterior exige:

1. contrato DataForSEO equivalente para cada consumidor;
2. fixtures e testes sem chamada real;
3. persistência compatível ou migração de leitura aprovada;
4. gate autenticado por Radar e Arquiteto;
5. prova de ausência de Serper em código, rotas, envs, mensagens, tipos,
   testes, mocks, fixtures e documentação ativa;
6. rollback que preserve snapshots e histórico.

Enquanto isso, Serper não pode aparecer em nova UI de conexão, não pode ser
fallback e não pode ser citado como arquitetura futura.

## 9. Estados separados

As máquinas são conceituais e não autorizam enum ou migration nesta tarefa.

### Connection

`NOT_CONFIGURED` → `VALIDATING` → `READY` ou `ERROR`; estados operacionais
adicionais: `DISABLED` e `REVOKED`.

`READY` significa connection suficiente para a operação autorizada tentar o
provider, salvo se uma SDD específica aprovar semântica mais forte. Não prova
entitlement, quota ou sucesso futuro.

### Entitlement

`AVAILABLE`, `NOT_AVAILABLE`, `SUSPENDED`, com capability, escopo, ambiente,
vigência, limites e motivo auditáveis.

### Quota

`AVAILABLE`, `NEAR_LIMIT`, `EXHAUSTED`, `UNLIMITED`, com unidade, janela,
limite, reserva/consumo confirmado e origem da política.

O status de uma tela nunca deve substituir esses três estados. `validated`,
`real`, `AI applied`, `needs_review` e estado de tarefa editorial continuam
sendo estados específicos de seus contratos atuais.

## 10. Contrato mínimo de quota e usage

Uma tentativa ou consumo deve carregar:

| Campo | Regra |
| --- | --- |
| `actorUserId` | ator autenticado que iniciou ou administrou a ação |
| `agencyId` | obrigatório para operação de Agency ou Brand vinculada |
| `brandId` | obrigatório em `module_operation`; nulo apenas em testes administrativos autorizados |
| `connectionId` / `sourceScope` | origem concreta e owner da connection |
| `provider` / `capability` | tecnologia e recurso específico |
| `operationKind` | `connection_test`, `health_check`, `administrative_validation` ou `module_operation` |
| `units` | quantidade e unidade do consumo |
| `cost` / `currency` | quando o provider informar ou o contrato estimar com segurança |
| `status` | tentativa, sucesso, falha, bloqueio ou confirmação definida pelo contrato |
| `occurredAt` / período | instante e janela da quota |
| correlação sanitizada | request ID ou referência técnica sem segredo/payload sensível |

Planos podem produzir entitlements, mas consumidores não usam `FREE`, `PRO` ou
`PREMIUM` como regra de autorização, provider ou quota. O Admin deve mostrar
“não configurado” ou “não disponível” quando não houver dado persistido; nunca
transformar placeholder em consumo real.

## 11. Interfaces futuras, sem implementação

| Superfície | Campos de leitura | Campos editáveis e autoridade | Segredo/chamada real |
| --- | --- | --- | --- |
| Plataforma / Integrações | provider, capability, owner `platform`, ambiente, connection status, grants, entitlement máximo, quota, usage global e última validação sanitizada | cadastrar/rotacionar/revogar connection; conceder/revogar grant; administrar limites; somente Platform admin | segredo nunca aparece; testar/validar é ação explícita server-side e pode chamar provider |
| Agência / Integrações | connections próprias, grants recebidos, bindings das Brands vinculadas, origem efetiva, entitlement, quota disponível/usada, usage por Brand e actor | cadastrar/testar/revogar connection própria; escolher binding; conceder/restringir Brand conforme permissão | segredo somente no formulário server-side controlado; nenhuma leitura devolve valor; ação real exige confirmação explícita |
| Marca / Recursos disponíveis | capability disponível, origem Plataforma/Agência, status separado, restrições, quota/uso da Brand, operations permitidas | Brand owner ou papel autorizado pode restringir capability; não edita connection alheia nem grant da Agência | somente metadados sanitizados; qualquer teste/operação real é explícito e server-side |

As telas não devem expor existência de connection secreta além do necessário,
nem permitir que o browser escolha livremente `connectionId` sem validação do
binding e da autorização no servidor.

## 12. Schema atual reutilizável e impacto

### Reutilizar

- `auth.users` e sessão/`auth.uid()` para identidade do ator;
- `agencies.owner_user_id`, `agency_memberships` e `agency_brands` para
  autorização e vínculo Agency–Brand;
- `public.marcas.id`/`brandId` para tenant dos resultados;
- `minerador_google_ads_connections` como fonte transitória de metadados por
  Marca, sem tratá-la como connection canônica global;
- tabelas de discovery, métricas, keywords e snapshots como dados produzidos e
  históricos, sem misturar usage com conteúdo editorial;
- códigos sanitizados atuais de quota/erro como adaptadores de transição.

### Entidades novas provavelmente necessárias

O catálogo e a resolução final exigem, em migration futura e separada:

| Entidade | Papel mínimo |
| --- | --- |
| `integration_providers` | catálogo de provider, versão e disponibilidade |
| `integration_capabilities` | capability, operação, ambiente permitido, unidade e política de limite |
| `integration_connections` | owner exclusivo, provider, ambiente, lifecycle e referência a segredo protegido |
| `integration_grants` | concessão de capability/entitlement por escopo, vigência, ambiente e motivo |
| `integration_bindings` | origem efetiva escolhida para Agency ou Brand |
| `integration_quota_policies` | limite independente por capability, escopo, ambiente e janela |
| `integration_usage_events` | ledger append-only de tentativa, consumo, custo e correlação sanitizada |

`integration_grants` é a representação persistida da concessão; no código, o
resultado de entitlement deve continuar sendo um contrato distinto de
authorization. Uma tabela independente `integration_entitlements` não é
necessária inicialmente se grants e capabilities cobrirem a concessão sem
duplicação. Como a implementação aprovada precisa suportar limites variáveis em
Platform, Agency e Brand sem misturar quota com entitlement,
`integration_quota_policies` é necessária no schema mínimo.

`integration_capabilities` permanece independente de provider: não possui
`provider_id` obrigatório nem uma unique que force uma capability a um único
provider. A origem efetiva é determinada pelo `integration_bindings` e pela
connection escolhida; isso permite que uma capability como busca orgânica tenha
providers compatíveis distintos sem duplicar a capability.

Na fronteira persistente, grants Agency → Brand e bindings recebidos validam a
relação ativa em `agency_brands`; Platform → Agency continua sendo uma
concessão global explícita. Essa validação não migra consumidores nem cria
membership ou autorização editorial.

A migration local `0024_integrations_resource_governance.sql` cria as entidades
acima com FKs, RLS, grants PostgreSQL e auditoria append-only, sem seed,
backfill ou leitura de segredos. A aplicação remota e os consumidores continuam
pendentes dos gates próprios; nenhuma operação remota é autorizada por esta
implementação local.

## 13. Riscos, migração e rollback

Riscos principais:

- apagar `minerador_google_ads_connections` antes de validar a nova resolução;
- atribuir uma connection global a uma Agência sem grant explícito;
- mudar provider de IA sem alterar usage, custo e auditoria;
- retirar Serper antes de paridade de snapshots e contratos;
- registrar usage sem actor, Agency, Brand ou connection efetiva;
- usar quota/entitlement como autorização;
- exibir segredo ou permitir chamada paga no carregamento da tela.

Ordem obrigatória futura:

1. catálogo read-only e snapshot local das estruturas atuais;
2. aprovação de capabilities, owner de segredo, retenção, limites, RLS e
   rollback;
3. migration aditiva e reversível das entidades de integração;
4. backfill apenas de metadados comprovados, sem apagar dados editoriais;
5. resolvedor server-side com autorização, binding e quota explícitos;
6. usage append-only e leitura sanitizada;
7. migração por capability: Google Ads, DataForSEO e IA;
8. paridade e corte de Serper;
9. nova UI somente depois dos contratos e gates anteriores.

Rollback deve desabilitar o resolvedor novo e reativar a leitura transitória
anterior, sem excluir connections antigas, métricas, discovery, snapshots,
keywords ou histórico de usage. Nenhum rollback deve selecionar provider
alternativo silenciosamente.

## 14. Melhorias visuais independentes, ainda não aplicadas

Podem ser tratadas em tarefa visual própria, sem depender do schema desta SDD:

- substituir cores hardcoded por tokens semânticos;
- elevar textos essenciais para pelo menos 14px;
- revisar dark/light mode e contraste;
- validar 360, 768, 1024 e 1440 pixels;
- melhorar legibilidade, espaçamento, foco, loading, sucesso e erro;
- distinguir visualmente placeholder, dado confirmado, connection, entitlement,
  quota e usage;
- eliminar métricas administrativas `0` que pareçam dados reais.

Nenhuma melhoria visual foi aplicada aqui.

## 15. Critérios para aprovação da SDD

- [ ] authorization, entitlement, connection, quota e usage possuem contratos
      e estados separados;
- [ ] Google Ads está definido como capability global inicialmente, sem
      confundir `brandId` com ownership de credencial;
- [ ] DataForSEO possui origem Agency/Platform escolhida por binding explícito;
- [ ] fallback DeepSeek → OpenRouter está classificado como conflito e possui
      correção mínima proposta;
- [ ] Serper está mapeado como legado ativo, sem nova UI ou fallback;
- [ ] Platform, Agency e Brand possuem responsabilidades distintas;
- [ ] futuras interfaces não exibem segredo e não chamam provider ao carregar;
- [ ] schema atual reutilizável e entidades novas estão separados;
- [ ] migração, risco e rollback estão definidos sem executar alteração;
- [ ] nenhuma regra depende de nome de plano;
- [ ] Communication, notificações e convites permanecem fora do escopo.

## Resultado

`READY_FOR_INTEGRATIONS_SDD_APPROVAL`

O contrato está consolidado para submissão à aprovação. Isso não significa
que o fallback de IA, o modelo transitório de Google Ads, o env global de
DataForSEO ou o legado Serper estejam corrigidos no runtime. Implementação,
schema, provider e nova interface continuam bloqueados até aprovação e gates
próprios.
