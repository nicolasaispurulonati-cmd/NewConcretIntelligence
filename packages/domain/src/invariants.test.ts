/**
 * Los principios de producto, expresados como pruebas.
 *
 * Un principio que sólo vive en un documento se erosiona con el tiempo. Acá
 * cada invariante rompe el build cuando alguien la viola, incluso sin querer.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALL_DOMAINS, DOMAINS, type DomainId } from './domains.js';
import { ALL_ENTITY_TYPES, ENTITY_TYPES, isEntityTypeId } from './entity-types.js';
import {
  ALL_CAPABILITIES,
  CAPABILITY_CATALOG,
  CAPABILITY_RESOURCES,
  impliedCapabilities,
  isKnownCapability,
  resourceForEntityType,
} from './capabilities.js';
import { ALL_RELATION_TYPES, validateRelation } from './relations.js';
import { ALL_ROLES } from './roles.js';

describe('Dominios', () => {
  it('cada dominio de negocio declara qué preguntas responde (Principio 9)', () => {
    for (const domain of ALL_DOMAINS) {
      if (domain.id === 'ai') continue; // El AI Engine asiste; no responde por sí mismo.
      assert.ok(
        domain.answers.length > 0,
        `El dominio ${domain.id} no declara ninguna pregunta. Un dominio existe para ayudar a decidir, no porque "todas las empresas tienen esa pantalla".`,
      );
    }
  });

  it('las dependencias entre dominios no forman ciclos (Principio 11: modularidad)', () => {
    const visiting = new Set<DomainId>();
    const done = new Set<DomainId>();

    const walk = (id: DomainId, path: DomainId[]): void => {
      if (done.has(id)) return;
      assert.ok(!visiting.has(id), `Ciclo de dependencias: ${[...path, id].join(' → ')}`);
      visiting.add(id);
      for (const next of DOMAINS[id].dependsOn) walk(next, [...path, id]);
      visiting.delete(id);
      done.add(id);
    };

    for (const domain of ALL_DOMAINS) walk(domain.id, []);
  });

  it('todo dominio salvo Identity depende de Identity, directa o indirectamente', () => {
    const reaches = (id: DomainId, target: DomainId, seen = new Set<DomainId>()): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      return DOMAINS[id].dependsOn.some((d) => d === target || reaches(d, target, seen));
    };

    for (const domain of ALL_DOMAINS) {
      if (domain.id === 'identity') continue;
      assert.ok(
        reaches(domain.id, 'identity'),
        `${domain.id} no depende de Identity. Todos los dominios dependen de Identity.`,
      );
    }
  });

  it('el AI Engine no es visible como sección (Principio 4: la IA es transversal)', () => {
    assert.equal(
      DOMAINS.ai.userFacing,
      false,
      'La IA aparece cuando aporta valor, nunca como una pantalla separada.',
    );
  });
});

describe('Entidades', () => {
  it('cada entidad pertenece a un dominio existente', () => {
    for (const entity of ALL_ENTITY_TYPES) {
      assert.ok(DOMAINS[entity.domain], `${entity.id} apunta a un dominio inexistente`);
    }
  });

  it('cada entidad explica qué significa en el lenguaje del negocio', () => {
    for (const entity of ALL_ENTITY_TYPES) {
      assert.ok(entity.meaning.length > 20, `${entity.id} no explica qué representa`);
    }
  });

  it('ninguna entidad comparte nombre visible con otra (Principio 1)', () => {
    const seen = new Map<string, string>();
    for (const entity of ALL_ENTITY_TYPES) {
      const previous = seen.get(entity.singular);
      assert.equal(
        previous,
        undefined,
        `"${entity.singular}" nombra a ${previous} y a ${entity.id}. Un mismo nombre no puede significar dos cosas.`,
      );
      seen.set(entity.singular, entity.id);
    }
  });

  it('las entidades inmutables no admiten modificación en sus capacidades', () => {
    for (const entity of ALL_ENTITY_TYPES) {
      if (!entity.immutable) continue;
      const resource = resourceForEntityType(entity.id);
      if (!resource) continue;
      assert.ok(
        !resource.actions.includes('update'),
        `${entity.id} es inmutable pero su recurso permite modificar. Un movimiento de stock se corrige con otro movimiento, nunca editándolo.`,
      );
    }
  });
});

describe('Capacidades', () => {
  it('cada capacidad se lee como una frase del negocio', () => {
    for (const capability of ALL_CAPABILITIES) {
      assert.match(
        capability.statement,
        /^Puede [a-záéíóúñ ]+/i,
        `"${capability.statement}" no se lee como una responsabilidad`,
      );
    }
  });

  it('un nivel concedido implica los inferiores sobre el mismo recurso', () => {
    const implied = impliedCapabilities('inventory.stock.admin');
    assert.ok(implied.includes('inventory.stock.read'));
    assert.ok(implied.includes('inventory.stock.create'));
    assert.ok(implied.includes('inventory.stock.update'));
    assert.ok(implied.includes('inventory.stock.admin'));
  });

  it('un nivel bajo no implica los superiores', () => {
    const implied = impliedCapabilities('inventory.stock.read');
    assert.deepEqual(implied, ['inventory.stock.read']);
  });

  it('la información financiera exige una capacidad propia (caso Marketing)', () => {
    assert.ok(
      isKnownCapability('executive.financials.read'),
      'Sin esta capacidad no hay forma de responder "no posee permisos para consultar información financiera".',
    );
  });

  it('los identificadores de recurso empiezan por su dominio', () => {
    for (const resource of CAPABILITY_RESOURCES) {
      assert.ok(
        resource.id.startsWith(`${resource.domain}.`),
        `${resource.id} debería empezar con "${resource.domain}."`,
      );
    }
  });
});

describe('Relaciones', () => {
  it('todos los extremos declarados son entidades reales', () => {
    for (const relation of ALL_RELATION_TYPES) {
      for (const type of [...relation.from, ...relation.to]) {
        assert.ok(isEntityTypeId(type), `La relación ${relation.id} referencia "${type}"`);
      }
    }
  });

  it('cada relación se puede leer en los dos sentidos (Principio 13 del PDL)', () => {
    for (const relation of ALL_RELATION_TYPES) {
      assert.ok(relation.label.length > 0, `${relation.id} no tiene etiqueta`);
      assert.ok(relation.inverseLabel.length > 0, `${relation.id} no tiene etiqueta inversa`);
    }
  });

  it('rechaza relaciones sin sentido y explica por qué (Principio 18 del PDL)', () => {
    const result = validateRelation('variant_of', 'customer', 'product');
    assert.equal(result.valid, false);
    assert.match(String(result.reason), /no puede partir de customer/);
    assert.match(String(result.reason), /Parte de: variant/);
  });

  it('acepta una relación válida del grafo', () => {
    assert.equal(validateRelation('documents', 'document', 'product').valid, true);
    assert.equal(validateRelation('variant_of', 'variant', 'product').valid, true);
  });

  it('related_to conecta cualquier par: es la salida de emergencia del modelo', () => {
    assert.equal(validateRelation('related_to', 'campaign', 'movement').valid, true);
  });

  it('el producto llega a todo su universo relacionado', () => {
    // "Abrir Concret D no es ver una ficha: es ver todo su universo."
    const touchesProduct = ALL_RELATION_TYPES.filter(
      (r) => r.from.includes('product') || r.to.includes('product'),
    );
    const domains = new Set(touchesProduct.flatMap((r) => [...r.from, ...r.to]).map((t) => ENTITY_TYPES[t].domain));

    for (const expected of ['knowledge', 'inventory', 'procurement', 'sales', 'marketing'] as const) {
      assert.ok(
        domains.has(expected),
        `Desde un producto no se llega a ${expected}. El grafo está incompleto.`,
      );
    }
  });
});

describe('Roles', () => {
  it('todas las capacidades de todos los roles existen en el catálogo', () => {
    for (const role of ALL_ROLES) {
      for (const id of role.capabilities) {
        assert.ok(
          CAPABILITY_CATALOG.has(id),
          `El rol ${role.id} concede "${id}", que no existe en el catálogo.`,
        );
      }
    }
  });

  it('ningún rol concede escritura sobre lo que declaró no tocar', () => {
    for (const role of ALL_ROLES) {
      for (const forbidden of role.neverModifies) {
        const writes = role.capabilities.filter(
          (id) => id.startsWith(`${forbidden}.`) && !id.endsWith('.read'),
        );
        assert.deepEqual(
          writes,
          [],
          `El rol ${role.name} declara no modificar ${forbidden} pero recibe: ${writes.join(', ')}`,
        );
      }
    }
  });

  it('sólo Dirección y Administración acceden a información financiera', () => {
    const withFinancials = ALL_ROLES.filter((r) =>
      r.capabilities.includes('executive.financials.read'),
    ).map((r) => r.id);

    assert.deepEqual(withFinancials.sort(), ['administracion', 'direccion']);
  });

  it('cada rol propone un Workspace, no un dashboard genérico', () => {
    for (const role of ALL_ROLES) {
      assert.ok(
        role.defaultWorkspace.length >= 4,
        `El rol ${role.id} no propone suficientes widgets. Dos personas nunca deberían ver exactamente el mismo sistema.`,
      );
    }
  });

  it('ningún rol salvo el administrador del sistema gestiona permisos', () => {
    for (const role of ALL_ROLES) {
      if (role.id === 'system_admin') continue;
      const manages = role.capabilities.filter((id) => id.startsWith('identity.role.'));
      assert.deepEqual(manages, [], `El rol ${role.id} puede gestionar permisos.`);
    }
  });
});
