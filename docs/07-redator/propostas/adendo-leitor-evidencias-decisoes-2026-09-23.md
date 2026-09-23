# Adendo — Leitor de evidências do Redator: decisões adotadas — 2026-09-23

## Identificação

- **Módulo proprietário:** Redator. Minerador, Marca, Arquiteto, Radar e Publicações são **só lidos**, com consultas estreitas próprias (filtro de marca e artigo, colunas e caminhos) e pela regra de parse de cada dono.
- **SDD de origem:** [sdd-leitor-evidencias-redator-2026-09-23.md](./sdd-leitor-evidencias-redator-2026-09-23.md). Este adendo **não altera** a SDD; registra as decisões da seção 11 dela e como o código se comporta antes da migration.
- **Precedência:** abaixo de invariantes, ADRs, da SDD de egress ([sdd-uso-supabase-orcamento-egress-2026-09-23.md](../../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md), R1–R24) e da SDD do leitor.
- **Migration escrita, NÃO aplicada:** `supabase/migrations/20260923150000_writer_evidence_reader.sql`.

---

## 1. Autorização

**Relatado pelo usuário (2026-09-23), no chat da sessão:** *"rodei, e sim, pode continuar em todas, Arquiteto, radar, e redator"*.

O pedido original, também do usuário: *"no redator também pode disponibilizar todo os dados da SERP para que a IA que vai escrever o artigo possa consultar e confrontar com os dados recebidos nos DNAs, assim como os dados do especialista, da amazon, e do youtube. tem que estar todas as informações disponível lá pra a criação do texto dos artigos."*

O que a autorização cobre:

- implementar a **Fase 1** da SDD do leitor com as opções **recomendadas** da seção 11;
- escrever a migration das funções de leitura e da tabela de divergências.

O que ela **não** cobre (AGENTS.md §15):

- aplicar a migration, rodar SQL que escreve, `migration repair`, commit, push ou deploy, que continuam com o usuário;
- chamadas pagas (DeepSeek, DataForSEO, provedores);
- a Fase 2, que exige SDD própria ou adendo aprovado (seção 4).

---

## 2. Decisões adotadas

Cada item responde a uma caixa da seção 11 da SDD.

| # | Decisão da SDD | Adotada | Consequência |
| --- | --- | --- | --- |
| D1 | Aprovar o leitor, as três ferramentas, o pacote da IA interna e as guardas | **Sim** | `get_writer_evidence_manifest`, `get_writer_foundations`, `read_writer_evidence`, `record_writer_divergence`; pacote por seção ≤ 24 kB montado no servidor. |
| D2 | Migration das funções de manifesto e fatia e da tabela `writer_evidence_divergences` | **Sim, só o arquivo** | Escrita em `20260923150000_writer_evidence_reader.sql`. O usuário aplica. |
| D3 | Escopos MCP | **Opção A** | Leitura sob `writer.read`; divergência sob `writer.draft.write`. Sem migration de escopo, sem reconsentimento; o CHECK de `writer_mcp_grants.scopes` não muda. |
| D4 | Mudança de saída de `get_writer_document` e `get_writer_brief` | **Aceita** | `get_writer_document` sai sem `importedContext`: blocks, metadata, status, refs e `radarOrigin`. `get_writer_brief` troca o dossiê por um ponteiro ao manifesto. As ferramentas atuais continuam existindo. |
| D5 | Onde gravar a divergência | **Tabela própria** | `writer_evidence_divergences`, com RLS por marca. `editorial_workflow_items` fica intocada, porque `findByArticleRaw` e `importItem` usam `maybeSingle`/`single` sem filtrar `subject_type`. |
| D6 | BrandDNA | **Vigente, rotulada** | Lida na versão vigente, decidida pelos eventos de status do módulo Marca, com o rótulo "não fixada no documento". Fixar a versão no import fica fora. |
| D7 | Especialista posterior ao envio | **Só contagem** | O manifesto traz a contagem e o aviso "há contribuição posterior; reenvio pelo Radar". O conteúdo não é lido, porque abriria um segundo canal Radar → Redator (invariante 51). |
| D8 | Shortlist Amazon | **Só se congelada pelo Radar** | Enquanto o Radar não congelar a shortlist, o Redator expõe só a lista de produtos da corrida, rotulada "pesquisa, não congelada". Nunca recalcula a shortlist (invariante 30). |
| D9 | FAQ | **Proibido em toda instrução** | Instrução do servidor MCP, fundamentos, envelope de fatia e pacote da IA interna levam "não gerar nem sugerir FAQ" (AGENTS.md §13). |
| D10 | Fase 2 (dossiê fora do payload) | **Planejada, não implementada** | Ver seção 4. |
| D11 | Radar ligado ao cache de SERP em coleta `advanced` | **Frente do Radar** | O Redator nunca coleta (invariante 50). Sem essa frente não há PAA, buscas relacionadas nem AI Overview gravados; o manifesto declara a ausência. |

Regras que valem para todas as decisões:

- **A IA lê e confronta; quem muda DNA é o dono, por decisão humana** (AGENTS.md §9). A IA só cria divergência `aberta`.
- **Hierarquia de evidência** (invariantes 27 e 35): fonte fora do bundle congelado sai como "observação não revisada pelo Radar", no nível `OTHER_RADAR_EVIDENCE` ou inferior, **nunca** como `CURRENT_SUFFICIENT_SERP`. A tabela de divergências reforça isso com um CHECK.
- **Frescor** (invariante 30): dado posterior ao pacote sai com `posteriorAoPacote = true` e `supersedes = false`, e não muda o `evidenceBundleHash`.
- **Dado de terceiros** é pesquisa (`usage: "research_only"`): não copiar trecho nem reproduzir título concorrente. A listagem trunca trechos em 300 caracteres.
- **Isolamento** (AGENTS.md §5; R4): a marca vem da linha do documento, conferida contra o grant. Toda consulta filtra marca **e** documento ou artigo.

---

## 3. A migration `20260923150000_writer_evidence_reader.sql`

**Estado: NÃO APLICADA.** Como aplicar (usuário, manualmente):

```
npx supabase db query --linked -f supabase/migrations/20260923150000_writer_evidence_reader.sql
npx supabase migration repair --status applied 20260923150000 --linked
```

Nunca `supabase db push`.

### 3.1 Catálogo conferido antes de escrever

**Verificado em 2026-09-23**, por consulta agregada a `information_schema`, `pg_proc`, `pg_indexes`, `pg_class` e `pg_policies`, sem ler dado de cliente:

- PostgreSQL 17.6;
- colunas de `content_documents`, `editorial_workflow_items`, `editorial_artifact_versions`, `radar_analysis_runs`, `radar_video_source_texts`, `radar_article_video_sources`, `editorial_serp_snapshots`, `editorial_serp_reviews` e `writer_mcp_grants` batem com as usadas;
- nenhuma função `writer_evidence_*` e nenhuma tabela `writer_evidence_divergences` existiam;
- o `service_role` tem SELECT nas 8 tabelas lidas;
- `canonical_actor_can_access_brand(uuid, uuid)` existe e é a mesma função das policies de `radar_analysis_runs`.

A migration repete essas conferências num bloco de pré-condições e para, sem criar nada, se o banco divergir.

### 3.2 Validação sem aplicar

**Confirmado por consulta só de leitura** (`BEGIN READ ONLY`, sem DDL):

- o corpo de `writer_evidence_manifest`, rodado como SELECT com marca inexistente, analisou e devolveu 0 linhas;
- o mesmo corpo, com um documento **sintético** no lugar da linha real, devolveu os níveis 1 a 3 do bundle, o `invalid_reference` de um `videoSourceId` que não é uuid e o `not_selected` de um vídeo sem vínculo;
- as consultas de página de array e de objeto, rodadas sobre JSON sintético, respeitaram o teto acumulado, `p_fields`, `p_exclude_keys`, a ordem "C" das chaves e o cursor;
- o corpo PL/pgSQL de `writer_evidence_slice`, rodado como bloco `DO` sobre dado sintético, paginou texto por caracteres dentro do teto (583 caracteres = 1.022 B com teto de 1.024 B), declarou caminho ausente e devolveu escalar;
- as consultas de resolução das cinco fontes executaram com ids inexistentes, sem erro.

**Ainda não verificado:** os gatilhos da tabela de divergências, porque criar a tabela seria escrita remota. A verificação agregada que vai no fim da migration cobre isso depois da aplicação.

### 3.3 `writer_evidence_manifest(p_brand_id uuid, p_document_id text)`

- Só leitura, `STABLE`, `SECURITY INVOKER`, `search_path` fixo. `EXECUTE` só para `service_role`.
- **Não devolve valor de payload:** só `octet_length(x::text)` em bytes, `jsonb_array_length` ou número de chaves, hash, versão, data, status e uma nota curta.
- Colunas fixas: `source, ref_id, kind, json_path, value_type, bytes, items, content_hash, version_number, observed_at, status, note`.
- Fontes cobertas:
  - `document`: raiz do payload, `blocks`, bundle congelado nos níveis 1 e 2, e nível 3 sob `observed`;
  - `analysis_version`: o elemento de `analysisVersions` da versão entregue (`radarOrigin.analysisVersionId`) e o 1º nível do payload dele, com o `serpSnapshotId` na nota;
  - `radar_run`: a corrida da versão entregue nos níveis 1 e 2;
  - `serp_snapshot`: o snapshot da versão entregue e o mais recente, quando diferente, com o status da última revisão humana. O `serpSnapshotId` da versão de análise é o **id do registro dentro do payload** (`payload.id` ou `payload.research.id`), não o uuid da linha: a função casa pelos três, em texto e sem cast (**Verificado em 2026-09-23**, agregado: 2 de 2 versões entregues com id não-uuid, 0 casando pelo uuid, 1 de 1 casando pelo payload em cada artigo; é a regra de `SerpSnapshotRepository.findRemoteSnapshot`, do Radar);
  - `artifact_version`: as versões de DNA referenciadas pelo documento, com a maior versão existente da mesma entidade na nota (rótulo "há versão mais nova"), e o contexto da Marca: as 10 versões mais novas de `brand_dna` **e de `brand_skill`** (**Verificado em 2026-09-23**: nenhuma linha `brand_dna` no remoto; a "BrandDNA de 44 kB" da SDD é uma `brand_skill` de 44.510 B). Qual versão é a vigente é decidido no servidor, pela regra de cada dono (seção 3.6);
  - `architect_formation`: o parecer SERP de formação cujo `payload.assessment.id` é o `ArticleDNA.serpAssessmentRef.entityId`, com o 1º nível. **Não** é o `subject_id` da linha, que é o candidateRef (**Verificado em 2026-09-23**, agregado: 0 de 2 casando por `subject_id`, 1 de 1 por `payload.assessment.id` e pelo hash);
  - `video_text`: cada fonte de `bundle.video.sources`, com o status `available`, `removed_after_delivery`, `text_version_missing`, `not_selected` ou `invalid_reference`. Só o texto da **mesma** `processingVersion` do bundle conta.
- Marca errada ou documento inexistente: nenhuma linha.

### 3.4 `writer_evidence_slice(...)`

Assinatura: `(p_brand_id uuid, p_document_id text, p_source text, p_path text[], p_ref text, p_offset integer, p_limit integer, p_max_bytes integer, p_fields text[], p_exclude_keys text[])`.

- Fontes: `document`, `analysis_version`, `radar_run`, `artifact_version`, `video_text`.
- **Ids resolvidos dentro da função** a partir da linha do documento: item do Radar, versão de análise e corrida. `p_ref` só existe para duas fontes:
  - `artifact_version`, aceito apenas se for referência do documento ou versão de BrandDNA ou de Skill (`brand_dna`, `brand_skill`) da mesma marca;
  - `video_text`, aceito apenas com vínculo `ACTIVE` ao artigo e com a versão de texto do bundle.
- Formas de página:
  - **array**: `jsonb_array_elements ... WITH ORDINALITY`, de 1 a 200 itens;
  - **objeto**: por chave, em ordem "C";
  - **texto**: por faixa de caracteres.
- Teto de bytes por página: de 1.024 a **32.768**, padrão 16.384. O item que estouraria o teto acumulado sai com valor `NULL`, `omitted = true` e o `bytes` real. Se a primeira linha já sai omitida, o item é maior que a página, e o chamador desce um nível no caminho. Isso cobre `structure`, `blueprint` e `authorityEvidence` (33–35 kB), fatiados por chave.
- Caminho ausente: uma linha `container_type = 'absent'`. Marca errada, fonte não resolvida, vídeo removido ou texto reprocessado: nenhuma linha. A ausência é declarada pelo manifesto.
- Colunas fixas: `source, ref_id, json_path, container_type, total, ordinal, span, item_key, value_type, bytes, omitted, value`. O próximo cursor é `ordinal + span` da última linha não omitida.

O parecer de formação (média de 38 kB, máximo de 93 kB) **não** passa pela fatia. O leitor o projeta por caminho no PostgREST (`payload->...`), com o manifesto dando os tamanhos por chave.

### 3.5 `writer_evidence_divergences`

As colunas seguem a seção 5 da SDD:

| Grupo | Colunas |
| --- | --- |
| Vínculo | `marca_id`, `document_id` (FK), `article_id`, `dedupe_key` |
| Alvo | `target_kind`, `target_entity_id`, `target_version_id`, `target_content_hash` |
| Afirmação do DNA | `dna_claim_path`, `dna_claim_summary` |
| Evidência | `evidence_source_key`, `evidence_path`, `evidence_etag`, `evidence_hierarchy_level`, `evidence_frozen`, `evidence_observed_at`, `evidence_posterior_ao_pacote` |
| Classificação | `severity`, `suggested_owner`, `origin`, `mcp_grant_id`, `created_by` |
| Decisão humana | `status`, `status_reason`, `status_changed_by`, `status_changed_via`, `status_changed_at`, `blocking_marked_by`, `blocking_marked_at`, `resolution_ref` |

`target_kind` aceita `article_dna`, `keyword_dna`, `silo_dna`, `brand_dna` ou `radar_bundle`. SiloPage fica fora enquanto não houver vínculo determinístico.

Guardas:

- **Inserção**, por gatilho:
  - o registro nasce `aberta`, sem severidade bloqueante e sem campos de decisão;
  - o documento precisa ser da mesma marca e do mesmo artigo;
  - o alvo precisa ser referência do próprio documento: `articleDnaRef`, `siloDnaRef`, `keywordDnaRefs[]`, o `bundleId`/`bundleHash` do dossiê, ou versão de BrandDNA ou de Skill (`brand_dna`, `brand_skill`) da mesma marca;
  - com `mcp_grant_id`, o grant precisa existir em `writer_mcp_grants` com a **mesma marca**, `status = 'active'`, o **mesmo ator** (`actor_user_id = created_by`) e o escopo `writer.draft.write` (D3). Grant com origem diferente de `ia_mcp` é recusado. Com `service_role` o banco não sabe quem chamou; a rota confere o grant, e o gatilho confere de novo.
- **CHECK:**
  - evidência fora do bundle só com hierarquia `OTHER_RADAR_EVIDENCE` ou inferior;
  - evidência `frozen` só com `sourceKey` `radar.bundle.*` e nunca posterior ao pacote;
  - `ia_mcp` exige `mcp_grant_id`, e `mcp_grant_id` só existe com `ia_mcp`;
  - `resolvida` e `descartada` exigem motivo.
- **Atualização**, por gatilho:
  - o conteúdo é imutável;
  - status só muda nas transições `aberta → reconhecida | descartada`, `reconhecida → enviada_ao_dono | descartada` e `enviada_ao_dono → resolvida | descartada`, com `status_changed_by` e `status_changed_via = 'painel_humano'`;
  - severidade só muda para `bloqueante`, com `blocking_marked_by`;
  - registro encerrado não muda mais.
- **Exclusão** recusada por gatilho. Descartar é status.
- **Privilégios:**
  - `authenticated` só lê, pela policy `canonical_actor_can_access_brand(marca_id, auth.uid())`;
  - `service_role` tem SELECT, INSERT e UPDATE restrito às colunas de decisão, sem DELETE;
  - `anon` não tem nada.
- `UNIQUE (marca_id, document_id, dedupe_key)` torna o registro idempotente (AGENTS.md §10).

**Limites conhecidos:**

- O banco não distingue IA de humano, porque as duas rotas usam `service_role`. "IA não atualiza" é garantido pela **rota**: nenhuma ferramenta MCP nem rota da IA interna faz UPDATE. O banco garante o resto: registro `aberta`, conteúdo imutável e ator humano registrado na decisão.
- Só o ator da **última** transição fica gravado. Um histórico por evento fica como pendência.

### 3.6 Chaves de fonte e regras do leitor (etapa B1)

**Verificado no código** (`lib/redator/writer-evidence-catalog.ts`, `lib/server/writer-evidence-reader.ts`, `lib/server/writer-evidence-sources.ts`) e **confirmado por teste** com PostgREST falso. As funções SQL reais ainda não rodaram com o leitor.

Gramática da `sourceKey`, ampliada em relação à SDD para caber no manifesto de 8 kB e refletir o dado real:

- forma geral `<família>[/<ref>][#<caminho.pontuado>]`, e as duas formas com caminho no nome, como na SDD: `radar.bundle.<caminho>` e `run.<apelido>`;
- `dna.keyword/<keywordId>`: a chave é a keyword; a versão servida é sempre a fixada no documento, nunca uma escolhida por quem pede;
- `serp.cache/<keywordId>`, que agrupa as 4 lentes, com `#<lente>` ou `#body` (corpo só da lente canônica). A forma `serp.cache/<lente>/<keywordId>` da SDD também é aceita;
- `dna.brand/current`: o BrandDNA aprovado vigente, pelos eventos de status (`effectiveBrandDnaVersionId`, módulo Marca);
- `brand.skill/<versionId>` (família nova): a Skill corrente da Marca. A regra é a do dono (`selectAvailableSkills`): **primeiro** a maior versão de cada definição, **depois** o filtro de arquivada (`rejected`/`superseded`). Se a versão mais nova foi recusada, a Skill não é oferecida, e a anterior não volta em silêncio;
- estar na gramática não basta: a chave precisa ser alcançável pelas referências do documento. Id inventado é `source_not_in_manifest`.

Regras que o leitor aplica igual no manifesto e na fatia:

- **Frescor:** `posteriorAoPacote` usa a mesma régua (data da fonte depois do `observedAt` do pacote) nas duas camadas, para `dna.brand/current`, `brand.skill/*`, `serp.architect.formation`, `serp.architect.territorial`, `publication.self`, `serp.cache/*` e `serp.radar.snapshot.latest`. DNA fixado no documento nunca é posterior: é a base.
- **Parecer substituído:** se o parecer de formação achado pelo id tem `contentHash` diferente do fixado no ArticleDNA, ele é outro parecer. O manifesto declara a ausência, e a fatia (inclusive `#assessment`) responde `source_absent`. Religar é do Arquiteto.
- **Contexto da Marca sem corte silencioso:** BrandDNA e Skills são lidos em consultas separadas, até 100 versões cada (só metadados). Passando disso, o manifesto declara `brand.skill/*` ou o BrandDNA como ausência parcial, em vez de cortar sem aviso.

---

## 4. Fase 2 — planejada, não implementada

- **O quê:** tirar o dossiê de `content_documents.payload` para uma tabela própria. O documento guarda só o ponteiro `{ bundleId, bundleHash, profile, keywordContext, writerMayNot }`.
- **Por quê:** o `before` de cada salvamento ainda lê o payload inteiro, porque o hash é calculado sobre o documento todo. A sessão cai de ~23 MB (Fase 1) para ~1 MB (ESTIMADO na SDD, seção 7). A mudança também cumpre a invariante 78 ("lido, nunca copiado").
- **Por que não agora:** é estrutural. Mexe em schema, dado existente, contrato de `RadarWriterDossierSchema` e hash do ContentDocument. Exige SDD própria ou adendo aprovado, com plano de volta do dossiê ao payload.
- **Enquanto isso:** as funções desta migration leem o bundle **dentro** do payload. Na Fase 2, `writer_evidence_manifest` e `writer_evidence_slice` passam a ler a tabela nova, sem mudar as colunas de saída.

---

## 5. Como o código degrada antes da migration

O código entra antes de o usuário aplicar a migration. Nenhum caminho baixa MB para compensar a falta das funções.

| Peça | Sem a migration | Detecção |
| --- | --- | --- |
| Manifesto | Lista as fontes e as ausências a partir de consultas estreitas por caminho e coluna (refs do documento, `radarOrigin`, ids e status). Tamanho e contagem saem como **"tamanho desconhecido (migration pendente)"**. Nunca baixa para medir. | Erro PostgREST `PGRST202` ou SQLSTATE `42883` na RPC `writer_evidence_manifest`. |
| Fundamentos | Funcionam, porque só usam caminhos pequenos e fixos, lidos por seletor de caminho do PostgREST: `keywordContext`, `writerMayNot`, `radarOrigin`, especialista, vídeo, conflitos, limitações e o resumo de concorrentes e perguntas. O tamanho da resposta é conferido antes de sair (≤ 24 kB). | Não depende das funções. |
| Fatias | Responde `migration_pendente` para qualquer fonte que dependa de paginação no banco: array do bundle, corrida, elemento de `analysisVersions` e transcrição. Não há plano B que baixe o array inteiro. Só atende, por seletor de caminho, as seções numa **lista fechada** de caminhos com teto medido ≤ 32 kB, e mesmo essas passam pela conferência de bytes antes de sair. | `PGRST202` / `42883` na RPC `writer_evidence_slice`. |
| Snapshot, DNAs, métricas, catálogo, publicações e cache de SERP | Consultas estreitas próprias, com filtro de marca e artigo e colunas escolhidas. Não dependem da migration. Tamanhos pequenos, medidos na SDD. | — |
| Divergências | `record_writer_divergence` e os `alerts` da IA interna respondem `migration_pendente`. **Não** há gravação alternativa em `editorial_workflow_items` nem em DNA. O alerta da IA interna volta na resposta da rota, marcado como "não registrado". | `PGRST205` ou SQLSTATE `42P01` na tabela `writer_evidence_divergences`. |
| Guardião | Continua emitindo as categorias atuais. A leitura das divergências abertas é pulada, com aviso. | Mesmo sinal da tabela. |

A detecção segue o padrão já usado no repositório (`lib/radar/persistence.ts`, `lib/server/agency-onboarding.ts`): código de erro, e nunca a ausência de dados.

---

## 6. Frentes de outros módulos (não fazem parte deste adendo)

- **Radar:** ligar o cache de SERP em coleta `advanced` (custo DataForSEO, decisão do usuário) e congelar a shortlist Amazon.
- **Minerador:** coletar as 4 lentes nas keywords aprovadas (E7 da SDD de egress).
- **Leitores mínimos nos donos** (SDD, seção 4.3): uma função por `version_id` no store da Qualificação e um leitor de transcrição com status e versão. Onde o arquivo pertence a outro dono, o Redator usa consulta estreita própria com a mesma regra de parse. A adição no dono fica registrada como pendência dele.

---

## 7. Rollback

- **Código da Fase 1:** desligar as ferramentas novas e restaurar a saída de `get_writer_document` e `get_writer_brief`. As funções e a tabela ficam inertes.
- **Banco:** o bloco comentado no fim da migration derruba gatilhos, tabela e funções **somente se a tabela estiver vazia**. Com divergências registradas, o rollback é recusado: apagar dado exige autorização própria (AGENTS.md §15). Depois do rollback, rodar `npx supabase migration repair --status reverted 20260923150000 --linked`.

---

## 8. Incertezas

- **Ainda não verificado:** o tempo das funções sobre os arrays grandes (1,4 MB de links observados) dentro do tempo limite do PostgREST.
- **Verificado em 2026-09-23** (agregado): o vínculo do parecer de formação é `payload.assessment.id` = `serpAssessmentRef.entityId`, e não o `subject_id` (0 de 2 por `subject_id`). A migration e o leitor usam `payload.assessment.id`. Parecer refeito troca o id ou o hash: nos dois casos a ausência é declarada.
- **Ainda não verificado:** a conferência do grant MCP no gatilho de inserção de divergências. Criar a tabela ou o gatilho seria escrita remota; a verificação vem depois da aplicação, com o registro real de `record_writer_divergence` (etapa B2).
- **Ainda não verificado:** os bytes medidos pelo banco (`jsonb::text`, com espaços) diferem um pouco dos bytes do JSON que o PostgREST serializa. O teto de 32.768 B vale sobre a medida do banco. O envelope do servidor confere de novo antes de responder.
- **Ainda não verificado:** o vínculo de `keyword_contextual_presentation` e de SiloPage com o artigo. As duas fontes saem como ausência declarada até existir vínculo determinístico.

## 9. Implementação — 2026-09-23 (B0, B1, B2)

Implementado e confirmado por teste. **Validação manual pendente. Migration escrita, não aplicada.** Cada etapa teve dois revisores adversariais e um corretor.

**B0 — leituras estreitas, sem mudar contrato**

| Leitura | Antes | Depois |
| --- | ---: | ---: |
| Readback do salvamento | 4.502.936 B | 1.244 B |
| Guardião do MCP | 4.502.936 B | 1.812 B |
| Seed da IA interna | 4.502.936 B | 74.877 B, em 4 consultas de 5 caminhos |

- O `before` do salvamento continua lendo o payload inteiro, porque o hash e a RPC M6 exigem. Só a Fase 2 remove essa leitura.
- As leituras do alvo do MCP filtram pelas marcas do grant (R4).
- O seed ganhou o código `409 document_changed` para o caso de o pacote mudar entre as consultas.

**B1 — leitor de evidências**

- Arquivos: `lib/redator/writer-evidence-catalog.ts`, `lib/server/writer-evidence-document.ts`, `writer-evidence-sources.ts` e `writer-evidence-reader.ts`.
- Correções de vínculo medidas no remoto e aplicadas à migration:
  - snapshot entregue pelo id do registro no payload;
  - parecer de formação por `payload.assessment.id`;
  - `brand_skill` junto com `brand_dna`.
- Gramática de chaves ampliada:
  - `#caminho` para descer;
  - `dna.keyword/<keywordId>`;
  - `serp.cache/<keywordId>` agrupando as 4 lentes, com `#<lente>` e `#body`;
  - `brand.skill/<versionId>`.
- O manifesto é compacto, com profundidade adaptativa para caber em 8 kB. A fatia marca `posteriorAoPacote` do mesmo jeito que o manifesto.
- Custo por chamada: o cabeçalho do documento custa 3,3 kB e 200 a 400 ms de CPU do banco. Os fundamentos leem ~64 kB do banco e respondem em até 24 kB.

**B2 — MCP, IA interna e divergências**

- **MCP:** 14 ferramentas, as 10 de antes mais `get_writer_evidence_manifest`, `get_writer_foundations`, `read_writer_evidence` e `record_writer_divergence`.
  - A instrução do servidor manda ler manifesto → fundamentos → fatias, proíbe FAQ, trata dado de terceiros como pesquisa e registra divergências.
  - **Mudança de contrato (D4):**
    - `get_writer_document` sai sem `importedContext`, `editorContent`, `serpSnapshotRefs`, `evidenceRefs`, `sourceIds`, `linkMap` e `instructions` (os quatro últimos seguem no briefing), e cai de 4.502.936 B para 4.036 B;
    - `get_writer_brief` leva o dossiê como ponteiro (`bundle: "not_included"`), com `guards` e teto de 32 kB, e cai para 2.850 B.
- **IA interna:** pacote por seção de até 24 kB, montado no servidor (`lib/redator/writer-section-evidence.ts`, `lib/server/writer-evidence-ai.ts`).
  - Os `alerts` da IA viram divergência.
  - As rotas `section` e `improve` respondem `{ proposal, evidence, divergences }`.
  - Correção necessária: `contentPlanRef` passou a aceitar nulo. Antes, a seção de documento v2 dava 400.
- **Divergências:**
  - a IA só cria `aberta`, e o etag é calculado pelo servidor;
  - uma divergência bloqueante aberta barra o envio a Publicações (`writer_publication_divergence_blocking`);
  - o Guardião lê as divergências abertas e emite `intent`, `evidence` e `cannibalization`, com aviso quando não consegue ler.
  - Antes da migration, tudo responde `migration_pendente`.
- **Sessão MCP típica:** ~58,5 MB → ~23 MB. O que sobra é o `before` de cada salvamento; a Fase 2 leva a ~1 MB.

**Pendente**
- Aplicar a migration, pelo usuário, e conferir no banco os gatilhos e as recusas reais.
- Painel humano: decidir o status das divergências (reconhecer, enviar ao dono, resolver, descartar, bloqueante) e o cache IndexedDB. Sem ele, as divergências ficam abertas.
- `app/api/editorial/documents/route.ts` (Radar): a aprovação ainda chama `runGuardian` sem divergências.
- `lib/server/writer-publication-handoff.ts` ainda lê o documento inteiro.
- Usar `writer_evidence_slice` no pacote da IA interna depois da migration.
- Checagem de sobreposição literal com texto de terceiros no Guardião.
- Leitores mínimos nos donos: Qualificação por `version_id` (Minerador) e transcrição (Radar).
- A invariante 78 ("uma única projeção do dossiê") passa a ter duas projeções de leitura, os fundamentos e o pacote por seção. Nada é copiado nem persistido; propor a emenda à invariante.
