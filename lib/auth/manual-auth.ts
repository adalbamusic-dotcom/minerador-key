import { z } from "zod";

export const MANUAL_PASSWORD_MIN_LENGTH = 6;

export const ManualSignupSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome."),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(MANUAL_PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${MANUAL_PASSWORD_MIN_LENGTH} caracteres.`),
  passwordConfirmation: z.string().min(1, "Confirme sua senha."),
}).superRefine((value, context) => {
  if (value.password !== value.passwordConfirmation) {
    context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "As senhas não coincidem." });
  }
});

export type ManualSignupInput = z.infer<typeof ManualSignupSchema>;

export const InvitedSignupSchema = z.object({
  password: z.string().min(MANUAL_PASSWORD_MIN_LENGTH, `A senha deve ter pelo menos ${MANUAL_PASSWORD_MIN_LENGTH} caracteres.`),
  passwordConfirmation: z.string().min(1, "Confirme sua senha."),
}).superRefine((value, context) => {
  if (value.password !== value.passwordConfirmation) {
    context.addIssue({ code: "custom", path: ["passwordConfirmation"], message: "As senhas não coincidem." });
  }
});

export type InvitedSignupInput = z.infer<typeof InvitedSignupSchema>;

export function parseManualSignupInput(input: unknown): ManualSignupInput {
  return ManualSignupSchema.parse(input);
}

export function parseInvitedSignupInput(input: unknown): InvitedSignupInput {
  return InvitedSignupSchema.parse(input);
}

export function mapManualSignupError(status: number, payload: unknown): string {
  const message = payload && typeof payload === "object" && "msg" in payload && typeof payload.msg === "string"
    ? payload.msg.toLowerCase()
    : payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message.toLowerCase()
      : "";

  if (status === 422 || /already registered|already exists|user already registered|email.*exist/.test(message)) {
    return "Este e-mail já está cadastrado. Entre com sua senha ou use outro e-mail.";
  }
  if (/password.*(weak|short)|weak_password/.test(message)) {
    return `A senha deve ter pelo menos ${MANUAL_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  return "Não foi possível concluir o cadastro. Tente novamente.";
}

export function signupCreatedUser(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || !("user" in payload)) return false;
  const user = payload.user;
  if (!user || typeof user !== "object") return false;
  if ("identities" in user && Array.isArray(user.identities) && user.identities.length === 0) return false;
  return typeof ("id" in user ? user.id : undefined) === "string";
}
