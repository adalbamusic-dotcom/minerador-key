# Diretriz canônica — autoridade evidencial do Radar

**Status:** vigente, vale para todos os módulos e gates seguintes.
**Estabelecida em:** 2026-09-10.
**Guardada por:** `tests/radar-diretriz-autoridade-evidencial.test.mts`.

Esta diretriz não pertence a um lote. Ela existe porque a mesma discussão volta
de tempos em tempos disfarçada de melhoria: uma heurística nova, uma leitura de
IA mais elegante, uma sugestão editorial que contradiz o que catorze
concorrentes fazem. Sem uma hierarquia escrita e **testável**, cada lote reabre
a votação — e a evidência perde, porque ela não argumenta.

---

## 1. O dossiê de trabalho do Article

O Planejador recebe o artigo como **uma unidade**:

```
ARTICLE_DNA aprovado pelo Arquiteto     imutável
+ RADAR_EVIDENCE_BUNDLE                 camada versionada de evidência
= ARTICLE_WORKING_DOSSIER               o que o Planejador consome
```

Para quem opera, isso é "o DNA completo de trabalho do artigo". Tecnicamente
são duas camadas, e é importante que continuem sendo: **o Radar não reescreve o
ArticleDNA aprovado**. Ele acrescenta evidência amarrada a

```
articleId + articleDnaVersionId + articleDnaContentHash
```

É esse vínculo que impede a evidência de sobreviver ao fundamento que a
originou. Sem ele, um dossiê antigo pareceria atual para sempre, e o Planejador
comporia um artigo que não existe mais.

Implementado em `lib/radar/evidence-bundle.ts`.

## 2. A hierarquia congelada

```
1. INVARIANTES E PROTEÇÕES DO ARTICLE   nunca violados automaticamente
2. EVIDÊNCIA PRIMÁRIA / ESPECIALISTA    autoridade sobre verdade factual
3. SERP VIGENTE E SUFICIENTE            autoridade sobre a realidade da busca
4. OUTRAS EVIDÊNCIAS DO RADAR           Amazon, YouTube, vídeo, conforme o tipo
5. ARTICLE DNA / HIPÓTESE EDITORIAL     contexto e contrato de formação
6. IA                                   interpreta e correlaciona evidência
7. HEURÍSTICA DETERMINÍSTICA            apoia quando falta evidência
8. SUGESTÃO EDITORIAL GENÉRICA          último recurso
```

Implementada em `lib/radar/evidence-authority.ts` como dado ordenado, não como
convenção de leitura.

## 3. A SERP é evidência, não sugestão

Sobre o **terreno competitivo** — o que ranqueia, que intenção a busca
privilegia, que formatos aparecem, que conceitos se repetem, que perguntas o
mercado responde, como os concorrentes estruturam, como linkam, que fontes
usam, que lacunas aparecem — uma SERP `vigente + suficiente + válida` fala mais
alto que hipótese do Article, IA, heurística ou sugestão genérica.

A IA pode agrupar, interpretar, resumir, correlacionar, detectar relações e
propor leitura. A IA **não pode** apagar evidência, substituir resultado
observado, inventar recorrência, redefinir a SERP nem ignorar concorrentes por
achar melhor.

```
EVIDÊNCIA → INTERPRETAÇÃO        sempre
OPINIÃO DA IA → SUBSTITUI EVIDÊNCIA   nunca
```

`assertRadarEvidenceAuthority` transforma a inversão em erro de execução.

## 4. A SERP não decide verdade factual

Dez concorrentes afirmarem X não torna X verdadeiro. Em YMYL isso é a diferença
entre um artigo bom e um artigo perigoso.

```
SERP:                    "o mercado frequentemente afirma X"
EVIDÊNCIA PRIMÁRIA:      "X está incorreto ou desatualizado"
RESULTADO:               CONFLITO — e uma chance de fazer melhor que quem ranqueia
```

A SERP não é apagada: ela continua registrada como o que o mercado diz.

## 5. Conflito nunca é resolvido em silêncio

Quando ArticleDNA e SERP divergem, os dois lados ficam escritos:

```
ARTICLE_DECLARES · SERP_OBSERVES · CONFLICT · IMPACT
```

`resolveRadarEvidencePrecedence` devolve `prevailing` **e** `overruled`, com
motivo e procedência de cada um. Resolver conflito descartando um dos lados é
como consertar um termômetro quebrando-o.

## 6. A fronteira dos módulos

```
MINERADOR    dados e qualificação
ARQUITETO    forma o Article → ArticleDNA
RADAR        investiga e fundamenta → evidência
PLANEJADOR   compõe o ContentPlan
REDATOR      executa o plano
```

O **Planejador não pesquisa de novo**. Ele compõe: estrutura, distribuição dos
conceitos, H2/H3, aplicação dos links já planejados, fontes, imagens, CTA,
requisitos do especialista, instruções ao Redator.

O **Redator não redescobre nada**. Intenção, concorrência, conceitos, links,
fontes e estrutura estratégica chegam decididos, com a evidência atrás.

## 7. Procedência obrigatória

Todo dado enviado rio abaixo mantém procedência. Afirmação sem origem não entra
na disputa de precedência — `resolveRadarEvidencePrecedence` recusa. Resumo sem
origem é opinião com aparência de dado, e é exatamente o que o Planejador não
pode receber.

---

## O que fazer quando isto for questionado

Se um lote futuro propuser que uma heurística, uma leitura de IA ou uma regra
editorial "corrija" o que a SERP observou: isso não é uma melhoria, é uma
inversão de autoridade. A suíte falha, e a falha é o ponto.

Se a proposta for legítima — por exemplo, uma nova classe de evidência
observada —, o caminho é alterar `RADAR_EVIDENCE_HIERARCHY` **explicitamente**,
com o motivo registrado, e não contorná-la em um módulo específico.
