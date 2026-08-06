-- Reversión de 0005_envios.sql
--
-- Drizzle no ejecuta este archivo: el journal no lo lista y el migrador sólo
-- corre lo que el journal declara. Se aplica a mano, y después hay que quitar
-- la entrada 0005 de migrations/meta/_journal.json.
--
-- Advertencia sobre lo que no se recupera: se pierde la historia de reenvíos.
-- `quotes.sent_at` y `quotes.sent_via` conservan el primer envío de cada
-- presupuesto, que es lo que el modelo anterior guardaba, así que revertir no
-- deja ningún presupuesto sin fecha. Lo que desaparece es el segundo envío en
-- adelante — que un presupuesto haya salido tres veces, y por qué canales.
--
-- Antes de revertir conviene mirar cuánto se está por perder:
--   select count(*) from quote_deliveries d
--     join quotes q on q.entity_id = d.quote_id
--    where d.sent_at > q.sent_at;

DROP TABLE IF EXISTS "quote_deliveries";
