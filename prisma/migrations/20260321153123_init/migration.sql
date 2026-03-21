-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STAROSTA', 'STUDENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "fullName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "groupId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "surveyStart" TEXT NOT NULL DEFAULT '07:00',
    "surveyEnd" TEXT NOT NULL DEFAULT '09:00',

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPresent" BOOLEAN NOT NULL,
    "reason" TEXT,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
