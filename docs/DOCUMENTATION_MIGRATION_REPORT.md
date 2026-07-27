# Relatório de migração documental — 2026-07-20

## Escopo e método

Sprint documental sem alteração de código funcional, banco, migrations, IA paga, commit, push ou deploy. A fonte primária foi o código atual, contratos, migrations locais e testes; documentos legados foram usados somente para catalogação e para preservar relatos explicitamente identificados.

## Arquivos criados

- Fonte global em `docs/00-produto/` (visão, fluxo, glossário, invariantes, arquitetura e oito ADRs).
- Três documentos por módulo em `docs/01-admin/` a `docs/09-conta/`.
- Pastas de propostas para Arquiteto e Radar.
- `docs/README.md`, `docs/task.md`, índice do arquivo e este relatório.

## Arquivos movidos e arquivados

Os 20 documentos legados listados no [índice](./_arquivo/2026-07-documentacao-legada/INDEX.md) estão preservados em `docs/_arquivo/2026-07-documentacao-legada/`. Não houve exclusão intencional. `docs/scratch/` não foi movido, pois contém artefatos utilitários e scripts, não documentação canônica.

## Fatos confirmados

- Minerador possui tela ampla conectada a listas, keywords, briefings e operações de importação/exportação no Supabase legado.
- Arquiteto possui domínio versionado, guards de publicado, recuperação IndexedDB e rotas estruturadas de ArticleDNA, SiloDNA e SiloPage.
- Workflow editorial possui contratos, transições, locks e repositórios server-side previstos para Radar, Planejador, Redator e Publicações.
- Radar exibe explicitamente SERP simulada; o Redator usa Tiptap; Publicações possui estrutura de importação de aprovados.

## Validação executada

- Estrutura validada: 9 módulos com `spec.md`, `estado-atual.md` e `backlog.md`; 8 ADRs; contratos/propostas e índice legado presentes.
- `npm run test:authz`: 4 aprovados.
- `npm run test:arquiteto`: 48 aprovados.
- `npm run test:editorial`: 20 aprovados.
- `npm run test:operational`: 49 aprovados.
- `test:real-db` não foi executado, pois está fora do escopo seguro desta sprint.

## Contradições ou limites encontrados

- Documentos anteriores descrevem progresso; a auditoria atual não confirmou execução remota, hidratação completa ou validação manual de todos os fluxos.
- SiloPage possui contrato/rota e estado no provider, porém não aparece no carregamento persistido de `workspace`; foi marcado parcial.
- O código corrente já contém alterações funcionais não pertencentes a esta sprint. Elas não foram editadas nem atribuídas a esta migração.

## Ainda não verificado

- Schema e dados remotos do Supabase, RLS efetiva, credenciais/configuração de Serper, persistência real do fluxo editorial e envio externo de publicação.
- Validação manual das telas, inclusive primeiro artigo/documento relatados pelo usuário.

## Chats isolados

Prontos para chat isolado documental/diagnóstico: Admin, Marca, Minerador, Radar, Planejador, Redator, Publicações e Conta, respeitando seus arquivos permitidos. Arquiteto só está pronto para diagnóstico/reconciliação: novas operações de IA permanecem bloqueadas.

## Próximos passos

1. Criar snapshot e auditar/reconciliar a importação/hidratação do Arquiteto.
2. Confirmar persistência com leitura autorizada e fixtures, sem misturar esse diagnóstico com mudanças estruturais.
3. Abrir propostas SDD para SiloPage e SERP real antes de código.
