# SDD — Leitor de evidências do Redator — 2026-09-23

## Identificação

- **Módulo proprietário:** Redator. Minerador, Marca, Arquiteto, Radar e Publicações são **só lidos**, pela regra de parse de cada dono e com consultas estreitas próprias.
- **Pedido do usuário (2026-09-23):** *"no redator também pode disponibilizar todo os dados da SERP para que a IA que vai escrever o artigo possa consultar e confrontar com os dados recebidos nos DNAs, assim como os dados do especialista, da amazon, e do youtube. tem que estar todas as informações disponível lá pra a criação do texto dos artigos."*
- **Estado:** proposta. **Aguarda autorização** (seção 11). Nenhum código, migration ou escrita remota foi feito por esta SDD.
- **Precedência:** abaixo de invariantes, ADRs e da [SDD de egress](../../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md), cujas regras R1–R24 esta SDD obedece. Depende da E1 dessa SDD, em implementação.
- **Origem:** mapeamento em 4 frentes, desenho e verificação adversarial em 3 lentes (egress; contrato e governança; completude). As três lentes corrigiram o desenho inicial; as correções estão incorporadas aqui.

---

## 1. Problema, medido

**Duas IAs escrevem, e nenhuma recebe tudo.**

| IA | Onde | O que recebe hoje |
| --- | --- | --- |
| Externa, via MCP (ChatGPT homologado em 19/09; Claude previsto) | `app/api/mcp/redator/route.ts` | `get_writer_brief` devolve o dossiê do Radar **inteiro** (4.475.038 B no documento GOOGLE); `get_writer_document` devolve o mesmo peso de novo. Nenhuma ferramenta lê DNA, SERP bruta ou corrida. |
| Interna (DeepSeek) | `/api/redator/section`, `/improve`, `/seed` | Seção e melhoria **não recebem nada do dossiê** (`lib/redator/prompts.ts:15-43`). O seed recebe só agregados (`lib/redator/radar-foundations.ts:132-255`): o especialista vira um boolean, o vídeo vira contagem. |

**O que não chega a nenhuma das duas:** SERP bruta do Radar (`serpSnapshotRefs` é gravado `[]`, `lib/redator/radar-import.ts:268`); SERP do Minerador, do Arquiteto e do cache de SERP; corridas do Radar (extrações, relatório competitivo, universo do YouTube, produtos Amazon); transcrições integrais; os DNAs, que chegam só como referência (`lib/arquiteto/contracts.ts:69-73`); métricas das keywords; InternalLinkGraph canônico; catálogo do site da marca; publicações.

**O dossiê inteiro não serve à IA.** 4,47 MB são ~1,1 a 1,3 milhão de tokens (ESTIMADO): não cabem no contexto de nenhum modelo. 99% dele é `observed` (links externos observados 1,4 MB; evidência 1,3 MB, com `evidence.structural` carregando uma **cópia idêntica** de `evidence.semantic`, 525 kB; links internos de concorrentes 0,87 MB). As partes editorialmente úteis somam ~0,25 MB (MEDIDO por chave).

**O custo de egress de uma sessão de escrita é alto por outro motivo: salvar.** Fórmula verificada no código, com P = payload do documento (4.479.508 B, MEDIDO), g = chamadas do Guardião e s = salvamentos:

`E = (2 + g + 2s) · P`

- brief e document leem P cada (`route.ts:31-34, 168, 175`);
- o Guardião lê P (`route.ts:189`);
- cada salvamento lê P no `before` e de novo no readback (`lib/server/writer-deliverables.ts:38-39, :58`);
- o seed da IA interna lê P a cada geração (`lib/server/writer-seed.ts:24-25`).

Com g = 1 e s = 5: **~58 MB por artigo** (ESTIMADO sobre P MEDIDO), mais da metade da meta diária de 100 MB.

**PAA e AI Overview não existem em nenhuma fonte gravada.** Os 10 snapshots do Radar têm PAA vazio (MEDIDO), e o cache de SERP, que guarda perguntas, buscas relacionadas e citações do AI Overview, está vazio no remoto e ainda não é usado pelo Radar.

---

## 2. Objetivo

A IA que escreve — externa e interna — tem **acesso** a toda a evidência do artigo e aos DNAs, pode **confrontar** uma com a outra e **registra** as divergências para decisão humana. Tudo com três limites:

1. **Disponível não é baixado.** Nenhuma chamada comum devolve MB.
2. **Ler não é mudar.** A IA não altera DNA, pacote do Radar nem decisão humana (`AGENTS.md` §9; invariantes 2 e 30).
3. **Uma autoridade de entrega.** O dossiê congelado continua sendo a base; o que for posterior aparece como observação datada, nunca como segundo canal Radar → Redator (invariante 51).

---

## 3. Inventário das fontes

Chave = `sourceKey` no manifesto. Toda fonte fora do dossiê congelado tem `posteriorAoPacote` e `supersedes: false` quando for mais nova que o pacote.

| Fonte | `sourceKey` | Dono | Como se chega a partir do documento | Tamanho (MEDIDO salvo indicação) |
| --- | --- | --- | --- | --- |
| Dossiê congelado, seções pequenas | `radar.bundle.<caminho>` | Radar | `importedContext.dossier.bundle` | competitors 21 kB, questions 19 kB, gaps 15 kB, differentiations 32 kB, entities 18 kB, structure 35 kB, authorityEvidence 33 kB, blueprint 35 kB |
| Dossiê congelado, seções grandes | idem, paginadas | Radar | idem | concepts 321 kB, aiDiscovery 213 kB, internalLinks 869 kB, externalSources 1,42 MB, evidence.semantic 525 kB (`structural` declarado como alias) |
| Especialista congelado | `radar.bundle.specialist` | Radar | idem | 2,8 kB |
| Vídeo da biblioteca congelado | `radar.bundle.video` | Radar | idem | 14 kB |
| Transcrição do vídeo | `video.transcript/<videoSourceId>` | Radar | só ids de `bundle.video.sources`, com `status = 'ACTIVE'` para o artigo **e** a mesma versão de texto que sustentou o bundle; senão, ausência declarada | 97 kB de texto em 4 vídeos; página ~16 kB |
| Snapshot SERP do Radar | `serp.radar.snapshot` | Radar | `radarOrigin.analysisVersionId` → `serpSnapshotId` da versão | até 12,6 kB por snapshot; sai com status e revisão humana |
| Relatório competitivo | `run.competitiveReport` | Radar | corrida da versão entregue, por `version_id` | ~22 kB (ESTIMADO) sem o modelo observado, que já está no bundle |
| Extrações de concorrentes | `run.extractions` | Radar | idem | 843 kB por corrida; índice e páginas por item, sem `observedLinks` por padrão |
| Universo do YouTube | `run.youtube.universe` / `.results` | Radar | idem | 119 kB na versão entregue; campos editoriais projetados |
| Produtos Amazon | `run.amazon.products` | Radar | idem | até 159 kB por versão; **nenhum documento AMAZON existe hoje** |
| Qualificação Semântica (KeywordDNA) | `dna.keyword/<versionId>` | Minerador | versões de `keywordDnaRefs` (5/5 resolvem) | ~3,8 kB por versão |
| Apresentação contextual | `dna.keyword.presentation/<versionId>` | Minerador | vínculo a verificar na implementação; sem vínculo determinístico, ausência declarada com motivo | 252 versões na base |
| Métricas da keyword | `dna.keyword.metrics/<keywordId>` | Minerador | ids de `keywordDnaRefs`; volume, KGR, allintitle, CPC, concorrência pelo snapshot canônico do Minerador | < 1 kB por keyword (ESTIMADO) |
| ArticleDNA | `dna.article/<versionId>` | Arquiteto | `articleDnaRef` | média 35 kB, máximo 73 kB; projeção editorial nos fundamentos |
| SiloDNA / SiloPage | `dna.silo/<versionId>`, `dna.siloPage/<versionId>` | Arquiteto | `siloDnaRef`; referência legada declara "sem versão fixada" | 10 kB / 3,4 kB |
| Parecer SERP de formação | `serp.architect.formation` | Arquiteto | `ArticleDNA.serpAssessmentRef.entityId` (5/5) | média 38 kB; projeção compacta ~3-5 kB (ESTIMADO) |
| SERP territorial | `serp.architect.territorial` | Arquiteto | `territoryRef` | ~1,1 kB |
| InternalLinkGraph | `graph.article/<graphVersionId>` | Arquiteto | a versão congelada pelo Radar; mais nova só como posterior | arestas de entrada e saída do artigo |
| Cache de SERP, 4 lentes | `serp.cache/<lente>/<keyword>` | compartilhado (dono do dado: Minerador) | chave determinística a partir da consulta da Qualificação fixada (`serpCacheSubjectId`) | observação ~0,9 kB por lente; corpo 26-34 kB só sob demanda (ESTIMADO; 0 linhas no remoto) |
| BrandDNA | `dna.brand/current` | Marca | versão vigente, rotulada "não fixada no documento" | 44 kB, paginada por seção |
| Catálogo do site | `brand.site.catalog` | Marca | `marca_id`; url, title, h1, page_type | paginado |
| Publicações | `publication.self`, `publication.brand` | Publicações | registro do próprio artigo (travado ou revisável) e publicados da marca | paginado |

**Fora de propósito:**
- **Especialista posterior ao envio:** o manifesto traz só a **contagem**, com o aviso "há contribuição posterior; reenvio pelo Radar". Ler o conteúdo abriria um segundo canal de entrega (invariante 51).
- **Shortlist editorial da Amazon:** é conclusão do Radar e hoje não é congelada (`observed.products = []`, `lib/radar/amazon-evidence.ts:9-12`). Recalculá-la no Redator fere a invariante 30. Até o Radar congelá-la, o Redator expõe só a lista de produtos, rotulada "pesquisa, não congelada".

---

## 4. Desenho

### 4.1 Um leitor, três camadas

- `lib/redator/writer-evidence-catalog.ts` (puro): chaves, projeções, limites de página e envelope.
- `lib/server/writer-evidence-reader.ts`: resolve cada chave a partir da **linha do documento**.

**(1) Manifesto** — `get_writer_evidence_manifest { documentId }`. Lista cada fonte e cada ausência declarada: chave, módulo dono, versão ou hash, data, status (congelado, fixado, posterior, needs_review), bytes, itens, páginas e etag. Alvo ≤ 8 kB. **Não lê payload:** bytes e contagens vêm de uma função SQL que devolve `length(x::text)` e `jsonb_array_length` por caminho, para o documento **e** para as fontes externas. Onde a função não alcançar, o manifesto declara "tamanho desconhecido". Ele nunca baixa para medir.

**(2) Fundamentos** — `get_writer_foundations { documentId }`. Sempre pequeno, ≤ 24 kB:
- `keywordContext`, `writerMayNot`, a hierarquia de evidência;
- `radarOrigin`, decisões pendentes, conflitos e limitações do bundle;
- projeção editorial do ArticleDNA (~0,9 kB MEDIDO): promessa, público, problema, ângulo, intenção, etapa da jornada, fronteira anticanibalização, tópicos obrigatórios e excluídos, entidades, evidência necessária, CTA, diferenciação, política da principal;
- especialista e vídeo congelados;
- concorrentes e perguntas resumidos (url, título, posição).

Substitui o `get_writer_brief` como porta de entrada.

**(3) Fatias** — `read_writer_evidence { documentId, sourceKey, cursor?, fields?, ifNoneMatch? }`.
- `sourceKey` precisa constar do manifesto daquele documento. Chave ou id inventado é recusado (`AGENTS.md` §9).
- Página padrão 16 kB, máxima 32 kB para arrays. Objeto maior que isso (structure 34,6 kB, blueprint 34,6 kB, authorityEvidence 33,0 kB) é fatiado **por chave**.
- `ifNoneMatch` igual ao etag responde `not_modified` sem ler nada.
- **Paginação no banco**, por uma função SQL só de leitura, porque o PostgREST não pagina array nem projeta campo dentro de elemento. A função cobre `content_documents`, `radar_analysis_runs`, `radar_video_source_texts`, `editorial_artifact_versions` e o elemento de `analysisVersions` por `versionId`. Recebe `p_brand_id`, `p_document_id` e o caminho, e devolve colunas fixas.

### 4.2 Envelope de toda resposta

`{ sourceKey, origin { module, entityId, versionId, contentHash, collectedAt, status }, frozen, posteriorAoPacote, supersedes: false, usage: "research_only", writerMayNot, hierarchyLevel, etag, page { cursor, next, total }, data }`

- `writerMayNot` vem de `RADAR_WRITER_MAY_NOT` (`lib/redator/writer-handoff.ts:22-30`).
- `hierarchyLevel` segue `RADAR_EVIDENCE_HIERARCHY` (invariante 35). Fonte fora do dossiê congelado — cache de SERP, snapshot `needs_review`, SERP do Minerador ou do Arquiteto — sai como **"observação não revisada pelo Radar"** (`OTHER_RADAR_EVIDENCE` ou inferior), **nunca** `CURRENT_SUFFICIENT_SERP`. Quem decide suficiência é o Radar (invariante 27).

### 4.3 Leitura de outros módulos

**Pela regra de parse do dono, com consulta estreita própria**, nunca pelos resolvers atuais que baixam MB. MEDIDO: `findByArticleHydratingVersions` lê ~2,5 MB no documento GOOGLE; o parecer de formação e o ArticleDNA só têm leitores da marca inteira. Onde faltar leitor, a adição é **mínima e aditiva no módulo dono**, com regressão:
- no Minerador, uma função por `version_id` no store da Qualificação, com o parse do próprio Minerador (preserva `keyword_page_type` e `site_origin`);
- no Radar, um leitor de transcrição por `videoSourceId` que confere status e versão do texto.

Corridas são lidas por `version_id`, **nunca** por `findByArticle` (R9).

### 4.4 Três consumidores

- **MCP externo:** as três ferramentas. A instrução do servidor (`route.ts:71`) passa a ser *manifesto → fundamentos → fatias conforme a seção que está escrevendo*. `get_writer_document` devolve só blocks, metadata, status, refs e `radarOrigin`, e `get_writer_brief` troca o dossiê por um ponteiro ao manifesto: as duas são **mudança de contrato de saída**.
- **IA interna:** o servidor monta um pacote por seção, ≤ 24 kB, com os fundamentos e as fatias ligadas ao título da seção (perguntas, lacunas, entidades, claims de autoridade), pelo mesmo leitor. `createSectionPromptContext` ganha o bloco de evidência. O servidor nunca confia em evidência vinda do navegador. Os `alerts` que a IA interna já devolve e hoje se perdem (`app/api/redator/section/route.ts:13`; `improve/route.ts:11`) passam a virar divergências.
- **Painel humano:** o mesmo manifesto e as mesmas fatias. Cache no IndexedDB por `(actorUserId, brandId, bundleHash|versionId, caminho)`, conforme R20-R23. Seções congeladas e versões imutáveis dispensam invalidação; fontes mutáveis são conferidas pelo etag do manifesto.

### 4.5 Guardas editoriais em toda instrução e todo pacote

- **Não gerar nem sugerir FAQ** (`AGENTS.md` §13). Expor PAA e perguntas sem essa guarda empurraria FAQ para o texto; hoje não há guarda em `prompts.ts`, `writer-handoff.ts` nem `route.ts`.
- **Dado de terceiros** (títulos, trechos, transcrições, produtos) é pesquisa: não copiar trecho nem reproduzir título concorrente; parafrasear e confrontar. A listagem trunca trechos em 300 caracteres; o texto integral só sai na página do item. Checagem de sobreposição literal no Guardião fica como etapa posterior.
- Conflito entre fonte factual e recorrência de mercado **fica escrito dos dois lados** (invariante 27).

---

## 5. Confronto com os DNAs

**A IA lê e confronta; quem muda DNA é o dono, por decisão humana.**

- Ferramenta `record_writer_divergence`. Os `alerts` da IA interna usam o mesmo registro.
- Campos:
  - `target { kind, entityId, versionId, contentHash }`, obrigatoriamente uma referência do próprio documento;
  - `dnaClaim { path, resumo }`;
  - `evidence { sourceKey, path, etag, hierarchyLevel, observedAt, posteriorAoPacote }`;
  - `severity`: info ou alerta. **Bloqueante só por ator humano.**
  - `suggestedOwner` (arquiteto, radar, minerador, marca) e `origin` (ia_mcp, ia_interna, humano);
  - `status`: aberta → reconhecida → enviada ao dono → resolvida por decisão humana, ou descartada.
- A IA **só cria** registros "aberta". Não edita, não resolve e não escreve em `ArticleDNA.alerts`, `SiloDNA.possibleConflicts` nem `pendingDecisions`.
- O Guardião lê as divergências abertas e passa a emitir as categorias `intent`, `evidence` e `cannibalization`, que já existem no enum (`lib/editorial/operational-contracts.ts:34`) e não são usadas (`lib/redator/guardian.ts:27-65`).
- A resolução acontece no módulo dono, com nova versão, e volta ao Redator por "Atualização disponível".

**Onde gravar.** Em `editorial_workflow_items` com `stage = 'writer'` e `article_id` preenchido **não serve**: `findByArticleRaw` e `importItem` leem por marca + artigo + estágio sem filtrar `subject_type` e usam `maybeSingle`/`single` (`lib/server/editorial-repositories.ts:331-333, :495`). Uma divergência derrubaria essas leituras, e `list`/`listByStage` a devolveriam como item do pipeline. **Recomendação:** tabela própria `writer_evidence_divergences`, com RLS por marca e só inserção pela IA, na mesma migration das funções de leitura. Alternativa sem tabela nova: `article_id` nulo, vínculo no payload, `subject_id` único e filtro de `subject_type` acrescentado a `findByArticleRaw` e `importItem`, com regressão.

---

## 6. Escopos do MCP e isolamento por marca

- **Escopos hoje:** `writer.read`, `writer.draft.write` e `writer.media.brief`, com CHECK em `writer_mcp_grants.scopes` (`supabase/migrations/20260919120000_m7_writer_mcp_oauth_grants.sql:75-78`) e conferidos a cada chamada.
- **Opção A, recomendada:** leitura sob `writer.read` (o grant já consentido lê hoje o dossiê inteiro) e divergência sob `writer.draft.write`. Sem migration de escopo e sem reconsentimento.
- **Opção B:** escopos novos `writer.evidence.read` e `writer.divergence.write`. Exige migration que troca o CHECK, `WRITER_MCP_SCOPES` e `WRITER_MCP_SCOPE_LABELS` (`lib/redator/mcp-consent-domain.ts:10-20`), tela de consentimento e renovação do grant.
- **Chamadas:** toda chamada nova passa pelo mesmo `call` (`route.ts:106-139`), com auditoria, agência vigente e `assertEditorialPermission` (`view`; `edit` para divergência).
- **Isolamento:** a marca vem **sempre** da linha do documento, conferida contra o grant. Toda consulta filtra `marca_id`/`brand_id` **e** o artigo, porque o service role ignora RLS (R4). Ids de versão, snapshot, corrida e vídeo vêm só das referências do documento; o cliente escolhe apenas uma `sourceKey` do manifesto.
- **Funções SQL:** `p_brand_id` obrigatório, `SECURITY INVOKER`, `EXECUTE` só para `service_role`.

---

## 7. Egress

Definições: P = payload do documento; B = blocks (1,1 kB MEDIDO hoje; ~40 kB num artigo completo, ESTIMADO); P' = payload sem o dossiê (≤ 4,3 kB MEDIDO); R = evidência lida sob demanda numa sessão.

| Fase | Fórmula | Sessão típica (g=1, s=5) |
| --- | --- | ---: |
| Hoje | `(2 + g + 2s) · P` | **~58 MB** |
| 0 — localizadas | `(2 + s) · P + (1 + g) · B` | ~31 MB |
| 1 — leitor | `M + F + R + (1 + g) · B + s · (P + B)` | ~23 MB |
| 2 — dossiê fora do payload | `M + F + R + (1 + g) · B + 2s · (P' + B)` | **~1 MB** |

- **R típico**, leitura ampla de um artigo GOOGLE (ESTIMADO): bundle útil ~225 kB, DNAs ~125 kB, SERP ~160 kB, transcrições ~100 kB, YouTube ~50 kB. Total **~0,6-0,8 MB**.
- **Por chamada:** manifesto ≤ 8 kB, fundamentos ≤ 24 kB, fatia ≤ 32 kB, `not_modified` ~0,3 kB.
- **IA interna:** ≤ 24 kB por seção.

O que sobra na Fase 1 é o `before` de cada salvamento: o hash é calculado sobre o documento inteiro (`writer-deliverables.ts:44-45`). Só a Fase 2 remove esse custo.

---

## 8. Fases e ordem

1. **Esperar a E1** (listagem da mesa sem o dossiê; em implementação).
2. **Fase 0 — localizada**, sem mudança de contrato, cada item com teste de forma de leitura (R16):
   - readback do salvamento por caminho (`blocks`, `content_hash`, `lock_version`, `current_version_id`) em `saveWriterArticleDraft`;
   - Guardião do MCP lendo só `id`, `blocks` e `metadata` (`runGuardian` usa `document.id`);
   - seed da IA interna lendo só os caminhos do dossiê que `radarFoundationsOf` usa, e não o payload inteiro.
3. **Fase 1 — leitor**, depois da autorização desta SDD e da migration executada pelo usuário: funções de manifesto e fatia, divergências, três ferramentas MCP, pacote da IA interna, guardas, painel.
4. **Fase 2 — dossiê fora do payload**: tabela própria com ponteiro `{ bundleId, bundleHash, profile, keywordContext, writerMayNot }` no documento. Cumpre a invariante 78 ("lido, nunca copiado") e derruba o salvamento de ~4,5 MB para kB. Estrutural: schema, dado, contrato de `RadarWriterDossierSchema` (`lib/arquiteto/contracts.ts:1888-1901`) e hash. Exige SDD própria ou adendo.
5. **Frentes de outros módulos**, sem as quais parte da evidência não existe:
   - **Radar ligado ao cache de SERP**, em coleta `advanced`, por adendo à SDD do cache: sem isso não há PAA, buscas relacionadas nem AI Overview. Custa DataForSEO. O Redator **nunca coleta** (invariante 50).
   - **4 lentes nas keywords aprovadas** (E7 da SDD de egress).
   - **Shortlist Amazon congelada pelo Radar.**

---

## 9. Testes

- **Forma de leitura** (R16, comentários removidos antes de casar): nenhuma consulta do leitor seleciona `payload` inteiro; todas filtram marca e artigo; corridas só por `version_id`; readback do salvamento e Guardião estreitos.
- **Isolamento com duas marcas:** documento da marca A com grant da B responde `document_not_found`; `sourceKey` fora do manifesto é recusada; id inventado é recusado; função SQL com `p_brand_id` errado devolve vazio. Cobre também métricas, catálogo, Graph e publicações.
- **Paginação e limites:** nenhuma fatia passa de 32 kB; manifesto ≤ 8 kB; fundamentos ≤ 24 kB; ordem estável; cursor determinístico; `ifNoneMatch` igual não consulta payload.
- **Paridade:** fatias concatenadas = seção do bundle congelado; `structural` sem a cópia de `semantic`, com alias declarado; perfil YOUTUBE com `observed` como ausência declarada, nunca vazio.
- **Frescor e autoridade:**
  - dado posterior sai com `posteriorAoPacote = true` e `supersedes = false` e não muda o `evidenceBundleHash`;
  - o nível de hierarquia das fontes fora do bundle nunca é `CURRENT_SUFFICIENT_SERP`;
  - vídeo removido depois do envio, ou texto reprocessado, sai como ausência;
  - especialista posterior aparece só como contagem.
- **Minerador pelo resolver dele:** Qualificação por `version_id` preserva `keyword_page_type` e `site_origin`; consumidores atuais do store continuam verdes.
- **Divergência:** a IA só cria "aberta"; o alvo casa com referência do documento; nenhuma escrita em DNA; bloqueante só por humano; `findByArticleRaw` e `importItem` continuam lendo uma linha.
- **Escopos:** as 10 ferramentas atuais seguem iguais (`redator-mcp-protocol`, `redator-mcp-alvo-sem-payload`, `redator-mcp-agency-boundary`, `redator-multiformato-mcp`); na opção B, grant sem o escopo novo recebe `scope_denied`.
- **Guardas:** instruções e pacote contêm "não gerar nem sugerir FAQ" e a regra de dado de terceiros.
- **IA interna:** pacote ≤ 24 kB montado no servidor; mocks do DeepSeek, sem chamada paga.
- **Regressões da E1:** salvamento preserva o dossiê; F5; lock desatualizado.
- tsc, lint direcionado e `git diff --check`. Depois: sessão real com o ChatGPT (homologação do usuário) e readback de `writer_mcp_call_events` e dos bytes por agregado.

---

## 10. Compatibilidade e rollback

- **Aditivo** para as ferramentas novas: as 10 atuais continuam. As saídas de `get_writer_document` e `get_writer_brief` mudam na Fase 1; um cliente que leia o dossiê pelo brief passa a seguir o ponteiro ao manifesto.
- **Rollback da Fase 0:** reverter as projeções; nada muda no banco.
- **Rollback da Fase 1:** desligar as ferramentas novas e restaurar brief e document; as funções SQL e a tabela de divergências ficam inertes até `DROP` pelo usuário.
- **Rollback da Fase 2:** exige plano próprio de volta do dossiê ao payload; definido na SDD dela.

---

## 11. Decisões do usuário

- [ ] Aprovar esta SDD (leitor, três ferramentas, pacote da IA interna, guardas).
- [ ] Aprovar a migration, executada pelo usuário, com as funções SQL de manifesto e fatia e a tabela `writer_evidence_divergences`.
- [ ] Escopos: **opção A** (recomendada, sem migration de escopo) ou **opção B** (escopos novos e reconsentimento).
- [ ] Aceitar a mudança de saída de `get_writer_document` e `get_writer_brief`.
- [ ] Fase 2: tirar o dossiê do payload (recomendado; ~58 MB → ~1 MB por sessão).
- [ ] Ligar o Radar ao cache de SERP em coleta `advanced` (frente do Radar; custo DataForSEO).
- [ ] Radar congelar a shortlist Amazon.
- [ ] Fixar a versão da BrandDNA no documento, ou ler sempre a vigente rotulada.

A **Fase 0** é localizada e entra logo depois da E1, sem esperar estas decisões.

---

## 12. Incertezas

- Estado final da E1 ainda não integrado.
- Desempenho das funções de fatia sobre arrays grandes (1,4 MB de links observados) no tempo limite do PostgREST: não verificado.
- Tamanhos do cache de SERP estimados offline: 0 linhas no remoto.
- Camada Amazon sem caso real.
- Se ChatGPT e Claude consomem bem fatias de 16-32 kB: premissa pelo tamanho de contexto, não por teste.
- Vínculo de `keyword_contextual_presentation` e SiloPage com o artigo: a verificar na implementação.
- Número de salvamentos por sessão (s = 5) e tamanho de um artigo completo (~40 kB): hipóteses.
- Se a poda do histórico do Radar apaga as corridas da versão entregue: não verificado.
