# Relatorio da Realidade Atual do App Adalba

Data: 30/06/2026

## Resumo executivo

O app esta funcionando em termos de build, rotas principais e acesso basico. A base atual tambem parece saudavel para keywords publicadas: existem 19 keywords com status `publicado`, todas ligadas a silos validos, sem duplicata publicada no mesmo silo.

Porem, a regra mais importante do projeto - "tudo que esta publicado nao pode ser apagado em nenhuma instancia" - ainda nao esta garantida de forma absoluta. Hoje existem boas protecoes no front-end e em algumas operacoes locais, mas falta uma protecao forte no banco de dados e nas APIs. Sem essa protecao, um bug, uma rota administrativa, uma chamada direta de API ou uma exclusao em cascata ainda pode apagar ou alterar dados publicados.

Veredito: pode continuar o trabalho de desenvolvimento, mas eu nao recomendaria tratar o sistema como blindado para dados publicados ate corrigir os pontos criticos abaixo.

## Estado operacional

Verificacoes executadas:

- `npx tsc --noEmit`: passou.
- `npm run build`: passou.
- Rotas testadas via HTTP local: `/minerador`, `/arquiteto`, `/perfil`, `/admin/marcas`, todas responderam `200`.
- `npm run lint`: falhou com 166 problemas, sendo 138 erros e 28 warnings. A maioria esta ligada a `any`, hooks, imports nao usados e arquivos em `docs/scratch`.
- `npm audit --omit=dev`: encontrou vulnerabilidades moderadas em dependencias transitivas:
  - `postcss` usado internamente pelo `next`.
  - `uuid` usado pelo `next-auth`.

Versoes principais:

- Next.js: `16.2.9`.
- React: `19.2.7`.
- NextAuth: `4.24.14`.
- Supabase JS: `2.108.2`.

## Realidade atual do banco

Consulta feita via credenciais locais, sem expor chaves:

- Marcas: 1.
- Silos/listas: 4.
- Keywords totais: 76.
- Keywords `publicado`: 19.
- Keywords `aprovado`: 57.
- Keywords publicadas sem silo: 0.
- Keywords publicadas com silo inexistente: 0.
- Duplicatas publicadas na mesma keyword/silo: 0.
- Briefings em `briefings_artigos`: 0.

Leitura: a base atual de keywords publicadas esta coerente. O problema e menos a situacao atual e mais a falta de travas definitivas para proteger esse estado no futuro.

## Protecoes ja existentes

No Minerador:

- Exclusao em lote filtra e apaga apenas keywords que nao estao como `publicado`.
- Exclusao de duplicatas preserva `publicado`.
- Mudanca de status nao rebaixa item ja `publicado`.
- Movimentacao de silo/lista bloqueia keywords publicadas.
- Aprovacao em lote preserva publicadas.
- Deduplicacao automatica tenta manter a versao publicada quando ha repeticao.

No Arquiteto:

- Limpeza/reset local remove apenas nao-publicados.
- Remocao de artigo publicado do silo e bloqueada.
- Movimento de artigo publicado entre silos e bloqueado.
- Exclusao local de grupo/silo com artigo publicado e bloqueada.
- Ao salvar DNA de artigo publicado, o codigo preserva keyword principal, slug e silo; permite alterar hierarquia, metas e diretrizes.

No Admin:

- A UI evita editar/remover linhas de silos ja existentes no modal de marca.
- Novos silos sao criados sem apagar os existentes.

## Riscos criticos encontrados

1. Nao existe uma trava definitiva no banco para impedir `DELETE` de registros publicados.

As protecoes atuais estao principalmente na aplicacao. Isso e bom para experiencia de uso, mas nao e suficiente para a regra "em nenhuma instancia". O correto e ter trigger/policy no Supabase bloqueando:

- `DELETE` em `keywords_kgr` quando `status = 'publicado'`.
- Rebaixamento de `status` de `publicado` para qualquer outro status.
- Alteracao de campos estruturais de publicado, como `keyword`, `lista_id`, slug/canonico e campos equivalentes.
- `DELETE` de silos/listas que tenham keywords ou artigos publicados.
- `DELETE` de marcas que tenham qualquer dado publicado ligado aos seus silos.

2. A rota `DELETE /api/marcas` usa Service Role e apaga marca diretamente.

Arquivo: `app/api/marcas/route.ts`.

Essa rota valida admin, mas usa a chave de Service Role e executa delete real na tabela `marcas`. Se o banco tiver cascata ou se houver relacoes dependentes, uma exclusao de marca pode apagar silos/keywords/briefings. Mesmo que hoje a UI peca confirmacao por nome, isso ainda nao atende a regra de protecao absoluta.

Recomendacao: trocar hard delete por soft delete ou bloquear qualquer exclusao se existir keyword/artigo publicado relacionado.

3. APIs de IA e volume nao validam sessao antes de processar.

Rotas afetadas:

- `app/api/analyze/route.ts`
- `app/api/process-intent-niche/route.ts`
- `app/api/generate-briefing/route.ts`
- `app/api/clusterize/route.ts`
- `app/api/revalidate-structure/route.ts`
- `app/api/volume/route.ts`

Algumas delas tambem usam Service Role para gravar no Supabase. Isso significa que uma chamada direta ao endpoint pode gastar chave de IA/API externa e, em alguns casos, alterar dados por `keywordId` sem checagem de dono/marca/sessao.

Recomendacao: exigir `getServerSession`, validar perfil/marca e confirmar que o registro pertence ao usuario/marca antes de qualquer update/insert.

4. `keywords_kgr` nao possui `marca_id`.

Na consulta real, a coluna `marca_id` nao existe em `keywords_kgr`. A separacao por marca depende de `lista_id` apontar para `listas_kgr`, que aponta para `marca_id`. Como todos os publicados atuais tem silo valido, a base esta ok agora. Mas o modelo fica mais fragil para seguranca multi-marca, auditoria e bloqueio em cascata.

Recomendacao: considerar adicionar `marca_id` em `keywords_kgr` ou garantir triggers/policies que validem a marca atraves de `lista_id` em toda operacao.

5. A extensao grava direto no Supabase com anon key publica.

Arquivo: `minerador-extensao/background.js`.

A anon key em extensao/browser e esperada ser publica, mas a seguranca depende 100% das policies de RLS do Supabase. A extensao grava keywords com `status: 'bruto'`, o que e bom, mas e essencial garantir que RLS nao permita alterar/deletar registros de outras marcas ou publicados.

6. O qualificador KGR usa fallback aleatorio.

Arquivo: `app/(workspace)/minerador/page.tsx`.

Quando a API de volume nao retorna dados, o codigo cria volume e allintitle simulados. Isso pode ser util em prototipo, mas nao e seguro para decisao real de SEO, validacao ou publicacao.

Recomendacao: marcar fallback como "estimado" ou bloquear publicacao/validacao quando o dado nao vier de fonte real.

7. Lint esta falhando.

O build passa, mas o lint falha com muitos erros. Isso nao quebra o app hoje, mas reduz confianca para evoluir com seguranca.

## O que esta certo hoje

- O app compila em producao.
- As rotas principais carregam.
- As keywords publicadas atuais estao com silo valido.
- Nao encontrei duplicata publicada na mesma combinacao keyword/silo.
- As operacoes principais do Minerador preservam `publicado` no front-end.
- O Arquiteto respeita published em movimentacoes e limpeza local.
- Next.js e React estao em versoes recentes.

## O que nao esta certo ainda

- A protecao de publicado nao esta no banco.
- Algumas APIs permitem uso sem sessao.
- Algumas APIs usam Service Role sem checagem de ownership por marca.
- Exclusao de marca ainda e hard delete.
- Nao ha testes automatizados garantindo que `publicado` nunca seja apagado.
- O lint falha.
- Ha vulnerabilidades moderadas em dependencias transitivas reportadas pelo `npm audit`.

## Plano recomendado antes de seguir com dados importantes

Prioridade 1:

- Criar triggers no Supabase para bloquear delete/update destrutivo de `publicado`.
- Bloquear exclusao de marca/silo quando existir qualquer keyword ou artigo publicado relacionado.
- Adicionar autenticacao e autorizacao em todas as rotas de API.
- Remover fallback de Service Role para anon key nas rotas server-side.

Prioridade 2:

- Criar testes automatizados: "nao apaga publicado", "nao rebaixa publicado", "nao move publicado de silo", "nao deleta marca com publicado".
- Criar rotina de backup/export antes de operacoes administrativas.
- Corrigir lint pelo menos nos arquivos de app/API, ignorando `docs/scratch` se forem apenas scripts temporarios.

Prioridade 3:

- Revisar modelo de dados para `marca_id` em keywords ou policies robustas via `lista_id`.
- Marcar dados de volume/allintitle como reais versus estimados.
- Atualizar dependencias quando houver caminho seguro sem downgrade/breaking change.

## Conclusao

O app esta operacional e a base atual de publicados esta limpa. Mas, pela importancia do projeto Adalba, ainda nao da para afirmar que "publicado nunca sera apagado em nenhuma instancia". Para essa garantia existir, ela precisa morar no banco e nas APIs, nao apenas na interface.

Minha recomendacao e fazer uma etapa curta de endurecimento de seguranca antes de continuar expandindo o fluxo: travas no Supabase, bloqueio de hard delete, autenticacao em APIs e testes de regressao para publicados.
