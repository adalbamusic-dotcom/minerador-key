# Estado atual — Publicações

## Assunto legível nas linhas — 2026-10-13

Pedido do dono (2026-10-13): "coloca sempre o assunto no painel para que seja legível". Só a keyword principal não identificava o artigo.

**Verificado no código e confirmado por teste. Validado manualmente: não (homologação é do dono).** Sem migration, sem escrita remota, sem SQL, sem chamada paga.

- Componente compartilhado `components/editorial/article-subject-line.tsx`: `ArticleSubjectLine` (rótulo "Assunto · " em `text-text-muted`, frase inteira em `text-foreground`, 14 px, quebra de linha, `title` com a frase; sem frase, "Sem Assunto" em `text-text-muted`, ou nada com `showEmpty={false}`) e `articleSubjectPhraseOf` (lê `subject.phrase` do ArticleDNA). Só lê: não busca, não grava.
- `WorkflowImportDialog` (`components/editorial/workflow-status.tsx`) e `ImportPanel` (`components/editorial/operational-screen-shared.tsx`) ganharam `subjectOf` opcional (aditivo): com ele a linha abre com o Assunto e a busca casa com a frase; sem ele, o render é o de sempre (consumidores preservados: Arquiteto, ImportPanel sem `subjectOf`).
- Fonte: o ArticleDNA da mesa (`pipeline.articleVersions[row.articleId].payload.subject.phrase`), já em memória.
- Onde aparece: coluna "Conteúdo" da grade (Fila, Publicados, Atualizações) e cada linha da Biblioteca, acima do título.
- Decisão desta área: só aparece quando HÁ Assunto (`showEmpty={false}`). Publicados antigos e itens do histórico (Planejador) não ganham "Sem Assunto", para não poluir a lista.
- Arquivo: `modules/publicacoes/publications-workspace.tsx`. Teste: `tests/redator-assunto-legivel.test.mts` (ligações). O CSV de Publicações não mudou.

## F6 · Etiqueta de cor e listas por grupo — 2026-10-12

**Verificado no código e confirmado por teste. Validado manualmente: não.** SDD
`docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §6.4 e §9.1-A (adendo F6 no §18.1). Sem mudança de
contrato, sem migration, sem escrita.

- **Etiqueta na barra global:** a área `publicacoes` entrou em `EDITORIAL_GROUP_AREAS`; o ícone de etiqueta aparece
  ao lado do sino, com a escolha DESTA área (lembrada por marca e área; `?grupo=<cor>` na URL de Publicações).
- **Listas** (`modules/publicacoes/publications-workspace.tsx`): a Biblioteca (por cima do eixo de entrega, os dois
  filtros juntos) e as abas Fila, Publicados e Atualizações (`rowFilter` do grid) mostram só os conteúdos cujo artigo
  está no grupo escolhido; cada linha ganha a faixa de 4 px e a etiqueta (bolinha + nome) — na planilha, embaixo do
  título. O "Sem grupo" do menu conta conteúdos da Biblioteca. Vazio pelo recorte, a Biblioteca diz "Nenhum conteúdo
  na cor X nesta lista.".
- **Não atrasa o carregamento:** o grupo dos artigos só é lido depois da mesa (ou na hora, com uma cor escolhida),
  pelo mesmo `useEditorialGroups`. Só mostra e filtra; registro, exportação, URL e reedição não mudam.
- **Testes:** `tests/radar-grupos-f6-entregaveis.test.mts` (estrutural) e `tests/radar-grupos-etiqueta-topbar.test.mts`
  (topbar em DOM). Contagens no adendo F6 da SDD.

## Auditoria de 2026-07-20
- **Última auditoria:** 2026-07-20.
- **Funcionando:** importação idempotente de aprovados, biblioteca, fila explícita, exportação local real em Markdown/JSON/CSV, registro manual de destino/URL, histórico operacional, solicitação de atualização e reedição. **Verificado no código e confirmado por testes direcionados.**
- **Protegido:** item publicado permanece em `published` durante reedição; slug, vínculo de documento/plano, unidade e URL final são protegidos server-side. A sincronização de autosave também não rebaixa um publicado. **Verificado no código.**
- **Artigos e SiloPages:** o `unitType` é preservado no registro, planilha e exportações. **Confirmado por teste.**
- **Parcial:** a importação do primeiro ContentDocument real e a jornada completa no navegador ainda não foram validadas manualmente.
- **Local:** fallback de workspace por marca e download de arquivos no navegador.
- **Persistido:** `publication_records` e `PublicationRepository` existentes recebem metadados aditivos no payload; remoto depende da migration operacional aplicada e ainda não foi verificado manualmente.
- **Simulado:** `PublicationRecordSchema` do bundle mock continua apenas demonstrativo e não é fonte de persistência.
- **Bloqueado:** publicação real em CMS, ingestão do arquivo exportado pelo CMS e validação manual da URL externa.
- **Regressões/bugs:** nenhum confirmado nos testes executados nesta tarefa.
- **Arquivos centrais:** `components/publicacoes/publications-workspace.tsx`, `lib/publicacoes/domain.ts`, `lib/publicacoes/export.ts`, `app/api/publicacoes/route.ts`, `lib/server/editorial-repositories.ts`.
- **Testes:** `tests/publicacoes-domain.test.mts`, `test:operational`, `test:editorial`, `test:redator`, TypeScript e lint direcionados.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** preparação, exportação e registro manual estão implementados; CMS externo, persistência remota confirmada e publicação pública continuam fora do escopo.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/publicacoes; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/publicacoes`; publicação manual e identidade publicada permanecem inalteradas.
