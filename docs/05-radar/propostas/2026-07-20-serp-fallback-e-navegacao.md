# Fallback SERP e navegação Radar — 2026-07-20

## Decisão

A indisponibilidade de tabelas editoriais não bloqueia uma coleta real quando o workspace local já possui ArticleDNA e hidratação válidos. O client envia esse contexto à rota autenticada; a rota valida marca, silo e keyword, chama o Serper server-side e retorna o snapshot real. O recovery local é salvo antes do sucesso ser exibido.

O snapshot remoto continua append-only e opcional. `persistenceMode: remote` só aparece depois da inserção confirmada; caso contrário, o registro permanece `origin: real`, `isMock: false`, `status: needs_review`, com `persistenceMode: local`.

## Correção UUID

O primeiro resolver filtrava aliases, mas ainda montava `lookupIds` com todos os valores antes de chamar `.in("id", lookupIds)`. A correção passou a usar candidatos UUID validados e mantém aliases fora das operações UUID. O mesmo bloqueio foi aplicado aos IDs de briefing e silo.

## Causa dos três sintomas

1. A mensagem genérica vinha de `PersistenceUnavailableError` lançado antes da coleta, porque a resolução dependia dos repositórios editoriais remotos.
2. A simulação funcionava porque usava somente o provider local.
3. O botão Radar `Abrir` era um link direto para `/arquiteto`; o efeito do Arquiteto lia o mesmo `articleId` da URL a cada render e criava novos Sets.

## Regras de segurança

- O ArticleDNA/hidratação local é apenas contexto de recuperação; a sessão e a marca continuam verificadas no servidor.
- IDs técnicos nunca são enviados como consulta à Serper.
- Falha de recovery local impede sucesso da coleta.
- Nenhum publicado, DNA, slug, canonical, storage local ou migration remota é alterado por esta correção.
