/**
 * Búsqueda universal para el Command Palette.
 *
 * Devuelve sólo lo que esta persona puede consultar, porque `search` recibe el
 * mismo Scope que usa la interfaz. No hay una versión "de sistema" de esta
 * consulta.
 */

import { NextResponse } from 'next/server';

import { isNciError, search } from '@nci/core';

import { getScope } from '@/lib/session';

export async function GET(request: Request): Promise<NextResponse> {
  const scope = await getScope();
  if (!scope) {
    return NextResponse.json({ hits: [] }, { status: 401 });
  }

  const term = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (term.length < 2) {
    return NextResponse.json({ hits: [] });
  }

  try {
    const hits = await search(scope, term, { limit: 12 });
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
