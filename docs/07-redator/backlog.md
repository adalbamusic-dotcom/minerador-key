# Backlog — Redator

## Leitor de evidências — 2026-09-23

- [x] Fase 0: leituras estreitas.
- [x] Fase 1: leitor, 4 ferramentas MCP novas, pacote da IA interna, divergências e Guardião.
- [ ] **Aplicar a migration (usuário):** `npx supabase db query --linked -f supabase/migrations/20260923150000_writer_evidence_reader.sql`, depois `npx supabase migration repair --status applied 20260923150000 --linked`, depois a consulta de verificação comentada no fim do arquivo. Nunca `db push`.
- [ ] **Homologar:**
  - sessão real no ChatGPT: manifesto → fundamentos → fatias, e registrar uma divergência;
  - IA interna numa seção de documento do Radar;
  - Guardião com divergência bloqueante;
  - readback agregado dos bytes.
- [ ] Painel humano das divergências (status e bloqueante), mais o cache IndexedDB.
- [ ] Fase 2: dossiê fora do payload. Resolve o `before` de ~4,5 MB por salvamento e o teto de CPU da listagem (E1).
- [ ] `app/api/editorial/documents/route.ts`: a aprovação deve considerar as divergências bloqueantes (arquivo do Radar).
- [ ] `writer-publication-handoff` ainda lê o documento inteiro.
- [ ] Emenda à invariante 78: duas projeções de leitura do dossiê.

## E1, E2 e leitor de evidências — 2026-09-23

- [x] E1: listagem sem dossiê, detalhe ao abrir, duas garantias contra perda do dossiê.
- [x] E2: mesa lida só quando um consumidor pede.
- [ ] **Homologar:**
  - F5 no Redator: na aba Rede, `/api/editorial/workspace` traz `documents` com `bundleOmitted`, e `GET /api/editorial/documents` traz o documento inteiro;
  - editar e salvar um documento do Radar, e conferir no banco que o dossiê continua lá;
  - F5 em `/admin` e `/minerador`: nenhuma chamada a `/api/inteligencia` nem a `/api/editorial/workspace`.
- [ ] **Pré-requisito antes de ~5 documentos v2 com dossiê:** coluna gerada ou view da listagem (migration com SDD, aplicada pelo usuário), ou dossiê fora do payload (Fase 2 do leitor). O teste 22 fixa os 29 seletores.
- [ ] `lib/server/radar-writer-send.ts` ainda lê o documento inteiro (~4,5 MB) a cada envio do Radar.
- [ ] F5 com documento do Radar aberto ainda custa ~6,8 MB (mesa + detalhe) até existir cache do detalhe pelo hash.
- [ ] **Decidir** a [SDD do leitor de evidências](propostas/sdd-leitor-evidencias-redator-2026-09-23.md) (seção 11). A Fase 0 dela é localizada e entra logo: readback estreito do salvamento, Guardião e seed lendo só o que usam.
- [ ] A home da marca (`modules/marca/brand-page.tsx`) ainda lê a mesa inteira para 4 contadores (módulo Marca).

## Remoção do Planejador e retenção — estado em 2026-09-18

- **Concluído:** Corte 1 (navegação, estágios declarados, documentação), Corte 2
  (os quatro comandos fora do contrato e da rota, telas do Planejador somente
  leitura, Redator → Publicações direto com readback, "Importar do Radar"
  chamando `sendRadarToWriter`) e **M1 aplicada e verificada** — auditoria em
  `docs/00-produto/auditorias/m1-pos-aplicacao-2026-09-18.md`.
- **Próximo — pré-requisito da M2:** escrever e auditar o código do lifecycle de
  versões. `writer_save_deliverable` mantendo `current_version_id`, e o serviço
  que chama `writer_mark_*_superseded` **somente após readback confirmado**.
  Só então aplicar `20260918190100_m2_writer_version_lifecycle.sql`.
- **Depois — pré-requisito da M3:** o fluxo de mídia precisa respeitar
  `registrar sucessor SEM anchor → upload → hash → readback → substituição
  atômica → transferência do anchor`. O índice único parcial da M3 rejeita um
  segundo ativo com arquivo na mesma âncora, então o sucessor tem de nascer sem
  ela. Só então aplicar `20260918190200_m3_writer_media_anchor_lifecycle.sql`.
- **Por último:** a rota que dispara a purga. `pg_cron` e `pg_net` não existem
  neste projeto; enquanto a rota não existir, nada é apagado — e esse é o
  estado seguro.
- **Não fazer antes da ordem acima:** purge, scheduler ou alteração de mídia.
- **Dívida registrada, não bloqueante:** comentário órfão em
  `components/editorial-pipeline-context.tsx` (~258-278) aponta para a rota
  apagada `radar-planner-handoff`.

## MCP e multiformato — próximos gates após a fundação de 2026-09-18

### Corte de governança MCP da Agência — 2026-09-19

- **Concluído no código:** painel MCP aditivo em
  `/agencias/{agencyRef}/integracoes`, registro de provider/cliente por
  Agência, endpoint único do Redator, escopos `writer.read`,
  `writer.draft.write` e `writer.media.brief`, emissão de bearer por Marca e
  revogação administrativa com tenant check.
- **Migration preparada, não executada:**
  `20260919035046_agency_mcp_provider_catalog.sql` sem segredo ou backfill.
- **Próximo gate:** aplicar a migration remotamente, confirmar os quatro
  providers no catálogo, registrar um cliente e validar um token em HTTPS.
- **Limite atual:** o estado `pending` é intencional. Sem OAuth/HTTPS do
  ambiente remoto não se deve chamar a conexão de ChatGPT, Claude ou Gemini
  pronta. O bearer local continua uma credencial de desenvolvimento controlada
  por Agência/Marca.

### Fechamento da autoridade MCP — 2026-09-19

- **Concluído:** o catálogo remoto foi aplicado e confirmado com os quatro
  providers ativos (`chatgpt`, `claude`, `gemini`, `custom_mcp`).
- **Concluído:** emissão e revogação foram retiradas da rota mutável do
  Redator; ela responde `410 MCP_DELEGATION_AGENCY_ONLY` para `POST`/`DELETE`.
- **Concluído:** a Agência pode revogar a connection e consultar auditoria
  operacional recente por Marca.
- **Próximo gate:** configurar `MCP_PUBLIC_BASE_URL` em HTTPS e homologar um
  cliente externo com OAuth/discovery habilitado. Até lá, `pending` é o estado
  correto e o bearer é de desenvolvimento controlado pela Agência.
- **SDD proposta (2026-09-19):** `propostas/sdd-oauth-mcp-redator-2026-09-19.md`
  troca o bearer manual por OAuth 2.1 com o Supabase OAuth Server como
  servidor de autorização, tabela `writer_mcp_grants`, consentimento em
  `/oauth/consent` e metadata `.well-known`. Aguardando aprovação; nada
  implementado. Preflight de 2026-09-19: `oauthDiscovery = BLOCKED`.
- **Fase 1 entregue localmente (2026-09-19):** ver `estado-atual.md`. Próximos
  gates, na ordem: (0) usuário liga o OAuth Server no Supabase, path
  `/oauth/consent`, registro dinâmico e chave ES256; (2) M7 já aplicada
  em 2026-09-19 (post-verifier PASS); usuário define `MCP_OAUTH_ENABLED=true` e
  `MCP_ALLOW_REMOTE_BEARER=false` na Vercel e faz deploy; preflight deve
  passar com zero bloqueadores; (3) usuário homologa no ChatGPT e devolve o
  readback de `writer_mcp_grants` e `writer_mcp_call_events`; (4) painel da
  Agência entregue localmente em 2026-09-19 (estado OAuth medido, passo a
  passo ChatGPT/Claude, grants, revogação/reativação, bearer só com opt-in);
  falta validação manual do painel pelo usuário. Fase 3 homologada em
  2026-09-19 (ChatGPT → consentimento → grant → save com readback). Pendentes:
  `MCP_GRANT_REVOCATION` (revogar na Agência e ver `grant_required` no chat),
  chave ES256 no Supabase, remover o plugin duplicado no ChatGPT e validar o
  Claude com o mesmo servidor.
- **Riscos a confirmar na fase 3:** R1 escopos `writer.*` pedidos pelo
  ChatGPT; R2 parâmetro `resource` no `authorize` do Supabase. Plano B na SDD.

1. A leitura autenticada, o protocolo e a revogação já passaram no localhost com uma credencial temporária. Falta testar escrita de rascunho com consentimento, conflito de lock e readback, sem alterar o documento de homologação do usuário; usar uma fixture isolada ou uma cópia de teste própria.
2. Homologar roteiro, carrossel, prompts e upload com os botões reais em `localhost:3000`: salvar, F5, segunda sessão, origem/hash e mídia privada. A validação funcional da interface pertence ao usuário.
3. Habilitar o OAuth Server do projeto Supabase pelo gate operacional de Auth: a descoberta hoje devolve `feature_disabled`. Preparar consentimento por usuário/agência/marca, grant vinculado ao `client_id`, metadados de recurso protegido, audience/escopos e conexão HTTPS para ChatGPT; validar também o cliente Claude escolhido. Supabase Auth pode prover Authorization Code + PKCE S256, evitando criar servidor de autorização paralelo. O bearer local é apenas desenvolvimento. Não fazer deploy sem autorização.
4. Fechar idempotência explícita das operações de mídia, paginar o dossiê quando necessário e ampliar os resultados estruturados das ferramentas. O rascunho do artigo já grava estado e versão na mesma transação, com repetição idêntica sem nova versão; falta teste MCP autenticado de escrita ponta a ponta com fixture própria.
5. Vincular o briefing/arquivo de cada imagem ao campo `assetId` de cena/slide e ao artigo, com leitura privada na UI e validação de referências. Hoje o arquivo fica no catálogo do documento e o vínculo fino ainda é manual.

## Correção de produto — auditoria solicitada em 2026-09-18

1. Auditar e mover a administração do MCP para `/agencias/{agencyRef}/integracoes`: OAuth, consentimento, escopos, vínculos de marcas, revogação, auditoria e endpoint. A aba `Conectar IA` do Redator é superfície provisória de desenvolvimento e não é a arquitetura final.
2. Redesenhar Roteiro e Carrossel como documentos de produção realizados. Retirar `channel` da UI e deixar de tratar objetivo, público, duração, abertura, legenda e CTA como briefing obrigatório. Preservar dados legados por leitura compatível.
3. Integrar prompts e imagens ao artigo/bloco/cena/slide; permitir anexar, substituir, revisar e retocar com hash e readback.
4. Entregar ao módulo Publicações um pacote editorial de artigo, roteiro e carrossel, com metadados, links, imagens e versões. DOCX/PDF são read models de exportação, não nova autoridade.
5. Não tocar Minerador, Arquiteto, Radar, SERP ou DNA neste corte. Executar primeiro o prompt de auditoria em `docs/07-redator/prompts/auditoria-redator-mcp-2026-09-18.md` e só depois abrir implementação com mapa de arquivos e SDD.

## Agora
- **Objetivo:** validar manualmente a jornada do Redator com fixture e sem publicação externa.
  - **Módulo proprietário:** Redator
  - **Arquivos permitidos:** testes, `docs/07-redator/**` e validação manual do fluxo existente
  - **Arquivos proibidos:** migrations, CMS externo e publicação final
  - **Dependências:** sessão, migration vigente e fixture de ContentPlan aprovado
  - **Riscos:** confundir fallback local com persistência remota ou tratar proposta de IA como aprovação
  - **Critério de aceite:** abrir, editar por seção, analisar Guardião, salvar, recarregar, aprovar e importar de forma idempotente, sem perder conteúdo
  - **Testes obrigatórios:** `test:redator`, `test:editorial`, `test:operational`
## Próximo
- Exibir relatório do Guardião persistido junto a uma versão, quando houver decisão de persistência aprovada.
- Adicionar comentários server-side completos ao editor, aproveitando a tabela já existente.
## Depois
Nenhuma tarefa aprovada.
## Bloqueado
Validação integrada de persistência remota, provedor real e destino externo.
## Descartado
Tratar criação mock como documento aprovado.
## Concluídos recentes
- Auditoria documental inicial em 2026-07-20.
- SDD `redator-guardiao-e-publicacoes.md`, contratos de prompt, escrita por seção, melhoria de trecho, Guardião determinístico, gate server-side e testes direcionados em 2026-07-20.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/redator; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Entrada direta Radar → Redator — 2026-09-17

### Concluído nesta rodada
- União discriminada `ContentDocument` v1/v2; v2 sem `ContentPlan`, com
  `radarOrigin` e `importedContext`, e `.strict()` recusando `contentPlanRef`.
- Cinco consumidores narrados explicitamente para v1/v2 (prompts, writer-page,
  planner-page, planner-cockpit-workspace, professional-writer).
- `Publicações` com refs de plano nuláveis, `radarOrigin` e a invariante
  "todo registro declara alguma origem".
- Domínio de elegibilidade e montagem em `lib/redator/radar-import.ts`:
  6 códigos de recusa, 5 desfechos, idempotência por id determinístico,
  preservação de documento existente (inclusive v1 legado).
- Dossiê canônico inteiro dentro de `importedContext.dossier`, aditivo.
- Nomenclatura fechada: **"Enviar ao Redator"** é a autoridade única e mora no
  Radar. O Redator não ganhou segunda porta de importação; o botão do
  Planejador é caminho histórico. SDD alinhado.
- `tests/redator-entrada-radar.test.mts` 23/23 — as 3 falhas eram do fixture
  (`bundleId`, `keywordContext.resolution`) e da lista de chaves de
  `importedContext`, não do contrato.
- `tests/radar-to-writer-handoff-1.test.mts` 25/25.
- **Nenhuma migration:** o schema efetivo já permitia. Registrado no SDD.

## Agora — Radar → Redator
- **Objetivo:** homologar manualmente o envio Radar → Redator e fechar a
  interface de lote.
  - **Módulo proprietário:** Redator, com a ação de envio pertencendo ao Radar
  - **Arquivos permitidos:** `modules/redator/**`, `modules/radar/**` (apenas a
    barra de envio já existente), testes e `docs/07-redator/**`
  - **Arquivos proibidos:** migrations, `service_role` no cliente, CMS externo,
    publicação final, qualquer chamada paga de SERP ou IA
  - **Dependências:** sessão autenticada, pacote finalizado no Radar
  - **Riscos:** criar uma segunda autoridade de importação no Redator; declarar
    sucesso antes do readback; confundir fallback local com persistência remota
  - **Critério de aceite:** enviar, abrir no Redator, recarregar, conferir em
    segunda sessão o mesmo documento/artigo/versão de ArticleDNA/hash, repetir o
    envio sem duplicar, e lote misto (elegível, bloqueado, já enviado)
    preservando os sucessos parciais
  - **Testes obrigatórios:** `test:redator`, `test:editorial`, `test:operational`

### Pendente desta entrega
- Interface de lote com elegíveis, já enviados e bloqueados com motivo.
- Painel próprio de pendências no Redator (exibição; resolver continua no
  módulo proprietário).
- Estado vazio do Redator apontando para o Radar sem virar segundo botão.
- `brandRef` preservado nos links internos.
- Adaptador de `Publicações` no repositório lendo e gravando `radarOrigin` — o
  contrato já aceita, o repositório ainda não.
- Testes restantes do SDD: paridade com `resolveRadarCanonicalDossier`,
  falha de gravação/readback sem sucesso visual, concorrência, lote misto,
  acesso entre marcas, e documento v2 entrando em `Publicações`.
- **Homologação manual do readback remoto — é do usuário.**

## Bloqueado — Radar → Redator
- MCP / Agent Runtime / Delegation: SDD próprio, só depois do fluxo local verde.
  Começa por leitura e proposta, sem aprovação, publicação, exclusão, migration,
  `service_role` ou segredos, com autenticação por agência/marca e trilha de
  auditoria, e testado localmente antes de qualquer deploy.
- Teste `16b` acrescentado: o dossiê precisa viajar **preenchido**. Sem ele,
  trocar `radarWriterDossierOf(dossier)` por `null` passava nos 22 testes do
  contrato — o schema aceita null de propósito e a lista de chaves não muda.
  Mutante verificado: 23/22/1 com a troca, 23/23/0 sem ela.

## Concluído — continuidade real Radar → Redator — 2026-09-18
- Corrigido o defeito que tornava invisível um documento íntegro já gravado:
  data de coluna do PostgREST (`+00:00`) recusada por `z.string().datetime()`,
  derrubando a validação da mesa inteira assim que existiu o primeiro
  documento. `isoDate()` aplicada aos 9 campos de coluna; contratos aceitam
  deslocamento como rede. `tests/editorial-timestamp-postgrest.test.mts` 7/7.
- Entrada do Redator: caminho do Planejador demovido a acesso secundário, vazio
  do diálogo reescrito para nomear "Enviar ao Redator". Sem segunda autoridade.
- `tests/operational-flow.test.mts` teve a asserção de rótulo substituída por
  uma que trava também a **posição** — o caminho histórico existe, não está na
  barra principal, e a entrada atual é nomeada. Verificada por três casos
  sintéticos: passa no estado correto e recusa as duas regressões.

## Próximo corte de preparação para MCP — proposta, 2026-09-18

- ~~Exibir o dossiê canônico do Radar, suas evidências e pendências em leitura
  humana estruturada no Redator.~~ **Entregue em 2026-09-19
  (`REDATOR_DOSSIER_SURFACE_1`):** `radarFoundationsOf` é o adaptador; o
  painel lê dele nos três ambientes. As ferramentas MCP podem consumir a mesma
  projeção sem reescrever o contrato do Radar. Pendências de decisão
  (`pendingDecisions`) ainda não estão no painel.
- Corrigir a legibilidade da estação do Redator conforme o sistema visual
  compartilhado: há textos essenciais de 8–10 px na UI atual.
- Distinguir `carregando` de `vazio confirmado` na lista de rascunhos; hoje ela
  exibe "Nenhum rascunho" por instantes antes da hidratação remota.
- Homologar em segunda sessão e em lote a transferência Radar → Redator antes
  de abrir escrita delegada.
- Submeter `docs/compartilhado/sdd-proposta-mcp-redator-2026-09-18.md` à
  decisão global sobre identidade, delegação e gateway. Nenhum endpoint MCP ou
  migration está autorizado por este item do backlog.

## Egress — pendências do Redator — 2026-09-23

Ver SDD de [uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md).

1. **E1 — `ContentDocument` fora da carga da mesa** (estrutural, aguarda
   autorização). A carga fria da mesa traz os documentos completos, ~4,5 MB
   hoje. **Risco crítico:** o autosave reenvia o documento inteiro; editar uma
   cópia sem o bundle **apagaria o bundle no banco**. Exige fusão de
   `importedContext` no servidor ou carga do detalhe antes de editar.
2. **Readback de `save_writer_draft`** (`lib/server/writer-deliverables.ts`):
   estreitar para `payload->blocks` tira ~4,48 MB por chamada, mas perde o
   `ContentDocumentSchema.parse` do payload relido. Decidir se esse parse é
   garantia exigida.
