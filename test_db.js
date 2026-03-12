import {prisma} from "./prisma/prisma.js";

async function main() {
    // Создаем тестового пользователя
    const user = await prisma.user.create({
        data: {
            id: 1296360513,
            firstName: "Даниэль",
            lastName: "Изтелеуев",
            groupName: "3-ИСП9-42",
            role: "Староста",
            step: "REGISTERED",
            registrationDate: new Date("2026-03-02T19:04:25.357Z")
        },
    });
    console.log('✅ Пользователь создан:', user);

    // Читаем всех пользователей из базы
    const allUsers = await prisma.user.findMany();
    console.log('📋 Список пользователей:', allUsers);


    const LUTIID = 1296360513

    async function getStudentPrisma(id) {
        return prisma.user.findFirst({where: {id: id}});
    }

    const userluti = getStudentPrisma(LUTIID);

    console.log(`Пользователь с id ${LUTIID} = ${userluti.firstName}`);
}

main()
    .then(async () => await prisma.$disconnect())
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });