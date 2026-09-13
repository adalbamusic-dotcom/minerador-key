# RADAR FASE 1 — Modos de pesquisa, roteamento por dossiê e política editorial

Data: 2026-09-09 · Implementação autorizada

## ENTREGA

```
SERP_PRIMARY_MODES        = [WEB, YOUTUBE]
DEFAULT_SERP_MODE         = WEB
WEB_COMPETITIVE_MODEL     = existente (estrutura, tópicos, links, comercial)
YOUTUBE_COMPETITIVE_MODEL = novo (canais, recorrência, temas, perguntas)

ARTICLE_DNA_READ_ONLY         = YES
SILO_DNA_READ_ONLY            = YES
INTERNAL_LINK_GRAPH_READ_ONLY = YES

TOFU_AI_DISCOVERY_CONTEXT   = YES
YMYL_RELEVANCE_CONTEXT      = YES (NONE · LOW · MATERIAL · HIGH)
EEAT_SPECIALIST_PREPARATION = YES (sinais observados, sem score)

ARTICLE_DOSSIER_ROUTING = SERP obrigatória · Amazon conforme contexto comercial
REVIEW_DOSSIER_ROUTING  = SERP NOT_REQUIRED · Amazon obrigatória

MANDATORY_SERP_ACTIONS = 3

RADAR_TESTS_TOTAL = 451
RADAR_TESTS_PASS  = 451
RADAR_TESTS_FAIL  = 0

PROVIDER_CALLS_DURING_TESTS = 0
MIGRATIONS                  = 0

SERP_PHASE1_READY = fluxo e modos prontos; falta a camada semântica (§12)
NEXT_MODULE       = AMAZON (depois da homologação da SERP)
```

---

## 1 · Roteamento: o tipo do artigo decide o dossiê

`lib/radar/dossier-routing.ts` resolve a finalidade a partir do que o Arquiteto
e o Minerador **já declararam** — `likelyEditorialType`, `reviewCandidate`,
`productResearchRequired`, intenção e funil. O Radar lê; não classifica de novo.

| Finalidade | SERP | Amazon | Especialista |
| --- | --- | --- | --- |
| `EDITORIAL` | obrigatória | `NOT_REQUIRED` | conforme YMYL |
| `REVIEW_PRODUCT` | `NOT_REQUIRED` | obrigatória | conforme YMYL |
| `EDITORIAL_WITH_PRODUCT` | obrigatória | obrigatória | conforme YMYL |

**A principal manda.** Uma secundária comercial num artigo informacional
adiciona contexto de produto — não transforma o artigo em review.

`NOT_REQUIRED` diz "aqui não se aplica", com motivo. É diferente de "ainda não
foi feito", e não bloqueia nada.

---

## 2 · Dois modos de pesquisa principal

`lib/radar/search-mode.ts`. O seletor aparece **antes** do START e congela com a
investigação — trocar depois exige zerar, com aviso.

```
Pesquisa principal   [ Google / Web ]   [ YouTube / Vídeo ]
```

**A separação é estrita e vive em uma função só:**

- modo `WEB` → vídeo vira `format`: formato observado, fora do benchmark de texto;
- modo `YOUTUBE` → página de artigo vira referência cruzada, fora do benchmark
  audiovisual.

Nenhum dos dois some da tela; nenhum dos dois contamina a régua do outro.

### O que a fonte atual dá — declarado, não presumido

O normalizador **já preserva** os itens `video` que a SERP devolve
(`inferredType: "video"`, classificação `high`). Isso basta para observar qual
vídeo compete, de que canal e em que posição.

```
DATAFORSEO_HAS         = URL/videoId, título, canal (pela URL), posição,
                         snippet, data quando o item traz
YOUTUBE_API_REQUIRED_FOR = visualizações, duração exata, capítulos,
                           transcrição, inscritos/verificação do canal,
                           links da descrição, engajamento
```

**Nenhuma API nova foi integrada.** O que falta aparece como *não observado* no
modelo — nunca como zero, que seria lido como "nenhum vídeo tem capítulos".

---

## 3 · Modelo competitivo de vídeo

`lib/radar/video-competitive-model.ts` não tenta medir vídeo com régua de artigo
— um teste verifica que o módulo não contém `wordCount`, `h2`, `headingOutline`
nem `paragraph`.

Ele observa: vídeos por posição, **canais e recorrência** (o sinal mais forte
ali), temas recorrentes lidos dos títulos, perguntas que os títulos declaram
responder, e a lista explícita do que a fonte não permitiu ver.

---

## 4 · YMYL, E-E-A-T e descoberta por IA

`lib/radar/editorial-policy.ts`, com três decisões de método:

**Não existe score de E-E-A-T.** Ninguém sabe calcular a nota do Google, e
fingir que sabe produz número bonito e falso. O que existe são **sinais
observáveis** na amostra — autoria, datas, entidade responsável, citação de
fontes — contados, com a leitura do que isso exige de nós para competir ali.

**YMYL eleva a exigência, não bloqueia a pesquisa.** A classificação é declarada
e auditável: as expressões que a sustentam ficam em `signals`, então um erro é
apontável e corrigível. `MATERIAL`/`HIGH` passam a exigir fonte primária,
literatura ou órgão reconhecido, autoria identificada e **revisão de especialista
com credencial pertinente** — que é exatamente o que a assinatura do profissional
vai precisar ter atrás dela.

**TOFU pede conteúdo recuperável.** `questionCoverage`, `entityCoverage`,
`conceptCoverage` e `answerability` — o vocabulário é de cobertura conceitual.
Não existe `lsiDensity` nem `keywordDensity` no código, e não existem dois
conteúdos: o artigo é um só, e o que o torna citável por um sistema de IA é o
mesmo que o torna bom para a busca — resposta direta, entidade nomeada,
terminologia consistente, afirmação com fonte.

---

## 5 · O que o Especialista vai receber

Não concorrentes crus. O pacote prepara: exigências de evidência derivadas do
YMYL, sinais de E-E-A-T observados na amostra e o que os concorrentes fazem —
onde assinam, onde citam fonte, onde datam. É esse material que sustenta uma
revisão profissional de verdade.

---

## 6 · Testes

`tests/radar-fase1-modos-e-roteamento.test.mts` — 14 testes, todos passando.

```
A · default = WEB
B, C · cada modo por clique; trocar com investigação em curso avisa e exige reset
D · WEB não mistura vídeo no benchmark editorial
E · YOUTUBE não mistura artigo no benchmark de vídeo
F, G · principal canônica e auxiliares respeitam o modo
H · os quatro módulos novos são domínio puro e não tocam upstream
I · TOFU marca o contexto de descoberta por IA
J · YMYL relevante gera exigências e exige especialista
K · o especialista entra por necessidade, não por padrão
L · review pode marcar SERP como NOT_REQUIRED
M · review exige Amazon
N · três ações, independentemente do modo
+ modelo de vídeo descreve canal e recorrência e declara o não observado
+ E-E-A-T é sinal observado, nunca nota
```

```
pnpm run test:radar   451/451
npx tsc --noEmit      0 erro em Radar
eslint                0 erro
```

---

## 7 · O que NÃO foi feito

Conforme §19: nada de Amazon, nada de Especialista, nada no Planejador, nenhum
controle de Fase 2.

E fica pendente, declarado, o item que mais muda a qualidade do gabarito:

- **§12 · agregação semântica.** "Como identificar pele oleosa" e
  "características da pele oleosa" ainda são dois tópicos, não um conceito.
- **§14 · links externos com destino** — a extração ainda guarda só a contagem.
- **§11 · entidades, perguntas e cobertura conceitual** no modelo Web.
- **§17 · UI enxuta** e o pacote downstream completo no *Finalizar SERP*.
