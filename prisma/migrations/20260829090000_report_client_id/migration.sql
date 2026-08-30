
-- AlterTable
ALTER TABLE "FloodReport" ADD COLUMN     "clientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FloodReport_authorId_clientId_key" ON "FloodReport"("authorId", "clientId");

