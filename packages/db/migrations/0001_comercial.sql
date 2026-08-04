CREATE TABLE "contacts" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"tax_id" text,
	"segment" text,
	"payment_terms_days" integer,
	"price_list" text,
	"credit_limit" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"province" text,
	CONSTRAINT "customers_payment_terms_valid" CHECK ("customers"."payment_terms_days" is null or "customers"."payment_terms_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"estimated_value" bigint,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"probability" integer,
	"expected_close_date" date,
	"source" text,
	"lost_reason" text,
	CONSTRAINT "opportunities_probability_valid" CHECK ("opportunities"."probability" is null or "opportunities"."probability" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"variant_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"unit_price" bigint NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '21' NOT NULL,
	"line_total" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "quote_items_quantity_positive" CHECK ("quote_items"."quantity" > 0),
	CONSTRAINT "quote_items_price_not_negative" CHECK ("quote_items"."unit_price" >= 0),
	CONSTRAINT "quote_items_discount_valid" CHECK ("quote_items"."discount_percent" >= 0 and "quote_items"."discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"entity_id" uuid PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"currency" text DEFAULT 'ARS' NOT NULL,
	"valid_until" date,
	"payment_terms_days" integer,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount_total" bigint DEFAULT 0 NOT NULL,
	"tax_total" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"sent_via" text,
	"responded_at" timestamp with time zone,
	"rejection_reason" text,
	"owner_id" uuid,
	CONSTRAINT "quotes_version_positive" CHECK ("quotes"."version" >= 1),
	CONSTRAINT "quotes_totals_not_negative" CHECK ("quotes"."subtotal" >= 0 and "quotes"."tax_total" >= 0 and "quotes"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_entity_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_variant_id_entities_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_tax_id_idx" ON "customers" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "customers_segment_idx" ON "customers" USING btree ("segment");--> statement-breakpoint
CREATE INDEX "opportunities_close_date_idx" ON "opportunities" USING btree ("expected_close_date");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id","position");--> statement-breakpoint
CREATE INDEX "quote_items_variant_idx" ON "quote_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_version_unique" ON "quotes" USING btree ("number","version");--> statement-breakpoint
CREATE INDEX "quotes_owner_idx" ON "quotes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "quotes_sent_idx" ON "quotes" USING btree ("sent_at");