# Supabase e tenantizacao

## Estado vigente — 2026-07-27

Os efeitos de 0005 e 0006 são considerados existentes no ambiente alvo. O resultado remoto registrado em 2026-07-24 informa aplicação consolidada da 0006 e validation `READY`; a FK canônica de `lista_id` é `ON DELETE RESTRICT`. Não reexecutar 0005/0006, não executar rollback e não tratar os blocos pré-aplicação abaixo como pendências atuais. Esta documentação registra o resultado disponível, não uma nova validação remota realizada nesta tarefa.

## Contrato estrutural conferido nas migrations locais

`public.marcas` usa `id` como `brandId`, além de `owner_user_id` e `status`. `public.brand_memberships` relaciona `marca_id` e `member_user_id`, preserva `role_id`/papel, permissões, status, convite/ator responsável e datas; há unicidade por marca e usuário. `public.brand_roles` separa papel global (`marca_id` nulo) de papel escopado à marca. `public.brand_member_permissions` registra `membership_id`, módulo, ação e `granted`.

`listas_kgr.marca_id` é o vínculo direto da lista. `keywords_kgr.brand_id` é obrigatório e `lista_id` continua anulável; uma keyword sem lista permanece válida. Quando há lista, o SQL local exige a mesma marca e a FK canônica `fk_keywords_kgr_lista_0005` usa `ON DELETE RESTRICT`.

As migrations locais definem RLS para marcas, listas, keywords, papéis, memberships e permissões. As funções tenantizadas representam: Admin global (`is_global_admin`), acesso de leitura a marca ativa (`can_access_brand`), gestão de marca (`can_manage_brand`), acesso por lista (`can_access_list`) e combinação de marca, módulo, ação e permissão (`tenant_actor_has_permission`). A 0006 remove execução de `anon`, preserva execução para `authenticated` e `service_role` e exige `search_path` seguro. Isto é conferência do SQL local e do registro documental; não é nova inspeção remota.

As tabelas operacionais existentes se relacionam com `marcas.id` por `marca_id`. Na preparação local anterior, a migration `0005_tenant_ownership_and_rls.sql` preparava owner UUID, membership UUID e predicado RLS canônico sem renomear ou excluir colunas legadas. A frase de não aplicação é histórica; o estado remoto efetivo e a orientação de não reexecutar estão registrados em **Resultado remoto da 0006**.

## Revisao 0005 — 2026-07-24

O contrato revisado adiciona `keywords_kgr.brand_id` obrigatorio depois do backfill, mantendo `lista_id` nullable. Keywords sem lista permanecem validas e recebem apenas o tenant reconciliado; nenhuma lista artificial e criada. `listas_kgr.marca_id` torna-se `NOT NULL` apos validacao.

`brand_memberships` preserva a compatibilidade legada (`marca_id`, `user_key`, `role_id`) e adiciona `member_user_id`/`role` como identidade canonica. `marcas.owner_user_id` recebe somente o owner explicitamente autorizado da Adalba. O dry-run e somente leitura, o snapshot e manual e o rollback usa guard persistente para abortar diante de dados posteriores.

Antes de qualquer aplicacao remota, os consumidores precisam incluir `brand_id` nas novas keywords. A compatibilizacao local agora cobre `modules/minerador/minerador-workspace.tsx`, `app/api/marca/site/import/keywords/route.ts`, a pre-visualizacao Site/Sitemap e as APIs de analise. O codigo pos-0005 nao deve ser executado contra schema pre-migration; se migration e deploy nao ocorrerem na mesma janela, as mutacoes do Minerador permanecem bloqueadas entre as etapas.

Consumidores de Arquiteto, Radar, Planejador, Inteligencia e SERP editorial foram apenas auditados e exigem proposta proprietaria antes de qualquer alteracao.

Estado registrado nesta seção: preparado localmente, antes da aplicação remota, sem homologação em RLS remoto.

## Endurecimento de concorrencia da 0005 - 2026-07-24

A migration abre uma janela de manutencao com `SET LOCAL lock_timeout = '10s'` e `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` para `marcas`, `perfis`, `listas_kgr` e `keywords_kgr`, imediatamente depois de `BEGIN`. O lock deve ser obtido antes de qualquer snapshot, fingerprint, tabela temporaria, alteracao ou backfill; a aplicacao deve permanecer encerrada durante a janela.

O guard transacional `tenant_0005_keyword_list_guard` armazena somente `id` e `lista_id` e e descartado no `COMMIT`. Antes do `COMMIT`, a migration compara o guard com `keywords_kgr` por `FULL JOIN` e `IS DISTINCT FROM`, incluindo insercoes, exclusoes, trocas e contagens. O fingerprint continua apenas como diagnostico adicional. O backfill pode alterar somente `brand_id`; `lista_id` permanece nullable e a lista nunca e escolhida ou criada pela migration.

A conclusao forense permanece `CAUSA NAO COMPROVADA`: o fluxo legado `handleBatchMove` e compativel com o incidente, mas nao existe prova local de clique ou de execucao. Os triggers de publicados nao sao desabilitados. O dry-run continua read-only e informa que lock transacional nao se aplica a ele; a aplicacao remota continua manual e nao realizada.

## Reconciliacao de seguranca 0006 - 2026-07-24

A 0005 existe estruturalmente no estado confirmado, mas a validacao final de seguranca encontrou funcoes SECURITY DEFINER executaveis por `anon`, fallback legado por e-mail vazio em `can_access_brand`, policies de listas usando o modulo `marca` e pares de constraints que exigem comparacao do catalogo.

A 0006 corrige somente funcoes, grants, policies e constraints catalogadas. Nao repete backfill, nao recria memberships e nao altera keywords, `brand_id`, `lista_id`, listas ou owner. A pre-condicao aceita semanticamente `public, pg_temp` ou `pg_catalog, public, pg_temp`, cataloga as cinco definicoes e somente a pos-condicao exige `search_path = pg_catalog, public, pg_temp`; `anon` perde EXECUTE enquanto `authenticated` e `service_role` recebem execute explicito.

Estado registrado nesta seção: 0006 preparada localmente, antes da aplicação remota, com dry-run/validation remotos pendentes e rollback remoto não executado. O dry-run classificava o estado antigo como `SEARCH_PATH_RECONCILIATION_REQUIRED` e ainda podia retornar `READY`; a validation exigia `SEARCH_PATH_OK` e permanecia `BLOCKED` antes da aplicação.

## FK canônica de lista — 2026-07-24

Foi autorizada a consolidação de `fk_keywords_kgr_lista_0005` como FK canônica `ON DELETE RESTRICT`. A constraint legada `keywords_kgr_lista_id_fkey` só pode ser removida pela 0006 depois da validação semântica exata do catálogo (`lista_id` → `listas_kgr.id`, `CASCADE`/`RESTRICT`, `NO ACTION` no update, constraints validadas e não diferíveis); a definição textual é mantida como diagnóstico. Qualquer estado inesperado bloqueia a transação.

O objetivo é impedir que excluir uma lista apague keywords silenciosamente. `lista_id` continua nullable: keywords devem ser movidas explicitamente ou desagrupadas antes da exclusão. A auditoria local não encontrou `DELETE` ativo direto em `listas_kgr`; o Arquiteto apenas desagrupa a organização local. O rollback reintroduz somente a FK `CASCADE` catalogada e é assistido.

## Resultado remoto da 0006 — 2026-07-24

A 0006 foi aplicada remotamente e a validation pós-migration retornou `READY`. O erro `42P01` ocorreu somente no diagnóstico pós-`COMMIT`, ao acessar `pg_temp.tenant_0006_snapshot` depois de `ON COMMIT DROP`; não há perda de dados reportada. A migration não deve ser reexecutada e o rollback não deve ser executado. O epílogo local agora termina imediatamente em `COMMIT;` para futuras instalações.

## Acesso browser autenticado a `listas_kgr` — 2026-07-24

O diagnóstico local confirmou que as telas do Minerador e do Arquiteto criavam um cliente Supabase apenas com a anon key. Sem o bearer da sessão NextAuth, o PostgREST executava como `anon`, causando `permission denied for table listas_kgr` após a 0006. O Arquiteto também tentava `setSession` com `refresh_token` vazio.

Foi criado `lib/supabase/browser-authenticated-client.ts`: o browser continua usando somente a anon key pública, envia o `session.accessToken` no header `Authorization` e não persiste nem renova sessão Supabase localmente. As telas bloqueiam consultas sem sessão/token; as queries permanecem tenantizadas por `marca_id` e `brand_id`. Clientes server-side e `service_role` permanecem restritos ao servidor e não foram alterados.

Compatibilidade compartilhada: o contrato consumido é o `session.accessToken` exposto pelo NextAuth; o fluxo Credentials fornece o access token Supabase. O fluxo Google ainda requer validação manual/contrato explícito se o token do provedor não for um JWT Supabase. Não foram alterados RLS, grants, migrations, dados, policies, owners ou memberships. Nenhum SQL remoto foi executado nesta correção.

Verificação local: 95 testes focados passaram, incluindo 0005/0006, auth, Minerador e Arquiteto; TypeScript, build, ESLint focalizado nos arquivos novos e `git diff --check` passaram. O lint integral dos dois workspaces ainda reporta erros preexistentes de `any`/hooks. Smoke test autenticado no browser, Google OAuth e confirmação online permanecem fora da validação local.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

O primeiro defeito era ausência de bearer: o browser consultava como `anon`. A correção intermediária passou a enviar um bearer fixo, mas o JWT Supabase expirou e ficou congelado no cliente. O defeito adicional era o callback JWT não guardar o `refresh_token` Supabase e tratar `account.access_token` do Google como se fosse JWT Supabase.

O contrato atual é: `session.accessToken` contém somente JWT emitido pelo Supabase Auth; `session` não expõe token Google. No login Google, o servidor troca `account.id_token` pelo par Supabase via `grant_type=id_token`; o token Google permanece somente no JWT NextAuth criptografado para uso server-side do Google Sheets. Se o provedor Google do Supabase não estiver configurado, o diagnóstico é `SUPABASE_GOOGLE_EXCHANGE_FAILED`; `GOOGLE_ID_TOKEN_MISSING` identifica a ausência do `id_token` antes da troca. Nenhuma configuração remota foi alterada.

O callback JWT renova o Supabase por `grant_type=refresh_token` quando falta até 60 segundos para expirar. Refreshes simultâneos do mesmo usuário compartilham uma promessa indexada por hash do refresh token e a referência é removida ao concluir. Falha limpa o access token e marca `SUPABASE_TOKEN_REFRESH_FAILED`; respostas incompletas usam `SUPABASE_ACCESS_TOKEN_MISSING` ou `SUPABASE_REFRESH_TOKEN_MISSING`, e claims inválidos usam `SUPABASE_TOKEN_INVALID_CLAIMS`. O browser consome resultado estruturado (`ok`, `token`, `reason`, `expiresAt`) e não envia token vencido nem usa anon como fallback.

O browser usa `@supabase/supabase-js@2.108.2` com `accessToken: async () => getSession()...`, valida `iss`, `aud`, `sub`, `role`, `iat` e `exp` somente em metadados locais, exige `aud=authenticated`, `role=authenticated`, `sub` presente e margem de 60 segundos. SELECT pode repetir uma vez após `JWT expired`; escritas não têm retry automático. Nenhum JWT, cookie ou refresh token é registrado.

Operação manual pendente: reiniciar o servidor, sair da conta, entrar novamente pelo Google ou Credentials, abrir Minerador e Arquiteto e confirmar a renovação após a margem. A 0005/0006 já aplicada não deve ser reexecutada e rollback não deve ser executado.

### Diagnóstico seguro da sessão — 2026-07-24

Os códigos compartilhados são `SESSION_LOADING`, `NEXTAUTH_SESSION_MISSING`, `GOOGLE_ID_TOKEN_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_REFRESH_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED`, `SUPABASE_TOKEN_REFRESH_FAILED` e `SUPABASE_SESSION_READY`. Minerador e Arquiteto registram somente etapa, provedor, código, presença do access token, `expiresAt`, segundos restantes e claims seguros (`subject`, `role`, `audience`, `issuer`); nunca registram JWT, cookie, refresh token, Authorization ou segredo.

Somente `SUPABASE_TOKEN_EXPIRED` com expiração efetiva produz a mensagem “Sua sessão expirou”. `SUPABASE_TOKEN_REFRESH_FAILED`, ausência de sessão, falha de troca Google, ausência de access/refresh token e claims inválidos têm mensagens próprias. O `refresh_token` permanece somente no JWT NextAuth server-side; a rotação substitui o par anterior e usa lock por hash para chamadas concorrentes.

O login Google ainda depende da configuração remota do provider Google no Supabase. Essa dependência foi documentada, mas não foi alterada nem validada por login real nesta tarefa.

### Fechamento da sessão incompleta Google → Supabase Auth — 2026-07-24

No primeiro login Google, o callback exige `account.provider = google`, `account.id_token`, resposta com `access_token` e `refresh_token`, e claims Supabase válidos. Falha em qualquer etapa registra diagnóstico seguro somente fora de produção e lança o reason correspondente; o Auth.js não conclui o login com uma sessão utilizável para os módulos.

O callback `session` expõe apenas:

```ts
session.supabaseAuth = {
  status: "ready" | "error",
  reason,
  expiresAt,
}
```

O access token Supabase só é copiado para `session.accessToken` quando `status = ready`; refresh token, tokens Google, JWTs, cookies e Authorization nunca são expostos. A tela de login bloqueia o redirecionamento ao workspace quando `supabaseAuth.status` não é `ready` e oferece novo login.

Credentials permanece compatível: o access token e refresh token emitidos pelo Supabase Auth são validados e persistidos no JWT Auth.js; resposta incompleta também interrompe o login.
