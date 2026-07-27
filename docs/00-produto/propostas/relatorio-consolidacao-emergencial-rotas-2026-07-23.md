# Relatorio de consolidacao emergencial de rotas

## Escopo

Entrega local para remover a duplicidade de entradas do App Router e manter uma unica superficie operacional tenantizada. Nao houve migration remota, escrita no Supabase, commit, push ou deploy.

## Snapshot e inventario

Antes da remocao dos entry points, o inventario local registrou a arvore canônica em `app/(brand)/[brandId]`, a arvore funcional legada em `app/(workspace)` e o resolvedor temporario `app/_legacy`. Os consumidores dos entry points eram os wrappers das telas operacionais; a logica foi preservada em `features/` e `components/`.

O rollback local consiste em restaurar os arquivos de rota removidos e os imports anteriores, sem restaurar uma segunda superficie funcional. Nenhum dado de usuario ou armazenamento do navegador foi alterado.

## Resultado

A unica arvore de paginas ativa e:

```text
app/(brand)/[brandRef]/
  page.tsx
  conta/page.tsx
  minerador/page.tsx
  arquiteto/page.tsx
  radar/page.tsx
  radar/[articleId]/page.tsx
  planejador/page.tsx
  planejador/[contentPlanId]/page.tsx
  redator/page.tsx
  publicacoes/page.tsx
```

`brandRef` e um segmento legivel no formato `brandSlug--marcas.id`; a autorizacao e a resolucao usam somente `marcas.id`. Rotas UUID puras continuam apenas como compatibilidade de entrada e sao redirecionadas para a forma canonica apos resolucao.

As rotas importam APIs publicas de `modules/<area>/index.ts`. Esses arquivos sao re-exportacoes finas dos componentes existentes; nao duplicam paginas nem reescrevem os modulos.

`/admin` concentra as abas administrativas. `/admin/marcas` permanece somente como redirect de compatibilidade para `/admin?tab=marcas`.

## Limites de validacao

- confirmado por `rg --files app` que nao existem arquivos ativos em `[brandId]`, `[brandUserId]`, `(workspace)` ou `_legacy`;
- removidos os controles globais `Atualizar`/`Atualizar dados` que disparavam `pipeline.reload()`;
- preservados os botoes de importacao, sincronizacao do Site/Sitemap, organizacao do Minerador, exportacao e coleta SERP;
- testes focados de tenant routing permanecem a referencia local;
- TypeScript/build completo ficam pendentes de uma execucao sem o processo de desenvolvimento do Next concorrente e sem artefatos `.next` antigos.
