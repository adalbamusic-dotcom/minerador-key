export class MarcasAccessError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MarcasAccessError";
    this.status = status;
  }
}

/**
 * Applies the only two valid scopes for listing brands:
 * - admin: unfiltered list;
 * - cliente: exactly the brand linked to the profile.
 */
export async function listMarcasForProfile(profile, fetchBrands) {
  if (!profile) {
    throw new MarcasAccessError(401, "Nao autorizado: sessao ausente.");
  }

  if (profile.isAdmin) {
    return fetchBrands(null);
  }

  if (!profile.marcaId) {
    throw new MarcasAccessError(
      403,
      "Acesso negado: perfil invalido ou sem marca vinculada."
    );
  }

  return fetchBrands(profile.marcaId);
}
