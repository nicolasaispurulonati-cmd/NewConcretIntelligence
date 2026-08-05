# 11. Propuesta: el `Actor` como única vía de acceso a entidades

**Estado: propuesta. No implementada.** Corresponde a D-006.

Criterio de éxito: después del cambio, escribir una consulta sobre entidades que se saltee la clasificación o el alcance de fila tiene que ser **imposible de compilar**, no desaconsejado.

---

## 0. Lo que hay que saber para leer esto

Cinco piezas del sistema, para quien no las tenga presentes. Las tres primeras existen y funcionan; las dos últimas son lo que este documento propone.

| Pieza | Qué es | Dónde |
|---|---|---|
| **Entidad** | Todo objeto del negocio —un producto, un cliente, un presupuesto— es una fila de la tabla `entities`, con la misma forma. Las relaciones entre ellas viven en `entity_relations` | `packages/db/src/schema/graph.ts` |
| **`Actor`** | Quién está haciendo algo y qué puede hacer. Su autoridad son capacidades del tipo `dominio.recurso.acción` | `packages/core/src/authorization/actor.ts` |
| **`Scope`** | `{ db, actor }`. Es el único objeto con el que se opera sobre datos: toda función que lee o escribe lo recibe. Es lo que hace cierto que el motor de IA no pueda ver lo que la persona no vería | `packages/core/src/authorization/resolve.ts` |
| **Clasificación** | Cada dato es `public`, `internal`, `financial` o `restricted`. Leer uno `financial` exige una capacidad extra, además del permiso sobre el recurso | `packages/domain/src/entity-types.ts` |
| **Alcance de fila** | Si una persona ve todas las filas o sólo las suyas. **Hoy no existe**: la autorización decide por capacidad y por clasificación, nunca por dueño del registro | — |

Dos decisiones ya tomadas que este diseño tiene que respetar, ambas en [`docs/10-decisiones.md`](10-decisiones.md):

- **D-004 — capacidad amplia, vista angosta.** Los permisos de lectura son amplios. Que un registro sea de alguien determina con qué se abre una pantalla, no qué puede leer esa persona. La política vigente es transparencia total: los vendedores se ven entre sí.
- **D-002 — el motor de IA no puede alcanzar la base.** Sólo accede a través de `@nci/core` con un `Scope`, y una prueba rompe el build si alguien lo intenta. Es el precedente que este documento imita.

El problema que sigue es de otra clase: la autorización existe y funciona, pero **es opcional en el punto de uso**. Cada consulta decide si la aplica.

---

## 1. Qué pasa hoy

El `Actor` sabe decidir, pero no puede obligar. `readableEntityTypes()` y `visibleClassifications()`, en `packages/core/src/authorization/actor.ts`, devuelven listas, y cada sitio de consulta decide si las usa y cuáles.

El relevamiento de los doce sitios que leen la tabla de nodos muestra que ya no las usan igual:

| Sitio | Filtra por tipo | Filtra por clasificación |
|---|---|---|
| `search.ts` · `search()` | sí | **sí** |
| `entities.ts` · `getEntities()` | sí | no |
| `relations.ts` · `getRelated()` | sí | no |
| `universe.ts` · el conteo visible de `countRelationVisibility()` | sí | no |
| `entities.ts` · `getEntity()` | no, en SQL | no, en SQL |
| `entities.ts` · `getEntityBySlug()` | no, en SQL | no, en SQL |
| `relations.ts` · `loadEndpoint()` | no, en SQL | no, en SQL |
| `quotes.ts` · `openQuoteTotals()`, `quotes.ts` · `customerOf()` | no | no |
| `workspace.ts` · widget `sales.my_quotes`, `workspace.ts` · widget `crm.follow_ups` | no | no |
| `universe.ts` · el conteo total de `countRelationVisibility()` | no, **a propósito** | no, a propósito |

Los tres que dicen "no, en SQL" traen la fila y después evalúan `canActOn` en memoria. Funciona, pero evalúa la clasificación **del tipo de entidad** (`actor.ts` · `canActOn()`), no la columna `classification` de la fila. Los otros filtran por la columna. Son dos fuentes de verdad para el mismo concepto: hoy coinciden porque `createEntity` copia una en la otra (`entities.ts` · `createEntity()`) y `updateEntity` nunca la toca, pero nada lo garantiza.

Y el alcance de fila no existe en el motor: el único filtro por dueño del sistema está en `apps/web/src/lib/workspace.ts`, en el widget `sales.my_quotes`.

**Verificado sobre la IA:** la recuperación de contexto del asistente no tiene camino propio. `packages/ai/src/retrieval.ts`, en sus importaciones importa `getEntityUniverse`, `search` y `Scope` de `@nci/core` y nada más; todo lo que se arregle en el motor lo hereda sin configuración aparte.

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

**Por qué una subconsulta y no un repositorio con métodos.** Un repositorio (`findById`, `findBySlug`, `list`) obliga a anticipar cada consulta que algún dominio va a querer, y el día que falta una, alguien vuelve a `scope.db`. La subconsulta deja intacta la expresividad de Drizzle —joins, agregados, `filter (where …)`— y sólo cambia de dónde salen las filas. `openQuoteTotals` (`packages/sales/src/quotes.ts` · `openQuoteTotals()`) es el ejemplo de una consulta que un repositorio no habría previsto.

**Por qué no sacar `db` del `Scope`.** Es tentador y no alcanza: `@nci/sales` necesita consultar `quotes` y `quote_items`, que son suyas. Sacarlo obligaría a poner un repositorio delante de cada dominio. La puerta que hay que cerrar no es la conexión: es la tabla de nodos.

---

## 3. Cómo se hace imposible el bypass

En dos capas, y la primera es la que da la garantía.

**Capa 1 — el símbolo deja de existir fuera de `@nci/core`.** `packages/db/src/index.ts` exporta `entities` y `entityRelations`, y `packages/db/package.json`, en `exports` publica además el subpath `@nci/db/schema`. Las dos salidas se cierran: las tablas del grafo pasan a un punto de entrada interno que sólo `@nci/core` declara como dependencia permitida.

Con eso, `import { entities } from '@nci/db'` **no compila** en `@nci/sales`, en `apps/web` ni en ningún dominio futuro. No es una convención que alguien pueda no conocer: es un módulo que no exporta lo que se le pide.

**Capa 2 — dentro de `@nci/core`, una prueba.** El símbolo sigue siendo alcanzable ahí, así que una prueba de límites verifica que ningún archivo del paquete importe la tabla salvo `graph/access.ts`. Es el mecanismo que ya sostiene que el motor de IA no pueda alcanzar la base (`packages/ai/src/boundaries.test.ts`) y que la moneda no baje al renglón (`packages/sales/src/boundaries.test.ts`). No se inventa nada nuevo.

**La excepción que hay que declarar, no esconder.** `universe.ts` · el conteo total de `countRelationVisibility()` cuenta las relaciones **sin filtrar**, a propósito: la diferencia contra el conteo filtrado es `restrictedCount`, el número que evita que la plataforma afirme que algo no existe cuando la persona sólo no puede verlo. Si la puerta se aplica ahí, `restrictedCount` da siempre cero y se rompe una promesa central del producto. La excepción necesita nombre propio en el módulo de acceso —una función aparte, explícita, que sólo cuenta— y su propia prueba.

---

## 4. Inventario de sitios a migrar

| Sitio | Qué cambia | Dificultad |
|---|---|---|
| `search.ts` · `search()` | `from(entities)` → `from(nodes(scope))`, se borran los dos `inArray` | **Media** — hay que confirmar que el planificador siga usando los índices GIN y HNSW a través de la subconsulta |
| `relations.ts` · `getRelated()` | el join contra `entities` pasa a `nodes(scope)` | Baja |
| `universe.ts` · el conteo visible de `countRelationVisibility()` | igual | Baja |
| `universe.ts` · el conteo total de `countRelationVisibility()` | **no se migra**: es la excepción de la sección 3 | Media, por el riesgo de migrarla sin querer |
| `entities.ts` · `getEntities()` | igual | Baja |
| `entities.ts` · `getEntity()` | pasa a filtrar en SQL; hoy filtra en memoria | **Media** — cambia de fuente de verdad de clasificación, ver sección 5 |
| `entities.ts` · `getEntityBySlug()` | igual | Media, mismo motivo |
| `relations.ts` · `loadEndpoint()` | igual | Media, mismo motivo |
| `quotes.ts` · `openQuoteTotals()` | join contra `nodes(scope)` | Baja |
| `quotes.ts` · `customerOf()` | igual, y deja de usar SQL crudo | Baja |
| `workspace.ts` · widget `sales.my_quotes` | join contra `nodes(scope)`; el filtro por dueño pasa a ser argumento de vista | Baja |
| `workspace.ts` · widget `crm.follow_ups` | join contra `nodes(scope)` | Baja |
| `entities.ts` · `createEntity()`, `updateEntity()`, `archiveEntity()` | no cambian: ya pasan por `assertCanActOn` | Ninguna |
| `packages/sales/src/quotes.ts`, en sus importaciones | pierde el import de `entities` | Baja |
| `apps/web/src/lib/workspace.ts`, en sus importaciones | igual | Baja |
| 4 archivos de prueba de integración | usan `db.delete(entities)` para limpiar; necesitan una puerta propia | **Media** — ver sección 7, decisión 5 |

Doce sitios de lectura, dos imports de producción, cuatro archivos de prueba, un módulo nuevo y una prueba de límites.

---

## 5. Orden de migración

Cada paso deja el sistema funcionando y verde.

**Paso 1 — construir la puerta, sin obligar a usarla.** Se agrega `graph/access.ts` y `rowScopeFor` al `Actor`, con política `'all'` para todo. Nada cambia de comportamiento porque `'all'` no agrega condición. Se migran los sitios de `@nci/core` que ya filtran igual: `getEntities`, `getRelated`, conteo visible. Estado: el sistema anda, la tabla cruda sigue exportada.

**Paso 2 — los tres sitios que filtran en memoria.** `getEntity`, `getEntityBySlug` y `loadEndpoint` pasan a filtrar en SQL. Es el paso que puede cambiar comportamiento observable y va solo, para que si algo se rompe se sepa qué lo rompió.

**Paso 3 — los dominios.** `@nci/sales` y `apps/web` pasan a `nodes(scope)`. El filtro por dueño de `workspace.ts`, en el widget `sales.my_quotes` se reclasifica como argumento de vista, con la forma que ya usa `openQuoteTotals`.

**Paso 4 — cerrar la puerta.** Se dejan de exportar las tablas del grafo desde `@nci/db` y se agrega la prueba de límites. A partir de acá el bypass no compila. Es el único paso irreversible en la práctica: volver atrás es reabrir el export.

**Paso 5 — unificar la clasificación.** Una sola fuente de verdad, columna o definición de tipo. Va último porque necesita que todos los sitios ya pasen por la misma puerta.

---

## 6. Qué se rompe

**Tipos.** Todo archivo que importe `entities` o `entityRelations` de `@nci/db`: hoy son dos de producción —`packages/sales/src/quotes.ts` y `apps/web/src/lib/workspace.ts`— y cuatro de prueba. El compilador los señala a todos; no hay forma de que alguno pase inadvertido.

**Pruebas.** Las cuatro de integración borran lo que crearon con `db.delete(entities)` en @nci/core (dos), @nci/sales y apps/web. Sin acceso a la tabla no pueden limpiar, y una prueba que deja rastro convierte la base de desarrollo en un depósito de datos inventados.

**Comportamiento observable.** Dos cambios posibles, los dos en el paso 2:

- `getEntity` pasa a evaluar la clasificación de la fila en lugar de la del tipo. Hoy dan lo mismo; si alguna vez difieren, empieza a dar distinto.
- Un nodo archivado hoy es visible por `getEntity` y no por `search`. La puerta unifica ese criterio, y hay que decidir cuál queda.

**Rendimiento.** El único riesgo real está en `search`: la consulta usa `ts_rank`, `similarity` y el operador de distancia de vectores, y depende de tres índices. PostgreSQL suele aplanar una subconsulta simple, pero eso hay que medirlo con `explain`, no suponerlo.

---

## 7. Costo y riesgo

**Tamaño:** un módulo nuevo de unas 80 líneas, un método nuevo en `Actor`, doce sitios de consulta de una línea cada uno, dos imports de producción, cuatro archivos de prueba y una prueba de límites nueva. Es un cambio ancho y poco profundo.

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
