-- CreateEnum
CREATE TYPE "MediaSection" AS ENUM ('GALLERY', 'FILES');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'FILE');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "photoMediaId" TEXT;

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL,
    "fileId" INTEGER NOT NULL,
    "section" "MediaSection" NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "etag" TEXT NOT NULL,
    "modifiedAt" TIMESTAMP(3) NOT NULL,
    "hasPreview" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaItem_fileId_key" ON "MediaItem"("fileId");

-- CreateIndex
CREATE INDEX "MediaItem_section_order_idx" ON "MediaItem"("section", "order");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_photoMediaId_fkey" FOREIGN KEY ("photoMediaId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
