# SDD — Redator multiformato e porta MCP

**Estado:** fundação técnica implementada; a experiência de produto foi parcialmente supersedida pela revisão `sdd-redesign-redator-mcp-agencia-2026-09-18.md`. Validação funcional, conexão de um cliente externo e publicação permanecem gates separados. **Proprietário:** Redator. **Ambiente inicial:** `localhost:3000`.

## Contrato existente e decisão

O fluxo vigente é `Marca → Minerador → Arquiteto → Radar → Redator → Publicações`. O Radar entrega o dossiê canônico dentro de `ContentDocument` v2. `content_documents` já é canônico para o artigo e tem `UNIQUE (marca_id, article_id)`; `content_document_versions` guarda versões. O Planejador é histórico. O Redator não altera ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph nem a investigação congelada do Radar.

O artigo continua em `ContentDocument`. Roteiro de vídeo e carrossel são **entregáveis derivados**, vinculados ao mesmo documento e à mesma versão/hash do dossiê. Não fingem ser um segundo artigo nem exigem outro envio do Radar. Cada entregável tem conteúdo, status e `lock_version` próprios. Capa, respiros, quadros de storyboard e slides compartilham um catálogo de ativos: o prompt é separado do arquivo, com formato, objetivo, texto alternativo, origem, hash e estado. A imagem só existe na plataforma após importação/upload confirmado; a capacidade do chat de gerar imagem não implica acesso automático ao arquivo pelo MCP.

## Formatos e limites

| Ambiente | Dados editáveis | Saída |
| --- | --- | --- |
| Artigo | blocos Tiptap, metadados SEO, links, CTA, briefs visuais | `ContentDocument` existente |
| Roteiro | assunto, objetivo, público, duração, cenas, fala, instrução técnica e storyboard | `writer_deliverables.kind = video_script` |
| Carrossel | canal, objetivo, sequência de slides, título, texto, CTA e direção visual | `writer_deliverables.kind = carousel` |

Os três leem a mesma origem e suas limitações. Um roteiro ou carrossel pode adaptar um artigo, mas não declara como evidência uma hipótese editorial. Links e afirmações de produto/especialista carregam a referência recebida ou ficam marcados como pendentes. Nenhum formato é aprovado só porque um modelo o escreveu.

## Persistência e migração

Criar `writer_deliverables` e `writer_media_assets` com `marca_id`, FK ao documento, checks de formato/estado, índices e RLS de leitura conforme `canonical_actor_can_access_brand`. Escrita passa apenas por serviço autenticado que confirma `brandId`, permissão do Redator, vínculo real do documento, lock otimista e readback. Histórico de versões de entregáveis é append-only. Arquivos binários ficam em bucket privado com caminho por marca/documento/ativo; a tabela não armazena bytes nem URL pública permanente. A migração é aditiva; documentos v1/v2 e consumidores de Publicações permanecem legíveis. Nenhuma tabela anterior é alterada ou apagada. Rollback operacional: esconder os novos ambientes/MCP e preservar as linhas novas; rollback destrutivo exigiria exportação e decisão específica.

## Porta MCP e identidade

O MCP chama os serviços de domínio do Redator. O gateway é único, mas cada credencial é delegada por usuário, agência, marca, cliente, escopos e validade. A agência não entrega sua senha do ChatGPT/Claude à plataforma. O modelo opera na conta do usuário; o servidor não precisa de API de modelo para ler, propor e salvar. As ferramentas do primeiro corte são `get_writer_connection_profile`, `list_writer_documents`, `get_writer_brief`, `get_writer_document`, `get_writer_guardian`, `get_writer_deliverables`, `save_writer_draft`, `save_writer_deliverable`, `register_media_brief` e `attach_media_asset`. Escrita exige lock otimista, autorização atual e readback. Os salvamentos do entregável e do artigo são idempotentes pelo hash e criam versões na mesma transação quando há mudança. A idempotência explícita das operações de mídia permanece pendente. Token é guardado somente como hash; revogação e trilha de chamadas são obrigatórias. O cliente nunca recebe `service_role`, SQL livre nem acesso a outra marca. Aprovar, enviar a Publicações, publicar, excluir e reprocessar SERP ficam fora da delegação inicial.

Uma conexão remota com ChatGPT ou Claude exige endpoint HTTPS e fluxo de autenticação compatível com o cliente; `localhost:3000` isolado não é alcançável por esses serviços. Para ChatGPT, a documentação oficial exige descoberta do recurso protegido e OAuth 2.1 com Authorization Code + PKCE S256, audience e escopos. O token bearer implementado neste corte é apenas um instrumento de desenvolvimento local, não um OAuth pronto. A prova local usa cliente MCP de desenvolvimento antes de qualquer deploy. A possibilidade de gerar imagem dentro do chat e devolvê-la como arquivo depende do cliente; por isso a importação do arquivo é operação explícita e verificável.

**Auditoria de Auth de 2026-09-18:** o projeto Supabase respondeu HTTP 404 `feature_disabled` no endpoint oficial de descoberta OAuth. A rota preferida para o próximo gate é usar o OAuth Server 2.1 do próprio Supabase Auth, com consentimento explícito que associe `client_id`/ator/agência/marca e com o MCP verificando essas associações em cada chamada. Não implantar autorização própria paralela nem aceitar um JWT genérico como delegação da marca. Habilitar o recurso e homologar o consentimento são passos futuros de Auth; a fundação bearer local permanece isolada.

## Adendo de escrita atômica do artigo — 2026-09-18

O MCP usa agora `writer_save_article_draft`: a função bloqueia a linha, confere marca, documento, lock e campos protegidos, insere uma versão imutável e atualiza o estado corrente na mesma transação. Só `blocks`, `editorContent` e o estado operacional `escrevendo` podem mudar. O mesmo hash repetido não cria nova versão. O serviço faz readback do hash, lock, `current_version_id` e blocos antes de anunciar sucesso. A migration é aditiva e não altera o autosave humano existente. Uma fixture remota executada em `BEGIN`/`ROLLBACK` comprovou criação de versão, repetição idempotente e recusa de lock antigo; nenhum dado de teste permaneceu.

## Gates e provas

1. Schema e contratos de três formatos, leitura de documentos antigos e isolamento por marca.
2. UI dos três ambientes, com dossiê e pendências legíveis, salvamento remoto, F5 e segunda sessão.
3. Prompts visuais e upload privado com MIME/tamanho/hash, readback e referência no formato.
4. Delegação MCP, protocolo real, revogação, rate limit, auditoria, lock, idempotência e testes entre agências/marcas.
5. Conexão local por túnel seguro com a conta escolhida pelo usuário; sem deploy de produção até autorização própria.

Testes automatizados usam fixtures e não chamam provedores pagos. O teste de protocolo local cobre `initialize` e `tools/list` com uma delegação sintética, mas ainda não executa ferramentas autenticadas contra conteúdo remoto. A homologação de botões reais e da geração de imagem no chat é do usuário. Cada gate deve informar separadamente código, teste, migration aplicada, persistência remota, readback, UI manual e cliente MCP conectado. A presente autorização permite implementar o desenho; não transforma gates não executados em concluídos.
