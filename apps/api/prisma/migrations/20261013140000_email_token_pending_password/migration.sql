-- Cada enlace de verificación lleva la contraseña elegida en ese registro.
ALTER TABLE "email_tokens" ADD COLUMN "pendingPasswordHash" TEXT;
