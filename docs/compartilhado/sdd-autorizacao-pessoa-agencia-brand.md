# SDD — autorização canônica entre Pessoa, Agência e Brand

**Módulo proprietário:** Interface Planner  
**Tipo:** SDD estrutural obrigatória antes de schema, RLS ou autorização  
**Status:** APROVADO para implementação local pelo usuário em 2026-08-10  
**Implementação:** Implementada localmente; migration não aplicada  
**Operações remotas:** Nenhuma

## 1. Decisão e escopo

Esta SDD transforma duas decisões de produto em contrato técnico:

1. qualquer identidade Auth, inclusive Admin global, possui no máximo uma
   relação operacional efetiva com uma Agência;
2. uma Agência vinculada a uma Brand recebe acesso operacional herdado por
   padrão, limitado por permissões do actor, RLS e restrições explícitas da
   Brand.

Admin global administra a plataforma e pode administrar várias Agencies sem
receber vínculo operacional por efeito do papel global. A mesma identidade
Auth pode, entretanto, possuir seu próprio vínculo operacional efetivo com no
máximo uma Agency. Brand
continua sendo o tenant editorial:

```text
brandId = public.marcas.id
```

Esta aprovação autoriza código local, migration sucessora, schema, RLS, RPCs,
testes e documentação. Não autoriza migration remota, SQL remoto, alteração de
dados, provider, e-mail real, notifications, activity, módulos editoriais,
commit, push ou deploy.

## 2. Problema

O modelo físico e o runtime atual foram construídos em duas etapas que ainda
não expressam integralmente o contrato aprovado:

- `agencies.owner_user_id` e `agency_memberships.user_id` podem permitir,
  separadamente, mais de uma Agência para a mesma pessoa;
- dois índices únicos independentes não impedem owner na Agência A e member na
  Agência B;
- `agency_brands` hoje representa vínculo operacional, mas o resolvedor de
  Brand ainda calcula acesso editorial por owner ou `brand_membership`;
- não existe persistência de restrições explícitas Brand → capability;
- o runtime não deve transformar funcionários da Agência em
  `brand_memberships` apenas para permitir operação.

O contrato novo exige que ausência de restrição preserve o acesso herdado e que
uma restrição seja explícita, auditável e visível, nunca um bloqueio misterioso.

## 3. Auditoria do estado local

### 3.1 Schema e migrations

`0014_agency_foundation.sql` define:

| Relação | Contrato observado |
| --- | --- |
| `agencies` | `id`, `name`, `slug`, `status`, datas; `owner_user_id` é adicionado pela `0015` |
| `agency_memberships` | `agency_id`, `user_id`, `role`, `status`, datas; FK para `auth.users(id)` com `ON DELETE RESTRICT` |
| `agency_brands` | `agency_id`, `brand_id`, `status`, datas; FKs para `agencies` e `marcas`, ambas `ON DELETE RESTRICT` |

Unicidades atuais:

- `UNIQUE (agency_id, user_id)` em `agency_memberships`;
- índice único parcial de `agency_brands(brand_id)` com `status = 'active'`;
- índice único de `(agency_id, brand_id)`;
- nenhum índice único de `owner_user_id` ou `user_id` entre Agencies.

`0015_canonical_identity_authorization_foundation.sql` adiciona:

- `agencies.owner_user_id uuid NOT NULL`;
- FK `fk_agencies_owner_user_id_0015` para `auth.users(id)` com
  `ON DELETE RESTRICT`;
- `agency_memberships.canonical_role NOT NULL` em transição;
- índices não-únicos de owner/status e agency/user/canonical_role/status.

Não há estrutura local para restrições persistidas da Brand sobre uma Agency.
O catálogo remoto não foi consultado nesta SDD.

### 3.2 RLS e funções locais

`0014` habilita RLS nas três relações e revoga acesso de `PUBLIC`/`anon`.
`authenticated` possui grants físicos sujeitos a policies. As policies de
`agency_brands` exigem atualmente `can_manage_agency(agency_id)` e
`can_manage_brand(brand_id)` para escritas.

`0015` define funções `SECURITY DEFINER` com
`SET search_path = pg_catalog, public, pg_temp`:

- `canonical_can_access_agency`: owner ou membership ativa;
- `canonical_can_manage_agency`: owner ou membership ativa com
  `canonical_role = 'agency_admin'`;
- `canonical_can_access_brand`: owner da Brand ou `brand_membership` ativa;
- `canonical_can_manage_brand`: owner ou membership com `marca:manage`;
- `canonical_is_platform_admin`.

As funções atuais não calculam acesso herdado Agency → Brand nem restrições de
capability. Essa lacuna bloqueia a implementação, não autoriza um fallback.

### 3.3 Onboarding, convites e Admin

`0018` mantém o fluxo:

```text
AgencyApplication → AgencyInvitation → identidade Auth → aceite autenticado
→ agencies.owner_user_id
```

`complete_agency_onboarding` cria a Agency com owner, registra onboarding e
aceita o convite; não cria membership nem vínculo Agency → Brand. Não possui
guard de exclusividade conjunta.

Admin global possui rotas e telas próprias para applications, invitations e
Agencies. Admin não deve obter membership por efeito colateral. Qualquer
criação futura de Brand dentro de uma Agency deve ser operação explícita do
workspace, não reativação de criação global aposentada.

### 3.4 Autorização server-side e consumers

No checkout atual:

- `canonicalRequestContext()` resolve `actorUserId` pela sessão Supabase;
- `listCanonicalAccessibleAgencies()` combina owner e memberships ativas;
- `getCanonicalAgencyWorkspace()` resolve `agencyRef` estrito e lê
  `agency_brands`;
- `listCanonicalAccessibleBrands()` considera owner/`brand_membership`, não a
  Agency administradora;
- `authorizedForEditorial` é calculado com base no conjunto de Brands
  diretamente acessíveis ao actor;
- `/api/contexts` retorna `agencies[]` e `brands[]`;
- `/selecionar-marca`, `WorkspaceFrame`, `ProductShell` e `/conta` consomem
  contextos;
- `/agencias/{agencyRef}`, `/membros`, `/marcas` e `/configuracoes` são rotas
  existentes do workspace;
- `MarcaPage` e `BrandDnaPanel` usam rotas tenantizadas e
  `brand_memberships`/permissões existentes para a experiência de Brand.

Nenhum destes consumers pode usar localStorage, nome, e-mail isolado, slug
isolado, primeira Agency ou primeira Brand como autorização.

As documentações locais do Next.js 16 foram consultadas. Route Handlers são
boundaries de servidor; Proxy pode fazer checks otimistas, mas não é solução
completa de sessão/autorização. A SDD não propõe mudança de Proxy ou de
convenção do App Router nesta etapa.

## 4. Contrato aprovado

### 4.1 Pessoa → Agency

```text
auth.users
→ role global opcional em perfis
→ owner em agencies OU membership em agency_memberships
→ no máximo uma Agency operacional efetiva para qualquer actor
```

É inválido:

- owner da Agência A e member da Agência B;
- membership ativa na Agência A e membership ativa na Agência B.
- qualquer combinação que resolva dois `agency_id` distintos na união
  operacional owner + membership.

Admin global pode existir sem Agency ou acumular exatamente uma Agency
operacional como owner, member ou ambos na mesma Agency. `role = 'admin'` não
ocupa nem substitui `agencyId`, não concede acesso operacional por si só e não
autoriza uma segunda Agency. Owner + membership na mesma Agency é uma única
relação operacional deduplicada por `agency_id`; não é corrigida
automaticamente.

### 4.2 Agency → Brand

```text
agency_brands(status = active)
→ controle operacional herdado da Agency sobre a Brand
→ capacidades do actor na Agency
→ restrições explícitas da Brand
→ RLS e segurança da plataforma
```

Por padrão, a Agência pode operar as capacidades necessárias ao marketing:
Dados da Brand, colaboradores quando permitido, Minerador, Arquiteto, Radar,
Planejador, Redator, Publicações, atividade e notificações.

Esse acesso não altera `brandId`, não transforma Agency em tenant editorial e
não cria `brand_membership` para funcionários da Agency.

### 4.3 Brand collaborator

```text
auth.users
→ brand_memberships
→ brand role/permissões
→ acesso editorial próprio da Brand
```

Colaborador da Brand não recebe `agency_membership` por efeito colateral. Os
dois caminhos são complementares, mas não devem ser misturados.

## 5. Exclusividade conjunta actor → Agency

### 5.1 Alternativas

#### Alternativa A — dois índices únicos independentes

Índice parcial em `agencies(owner_user_id)` e índice parcial em
`agency_memberships(user_id)`.

**Vantagem:** simples e barato.  
**Falha:** permite owner em uma Agency e member em outra. Não atende o
contrato completo.

#### Alternativa B — trigger de constraint transacional + índices parciais

Manter as entidades atuais, adicionar índices parciais por status operacional e
uma função/constraint trigger `DEFERRABLE INITIALLY DEFERRED` que consulta a
união owner + membership no final da transação.

**Vantagens:** menor alteração física, protege escritas diretas e bloqueia o
conflito cruzado.  
**Riscos:** exige função robusta, revisão de `SECURITY DEFINER`, grants,
transfers, status e tratamento explícito de Admin global.

#### Alternativa C — RPC única de atribuição

Todas as criações, transferências e alterações de owner/membership passam por
uma RPC transacional.

**Vantagens:** centraliza regras e auditoria.  
**Riscos:** não protege enquanto grants/policies permitirem escritas diretas;
exige migrar consumers, Admin, convites e operações de transferência.

#### Alternativa D — relação canônica actor → Agency

Nova relação persistente com uma linha ativa por actor, vinculando Agency e
papel/origem. `agencies.owner_user_id` e `agency_memberships` virariam
projeções/consumers compatíveis.

**Vantagens:** regra explícita e extensível para transfers, histórico e papéis.
**Riscos:** maior migração, backfill, RLS, sincronização e compatibilidade.

### 5.2 Recomendação

Recomenda-se a Alternativa B como menor estrutura segura para o contrato atual:

1. preflight e snapshot;
2. índices parciais para owner e membership ativos;
3. função/constraint trigger transacional que verifica a união das duas fontes;
4. RPCs server-side para criação/transferência;
5. remoção posterior de grants de escrita direta, quando os consumers estiverem
   migrados.

A alternativa D deve ser reavaliada se transfers, histórico temporal e papéis
mais complexos tornarem a relação canônica necessária. A implementação local
adota a Alternativa B, sem introduzir uma relação canônica adicional.

## 6. Preflight read-only e dados legados

Foi preparado o script futuro:

`supabase/scripts/agency-authorization-preflight-read-only.sql`

Ele retorna somente contagens/estado de catálogo para:

- owner em múltiplas Agencies ativas;
- membership ativa em múltiplas Agencies;
- owner em uma Agency e member em outra;
- qualquer actor com mais de uma Agency efetiva na união owner + membership;
- Admin global com exatamente uma Agency operacional, como informação;
- memberships sem Agency, sem identidade Auth ou com role/status inválidos;
- Agencies sem owner válido;
- vínculos `agency_brands` inconsistentes;
- presença das relações, colunas, FKs e índices necessários.

O script não imprime UUIDs, e-mails, tokens ou payloads e não foi executado.

Estratégia para incompatibilidades legadas:

- bloquear a migration sucessora somente quando a união efetiva tiver mais de
  uma Agency por actor;
- produzir relatório sanitizado de contagens e categorias;
- classificar cada conflito com decisão humana;
- manter o vínculo original até decisão;
- aceitar Admin global + uma Agency operacional válida;
- não escolher primeira Agency;
- não mover pessoa automaticamente;
- não apagar membership;
- não trocar owner silenciosamente.

## 7. Modelo de restrição Brand → Agency

### 7.1 Contrato lógico

Uma Brand pode negar explicitamente uma capability para uma Agency vinculada:

```text
sem restrição ativa → acesso herdado permanece
restrição ativa → capability negada
restrição revogada → acesso herdado retorna
```

O modelo não pode usar ausência de linha como negação.

### 7.2 Estrutura persistente conceitual

Uma estrutura extensível, com nome físico ainda sujeito à revisão do schema,
deve representar pelo menos:

| Campo conceitual | Regra |
| --- | --- |
| `brand_id` | FK para `public.marcas(id)`; preserva `brandId` |
| `agency_id` | FK para `public.agencies(id)` |
| `capability` | chave extensível de módulo/ação, não dezenas de booleanos em `marcas` |
| `status` | ativo/revogado conforme contrato aprovado |
| `reason` | motivo opcional, sanitizado |
| `applied_by_actor_user_id` | identidade que aplicou a restrição |
| `created_at` | início do registro |
| `revoked_at` | encerramento, quando aplicável |
| histórico/auditoria | preserva quem, quando e qual escopo mudou |

Deve existir no máximo uma restrição ativa para o par
`(brand_id, agency_id, capability)`. FKs devem usar `ON DELETE RESTRICT` para
preservar histórico. A estratégia de histórico — linha mutável com revogação ou
projeção atual + eventos append-only — será decidida na migration própria.

### 7.3 Precedência e cálculo

```text
RLS/segurança estrutural
∩ vínculo ativo Agency → Brand
∩ capacidades do actor na Agency
− restrições ativas da Brand
```

Precedência normativa:

1. RLS e segurança estrutural;
2. restrição explícita da Brand;
3. papel/permissões do actor na Agency;
4. acesso herdado da Agency.

Uma Brand pode restringir Publicações ou alteração de BrandDNA e manter
Minerador, Arquiteto, Radar e Redator permitidos. A Agency continua vinculada
e deve enxergar a restrição, mas não pode executar a ação negada.

### 7.4 Aplicação e visibilidade

Somente owner da Brand ou papel/permissão canônica de gestão da Brand poderá
aplicar/revogar a restrição. A Agency não pode removê-la. Admin global pode
auditar metadados sanitizados; suporte sobre conteúdo exige grant explícito
futuro.

O workspace da Agency deve mostrar, para cada capability afetada:

- Brand responsável;
- capability restrita;
- estado;
- motivo, se disponível;
- ação indisponível.

O módulo pode continuar visível com “Acesso restrito pela Brand”. Visibilidade
não concede execução.

## 8. Contrato de `agency_brands`

### Estado atual

- `agency_id` e `brand_id` são obrigatórios;
- ambos possuem FK `ON DELETE RESTRICT`;
- `status` é `active`, `inactive` ou `removed`;
- uma Brand possui no máximo uma Agency operacional ativa pelo índice parcial
  `uq_agency_brands_active_brand_0014`;
- o par Agency/Brand não se repete pelo índice
  `uq_agency_brands_pair_0014`;
- RLS atual permite leitura por acesso à Agency e escrita condicionada a
  gestão da Agency + gestão da Brand;
- não há capability restriction nem histórico de transferência próprio.

### Contrato futuro

`agency_brands(status = active)` significa que a Agency administra
operacionalmente a Brand, não apenas que existe um vínculo informativo.

Criação, revogação e transferência devem ser operações explícitas e
transacionais:

- criação: valida Agency, Brand, actor e inexistência de outro vínculo ativo;
- revogação: preferir transição de status auditável, sem apagar histórico;
- transferência: decisão explícita, preservação de `brandId`, preflight e
  atualização atômica;
- remoção de Agency/Brand: `ON DELETE RESTRICT` preserva relacionamento e
  exige encerramento compatível.

A regra de uma Brand operacional ativa permanece preservada até SDD aprovada
substituí-la formalmente.

## 9. Server-side, RLS, RPCs e segurança

### Server-side

Todos os consumers devem resolver `actorUserId` da sessão Supabase no servidor,
resolver `agencyRef` por UUID + slug confirmado e validar o vínculo
`agency_brands` no servidor. Nenhuma decisão pode vir de estado local ou de
seleção anterior.

O futuro resolvedor deve separar:

1. identidade;
2. vínculo Agency do actor;
3. vínculo Agency → Brand;
4. permissões do actor na Agency;
5. restrições explícitas da Brand;
6. capability pedida;
7. RLS/persistência.

### RLS e policies futuras

As policies devem:

- impedir `anon` de tabelas privadas;
- permitir leitura somente do escopo autorizado;
- impedir que Agency remova restrição definida pela Brand;
- permitir restrição somente a owner/gestor autorizado da Brand;
- impedir Brand collaborator de editar vínculo Agency → Brand sem grant;
- preservar a separação entre operação Agency e conteúdo editorial;
- não depender de e-mail, nome, slug isolado ou `auth.uid()` como substituto
  de vínculo completo.

### RPCs e SECURITY DEFINER

Quando a operação precisar atravessar tabelas e garantir atomicidade, usar RPC
server-side com:

- parâmetros UUID/capability validados;
- idempotency key quando houver criação/transferência/revogação repetível;
- `SECURITY DEFINER` somente quando inevitável;
- `SET search_path = pg_catalog, public, pg_temp`;
- grants mínimos para `authenticated`/`service_role` conforme operação;
- ausência de segredo ou token bruto;
- erros sanitizados.

Nenhuma RPC nova foi criada.

## 10. Impacto nos consumers

### Agência

- `/agencias/{agencyRef}`: resumo de Brands e capacidades herdadas;
- `/dados`: dados cadastrais, futura rota;
- `/membros`: agency memberships, papéis e permissões;
- `/marcas`: Brands vinculadas, status, restrições visíveis e atividade resumida;
- `/atividade`: agregação sanitizada, futura rota;
- `/notificacoes`: central filtrada, futura rota;
- `/configuracoes`: configuração da Agency.

### Brand

- rota tenantizada atual para Dados, BrandDNA e pipeline;
- Equipe/colaboradores via memberships próprias;
- painel futuro “Acesso da Agência” para restrições;
- Activity e Notifications do contexto da Brand.

### Admin

- visão global sanitizada de Agencies, Brands, usuários, comunicação, filas,
  falhas e restrições;
- sem acesso editorial automático;
- suporte somente com grant explícito posterior.

### Conta e contexto

`/conta` continua identidade, senha, segurança e preferências pessoais. Não
duplicar dados da Agency nem usar `/conta` como tenant. `/api/contexts` e
seletores deverão, em implementação posterior, respeitar o contrato de uma
Agency para actor comum sem enumeração de contas.

## 11. Compatibilidade e migração futura

Antes de qualquer migration:

1. snapshot de schema e dados críticos;
2. executar o preflight read-only;
3. resolver owner/member duplicados com decisões humanas;
4. mapear grants, RLS, RPCs, Admin, onboarding, convites, transfers e
   consumers diretos;
5. definir a representação de restrições e capabilities;
6. preparar migration aditiva com preconditions, backfill explícito,
   validação e rollback;
7. migrar authorization server-side e UI;
8. retirar escritas diretas somente após prova de consumers zero;
9. validar RLS e smoke autenticado.

Nenhum legado será automaticamente movido, apagado, desativado, convertido em
membership ou reassociado a outra Agency/Brand.

## 12. Rollback conceitual

Rollback de uma implementação futura deve:

- preservar `auth.users`, Agencies, Brands, owners e memberships;
- preservar `brandId`, BrandDNA, pipeline e histórico editorial;
- preservar histórico de restrições e revogações;
- reverter somente novas policies, RPCs, índices e estruturas introduzidas;
- parar novas escritas antes de restaurar consumers;
- bloquear rollback se houver dependência ou conflito não classificado;
- nunca apagar vínculo real ou trocar owner silenciosamente.

## 13. Testes futuros

1. owner da Agency A não pertence à Agency B;
2. member da Agency A não pertence à Agency B;
3. owner A + member B é rejeitado transacionalmente;
4. Admin global sem Agency é permitido;
5. Admin global owner de uma Agency é permitido;
6. Admin global member de uma Agency é permitido;
7. Admin global owner + member da mesma Agency é permitido;
8. owner + member em Agencies distintas é rejeitado;
9. Admin global administra várias Agencies globalmente sem criar vínculo
   operacional com elas;
10. Agency vinculada recebe acesso operacional padrão;
11. member autorizado da Agency opera Brand vinculada;
12. member sem capability da Agency é negado;
13. Brand restringe Publicações;
14. Agency continua acessando Minerador quando não restrito;
15. Agency não executa Publicações restrita;
16. remover restrição restaura acesso herdado;
17. restrição não cria `brand_membership`;
18. Brand collaborator continua acessando por `brand_membership`;
14. Agency não acessa Brand não vinculada;
15. primeira Brand/Agency nunca é fallback;
16. atividade visível não concede operação;
17. isolamento entre Brands permanece;
18. RLS corresponde ao guard server-side;
19. status inactive/removed não concede acesso;
20. transferências preservam histórico e idempotência;
21. UI mostra restrição sem esconder módulo;
22. Admin vê apenas visão global sanitizada.

## 14. Operações manuais e sequência

Operações manuais futuras, somente após aprovação separada:

- snapshot/backup;
- preflight read-only;
- revisão de duplicidades e conflitos;
- aplicação manual da migration aprovada;
- validação read-only de RLS, constraints, grants e RPCs;
- smoke autenticado de owner, member, Brand collaborator e Admin.

Sequência recomendada:

```text
A. preflight e exclusividade actor → Agency
B. schema/RLS/RPC da autorização conjunta
C. workspace Agency e vínculo Agency → Brand
D. restrições explícitas da Brand
E. colaboradores/papéis/permissões da Brand
F. comunicação real
G. notifications e activity
H. smoke 3B-R1
```

Os passos locais A-D foram implementados na preparação local; preflight remoto,
migration remota, RLS remota e smoke continuam pendentes.

## 15. Riscos e decisão pendente

Riscos principais:

- trigger/constraint transacional mal protegido contra escritas diretas;
- role global confundido com acesso operacional ou editorial;
- restrição da Brand tratada como ausência de permissão;
- funcionário da Agency convertido indevidamente em collaborator da Brand;
- `agency_brands` tratado como vínculo informativo ou como tenant;
- Activity expondo conteúdo além do escopo;
- divergência entre guard server-side e RLS;
- legado ambíguo movido automaticamente.

Decisões futuras, fora do escopo desta aprovação local:

- confirmar Alternativa B ou substituir por relação canônica;
- definir capability keys sem dezenas de booleanos;
- definir estrutura física e histórico das restrições;
- definir quem pode aplicar/revogar cada restrição;
- definir grants mínimos e RPCs transacionais;
- revisar a regra atual de escrita em `agency_brands`;
- aprovar os estados e a visibilidade da UI.

## 16. Registro da implementação local

**IMPLEMENTADO LOCALMENTE:** migration sucessora 0021, trigger transacional,
índices parciais, catálogo de capabilities, restrições persistentes, RPCs,
policies locais, canonical authorization e consumidores server-side.

**CORREÇÃO DE PREMISSA:** Admin global + uma Agency operacional válida é
permitido. A 0021 bloqueia somente actor com mais de uma Agency efetiva,
calculada pela união deduplicada de owner e membership. Owner + membership na
mesma Agency não é segunda Agency.

**TESTADO:** 20/20 testes do contrato novo, 52/52 testes combinados de
autorização/tenantização/consumidores, 23/23 testes da suíte authz, TypeScript,
lint direcionado e `git diff --check`.

**MIGRATION NÃO APLICADA:** o arquivo existe apenas no checkout local.

**PREFLIGHT REMOTO NÃO EXECUTADO:** o preflight permanece read-only e guardado.

**RLS REMOTA NÃO VALIDADA:** somente o contrato SQL local foi revisado.

**SMOKE NÃO EXECUTADO:** nenhum login, convite, Agency, Brand ou Admin foi
homologado remotamente nesta fase.

Arquivos principais:

- `supabase/migrations/0021_canonical_agency_brand_authorization.sql`;
- `supabase/scripts/agency-authorization-0021-post-verification-read-only.sql`;
- `supabase/scripts/agency-authorization-0021-rollback.sql`;
- `lib/server/canonical-authorization.ts`;
- `lib/server/tenant-context.ts`;
- `lib/server/editorial-authorization.ts`;
- `lib/server/authz.ts`;
- `lib/server/agency-admin.ts`.

**Status final:** APROVADO para implementação local; operação remota não autorizada.  
**Implementação:** verificada localmente nos arquivos abaixo.  
**Operações remotas:** Nenhuma.

**Separação de contexto:** o papel global Admin não é bypass de Brand. Operações
globais pertencem ao contexto `/admin`; no contexto Agency → Brand, a decisão
continua dependendo do vínculo operacional, capabilities, restrições da Brand
e RLS.
