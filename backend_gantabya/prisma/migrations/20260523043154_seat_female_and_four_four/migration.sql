/*
  Warnings:

  - You are about to drop the column `issuerType` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `ownerAdminId` on the `Offer` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "OfferCreatorRole" AS ENUM ('ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "HoldStatus" AS ENUM ('HELD', 'CONVERTED', 'EXPIRED', 'RELEASED');

-- AlterEnum
ALTER TYPE "LayoutType" ADD VALUE 'FOUR_FOUR';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'COD';

-- DropForeignKey
ALTER TABLE "public"."Offer" DROP CONSTRAINT "Offer_ownerAdminId_fkey";

-- DropIndex
DROP INDEX "public"."Booking_tripId_seatId_key";

-- DropIndex
DROP INDEX "public"."BookingGroup_boardingPointId_idx";

-- DropIndex
DROP INDEX "public"."BookingGroup_droppingPointId_idx";

-- DropIndex
DROP INDEX "public"."Offer_issuerType_idx";

-- DropIndex
DROP INDEX "public"."Offer_ownerAdminId_idx";

-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "issuerType",
DROP COLUMN "ownerAdminId",
ADD COLUMN     "creatorRole" "OfferCreatorRole" NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "isFemale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Stop" ADD COLUMN     "dayOffset" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "returnDayOffset" INTEGER NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "public"."OfferIssuer";

-- CreateTable
CREATE TABLE "SeatHold" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromStopIndex" INTEGER NOT NULL,
    "toStopIndex" INTEGER NOT NULL,
    "isReturnTrip" BOOLEAN NOT NULL DEFAULT false,
    "holdExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "HoldStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeatHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatHold_holdExpiresAt_idx" ON "SeatHold"("holdExpiresAt");

-- CreateIndex
CREATE INDEX "SeatHold_status_idx" ON "SeatHold"("status");

-- CreateIndex
CREATE INDEX "SeatHold_userId_tripId_idx" ON "SeatHold"("userId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatHold_tripId_seatId_fromStopIndex_toStopIndex_isReturnTr_key" ON "SeatHold"("tripId", "seatId", "fromStopIndex", "toStopIndex", "isReturnTrip");

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatHold" ADD CONSTRAINT "SeatHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
