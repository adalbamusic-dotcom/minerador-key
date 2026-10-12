# ADR-022 — Assunto: o tronco editorial declarado

- **Status:** Aceita em 2026-09-24, com a aprovação da SDD pelo dono do produto; implementação por fatias
- **Módulos proprietários da decisão:** Minerador (declaração) e Arquiteto (formação)
- **Módulos consumidores:** Radar, Redator e export "Para escrever"; Marca só consultada
- **Fonte:** `docs/compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md`
- **Emenda:** item 4 do ADR-020

## Contexto

O artigo nascia só de keywords com busca: a principal definia intenção,
promessa, slug, KGR e volume (ADR-020, item 4). Faltava lugar para o que a
marca quer vender ou defender e que o público não procura com essas palavras,
como "SEO para clínicas" (um serviço) ou um tema já decidido. Forçar essa frase
a ser principal quebraria slug e KGR; deixá-la de fora faria o artigo responder
à busca sem levar o leitor à oferta.

"Suporte" já nomeia o papel do artigo na hierarquia Pilar/Suporte, e "assunto"
já aparece em `excludedSubjects` (temas que o artigo não cobre) e na trava de
canibalização. O termo novo precisa não colidir com esses sentidos.

## Decisão

Modelo **tronco + sustentação**:

- o **Assunto** é o tronco: uma frase que o humano declara, com ou sem busca;
- as **keywords de sustentação** são as buscas reais que trazem o leitor e
  formam o artigo. O texto responde a elas e faz a **virada** para o Assunto.

1. **D1 · Principal.** A keyword com busca continua dona do slug, do KGR e do
   H1. O Assunto fica num campo próprio, como fundamento, e entra no H1 como
   complemento ou num H2/H3, conforme a SERP. Um Assunto só pode ser a própria
   principal quando tem Volume validado no pacote aprovado; nunca é secundária
   nem reforço do mesmo artigo.
2. **D2 · Aprovação.** Declarado o Assunto, a aprovação no Minerador dispensa
   Volume, Resultados e KGR. A Lógica (determinística, local, sem provider
   pago) continua exigida e dá ao Arquiteto uma hipótese de intenção e funil.
3. **D3 · Alcance.** Um Assunto por artigo. O mesmo Assunto pode sustentar
   vários artigos, landings, páginas de serviço ou um Silo inteiro.
4. **D4 · Virada.** O Assunto carrega a frase, uma nota curta do usuário (o que
   é, para quem) e, se existir, a página de destino no site da marca.
5. Só o humano declara Assunto, com autor e data. A IA nunca declara; uma
   proposta de IA só vale depois de aceita.
6. O Minerador declara, o Arquiteto fixa o tronco no ArticleDNA ou no SiloDNA
   (campo `subject`, fora de `keywordReferences` e do teto de 6) e o Radar
   investiga em torno dele sem trocá-lo. O Redator decide onde e como fazer a
   virada, mas não troca nem remove o Assunto.
7. Publicados: declarar Assunto não muda URL, slug, canonical nem principal.

**Emenda ao ADR-020, item 4.** A principal continua definindo slug candidato,
KGR, volume principal e intenção dominante. Quando há Assunto declarado, ele é
o fundamento do artigo e o destino da virada, e a principal é a âncora de busca
que leva o leitor até lá.

### Emenda D1-bis — a principal declarada no plano do Silo (2026-10-12)

- **Status:** Aceita pelo dono do produto em 2026-10-12 (D1 da §17 da SDD
  `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md`). Escrita na
  F3; vale a partir da F4.
- **O que muda no item 1 (D1).** Quando o humano declara o plano do Silo, cada
  artigo do plano pode trazer uma **principal declarada**: a keyword que ele
  escolheu para a cabeceira do artigo. Ela é **fixa**: o Arquiteto não roda a
  sugestão de principal (`suggestPrincipal`) nesse artigo, a melhoria não a
  troca por uma candidata com mais volume, e o Radar não a substitui. Slug e H1
  saem dela, mesmo **sem volume medido**: o KGR fica "não aplicável" e o volume
  aparece como "sem medição" até o Redator (risco R1 da SDD, aceito pelo dono).
- **O que muda no item 2 (D2) — D2-bis.** A principal declarada se aprova no
  Minerador **sem Volume e sem KGR**, como o Assunto; a Lógica continua
  exigida. A exceção vale pela marca recíproca
  `analise_semantica.keyword_declared_principal`, gravada só pelo núcleo do
  plano, e a mesma função decide a tela, o servidor e a trava de envio.
- **O que não muda.** O Assunto continua não sendo principal sem Volume
  validado (Q7): uma principal declarada igual à frase do Assunto só vale com
  Volume validado. O Assunto continua tronco, fora das seis keywords. A
  declaração continua humana, com ator e data; a IA só propõe pelo MCP e grava
  com o aceite do usuário no chat.
- **Onde mora.** O artigo do plano (ordem, papel Pilar/Suporte, escopo de até
  1.200 caracteres, principal declarada) fica em `keyword_subject.plan` do
  Assunto e a marca recíproca em `keyword_declared_principal` da principal —
  as duas dentro do pacote aprovado (hash). O Silo planejado (nome, slug,
  objetivo) fica no grupo editorial (`editorial_groups.plan`), fora do hash.
- **Mudança de contrato em duas fases.** A Fase A (F3) só ensina os leitores
  (`KeywordDna.subject.plan` e `KeywordDna.declaredPrincipal`, opcionais e
  `.strict()`); a Fase B (F4) passa a gravar. Depois do deploy da Fase A,
  nenhum rollback volta para antes dela.

## Consequências

- Um tema sem demanda pode orientar artigos sem inventar volume nem distorcer
  slug e KGR.
- O `ArticleDNA` e o `SiloDNA` ganham campo opcional novo, lido com
  `.strict()`. Por isso a mudança no Arquiteto vai em duas fases: a fase A só
  aceita o campo, a fase B passa a gravar. Depois do deploy da fase A, nenhum
  rollback volta para antes dela.
- A aprovação ganha uma exceção, e a trava de aprovação passa a valer também no
  envio ao Arquiteto, só para aprovações posteriores à ativação.
- Conservação: o Assunto sem artigo fica em "Keywords não agrupadas"; preso a
  vários artigos, não conta como keyword duplicada nem entra no teto.
- Risco de canibalização entre artigos irmãos do mesmo Assunto, tratado pelo
  detector atual e pela SERP das sustentações.
- Nenhuma migration nas fatias do Minerador (F1), do Arquiteto, do Radar e do
  Redator. Nenhuma chamada paga por padrão.

## Alternativas rejeitadas

- Pôr "Assunto" como quinto tipo de página no Vínculo: o enum estrito do
  Arquiteto descartaria o valor em silêncio.
- Fazer do Assunto a principal por padrão: slug e KGR passariam a seguir uma
  frase sem busca.
- Chamar as keywords de sustentação de "suportes": colidiria com o papel
  Suporte.
- Guardar o Assunto num artefato à parte, fora do ArticleDNA: criaria um
  segundo leitor do fundamento do artigo, fora do hash e do congelamento do
  Radar.
- Deixar a IA ou o Radar declarar, promover ou trocar o Assunto.
