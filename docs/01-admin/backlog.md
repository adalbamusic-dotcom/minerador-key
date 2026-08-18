# Backlog — Admin

## Central de Comunicação da Plataforma — migration local preparada

- **Auditoria local concluída:** o envio atual de convite e acesso usa
  `RESEND_API_KEY`/`RESEND_FROM_EMAIL` somente no servidor e ainda chama o
  Resend diretamente. Não foi encontrado cofre server-side administrável,
  Vault, KMS ou secret manager integrado ao checkout.
- **Preflight preparado:** `supabase/scripts/fase-comunicacao-vault-preflight-read-only.sql`
  verifica catálogo do Vault, funções oficiais, view decriptada, grants e
  dependências sem ler segredos.
- **Gate aprovado:** o preflight remoto retornou
  `READY_FOR_COMMUNICATION_SCHEMA_REVIEW`, com Vault disponível, acessos
  públicos negados e `unexpected_dependencies = 0`.
- **Preparado localmente:** migration `0019_platform_communication.sql`,
  rollback, pós-validação, `CommunicationService`, adapter Resend e tela
  Admin em Configurações → Comunicação. A credencial nunca é retornada ao
  browser e o status só vira `READY` após teste explícito confirmado.
- **Próximo gate manual:** snapshot novo, revisão humana da `0019`, aplicação
  manual, pós-validação e configuração real da credencial. Não executar DROP,
  SQL remoto ou envio real automaticamente.
- **Segurança:** rotação, revogação,
  auditoria e recuperação descrita em
  `docs/compartilhado/sdd-central-comunicacao-plataforma.md`. Depois disso,
  revisar consumidores e preparar a implementação separada, sem operação
  remota automática.
- **Estado atual:** `secure_secret_store = SUPABASE_VAULT`,
  `remote_vault_preflight = READY_FOR_COMMUNICATION_SCHEMA_REVIEW`,
  `communication_ui = PREPARED_LOCAL`, `migration_0019 = NOT_APPLIED`,
  `remote_operations = NONE`.
## Agora
- **Smoke de identidade e Admin/Agências:** validar novo cadastro, confirmação pendente, login de identidade existente, senha incorreta, recuperação de senha e retorno seguro ao onboarding. Confirmar visualmente as quatro visões de `/admin/agencias` e que estados históricos não aparecem como ações operacionais.
- **Smoke de acesso de agência ativa:** com uma agência ativa e owner Auth válido, testar `Enviar link de acesso`, login pelo callback canônico e `Enviar recuperação de senha`. Confirmar manualmente o estado real do Resend; localmente o contrato permanece `NOT_CONFIGURED` quando as variáveis não existem.
- **Smoke de aplicação aprovada:** usar uma application `APPROVED` sem convite `PENDING`, gerar novo convite, copiar o link uma vez e confirmar que a agência continua inexistente até o aceite. Confirmar que convites `REVOKED` permanecem apenas no histórico.
- **Interface Planner — isolamento de sessão:** validar manualmente Actor A → contextos → logout → Actor B no mesmo perfil, confirmando que nenhum contexto de A aparece para B. Repetir com owner de agência sem owner/membership de marca: zero marcas e rota direta negada. Confirmar Admin global somente em sessão própria. A validação remota da origem da marca observada permanece pendente.
- **Interface Planner — Email transacional:** preparar futuramente a fronteira `sendAgencyInvitation` para convites de agência, convites de membro, convites de marca e recuperação/notificações. Até lá, o estado é `NOT_CONFIGURED` e a entrega é manual por link.
- **Resend/Auth SMTP — configuração manual pendente:** criar conta e verificar domínio no Resend; configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` apenas no servidor; configurar o SMTP do Supabase Auth para confirmação/recuperação; revisar Site URL e Redirect URLs, incluindo `/auth/callback`. Não registrar chaves neste repositório.
- **Convites:** Admin pode gerar novo link para convite `PENDING` ou renovar convite expirado; o token anterior é invalidado e o token bruto não é persistido. Duplicidades existentes não são removidas automaticamente.
- **Fase 3B.1 — smoke de onboarding utilizável:** após a aplicação autorizada da `0018`, validar Admin → copiar link → cadastro/login → confirmação de e-mail, quando exigida → retorno ao convite → aceite → workspace da agência. Confirmar owner do ator, ausência de `perfis.role` alterado e `/admin` negado ao owner.
  - **Estado local:** fluxo, continuidade de callback, estados de convite e aposentadoria da criação direta estão preparados e cobertos por testes.
  - **Pendente:** aplicação remota da `0018`, configuração/entrega de e-mail e smoke autenticado manual. Nenhuma operação remota foi realizada.
- **Fase 3B.1 — porta de entrada de agências:** executar manualmente o preflight read-only, gerar snapshot, revisar a `0018` e só então decidir sobre a aplicação manual. Depois, validar solicitação Free aprovada e convite direto sem criar marca, membership ou acesso editorial implícito.
  - **Sequência do gate:** executar `supabase/scripts/fase-3b1-0018-preflight-read-only.sql`; exigir `preflight_status = READY_FOR_0018_REVIEW`; gerar snapshot novo; aplicar manualmente a `0018`; executar imediatamente `supabase/scripts/fase-3b1-0018-post-validation-read-only.sql` e exigir `post_migration_status = READY`. Nenhuma alteração adicional deve ocorrer entre aplicação e pós-validação.
  - **Dependências:** snapshot aprovado, e-mail manualmente verificável e ambiente remoto autorizado.
  - **Não executar:** onboarding de marca (Fase 3B.2), cobrança real, provider de e-mail, convites de membros ou alterações em owners existentes.
- **Validação manual Fase 3A.1:** como Admin global, criar uma agência de teste e uma marca de teste vinculada, confirmar as rotas canônicas, a ausência de acesso editorial automático do Admin e o isolamento entre marcas.
  - **Dependências:** ambiente remoto autorizado e identidades Auth já existentes.
  - **Não executar:** convites, transferências de owner/marca, permissões avançadas ou limpeza de segurança nesta validação.
- **Objetivo:** validar manualmente autorização e proteção de exclusão de marcas publicadas.
  - **Módulo proprietário:** Admin
  - **Arquivos permitidos:** testes e documentação Admin
  - **Arquivos proibidos:** migrations e outros módulos
  - **Dependências:** ambiente de teste autorizado
  - **Riscos:** exclusão de dados
  - **Critério de aceite:** cenários autorizados e bloqueados registrados
  - **Testes obrigatórios:** `test:authz` e validação manual controlada
## Próximo
- **Objetivo:** detalhar critérios da visão administrativa com produto.
  - **Módulo proprietário:** Admin
  - **Arquivos permitidos:** `docs/01-admin/**`
  - **Arquivos proibidos:** código funcional
  - **Dependências:** decisão de produto
  - **Riscos:** escopo indevido
  - **Critério de aceite:** spec aprovada
  - **Testes obrigatórios:** revisão documental
## Depois
Nenhuma tarefa aprovada.
## Bloqueado
Validação real de persistência depende de ambiente autorizado.
## Descartado
Reescrita administrativa nesta sprint.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.
## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas foram movidas para modules/admin; consumidores e contratos foram mantidos.
- Pendente: validacao manual autenticada e qualquer persistencia remota fora do escopo local.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/admin; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Shell global e build de selecionar-marca — 2026-07-23
- Concluído localmente: ProductShell global, atalhos tenantizados, troca de marca sem sair de Admin e separação Server/Client em `/selecionar-marca`.
- Concluído localmente: ignores explícitos para artefatos gerados sem ocultar `modules/**`.
- Pendente: build completo após o encerramento autorizado do servidor Next; lint global ainda registra dívida preexistente de 82 erros e 31 avisos em módulos e rotas API.

## Concluído — owner Auth selecionável — 2026-07-26
- Busca server-side por nome/e-mail com paginação, normalização e status de confirmação.
- Seleção real separada do texto digitado, bloqueio de criação sem `selectedOwner.id` e revalidação server-side por `auth.admin.getUserById`.
- Testes focados e validações locais executados; validação autenticada manual e persistência remota continuam pendentes.
## Concluído localmente — papéis globais de usuários — 2026-08-05

- A aba canônica `/admin?tab=usuarios` permite pesquisar identidades Auth por e-mail ou nome e visualizar papel global e resumos de memberships sem modificá-los.
- Conceder/remover Admin global atua somente em `public.perfis.role`; o servidor revalida a identidade e toda rota exige Admin global.
- Proteções: último Admin ativo, identidade privilegiada por `ADMIN_EMAIL`, dados inexistentes, chamadas diretas e sucesso prematuro.
- Pendente: smoke manual autenticado com `adalbapro@gmail.com` e `scalbeto@gmail.com`; confirmar a escrita, novo login do novo Admin, isolamento de marcas e memberships, e o comportamento de remoção. Se `adalbapro@gmail.com` for o `ADMIN_EMAIL`, a despromoção exige alteração explícita dessa configuração em tarefa separada.
## Próximo — execução manual da fundação Agência Adalba

- Confirmar o e-mail e login de `scalbeto@gmail.com`; a auditoria remota de 2026-08-05 encontrou `email_confirmed_at = NULL`.
- Gerar backups remotos separados de schema e dados fora do Git, depois executar o audit SQL somente leitura de catálogo/RLS/policies/grants. O dump local desta rodada foi bloqueado pela ausência de Docker Desktop.
- Validar se `0014` já está aplicada antes de qualquer bootstrap; o CLI não retornou ledger remoto, embora as tabelas existam. Não reaplicar nem duplicar schema sem o registro do catálogo.
- Executar bootstrap, smoke do novo Admin, e só então considerar o script de despromoção. A retirada de `ADMIN_EMAIL` continua uma tarefa posterior específica.
# Bloqueado — geração canônica

- Revisar manualmente o catálogo remoto, manter pelo menos dois Admins operacionais e só então autorizar a retirada de `ADMIN_EMAIL`. A Fase 0/1 local não alterou papel, owner, memberships, agências ou dados remotos.
## Pendente após Fase 2A — 2026-08-06

- Executar smoke autenticado da Administração canônica e registrar o comportamento de Admin sem vínculo editorial.
- Migrar ou remover `ADMIN_EMAIL` somente na fase própria, após prova de dois Admins e de ausência de consumidores; não antecipar a limpeza nesta fatia.

## Pendente após Fase 2C — 2026-08-06

- Executar manualmente os três scripts de bootstrap Fase 2C, nessa ordem: preflight read-only, bootstrap transacional e validação read-only. Registrar apenas estados sanitizados.
- Homologar um Admin persistido em `/admin`, `/admin?tab=usuarios`, `/admin?tab=agencias` e `/admin?tab=marcas`; comprovar que ele não abre uma marca sem owner ou membership explícito.
- Antes de qualquer limpeza remota, auditar os consumidores residuais de `user_key`, campos de estado editorial e contratos de migração.
# Correção crítica Fase 3B.1 — gate de smoke

- Confirmar que o usuário convidado permanece com papel global padrão, que somente `/admin/usuarios` concede `perfis.role = 'admin'` mediante confirmação explícita e que sessão ausente/expirada em `/admin` redireciona para login sem Runtime Error.

## Links Auth canonicos - proximo smoke manual

- Validar Gerar acesso temporario: magic link autentica o owner correto, abre a agencia e nao libera /admin.
- Validar Enviar link de acesso e Enviar recuperacao de senha com provider global NOT_CONFIGURED, SENT e FAILED.
- Validar signup de convite via generateLink signup, confirmacao, retorno ao onboarding e aceite unico.
- Confirmar que links Auth nao sao persistidos, nao aparecem em logs e desaparecem apos refresh.

## Fase 3B-R1 — sessÃµes isoladas

- ImplementaÃ§Ã£o local concluÃ­da para troca sequencial por `actorUserId`,
  recuperaÃ§Ãµes locais com namespace de ator e criaÃ§Ã£o de slots host-only.
- Smoke manual pendente: Actor A → logout → Actor B no mesmo perfil e duas
  identidades simultÃ¢neas em hosts distintos; nenhuma operaÃ§Ã£o remota foi
  realizada.
# 3B-R2a + 3B-R4a — gate antes do smoke — 2026-08-09

- Aplicar manualmente a nova `0020_communication_transactional_minimum.sql` somente após snapshot e revisão do catálogo remoto; não executar novamente `0005` ou `0006`.
- Confirmar `platform_communication_config`/Vault e provider global em `READY`; `MISSING_CREDENTIAL`, `MISSING_SENDER`, `VAULT_UNAVAILABLE` e `PROVIDER_ERROR` não liberam smoke.
- Operacionalizar o dispatcher server-side e o webhook de delivery, sem configurar provider ou endpoint remoto nesta tarefa.
- Homologar Admin → convite persistido → e-mail real → login/cadastro correspondente → aceite autenticado → Agência criada com owner e welcome enfileirado.
- Não retornar ao smoke 3B-R1 enquanto o gate de acesso operacional e a sessão Supabase não estiverem validados.
# Correcao local do gate 3B-R2a/R4a - 2026-08-09

- [x] Preservar geracoes hash-only de convite entre tentativas e consumir geracoes atomicamente no aceite.
- [x] Reivindicar `SENDING` somente quando o lease central expirar; respeitar limite de tentativas e concorrencia.
- [x] Documentar rollback operacional separado do rollback de schema, com dry-run read-only e guard de dados.
- [x] Adicionar testes contratuais locais de tokens, lease, exatamente-uma-vez, delivery idempotente e rollback.
- [ ] Aplicar migration, configurar provider/Vault/webhook, receber e-mail real e executar smoke manual; isso continua fora das operacoes do agente.
# Gate remoto pós-migration 0020 - 2026-08-09

## Pós-login de solicitante aprovado - 2026-08-09

- [x] Fechar o dead-end com CTA autenticado para `/onboarding/agencia`, sem token na URL.
- [x] Resolver o próprio convite novamente no servidor e aceitar somente após confirmação explícita.
- [x] Auditar localmente a origem da saída ambígua `remote/pass` do script pós-0020, sem executar SQL.

- [x] Exibir o estado server-side de aplicação aprovada, convite pendente, onboarding não concluído e Agência ainda não criada.
- [x] Manter a decisão de login/cadastro e o aceite do convite no fluxo canônico; não criar Agência durante o login.
- [x] Reutilizar o reenvio administrativo existente, sem segundo mecanismo, token bruto ou endpoint de enumeração.
- [x] Adicionar logout compartilhado ao shell de Agência e Conta, preservando o logout do shell global.
- [ ] Validar manualmente light/dark, responsividade, teclado e logout autenticado.
- [ ] Aguardar e-mail real e smoke de onboarding após os gates remotos de comunicação; 3B-R1 permanece fora desta validação.

- [x] Registrar `snapshot_pre_0020: NOT_PERFORMED` sem reclassificar o fato.
- [x] Registrar `migration_0020: APPLIED_MANUALLY` e `migration_result: SUCCESS_REPORTED_BY_USER`.
- [x] Preparar a v3 read-only de catálogo em `supabase/scripts/fase-comunicacao-0020-post-verification-read-only.sql`, com um único result set e `script_version: 2026-08-10-v3`.
- [x] Auditar os 9 FAILs remotos da 0020 v3 e classificar a saída como `VERIFIER_NEEDS_CORRECTION`, sem alterar banco, migration ou ACL.
- [x] Preparar `supabase/scripts/fase-comunicacao-0020-hardening-preflight-read-only.sql` para estados token used/revoked e validação sanitizada do catálogo.
- [ ] Executar snapshot pós-0020 manual antes de configurar comunicação.
- [ ] Executar verificação read-only e classificar `REMOTE_SCHEMA_VERIFIED`, `REMOTE_SCHEMA_MISMATCH` ou `REMOTE_VERIFICATION_INCOMPLETE`.
- [ ] Somente após schema verificado: Vault, provider, remetente/domínio, health READY, dispatcher e primeiro e-mail real.

# Adendo proposto — cardinalidade de Agência e workspace — 2026-08-09

- [x] Auditar localmente owner, `agency_memberships.user_id`, authorization, contexts, selectors, sidebar, Admin, onboarding, convites, migrations, RLS/RPCs, testes e fixtures.
- [x] Registrar que o contrato de usuário comum é no máximo uma Agência operacional; Admin global permanece exceção sem vínculo automático.
- [x] Preparar `supabase/scripts/agency-single-operational-membership-audit-read-only.sql` sem execução remota.
- [x] Registrar rotas reutilizáveis e a separação entre `/conta` pessoal e workspace da Agência.
- [ ] Aprovar o adendo antes de alterar copy, seleção, cardinalidade, formulário ou schema.
- [ ] Fazer snapshot e preflight de duplicidades antes de qualquer índice/constraint sucessor.
- [ ] Revisar Admin, convites, transferências, RLS/RPCs e testes antes da implementação.

O adendo completo está em `docs/compartilhado/adendo-modelo-canonico-conta-agencia-workspace.md`.

## Complemento proposto — operação compartilhada — 2026-08-09

- [x] Registrar a hierarquia Plataforma → Admin global → Agência → Brand sem transformar Agência em tenant editorial.
- [x] Registrar a exclusividade conjunta owner + membership e o caso inválido de um mesmo actor em duas Agencies.
- [x] Planejar planilhas operacionais de membros, Brands e visibilidade global sanitizada.
- [x] Registrar comunicação única, provider global, futuro sino/notificações e activity agregada sem criar entidades nesta etapa.
- [x] Registrar que a Agência controla operacionalmente suas Brands por padrão, enquanto restrições explícitas da Brand limitam capacidades sem romper o vínculo.
- [ ] Auditar e aprovar SDD específica antes de implementar dados, membros, Brands, notifications ou monitoring.

## SDD proposta — autorização Pessoa/Agency/Brand — 2026-08-09

- [x] Auditar schema, RLS, RPCs, onboarding, convites, Admin, contexts, selectors, consumers, fixtures e testes.
- [x] Definir preflight futuro `supabase/scripts/agency-authorization-preflight-read-only.sql` sem execução remota.
- [x] Registrar que índices owner/member independentes não resolvem o conflito cruzado; SDD recomenda proteção transacional conjunta.
- [x] Registrar Agency → Brand como acesso operacional herdado, limitado por restrições explícitas da Brand.

## Correção da premissa Admin global + Agency — 2026-08-10

- [x] Corrigir o contrato: Admin global pode possuir uma única Agency operacional legítima.
- [x] Manter bloqueio somente para mais de um `agency_id` efetivo na união owner + membership, independentemente do papel global.
- [x] Tratar owner + membership na mesma Agency como uma única Agency deduplicada, sem remoção automática.
- [x] Converter os checks de Admin global com Agency em informação e adicionar `effective_multi_agency_actors` como gate canônico.
- [x] Remover da 0021 os bloqueios específicos de Admin global no precondition, trigger e RPCs.
- [x] Separar `isPlatformAdmin` de `operationalAgency`, sem fallback para a primeira Agency da lista global.
- [ ] Executar novamente o preflight remoto v2 e somente então avaliar a autorização manual da 0021.
- [ ] Aprovar SDD antes de alterar schema, RLS, RPCs, grants ou autorização.

# Proveniência dos grants extras da 0020 — 2026-08-10

- [x] Pesquisar localmente migrations, scripts, docs, fixtures, seeds e consumidores pelos sete grants extras de `service_role`.
- [x] Confirmar que a 0020 não normaliza ACL pré-existente de `service_role`; ela revoga apenas `PUBLIC`, `anon` e `authenticated`.
- [x] Preparar `supabase/scripts/fase-comunicacao-0020-acl-provenance-read-only.sql` com owner, ACL do objeto, grantor, default ACL, membership e efetividade.
- [ ] Executar o diagnóstico remoto read-only e classificar `DEFAULT_ACL_CAUSE` e a origem dos grants.
- [ ] Somente após proveniência confirmada, decidir hardening sucessor posterior à 0021.

# Minha Agência — base operacional - 2026-08-10

- [x] Implementar workspace Agency tenantizado por `agencyRef`, com overview, dados, membros, Brands e Configurações.
- [x] Exibir dados persistidos de Agency, memberships, capacidades canônicas 0021 e vínculos `agency_brands`.
- [x] Implementar edição server-side do nome, gestão de membros Auth existentes e cadastro Agency → Brand sem membership artificial.
- [x] Separar shell de Minha Agência, `/conta` pessoal e `/admin` global; preservar logout e armazenamento local.
- [ ] Validar manualmente `/admin` e `/agencias/agencia-adalba` com o mesmo Admin, incluindo as duas Brands reais existentes, sem alterar identidade ou dados.
- [ ] Não iniciar provider, notifications, activity, dispatcher, e-mail real ou smoke 3B-R1 nesta etapa.

# Cadastro operacional de Marca — 2026-08-10

- [x] Restaurar nome, website, nicho operacional e localização no cadastro Agency → Marca.
- [x] Excluir do formulário operacional BrandDNA, estratégia, keywords, SERP, diretrizes, upload e silos.
- [x] Corrigir first-run da home para Brand nova sem snapshot editorial, com estado real e CTA para BrandDNA.
- [x] Preservar owner técnico, vínculo Agency → Brand, brandId, brandRef e módulos editoriais existentes.
- [ ] Executar smoke manual da criação somente com autorização, usando CareGlow como caso já existente sem recriá-la.
# Hardening ACL Communication 0022 — 2026-08-10

- [x] Classificar a proveniência remota informada como `ACL_PROVENANCE = IDENTIFIED`; `CAUSE = DEFAULT_ACL / PRE-EXISTING OBJECT ACL`.
- [x] Auditar o contrato completo: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER e MAINTAIN.
- [x] Preparar migration 0022 sem alterar defaults globais.
- [x] Preparar preflight read-only e rollback manual.
- [x] Ampliar o verifier 0020 v4 para detectar qualquer privilégio extra.
- [ ] Aprovar o adendo `docs/compartilhado/adendo-0022-communication-service-role-acl-hardening.md`.
- [ ] Fazer snapshot pre-0022 e executar o preflight read-only manual.
- [ ] Aplicar 0022 manualmente e executar pós-verificação remota.
- [ ] Revisar separadamente a dívida de `ALTER DEFAULT PRIVILEGES` global.
# Communication — transição canônica do provider - 2026-08-10

- [x] Corrigir o ciclo local que impedia `test_connection` de sair de
  `VALIDATING` para a primeira tentativa real.
- [x] Preservar `READY` somente após resposta real bem-sucedida do Resend.
- [x] Manter o dispatcher bloqueado antes de `READY`.
- [x] Tornar explícito na UI que “Testar conexão” envia e-mail real.
- [ ] Executar o primeiro envio real somente com autorização humana explícita.
# Resend HTTP 400 — diagnóstico local - 2026-08-10

- [x] Confirmar que `RESEND_HTTP_<status>` vem diretamente de `response.status`.
- [x] Confirmar que o body de erro anterior era descartado.
- [x] Capturar resposta de erro sanitizada sem segredo, payload ou token.
- [x] Criar mock HTTP 400 com `validation_error`, sem chamada externa.
- [ ] Autorizar no máximo um retry real controlado após revisar o diagnóstico.

# Communication — template de AgencyInvitation - 2026-08-10

- [x] Auditar a origem do nome do destinatário, Agência, plano, expiração e CTA.
- [x] Fazer o dispatcher usar `agency_invitations.responsible_name`,
  `proposed_agency_name`, `plan_code` e `expires_at` como contexto canônico.
- [x] Aplicar copy neutra de convite para usuário existente ou novo, com CTA
  `Concluir acesso` e expiração do convite real.
- [x] Manter token bruto somente em memória e persistência somente por hash.
- [x] Adicionar testes direcionados, TypeScript, lint, build e diff check.
- [ ] Repetir o smoke real somente com autorização explícita; nenhuma chamada
  de provider foi executada nesta correção.

# Diagnóstico do smoke AgencyInvitation + new-slot - 2026-08-10

- [x] Corrigir o reenvio de application `APPROVED` para reutilizar/rotacionar
  o convite localizado por `application_id`.
- [x] Preservar `application_id` e `agency_invitation_id` na mensagem de
  comunicação durante a rotação.
- [x] Remover fallback de application/invitation por nome, e-mail ou primeiro
  registro na listagem e no reenvio.
- [x] Cobrir a entrada `/auth/new-slot`, `next`, host `s-{slot}.localhost`,
  callback e continuidade para login/cadastro sem transportar identidade.
- [ ] Correlacionar o último envio remoto por IDs e confirmar o link clicado;
  não há evidência sanitizada suficiente no checkout para concluir essa parte.

# Renovação de convite legado — 2026-08-10

- [x] Confirmar a validade canônica de sete dias e classificar convites fora da
  janela como incompatíveis, sem editar `expires_at`.
- [x] Definir `REUSE_CURRENT_INVITATION` somente para convite `PENDING` futuro
  e dentro da política vigente.
- [x] Definir `CREATE_SUCCESSOR_INVITATION` para convite expirado, revogado,
  aceito, inválido ou fora da janela de sete dias.
- [x] Bloquear localmente a sucessão enquanto `application_id` permanecer
  `UNIQUE`, preservando o convite legado e evitando inserção incorreta.
- [x] Registrar a evolução necessária em
  `docs/compartilhado/sdd-agency-invitation-successor-lifecycle.md`.
- [ ] Aprovar e especificar a evolução do schema para múltiplos convites da
  mesma application antes do smoke de sucessor.
- [ ] Executar smoke de sucessor somente após o gate estrutural e autorização
  explícita; nenhum envio real foi executado nesta tarefa.

# SDD de lifecycle histórico 1:N — 2026-08-10

- [x] Atualizar a SDD existente, sem criar uma SDD paralela.
- [x] Fechar o contrato `AgencyApplication 1:N AgencyInvitation` histórico.
- [x] Definir `REUSE_CURRENT_INVITATION` e `CREATE_SUCCESSOR_INVITATION`.
- [x] Definir convite operacional por marcador explícito, unicidade parcial e
  lock transacional da application; `ORDER BY created_at` não é contrato.
- [x] Registrar TTL de produção de sete dias, TTL de homologação/dev de duas
  horas e override controlável nos testes.
- [x] Substituir o helper fixo por resolver central: sete dias em produção,
  duas horas em homologação/desenvolvimento e override injetável em testes.
- [x] Confirmar próxima migration livre como `0023` no diretório local.
- [x] Criar localmente a migration 0023, o runtime de reuso/successor e o
  verificador read-only, sem aplicar migration ou alterar dados remotos.
- [ ] Fazer snapshot/preflight remoto, revisar o SQL e aplicar manualmente a
  0023 somente após autorização; nenhum passo remoto ocorreu nesta etapa.

## Gate final 0023 — 2026-08-10

- [x] Preparar `agency-invitation-0023-preflight-read-only.sql` em um único
  result set sanitizado.
- [x] Revisar o pós-verificador para cobrir 14 checks estruturais, token
  hash-only, delivery events, ACLs/grants e as cinco RPCs do lifecycle.
- [x] Validar targeted lint, testes direcionados, TypeScript e `git diff --check`.
- [x] Executar manualmente o precheck remoto: checks estruturais `PASS`, com
  informações de policy e catálogo de versionamento ausente.
- [ ] Fazer snapshot pré-0023 antes de qualquer aplicação manual.
- [ ] Revisar o SQL integral e decidir a aplicação manual da 0023; nenhum
  SQL remoto, migration, envio ou mudança de dados ocorreu nesta preparação.
- [x] Corrigir o precheck para que ausência de coluna canônica resulte em
  `FAIL` sanitizado, sem abortar a consulta com `42703`.
- [x] Preparar snapshot pré-0023 read-only com baseline de applications,
  invitations, tokens, messages, delivery events, constraints, índices,
  RLS, policies, ACLs e RPCs.
- [x] Corrigir a saída ambígua do snapshot RPC: assinaturas ausentes ficam em
  `missing_signatures`, nunca em `owners`.
- [x] Preparar diagnóstico catalog-only das cinco RPCs, sem fabricar linhas
  para funções ausentes e com `renew_agency_invitation_count` explícito.
- [ ] Executar manualmente o snapshot pré-0023; nenhum snapshot remoto foi
  executado nesta preparação.
- [ ] Executar manualmente o diagnóstico RPC read-only e classificar a
  existência/assinatura de `renew_agency_invitation` antes de decidir sobre a
  aplicação da 0023.

# Plataforma / Integrações - primeira implementação funcional - 2026-08-11

- [x] Adicionar a tab horizontal `Admin → Integrações` sem navegação lateral própria.
- [x] Ler providers, capabilities, connections Platform, grants, bindings, quotas e usage pela API server-side real.
- [x] Implementar empty states verdadeiros, sem mock, fixture, localStorage ou seed.
- [x] Implementar cadastro/status de providers e capabilities com validação server-side e bloqueio de Serper/RapidAPI.
- [x] Implementar criação de connection Platform somente em `draft`, sem secret, Vault ou teste externo.
- [x] Exibir grants por Agency, quotas separadas e usage append-only sanitizado em leitura.
- [ ] Executar smoke manual autenticado em light/dark, 360/768/1024/1440px e acesso negado para não Admin.
- [ ] Adaptar consumidores Google Ads, DataForSEO e IA somente em fases próprias; não transformar a tela em provider runtime.

# Fundação / persistência canônica do pipeline editorial - 2026-08-11

- [x] Confirmar que `0027` era o próximo número livre sem reaplicar `0002`, `0003` ou `0026`.
- [x] Criar localmente a migration 0027 para artefatos versionados, workflow e SERP.
- [x] Criar localmente a migration 0028 para ContentDocument, versões, estado pessoal e saved views.
- [x] Criar localmente a migration 0029 para `publication_records` separado de briefing, workflow e documento.
- [x] Preservar `SiloPage` como `artifact_type = 'silo_page'`, com `source_version_id` e validação de SiloDNA da mesma Brand.
- [x] Preparar localmente RLS, policies actor-aware, FKs `RESTRICT`, índices, unicidade e proteção append-only.
- [x] Aprovar e materializar a matriz ACL: `authenticated` somente `SELECT`; `service_role` com `SELECT, INSERT` ou `SELECT, INSERT, UPDATE` conforme a tabela; `anon` sem acesso; nenhum privilégio destrutivo.
- [x] Registrar a matriz permanente na SDD de persistência canônica do pipeline editorial.
- [x] Preparar preflight e post-verifier catalog-only em um único result set, com versões fixas.
- [x] Criar testes estáticos do pacote de migrations/verificadores; testes passaram.
- [x] Comparar manualmente o preflight remoto com o contrato aprovado e capturar snapshot pré-aplicação; o usuário relatou post-verifier v2 `PASS` após a aplicação.
- [x] Aplicar remotamente 0027, 0028 e 0029; resultado relatado pelo usuário: `PASS`, nove tabelas vazias. A evidência não foi reconsultada nesta tarefa.
- [x] Implementar localmente runtime/repositories sem handoff e sem adaptar consumidores; a migração do primeiro consumidor permanece em gate separado.
- [ ] Decidir, em fase própria, a estratégia de coerência same-Brand entre referências de entidades sem FK composta.
- [x] Resolver `PIPELINE_SCHEMA_SECURITY_DECISION_REQUIRED` localmente; o schema remoto foi relatado como homologado e o runtime compartilhado local avançou para o gate do primeiro consumidor.
- [x] Diagnosticar separadamente as três falhas de `test:editorial`; as três foram classificadas como `UNRELATED_FAILURE`, sem alterar UI, auth ou testes fora do escopo do schema.

# Autorização Brand — correção do falso negativo do preflight — 2026-08-11

- [x] Confirmar que os helpers actor-scoped de `0021` existem com as assinaturas canônicas de 2 e 4 argumentos.
- [x] Diagnosticar a fragilidade da comparação manual entre `oidvector` e `oid[]`, incluindo a indexação histórica de `proargtypes`.
- [x] Atualizar o preflight para `2026-08-11-pipeline-editorial-schema-preflight-v4`, resolvendo os helpers por `to_regprocedure(... )::oid` e validando owner, `SECURITY DEFINER`, estabilidade, retorno, `search_path` e ACL.
- [x] Separar presence de contract: ausência do OID gera `FAIL` de presença; contrato não resolvido fica `INFO` e não é classificado como falha de ACL.
- [x] Atualizar o diagnóstico catalog-only para `2026-08-11-canonical-brand-authorization-diagnostic-v2`.
- [x] Cobrir nomes de parâmetros, assinaturas de 2/4 argumentos, schema incorreto, tipos incorretos e overloads nos testes locais.
- [x] Registrar a pendência separada `CANONICAL_MUTATING_RPC_EXECUTE_ACL_REVIEW`; não endurecer essa ACL nesta tarefa.
- [ ] Executar manualmente o preflight v4 remoto; `0027`–`0029` continuam não autorizadas para aplicação.

# Runtime compartilhado do pipeline — 2026-08-11

- [x] Criar `resolvePipelineContext()` com `actorUserId` derivado da sessão,
  `brandId` obrigatório e autorização pelos helpers actor-scoped canônicos.
- [x] Manter o cliente `service_role` dentro do contexto server-side somente
  após acesso e ação autorizados.
- [x] Criar repositories finos para as nove entidades do schema editorial,
  sem `PipelineRepository` monolítico e sem adaptar consumidores.
- [x] Aplicar filtros explícitos de `brandId`, `user_id` derivado do ator,
  append-only, hash sem versão desnecessária e `lock_version`.
- [x] Diferenciar `NO_DATA`, `QUERY_FAILURE`, `SCHEMA_MISSING`,
  `NOT_AUTHORIZED`, `CONFLICT` e `INVALID_CONTEXT`.
- [x] Cobrir o runtime com mocks locais; testes do runtime, schema, TypeScript,
  ESLint direcionado e `git diff --check` passaram.
- [x] Consultar a documentação local do Next.js sobre autenticação,
  segurança de dados e fronteira Server/Client Components.
- [ ] Migrar o primeiro consumidor, começando pelo Arquiteto, em tarefa/gate
  separado após revisão do runtime; nenhum módulo consumidor foi alterado.
- [x] Registrar a implementação local do primeiro consumidor canônico do pipeline no Arquiteto.
- [ ] Acompanhar smoke remoto autenticado do Arquiteto; não executar migration, SQL remoto, commit, push ou deploy neste gate.

# Consolidação do onboarding de Agencies — 2026-08-13

## Concluído e homologado

- [x] Registrar separadamente os caminhos `PUBLIC_FREE_TRIAL` e
  `ADMIN_TRUSTED_INVITE`.
- [x] Registrar que o trial público dura 30 dias a partir da ativação e que
  `agency_invitations.expires_at` é somente a validade técnica do link.
- [x] Registrar `agency_access_periods` como fonte canônica do acesso
  operacional, sem equivalência automática com `agencies.status`.
- [x] Registrar a aplicação e pós-verificação remota da migration 0037.
- [x] Registrar a RPC 0039 como fronteira transacional do nome confirmado,
  incluindo `VOLATILE`, `SECURITY DEFINER`, owner `postgres`, `search_path`
  restrito e ACL homologada.
- [x] Registrar os smokes manuais de AdalbaFotos, AdaMusic e AdaSEO, os
  e-mails reais e a apresentação dos estados Admin.
- [x] Registrar a separação entre solicitação pública aprovada, ativação
  aceita e convite administrativo no histórico.
- [x] Homologar remotamente o bootstrap `PLATFORM_INTERNAL` da AdalbaPro:
  `0037 = REMOTE HOMOLOGATED`, `0039 = REMOTE HOMOLOGATED` e
  `AdalbaPro PLATFORM_INTERNAL = REMOTE HOMOLOGATED`, com período persistido
  e post-verifier v2 em `PASS`.

## Pendências preservadas sem bloquear o bloco homologado

- [ ] Revalidar coexistência de múltiplos slots Admin + convidado no mesmo
  navegador; o smoke anterior usou o mesmo contexto autenticado e não prova
  regressão.
- [ ] Ajustar a UX de convite quando a identidade já existe, levando-a
  diretamente à autenticação e ao aceite sem aparência de criação ou troca de
  senha.
- [ ] Refinar copy/apresentação de `ADMIN_TRUSTED_INVITE` sem reabrir a
  arquitetura de Communication.
- [ ] Corrigir escapes Unicode observados em textos de fallback; dívida de
  apresentação.
- [ ] Definir enforcement geral de Agency expirada. A expiração deve preservar
  Agency, Brands, memberships, conteúdo e histórico, removendo apenas o
  direito operacional.
- [ ] Não iniciar billing, planos pagos, central de notificações ou declarar
  webhook `DELIVERED` homologado sem evidência própria.

# Integrações — disponibilidade por resource em homologação (2026-08-15)

- [x] Separar capability operacional de autorização de resource no runtime.
- [x] Expor `HOMOLOGATION_ALLOW_ALL` na tela de Distribuição e despriorizar
  grants manuais por capability.
- [x] Validar smokes reais de DataForSEO e OpenRouter pelo Minerador.
- [ ] Criar/validar o binding externo único de Customer ID da Brand Adalba e
  repetir Google Ads discovery e métricas; não repetir enquanto o binding não
  existir.
- [ ] Conectar usage de operações sem capability técnica somente se o contrato
  de persistência for ampliado em tarefa própria; nesta implementação a
  ausência do catálogo não bloqueia provider, mas não grava evento sem
  `capability_id` válido.

# Integrações — OpenRouter / modelo operacional (2026-08-15)

- [x] Persistir o model ID em `integration_connections.metadata` sem recriar a
  Connection ou alterar o secret.
- [x] Migrar o consumidor canônico do Minerador para o modelo persistido,
  mantendo `OPENROUTER_MODEL` somente como legado não utilizado nesse caminho.
- [x] Homologar readback A → B → A sem reiniciar o servidor e executar um smoke
  real final com o modelo disponível.
- [ ] Avaliar catálogo editável de modelos do OpenRouter em tarefa própria; a
  implementação atual valida model ID, sem inventar catálogo local.

## Evidência local separada

Os gates locais registrados são testes direcionados de access period,
onboarding, presets, Admin e RPC 0039, TypeScript, ESLint, build e
`git diff --check`. A falha textual preexistente de
`tests/agency-invitation-smoke-contract.test.mts` sobre `safeAuthRedirect`
permanece classificada como `UNRELATED_PREEXISTING_TEST_DEBT`, sem vínculo com
a 0039.
