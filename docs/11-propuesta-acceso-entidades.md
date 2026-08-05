# 11. Propuesta: el `Actor` como única vía de acceso a entidades

**Estado: propuesta. No implementada.** Corresponde a D-006.

Criterio de éxito: después del cambio, escribir una consulta sobre entidades que se saltee la clasificación o el alcance de fila tiene que ser **imposible de compilar**, no desaconsejado.

---

## 1. Qué pasa hoy

El `Actor` sabe decidir, pero no puede obligar. `readableEntityTypes()` y `visibleClassifications()` (`packages/core/src/authorization/actor.ts:127-137`) devuelven listas, y cada sitio de consulta decide si las usa y cuáles.

El relevamiento de los doce sitios que leen la tabla de nodos muestra que ya no las usan igual:

| Sitio | Filtra por tipo | Filtra por clasificación |
|---|---|---|
| `search.ts:108` | sí | **sí** |
| `entities.ts:277` `getEntities` | sí | no |
| `relations.ts:162` `getRelated` | sí | no |
| `universe.ts:169` conteo visible | sí | no |
| `entities.ts:140` `getEntity` | no, en SQL | no, en SQL |
| `entities.ts:160` `getEntityBySlug` | no, en SQL | no, en SQL |
| `relations.ts:228` `loadEndpoint` | no, en SQL | no, en SQL |
| `quotes.ts:559`, `quotes.ts:584` | no | no |
| `workspace.ts:66`, `workspace.ts:106` | no | no |
| `universe.ts:160` conteo total | no, **a propósito** | no, a propósito |

Los tres que dicen "no, en SQL" traen la fila y después evalúan `canActOn` en memoria. Funciona, pero evalúa la clasificación **del tipo de entidad** (`actor.ts:96`), no la columna `classification` de la fila. Los otros filtran por la columna. Son dos fuentes de verdad para el mismo concepto: hoy coinciden porque `createEntity` copia una en la otra (`entities.ts:83`) y `updateEntity` nunca la toca, pero nada lo garantiza.

Y el alcance de fila no existe en el motor: el único filtro por dueño del sistema está en `apps/web/src/lib/workspace.ts:67`.

**Verificado sobre la IA:** la recuperación de contexto del asistente no tiene camino propio. `packages/ai/src/retrieval.ts:11-16` importa `getEntityUniverse`, `search` y `Scope` de `@nci/core` y nada más; todo lo que se arregle en el motor lo hereda sin configuración aparte.

---

## 2. La forma propuesta

Una función que devuelve el conjunto de nodos que esta persona puede ver, ya filtrado, y que es lo único que se puede consultar.

```ts
// packages/core/src/graph/access.ts
export function nodes(scope: Scope, options?: { includeArchived?: boolean }): AuthorizedNodes;
```

Devuelve una subconsulta de Drizzle sobre `entities` con tres condiciones ya aplicadas: tipos legibles, clasificaciones visibles y alcance de fila. Todo lo que hoy hace `.from(entities)` pasa a hacer `.from(nodes(scope))`.

El alcance de fila entra como concepto nuevo en el `Actor`:

```ts
type RowScope = 'all' | 'own';
rowScopeFor(entityType: EntityTypeId): RowScope   // hoy siempre 'all'
```

**Por qué una subconsulta y no un repositorio con métodos.** Un repositorio (`findById`, `findBySlug`, `list`) obliga a anticipar cada consulta que algún dominio va a querer, y el día que falta una, alguien vuelve a `scope.db`. La subconsulta deja intacta la expresividad de Drizzle —joins, agregados, `filter (where …)`— y sólo cambia de dónde salen las filas. `openQuoteTotals` (`packages/sales/src/quotes.ts:537-566`) es el ejemplo de una consulta que un repositorio no habría previsto.

**Por qué no sacar `db` del `Scope`.** Es tentador y no alcanza: `@nci/sales` necesita consultar `quotes` y `quote_items`, que son suyas. Sacarlo obligaría a poner un repositorio delante de cada dominio. La puerta que hay que cerrar no es la conexión: es la tabla de nodos.

---

## 3. Cómo se hace imposible el bypass

En dos capas, y la primera es la que da la garantía.

**Capa 1 — el símbolo deja de existir fuera de `@nci/core`.** `packages/db/src/index.ts:13-18` exporta `entities` y `entityRelations`, y `packages/db/package.json:14-17` publica además el subpath `@nci/db/schema`. Las dos salidas se cierran: las tablas del grafo pasan a un punto de entrada interno que sólo `@nci/core` declara como dependencia permitida.

Con eso, `import { entities } from '@nci/db'` **no compila** en `@nci/sales`, en `apps/web` ni en ningún dominio futuro. No es una convención que alguien pueda no conocer: es un módulo que no exporta lo que se le pide.

**Capa 2 — dentro de `@nci/core`, una prueba.** El símbolo sigue siendo alcanzable ahí, así que una prueba de límites verifica que ningún archivo del paquete importe la tabla salvo `graph/access.ts`. Es el mecanismo que ya sostiene que el motor de IA no pueda alcanzar la base (`packages/ai/src/boundaries.test.ts:70-99`) y que la moneda no baje al renglón (`packages/sales/src/boundaries.test.ts`). No se inventa nada nuevo.

**La excepción que hay que declarar, no esconder.** `universe.ts:160` cuenta las relaciones **sin filtrar**, a propósito: la diferencia contra el conteo filtrado es `restrictedCount`, el número que evita que la plataforma afirme que algo no existe cuando la persona sólo no puede verlo. Si la puerta se aplica ahí, `restrictedCount` da siempre cero y se rompe una promesa central del producto. La excepción necesita nombre propio en el módulo de acceso —una función aparte, explícita, que sólo cuenta— y su propia prueba.

---

## 4. Inventario de sitios a migrar

| Sitio | Qué cambia | Dificultad |
|---|---|---|
| `search.ts:108` | `from(entities)` → `from(nodes(scope))`, se borran los dos `inArray` | **Media** — hay que confirmar que el planificador siga usando los índices GIN y HNSW a través de la subconsulta |
| `relations.ts:162` `getRelated` | el join contra `entities` pasa a `nodes(scope)` | Baja |
| `universe.ts:169` conteo visible | igual | Baja |
| `universe.ts:160` conteo total | **no se migra**: es la excepción de la sección 3 | Media, por el riesgo de migrarla sin querer |
| `entities.ts:277` `getEntities` | igual | Baja |
| `entities.ts:140` `getEntity` | pasa a filtrar en SQL; hoy filtra en memoria | **Media** — cambia de fuente de verdad de clasificación, ver sección 5 |
| `entities.ts:160` `getEntityBySlug` | igual | Media, mismo motivo |
| `relations.ts:228` `loadEndpoint` | igual | Media, mismo motivo |
| `quotes.ts:559` `openQuoteTotals` | join contra `nodes(scope)` | Baja |
| `quotes.ts:584` `customerOf` | igual, y deja de usar SQL crudo | Baja |
| `workspace.ts:66` `sales.my_quotes` | join contra `nodes(scope)`; el filtro por dueño pasa a ser argumento de vista | Baja |
| `workspace.ts:106` `crm.follow_ups` | join contra `nodes(scope)` | Baja |
| `entities.ts:93,197,248` escrituras | no cambian: ya pasan por `assertCanActOn` | Ninguna |
| `packages/sales/src/quotes.ts:24` | pierde el import de `entities` | Baja |
| `apps/web/src/lib/workspace.ts:15` | igual | Baja |
| 3 archivos de prueba de integración | usan `db.delete(entities)` para limpiar; necesitan una puerta propia | **Media** — ver sección 7, decisión 5 |

Doce sitios de lectura, dos imports, tres archivos de prueba, un módulo nuevo y una prueba de límites.

---

## 5. Orden de migración

Cada paso deja el sistema funcionando y verde.

**Paso 1 — construir la puerta, sin obligar a usarla.** Se agrega `graph/access.ts` y `rowScopeFor` al `Actor`, con política `'all'` para todo. Nada cambia de comportamiento porque `'all'` no agrega condición. Se migran los sitios de `@nci/core` que ya filtran igual: `getEntities`, `getRelated`, conteo visible. Estado: el sistema anda, la tabla cruda sigue exportada.

**Paso 2 — los tres sitios que filtran en memoria.** `getEntity`, `getEntityBySlug` y `loadEndpoint` pasan a filtrar en SQL. Es el paso que puede cambiar comportamiento observable y va solo, para que si algo se rompe se sepa qué lo rompió.

**Paso 3 — los dominios.** `@nci/sales` y `apps/web` pasan a `nodes(scope)`. El filtro por dueño de `workspace.ts:67` se reclasifica como argumento de vista, con la forma que ya usa `openQuoteTotals`.

**Paso 4 — cerrar la puerta.** Se dejan de exportar las tablas del grafo desde `@nci/db` y se agrega la prueba de límites. A partir de acá el bypass no compila. Es el único paso irreversible en la práctica: volver atrás es reabrir el export.

**Paso 5 — unificar la clasificación.** Una sola fuente de verdad, columna o definición de tipo. Va último porque necesita que todos los sitios ya pasen por la misma puerta.

---

## 6. Qué se rompe

**Tipos.** Todo archivo que importe `entities` o `entityRelations` de `@nci/db`: hoy son dos de producción (`quotes.ts:24`, `workspace.ts:15`) y tres de prueba. El compilador los señala a todos; no hay forma de que alguno pase inadvertido.

**Pruebas.** Las tres de integración borran lo que crearon con `db.delete(entities)` (`universe.integration.test.ts:80`, `provenance.integration.test.ts:87`, `quotes.integration.test.ts:81`). Sin acceso a la tabla no pueden limpiar, y una prueba que deja rastro convierte la base de desarrollo en un depósito de datos inventados.

**Comportamiento observable.** Dos cambios posibles, los dos en el paso 2:

- `getEntity` pasa a evaluar la clasificación de la fila en lugar de la del tipo. Hoy dan lo mismo; si alguna vez difieren, empieza a dar distinto.
- Un nodo archivado hoy es visible por `getEntity` y no por `search`. La puerta unifica ese criterio, y hay que decidir cuál queda.

**Rendimiento.** El único riesgo real está en `search`: la consulta usa `ts_rank`, `similarity` y el operador de distancia de vectores, y depende de tres índices. PostgreSQL suele aplanar una subconsulta simple, pero eso hay que medirlo con `explain`, no suponerlo.

---

## 7. Costo y riesgo

**Tamaño:** un módulo nuevo de unas 80 líneas, un método nuevo en `Actor`, doce sitios de consulta de una línea cada uno, dos imports, tres archivos de prueba y una prueba de límites nueva. Es un cambio ancho y poco profundo.

**Riesgo, concentrado en tres puntos:**

1. **`restrictedCount`.** Aplicar la puerta donde no corresponde rompe en silencio una promesa del producto. Se cubre con una prueba que ya existe (`universe.integration.test.ts`) y que hay que conservar intacta durante toda la migración.
2. **El rendimiento de `search`.** Medible antes de migrar.
3. **La limpieza de las pruebas de integración.** Si se resuelve mal, o dejan basura o se abre una puerta que después alguien usa en producción.

**Lo que no es riesgo:** la IA. No tiene camino propio y hereda todo (verificado en la sección 1).

---

## 8. Qué decisión falta de tu parte

| # | Decisión | Recomendación |
|---|---|---|
| 1 | ¿Se cierra el subpath `@nci/db/schema` además del export principal? Es la única forma de que el bypass no compile; hoy ese subpath deja entrar a cualquiera. | Cerrarlo |
| 2 | ¿La clasificación de un dato la manda la columna de la fila o la definición del tipo? Hoy conviven las dos y coinciden por costumbre. | La columna: sobrevive a que un tipo cambie de criterio |
| 3 | ¿El alcance de fila se configura por tipo de entidad o es uno global? | Por tipo: un cliente que ve lo suyo y un vendedor que ve todo son políticas distintas sobre el mismo motor |
| 4 | ¿Un nodo archivado se ve o no se ve? Hoy `search` lo excluye y `getEntity` lo devuelve. | Excluirlo por defecto, con opción explícita para incluirlo |
| 5 | ¿Las pruebas de integración pueden tener una puerta propia a la tabla cruda para limpiar lo que crean, o se limpia por otra vía? | Puerta propia, marcada como tal y prohibida en código de producción por la misma prueba de límites |

Con esas cinco respuestas el diseño queda cerrado y se puede implementar por los cinco pasos de la sección 5.
