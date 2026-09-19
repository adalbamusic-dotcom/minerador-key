# Prompt para o desenvolvedor — auditoria do Redator e MCP

Trabalhe no repositório local:

`C:\Users\scalb\Documentos\adalba-pro\minerador-key`

Faça uma auditoria de produto, contrato, código, banco, UI e fluxo MCP antes de implementar qualquer redesign. O módulo proprietário é o Redator para a produção e a Agência para a conexão MCP. Minerador, Arquiteto e Radar são consumidores preservados e não devem ser alterados neste corte.

## Contexto obrigatório

O Radar já entrega um pacote canônico com ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph, SERP, evidências, instruções e pendências. O Redator deve escrever e produzir:

- artigos;
- roteiros com storyboard;
- carrosséis;
- capa, imagens de respiro, imagens de cenas e imagens de slides;
- metadados e links;
- pacote final para Publicações e pós-produção.

O Planejador não pode ser um gate desse caminho. O conteúdo não será publicado diretamente em redes sociais pela plataforma e não precisa de campo `channel`.

## Achados já registrados

O código atual possui MCP local, delegação por marca, ferramentas de leitura/escrita, lock, hashes, versões, prompts e armazenamento privado. A aba do Redator chamada `Conectar IA` emite credencial local de desenvolvimento. As abas Roteiro e Carrossel exibem campos de formulário como Canal, Objetivo, Público, Duração, Legenda e Chamada final. Esses pontos precisam ser auditados contra a intenção acima.

## Perguntas que a auditoria precisa responder

1. Onde a conexão MCP é criada, armazenada, autorizada, revogada e auditada? A página da Agência consegue administrar isso sem depender do Redator?
2. A credencial está vinculada a agência, marca, ator, escopo, audience e consentimento corretos?
3. O endpoint local é claramente separado de uma conexão remota OAuth/HTTPS?
4. O Redator consegue abrir o pacote do Radar sem ContentPlan e sem refazer investigação?
5. Roteiro e carrossel são documentos produzidos ou ainda formulários de briefing?
6. Existe alguma regra ou schema que exige `channel`? Se existir, propor compatibilidade aditiva e remover a exigência da nova UI.
7. Cada cena e slide possui texto produzido, direção visual, prompt, ativo, alt text, hash e proveniência?
8. Uma imagem gerada fora da plataforma pode ser anexada, conferida, retocada/substituída e lida novamente com segurança?
9. Existe vínculo de ativo com artigo, cena ou slide, ou o catálogo ainda é solto?
10. Publicações aceita artigo, roteiro e carrossel sem ContentPlan e recebe texto, imagens, links, metadados e versões?
11. O envio a Publicações exige servidor → readback remoto → sucesso, sem criar estado local fantasma?
12. Aprovação de artefato, revisão de texto, prontidão para Publicações e publicação externa estão separados?
13. F5, segunda aba e segundo navegador mostram o mesmo conteúdo remoto?
14. Alguma mudança proposta tocaria Radar, Arquiteto, Minerador, ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph ou SERP? Se sim, pare e justifique a dependência.

## Arquivos e fontes para conferir

Leia antes de concluir: `docs/00-produto/invariantes.md`, `docs/00-produto/glossario.md`, `docs/00-produto/fluxo-oficial.md`, `docs/00-produto/pipeline-editorial-papeis-handoffs.md`, `docs/07-redator/spec.md`, `docs/07-redator/estado-atual.md`, `docs/07-redator/backlog.md`, `docs/07-redator/relatorio-mcp-e-revisao-de-produto-2026-09-18.md`, `docs/07-redator/propostas/sdd-redesign-redator-mcp-agencia-2026-09-18.md` e `docs/compartilhado/sistema-visual.md`.

Audite especialmente `modules/redator/writer-derived-environment.tsx`, `modules/redator/writer-mcp-connections.tsx`, `components/editorial/professional-writer.tsx`, `lib/redator/multiformat-contracts.ts`, `lib/server/writer-deliverables.ts`, `lib/server/writer-mcp-delegation.ts`, `app/api/mcp/redator/route.ts`, `app/api/redator/mcp-delegations/route.ts`, `app/api/redator/deliverables/route.ts`, `app/api/redator/media-upload/route.ts`, a página de Integrações da Agência e o adaptador de Publicações.

## Restrições

- Não fazer deploy, commit, push, migration ou limpeza remota nesta auditoria.
- Não apagar a aba ou tabelas existentes antes de apresentar compatibilidade e rollback.
- Não criar API de modelo ou provedor de imagem só para cumprir a interface.
- Não tratar prompt como imagem produzida.
- Não usar `localStorage` como fonte canônica.
- Não permitir que o MCP aprove, publique, apague ou modifique DNAs.
- Não usar o modelo para decidir autorização; o servidor deve validar tudo.
- Respeitar tokens, tipografia, espaçamento e estados do sistema visual. Não criar uma linguagem visual nova.

## Entrega esperada

Produza um relatório com:

1. mapa atual Agência → conexão → MCP → Redator → Publicações;
2. mapa atual de tabelas, rotas, schemas, migrations e consumidores;
3. divergências entre comportamento atual e destino descrito aqui;
4. classificação de cada divergência: código, contrato, banco, UI, auth, readback ou documentação;
5. proposta de correção mínima e aditiva, sem tocar os módulos anteriores;
6. migrations necessárias, ou declaração fundamentada de que nenhuma é necessária;
7. riscos, compatibilidade, rollback e testes;
8. critérios de homologação manual do usuário;
9. lista exata de arquivos que o dev pretende alterar.

Não declare nada como concluído apenas porque TypeScript, build ou teste unitário passaram. Separe `VERIFICADO_NO_CODIGO`, `CONFIRMADO_POR_TESTE`, `PERSISTENCIA_REMOTA`, `VALIDADO_MANUALMENTE`, `PENDENTE` e `BLOQUEADO`.
