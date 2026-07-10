export interface BrandListProfile {
  isAdmin: boolean;
  marcaId: string | null;
}

export class MarcasAccessError extends Error {
  status: number;
  constructor(status: number, message: string);
}

export function listMarcasForProfile<T>(
  profile: BrandListProfile | null,
  fetchBrands: (marcaId: string | null) => Promise<T>
): Promise<T>;
