-- Reversión de 0003_vocabulario_procedencia.sql
--
-- Drizzle no ejecuta este archivo: el journal no lo lista y el migrador sólo
-- corre lo que el journal declara. Se aplica a mano, y después hay que quitar
-- la entrada 0003 de migrations/meta/_journal.json.
--
-- Advertencia sobre lo que no se recupera: revertir devuelve el vocabulario a
-- tres valores, así que cualquier fila con procedencia `integration` viola la
-- restricción que se restaura. Las dos primeras sentencias existen para eso:
-- reasignan esas filas a `system`, que es lo más cercano que queda, y con eso
-- se pierde la distinción entre un dato que trajo un sistema externo y uno que
-- NCI afirmó por su cuenta. Junto con las columnas se pierde también de qué
-- sistema vino y cuándo se leyó.
--
-- Revertir después de haber importado parque instalado desde Tango borra
-- exactamente el dato que justificaba la migración.

UPDATE "entities" SET "source" = 'system' WHERE "source" = 'integration';
UPDATE "entity_relations" SET "source" = 'system' WHERE "source" = 'integration';
UPDATE "activity" SET "source" = 'system' WHERE "source" = 'integration';

ALTER TABLE "entities" DROP CONSTRAINT IF EXISTS "entities_external_origin";
ALTER TABLE "entity_relations" DROP CONSTRAINT IF EXISTS "entity_relations_external_origin";
ALTER TABLE "activity" DROP CONSTRAINT IF EXISTS "activity_external_origin";

ALTER TABLE "entities" DROP COLUMN IF EXISTS "source_system";
ALTER TABLE "entities" DROP COLUMN IF EXISTS "source_read_at";
ALTER TABLE "entity_relations" DROP COLUMN IF EXISTS "source_system";
ALTER TABLE "entity_relations" DROP COLUMN IF EXISTS "source_read_at";
ALTER TABLE "activity" DROP COLUMN IF EXISTS "source_system";
ALTER TABLE "activity" DROP COLUMN IF EXISTS "source_read_at";

-- activity no tenía restricción antes de 0003: se quita y no se restaura.
ALTER TABLE "activity" DROP CONSTRAINT IF EXISTS "activity_source_valid";

ALTER TABLE "entities" DROP CONSTRAINT IF EXISTS "entities_source_valid";
ALTER TABLE "entities" ADD CONSTRAINT "entities_source_valid"
  CHECK ("source" in ('user','system','ai'));

ALTER TABLE "entity_relations" DROP CONSTRAINT IF EXISTS "entity_relations_source_valid";
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_source_valid"
  CHECK ("source" in ('user','system','ai'));
