ALTER TABLE "oauth_accounts" ADD COLUMN "refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD COLUMN "revoke_client_id" text;