# Documentação canônica

Comece por [visão geral](00-produto/visao-geral.md), [invariantes](00-produto/invariantes.md) e [fluxo oficial](00-produto/fluxo-oficial.md). Cada chat de implementação deve declarar um módulo proprietário e ler o trio `spec.md`, `estado-atual.md` e `backlog.md` correspondente.

Histórico anterior foi preservado em `_arquivo/2026-07-documentacao-legada/` e não é fonte de verdade.

## Processo
Minerador
→ entende e qualifica cada keyword

Arquiteto
→ decide quais keywords formam cada artigo
→ escolhe a principal
→ valida se as keywords realmente pertencem à mesma intenção

Radar
→ analisa a SERP do artigo já formado
→ explica concorrentes, formatos, estruturas, perguntas e oportunidades

Planejador
→ transforma essas evidências em ContentPlan

Redator
→ executa o ContentPlan

Publicações
→ recebe documentos prontos, rascunhos, versões e atualizações

Não declarar conclusão baseada apenas em TypeScript ou build.

## Governança documental vigente — 2026-07-27

As fontes de verdade são os invariantes, glossário, fluxo oficial, contratos, ADRs aceitas e o trio `spec.md`/`estado-atual.md`/`backlog.md` de cada módulo. Propostas autorizadas ou implementadas localmente descrevem escopo e evidência, mas não substituem o estado atual. `docs/_arquivo/**` é histórico.

O tenant canônico é `brandId = public.marcas.id`; a rota canônica é `/{brandRef}`, com `brandRef = slug-da-marca--brandId`. `brandUserId` aparece somente como compatibilidade histórica. `/workspace` não é rota atual. `ownerUserId`, `memberUserId` e `actorUserId` são relações distintas e não devem ser colapsadas em uma identidade de tenant.

Os resultados registrados para 0005/0006 indicam que seus efeitos já existem no ambiente alvo e que a 0006 terminou em `READY`; não reexecutar nem reverter. Trechos pré-aplicação permanecem apenas como histórico qualificado. A classificação detalhada e as limitações desta auditoria estão em [relatório de governança documental](00-produto/relatorio-governanca-documental-2026-07-27.md).


docs/
├── README.md
│
├── 00-produto/
│   ├── visao-geral.md
│   ├── fluxo-oficial.md
│   ├── glossario.md
│   ├── invariantes.md
│   ├── arquitetura.md
│   │
│   ├── contratos/
│   │   ├── README.md
│   │   └── autorizacao.md
│   │
│   ├── decisoes/ (arquivos existentes)
│   │   ├── ADR-001-dnas-versionados-e-rastreaveis.md
│   │   ├── ADR-002-ia-aplica-humano-revisa.md
│   │   ├── ADR-003-silopage-separada-de-silodna.md
│   │   ├── ADR-004-workflow-publicacao-transferencia-separados.md
│   │   ├── ADR-005-importacao-seletiva-e-idempotente.md
│   │   ├── ADR-006-monolito-modular-com-chats-isolados.md
│   │   ├── ADR-007-localstorage-nao-e-fonte-unica.md
│   │   ├── ADR-008-protecao-estrutural-dos-publicados.md
│   │   ├── ADR-009-content-plan-definitivo.md
│   │   ├── ADR-010-cockpit-planejador-hidratacao.md
│   │   ├── ADR-011-serp-formacao-e-identidade-publicada.md
│   │   ├── ADR-012-avaliador-serp-intencao-e-kgr-leve.md
│   │   ├── ADR-013-article-dna-contexto-estrategico.md
│   │   ├── ADR-014-criacao-manual-silo-silopage.md
│   │   ├── ADR-015-perfis-unidades-kgr-serp.md
│   │   ├── ADR-016-politica-principal-minerador-arquiteto.md
│   │   ├── ADR-017-fk-lista-restrict-0006.md
│   │   ├── ADR-018-autenticacao-manual-e-owner-explicito.md
│   │   ├── ADR-019-supabase-auth-canonico.md
│   │   ├── ADR-020-kgr-slug-e-formacao-de-artigos.md
│   │   └── ADR-021-roteamento-tenant-brand-ref.md
│   │
│   └── propostas/
│
├── 01-admin/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 02-marca/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 03-minerador/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 04-arquiteto/
│   ├── spec.md
│   ├── estado-atual.md
│   ├── backlog.md
│   └── propostas/
│
├── 05-radar/
│   ├── spec.md
│   ├── estado-atual.md
│   ├── backlog.md
│   └── propostas/
│
├── 06-planejador/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 07-redator/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 08-publicacoes/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── 09-conta/
│   ├── spec.md
│   ├── estado-atual.md
│   └── backlog.md
│
├── compartilhado/
│   ├── README.md
│   ├── autenticacao-e-permissoes.md
│   ├── autenticacao-manual.md
│   ├── persistencia-local.md
│   └── supabase.md
│
└── _arquivo/
    └── 2026-07-documentacao-legada/

Documentos planejados ou ainda não criados não aparecem nesta árvore; devem ser registrados apenas em backlog ou proposta com a indicação “a criar”.
Por que manter três arquivos por área

No seu caso, a separação é melhor porque cada chat será especializado.

spec.md

É o contrato estável do módulo:

o que ele faz;
o que não faz;
entidades;
regras;
fluxos;
estados;
proteções;
entradas;
saídas;
critérios de aceite;
fronteiras técnicas.

Muda apenas quando uma decisão real do produto muda.

estado-atual.md

É a fotografia honesta da implementação:

funcionando;
parcialmente funcionando;
simulado;
local;
persistido;
quebrado;
regressões conhecidas;
arquivos centrais;
testes;
última validação manual.

Esse documento deve ser atualizado a cada sprint.

backlog.md

É o trabalho futuro:

Agora
Próximo
Depois
Bloqueado
Descartado

A tarefa concluída não precisa ser apagada imediatamente. Pode ir para uma pequena seção de concluídos recentes e depois ser arquivada.

## Estado atual: onde consultar

O estado vigente não é mantido neste README. Consulte `estado-atual.md` do módulo proprietário e o [relatório de governança documental](00-produto/relatorio-governanca-documental-2026-07-27.md); este README apenas orienta a navegação e a classificação documental.

O bloco abaixo é um snapshot histórico preservado da documentação anterior. Ele não substitui os estados atuais, não deve ser usado para inferir implementação e pode conter descrições já superadas.

## Snapshot histórico preservado

É importante não documentar o projeto como mais pronto do que realmente está.

Admin

Existe esqueleto operacional e acesso ao cadastro de marcas. Ainda precisa amadurecer:

gestão de empresas;
delegações;
usuários;
alertas;
consumo;
cobrança;
notificações.
Marca

Existe estrutura para:

BrandDNA;
materiais;
Skills;
prompts;
equipe;
configurações.

Convites e permissões estão preparados, mas a persistência definitiva ainda depende do banco.

Minerador

É o módulo mais funcional.

Possui:

keywords da extensão;
importação;
filtros;
KGR;
intenção;
nicho;
status;
seleção;
exportação;
KeywordDNA;
histórico;
visualizações.

Não deve ser reconstruído.

Arquiteto

O motor e as funcionalidades principais foram implementados:

agrupamento lógico;
agrupamento por IA;
ArticleDNA;
SiloDNA;
aplicação direta da IA;
anotações;
versionamento;
proteção de publicados;
envio ao Radar.

Mas o estado atual possui uma regressão grave:

76 keywords aparecem como importadas;
várias não possuem localização visível;
artigos novos e grupos anteriores desapareceram;
o índice de importação ficou inconsistente;
a introdução da SiloPage ocorreu perto da regressão;
ainda falta recuperação segura do workspace.

O estado-atual.md do Arquiteto deve deixar isso explícito.

Não pode afirmar que o módulo está concluído enquanto essa inconsistência existir.

Radar

O esqueleto operacional funciona e recebeu um artigo real.

A Serper está configurada no ambiente, mas ainda falta implementar:

consulta real;
snapshots;
resultados orgânicos;
perguntas;
pesquisas relacionadas;
diagnóstico;
comparação com DNAs;
aprovação da pesquisa.
Planejador

Recebeu um artigo real do Radar e criou um ContentPlan inicial.

Ainda faltam as regras definitivas de:

outline;
links;
âncoras;
fontes;
CTA;
estrutura;
Skills;
planejamento por tipo de unidade.
Redator

O Tiptap está instalado e o artigo abriu diretamente.

Funciona como editor real, mas ainda há pendências:

salvamento definitivo;
aprovação;
transição para Publicações;
integração completa do Guardião;
persistência remota.
Publicações

Possui planilha e fluxo preparado, mas ainda não recebeu o primeiro documento aprovado do Redator.

Conta

Deve permanecer separada da organização:

dados pessoais;
senha;
sessões;
notificações;
preferências;
segurança.
