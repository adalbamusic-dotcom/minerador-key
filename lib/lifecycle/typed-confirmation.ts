export function normalizeTypedConfirmation(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function typedConfirmationMatches(value: string, confirmationName: string): boolean {
  const normalizedName = confirmationName.trim();
  return normalizedName.length > 0
    && normalizeTypedConfirmation(value) === normalizeTypedConfirmation(normalizedName);
}
