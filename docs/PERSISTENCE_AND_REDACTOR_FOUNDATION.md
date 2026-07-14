# Persistência e Fundação do Redator

## Auditoria inicial — 12/07/2026

### Supabase

- CLI local: `2.109.1`.
- Projeto vinculado confirmado por `supabase projects list`:
  `hjjlntdpdgvpnazdztqw`.
- Banco remoto: PostgreSQL 17, região `sa-east-1`.
- Histórico remoto de migrations: vazio para `0001` e `0002`.
- A `0001_protect_publicado.sql` está instalada manualmente no banco, mas não
  consta no histórico remoto; ela não pode ser reaplicada.
- O dump schema-only não pôde ser gerado: o CLI exige Docker e o executável
  `docker` não está instalado nesta máquina.
- Nenhuma migration será aplicada enquanto dump, reconciliação da `0001`, RLS
  e teste isolado não estiverem concluídos.

### Migration 0002 anterior

A proposta anterior não é aplicável como está porque:

- habilita RLS sem políticas funcionais;
- guarda papel e permissões dentro de convite/membro em JSON;
- não separa acesso delegado;
- não possui histórico append-only completo;
- não persiste ArticleDNA/SiloDNA aprovados;
- não cobre posição do editor, comentários ou versões do documento;
- usa cascatas incompatíveis com o nível de cautela exigido.

Ela será revisada localmente, sem aplicação remota.

### Código e Redator

- Workflow, versões aceitas, Radar, Planejador, documentos e publicações vivem
  no `EditorialPipelineProvider` e desaparecem após reload.
- Visualizações usam `localStorage`.
- Existe somente um endpoint de convite de desenvolvimento, sem persistência.
- O Redator atual renderiza blocos estáticos e informa que Tiptap está ausente.
- Os onze pacotes Tiptap esperados estão instalados na versão `3.27.3`.
- O teste operacional ainda espera Tiptap ausente e falha; será atualizado.
- TypeScript passa no estado inicial.

## Decisões de implementação

- Route Handlers serão a fronteira das mutações dos componentes client-side.
- Toda escrita seguirá: sessão → marca → permissão efetiva → estado atual →
  lock version → Zod → repository → evento append-only.
- Clientes Supabase server-side serão inicializados de forma lazy para o build
  do Next.js 16.
- O provider continuará com fallback local explícito quando as tabelas ainda
  não existirem; nunca mostrará “salvo no servidor” nesse estado.
- O Redator usará Tiptap diretamente na rota, sem modal ou tela intermediária.
- Conteúdo Tiptap e proveniência compacta permanecerão ligados ao mesmo
  ContentDocument.

## Resultado final

### Persistência preparada

- A `0002_operational_editorial_flow.sql` foi reescrita como proposta não
  aplicada. Ela separa papéis, permissões efetivas, convites, membros e acessos
  delegados; persiste artefatos versionados, eventos append-only, workflow,
  documentos, versões, estado individual do editor, comentários e publicações.
- Todas as tabelas novas possuem RLS. As funções de permissão usam a identidade
  textual normalizada da sessão, compatível com o login atual por e-mail.
- A revogação de privilégios é limitada às tabelas novas e não modifica as
  permissões das tabelas legadas do Minerador.
- Escritas passam por Route Handlers, autorização por marca e módulo, schemas
  Zod e repositories server-side. Workflow, documentos e publicações usam
  `lock_version` para detectar concorrência.
- O provider hidrata o workspace persistido quando as tabelas existirem. Até a
  aplicação manual da migration, o produto sinaliza `fallback local` e nunca
  afirma que salvou no servidor.

### Redator profissional entregue

- O Tiptap 3.27.3 está integrado com títulos H1–H4, parágrafo, marcas, listas,
  citação, tabela, links, alinhamento, undo/redo e blocos editoriais próprios.
- Há blocos para link interno, fonte externa, CTA, produto, comparação e
  briefing de imagem, além de comentários vinculados à seleção.
- O `ContentDocument` preserva o JSON do editor, os blocos estruturados e a
  proveniência compacta. O adaptador realiza conversão nos dois sentidos.
- O layout possui fundamentos e outline à esquerda, folha editável ao centro e
  Guardião/metadados à direita, com painéis recolhíveis e modo de tela cheia.
- Autosave tem debounce, hash, trava otimista, estados visíveis, criação de
  marcos versionados e recuperação local explícita se a persistência estiver
  indisponível.
- Slug, canonical e keyword principal ficam bloqueados na interface quando o
  registro está publicado. O servidor também revalida marca, permissão, estado
  e lock antes de aceitar alterações.

### Validações

- `npm test`: 63 testes aprovados; testes que escrevem no banco real continuam
  bloqueados sem `ALLOW_REAL_DB_TESTS=true`.
- `npx tsc --noEmit --incremental false`: aprovado.
- ESLint direcionado dos módulos novos e integrados: aprovado.
- `git diff --check`: aprovado.
- `npm run build`: aprovado no Next.js 16.2.10, com 33 páginas geradas.

### Limites mantidos

- Nenhuma migration foi aplicada, nenhum `db push` foi executado e nenhum dado
  remoto foi alterado.
- SERP real, similaridade externa, envio de convite, escrita por IA, exportação
  e publicação continuam fora desta entrega.
- Sem Docker não foi possível gerar o dump nem testar a migration em um banco
  local isolado. Por isso a `0002` permanece obrigatoriamente em revisão.
