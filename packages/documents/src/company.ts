/**
 * Quién emite el documento.
 *
 * NewConcret no existía como dato en ninguna parte del sistema: no había
 * nombre legal, ni CUIT, ni domicilio, ni teléfono. Hasta que el primer
 * artefacto salió hacia un cliente eso no molestaba a nadie.
 *
 * Vive en variables de entorno y no en la base ni en el código: se configura
 * una vez por despliegue, no necesita migración ni pantalla de administración,
 * y cambiar un teléfono no exige un commit. Ver D-018.
 *
 * **Ningún valor por defecto.** Un documento que sale con un CUIT inventado es
 * peor que un documento que no sale: el primero llega a un cliente y el
 * segundo se arregla en cinco minutos. Si falta algo, esto falla y dice qué
 * falta.
 */

/** La identidad de quien emite, tal como aparece en el documento. */
export interface CompanyIdentity {
  readonly legalName: string;
  readonly taxId: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  /** Opcional: si no está, el documento no muestra la línea. */
  readonly website?: string | undefined;
}

const REQUERIDAS = {
  legalName: 'NCI_EMPRESA_RAZON_SOCIAL',
  taxId: 'NCI_EMPRESA_CUIT',
  address: 'NCI_EMPRESA_DOMICILIO',
  phone: 'NCI_EMPRESA_TELEFONO',
  email: 'NCI_EMPRESA_CORREO',
} as const;

/**
 * Lee la identidad del entorno, o falla diciendo exactamente qué falta.
 *
 * Enumera todas las que faltan de una vez y no la primera: quien está
 * configurando el despliegue las carga en una pasada en lugar de descubrirlas
 * de a una, que es la diferencia entre cinco minutos y media hora.
 */
export function companyFromEnv(env: NodeJS.ProcessEnv = process.env): CompanyIdentity {
  const faltantes: string[] = [];
  const leer = (variable: string): string => {
    const valor = env[variable]?.trim();
    if (!valor) {
      faltantes.push(variable);
      return '';
    }
    return valor;
  };

  const identidad = {
    legalName: leer(REQUERIDAS.legalName),
    taxId: leer(REQUERIDAS.taxId),
    address: leer(REQUERIDAS.address),
    phone: leer(REQUERIDAS.phone),
    email: leer(REQUERIDAS.email),
    ...(env['NCI_EMPRESA_WEB']?.trim() ? { website: env['NCI_EMPRESA_WEB'].trim() } : {}),
  };

  if (faltantes.length > 0) {
    throw new Error(
      `No se puede emitir un documento sin la identidad de la empresa. Faltan estas variables de entorno: ${faltantes.join(', ')}. Están documentadas en .env.example.`,
    );
  }

  return identidad;
}
