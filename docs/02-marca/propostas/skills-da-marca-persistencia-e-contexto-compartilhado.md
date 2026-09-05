# SDD — Skills da Marca: persistência e contexto compartilhado

**Status:** encerrada. O desenho foi implementado; o estado vigente está em `estado-atual.md`.

**Revisão 4 — 2026-08-28 — ENCERRADA COMO PROPOSTA.** A persistência foi
implementada e validada: migration aplicada, `artifact_type = brand_skill`,
primeira Skill real da Care Glow criada e recuperada por readback. O contrato
local convergiu para `SkillDefinition.expectedSections` (com `importance` e
`aliases`), validação `VALID` / `VALID_WITH_NOTICES` / `INVALID` e
diagnóstico `matched` / `alias_matched` / `not_found`. As seções abaixo
descrevem o desenho proposto e permanecem como histórico da decisão; o estado
vigente está em `estado-atual.md`.


**Revisão 2 — 2026-08-28:** o modelo foi corrigido de *construtor livre* para
**dirigido por gabarito**. O payload persistido muda; a versão anterior desta
SDD (formulário livre com categoria, instruções, exemplos, evitar e áreas
escolhidas pela Marca) está superada e não deve ser implementada.

## Identificação

- **Módulo proprietário:** Marca
- **Data:** 2026-08-28
- **Responsável humano pela aprovação:** owner da Plataforma (pendente)
- **Escopo proprietário:** `brand`
- **Tenant canônico:** `brandId = public.marcas.id`
- **Migration:** não criada e não aplicada

## Problema e objetivo

A aba "Skills e prompts" exibia apenas contadores de um estado local vazio.
Não existe entidade, API, RLS nem versionamento para Skill.

O objetivo é transformar a Skill em conhecimento reutilizável da Marca,
consumível pelos módulos por contrato compartilhado e sempre isolado por
`brandId`.

### Modelo correto — duas camadas

A Marca **não** cria uma Skill livremente. As áreas consumidoras definem
gabaritos; a Marca alimenta um gabarito existente com o próprio conhecimento.

```
Área requerente   → define a SkillDefinition (gabarito)
Marca             → escolhe a Skill, informa o nome, envia um arquivo .md
Sistema           → valida o Markdown, preserva o original, normaliza pelo gabarito
Áreas consumidoras→ consultam a Skill da Marca
```

**1. SkillDefinition** — contrato da Plataforma / área requerente. Não pertence
a uma Brand e não é criada pelo usuário da Marca:

```
key  label  description  ownerModule  consumerModules
recommendedSections (com aliases)  optionalSections
acceptedFormat  suggestedOutline
```

**2. BrandSkill** — instância daquele gabarito para uma Marca:

```
brandId  definitionKey  name
originalMarkdown  normalizedContent
sourceFilename  contentHash
version  status  provenance
```

### Distinção conceitual mantida

| Conceito | Papel |
| --- | --- |
| BrandDNA | identidade estratégica canônica, inclusive a voz |
| Material | documento/fonte bruta |
| SkillDefinition | gabarito de uma capacidade, definido pela área consumidora |
| BrandSkill | conhecimento da Marca que alimenta um gabarito |
| Prompt | template de execução de uma tarefa específica |

A Skill `brand_voice` operacionaliza a voz aprovada no BrandDNA. **Nunca a
substitui.** Conflito futuro não é resolvido silenciosamente.

## Identificação técnica

A identidade é **`brandId + definitionKey`**, nunca o nome:

- `definitionKey = brand_voice` é estável;
- `name = "Voz editorial Care Glow"` é rótulo humano e editável;
- renomear **não** quebra consumidores nem altera o hash;
- consultas de IA resolvem por `brandId + definitionKey` e recebem o nome como
  metadado.

Uma Marca alimenta cada gabarito uma única vez: novas versões vêm de
substituição de arquivo, não de uma segunda instância.

**Revisão 3 — 2026-08-28:** a estrutura do gabarito passou de exigência para
recomendação com diagnóstico. `requiredSections` virou `recommendedSections`
com `aliases`, e `normalizedContent` ganhou `sectionDiagnostics`
(`found` / `equivalent` / `missing`). Só erro técnico do arquivo bloqueia.

## Markdown

Primeira fase aceita somente `.md` / `text/markdown`. Não há PDF, DOCX, OCR,
imagem, conversão automática nem crawler.

Validação local e no servidor (`lib/marca/brand-skill-markdown.ts`): extensão,
MIME quando disponível, arquivo não vazio, limite de 512 KB e texto UTF-8
válido. Somente esses erros bloqueiam. Divergência em relação à estrutura
recomendada vira aviso: o documento é aceito e preservado como está.

`originalMarkdown` é sempre preservado. `normalizedContent` é uma leitura
estruturada ao lado do original — título, seções, diagnóstico por seção
(`found` / `equivalent` / `missing`) e seções próprias — nunca no lugar dele.

## Auditoria do estado atual — verificado no código

> **Nota de 2026-08-28:** a auditoria abaixo descreve o estado de quando esta
> SDD foi escrita. A persistência e a rota `/api/marca/skills` foram entregues
> depois, em tarefa própria; esta seção não foi reauditada nesta correção.

- **Persistência remota na época:** ausente. Nenhuma tabela, coluna ou policy
  com `skill` em `supabase/migrations/**`.
- **API na época:** existia apenas `app/api/marca/brand-dna/route.ts`. Hoje
  existe `app/api/marca/skills/route.ts`, que reutiliza o mesmo validador pelo
  domínio compartilhado.
- **Consumidor legado:** `lib/planejador/strategic-context.ts` lê o
  `BrandSkillSchema` de `lib/editorial/operational-contracts.ts`; a conversão
  explícita `toLegacyBrandSkill` mantém esse consumidor intacto.
- **Diagnóstico remoto:** não executado. O projeto Supabase em uso
  (`hjjlntdpdgvpnazdztqw`) não está disponível na conexão MCP desta sessão.

`REMOTE_PERSISTENCE_EXISTS` era `NO` na data desta SDD.

## Brand Context Pack

`getBrandContextPack({ brandId, module, purpose })` em
`lib/marca/brand-context-pack.ts`. Saída: BrandDNA aprovado, Skills ativas
disponíveis para o módulo, Prompts aprovados, referências de materiais e
proveniência (`brandDnaVersionId`, `skillVersions[{definitionKey, version,
contentHash}]`, `resolvedAt`).

Invariantes:

- `voiceCanonicalSource = "brand_dna"` sempre;
- tudo filtrado por `brandId`; sem fallback entre marcas;
- **`available !== applied`**: toda referência sai com `applied: false`;
- `consumerModules` vêm do gabarito, nunca da Marca;
- a referência compacta **não** carrega `originalMarkdown`; o consumidor
  resolve por `brandId + definitionKey`;
- ausência de Skill ou de BrandDNA aprovado gera entrada em `missing`, nunca
  contexto inventado.

Fronteiras por consumidor:

- **Minerador:** Skill não sobrescreve Intenção/Funil consolidados por evidência.
- **Arquiteto:** Skill não reescreve KeywordDNA nem publicação protegida.
- **Radar:** Skill não altera evidência SERP ou fonte observada.
- **Planejador:** pode selecionar contexto relevante para o ContentPlan.
- **Redator:** pode executar Skills aprovadas conforme ContentPlan/contexto.
- **Publicações:** somente regras aplicáveis ao estágio.

## Persistência proposta — não aplicada

O payload persistido passa a ser `definitionKey`, `name`, `originalMarkdown`,
`normalizedContent`, `sourceFilename`, `contentHash`, `version`, `status` e
`provenance` — **não** um formulário livre.

**Opção A — estender o store versionado existente.** Adicionar `'brand_skill'`
ao `CHECK` de `editorial_artifact_versions.artifact_type` e mapear o tipo para
o módulo `marca`. Reaproveita `editorial_version_status_events` e a RLS já
usada pelo BrandDNA. Exige alinhar estados
(`draft`/`proposed`/`approved`/`superseded` versus
`draft`/`pending_approval`/`active`/`archived`) e acomodar `entity_id =
brand:{brandId}:{definitionKey}`.

**Opção B — tabela própria `public.brand_skills`.** Chave
`(brand_id, definition_key, version)`, com `status`, `content_hash`,
`source_filename`, `original_markdown text`, `normalized_content jsonb`,
`provenance jsonb`, e índice único parcial garantindo no máximo uma versão
`active` por `(brand_id, definition_key)`.

Em ambas: `brand_id` NOT NULL com FK para `public.marcas(id)`, RLS habilitada,
`anon` sem acesso, `authenticated` sujeito a
`editorial_has_permission(brand_id, 'marca', 'view'|'edit'|'approve')`,
`service_role` restrito a operação administrativa server-side.

**SkillDefinition** permanece fora do tenant. Nesta fase é um registro local em
`lib/marca/skill-definitions.ts`; a decisão entre mantê-lo em código ou
persistir uma tabela global é separada e não bloqueia o BrandSkill.

### API proposta

`app/api/marca/skills/route.ts`

- `GET ?brandId=` → lista versões da marca; exige `marca:view`.
- `POST { action: "import" | "replace" | "rename" | "submit" | "approve" | "archive", brandId, definitionKey, ... }`
  → `import`/`replace` recebem o Markdown e revalidam no servidor; `approve`
  exige `marca:approve`.
- `actorUserId` sempre vem de `requireCanonicalSessionProfile()`. A UI **não**
  envia `userId` como autorização.
- A validação de Markdown é reexecutada no servidor: a validação do cliente é
  experiência, não autorização.

### Migration e rollback

- Migration nova, numerada, não aplicada pelo agente.
- Rollback da Opção A: restaurar o `CHECK` anterior após confirmar que não
  existe linha `brand_skill`.
- Rollback da Opção B: `DROP TABLE public.brand_skills` — destrutivo, exige
  snapshot prévio e autorização humana explícita.

## Estado desta entrega

- Contratos, gabarito local `brand_voice`, validação/normalização de Markdown,
  domínio, cópia de trabalho e resolver de contexto: implementados e cobertos
  por teste.
- Front da aba Skills: implementado com **cópia de trabalho local não
  persistente**, rotulada na própria tela, em
  `marca:{actorUserId}:{brandId}:brand-skills:working-copy`.
- Nenhum módulo consumidor foi ligado ao Brand Context Pack.
- Prompts e Materiais: preservados sem reconstrução funcional.

## Testes

Sem chamada paga:

- `tests/marca-brand-skills.test.mts` — gabarito, Markdown, validação,
  normalização, prévia, importação, substituição, renomeação, consumidores,
  isolamento e Context Pack;
- `tests/marca-brand-skills-workspace.test.mts` — cópia de trabalho local;
- `tests/marca-brand-skills-ui.test.mts` — experiência e ausência de falso
  sucesso remoto.

## Autorização necessária

1. Validação manual da entrada `.md` na aba.
2. Escolha entre Opção A e Opção B de persistência.
3. Aprovação desta SDD.
4. Execução manual da migration pelo usuário.
5. Smoke autenticado de isolamento por marca antes de ligar qualquer consumidor.

## Revisão 4 — contrato local consolidado — 2026-08-28

Esta revisão substitui os trechos históricos desta proposta que descrevem
cópia local, persistência ausente e migration pendente.

- A fundação remota `brand_skill` no store versionado está **READY/CLOSED**;
  não foi alterada nesta revisão local.
- `SkillDefinition` é código da Plataforma e agora declara extensões, MIME,
  limite e `expectedSections` com importância e aliases.
- `BrandSkill` persiste somente conteúdo e proveniência da Marca; consumidores,
  owner e expectativa estrutural vêm sempre da definição.
- A estrutura é diagnóstico: `VALID`, `VALID_WITH_NOTICES` e `INVALID` só por
  falha técnica. O arquivo Care Glow representativo é aceito com aliases.
- O editor e a rota usam o mesmo schema; a UI lê do servidor, salva e só emite
  sucesso após readback. Não há localStorage, cópia de trabalho ou falso sucesso.
- `BrandContextPack` devolve somente Skills ativas e compatíveis, com Markdown,
  normalização, diagnósticos, versão e proveniência; `applied` permanece `false`.
- `toLegacyBrandSkill` é a única adaptação mantida, exclusivamente para o
  contrato legado do Planejador. Nenhum consumidor foi ligado automaticamente.

**Estado:** contrato local consolidado; smoke autenticado com conteúdo real,
readback após reload e ativação humana continuam pendentes do usuário.
