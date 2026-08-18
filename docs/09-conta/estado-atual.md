# Estado atual — Conta

## Autenticação e identidade — 2026-07-27

A Conta continua consumindo a sessão atual baseada em NextAuth, enquanto Supabase Auth permanece a decisão aprovada para convergência futura. Cadastro manual cria somente a identidade e não associa marca automaticamente; Google OAuth está suspenso. A retirada do NextAuth, cookies Supabase definitivos e smoke test completo continuam pendentes.

## Preparação de sessão Supabase SSR — 2026-08-05

- **Preparado localmente:** cliente browser/server, refresh de cookies, callback OAuth, helper de usuário/claims e logout Supabase.
- **Preservado:** Conta, BrandProvider e todos os consumidores continuam usando a sessão NextAuth; nenhuma identidade, tenant, owner, membership ou papel foi criada ou alterada.
- **Google:** componente compartilhado está preparado mas não renderizado. Provider remoto, Redirect URLs e smoke real permanecem pendentes.
- **Última auditoria:** 2026-07-20.
- **Funcionando:** rota `/{brandRef}/conta`, componente de conta e redirecionamento de `/perfil` para configurações de marca. **Verificado no código.**
- **Parcial:** escopo funcional da página é mínimo; não foi validado manualmente.
- **Simulado:** não identificado.
- **Local:** contexto de marca pode usar seleção local compartilhada.
- **Persistido:** não foi identificado armazenamento próprio deste módulo.
- **Bloqueado:** definição de produto para recursos adicionais.
- **Regressões/bugs:** nenhum confirmado.
- **Arquivos centrais:** `app/(brand)/[brandRef]/conta/page.tsx`, `modules/conta/account-page.tsx`.
- **Testes:** sem teste específico identificado; cobertura indireta de autenticação.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** módulo é uma superfície inicial, não uma gestão completa de conta.

## Visualização de senha — 2026-07-27
- **Verificado no código:** login ativo e os dois campos do cadastro usam PasswordField compartilhado.
- Cada campo inicia oculto e alterna de forma independente entre password/text.
- O controle usa botão type=button, aria-label dinâmico, aria-pressed, foco visível e preserva o foco no clique.
- Não existe tela ativa de redefinição ou convite com senha; essa frente permanece pendente.
- Testes focados de PasswordField e autenticação manual: 15/15; ESLint focalizado e git diff --check: aprovados.
- TypeScript e build foram bloqueados por dois erros preexistentes fora do módulo em app/api/extensao/marcas/[brandId]/volume/route.ts; nenhum arquivo da Extensão foi alterado.

## Painel de identidade e acesso — 2026-07-27

- **Verificado no código:** `/{brandRef}/conta` agora recebe do servidor um recorte do `TenantContext` da marca canônica, sem enviar `ownerUserId` ao browser. A página organiza Perfil pessoal, Senha e segurança, Seu acesso nesta marca e Preferências.
- **Dados pessoais:** nome, e-mail e imagem vêm da sessão NextAuth atual. O avatar é apenas exibido quando a sessão fornece uma imagem; não há upload, substituição, remoção ou URL gravada em `localStorage`.
- **Acesso:** origem, papel/status e permissões são somente leitura e derivam de `resolveTenantContext`: Admin global, owner ou membership. Owner não é tratado como tenant e Admin global não é convertido em owner.
- **Persistido remotamente:** nenhuma mutação nova foi criada. A validação de acesso existente continua server-side; perfil, avatar e preferências pessoais não possuem persistência própria identificada.
- **Bloqueado:** alteração de senha e recuperação continuam aguardando a consolidação aprovada do Supabase Auth; não foi criado formulário paralelo. Edição de perfil/avatar e preferências permanecem sem contrato de persistência.
- **Testes locais:** suite focada da Conta + autenticação/tenant + PasswordField: 25/25; ESLint focalizado, TypeScript, build e `git diff --check`: aprovados.
- **Validação manual:** ainda pendente para sessão autenticada, Adalba/Lindisse, owner, Admin global, colaborador, mobile, dark mode e teclado. O script opcional `check-visual-system.mjs` não existe neste checkout.

## Refinamento visual da Conta — 2026-07-27

- **Verificado no código:** a hierarquia visual foi refinada sem alterar sessão, tenant, permissões ou persistência. O cabeçalho usa `Minha conta` com descrição única; as quatro áreas não repetem eyebrows e títulos.
- **Perfil:** avatar ampliado moderadamente, nome em destaque, e-mail secundário e nota discreta sobre a origem na sessão. Não foram adicionados controles de edição, upload ou persistência.
- **Segurança:** o bloqueio foi reduzido a um estado informativo voltado ao usuário, sem expor detalhes internos do provedor.
- **Acesso:** marca, origem, papel e status aparecem em resumo. Owner/Admin global recebem resumo de acesso integral e podem abrir a matriz; membership parcial mantém a matriz aberta.
- **Matriz:** primeira coluna fixa durante scroll horizontal, cabeçalho legível, células com ícones e `title`/rótulos acessíveis, sem depender apenas de cor.
- **Preferências:** permanece um estado vazio útil e compacto, sem toggles ou armazenamento local.
- **Contratos:** nenhuma regra de negócio, autenticação, TenantContext, rota funcional, papel, membership ou permissão foi alterada.
- **Validação manual:** desktop, notebook, tablet, mobile, dark mode, foco/hover, teclado, tabela larga e troca de marca continuam pendentes; a revisão automatizada do sistema visual não existe neste checkout.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/conta; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- A Conta passa a ter rota contextual `/{brandRef}/conta`; o conteúdo continua pessoal ao ator autenticado e não expõe controles de cobrança nesta etapa.
# Preparação canônica compartilhada — 2026-08-06

- **Preparado localmente:** a futura autorização server-side usa `requireSupabaseUser()` e UUID, sem e-mail, `ADMIN_EMAIL`, token operacional ou NextAuth no contrato novo.
- **Preservado:** a Conta e a sessão atual continuam consumindo NextAuth; não houve corte parcial, alteração de interface ou operação remota.
- **Pendente:** smoke manual de Supabase SSR, plano específico para `/api/mine`/Google Sheets e migração gradual de todos os consumidores de sessão.
## Fase 2A — Conta contextual canônica — 2026-08-06

- **Verificado no código:** `/{brandRef}/conta` recebe somente o contexto autorizado canônico: `brandId`, UUID do ator, papel e permissões. Owner entra por `owner_user_id`; colaborador exige `member_user_id` ativo e `conta:view`.
- **Sessão:** NextAuth permanece para exibir identidade pessoal e como entrada transitória do UUID; e-mail, `user_key`, `perfis.marca_id` e armazenamento local não decidem o acesso da rota.
- **Pendente:** validar no navegador owner, colaborador permitido/bloqueado, usuário sem vínculo, reload, logout, mobile, dark mode e teclado. Não houve operação remota.
## Fase 2B — Conta pessoal e workspace de agência — 2026-08-06

- **Verificado no código:** `/conta` é uma rota pessoal, sem `brandRef` nem requisito de marca. Ela mostra a identidade autenticada e apenas os contextos de marca e agência retornados pela autorização canônica server-side.
- **Workspace de agência:** as rotas `/agencias/{agencyRef}`, `/membros`, `/marcas` e `/configuracoes` usam `agencyRef = slug--UUID`; a agência é buscada pelo UUID, o slug é conferido e o ator precisa ser `agencies.owner_user_id` ou membro ativo de `agency_memberships`.
- **Isolamento:** Admin global, e-mail, `ADMIN_EMAIL`, `user_key`, slug isolado, primeira agência e estado local não concedem acesso. Membership de agência não concede acesso editorial a marca; uma marca vinculada só recebe link editorial quando a permissão individual da marca existe.
- **Compatibilidade:** NextAuth permanece apenas como bridge transitória do UUID revalidado. A rota legada `/{brandRef}/conta` não foi apagada e encaminha com segurança para `/conta`; administração contextual da Marca não foi recriada nessa rota.
- **Fora do escopo:** nenhuma mutação de owner, memberships, marca, RLS, schema, migration, provider ou Google Ads. Gestão efetiva de membros, convites, senha e sessões continua pendente de contratos próprios.
- **Validação manual pendente:** conta sem marca, owner e membro de agência, membership inativa, slug/UUID divergente, Admin global sem membership de agência, marca vinculada sem acesso editorial, troca rápida de contexto, mobile e teclado. Nenhuma operação remota foi realizada.

## Fase 2C — sessão e contexto canônicos — 2026-08-06

- **Verificado no código:** `/login` usa `signInWithPassword`; `/cadastro` usa `auth.signUp` com retorno seguro para `/auth/callback`; o `PasswordField` compartilhado mantém label, foco e mostrar/ocultar senha. Google continua oculto.
- **Conta pessoal:** continua sem tenant; seus contextos vêm das consultas canônicas server-side. Usuário sem marca ou agência recebe estado válido, sem fallback.
- **Pendente manual:** confirmação de e-mail, login, logout, reload, sessão expirada, conta sem vínculo, foco, dark mode e larguras responsivas. Nenhuma operação remota ocorreu.

## Incidente 3B-R1 — correção local do login — 2026-08-09

- **Corrigido no código:** `/login` diferencia credencial inválida, confirmação pendente, limite, configuração, rede e resposta inesperada; não transforma mais toda falha em “E-mail ou senha incorretos.”
- **Sessão:** o fluxo continua exclusivamente `signInWithPassword`; não há fallback NextAuth nem sessão paralela. O redirecionamento exige `session.user.id`.
- **Verificado localmente:** testes focados, TypeScript, build e diff check passaram.
- **Auditoria 3B-R1 em 2026-08-10:** slots por host, `actorUserId`, `sessionEpoch`, contexts server-side, caches actor+brand e logout isolado foram verificados localmente.
- **Homologação manual relatada pelo usuário:** `MULTI_SESSION_SMOKE = PASS`, `SESSION_ISOLATION = PASS`, `CONTEXT_ISOLATION = PASS` e `LOGOUT_ISOLATION = PASS`. Comunicação transacional e e-mail real continuam pendentes. Ver [auditoria de sessões isoladas](./auditoria-3b-r1-sessoes-isoladas-2026-08-10.md).

## Homologação manual 3B-R1 — 2026-08-10

- **Relatado pelo usuário:** `MULTI_SESSION_SMOKE = PASS`, `SESSION_ISOLATION = PASS`, `CONTEXT_ISOLATION = PASS` e `LOGOUT_ISOLATION = PASS`.
- **Evidência:** duas identidades simultâneas no mesmo perfil, hosts/slots distintos, Agencies/Brands distintas, refresh sem mistura, tentativa de outra Agency negada e logout de um slot preservando o outro.
- **Estado:** 3B-R1 homologada manualmente conforme evidência recebida. Comunicação transacional e e-mail real permanecem não validados.
# Recuperação de senha — contrato preferencial — 2026-08-09

## Logout compartilhado e contexto pendente - 2026-08-09

- **Implementado localmente:** `/conta` e o workspace de Agência usam `SessionLogoutButton`, com `supabase.auth.signOut()` e retorno seguro para `/login`.
- **Preservado:** recuperação local de trabalho não é apagada pelo logout; a invalidação de sessão e a limpeza de contexto em memória continuam sob responsabilidade do `SupabaseSessionContext`/`BrandContext`.
- **Pendente:** validação autenticada visual, e-mail real e smoke completo. Nenhuma operação remota foi executada.

- **Verificado no código:** `/recuperar-senha` solicita o recovery pelo Supabase Auth e permite que o próprio usuário defina a nova senha.
- **Contrato aprovado:** Admin não cria, conhece ou recebe token de senha; o recovery administrativo legado foi aposentado localmente para evitar mecanismos paralelos.
- **Pendente:** confirmação real do e-mail, SMTP/Auth e smoke autenticado após as migrations e o provider global serem aplicados manualmente.

# Contexto singular de Agency - 2026-08-10

- **Implementado localmente:** contexto comum agora expõe uma Agency operacional singular; o array permanece somente para compatibilidade do contrato administrativo/global.
- **Implementado localmente:** resolução server-side considera owner e membership, sem fallback por owner da Brand, nome, slug, primeira Agency ou estado local.
- **Pendente:** preflight remoto, migration 0021, validação de catálogo/RLS e próxima interface Minha Agency. Nenhuma alteração remota ou limpeza de armazenamento foi executada.

## Shell global e restauração de contexto - 2026-08-11

- **Implementado localmente:** `ProductShell` é o shell comum de Brand, Agency, Conta e Admin; o workspace da Agency usa abas horizontais e não uma sidebar paralela.
- **Implementado localmente:** Brand selector mostra a Brand atual e abre a lista autorizada sob demanda; a troca preserva o módulo equivalente e reconstrói `brandRef` pelo servidor.
- **Implementado localmente nesta revisão R2:** o seletor consulta somente o escopo operacional canônico de `marca`; o catálogo amplo de `/api/marcas` permanece reservado ao painel Admin interno. Sem vínculo autorizado, os atalhos editoriais ficam desabilitados em vez de abrir `/selecionar-marca`.
- **Implementado localmente nesta revisão R2:** `/conta` exibe avatar somente leitura, identidade/e-mail, papel global, recovery pessoal existente e links de Agency/Brands confirmados no servidor.
- **Implementado localmente nesta revisão R2:** o primeiro controle do shell apenas expande/recolhe, há controle lateral com área de toque adequada, ícones distinguem Agency/Brand e os tokens visuais ficam centralizados sem roxo no shell.
- **Implementado localmente:** a preferência de último contexto é local e por ator; `POST /api/contexts/restore` revalida Brand/Agency antes de restaurar a rota pós-login. `/selecionar-marca` ficou como fallback excepcional.
- **Preservado:** nenhuma interface interna dos módulos editoriais, schema, migration, owner, membership, RLS ou armazenamento de trabalho foi alterado.
- **Implementado localmente nesta revisão R3:** `/conta` permanece uma rota pessoal; o login sem `callbackUrl` explícito e a compatibilidade de `/selecionar-marca` usam `/conta` como destino global seguro quando não há contexto restaurável. A compatibilidade server-side pode encaminhar Admin confirmado para `/admin` e onboarding pendente para `/onboarding/agencia`, sem renderizar o card de seleção.
- **Implementado localmente nesta revisão R3:** `currentRouteContext` representa somente o tenant da URL, enquanto `selectedOperationalBrandId` representa apenas a preferência operacional global. A restauração continua server-side e a gravação local aguarda a revalidação do ator/Brand para não apagar a preferência durante hydration ou refresh de Admin/Agency.
- **Implementado localmente nesta revisão R3:** a preferência visual expandida/recolhida do shell é persistida por `localStorage` separado do contexto de autorização; recolher fecha o selector antes de aplicar a largura compacta, e o controle lateral permanece externo à coluna de ícones.
- **Implementado localmente nesta revisão R3:** cache transitório da Agency por ator e guarda de carregamento reduzem flicker sem remover revalidação de segurança. Não foram encontrados `dynamic keys`, `window.location`, `router.refresh` ou cadeia de redirect criada pelo shell.
- **Implementado localmente nesta revisão R4:** a rota pessoal `/conta` deixou de ser classificada como alvo legacy pelo `proxy`; agora a cadeia efetiva é `app/(personal)/conta/page.tsx` → `getCanonicalPersonalAccount()` → `PersonalAccountPage` → `WorkspaceFrame`/`ProductShell`, sem Brand, Agency ou seletor obrigatório.
- **Implementado localmente nesta revisão R4:** `expanded` foi movido para `ShellVisualProvider`, montado sob `Providers` no layout raiz. Assim, remounts dos route groups não fecham a sidebar desktop; `mobileOpen` continua local e pode fechar após navegação mobile.
- **Diagnóstico de flicker:** confirmado que Brand, Agency, Admin e Conta instanciam `ProductShell` em layouts/componentes diferentes; a troca de route group pode remontar o shell. O estado visual compartilhado elimina a perda de expansão, preservando os guards server-side e os `loading.tsx` de conteúdo.
- **Pendente:** smoke manual autenticado de shell, Agency, duas Brands, Admin, logout/login, rota perdida, mobile, dark mode e responsividade. Ver `docs/compartilhado/arquitetura-shell-contexto-navegacao-global.md`.

## Estabilidade visual final R5 do shell global - 2026-08-11

- **Implementado localmente:** o layout raiz le cookies host-only visiveis ao servidor para iniciar `expanded` e a dica de Brand operacional antes da hidratacao. O cookie da Brand e apenas uma preferencia visual/navegacional; o servidor revalida o escopo operacional antes de devolver id e nome.
- **Preservado:** `localStorage` continua como compatibilidade para instalacoes antigas, mas nao e a fonte inicial quando o cookie existe. Nenhum cookie ou armazenamento local participa da autorizacao.
- **Implementado localmente:** a Brand valida inicia o shell com nome disponivel; dica ausente ou invalida nao e restaurada. O contexto cliente preserva a dica validada enquanto revalida a lista operacional, evitando desaparecimento transitorio.
- **Implementado localmente:** o indicador lateral fica fora do fluxo, oculto em repouso e visivel somente em hover/focus-visible; a area de toque permanece utilizavel sem deslocar a coluna.
- **Implementado localmente:** o rotulo visual `Conta` foi alterado para `Perfil`, mantendo o href `/conta` e a pagina pessoal existente. `/perfil` nao foi criado.
- **Divida registrada:** `ROUTE_AGENCY_SINGULAR_REVIEW`; a rota atual continua `/agencias/{agencyRef}`, com possivel revisao futura para `/agencia/{agencyRef}`, sem alteracao nesta fase.
- **Pendente:** smoke manual R5 autenticado com refresh, Brand valida/invalida, expanded/recolhido, hover/focus, Perfil, Agency e responsividade. Nenhuma operacao remota foi executada.

## Guards Supabase de entradas globais — 2026-08-17

- **Corrigido no código:** `/conta` e `/selecionar-marca` agora convertem `SupabaseSessionError` em redirect `307` para `/login?callbackUrl=%2Fconta`, alinhando-se aos guards de Admin e Brand.
- **Preservado:** identidade `auth.users.id`, tenantização, owner/membership, RLS, migrations, persistência e sessão remota não foram alterados.
- **Confirmado por teste:** Auth/tenant `25/25`; smoke HTTP local sem cookies: `/admin`, `/conta`, `/selecionar-marca` e rota tenantizada retornam `307`.
- **Limitação:** login autenticado, browser visual, produção e persistência remota continuam não verificados.
