-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "creditAppliedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositPaidCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "center_settings" ADD COLUMN     "lastDailyJobAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "credit_ledger" ADD COLUMN     "remainingCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "clientRecordId" UUID,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastError" TEXT;

-- CreateIndex
CREATE INDEX "credit_ledger_clientRecordId_professionalId_idx" ON "credit_ledger"("clientRecordId", "professionalId");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_providerMessageId_key" ON "notifications"("providerMessageId");

-- CreateIndex
CREATE INDEX "notifications_status_scheduledFor_idx" ON "notifications"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "notifications_appointmentId_template_idx" ON "notifications"("appointmentId", "template");

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

