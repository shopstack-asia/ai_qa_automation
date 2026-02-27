-- Rename Ticket column: e2e_credential_role → primary_actor (field name: primaryActor)
ALTER TABLE "Ticket" RENAME COLUMN "e2e_credential_role" TO "primary_actor";
