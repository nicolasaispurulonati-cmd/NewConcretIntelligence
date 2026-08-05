/**
 * El alta de un cliente.
 *
 * El cliente no se crea desde una pantalla de alta: se crea mientras se
 * trabaja, casi siempre en el medio de cotizar. El centro del trabajo
 * comercial es la conversación, no la ficha, y obligar a completar un
 * formulario antes de poder cotizar es la rigidez que este producto no copia.
 *
 * Las reglas de qué es un cliente válido no están acá: están en `@nci/domain`,
 * para que el navegador pueda ejecutar las mismas. Acá está lo que sólo puede
 * pasar del lado del servidor — escribir, y mirar si ya existe algo parecido.
 */

import { and, eq, isNull, like, ne, or } from 'drizzle-orm';

import {
  ValidationError,
  createEntity,
  getEntity,
  search,
  slugify,
  type EntityNode,
  type Scope,
} from '@nci/core';
import { customers, entities } from '@nci/db';
import { looksLikeSameCustomer, validateCustomer, type CustomerDraft } from '@nci/domain';

export interface Customer {
  readonly entity: EntityNode;
  readonly taxId: string | null;
  readonly segment: string | null;
  readonly paymentTermsDays: number | null;
  readonly currency: string;
  readonly email: string | null;
  readonly phone: string | null;
}

/**
 * Un cliente que se parece a lo que se está por crear.
 *
 * Se devuelve para mostrar, nunca para bloquear. Un vendedor apurado que no
 * puede avanzar porque el sistema sospecha vuelve al cuaderno, y ahí el dato
 * se pierde entero.
 */
export interface SimilarCustomer {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly subtitle: string | null;
  /** Si el parecido es tan fuerte que casi seguro son el mismo. */
  readonly probablyTheSame: boolean;
}

/**
 * Clientes que se parecen a ese nombre.
 *
 * Usa la búsqueda universal, que ya filtra por permisos: no hay una vía
 * paralela de lectura, y esto no agrega una.
 */
export async function findSimilarCustomers(
  scope: Scope,
  name: string,
  options: { readonly limit?: number; readonly exclude?: string } = {},
): Promise<SimilarCustomer[]> {
  const buscado = name.trim();
  if (buscado.length < 2) return [];

  const hits = await search(scope, buscado, {
    types: ['customer'],
    limit: options.limit ?? 5,
  });

  return hits
    .filter((hit) => hit.id !== options.exclude)
    .map((hit) => ({
      id: hit.id,
      slug: hit.slug,
      displayName: hit.displayName,
      subtitle: hit.subtitle,
      probablyTheSame: looksLikeSameCustomer(hit.displayName, buscado),
    }));
}

/**
 * Crea un cliente.
 *
 * Los duplicados no se bloquean acá. La detección se muestra antes, mientras
 * se escribe el nombre, y la decisión es de quien está cargando: puede saber
 * que son dos sucursales distintas con el mismo nombre.
 *
 * La procedencia queda en `user`, que es el valor por defecto de la entidad:
 * lo creó una persona, no una inferencia ni una integración.
 */
export async function createCustomer(scope: Scope, draft: CustomerDraft): Promise<Customer> {
  scope.actor.assertCanActOn('customer', 'create');

  const problemas = validateCustomer(draft);
  if (problemas.length > 0) {
    const primero = problemas[0]!;
    throw new ValidationError({
      message: primero.message,
      reason: problemas.map((p) => p.reason).join(' '),
      field: primero.field,
    });
  }

  const nombre = draft.legalName.trim();

  const entity = await createEntity(scope, {
    type: 'customer',
    slug: await slugDisponible(scope, nombre),
    displayName: nombre,
    ...(draft.segment ? { subtitle: draft.segment } : {}),
    status: 'activo',
    // Lo que se escribe acá es lo que la búsqueda universal va a encontrar:
    // el nombre y los canales por los que alguien podría buscarlo.
    searchableText: [nombre, draft.email, draft.phone, draft.whatsapp, draft.taxId]
      .filter(Boolean)
      .join(' '),
  });

  await scope.db.insert(customers).values({
    entityId: entity.id,
    taxId: draft.taxId?.trim() || null,
    segment: draft.segment?.trim() || null,
    paymentTermsDays: draft.paymentTermsDays ?? null,
    email: draft.email?.trim() || null,
    phone: draft.phone?.trim() || null,
  });

  return loadCustomer(scope, entity.id);
}

/**
 * Un identificador libre para este nombre.
 *
 * El grafo exige que el identificador legible sea único dentro de cada tipo, y
 * eso choca de frente con "sugerí, no impidas": dos clientes con el mismo
 * nombre son un caso real —dos sucursales, dos razones sociales parecidas— y
 * el sistema no puede negarse a registrarlos. Sin esto, el segundo fallaba con
 * "Ya existe cliente con ese nombre", que es exactamente el bloqueo que la
 * detección de duplicados existe para no hacer.
 *
 * El primero se queda con el identificador limpio; los siguientes llevan un
 * número. La advertencia de duplicado ya se mostró antes, mientras se
 * escribía. Ver D-014.
 */
async function slugDisponible(scope: Scope, nombre: string): Promise<string> {
  const base = slugify(nombre);
  if (base.length === 0) return base;

  const tomados = await scope.db
    .select({ slug: entities.slug })
    .from(entities)
    .where(
      and(
        eq(entities.type, 'customer'),
        or(eq(entities.slug, base), like(entities.slug, `${base}-%`)),
      ),
    );

  const usados = new Set(tomados.map((fila) => fila.slug));
  if (!usados.has(base)) return base;

  for (let n = 2; n < 1000; n += 1) {
    const candidato = `${base}-${n}`;
    if (!usados.has(candidato)) return candidato;
  }

  // Mil clientes con el mismo nombre es un problema distinto. Que falle acá,
  // ruidosamente, en lugar de entrar en un bucle.
  throw new ValidationError({
    message: 'No fue posible generar un identificador para este cliente.',
    reason: `Ya hay demasiados clientes registrados como "${nombre}".`,
    field: 'legalName',
  });
}

/** Los datos comerciales de un cliente, con su entidad. */
export async function loadCustomer(scope: Scope, customerId: string): Promise<Customer> {
  const entity = await getEntity(scope, customerId);

  if (entity.type !== 'customer') {
    throw new ValidationError({
      message: 'El elemento indicado no es un cliente.',
      reason: 'Los datos comerciales sólo existen para clientes.',
    });
  }

  const [comercial] = await scope.db
    .select()
    .from(customers)
    .where(eq(customers.entityId, customerId))
    .limit(1);

  return {
    entity,
    taxId: comercial?.taxId ?? null,
    segment: comercial?.segment ?? null,
    paymentTermsDays: comercial?.paymentTermsDays ?? null,
    currency: comercial?.currency ?? 'ARS',
    email: comercial?.email ?? null,
    phone: comercial?.phone ?? null,
  };
}

/**
 * Completa la condición de pago de un cliente que no la tenía.
 *
 * Es la acción que ofrece el error al emitir un presupuesto (D-013). Existe
 * para que ese error se pueda resolver sin abandonar lo que se estaba
 * haciendo, que es la diferencia entre un error que enseña y uno que expulsa.
 */
export async function setPaymentTerms(
  scope: Scope,
  customerId: string,
  days: number,
): Promise<Customer> {
  scope.actor.assertCanActOn('customer', 'update');

  const problemas = validateCustomer({ legalName: 'x', phone: 'x', paymentTermsDays: days });
  const problema = problemas.find((p) => p.field === 'paymentTermsDays');
  if (problema) {
    throw new ValidationError({
      message: problema.message,
      reason: problema.reason,
      field: 'paymentTermsDays',
    });
  }

  await scope.db
    .update(customers)
    .set({ paymentTermsDays: days })
    .where(eq(customers.entityId, customerId));

  return loadCustomer(scope, customerId);
}

/** Los clientes que se pueden cotizar, para elegir uno. */
export async function listCustomers(
  scope: Scope,
  options: { readonly limit?: number } = {},
): Promise<readonly SimilarCustomer[]> {
  scope.actor.assertCanActOn('customer', 'read');

  const rows = await scope.db
    .select({
      id: entities.id,
      slug: entities.slug,
      displayName: entities.displayName,
      subtitle: entities.subtitle,
    })
    .from(entities)
    .where(and(eq(entities.type, 'customer'), isNull(entities.archivedAt), ne(entities.slug, '')))
    .orderBy(entities.displayName)
    .limit(options.limit ?? 50);

  return rows.map((row) => ({ ...row, probablyTheSame: false }));
}
