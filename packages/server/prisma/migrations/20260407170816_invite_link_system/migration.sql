/*
  Warnings:

  - The primary key for the `Invite` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `targetRoom` on the `Invite` table. All the data in the column will be lost.
  - You are about to drop the column `usedAt` on the `Invite` table. All the data in the column will be lost.
  - Added the required column `roomId` to the `Invite` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Invite_targetRoom_idx";

-- AlterTable
ALTER TABLE "Invite" DROP CONSTRAINT "Invite_pkey",
DROP COLUMN "targetRoom",
DROP COLUMN "usedAt",
ADD COLUMN     "roomId" UUID NOT NULL,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "expiresAt" DROP NOT NULL,
ADD CONSTRAINT "Invite_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "Invite_roomId_idx" ON "Invite"("roomId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
