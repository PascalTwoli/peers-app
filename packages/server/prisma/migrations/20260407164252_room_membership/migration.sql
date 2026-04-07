/*
  Warnings:

  - The primary key for the `RoomMember` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `joinedAt` on the `RoomMember` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `RoomMember` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,roomId]` on the table `RoomMember` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `RoomMember` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RoomMember" DROP CONSTRAINT "RoomMember_roomId_fkey";

-- DropIndex
DROP INDEX "RoomMember_username_roomId_key";

-- AlterTable
ALTER TABLE "RoomMember" DROP CONSTRAINT "RoomMember_pkey",
DROP COLUMN "joinedAt",
DROP COLUMN "username",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "userId" UUID NOT NULL,
ALTER COLUMN "roomId" SET DATA TYPE UUID USING "roomId"::UUID,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMember_userId_roomId_key" ON "RoomMember"("userId", "roomId");

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
