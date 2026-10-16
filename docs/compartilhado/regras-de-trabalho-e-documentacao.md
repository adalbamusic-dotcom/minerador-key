# Regras de Trabalho e Documentação

## Ordem operacional
1. identificar módulo;
2. ler docs ativos;
3. confirmar código/estado real;
4. congelar escopo;
5. front/experiência primeiro;
6. testar comportamento/usabilidade;
7. verificar contratos/backend;
8. backend local mínimo;
9. banco/schema somente por impossibilidade comprovada;
10. smoke real;
11. validação manual;
12. atualizar documentação.

## Uma linha de processo, SEO semântico e não regressão (2026-10-16)
Regra do dono, detalhada em `AGENTS.md` §0, valendo para todas as áreas:
- **Uma linha de processo por área.** Correção e caso novo entram na linha que está nos contratos, no botão e no núcleo que já existem. Não se cria processo paralelo por marca, por erro ou por situação. Limpar a tela tira duplicatas e ruído, nunca tira função. Mudança de processo pede decisão do dono antes.
- **SEO semântico.** Entidades, intenção, contexto e cobertura do tópico, com a SERP acima da lógica e da IA, guiam agrupamento, reforço (novos, publicados e definidos pelo plano), investigação, escrita e links.
- **Não regressão.** A suíte de cenários de fluxo roda a linha de ponta a ponta com fixtures e chega à conclusão documentada. Toda regra ou funcionalidade nova atualiza o cenário na mesma entrega, e situação nova vira cenário novo da mesma linha. Sem a suíte verde, não é entrega.

## Mudança estrutural
Schema, persistência, auth, workflow, contratos, fronteiras, RLS, versionamento e handoffs canônicos exigem SDD aprovada.

## Precedência
invariantes/ADRs → SDD → spec → código/estado remoto validado → estado-atual → backlog → pareceres → histórico.

## Estrutura por módulo
estado-atual.md:
- IMPLEMENTED
- TESTED
- REMOTE VERIFIED
- MANUAL UI VALIDATION
- PENDING
- BLOCKED

backlog.md: próximos cortes e pendências.

Spec: regra permanente.
ADR: decisão arquitetônica.
SDD: mudança estrutural específica.

## Evitar docs velhos
Quando o estado muda, atualizar estado-atual e backlog. Parecer conceitual não deve vencer estado remoto mais recente. Exemplo: InternalLinkGraph não deve mais aparecer como “futuro” no estado operacional.

## Evidências de conclusão
Separar código, testes, TypeScript, lint, build, render, persistência remota, readback, RLS, cross-brand, reload/F5, validação manual e handoff real.

## Operações remotas
Usuário executa instalações, SQL, migrations, smokes autorizados, Git e deploy. Não autorizar automaticamente limpeza, usuários temporários, grants ou chamadas pagas.

## Fonte de verdade
localStorage, IndexedDB, React state, mock, fixture e fallback local nunca são fonte única. Sucesso remoto exige readback.


