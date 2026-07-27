# Minerador Key

Produto interno para transformar contexto de marca e keywords em uma cadeia editorial rastreável: arquitetura, pesquisa, planejamento, redação e preparação de publicação.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind, Zod, NextAuth, Supabase, Tiptap e integrações opcionais de planilha, volume e IA.

## Rotas principais

| Área | Rota |
| --- | --- |
| Globais | `/`, `/login`, `/cadastro`, `/selecionar-marca` |
| Administração global | `/admin` (`/admin/marcas` é compatibilidade/redirect) |
| Marca | `/{brandRef}/` |
| Minerador | `/{brandRef}/minerador` |
| Arquiteto | `/{brandRef}/arquiteto` |
| Radar | `/{brandRef}/radar`, `/{brandRef}/radar/{articleId}` |
| Planejador | `/{brandRef}/planejador` |
| Redator | `/{brandRef}/redator` |
| Publicações | `/{brandRef}/publicacoes` |
| Conta | `/{brandRef}/conta` |

`brandRef = slug-da-marca--brandId`; `brandId = public.marcas.id`. Os grupos `(admin)` e `(brand)` são internos do App Router e não aparecem na URL. `/workspace` não é rota canônica.

## Módulos e documentação

O repositório é um monólito modular. A documentação canônica está em [docs/README.md](docs/README.md): cada módulo possui `spec.md`, `estado-atual.md` e `backlog.md`; as regras globais ficam em `docs/00-produto/`. Documentos históricos foram preservados em `docs/_arquivo/` e não são fonte de verdade.

Fluxo oficial: `Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`.

## Executar localmente

1. Copie os valores necessários de `.env.example` para `.env.local`, sem registrar credenciais.
2. Instale dependências com `pnpm install`.
3. Inicie com `pnpm dev` e abra `http://localhost:3000`.

## Agentes e contribuição

Antes de alterar código, leia `AGENTS.md`, os invariantes, glossário, fluxo oficial e a documentação do módulo proprietário. Mudança compartilhada aditiva, mínima, retrocompatível e necessária pode prosseguir dentro da tarefa autorizada com consumidores identificados, compatibilidade e regressão. Mudança estrutural ou incompatível, incluindo contrato, schema, persistência, workflow, hidratação global ou fronteira de módulo, exige proposta SDD e autorização antes da implementação. Ao finalizar, atualize estado, backlog e ADR quando houver decisão arquitetural.

## Segurança operacional

Não execute commit, push, deploy, migration remota, escrita no Supabase remoto, limpeza de storage ou chamadas pagas de IA sem autorização explícita. Testes devem usar fixtures; IA aplicada nunca é aprovação humana.

## Testes

```bash
pnpm run test:authz
pnpm run test:arquiteto
pnpm run test:editorial
pnpm run test:operational
```

`pnpm test` também inclui `test:real-db`; não o execute sem autorização e ambiente apropriado.
