-- Reversión de 0004_emision.sql
--
-- Drizzle no ejecuta este archivo: el journal no lo lista y el migrador sólo
-- corre lo que el journal declara. Se aplica a mano, y después hay que quitar
-- la entrada 0004 de migrations/meta/_journal.json.
--
-- Advertencia sobre lo que no se recupera: los presupuestos que estén en
-- estado `emitido` quedan en un estado que el código revertido no conoce. La
-- primera sentencia los devuelve a `borrador`, que es lo más cercano y lo
-- menos dañino: un presupuesto emitido y no enviado nunca salió, así que
-- volver a poderlo editar no contradice nada que el cliente haya visto.
--
-- Lo que sí se pierde es la distinción entre cuándo se cerró el documento y
-- cuándo salió. En los presupuestos ya enviados las dos fechas se colapsan en
-- sent_at, que es exactamente el modelo anterior.

UPDATE "entities" SET "status" = 'borrador'
  WHERE "type" = 'quote' AND "status" = 'emitido';

ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_sent_requires_issued";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "issued_at";
