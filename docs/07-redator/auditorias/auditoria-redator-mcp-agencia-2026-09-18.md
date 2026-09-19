# Auditoria — Redator, MCP e fronteira da Agência

**Data:** 2026-09-18
**Escopo:** auditoria de produto, contrato, código, banco, UI, auth e readback. **Nenhum código, migration, UI ou dado foi alterado nesta rodada.**
**Módulo proprietário:** Redator (produção) e Agência (conexão MCP).
**Preservados e não tocados:** Minerador, Arquiteto, Radar, ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph, SERP.
**Branch auditada:** `resgate/trabalho-nao-commitado-2026-09-05`.

## 0. Como ler as marcações

| Marcação | Significado nesta auditoria |
| --- | --- |
| `VERIFICADO_NO_CODIGO` | li o arquivo e a linha citada neste checkout |
| `CONFIRMADO_POR_TESTE` | executei a suíte nesta rodada e ela passou |
| `PERSISTENCIA_REMOTA` | exigiria leitura do Supabase remoto; **não executei nenhuma** |
| `VALIDADO_MANUALMENTE` | homologação do usuário no navegador; **nenhuma nesta rodada** |
| `PENDENTE` | não implementado / não provado |
| `BLOQUEADO` | depende de gate externo |

Testes executados nesta rodada:

- `pnpm run test:redator` → **28/28 pass, 0 fail**. `CONFIRMADO_POR_TESTE`
- `pnpm run test:redator:mcp` → **2/2 pass, 0 fail**. `CONFIRMADO_POR_TESTE`

Nada aqui é declarado concluído por TypeScript, build ou teste unitário.

---

## 1. Mapa atual — Agência → conexão → MCP → Redator → Publicações

```text
[ Agência /agencias/{ref}/integracoes ]
        │  modules/conta/agency-integrations-page.tsx
        │  lib/server/integration-governance.ts
        │  → conhece UMA capability: "dataforseo.allintitle"
        ╳  NÃO conhece MCP, credencial, escopo do Redator, OAuth nem auditoria
        (fronteira inexistente)

[ Redator /{brandRef}/redator — aba "Conectar IA" ]
        │  modules/redator/writer-mcp-connections.tsx
        │  POST/GET/DELETE app/api/redator/mcp-delegations/route.ts
        │  lib/server/writer-mcp-delegation.ts
        ├─ emite bearer `mk_mcp_<base64url>` (hash sha256 no banco, valor mostrado 1x)
        ├─ vincula agency_id + marca_id + actor_user_id + scopes + expires_at (1..30d)
        └─ lista/revoga FILTRANDO POR actor_user_id (só o próprio emissor enxerga)
                    │
                    ▼
[ MCP Streamable HTTP  app/api/mcp/redator/route.ts ]
        ├─ guarda de Host: MCP_ALLOWED_HOSTS ?? ["localhost:3000","127.0.0.1:3000"]
        ├─ recusa requisição com header Origin (navegador não é cliente MCP)
        ├─ verifyWriterMcpBearer → hash, revogação, expiração, perfil canônico,
        │   requireAgencyAccessToBrand, comparação de agency_id, rate limit 60/min
        ├─ por chamada: escopo + assertEditorialPermission(view|edit) + auditoria
        │   em writer_mcp_call_events (attempt → success|code)
        ├─ leitura : profile, list, document, brief(dossiê), guardian, deliverables
        └─ escrita : save_writer_draft, save_writer_deliverable,
                     register_media_brief, attach_media_asset
           (não existe ferramenta de aprovar, publicar, excluir ou alterar DNA)
                    │
                    ▼
[ Persistência ]
   content_documents            ← writer_save_article_draft (RPC, atômica, lock+versão)
   writer_deliverables + _versions ← writer_save_deliverable (RPC, atômica)
   writer_media_assets          ← INSERT prompt_ready → UPDATE uploaded
   bucket privado "writer-media" ← upload + download + conferência de hash
                    │
                    ▼
[ Publicações ]
   ╳ NÃO RECEBE nada vindo do caminho Radar → Redator.
   publication_records só nasce em workflow "start_writing", que exige
   ContentPlan aprovado no Planejador.
```

**Leitura do mapa:** a fundação técnica do MCP está de pé e é séria. A fronteira de produto não está: a Agência não administra nada, e Publicações continua atrás do Planejador.

---

## 2. Mapa atual de tabelas, rotas, schemas, migrations e consumidores

### 2.1 Migrations (arquivos neste checkout — `VERIFICADO_NO_CODIGO`)

| Migration | Cria | Observação |
| --- | --- | --- |
| `20260918050959_writer_multiformat_mcp_foundation.sql` | `writer_deliverables`, `writer_deliverable_versions`, `writer_media_assets`, bucket privado `writer-media`, RLS, triggers | `UNIQUE (document_id, kind)`; FK composta `(document_id, marca_id)`; CHECK que impede `storage_path` sem `file_hash` |
| `20260918051757_writer_mcp_delegations.sql` | `writer_mcp_delegations`, `writer_mcp_call_events` | só hash do token; eventos append-only por trigger |
| `20260918053018_writer_deliverable_atomic_save.sql` | `writer_save_deliverable()` | `SECURITY DEFINER`, grant só para `service_role` |
| `20260918061000_writer_mcp_atomic_article_draft.sql` | `writer_save_article_draft()` | escopo travado: só `blocks`, `editorContent`, `status`; recusa documento aprovado; hash igual = `unchanged`, sem versão nova |

> `PERSISTENCIA_REMOTA` — **não consultei o Supabase nesta rodada.** O registro anterior (`docs/07-redator/estado-atual.md`) afirma que as quatro migrations foram aplicadas no projeto `hjjlntdpdgvpnazdztqw`. Trato isso como registro herdado, não como verificação minha.

### 2.2 Rotas

| Rota | Método | Autorização | Consumidor |
| --- | --- | --- | --- |
| `app/api/mcp/redator/route.ts` | GET/POST/DELETE | bearer delegado + escopo + `assertEditorialPermission` por chamada | cliente MCP externo |
| `app/api/redator/mcp-delegations/route.ts` | GET/POST/DELETE | sessão canônica + `requireAgencyAccessToBrand` | aba `Conectar IA` |
| `app/api/redator/deliverables/route.ts` | GET/PUT/POST | sessão + `redator:view|edit` | `WriterDerivedEnvironment` |
| `app/api/redator/media-upload/route.ts` | POST (multipart, ≤10 MB) | sessão + `redator:edit` | `WriterDerivedEnvironment` |
| `app/api/editorial/radar-writer-handoff/route.ts` | POST | — | Radar (autoridade única do envio) |
| `app/api/editorial/workflow/route.ts` | POST | por ação | `start_writing`, `import_publications` |
| `app/api/agencies/[agencyRef]/integrations/route.ts` | — | — | **não tem nada de MCP** |

### 2.3 Schemas

- `lib/redator/multiformat-contracts.ts`: `VideoScriptPayloadSchema`, `CarouselPayloadSchema` (`.strict()`, união discriminada por `kind`), `WriterMediaBriefSchema`, `newWriterDeliverable()`.
- `lib/arquiteto/contracts.ts`: `ContentDocumentSchema` (v1/v2), `ContentBlockSchema`, `EditorialUnitTypeSchema` — **arquivo do Arquiteto**.
- `lib/editorial/operational-flow.ts`: `OperationalPublicationSchema` com `plannerItemId`/`contentPlanVersionId` nuláveis + `radarOrigin` + invariante "declare alguma origem".
- `lib/publicacoes/contracts.ts`: ações `queue | record_export | publish | request_update | reedit`.

### 2.4 Estado de versionamento — achado de processo

`git status` mostra que **toda a fundação MCP/multiformato está untracked**: `lib/redator/multiformat-contracts.ts`, `lib/server/writer-deliverables.ts`, `lib/server/writer-mcp-delegation.ts`, `app/api/mcp/`, `app/api/redator/deliverables|mcp-delegations|media-upload`, `modules/redator/writer-*.tsx`, as 4 migrations e 7 arquivos de teste. `VERIFICADO_NO_CODIGO`

Não commitei nada (a restrição proíbe). Registro como risco: arquivo untracked não tem rede de recuperação.

---

## 3. Respostas às 14 perguntas

**1. Onde a conexão MCP é criada, armazenada, autorizada, revogada e auditada? A Agência administra sem depender do Redator?**
Criada e revogada em `app/api/redator/mcp-delegations/route.ts`, a partir da aba `Conectar IA` do Redator. Armazenada em `writer_mcp_delegations` (só o hash). Autorizada a cada chamada por `verifyWriterMcpBearer` + `assertEditorialPermission`. Auditada em `writer_mcp_call_events`.
**A Agência NÃO administra.** `lib/server/integration-governance.ts` modela exclusivamente a capability `dataforseo.allintitle`; não há tipo, rota, tabela nem painel de MCP na Agência. Além disso, `listWriterMcpDelegations` e `revokeWriterMcpDelegation` filtram por `.eq("actor_user_id", profile.userId)` — **um admin de agência não enxerga nem revoga a credencial emitida por outro membro**, e nenhuma tela lê `writer_mcp_call_events`. `VERIFICADO_NO_CODIGO`

**2. A credencial está vinculada a agência, marca, ator, escopo, audience e consentimento corretos?**
Parcialmente. Vinculada corretamente a **agência, marca, ator, escopos e expiração**; a verificação ainda compara `access.agency.agencyId !== data.agency_id` e recusa se a agência mudou (`agency_changed`, 403). `VERIFICADO_NO_CODIGO`
Faltam: **audience**, **consentimento registrado**, **identidade verificável do cliente** (`client_name` é texto livre digitado pelo humano — não prova que é o ChatGPT) e vínculo multi-marca (1 credencial = 1 marca). `PENDENTE`

**3. O endpoint local é claramente separado de uma conexão remota OAuth/HTTPS?**
Não com clareza suficiente. A única separação é a allowlist de `Host` com default local. **Definir `MCP_ALLOWED_HOSTS` com o host de produção transforma, sozinho, o endpoint em superfície pública autenticada por bearer de até 30 dias, sem OAuth, sem consentimento e sem audience.** Não existe `/.well-known/oauth-protected-resource`, o header `WWW-Authenticate` não carrega `resource_metadata`, e o banco não tem coluna que marque a credencial como "desenvolvimento". `VERIFICADO_NO_CODIGO`. O gate do OAuth Server do Supabase permanece `BLOQUEADO`.

**4. O Redator abre o pacote do Radar sem ContentPlan e sem refazer investigação?**
**Sim.** `ContentDocument` é união por `schemaVersion`; v2 carrega `radarOrigin` + `importedContext.dossier` e o `.strict()` recusa `contentPlanRef`. O MCP entrega o dossiê inteiro em `get_writer_brief`, com `warning` explícito quando o dossiê está ausente, em vez de inferir. `VERIFICADO_NO_CODIGO` + `CONFIRMADO_POR_TESTE` (`redator-entrada-radar`, casos 16b/17/19).

**5. Roteiro e carrossel são documentos produzidos ou ainda formulários de briefing?**
**Ainda formulários.** `modules/redator/writer-derived-environment.tsx:152-160` abre com Título, **Canal**, Objetivo, Público, Duração, Abertura, Legenda e Chamada final. Cenas e slides nascem vazios por "Adicionar cena/slide" (linhas 61-70). Não há representação do conteúdo realizado, nem estado de revisão por bloco. `VERIFICADO_NO_CODIGO`

**6. Existe regra ou schema que exige `channel`?**
**Sim, no schema.** `lib/redator/multiformat-contracts.ts:49` e `:60` declaram `channel: z.string().max(300)` dentro de objetos `.strict()`. Como não há `.optional()` nem `.default()`, **omitir a chave falha a validação** — a UI nova não pode simplesmente parar de mandar. `newWriterDeliverable` grava `channel: ""` (linhas 85-86). O banco não tem coluna `channel`; ele vive dentro do `payload` jsonb, e a RPC não o inspeciona. `VERIFICADO_NO_CODIGO`
Compatibilidade aditiva proposta em §5 (D6).

**7. Cada cena e slide tem texto, direção visual, prompt, ativo, alt text, hash e proveniência?**
No contrato, quase tudo: `VideoSceneSchema` tem narração, direção visual, direção técnica, duração, `storyboard` (`VisualBriefSchema`) e `sourceRefs`; `CarouselSlideSchema` tem heading, body, `visual` e `sourceRefs`. O hash é do entregável inteiro (`content_hash`), não por cena.
**Na prática, o ativo não existe:** `VisualBriefSchema.assetId` **nunca é escrito por nenhum código** — a única ocorrência fora do schema é o `fallback` com `assetId: null` em `writer-derived-environment.tsx:80`. `VERIFICADO_NO_CODIGO`

**8. Imagem gerada fora pode ser anexada, conferida, retocada/substituída e lida de novo com segurança?**
**Anexada e conferida: sim.** `uploadWriterMediaAsset` valida magic bytes (PNG/JPEG/WebP), tamanho, faz upload, **baixa de volta, compara sha256**, atualiza a linha com `.eq("status","prompt_ready")` e remove o arquivo se qualquer etapa falhar. `VERIFICADO_NO_CODIGO`
**Lida de novo: não.** O bucket é privado e **não existe nenhuma rota de signed URL ou proxy** — `createSignedUrl` não aparece em lugar nenhum do projeto. A UI só consegue escrever "Arquivo anexado". O humano não vê a imagem que precisa conferir.
**Retocada/substituída: não.** Segundo upload recebe `asset_already_uploaded` (409) e não há rota de substituição, remoção ou revisão. O status `reviewed` existe no CHECK do banco e é inalcançável pelo código. `VERIFICADO_NO_CODIGO`

**9. Existe vínculo de ativo com artigo, cena ou slide, ou o catálogo é solto?**
**Solto.** `writer_media_assets` tem `document_id` e `deliverable_id` (nulável) e **nenhuma coluna de cena, slide ou bloco**. `registerWriterMediaBrief` não recebe esse identificador; `WriterMediaBriefSchema` é `.strict()` e não tem o campo. O caminho inverso (`VisualBrief.assetId`) existe no contrato e nunca é preenchido. Para a capa e os respiros do artigo é pior: o bloco `image_brief` de `ContentBlockSchema` (`lib/arquiteto/contracts.ts:1702`) tem `objective`, `format`, `requiredElements`, `avoid` — e nenhum `assetId`. `VERIFICADO_NO_CODIGO`

**10. Publicações aceita artigo, roteiro e carrossel sem ContentPlan, com texto, imagens, links, metadados e versões?**
**Não. Esta é a divergência mais grave.**
- `publication_records` só é criado em `app/api/editorial/workflow/route.ts:106-114`, ação `start_writing`, que recusa qualquer coisa que não seja `ContentPlan` aprovado no Planejador. `createPublicationDraft` tem assinatura `(item: PlannerItem, plan, document, article)` e é chamada em um único lugar, dentro de `startWriting` (`components/editorial-pipeline-context.tsx:1206`). Um documento v2 de origem Radar **nunca** gera registro de publicação — logo, nunca aparece em "Importar aprovados". O contrato (`radarOrigin` nulável, invariante de origem) já está pronto; **falta o código que grava**. `VERIFICADO_NO_CODIGO` + `CONFIRMADO_POR_TESTE` (o caso 19 prova o contrato, não o caminho).
- Roteiro e carrossel não têm caminho nenhum: `EditorialUnitTypeSchema` é `["article","silo_page"]` e `OperationalPublication` referencia `documentId`, não `deliverableId`.
- A exportação (`lib/publicacoes/export.ts`) serializa apenas `publication` + `document` em markdown/json/csv — **sem imagens, sem entregáveis, sem prompts, sem proveniência de mídia**. Não há DOCX/PDF.

**11. O envio a Publicações exige servidor → readback remoto → sucesso, sem estado local fantasma?**
**Não.** `importApprovedToPublications` (`components/editorial-pipeline-context.tsx:1213-1218`) atualiza o workspace local **primeiro** e dispara `void sendWorkflowCommand(...)` sem aguardar. Em `sendWorkflowCommand`, a verificação de readback (`readbackConfirmed !== true`) roda **só para `command.action === "import_radar"`**; todas as outras ações retornam `{ok:true}` no primeiro `response.ok`. Se o servidor recusar, a tela já mostra `ready_to_export`. `VERIFICADO_NO_CODIGO`
Nota de contraste, a favor do código atual: as escritas do MCP e dos entregáveis **fazem** readback rigoroso (`readback_mismatch` compara hash, lock, `current_version_id` e `canonicalJson(blocks)`). A regra existe no lugar novo e falta no caminho antigo.

**12. Aprovação de artefato, revisão de texto, prontidão para Publicações e publicação externa estão separados?**
**No artigo, sim:** `status` do documento (`escrevendo`/`em_revisao`/`aprovado`), Guardião que analisa e não aprova (`requestStatus` bloqueia aprovação com `blockingCount`), estado da publicação (`approved` → `ready_to_export`) e `publish` com `destinationUrl` como ação distinta. `VERIFICADO_NO_CODIGO`
**Nos entregáveis, não existe eixo nenhum:** `writer_deliverables.status` aceita `draft|in_review|approved`, mas `writer_save_deliverable` nunca escreve a coluna — toda linha nasce e morre `draft`. A única leitura de `approved` é a guarda de imutabilidade, inalcançável. `VERIFICADO_NO_CODIGO`

**13. F5, segunda aba e segundo navegador mostram o mesmo conteúdo remoto?**
Para roteiro/carrossel/mídia: o ambiente lê do servidor a cada montagem com `cache: "no-store"` e recarrega após cada gravação — o desenho é remoto-canônico e não usa `localStorage`. `VERIFICADO_NO_CODIGO`
Para o artigo: o `localStorage` é recuperação, não fonte — `lib/editorial/local-recovery.ts` distingue `remoteConfirmed` true/false justamente para não confundir os dois. `VERIFICADO_NO_CODIGO`
**Segunda aba e segundo navegador: `PENDENTE` / `VALIDADO_MANUALMENTE` = não.** É homologação do usuário e não foi feita.

**14. Alguma mudança proposta tocaria Radar, Arquiteto, Minerador, ArticleDNA, KeywordDNA, SiloDNA, InternalLinkGraph ou SERP?**
**Na proposta de §5, não — e isso exigiu evitar dois atalhos.** Declaro os dois, porque são as tentações reais:

- **Atalho recusado 1:** ligar capa/respiro ao bloco acrescentando `assetId` ao bloco `image_brief` de `ContentBlockSchema`. Esse contrato mora em `lib/arquiteto/contracts.ts` e é lido por Arquiteto, Planejador, Radar e Publicações. **Rejeitado.** A proposta põe a âncora do lado do Redator (coluna em `writer_media_assets`), que é tabela do Redator.
- **Atalho recusado 2:** estender `EditorialUnitTypeSchema` para `["article","silo_page","video_script","carousel"]`. Esse enum também é do Arquiteto e tem 15 arquivos consumidores, incluindo `lib/arquiteto/unit-strategy.ts`, `article-dna-projection.ts` e o Planejador. **Rejeitado.** A proposta adiciona uma dimensão separada de entregável no pacote de Publicações, sem mexer no tipo de unidade editorial.

Com essas duas escolhas, **nenhum arquivo de Minerador, Arquiteto ou Radar entra na lista de §9.**

---

## 4. Divergências classificadas

| # | Divergência | Classe | Evidência |
| --- | --- | --- | --- |
| D1 | Emissão/administração de MCP vive no Redator; Agência não conhece MCP | UI + código + auth | `writer-mcp-connections.tsx`, `integration-governance.ts` |
| D2 | Delegação é visível/revogável só pelo próprio emissor (`actor_user_id`) | auth + código | `writer-mcp-delegation.ts:37,46` |
| D3 | `writer_mcp_call_events` gravado e nunca lido por rota ou tela | UI + código | sem consumidor no repo |
| D4 | Falta `client_id` verificável, audience e consentimento registrado | contrato + banco | `writer_mcp_delegations` |
| D5 | Separação local/remoto é só allowlist de Host; um env var publica o bearer | auth | `app/api/mcp/redator/route.ts:132` |
| D6 | `channel` é chave obrigatória em schema `.strict()` e campo visível | contrato + UI | `multiformat-contracts.ts:49,60`; `writer-derived-environment.tsx:154` |
| D7 | Roteiro/carrossel abrem como briefing vazio, não como documento produzido | UI | `writer-derived-environment.tsx:152-178` |
| D8 | `VisualBrief.assetId` nunca escrito; sem coluna de cena/slide/bloco na mídia | código + banco + UI | grep de `assetId`; migration `...050959` |
| D9 | Imagem anexada não pode ser exibida: bucket privado sem signed URL | código | nenhum `createSignedUrl` no repo |
| D10 | Sem substituir/retocar/remover; status `reviewed` inalcançável | código + UI | `writer-deliverables.ts:144` |
| D11 | Bloco `image_brief` do artigo não tem vínculo com ativo | contrato (Arquiteto) | `lib/arquiteto/contracts.ts:1702` |
| D12 | **Publicações só nasce pelo Planejador; documento v2 do Radar nunca chega** | código | `workflow/route.ts:106-114`; `editorial-pipeline-context.tsx:1206` |
| D13 | Publicações não modela roteiro/carrossel; export sem imagens/versões/proveniência | contrato + código | `operational-flow.ts:117`; `lib/publicacoes/export.ts` |
| D14 | `import_publications` grava estado local antes do servidor, sem readback | readback | `editorial-pipeline-context.tsx:1213`; `sendWorkflowCommand` |
| D15 | Entregável nunca sai de `draft`; sem eixo de revisão/aprovação | código | `...053018_writer_deliverable_atomic_save.sql` |
| D16 | `UNIQUE (document_id, kind)` limita a 1 roteiro e 1 carrossel por artigo | banco (decisão de produto) | migration `...050959:24` |
| D17 | Fundação MCP/multiformato inteira untracked no git (23 arquivos + 4 migrations) | documentação/processo | `git status` |
| D18 | `professional-writer.tsx` com 40 entradas de dívida no baseline visual | UI | `scripts/visual-system-baseline.json:24` |

Os arquivos novos (`writer-derived-environment.tsx`, `writer-mcp-connections.tsx`) **usam os tokens do sistema visual** (`bg-canvas`, `border-border`, `text-text-primary`, `action-accent`) e não aparecem no baseline de dívida. A dívida está no editor antigo, não no que foi acrescentado. `VERIFICADO_NO_CODIGO`

---

## 5. Proposta de correção mínima e aditiva

Ordem deliberada: **primeiro destravar o caminho até Publicações (D12/D14), depois a fronteira da Agência (D1-D5), depois a produção (D6-D11)**. Sem essa ordem, redesenhar a tela produz um documento bonito que ainda não tem para onde ir.

### Fase A — Radar → Redator → Publicações sem o Planejador (D12, D14)

1. Novo serviço `lib/server/writer-publication-handoff.ts` com a ordem já usada pelo handoff do Radar:
   `validar origem → validar hash → verificar pendências bloqueantes → montar pacote → gravar no servidor → reler do servidor → sucesso`.
2. Nova rota `app/api/redator/publication-handoff/route.ts`. Ela cria o `publication_records` a partir de um `ContentDocument` **v2**, preenchendo `radarOrigin` e deixando `plannerItemId`/`contentPlanVersionId` nulos — que o contrato já aceita.
3. O cliente **não** grava estado local antes da resposta. Só aplica o novo estado depois de `readbackConfirmed === true`, no mesmo formato que `import_radar` já usa. O caminho do Planejador continua existindo, inalterado.

### Fase B — fronteira da Agência (D1, D2, D3, D4, D5)

4. Novo `lib/server/agency-mcp-connections.ts` + `app/api/agencies/[agencyRef]/mcp-connections/route.ts`: listar, emitir e revogar **no escopo da agência**, não do ator. A consulta deixa de filtrar por `actor_user_id` e passa a exigir papel administrativo da agência; passa a expor `writer_mcp_call_events` como trilha legível.
5. Painel "MCP para produção editorial" acrescentado a `modules/conta/agency-integrations-page.tsx`: marcas autorizadas, cliente, escopos, expiração, último uso, revogação, endpoint e estado de saúde. Segredo continua mostrado uma única vez.
6. `app/api/mcp/redator/route.ts`: separar explicitamente os dois modos. A credencial passa a declarar `connection_kind` (`local_dev` | `remote_oauth`); uma credencial `local_dev` é **recusada** quando o `Host` não é local, mesmo que `MCP_ALLOWED_HOSTS` inclua o host. Isso remove o risco de um env var publicar o bearer.
7. A aba `Conectar IA` **não é apagada nesta fase**. Ela passa a ser leitura: mostra a conexão vigente e um link para Integrações da Agência. Só depois da paridade homologada pelo usuário é que o painel de emissão sai do Redator.

### Fase C — produção (D6, D7, D8, D9, D10, D11, D15)

8. **`channel` — compatibilidade aditiva, sem migration.** Passa a `z.string().max(300).default("")` nos dois payloads. Com `default`, a UI nova pode omitir a chave e todo `payload` já gravado continua lendo. O campo sai da tela e nada o exige. Nenhuma linha histórica é reescrita, e a RPC nunca o inspecionou.
9. Objetivo, público, duração, abertura, legenda e CTA passam a "metadados derivados", em bloco colapsado, abaixo do conteúdo. Deixam de ser a porta de entrada.
10. Roteiro e carrossel viram documento: cena/slide mostra o texto produzido, direção visual, prompt, a imagem atual (ou "aguardando imagem"), alt text, fontes e o estado por bloco — `não iniciado`, `em produção`, `salvo`, `revisão necessária`, `pronto para Publicações`, `conflito`. Estado nunca comunicado só por cor (regra do sistema visual).
11. **Vínculo fino da mídia (D8/D11) sem tocar o Arquiteto:** `writer_media_assets` recebe âncora própria (`anchor_kind` + `anchor_id`), cobrindo bloco do artigo, cena e slide. `WriterMediaBriefSchema` recebe os campos como `.nullable().default(null)`. `VisualBrief.assetId` passa a ser escrito de fato quando o briefing é criado a partir da cena/slide.
12. **Leitura segura da imagem (D9):** nova rota `app/api/redator/media-asset/route.ts` que autoriza por marca e devolve uma URL assinada de curta duração. Sem isso o humano não consegue conferir o que anexou.
13. **Substituição e revisão (D10/D15):** `replaced_by_asset_id` permite trocar o arquivo preservando linhagem, em vez de reescrever o ativo. `status` do entregável passa a aceitar `draft → in_review → approved` por ação humana explícita, separada da aprovação do artigo.

### O que a proposta deliberadamente **não** faz

- Não apaga aba, tabela, coluna ou versão.
- Não cria API de modelo nem provedor de imagem.
- Não trata prompt como imagem produzida (`prompt_ready` continua distinto de `uploaded`).
- Não usa `localStorage` como fonte canônica.
- Não dá ao MCP poder de aprovar, publicar, apagar ou tocar DNA.
- Não usa o modelo para decidir autorização — o servidor continua validando tudo por chamada.
- Não cria linguagem visual nova.

---

## 6. Migrations necessárias

**Duas, ambas aditivas. Nenhuma destrutiva.**

**M1 — vínculo e ciclo de vida da mídia (Fase C):**
```
ALTER TABLE writer_media_assets
  ADD COLUMN anchor_kind text NULL CHECK (anchor_kind IN ('article_block','scene','slide')),
  ADD COLUMN anchor_id  text NULL,
  ADD COLUMN replaced_by_asset_id uuid NULL REFERENCES writer_media_assets(id);
CREATE INDEX ... (marca_id, document_id, anchor_kind, anchor_id);
```
Colunas nuláveis: toda linha existente continua válida sem reescrita.

**M2 — modo da conexão MCP (Fase B):**
```
ALTER TABLE writer_mcp_delegations
  ADD COLUMN connection_kind text NOT NULL DEFAULT 'local_dev'
    CHECK (connection_kind IN ('local_dev','remote_oauth')),
  ADD COLUMN client_id text NULL,
  ADD COLUMN consent_recorded_at timestamptz NULL,
  ADD COLUMN revoked_by_user_id uuid NULL REFERENCES auth.users(id);
```
O `DEFAULT 'local_dev'` classifica corretamente o que já existe, inclusive a delegação revogada da prova de 2026-09-18.

**Nenhuma migration é necessária para:**
- `channel` — vive no `payload` jsonb; a correção é só de schema Zod (`.default("")`). `VERIFICADO_NO_CODIGO`
- Publicações de origem Radar — `content_plan_version_id` já é nulável e `planner_item_id` não existe como coluna; o bloqueio era de contrato Zod e **já foi removido**. `PERSISTENCIA_REMOTA` — esta afirmação vem do registro de 2026-09-17 e **precisa ser reconfirmada por leitura somente-leitura do schema efetivo antes da Fase A**. Não a verifiquei nesta rodada.
- `writer_deliverables.status` — o CHECK já aceita os três valores; falta código, não coluna.

**Decisão pendente do produto:** `UNIQUE (document_id, kind)` (D16) limita a um roteiro e um carrossel por artigo. Se variantes forem desejadas, isso vira uma terceira migration. **Não proponho mudá-la sem sua decisão** — hoje ela é o que garante idempotência da gravação.

---

## 7. Riscos, compatibilidade, rollback e testes

### Riscos

| Risco | Gravidade | Mitigação |
| --- | --- | --- |
| `MCP_ALLOWED_HOSTS` publicar o bearer sem OAuth | **alta** | `connection_kind` recusando `local_dev` fora de host local (Fase B, item 6) |
| Fundação inteira untracked (D17) | **alta** | commitar antes de qualquer refatoração; não rodar script de faixa de linhas sobre esses arquivos |
| Criar segunda autoridade de entrada no Redator | alta | "Enviar ao Redator" continua exclusivo do Radar; a Fase A é **saída**, não entrada |
| Regressão no caminho do Planejador | média | Fase A acrescenta caminho, não substitui `start_writing` |
| URL assinada vazar imagem entre marcas | média | autorizar por marca antes de assinar; expiração curta; nunca URL pública |
| Redesenho perder payload legado | média | `channel` com `.default("")` e leitura compatível; nenhuma reescrita de versão |
| Confundir prova local com integração remota | média | manter o aviso da tela e o `connection_kind` no banco |

### Compatibilidade

- `payload` já gravado em `writer_deliverables`: **legível sem alteração** após `.default("")`.
- `publication_records` do Planejador: intocados; a invariante de origem continua satisfeita pelos dois lados.
- Documento v1 com `ContentPlan`: caminho histórico preservado.
- Delegações existentes: classificadas como `local_dev` pelo default.

### Rollback

Ocultar as superfícies novas (painel da Agência, rota de handoff, rota de asset) e manter tabelas e colunas. Colunas nuláveis e com default são inertes quando ninguém as lê. Nenhuma versão histórica é apagada; nenhum contrato v2 é removido.

### Testes obrigatórios

| Teste | O que prova |
| --- | --- |
| `test:redator`, `test:redator:mcp` | fundação atual continua verde (baseline: 28/28 e 2/2 hoje) |
| `test:editorial`, `test:operational` | caminho do Planejador não regrediu |
| `test:radar` | Radar intocado |
| novo `redator-publicacoes-origem-radar` | v2 sem plano cria registro; readback falho = **erro**, não sucesso; repetição não duplica |
| novo `redator-midia-vinculo` | âncora inválida recusada; ativo de outra marca recusado; ativo de outra cena recusado; substituição preserva linhagem |
| novo `agencia-mcp-conexoes` | admin da agência lista/revoga de outro ator; membro sem papel recebe 403; `local_dev` recusada fora de host local |
| novo `redator-channel-compatibilidade` | payload antigo **com** `channel` e novo **sem** `channel` ambos validam |

Nenhum desses testes substitui a homologação manual.

---

## 8. Critérios de homologação manual do usuário

São seus. O dev não clica no fluxo real nem declara validação manual.

1. **Agência:** em `/agencias/{ref}/integracoes`, criar uma conexão MCP, ver escopos e marcas, ver o segredo uma única vez, revogar, e confirmar que a trilha de uso aparece. Confirmar que outra agência não enxerga essa conexão.
2. **Redator sem credencial:** abrir `/{brandRef}/redator` e confirmar que não há mais emissão de credencial — só a referência à Agência.
3. **Artigo do Radar:** abrir o documento vindo do Radar, conferir dossiê, evidências e pendências. F5. Segunda aba. Segundo navegador com a mesma conta. O conteúdo tem de ser o mesmo.
4. **Roteiro e carrossel:** abrir os dois e confirmar que **não existe campo Canal** e que nenhum campo vazio impede começar. Editar uma cena e um slide, salvar, F5, conferir.
5. **Imagem:** registrar prompt em uma cena específica, anexar um PNG gerado fora, **ver a imagem na tela**, substituir por outra, e confirmar que a anterior continua rastreável.
6. **Publicações:** enviar artigo, roteiro e carrossel. Confirmar que chegam com texto, imagens, links, metadados e versões, **sem passar pelo Planejador**. Desligar a rede no meio de um envio e confirmar que a tela **não** mostra sucesso.
7. **Idempotência:** repetir o mesmo envio e a mesma gravação; nada pode duplicar.
8. **Isolamento:** confirmar que nenhuma tela do Radar, Arquiteto ou Minerador mudou.

---

## 9. Lista exata de arquivos que o dev pretende alterar

**Criar:**
```
lib/server/writer-publication-handoff.ts
lib/server/agency-mcp-connections.ts
app/api/redator/publication-handoff/route.ts
app/api/redator/media-asset/route.ts
app/api/agencies/[agencyRef]/mcp-connections/route.ts
modules/conta/agency-mcp-connections-panel.tsx
supabase/migrations/<ts>_writer_media_asset_anchor.sql
supabase/migrations/<ts>_writer_mcp_connection_kind.sql
tests/redator-publicacoes-origem-radar.test.mts
tests/redator-midia-vinculo.test.mts
tests/agencia-mcp-conexoes.test.mts
tests/redator-channel-compatibilidade.test.mts
```

**Alterar:**
```
lib/redator/multiformat-contracts.ts        (channel .default; âncora no media brief; assetId escrito)
lib/server/writer-deliverables.ts           (âncora, substituição, status do entregável, signed URL)
lib/server/writer-mcp-delegation.ts         (escopo de agência; connection_kind; revoked_by)
app/api/mcp/redator/route.ts                (recusa local_dev fora de host local; âncora nas ferramentas)
app/api/redator/deliverables/route.ts       (âncora no briefing)
app/api/redator/mcp-delegations/route.ts    (vira leitura; emissão migra para a Agência)
modules/redator/writer-derived-environment.tsx (documento de produção; sem Canal; mídia por cena/slide)
modules/redator/writer-mcp-connections.tsx  (vira referência à Agência, sem emissão)
modules/conta/agency-integrations-page.tsx  (monta o painel MCP)
components/editorial/professional-writer.tsx (envio a Publicações com readback; aba de conexão em leitura)
components/editorial-pipeline-context.tsx   (import de publicações deixa de gravar antes do servidor)
lib/publicacoes/export.ts                   (pacote com entregáveis, ativos e proveniência)
lib/editorial/operational-flow.ts           (dimensão aditiva de entregável no pacote)
package.json                                (novos scripts de teste)
docs/07-redator/{spec,estado-atual,backlog}.md
```

**Explicitamente fora da lista — nenhum arquivo destes é tocado:**
```
lib/arquiteto/**        lib/radar/**        lib/minerador/**
modules/arquiteto/**    modules/radar/**    modules/minerador/**
app/api/arquiteto/**    app/api/radar/**    app/api/editorial/radar-writer-handoff/**
```

---

## 10. Estado por evidência — resumo honesto

| Afirmação | Marcação |
| --- | --- |
| MCP local com escopo, lock, readback, hash, auditoria e rate limit existe e funciona no código | `VERIFICADO_NO_CODIGO` |
| Contratos multiformato, restrições de ferramenta e entrada v2 do Radar | `CONFIRMADO_POR_TESTE` (28/28 + 2/2 hoje) |
| Migrations aplicadas no Supabase remoto | registro herdado de 2026-09-18; **não reverifiquei** — `PERSISTENCIA_REMOTA` pendente |
| Escrita MCP autenticada ponta a ponta | `PENDENTE` |
| Agência administra a conexão MCP | `PENDENTE` |
| Roteiro/carrossel como documento produzido | `PENDENTE` |
| Imagem lida de volta, substituída e revisada na UI | `PENDENTE` |
| Publicações recebendo artigo do Radar sem Planejador | `PENDENTE` |
| Publicações recebendo roteiro e carrossel | `PENDENTE` |
| Envio a Publicações com readback obrigatório | `PENDENTE` |
| Conexão remota ChatGPT/Claude (HTTPS + OAuth 2.1/PKCE) | `BLOQUEADO` — OAuth Server do Supabase desativado |
| Qualquer homologação de navegador desta rodada | `VALIDADO_MANUALMENTE` = **nenhuma** |

**Nada desta auditoria é declarado concluído. Nenhum código, UI, migration ou dado foi alterado. Nenhum deploy, commit, push ou limpeza remota foi executado.**
