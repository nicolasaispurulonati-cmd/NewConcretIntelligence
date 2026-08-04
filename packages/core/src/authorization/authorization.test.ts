/**
 * Las reglas de permisos, verificadas sobre los casos exactos que plantean los
 * documentos del producto.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ROLES, type CapabilityId } from '@nci/domain';

import { NotAuthorizedError } from '../errors.js';
import { Actor, resolveCapabilities } from './actor.js';

function actorWithRole(roleId: keyof typeof ROLES, extra: Partial<{
  granted: CapabilityId[];
  revoked: CapabilityId[];
}> = {}): Actor {
  const role = ROLES[roleId];
  return new Actor({
    id: 'test',
    fullName: 'Usuario de prueba',
    roles: [role.id],
    capabilities: resolveCapabilities({
      fromRoles: role.capabilities,
      granted: extra.granted ?? [],
      revoked: extra.revoked ?? [],
    }),
  });
}

describe('Resolución de capacidades', () => {
  it('un nivel concedido arrastra los inferiores del mismo recurso', () => {
    const capabilities = resolveCapabilities({ fromRoles: ['inventory.stock.admin'] });
    assert.ok(capabilities.has('inventory.stock.read'));
    assert.ok(capabilities.has('inventory.stock.update'));
  });

  it('una revocación gana sobre lo que implicó un nivel superior', () => {
    const capabilities = resolveCapabilities({
      fromRoles: ['inventory.stock.admin'],
      revoked: ['inventory.stock.update'],
    });
    assert.ok(capabilities.has('inventory.stock.read'), 'debería conservar la lectura');
    assert.ok(!capabilities.has('inventory.stock.update'), 'la revocación tiene que ganar');
  });

  it('las concesiones individuales suman sobre el rol', () => {
    const comercial = actorWithRole('comercial', { granted: ['procurement.purchase_order.approve'] });
    assert.ok(comercial.can('procurement.purchase_order.approve'));
    assert.ok(comercial.can('procurement.purchase_order.read'), 'aprobar implica consultar');
  });
});

describe('El caso del documento: Marketing y el margen bruto', () => {
  const marketing = actorWithRole('marketing');

  it('Marketing no puede consultar información financiera', () => {
    assert.equal(marketing.can('executive.financials.read'), false);
  });

  it('el sistema responde con la frase del documento, no con un código', () => {
    let error: NotAuthorizedError | undefined;
    try {
      marketing.assert('executive.financials.read');
    } catch (caught) {
      error = caught as NotAuthorizedError;
    }

    assert.ok(error instanceof NotAuthorizedError, 'debería lanzar NotAuthorizedError');
    assert.equal(error.message, 'No posee permisos para consultar información financiera.');
    assert.ok(error.reason.length > 0, 'el error tiene que explicar por qué');
    assert.ok(error.actions.length > 0, 'y ofrecer una acción');
  });

  it('Marketing ve el producto pero no una venta', () => {
    assert.ok(marketing.canActOn('product', 'read'));
    assert.equal(
      marketing.canActOn('sale', 'read'),
      false,
      'una venta está clasificada como financiera',
    );
  });

  it('Dirección sí puede consultar lo financiero', () => {
    const direccion = actorWithRole('direccion');
    assert.ok(direccion.can('executive.financials.read'));
    assert.ok(direccion.canActOn('sale', 'read'));
  });
});

describe('Límites declarados de cada rol', () => {
  it('Comercial no modifica stock', () => {
    const comercial = actorWithRole('comercial');
    assert.ok(comercial.canActOn('stock', 'read'), 'sí puede consultarlo');
    assert.equal(comercial.canActOn('stock', 'update'), false);
  });

  it('Compras no modifica campañas ni procedimientos técnicos', () => {
    const compras = actorWithRole('compras');
    assert.equal(compras.canActOn('campaign', 'update'), false);
    assert.equal(compras.canActOn('procedure', 'update'), false);
  });

  it('el administrador del sistema no accede a los datos del negocio por defecto', () => {
    const admin = actorWithRole('system_admin');
    assert.ok(admin.can('identity.user.admin'));
    assert.equal(admin.canActOn('customer', 'read'), false);
    assert.equal(admin.canActOn('sale', 'read'), false);
  });
});

describe('Denegación por omisión', () => {
  it('un actor sin capacidades no puede leer nada', () => {
    const nobody = new Actor({
      id: 'x',
      fullName: 'Sin permisos',
      roles: [],
      capabilities: new Set(),
    });
    assert.deepEqual(nobody.readableEntityTypes(), []);
    assert.equal(nobody.canActOn('product', 'read'), false);
  });

  it('una acción que el recurso no ofrece se deniega aunque exista la capacidad', () => {
    const stock = actorWithRole('stock', { granted: ['inventory.movement.admin'] });
    // Un movimiento no admite modificación: se corrige con otro movimiento.
    assert.equal(stock.canActOn('movement', 'update'), false);
    assert.ok(stock.canActOn('movement', 'create'));
  });
});

describe('Alcance de lectura', () => {
  it('cada rol ve un conjunto distinto de entidades', () => {
    const seen = new Map<string, number>();
    for (const roleId of Object.keys(ROLES) as (keyof typeof ROLES)[]) {
      seen.set(roleId, actorWithRole(roleId).readableEntityTypes().length);
    }

    // "Dos personas nunca deberían ver exactamente el mismo sistema."
    assert.ok(
      new Set(seen.values()).size > 1,
      'si todos los roles vieran lo mismo, el modelo de permisos no estaría haciendo nada',
    );
    assert.ok(
      (seen.get('direccion') ?? 0) > (seen.get('marketing') ?? 0),
      'Dirección ve toda la empresa',
    );
  });
});
