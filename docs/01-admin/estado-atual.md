# Estado atual — Admin

## Central de Comunicação da Plataforma — 2026-08-07

- **Auditoria local:** a configuração atual de e-mail usa Resend diretamente
  em `lib/server/agency-invitation-email.ts`, com credenciais somente em
  `RESEND_API_KEY` e `RESEND_FROM_EMAIL` server-side. O Admin recebe apenas
  estado sanitizado de configuração; nenhum segredo chega ao cliente.
- **Gate confirmado pelo usuário:** Vault disponível, funções oficiais e view
  presentes, `anon`/`authenticated` negados, `service_role` permitido e zero
  dependências inesperadas. O resultado foi
  `READY_FOR_COMMUNICATION_SCHEMA_REVIEW`.
- **Preparado localmente:** `0019_platform_communication.sql` cria somente
  metadata global; `secret_ref` aponta para o Vault e nenhuma API key é
  persistida em tabela pública. Rollback e pós-validação estão preparados.
- **Preparado no runtime:** `CommunicationService` e `ResendCommunicationProvider`
  são server-only; convites e acesso não chamam mais Resend diretamente. A
  tela `/admin?tab=configuracoes` retorna apenas metadata sanitizada.
- **Ainda não aplicado:** migration, criação/rotação de credencial, teste real
  de envio e configuração SMTP do Supabase Auth. Auth, RLS, owners,
  memberships e providers existentes não foram alterados remotamente.
- **Preflight preparado:** `supabase/scripts/fase-comunicacao-vault-preflight-read-only.sql`
  permanece somente leitura e sanitizado.
- **Alternativas e critérios:** estão registrados em
  `docs/compartilhado/sdd-central-comunicacao-plataforma.md`; a escolha exige
  revisão humana antes de qualquer código estrutural.
- **Operações remotas:** nenhuma.

## Fase 3B.1 — Home pública, solicitação Free e onboarding de agências — 2026-08-07

- **Verificado no código:** `/` é Home pública e o Plano Free abre uma solicitação sem senha. `POST /api/admin/agencies` e `POST /api/marcas` seguem desativados com `405`.
- **Preparado localmente:** `0018_agency_onboarding.sql`, preflight e pós-validação somente leitura. A migration cria `agency_applications`, `agency_invitations`, `agency_onboardings` e RPCs transacionais. Ela não foi aplicada remotamente.
- **Fluxos:** solicitação pública `PENDING` só cria convite após aprovação de Admin. Convite direto e convite de solicitação convergem no mesmo aceite autenticado. Owner é `auth.users.id`; não há membership, papel global ou acesso editorial implícito.
- **Entrega:** Plano Free é R$ 0 e depende de aprovação; não há cobrança ou cupom. Nenhum provider de e-mail foi encontrado/configurado: o estado é `NOT_CONFIGURED` e o link é retornado uma única vez para cópia manual.
- **Ainda não verificado:** preflight, snapshot, aplicação manual, RLS remoto e smoke dos dois fluxos. Nenhuma escrita no Supabase, migration, commit, push ou deploy foi executado nesta fase.
- **Correção focal posterior:** enquanto `0018_agency_onboarding.sql` não estiver aplicada, a rota pública retorna `SCHEMA_NOT_APPLIED` com a orientação explícita do gate manual. Não há fallback local nem sucesso sem persistência.
- **Gate de aplicação preparado localmente:** `fase-3b1-0018-preflight-read-only.sql` verifica colisões de nomes, contratos canônicos e a ausência dos três contratos legados; `fase-3b1-0018-post-validation-read-only.sql` valida RLS sem policies públicas, token somente por hash, estados, plano `FREE`, grants de RPC e contratos canônicos. Ambos retornam somente contagens e estados sanitizados. Snapshot manual novo imediatamente antes da escrita continua obrigatório.
- **Idempotência revisada localmente:** a aprovação concorrente bloqueia a solicitação e a segunda tentativa retorna conflito explícito. Não cria um segundo convite nem devolve token bruto incompatível com o hash do convite existente.
- **Onboarding utilizável — verificado no código:** Admin aprova ou cria convite e recebe o link canônico `/onboarding/agencia?token=...` para cópia manual; o estado de entrega é `NOT_CONFIGURED`. A lista administrativa mostra empresa, plano, origem, status, validade e ação compatível, sem `token_hash`. O token bruto só permanece na resposta da criação e no estado da tela para cópia imediata.
- **Cadastro e retorno:** o portal conserva `token` e chave de operação no `callbackUrl`; cadastro fixa o e-mail do convite e distingue `SESSION_AVAILABLE_AFTER_SIGNUP` de `EMAIL_CONFIRMATION_REQUIRED`. Login também retorna ao mesmo portal, que revalida token, destinatário e sessão antes do aceite.
- **Separação de autorização:** o aceite chama a RPC transacional com `actorUserId` da sessão Supabase, cria a agência com `owner_user_id` do ator e não escreve `perfis.role`, `agency_memberships` ou acesso editorial implícito. A prova remota dessas condições depende do smoke manual após a aplicação da `0018`.
- **Criação direta aposentada:** a auditoria local encontrou o contrato antigo apenas como mensagem de compatibilidade/teste e o `405` `AGENCY_DIRECT_CREATE_RETIRED`; não há consumidor ativo do modal com “Nova agência”, “Slug de apresentação”, “Proprietário” ou “Criar agência”. `direct_admin_agency_creation_ui = 0` e `direct_admin_agency_creation_api = 0` no código atual.
- **Smoke manual pendente:** Admin aprovar → copiar link; janela anônima abrir link → criar senha ou entrar → retornar ao convite → aceitar → abrir a agência; depois logout/login e confirmar agência disponível, `/admin` negado para o owner. Confirmação de e-mail real e sessão Supabase permanecem validações manuais.
- **Auth e e-mail — preparado localmente:** cadastro sem sessão mostra `EMAIL_CONFIRMATION_REQUIRED` e oferece `auth.resend({ type: "signup" })`; login diferencia `email_not_confirmed` de credencial inválida. O callback existente `/auth/callback` continua transportando o `callbackUrl` seguro até o onboarding.
- **Sessão incompatível no convite:** identidade diferente do destinatário não vê o aceite; recebe “Você está conectado com outra conta”, pode sair preservando o convite e retornar a Entrar/Criar acesso.
- **Isolamento de sessão e contextos — verificado no código:** `actorUserId` vem exclusivamente da sessão Supabase SSR verificada. `/api/contexts` e as leituras client-side de marcas/agências usam `no-store`; ao trocar de identidade, listas, papel e seleção transitória são invalidados e respostas antigas não podem repovoar o estado. `localStorage`/IndexedDB permanecem somente como recuperação/preferências editoriais, nunca como fonte de autorização.
- **Origem do acesso à marca:** o resolvedor canônico considera somente `marcas.owner_user_id` ou `brand_memberships.member_user_id` ativo com permissão do módulo. `agency_memberships` e `agency_brands` não concedem acesso editorial. A origem da marca observada no smoke remoto continua pendente de confirmação no catálogo remoto; nenhuma operação remota foi executada nesta correção.
- **Resend:** camada server-side `sendAgencyInvitationEmail` usa a API oficial somente quando `RESEND_API_KEY` e `RESEND_FROM_EMAIL` estiverem configuradas. Sem elas, o estado é `NOT_CONFIGURED`; falha de envio mantém o convite `PENDING` e conserva a cópia manual do link. Nenhuma chave foi registrada.
- **Ciclo de identidade — verificado no código:** uma sessão Supabase SSR representa uma identidade por browser profile/origin; abas do mesmo origin compartilham essa identidade e uma identidade pode acessar vários contextos autorizados. Não há JWT paralelo, cookie de identidade ou localStorage como fonte de sessão.
- **Login e recuperação:** `email_not_confirmed` é classificado como `EMAIL_NOT_CONFIRMED` com reenvio de confirmação; falhas de credencial permanecem `INVALID_CREDENTIALS`. O cadastro não afirma criação confirmada quando a identidade pode existir de forma ofuscada e orienta login ou recuperação. `/recuperar-senha` usa `resetPasswordForEmail`, callback seguro e `updateUser` para a nova senha. A confirmação real e a entrega do e-mail continuam validação manual.
- **Admin/Agências — verificado no código:** a tela separa `PENDENTES` (somente applications `PENDING`), `CONVITES` (somente invitations `PENDING`), `ATIVAS` (somente agencies `active`) e `HISTÓRICO` (applications `APPROVED`/`REJECTED` e invitations `ACCEPTED`/`REVOKED`/`EXPIRED`). Application aprovada, convite aceito e agência não permanecem como tarefas pendentes ou convites acionáveis.
- **Acesso de agência ativa — preparado localmente:** a visão `ATIVAS` oferece `Enviar link de acesso` e `Enviar recuperação de senha` somente por rota server-side protegida por Admin global. O link usa `/login?callbackUrl=/agencias/{agencyRef}`; a recuperação usa Supabase Auth. Nenhuma ação cria invitation, altera owner/membership/perfil ou concede Admin.
- **Separação de e-mails:** `AgencyInvitationEmail` continua destinado ao onboarding antes da agência existir; `AgencyAccessEmail` é separado e usa somente destino, nome, agência e login URL. Sem `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, ambos permanecem `NOT_CONFIGURED`; nenhum envio é declarado sem resposta real do provider.
- **Application APPROVED sem convite ativo — evolução especificada, não implementada:** um convite `PENDING` dentro da política atual pode ser rotacionado no mesmo `invitation_id`; convite expirado, revogado, aceito ou com validade legada incompatível exige sucessor com a mesma `application_id`. A SDD agora define lifecycle histórico 1:N, marcador operacional, unicidade parcial e lock transacional; a constraint atual continua bloqueando o sucessor até a migration futura. O convite legado não é editado nem apagado.
- **Link de acesso — resolvido localmente:** a visão `ATIVAS` oferece copiar `/login?callbackUrl=/agencias/{agencyRef}` usando a origem atual, além de envio de acesso e recuperação. A cópia não depende do Resend. O Admin recebe somente `RESEND_CONFIGURED: YES/NO`; chaves nunca chegam ao cliente.

## Fase 3A.1 — criação operacional de agência e marca — 2026-08-07

- **Verificado no código:** a criação operacional direta de agência e marca foi retirada da superfície Admin; o Admin mantém somente convite de agência e os registros estruturais existentes. `POST /api/admin/agencies` e `POST /api/marcas` retornam `405`. A busca de owner, quando aplicável ao registro de marca, é protegida por Admin global e ocorre somente no servidor.
- **Agência:** a criação persiste `agencies.owner_user_id` e retorna `agencyRef` pelo helper canônico. Owner não recebe membership adicional por inferência.
- **Marca:** a criação estrutural persiste `marcas.owner_user_id`, cria `agency_brands` ativo e retorna `brandRef` pelo helper canônico. O vínculo administrativo não cria membership nem acesso editorial para o Admin ou owner.
- **Atomicidade:** agência é uma única escrita. Marca e vínculo possuem compensação server-side quando a segunda escrita falha; sucesso só é exibido depois de ambas as confirmações. Uma transação SQL/RPC não foi introduzida, pois isso exigiria ampliar schema/contrato fora desta fase.
- **Ainda não verificado:** criação e isolamento no Supabase remoto; a sequência manual de criação de agência e marca de teste permanece necessária.
- **Não executado:** SQL remoto, escrita remota de teste, migration, commit, push ou deploy.

## Fluxo de criação de marca e owner — estado relatado/validado em janela anterior

O fluxo registrado é: Admin global abre o cadastro, pesquisa usuários Auth server-side, seleciona owner real, o servidor revalida, cria a marca, cria membership owner ativa, retorna `brandId`/`brandRef` e o Admin entra na rota tenantizada. A implementação não aceita o texto pesquisado como owner.

O estado operacional registrado para Adalba e Lindisse indica owners distintos, memberships isoladas, acesso do Admin a ambas, Lindisse iniciando vazia, dados da Adalba preservados, troca de marca funcionando e sidebar/Extensão acompanhando a marca ativa. Esta é evidência datada de operação anterior, não uma nova validação nesta tarefa.
- **Última auditoria:** 2026-07-20, por leitura de código.
- **Funcionando:** rota `/admin`, tela de marcas e API de marcas. **Verificado no código.**
- **Parcial:** visão resumida é simples; não foi validada manualmente nesta sprint.
- **Simulado:** não identificado na superfície administrativa auditada.
- **Local:** marca selecionada é lembrada no navegador pelo provider compartilhado.
- **Persistido:** marcas e listas/silos iniciais por Supabase. **Verificado no código.**
- **Bloqueado:** nenhuma operação de dados foi executada nesta sprint.
- **Regressões e bugs:** não auditados manualmente.
- **Arquivos centrais:** `app/(admin)/admin/marcas/page.tsx`, `app/api/marcas/route.ts`.
- **Testes:** `tests/marcas-access.test.mjs` cobre acesso; execução desta sprint registrada no relatório.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** nenhuma material identificada por leitura; validar UI e RLS em ambiente real.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/admin; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- O Admin permanece global; o botão de abrir marca agora direciona à rota canônica do tenant.

# Shell global e seleção de marca — 2026-07-23
- ProductShell conserva o fluxo operacional geral no Admin; as tabs administrativas continuam em AdminConsole.
- A seleção de marca foi separada em Server Component com Suspense e componente cliente para os parâmetros de busca.
- No Admin, trocar a marca atualiza apenas os atalhos e preserva a rota administrativa.
- Validação local: suite focalizada 29/29 nesta correção, suite acumulada 212/212, TypeScript aprovado e lint focalizado aprovado.
- Build completo permanece pendente até o encerramento autorizado do servidor Next; validação autenticada manual permanece pendente.

# Busca e seleção real de owner — 2026-07-26
- O cadastro de marca separa texto pesquisado, owner selecionado e status da busca.
- A criação só habilita o envio após seleção de um usuário Auth retornado pelo servidor; o payload usa `ownerUserId` e não aceita o texto digitado como owner.
- A busca administrativa exige Admin global, normaliza trim/caixa, percorre as páginas necessárias de `auth.admin.listUsers` e preserva usuários ainda não confirmados.
- Erros 401/403/500 permanecem distintos de busca concluída sem resultados; falhas de salvamento ficam no estado do formulário sem Console Error esperado no navegador.
- Validação local: testes Admin 12/12, suíte `test:authz` 43/43, TypeScript, ESLint focalizado e build aprovados.
- Não foi executada consulta remota, escrita no Supabase, migration, commit, push ou deploy; existência do e-mail informado não foi verificada remotamente.
# Gestão de usuários e papéis globais — 2026-08-05

- **Verificado no código:** `/admin?tab=usuarios` consulta identidades existentes exclusivamente por uma rota server-side protegida por Admin global. A lista exibe e-mail, nome quando disponível, confirmação/bloqueio da identidade, papel global, resumo de memberships de agência e de marca, e estado de acesso.
- **Contrato efetivo:** o papel global é `public.perfis.role = 'admin'`. `auth.users.id` é revalidado antes de qualquer alteração. `brand_memberships`, `agency_memberships`, `marcas.owner_user_id` e as marcas são somente leitura nesta funcionalidade.
- **Persistência prevista:** conceder cria um perfil mínimo com `id` e `role='admin'` apenas quando a identidade ainda não possui `perfis`; atualizar ou remover preserva os demais campos existentes do perfil. Sucesso no cliente só é mostrado depois da resposta confirmada e de nova leitura.
- **Proteções verificadas no código:** rotas exigem Admin global em GET e PATCH; UUID é validado e revalidado no Supabase Auth; remoção exige outro Admin global ativo; não permite despromover uma identidade ainda privilegiada por `ADMIN_EMAIL`, pois a configuração server-side continuaria concedendo acesso.
- **Limitação conhecida:** não há trilha de auditoria durável de alterações globais confirmada no schema atual; esta tarefa não criou tabela, migration ou novo contrato de auditoria.
- **Confirmado por testes locais:** `tests/admin-users.test.mts` e TypeScript passaram. A validação autenticada, a leitura do Auth remoto e qualquer escrita remota continuam pendentes de execução manual autorizada.
- **Não executado:** SQL remoto, migrations, escrita no Supabase, alteração de `ADMIN_EMAIL`, commit, push e deploy.
# Fundação local da hierarquia Agência → Marca — 2026-08-05

- **Preparado localmente:** SDD e scripts manuais para bootstrap da Agência Adalba e para despromoção posterior de `adalbapro@gmail.com`.
- **Schema:** a migration `0014_agency_foundation.sql` já contém as três tabelas, constraints, RLS e funções de agência; nenhuma migration duplicada foi criada.
- **Ainda não aplicado/verificado remotamente:** existência de `scalbeto@gmail.com` no Auth, UUID da Lindisse, aplicação de `0014`, RLS remoto e bootstrap.
- **Proteções:** UUIDs e nomes exatos são obrigatórios; scripts abortam sem identidade, links ativos conflitantes ou fundação ausente; snapshots confirmam que owner e `brand_memberships` não mudaram.
- **Fora de escopo preservado:** providers, dados editoriais, `brandId`, owners, `brand_memberships` e interfaces de agências.
# Correção de reexecução da 0014 — 2026-08-05

- **Relatado pelo usuário:** a execução manual encontrou `42710`, pois `agency_0014_agencies_select` já existe no banco.
- **Corrigido localmente:** a 0014 agora consulta `pg_catalog.pg_policies`; uma policy existente só é aceita se ainda tiver comando, papel e predicados compatíveis. Policy ausente é criada. Policy divergente aborta com `AGENCY_0014_POLICY_CONFLICT`, sem `DROP POLICY` ou substituição silenciosa.
- **Ainda não verificado:** resultado da nova execução manual. Nenhum SQL remoto foi executado nesta correção.

# Auditoria remota somente leitura da hierarquia de agência — 2026-08-05

- **Projeto confirmado:** o diretório está vinculado a `hjjlntdpdgvpnazdztqw`. `supabase migration list --linked` retornou as migrations locais `0001` a `0014`, mas sem versões remotas; isso não comprova ausência de schema remoto.
- **Confirmado remotamente por leitura:** `agencies`, `agency_memberships` e `agency_brands` existem com as colunas previstas pela `0014`, mas têm zero registros. `perfis` possui somente `adalbapro@gmail.com` como Admin global (`marca_id = NULL`).
- **Owners e memberships preservados:** Adalba tem `adalbapro@gmail.com` como owner ativo; Lindisse tem `scalbeto@gmail.com` como owner ativo. A membership de Scalberto é, portanto, legítima e coerente com o owner da Lindisse; não é candidata à exclusão.
- **Bloqueio operacional antes do bootstrap:** Scalberto existe no Auth, mas ainda não possui e-mail confirmado; o bootstrap local agora exige identidades confirmadas. Nenhuma criação de agência, papel ou membership foi executada remotamente nesta auditoria.
- **Divergência a investigar manualmente:** uma policy `agency_0014_agencies_select` já existia, enquanto o ledger remoto não foi retornado pelo CLI. A origem exata não é comprovável sem leitura do catálogo/ledger pelo SQL Editor. O novo script `agency-remote-structure-audit.sql` é somente leitura e cobre catálogo, RLS, policies, funções, grants e dados estruturais.
- **Backup:** o dump schema via CLI não foi produzido porque o ambiente local não possui Docker Desktop; o arquivo vazio gerado pela tentativa foi removido. Não existe backup de dados desta rodada. Ambos devem ser gerados separadamente, revisados e mantidos fora do Git antes de qualquer escrita manual.
- **Achado fora de escopo:** `supabase db lint --linked` encontrou ambiguidade em `public.import_minerador_discovery_candidates` (`keyword_id`); não foi alterada por pertencer ao Minerador.
# Preparação canônica compartilhada — 2026-08-06

- **Verificado no código:** Admin global ainda depende de `perfis.role` e também de compatibilidade por `ADMIN_EMAIL`; as APIs atuais permanecem inalteradas.
- **Preparado localmente:** contrato separado de `platform_admin` baseado em UUID e `perfis.role`, sem transformar Admin em owner, membership de marca ou membership de agência.
- **Ainda não verificado:** catálogo remoto de `perfis`, RLS, grants, último Admin operacional e dependências de `marca_id`.
- **Pendente:** executar o gate remoto da geração canônica antes de cortar `ADMIN_EMAIL` ou alterar consumidores.
## Fase 2A — Administração global canônica — 2026-08-06

- **Verificado no código:** o layout `/admin` e as APIs de usuários, busca de owners, agências e marcas exigem `requireCanonicalPlatformAdmin()`, baseado em UUID autenticado e `public.perfis.role = 'admin'`.
- **Preservado:** a Administração global não cria owner ou membership de marca/agência e não libera a rota editorial de uma marca para Admin sem vínculo. A proteção do último Admin e o bootstrap legado por `ADMIN_EMAIL` permanecem em consumidores não removidos nesta fase.
- **Pendente:** smoke manual com Admin operacional em `/admin`, `/admin?tab=usuarios` e `/admin?tab=marcas`, inclusive confirmação de que não há acesso editorial automático. Nenhuma escrita remota, alteração de configuração, commit, push ou deploy foi executado.

## Fase 2C — Admin global persistido — 2026-08-06

- **Implementado localmente:** a administração global operacional é decidida somente por `public.perfis.role = 'admin'` para o UUID autenticado. `ADMIN_EMAIL` deixou de impedir a remoção de um Admin; a proteção do último Admin ativo permanece server-side.
- **Bootstrap manual preparado:** os scripts Fase 2C não contêm e-mail/UUID reais e atribuem a identidade escolhida como Admin global e owner da Agência Adalba, mantendo owners existentes das marcas. Eles não foram executados.
- **Pendente manual:** preflight, bootstrap, validação pós-bootstrap e smoke em `/admin`, usuários, agências e marcas. Sem esses resultados, a homologação operacional permanece pendente.
# Auditoria adicional Fase 3B.1 — separação Admin global e onboarding

- O fluxo `AgencyApplication`/`AgencyInvitation`/aceite não escreve `perfis.role`, não cria membership redundante e resolve o owner a partir da sessão Supabase verificada no servidor.
- As escritas de Admin global encontradas pertencem ao serviço explícito de `/admin/usuarios` e a scripts históricos de bootstrap; não são consumidores do onboarding.
- Layouts privados tratam sessão Supabase ausente ou inválida como estado esperado e redirecionam para `/login` com retorno seguro. A confirmação real de e-mail do projeto remoto permanece pendente de smoke manual.

# Links Auth canonicos via CommunicationService - 2026-08-07

- Corrigido localmente: o falso link /login?callbackUrl=... deixou de ser usado para acesso de agencia. O Admin agora gera magic link temporario server-side, retornado uma unica vez e mantido somente no estado da tela.
- Envio operacional: send_access_email gera o mesmo magic link Supabase e o entrega pelo CommunicationService global; recovery usa link recovery; onboarding usa signup com confirmacao via CommunicationService.
- Seguranca: Admin canonico e exigido antes de gerar links; destino passa por safeAuthRedirect; service role e links nao chegam ao bundle, nao sao persistidos nem registrados em logs. NOT_CONFIGURED nao gera links de envio.
- Nao alterado: Vault/0019, schema, RLS, owners, memberships, perfis.role, Auth provider e multi-account.
- Pendente: smoke manual com magic link, signup de convite, recovery e provider global READY/NOT_CONFIGURED. Nenhuma operacao remota foi executada pelo Codex.
# 3B-R2a + 3B-R4a — comunicação e onboarding mínimos — 2026-08-09

As entradas datadas abaixo são snapshots históricos; quando houver conflito,
esta seção vigente prevalece para o runtime local atual.

- **Implementado localmente:** `0020_communication_transactional_minimum.sql` prepara templates, mensagens duráveis, claim/retry limitado e eventos de entrega. A migration não foi aplicada remotamente.
- **Verificado no código:** convite direto, aprovação e reenvio persistem mensagem antes de tentar o dispatcher; nenhum desses fluxos retorna token bruto ou chama Resend diretamente.
- **Verificado no código:** convite válido direciona server-side para login normal quando há identidade Auth correspondente e para cadastro quando não há; a detecção ocorre somente no contexto do convite e não cria endpoint público de enumeração.
- **Verificado no código:** aceite autenticado é a única fronteira que cria a Agência; `owner_user_id` permanece o owner canônico e não é criado membership adicional por inferência. O welcome é idempotente e também passa pela fila.
- **Verificado no código:** a visão de agências ativas separa `Agência: ACTIVE` de `Acesso: READY/PENDING/REQUIRES_ATTENTION`; registros legados não são reescritos.
- **Contrato preservado:** recuperação preferencial é `/recuperar-senha` → Supabase Auth. Os endpoints administrativos antigos de acesso temporário/recovery foram aposentados localmente para não manter dois mecanismos.
- **Pendente:** aplicação manual da `0018`/`0019`/`0020`, provider global READY, configuração de Vault/webhook, dispatcher operacional com retry e e-mail real. Nenhum smoke remoto foi solicitado ou executado.

# Base canônica Pessoa-Agency-Brand - 2026-08-10

- **Implementado localmente:** migration sucessora 0021 com exclusividade transacional actor → Agency, RPCs de owner/membership/link, catálogo de capabilities e leitura administrativa preservando Admin global fora de Agency operacional.
- **Verificado localmente:** Admin usa RPCs canônicas para salvar membership e vínculo Agency-Brand; nenhuma identidade Admin é transformada em owner/member por login ou seleção de contexto.
- **Pendente:** preflight remoto, snapshot, aplicação manual da 0021, verificação remota de RLS/grants e smoke autenticado. Nenhuma operação remota ocorreu.

## Correção local da premissa Admin global + Agency — 2026-08-10

- **Contrato vigente localmente:** uma identidade com `perfis.role = 'admin'` pode possuir uma única Agency operacional legítima, como owner, member ou owner + membership na mesma Agency.
- **Bloqueio canônico:** somente a união deduplicada de `agencies.owner_user_id` e `agency_memberships.user_id` com mais de um `agency_id` efetivo bloqueia a 0021, independentemente do papel global.
- **Contexts:** `isPlatformAdmin` representa o contexto global; `operationalAgency` representa a Agency operacional singular quando exatamente uma é resolvida. A lista global não escolhe a primeira Agency como fallback.
- **Preflight/migration:** o check de Admin com vínculo é informativo; `effective_multi_agency_actors` é o gate esperado em zero; o bloqueio específico de Admin foi removido localmente do precondition, trigger e RPCs da 0021.
- **Remoto:** nenhum dado foi alterado, e a migration 0021 continua não aplicada até novo preflight manual aprovado.
# Correcao vigente do gate 3B-R2a/R4a - 2026-08-09

- Convites usam geracoes hash-only. Retry, reclaim ou reenvio criam nova geracao sem substituir as anteriores; cada geracao expira com o convite e o aceite valido e exatamente uma vez.
- O lease de dispatch e centralizado em 300 segundos. `QUEUED`/`FAILED` elegiveis e `SENDING` expirado competem com `SKIP LOCKED`; `SENDING` valido nao e recuperado.
- O primeiro `provider_message_id` permanece protegido por `coalesce`; eventos de delivery sao idempotentes por `event_id`. A limitacao de um id no cabecalho da mensagem permanece documentada.
- Rollback fisico somente apos dry-run, snapshot e guard sem dados; rollback operacional nao remove mensagens, convites, agencias, Auth ou Vault.
- Verificado localmente: 30 testes focados e TypeScript. Nao aplicado remotamente; provider, webhook, e-mail real, smoke e catalogo remoto permanecem pendentes.
# Gate remoto pós-migration 0020 - 2026-08-09

## Pós-login de solicitante aprovado - 2026-08-09

- **Dead-end fechado localmente:** a identidade autenticada recebe o CTA `Finalizar acesso à agência`, que abre o onboarding sem token bruto e sem depender da chegada do e-mail.
- **Aceite preservado:** o servidor resolve novamente o convite pendente do ator e só chama `complete_agency_onboarding` após a confirmação explícita.
- **Auditoria pós-0020 v3:** o arquivo real antigo usava `remote/pass` e não continha a correção uniforme prometida. Seu primeiro bloco produziria `MISSING/false` para relação ausente; `remote = null / pass = true` não pode ser atribuído a esse bloco. A v3 local consolida todos os checks em um único result set, usa `check_name/expected/observed/verdict`, versão fixa `2026-08-10-v3` e ainda não foi executada remotamente.
- **Auditoria dos 9 FAILs:** a migration local contém o CHECK used/revoked, mas o padrão do v3 não normaliza a definição retornada pelo catálogo. Os oito FAILs restantes são privilégios efetivos de `service_role`, cuja origem owner/herança/ACL padrão não é distinguida pelo verificador. Consumidores locais usam RPCs para escrita; nenhum DELETE legítimo foi encontrado. Classificação atual: `VERIFIER_NEEDS_CORRECTION`; preflight read-only de hardening preparado, sem correção remota.

- **Corrigido localmente:** `/api/contexts` agora distingue identidade autenticada com solicitação aprovada, convite pendente e onboarding ainda não concluído.
- **Segurança:** a correspondência com a identidade Auth ocorre somente server-side para o ator atual. A resposta não expõe e-mail, UUID, token ou existência de contas de terceiros.
- **Preservado:** nenhuma Agência é criada no login; a criação continua limitada ao aceite autenticado e ao onboarding. O reenvio administrativo existente não foi duplicado.
- **Logout:** o controle compartilhado passou a existir no shell global e no workspace de Agência/Conta, com foco e rótulo acessível também no modo compacto.
- **Pendente:** validação manual visual/autenticada, e-mail real e smoke de onboarding. Não houve operação remota nesta correção.

- `snapshot_pre_0020: NOT_PERFORMED`.
- `migration_0020: APPLIED_MANUALLY`.
- `migration_result: SUCCESS_REPORTED_BY_USER` (`Success. No rows returned`).
- A verificação do schema remoto ainda não foi executada pelo agente e não há confirmação de catálogo, RLS, policies, grants ou RPCs remotos.
- O próximo passo é snapshot pós-0020 e consulta read-only; provider, Vault, webhook, dispatcher, e-mail real e smoke permanecem bloqueados.

# Proveniência dos grants extras da 0020 — 2026-08-10

- **Verificado localmente:** nenhum dos sete privilégios adicionais de `service_role` foi encontrado em migrations, scripts, docs, fixtures, seeds ou consumidores ativos.
- **Verificado na migration local:** a 0020 revoga `PUBLIC`, `anon` e `authenticated`, mas não revoga privilégios prévios de `service_role`; os grants mínimos apenas acrescentam o conjunto necessário.
- **Pendente de catálogo remoto:** grantor, owner, default ACL e role membership que originaram os grants explícitos.
- **Consumidores:** os sete privilégios extras não são usados diretamente pelo runtime; operações mutáveis passam por RPCs `SECURITY DEFINER`.
- **Script preparado:** `supabase/scripts/fase-comunicacao-0020-acl-provenance-read-only.sql`, sem execução remota.
- **Classificação:** `BLOCKED_BY_ACL_PROVENANCE`; nenhum ACL foi alterado.

# Minha Agência — base operacional - 2026-08-10

- **Estado remoto relatado pelo usuário:** `0021 = APPLIED_MANUALLY`; verificação pós-migration read-only = `POST_VERIFICATION_PASS`. O snapshot pré-0021 e o smoke autenticado continuam sem execução registrada pelo agente.
- **Implementado localmente:** workspace `/agencias/{agencyRef}` com Visão geral, Dados da Agency, Membros, Marcas e Configurações, resolvido server-side por sessão Supabase e autorização canônica.
- **Implementado localmente:** overview usa nome, status, completude estrutural, owner, contagem de membros e contagem de Brands persistidos. Não há métricas inventadas, atividade, sino ou notificações runtime.
- **Implementado localmente:** owner e administradores da Agency podem editar o nome, gerenciar memberships de identidades Auth existentes, escolher capacidades do catálogo 0021 e cadastrar Brand vinculada. O convite por e-mail não é anunciado como enviado.
- **Implementado localmente:** cadastro de Brand preserva `marcas.owner_user_id` no owner canônico da Agency, cria `agency_brands` e não cria `brand_memberships` artificial nem inicia BrandDNA/editorial.
- **Preservado:** `/conta` permanece pessoal; Administração global permanece em `/admin`; não há seleção entre múltiplas Agencies nem fallback para a primeira Agency.
- **Ainda pendente:** checklist manual visual/autenticado, smoke real de sessão, provider/Vault, dispatcher, webhook, e-mail e retorno ao smoke 3B-R1. Nenhuma operação remota foi executada pelo agente.

## Correção do carregamento da estrutura Agency - 2026-08-10

- **Causa confirmada:** `lib/server/agency-workspace.ts` ainda selecionava `agency_memberships.canonical_role`, coluna removida pelo corte 0017. A 0021 aplicada sobre o contrato final possui apenas `agency_memberships.role`.
- **Correção local:** a consulta e a normalização de papel passaram a usar somente `role`; nenhuma migration, SQL remoto ou alteração de dados foi executada.
- **Validação local:** TypeScript, ESLint focalizado e build Next.js aprovados.

## Cadastro operacional de Marca e first-run - 2026-08-10

- **Auditoria histórica:** o formulário antigo em `app/(admin)/admin/marcas/page.tsx` (histórico local) tinha nome, Site URL, nicho, diretrizes legadas, linhas de silos e localização. O mesmo fluxo persistia `dna_diretrizes` e `silos_existentes`, misturando cadastro operacional com contratos estratégicos/editoriais.
- **Regressão encontrada:** o formulário atual da Agency em `modules/conta/agency-workspace-controls.tsx` havia sido reduzido a nome único.
- **Restaurado:** nome, website, nicho operacional e localização/área de atuação. BrandDNA, estratégia, keywords, SERP, diretrizes, upload e silos não fazem parte do cadastro restaurado.
- **Owner preservado:** `marcas.owner_user_id` continua sendo a relação técnica canônica com `auth.users`, protegida por FK `ON DELETE RESTRICT`. Ao cadastrar pela Agency, o valor é o owner canônico da Agency; o acesso operacional continua vindo de `agency_brands`, sem membership artificial.
- **First-run:** Brands sem snapshot editorial exibem nome, status, Agency responsável, completude operacional, website, estado do BrandDNA e CTA para `?secao=dna`; não são exibidas métricas inventadas e nenhum BrandDNA é criado automaticamente.
- **Evidência manual relatada:** CareGlow foi criada, vinculada e abre pelo `brandRef`; o estado vazio anterior da home foi corrigido localmente. Adalba e Lindisse não foram alteradas.
# Hardening ACL Communication 0022 — 2026-08-10

- **Proveniência classificada:** `ACL_PROVENANCE = IDENTIFIED`; `CAUSE = DEFAULT_ACL / PRE-EXISTING OBJECT ACL`, conforme evidência remota relatada pelo usuário.
- **Contrato preparado:** `service_role` recebe somente `SELECT, INSERT, UPDATE` em templates/messages; `SELECT, INSERT` em delivery events; e `SELECT` em token generations. PUBLIC/anon/authenticated ficam sem acesso.
- **Matriz completa:** verifier v4 inclui SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER e MAINTAIN; qualquer privilégio extra gera FAIL.
- **Preparado localmente:** migration 0022, preflight read-only e rollback manual. Nenhuma operação remota foi executada.
- **Adendo:** `docs/compartilhado/adendo-0022-communication-service-role-acl-hardening.md` está proposto e aguarda aprovação.
- **Dívida separada:** defaults globais de `postgres`/`supabase_admin` não serão alterados pela 0022.
- **Classificação:** `SDD_ADENDUM_REQUIRED`.
# Communication — transição canônica do provider - 2026-08-10

- `NOT_CONFIGURED` significa configuração ainda não validada.
- O salvamento pela RPC canônica `save_platform_communication_config` mantém
  `NOT_CONFIGURED` sem credencial e produz `VALIDATING` quando a configuração
  estrutural e o `secret_ref` estão presentes.
- `test_connection` permanece separado da fila: valida server-side a
  configuração, recupera o segredo pelo Vault e executa o primeiro envio real.
- Sucesso real transita para `READY` e preenche `validated_at`; falha real
  transita para `ERROR` e grava somente erro sanitizado.
- O dispatcher continua exigindo `READY` e não foi relaxado.
- Provider configurado remotamente: SIM. Provider comprovado: NÃO. Primeiro
  envio real: NÃO EXECUTADO.
# Resend HTTP 400 — diagnóstico local - 2026-08-10

- O `RESEND_HTTP_400` é produzido diretamente de `response.status` no fetch
  para `https://api.resend.com/emails`; não existe intermediário local.
- A implementação anterior descartava o body quando `response.ok` era falso.
- A correção local captura somente `providerErrorType`,
  `providerErrorMessage` sanitizado e `providerHttpStatus`; API key,
  Authorization, payload, token e segredo não são retornados.
- A chamada continua sem retry automático. `test_connection` permanece envio
  direto, fora da fila e fora de `communication_messages`.
- O resultado remoto informado (`RESEND_HTTP_400`) prova que o caminho local
  passou pela resolução não vazia do segredo e recebeu uma resposta HTTP, mas
  não prova a conta Resend associada ao segredo. `Logs: No logs yet` mantém a
  origem remota inconclusiva até eventual retry único autorizado.
- Nenhum retry, chamada Resend, Vault, SQL remoto ou alteração de credencial
  foi executado nesta auditoria.

# Communication — template de AgencyInvitation - 2026-08-10

- **Causa confirmada no código:** o dispatcher renderizava `agencyName`, nome
  do responsável e validade a partir do payload persistido da mensagem. Para
  `AGENCY_INVITATION`, a entidade canônica é o convite real localizado por
  `invitationId` em `agency_invitations`.
- **Correção local:** o renderizador agora usa `responsible_name` para a
  saudação, `proposed_agency_name` para a Agência, `plan_code` para o nome do
  plano e `expires_at` para a validade. O CTA é neutro: `Concluir acesso`.
- **Copy:** template legado sem `plan_name`/`cta_label` recebe a copy canônica
  local, preservando a tabela/versionamento e sem executar migration ou SQL.
- **Invariantes preservadas:** fila, dispatcher, Resend, Vault, `READY`,
  `APP_BASE_URL`, `/auth/new-slot`, idempotência e token hash-only não foram
  alterados.
- **Validação:** testes direcionados, `tsc --noEmit`, ESLint direcionado,
  build Next.js e `git diff --check` passaram. Nenhum envio real ou operação
  remota foi executado nesta tarefa.

# Diagnóstico do smoke AgencyInvitation + new-slot - 2026-08-10

- **Bug local confirmado:** o caminho `reinvite` recebia `applicationId`, mas
  procurava convite por e-mail/nome e criava um convite direto sem a relação
  canônica da application. A rotação também perdia `application_id` ao criar a
  mensagem.
- **Correção local:** application aprovada agora resolve exclusivamente o
  convite por `agency_invitations.application_id`, reutiliza/rotaciona o mesmo
  `invitation_id` e preserva `agency_application_id` + `agency_invitation_id`
  na mensagem. Inconsistência sem convite canônico gera erro explícito.
- **New-slot auditado:** `APP_BASE_URL` gera `/auth/new-slot?next=...`; a rota
  cria `s-{slot}.localhost` em desenvolvimento, não lê sessão nem transporta
  identidade e redireciona o mesmo `next` sanitizado. Login/cadastro/callback
  preservam `/onboarding/agencia`.
- **Limitação:** não é possível afirmar qual application, invitation,
  communication message ou token generation originou o último e-mail sem os
  IDs/resultado read-only remoto. Também não é possível provar que o link
  clicado realmente passou por `/auth/new-slot`; a permanência observada em
  `/admin` não é reproduzida por um defeito comprovado no código local.
- **Classificação atual:** `INVITATION_ENTITY_LINK_BUG_FOUND`; o smoke remoto
  continua pendente de correlação sanitizada e não foi repetido.

# Renovação de convite legado — 2026-08-10

- **Regra confirmada no código:** `expires_at` segue validade de sete dias.
  Uma validade em `13/12/2026`, considerando `10/08/2026`, está fora da janela
  canônica e é classificada como incompatível/legada.
- **Decisão de renovação:** convite `PENDING`, futuro e dentro da janela usa
  `REUSE_CURRENT_INVITATION` e nova geração de token; convite expirado,
  revogado, aceito, inválido ou fora da janela exige
  `CREATE_SUCCESSOR_INVITATION`.
- **Bloqueio estrutural:** `public.agency_invitations.application_id` é
  `UNIQUE` na migration 0018. Portanto, um sucessor ligado à mesma
  `application_id` não pode ser inserido sem evolução aprovada do schema.
- **Proteção:** o runtime não altera `expires_at` do legado, não exclui o
  convite e retorna `ONBOARDING_INVITATION_SUCCESSOR_REQUIRES_SCHEMA`.
- **Classificação anterior:** `SDD_INVITATION_LIFECYCLE_REQUIRED`. A SDD foi
  fechada para aprovação como `READY_FOR_INVITATION_LIFECYCLE_SDD_APPROVAL`;
  nenhuma migration, operação remota, alteração de dados, chamada ao provider
  ou envio real foi executada nesta tarefa.

# SDD de lifecycle histórico 1:N — 2026-08-10

- **Decisão fechada:** uma `AgencyApplication` poderá ter vários
  `AgencyInvitations` históricos, sempre ligados pela mesma `application_id`.
- **Convite operacional:** a implementação local usa `is_operational` com
  unicidade parcial para applications e lock `FOR UPDATE` na application. A
  decisão não usa `ORDER BY created_at DESC LIMIT 1`.
- **Tempo:** produção permanece em sete dias; homologação/desenvolvimento tem
  duas horas; testes têm override injetável. O resolver central usa
  `AGENCY_INVITATION_ENV`, `VERCEL_ENV` e fallback seguro de produção.
- **Implementação local:** `0023_agency_invitation_successor_lifecycle.sql`, o
  verificador read-only correspondente e o runtime de renovação foram criados
  no checkout. A migration não foi aplicada remotamente.
- **Validação local:** testes direcionados e TypeScript passaram; lint global
  continua bloqueado por erros preexistentes fora deste módulo.
- **Próximo gate:** snapshot/preflight remoto, revisão manual e aplicação manual
  autorizada da 0023; nenhuma operação remota ocorreu nesta tarefa.
- **Classificação:** `READY_FOR_0023_MANUAL_REVIEW`.

# Gate final local da migration 0023 — 2026-08-10

- **Precheck read-only:** preparado em
  `supabase/scripts/agency-invitation-0023-preflight-read-only.sql`, com um
  único result set sanitizado. Ele informa a janela de 7 dias e a de 2 horas;
  a escolha da policy continua pertencendo ao resolver server-side, sem
  inferência por SQL remoto.
- **Pós-verificador:** revisado para cobrir 14 checks estruturais, contagens
  sanitizadas de invitations/token generations/messages/delivery events,
  hash-only, FK, índices, RLS, policies, ACLs e as cinco RPCs do lifecycle.
- **Lint:** `TARGETED_LINT_0023 = PASS`. `GLOBAL_LINT =
  BLOCKED_BY_PREEXISTING`, por erros fora do módulo; a falha não foi mascarada.
- **Estado remoto:** precheck 0023 executado manualmente com todos os checks
  estruturais em `PASS`; snapshot pré-0023 ainda não realizado; migration 0023
  não aplicada remotamente.
- **Correção do precheck:** a primeira execução reportou `42703` porque o SQL
  assumia `application_id` diretamente antes de confirmar a coluna. O arquivo
  foi corrigido para usar leitura estrutural tolerante e reportar a ausência
  como `FAIL`; versão fixa: `2026-08-10-0023-preflight-v2`.
- **Classificação:** `READY_FOR_0023_REMOTE_PREFLIGHT`.

# Resultado do preflight remoto 0023 — 2026-08-10

- **Script:** `2026-08-10-0023-preflight-v2`.
- **Estrutura:** tabelas, colunas, UNIQUE atual, FK RESTRICT, RPCs existentes,
  RLS, policies e ACLs: `PASS`.
- **Dados sanitizados:** 7 invitations; 3 `PENDING`, 2 `REVOKED`, 2
  `ACCEPTED`; 5 sem `application_id`; nenhum `PENDING` vencido.
- **Policy:** 2 `PENDING` excedem a janela de produção de 7 dias; 3 excedem a
  janela de staging/development de 2 horas. Isso não altera registros e será
  tratado pela ação explícita de reuso/successor após a 0023.
- **Versionamento:** `supabase_migrations.schema_migrations` não foi exposto
  pelo catálogo consultado; a confirmação depende da revisão estrutural e do
  registro operacional disponível no Dashboard.
- **Gate:** `REMOTE_PREFLIGHT_0023 = PASS_WITH_INFO`;
  `snapshot_pre_0023 = NOT_PERFORMED`; aplicação manual permanece bloqueada
  até snapshot e revisão humana.

# Snapshot pré-0023 e revisão humana final — 2026-08-10

- **Snapshot preparado:**
  `supabase/scripts/agency-invitation-0023-pre-apply-snapshot-read-only.sql`.
  Versão fixa atual: `2026-08-10-0023-snapshot-v2`.
- **Divergência RPC relatada:** o snapshot remoto informou
  `present=4` e marcou `FAIL`, mas a coluna `owners` também imprimia a
  assinatura esperada de `renew_agency_invitation` quando ela estava ausente.
  Isso é uma ambiguidade/defeito de apresentação do verificador: o `FAIL` é
  compatível com uma assinatura esperada ausente, enquanto o texto exibido não
  prova que a função exista.
- **Correção local do snapshot:** a v2 separa `present`, `missing`, `owners` e
  `missing_signatures`; não coloca assinatura ausente no campo de owners.
- **Diagnóstico preparado:**
  `supabase/scripts/agency-invitation-0023-rpc-diagnostic-read-only.sql` lista
  somente funções realmente presentes no catálogo, mostra assinatura,
  retorno, owner, SECURITY DEFINER/INVOKER, proconfig/search_path, ACL EXECUTE
  resumida e fingerprint da definição; a contagem de
  `renew_agency_invitation` aparece em linha própria.
- **Legado NULL:** os 5 convites sem `application_id` permanecem fora da
  linhagem de AgencyApplication; a 0023 não os associa nem cria successor.
- **Preservação:** a migration altera somente schema, marcador operacional e
  funções; não cria invitation, token generation, communication message,
  delivery event ou envio.
- **Revisão humana:** BEGIN/COMMIT, remoção dinâmica da UNIQUE, backfill,
  índices, RPCs, grants/revokes e segurança foram revisados; nenhum bloco faz
  exclusão, TRUNCATE, alteração de `expires_at`, `application_id`,
  `token_hash` ou registros existentes de comunicação.
- **Snapshot remoto:** ainda não executado.
- **Classificação:** `SNAPSHOT_VERIFIER_FIX_REQUIRED`; a existência remota e a
  eventual assinatura legada de `renew_agency_invitation` continuam pendentes
  da execução manual do diagnóstico read-only. A 0023 não foi alterada nem
  autorizada para aplicação.

# Plataforma / Integrações - primeira implementação funcional - 2026-08-11

- **Implementado localmente:** nova tab horizontal `/admin?tab=integracoes`, sem sidebar própria e sem alteração do shell R5.
- **Leitura server-side:** a área consulta exclusivamente as sete tabelas 0024/0025 e devolve somente dados sanitizados; `secret_ref` e segredos não chegam ao client.
- **Empty states reais:** providers, capabilities, connections, grants, quotas, bindings e usage vazios aparecem como não cadastrados/registrados, sem mocks ou seed automático.
- **Writes locais preparados:** Admin global pode cadastrar/alterar status de providers e capabilities e criar connection `platform` em `draft`, apenas com metadata permitida e sem segredo. Serper e RapidAPI são rejeitados.
- **Somente leitura nesta versão:** grants, quotas, bindings e usage; não há botão de teste, chamada externa, provider real ou Vault.
- **Preservado:** Planos, Consumo e Configurações/Communication continuam separados; Google Ads, DataForSEO, IA e Serper não foram adaptados.
- **Validação local:** testes direcionados, TypeScript, ESLint focalizado e build passaram. Smoke autenticado do Admin, confirmação remota de dados e qualquer operação remota continuam pendentes.

# Fundação / persistência canônica do pipeline editorial - 2026-08-11

- **Artefatos locais e estado remoto relatado:** as migrations `0027_editorial_artifacts_workflow_serp.sql`, `0028_editorial_documents_and_views.sql` e `0029_editorial_publication_records.sql` permanecem versionadas localmente; o usuário relatou aplicação remota das três e `post-verifier v2 = PASS`, com as nove tabelas vazias. Essa evidência remota não foi reconsultada nesta tarefa.
- **Schema canônico preparado:** `editorial_artifact_versions`, `editorial_workflow_items`, `editorial_serp_snapshots`, `editorial_serp_reviews`, `content_documents`, `content_document_versions`, `content_document_user_states`, `editorial_saved_views` e `publication_records`.
- **Identidade e proveniência:** `marca_id` referencia `public.marcas.id`; atores e `user_id` usam UUID de `auth.users.id`; nenhum `user_key` foi transportado. `SiloPage` usa `artifact_type = 'silo_page'`, `source_version_id` e validação local de origem SiloDNA na mesma Brand.
- **Integridade:** versões, snapshots SERP e versões de documento são append-only; lock/version e timestamps são atualizados por triggers restritos; FKs editoriais usam `ON DELETE RESTRICT`; não houve backfill, seed ou alteração de dados.
- **Autorização:** todas as tabelas novas habilitam RLS desde a criação e usam os helpers actor-aware existentes de 0021. Admin global não recebeu bypass editorial automático. A matriz ACL aprovada concede somente `SELECT` a `authenticated`; escritas ficam em `service_role` server-side conforme tabela, sem `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` ou `MAINTAIN`.
- **Verificadores:** preparados `supabase/scripts/pipeline-editorial-schema-preflight-read-only.sql` e `supabase/scripts/pipeline-editorial-schema-post-verifier-read-only.sql`, ambos em único result set e versões fixas `2026-08-11-pipeline-editorial-schema-preflight-v4` e `2026-08-11-pipeline-editorial-schema-post-verifier-v2`, com ACL PASS/FAIL por tabela/role.
- **Validação local:** `tests/pipeline-editorial-schema.test.mts` passou integralmente. Nesta tarefa não houve SQL remoto, adaptação de consumidores, commit, push ou deploy.
- **Limitação explícita:** as FKs simples garantem as relações declaradas, mas a coerência de `marca_id` entre entidades referenciadas sem FK composta permanece responsabilidade do runtime futuro; nenhum FK composto foi inventado fora da SDD.
- **Invariante:** `service_role` bypassa RLS; o runtime compartilhado local resolve `actorUserId`, `brandId`, autorização e ação antes de entregar o contexto aos repositories. Consumidores ainda não foram adaptados.
- **Test:editorial:** três falhas foram reproduzidas em assertions que leem somente rotas/layout/componentes fora das migrations 0027–0029; classificadas como `UNRELATED_FAILURE`, sem alteração desses testes nesta tarefa.
- **Gate atual:** `PIPELINE_EDITORIAL_SCHEMA = REMOTELY_HOMOLOGATED (relatado pelo usuário; não revalidado nesta tarefa)`. O runtime compartilhado local está `IMPLEMENTED`; próximo gate: `READY_FOR_PIPELINE_FIRST_CONSUMER_MIGRATION`.

## Diagnóstico separado de `test:editorial` — 2026-08-11

As três falhas foram reproduzidas individualmente. Nenhuma importa as
migrations 0027–0029 ou os verificadores do schema; portanto não são
regressões desta tarefa.

1. **TEST:** `rotas oficiais separam Marca, Conta, Radar, Planejador, Redator e Publicações`.
   **ASSERTION:** `tests/editorial-pipeline.test.mts:128`, espera
   `modules/conta`. **EXPECTED:** a rota tenantizada ainda referencia o
   módulo Conta. **OBSERVED:**
   `app/(brand)/[brandRef]/conta/page.tsx` faz apenas redirect para `/conta`.
   **RELATION:** rota/UI, sem relação com 0027–0029.
   **CLASSIFICATION:** `UNRELATED_FAILURE`.
2. **TEST:** `layout Admin valida sessão e papel no servidor`.
   **ASSERTION:** `tests/editorial-pipeline.test.mts:144`, espera
   `requireCanonicalSessionProfile` e `profile.isAdmin`. **EXPECTED:** contrato
   anterior do layout Admin. **OBSERVED:** o layout atual usa
   `requireCanonicalPlatformAdmin()`. **RELATION:** auth/layout, sem relação
   com 0027–0029. **CLASSIFICATION:** `UNRELATED_FAILURE`.
3. **TEST:** `Marca preserva compatibilidade de edição do cliente legado e Conta não edita marca`.
   **ASSERTION:** `tests/editorial-pipeline.test.mts:152`, espera a frase
   `responsável legado` e os marcadores do contrato antigo. **EXPECTED:** copy
   textual legada no componente. **OBSERVED:** `modules/marca/brand-page.tsx`
   usa `adaptLegacyBrand` e o fluxo atual, mas não contém a frase exata.
   **RELATION:** Marca/UI, sem relação com 0027–0029.
   **CLASSIFICATION:** `UNRELATED_FAILURE`.

## Helpers canônicos — resolução por OID corrigida — 2026-08-11

- **Causa do v3:** `pg_proc.proargtypes` é `oidvector`, enquanto o array
  esperado era `oid[]`; o cast manual preserva a semântica histórica de
  indexação desse vetor, diferente do array literal. A comparação por array
  podia resultar em `false` mesmo quando os OIDs dos argumentos eram os
  mesmos. A documentação do PostgreSQL confirma que `proargtypes` é
  `oidvector` e possui indexação iniciada em zero.
- **Correção:** o preflight v4 resolve cada assinatura por
  `to_regprocedure(... )::oid` e usa esse OID para consultar `pg_proc`,
  `pg_namespace` e `pg_roles`; nomes de parâmetros e comparação manual de
  `oidvector` não participam mais da presença.
- **Semântica separada:** OID ausente produz `presence = FAIL`; OID presente
  produz `presence = PASS` e só então o contrato avalia owner `postgres`,
  retorno booleano, `SECURITY DEFINER`, `STABLE`, `search_path` restrito e
  EXECUTE efetivo para `anon`, `authenticated` e `service_role`. Contrato não
  resolvido fica `INFO`, não é apresentado como falha de ACL.
- **Diagnóstico:** `canonical-brand-authorization-diagnostic-read-only.sql`
  permanece em `2026-08-11-canonical-brand-authorization-diagnostic-v2`.
- **Preflight:** `pipeline-editorial-schema-preflight-read-only.sql` foi
  versionado como `2026-08-11-pipeline-editorial-schema-preflight-v4`.
- **Estado remoto relatado:** os dois helpers actor-scoped estão presentes e
  atendem ao contrato; não houve criação de helper nem reaplicação da 0021.
- **Baseline:** `77f5b4b3c521072fdd28ac2e53aec072` continua sendo o fingerprint
  anterior a qualquer correção de autorização.
- **Dívida separada:** `CANONICAL_MUTATING_RPC_EXECUTE_ACL_REVIEW`; não faz
  parte deste gate nem foi corrigida nesta tarefa.

# Runtime compartilhado do pipeline editorial — 2026-08-11

- **Implementado localmente:** `lib/server/pipeline-runtime.ts` resolve
  `actorUserId`, `brandId`, módulo e ação somente depois da sessão Supabase e
  dos dois RPCs canônicos actor-scoped retornarem verdadeiro.
- **Service role:** o cliente server-side não é retornado quando a sessão,
  acesso ou ação falham; nenhum consumidor foi adaptado e nenhum cliente
  server-side foi exposto ao browser.
- **Repositories:** `lib/server/pipeline-repositories.ts` contém
  `ArtifactVersionRepository`, `WorkflowRepository`,
  `SerpSnapshotRepository`, `SerpReviewRepository`,
  `ContentDocumentRepository`, `ContentDocumentVersionRepository`,
  `ContentDocumentUserStateRepository`, `SavedViewRepository` e
  `PublicationRecordRepository`.
- **Proteção:** todas as consultas carregam o `brandId` do contexto; estados
  pessoais derivam `user_id` do `actorUserId`; documentos são verificados antes
  de acessar versões ou estado pessoal.
- **Erros:** `NO_DATA`, `QUERY_FAILURE`, `SCHEMA_MISSING`,
  `NOT_AUTHORIZED`, `CONFLICT` e `INVALID_CONTEXT` são distintos. Erro de
  query ou schema nunca vira array vazio.
- **Integridade:** artefatos, snapshots, reviews e versões de documento não
  possuem métodos de UPDATE/DELETE; hash igual retorna `UNCHANGED`; registros
  mutáveis exigem `lock_version` e confirmação remota `PERSISTED`.
- **Escopo preservado:** Minerador, Arquiteto, Radar, Planejador, Redator e
  Publicações ainda não foram adaptados; `sendWorkflowCommand()` e handoffs
  permanecem inalterados.
- **Validação:** testes locais do runtime e do schema passaram, TypeScript,
  ESLint direcionado e `git diff --check` passaram. Nenhuma escrita remota,
  backfill, provider, migration, commit, push ou deploy foi executado.
- **Next.js consultado:** `node_modules/next/dist/docs/01-app/02-guides/authentication.md`,
  `data-security.md` e
  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.
- **Classificação:** `PIPELINE_SHARED_RUNTIME_LOCAL = IMPLEMENTED`;
  próximo gate: `READY_FOR_PIPELINE_FIRST_CONSUMER_MIGRATION`.
- **Arquiteto — primeiro consumidor da persistência canônica (2026-08-11):** implementação local concluída e testada; ArticleDNA, SiloDNA e SiloPage usam contexto actor-scoped e artefatos versionados server-side. Smoke remoto permanece pendente.

# Consolidação final — entrada, ativação e acesso temporário de Agencies — 2026-08-13

Esta seção é o registro vigente do bloco funcional. As entradas históricas
anteriores permanecem como histórico de evolução; quando houver conflito, os
contratos e evidências abaixo prevalecem.

## Caminhos canônicos homologados

- **`PUBLIC_FREE_TRIAL` — validado manualmente:** frontend público →
  solicitação → aprovação do Admin → e-mail de aprovação → criação ou
  autenticação da identidade → onboarding → Agency, owner,
  `agency_membership`, `agency_access_period` e Minha Agência.
- **Período:** `plan_code = FREE`; a origem é `PUBLIC_FREE_TRIAL` (ou o
  equivalente canônico persistido) e os 30 dias começam na ativação, nunca na
  solicitação, aprovação ou envio do e-mail. A validade técnica do link é
  separada do período de acesso.
- **Smoke real relatado pelo usuário:** AdalbaFotos foi exibida em Ativas como
  Plano Free, Teste de 30 dias, válida até 12/09/2026 e com Acesso READY. No
  Histórico, `Solicitação pública · APPROVED` e `Ativação · ACCEPTED` foram
  mantidas como eventos distintos. A Agency não permaneceu em Pendentes ou
  Convites acionáveis.

- **`ADMIN_TRUSTED_INVITE` — validado manualmente:** Admin informa Agency
  proposta, responsável, e-mail e validade do acesso; o convidado recebe o
  e-mail, cria ou autentica a identidade, confirma a Agency e conclui a criação
  de Agency, owner, membership, período de acesso e Minha Agência.
- **Período:** a validade do acesso é definida pelo Admin e não é o
  `expires_at` técnico do link. Smokes reais relatados: AdaMusic até
  22/12/2026 e AdaSEO até 13/11/2026.
- **Nome confirmado:** o nome inicialmente proposto pelo Admin foi editado
  antes da criação e o nome final persistiu no convite e na Agency.

## Fundações remotas e fronteiras transacionais

- **Migration 0037:** implementada remotamente e post-verificada.
  `agency_access_periods` é a entidade canônica do direito operacional;
  `agencies.status` não equivale a acesso e `agency_invitations.expires_at`
  não equivale à expiração do acesso. Origens registradas:
  `PUBLIC_FREE_TRIAL`, `ADMIN_TRUSTED_INVITE` e `PLATFORM_INTERNAL`.
- **Acesso efetivo:** deriva de status, `starts_at` e `ends_at`; não depende
  obrigatoriamente de cron para persistir `EXPIRED`. A Agency expirada
  preserva Agency, Brands, memberships, conteúdo e histórico, perdendo apenas
  o direito operacional conforme enforcement futuro.
- **Evidência da 0037:** post-verifier final
  `FULLY_EXPECTED_POST_APPLY`, fingerprints e default ACL preservados, RLS/ACL
  verificados e nenhum dado de negócio criado pela migration.
- **Classificação remota:** `0037 = REMOTE HOMOLOGATED`.
- **Migration 0039:** implementada remotamente, post-verificada e coberta por
  smoke manual. A RPC
  `complete_agency_onboarding_with_confirmed_agency_name(...)` é a fronteira
  transacional que recebe o nome confirmado, revalida o convite e mantém
  idempotência; não há sequência independente de UPDATE no cliente seguida da
  RPC 0037.
- **Segurança da 0039:** `SECURITY DEFINER`, `VOLATILE`, owner `postgres`,
  `search_path` restrito e ACL homologada. O post-verifier final retornou
  `FULLY_EXPECTED_POST_APPLY`, zero failures, zero evidence gaps e contagens
  de negócio preservadas.
- **Classificação remota:** `0039 = REMOTE HOMOLOGATED`.
- **Bootstrap `PLATFORM_INTERNAL` da AdalbaPro:** homologado remotamente com o
  script observável `2026-08-13-platform-internal-bootstrap-v3-observable`.
  O readback pós-`COMMIT` confirmou `access_period_count = 1`,
  `platform_internal_active_count = 1`, `plan_code = FREE`,
  `origin = PLATFORM_INTERNAL`, `status = active`, `ends_at = NULL` e
  `final_state = PRESENT_AFTER_COMMIT`; `access_period_id =
  6190db46-ba12-48ee-b8c8-b24535331df3`. O post-verifier v2 retornou todos os
  checks como `PASS`, com classificação
  `ADALBAPRO_PLATFORM_INTERNAL_BOOTSTRAP_VERIFIED`; classificação canônica:
  `AdalbaPro PLATFORM_INTERNAL = REMOTE HOMOLOGATED`. Isso comprova a
  persistência do período interno, não enforcement de expiração.

## Identidade, Communication e apresentação Admin

- No invite válido, o e-mail é a identidade Auth; não há username separado;
  nome é dado de perfil; e-mail permanece read-only; identidade nova não
  recebe uma segunda confirmação de e-mail; clicar no link não cria Agency
  silenciosamente; a criação/aceite é explícita e `/auth/new-slot` permanece
  no contrato.
- Presets homologados: `PUBLIC_FREE_TRIAL_REQUEST_RECEIVED`,
  `PUBLIC_FREE_TRIAL_APPROVED` e `ADMIN_TRUSTED_INVITE`. A seleção depende da
  origem/evento persistido, não apenas de `plan_code = FREE`.
  `technicalExpiresAt` e `accessExpiresAt` continuam separados. O envio real
  pelo provider foi validado manualmente com o remetente
  `notificacoes@mail.adalbapro.com.br`; webhook `DELIVERED` não é declarado
  homologado.
- **Admin:** Pendentes mostra somente solicitações `PENDING`; Convites mostra
  somente convites que ainda exigem ação; Ativas usa plano e acesso de
  `agency_access_periods`; Histórico diferencia solicitação pública aprovada,
  ativação aceita e convite administrativo `ACCEPTED`/`EXPIRED`/`REVOKED`.

## Evidência e pendências preservadas

Validações manuais registradas como PASS: `PUBLIC_FREE_TRIAL`,
`ADMIN_TRUSTED_INVITE`, e-mails reais, apresentação dos estados Admin, nome de
Agency editável, validade dos dois caminhos, owner/membership e Agency criada
e acessível. Isso não significa que todas as combinações de sessão foram
homologadas.

Gates locais registrados separadamente: testes de access period, onboarding,
presets, Admin e RPC 0039, além de TypeScript, ESLint, build e
`git diff --check`. A dívida textual preexistente de
`tests/agency-invitation-smoke-contract.test.mts` sobre `safeAuthRedirect` foi
classificada como `UNRELATED_PREEXISTING_TEST_DEBT`, sem relação causal com a
0039.

Permanecem no backlog, sem reabrir o bloco homologado:

- isolamento completo de múltiplos slots no mesmo navegador ainda requer
  revalidação e não é regressão comprovada;
- UX de convite para identidade Auth já existente deve seguir diretamente para
  autenticação e aceite;
- refinamentos de copy do trusted invite e escapes Unicode são dívidas de
  apresentação;
- enforcement geral de Agency expirada permanece em fase posterior;
- billing, planos pagos, central de notificações e webhook `DELIVERED` não
  foram homologados.

Nenhuma alteração de código, schema, migration, operação remota ou provider
foi executada nesta atualização documental.

# Disponibilidade de resources em homologação — 2026-08-15

- O runtime dos consumidores canônicos do Minerador separa `resource`/Connection
  de capability operacional. `google_ads_keyword_metrics`,
  `google_ads_keyword_discovery`, `dataforseo.allintitle` e `ai_generation`
  continuam no catálogo para usage/auditoria, mas não são gates de entitlement,
  grant, binding ou quota.
- `PLATFORM_ACCESS_POLICY = HOMOLOGATION_ALLOW_ALL`: Agency/Brand autorizada
  resolve diretamente a Connection global READY do provider, sem fallback para
  env e sem segredo no browser. Quota do resource é ilimitada nesta fase.
- Google Ads preserva o Customer ID como binding externo da Brand, somente para
  operações que dependem de conta específica.
- Smoke real após a correção: DataForSEO allintitle PASS (`362` para uma
  keyword), OpenRouter PASS (classificação de uma keyword; Connection READY e
  modelo `deepseek/deepseek-v4-flash-0731` disponível). Google Ads discovery e
  métricas pararam antes da chamada paga com `GOOGLE_ADS_CUSTOMER_MISSING`,
  porque Adalba ainda não possui Customer ID externo único para a Connection
  global.
- `SCHEMA_CHANGE_REQUIRED = NO` · `DATABASE_SCHEMA_CHANGED = NO`.

# OpenRouter — modelo operacional editável — 2026-08-15

- `integration_connections.metadata.openrouter_model` é a configuração
  operacional persistente do modelo; `secret_ref`, lifecycle e
  `health_check` permanecem independentes.
- A tela de Configurações das APIs permite editar o model ID sem reenviar a
  API key, recriar a Connection ou reiniciar o servidor. O runtime canônico do
  Minerador não lê mais `OPENROUTER_MODEL`; o env permanece apenas como legado
  não utilizado por este consumidor.
- Readback remoto confirmado no ciclo `deepseek/deepseek-v4-flash-0731` →
  `deepseek/deepseek-v4-pro` → `deepseek/deepseek-v4-flash-0731`; a Connection
  permaneceu `READY` e o health check continuou independente.
- Smoke real final: classificação de uma keyword pelo Minerador com
  `deepseek/deepseek-v4-flash-0731` retornou sucesso. O ledger exibiu
  `ai_generation · OpenRouter · SUCCEEDED · AdalbaPro · Adalba`; o model ID é
  incluído no metadata sanitizado de usage sem expor secret.
- `OPENROUTER_CONNECTION = READY` · `OPENROUTER_MODEL_CONFIG = PERSISTED` ·
  `OPENROUTER_MODEL_CHANGE_WITHOUT_RESTART = PASS` ·
  `SCHEMA_CHANGE_REQUIRED = NO` · `DATABASE_SCHEMA_CHANGED = NO`.
