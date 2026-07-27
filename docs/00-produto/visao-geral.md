# Visão geral

## Propósito

Minerador Key é um produto interno para transformar dados de marca e palavras-chave em uma cadeia editorial rastreável: descoberta, arquitetura, pesquisa, planejamento, redação e publicação. A evidência deste documento foi revisada no código em 2026-07-27.

## Público e problema

Atende equipes que planejam crescimento orgânico por marca. O problema tratado é manter contexto, intenção, silos, decisões e versões conectados sem misturar marcas ou confundir uma sugestão de IA com uma aprovação humana. A aplicação é um monólito modular Next.js: `app/` compõe rotas e APIs, `modules/` implementa as áreas e `lib/` concentra infraestrutura e contratos.

## Fluxo operacional

Marca fornece contexto; Minerador registra e qualifica keywords; Arquiteto organiza a arquitetura editorial; Radar reúne evidências de SERP; Planejador cria o plano; Redator produz o documento; Publicações recebe o item aprovado. Cada transferência é seletiva e deve preservar marca, identidade e proveniência.

## Pipeline estratégico

`BrandDNA → KeywordDNA → ArticleDNA / SiloDNA / SiloPage → SERP → ContentPlan → ContentDocument → PublicationRecord`.

O código possui contratos Zod e envelopes versionados para parte desse pipeline. Nem todas as etapas possuem integração externa real ou persistência completa; ver os estados de cada módulo.

## Módulos

| Módulo | Situação resumida |
| --- | --- |
| Admin | visão e gestão de marcas existentes |
| Marca | contexto e acesso por marca |
| Minerador | importação, filtros, KGR e exportação no Supabase legado |
| Arquiteto | lógica editorial, versões, recuperação e propostas de IA |
| Radar | possui rota tenantizada por artigo, provider Serper integrado server-side e diagnóstico determinístico testado com fixtures; coleta real autenticada, smoke test e persistência remota ainda aguardam validação manual |
| Planejador | criação e aprovação inicial de ContentPlan |
| Redator | editor Tiptap e abertura de documentos |
| Publicações | planilha/esqueleto de entrega |
| Conta | visão de conta |

## Princípios de IA e aprovação humana

IA pode produzir proposta ou alterar uma cópia de trabalho. Ela não aprova, não substitui gates de contrato e não deve ser usada em testes. Respostas simuladas são identificadas por `origin: "mock"`; respostas reais dependem de configuração de provedor e de ação explícita do usuário.

## Estado de evidência

Use as marcações nos documentos: **Verificado no código**, **Confirmado por teste**, **Relatado pelo usuário**, **Ainda não verificado** e **Planejado**. Os arquivos em `docs/_arquivo/` são histórico, não fonte de verdade.

Rotas globais: `/`, `/login`, `/cadastro`, `/selecionar-marca` e `/admin`. Rotas de marca: `/{brandRef}/...`, com `brandRef = slug-da-marca--brandId`; grupos `(admin)` e `(brand)` são somente organização do App Router. Para o detalhamento da árvore, autorização e Supabase, consulte [arquitetura](arquitetura.md) e [governança documental](relatorio-governanca-documental-2026-07-27.md).
