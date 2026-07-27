# Estado atual — Conta

## Autenticação e identidade — 2026-07-27

A Conta continua consumindo a sessão atual baseada em NextAuth, enquanto Supabase Auth permanece a decisão aprovada para convergência futura. Cadastro manual cria somente a identidade e não associa marca automaticamente; Google OAuth está suspenso. A retirada do NextAuth, cookies Supabase definitivos e smoke test completo continuam pendentes.
- **Última auditoria:** 2026-07-20.
- **Funcionando:** rota `/{brandRef}/conta`, componente de conta e redirecionamento de `/perfil` para configurações de marca. **Verificado no código.**
- **Parcial:** escopo funcional da página é mínimo; não foi validado manualmente.
- **Simulado:** não identificado.
- **Local:** contexto de marca pode usar seleção local compartilhada.
- **Persistido:** não foi identificado armazenamento próprio deste módulo.
- **Bloqueado:** definição de produto para recursos adicionais.
- **Regressões/bugs:** nenhum confirmado.
- **Arquivos centrais:** `app/(brand)/[brandRef]/conta/page.tsx`, `modules/conta/account-page.tsx`.
- **Testes:** sem teste específico identificado; cobertura indireta de autenticação.
- **Última validação manual:** ainda não verificada.
- **Diferença spec/implementação:** módulo é uma superfície inicial, não uma gestão completa de conta.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/conta; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- A Conta passa a ter rota contextual `/{brandRef}/conta`; o conteúdo continua pessoal ao ator autenticado e não expõe controles de cobrança nesta etapa.
