# Auditoria — Radar / Área Vídeos — Gate 0 — 2026-09-11

Auditoria **read-only**. Nenhum código, schema, dado, RLS, bucket, job ou
provider foi tocado. Nenhum vídeo baixado, nenhum material transcrito.

Pergunta: *qual é a infraestrutura REAL já existente que pode sustentar a área
Vídeos sem criarmos uma arquitetura paralela?*

---

## 1. A área Vídeos hoje

Um componente, dois handlers, zero persistência.

| Camada | Onde |
| --- | --- |
| Componente | `modules/radar/radar-r3-videos-panel.tsx` (98 linhas) |
| Handler de registro | `addExistingContentForArticle` — `modules/radar/radar-page.tsx:1665` |
| Handler de estado | `updateExistingContentState` — `radar-page.tsx:1671` |
| Escrita | `updateLocalState` → `setR4LocalByArticle` — `radar-page.tsx:203` |
| Tipo | `RadarR4ExistingContentRecord` — `lib/radar/r4-queue.ts:60` |

`r4LocalByArticle` é `useState<Record<string, RadarR4LocalArticleState>>({})`.
As únicas escritas passam por `setR4LocalByArticle`; não existe hidratação a
partir de `localStorage`, de API ou do banco, e `localStateFor` cai em
`createRadarR4LocalArticleState()` quando não encontra nada.

**O material registrado é estado React e nada mais.** Não sobrevive a F5, a
outra aba, a outra sessão nem a outro dispositivo.

`ExistingContentSchema` existe em `lib/radar/r6-sequential.ts:38` e sugere
persistência, mas não é: `r6Report` é recomputado dentro de `rowWorkbenchData`
a cada render (`radar-page.tsx:240`). É read model derivado, não gravação.

## 2. Entidade genérica de fonte — não existe

Procurei por `source`, `material`, `asset`, `media`, `document`,
`external source`, `content source`, `contribution asset`, e por semântica, não
só por nome.

| Candidata | Propósito atual | Serve para VideoSource? |
| --- | --- | --- |
| `expert_contributions` | contribuição de um especialista, via Telegram, para um `brief_id` | **Não.** `provider CHECK = 'telegram'`, FK obrigatória para `brand_experts` e `expert_briefs`. Um vídeo escolhido pela marca não tem especialista nem pauta de especialista |
| `editorial_artifact_versions` | versões de DNA (Article, Silo, SiloPage) | Não. É artefato de fundamento, não fonte externa |
| `editorial_serp_snapshots` | snapshot de SERP | Não. É observação de busca |
| `RadarResearchReference` | referência competitiva da investigação | Não. Vive no payload, não em tabela, e o papel é competitivo |

Não existe entidade neutra de fonte/material. Forçar `expert_contributions`
acoplaria vídeo deliberado a contribuição de especialista — duas entidades
semanticamente diferentes, exatamente o que o enunciado proíbe.

## 3. `external_processing_jobs` — a melhor peça que já temos

`supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql:226`

| Aspecto | Estado |
| --- | --- |
| Tenant | `brand_id NOT NULL → marcas(id)`, FKs compostas `(brand_id, brief_id)` e `(brand_id, contribution_id)` |
| Tipos de job | `CHECK IN ('telegram_media_preservation', 'speech_transcription', 'document_extraction')` |
| Status | `RECEIVED, PENDING_LOCAL_PROCESSING, PROCESSING, COMPLETED, FAILED_RETRYABLE, FAILED_FINAL, BLOCKED` |
| Claim | `claim_external_processing_job(worker_id, lease_seconds)` com `FOR UPDATE SKIP LOCKED`, `SECURITY INVOKER`, execução só para `service_role` |
| Lease | `claimed_by`, `claimed_at`, `heartbeat_at`, `lease_expires_at`; retomada quando `lease_expires_at < now()` |
| Retry | `attempts`, `max_attempts` (default 3), `available_at` com backoff progressivo até 15 min |
| Idempotência | índice único `(contribution_id, job_kind) WHERE contribution_id IS NOT NULL` |
| Erro | `last_error_code`, `last_error_message` |
| Payload | `payload jsonb` — entrada e saída no mesmo campo |

**Dois workers nunca pegam o mesmo job**: `SKIP LOCKED` + filtro de lease.

Lacunas para vídeo, declaradas:

- `job_kind` é `CHECK` fechado — um tipo novo exige migration;
- os dois vínculos possíveis (`brief_id`, `contribution_id`) apontam para
  tabelas do Especialista. Um job de vídeo ficaria sem vínculo, e a
  idempotência (`WHERE contribution_id IS NOT NULL`) deixaria de valer;
- não há `priority`, `cancelled_at` nem coluna de `result` separada do
  `payload`.

## 4. Local Worker

`scripts/local-worker.mts` (17 linhas) → `lib/server/local-worker/runner.ts`.

- **Processor é injetável**: `runLocalWorkerOnce({ workerId, processor, client })`,
  com `LocalWorkerProcessor = (job) => Promise<LocalWorkerProcessorOutcome>`.
  O entrypoint hoje injeta `createRadarExpertContributionWorkerProcessor`.
- **Não é loop de serviço**: `local-worker:once` roda **um** job e sai. Gated por
  `LOCAL_WORKER_RUN=1` e `LOCAL_WORKER_ACTOR_USER_ID`.
- Heartbeat em `setInterval` durante o processamento; `releaseExternalProcessingJob`
  devolve o job quando não há processor.
- Segurança: `createCanonicalServiceClient()` — `service_role`, server-side.
- Acessa Google Cloud Storage e Speech (`uploadSharedTemporaryMedia`,
  `runSharedLongSpeech`) e escreve no banco via `applyLocalWorkerWriteback`.
- `followUpJobs` encadeia jobs: preservação → transcrição → organização.

O worker é reutilizável **sem alteração**: basta um processor novo. O que não
existe é o loop contínuo.

## 5. Storage — são dois, e só um serve

**Supabase Storage**: um único bucket declarado, `profile-avatars` (público,
5 MB, mime restrito). Nada de mídia editorial.

**Google Cloud Storage** é onde a mídia realmente vive:

- bucket vem da Connection da Plataforma (`google_cloud_media.bucket_name`);
- convenção de caminho: `temporary/brand/{brandId}/{source}/{objectId}-{name}`;
- isolamento por marca **verificado no código**: `checkSharedTemporaryMedia` e
  `removeSharedTemporaryMedia` recusam objeto cujo prefixo não seja o da brand;
- URI `gs://bucket/objectKey`, com checksum e metadata;
- `removeSharedTemporaryMedia` existe; **retenção/lifecycle automático não foi
  encontrado** — a remoção é explícita.

O prefixo `temporary/` é semântico: esse espaço foi desenhado para processamento
transitório, não para guardar o original de forma canônica.

## 6. Speech-to-Text

| | |
| --- | --- |
| Provider | Google Cloud Speech-to-Text |
| Entrypoints | `runSharedShortSpeech({ audioContent })`, `runSharedLongSpeech({ gcsUri })` |
| Entrada | bytes de áudio, ou objeto já no GCS |
| Saída | `{ transcript, confidence, alternatives[], languageCode, mode }` |
| **Timestamps** | **NÃO** — a forma de saída não tem `startTime`/`endTime` |
| Detecção de idioma | não; `languageCode` é configurado na entrada |
| Tradução | não |
| Uso atual | job `speech_transcription` do Especialista |

A ausência de timestamps é a lacuna mais relevante para a área Vídeos:
`TranscriptSegments → timestamps + texto original` (§16 do enunciado) não é
alcançável com o formato de saída atual.

## 7. YouTube — metadata sim, texto não

`lib/server/google-cloud/youtube-metadata-operation.ts`:
`{ videoId, title, channelId, channelTitle, description, publishedAt, duration, thumbnails }`.

```text
YOUTUBE_TRANSCRIPT_EXISTS   = NO
YOUTUBE_CAPTIONS_EXISTS     = NO
YOUTUBE_AUDIO_DOWNLOAD_EXISTS = NO
```

Nenhuma ocorrência de `caption`, `timedtext` ou `subtitle` no módulo. Existir
YouTube Data API **não** implica transcript.

O modo competitivo `Pesquisa → YouTube` (`lib/radar/video-competitive-model.ts`)
não usa a YouTube API: ele deriva o modelo do bloco de vídeos da SERP do Google.

## 8. Tradução — não existe

Nenhum provider de tradução, nenhum serviço de locale, nenhum `job_kind`. As
três ocorrências de "traduz" no código são prosa em português nos comentários.

## 9. O padrão do Especialista — reutilizável como forma

```text
original            expert_contributions.original_asset_uri (GCS) + checksum + metadata
transcript          expert_contributions.transcript_text (TEXT, sem limite)
extração            expert_contributions.extraction_payload (jsonb)
organização         expert_contributions.organization_payload (jsonb)
estado              processing_status: RECEIVED → PENDING_LOCAL_PROCESSING →
                    PROCESSING → EXTRACTED | FAILED_RETRYABLE | FAILED_FINAL
orquestração        external_processing_jobs + followUpJobs encadeados
```

O padrão — **original imutável em Storage, derivados em PostgreSQL, jobs
encadeados** — é diretamente aplicável a Vídeos. Reutilizar o padrão não
significa acoplar `VideoSource` a `ExpertContribution`.

## 10. VideoBriefs — onde vivem

| Camada | Local | Conteúdo |
| --- | --- | --- |
| Vivo | `deepResearch.blueprint.videoBriefs` | `RadarVideoBrief[]` completo, **recomputado a cada leitura** |
| Congelado | `RadarFrozenEvidenceBundle.blueprint.videoBriefIds` | **somente os ids** |
| Handoff | `PlannerHandoff.editorialBlueprint` | blueprint **completo**, com os briefs |

Identidade: `id = video:${hash(conceptId|rotulo)}` —
`lib/radar/editorial-blueprint.ts:427`. Determinística e estável **dentro de uma
investigação**; derivada da amostra, portanto um `RESET` + nova `ANALYZE` pode
produzir ids diferentes.

Consequência para `RelevantExtract → videoBriefId`: o vínculo funciona enquanto
a investigação viver. Como o bundle congelado guarda só os ids e não o conteúdo
dos briefs, um extract apontando para um brief de investigação já resetada
resolveria para nada. **Pendência declarada, não decidida aqui.**

## 11. Evidência de vídeo — não existe

`VideoEvidence`, `MediaEvidence` e `SourceEvidence`: zero ocorrências.
`RadarExternalEvidenceCandidate` (`lib/radar/link-and-source-research.ts:504`)
existe, mas descreve fonte externa **citada por concorrentes** na SERP — papel
competitivo, não material deliberado da marca.

## 12. Entrada múltipla

O formulário registra **uma fonte por clique**: um `select` de tipo, um campo de
referência, um campo de nome. A lista `existingContent` é um array, então a
pluralidade existe no modelo; o que não existe é entrada em lote.

Tipos atuais: `YOUTUBE | PODCAST | VIDEO | AUDIO | DOCUMENT`. Não há
`WEB_PAGE`. O enum é fechado em dois lugares (`r4-queue.ts:58` e
`ExistingContentSchema`), então um tipo novo é alteração de contrato — barata,
porque nada disso está persistido ainda.

## 13. Identidade e dedupe

`radarNormalizedUrl` (`lib/radar/research-reference.ts:36`) normaliza protocolo,
`www`, query, fragmento e barra final. É a autoridade de identidade das
referências competitivas.

Reutilizável **como função**. Não reutilizável **como identidade**: acoplar a
identidade de uma `YouTubeCompetitiveReference` à de um `DeliberateVideoSource`
faria o mesmo vídeo colidir entre dois papéis que o produto declarou distintos
(invariante 24). Hoje o registro de material não deduplica nada — dois cliques
com a mesma URL criam dois registros, diferenciados só por `Date.now()`.

## 14. Tenant e RLS — o padrão a seguir

```sql
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.<t> FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.<t> TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.<t> TO service_role;

CREATE POLICY <t>_select ON public.<t> FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));
```

Leitura pelo usuário via `can_access_brand`; escrita só por `service_role`. FKs
compostas `(brand_id, id)` impedem cruzamento entre marcas. Qualquer tabela de
vídeo deve nascer assim.

## 15. Reset

`RADAR_RESET_OUTSIDE_PAYLOAD` (`lib/radar/radar-reset.ts:211`) lista
`existingContent` entre o que o reset não alcança, e a suíte prova a fronteira.

**Mas a razão é a limitação, não a proteção**: o material não está no payload
porque não está persistido em lugar nenhum. Hoje o reset não apaga os materiais
porque um F5 já os apagou antes. Quando a persistência existir, a fronteira
precisará ser reafirmada de propósito.

## 16. Sobrevivência — classificação

| Estado | Classificação |
| --- | --- |
| Registrar material | `LOCAL_ONLY` (estado React; não sobrevive a F5) |
| Transcript | `NOT_IMPLEMENTED` |
| Relevant extracts | `NOT_IMPLEMENTED` |
| Translation | `NOT_IMPLEMENTED` |
| VideoEvidence | `NOT_IMPLEMENTED` |
| Associação com Article | `LOCAL_ONLY` (chave do dicionário em memória) |
| Associação com VideoBrief | `NOT_IMPLEMENTED` |

---

## 17. Transcript: onde guardar — três opções

**A · PostgreSQL `TEXT`/`JSONB` inteiro.**
Benefício: um lugar só, transacional, já usado — `expert_contributions.transcript_text`
é `TEXT` sem limite e funciona. Risco: o payload do Radar vive em
`editorial_workflow_items.payload jsonb` e é lido **inteiro** a cada render da
planilha; os campos de texto do contrato de análise são limitados a 600–4000
caracteres justamente por isso. Enfiar transcrições de dezenas de milhares de
caracteres nesse payload degrada toda a tela.

**B · Artifact em Storage; PostgreSQL guarda identidade + URI + metadata.**
Benefício: o payload não cresce; casa com `original_asset_uri` e com o prefixo
por marca do GCS. Risco: toda leitura de trecho vira ida ao Storage, e não há
transação entre as duas pontas — o par linha/objeto pode divergir.

**C · Híbrido — original completo em Storage, segmentos e trechos relevantes em
PostgreSQL.**
Benefício: o original fica imutável e barato onde já existe infraestrutura; o
que a aplicação realmente consulta — os trechos que casam com os VideoBriefs —
fica indexável, consultável e transacional, e é uma fração do volume. É o mesmo
desenho que o Especialista já usa (`original_asset_uri` no GCS,
`transcript_text` e os payloads derivados no banco).
Risco: duas camadas para manter coerentes; exige que o vínculo original→segmento
seja explícito.

**Recomendação: C.** É o único que respeita simultaneamente a decisão
arquitetural vigente — não traduzir o material inteiro antes do matching — e o
custo de leitura do payload do Radar. E não inventa padrão: copia o do
Especialista, que já roda.

## 18. Recomendação arquitetural mínima

**PostgreSQL**
- `radar_video_sources` — a fonte deliberada: `brand_id`, `article_id`,
  `article_dna_version_id`, `kind`, `label`, `reference`, `normalized_reference`,
  `state`, `created_at`. Identidade própria, **não** acoplada a
  `expert_contributions` nem a `YouTubeCompetitiveReference`.
- `radar_video_source_texts` — a camada derivada: `source_id`, `language`,
  `origin` (`PROVIDED | CAPTION | SPEECH`), `original_asset_uri`,
  `transcript_text`, `segments jsonb`, `extracts jsonb`, `status`.
- Segmentos e trechos relevantes como `jsonb` nessa tabela — **fora** do
  `editorial_workflow_items.payload`.

**Storage (GCS)**
- O arquivo original e o transcript bruto, sob um prefixo canônico por marca.
  Hoje só existe `temporary/brand/{brandId}/...`, cuja semântica é transitória:
  um prefixo durável é decisão do Gate 1.

**Worker (temporário)**
- Bytes baixados, áudio extraído e buffers de transcrição. Nada disso persiste;
  o worker escreve URI, texto e estado e descarta o resto — como já faz.

**RadarEvidenceBundle**
- Os trechos relevantes já casados com `videoBriefId`, com proveniência
  (`sourceId`, `origin`, idioma). Não o transcript inteiro.

**FrozenBundle**
- Identidades e hashes: `sourceId`, `videoBriefId`, hash do extract. Mesmo
  critério do blueprint, que hoje congela ids e não conteúdo.

**PlannerHandoff**
- Os trechos relevantes com proveniência, junto do blueprint — o Planejador
  precisa do texto que vai usar, não do original de duas horas.

## 19. Decisão de schema

```text
DATABASE_CHANGE_REQUIRED = YES
MIGRATION_REQUIRED = YES
```

Menor mudança necessária, **não escrita aqui**:

1. `radar_video_sources` — tabela nova, RLS no padrão `can_access_brand`,
   FK composta `(brand_id, id)`;
2. `radar_video_source_texts` — tabela nova, mesmo padrão, FK composta para a
   fonte;
3. `external_processing_jobs.job_kind` — ampliar o `CHECK` com os tipos de
   vídeo;
4. `external_processing_jobs` — permitir vínculo com `radar_video_sources`
   (coluna nova com FK composta) e estender a idempotência, hoje amarrada a
   `contribution_id`.

Nada além disso é necessário para a Fase 1 de Vídeos.

## 20. Riscos e pendências

**R1 · Transcrição sem timestamps.** `SpeechTranscriptResult` não devolve
tempos. Segmentação por tempo não é alcançável com a saída atual; ou se segmenta
por texto, ou o contrato do provider muda. Decisão do Gate 1.

**R2 · Identidade de VideoBrief é derivada da investigação.** `RESET` + nova
`ANALYZE` pode mudar os ids, e o bundle congelado guarda só ids. Um extract
antigo apontaria para um brief inexistente.

**R3 · `temporary/` é semanticamente transitório.** Guardar original canônico
nesse prefixo contradiz o nome e o desenho. Um prefixo durável precisa ser
decidido junto com retenção, que hoje não existe automatizada.

**R4 · O worker é run-once.** Sem loop nem agendamento, alguém precisa
executá-lo. Não é bloqueio para o Gate 1, mas é operação manual.

**Pendências que NÃO decidi aqui:** o formato do `job_kind` de vídeo; o prefixo
durável do Storage; se `WEB_PAGE` entra no enum de tipo; e se o extract deve
apontar para o `videoBriefId` vivo ou para um id congelado.
