/**
 * Búsqueda universal para el Command Palette.
 *
 * Devuelve sólo lo que esta persona puede consultar, porque `search` recibe el
 * mismo Scope que usa la interfaz. No hay una versión "de sistema" de esta
 * consulta.
 */

import { NextResponse } from 'next/server';

import { isNciError, search } from '@nci/core';
import { isEntityTypeId } from '@nci/domain';

import { getScope } from '@/lib/session';

export async function GET(request: Request): Promise<NextResponse> {
  const scope = await getScope();
  if (!scope) {
    return NextResponse.json({ hits: [] }, { status: 401 });
  }

  const parametros = new URL(request.url).searchParams;
  const term = parametros.get('q')?.trim() ?? '';
  if (term.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  // Acotar por tipo es un parámetro, no una ruta nueva: la detección de
  // duplicados al dar de alta un cliente es la misma búsqueda con un filtro.
  const tipo = parametros.get('tipo');
  const tipos = tipo && isEntityTypeId(tipo) ? [tipo] : undefined;

  try {
    const hits = await search(scope, term, { limit: 12, ...(tipos ? { types: tipos } : {}) });
    return NextResponse.json({
      hits: hits.map((hit) => ({
        id: hit.id,
        type: hit.type,
        typeName: hit.typeName,
        domain: hit.domain,
        href: `/e/${hit.type}/${hit.slug}`,
        displayName: hit.displayName,
        subtitle: hit.subtitle,
      })),
    });
  } catch (error) {
    if (isNciError(error)) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus });
    }
    throw error;
  }
}
