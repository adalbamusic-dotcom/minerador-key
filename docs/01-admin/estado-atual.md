# Estado atual — Admin

## Fluxo de criação de marca e owner — estado relatado/validado em janela anterior

O fluxo registrado é: Admin global abre o cadastro, pesquisa usuários Auth server-side, seleciona owner real, o servidor revalida, cria a marca, cria membership owner ativa, retorna `brandId`/`brandRef` e o Admin entra na rota tenantizada. A implementação não aceita o texto pesquisado como owner.

O estado operacional registrado para Adalba e Lindisse indica owners distintos, memberships isoladas, acesso do Admin a ambas, Lindisse iniciando vazia, dados da Adalba preservados, troca de marca funcionando e sidebar/Extensão acompanhando a marca ativa. Esta é evidência datada de operação anterior, não uma nova validação nesta tarefa.
- **Última auditoria:** 2026-07-20, por leitura de código.
- **Funcionando:** rota `/admin`, tela de marcas e API de marcas. **Verificado no código.**
- **Parcial:** visão resumida é simples; não foi validada manualmente nesta sprint.
- **Simulado:** não identificado na superfície administrativa auditada.
- **Local:** marca selecionada é lembrada no navegador pelo provider compartilhado.
- **Persistido:** marcas e listas/silos iniciais por Supabase. **Verificado no código.**
- **Bloqueado:** nenhuma operação de dados foi executada nesta sprint.
- **Regressões e bugs:** não auditados manualmente.
- **Arquivos centrais:** `app/(admin)/admin/marcas/page.tsx`, `app/api/marcas/route.ts`.
- **Testes:** `tests/marcas-access.test.mjs` cobre acesso; execução desta sprint registrada no relatório.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** nenhuma material identificada por leitura; validar UI e RLS em ambiente real.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/admin; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- O Admin permanece global; o botão de abrir marca agora direciona à rota canônica do tenant.

# Shell global e seleção de marca — 2026-07-23
- ProductShell conserva o fluxo operacional geral no Admin; as tabs administrativas continuam em AdminConsole.
- A seleção de marca foi separada em Server Component com Suspense e componente cliente para os parâmetros de busca.
- No Admin, trocar a marca atualiza apenas os atalhos e preserva a rota administrativa.
- Validação local: suite focalizada 29/29 nesta correção, suite acumulada 212/212, TypeScript aprovado e lint focalizado aprovado.
- Build completo permanece pendente até o encerramento autorizado do servidor Next; validação autenticada manual permanece pendente.

# Busca e seleção real de owner — 2026-07-26
- O cadastro de marca separa texto pesquisado, owner selecionado e status da busca.
- A criação só habilita o envio após seleção de um usuário Auth retornado pelo servidor; o payload usa `ownerUserId` e não aceita o texto digitado como owner.
- A busca administrativa exige Admin global, normaliza trim/caixa, percorre as páginas necessárias de `auth.admin.listUsers` e preserva usuários ainda não confirmados.
- Erros 401/403/500 permanecem distintos de busca concluída sem resultados; falhas de salvamento ficam no estado do formulário sem Console Error esperado no navegador.
- Validação local: testes Admin 12/12, suíte `test:authz` 43/43, TypeScript, ESLint focalizado e build aprovados.
- Não foi executada consulta remota, escrita no Supabase, migration, commit, push ou deploy; existência do e-mail informado não foi verificada remotamente.
