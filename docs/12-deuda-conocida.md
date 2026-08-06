# 12. Deuda conocida

Lo que sabemos que está mal, decidimos no arreglar todavía, y por qué.

Existe porque `opportunities.currency` apareció como hallazgo lateral en tres auditorías seguidas. El hallazgo era correcto las tres veces y la decisión de no tocarlo también, pero no había dónde escribir "esto ya lo sabemos", así que cada revisión lo redescubría y gastaba atención en algo resuelto.

**Una deuda registrada acá deja de reportarse como hallazgo.** Si vuelve a aparecer en una auditoría, es porque cambió la condición que la destrababa — y eso sí es información nueva.

---

## DT-001 · `opportunities.currency` no la lee nadie

**Detectado:** 2026-08-05, en `docs/00-auditoria-linea-base.md` y en la sesión que hizo explícita la moneda única.

**Qué es:** la columna `currency` de la tabla `opportunities` (`packages/db/src/schema/crm.ts`) no la consulta ningún código. Es un campo que promete un comportamiento que no existe, que es exactamente lo que D-003 declara peor que su ausencia.

**Por qué se pospone:** no es la columna la que está sin usar, es la tabla entera. `opportunities` no la lee ni la escribe nadie: el dominio CRM tiene esquema y no tiene servicio. Sacar una columna de una tabla inerte sería arbitrario — el criterio que la condena condena también a las otras seis.

**Cuándo se resuelve:** cuando se construya el servicio del dominio Comercial y la tabla tenga lectores. Ahí se decide, con uso real a la vista, qué campos se quedan.

**Estado:** abierta

---

## DT-002 · `notifications.important` y la línea de tiempo truncan sin avisar

**Detectado:** 2026-08-06, en la sesión que hizo que `crm.follow_ups` declarara su truncamiento.

**Qué es:** el widget de notificaciones (`apps/web/src/lib/workspace.ts`) muestra hasta seis y la línea de tiempo de una entidad hasta veinticinco (`packages/core/src/graph/universe.ts`). Ninguno de los dos dice que hay más.

**Por qué se pospone:** nadie decide nada mirándolos. Son superficies de conciencia, no de decisión: el costo de no ver la séptima notificación es enterarse más tarde, no actuar sobre una creencia falsa. Y un aviso permanente que nunca importa entrena a ignorar los que sí importan, así que ponerlo en todos lados es peor que ponerlo donde hace falta.

**Cuándo se resuelve:** si alguna de las dos pasa a alimentar una decisión — una bandeja que haya que vaciar, una auditoría que se lea como completa. El mecanismo ya existe: `WidgetRenderable.truncatedCount` y el componente que lo dibuja, los dos usados por `crm.follow_ups`. Es conectarlo, no construirlo.

**Estado:** abierta

---

## DT-003 · `getRelated` filtra por tipo pero no por clasificación

**Detectado:** 2026-08-05, en `docs/11-propuesta-acceso-entidades.md`.

**Qué es:** `getRelated` (`packages/core/src/graph/relations.ts`) acota los vecinos a los tipos de entidad que la persona puede leer, pero no aplica el filtro de clasificación del dato. `search` sí aplica los dos. Son dos criterios de autorización y sólo uno se usa acá.

**Por qué se pospone:** hoy no produce una fuga observable, porque `createEntity` copia la clasificación del tipo en la fila y nada la modifica después: el filtro de tipo alcanza para excluir lo mismo. Arreglarlo suelto significaría escribir el filtro en un sitio más, cuando el diseño ya decidido lo va a centralizar.

**Cuándo se resuelve:** en el paso 2 de la migración de `docs/11-propuesta-acceso-entidades.md`, donde `getRelated` pasa a leer del conjunto autorizado y hereda los dos filtros de una vez.

**Estado:** abierta

---

## DT-004 · `truncatedCount` se calcula sobre un conjunto sin filtrar por clasificación

**Detectado:** 2026-08-06, al separar el truncamiento de lo restringido.

**Qué es:** `truncatedCount` (`packages/core/src/graph/universe.ts`) es la diferencia entre los vecinos visibles y los devueltos, y "visibles" hereda el filtro incompleto de DT-003. **El número mismo informa algo.** Decir "hay 340 más que sí podés consultar" cuando doscientos de esos están por encima del nivel de acceso de quien pregunta le revela que existen — que es precisamente lo que `restrictedCount` existe para no hacer, y por la puerta de al lado.

Llega también al asistente: `renderContext` (`packages/ai/src/retrieval.ts`) le pide al modelo declarar ese número en la respuesta, así que la cifra sale por escrito.

**Por qué se pospone:** es la misma causa que DT-003 y no tiene arreglo propio. Poner el filtro sólo acá dejaría los dos conteos calculados sobre conjuntos distintos, que es la clase de inconsistencia que originó todo este trabajo.

**Cuándo se resuelve:** con DT-003, en el paso 2 de `docs/11`. **No se da por cerrado ese paso sin verificar que `truncatedCount` quedó calculado sobre el conjunto ya filtrado por clasificación.** Queda anotado como dependencia explícita en ese documento.

**Estado:** abierta

---

## DT-005 · El catálogo son datos ficticios

**Detectado:** 2026-08-06, al construir el puerto de catálogo (D-012).

**Qué es:** los productos, precios, listas y stock que devuelve el catálogo salen de `packages/catalog/src/seed.ts` y **ninguno es real**. Los quince artículos son representativos de las cinco líneas del negocio y los importes son plausibles en su orden de magnitud, nada más: no salieron de ninguna lista de NewConcret. Las dos listas de precios —general y distribuidor— existen para que el mecanismo de "el precio que le corresponde a este cliente" esté probado, no porque ésas sean las listas reales.

**Por qué se pospone:** Tango es la fuente de verdad (D-001) y todavía no se sabe dónde corre. Esperar esa respuesta bloquearía el camino de escritura entero, que es lo único que separa al sistema de tener un usuario.

**Cuándo se resuelve:** cuando exista el puente con Tango. Es reemplazar el adaptador detrás del puerto: por D-012, ninguna capa superior se entera. Concretamente, `getCatalog()` en `packages/catalog/src/index.ts` devuelve otro objeto y nada más cambia.

**Lo que hay que revisar al reemplazarlo, y que no es obvio:** el puerto asume una lista de precios por nombre y un precio por artículo y lista. Si Tango modela descuentos por volumen, por cliente o por línea de producto —pregunta 0.1.7 del relevamiento comercial, todavía sin responder—, el puerto se queda corto y hay que ampliarlo antes de conectar, no después.

**Estado:** abierta

---

## DT-006 · La política de identidad es una sola para los treinta tipos de entidad

**Detectado:** 2026-08-06, al desambiguar el identificador de clientes homónimos (D-014).

**Qué es:** `createEntity` (`packages/core/src/graph/entities.ts`) aplica la misma regla de identidad a los treinta tipos de entidad: el identificador legible es único dentro del tipo, y punto. D-014 decidió que cuando eso choca con un caso legítimo se desambigua numerando. **Pero no todos los tipos tienen el mismo caso legítimo.**

Dos clientes con el mismo nombre son normales: dos sucursales, dos razones sociales parecidas, el mismo nombre en dos ciudades. Dos productos con el mismo nombre probablemente sean un error de carga, y numerar el segundo en silencio lo deja entrar. La desambiguación automática, que en clientes evita un bloqueo injusto, en productos podría estar tapando exactamente lo que habría que avisar.

Si eso es así, la política de identidad no puede ser la misma para todos los tipos: tendría que ser una propiedad de cada tipo de entidad —desambiguar, rechazar, o preguntar— declarada donde hoy se declaran la clasificación y los nombres.

**Por qué se pospone:** hoy el único tipo que se crea desde una pantalla es `customer`. Decidir una política por tipo sin más de un caso real es diseñar contra una hipótesis. Y el segundo caso no llegó todavía: por D-005, la unidad física serializada entra al modelo antes que Products.

**Cuándo se resuelve:** al construir Products, que es el primer tipo donde el homónimo probablemente sea un error y no un hecho. Es el momento de decidirlo, con los dos casos a la vista. Antes de eso no hay con qué comparar.

**Lo que no hay que hacer mientras tanto:** resolverlo por dominio. Si Products inventa su propia desambiguación en vez de decidir la política general, el sistema queda con dos formas distintas de tratar el mismo conflicto y nadie las unifica después, porque cada una parece razonable en su lugar. Es el motivo por el que D-014 registró la distinción entre la restricción del grafo y la respuesta del dominio.

**Estado:** abierta

---

## Cuándo una cosa va acá y cuándo se arregla en el momento

Va acá lo que está mal, se entiende, y arreglarlo ahora costaría más que el daño que hace — porque depende de algo que todavía no existe, o porque el arreglo suelto contradice un diseño ya decidido. Se arregla en el momento lo que produce una creencia falsa en alguien que decide, lo que se puede corregir sin abrir otra discusión, y todo lo que sea una fuga de datos.
