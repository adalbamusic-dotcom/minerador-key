/**
 * Feature flags server-side de autenticação.
 * Google permanece implementado, mas fica suspenso até ser explicitamente
 * reativado no ambiente com GOOGLE_LOGIN_ENABLED=true.
 */
export const GOOGLE_LOGIN_ENABLED = process.env.GOOGLE_LOGIN_ENABLED === "true";
