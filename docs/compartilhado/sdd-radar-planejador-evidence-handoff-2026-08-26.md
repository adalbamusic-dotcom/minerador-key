# SDD — Handoff canônico de evidências Radar → Planejador

Status: Aprovada e implementada. **O contrato vigente é o v3**
(`RADAR_PLANNER_CONTRACT_VERSION = 3` em `lib/radar/planner-handoff.ts`). Não
autoriza migration, operação remota ou chamada externa.

## Sucessão v2 → v3 — 2026-09-11

O corpo desta SDD descreve o gate v2 e permanece como histórico da decisão. O
que mudou no v3, com a Fase 1 da Pesquisa Google homologada:

- a fonte passa a ser **ArticleDNA aprovado + `RadarFrozenEvidenceBundle`
  íntegro + o dossiê de evidência correspondente**, em vez de um relatório
  aprovado avulso;
- o envelope inclui o `RadarEditorialBlueprint` **diretamente**, além de
  `SpecialistBriefs` e `VideoBriefs` congelados;
- o vínculo de identidade é `articleId + articleDnaVersionId +
  articleDnaContentHash`: evidência não sobrevive ao fundamento que a originou;
- três identidades permanecem distintas e não devem ser confundidas: hash do
  ArticleDNA, hash do bundle do Radar (`bundle:<hex>`) e hash do handoff
  (`handoff:<hex>`).

O limite não mudou: o envelope **não** é um `ContentPlan`. O Planejador não
pesquisa de novo, não reinterpreta o Radar como investigação nova e não remonta
o Blueprint do zero — ele decide o `ContentPlan` final.

Módulos proprietários: Radar e Planejador, com contrato compartilhado da Plataforma.

## Consolidação do gate — 2026-08-26

```text
RADAR_PLANNER_HANDOFF_V2=PASS
BACKWARD_COMPATIBILITY=PASS
HANDOFF_DATABASE_CHANGE_REQUIRED=NO
PERSISTENCE=EXISTS_NEEDS_ADAPTER
RADAR_HANDOFF_V2=READY
PLANNER_READ_CONTRACT=READY
CONTENTPLAN_BOUNDARY=PRESERVED
```

O envelope sucessor é versionado, aditivo e retrocompatível. Preserva
`ArticleDNA`, `brandId`, `articleId`, `articleDnaVersionId`, `SiloDNA`,
evidências SERP, `ExpertEvidence` opcional, `ProductEvidence` opcional/futura,
decisões humanas, proveniência e hashes/versionamento. `ContentPlan` continua
uma entidade decisória própria do Planejador.

O campo opcional `internalLinkGraphRef` pode acompanhar o envelope quando
existir um grafo aprovado. Ele é uma referência versionada de contexto, não
um bypass nem autorização de mutação: o Radar não altera a estrutura do
grafo, e o Planejador não transforma a referência em decisão final de
conteúdo. A fundação persistente do grafo ainda depende das migrations locais
preparadas e de aplicação/readback manual.

## 1. Problema e limite

O Radar já registra análise e um pacote de evidências, mas o transporte atual
para o Planejador ainda depende de um objeto legado e não prova, no mesmo
envelope, a identidade editorial, a aprovação humana, a proveniência e a
versão do pacote. O handoff precisa ser aditivo e retrocompatível.

Esta SDD autoriza somente adaptação local de contratos, serialização,
workflow JSON existente, writeback de worker já preparado e testes. Não altera
ArticleDNA, ContentPlan, SiloDNA, Telegram, Amazon, schema remoto, RLS,
providers ou migrations.

## 2. Contrato aprovado

`RadarPlannerHandoff` é uma sucessora versionada (`schemaVersion = 2`) e só
fica apta para entrega quando `status = APPROVED`. Ela preserva:

- `brandId`, `radarItemId`, `articleId` e `articleDnaVersionId`;
- referência opcional à versão de `SiloDNA`;
- relatório consolidado aprovado, versão, hash e decisões humanas;
- snapshot SERP, versão, hash, query, referências aprovadas e provider;
- `ExpertEvidence[]` opcional e `ProductEvidence[]` compatível, sem
  implementação Amazon;
- proveniência, ids de contribuições/evidências, versão anterior e hash do
  envelope.

O envelope não é um `ContentPlan`. O Planejador o recebe como evidência de
origem e transforma, sob decisão humana própria, essa evidência em um
`ContentPlan`. Nenhum outline, CTA, meta, densidade ou instrução do Guardião
é enviado pelo Radar como decisão final.

Novas coletas SERP do fluxo operacional usam somente `dataforseo`; não existe
nova chamada Serper. Pacotes históricos `serper` que já são válidos e aprovados
continuam legíveis e podem gerar o envelope de handoff sem perder o provider
histórico na provenance.

## 3. Persistência e compatibilidade

O repositório atual de workflow já persiste payload JSONB e versões de análise.
O destino é `EXISTS_NEEDS_ADAPTER`: o envelope é carregado em
`RadarAnalysis.plannerPackage` e copiado para o `PlannerItem.radarHandoff`
quando a importação é explícita. Itens antigos sem esse campo continuam
hidratáveis; não há migração B enquanto o contrato JSON existente suportar o
adaptador.

O workflow mantém a deduplicação por artigo, lock otimista e isolamento por
`brandId`. Um envelope de outra marca, artigo ou versão é descartado/bloqueado
antes de chegar ao Planejador.

## 4. Telegram e worker

O worker local não cria nova fila. A saída de preservação de mídia escreve
`original_asset_uri`, checksum e estado processado na contribuição da mesma
marca antes de concluir o job. Falha no writeback impede a conclusão do job.
Transcrição, extração e organização continuam camadas derivadas e não são
geradas nesta etapa.

## 5. Gate e validação

O gate local exige identidade, relatório aprovado, proveniência e hash. O
provider DataForSEO é obrigatório para novas coletas; um pacote histórico
Serper válido/aprovado é aceito sem conversão silenciosa de provenance. A
fundação Telegram/Experts está `REMOTE VERIFIED` e
`TELEGRAM_REMOTE_FOUNDATION=READY`, incluindo RLS, grants, claim/lease/retry/
backoff, writeback e isolamento cross-brand. Inbound Telegram real, texto,
áudio e Speech real continuam `PENDING` e não são afirmados como concluídos.

Nenhuma chamada paga, migration, escrita remota, smoke Telegram ou smoke SERP
real faz parte desta implementação.
