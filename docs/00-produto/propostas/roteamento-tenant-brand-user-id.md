# SDD — roteamento tenant por `brandUserId`

## Status

> **Decisão vigente — 2026-07-27:** a rota canônica é `/{brandRef}`, com `brandRef = slug-da-marca--brandId` e `brandId = public.marcas.id`. `brandUserId` não é uma identidade de tenant; permanece apenas alias de compatibilidade em código ou referência histórica. Os blocos abaixo que mencionam `[brandId]`, `(workspace)`, `/{brandUserId}` como rota final, migration não aplicada ou contratos ausentes são snapshots da investigação e devem ser lidos como histórico/supersedidos. A implementação local está refletida nas rotas `app/(brand)/[brandRef]` e nos estados dos módulos. Nenhuma migração de dados é implícita.

### Consolidacao emergencial da arvore - 2026-07-23

O estado final substitui os nomes de segmentos anteriores por uma unica arvore `app/(brand)/[brandRef]`. Nao existem paginas funcionais em `[brandId]`, `[brandUserId]`, `(workspace)` ou `_legacy`; qualquer compatibilidade antiga deve redirecionar sem renderizar uma segunda aplicacao. Os entry points de rota importam somente as APIs publicas em `modules/<area>/index.ts`.

### Consolidação brandRef — 2026-07-23

O formato canônico foi refinado para /{brandSlug}--{brandId}/modulo. brandId continua sendo exclusivamente marcas.id; brandSlug é representação decorativa derivada de marcas.nome. parseBrandRef e buildBrandRef são a única fronteira de parsing e geração. A troca global usa o nome e o ID do destino, preserva o módulo permitido, remove IDs de entidade e remonta o ProductShell por brandId.

URLs UUID puras continuam compatibilidade temporária: o mesmo layout resolve o UUID e o entry point redireciona para o brandRef canônico. Slug antigo é aceito somente para resolver o ID e redireciona ao slug atual após autorização.

### Reestruturação de árvore e extração — 2026-07-23

**Snapshot local antes da extração.** A única árvore canônica já existe em app/(brand)/[brandId], mas seus oito wrappers ainda importam páginas de app/(workspace). A árvore antiga contém layout.tsx com um segundo ponto de entrada para ProductShell, oito módulos operacionais, perfil e inteligencia. Não há importador externo localizado para WorkspaceLayout; os únicos consumidores dos entry points do workspace são os wrappers canônicos.

| Origem atual | Destino funcional | Consumidor canônico |
| --- | --- | --- |
| app/(workspace)/minerador/page.tsx | features/minerador/minerador-workspace.tsx | /{brandId}/minerador |
| app/(workspace)/arquiteto/page.tsx | features/arquiteto/arquiteto-workspace.tsx | /{brandId}/arquiteto |
| entradas pequenas de Marca, Conta, Radar, Planejador, Redator e Publicações | componentes já externos em components | rotas equivalentes em /{brandId} |

O rollback local é restaurar somente os entry points movidos e os imports dos wrappers. Nenhuma exclusão de dados, alteração de schema, migration remota ou escrita no Supabase está autorizada. A migration 0005, o dry-run e o rollback SQL permanecem propostas locais e não comprovam o schema remoto.

**Estratégia de compatibilidade.** As oito rotas legadas continuam resolvidas exclusivamente por proxy.ts e app/_legacy; elas não podem voltar a renderizar páginas funcionais. perfil e inteligencia não integram a árvore final e serão tratados como aliases de compatibilidade somente após a extração, sem serem mantidos como superfície funcional duplicada.

### Navegação tenantizada — 2026-07-23

O seletor de marca é uma ação de navegação: ele constrói e abre a URL canônica baseada em brandId. A URL permanece a fonte de verdade; selected_brand_id só conserva preferência de compatibilidade. A troca preserva somente módulo permitido e parâmetros seguros de interface; identificadores de entidade não passam entre tenants. A sidebar compartilhada é a única navegação operacional; Conta, Admin global e saída ficam nela, e resets permanecem no contexto do módulo. A visibilidade do menu não substitui autorização server-side.

Refinamento definitivo: `marcas.id` é `brandId`, o tenant canônico das rotas e dos registros. `owner_user_id` identifica somente o proprietário, e `member_user_id` o colaborador. O arquivo mantém o nome legado por compatibilidade documental; `brandUserId` é apenas alias temporário igual a `brandId`.

Fechamento local em andamento: wrappers canônicos existem, redirects legados passam por `proxy.ts` e `app/_legacy`, e a migration `0005` foi preparada sem aplicação remota. O uso literal de `brandUserId` como `auth.users.id` continua bloqueado por conflito com o tenant legado `marcas.id`; nenhum owner foi inferido.

Proposta aprovada para implementação local de roteamento, resolução de acesso e compatibilidade. Nenhuma migration remota, escrita remota ou alteração de dados está autorizada por este documento.

## Problema

O produto usa rotas globais e `selected_brand_id` no navegador. Isso permite que navegação, estado local e URLs deixem de representar o tenant efetivo. A autorização atual também nasceu do vínculo único `perfis.marca_id`, enquanto o fluxo editorial já prevê memberships e permissões.

## Decisão

As rotas operacionais passam a usar `/{brandUserId}/...`, com `brandUserId` como chave pública do tenant. Durante a compatibilidade, `brandId` e `brandUserId` devem ter o mesmo valor; qualquer divergência é recusada. O layout dinâmico resolve no servidor a sessão, a marca, membership ativa, papel e permissões antes de renderizar um módulo.

Rotas canônicas:

- `/{brandUserId}/` (Marca)
- `/{brandUserId}/conta`
- `/{brandUserId}/{minerador,arquiteto,radar,planejador,redator,publicacoes}`

`/admin`, `/login` e `/api` permanecem globais. As rotas antigas resolvem uma seleção segura no servidor e redirecionam preservando query string; quando não houver uma única marca acessível nem seleção válida, levam à tela de seleção, sem escolher por `localStorage`.

## Contrato de contexto

## Fechamento tecnico local

- `proxy.ts` intercepta somente as oito rotas legadas e reescreve para `/_legacy`; o resolvedor server-side conserva query e redireciona tenant único. A seleção explícita recebe o destino quando há mais de um acesso.
- Os wrappers canônicos reutilizam os entry points existentes. Nenhuma tela monolítica foi copiada.
- `next.config.ts`, metadata raiz/layout tenant e `app/robots.ts` aplicam `noindex`, `nofollow`, `X-Robots-Tag` e `Cache-Control: private, no-store` ao aplicativo privado.
- Cache auditado: recoveries editorial, BrandDNA, Site, Arquiteto, Redator, grids e organização do Minerador já incluem `brandId`; durante compatibilidade ele deve ser igual à rota. `selected_brand_id` não é autoridade e não é removido.
- APIs usam `requireSessionProfile`, `assertCanAccessMarca` ou autorização editorial; `requireTenantPermission` foi consolidado para novos handlers contextualizados. A auditoria remota de todas as tabelas e RLS continua manual.
- A migration `0005` e o dry-run são arquivos locais. Ela adiciona `owner_user_id`, `member_user_id`, status e predicado UUID para RLS, sem backfill automático, sem exclusão e sem substituição das policies legadas.

## Operacao manual obrigatoria

1. Executar `supabase/scripts/tenant-ownership-dry-run.sql` no ambiente controlado e revisar cada conflito.
2. Preencher owner e member UUID somente com evidência humana; então revisar policies que ainda usam `user_key` legado.
3. Aplicar `0005` e, após prova de acesso de duas marcas, substituir policies por `tenant_actor_has_permission` em migration posterior revisada.
4. Encerrar manualmente qualquer `next dev` antes de rodar `npm run build`; nenhum lock ou processo foi removido por esta tarefa.

```ts
interface TenantContext {
  brandUserId: string;
  brandName: string;
  actorUserId: string;
  actorRole: "owner" | "brand_admin" | "editor" | "reviewer" | "specialist" | "reader";
  permissions: string[];
  isGlobalAdmin: boolean;
  planSummary?: {
    planId: string;
    planName?: string;
    status: "active" | "suspended" | "expired";
    capabilities: string[];
  };
}
```

O contexto é exclusivamente server-derived. URL, corpo de API, `BrandProvider`, cache, query e estado de browser não são autoridade de acesso.

## Auditoria de persistência e lacunas

`supabase/migrations/0002_operational_editorial_flow.sql` propõe `brand_memberships`, `brand_member_permissions`, roles e RLS, mas a migration está marcada como não aplicada. Ela identifica membros por e-mail (`user_key`), não por `actorUserId`, e `marcas` não possui `owner_user_id`, estado ativo ou plano. Portanto:

1. nesta entrega `brandUserId` é o identificador de tenant compatível com `brandId`, não uma afirmação não verificável de que seja `auth.users.id`;
2. owner de compatibilidade é o perfil cujo `perfis.marca_id` coincide com o tenant; membership ativa prevalece para colaboradores;
3. plano/assinatura fica ausente no contexto até existir schema auditado;
4. a convergência para `brandUserId === owner_user_id` exige uma migration separada, revisão de RLS, backfill, rollback e aprovação humana.

Os contratos solicitados `docs/00-produto/contratos/autorizacao.md`, `docs/00-produto/contratos/importacoes.md`, `docs/compartilhado/autenticacao-e-permissoes.md`, `docs/compartilhado/persistencia-local.md` e `docs/compartilhado/supabase.md` não existem neste checkout; não foram inventados como fontes de verdade.

## Autorização

`resolveTenantContext` valida: formato do identificador, sessão, existência da marca, vínculo do perfil/membership ativa ou administrador global e permissões. A visibilidade do menu é derivada de `module:view`; cada rota e API continua a validar o mesmo escopo. Registros devem ser filtrados/validados por tenant no servidor.

## Compatibilidade, cache e extension

- Não apagar nem sobrescrever chaves existentes.
- Novas chaves locais devem conter o tenant; as chaves já namespaced por `selectedBrandId` continuam compatíveis.
- Rotas internas novas preservam `brandUserId`; páginas operacionais são reutilizadas por wrappers, sem reconstruir sua lógica.
- O contrato da extensão permanece inalterado nesta etapa porque não foi localizado um consumidor de rota operacional no manifesto/bridge; qualquer mudança futura deve transportar o tenant de forma explícita e validada.

## Rollback e snapshot

Snapshot prévio: checkout já estava sujo (59 arquivos rastreados e diversos não rastreados); nenhum arquivo alheio será revertido. O rollback local consiste em remover apenas os novos wrappers/contextos/redirects desta entrega e restaurar os arquivos explicitamente alterados a partir da cópia de trabalho anterior. Não há rollback remoto porque nenhuma mudança remota será aplicada.

## Validação requerida

- testes unitários para resolução owner, membro, admin e negação;
- testes de construção das rotas e preservação de query;
- testes de rejeição de `brandId` divergente;
- checagem de tipos/lint/build quando o estado preexistente permitir;
- roteiro manual autenticado para owner, colaborador, admin e tentativa de isolamento cruzado.

## Limitações assumidas

Não há prova de schema remoto/RLS, estado ativo de marca, plano ou memberships aplicadas. Esses itens ficam explicitamente pendentes de auditoria e aplicação manual de migration; sucesso de compilação não prova o fluxo remoto.

## Roteiro manual autenticado

1. Entrar como proprietário e abrir `/{tenant}/minerador`; confirmar nome da marca e dados somente dela.
2. Entrar como colaborador ativo com `minerador:view`; abrir a mesma rota e testar uma rota sem permissão, que deve ser bloqueada.
3. Entrar como admin global, abrir duas marcas conhecidas e confirmar que cada URL preserva seu tenant.
4. Tentar trocar o UUID na URL para marca sem vínculo; confirmar bloqueio/seleção, sem conteúdo vazado.
5. Abrir `/{tenant}/conta`; confirmar que dados pessoais pertencem ao ator, não ao proprietário da marca.
6. Abrir um link interno e um link legado com query; a migração completa dos redirects legados ainda depende de extrair as páginas clientes grandes para wrappers server-side, portanto deve ser testada antes de ativação geral.
