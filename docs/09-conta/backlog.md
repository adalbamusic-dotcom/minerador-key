# Backlog — Conta
## Agora
- **Objetivo:** definir escopo funcional mínimo de Conta com produto.
  - **Módulo proprietário:** Conta
  - **Arquivos permitidos:** `docs/09-conta/**`
  - **Arquivos proibidos:** autenticação e Marca sem SDD
  - **Dependências:** decisão de produto
  - **Riscos:** duplicar responsabilidades da Marca
  - **Critério de aceite:** responsabilidades e limites aprovados
  - **Testes obrigatórios:** revisão documental
## Próximo
Nenhuma tarefa aprovada.
## Depois
Nenhuma tarefa aprovada.

## Shell global - 2026-08-11

- Implementado localmente: shell global compartilhado, abas horizontais da Agency, selector de Brand sob demanda e restauração pós-login com revalidação server-side.
- Implementado localmente na revisão R2: selector operacional sem catálogo global, `/conta` pessoal com avatar/papel/recovery/linkagem canônica e controle de expansão sem navegação para `/`.
- Validar manualmente: desktop expandido/recolhido, troca rápida Adalba/CareGlow no mesmo módulo, Agency → módulo → Agency, Admin → workspace, logout/login, contexto perdido, mobile e dark mode.
- Implementado localmente na revisão R3: `/selecionar-marca` é somente compatibilidade server-side, sem card no fluxo normal; contexto de rota e Brand operacional selecionada são estados distintos; `/conta` é o fallback global seguro.
- Implementado localmente na revisão R3: preferência visual da sidebar é persistente e separada da autorização; selector fecha antes do recolhimento; cache por ator e guarda de hydration evitam reset visível sem relaxar revalidação server-side.
- Implementado localmente na revisão R4: `/conta` foi retirado do mapa legacy do proxy e entrega a cadeia pessoal canônica; expansão desktop passou ao `ShellVisualProvider` persistente no layout raiz, mantendo `mobileOpen` separado.
- Diagnóstico local R4: o flicker estrutural vinha da recriação de `ProductShell` entre route groups Brand/Agency/Admin/Conta; a expansão agora sobrevive ao remount sem reduzir revalidação ou alterar módulos internos.
- Smoke R3 ainda pendente: confirmar `/conta` sem passagem pelo seletor, refresh em Admin/Agency, contexto inválido sem fallback para a primeira Brand, controle lateral/teclado, drawer mobile e larguras 360/768/1024/1440.
- Smoke R4 pendente: confirmar URL final `/conta`, expansão desktop durante trocas, fechamento mobile, popover recolhido, controle de borda e ausência de flicker perceptível na entrada de Agency/login.
- Não declarar validação remota, permissão ou persistência funcional sem smoke autenticado.
## Bloqueado
Escopo de produto.

## Pendente após Fase 2C — 2026-08-06

- Executar, em uma única rodada manual, cadastro, confirmação, login, logout, reload, sessão expirada, usuário sem vínculo e revisão responsiva/dark mode.
- Reconciliar o lockfile com `pnpm install` antes de declarar o corte de NextAuth completo.
- Fase 2D preparada localmente: aplicar manualmente a ponte 0016, executar sua validação somente leitura e repetir login/logout/reload/sessão expirada antes de remover qualquer coluna física.

## Incidente 3B-R1 — gate pendente — 2026-08-09

- Executar o smoke manual do login com Admin global e conta comum, incluindo `actorUserId`, destino, reload e logout.
- Repetir senha inválida e registrar apenas a categoria sanitizada apresentada; não alterar usuários ou configuração remota como tentativa.
- O gate 3B-R1.0 foi superado conforme evidência manual registrada; manter somente os gates próprios de comunicação antes do e-mail real.

## 3B-R1 — homologação manual registrada — 2026-08-10

- [x] `MULTI_SESSION_SMOKE = PASS` — evidência manual relatada pelo usuário.
- [x] `SESSION_ISOLATION = PASS` — slots/hosts distintos no mesmo perfil.
- [x] `CONTEXT_ISOLATION = PASS` — Agencies e Brands isoladas.
- [x] `LOGOUT_ISOLATION = PASS` — logout de B preservou A.
- [ ] Comunicação real, provider, dispatcher operacional e e-mail recebido permanecem pendentes.

## Auditoria 3B-R1 — preparação do smoke multi-sessão — 2026-08-10

- Auditoria local concluída: slots por host, `actorUserId`, `sessionEpoch`, contextos server-side, cache/recovery actor+brand e logout por slot preservados.
- Classificação: `HOMOLOGADA_MANUALMENTE`; evidência do roteiro no mesmo perfil foi relatada pelo usuário.
- Roteiro e limitações registrados em `auditoria-3b-r1-sessoes-isoladas-2026-08-10.md`.
## Descartado
Duplicar edição de marca em Conta.

## Concluído — visualização de senha e fluxo de contas — 2026-07-27
- Criado PasswordField reutilizável para login e cadastro.
- Cadastro mantém apenas a identidade Auth; não cria marca ou membership.
- Pendência preservada: redefinição de senha e aceite completo de convite não possuem tela ativa nesta tarefa.
- Validação local desta entrega: testes focados 15/15, ESLint focalizado e git diff --check aprovados. TypeScript/build permanecem bloqueados pelos erros preexistentes da rota de volume da Extensão.

## Concluído — painel de identidade e acesso — 2026-07-27
- Conta passou a exibir quatro áreas: identidade pessoal, segurança bloqueada com motivo explícito, acesso somente leitura à marca atual e preferências sem contrato.
- Papel, origem, status e permissões são derivados do `TenantContext` server-side; o link de equipe usa a rota canônica de Marca e só aparece com `marca:manage` ou Admin global.
- Avatar é somente leitura a partir da sessão atual. Nenhuma persistência falsa, upload, alteração de senha, recuperação ou preferência local foi criada.
- Validação: 25 testes focados, ESLint focalizado, TypeScript, build e git diff --check aprovados. Validação manual autenticada permanece pendente.

## Concluído — refinamento visual da Conta — 2026-07-27
- Hierarquia, espaçamento, perfil, segurança, resumo de acesso, matriz, ação de equipe e estado vazio de preferências foram refinados conforme o sistema visual compartilhado.
- Owner/Admin global recebem resumo antes da matriz; colaboradores com permissões parciais continuam vendo a matriz completa.
- Nenhuma regra de negócio ou contrato foi alterado. Testes estruturais, ESLint, TypeScript, build e `git diff --check` permanecem obrigatórios antes da entrega.

## Próximo
- Aplicar manualmente, após preflight, a migration `0045_profile_avatar_storage.sql`
  e executar o smoke autenticado de upload/readback do avatar.
- Retomar alteração/recuperação de senha somente após a consolidação do Supabase Auth prevista no ADR-019.
- Migrar consumidores de NextAuth em etapas somente após smoke da sessão SSR; Google continua bloqueado até provider, callbacks e Redirect URLs confirmados manualmente.

## Evolução funcional da identidade — 2026-08-18

- [x] Nome pessoal editável com `auth.updateUser` + readback e publicação no
  Notification Center global `global:perfil`.
- [x] Editor de avatar com validação, crop, zoom, reposicionamento, compressão
  WEBP 256×256 e upload pelo contrato `profile-avatars` preparado localmente.
- [x] Perfil pessoal e avatar da GlobalTopbar compartilham a identidade de
  sessão; Agência e Marca permanecem fora da responsabilidade da página.
- [ ] Validar manualmente no Chrome o upload/readback do avatar, o popover, a
  edição do nome e os estados light/dark/responsivos após aplicar a migration.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.
## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas foram movidas para modules/conta; consumidores e contratos foram mantidos.
- Pendente: validacao manual autenticada e qualquer persistencia remota fora do escopo local.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/conta; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.
# Bloqueado — geração canônica

- Não remover NextAuth até substituir todos os consumidores, especialmente o token Google de `/api/mine`, e validar login, refresh, logout, callback e autorização tenant em browser autenticado.
## Próximo após Fase 2A — 2026-08-06

- Executar o roteiro de smoke da Conta no tenant autorizado e registrar os estados de sem permissão e sem marca.
- Não retirar NextAuth, `user_key`, `perfis.marca_id` ou o bridge de compatibilidade até a migração dos consumidores remanescentes.
## Próximo após Fase 2B — 2026-08-06

- Homologar manualmente `/conta` como conta sem tenant e os quatro estados do workspace de agência.
- Propor contrato separado para convite e gestão real de membros da agência; não adicionar controles de sucesso sem persistência confirmada.
- Propor contratos próprios para senha, recuperação, sessões e preferências persistidas antes de criar formulários.

## Concluído — correção de gates Supabase — 2026-08-17

- `/conta` e `/selecionar-marca` redirecionam sessão ausente ou inválida para o login, sem erro 500.
- `authzErrorResponse` responde `401` para sessão Supabase ausente ou inválida em APIs privadas.
- Testes focados `25/25`, ESLint dos arquivos alterados e `git diff --check` passaram.
- Build compilou, mas o typecheck global permanece bloqueado pelos três erros conhecidos `TS1501` em `tests/agency-adalba-platform-internal.test.mts`.
- Smoke autenticado, visual, produção, RLS e operação remota permanecem pendentes.

## Adendo proposto — Minha Agência — 2026-08-09

- [x] Registrar a conta pessoal como identidade, senha e segurança; dados organizacionais ficam no workspace da Agência.
- [x] Auditar as rotas existentes `/agencias/{agencyRef}`, `/membros`, `/marcas` e `/configuracoes` para reutilização.
- [x] Planejar “Minha Agência” com Visão geral, Dados da Agência, Membros, Marcas, Notificações e Configurações, sem implementar notificações.
- [ ] Após aprovação, adaptar o fluxo para um único `agencyId` efetivo por usuário comum e remover a seleção plural fora do Admin global.
- [ ] Após aprovação, definir os campos editáveis do cadastro usando somente dados já existentes; não criar campo/schema nesta tarefa.

- [x] Complementar o workspace com Dados da Agência, Atividade e Notificações como superfícies planejadas, mantendo Conta pessoal separada.
- [x] Registrar planilha UI de membros e Brands baseada em entidades canônicas, sem persistência paralela.
- [ ] Implementar futuramente apenas após aprovação: guards conjuntos owner + membership, tabelas operacionais e rotas `/dados`, `/atividade` e `/notificacoes`.

## SDD proposta — autorização e workspace — 2026-08-09

- [x] Referenciar a SDD estrutural de autorização Pessoa → Agency → Brand.
- [x] Manter `/conta` como identidade e segurança pessoal, sem duplicar autorização organizacional.
- [ ] Migrar contextos e workspace para o acesso herdado/restrito somente após aprovação, preflight e migration própria.

## Estabilidade visual final R5 do shell global - 2026-08-11

- [x] Inicializar expansao/recolhimento por cookie legivel no servidor, mantendo `localStorage` somente como compatibilidade.
- [x] Revalidar no servidor a dica de Brand operacional persistida e evitar restauracao de Brand invalida.
- [x] Remover `Contexto autorizado`, usar `Perfil` como rotulo visual com rota `/conta` e manter o controle lateral fora do fluxo.
- [x] Registrar `ROUTE_AGENCY_SINGULAR_REVIEW`; nenhuma rota de Agency foi alterada.
- [ ] Executar smoke manual R5 autenticado apos reiniciar o servidor local; sem migration, provider ou operacao remota.
