-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RESIDENT', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "WaterLevel" AS ENUM ('ANKLE', 'KNEE', 'CAR_DEEP', 'IMPASSABLE');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FLOOD_WARNING', 'EVACUATION_ORDER', 'ROAD_CLOSURE', 'GENERAL');

-- CreateEnum
CREATE TYPE "AlertScope" AS ENUM ('PROVINCE', 'AREAS');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('SHELTER', 'EVACUATION_POINT', 'HIGH_GROUND');

-- CreateEnum
CREATE TYPE "AlarmLevel" AS ENUM ('NORMAL', 'FIRST', 'SECOND', 'THIRD');

-- CreateEnum
CREATE TYPE "GaugeTrend" AS ENUM ('RISING', 'STEADY', 'FALLING');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "Lgu" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isCity" BOOLEAN NOT NULL DEFAULT false,
    "registeredResidents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lgu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RESIDENT',
    "organisation" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "lguId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloodReport" (
    "id" TEXT NOT NULL,
    "lguId" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "description" TEXT,
    "descriptionTl" TEXT,
    "waterLevel" "WaterLevel" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "photoUrl" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FloodReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleTl" TEXT,
    "message" TEXT NOT NULL,
    "messageTl" TEXT,
    "type" "AlertType" NOT NULL,
    "priority" "AlertPriority" NOT NULL,
    "scope" "AlertScope" NOT NULL DEFAULT 'PROVINCE',
    "sentBy" TEXT NOT NULL,
    "authorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertArea" (
    "alertId" TEXT NOT NULL,
    "lguId" TEXT NOT NULL,

    CONSTRAINT "AlertArea_pkey" PRIMARY KEY ("alertId","lguId")
);

-- CreateTable
CREATE TABLE "AlertDismissal" (
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDismissal_pkey" PRIMARY KEY ("alertId","userId")
);

-- CreateTable
CREATE TABLE "SafeZone" (
    "id" TEXT NOT NULL,
    "lguId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER,
    "occupancy" INTEGER NOT NULL DEFAULT 0,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SafeZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiverGauge" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "lguId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "readingMetres" DOUBLE PRECISION NOT NULL,
    "alarmLevel" "AlarmLevel" NOT NULL DEFAULT 'NORMAL',
    "trend" "GaugeTrend" NOT NULL DEFAULT 'STEADY',
    "deltaPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiverGauge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GaugeReading" (
    "id" TEXT NOT NULL,
    "gaugeId" TEXT NOT NULL,
    "readingMetres" DOUBLE PRECISION NOT NULL,
    "alarmLevel" "AlarmLevel" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GaugeReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvacuationRoute" (
    "id" TEXT NOT NULL,
    "lguId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EvacuationRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lgu_slug_key" ON "Lgu"("slug");

-- CreateIndex
CREATE INDEX "Lgu_name_idx" ON "Lgu"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_lguId_idx" ON "User"("lguId");

-- CreateIndex
CREATE INDEX "FloodReport_lguId_createdAt_idx" ON "FloodReport"("lguId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FloodReport_createdAt_idx" ON "FloodReport"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "FloodReport_deletedAt_idx" ON "FloodReport"("deletedAt");

-- CreateIndex
CREATE INDEX "FloodReport_authorId_idx" ON "FloodReport"("authorId");

-- CreateIndex
CREATE INDEX "ReportVote_userId_idx" ON "ReportVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVote_reportId_userId_key" ON "ReportVote"("reportId", "userId");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_active_idx" ON "Alert"("active");

-- CreateIndex
CREATE INDEX "AlertArea_lguId_idx" ON "AlertArea"("lguId");

-- CreateIndex
CREATE INDEX "AlertDismissal_userId_idx" ON "AlertDismissal"("userId");

-- CreateIndex
CREATE INDEX "SafeZone_lguId_idx" ON "SafeZone"("lguId");

-- CreateIndex
CREATE INDEX "SafeZone_deletedAt_idx" ON "SafeZone"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiverGauge_code_key" ON "RiverGauge"("code");

-- CreateIndex
CREATE INDEX "RiverGauge_lguId_idx" ON "RiverGauge"("lguId");

-- CreateIndex
CREATE INDEX "GaugeReading_gaugeId_observedAt_idx" ON "GaugeReading"("gaugeId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "EvacuationRoute_lguId_idx" ON "EvacuationRoute"("lguId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloodReport" ADD CONSTRAINT "FloodReport_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloodReport" ADD CONSTRAINT "FloodReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloodReport" ADD CONSTRAINT "FloodReport_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVote" ADD CONSTRAINT "ReportVote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "FloodReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVote" ADD CONSTRAINT "ReportVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertArea" ADD CONSTRAINT "AlertArea_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertArea" ADD CONSTRAINT "AlertArea_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDismissal" ADD CONSTRAINT "AlertDismissal_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDismissal" ADD CONSTRAINT "AlertDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafeZone" ADD CONSTRAINT "SafeZone_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafeZone" ADD CONSTRAINT "SafeZone_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiverGauge" ADD CONSTRAINT "RiverGauge_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GaugeReading" ADD CONSTRAINT "GaugeReading_gaugeId_fkey" FOREIGN KEY ("gaugeId") REFERENCES "RiverGauge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvacuationRoute" ADD CONSTRAINT "EvacuationRoute_lguId_fkey" FOREIGN KEY ("lguId") REFERENCES "Lgu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvacuationRoute" ADD CONSTRAINT "EvacuationRoute_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
