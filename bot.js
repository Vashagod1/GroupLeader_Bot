require('dotenv').config();

const {Telegraf} = require("telegraf");
const bot = new Telegraf(process.env.BOT_TOKEN);
const {Markup} = require("telegraf");
const fs = require('fs');
const DATA_PATH = './students.json';

let students = [];
if (fs.existsSync(DATA_PATH)) {
    students = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

const save = () => fs.writeFileSync(DATA_PATH, JSON.stringify(students, null, 2));
const getStudent = (id) => students.find(s => s.id === id);
const normalizeGroup = (text) => text.trim().toUpperCase().replace(/\s+/g, '');
const normalizeName = (text) => {
    return text.trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(word =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
}
const isAuthorizedStarosta = (student) => {
    if (!student) return false;
    if (student.step !== "REGISTERED") return false;
    return student.role === "Староста";
}

const getGroupStudents = (groupName, onlyPresent = false) => {
    let result = students.filter(s =>
        s.group === groupName &&
        s.step === "REGISTERED"
    );

    if (onlyPresent) {
        result = result.filter(s => s.isPresent === true);
    }

    return result;
}

if (!process.env.BOT_TOKEN) {
    console.error('Ошибка: BOT_TOKEN не найден в .env файле');
    process.exit(1);
}

bot.start((ctx) => {
    const userId = ctx.from.id;
    let student = getStudent(ctx.from.id)

    if (!student) {
        students.push({
            id: userId,
            username: ctx.from.username,
            name: null,
            step: 'WAITING_FOR_NAME',
            group: null,
            role: null,
            isPresent: null,
            lastChecked: null
        });
        save();
        return ctx.reply("Привет! Я тебя запомнил, как тебя зовут?");
    }

    if (student.step === 'REGISTERED') {
        return ctx.reply(`Мы уже знакомы! Тебя зовут ${student.name} из группы ${student.group}`);
    } else {
        return ctx.reply(`Мы не закончили и остановились на этапе: ${student.step}.`);
    }
});

bot.command('list', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (!isAuthorizedStarosta(student)) {
        return ctx.reply("У тебя нету доступа");
    }

    const currentGroup = getGroupStudents(student.group)

    if (currentGroup.length === 0) return ctx.reply("Список пуст");

    const sorted = [...currentGroup].sort((a, b) => a.name.localeCompare(b.name));

    const presentCount = sorted.filter(s => s.isPresent === true).length;
    const abscentCount = sorted.filter(s => s.isPresent === false).length;
    const unknownCount = sorted.filter(s => s.isPresent === null).length;

    let text = `Список группы ${student.group}:\n`;
    text += `Присутствуют ${presentCount}\n`;
    text += `Отсутствуют ${abscentCount}\n`;
    text += `Пока не ответили ${unknownCount}\n`;
    text += `Всего студентов: ${sorted.length}\n\n`;
    text += "Список:\n";

    sorted.forEach((s, index) => {
        let statusIcon = s.isPresent === true ? "✅" : (s.isPresent === false ? "❌" : "⏳");
        text += `${index + 1}. ${s.name} ${statusIcon}\n`;
    });

    ctx.replyWithMarkdown(text);
});

bot.command('check', (ctx) => {
    const student = getStudent(ctx.from.id);

    if (!isAuthorizedStarosta(student)) {
        return ctx.reply("У тебя нету доступа");
    }
    const currentGroup = getGroupStudents(student.group);

    if (currentGroup.length === 0) return ctx.reply("В списке никого нету...");

    currentGroup.forEach(member => {
        member.isPresent = null;
        if (member.id && member.step === 'REGISTERED') {
            bot.telegram.sendMessage(member.id, `${member.name} ты придёшь на пару?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('Я тут!', 'im_here'),
                    Markup.button.callback('Я не приду', 'not_here')
                ])
            ).catch(err => {
                console.log(`Не удалось отправить сообщение студенту ${member.name}: Чат не найден.`)
            })
        }
    });
    save();
    ctx.reply(`Запрос отправлен ${currentGroup.length} студентам группы ${student.group}.`);
});

bot.command('report', async (ctx) => {
    const student = getStudent(ctx.from.id);

    if (!isAuthorizedStarosta(student)) {
        return ctx.reply("У тебя нету доступа");
    }

    const currentGroup = getGroupStudents(student.group, true);


    let reportText = `Присутствующие студенты группы ${student.group}:
Дата: ${new Date().toLocaleDateString()}
Староста: ${student.name}

`;

    if (currentGroup.length === 0) {
        return ctx.reply("Никто не отметился как присутствующий. Отчет создавать не из чего");
    }

    currentGroup.forEach((s, index) => {
        reportText += `${index + 1}. ${s.name}\n`;
    });

    const filePath = `./Отчет_${student.group}_${new Date().toLocaleDateString()}.txt`;
    fs.writeFileSync(filePath, reportText);
    await ctx.replyWithDocument({source: filePath});
    fs.unlinkSync(filePath);
})

bot.command('myinfo', (ctx) => {
    const student = getStudent(ctx.from.id);

    if (!student) return ctx.reply("Сначала зарегистрируйся через /start")

    if (student.step !== "REGISTERED") {
        return ctx.reply("Заверши регистрацию пожалуйста");
    }

    let statusIcon = student.isPresent === true ? "✅" : student.isPresent === false ? "❌" : "⏳"
    let lastCheckedDate = student.lastChecked
        ? new Date(student.lastChecked).toLocaleDateString("ru-Ru")
        : "Нет данных"


    let userInfo = `Имя: ${student.name}
Группа: ${student.group}
Роль: ${student.role}
Статус присутствия: ${statusIcon}
Последнее посещение: ${lastCheckedDate}`;

    ctx.reply(userInfo);
})

bot.command('help', (ctx) => {
    const helpText = `Список команд
/start - регистрация
/help - помощь
/myinfo

Для старосты:
/list - список студентов
/check - начать перекличку
/report - получить отчет`;
    ctx.reply(helpText);
})

bot.action('im_here', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (student) {
        student.isPresent = true;
        student.lastChecked = new Date().toISOString();
        save();
    }

    ctx.answerCbQuery();
    ctx.editMessageText("Спасибо! Твоё присутствие отмечено.");
});

bot.action('not_here', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (student) {
        student.isPresent = false;
        student.lastChecked = new Date().toISOString();
        save();
    }

    ctx.answerCbQuery();
    ctx.editMessageText("Понял, отмечу старосте про тебя");
})

bot.action('im_student', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (student) {
        student.role = 'Студент';
        student.step = 'REGISTERED';
        save();

        return ctx.editMessageText(`Регистрация закончилась! Теперь я знаю, что ты студент группы ${student.group}.`)
    }

    ctx.answerCbQuery();
})
bot.action('im_starosta', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ученик не найден")
    }

    let currentLeader = students.find(s => s.group === student.group && s.role === "Староста");

    if (currentLeader) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ты не можешь быть старостой этой группы")
    }

    student.role = "Староста";
    student.step = "REGISTERED";
    save()

    ctx.answerCbQuery();
    return ctx.editMessageText(`Регистрация закончилась, рад познакомиться ${student.name} из группы ${student.group}:`)
})

bot.on('text', (ctx) => {
    const userText = ctx.message.text;
    const student = getStudent(ctx.from.id);

    if (student.step === 'WAITING_FOR_NAME') {
        const cleanName = normalizeName(userText);
        if (cleanName.length < 2 || cleanName.length > 50) {
            return ctx.reply("Неправильно введено имя. Введи своё имя пожалуйста");
        }
        student.name = cleanName;
        student.step = 'WAITING_FOR_GROUP';
        save();
        ctx.reply(`Приятно познакомиться, ${student.name}! Из какой ты группы?`);
    } else if (student.step === 'WAITING_FOR_GROUP') {
        const cleanedGroup = normalizeGroup(userText);

        if (cleanedGroup.length > 12) return ctx.reply("Слишком много, попробуй ещё раз")

        student.group = cleanedGroup;
        student.step = 'WAITING_FOR_ROLE';
        save();
        ctx.reply(`Так и записал, группа ${student.group}. Кем ты являешься в группе?`,
            Markup.inlineKeyboard([
                Markup.button.callback('Я староста', 'im_starosta'),
                Markup.button.callback('Я студент', 'im_student')
            ])
        )
    }
});

bot.launch();
console.log("Работа началась");