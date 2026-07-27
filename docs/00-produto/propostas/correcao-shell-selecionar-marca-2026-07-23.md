# Correção do shell de navegação e selecionar-marca — 2026-07-23

## Módulo proprietário

Admin, com impacto compartilhado controlado em ProductShell e BrandProvider.

## Decisão

Manter o ProductShell como navegação operacional geral em todas as superfícies. Admin adiciona apenas seu conteúdo e suas tabs internas. Os links globais resolvem a marca selecionada por `buildTenantPath`; sem seleção, usam `/selecionar-marca?destino=<modulo>`. A troca de marca em Admin não navega.

`/selecionar-marca` passa a ser um Server Component fino com `Suspense`, delegando `useSearchParams` ao componente cliente.

## Limites preservados

Não houve alteração de schema, Supabase, RLS, migrations, domínio, provider externo, autenticação ou outras regras de negócio dos módulos operacionais.

## Validação

- `tests/navigation-shell.test.mts` + `tests/tenant-routing.test.mts` + `tests/editorial-pipeline.test.mts`: 29/29.
- Suite acumulada da consolidação: 212/212.
- TypeScript e lint focalizado dos arquivos alterados: aprovados.
- Lint global: 82 erros e 31 avisos preexistentes, concentrados em dívida de módulos e rotas API.
- Build completo: pendente até o encerramento autorizado do servidor Next.
- Navegador local sem sessão: `/selecionar-marca` renderizou; `/admin` redirecionou para a entrada pública. Fluxo autenticado permanece pendente.
