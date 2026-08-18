# SDD — Corte canônico do Google Ads

**Módulo proprietário:** Integrações compartilhadas / Google Ads
**Data:** 2026-08-12
**Status:** Proposto, não aprovado
**Implementação:** Não realizada
**Migration:** Não criada
**Operações remotas:** Nenhuma

> **Precedência documental — 2026-08-16:** esta proposta de corte para
> `integration_connections`/Vault foi supersedida, como destino de
> configuração do Google Ads, pelo adendo da SDD arquitetural canônica. Ela é
> preservada como auditoria histórica e não autoriza implementação, migration
> ou operação remota. O target atual é `GOOGLE_ADS_CONFIG_SOURCE = PLATFORM_ENV`;
> smokes e prova de ausência de consumidores continuam pendentes.

## 1. Objetivo e limites

Esta SDD define a menor mudança estrutural necessária para retirar o
consumidor do Minerador de `public.minerador_google_ads_connections` e
fazê-lo operar sobre os contratos compartilhados das migrations 0024/0025.

O objetivo não é copiar a tabela legada com outro nome. O contrato futuro
deve separar conexão, autorização, entitlement, binding, configuração
operacional, quota e uso.

Esta SDD não autoriza código, migration, provisionamento remoto, chamada
paga, backfill, dual-write ou fallback para a tabela legada.

## 2. Evidência atual auditada

O catálogo compartilhado já representa:

- provider, capability, connection, grant, binding, quota e usage;
- `integration_connections.secret_ref` para referência server-side ao
  segredo, sem guardar a credencial;
- `integration_bindings.external_account_ref` para a conta externa;
- `integration_usage_events` como ledger append-only e não como estado atual.

O runtime genérico já resolve conexão, grant/binding, lifecycle, segredo,
provider e quota, mas a composição atual não encontra corretamente um grant
destinado à Agência quando o contexto final é uma Brand. Isso é um
`RUNTIME_GAP`, não uma ausência de tabela: a resolução deve compor o grant da
Agência com o binding explícito da Brand.

No código atual, os consumidores Google Ads ainda leem e escrevem a tabela
legada:

- `app/api/minerador/marcas/[brandId]/google-ads/conexao/route.ts` lê a
  configuração, chama a validação do provider e faz upsert;
- `app/api/minerador/marcas/[brandId]/google-ads/discovery/route.ts` lê
  Customer, MCC, estado de validação, moeda e fuso antes da descoberta;
- `app/api/minerador/marcas/[brandId]/google-ads/metrics/route.ts` lê a
  mesma conta e targeting antes das métricas;
- `modules/marca/google-ads-connection-panel.tsx` exibe e edita os valores;
- `lib/minerador/google-ads-connection.ts` valida e mapeia o contrato legado;
- `lib/google/ads/config.ts` ainda fornece credenciais por ambiente, em vez
  de resolver a conexão canônica.

A migration 0007 define a tabela legada com `brand_id`, `customer_id`,
`login_customer_id`, targeting, `currency_code`, `time_zone`, `status` e
`validated_at`. Ela não é dona de segredo. O ambiente foi resetado, mas a
existência ou quantidade remota atual de linhas não foi consultada nesta
tarefa; isso deverá ser um gate explícito antes do corte.

## 3. Mapeamento legado para o contrato futuro

| Campo/semântica legada | Responsabilidade | Destino canônico | Paridade | Gap atual | Ação futura |
|---|---|---|---|---|---|
| `brand_id` | Tenant dos dados da Brand | `integration_bindings.target_brand_id` | FULL | Nenhum | Resolver sempre por `brandId` canônico |
| `customer_id` | Customer Google Ads usado pela Brand | `integration_bindings.external_account_ref` | FULL | RUNTIME_GAP | Validar referência no binding |
| `login_customer_id` | MCC usado pela conexão | `integration_connections.metadata.google_ads.manager_customer_id` | PARTIAL | CONFIGURATION_GAP | Formalizar contrato Platform e validar 10 dígitos |
| `language_constant` | Targeting de keyword | `google_ads_binding_targeting.language_constant` | NONE | SCHEMA_GAP | Persistir em entidade tipada |
| `geo_target_constants` | Targeting geográfico | `google_ads_binding_targeting.geo_target_constants` | NONE | SCHEMA_GAP | Persistir lista tipada e validada |
| `keyword_plan_network` | Rede da operação | `google_ads_binding_targeting.keyword_plan_network` | NONE | SCHEMA_GAP | Persistir enum tipado |
| `include_adult_keywords` | Opção operacional de descoberta | `google_ads_binding_targeting.include_adult_keywords` | NONE | SCHEMA_GAP | Persistir booleano tipado |
| `currency_code` | Estado retornado da conta externa | `google_ads_binding_account_state.currency_code` | NONE | SCHEMA_GAP | Persistir estado corrente separado |
| `time_zone` | Estado retornado da conta externa | `google_ads_binding_account_state.time_zone` | NONE | SCHEMA_GAP | Persistir estado corrente separado |
| `status` | Resultado da validação da associação | `google_ads_binding_account_state.validation_status` | NONE | SCHEMA_GAP | Definir semântica de estado atual |
| `validated_at` | Última validação bem-sucedida | `google_ads_binding_account_state.validated_at` | NONE | SCHEMA_GAP | Não derivar de tela nem de uso |
| credencial | Não persistida na tabela legada | `integration_connections.secret_ref` | FULL | CONFIGURATION_GAP | Resolver somente server-side |
| autorização | Indireta/ausente na tabela legada | `integration_grants` + `integration_bindings` | PARTIAL | RUNTIME_GAP | Compor grant de Agência e binding da Brand |
| quota | Não representada na tabela legada | `integration_quota_policies` | FULL | RUNTIME_GAP | Aplicar antes da chamada paga |
| auditoria/uso | Não é estado da conexão | `integration_usage_events` | FULL | RUNTIME_GAP | Gravar evento idempotente |

## 4. TARGETING_MODEL_DECISION

### Decisão

Escolher a opção **B — entidade Google Ads específica e tipada**, ancorada
no `integration_binding` da Brand.

Uma extensão genérica de configuração do binding seria prematura: há um
consumidor real, os quatro campos têm semântica estável e específica do
Google Ads, e um JSON genérico dificultaria validação, RLS e evolução. Não
será criado um framework genérico para integrações futuras sem um segundo
caso comprovado.

O conceito é `google_ads_binding_targeting`, com uma linha para o binding
Brand-scoped que autoriza a operação Google Ads. Não haverá segredo, MCC,
grant, quota, usage ou credencial nessa entidade. Ela não duplicará a tabela
`integration_bindings` nem receberá um `brand_id` concorrente; a Brand será
derivada do binding.

A modelagem atual de 0024 pode ter bindings por capability. Se discovery e
metrics forem representados por bindings distintos, cada binding deverá ter
configuração coerente e o runtime deverá rejeitar divergências; nunca poderá
escolher silenciosamente uma delas. Uma futura decisão de compartilhar uma
única configuração entre vários bindings será uma mudança separada.

### TARGETING_FIELDS_AND_SEMANTICS

- `language_constant`: texto obrigatório, não vazio, identificador de
  idioma aceito pelo catálogo Google Ads. O valor atualmente usado pela UI
  como padrão é `languageConstants/1014`.
- `geo_target_constants`: lista obrigatória, sem duplicatas, com no máximo
  dez constantes válidas. A validação deve reutilizar o catálogo existente e
  rejeitar a combinação incompatível de país com subdivisões quando a regra
  do catálogo assim exigir.
- `keyword_plan_network`: enum fechado `GOOGLE_SEARCH` ou
  `GOOGLE_SEARCH_AND_PARTNERS`.
- `include_adult_keywords`: booleano explícito, com default operacional
  `false` quando a configuração for criada; não pode ser inferido de
  `localStorage` ou de uma requisição anterior.

Os valores são parâmetros operacionais da Brand, não atributos da
connection. Alterar targeting não altera credencial, MCC, grant, quota ou
ownership dos dados.

## 5. EXTERNAL_ACCOUNT_CURRENT_STATE_REQUIRED

**YES.**

Não é suficiente registrar apenas um evento de validação. A rota de conexão
e o painel exibem `currency_code`, `time_zone`, status e `validated_at`; as
rotas de discovery e metrics também exigem estado validado e comparam moeda e
fuso retornados pelo provider. Portanto esses valores são estado corrente
consumido pelo runtime, não somente evidência histórica.

## 6. CURRENT_ACCOUNT_STATE_DECISION

Criar uma segunda entidade tipada, conceitualmente
`google_ads_binding_account_state`, uma linha por binding Brand-scoped:

- `binding_id` é FK para `integration_bindings`, com `ON DELETE RESTRICT`;
- `currency_code` é o código de três letras retornado pelo provider;
- `time_zone` é o fuso retornado pelo provider;
- `validation_status` expressa `pending`, `validated`, `invalid` ou
  `disabled`;
- `validated_at` significa a data/hora da última validação bem-sucedida da
  associação Brand → Customer, usando a connection Platform/MCC autorizada;
- timestamps de criação/atualização completam o registro operacional.

`validated_at` não significa que quota foi concedida, que uma chamada recente
foi paga ou que a última descoberta terminou com sucesso. A validação
server-side atualiza esse estado e também pode registrar um
`administrative_validation` em `integration_usage_events`; o evento é a
trilha de auditoria, e a entidade de estado é a fonte para leituras atuais.

Se uma futura auditoria provar que nenhum consumidor precisa desses valores
fora do histórico, esta decisão poderá ser reduzida; o código atual prova o
contrário, então não se usa usage como state store.

## 7. MCC_CANONICAL_OWNER

O MCC pertence à **connection Platform**, porque identifica a conta gerencial
usada para fornecer/pagar a integração. Não pertence à Brand, ao targeting,
a grant ou ao usage.

O contrato mínimo atual é:

`integration_connections.metadata.google_ads.manager_customer_id`

Esse é um namespace semântico reservado dentro do metadata operacional da
connection, não um depósito JSON genérico: deve conter somente o MCC
sanitizado, como string de dez dígitos, com validação server-side. A connection
continua sendo de owner `platform`, com provider `google_ads` e sem segredo
em `metadata`.

O valor legado `login_customer_id` e a variável
`GOOGLE_ADS_LOGIN_CUSTOMER_ID` são fontes transitórias. Depois do corte, a
resolução canônica deve usar a connection Platform; se o contrato não estiver
presente, falhar explicitamente. Não haverá fallback para variável de
ambiente, outra connection ou outro MCC.

Se houver necessidade real de hierarquia de MCCs, múltiplas contas gerenciais
ou metadados tipados adicionais, isso será um novo gap estrutural e exigirá
SDD própria. O mínimo desta SDD não cria uma entidade externa de contas.

## 8. SECRET_REF_CONTRACT

`integration_connections.secret_ref` permanece a única referência canônica
à credencial. O segredo fica no Vault/secret manager e só é resolvido no
server-side autorizado. Não será copiado para targeting, account state,
metadata, browser, logs, payloads persistidos ou `integration_usage_events`.

A connection só pode ser usada quando estiver em lifecycle `ready`, tiver
`secret_ref` válido e pertencer ao provider/environment esperados. Ausência,
formato inválido ou segredo inacessível resulta em erro explícito; nenhum
provider alternativo ou modelo alternativo será escolhido.

## 9. AGENCY_GRANT_BRAND_BINDING_RUNTIME_RULE

O fluxo canônico é:

`connection Platform READY + grant ativo da Agência + binding explícito da Brand + quota válida -> operação server-side para aquela Brand`.

A Agency concede capacidade, mas não vira tenant editorial. A Brand é o
contexto dos dados produzidos. O resolver deve encontrar o grant da Agência
por meio da membership/agency context e, em seguida, exigir o binding
Brand-scoped com `external_account_ref = customer_id`.

A implementação atual filtra grants de Brand diretamente quando recebe
`brandId` e, por isso, não compõe corretamente um grant destinado à Agência
com o binding da Brand. Classificação: `RUNTIME_GAP`. A correção futura é no
resolver, sem nova tabela, sem bypass e sem fallback.

Antes de qualquer chamada paga, o runtime também deve:

1. autenticar e autorizar o actor;
2. resolver a Brand canônica;
3. resolver capability, grant e binding;
4. validar connection, secret e provider;
5. avaliar quota;
6. registrar uso com idempotência;
7. somente então chamar o Google Ads e finalizar o evento.

## 10. Categorias de gap

| Requisito | Classificação | Fundamentação |
|---|---|---|
| provider Google Ads | `DATA_PROVISIONING_GAP` | O catálogo suporta provider; ainda não há prova de provisionamento canônico atual. |
| capability discovery/metrics | `DATA_PROVISIONING_GAP` | O modelo suporta capabilities; os registros aplicáveis precisam ser provisionados explicitamente. |
| connection Platform | `CONFIGURATION_GAP` / `DATA_PROVISIONING_GAP` | O modelo suporta owner, lifecycle e secret_ref; falta configurar e validar o contrato Google Ads. |
| `secret_ref` | `NO_GAP` estrutural | Campo existente e server-side; falta configuração segura quando não provisionado. |
| grant/entitlement | `NO_GAP` estrutural | Tabela e estados existem; runtime ainda não compõe o grant de Agência. |
| binding | `NO_GAP` estrutural | `external_account_ref` representa Customer; falta binding real e runtime canônico. |
| quota | `NO_GAP` estrutural | Política e avaliação genéricas existem; rotas Google Ads ainda não a aplicam. |
| usage | `NO_GAP` estrutural | Ledger e idempotência existem; consumidor Google Ads ainda não registra o uso. |
| Customer ID | `NO_GAP` estrutural | `integration_bindings.external_account_ref` é suficiente para a referência. |
| MCC | `CONFIGURATION_GAP` | Owner é a connection Platform; falta contrato/provisionamento validado no metadata reservado. |
| Customer → MCC | `RUNTIME_GAP` | A associação é resolvida pela connection Platform; não há necessidade demonstrada de hierarquia persistida. |
| targeting | `SCHEMA_GAP` | Não há entidade canônica persistente Brand/binding-scoped e tipada. |
| currency/timezone | `SCHEMA_GAP` | São lidos como estado corrente e não existem nos contratos canônicos atuais. |
| account validation status | `SCHEMA_GAP` | O estado corrente não deve ser inferido de usage ou da tabela legada. |
| `validated_at` | `SCHEMA_GAP` | A semântica de última validação da associação precisa de persistência própria. |
| language/location/network/adult | `SCHEMA_GAP` | Campos operacionais tipados ainda vivem na tabela legada. |

## 11. PROVISIONING_PLAN

Nenhum item será provisionado nesta tarefa. Quando a SDD for aprovada, a
sequência deverá ser explícita e auditável:

1. registrar ou habilitar provider `google_ads` e as capabilities de
   discovery/metrics por mecanismo administrativo aprovado;
2. criar connection Platform em `draft`, preencher MCC no metadata reservado
   e `secret_ref` no Vault, sem expor segredo;
3. executar validação server-side explícita e somente então promover a
   connection para `ready`;
4. conceder grant da Agência com prazo e razão canônicos;
5. criar binding explícito da Brand com `external_account_ref` Customer;
6. criar quota para a capability e escopo corretos;
7. salvar targeting tipado da Brand/binding;
8. salvar o primeiro account state somente após validação do provider;
9. registrar usage sanitizado e idempotente.

A criação deve ser feita por Admin/Platform para catálogo e connection,
por operação administrativa autorizada para grant/binding/quota e por ação
server-side da Brand para targeting. Não haverá auto-provisionamento pelo
primeiro request.

Antes da implantação, consultar remotamente apenas por leitura a quantidade
atual de linhas da tabela legada. Se houver linhas, parar e aprovar um plano
explícito de migração de dados; não fazer dual-write. Se não houver linhas, a
nova época começa sem backfill.

## 12. RLS_AND_TENANT_RULES

- `brandId` é sempre `public.marcas.id`, nunca owner, slug, nome ou storage do
  navegador;
- targeting e account state derivam a Brand do binding e não aceitam um
  `brand_id` livre que possa divergir;
- leitura autenticada exige acesso canônico à Brand;
- escrita de targeting exige a permissão operacional aprovada para a Brand;
- criação/alteração de connection, grant, binding e quota segue as fronteiras
  Platform/Agency/Brand do contrato de integrações;
- `anon` não possui acesso;
- `service_role` fica restrito ao server-side depois da autorização;
- FKs para o binding usam `ON DELETE RESTRICT`;
- nenhuma policy usa owner como substituto de membership;
- uma Brand nunca herda targeting, estado, Customer ou quota de outra Brand;
- estado local não participa da autorização nem da elegibilidade da chamada.

## 13. CONSUMERS

| Consumidor | Contrato futuro | Mudança futura necessária |
|---|---|---|
| conexão/UI de Brand | targeting + account state + binding | remover leitura/escrita direta da tabela legada |
| route de conexão | connection, binding, validação e state | parar de upsertar 0007; operar server-side canônico |
| discovery | targeting + resolver + quota + usage | não usar env/legado como fonte de configuração |
| metrics | targeting + resolver + quota + usage | mesma transição de discovery |
| `google-ads-connection.ts` | normalizador tipado | separar provider response, targeting e state |
| `integrations-runtime.ts` | grant Agency + binding Brand | corrigir composição e preservar erros explícitos |
| `platform-integrations-admin.ts` | connection Platform/MCC/secret | ampliar somente o fluxo administrativo aprovado |
| testes/fixtures | contratos canônicos | substituir fixtures legadas após o smoke canônico |

## 14. ROLLBACK

A tabela legada permanece intacta durante toda a implantação. O rollback do
corte de runtime consiste em reverter a implantação local para a versão
anterior somente antes da declaração de zero consumidores. Isso não autoriza
fallback simultâneo, dual-write ou restauração automática de valores.

As novas estruturas podem permanecer sem uso enquanto o gate for revertido;
se a futura migration precisar ser revertida, o artefato de rollback deverá
ser preparado a partir do snapshot pré-apply e das dependências reais, sem
editar migrations antigas. Nenhuma exclusão estrutural da tabela legada será
considerada antes de snapshot, contagem, prova de zero reads/writes e decisão
humana.

## 15. TEST_PLAN

A implementação futura só poderá avançar com testes que cubram:

- validação dos quatro campos de targeting, limites, duplicatas e catálogo;
- isolamento de Brand e impossibilidade de misturar binding/Customer;
- mapeamento Customer → connection Platform/MCC;
- ausência de segredo em browser, log, metadata não autorizada e usage;
- status corrente, `validated_at`, moeda e timezone após validação;
- grant da Agência + binding da Brand no resolver;
- ausência de grant, binding, secret, quota ou connection READY;
- bloqueio antes de qualquer chamada paga;
- usage idempotente e erro sanitizado;
- provider explicitamente selecionado, sem fallback;
- leitura/escrita canônica após F5, logout/login e nova sessão;
- zero leitura/escrita em `minerador_google_ads_connections` depois do corte;
- testes mockados sem chamadas Google Ads reais.

Na fase de implementação, executar TypeScript, lint, build, testes de
consumidores, `git diff --check` e um smoke real somente por ação humana
explícita, após todos os gates de connection, grant, binding, quota e usage.

## 16. LEGACY_RETIREMENT_PLAN

1. aprovar esta SDD e o escopo estrutural;
2. implementar as duas entidades tipadas e suas políticas;
3. provisionar provider, capabilities, connection Platform, MCC, secret,
   grant, binding e quota;
4. corrigir o resolver compartilhado;
5. migrar conexão, targeting, account state, discovery e metrics para o
   caminho canônico, sem fallback e sem dual-write;
6. provar o smoke Google Ads pelo caminho novo;
7. pesquisar o repositório inteiro e confirmar zero reads/writes de
   `minerador_google_ads_connections` fora de migrations, documentação e
   evidência histórica;
8. classificar a tabela legada como `DROP_CANDIDATE` somente após o gate;
9. preparar uma única migration sucessora para remoção estrutural, se ainda
   necessário.

A migration 0031 continua abandonada. A 0032 já foi aplicada. O próximo
número de migration será confirmado imediatamente antes da criação; não é
fixado nesta SDD.

## 17. SCHEMA_CHANGE_SCOPE

O mínimo estrutural proposto é:

1. `google_ads_binding_targeting`, entidade tipada Brand/binding-scoped para
   language, location, network e include-adult;
2. `google_ads_binding_account_state`, entidade tipada para currency,
   timezone, validation status e `validated_at`.

Ambas referenciam `integration_bindings` com `ON DELETE RESTRICT`, derivam a
Brand do binding e recebem RLS tenantizada. Nomes finais e detalhes de
índices/checks serão definidos na migration somente após aprovação.

Não faz parte do escopo:

- nova tabela de segredo;
- nova tabela de grant, entitlement, binding, quota ou usage;
- cópia de `minerador_google_ads_connections`;
- targeting dentro de `integration_connections`;
- MCC como configuração da Brand;
- uso de `integration_usage_events` como state store;
- fallback, dual-write ou compatibilidade histórica;
- remoção de 0007 nesta fase.

## 18. Decisão final e gates

`GOOGLE_ADS_SCHEMA_CHANGE_REQUIRED = YES`
`SDD_REQUIRED = YES`
`GOOGLE_ADS_LEGACY = MIGRATE_THEN_DROP`
`REMOTE_OPERATION = NONE`

A implementação permanece bloqueada até aprovação explícita desta SDD e de
seu plano de provisionamento. A aprovação não autoriza por si só migration,
SQL remoto, chamadas pagas, backfill, commit, push ou deploy.
