# Adendo — modelo canônico de conta de Agência e workspace

**Módulo proprietário:** Interface Planner  
**Tipo:** adendo estrutural + auditoria de impacto  
**Status:** Proposto, não aprovado  
**Implementação:** Não realizada  
**Operações remotas:** Nenhuma

## 1. Escopo e desvio atual

Este adendo consolida o contrato de conta de Agência aprovado pelo usuário e
planeja o workspace operacional. Não altera schema, código de runtime, RLS,
policies, providers, Vault, notificações ou módulos editoriais.

O contrato local atual ainda permite que um ator resulte em mais de uma Agência
na lista de contextos: `listCanonicalAccessibleAgencies()` combina agencies
onde o ator é `owner_user_id` com memberships ativas por `user_id`. O seletor,
`WorkspaceFrame`, `ProductShell` e `/conta` ainda recebem/listam essa coleção.
Isso é evidência local de compatibilidade existente, não prova de duplicidade
no banco remoto.

## 2. Contrato anterior e contrato canônico

### Contrato anterior observado

- um ator autenticado podia ter várias Agencies acessíveis por ownership e/ou
  memberships;
- `/api/contexts` retornava `agencies[]`;
- o seletor e o shell exibiam a coleção plural;
- a autorização resolvia cada `agencyRef` individualmente, sem uma regra
  global de cardinalidade por ator;
- `agency_memberships` não representava acesso editorial automático.

### Contrato novo

- `auth.users` é a identidade da pessoa e cada e-mail corresponde a uma única
  identidade Auth conforme o provider;
- qualquer actor pode ter no máximo um `agencyId` efetivo; usuário comum não
  possui exceção e Admin global também não pode resolver uma segunda Agency;
- owner e membro devem ser auditados separadamente;
- owner em uma Agência e membership ativa em outra também é violação;
- Admin global pode administrar várias Agencies no contexto global, sem criar
  vínculo operacional com elas pelo papel global;
- a mesma identidade Admin pode possuir seu próprio vínculo operacional com no
  máximo uma Agency, como owner, member ou ambos na mesma Agency;
- uma Agência pode possuir vários usuários e administrar várias Brands;
- a Agência possui controle operacional herdado e completo por padrão sobre as
  Brands que administra;
- a Brand pode aplicar restrições explícitas a áreas, módulos ou capacidades
  específicas, sem romper o vínculo Agency → Brand;
- Brand continua sendo tenant editorial por `brandId = public.marcas.id`;
- organização com marketing próprio usa o mesmo modelo Agency → Brands; não há
  nova entidade estrutural.

## 3. Linguagem de produto

Para o cliente, a próxima implementação deve remover “Criar Agência”, “Aceitar
e criar Agência”, “Agências autorizadas”, “Escolha a Agência” e qualquer copy
que sugira criação do negócio como ação de login.

Usar, conforme o contexto: “Cadastrar Agência”, “Completar cadastro da
Agência”, “Finalizar cadastro”, “Confirmar cadastro”, “Minha Agência” e “Dados
da Agência”. Os nomes técnicos `agencies`, `agency_memberships` e
`agency_brands` permanecem.

O runtime atual ainda contém essas ocorrências pendentes, especialmente o
botão “Aceitar e criar agência” em `app/onboarding/agencia/page.tsx` e o rótulo
“Agências autorizadas” em `components/workspace-frame.tsx` e
`components/product-shell.tsx`. Não foram alteradas nesta tarefa.

## 4. Auditoria de autorização e schema local

### Ownership

`0015_canonical_identity_authorization_foundation.sql` adiciona
`public.agencies.owner_user_id`, FK `fk_agencies_owner_user_id_0015` para
`auth.users(id)` com `ON DELETE RESTRICT`, torna a coluna `NOT NULL` e cria o
índice não-único `ix_agencies_owner_status_0015`.

Não há, nas migrations locais auditadas, `UNIQUE agencies.owner_user_id` nem
índice único parcial equivalente. Portanto, o schema local não impede um owner
de possuir várias Agencies ativas.

### Membership

`0014_agency_foundation.sql` define
`agency_memberships.user_id` — não `member_user_id` — com FK para
`auth.users(id)` e `ON DELETE RESTRICT`. Há `UNIQUE (agency_id, user_id)` e o
índice `ix_agency_memberships_user_status_0014`, mas a unicidade é somente por
par Agência/usuário. Não há unicidade de `user_id` entre Agencies.

Logo, o schema local não impede um member de pertencer a várias Agencies
ativas. O catálogo remoto não foi consultado; o estado físico remoto permanece
não confirmado.

### Authorization, RLS e RPCs

- `listCanonicalAccessibleAgencies()` agrega owner e membership e deduplica
  somente dentro da lista por `agency_id`;
- `getCanonicalAgencyWorkspace()` e `requireAgencyOperationalAccess()` aceitam
  owner ou membership da Agência específica;
- `canonical_can_access_agency`/`canonical_can_manage_agency` da `0015` fazem a
  mesma decisão por Agência, sem regra transversal de cardinalidade;
- RLS de `0014` protege acesso por Agência, mas não impõe “uma Agência por
  ator”;
- `complete_agency_onboarding` da `0018` cria `agencies` com
  `owner_user_id = p_owner_user_id`; não cria membership, não consulta outras
  Agencies do ator e não contém guard de cardinalidade;
- `agency_brands` possui o índice parcial que impede mais de uma Agência ativa
  por Brand, que é uma regra diferente e já existente.

### Menor mudança estrutural futura

Depois de snapshot e auditoria de duplicidades, a menor mudança compatível tende
a ser uma migration sucessora com índices únicos parciais para registros
operacionais ativos:

1. `agencies(owner_user_id) WHERE status = 'active'`;
2. `agency_memberships(user_id) WHERE status = 'active'`.

Os nomes finais e a regra para memberships removidas/suspensas exigem decisão
após o catálogo. A proteção para Admin global deve aplicar a mesma
exclusividade conjunta de qualquer actor, sem bloquear Admin + uma Agency.
Não criar essas constraints sem
resolver duplicidades, revisar Admin, convites, RLS/RPCs e futuras
transferências de owner. A própria migration deve ter preflight, snapshot,
rollback e guard de dados.

## 5. Auditoria futura read-only

Foi criado `supabase/scripts/agency-single-operational-membership-audit-read-only.sql`.
Ele reporta apenas contagens de violação, sem UUIDs ou e-mails, para:

- owner comum em mais de uma Agência ativa;
- member comum em mais de uma Agência ativa;
- ator comum com mais de um `agencyId` efetivo;
- owner em uma Agência e member em outra;
- Admin global com zero ou uma Agency efetiva, como informação, sem tratá-lo
  como conflito;
- qualquer actor com mais de uma Agency efetiva, inclusive Admin global.

O script não foi executado remotamente. Ele não altera dados e não substitui o
  preflight de uma migration futura.

## 6. Onboarding e cadastro atual

O schema local já possui os seguintes dados:

| Campo | Situação local | Uso observado |
| --- | --- | --- |
| `agency_applications.proposed_agency_name` | existente e usado | nome proposto que alimenta o convite e o nome técnico da Agency |
| `agency_applications.responsible_name` | existente e usado | dado do solicitante/convidado |
| `agency_applications.destination_email` | existente e usado | correspondência server-side da identidade |
| `agency_applications.website_url` | existente, não exposto no onboarding atual | persistido no contrato de solicitação |
| `agency_applications.approximate_brand_count` | existente, não exposto no onboarding atual | dado opcional da solicitação |
| `agency_applications.plan_code` | existente e usado | atualmente restringido a `FREE` |
| `agency_invitations.proposed_agency_name` | existente e usado | resumo seguro do convite e nome inicial |
| `agency_invitations.responsible_name`, `plan_code`, validade/status | existentes e usados | contexto do convite e aceite único |
| `agencies.name`, `slug`, `status`, `owner_user_id` | existentes e usados | identidade operacional criada no aceite |

O formulário/página atual não é um formulário cadastral: exibe nome proposto e
plano, e oferece confirmação. Não há no código atual campos editáveis de
website, quantidade de Brands ou outros dados. Nenhum campo novo é inventado
neste adendo.

Fluxo futuro:

1. convite/aprovação → identidade Auth;
2. contexto server-side resolve o convite do ator;
3. novo cliente vê formulário vazio/parcial; cliente com dados persistidos vê
   formulário preenchido;
4. usuário revisa e confirma o cadastro;
5. a confirmação técnica pode continuar usando
   `complete_agency_onboarding`, se o contrato final permanecer compatível;
6. workspace da própria Agência é aberto.

O texto de confirmação deve ser “Confirmar cadastro” ou equivalente; não
“Aceitar e criar agência”. A abertura da página não deve aceitar o convite.

## 7. Rotas e workspace planejado

Rotas reutilizáveis já existentes:

- `/conta`: conta pessoal; identidade, senha, segurança e contextos. Não duplicar
  aqui dados organizacionais;
- `/agencias/{agencyRef}`: visão geral atual;
- `/agencias/{agencyRef}/membros`: rota existente, atualmente somente
  informativa;
- `/agencias/{agencyRef}/marcas`: rota existente, lista Brands vinculadas;
- `/agencias/{agencyRef}/configuracoes`: rota existente, atualmente somente
  informativa;
- `/admin?tab=agencias`: contexto global onde o plural “Agências” permanece
  permitido para Admin.

Estrutura planejada de “Minha Agência”:

- Visão geral;
- Dados da Agência;
- Membros;
- Marcas;
- Notificações;
- Configurações.

“Dados da Agência” é organização/cliente. “Minha conta” continua identidade
pessoal. “Notificações” é apenas uma rota planejada; não há implementação de
comunicação interna neste adendo.

Para usuário comum, a navegação futura deve ser determinística: sem Agência,
estado de acesso/cadastro pendente; onboarding pendente, completar o cadastro
da própria Agência; Agência operacional, abrir diretamente a própria Agência.
Não haverá seletor de múltiplas Agencies para usuário comum. O plural fica no
Admin global.

## 8. Fluxo futuro de Brand

`Minha Agência → Marcas → Cadastrar marca → persistir Brand → criar ou
reconciliar vínculo em agency_brands → disponibilizar com controle operacional
herdado, papel do actor e restrições explícitas da Brand.`

O fluxo preserva `brandId = public.marcas.id`, não transforma Agency em tenant
editorial e não reconstrói o módulo Marca. O acesso operacional da Agência é
herdado por padrão, mas cada ação efetiva continua limitada por RLS, papel do
actor na Agência e restrições explícitas da Brand.

## 9. Compatibilidade, dados legados, rollback e testes

Nenhum registro legado será reescrito, desativado, transferido ou submetido a
onboarding retroativo nesta tarefa. Antes de qualquer migration futura, revisar:

- owners duplicados e memberships de um mesmo ator em várias Agencies;
- owner e membership do mesmo ator em Agencies distintas;
- Admin global com zero ou uma Agency operacional existente;
- consumers de `agencies[]`, seleção, sidebar, Admin, onboarding, convites,
  RLS/RPCs, fixtures e testes;
- transfers e convites futuros que possam cruzar a regra de uma Agência.

Rollback futuro deve ser definido como parte da migration, com snapshot e
restauração apenas das alterações novas. Não há rollback executado ou
necessário nesta auditoria.

Testes da implementação seguinte devem cobrir: ator comum sem Agência,
onboarding pendente, uma Agency operacional, owner duplicado bloqueado, member
duplicado bloqueado, owner+member cruzado bloqueado, Admin global sem vínculo,
Admin global owner/member da mesma Agency permitido, Admin global administrando
várias Agencies sem vínculo operacional artificial, Brand isolada por `brandId`,
permissão editorial independente, rotas diretas e não enumeração de contas.

## 10. Próxima implementação — ainda não autorizada

Quando este adendo for aprovado, a implementação deverá tocar somente os
consumidores da Interface Planner e os contratos server-side necessários:

- `lib/server/canonical-authorization.ts` e `lib/server/personal-account.ts`;
- `app/api/contexts/route.ts` e o fluxo de onboarding;
- `app/selecionar-marca/select-brand-client.tsx`;
- `components/workspace-frame.tsx` e `components/product-shell.tsx`;
- `modules/conta/personal-account-page.tsx` e
  `modules/conta/agency-workspace-page.tsx`;
- rotas já existentes em `app/(agency)/agencias/[agencyRef]`;
- Admin/convites somente para preservar a exceção global e os guards;
- testes de autorização, navegação, onboarding e fixtures;
- migration sucessora somente se o preflight confirmar a necessidade.

Não entram: providers, Vault, e-mail, notificações, módulos editoriais,
reconstrução de Marca, troca de owner ou operação remota.

## 11. Classificação desta entrega

- **Adendo:** proposto, não aprovado.
- **Runtime:** não alterado nesta consolidação.
- **Schema/migration:** não criado nem executado.
- **Banco remoto:** não consultado nem alterado.
- **Providers/Vault/e-mail/notificações:** não configurados nem executados.
- **Git/deploy:** nenhum commit, push ou deploy.

## 12. Complemento — fluxos operacionais antes da aprovação

### 12.1 Hierarquia consolidada

```text
Plataforma
└── Admin global
    └── administra a plataforma e visualiza métricas sanitizadas

Agência
├── cliente operacional
├── owner + membros
└── administra uma ou mais Brands

Brand
├── tenant editorial por brandId = public.marcas.id
├── owner + colaboradores
└── pipeline editorial
```

Agency não substitui `brandId` como tenant editorial. `agency_brands` expressa o
vínculo operacional e concede à Agência controle herdado por padrão; não
substitui RLS, não concede capacidades bloqueadas explicitamente pela Brand e
não transforma cada funcionário em `brand_membership`.

### 12.2 Regra conjunta de exclusividade

A regra “pessoa comum → no máximo uma Agência” não pode ser implementada por
dois índices independentes apenas. Eles impediriam owner duplicado e member
duplicado separadamente, mas permitiriam o caso inválido:

```text
actor X → owner da Agência A
actor X → member da Agência B
```

O contrato futuro precisa validar a união de `agencies.owner_user_id` e
`agency_memberships.user_id` por identidade, ignorando apenas registros que a
política de status definir como não operacionais. Admin global pode ter uma
Agency operacional própria, mas não recebe vínculo operacional por seu papel
global e não pode resolver uma segunda Agency.

Alternativas auditadas conceitualmente:

1. trigger que consulta as duas tabelas: menor alteração física, porém aumenta
   acoplamento, risco de recursão e superfície de RLS;
2. função/RPC única para todas as atribuições: melhor centralização, mas exige
   retirar escritas diretas e revisar Admin, convites e transfers;
3. tabela canônica de vínculo operacional por actor: regra mais explícita, mas
   nova entidade, backfill, RLS e migração estrutural maior.

Recomendação para a próxima SDD: não aplicar índices independentes como solução
completa. Primeiro consolidar as escritas em uma função/RPC server-side e usar
guards de dados; depois escolher a menor constraint complementar comprovada pelo
preflight. Nenhuma alternativa foi implementada.

### 12.3 Ambiente operacional da Agência

“Minha Agência” deverá conter:

- Visão geral;
- Dados da Agência;
- Membros;
- Marcas;
- Atividade;
- Notificações;
- Configurações.

O owner poderá manter dados cadastrais, convidar e administrar membros,
cadastrar Brands, visualizar as Brands vinculadas, acompanhar atividade
agregada, receber notificações e receber e-mails segundo eventos e
preferências. Membros recebem somente ações autorizadas pelo papel/grant.

“Atividade” e “Notificações” são superfícies planejadas. Não são prova de que
as entidades ou rotas já existam.

### 12.4 Planilhas operacionais de UI

“Planilha de cadastro” significa padrão de interface, não uma tabela SQL nova.
Cada superfície deve usar entidades canônicas e autorização server-side.

#### Agência — planilha de membros

Origem canônica: `auth.users`/identidade, `agency_memberships` e, quando
aprovado, contexto de convite/permissões correspondente.

Colunas planejadas: pessoa, papel, status, convite, permissões aplicáveis e
ações permitidas. Ações de convite e membership não devem ser simuladas como
sucesso sem persistência confirmada.

#### Agência — planilha de Brands

Origem canônica: `agencies`, `agency_brands` e `marcas`, com controle
operacional herdado da Agência, permissões do actor e restrições explícitas da
Brand.

Colunas planejadas: Brand, status, responsável, vínculo, atividade resumida e
ações permitidas.

#### Brand — planilha de colaboradores

Origem canônica: `brand_memberships`, `brand_roles`,
`brand_member_permissions` ou equivalentes reais encontrados no checkout. A
base histórica `0002` ainda contém `user_key`; os contratos canônicos de
`0005`/`0006` e os consumidores atuais devem permanecer como fonte de
reconciliação, sem inventar um terceiro sistema.

Colunas planejadas: colaborador, papel, status, convite, permissões, módulos
autorizados e ações aplicáveis. A busca deve usar nome/e-mail para selecionar
uma identidade retornada server-side; não exigir UUID digitado.

Membros de Agency não devem ser copiados automaticamente como colaboradores
de Brand. Eles operam pelo vínculo Agency → Brand, papel/permissões da Agência
e restrições da Brand; `brand_membership` permanece destinado a colaboradores
próprios da Brand.

Todas as planilhas futuras precisam prever busca, filtros, status, ações,
estado vazio, loading, erro, autorização server-side e paginação quando o
volume justificar.

### 12.5 Fluxo administrativo da Brand

```text
Minha Agência
→ Marcas
→ Cadastrar Marca
→ persistir public.marcas
→ criar/reconciliar agency_brands
→ disponibilizar conforme owner/membership e permissões
```

O formulário futuro deve auditar antes de ser criado: formulário de Brand,
BrandDNA, dados operacionais, owner, `agency_brands`, memberships e rota
tenantizada. Cadastro operacional da Brand não deve ser misturado com
BrandDNA. O módulo Marca existente continua responsável por contexto, site,
BrandDNA, equipe e pipeline; não será reconstruído.

Hoje `/api/marcas` mantém `POST` aposentado e informa que a criação operacional
pertence ao onboarding da Agência. Isso é um bloqueio conhecido para a etapa
futura, não uma autorização para reativar criação global.

### 12.6 Comunicação compartilhada

Existe uma única infraestrutura transacional para Admin, Agência e Brand:

```text
communication_templates
→ communication_messages
→ dispatcher/provider global
→ communication_delivery_events
```

`0020` localmente define templates, messages e delivery events, além das RPCs
de fila/claim/completion/delivery. Não criar um sistema de e-mail separado por
nível. O contexto da mensagem deve identificar escopo e evento; o provider
permanece global; segredos ficam no Vault/server-side.

O catálogo local não possui `notifications`, `notification_recipients` ou
`notification_preferences` nas migrations auditadas. Esses nomes permanecem
contrato conceitual da SDD de notificações, não tabelas existentes confirmadas.

### 12.7 Notificações, sino e preferências

O desenho futuro é uma infraestrutura compartilhada, filtrada por escopo e
autorização:

```text
evento → notification → notification_recipient
                     ↘ preferência → sino/in-app
                                    ↘ communication_messages → e-mail
```

Não duplicar regra de negócio no e-mail e na notificação. O sino deve aparecer
nos shells autenticados aplicáveis: Admin, Agência, Brand e Conta quando houver
notificação destinada ao actor atual. O sino não pode listar notificações de
outro actor ou de outro escopo.

Eventos críticos só ignoram preferência se a SDD específica definir essa
exceção. Nada disso foi implementado nesta tarefa.

### 12.8 Activity e monitoramento

#### Agência

Activity da Agência será sanitizada e agregada. Eventos candidatos: importações,
artigos em andamento, aprovações, publicações, convites, colaboradores,
falhas, uso e consumo pertinente. A Agência pode acompanhar atividade de suas
Brands sem receber automaticamente permissão para abrir ou editar conteúdo
editorial.

#### Brand

Activity detalhada poderá referenciar eventos existentes: keyword importada,
ArticleDNA criado/aprovado, SERP atualizada, ContentPlan aprovado,
ContentDocument enviado, PublicationRecord criado, colaborador convidado e
permissão alterada. Activity não substitui DNA, documentos ou histórico
editorial.

#### Admin

Admin global terá visão agregada e sanitizada de Agencies, Brands, usuários,
uso, comunicação, filas, falhas, notificações, atividade e consumo. Isso não
concede acesso automático ao conteúdo editorial; suporte exige grant explícito
em etapa própria.

O checkout atual contém eventos e históricos editoriais específicos, mas não
possui uma entidade transversal de Activity/Monitoring confirmada. Mapear
eventos reutilizáveis antes de propor uma entidade futura.

### 12.9 Rotas e impactos

Rotas existentes a reutilizar:

- `/agencias/{agencyRef}`;
- `/agencias/{agencyRef}/membros`;
- `/agencias/{agencyRef}/marcas`;
- `/agencias/{agencyRef}/configuracoes`;
- rotas tenantizadas atuais de Brand.

Rotas futuras a avaliar, sem criação nesta tarefa:

- `/agencias/{agencyRef}/dados`;
- `/agencias/{agencyRef}/atividade`;
- `/agencias/{agencyRef}/notificacoes`.

Colaboradores, activity e notificações devem entrar nas superfícies existentes
sem quebrar os módulos editoriais ou duplicar `/conta` pessoal.

### 12.10 Sequência futura proposta

A. consolidar a exclusividade conjunta actor → Agency;  
B. implementar workspace da Agência: Dados, Membros, Marcas;  
C. implementar administração de Brand: colaboradores, papéis e permissões;  
D. concluir comunicação real: provider e e-mail;  
E. implementar notifications: sino, central e preferências;  
F. implementar activity/monitoring: Brand detalhada, Agência agregada, Admin
sanitizado;  
G. somente depois avaliar a retomada do smoke 3B-R1.

Cada etapa exige SDD/gate próprio, snapshot quando houver dados, RLS,
compatibilidade, rollback, testes e validação manual proporcional. A ordem não
autoriza provider, e-mail, notificações, activity, migration ou smoke.

### 12.11 Dados legados, riscos e rollback

Riscos documentados: owner/member cruzado em Agencies distintas; uso de
`user_key` legado em Brand; criação direta de Brand aposentada; ausência física
de notificações/activity; confusão entre `agency_brands` e autorização
editorial; duplicação de regra entre sino e e-mail; exposição de conteúdo ao
Admin; mensagens de UI que sugerem criação do negócio.

Nenhum dado legado será reescrito nesta etapa. Uma migration futura só poderá
ser proposta após preflight, snapshot, classificação de duplicidades e revisão
dos consumidores. Rollback deve restaurar apenas a mudança nova, preservar
Brands, `brandId`, memberships, convites e históricos, e bloquear exclusões
ambíguas.

### 12.12 Testes futuros

- hierarquia Plataforma → Agency → Brand e separação de `brandId`;
- owner comum, member comum e conflito owner+member entre Agencies;
- Admin global administrando várias Agencies sem membership automática;
- planilhas com busca, filtros, estados vazio/loading/erro, paginação e guards;
- Agency members separados de Brand collaborators;
- Brand roles/permissões sem sistema paralelo;
- Brand operável por `agency_brands` por padrão, com restrição explícita,
  permissão do actor e RLS aplicadas;
- comunicação única, contexto de evento e provider global server-side;
- notificações filtradas pelo actor e escopo;
- evento com sino/e-mail sem duplicar regra de negócio;
- Activity sanitizada em Agency/Admin e detalhada na Brand;
- não enumeração de contas, autorização server-side e rotas diretas;
- regressões de `/conta`, `/admin`, onboarding, convites e módulos editoriais;
- só então smoke manual da 3B-R1.

## 13. Entrega do complemento

Este complemento atende ao planejamento solicitado: contrato hierárquico,
cadastro de cada nível, planilhas de UI, autorização, relação Agency members ×
Brand collaborators, comunicação, notifications, fluxo sino/e-mail,
activity/monitoring, visibilidade por nível, rotas, impacto de schema,
exclusividade conjunta, legado, migrations futuras, riscos, rollback, testes e
sequência.

Permanece **PROPOSTO, NÃO APROVADO**.

## 14. Controle da Agência sobre as Brands

Este bloco substitui a interpretação anterior de que `agency_brands` seria
somente um vínculo administrativo sem acesso operacional editorial.

A Agência possui acesso operacional herdado sobre as Brands que administra.
Por padrão, esse acesso cobre as áreas necessárias à prestação do serviço,
incluindo Dados da Brand, colaboradores, Minerador, Arquiteto, Radar,
Planejador, Redator, Publicações, Activity e Notificações, sempre sujeito à
segurança/RLS da plataforma.

Esse acesso não transforma Agency em tenant editorial:

```text
brandId = public.marcas.id
Agency → controle operacional herdado
Brand → restrições explícitas de capacidades
```

A Brand pode restringir explicitamente uma área, módulo ou capacidade
específica. A restrição:

- é explícita, persistida e auditável;
- identifica Brand, Agency e capacidade/escopo afetado;
- pode ser removida;
- não altera owner;
- não remove o vínculo Agency → Brand;
- não cria `brand_membership` artificial;
- prevalece sobre o acesso herdado da Agência;
- deve ser visível à Agência com o motivo/escopo aplicável.

Ausência de restrição registrada significa que o acesso herdado permanece. Não
é permitido transformar ausência de registro em bloqueio misterioso.

O acesso efetivo de um funcionário da Agência é, conceitualmente:

```text
RLS e segurança da plataforma
∩ acesso herdado da Agency → Brand
∩ papel/permissões do actor na Agency
− restrições explícitas da Brand
```

Para fins de precedência:

1. segurança e RLS da plataforma;
2. restrições explícitas definidas pela Brand;
3. permissões do actor dentro da Agência;
4. acesso operacional herdado da Agência.

Ver atividade não equivale a executar ação. Uma Brand pode restringir
Publicações e ainda permitir que a Agência veja que há conteúdos aguardando
publicação. O módulo restrito deve permanecer visível com estado explícito,
como “Acesso restrito pela Brand”, e não desaparecer silenciosamente.

Colaboradores próprios da Brand continuam usando `brand_memberships`, papéis e
permissões da Brand. Funcionários da Agência não recebem `brand_membership`
apenas para trabalhar em Brands administradas pela própria Agência.

### Estado atual e impacto futuro

O schema local de `agency_brands` e a autorização atual ainda não expressam
restrições explícitas nem o acesso operacional herdado completo. O resolvedor
atual calcula o acesso editorial por ownership/membership da Brand; portanto,
esta decisão é uma mudança estrutural futura, não comportamento já implementado.

Antes de qualquer código, será necessário definir em SDD própria a estrutura
canônica de restrições, seu contrato de capacidade, RLS, auditoria, grants,
interface da Brand (“Acesso da Agência”), interface da Agência e compatibilidade
com `brand_memberships`. Não criar coluna, tabela, migration ou fallback nesta
tarefa.

A SDD estrutural correspondente foi criada em
`docs/compartilhado/sdd-autorizacao-pessoa-agencia-brand.md` e permanece
**Proposta, não aprovada**.

Exemplo conceitual:

```text
Marca Lindisse
Publicações: acesso restrito pela Brand
Alterar BrandDNA: acesso restrito pela Brand
Gerenciar colaboradores: permitido
Minerador: permitido
Arquiteto: permitido
Radar: permitido
Redator: permitido
```

A Agência continua administrando a Lindisse, acompanha a atividade permitida e
conhece as restrições; não pode executar somente as capacidades bloqueadas.
