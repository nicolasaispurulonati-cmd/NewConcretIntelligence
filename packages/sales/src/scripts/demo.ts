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
import { customers, getDatabase, userRoles, users } from '@nci/db';
import { ROLES } from '@nci/domain';

import { addQuoteItem, createQuote, rejectQuote, sendQuote } from '../quotes.js';

const EMAIL = 'comercial@newconcret.local';

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
      await acceptInvitation(db, { userId: comercial.id, password: 'comercial-de-prueba' });
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
