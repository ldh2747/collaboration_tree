-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mindmap" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mindmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collaborator" (
    "mindmapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CollaboratorRole" NOT NULL DEFAULT 'VIEWER',

    CONSTRAINT "Collaborator_pkey" PRIMARY KEY ("mindmapId","userId")
);

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "style" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "style" JSONB,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "mindmapId" TEXT NOT NULL,
    "yjsState" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_nodeId_userId_key" ON "Reaction"("nodeId", "userId");

-- AddForeignKey
ALTER TABLE "Mindmap" ADD CONSTRAINT "Mindmap_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collaborator" ADD CONSTRAINT "Collaborator_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "Mindmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collaborator" ADD CONSTRAINT "Collaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "Mindmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "Mindmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_mindmapId_fkey" FOREIGN KEY ("mindmapId") REFERENCES "Mindmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
