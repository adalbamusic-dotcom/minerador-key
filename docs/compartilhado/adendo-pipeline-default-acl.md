# Adendo — contrato de DEFAULT ACL da persistência do pipeline

Status: 0026 aplicada; fechamento com exceção de evidência documentada  
Implementação: 0026 aplicada remotamente; schema editorial remoto ainda não autorizado  
Migration: `MIGRATION_0026 = APPLIED`  
Operações remotas nesta etapa: Nenhuma  
Classificação: `DEFAULT_ACL_BASELINE_VERIFIED_WITH_DOCUMENTED_EVIDENCE_EXCEPTION`

## Decisão do gate

O gate aprovou, para esta implementação local:

- `EXECUTION_ROLE = postgres`;
- `DEFAULT_ACL_TARGET_ROLE = postgres`;
- `FUTURE_APPLICATION_MIGRATION_CREATOR_ROLE = postgres`;
- owner do schema `public = pg_database_owner`;
- owner observado dos objetos da aplicação = `postgres`.

O owner do schema não é contado como owner dos objetos e não configura
conflito. O diagnóstico separa `SCHEMA_OWNER`, `OBJECT_OWNER`,
`EXECUTION_ROLE` e `DEFAULT_ACL_TARGET_ROLE`.

## Fechamento da 0026

Registro baseado no post-verifier v1 e no export pré-0026 recuperado fora do
repositório:

- `MIGRATION_0026 = APPLIED`;
- `POSTGRES_PUBLIC_DEFAULT_ACL_HARDENING = PASS`;
- `EXISTING_PUBLIC_OBJECT_ACL_PRESERVATION = PASS`;
  fingerprint `73896ca2127e3d2c13b5a45cf3a4fea5`;
- `SUPABASE_ADMIN_DEFAULT_ACL_PRESERVATION = PASS`;
  pre `e40981b7b53dfc209cbff21dc0330071`;
  post `e40981b7b53dfc209cbff21dc0330071`;
- `OUTSIDE_PUBLIC_PREPOST_FINGERPRINT = HISTORICAL_BASELINE_NOT_CAPTURED`;
- `OUTSIDE_PUBLIC_MIGRATION_SCOPE_REVIEW = PASS_WITH_EVIDENCE_EXCEPTION`;
- `DEFAULT_ACL_BASELINE = VERIFIED_WITH_DOCUMENTED_EVIDENCE_EXCEPTION`.

A revisão estática confirmou que a 0026 contém exclusivamente
`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`. Não há
`ALTER SCHEMA`, alteração de owner, GRANT/REVOKE sobre schema, alteração de
defaults de `supabase_admin` ou comandos direcionados a `auth`, `storage`,
`graphql`, `graphql_public`, `realtime` ou `extensions`.

Isso demonstra que a migration não possuía comando capaz de alterar ACL ou
owner desses schemas. Não demonstra ausência de alteração externa concorrente
no intervalo, pois o fingerprint histórico correspondente não foi capturado.

O post-verifier V2 conclusivo não foi criado artificialmente. A lacuna
histórica permanece registrada.

## 1. Motivo do bloqueio anterior

A SDD de persistência define o princípio de menor privilégio, mas ainda não
define os parâmetros operacionais necessários para uma instrução
ALTER DEFAULT PRIVILEGES:

- role proprietária exata dos objetos;
- role que executará a migration;
- escopo de schema;
- classes de objeto cobertas;
- concessões default e concessões explícitas posteriores.

A auditoria local não encontrou ALTER DEFAULT PRIVILEGES nas migrations
existentes. A migration 0025 também registra explicitamente que não executa
essa operação.

Não é seguro assumir postgres, supabase_admin, service_role ou qualquer outra
role sem confirmação no gate operacional.

## 2. Contrato aprovado para implementação local

### 2.1 Role e escopo

O escopo aprovado é `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA
public`. Nenhuma role é criada automaticamente e nenhum default global é
alterado.

Requisitos:

- `postgres` deve poder criar/alterar objetos no schema public;
- os objetos novos devem ser owned por `postgres`;
- a operação deve usar `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public`;
- não haverá alteração global sem o escopo FOR ROLE e IN SCHEMA confirmados;
- não haverá criação automática de role nesta fase.

### 2.2 Defaults de tabelas

Para tabelas novas pertencentes à role aprovada, o default será sem privilégios
para:

- PUBLIC;
- anon;
- authenticated;
- service_role.

O owner mantém os privilégios inerentes à propriedade. Os demais acessos serão
concedidos explicitamente na migration de cada conjunto de tabelas, depois de
RLS e policies estarem definidas.

### 2.3 Defaults de funções

Funções novas não receberão EXECUTE default para PUBLIC, anon,
authenticated ou service_role.

Cada função terá, no próprio bloco de segurança, revogação explícita e grant
somente para as roles que realmente a chamam. Função SECURITY DEFINER exigirá:

- owner aprovado;
- search_path restrito;
- ausência de argumentos ou operações que permitam troca de Brand/actor sem
  validação;
- grant de EXECUTE mínimo.

### 2.4 Defaults de sequences

Sequences novas não receberão privilégios default para PUBLIC, anon,
authenticated ou service_role. O schema preferirá UUIDs e funções já
aprovadas, sem criar acesso amplo por sequence.

## 3. Grants explícitos posteriores

Os defaults não substituem a ACL específica das tabelas do pipeline.

Contrato-base:

| Role | Default | Grant posterior |
|---|---|---|
| anon | nenhum | nenhum acesso privado |
| authenticated | nenhum | somente acesso necessário e sujeito a RLS |
| service_role | nenhum | somente o mínimo server-side por tabela/RPC |
| owner | privilégios de propriedade | controlado pela operação de schema |

service_role não receberá DELETE, TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN
por default. Qualquer exceção deverá ser documentada na migration específica,
com justificativa, preflight e post-verifier.

Objetos append-only não receberão UPDATE/DELETE sem decisão específica. RLS
será habilitado desde a criação; ACL não será usada como substituta de RLS.

## 4. Não alterar objetos existentes

O contrato não autoriza alterar default ACL já existente de forma arbitrária e
não altera grants de keywords_kgr, listas_kgr ou qualquer tabela remota atual.

O preflight deve separar:

- default ACL preexistente;
- default ACL proposta para a role owner aprovada;
- ACL efetiva de objetos já existentes;
- ACL efetiva dos objetos novos após a migration.

## 5. Gate obrigatório antes de migration

O próximo preflight deverá confirmar, de forma read-only:

1. role proprietária real e role executora;
2. schema alvo;
3. capacidade de aplicar default ACL somente no escopo aprovado;
4. entradas de pg_default_acl relevantes;
5. ausência de grants futuros amplos;
6. inexistência de conflito com objetos existentes;
7. rollback para a alteração de default ACL;
8. owner e SECURITY DEFINER das funções previstas.

Sem esses oito itens, a fase permanece bloqueada.

## 6. Migration provenance

A pasta local terminava em 0025. 0026 é o próximo número livre observado e foi
criada somente como implementação local da policy aprovada.

Nenhuma migration histórica será reaplicada. A 0026 foi aplicada; qualquer
nova migration deverá capturar previamente todos os fingerprints necessários,
incluindo schemas fora de `public`.

## 7. Contrato para migrations futuras

Toda migration futura da aplicação que criar objetos em `public` deverá ser
executada pelo creator role `postgres` e conceder explicitamente os grants
necessários para cada nova tabela ou função. Default ACL não substitui RLS,
policies, GRANT/REVOKE explícitos nem o verifier.

O schema editorial está `UNBLOCKED_FOR_LOCAL_IMPLEMENTATION`, mas sua aplicação
remota continua bloqueada. A exceção histórica não autoriza inferir preservação
de schemas fora de `public`.

## 8. Limites desta entrega

Não houve nova operação remota nesta etapa, nem reaplicação da 0026, alteração
de dados, schema editorial remoto, commit, push ou deploy.
