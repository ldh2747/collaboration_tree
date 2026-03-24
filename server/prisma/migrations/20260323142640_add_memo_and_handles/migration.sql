-- AlterTable
ALTER TABLE "Edge" ADD COLUMN     "sourceHandle" TEXT,
ADD COLUMN     "targetHandle" TEXT;

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "memo" TEXT;
