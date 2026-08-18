# Arquitetura canônica do shell e do contexto global

**Estado:** implementado localmente; validação manual autenticada pendente  
**Escopo:** shell global, Agency, Brand selector, restauração pós-login e navegação  
**Sem:** novo schema, migration, operação remota ou alteração das interfaces internas dos módulos

## Regra canônica

O shell global é o contêiner comum das superfícies autenticadas de Brand,
Agency, Conta e Admin. A autorização continua server-side; o shell apenas
expõe links para contextos que a API de contexto retorna.

O fluxo visual é:

`Plataforma → Minha Agência → Brand atual → áreas editoriais → Conta/Admin`

`Minha Agência` é um link global. Dentro da Agency, Visão geral, Membros,
Marcas e Configurações são abas horizontais da própria Agency, não uma segunda
sidebar global.

O Brand selector mostra somente a Brand atual até ser aberto. A lista do shell
é carregada pelo escopo operacional de `marca`; o catálogo administrativo não
é reutilizado como lista de contexto. A troca preserva
o módulo equivalente com `brandId`/`brandRef` canônicos e `switchTenantPath`;
se o servidor rejeitar o destino, não há fallback silencioso para outra Brand.

No shell normal, a ausência de Brand autorizada deixa os atalhos editoriais
indisponíveis; não abre automaticamente `/selecionar-marca`. Essa rota continua
somente como compatibilidade server-side: não renderiza card de escolha e
encaminha para `/admin`, `/onboarding/agencia` ou `/conta` conforme o contexto
canônico confirmado. Nunca escolhe a primeira Brand.

## Contexto e pós-login

`lib/navigation/global-context.ts` guarda, por ator, apenas uma preferência
local de navegação: kind, IDs/refs de contexto e rota/query allowlisted. A
preferência não é autoridade, não é credencial e não substitui a validação da
rota. Nenhum localStorage ou IndexedDB existente é apagado.

Depois do login, quando não existe `callbackUrl` explícito, o cliente chama
`POST /api/contexts/restore`. O servidor revalida a identidade e reconstrói a
rota usando `listCanonicalAccessibleBrands()` ou
`listCanonicalAccessibleAgencies()`. Contexto inexistente, inválido ou não
autorizado cai no seletor excepcional ou no Admin global quando o papel global
foi confirmado.

`/selecionar-marca` permanece como fallback excepcional, não como destino
normal de todo login. A rota recebida nunca pode escolher o owner, a Brand, a
Agency ou a permissão.

`/conta` é a superfície pessoal sem tenant: exibe a identidade Auth, avatar
somente leitura, papel global, recovery pessoal existente e apenas vínculos
operacionais confirmados no servidor.

## Persistência do shell

As rotas autenticadas reutilizam layouts do App Router e o mesmo
`ProductShell`. No desktop o shell usa grid: expandir a navegação altera a
coluna e empurra o conteúdo. Em viewport menor, a navegação usa drawer. O
logout mantém a persistência local de trabalho; a sessão é invalidada pelo
Supabase Auth.

Não são removidas nesta tarefa as recargas que pertencem ao logout/isolamento
de sessão. O shell global não adiciona `window.location`, reload, `router.refresh`
ou redirecionamento intermediário para troca de Brand.

## Fontes técnicas consultadas

- `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
- `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`
- `node_modules/next/dist/docs/01-app/02-guides/redirecting.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- `node_modules/next/dist/docs/01-app/02-guides/multi-tenant.md`

Essas referências sustentam a reutilização de layouts, navegação client-side
com `Link`/router e a distinção entre preferência de navegação e autorização
server-side.

## Limites e validação

O estado remoto de Agencies/Brands não é declarado por testes locais. A revisão
R2 foi validada por testes estruturais, TypeScript, lint focalizado, build e
`git diff --check`; ainda é necessário smoke manual com sessão autenticada, duas Brands, Agency, Admin,
logout/login, rota inválida, mobile, menu recolhido/expandido, dark mode e
larguras 360/768/1024/1440.

## Revisao R3 - 2026-08-11

`/selecionar-marca` e uma entrada de compatibilidade server-side. Ela nao
renderiza o card de escolha: encaminha para `/admin`, `/onboarding/agencia` ou
`/conta` conforme o contexto canonico confirmado. O fluxo normal nao usa essa
rota como destino generico.

`currentRouteContext` e derivado da URL atual. `selectedOperationalBrandId` e
somente a preferencia global de navegacao; nenhum dos dois substitui a
revalidacao server-side do ator, Brand ou Agency.

A preferencia expandida/recolhida do shell e visual e fica em chave local
separada do contexto de autorizacao. O selector fecha antes do recolhimento,
o controle lateral fica fora da coluna de icones e a largura compacta preserva
alvos de toque e teclado. Cache transitório por ator e guarda de hydration
reduzem flicker sem remover a revalidacao de seguranca.

Validacoes locais R3: testes direcionados 30/30, TypeScript, ESLint focalizado,
build Next.js 16 e `git diff --check`. Smoke autenticado manual continua
pendente.

## Revisao R4 - 2026-08-11

`/conta` nao pertence ao mapa de rotas tenant legadas. O `proxy` preserva a
URL pessoal e a cadeia efetiva usa `getCanonicalPersonalAccount()` e
`PersonalAccountPage`, sem exigir Brand, Agency ou seletor.

Brand, Agency, Admin e Conta ainda possuem pontos de montagem distintos para
`ProductShell`, portanto a troca de route group pode remontar a lateral. A
causa do fechamento desktop era o `expanded` local de cada instancia. O estado
agora pertence ao `ShellVisualProvider` sob `Providers`, que sobrevive ao
remount; `mobileOpen` continua local para permitir o fechamento do drawer após
uma navegacao mobile.

Validacoes locais R4: testes direcionados 31/31. Permanecem TypeScript, ESLint,
build, diff check e smoke manual autenticado como gates da entrega final.

## Revisao R5 - 2026-08-11

O shell global recebe do layout raiz um estado inicial server-readable. O
cookie host-only `minerador-key-shell-expanded` e a fonte inicial da
preferencia visual de expansao; o `localStorage` continua somente como
compatibilidade quando o cookie ainda nao existe. A preferencia nao e
autorizacao.

O cookie host-only `minerador-key-operational-brand` tambem nao e fonte de
autoridade. O layout passa seu id para `getServerValidatedOperationalBrand`,
que consulta `listCanonicalAccessibleBrands("marca")` e so entrega ao shell o
id e nome de uma Brand cujo escopo operacional foi confirmado. A dica invalida
e ignorada. O `BrandProvider` preserva essa dica durante a primeira carga e
revalida a lista no cliente, sem apagar o nome valido no primeiro frame.

Nao foi criado mascaramento artificial por timeout, overlay ou opacity. O
controle lateral fica fora do fluxo da coluna, com indicador oculto em repouso
e visivel apenas em hover/focus-visible. O rotulo `Perfil` navega para `/conta`;
nao existe `/perfil`. A rota de Agency permanece `/agencias/{agencyRef}`.

Divida registrada: `ROUTE_AGENCY_SINGULAR_REVIEW`, para avaliar futuramente
`/agencia/{agencyRef}` sem alterar o contrato atual nesta fase.

Validacoes locais R5: testes focados, TypeScript, ESLint, build e `git diff
--check` sao gates da entrega. Smoke manual autenticado continua pendente.
