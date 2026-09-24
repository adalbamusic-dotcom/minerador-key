# Pipeline Editorial — Papéis, Entradas, Saídas e Fronteiras

## Princípio sistêmico

Cada área deve ter tudo que precisa para cumprir o próprio papel: contexto, dados, working copy, ferramentas, estados, ações, evidências, decisões humanas, versionamento, readback, histórico e handoff.

Nenhuma área deve refazer silenciosamente a etapa anterior nem antecipar a seguinte.

```text
MARCA
BrandDNA/contexto
  ↓
MINERADOR
KeywordDNA
  ↓
ARQUITETO
ArticleDNA + SiloDNA + SiloPage + InternalLinkGraph
  ↓
RADAR
RadarEvidenceBundle → RadarFrozenEvidenceBundle → RadarCanonicalDossier
  ↓
REDATOR
plano interno → ContentDocument
  ↓
PUBLICAÇÕES
PublicationRecord
```

## Marca

Papel: identidade estratégica e contexto autorizado.

Responsabilidades: BrandDNA, estratégia, produtos/serviços, materiais, site/sitemap, equipe, convites e permissões da Marca.

Não faz KeywordDNA, arquitetura, SERP investigativa, ContentPlan ou redação.

A Marca continua sem cadastro de ofertas ou serviços. A página de destino de um Assunto vem da declaração feita no Minerador; `marcas.site_url` e o catálogo do site só são consultados para conferi-la, sem escrita na Marca.

## Minerador

Papel: transformar demanda bruta em conhecimento editorial individual qualificado.

Pergunta: “o que é esta keyword, o que sabemos sobre ela e por que ela está apta a seguir?”

Entrega: KeywordDNA com brandId, keyword original, origem, intenção, entidade, modificadores, nicho, funil, localidade, ambiguidade, confiança, volume, CPC, concorrência, resultados, KD quando houver, KGR/aplicabilidade, revisão IA, decisão humana, publicationContext quando houver, versão/hash/proveniência.

Não faz ArticleDNA, principal/secundárias/reforços, Silo ou links internos.

**Assunto (ADR-022): o Minerador declara.** O humano pode declarar uma keyword como Assunto, o tronco editorial de um ou mais artigos, com nota curta e página de destino opcional no site da marca. A declaração é por keyword, com autor e data, e a IA nunca declara. Declarado o Assunto, a aprovação dispensa Volume, Resultados e KGR, mas continua exigindo a Lógica. O Minerador não escolhe em que artigo o Assunto entra nem quais keywords o sustentam.

Keyword enviada ao Arquiteto deve permanecer em ArticleDNA ou “Não agrupadas”.

## Arquiteto

Papel: transformar KeywordDNAs em arquitetura editorial governada.

Responsabilidades: Lógica de agrupamento, SERP de compatibilidade, IA como proposta, revisão humana, ArticleDNA, SiloDNA, SiloPage, Pilar/Suportes e InternalLinkGraph.

ArticleDNA: 1 Principal + até 5 Secundárias/Reforços; máximo 6 KeywordDNAs; teto, não meta.

SiloPage != Pilar.

InternalLinkGraph define source, target, direção, relationType, reason, priority, anchorConcepts, versão, aprovação e proveniência. Não define anchor final, HTML ou posição final no parágrafo.

Estado atualizado do InternalLinkGraph: working copy persistente/editável, lock_version, aprovação atômica, versões append-only, v1/v2, guards de predecessor/sucessor, same-content prevention, cross-brand isolation e handoff guard homologados remotamente.

Entrega ao Radar: ArticleDNA aprovado/versionado, KeywordDNA refs, intenção/contexto, decisões/conflitos, publicationContext, SiloContext e InternalLinkGraph aprovado quando aplicável.

Radar não pode reabrir silenciosamente agrupamento, Principal, Silo, slug, canonical, URL ou Brand.

**Assunto (ADR-022): o Arquiteto fixa o tronco.** Ele prende no ArticleDNA ou no SiloDNA, por ato humano, um Assunto declarado no Minerador, em campo próprio (`subject`), fora de `keywordReferences` e do teto de 6. As keywords de sustentação formam o artigo, a principal sai entre elas e dá o slug, e a SERP delas valida a composição. Um Assunto aprovado sem Volume validado nunca é principal.

Estado em 2026-09-24: a declaração no Minerador (F1) e o campo opcional no contrato do Arquiteto (F2, fase A, sem nenhum caminho que grave) estão no código, sem homologação manual. Fixar o tronco no artigo (F2, fase B), o uso no Radar (F3) e no Redator (F4) são planejados.

## Radar

Papel: investigação, evidência e validação da realidade externa.

Recebe unidade editorial já formada.

**Assunto (ADR-022): o Radar não troca o tronco.** Ele recebe o Assunto já fixado no ArticleDNA e investiga em torno dele. Não troca, não promove e não rebaixa o Assunto; se as buscas de sustentação não o sustentam, alerta e devolve ao Arquiteto, para decisão humana. O Redator também não troca nem remove o Assunto. (Planejado: F3 e F4 da SDD.)

SERP do Radar é investigativa, diferente da SERP de compatibilidade do Arquiteto.

Áreas operacionais: `Pesquisa`, `Vídeos`, `Especialista`, `Relatório`. A antiga
área `Conteúdo` não é área operacional.

`Pesquisa` tem três modos competitivos — `Google`, `YouTube`, `Amazon` —, com
seleção única por investigação. Os três estão implementados; somente o Google
foi homologado em runtime real (2026-09-11). Perfil de pesquisa não é saída
editorial: Google produz blueprint editorial, YouTube produz blueprint
audiovisual, Amazon produz blueprint comercial.

Fluxo operacional vigente do modo Google, todo por ação explícita do USER:

```text
NOT_STARTED → START → READY_TO_ANALYZE → ANALYZE
            → READY_TO_FINALIZE → FINALIZE → FINALIZED
```

`RESET` é ação separada. Nenhum passo ocorre por `mount`, F5, troca de área ou
expansão de painel. O workflow antigo por abas
`Coleta → Concorrentes → Análise → Evidências → Revisão → Aprovar SERP` **não**
faz parte do fluxo operacional atual.

`Pesquisa → YouTube` é motor de descoberta competitiva: consulta a plataforma,
cria universo competitivo e produz modelo próprio. A área `Vídeos` é ingestão
deliberada: o USER fornece as fontes, não existe SERP, a fonte não vira
concorrente automaticamente e o processamento é orientado pelos `VideoBriefs`.
Os dois papéis não compartilham identidade semântica.

ExternalEvidence segue: necessidade → Source → Evidence → revisão humana → aprovação.

Source != Evidence.

Evidence registra o que sustenta, o que não sustenta, limites, conflitos, decisão humana e proveniência. Ausência de evidência pode ficar como SOURCE_REQUIRED.

Especialista: Need → ExpertBrief → ExpertContribution → transcrição/fidelidade → organização → revisão → ExpertEvidence.

Entrega ao Redator: o **dossiê canônico** resolvido por
`loadRadarCanonicalAuthorities → resolveRadarCanonicalDossier` e entregue por
`sendRadarToWriter`. Ele inclui ArticleDNA aprovado (identidade, versão e
hash), `RadarEvidenceBundle` V3 íntegro, `RadarEditorialBlueprint`,
SiloContext/InternalLinkGraph ref, evidências, necessidades, lacunas,
conflitos, decisões humanas, proveniência e versão/hash.

Desde 2026-09-17 o destino é o REDATOR. O Planejador saiu do fluxo operacional:
ele não é etapa, gate, destino de botão nem parada de navegação. Dados
históricos dele são preservados e nenhum artigo é movido automaticamente.

O envelope carrega também:

- `bundle.video` — a biblioteca de vídeos casada com as pautas, com trecho
  ancorado no tempo, seção de aplicação e limitações. Sem id de worker, `gs://`
  nem id de job;
- `bundle.specialist` — as contribuições com decisão humana ativa, com a
  pergunta preparada, o que cada uma sustenta e as limitações. Sem id de
  Telegram, de chat nem de ator;
- `bundle.keywordContext` — principal, secundárias e reforços narrativos, com o
  papel vindo do ArticleDNA e o texto da hidratação daquela versão;
- `writerMayNot` — o que o Redator não pode redefinir.

O Radar também entrega `SpecialistBriefs` e `VideoBriefs` congelados. O
Blueprint **não** é um `ContentPlan`: ele não fixa H2 final, título final,
contagem de palavras nem ordem rígida.

Ausência é `null`, nunca camada vazia — `null` diz "não houve"; uma camada com
`items: []` e `notApproved: 3` diz "houve resposta e ninguém decidiu".

Todo `evidenceRef` do blueprint final resolve a partir deste envelope, e não
apenas a partir do export.

O Redator recebe a ESTRUTURA canônica, não markdown. `writer_context_md`,
`writer_brief_md` e `competitive_radiography_md` continuam sendo read models
portáteis do CSV.

Não cria ContentPlan nem estrutura final do artigo.

## Planejador — removido do pipeline em 2026-09-18

`PLANEJADOR_STAGE = NONE`. Não é etapa, gate, destino de botão, condição de
prontidão nem parada de navegação, não aparece no menu e não tem estado de
pipeline. Nenhum artigo novo passa por aqui e **nenhum caminho de escrita nova
existe por ele**.

O que ele fazia — compilar inteligência aprovada em especificação executável —
é hoje a fase de planejamento DENTRO do Redator. As funções de planejamento
inicial de projeto, produto, serviço e campanha serão transferidas para uma aba
da Marca, onde fazem sentido.

Dados históricos permanecem legíveis: `ContentPlan`, `PlannerItem` e o estado
`sent_planner` continuam no vocabulário de leitura, e nenhum artigo é movido
automaticamente. A rota `/planejador` continua respondendo.

**Não há migração de conteúdo.** O banco real confirmou zero linhas de
`ContentPlan`, zero `stage='planner'`, zero `sent_planner`, e as tabelas
`content_plans`/`planner_items` não existem. Remoção lógica aqui significa
fechar caminho de escrita, não converter dado.

## Redator

Papel: transformar o dossiê do Radar em artigo — planejando e escrevendo.

```text
RadarCanonicalDossier → planejamento → escrita → ContentDocument
```

Recebe BrandDNA/contexto autorizado, KeywordDNAs, ArticleDNA, SiloDNA/SiloPage,
InternalLinkGraph, publicationContext e o dossiê canônico do Radar com
evidências, necessidades, lacunas, conflitos, perguntas, entidades, fontes,
decisões e versões — como ESTRUTURA, não markdown.

Decide: estrutura final de H2/H3, sequência narrativa, aplicação da evidência
por seção, links internos e externos, plano de mídia, metadados de SEO finais,
CTA, instruções de redação, formulação, sintaxe, ritmo e coesão. Pode montar um
`ContentPlan` interno antes de escrever — ele é artefato de quem escreve, não
etapa do fluxo.

Não pode: trocar a keyword principal, reconfigurar o Silo, remover cobertura
obrigatória, alterar a intenção declarada, alterar slug ou canonical
protegidos, nem substituir a composição de secundárias por decisão própria. A
lista viaja dentro do pacote entregue.

Não pesquisa de novo, não reinterpreta o Radar como investigação nova e não
remonta o Blueprint do zero.

A hierarquia de evidência do Radar vale no planejamento e na escrita.

Princípio: liberdade de escrita, não liberdade de estratégia.

Responsabilidades: Tiptap, salvamento, versionamento, revisão, aprovação e
materialização dos links/imagens especificados.

## Publicações

Papel: preservar entrega final.

PublicationRecord controla URL, slug, canonical, versão, histórico e exportação/publicação.

PublicationRecord != ContentDocument.

## Regra de conflitos

Conflito estrutural volta para a área proprietária. A etapa seguinte diagnostica; não corrige silenciosamente.

## Regra de UI por área

Toda área deve deixar claro:
1. o que recebeu;
2. o que está vendo;
3. o que pode editar;
4. o que é proposta;
5. o que é Evidence;
6. o que está aprovado;
7. o que exige decisão humana;
8. o que está pendente;
9. o que será entregue;
10. se o handoff foi persistido e relido.

Estado local não substitui persistência real.


