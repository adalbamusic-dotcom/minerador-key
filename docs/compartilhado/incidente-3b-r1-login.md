# Incidente 3B-R1 — entrada de autenticação

**Data:** 2026-08-09  
**Módulo proprietário:** Interface Planner / Autenticação  
**Estado:** correção local aplicada; smoke autenticado ainda pendente

## Sintoma relatado

Admin global e contas comuns recebem “E-mail ou senha incorretos.” após a troca do login CredentialsProvider pelo login nativo do Supabase.

## Auditoria e causa confirmada no código

- O `CredentialsProvider` anterior já autenticava no mesmo projeto Supabase, pelo endpoint `/auth/v1/token?grant_type=password`, usando a URL pública e a chave anon.
- Portanto, não há evidência local de que existissem duas fontes de senha ou que a solução seja restaurar uma segunda sessão NextAuth.
- A regressão confirmada é de diagnóstico: o login nativo convertia qualquer erro diferente de confirmação pendente — incluindo configuração, rede, limite e respostas inesperadas HTTP 400 — em “E-mail ou senha incorretos.”
- O código não permite concluir, sem smoke real, se o provedor retornará credencial inválida, e-mail não confirmado, erro de projeto ou falha de rede para cada conta. Nenhuma identidade, senha, papel, owner, membership, RLS ou dado remoto foi alterado.

## Correção local

- `classifyAuthError` agora diferencia credencial inválida, confirmação pendente, limite, configuração, rede e resposta inesperada.
- A tela `/login` captura erros lançados pelo cliente, não expõe mensagem bruta do provedor e só redireciona após receber `session.user.id`.
- Diagnóstico de desenvolvimento registra somente categoria, código do provedor e status; não registra senha, token, e-mail ou segredo.
- Não existe fallback silencioso para NextAuth nem segunda sessão.

## Gate manual 3B-R1.0

O usuário deve executar uma única rodada com Admin global e conta comum: login, chegada ao destino correto, confirmação do `actorUserId`, refresh, logout e novo login da outra conta. Repetir com senha inválida e observar a mensagem correspondente. Se aparecer configuração/rede/limite, o diagnóstico sanitizado deve orientar a correção sem alterar o catálogo remoto.

Até esse roteiro passar, 3B-R2 e 3B-R3 permanecem congeladas. Não executar SQL/migration remoto, resetar senha, recriar usuário, confirmar e-mail manualmente, alterar papel/owner/membership/RLS ou limpar storage local como tentativa de recuperação.
