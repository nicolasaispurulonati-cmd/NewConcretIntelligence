# 10. Registro de decisiones

Decisiones de arquitectura y de producto de NewConcret Intelligence, en orden cronológico.

**Ninguna entrada se borra ni se edita para cambiar lo que dice.** Si una decisión se revierte, se agrega una entrada nueva que la supersede y la anterior se marca como tal. El valor del registro está en poder leer por qué se decidió algo cuando ya nadie se acuerda, incluso —sobre todo— cuando la decisión resultó equivocada.

---

## D-001 · Tango es la fuente de verdad de stock, precios y contabilidad

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** Tango es dueño del stock, de los precios y de la contabilidad. NCI nunca escribe en Tango y nunca es dueño de un dato que Tango ya posee: lo lee, lo muestra con su fecha, y lo deja envejecer a la vista. NCI es dueño de la relación comercial —oportunidades, presupuestos, conversaciones, trazabilidad— que Tango no modela.

**Motivo:** integrar antes que reemplazar. La alternativa descartada era que NCI llevara su propio stock y su propia lista de precios y los sincronizara con Tango. Eso produce dos fuentes de verdad y, con el tiempo, dos verdades distintas: el momento en que difieren nadie lo detecta, y la plataforma pasa a ser el sistema en el que no se puede confiar.

**Consecuencias:** habilita que NCI crezca sin pedirle permiso al sistema contable y sin poder romperlo. Cierra la posibilidad de corregir en NCI un dato equivocado de Tango: si el stock físico no coincide, NCI sólo puede mostrarlo con su fecha. Revertirla implica asumir la sincronización bidireccional completa, que es el problema que esta decisión existe para no tener.

**Evidencia:** no hay una sola línea de código de integración; la decisión vive hoy en `docs/08-technical-architecture.md:175-194` y en `.env.example:126-129`. Lo único ya comprometido en el código es el vocabulario: `activity.source` admite `'integration'` (`packages/db/src/schema/graph.ts:179`), igual que la auditoría (`packages/core/src/audit.ts:70`), y la interfaz distingue visualmente un evento que llegó de una integración (`apps/web/src/app/e/[type]/[slug]/page.tsx:113`).

---

## D-002 · El motor de IA no puede alcanzar la base de datos

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** `@nci/ai` accede a datos únicamente a través de `@nci/core`, con un `Scope` que lleva el `Actor` adentro. No declara ni puede declarar la base, el ORM ni el driver. La regla no es una convención de equipo: es una restricción que rompe el build.

**Motivo:** la promesa central del producto es que la IA nunca ve lo que la persona no podría ver. Sostener eso con una instrucción en el prompt o con disciplina del equipo es sostenerlo hasta el primer sprint con fecha encima. La alternativa descartada era filtrar el contexto después de recuperarlo: funciona hasta que alguien agrega una consulta que se olvida del filtro, y ese olvido no se ve en ninguna revisión.

**Consecuencias:** habilita que cualquier cambio en el modelo de permisos lo herede la IA sin configuración aparte. Cuesta que el motor de IA no pueda optimizar sus propias consultas ni acceder a datos agregados que `@nci/core` no exponga. Revertirla es barato en código y caro en garantía: se pierde lo único que hace verificable la promesa.

**Mecanismo de garantía, en tres capas:**

| Capa | Dónde |
|---|---|
| El paquete no declara la base, el ORM ni el driver | `packages/ai/package.json:20-24`, verificado en `packages/ai/src/boundaries.test.ts:70-83` |
| Ningún archivo de producción los importa | `packages/ai/src/boundaries.test.ts:85-99` |
| Sin capacidad, el rechazo ocurre antes de cualquier consulta | `packages/ai/src/boundaries.test.ts:159-171`, con un doble de base que lanza si alguien la toca |

**Evidencia:** `packages/ai/src/retrieval.ts:11-16` importa `getEntityUniverse`, `search` y `Scope` de `@nci/core` y nada más. El `Scope` es el único objeto con el que se opera sobre datos (`packages/core/src/authorization/resolve.ts:85-90`).

---

## D-003 · Un presupuesto tiene una sola moneda

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** la moneda es un atributo del presupuesto, no del renglón. Un presupuesto no puede mezclar monedas. La conversión entre monedas no es responsabilidad de NCI: si hace falta, la resuelve Tango, que es dueño de los precios por D-001. NCI no tiene ni va a tener tabla de tipo de cambio.

**Motivo:** hasta hoy esto era cierto por omisión —`quote_items` no tiene columna `currency` y `LineInput` no tiene el campo—, y lo que es cierto por omisión se pierde el día que alguien agrega la columna creyendo que suma flexibilidad. La alternativa descartada era permitir moneda por renglón y convertir al totalizar: exige un tipo de cambio con su fecha, y un presupuesto es una promesa fechada, no un cálculo que se recalcula. Reimplementar un motor de cambio dentro de NCI contradice D-001.

**Consecuencias:** habilita que cualquier total de un presupuesto sea sumable sin preguntarse nada. Cierra la cotización mixta: un cliente que quiere una máquina en dólares y consumibles en pesos recibe dos presupuestos. Cuesta, si se revierte, agregar tipo de cambio con fecha a cada renglón y rehacer toda la aritmética de `money.ts`.

**Consecuencia inmediata ya aplicada:** ningún indicador suma monedas distintas. `openQuoteTotals` agrupa por moneda y devuelve una fila por cada una (`packages/sales/src/quotes.ts:537-566`); la presentación las muestra por separado cuando hay más de una (`apps/web/src/lib/workspace.ts:250`).

**Evidencia:** `packages/db/src/schema/sales.ts:64` (la moneda vive en `quotes`), `packages/db/src/schema/sales.ts:118-161` (`quote_items` no la tiene), `packages/sales/src/money.ts:27-35` (`LineInput` tampoco).

---

## D-004 · Autorización: capacidad amplia, vista angosta

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** los permisos de lectura son amplios y se otorgan por capacidad. La propiedad de un registro determina con qué se abre una pantalla por defecto, no qué puede leer una persona. Son dos conceptos distintos y no pueden convivir dentro de la misma consulta. La política vigente es transparencia total en lectura: los vendedores se ven entre sí.

**Motivo:** con tres vendedores, el aislamiento genera más fricción que protección y contradice que el conocimiento pertenece a la empresa. Pero un vendedor que abre su escritorio quiere ver su cartera, no las ochocientas de la empresa. La alternativa descartada era resolver las dos cosas con un filtro en la consulta, que es lo que había: parece aislamiento, no lo es —la misma información aparece por búsqueda o por URL— y confunde a quien lee el código sobre cuál es la regla real.

**Consecuencias:** habilita cambiar la política sin tocar consultas, y habilita casos que no tienen nada que ver con vendedores: un cliente que ve su historial, un alumno de Academy que ve sus cursos. Cuesta que el motor tenga que aprender a filtrar por fila aunque hoy la política no lo use. Revertirla hacia aislamiento real es una decisión de política, no de código, si el alcance por fila está construido.

**Condición que la revisaría:** si el esquema de comisiones hace competir a los vendedores de frente. Es una pregunta abierta del relevamiento comercial.

**Evidencia:** la decisión de lectura combina capacidad y clasificación, nunca propiedad (`packages/core/src/authorization/actor.ts:89-97`). El único filtro por dueño del sistema está en `apps/web/src/lib/workspace.ts:67`, y `search()` (`packages/core/src/search.ts:109-122`) y `getEntityBySlug()` (`packages/core/src/graph/entities.ts:137-149`) devuelven los registros de cualquiera al mismo usuario. `openQuoteTotals` toma el dueño como parámetro de vista y no como condición de permiso (`packages/sales/src/quotes.ts:537-540`).

---

## D-005 · La unidad física serializada entra al modelo, y entra antes que Products

**Fecha:** 2026-08-05 · **Estado:** vigente · **No implementada en esta sesión**

**Decisión:** el modelo de dominio incorpora un tipo de entidad para la unidad física individual —la máquina con número de serie que está en poder de un cliente— y lo hace antes de construir el dominio Products.

**Motivo:** la ausencia del tipo ya está produciendo relaciones equivocadas. `covers` va hoy de `warranty` a `product`, `variant` o `sale`: la garantía cubre un artículo de catálogo en lugar del equipo entregado. Eso no es un descuido, es lo único que se podía escribir con los tipos disponibles, y cada dominio nuevo construido sobre este modelo va a generar su propio `covers`. La alternativa descartada era construir Products primero y agregar la unidad después, que implica rehacer Products.

**Consecuencias:** habilita el parque instalado, la reposición proactiva y la garantía real. Cuesta postergar Products. Dos restricciones que el diseño debe respetar:

- **Historia de titularidad, no un `customer_id`.** Si NewConcret revende equipos usados o toma máquinas en parte de pago, aunque sea ocasionalmente, la unidad necesita historia de dueños. Es barato ahora e imposible después.
- **Reconstruible hacia atrás.** Buena parte del parque instalado ya existe, latente, en el historial de ventas de Tango. Si la entidad se diseña asumiendo carga manual de acá en adelante, arranca vacía y la reposición proactiva no sirve hasta dentro de un año. Tiene que admitir unidades inferidas del historial, con su certeza y su origen marcados.

La modelización de ciclos de consumo queda fuera: para eso hace falta el export de ventas de 24 meses. Se define la entidad, su ciclo de vida y sus relaciones; los consumos se agregan cuando lleguen los datos.

**Evidencia:** `packages/domain/src/relations.ts:196` (`covers` apunta al catálogo). Ninguno de los 30 tipos de entidad representa una unidad serializada (`packages/domain/src/entity-types.ts:13-54`), y ninguna de las 19 tablas tiene columna de número de serie.

---

## D-006 · El `Actor` es la única vía de acceso a entidades

**Fecha:** 2026-08-05 · **Estado:** propuesta, pendiente de aprobación

**Decisión propuesta:** que sea imposible de compilar una consulta sobre entidades que se saltee la clasificación del dato o el alcance por fila. Hoy la autorización es opcional en el punto de uso: el `Actor` devuelve listas y cada sitio decide aplicarlas.

**Motivo:** una consulta nueva que omita el filtro compila, corre y devuelve datos financieros a quien no debería verlos. El precedente existe en el repositorio: `@nci/ai` no puede importar la base ni queriendo, y una prueba lo garantiza (D-002). Se busca el mismo nivel de garantía. La alternativa descartada es la revisión de código: funciona hasta que no.

**Consecuencias:** por definir en la propuesta. Se registra ahora para que quede constancia de que el problema está identificado y de que su solución todavía no está aprobada.

**Evidencia:** `packages/core/src/authorization/actor.ts:127-137` devuelve listas; los cuatro sitios que las aplican a mano son `packages/core/src/search.ts:111-112`, `packages/core/src/graph/relations.ts:173`, `packages/core/src/graph/universe.ts:177` y `packages/core/src/graph/entities.ts:259`. Diseño en `docs/11-propuesta-acceso-entidades.md`.

---

## D-007 · Procedencia en los nodos, con el vocabulario de las aristas

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** `entities` incorpora `source` y `confidence`, con el mismo vocabulario y la misma semántica que ya tenía `entity_relations`. `confidence` pasa de `text` a `numeric(3,2)` en las dos tablas, con rango validado en la base: nulo, o entre 0 y 1.

**Motivo:** las aristas sabían decir quién las afirmó y con cuánta certeza; los nodos no. Un nodo inferido —una máquina deducida del historial de ventas de Tango, que es lo que exige D-005— sólo podía declararlo enterrándolo en `data`, que es JSONB sin tipar ni validar. La alternativa descartada era exactamente esa: dejarlo en `data` y que cada dominio invente su clave.

Sobre el tipo de `confidence`, se descartaron dos:

| Alternativa | Por qué no |
|---|---|
| Seguir en `text` | Admitía `"alta"`, `"0,8"` o `"-3"` sin quejarse, y ordenar por certeza daba un orden alfabético: `"0.9"` antes que `"0.85"` |
| Entero de 0 a 100 | Exacto y barato, pero cambia el significado de todo valor ya escrito y del comentario que documenta el campo, a cambio de nada |

`numeric(3,2)` mantiene la semántica documentada de 0 a 1, es exacto —sin la deriva del punto flotante, que el proyecto ya rechazó para el dinero— y no cambia el camino de lectura: `getRelated` ya convertía con `Number()`.

**Consecuencias:** habilita cargar parque instalado inferido del historial sin perder de vista que es inferido. Cuesta una migración que cambia el tipo de una columna existente. Revertirla borra `entities.source` por completo: todo nodo inferido vuelve a ser indistinguible de uno afirmado por una persona, y eso no se recupera.

**Decisiones tomadas al implementarlo, que este registro deja asentadas:**

- **Las columnas se conectaron al código, no sólo al esquema.** `CreateEntityInput` acepta `source` y `confidence`, y `EntityNode` los expone. Una columna que ningún código puede escribir es exactamente el campo decorativo que D-003 existe para no tener.
- **La reversión vive en un archivo aparte**, `0002_procedencia.down.sql`, que el migrador no ejecuta —el journal no lo lista— y que se aplica a mano. Drizzle no genera migraciones de bajada y no había convención previa; el archivo documenta también qué no se recupera al revertir.
- **El valor por defecto es `user`.** Lo que existía antes de la migración lo creó una persona.
- **Las pruebas de `@nci/core` corren de a un archivo por vez.** Al agregar un segundo archivo de integración, los dos empezaron a competir por el único cliente que atiende la base embebida de desarrollo, y uno se salteaba sin avisar: `node --test` corre los archivos en paralelo. Con `--test-concurrency=1` el resultado es el mismo en todas las corridas. Contra un PostgreSQL real la concurrencia no molesta, pero una prueba que a veces no corre no es una prueba.

**Tensión conocida, sin resolver:** `activity.source` admite un cuarto valor, `'integration'`, que ni las aristas ni ahora los nodos aceptan. Un nodo inferido por el puente de Tango tendría que declararse como `'system'` o forzar la ampliación del vocabulario en las tres tablas. Se deja anotado porque el diseño de D-005 va a tener que decidirlo.

**Evidencia:** `packages/db/src/schema/graph.ts` (columnas y restricciones), `packages/db/migrations/0002_procedencia.sql`, `packages/core/src/graph/entities.ts`. Pruebas en `packages/core/src/graph/provenance.integration.test.ts`, que escriben SQL directo para verificar que la base rechaza el dato aunque nadie valide antes.

---

## D-008 · Un indicador se calcula en el dominio, nunca en el widget

**Fecha:** 2026-08-05 · **Estado:** vigente

**Decisión:** todo agregado que se muestre como indicador se calcula en la base, sobre el conjunto completo, y vive en el paquete de dominio que lo entiende. Un widget puede listar y puede formatear; no puede derivar un número de las filas que muestra. Cuando un agregado incluye dinero, se agrupa por moneda y las monedas nunca se combinan.

**Motivo:** el widget de presupuestos sumaba los importes de las seis filas que alcanzaba a listar y presentaba el resultado como "Comprometido en presupuestos abiertos". El error era silencioso y no dependía de ninguna condición rara: alcanzaba con tener más de seis presupuestos abiertos. La alternativa —subir el límite de la lista— sólo mueve el umbral en el que el número empieza a mentir.

**Consecuencias:** habilita que el mismo agregado lo consuman la interfaz, la IA y un informe sin recalcularlo de tres maneras. Cuesta una consulta más por indicador. Como efecto lateral buscado, el agregado queda donde hay pruebas de integración contra base real, que es donde este tipo de defecto se detecta.

**Decisiones menores tomadas al implementarlo, que este registro deja asentadas:**

- El agregado se ubicó en `@nci/sales` y no en `apps/web`, porque "cuánto tengo comprometido" es una pregunta del dominio comercial y no de la presentación.
- Con más de una moneda, el rótulo pasa a "Comprometido en presupuestos abiertos, por moneda" y los importes se muestran separados por `·`. Se descartó mostrar un único número convertido, que exigiría un tipo de cambio inexistente, y también mostrar sólo la moneda principal, que oculta el resto.
- El límite de filas de los widgets pasó a la constante `LISTA_MAXIMA`, para que se lea como lo que es: un límite de presentación del que ningún cálculo puede depender.

**Evidencia:** `packages/sales/src/quotes.ts:512-566`, `apps/web/src/lib/workspace.ts:50-71` y `apps/web/src/lib/workspace.ts:244-266`. Pruebas en `packages/sales/src/quotes.integration.test.ts`, para conjunto mayor al límite de la lista y para más de una moneda.

---

## Cómo se agrega una entrada

Se numera con el siguiente `D-00N` disponible, se agrega al final, y no se toca ninguna de las anteriores salvo para marcarlas como supersedidas por la nueva.
