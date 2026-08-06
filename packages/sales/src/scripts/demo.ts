/**
 * Datos de ejemplo del perfil comercial.
 *
 * Crea un usuario con rol Comercial, tres clientes y presupuestos en distintos
 * estados, para poder recorrer el dominio con algo que se parezca al trabajo
 * real. Es idempotente: si ya existen, no duplica.
 *
 *   npm run demo:comercial
 */

import { eq } from 'drizzle-orm';

import {
  Actor,
  acceptInvitation,
  createEntity,
  getEntityBySlug,
  resolveCapabilities,
  type Scope,
} from '@nci/core';
import { customers, getDatabase, requireDatabaseUrl, userRoles, users } from '@nci/db';
import { ROLES } from '@nci/domain';

import { addQuoteItem, createQuote, issueQuote, rejectQuote, sendQuote } from '../quotes.js';

const EMAIL = 'comercial@newconcret.local';

/**
 * La clave que se usa cuando no viene del entorno.
 *
 * No es un secreto y no puede serlo: está en un repositorio público. Existe
 * para que levantar el entorno de desarrollo sea un comando y no un trámite, y
 * `claveDeDemostracion` se encarga de que no pueda usarse en ningún otro lado.
 */
const CLAVE_DE_DESARROLLO = 'demostracion-local';

/** Si la cadena de conexión apunta a esta misma máquina. */
function esBaseLocal(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    // Una cadena que no se puede interpretar no se considera local: ante la
    // duda, el script pide la clave explícita.
    return false;
  }
}

/**
 * La clave del usuario de demostración.
 *
 * Estaba escrita en el código. En un repositorio público eso es una credencial
 * conocida para una cuenta con rol Comercial, y alcanzaba con que alguien
 * corriera el script apuntando a una base que no fuera la suya.
 *
 * Ahora viene de `NCI_DEMO_PASSWORD`. El valor por defecto se usa sólo si se
 * cumplen las dos condiciones: que el entorno no sea de producción y que la
 * base sea local. `NODE_ENV` solo no alcanza — nadie lo define al correr un
 * script a mano, y apuntar `DATABASE_URL` a producción no cambia su valor.
 */
function claveDeDemostracion(url: string): string {
  const delEntorno = process.env['NCI_DEMO_PASSWORD']?.trim();
  if (delEntorno) return delEntorno;

  const enProduccion = process.env['NODE_ENV'] === 'production';

  if (enProduccion || !esBaseLocal(url)) {
    throw new Error(
      [
        'Falta NCI_DEMO_PASSWORD.',
        '',
        enProduccion
          ? 'El entorno está marcado como producción.'
          : 'La base de datos no está en esta máquina.',
        '',
        'Este script crea un usuario real con rol Comercial. La clave por',
        'defecto sólo se usa contra una base local, porque está escrita en un',
        'repositorio público y cualquiera puede leerla.',
        '',
        'Si de verdad querés sembrar datos de demostración acá, definí la clave:',
        '',
        '  NCI_DEMO_PASSWORD="..." npm run demo:comercial',
      ].join('\n'),
    );
  }

  return CLAVE_DE_DESARROLLO;
}

interface ClienteDemo {
  readonly slug: string;
  readonly nombre: string;
  readonly segmento: string;
  readonly plazo: number | null;
  readonly ciudad: string;
}

const CLIENTES: readonly ClienteDemo[] = [
  {
    slug: 'constructora-del-litoral',
    nombre: 'Constructora del Litoral',
    segmento: 'constructora',
    plazo: 30,
    ciudad: 'Santa Fe',
  },
  {
    slug: 'industrias-pampa',
    nombre: 'Industrias Pampa',
    segmento: 'industria',
    plazo: 60,
    ciudad: 'Rosario',
  },
  {
    // Sin condición de pago: sirve para ver el error que enseña, en vivo.
    slug: 'deposito-san-martin',
    nombre: 'Depósito San Martín',
    segmento: 'distribuidor',
    plazo: null,
    ciudad: 'Córdoba',
  },
];

async function main(): Promise<void> {
  // Se resuelve antes de tocar la base: si falta la clave donde hace falta,
  // conviene enterarse ahora y no con medio escenario ya creado.
  const clave = claveDeDemostracion(requireDatabaseUrl());
  const db = getDatabase();

  try {
    // ── El usuario comercial ────────────────────────────────────────────
    let [comercial] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));

    if (!comercial) {
      const [creado] = await db
        .insert(users)
        .values({
          email: EMAIL,
          fullName: 'Vendedor de prueba',
          jobTitle: 'Ejecutivo comercial',
          status: 'invited',
        })
        .returning({ id: users.id });
      comercial = creado!;
      await acceptInvitation(db, { userId: comercial.id, password: clave });
      console.log(`Usuario creado: ${EMAIL}`);
    } else {
      console.log(`Usuario existente: ${EMAIL}`);
    }

    await db
      .insert(userRoles)
      .values({ userId: comercial.id, roleId: 'comercial' })
      .onConflictDoNothing();

    const scope: Scope = {
      db,
      actor: new Actor({
        id: comercial.id,
        fullName: 'Vendedor de prueba',
        roles: ['comercial'],
        // Se le suma aprobar presupuestos para poder dejar uno aceptado.
        capabilities: resolveCapabilities({
          fromRoles: [...ROLES.comercial.capabilities, 'sales.quote.approve'],
        }),
      }),
    };

    // ── Clientes ────────────────────────────────────────────────────────
    const creados: { slug: string; id: string; plazo: number | null }[] = [];

    for (const cliente of CLIENTES) {
      let entidad;
      try {
        entidad = await getEntityBySlug(scope, 'customer', cliente.slug);
      } catch {
        entidad = await createEntity(scope, {
          type: 'customer',
          slug: cliente.slug,
          displayName: cliente.nombre,
          subtitle: `${cliente.segmento} · ${cliente.ciudad}`,
          status: 'activo',
          searchableText: `${cliente.nombre} ${cliente.segmento} ${cliente.ciudad}`,
        });
        await db.insert(customers).values({
          entityId: entidad.id,
          segment: cliente.segmento,
          paymentTermsDays: cliente.plazo,
          city: cliente.ciudad,
          province: 'Argentina',
        });
        console.log(
          `Cliente: ${cliente.nombre}${cliente.plazo === null ? ' (sin condición de pago, a propósito)' : ''}`,
        );
      }
      creados.push({ slug: cliente.slug, id: entidad.id, plazo: cliente.plazo });
    }

    // ── Presupuestos en distintos estados ───────────────────────────────
    const litoral = creados.find((c) => c.slug === 'constructora-del-litoral');
    const pampa = creados.find((c) => c.slug === 'industrias-pampa');

    if (litoral) {
      // Uno enviado, esperando respuesta: alimenta "Esperan respuesta".
      let q = await createQuote(scope, { customerId: litoral.id, notes: 'Obra Puerto Norte.' });
      q = await addQuoteItem(scope, q.entity.id, {
        description: 'Concret D · bidón 20 L',
        quantity: 24,
        unit: 'bidón',
        unitPrice: 148_500,
      });
      q = await addQuoteItem(scope, q.entity.id, {
        description: 'Aplicación en obra',
        quantity: 320,
        unit: 'm2',
        unitPrice: 3_200,
        discountPercent: 5,
      });
      q = await issueQuote(scope, q.entity.id);
      q = await sendQuote(scope, q.entity.id, 'correo');
      console.log(`Presupuesto ${q.number}: enviado, esperando respuesta.`);

      // Otro en borrador: alimenta "todavía sin enviar".
      const borrador = await createQuote(scope, { customerId: litoral.id });
      await addQuoteItem(scope, borrador.entity.id, {
        description: 'Concret D · bidón 20 L',
        quantity: 6,
        unit: 'bidón',
        unitPrice: 148_500,
      });
      console.log(`Presupuesto ${borrador.number}: borrador.`);
    }

    if (pampa) {
      // Uno rechazado, con el motivo: es lo que convierte el pipeline en
      // conocimiento en lugar de un tablero de números.
      let q = await createQuote(scope, { customerId: pampa.id });
      q = await addQuoteItem(scope, q.entity.id, {
        description: 'Concret D · tambor 200 L',
        quantity: 3,
        unit: 'tambor',
        unitPrice: 1_420_000,
      });
      q = await issueQuote(scope, q.entity.id);
      q = await sendQuote(scope, q.entity.id, 'whatsapp');
      q = await rejectQuote(scope, q.entity.id, 'Se optó por un proveedor con entrega inmediata.');
      console.log(`Presupuesto ${q.number}: rechazado, con motivo registrado.`);
    }

    console.log('');
    console.log('Listo. Para entrar como comercial:');
    console.log(`  correo:     ${EMAIL}`);
    console.log('  contraseña: comercial-de-prueba');
  } finally {
    await db.$client.end();
  }
}

await main();
