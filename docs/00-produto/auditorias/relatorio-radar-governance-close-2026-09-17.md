# Relatório — Radar / Governança documental do fechamento da fase — 2026-09-17

Registro datado do gate `RADAR_GOVERNANCE_CLOSE`. **Gate documental**: nenhum
código, componente, API, SQL, migration, fixture de produção, runtime, teste,
ArticleDNA, handoff ou Planejador foi alterado por ele.

Este arquivo é fotografia, não contrato. O que vale como estado é
[docs/05-radar/estado-atual.md](../../05-radar/estado-atual.md); o que vale como
regra permanente é [docs/05-radar/spec.md](../../05-radar/spec.md); o que vale
como dívida aberta é a seção **Dívidas abertas** no topo de
[docs/05-radar/backlog.md](../../05-radar/backlog.md).

## O que este gate fecha

A fase Radar produziu, entre 2026-09-11 e 2026-09-17, mudanças que os documentos
canônicos ainda não registravam:

```text
os três perfis competitivos implementados        GOOGLE · YOUTUBE · AMAZON
perfil de pesquisa separado de saída editorial
dossiê canônico resolvido uma vez                dois consumidores
contexto de keyword vindo do ArticleDNA
camadas de vídeo e especialista no bundle
export portátil como dossiê editorial
higiene do dossiê portátil
```

O gate transporta essas mudanças para os documentos, e nada além disso.

## Documentos atualizados

| Documento | O que mudou |
| --- | --- |
| `docs/05-radar/spec.md` | nova seção de regra permanente no topo: perfil ≠ saída, hierarquia de evidência com os nove níveis do código, contexto de keyword, dossiê canônico, camadas de vídeo/especialista, Amazon, export portátil, metadados de SEO, plano visual, ordem de envio, defeito recorrente |
| `docs/05-radar/estado-atual.md` | cabeçalho de fase fechada e seção de fechamento datada |
| `docs/05-radar/backlog.md` | nova seção **Dívidas abertas — fonte única** no topo; eixos A, C e D marcados como superados; seções `Agora` e `Depois` marcadas como históricas |
| `docs/05-radar/diretriz-autoridade-evidencial.md` | hierarquia corrigida de oito para nove níveis, com nota de correção |
| `docs/00-produto/fluxo-oficial.md` | linha do Radar na tabela e parágrafo dos três perfis |
| `docs/00-produto/invariantes.md` | invariantes 34 a 46 |
| `docs/00-produto/mapa-estado-atual-plataforma.md` | bloco do Radar |
| `docs/00-produto/pipeline-editorial-papeis-handoffs.md` | envelope do handoff com vídeo, especialista e contexto de keyword; correção do estado dos perfis |
| `docs/00-produto/glossario.md` | 14 termos novos |

Documentos criados: este relatório.

Documentos removidos: nenhum. O backlog é log datado append-only — histórico
obsoleto é marcado como superado, nunca apagado, porque apagá-lo destrói a
proveniência da decisão.

## Referências obsoletas encontradas e corrigidas

**1. Hierarquia de evidência com oito níveis.**
`docs/05-radar/diretriz-autoridade-evidencial.md` enunciava oito níveis, com
evidência primária e especialista qualificado fundidos num só. O código
(`lib/radar/evidence-authority.ts`, `RADAR_EVIDENCE_HIERARCHY`) sempre teve
nove, e `radarEvidenceRank()` devolve a posição nessa lista. O documento estava
errado desde a origem, não desatualizado. Corrigido, com nota datada.

Consequência que a fusão escondia: um especialista qualificado não substitui
fonte factual primária em matéria de fato. Com os níveis fundidos, o documento
autorizava a troca.

**2. "Somente Google está implementado e homologado."**
`docs/00-produto/pipeline-editorial-papeis-handoffs.md`. Verdadeiro em
2026-09-11, falso desde os gates de YouTube (2026-09-14) e Amazon (2026-09-15 a
2026-09-17). Corrigido separando implementação de homologação: os três estão
implementados, só o Google foi homologado em runtime real.

**3. Amazon descrita como casca com engine `planned`, não implementada.**
Eixo "D. Pesquisa Amazon" em `docs/05-radar/backlog.md`, seção "Próximos
eixos". Marcado como superado, com o que passou a existir nomeado: camadas,
ASIN, blueprint comercial, locale da Merchant e política de link.

**4. Vídeos descritos como engine de transcrição/extração inexistente.**
Mesma seção. Marcado como superado: ingestão, texto original, segmentação,
correspondência contra os `VideoBriefs` e trecho ancorado no tempo existem, e a
camada viaja no dossiê. A decisão arquitetural sobre tradução registrada ali
permanece vigente e foi preservada.

**5. Seções `Agora` e `Depois` do backlog.**
Listas de 2026-07 que ainda liam como pendência corrente — hidratação, coleta
DataForSEO, validação visual. Marcadas como históricas, com a leitura vigente
apontada para a seção **Dívidas abertas**.

Os relatórios datados em `docs/00-produto/auditorias/` **não** foram corrigidos.
São fotografias de um momento e valem pelo que registraram; reescrevê-los
destruiria a evidência de como a decisão foi tomada.

## O que continua aberto

Aceitação manual de YouTube, Amazon, do export portátil e do envio real com as
camadas de vídeo e especialista preenchidas. **Homologação é ato do USER** —
nenhum documento pode declará-la a partir de suíte verde.

Dívidas técnicas mantidas: `RADAR_ANALYSIS_VERSION_STORAGE` e
`RADAR_BATCH_ELIGIBILITY_VIEW`. Frentes de outros módulos: envio real do
especialista, consumo do `PlannerHandoff v3` pelo Planejador e
`YOUTUBE_SEARCH_2`.

Detalhe em [docs/05-radar/backlog.md](../../05-radar/backlog.md), seção
**Dívidas abertas — fonte única**.

## Rodapé

```text
RADAR_GOVERNANCE_CLOSE = PASS
CODE_CHANGED = NO
DB_CHANGED = NO
MIGRATIONS = NO
PROVIDER_CALLS = 0
AI_CALLS = 0
ARTICLE_DNA_MUTATED = NO
MANUAL_UI_VALIDATED = N/A — homologação é do USER
```
