-- Reversión de 0002_procedencia.sql
--
-- Drizzle no ejecuta este archivo: no lo lista el journal y el migrador sólo
-- corre lo que el journal declara. Se aplica a mano, con psql o con el cliente
-- que se prefiera, y después hay que quitar la entrada 0002 de
-- migrations/meta/_journal.json para que el estado vuelva a ser coherente.
--
-- El orden es el inverso al de la migración. Las restricciones se quitan antes
-- que las columnas porque una restricción sobre una columna inexistente no es
-- un estado posible.
--
-- Advertencia sobre lo que no se recupera: al volver `confidence` a texto, los
-- valores sobreviven como su representación decimal ("0.80"), no como estaban
-- escritos antes de la migración. Y `entities.source` se pierde por completo:
-- todo nodo que se haya declarado inferido vuelve a ser indistinguible de uno
-- afirmado por una persona. Revertir después de haber cargado parque instalado
-- inferido borra justamente el dato que justificaba la migración.

ALTER TABLE "entity_relations" DROP CONSTRAINT IF EXISTS "entity_relations_confidence_valid";
ALTER TABLE "entities" DROP CONSTRAINT IF EXISTS "entities_confidence_valid";
ALTER TABLE "entities" DROP CONSTRAINT IF EXISTS "entities_source_valid";

ALTER TABLE "entities" DROP COLUMN IF EXISTS "confidence";
ALTER TABLE "entities" DROP COLUMN IF EXISTS "source";

ALTER TABLE "entity_relations" ALTER COLUMN "confidence" SET DATA TYPE text USING "confidence"::text;
