-- Cada envio es un hecho, no un campo que se pisa.
--
-- Hasta aca "cuando salio" y "por donde" eran dos columnas de quotes, y
-- reenviar borraba el envio anterior. Reenviar es normal: el cliente lo
-- perdio, se manda tambien por correo, se reenvia despues de una llamada. Un
-- presupuesto que hubo que mandar tres veces dice algo sobre esa negociacion
-- que un unico sent_at pisado no dice.
--
-- quotes.sent_at y quotes.sent_via se quedan, y pasan a significar el PRIMER
-- envio, que es el que define desde cuando se espera respuesta. No se tocan al
-- reenviar.
--
-- El canal si tiene restriccion en la base, a diferencia del estado del
-- presupuesto: esta tabla es del dominio comercial, asi que enumerar sus
-- valores no obliga a enumerar los de los otros veintinueve tipos de entidad.
-- Es el contraste con DT-007.
--
-- Reversion: 0005_envios.down.sql
CREATE TABLE "quote_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"via" text NOT NULL,
	"sent_by" uuid,
	CONSTRAINT "quote_deliveries_via_valid" CHECK ("quote_deliveries"."via" in ('whatsapp','correo','mano'))
);
--> statement-breakpoint
ALTER TABLE "quote_deliveries" ADD CONSTRAINT "quote_deliveries_quote_id_quotes_entity_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_deliveries" ADD CONSTRAINT "quote_deliveries_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_deliveries_quote_idx" ON "quote_deliveries" USING btree ("quote_id","sent_at");--> statement-breakpoint
-- Los presupuestos ya enviados tienen un envio: el que registran sus propias
-- columnas. Sin esto, la historia arrancaria vacia para todo lo anterior y la
-- pantalla mostraria "nunca se envio" sobre un presupuesto enviado.
--
-- sent_via puede estar en nulo en filas viejas; esas se registran como 'mano',
-- que es el canal que significa "se entrego sin dejar rastro digital" y es lo
-- mas honesto que se puede afirmar de un dato que no se guardo.
INSERT INTO "quote_deliveries" ("quote_id", "sent_at", "via", "sent_by")
SELECT "entity_id", "sent_at", coalesce("sent_via", 'mano'), "owner_id"
FROM "quotes"
WHERE "sent_at" is not null;
