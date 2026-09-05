# Backlog Futuro — Agentes Operacionais e MCP

Status: ideia preservada; fora do escopo atual.

Objetivo: agentes como colaboradores delegados e limitados da Plataforma, usando as mesmas operações de domínio dos botões.

Não dar SQL livre, service_role, secrets, shell, filesystem irrestrito ou provider credentials.

Modelo:
Humano → Delegation → Agent Runtime → Minerador Key MCP/Tool Gateway → Domain Operations.

LLM como DeepSeek é ferramenta do agente, não o agente.

Autonomia:
- MANUAL_ONLY
- AGENT_ALLOWED
- AGENT_AUTOMATIC futuramente

Primeira versão recomendada: READ + PROPOSE.

Sem approve/publish/delete/migration/permission management por padrão.

Não criar auth.users falso para agente. Preferir Agent + AgentDelegation + delegatedByUserId + brandId + scopes + provenance.

Antes de instalar MCP, criar SDD global de Agent Runtime / Delegation / MCP Tool Gateway.


