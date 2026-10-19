# Estado atual — Publicações

## A entrega do Redator chega à Fila — 2026-10-18

Defeito 1 do inventário de botões (`docs/compartilhado/inventario-botoes-e-linha-2026-10-18.md`), decisão do dono "Só os defeitos agora". **Verificado no código e confirmado por teste. Ainda não validado na tela.**

- **Antes:** "Enviar a Publicações" criava o registro em rascunho (`draft`) e nada o levava a "pronto para exportar"; `PublicationRepository.importApproved` não tinha chamador; "Colocar na fila" nunca aparecia para artigo novo.
- **Agora (dentro da linha):** o mesmo núcleo do botão e da ferramenta MCP, `sendWriterToPublications` (`lib/server/writer-publication-handoff.ts`), chama o `importApproved` que já existia entre PERSISTIR e RELER. O documento já foi validado como aprovado, então o registro fica `ready_to_export` e aparece na aba "Fila" com "Colocar na fila".
- `importApproved` aceita os estados antes da exportação (`PUBLICATION_PRE_EXPORT_STATES`: rascunho, escrita, revisão, aprovado). Registro antigo parado em rascunho avança quando o artigo é enviado de novo no Redator, sem duplicar. Fila, exportado e publicado não voltam.
- O texto "Importe pelo seletor" (o seletor não existe mais) virou "Aguardando “Enviar a Publicações” no Redator", com InfoHint. "Colocar na fila" ganhou InfoHint.
- Nada de rota, botão ou estado novo; sem migration. Tutorial do "?" e catálogo MCP (`publicacoes.register`) atualizados.
- **Limite conhecido:** `syncDocumentStatus` (salvar o documento no Redator) ainda rebaixa o registro para o estado do documento; o caminho de volta é o mesmo "Enviar a Publicações".
- Teste: `tests/publicacoes-entrega-chega-a-fila-2026-10-18.test.mts` (núcleo inteiro contra PostgREST simulado; em `test:redator`).

## Todos os avisos no sino — 2026-10-18

Regra do dono: "estes e todos os avisos têm que estar dentro do sino" (`docs/compartilhado/sistema-visual.md` §24.2). **Verificado no código e confirmado por teste. Ainda não validado na tela.**

- A faixa do topo (âmbar, com cor fixa) saiu. O resultado vai ao sino com o tom: ação salva e manifesto exportado como Sucesso; fallback local e URL inválida como Atenção; falha como Erro.
- O rodapé da planilha (`OperationalDataGrid`, o mesmo do Radar) quebra linha em vez de rolar de lado.
- Guarda: `tests/avisos-no-sino-2026-10-18.test.mts`.

## Links a ativar quando um destino vai ao ar (F5 da SDD silo interligado) — 2026-10-14

Autorização do dono (2026-10-14): "pode concluir as pendências, vou testar depois". SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §6.5 e D10. **Nada mudou no código de Publicações** (sem arquivo de `modules/publicacoes`, sem rota, sem contrato, sem migration). **Verificado no código.**

- **O que vale para Publicações:** quando um artigo vai ao ar (o ArticleDNA passa a `published_protected` com a URL), os artigos do Silo que deveriam ligar para ele aparecem como **"Links a ativar"** no Radar (painel do artigo → "Links do Silo" → "Conferir links do Silo"; e no `<NN>-<papel>-<slug>-links.csv` da exportação por artigo), no MCP (`get_silo_links_update`) e no Redator (checklist: "destino no ar: ative o link"). A lista diz a âncora natural, a seção ou a trilha e a URL.
- **Sem edição da página:** a plataforma não altera a página publicada, a URL, o slug nem o canonical (AGENTS §11, invariante 28); quem inclui o link é a pessoa, no site dela. O `PublicationRecord` não muda.
- **Limite:** a lista fica no Radar; uma entrada própria na tela de Publicações ficou no backlog.

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
