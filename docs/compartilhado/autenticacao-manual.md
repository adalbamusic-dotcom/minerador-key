# Autenticação manual e associação explícita

## Estado atual — 2026-07-26

- O login manual por e-mail e senha é o fluxo canônico temporário.
- O cadastro em `/cadastro` usa o endpoint público do Supabase Auth e cria somente a identidade Auth.
- Cadastro não cria marca, membership, perfil administrativo nem associação à Adalba.
- O login Google está suspenso por `GOOGLE_LOGIN_ENABLED=false` por ausência da flag no ambiente. O provider, a troca Google → Supabase, o refresh Google e a integração Google Sheets permanecem no código.
- Usuário autenticado sem tenant vê `Aguardando associação a uma marca ou convite`, não consulta listas/keywords e pode sair da conta.
- O Admin cria marca somente com owner existente confirmado pelo Supabase Auth. A operação server-side grava ownership canônico e membership owner e só responde sucesso após consistência.
- A identidade global do Admin continua sendo `d67ebbad-a590-45f8-8bb5-a19c6241ac1b`; ele não é promovido automaticamente a owner.

## Limites de validação

Testes, TypeScript, ESLint focalizado e build são locais. Cadastro real, login real, confirmação de e-mail, criação de marca e isolamento em navegador autenticado permanecem smoke tests manuais do usuário. Nenhum SQL remoto, migration, rollback, commit, push ou deploy foi executado nesta tarefa.
