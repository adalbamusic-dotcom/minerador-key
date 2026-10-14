# SDD — Silo interligado, keyword sem repetição antiga, SERP competitiva de verdade e fechamento da marca — 2026-10-14

> **Status: APROVADA — D1–D14 DECIDIDAS pela recomendação (§16), com um item novo
> (§16.1, SERP crua por artigo), em 2026-10-14.** Frase do dono: "sim, pode sim, e
> do MCP também é uma boa ideia, pode implementar". Em implementação por fases; o
> andamento está no §18.1.
>
> A proposta foi escrita sem nenhuma linha de código de produção, sem escrita no banco, sem
> chamada paga. Leitura remota só por `SELECT` (`npx supabase db query --linked -f`),
> em 2026-10-14. Commit, push, deploy, migration e SQL de escrita são do dono
> (`AGENTS.md` §15).
>
> **Módulos proprietários:** Arquiteto (malha do Silo no `InternalLinkGraph`, âncoras
> de partida) e Radar (aplicação da malha, análise competitiva, regras de título e
> keyword, fechamento no artigo-modelo e nos CSVs). Cada fase declara um dono só.
> Redator e catálogo MCP recebem mudanças aditivas (AGENTS §4, §17.1).
>
> **Esta SDD muda entregáveis por decisão do dono** (frase do §1). Ela substitui,
> para as fases daqui, a regra "entregáveis intocados" do §2 da SDD
> `sdd-acelerar-fluxo-do-plano-2026-10-13.md` e do §3 da SDD
> `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`: o E0 passa a ser atualizado
> **por fase, só nas chaves autorizadas** (§12.3). Fora dessas chaves, o E0 continua
> provando que nada mudou.
>
> **Frente em curso que esta SDD não toca:** a F2 da SDD "Arquiteto só lê e listas
> leves" (leitura leve da mesa). Nenhuma fase daqui mexe nos arquivos dela, e a fase
> do Arquiteto (F4) só começa depois que a F2 fechar (§14).

## 0. Resumo para o dono

1. **Hoje o grafo já tem Pilar ↔ Suportes, mas o artigo-modelo não obedece.** Medido
   no banco: nos 5 Silos, todo Suporte aponta para o Pilar e o Pilar aponta para todos
   os Suportes. Só que a planta do Pilar "leads qualificados" coloca **3 links para 7
   Suportes exigidos**. E **nenhum** Silo tem ligação Suporte ↔ Suporte (0 de 85
   arestas). Os links entre Suportes que aparecem no CSV foram escolhidos pela IA da
   planta, fora do grafo, 1 a 3 por artigo.
2. **Malha obrigatória.** O Arquiteto passa a gravar a malha inteira do Silo:
   - Suporte → Pilar e Pilar → todos os Suportes, **obrigatórios no corpo**;
   - Suporte ↔ Suporte, todos os pares, **no texto quando a seção trata do assunto**,
     com âncora natural; o que não couber vai para a **trilha "Continue no Silo"** no
     fim do artigo, sem link forçado;
   - SiloPage ↔ todos.

   O Radar aplica a malha inteira no artigo-modelo e no CSV. Nada do grafo pode sumir.
3. **Keyword sem repetição antiga.** A regra de hoje (principal no começo do H1, das 3
   opções de título, do SEO title, da meta, da primeira frase e do primeiro H2) foi o
   que produziu 9 opções de título e meta começando por "Captação de pacientes para
   dentista…". Ela foi trocada por esta:
   - a principal aparece **uma vez, de forma natural e gramatical**, no H1 e no title,
     e não precisa ser o começo;
   - a meta é natural;
   - os H2 seguem os subtemas e as perguntas reais da SERP, e **nenhum H2 começa pela
     principal**;
   - as 3 opções de título têm ângulos realmente diferentes;
   - **nunca** sai "(precisa de fonte…)" em título ou meta.
4. **SERP competitiva de verdade, sem pagar SERP nova.** A IA que a planta já usa (a
   mesma chamada) passa a entregar, para cada artigo, quatro blocos tirados dos dados
   **já coletados**:
   - o que todos acertam;
   - o que só os melhores fazem;
   - o que ninguém entrega (ganho de informação);
   - o SEO antigo que não se copia.

   Junto vêm o ângulo de diferenciação e até 4 perguntas que valem resposta (as outras
   são descartadas). A estrutura dos concorrentes vira **referência**; o gabarito é o
   do Silo. Hoje vários dados coletados não chegam a lugar nenhum: as respostas do
   "Pessoas também perguntam", a posição da keyword nos concorrentes, os padrões de
   título e o ângulo recomendado pelo próprio Radar.
5. **Diferencial da marca e fechamento.** As regras do Guardião já estão no Adendo G,
   mas se perdem em seis pontos do código (§9.1). A planta ganha um bloco "Diferencial
   da marca" e um fechamento em 4 campos que o servidor confere:
   - dor;
   - mudança para a estrutura própria;
   - facilidade;
   - diagnóstico, que é o CTA único.

   O "o que é" vira uma ou duas frases quando a SERP tem resposta de IA.
6. **Vídeos** recebem o mesmo material: ângulo, lacunas, SEO antigo a evitar e a trilha
   do Silo.
7. **O CSV continua com as mesmas 13 colunas, na mesma ordem.** Muda o conteúdo de 5
   colunas. As regras ganham a versão nova `2026-10-14`. Nada é regerado sozinho:
   - o que não precisa de IA vale na hora, na leitura das plantas já gravadas: tirar a
     marca de fonte do título, garantir os links obrigatórios do grafo e montar a
     trilha;
   - o resto vem com "Organizar de novo", começando pelos 8 artigos do Silo "Leads sem
     Tráfego Pago".
8. **Fases**, do maior ganho com menor risco para o resto: F0 retrato e caso real →
   F1 título e keyword → F2 links obrigatórios do grafo no Radar → F3 análise
   competitiva, diferencial e fechamento → F4 malha completa no Arquiteto → F5 trilha,
   links a ativar e atualização dos publicados → F6 vídeo.

## 1. Identificação

- **Data e autorização:** 2026-10-14, dono do produto. Frase literal:
  > "Tem uma coisa que estou reparando aqui que não está legal não, sobre os links
  > internos. Tem que ser obrigatório que os artigos de suporte apontem para o artigo
  > pilar, e o pilar tem que apontar a todos os artigos de suporte, e o resto é de
  > acordo às coletas da SERP; pode que a estrutura de página que as SERP coletam sejam
  > ou estejam baseados ou fundamentados no SEO antigo, e aí ele nem está considerando
  > o conceito de SILOS, e ele monta um gabarito com diretrizes ultrapassadas. Vamos
  > ajeitar isso no arquiteto e no radar, porque estamos aplicando e trabalhando com
  > sistema de silo, artigo Pilar e de suporte, tem que estar interconectado todos
  > dentro do silo, de acordo aos novos conceitos do SEO semântico; já conseguimos
  > arrumar bastante coisa como as palavras âncoras, mas ele ainda está limitado,
  > porque quanto mais interconectado estiver os artigos é muito melhor para o google;
  > e sobre as palavras-chave ele ainda está utilizando o conceito de repetição nos
  > metadados e no title assim como nos H1 e demais conteúdos; é bom repetir sim mas
  > não do jeito que está agora; acho que com ajuda da IA que estamos utilizando nos
  > processos podemos melhorar a implementação da SERP, porque os artigos estão com uma
  > cara muito antiga, e não está tendo o impacto de melhoria no google… ele estava
  > levantando e caiu novamente, porque tudo está sendo muito repetitivo sem essência,
  > sem algo que realmente seja competitivo; se a gente está raspando as publicações
  > dos nossos concorrentes, é porque queremos ver como eles estão fazendo e só tomar
  > para nós os pontos mais importantes e tentar não replicar; se não, temos que
  > melhorar isso, reforçar no que eles já estão acertando… Estamos gastando coletando
  > muitos dados e ainda não estamos aproveitando ele nem nos artigos nem nos vídeos.
  > Vamos melhorar?"
- **Evidência complementar do dono (mesmo dia):**
  - "title e meta description estão repetindo as palavras-chave";
  - o relatório do Guardião de SEO do miniWordPress sobre o mesmo artigo:
    - "SEO title/H1 sem gancho comercial forte";
    - "Nota de isca baixa (56/100)";
    - "Diferencial AdalbaPro fraco (15/100)";
    - "Evite termos de agência genérica";
    - "Conteúdo informacional fraco para IA/zero-click (o que é)";
    - "Falta diferenciar estrutura própria de um pacote genérico";
    - "Faltam sinais de autoridade local";
    - "Fechamento Comercial fraco (20/100)".

  O Guardião é **validador externo**. Seus critérios são considerados aqui, mas não
  obedecidos às cegas: ele ainda usa KGR e siglas como sinal de texto, e isso não entra
  (§9.3).
- **Natureza da mudança (AGENTS §4):** estrutural. Muda o significado de um campo do
  contrato do grafo (`priority`), o workflow da malha e o conteúdo dos entregáveis.
  Por isso esta SDD vem antes de qualquer código.
- **O que esta SDD não autoriza:**
  - SERP nova ou chamada paga automática;
  - migration (a única opção que exigiria uma, a D2-b, não é a recomendada);
  - edição de página publicada;
  - troca de principal, slug ou canonical;
  - mudança no Minerador.

## 2. Fontes lidas

- **Produto:** `AGENTS.md`; `docs/00-produto/invariantes.md` (21, 27, 28, 47–50);
  `fluxo-oficial.md`; `pipeline-editorial-papeis-handoffs.md`.
- **Links:** `docs/04-arquiteto/links-internos-estado-e-contrato.md`.
- **Radar:** `docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md` (Adendos A,
  D, F, G e D10); `spec.md`, `estado-atual.md` e `backlog.md` do Radar;
  `docs/compartilhado/diretriz-de-comunicacao-humana.md`.
- **Redator:** `docs/07-redator/spec.md`.
- **SDDs vizinhas:** acelerar (§2) e "Arquiteto só lê" (§3).
- **Decisões de memória do dono:**
  - SERP > lógica > IA, com 4 lentes;
  - âncora natural nunca repete a keyword do destino;
  - entregável sai concluído (D10);
  - o caminho do piloto vale para tudo, e o Radar se adapta ao Arquiteto;
  - Silos de 15 ou mais artigos.
- **Código:** verificado em `HEAD d4dcd70`, com o working tree sujo descrito no
  `git status` da sessão. As linhas citadas são do working tree de 2026-10-14.
- **Material real:**
  - `Downloads/03-suporte-captacao-de-pacientes-sem-trafego-pago-para-escrever.csv`
    (CSV do Radar);
  - `Downloads/03-suporte-captacao-de-pacientes-sem-trafego-pago.docx` (o artigo
    escrito, texto de `word/document.xml`).

## 3. O caso real (CSV e artigo da AdalbaPro)

**Contexto:**
- **Marca:** AdalbaPro.
- **Silo:** "Leads sem Tráfego Pago", com 8 artigos:
  - Pilar: "leads qualificados";
  - 7 Suportes.
- **Artigo analisado:** Suporte 3, principal "captação de pacientes dentista".
- **Situação:** publicado, ou seja, é atualização.

| Achado | Onde está no material | Causa no código |
|---|---|---|
| **5 links**: L1 Pilar, L2–L4 três Suportes, L5 SiloPage. Ficam de fora "promoções para estética" (citado "sem link: o grafo aprovado não traz esse link"), "como captar um cliente" e "como atrair um cliente". | `links_internos` e `estrutura` | O grafo não tem Suporte ↔ Suporte (§4.1). A IA da planta escolhe entre os candidatos K do Silo inteiro, mas só o Pilar e a SiloPage são pedidos (`article-blueprint.ts:1468`, regra 6). |
| **H1, SEO title e meta começam por "Captação de pacientes dentista…"**, forma não gramatical. Quem escreveu corrigiu para "para dentista", mas manteve as **9 opções** (3 H1, 3 title, 3 meta) começando pela mesma frase, só trocando o sufixo. | `titulo_e_seo`; docx, seção B | Regra "keyword no começo" (§5.2). |
| **"(precisa de fonte: afirmação sobre plataforma)" no H1, no SEO title e na meta.** | `titulo_e_seo` | `comFonte` aplicado aos títulos (`article-blueprint.ts:4641-4644`). |
| **Contradição dentro do mesmo CSV.** A linha "Voz da marca" diz "não impor uma sequência gramaticalmente truncada. Não trabalhar com densidade artificial de repetição". A linha "Silo" (regra 12) e o `prompt` mandam a principal "no começo do H1, na primeira frase, no primeiro H2". | `titulo_e_seo` da linha Voz da marca × `prompt` | A diretriz G tem precedência sobre a Skill "onde ela suaviza o tom". Keyword não é tom, mas a precedência foi aplicada a ela também. |
| **H2 de molde com keyword colada**: "Tráfego orgânico como fazer para captar pacientes no dia a dia" (a complementar "tráfego orgânico como fazer" literal); "Captação de pacientes dentista sem anúncios começa pelo orgânico". | `estrutura` | A complementar entra como "cabeçalho ou dentro da seção" (`portable-writing-export.ts:1358`; `portable-evidence-pack.ts:155`). Moldes "no dia a dia" vêm do esqueleto M. |
| **Seção 1 é definição** ("O que é tráfego orgânico", "O que caracteriza…", "vantagens"), numa SERP com **AI Overview**. | `estrutura` | O esqueleto M promove o tema de 2 ou mais sites (`editorial-article-model.ts:1505-1516`). Não há regra para conteúdo que a resposta de IA já dá. |
| **"20 páginas comparáveis" incluem psitto.com.br, zenklub.com.br e amplimed (psicólogos)**, vindas da SERP da complementar "empresa de captação de pacientes". As medianas (2.190 palavras, 10 H2, 26 imagens) e a meta "~36–97 parágrafos (~42 palavras cada, como nos concorrentes)" saem dessa amostra misturada. | `serp_resumida`, `estrutura` | Medidas recalculadas sem tirar outliers e sem filtrar pelo leitor (`article-blueprint.ts:773-785`). |
| **`cobrir_e_superar`** traz 10 perguntas, **todas** "material insuficiente", e uma lista de termos soltos. Não diz o que os concorrentes acertam, o que falta nem o que é SEO antigo. | `cobrir_e_superar` | `perguntasDaLinha` e `colunaCobrir` (`portable-writing-export.ts:2156-2225, 2483-2667`). |
| **Fechamento.** A planta pediu "Dor… Estrutura própria… Facilidade: começar com poucas páginas bem feitas", sem diagnóstico. O CTA é a fala inteira do especialista ("Vamos planejar a presença orgânica…"). | `estrutura` (Fechamento/CTA) | O fechamento tem só `turn` e `cta` (`article-blueprint.ts:446-451`). Os 4 tempos são instrução, sem conferência (`:4875`). |
| **Texto final** (3.356 palavras): 52 "não", 45 "pode/podem", 13 "não garante/significa/comprova/oferece…", **0 números ou dados próprios**. O texto está correto, mas é genérico e cheio de ressalvas, sem informação nova. | docx (contagem feita no texto extraído) | O pacote não tem fonte verificada ("Fontes verificadas: nenhuma"), as 10 perguntas pedem "responder de forma qualificada" e a trava de fonte trava o gancho (§9.1). |
| **Search Console da AdalbaPro, 3 meses** (relatado pelo dono): 1,58 mil impressões, 5 cliques, CTR 0,3%, posição média 10,9, com subida e queda recente. | — | É sinal, não prova de causa. O CTR de 0,3% na posição ~11 é coerente com títulos e metas iguais aos do topo. |

## 4. Dados reais (SELECT, 2026-10-14, só leitura)

### 4.1 InternalLinkGraph: último grafo de cada Silo

Tabelas lidas: `internal_link_graphs`, `internal_link_graph_nodes`,
`internal_link_graph_edges` e `internal_link_graph_working_copies`. No total são 5
grafos, 12 versões e 5 cópias de trabalho. As cópias de trabalho têm as mesmas
contagens por tipo.

| Marca | Silo (SiloPage) | v | Artigos (P+S) | S→P | P→S | S↔S | SP→artigo | artigo→SP | Arestas | Saída média/artigo |
|---|---|---|---|---|---|---|---|---|---|---|
| AdalbaPro | Captação de Pacientes | 4 | 1+6 | 6 | 6 | **0** | 7 | 1 (só o Pilar) | 20 | 1,86 |
| AdalbaPro | Crescimento de Clínicas | 5 | 1+4 | 4 | 4 | **0** | 5 | 1 | 14 | 1,80 |
| AdalbaPro | **Leads sem Tráfego Pago** | 1 | 1+7 | 7 | 7 | **0** | 8 | 1 | 23 | 1,88 |
| AdalbaPro | Estratégia de Negócios | 1 | 1+4 | 4 | 4 | **0** | 5 | 1 | 14 | 1,80 |
| Care Glow | (1 Silo) | 1 | 1+4 | 4 | 4 | **0** | 5 | 1 | 14 | 1,80 |

**Leitura:**
- **Pilar ↔ Suportes:** S→P e P→S cobrem 100% dos Suportes nos 5 grafos.
- **Suporte ↔ Suporte:** 0 de 85 arestas.
- **Artigo → SiloPage:** só 5 dos 30 artigos (os Pilares) apontam para a SiloPage.
- **Origem das arestas:** quase todas `ai` (das âncoras); nenhuma `human`.
- **Prioridade:** só HIGH e MEDIUM.

### 4.2 Artigos-modelo vigentes (`radar_article_blueprints`, última versão por artigo)

São 9 plantas da AdalbaPro: 8 com regras `2026-10-11c` e 1 com `2026-10-08`. Todas
estão `APPROVED`. Nenhuma tem "(precisa de fonte" gravado no `title`: a marca nasce na
leitura do export.

| Artigo (H1 da planta) | Relações do grafo pedidas | Links na planta | H2 que começam pela principal ou por uma complementar |
|---|---|---|---|
| **Leads qualificados** (Pilar) | **7** (P→S) | **3** | **3 de 3** ("Leads qualificados o que é: …", "Gerar leads qualificados: …", "Geração de leads qualificados: …") |
| Captação de pacientes dentista sem anúncios… | 1 | 5 | 2 de 5 (forma crua + complementar "tráfego orgânico como fazer") |
| Campanhas de marketing para clínica de estética sem anúncios… | 1 | 6 | 3 de 6, e 4 de 6 trazem "campanhas de marketing" |
| Como atrair um cliente… | 1 | 4 | **4 de 4** ("Como atrair um cliente", "Como conquistar novos clientes", "Como conseguir mais clientes", "Como atrair mais clientes") |
| Como captar um cliente… | 1 | 6 | 3 de 4 |
| Promoções estética… | 1 | 5 | 2 de 5 ("Promoções estética que funcionam…", "Site de promoções estética…") |
| Tráfego orgânico e pago para clínica de estética… | 1 | 6 | 1 de 5 (primeiro H2 = a keyword inteira) |
| Como atrair clientes pelo Instagram… | 1 | 6 | 1 de 5 |
| Marketing digital para dentistas… (regras 10-08) | 0 | 3 | 2 de 5 |

**Conclusão:**
- **O grafo pede, o artigo-modelo não cumpre.** O Pilar deixa de apontar para pelo
  menos 4 dos 7 Suportes. `graphRequired` e `graphPlaced` existem
  (`article-blueprint.ts:4089-4098`), mas só medem; não obrigam.
- **A repetição de keyword não está só no título.** Ela está nos H2, puxada pela
  regra da complementar "no cabeçalho".

## 5. Contrato atual (verificado no código)

### 5.1 Malha de links

| Ponto | Onde | Comportamento |
|---|---|---|
| Gerador do esqueleto | `lib/arquiteto/internal-link-structure.ts:43-104`, chamado por `generateStructuralLinks` em `modules/arquiteto/arquiteto-workspace.tsx:9020-9119` (linha 9073) | Gera SP→Pilar (HIGH), SP→cada Suporte (MEDIUM), Pilar→SP (MEDIUM), Pilar→cada Suporte (HIGH) e Suporte→Pilar (HIGH). São `2 + 3×(N−1)` arestas, sem teto. |
| Suporte ↔ Suporte | `internal-link-structure.ts:11-14` (decisão escrita: "Gerar o produto cartesiano encheria o grafo…") | Não é gerado. Só nasce à mão (`arquiteto-workspace.tsx:8966-9007`, MEDIUM, `origin:"human"`). Quem conta como Suporte é qualquer artigo que não seja o Pilar (`:48`). |
| Suporte → SiloPage | — | Não é gerado. |
| Entre Silos | `link-anchor-ai.ts:377-379`; `app/api/arquiteto/internal-link-graph/anchors/route.ts:110-111`; `article-blueprint.ts:3503-3504` | Proibido em três barreiras. O CHECK de `relation_type` no banco não tem tipo para isso (migration `20260826225145`). |
| Contrato da aresta | `lib/arquiteto/contracts.ts:1380-1395` | `{edgeId, sourceNodeId, targetNodeId, relationType, reason, priority: HIGH/MEDIUM/LOW, anchorConcepts[≥1], origin, createdBy, createdAt, provenance{source, references}}`. **Sem campo de obrigatoriedade.** `priority` não é lida por ninguém para obrigar (só informativa). |
| Obrigatoriedade no Radar | `lib/radar/internal-link-plan.ts:78, 582, 668`; invariante 28 | Toda relação aprovada é `REQUIRED`. Sem contexto, vira `REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT` com 0 ocorrências, mas **a planta não usa esse plano para obrigar**: só marca `fromGraph` nos candidatos K (`article-blueprint.ts:1242-1275`). |
| Pedido da planta | `article-blueprint.ts:1468` (regra 6) | "Inclua o link para o Pilar quando o artigo for Suporte e para a SiloPage quando houver". Não pede Pilar→Suportes nem a malha. |
| Teto | `RADAR_ARTICLE_BLUEPRINT_LIMITS.internalLinks: 3`, `sections: 8` (`article-blueprint.ts:187-201`); Regra 8 com 3 a 6 H2 (`human-voice-guideline.ts:50`) | No máximo 3 links por seção. O excedente é cortado em silêncio (`listaIa … .slice`, `:335-339, 368`). `graphLinks` vai ao prompt cortado em 12 (`:1377-1381`). Um Pilar com 14 a 29 Suportes não cabe em 6 H2 × 3. |
| Destino não publicado | `article-blueprint.ts:4175, 4468, 4989` | A âncora fica como texto simples até o destino ir ao ar. Isso está certo e continua. |
| Publicado sem a malha | `internal-link-plan.ts:164-184, 646-680`; `lib/radar/portable-export.ts:995` | Não há retrofit. O Radar não edita a página de origem, e os links de entrada viram só uma contagem. |
| Âncora no Arquiteto | `lib/arquiteto/link-anchor-concepts.ts:34-48`; `link-anchor-ai.ts:32, 189-223, 269-277` | O ponto de partida põe **a principal do destino como primeiro conceito**. A IA aceita `semanticRelation:"exact"` e exige um token em comum com as keywords do destino. **Não há regra contra repetir a keyword.** |
| Âncora no Radar | `lib/radar/natural-anchor-rule.ts:17-29`; `natural-anchor.ts:107-115, 265-299` | A âncora nunca é uma keyword do destino nem a contém inteira. Não repete a âncora para o mesmo destino no lote. Esta é a régua boa, e continua a única. |

### 5.2 Keyword, título e meta

| Regra | Onde |
|---|---|
| O H1 começa pela principal inteira | `article-blueprint.ts:1463` (regra 3), conferido em `:3716-3719, 3754` |
| H1, alternativas e SEO title com a principal **no começo** (as 3 opções) | `human-voice-guideline.ts:155-162` (regra `titulo`), `:268-269` (regra 28 do pedido); conferência em `article-blueprint.ts:3757-3766`; troca de metades sem IA em `human-voice-guideline.ts:390` e na leitura em `article-blueprint.ts:3221-3235` |
| Meta com a principal nos primeiros 60 caracteres | `human-voice-guideline.ts:54, 164-170`; `article-blueprint.ts:3771` |
| Primeira frase e primeiro H2 com a principal (ou um "recorte forte") | `human-voice-guideline.ts:172-178, 378`; `article-blueprint.ts:3777`; CSV em `:4867-4870` |
| Molde do JSON | `article-blueprint.ts:1603-1606` (`principalPlacement: ["H1","primeiro parágrafo"]`, "keyword no começo") |
| Linhas do CSV | `article-blueprint.ts:4829-4854` (ajustes "comece pela keyword", "cada uma com a keyword principal no começo"), `:5011` ("Keyword principal em"), `portable-writing-export.ts:3099` (prompt da linha) |
| Complementar "no cabeçalho" | `portable-writing-export.ts:1358`; `portable-evidence-pack.ts:155` |
| "(precisa de fonte…)" no título | `article-blueprint.ts:4632-4644` (decisão de 2026-10-08: "Agora todos levam…"), `comFonte` em `:4582-4588`, `radarWritingSourceMark` em `portable-writing-export.ts:1517-1522`, detector em `pending-claims.ts:497, 623, 744` |
| Densidade | **Nenhuma** conferência de contagem. Só frases como "sem forçar repetição" (`:1463`), `portable-writer-context.ts:156` e `semantic-concept-model.ts:27`. |

**Contagem de hoje:** a principal é exigida em cerca de 7 posições (H1, 2 alternativas,
SEO title, meta, primeira frase, primeiro H2), sempre como prefixo. A isso se somam as
complementares nos H2.

### 5.3 SERP coletada e não aproveitada (sem gasto novo para usar)

Tudo isto já está persistido:
- `radar_analysis_runs.payload.extractions`;
- snapshot da SERP;
- modelo observado congelado no pacote (`lib/radar/evidence-bundle.ts:168, 417`).

| Dado coletado | Onde nasce | Uso hoje |
|---|---|---|
| **Resposta** do "Pessoas também perguntam" (`answer`, `sourceUrl`) | `lib/radar/serp/contracts.ts:60-68` | **Não usado.** Só a pergunta vira evidência P (`article-blueprint.ts:1149`). |
| `keywordPlacement` dos concorrentes (title, H1, H2, H3, abertura, ocorrências) | `competitor-extractor.ts:287-303`; `competitive-model.ts:352-366` | **Não usado.** É o dado que mostraria quem repete keyword (SEO antigo). |
| `diagnostic.titlePatterns`, `snippetPatterns`, `possibleConflicts`, `secondaryIntents` | `serp/contracts.ts:14-42` | **Não usado.** São os padrões "10 dicas", "22 dicas" e "guia completo". |
| `ranks` por concorrente × estrutura/cobertura | `competitive-observed-model.ts:247-264` | **Nunca cruzados.** Não existe "o que só os melhores fazem". |
| Outliers separados | `competitive-model.ts:69-92` | **Ignorados** nas medidas da planta, que recalcula mediana e P25/P75 com eles (`article-blueprint.ts:773-785`). |
| `recommended.editorialAngle`, `differentiation`, `sectionDirections` do blueprint competitivo | `competitive-blueprint.ts:200-246` | **Não entram no artigo-modelo.** No CSV, `differentiation` só detecta conflito (`portable-writing-export.ts:2427, 2538`). |
| `entities.shared/marketOnly/related`, `entityMap`, Knowledge Graph | `competitive-observed-model.ts:203-208`; `serp-features.ts:103-145` | **Não usado.** É a base das variações semânticas e das entidades. |
| `faqCount`, `comparisonCount`, `listCount`/`tableCount` como presença, `emphasizedTerms`, `recurringTerms`, `introText`/`closingText` | `analysis-contracts.ts:94-159`; `competitor-extractor.ts:107-115, 272-277, 364-398` | **Não usado** no artigo-modelo e no CSV de escrita. Só o vídeo usa a presença de lista, tabela e imagem (`portable-video-export.ts:3010-3015`). |
| Síntese da SERP (`commonPatterns`, `underCovered`, `opportunities`, `setAside`) | `serp-synthesis.ts:20-35` | **Só a tela.** |
| Fontes citadas pelo AI Overview | `serp-features.ts:53-63, 216-224` | Planta (A) e CSV de escrita, sim. **Vídeo, não.** O texto do AI Overview não é persistido; continua assim, sem coleta nova. |
| `organic.date`, `sitelinks`, meta dos concorrentes | `serp/contracts.ts:45-57`; `analysis-contracts.ts` | **Não usado.** |

**Onde a estrutura dos concorrentes vira gabarito hoje:**
- seções M do esqueleto: um tema com 2 ou mais sites vira seção (`article-blueprint.ts:883-986`; `editorial-article-model.ts:294, 1505-1516`);
- "Medidas do plano" medianas como meta (`article-blueprint.ts:1476, 4889-4893`);
- "Vem do esqueleto da SERP: M…" em cada seção do CSV (`:4237-4245`).

**IA disponível:** uma só chamada (com até 2 passadas), a do artigo-modelo
(`lib/server/radar-article-blueprint.ts:221-245, 324-366, 380-403`). O provedor é
`generateStructuredAI` via OpenRouter (`lib/server/deepseek-canonical.ts:24-33`), e o
resultado vai para `radar_article_blueprints`. O gancho `RadarSemanticEnricher`
(`semantic-concept-model.ts:422`) existe, mas nenhuma chamada o liga.

## 6. Item 1 — Malha obrigatória do Silo

**Dono:** Arquiteto (estrutura); Radar (aplicação).

### 6.1 Regras novas (o que é obrigatório)

| Relação | Hoje no grafo | Proposta | Onde entra no artigo |
|---|---|---|---|
| Suporte → Pilar | sim (HIGH) | **Obrigatória** | No corpo, na seção que trata o tema central. Se nenhuma seção tratar, entra na seção 1. |
| Pilar → cada Suporte | sim (HIGH) | **Obrigatória, todos** | No corpo, na seção que trata o recorte do Suporte. O que não couber vai para a trilha, mas **nenhum Suporte fica sem link do Pilar**. |
| Suporte ↔ Suporte | **não** | **Todos os pares do Silo** | No corpo só quando uma seção trata do assunto do irmão (âncora natural, no máximo 1 por irmão). O resto vai para a trilha "Continue no Silo". |
| SiloPage → todos | sim | Obrigatória | Lista da SiloPage (já existe). |
| Todo artigo → SiloPage | só o Pilar | **Obrigatória** | Trilha (início ou fim). Opcionalmente no corpo, se a seção falar do tema geral. |
| Entre Silos | proibido | Continua fora até D9 | — |

**Obrigação no grafo sem migration (D2, recomendação a):** dar sentido ao `priority`,
que hoje ninguém lê para obrigar:

- `HIGH` = **obrigatória no corpo** (S→P, P→S, SP→Pilar);
- `MEDIUM` = **no corpo quando a seção trata do destino; senão, trilha** (S↔S, SP→S);
- `LOW` = **trilha** (artigo→SiloPage e S↔S que a afinidade marcar como distante).

Nenhuma relação aprovada some: o que não tiver contexto vai para a trilha. A trilha é
a forma concreta do `REQUIRED_RELATION_WITHOUT_SUPPORTED_PLACEMENT` da invariante 28.
Assim a relação não fica só como pendência e chega ao texto como navegação. A
invariante continua valendo: zero ocorrências no corpo não remove a relação.

### 6.2 Afinidade (o que decide "corpo" ou "trilha" entre Suportes)

A afinidade é determinística e não usa IA. Ela é medida sobre o que o ArticleDNA e a
SERP de cada irmão já têm:
- termos de conteúdo comuns entre principal, complementares e Assunto;
- conceitos C e perguntas P em comum nas plantas, quando existem;
- a mesma faceta do Silo (cor ou grupo do plano declarado).

**Corte:** afinidade alta vira `MEDIUM`; baixa vira `LOW`. A IA de âncoras do Arquiteto
continua só escrevendo os conceitos de âncora, sem decidir a malha.

### 6.3 Silos grandes (15–30 artigos)

- **Malha:** continua completa no grafo. Com 30 artigos (29 Suportes) são 812 S↔S e
  930 arestas no total, e o contrato aceita (sem teto).
- **Corpo:** S→P obrigatório, mais até **1 link por H2** para irmãos de afinidade alta
  (no máximo 6, pela Regra 8). O Pilar põe no corpo os Suportes que as seções tratam.
- **Trilha "Continue no Silo":** até **12 irmãos**, ordenados por afinidade e depois
  pela ordem narrativa, mais a SiloPage. A SiloPage lista **todos** e é o índice
  completo (D3). Para o Pilar, a trilha lista **todos** os Suportes que não entraram no
  corpo, sem teto: é a função dele.
- **Regra de saída:** em Silos de até 13 artigos, todo artigo liga a todos os irmãos
  (corpo ou trilha). Acima disso, todo artigo fica a no máximo 2 cliques de qualquer
  outro (Pilar e SiloPage), e a trilha rotaciona por afinidade.
- **Equilíbrio de entrada:** todo artigo recebe pelo menos 3 links de corpo (Pilar e
  2 irmãos). O Arquiteto avisa quando um artigo fica "órfão no corpo".

### 6.4 Âncoras

- **A régua continua a do Radar (`natural-anchor-rule.ts`).** O Arquiteto passa a
  usá-la na partida:
  - `link-anchor-concepts.ts:34-48` deixa de pôr a principal do destino como primeiro
    conceito e usa recortes e ideias;
  - `link-anchor-ai.ts` recusa o conceito que é keyword do destino ou que a contém
    (hoje aceita `exact`).

  A regra é pura e mora em `lib/radar/`. A proposta é movê-la para
  `lib/editorial/natural-anchor-rule.ts` e reexportar de `lib/radar/` para não quebrar
  quem importa (mudança aditiva).
- **Na trilha**, a âncora é a ideia do destino em 3 a 6 palavras (o "porquê ler"), nunca
  o H1 nem a keyword. O livro de âncoras do lote (`RadarAnchorLedger`) cobre corpo e
  trilha.

### 6.5 Destino não publicado e publicados sem a malha

- **Destino novo:** fica como hoje. Texto simples até ir ao ar, nunca link quebrado.
- **Links a ativar (novo, leitura sem IA):** cruza grafo × identidade de publicação e
  lista, por artigo publicado, os destinos que já foram ao ar e cuja âncora ficou como
  texto simples. Aparece no Radar e em Publicações. É o "Pendente: ativar quando
  publicado" do docx, que hoje vive só no documento.
- **Atualização de malha dos publicados (D10):** um entregável "Atualizar links do
  Silo" que, para cada publicado, lista:
  - o link que falta;
  - a seção sugerida;
  - a âncora natural;
  - a linha da trilha.

  **O Radar não edita a página** (invariante 28), não muda URL, slug nem canonical. A
  leitura dos links já presentes na página publicada (`<a href>` internos) ainda **não
  foi verificada** no export de hoje: ele lê H1/H2 da página (`Estrutura publicada
  atual`). Se não ler links, esta fase lê na mesma busca da página, sem SERP.

### 6.6 Medição contínua

Os números de `radarArticleBlueprintReportFacts` (`graphRequired`/`graphPlaced`) viram
**conferência**. Uma relação HIGH sem lugar no corpo é corrigida assim:
1. a passada de correção da IA (já existe) tenta resolver;
2. se não resolver, o servidor põe a relação na seção de maior afinidade, sem IA;
3. em último caso, ela vai para a trilha.

O painel do Arquiteto mostra "malha: X de Y relações no corpo, Z na trilha" por Silo.

## 7. Item 2 — Keyword sem repetição antiga (SEO semântico)

**Dono:** Radar.

### 7.1 Regras novas (versão `2026-10-14`)

| # | Regra | Substitui |
|---|---|---|
| K1 | **Forma natural da principal.** A planta grava `title.principalNatural`: a principal em português correto, com preposição e flexão quando a forma crua não é gramatical (ex.: "captação de pacientes **para** dentista"). A conferência aceita a forma natural pelas mesmas raízes de conteúdo, na mesma ordem (base em `radarHumanVoiceHeadingHasKeyword`, `human-voice-guideline.ts:378`). A forma crua **não** aparece em título nem em H2 quando difere da natural. | uso da forma crua em todo título |
| K2 | **H1 e SEO title:** a principal natural aparece **uma vez** em cada um, em qualquer posição. Ela pode abrir o título, mas **em no máximo 1 das 3 opções**. O gancho pode vir primeiro. O SEO title tem até cerca de 60 caracteres, com a principal dentro dos primeiros 60 (truncamento). | "keyword no começo" em H1, alternativas e SEO title; a troca de metades |
| K3 | **3 opções com ângulos diferentes:** (a) dor → saída; (b) contraste com o topo da SERP (as promessas de "dicas" e números); (c) diagnóstico ou decisão (fundo de funil). Conferência: as 3 não começam pelas mesmas 3 palavras de conteúdo, e o Jaccard das raízes, tirando a principal, fica abaixo de 0,5. | "3 opções" só contadas |
| K4 | **Meta description:** natural, com a principal **ou** uma variação próxima uma vez. Dor ou contraste, o ganho e o motivo para clicar mesmo com resposta de IA. Até cerca de 155 caracteres. **Sem** obrigação dos primeiros 60. As 3 opções seguem K3. | "keyword nos primeiros 60" |
| K5 | **Abertura:** o primeiro parágrafo responde à busca com a principal ou uma variação próxima nas primeiras ~100 palavras, sem obrigar a primeira frase. | "primeira frase com a keyword" |
| K6 | **H2 por subtema, entidade ou pergunta real da SERP:** **nenhum H2 começa pela principal nem por uma complementar literal**. A principal aparece em no máximo 1 H2. Cada complementar entra **dentro da seção** que trata dela; no H2, só em forma natural e não no começo, no máximo 1 H2 por complementar. Dois H2 não começam pelas mesmas 2 palavras de conteúdo. | "primeiro H2 com a keyword"; complementar "cabeçalho ou dentro da seção" |
| K7 | **Densidade e variação semântica:** a forma natural da principal aparece no máximo `2 + palavras/600` vezes no corpo (cerca de 7 em 3.000 palavras). O resto é variação: sinônimos e entidades da SERP (`entities.shared`, conceitos C, buscas relacionadas B, `entityMap`). A planta grava `semanticVariants[]`, com 6 a 12 itens, cada um com o id da evidência. A régua vale para o Redator e para a revisão; o CSV diz o teto e as variações. | nada (hoje não há conferência) |
| K8 | **Nenhuma marca de processo em título nem em meta.** Proibido: "(precisa de fonte…)", "pendente", colchetes de instrução, "L1", "TODO". Se o título faz uma afirmação travada pela trava de fonte, a passada de correção **reescreve** o título sem a afirmação. Se ainda travar, o servidor escolhe a opção que passa. A afirmação travada continua listada em "Afirmações que só entram com fonte" na `estrutura`. | `comFonte` nos títulos (`article-blueprint.ts:4641-4644`) |
| K9 | **Isca genérica:** sem "dicas", "guia completo", "tudo sobre", "o que é" (regra atual, mantida). | — |

**Precedência:** keyword é substância de SEO, não tom. Onde a Skill da marca protege
gramática e proíbe densidade artificial, **a Skill vale**. Fica corrigida a leitura que
fazia a diretriz G vencer a Skill nesse ponto.

### 7.2 Onde muda

**`lib/radar/human-voice-guideline.ts`:**
- regras `titulo`, `meta` e `inicio` (`:155-178`);
- resumo (`:240`) e bloco do pedido (`:266-272`);
- funções novas: `radarKeywordNaturalPresent`, `radarHeadingStartsWithKeyword`,
  `radarKeywordOccurrences` e `radarTitleOptionsDistinct`;
- `radarHumanVoiceTitleWithKeywordFirst` (`:390`) deixa de ser aplicada. Ela fica
  exportada até a F1 fechar, para rollback.

**`lib/radar/article-blueprint.ts`:**
- regra 3 (`:1463`) e molde (`:1603-1606`, que ganha `principalNatural` e
  `semanticVariants`);
- correção (`:1634`);
- conferências (`:3716-3777`), mais V1–V7 abaixo;
- leitura (`:3221-3235`): a troca de metades sai;
- CSV (`:4829-4870, 5011`);
- marcas de fonte nos títulos (`:4632-4644`).

**`lib/radar/portable-writing-export.ts`:**
- `:1358` (complementar);
- `:3099` (prompt da linha);
- regra geral 12 via `radarHumanVoiceWritingRule`.

**Redator:** `radarHumanVoiceRedatorRule`, prompts de seção e de melhoria. É mudança
aditiva no texto e consome a mesma fonte.

**Docs:**
- `docs/compartilhado/diretriz-de-comunicacao-humana.md` (seções "H1 e SEO title",
  "Meta" e "Keyword na primeira frase");
- `docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md` (adendo H, que
  remete a esta SDD).

### 7.3 Validações automáticas (conferência da planta nova; leitura da planta gravada)

| # | Conferência | Ação |
|---|---|---|
| V1 | Nenhum H2 começa pela principal (crua ou natural) nem por uma complementar literal | correção da IA; sem IA, a conferência propõe o H2 pela `readerQuestion` da seção |
| V2 | Principal em no máximo 1 H2 | idem |
| V3 | H1 e SEO title com a principal natural exatamente 1 vez; meta com no máximo 1 | idem |
| V4 | Nenhuma marca de processo em H1, alternativas, SEO title e meta (regex) | **leitura corrige já** (tira a marca); conferência reescreve |
| V5 | A forma crua não gramatical (crua ≠ natural) não aparece em título nem em H2 | correção |
| V6 | 3 opções com ângulos distintos (K3); a principal abre no máximo 1 | correção |
| V7 | Isca genérica (atual) | — |

**Regra D10 (entregável concluído):**
- o que a passada de correção não resolver fica como nota no **painel**, nunca no CSV;
- o CSV sai concluído;
- quando nada passa, o servidor escolhe a melhor opção que passa nas réguas
  determinísticas.

## 8. Item 3 — SERP competitiva de verdade (com a IA que já usamos, sobre dados já coletados)

**Dono:** Radar.

### 8.1 Pré-cálculo determinístico (sem IA, sem SERP nova)

**`buildRadarCompetitiveReading`**, novo e puro, em `lib/radar/competitive-reading.ts`.
Ele roda dentro de `buildRadarArticleBlueprintBrief` (`article-blueprint.ts:1060`), sobre
o pacote congelado.

**Amostra relevante:**
- tira comparáveis fora do leitor ou do território do ArticleDNA, pela mesma régua de
  ruído e território do esqueleto (`editorial-article-model.ts`, `research-noise.ts`).
  No caso real, saem psitto, zenklub e amplimed;
- tira outliers de medida (`competitive-model.ts:69-92`);
- as medidas da planta passam a usar essa amostra (`article-blueprint.ts:773-785`).

**(a) Base que todos cobrem:** conceitos, tópicos e padrões "dominantes" na amostra
relevante (`competitive-observed-model.ts:413-423`), com contagem de sites.

**(b) O que só os melhores fazem:**
- cruza `ranks` (melhor posição nas 4 lentes) com cobertura de conceito e estrutura;
- entra o que está presente no top 3 relevante e ausente ou raro do 4º em diante;
- **é dado novo, feito com dado velho**: os `ranks` existem e nunca foram cruzados.

**(c) Lacunas e ganho de informação:**
- `gaps` e `differentiations` do modelo observado (G e D de hoje);
- `UNDERCOVERED`;
- perguntas do PAA cuja **resposta** coletada (`answer`, hoje não usada) é rasa ou vem
  de domínio fora do leitor;
- entidades `marketOnly`;
- fontes citadas pelo AI Overview que nenhum orgânico cita.

**(d) SEO antigo a não copiar** (detector por palavra, sobre dados já extraídos):
- `titlePatterns` com número + "dicas" ou "estratégias" (listicle);
- `keywordPlacement` com a keyword em title, H1, todos os H2 e abertura, e ocorrências
  acima do teto K7 (repetição);
- `faqCount` alto, ou FAQ no fim (FAQ despejado);
- H2 numerados;
- fechamento genérico (`closingText` com "gostou", "conclusão", "esperamos");
- título-isca;
- seção "o que é" quando há AI Overview (zero-click);
- página rasa (`wordCount` muito abaixo da mediana relevante com muitos H2).

### 8.2 A IA escreve os quatro blocos (na mesma chamada da planta)

O brief ganha:
- os quatro conjuntos acima, com ids de evidência novos (`T` = todos, `M+` = só os
  melhores, `G`/`D` mantidos, `V` = SEO velho);
- o ângulo recomendado do blueprint competitivo (`recommended.editorialAngle`,
  `differentiation`, `sectionDirections`, hoje não usados).

A planta grava, aditivo e opcional no payload:

```ts
competitive?: {
  consensus: Array<{ topic: string; sites: number; evidence: string[]; howWeCover: string }>;      // base mínima, curta
  bestOnly:  Array<{ practice: string; evidence: string[]; doBetter: string }>;                    // reforçar e superar
  gains:     Array<{ gap: string; kind: "dado"|"experiencia"|"exemplo"|"ferramenta"|"comparacao"|"regra_oficial";
                     giver: "marca"|"especialista"|"fonte_oficial"; evidence: string[]; section: string }>;
  oldSeo:    Array<{ pattern: string; seenIn: string[]; instead: string }>;                         // não copiar
  angle: string;                                                                                   // diferenciação explícita
  questionsKept:    Array<{ question: string; valueAnswer: string; section: string; evidence: string[] }>; // até 4
  questionsDropped: Array<{ question: string; reason: string }>;                                   // só painel
};
```

**Guardas:**
- todo item cita ids que existem; id inventado é recusado (AGENTS §9);
- `gains.giver = "marca"` ou `"especialista"` só se a Skill ou o parecer sustentam;
  se não, vira pedido de contribuição preparado (`PREPARED != SENT`, invariante 29),
  fora do CSV;
- **nada de "material insuficiente" em massa**: o CSV mostra até 4 perguntas que valem
  resposta. As descartadas ficam no painel, com motivo (D10);
- a estrutura dos concorrentes vira **referência**:
  - a seção M só vira H2 se responde a uma pergunta do leitor deste papel no Silo;
  - tema de definição com AI Overview vira 1 ou 2 frases da abertura;
  - as medidas viram faixa de referência ("o top relevante tem 1.800–2.400 palavras"),
    não meta de parágrafos.

**Custo:** zero SERP. A IA é a mesma "Organizar" (até 2 chamadas por artigo, hoje).

### 8.3 Coluna `cobrir_e_superar` (mesmo nome, conteúdo novo)

```
Ângulo deste artigo: …
1. Base que todos cobrem (diga em poucas linhas, sem copiar): …
2. O que os melhores fazem, e como fazer melhor: …
3. O que ninguém entrega e este artigo entrega (ganho de informação, de quem): …
4. SEO antigo que não se copia: …
Perguntas que valem resposta (e onde): …   (até 4)
Termos e entidades para variar a keyword: …   (K7)
Não cobrir: …   (como hoje)
```

`serp_resumida` ganha uma linha: "Amostra relevante: N de M páginas (fora: …)".

## 9. Item novo — Diferencial da marca e fechamento (pedido do dono, 2026-10-14)

**Dono:** Radar.

### 9.1 Por que o Adendo G não surte efeito (onde se perde)

1. **O gancho vira prefixo fixo.** "Keyword no começo" nas 3 opções, mais a troca de
   metades sem IA (`human-voice-guideline.ts:155-162, 390`;
   `article-blueprint.ts:3757-3766, 3221-3235, 4829-4848`), faz com que o gancho só
   possa ir no sufixo. As 3 opções viram a mesma frase. Nada confere ângulos distintos.
2. **A trava de fonte mata o gancho.** O gancho comercial ("o que o orgânico entrega de
   verdade") cai no detector de afirmação de plataforma ou de efeito comercial
   (`pending-claims.ts:497, 623`) e ganha "(precisa de fonte…)" no próprio título
   (`article-blueprint.ts:4641-4644`). Quem escreve faz o que a regra 5 manda,
   "escreva de forma qualificada ou omita", e tira a força. Daí o "sem gancho comercial
   forte" e a "isca 56/100".
3. **O fechamento não tem os 4 tempos como campos.** O schema tem `turn`, `cta`,
   `specialist` e `nextStep` (`article-blueprint.ts:446-451`). Os 4 tempos são só uma
   linha de instrução (`:4875`), sem conferência. No caso real:
   - a "facilidade" virou "começar com poucas páginas" (não "a marca faz");
   - o diagnóstico sumiu;
   - a regra "a chamada final é o argumento do especialista, inteiro" (Adendo F,
     item 6) pôs no CTA uma fala que não é diagnóstico ("Vamos planejar a presença
     orgânica…").

   Daí o "Fechamento 20/100".
4. **O método da marca não tem campo.** A autoridade local é "2 ou 3 sinais, onde o
   trecho pedir" (`:4874`, opcional). A Skill v1 diz "não liderar com siglas" e a
   diretriz diz "sem sigla". O resultado é que o método (SEO local, Silo, E-E-A-T,
   página por serviço, perfil no Google coerente) nunca é nomeado nem mostrado como
   entrega. Daí o "Diferencial 15/100" e o "termos de agência genérica".
5. **Ressalvas empilhadas sem dado.** Pesam juntos:
   - os mais de 13 "não" da Skill v1;
   - as regras gerais 4 e 5;
   - 10 perguntas "material insuficiente: responder de forma qualificada";
   - a lista de afirmações travadas;
   - "Fontes verificadas: nenhuma".

   Sem fato próprio para afirmar, o texto só pode ressalvar: 52 "não" e 0 dados.
6. **Seção de definição numa SERP com AI Overview.** O esqueleto promoveu "O que é /
   o que caracteriza tráfego orgânico" (8 de 20 páginas). É conteúdo que a resposta de
   IA já dá (zero-click). Daí o "informacional fraco (o que é)".

### 9.2 Proposta

**Bloco `brandEdge` na planta** (aditivo, opcional), montado de fontes que já existem:
Skill de voz (oferta, método, o que a marca não faz), parecer do especialista e SERP
(serviços concorrentes no topo, ex.: a agência "Prospecta Odonto" no orgânico 6).

```ts
brandEdge?: {
  method: Array<{ deliverable: string; methodName: string | null; section: string }>; // entrega concreta → nome do método uma vez, depois da entrega
  vsGeneric: string;            // contraste com a agência de posts/anúncios, ancorado no que a SERP mostra
  localSignals: Array<{ signal: string; section: string }>; // 2 ou 3, agora obrigatórios e com seção
  bottomFunnel: string;         // a seção de decisão (critérios, custo, prazo, como avaliar quem executa)
}
```

**Regras do bloco:**
- **Método:** a entrega vem antes e o nome depois, uma vez ("uma página por tratamento
  com as perguntas da recepção, ligadas entre si; isso tem nome: Silo"). Isso resolve
  o choque entre "sem sigla para leigo" e "mostre o método".
- **Fundo de funil:** 1 seção de decisão obrigatória quando a intenção tem componente
  comercial (`Misto`/`Comercial`). A seção de definição com AI Overview vira abertura.

**Fechamento em 4 campos, conferidos:**

```ts
closing: { pain: string; structureShift: string; ease: string; diagnosis: string; specialist?: string; nextStep?: string|null }
```

- `diagnosis` é o **CTA único**: uma verificação concreta da marca (verbo + objeto: "olho
  seu site, seu perfil no Google e as perguntas que mais chegam") e uma chamada.
- A fala aprovada do especialista **alimenta** `structureShift` e `ease` na voz dele.
  Ela deixa de substituir o diagnóstico. Isso **muda o item 6 do Adendo F** (D7).
- **Conferência:** os 4 campos preenchidos; `ease` diz quem faz (a marca); `diagnosis`
  tem verbo de verificação e 1 chamada só.

**Títulos:** K2, K3 e K8. O gancho pode vir primeiro, nunca leva marca de processo, e a
afirmação travada vira promessa delimitada pela própria marca ("o que eu verifico
antes") em vez de efeito garantido.

**Ressalvas:**
- a regra 5 continua (fato travado);
- o CSV diz **onde** está a força do texto: `gains` (o que a marca dá), `bestOnly`
  (fazer melhor) e `diagnosis`;
- as perguntas sem material saem do CSV (§8.2);
- a regra nova da linha "Silo": "ressalva uma vez, onde a afirmação está; não repita
  'não garante' em cada seção".

### 9.3 O que do Guardião entra e o que não entra

- **Entra:** gancho, isca, diferencial do método, autoridade local, fundo de funil,
  fechamento em 4 tempos e contraste com a agência genérica.
- **Não entra:**
  - KGR ou siglas como sinal no texto (KGR é critério de escolha de keyword no
    Minerador e no Arquiteto, não de redação);
  - qualquer pedido de repetir keyword.

## 10. Item 4 — Vídeos

**Dono:** Radar.

- O CSV de vídeo e `get_video_material` (`lib/server/radar-mcp-material.ts:100-160`;
  `portable-video-export.ts:3601`) passam a ler da planta:
  - `competitive.angle`;
  - `gains` (o que o vídeo mostra que ninguém mostra);
  - `oldSeo` (o que não fazer: "10 dicas", título-isca);
  - `bestOnly`;
  - `brandEdge`;
  - o fechamento em 4 campos.
- O título do vídeo segue K2 e K3: a principal natural, não necessariamente no começo.
  No YouTube, a principal nas primeiras ~60 letras continua sendo boa prática, então a
  conferência é "nos primeiros 60", não "no começo".
- Entram também, sem coleta nova:
  - as fontes citadas pelo AI Overview;
  - os temas H2/H3 dos concorrentes (`competitorOutlines`);
  - as entidades do modelo observado.

  Hoje esses três não chegam ao vídeo (`portable-video-export.ts:822-884, 3010-3228`).
- **Trilha do Silo no vídeo:** a descrição lista os artigos do Silo pela trilha (§6.3),
  com as âncoras naturais.
- **Zero chamada nova:** o vídeo segue sem IA e sem provider, e lê a planta.

## 11. Item 5 — Arquiteto × Radar (sem processo paralelo)

| Responsabilidade | Arquiteto | Radar |
|---|---|---|
| Malha do Silo (quem liga a quem, obrigatoriedade pelo `priority`, afinidade corpo/trilha) | **decide e grava** (`generateStructuralLinks` → `buildStructuralLinkConnections`, nova versão do grafo, aprovação humana) | lê o grafo aprovado; **não muda a estrutura** |
| Conceitos de âncora (partida) | grava, pela régua natural | escolhe a âncora final pela régua natural (`natural-anchor.ts`) |
| Lugar do link (seção, corpo ou trilha) | — | **decide** (aplicação evidencial, invariante 28) |
| Garantia de que HIGH vai ao corpo e nada some | — | conferência da planta (§6.6) |
| Análise competitiva, título, keyword, diferencial, fechamento | — | **decide** na planta (mesma chamada de IA) |
| Links a ativar e atualização dos publicados | — | lista (leitura); não edita a página |

**Regras de convivência:**
- **O Radar se adapta ao Arquiteto:**
  - grafo antigo, sem S↔S, continua válido;
  - o Radar aplica o que existe (F2) e monta a trilha com os membros do Silo que já lê
    (`input.silo.members`, `article-blueprint.ts:1242`), marcando-os "trilha (fora do
    grafo)";
  - nunca bloqueia artigo nem pede reenvio.
- **O Arquiteto ganha a malha completa (F4) pela mesma porta de hoje** ("Processar
  links", aprovação, sucessor). Não existe rota nova paralela.
- **O caminho do piloto é o de todos:** a mesma função monta a planta de Pilar,
  Suporte, novo e publicado.

## 12. Item 6 — Entregáveis mudam (por decisão do dono)

### 12.1 O que muda

| Entregável | Muda | Não muda |
|---|---|---|
| CSV "Para escrever" | conteúdo de `titulo_e_seo`, `estrutura`, `cobrir_e_superar`, `links_internos` (corpo + "Trilha do Silo" T1…), `prompt` da linha; regra geral 12 e nova regra de ressalva na linha "Silo"; linha nova em `serp_resumida` | **13 colunas, mesma ordem e nomes** (`portable-writing-export.ts:137-151`); linhas "Silo", "Voz da marca" e artigos; corte em partes; "Não altere"; D10 |
| CSV de vídeo | título (K2/K3), descrição (trilha), capítulos com ângulo, ganhos e SEO antigo, fechamento | colunas (`portable-video-export.ts:137-160`) |
| Artigo-modelo (payload) | campos **aditivos opcionais**: `title.principalNatural`, `semanticVariants`, `competitive`, `brandEdge`, `closing.{pain,structureShift,ease,diagnosis}`; `rulesVersion = "2026-10-14"` | plantas gravadas (imutáveis); `turn`/`cta` continuam lidos nas antigas |
| Redator / `get_writer_*` | regra de voz e keyword (K), fechamento em 4 campos nos fundamentos, trilha | contrato do `ContentDocument` |
| MCP `get_article_for_writing` / `get_video_material` | os mesmos CSVs | ferramentas, escopos |
| Catálogo (`lib/agent/platform-catalog.ts`) | nota da diretriz, malha obrigatória, trilha, links a ativar (AGENTS §17.1) | — |
| Grafo | sucessor com S↔S e artigo→SP; `priority` com sentido | versões aprovadas antigas (imutáveis) |

### 12.2 Versão das regras e plantas já congeladas

- `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION` muda de `"2026-10-11c"` para `"2026-10-14"`
  em F1, e para `"2026-10-14b"` em F3. `radarArticleBlueprintRulesNoticeText` ganha o
  texto de cada uma. `catalogNote` (`human-voice-guideline.ts:296`) acompanha.
- **Recomendação (D6): não recongelar nem regerar sozinho.**
  - **Vale na hora, na leitura, sem IA e sem mudar o payload nem o hash:**
    - tirar a marca de processo dos títulos (V4);
    - garantir os links HIGH do grafo, com o Pilar → todos os Suportes no corpo ou na
      trilha;
    - montar a trilha "Continue no Silo";
    - a forma natural, quando a correção é só de preposição e a planta não tem
      `principalNatural` (ex.: "dentista" → "para dentista" não é dedutível com
      segurança; nesse caso o CSV diz, como instrução concluída, "escreva a principal
      na forma natural: …", sem regra fixa).
  - **Exige "Organizar de novo" (IA, até 2 chamadas por artigo, sem SERP):** H2 sem
    repetição, 3 ângulos de título, análise competitiva, `brandEdge` e fechamento em 4
    campos.
  - **Ordem recomendada:** os 8 artigos do Silo "Leads sem Tráfego Pago" (piloto), e
    depois sob demanda, quando o artigo entrar no lote de escrita. A tela já avisa
    "regras antigas"; o MCP `get_article_for_writing` diz a versão.

### 12.3 E0 atualizado por decisão registrada

- O E0 (`tests/entregaveis-intocados-2026-10-13.test.mts`, tabela `RETRATO`
  `:547-652`) continua sendo **a prova de escopo**.
- Cada fase que muda entregável traz:
  1. a lista das **chaves autorizadas a mudar** (ex.: F1 → `*.csv-para-escrever`,
     `*.artigo-modelo.pedido.*`, `voz-humana/*`, `mcp.get_article_for_writing`,
     `redator.*`);
  2. a atualização do `RETRATO` **só nessas chaves**, com comentário
     `// 2026-10-14 · SDD silo interligado · F<n> · decisão do dono (frase do §1)`;
  3. um teste novo que falha se uma chave **fora** da lista mudar: ele compara o
     `RETRATO` anterior, guardado em `tests/fixtures/entregaveis-2026-10-13.sha256.json`
     como cópia congelada, com o novo;
  4. no relatório da fase, o `git diff` dos hashes por chave.
- A tabela anterior é preservada em fixture para auditoria. O cabeçalho do E0 passa a
  dizer "mudar entregável exige decisão do dono registrada numa SDD".

### 12.4 Prova de que nada fora do escopo muda

- O E0 mostra que as chaves fora da lista não mudam:
  - identidade de publicação;
  - `resolveRadarPublication`;
  - âncoras naturais (até F4, que muda só a partida do Arquiteto, não a régua);
  - corte em partes;
  - Amazon e YouTube (blocos comerciais).
- **`git diff --stat` vazio nos arquivos da F2 "listas leves":**
  - `lib/arquiteto/minerador-import.ts`;
  - leitores leves da mesa;
  - rotas e componentes da planilha do Arquiteto.
- **Nenhuma migration:** D2-a.
- **Nada no Minerador:**
  - `git diff --stat -- lib/minerador modules/minerador app/api/minerador` vazio.

## 13. Antes → depois do caso real (Suporte "captação de pacientes dentista")

Principal crua: "captação de pacientes dentista". Forma natural: "captação de pacientes
para dentista". Os textos do "depois" são **exemplos do que as regras pedem**. A
redação final é da planta e de quem escreve. Promessas ficam delimitadas e sem número
inventado.

**H1 (3 opções)**

| Antes (CSV) | Antes (docx, corrigido à mão) | Depois |
|---|---|---|
| Captação de pacientes dentista sem anúncios: o que o orgânico entrega de verdade (precisa de fonte: afirmação sobre plataforma) | Captação de pacientes para dentista: seu conhecimento pode trabalhar além do consultório | (dor → saída) **A agenda sobe com o anúncio e cai quando ele para? Captação de pacientes para dentista com estrutura própria** |
| Captação de pacientes dentista sem verba: por que a agenda depende de base, não de anúncio | Captação de pacientes para dentista: menos dependência de anúncios, mais conteúdo próprio | (contraste com o topo de "10/22 dicas") **Menos dicas, mais estrutura: a captação de pacientes para dentista que o Google encontra** |
| Captação de pacientes dentista no orgânico: a rotina que sobrevive quando a verba acaba | Captação de pacientes para dentista: transforme um site parado em um blog de autoridade | (diagnóstico / fundo de funil) **Seu consultório aparece para quem procura dentista na região? O diagnóstico antes da próxima campanha** |

A terceira opção usa uma variação próxima ("procura dentista") e é aceita por K2 como
opção. A escolhida para o H1 traz a forma natural.

**SEO title (3 opções, até ~60)**

| Antes | Depois |
|---|---|
| Captação de pacientes dentista sem anúncios: o que o orgânico entrega (precisa de fonte…) | **Captação de pacientes para dentista sem depender de anúncio** (59) |
| (docx) Captação de pacientes para dentista além dos anúncios | **O paciente te acha no Google? Captação para dentista** (52) |
| (docx) Captação de pacientes para dentista com conteúdo próprio | **Antes da próxima campanha: diagnóstico de captação no consultório** (64 → a correção encurta) |

**Meta description (3 opções, até ~155)**

| Antes | Depois |
|---|---|
| Captação de pacientes dentista sem anúncio: o que o orgânico entrega, o que cobra de você e por onde começar a rotina (precisa de fonte…). | **Post, anúncio e agência e a agenda ainda oscila? Veja como site, perfil no Google e respostas às perguntas da recepção ajudam a captação de pacientes para dentista.** |
| (docx) Captação de pacientes para dentista sem viver de anúncios: transforme dúvidas reais em artigos… | **Lista de dicas não diz por onde começar. Aqui está o que verificar no site e no perfil do Google para o paciente da sua região achar o consultório.** |
| (docx) Captação de pacientes para dentista com menos dependência de mídia: descubra… | **Antes de pagar outra campanha: o que o paciente vê quando procura dentista perto dele, o que o CRO permite publicar e o que fazer primeiro.** |

**H2**

| Antes (planta) | Depois (subtemas e perguntas reais da SERP, ganho de informação) |
|---|---|
| Captação de pacientes dentista sem anúncios começa pelo orgânico | **Por que a agenda sobe com o anúncio e cai quando ele para** (dor, nível 3; o "o que é orgânico" vira 2 frases daqui, porque há AI Overview) |
| Tráfego orgânico como fazer para captar pacientes no dia a dia | **O que o paciente da sua região vê quando procura um dentista** (entidades: Google, Perfil da Empresa, avaliações, site; PAA "Como conseguir captar pacientes?") |
| Por que investir em tráfego orgânico e não só em anúncio | **As perguntas da recepção que viram páginas, e o que o CRO permite publicar** (lacuna: PAA "O que o CRO não permite postar?" e nenhum orgânico do topo responde; fonte oficial `cfo.org.br`, a verificar) |
| Estratégias de tráfego orgânico que cabem na rotina do consultório | **Empresa de captação de pacientes, agência de posts ou estrutura própria: como comparar** (fundo de funil; a complementar dentro do H2, natural, não no começo; contraste com o serviço do topo) |
| Quem faz tráfego orgânico para o dentista e o que esperar do retorno | **Como saber se está funcionando: do clique ao paciente na cadeira** (medição; o "tráfego orgânico como fazer" entra no corpo) |

**Antes:** 2 de 5 H2 trazem a principal ou a complementar como prefixo; a seção 1 é
definição. **Depois:** 0 H2 começa por keyword; 1 H2 traz a complementar de forma
natural; a definição vira abertura.

**Links internos (Silo com 8 artigos)**

| Antes | Depois |
|---|---|
| L1 Pilar (seção 1) · L2 instagram (s2) · L3 tráfego pago vs orgânico (s3) · L4 campanhas sem anúncios (s4) · L5 SiloPage (s5). "promoções" citado sem link; "como captar um cliente" e "como atrair um cliente" ausentes | **Corpo:** L1 → Pilar "leads qualificados" (HIGH, s1, ex.: "contatos que viram consulta") · L2 → instagram (s1, "o feed que não traz ninguém") · L3 → tráfego pago vs orgânico (s1, "pago ou orgânico") · L4 → como captar um cliente (s2, "o primeiro contato") · L5 → campanhas sem anúncios (s3, "campanha sem verba") · **Trilha "Continue no Silo":** T1 promoções para estética ("promoção que não derruba a margem") · T2 como atrair um cliente ("o que faz alguém escolher você") · T3 SiloPage ("o mapa do tema"). **Todos os 7 irmãos e a SiloPage**; destinos novos ficam como texto simples até ir ao ar. |

E na linha do **Pilar** "leads qualificados": antes eram 3 links, para 7 Suportes
exigidos. Depois, **os 7 Suportes**: os que as seções tratam vão no corpo, o resto na
trilha, mais a SiloPage.

**Fechamento**

| Antes | Depois (4 campos conferidos) |
|---|---|
| "Dor: a verba some e a agenda some junto. Estrutura própria no Google: site, perfil e conteúdo que a busca encontra. Facilidade: começar com poucas páginas bem feitas." CTA = fala inteira do especialista: "…Vamos planejar a presença orgânica da sua clínica no Google?" | **Dor:** "Se a agenda depende do mês em que o anúncio roda, você está alugando a atenção do paciente." · **Mudança para a estrutura:** "A saída é o consultório achável no Google: uma página por tratamento, o perfil da empresa coerente com o site e as perguntas da recepção respondidas, ligadas entre si." (a fala do especialista entra aqui, na voz dele) · **Facilidade:** "Eu pesquiso, escrevo e publico; você revisa o que é clínico e conta o que já responde na cadeira." · **Diagnóstico (CTA único):** "Quer saber por onde começar? Eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção, e te digo o que falta." (a oferta de diagnóstico precisa estar na Skill v2 ou no parecer, D8) |

**`cobrir_e_superar` (resumo do depois)**
- **Ângulo:** "o checklist do que a clínica já tem antes de qualquer canal". Já existia
  na planta (G1/D1), mas não guiava nada.
- **Base:** canais e conteúdo (11/20), site profissional (7/20), diferença pago ×
  orgânico (5/20). Diga em poucas linhas.
- **Só os melhores:** a definir pelo cruzamento `ranks` × cobertura. No retrato, o top
  relevante (capim, cemoi, idealodonto) organiza por jornada do paciente.
- **Ganho:** regras do CRO para publicar (regra oficial); o que o paciente vê na busca
  local (experiência da marca); a conta "do clique ao paciente" (método da marca).
- **SEO antigo:** "10 estratégias", "22 dicas", "Dicas de Ouro" (listicle e isca);
  "como captar 20 pacientes sem gastar R$1,00" (promessa sem dado); keyword em todos
  os H2.
- **Perguntas (até 4):**
  - Como conseguir captar pacientes?
  - O que o CRO não permite postar?
  - Como criar um script para captar pacientes? (vira a resposta da recepção)
  - Como funciona o tráfego vindo de IA?
- **As outras 6** saem do CSV (painel).

## 14. Fases (maior ganho com menor risco primeiro)

| Fase | Dono | O quê | Arquivos | Risco |
|---|---|---|---|---|
| **F0** | Radar | Fixture do caso real (CSV do dono reduzido a dossiê de teste, sem dado pessoal); teste "antes" que fixa o comportamento atual; cópia do `RETRATO` em fixture | `tests/fixtures/`, `tests/radar-silo-interligado-caso-real.test.mts` | nenhum |
| **F1** | Radar | K1–K9, V1–V7, títulos sem marca, 3 ângulos; regras `2026-10-14`; leitura corrige V4 nas plantas gravadas | `human-voice-guideline.ts`, `article-blueprint.ts`, `portable-writing-export.ts`, Redator (texto), catálogo, diretriz | baixo; E0 nas chaves de título e pedido |
| **F-S** | Radar | Item novo (§16.1): SERP crua por artigo (`<NN>-<papel>-<slug>-serp.csv`), no .zip da exportação "para escrever" sem Silo e na ferramenta MCP `get_article_serp_raw`, pelo mesmo núcleo; catálogo | `lib/radar/serp-raw-export.ts` (novo), montagem do export (aditivo), rota de export (aditivo), tela do Radar (download), `platform-mcp-tools.ts`, catálogo | baixo; nenhum entregável de antes muda (E0 sem chave autorizada) |
| **F2** | Radar | Links HIGH do grafo garantidos (Pilar → todos os Suportes, S→P) na planta nova e na leitura; trilha "Continue no Silo" a partir dos membros do Silo; regra 6 do pedido ampliada | `article-blueprint.ts` (pedido, conferência, colunas), `internal-link-plan.ts` | baixo; nenhuma estrutura nova (o grafo já tem P↔S) |
| **F3** | Radar | `buildRadarCompetitiveReading` (determinístico); `competitive`, `brandEdge` e fechamento em 4 campos na planta; `cobrir_e_superar` novo; amostra relevante e medidas sem outlier; regras `2026-10-14b` | `competitive-reading.ts` (novo), `article-blueprint.ts`, `portable-writing-export.ts` | médio (prompt maior; conferir que cabe nas 2 chamadas) |
| **F4** | Arquiteto | Malha completa: S↔S e artigo→SP no gerador; `priority` com sentido; afinidade; âncora natural na partida; sucessor do grafo por Silo com aprovação humana | `internal-link-structure.ts`, `link-anchor-concepts.ts`, `link-anchor-ai.ts`, `arquiteto-workspace.tsx` (`generateStructuralLinks`), `lib/editorial/natural-anchor-rule.ts` | médio; **só depois da F2 "listas leves" fechar** (`arquiteto-workspace.tsx` é compartilhado) |
| **F5** | Radar | Links a ativar; "Atualizar links do Silo" para publicados; painel "malha X/Y" | leitura nova, export | baixo |
| **F6** | Radar | Vídeo: ângulo, ganhos, SEO antigo, `brandEdge`, fechamento, trilha, entidades, AI Overview | `portable-video-export.ts`, `radar-mcp-material.ts` | baixo |
| **F7** | dono | "Organizar de novo" dos 8 artigos do Silo piloto (até 16 chamadas de IA, sem SERP); exportar; comparar; acompanhar o Search Console por 8–12 semanas | — | — |
| **F-A** | Radar | Item novo (§16.2): fontes externas de autoridade — candidatas (citadas pelos concorrentes; SERP já coletada nos domínios da lista da Marca; verbete da Wikipédia da entidade), conferência automática no ANALYZE (fetch do servidor com as guardas da extração, robots.txt, teto por artigo, sem IA), gravação na análise, transparência na tela e na SERP crua; lista editável na Marca | `authority-sources-contract.ts`, `authority-sources.ts`, `authority-source-verification.ts` (novos), rota nova, `radar-page.tsx` (ANALYZE), detalhes da pesquisa, `serp-raw-export.ts`, montagem do export, BrandDNA (campo opcional), painel da Marca, catálogo | baixo; nenhum entregável de escrita muda (E0 sem chave autorizada) |
| **F-B** | Radar | Aplicação das fontes verificadas (id X) no artigo-modelo, no CSV de escrita e no MCP de escrita — **depois da F3** | `article-blueprint.ts`, `portable-writing-export.ts`, `radar-mcp-material.ts`, pacote congelado | médio (E0 nas chaves de escrita) |

## 15. Testes (fixtures, sem chamada paga, sem banco remoto)

- **Caso real, antes e depois** (`tests/radar-silo-interligado-caso-real.test.mts`):
  - **Antes (F0)** fixa:
    - H1, title e meta começam pela forma crua;
    - "(precisa de fonte" no título;
    - 5 links;
    - 2 H2 com keyword prefixo;
    - Pilar com 3 de 7.
  - **Depois:**
    - nenhuma marca no título;
    - a forma crua ausente dos títulos;
    - a principal natural 1× em H1 e title;
    - abre no máximo 1 das 3 opções;
    - 3 ângulos distintos;
    - 0 H2 começando por keyword;
    - 8 destinos (7 irmãos + SiloPage) entre corpo e trilha;
    - linha do Pilar com 7 Suportes;
    - fechamento com 4 campos e 1 CTA;
    - `cobrir_e_superar` com 4 blocos;
    - no máximo 4 perguntas;
    - psitto, zenklub e amplimed fora da amostra.
- **F1:**
  - V1–V7 com casos bons e ruins (os H2 reais da §4.2 como fixture);
  - leitura de planta `2026-10-11c` sem mudar o payload nem o hash;
  - D10 (nada de nota no CSV);
  - Redator e MCP com a mesma regra (`test:radar`, `test:redator`, `test:agent`).
- **F2:**
  - Silo de 8 e de 30 (fixture sintética): HIGH sempre no corpo ou na trilha, nunca
    sumindo;
  - teto por seção respeitado;
  - trilha com no máximo 12 + SiloPage, e o Pilar sem teto;
  - destino novo como texto simples.
- **F3:**
  - pré-cálculo determinístico sobre `tests/radar-piloto-*` (consenso, só os melhores
    via `ranks`, lacunas com `answer` do PAA, SEO antigo via `titlePatterns` e
    `keywordPlacement`);
  - id inventado recusado;
  - `giver` sem sustentação vira pedido preparado;
  - medidas sem outlier.
- **F4:**
  - `buildStructuralLinkConnections` com N artigos gera `2 + 3(N−1) + (N−1)(N−2) +
    (N−1)` arestas e as prioridades certas;
  - `rebase` mantém S↔S;
  - âncora de partida nunca é a keyword do destino;
  - isolamento por marca (`test:arquiteto`, contratos do grafo, cross-brand).
- **F5:** links a ativar com destino que vai ao ar; publicado sem link lista o que
  falta.
- **F6:** CSV de vídeo com ângulo, ganhos e trilha; zero IA e zero provider.
- **Sempre:** E0 com a lista de chaves autorizadas (§12.3); `npm run test:agent`
  (catálogo); `tsc`; lint dirigido; `git diff --check`.
- **Validação manual:** homologação no ar é do dono (exportar o CSV do Silo piloto
  antes e depois).

## 16. Decisões (com recomendação)

**Todas DECIDIDAS pela recomendação** em 2026-10-14. Frase literal do dono, em
resposta a "seguir as 14 recomendações (D1–D14) + um item novo": "sim, pode sim, e
do MCP também é uma boa ideia, pode implementar". A coluna "Recomendação" abaixo é,
desde então, a decisão.

| # | Decisão | Recomendação (decidida em 2026-10-14) |
|---|---|---|
| D1 | Suporte ↔ Suporte: todos os pares do Silo, corpo por afinidade e o resto na trilha | **Sim.** Reverte a decisão escrita em `internal-link-structure.ts:11-14` |
| D2 | Como gravar a obrigatoriedade: (a) dar sentido a `priority` (HIGH corpo, MEDIUM corpo se trata, LOW trilha), sem migration; (b) coluna nova `placement`, com migration | **(a)** |
| D3 | Silos grandes: trilha com no máximo 12 irmãos + SiloPage como índice completo; Pilar sem teto | **Sim** |
| D4 | Principal: forma natural 1× no H1 e no title, abre no máximo 1 de 3 opções; meta sem "primeiros 60" | **Sim** |
| D5 | Nenhum H2 começa por principal ou complementar; complementar dentro da seção | **Sim** |
| D6 | Plantas gravadas: corrigir na leitura o que não precisa de IA; "Organizar de novo" sob demanda, começando pelo Silo piloto | **Sim, sem regerar sozinho** |
| D7 | A fala do especialista alimenta "mudança" e "facilidade"; o CTA é o diagnóstico (muda o item 6 do Adendo F) | **Sim** |
| D8 | Oferta de diagnóstico da marca: entra na Skill v2 da AdalbaPro (dado da Marca, o dono edita) ou como parecer do especialista | **Skill v2** (proposta de texto fica no painel da Marca, não aplicada pelo agente) |
| D9 | Links entre Silos | **Adiar.** Exige tipo novo de relação e migration; nesta SDD só a SiloPage cita a SiloPage vizinha quando a SERP mostrar a ligação, como texto |
| D10 | Entregável "Atualizar links do Silo" para publicados (lista, sem editar página) | **Sim (F5)** |
| D11 | Amostra relevante: tirar comparáveis fora do leitor ou território e outliers das medidas | **Sim** |
| D12 | Medidas dos concorrentes como faixa de referência, não meta de parágrafos | **Sim** |
| D13 | Perguntas: até 4 com resposta de valor no CSV; o resto no painel | **Sim** |
| D14 | E0 atualizado por fase só nas chaves autorizadas, com teste de escopo | **Sim** |

### 16.1 Item novo — SERP crua por artigo, para conferência externa (decidido em 2026-10-14)

**Pedido do dono** (mesma resposta de 2026-10-14). O dono exporta sempre um CSV por
artigo (`<NN>-<papel>-<slug>-para-escrever.csv`). Não é regra; é a prática
recomendada, e a tela e o catálogo a dizem assim. Ao lado dele, sai um arquivo
`<NN>-<papel>-<slug>-serp.csv`, com o mesmo prefixo, para o dono (ou outra IA)
conferir a SERP fora da plataforma.

**O que o arquivo traz** (só dados JÁ coletados; nenhuma coleta nova, nada pago):
- uma linha por resultado orgânico por lente, nas 4 lentes: lente, posição, URL,
  domínio, data da coleta, título, descrição/snippet, estrutura de títulos coletada
  da página (H1/H2), sinais (data visível, autor, resumo de IA no topo da SERP);
- linhas de "Pessoas também perguntam" (pergunta, resposta exibida pelo Google e URL
  da fonte) e de buscas relacionadas;
- a marca do concorrente considerado irrelevante pela D11 (fora do leitor, fora do
  território ou outlier de medida): **marcado, nunca escondido**.

**O que não traz:** o texto integral das páginas dos concorrentes. Só título, trecho,
estrutura de títulos e URL (evita cópia e mantém leve).

**Formato:** CSV com BOM UTF-8 e cabeçalho claro, como o de escrita.

**Decisões de implementação (registradas na fase F-S, §18.1):**
- **Entrega na tela: um .zip por exportação "para escrever" sem Silo**, com o CSV de
  escrita e a SERP crua de cada artigo. A tela já tem esse padrão (o .zip sem
  compressão dos Silos) e o motivo dele vale aqui: dois downloads seguidos esbarram na
  permissão do navegador para baixar vários arquivos. O CSV de escrita dentro do .zip
  é byte a byte o de antes.
- **MCP: ferramenta nova `get_article_serp_raw`**, em vez de mudar
  `get_article_for_writing`. A ferramenta de escrita continua com o contrato e o
  arquivo de antes (o E0 trava os dois); a SERP crua é leitura opcional, pedida só
  quando a IA vai conferir a SERP, e não pesa no material de escrita. As duas usam o
  MESMO núcleo do arquivo da tela, com corte em partes como o CSV de escrita.
- **Lentes extras:** a lente canônica sai do snapshot congelado no pacote; as outras
  três saem do resumo orgânico já gravado no cache (a mesma leitura grátis do CSV de
  vídeo). Lente sem resumo gravado sai declarada, nunca inventada nem recoletada.

### 16.2 Item novo — Fontes externas de autoridade (autorizado em 2026-10-14)

**Pedido e autorização do dono (2026-10-14).** Pôr no corpo dos artigos links externos
de autoridade, reforçando conceitos, dados e informações, com entidades como o Google,
órgãos de governo (Ministério da Saúde etc.) — e, nas palavras dele, "pode ser sim também
do https://pt.wikipedia.org/". Autorização: "pode implementar". O nicho é saúde (YMYL):
referência marcada aumenta autoridade e credibilidade e ajuda as IAs a usar os dados.

**O caso real.** O contrato já previa link externo com fonte verificada (artigo-modelo,
regra 7; coluna `fontes_e_especialista`), mas a fonte só contava como "verificada"
quando alguém interpretava o que ela diz (`factualEvidence` com `SUPPORTS`), e ninguém
fazia isso: no CSV real saía "Fontes verificadas: nenhuma nesta investigação" e só
"citadas pelo mercado". A verificação de 12.1 abria a página, mas não casava a fonte com
afirmação nenhuma, e só olhava o que os concorrentes citavam.

**Fase A — coleta e conferência (esta; CONCLUÍDA em código, ver §18.1).**
1. **Candidatas, sem coleta paga e sem URL inventada:** (a) os links externos que as
   páginas concorrentes já citam; (b) os endereços da SERP já coletada (orgânicos,
   fontes do resumo de IA, de "Pessoas também perguntam" e do painel de entidade) que
   pertencem a um domínio da **lista de autoridades da Marca**; (c) com a Wikipédia na
   lista, o verbete da entidade central pela regra fixa do site, que só vale depois de
   aberto e conferido (título = entidade; desambiguação recusa).
2. **A lista é dado da Marca**, editável pelo dono em Marca → Identidade da marca →
   "Fontes de autoridade" (campo opcional `authoritySources` do BrandDNA; vale a versão
   aprovada). Vazia = a lista sugerida: gov.br (Ministério da Saúde em `/saude`, Anvisa,
   INCA), saude.gov.br, bvsms.saude.gov.br, anvisa.gov.br, ibge.gov.br, inca.gov.br;
   conselhos (cfo, cfm, cff, cfn, cfp .org.br; cofen e coffito .gov.br); OMS (who.int) e
   OPAS (paho.org); SciELO, PubMed/NCBI, BVS; pt.wikipedia.org; developers.google.com/search
   e support.google.com.
3. **Conferência automática no ANALYZE** ("Analisar concorrência · e finaliza" e o lote
   "Pesquisar e finalizar", pelo mesmo handler), sem custo pago e **sem IA**: o servidor
   abre cada candidata com as guardas da extração (SSRF, DNS, redirect com teto), user-agent
   identificado, robots.txt respeitado, até 8 por artigo, 3 por vez, 6 s por página;
   confirma que existe (2xx), é HTML, continua no domínio declarado e tem um trecho que
   trata de uma afirmação do artigo (casamento por raízes de palavras; sem trecho, "não
   sustenta").
4. **Gravação** na versão da análise (`payload.authoritySources`): fontes verificadas com
   id X (url, domínio, entidade, título, trecho, data da página, tipo — governo, conselho,
   científica, enciclopédia, documentação Google, lista da marca, mercado —, origem e a
   afirmação que sustenta, com YMYL marcado), as que falharam com o motivo, as afirmações
   de saúde que exigem fonte e quais X as sustentam, e o custo (0 chamada paga, 0 IA).
5. **Transparência:** tela do artigo (Pesquisa → Detalhes → "Fontes externas de
   autoridade"); SERP crua e `get_article_serp_raw` com "fonte citada pelos concorrentes"
   e "fonte verificada"/"fonte não conferida".
6. **Não muda nesta fase:** `article-blueprint.ts`, `human-voice-guideline.ts`,
   `portable-writing-*.ts`, `radar-mcp-material.ts` (`get_article_for_writing`), o pacote
   congelado e o E0.

**Fase B — aplicação (depois da F3 desta SDD; CONCLUÍDA em código em 2026-10-14, regras `2026-10-14c`, ver §18.1).** As fontes verificadas (id X)
entram no pacote congelado e no artigo-modelo como candidatas de link externo por seção
(regra 7 com o trecho e a afirmação), no CSV de escrita (`fontes_e_especialista` e o
corpo) e no MCP de escrita, com a marcação de YMYL; o E0 muda só nas chaves que a fase
autorizar.

## 17. Riscos e rollback

**Riscos:**
- **Excesso de links ou aparência de fazenda de links:**
  - teto de 1 por H2 no corpo para irmãos;
  - trilha com no máximo 12;
  - âncora natural e variada;
  - a SiloPage como índice.
- **Âncoras repetidas com muitos destinos:** o livro de âncoras cobre corpo e trilha. A
  trilha usa a ideia do destino, não o H1.
- **Prompt maior na F3:** os conjuntos têm teto (até 6 itens por bloco). Se a resposta
  não couber, a passada de correção completa. Medir tokens antes.
- **Plantas antigas convivendo com novas:** a tela já avisa a versão. A leitura corrige o
  determinístico.
- **Atribuição no Search Console:** 8 a 12 semanas, sem prometer causa. Comparar CTR por
  página atualizada × não atualizada.
- **F4 colidir com a F2 "listas leves" em `arquiteto-workspace.tsx`:** a F4 só começa
  depois que a F2 fechar.

**Rollback:**
- código anterior por fase;
- campos novos do payload são opcionais e ignorados pelo código antigo;
- versões do grafo são imutáveis: o sucessor com a malha pode ser substituído por um
  novo sucessor igual ao anterior, com aprovação humana;
- o E0 anterior fica em fixture;
- nenhuma migration.

## 18. Documentação ao concluir cada fase

- `docs/05-radar/estado-atual.md` e `backlog.md`;
- `docs/04-arquiteto/estado-atual.md`, `backlog.md` e
  `links-internos-estado-e-contrato.md` (sentido de `priority`, malha, trilha);
- `docs/compartilhado/diretriz-de-comunicacao-humana.md`;
- adendo H na SDD do Radar;
- `lib/agent/platform-catalog.ts` (AGENTS §17.1).

**Distinguir sempre:**
- verificado no código;
- confirmado por teste;
- validado manualmente (pelo dono);
- planejado.

### 18.1 Andamento por fase

Ordem autorizada em 2026-10-14: F0 → F1 → F-S (item novo) → atualização do E0 só nas
chaves autorizadas. F2 autorizada depois, no mesmo dia (links obrigatórios do grafo e
trilha no Radar). F3 e seguintes ficam para depois (não começadas). Atualização do mesmo
dia: a F4 (malha completa no Arquiteto) foi autorizada e feita em frente própria, em
paralelo com a F3 (ver a entrada F4 abaixo). A F3 (análise competitiva, diferencial da
marca e fechamento) também foi autorizada e feita no mesmo dia (ver a entrada F3 abaixo).

**F0 — CONCLUÍDA (confirmado por teste, 2026-10-14).**
- `tests/fixtures/silo-interligado-caso-real-2026-10-14.mts`: o caso real reduzido a
  dossiê de teste (domínio da marca trocado por `marca-exemplo.com.br`, sem nome de
  quem assina, sem o texto do docx; só os títulos corrigidos à mão). Traz o registro
  literal do "antes" e a planta gravada (regras 2026-10-11c) que cada fase lê.
- `tests/fixtures/entregaveis-2026-10-13.sha256.json`: a cópia congelada do `RETRATO`
  do E0 (105 entradas), para auditoria.
- `tests/radar-silo-interligado-caso-real.test.mts`: o "antes" registrado (9 opções
  com o mesmo prefixo, "(precisa de fonte" no H1/title/meta, 2 de 5 H2 pela keyword,
  5 links, Pilar 3 de 7) e o "antes" no código de 2026-10-11c.
- `tests/radar-entregaveis-escopo-2026-10-14.test.mts`: o teste de escopo do E0 (D14),
  com a lista de chaves autorizadas por fase.

**F1 — CONCLUÍDA em código (confirmado por teste, 2026-10-14; validação manual no ar é
do dono).** Regras do artigo-modelo `2026-10-14`; leitura do Redator `2026-10-14`;
`RADAR_KEYWORD_RULES_VERSION = "2026-10-14"`.
- **Verificado no código:**
  - `lib/radar/human-voice-guideline.ts`: regras `titulo`, `meta` e `inicio` reescritas
    (K1–K9); resumo da SERP, regra 28 do pedido, regra do Redator e nota do catálogo; a
    precedência da keyword (a Skill vale na gramática e na densidade); as réguas puras
    `radarKeywordOccurrences`, `radarKeywordNaturalPresent`, `radarKeywordWithinChars`,
    `radarKeywordCrudeFormPresent`, `radarHeadingStartsWithKeyword`,
    `radarHeadingsSameOpening`, `radarTitleOptionsOpenedByKeyword`,
    `radarTitleOptionsDistinct`, `radarTitleProcessMark`, `radarTitleWithoutProcessMarks`
    e `radarKeywordBodyCap`. A troca de metades (`radarHumanVoiceTitleWithKeywordFirst`)
    não é mais aplicada; fica exportada para rollback. A regra do vídeo não mudou (F6).
  - `lib/radar/article-blueprint.ts`: `title.principalNatural` e `semanticVariants`
    (aditivos, opcionais); pedido (regra 3, molde, passada de correção); conferência
    V1–V7 (notas que pedem ação; fechando, ficam no painel) e K8 sem IA (a marca sai; ao
    fechar, o H1 travado troca de lugar com a alternativa que passa); leitura da planta
    gravada sem a troca de metades e sem marca de processo (D6, sem mudar payload nem
    hash); colunas `titulo_e_seo` e `estrutura` com K1–K9 como instrução concluída; o
    aviso de versão para as plantas `2026-10-11c`.
  - `lib/radar/portable-writing-export.ts`: prompt da linha (K2/K6) e a complementar
    "dentro da seção"; as keywords do artigo vão às colunas também no artigo novo.
  - `lib/redator/writer-blueprint-for-writing.ts`: `WRITER_BLUEPRINT_READING_RULES = "2026-10-14"`.
  - `docs/compartilhado/diretriz-de-comunicacao-humana.md`: as três seções e a precedência.
- **Confirmado por teste:** `tests/radar-silo-interligado-caso-real.test.mts` (antes e
  depois do caso real) e `tests/radar-keyword-sem-repeticao-2026-10-14.test.mts` (V1–V7);
  testes antigos que fixavam "keyword no começo" atualizados com o comentário da fase.
- **E0 (D14):** mudaram só as chaves autorizadas da F1: `*/artigo-modelo.pedido.system`,
  `*/artigo-modelo.pedido.user`, `*/artigo-modelo.planta-congelada`,
  `*/csv-para-escrever`, `*/mcp.get_article_for_writing`, `voz-humana/diretriz` e
  `voz-humana/textos` (48 linhas). Ficaram iguais: CSV de vídeo e
  `get_video_material`, Redator (documento, fundamentos, `get_writer_brief`), âncoras,
  identidade de publicação, `voz-humana/reguas`, `.meta` e a fonte dos handlers. O
  snapshot do F4.4 (`radar-assunto-f4`) foi refeito na mesma fase e bate com o E0.
- **Não feito na F1 (fica para as fases dela):** links obrigatórios e trilha (F2);
  análise competitiva, `brandEdge` e fechamento em 4 campos (F3); vídeo (F6).

**F-S (item novo, §16.1) — CONCLUÍDA em código (confirmado por teste, 2026-10-14;
download real e MCP no ar são validação do dono).**
- **Verificado no código:**
  - `lib/radar/serp-raw-export.ts` (novo, puro): `radarSerpRawRows`, `radarSerpRawCsv`,
    `radarSerpRawExport`, `radarSerpRawFilename`, `radarSerpRawArchiveFilename`,
    `radarSerpRawPositionOf`, `radarSerpRawPagesOf`. Colunas: `tipo`, `lente`, `posicao`,
    `posicao_na_pagina`, `url`, `dominio`, `coletado_em`, `titulo`, `descricao`,
    `estrutura_h1_h2`, `sinais`, `relevancia_d11`.
  - Montagem do export (`lib/server/radar-portable-export-core.ts`): opção aditiva
    `serpRawPages` (as páginas lidas, das extrações já gravadas, sem texto).
  - `lib/radar/video-competitive.ts`: o resumo orgânico das lentes extras passa a
    levar o trecho e a data que o cache já guarda (aditivo; o vídeo lê só URL, título e
    posição — o E0 do vídeo não mudou).
  - Rota `app/api/editorial/radar-export/route.ts`: `serpRaw` (aditivo) no "para
    escrever" sem `groupBy`; a resposta ganha `serpRaw.files` e `serpRaw.archiveFilename`.
  - Tela `modules/radar/radar-page.tsx`: o padrão do card passa a ser "Só os artigos
    selecionados (recomendado: um artigo por vez)"; o "Exportar CSV" baixa um .zip com o
    CSV de escrita (o mesmo de antes) e os `-serp.csv`. O Silo completo continua no
    card, sem a SERP crua.
  - MCP: `get_article_serp_raw` (leitura, `platform.read` + ver o Radar), pela
    `radarMcpSerpRawForArticle` (`lib/server/radar-mcp-material.ts`), em partes de 12 mil
    caracteres; `get_article_for_writing` não mudou.
  - Catálogo: operação `radar.serp_raw` e as notas da exportação por artigo e da F1.
- **Confirmado por teste:** `tests/radar-serp-crua-2026-10-14.test.mts` (função pura sobre
  a SERP do caso, D11 marcado, nome e .zip, MCP = rota, ponta a ponta na bancada do
  export sem nada sair do banco, catálogo); `npm run test:agent` com a ferramenta nova.
- **E0 (D14):** nenhuma chave muda na F-S (a lista autorizada da fase é vazia).
- **Limites:** as lentes extras trazem os orgânicos do resumo do cache (lido na hora da
  exportação; pode ser mais novo que o pacote congelado, e a data vai em `coletado_em`);
  a resposta do "Pessoas também perguntam" só existe na lente canônica; o texto do
  resumo de IA não é guardado (só as fontes que ele cita); a exportação do Silo completo
  não leva a SERP crua.

**F2 — CONCLUÍDA em código (confirmado por teste, 2026-10-14; a exportação real do Silo
piloto é validação do dono).** D1, D2, D3, D6 e D10, pelo desenho do §6 e do §11: o Radar
se adapta ao Arquiteto (o grafo é só lido; F4 grava a malha no grafo). Regras do
artigo-modelo continuam `2026-10-14` (a SDD só muda a data em F1 e em F3).
- **Verificado no código:**
  - `lib/radar/silo-link-mesh.ts` (novo, puro): `radarSiloMeshPriority` (o `priority`
    com sentido, D2, e o mínimo estrutural: Suporte → Pilar e Pilar → cada Suporte são
    HIGH; sem aresta, irmão MEDIUM e SiloPage LOW, do Pilar MEDIUM),
    `radarSiloMeshGraphPriorities` (arestas de saída do grafo aprovado),
    `radarSiloMeshPlan` (afinidade por raízes, sem IA; teto de 3 links por seção; o
    HIGH na seção de maior afinidade, o Pilar sem ela na primeira que cabe; trilha com
    no máximo 12 irmãos e a SiloPage, a do Pilar sem teto, relação do grafo nunca
    cortada), `RADAR_SILO_MESH_LIMITS`, `RADAR_SILO_MESH_PLACEMENT` e o texto da
    obrigação.
  - `lib/radar/article-blueprint.ts`: `priority` no candidato K (aditivo, opcional),
    calculado no pacote do pedido com o `priority` do grafo; regra 6 com a malha do
    Silo e a obrigação em cada K; `radarArticleBlueprintSiloMesh` (uma função para a
    conferência e a leitura): sem fechar, a pendência ("Falta o link para o Pilar … no
    corpo", "O Pilar não liga ao Suporte …"); fechando e na leitura, o HIGH no corpo,
    com âncora natural pela régua de sempre; na leitura, os destinos do Silo de hoje
    que a planta não tem viram candidatos "KS" só da leitura. Colunas: a linha "Malha
    do Silo" e a "Trilha 'Continue no Silo'" (T1…Tn) depois dos L, a trilha na medida
    de links e numa linha da estrutura; o aviso de versão diz a malha.
  - `lib/radar/portable-writing-export.ts`: os destinos dos links levam papel, ordem
    narrativa e `priority` do grafo; o CSV passa o papel do artigo (`articleRole`); a
    célula `links_internos` tem teto próprio de 32 mil (link não é cortado); a ressalva
    "sai isolado do Silo" não sai quando o Silo tem outro destino.
  - `lib/agent/platform-catalog.ts`: a nota "Malha do Silo e trilha" (AGENTS §17.1).
  - Não mudou: `lib/radar/internal-link-plan.ts` (a obrigação e a trilha moram na régua
    nova; o plano de aplicação continua dizendo a relação sem contexto), o grafo, o
    Arquiteto, o Redator, o CSV de vídeo, as âncoras (régua) e o Minerador.
- **Confirmado por teste:** `tests/radar-silo-malha-f2-2026-10-14.test.mts` (régua D2;
  caso real do Suporte — 5 L passam a 5 L + 3 T, 8 de 8 destinos — e do Pilar — 3 L
  passam a 6 L + 2 T, os 7 Suportes e a SiloPage; Silo de 30; destino não publicado;
  âncoras sem keyword do destino e sem repetir no lote; a leitura que põe o Pilar de
  volta numa planta gravada sem mudar o payload; pedido e conferência). A fixture do F0
  ganhou a planta gravada do Pilar.
- **E0 (D14):** a F2 autoriza `*/artigo-modelo.brief`, `*/artigo-modelo.pedido.system`,
  `*/artigo-modelo.pedido.user`, `*/artigo-modelo.planta-congelada`,
  `*/csv-para-escrever` e `*/mcp.get_article_for_writing`; mudaram 27 linhas. Ficaram
  iguais: CSV de vídeo e `get_video_material`, Redator (documento, fundamentos,
  `get_writer_brief`), âncoras, identidade de publicação, voz humana, `.meta`, a fonte
  dos handlers e os CSVs sem Silo. O snapshot do F4.4 (`radar-assunto-f4`) foi refeito
  e bate com o E0.
- **Limites:** o grafo não grava a malha (F4); até lá, S↔S e Suporte → SiloPage saem
  dos membros do Silo e a trilha diz "fora do grafo aprovado". O Redator, o CSV de vídeo
  e o formato completo ainda não recebem a trilha nem o HIGH posto na leitura. A
  afinidade é por raízes, sem sinônimo. Links a ativar, "Atualizar links do Silo" e o
  painel "malha X/Y": F5.

**Verificação ao fechar F0, F1 e F-S (2026-10-14, árvore de trabalho do dia, com a F3
"Arquiteto só lê" rodando em paralelo em outra frente):** `test:radar` 3577 (3576 ✔, 1
pulado, 0 falha; base 3544 + 33 novos); `test:redator` 361 ✔; `test:redator:mcp` 150 ✔;
`test:agent` 90 ✔ com a ferramenta nova (numa segunda rodada, 1 falha da outra frente: a
rota nova `/api/minerador/marcas/[brandId]/architect-suggestions` ainda sem lugar no
catálogo); Minerador por glob 1347 com as 25 falhas antigas; `test:arquiteto` e `tsc` só
com falhas e erros em arquivos da outra frente (melhoria, reforço de publicados,
importar do Minerador, ler antes de buscar). `git diff --check` limpo; EOL preservado.

**Verificação ao fechar a F2 (2026-10-14, árvore de trabalho do dia, com a F5 "Arquiteto
só lê" rodando em paralelo em outra frente):** `test:radar` 3592 (3591 ✔, 1 pulado, 0
falha; base 3577 + 15 novos); `test:redator` 361 ✔; `test:redator:mcp` 150 ✔;
`test:agent` 90 ✔; `test:arquiteto:lentes` 106 ✔; `test:arquiteto` 2955 com 2 falhas da
outra frente (rótulo "Formar os artigos do plano", arquivos que a F2 não toca); Minerador
por glob 1316 com as mesmas 25 falhas antigas, por nome; `tsc` 0 erro. `git diff --check`
limpo nos arquivos da fase; EOL preservado. Nenhum arquivo do Minerador, do Arquiteto nem
da planilha de Artigos foi tocado; nenhuma migration.

**F3 — CONCLUÍDA em código (confirmado por teste, 2026-10-14; "Organizar de novo" do caso
real e a exportação no ar são validação do dono).** Itens 3 e 9 da SDD; D7, D8, D11, D12 e
D13. Regras do artigo-modelo `2026-10-14b`; `RADAR_CLOSING_RULES_VERSION = "2026-10-14b"`.
Sem SERP nova e sem chamada a mais: a MESMA chamada do artigo-modelo (até 2, como antes).
- **Verificado no código:**
  - `lib/radar/competitive-reading.ts` (novo, puro): `buildRadarCompetitiveReading` (amostra
    relevante D11 marcada e nunca escondida; faixa de referência D12; T = base, M+ = só os
    melhores pelo cruzamento `ranks` × cobertura, N = ganho de informação pela resposta do
    PAA, fontes que só o resumo de IA cita, tema pouco coberto e entidade só do mercado, U =
    SEO antigo por títulos, padrões de título e H2), `radarCompetitiveReadingInputOf` e
    `radarCompetitiveReadingOf` (a ponte do pacote: o pedido e o CSV leem pela mesma
    função), `radarCompetitiveRelevanceReasons` (a régua D11, agora também a da coluna
    `relevancia_d11` da SERP crua) e as linhas da amostra e da faixa.
  - `lib/radar/brand-edge.ts` (novo, puro) e `lib/marca/brand-diagnosis-offer.ts` (novo,
    puro, dado da Marca): o fechamento em 4 campos e as réguas (verbo de verificação, uma
    chamada só, quem faz), `brandEdge` e a oferta de diagnóstico da Skill (D8) com o texto
    padrão neutro e a proposta para a Skill v2.
  - `lib/radar/article-blueprint.ts`: o pacote com `competitive` e `diagnosisOffer` (não
    gravados) e T, M+, N, U como evidência; as medidas da planta pela amostra relevante; o
    pedido com as regras 29 e 30, a regra 8 (D7), a regra 11 (D12) e os blocos "# Análise
    competitiva" e "# Oferta de diagnóstico"; a resposta com `competitive`, `brandEdge` e
    `closing.{pain, structureShift, ease, diagnosis}` (aditivos, opcionais; com os campos,
    `turn` e `cta` montados pelo servidor); a conferência (id inventado recusado; ganho sem
    Skill ou parecer vira pedido preparado, PREPARED ≠ SENT; até 4 perguntas, as outras ao
    painel com motivo; os 4 campos conferidos e, fechando, o diagnóstico falho pela oferta
    da Skill ou pelo texto padrão); as colunas (faixa de referência, "Diferencial da
    marca", fechamento em 4 tempos com o diagnóstico como CTA único; na planta gravada, o
    CTA aprovado continua — AGENTS §9 — e a fala do especialista vai à mudança e à
    facilidade; o SEO antigo no título; o ângulo de diferenciação na promessa); o aviso de
    versão para as plantas `2026-10-14` e anteriores.
  - `lib/radar/portable-writing-export.ts` (e o lote): `cobrir_e_superar` nos quatro
    blocos (§8.3), até 4 perguntas que valem resposta (sem "material insuficiente"),
    "Termos e entidades para variar a keyword"; "Amostra relevante" na `serp_resumida`; a
    oferta de diagnóstico da Skill corrente na linha; a coluna `prompt` com teto próprio de
    12 mil. As 13 colunas e a ordem não mudaram. `get_article_for_writing` entrega o mesmo
    CSV pelo mesmo núcleo.
  - `lib/radar/human-voice-guideline.ts`: a regra "fechamento" (D7/D8), a regra nova
    "ressalvas" (afirmação delimitada e concreta, ressalva uma vez), na regra 28 do pedido,
    na regra geral 12 e no Redator; a nota do catálogo com as regras `2026-10-14b`.
  - Tela: o painel do artigo-modelo mostra a análise competitiva (com as perguntas fora do
    CSV e os pedidos preparados), o diferencial e os 4 campos; a Marca (detalhe da Skill de
    voz) mostra a proposta da seção "Oferta de diagnóstico" quando ela falta, sem gravar.
  - `lib/agent/platform-catalog.ts`: a nota da F3 (AGENTS §17.1).
- **Confirmado por teste:** `tests/radar-analise-competitiva-f3-2026-10-14.test.mts` (17:
  leitura pura sobre a SERP do caso, régua D11 única, pedido, conferência, D7, D8, o CSV
  antes e depois do caso real, a fala do especialista fora do CTA, as ressalvas, a mesma
  leitura no pedido e no CSV). A fixture do F0 ganhou a SERP do caso (orgânicos, PAA com a
  resposta, resumo de IA, páginas comparáveis com posição, medidas, conceitos e H2).
- **E0 (D14):** a F3 autoriza `*/artigo-modelo.brief`, `*/artigo-modelo.pedido.system`,
  `*/artigo-modelo.pedido.user`, `*/artigo-modelo.planta-congelada`, `*/csv-para-escrever`,
  `*/mcp.get_article_for_writing`, `voz-humana/diretriz` e `voz-humana/textos`; mudaram 54
  linhas. Ficaram iguais: CSV de vídeo e `get_video_material`, Redator (documento,
  fundamentos, `get_writer_brief`), âncoras, identidade de publicação, `voz-humana/reguas`,
  `.meta` e a fonte dos handlers. O snapshot do F4.4 (`radar-assunto-f4`) foi refeito e bate
  com o E0.
- **Limites:** detectores de palavras; "rasa" = resposta com menos de 140 caracteres; a
  resposta do PAA só na lente canônica; o "só os melhores" pede 5 páginas relevantes com
  posição; o texto da análise, `brandEdge` e os 4 campos só organizando de novo (D6); o
  Redator e o CSV de vídeo ainda não leem `competitive`, `brandEdge` nem os 4 campos (vídeo
  na F6). A oferta de diagnóstico real depende do dono acrescentar a seção à Skill (D8).
- **Verificação (2026-10-14, árvore de trabalho do dia, com a F4, a F-A e a F5 "adoção do
  Arquiteto" rodando em outras frentes):** `test:radar` 3628 (3622 ✔, 1 pulado, 5 falhas,
  todas em `radar-f5-adocao-versao-arquiteto-2026-10-13`, da frente que edita
  `lib/radar/architect-update.ts` e `lib/server/radar-architect-adoption.ts`, arquivos que a
  F3 não toca); `test:redator` 361 ✔; `test:redator:mcp` 150 ✔; `test:agent` 90 ✔;
  `test:arquiteto` 2980 ✔; Minerador por glob 1347 com as mesmas 25 falhas antigas; `tsc`
  só com o erro do teste daquela frente. `git diff --check` limpo nos arquivos da fase; EOL
  preservado. Nenhum arquivo do Minerador, do grafo do Arquiteto nem migration.

**F-A (item novo, §16.2: fontes externas de autoridade) — CONCLUÍDA em código
(confirmado por teste, 2026-10-14; a conferência real no ar é validação do dono).**
- **Verificado no código:**
  - `lib/radar/authority-sources-contract.ts` (novo, só zod e texto): a lista sugerida
    (`RADAR_DEFAULT_AUTHORITY_DOMAINS`), a leitura da lista da Marca
    (`radarParseAuthorityLines`, `radarEffectiveAuthorityList`), o casamento endereço ×
    lista (`radarAuthorityEntryFor`, a entrada mais específica), os tetos
    (`RADAR_AUTHORITY_LIMITS`) e o registro (`RadarAuthoritySourcesRecordSchema`).
  - `lib/radar/authority-sources.ts` (novo, puro): `buildRadarAuthorityCandidates`,
    `radarAuthorityMatchClaim` (afirmação ↔ trecho por raízes), `radarWikipediaArticleUrl`,
    `radarCompetitorCitedSources` e a leitura da tela `radarAuthoritySourcesView`.
  - `lib/radar/authority-source-verification.ts` (novo, servidor): `verifyRadarAuthoritySources`
    (robots.txt por site, guardas da extração, domínio declarado, timeout, teto) e o núcleo
    da rota `radarAuthoritySourcesForAnalysis`.
  - `lib/radar/competitor-extractor.ts`: o laço guardado de busca virou
    `fetchGuardedExternalResponse` (exportado; `userAgent`, `accept` e `stopRedirectWhen`
    opcionais), mais `readGuardedBody` e `stripHtmlMarkup`; a extração de concorrentes usa
    o mesmo laço, sem mudar de comportamento.
  - Rota nova `app/api/editorial/radar-analysis/authority-sources` (pedido sem URL,
    `.strict()`; lê a versão gravada, o snapshot da SERP e o BrandDNA aprovado — só
    SELECT); `lib/server/radar-authority-sources.ts` (a lista da Marca).
  - `modules/radar/radar-page.tsx`: a chamada no `analyzeSerpSelection`, depois das fontes
    citadas; o resultado vai para a versão final (`authoritySources`); falha vira registro
    "não conferidas" com o motivo, sem derrubar a análise.
  - `lib/radar/analysis-contracts.ts`: `authoritySources` (aditivo, opcional);
    `radar-reset.ts` o limpa.
  - Tela: `modules/radar/radar-r3-research-details.tsx` ("Fontes externas de autoridade").
  - SERP crua: `serp-raw-export.ts` (`radarSerpRawSourcesOf`, linhas "fonte citada pelos
    concorrentes", "fonte verificada", "fonte não conferida"), montagem do export
    (`serpRawSources`, só com a SERP crua) e a descrição de `get_article_serp_raw`.
  - Marca: `BrandDNASchema.authoritySources` e `BrandDnaDraftSchema.authoritySources`
    (opcionais; versão antiga com o mesmo hash), o bloco "Fontes de autoridade" no painel
    da Identidade da marca.
  - Catálogo: rota no `radar.investigate` e as notas da conferência, da lista na Marca e da
    SERP crua.
- **Confirmado por teste:** `tests/radar-fontes-de-autoridade-2026-10-14.test.mts` (16):
  lista padrão e da Marca, candidatas só do que foi coletado, Wikipédia pela entidade,
  conferência com fetch simulado (ok, 404, redirecionamento para outro domínio sem abrir o
  outro site, timeout, página que não sustenta, robots.txt, verbete que não é a entidade,
  teto de 8), YMYL marcado, gravação e reset, SERP crua, estrutura (ANALYZE, rota sem URL,
  guardas da extração) e a Fase B intocada.
- **E0 (D14):** nenhuma chave muda na F-A.
- **Custo:** nenhuma chamada paga e nenhuma IA; por artigo, até 8 páginas públicas e um
  robots.txt por site.
- **Limites:** o casamento é lexical (raízes), sem sinônimo: fonte boa com vocabulário
  diferente sai "não sustenta"; página PDF não é lida; robots.txt que não responde impede a
  abertura (conservador); a lista da Marca só vale aprovada; a SERP considerada é a
  canônica do snapshot da análise (as lentes extras não entram); o verbete da Wikipédia é
  montado só para entidade de até 4 palavras.

**F-B (item novo, §16.2: fontes externas de autoridade no texto) — CONCLUÍDA em código
(confirmado por teste, 2026-10-14; "Organizar de novo" de um artigo de saúde com fontes
conferidas e a exportação no ar são validação do dono).** Autorização do dono (2026-10-14):
links externos de autoridade no corpo — Google, governo (Ministério da Saúde etc.) e Wikipédia
em português —, porque aumentam autoridade e credibilidade; o nicho dele é saúde (YMYL).
Regras do artigo-modelo **`2026-10-14c`**. Dono: Radar. Sem migration, sem SQL de escrita, sem
chamada paga e sem chamada de IA a mais (a mesma do artigo-modelo, até 2).
- **Verificado no código:**
  - `lib/radar/authority-sources-writing.ts` (novo, puro): a régua única da aplicação —
    `radarAuthorityWritingOf` (vira link só a fonte verificada de autoridade: governo, conselho,
    científica, enciclopédia, documentação do Google, lista da Marca; a de saúde primeiro; a do
    "mercado", a comercial/rede social e o concorrente da SERP ficam só como referência; as
    afirmações de saúde sem fonte verificada; as afirmações sustentadas), `radarAuthorityAnchor`
    (âncora no nome da entidade), `radarAuthorityBodyLinkRange` (de 2 a 5; menos só com menos
    fontes), `radarAuthoritySectionFor` (a seção que trata da afirmação: 2 raízes em comum, sem
    IA) e `radarAuthorityLinksInPlan` (a conferência da faixa; fechando, põe a que falta e tira o
    que passa de 5).
  - Pacote congelado: `RadarEvidenceBundle.authoritySources` (aditivo e opcional; a cópia do
    registro gravado na análise por `buildRadarEvidenceBundleFromAnalysis`; sem o registro, a
    chave não existe e o hash é o de antes). `RadarPortableExportInput.authoritySources`
    (aditivo), ligado pela montagem do export (`radar-portable-export-core.ts`) a partir do
    pacote; o formato completo diz as fontes em `authority_requirements_md`
    (`RADAR_PORTABLE_DOSSIER_V3_COVERAGE`).
  - `lib/radar/article-blueprint.ts`: as fontes X de autoridade no pacote do pedido com o id da
    Fase A, a entidade, o tipo, o trecho, a afirmação, a marca YMYL e a âncora (campos aditivos
    em `RadarArticleBlueprintSource`; as verificadas de antes seguem a numeração depois delas);
    `ymylWithoutSource` no pacote (aditivo, só quando há); a regra 7 nova; a lista "Afirmações de
    saúde SEM fonte verificada"; a conferência (`radarAuthorityLinksInPlan` e
    `radarArticleBlueprintYmylWithoutSource`, a mesma porta da trava de fonte com a origem nova
    `YMYL_SEM_FONTE` em `pending-claims.ts`); a coluna estrutura com "Link externo Xn (entidade):
    na frase …, âncora no nome da entidade (…) → url" e, na planta anterior, a instrução
    concluída; `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION = "2026-10-14c"` e o aviso por versão.
  - `lib/radar/portable-writing-export.ts`: `fontesDeAutoridade` nas projeções; a coluna
    `fontes_e_especialista` com a lista curta (id X, entidade e tipo, endereço, afirmação, âncora,
    seção da planta ou sugerida; o trecho fica no `-serp.csv` e no painel), as referências e as
    afirmações de saúde sem fonte; a afirmação sustentada por fonte X sai de "Não afirmar como
    fato sem fonte", da ressalva do veredito e da trava; a de saúde sem fonte entra na trava
    (`radarWritingAuthoritySupported`, `radarWritingAuthorityPendingClaims`).
    `get_article_for_writing` entrega o mesmo CSV pelo mesmo núcleo (a fonte do handler não
    mudou). `cobrir_e_superar` não mudou: o §16.2 indica a coluna das fontes e o corpo.
  - `lib/radar/human-voice-guideline.ts`: só a nota do catálogo (regras `2026-10-14c`).
  - `lib/agent/platform-catalog.ts`: a nota "Fontes externas de autoridade no texto" (AGENTS §17.1).
  - `docs/compartilhado/diretriz-de-comunicacao-humana.md`: a seção "Links externos de
    autoridade" (remete à régua; a voz não mudou).
- **Decisão de versão (2026-10-14b → 2026-10-14c):** o pedido (regra 7) e a conferência (faixa
  2–5 e YMYL) mudaram, que é a regra do próprio código para subir a data; a planta
  `2026-10-14b` não tem os links X nas seções, e a tela precisa dizê-lo e oferecer "Organizar de
  novo". A planta gravada não é desligada (D6): o CSV e o MCP já listam, sem IA e sem mudar
  payload nem hash, as fontes disponíveis (com a seção sugerida quando há casamento) e as
  afirmações de saúde sem fonte, e a estrutura diz a instrução concluída.
- **Decisão sobre o guarda de tamanho ("o CSV para escrever é 5× menor que o completo"):** não
  mudou. Sem o registro da conferência (todos os cenários da bancada e do E0), nada é
  acrescentado ao CSV; com ele, a coluna das fontes usa o formato curto (no caso real, de 101
  para 1.278 caracteres na planta nova, com 4 fontes; o trecho de cada fonte fica no `-serp.csv`).
- **Confirmado por teste:** `tests/radar-fontes-no-texto-f-b-2026-10-14.test.mts` (9: régua e
  âncoras, limite 2–5, pacote e hash, pedido, conferência do caso real, antes → depois do CSV do
  caso real, planta gravada sem IA e sem mudar o payload, caso de saúde com e sem fonte
  verificada, nenhuma URL fora das verificadas, catálogo). `radar-fontes-de-autoridade-2026-10-14`:
  o teste da "Fase B intocada" virou "a escrita só lê o registro congelado". Testes que fixavam
  as regras `2026-10-14b` atualizados com o comentário da fase.
- **E0 (D14):** a F-B autoriza `*/artigo-modelo.pedido.system`, `*/artigo-modelo.planta-congelada`
  e `voz-humana/textos`; mudaram 17 linhas (8 + 8 + 1). Ficaram iguais: o pacote do pedido, o
  pedido do usuário, o CSV "Para escrever", `get_article_for_writing`, o CSV de vídeo e
  `get_video_material`, o Redator (documento, fundamentos, `get_writer_brief`), as âncoras, a
  identidade de publicação, as réguas e a diretriz da voz e a fonte dos handlers.
- **Verificação (2026-10-14, árvore de trabalho do dia, com a frente da adoção do grafo de links
  no Radar rodando em paralelo):** `test:radar` 3646 (3645 ✔, 1 pulado, 0 falha; base 3637, sem
  falha, + 9 novos); `test:redator` 361 ✔; `test:redator:mcp` 150 ✔; `test:agent` 90 ✔;
  `test:arquiteto` 2980 ✔; Minerador por glob 1347 com as mesmas 25 falhas antigas (arquivos que
  a fase não toca); `tsc` 0 erro; `git diff --check` limpo; EOL preservado.
- **Limites:** casamento por raízes (sem sinônimo) para a seção e para a afirmação de saúde; o
  Redator e o CSV de vídeo ainda não leem as fontes; a descrição de `get_article_for_writing` não
  diz as fontes (o E0 trava a fonte do handler); o registro só existe para análises feitas
  depois da Fase A (as outras dizem "anterior à conferência" até o próximo ANALYZE).

**F4 — CONCLUÍDA em código (confirmado por teste, 2026-10-14; "Completar a malha" no Silo
piloto e a aprovação do grafo são validação do dono).** Dono: Arquiteto. D1, D2 e D3, pelo
desenho do §6 e do §11, na mesma porta de hoje ("Processar links", aprovação humana,
sucessor). Feita em frente própria, com a F3 em curso em paralelo (nenhum arquivo da F3
tocado).
- **Verificado no código:**
  - `lib/arquiteto/internal-link-structure.ts`: `buildStructuralLinkConnections` grava a
    malha (D1 reverte a decisão escrita nas linhas 11-14): o esqueleto de antes, mais cada
    Suporte → SiloPage (`LOW`) e Suporte ↔ Suporte em todos os pares (`MEDIUM` de assunto
    próximo, `LOW` no resto); `{ mesh: false }` devolve o esqueleto.
    `structuralLinkSiblingAffinities` (afinidade determinística, §6.2: termos da principal,
    complementares, reforços e Assunto em comum, raiz de 5 letras, sem o cenário do Silo; a
    faceta do plano quando há mais de uma; simétrica) e `structuralLinkMeshConnectionCount`.
    Os conceitos C e as perguntas P das plantas (§6.2) não entram: o Arquiteto só lê os
    artefatos dele.
  - `lib/arquiteto/link-anchor-concepts.ts` (§6.4): a partida deixou de pôr a principal do
    destino como primeiro conceito (Assunto, recortes das buscas e entidades, nunca uma
    keyword do destino nem frase que contenha uma inteira; sem recorte, o rótulo).
    `lib/arquiteto/link-anchor-ai.ts`: recusa `TARGET_KEYWORD` (`anchorRepeatsTargetKeyword`,
    a régua do Radar repetida sem dependência e conferida por teste; o `exact` deixou de
    passar) e a regra 11 do prompt (variar). A régua não foi movida para `lib/editorial/`
    (o módulo do Radar carrega o export inteiro; a repetição pura evita isso).
  - `lib/arquiteto/silo-link-mesh.ts` (novo, puro): `summarizeSiloLinkMesh` (X de Y por
    artigo, obrigatórias no corpo, "órfão no corpo"), `planLinkAnchorWork` e
    `applySiloMeshAnchorReuse` (ler antes de buscar: a âncora aprovada, da IA ou humana
    fica; a aresta da malha reaproveita a do mesmo destino, sem a keyword dele e variada por
    origem; só o esqueleto sem âncora vai à IA), `estimateLinkAnchorCost` (lotes de 40),
    `previewSiloLinkMesh` e `siloMeshCompletionOnlyAdds`.
  - `modules/arquiteto/arquiteto-workspace.tsx` (aba Links internos): "Processar links"
    abre a prévia com o custo e só roda em "Confirmar e processar" (o "Processar links de
    novo" do plano também); quadro "Malha do Silo"; "Completar a malha do Silo" para grafo
    aprovado sem a malha (prévia; só acrescenta, conferido antes de gravar as âncoras e no
    fim); `generateLinkAnchors` pede à IA só o que falta e reaproveita o resto.
  - Radar, mudança mínima (§11, "o Radar se adapta"): `lib/radar/silo-link-mesh.ts` — o teto
    de 12 irmãos na trilha vale também para o irmão do grafo (antes, "do grafo" não era
    cortado; com a malha, todo irmão é do grafo); o `HIGH` continua nunca cortado.
  - Catálogo (`arquiteto.internal_links` e a nota da F2).
- **Confirmado por teste:** `tests/arquiteto-silo-malha-f4-2026-10-14.test.mts` (13): Silo
  de 8 do caso real (72 relações; S→P, P→S e SP→P `HIGH`; S→SP `LOW`; S↔S `MEDIUM`/`LOW`
  simétrico, ex.: captação ↔ Instagram `MEDIUM` por "pacientes", promoções ↔ "como captar
  um cliente" `LOW`), Silo de 30 (930, 812 S↔S, 900/900), rebase mantém S↔S, antes → depois
  (15/64 → 64/64), "Completar" só acrescenta (+49, 23 aprovadas iguais byte a byte, 0
  chamada de IA), custo (8 → 1 chamada, 15 → 2, 30 → 3), âncoras sem keyword do destino e
  variadas, tela e fronteira do Minerador. `tests/radar-silo-malha-f4-ponte-2026-10-14.test.mts`
  (3): a régua da âncora do Arquiteto = a do Radar; teto da trilha com a malha no grafo; o
  caso real ponta a ponta (grafo da malha → `relevantEdgesForArticle` → CSV): nenhuma linha
  diz "fora do grafo aprovado", os irmãos da trilha dizem "pedido pelo grafo aprovado".
  Testes antigos que fixavam o esqueleto sem malha e o `exact` aceito foram atualizados com
  o comentário da fase.
- **Medido no banco (SELECT) e simulado:** os 5 grafos aprovados têm 85 arestas e 0 S↔S;
  com o gerador novo, 218 (AdalbaPro 20 → 56, 14 → 30, 23 → 72, 14 → 30; Care Glow 14 →
  30); a malha por artigo de 55/188 para 188/188. Completar os 5 custa 0 chamada de IA (todo
  destino já tem âncora aprovada); um Silo novo de 8 artigos, 1 chamada; de 30, 3.
- **E0 (D14):** nenhuma chave do E0 muda pela F4 (o Arquiteto não é entregável do E0; a
  mudança no Radar só age com irmão do grafo além do teto, que nenhum retrato tem).
- **Limites:** o Radar lê o grafo que o artigo levou no envio (`arquitetoInternalLinks`);
  os 8 artigos do piloto estão no Radar com o grafo v1, e a adoção do Radar só dispara com
  versão nova do ArticleDNA — levar o grafo novo a eles sem reenvio é frente do Radar;
  Silo de 30 = 930 arestas, abaixo do teto de 1000 linhas da leitura do grafo (Silo acima de
  31 artigos exigiria leitura em páginas); a âncora reaproveitada é o universo do doador
  variado por origem (a régua do Radar escolhe a final com o livro do lote).
- **Limite fechado em 2026-10-14 (frente do Radar, decisão do dono: "estender a 'Atualização
  disponível do Arquiteto' do Radar para avisar também quando o grafo de links muda. Você
  adota com um clique, sem reenviar nada e sem refazer a pesquisa, porque links não mudam a
  SERP"):** o Radar detecta o grafo aprovado vigente do Silo mais novo que o transportado e
  mostra "Atualização disponível do Arquiteto · links · grafo vA → vB" (classe
  `links_changed`); adotar troca só `arquitetoInternalLinks` (pelo mesmo
  `relevantEdgesForArticle` do envio), sem versão nova da análise, também em item finalizado
  ou enviado ao Redator. A planta congelada e o pacote não são regravados: o artigo-modelo e o
  CSV leem a malha nova na leitura (D6). Detalhe, testes e o caso real (os 8 do piloto: 8 de 8
  adotáveis numa confirmação, simulado sobre o SELECT) em `docs/05-radar/estado-atual.md` e no
  andamento da F5 da SDD `sdd-acelerar-fluxo-do-plano-2026-10-13.md`. **Validado
  manualmente: não** (aprovar a malha e adotar é do dono).
