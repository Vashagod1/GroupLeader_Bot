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
const isAuthorizedGroupLeader = (student) => {
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

const getAllGroups = () => {
    const groups = students
        .filter(s => s.step === "REGISTERED" && s.group)
        .map(s => s.group);
    return [...new Set(groups)];
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
            lastChecked: null,
            editAttempts: 0,
            lastEditDate: null
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

    if (!student) return ctx.reply("Сначала зарегистрируйся через /start")

    if (!isAuthorizedGroupLeader(student)) {
        return ctx.reply("У вас нет доступа");
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

    if (!student) return ctx.reply("Сначала зарегистрируйся через /start")

    if (!isAuthorizedGroupLeader(student)) {
        return ctx.reply("У вас нет доступа");
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
                console.log(`Не удалось отправить сообщение студенту ${member.name}: ${err.message}`)
            })
        }
    });
    save();
    ctx.reply(`Запрос отправлен ${currentGroup.length} студентам группы ${student.group}.`);
});

bot.command('report', async (ctx) => {
    const student = getStudent(ctx.from.id);

    if (!student) return ctx.reply("Сначала зарегистрируйся через /start")

    if (!isAuthorizedGroupLeader(student)) {
        return ctx.reply("У вас нет доступа");
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

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ошибка: студент не найден");
    }

    student.isPresent = true;
    student.lastChecked = new Date().toISOString();
    student.editAttempts = (student.editAttempts || 0) + 1;
    student.lastEditDate = new Date().toISOString();
    save();

    ctx.answerCbQuery();
    ctx.editMessageText(
        "Спасибо! Твоё присутствие отмечено.",
        Markup.inlineKeyboard([Markup.button.callback('Изменить', 'edit_mark')]));
});

bot.action('not_here', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ошибка: студент не найден");
    }

    student.isPresent = false;
    student.lastChecked = new Date().toISOString();
    student.editAttempts = (student.editAttempts || 0) + 1;
    student.lastEditDate = new Date().toISOString();
    save();


    ctx.answerCbQuery();
    ctx.editMessageText(
        "Понял, отмечу старосте про тебя",
        Markup.inlineKeyboard([Markup.button.callback('Изменить', 'edit_mark')])
    )
})

bot.action('edit_mark', (ctx) => {
    const student = getStudent(ctx.from.id)
    const today = new Date().toDateString();
    const lastEdit = student.lastEditDate ? new Date(student.lastEditDate).toDateString() : null;

    if (lastEdit !== today) {
        student.editAttempts = 0;
        save();
    }

    if (student.editAttempts >= 2) {
        ctx.answerCbQuery();
        ctx.editMessageText("На сегодня нельзя больше менять",
            Markup.inlineKeyboard([])
        );
    }

    ctx.answerCbQuery();
    ctx.editMessageText(
        "Выбери статус",
        Markup.inlineKeyboard([
            Markup.button.callback('Я тут!', 'im_here'),
            Markup.button.callback('Я не приду', 'not_here'),
        ])
    )
})

bot.action('role_student', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (!student) {
        ctx.answerCbQuery();
        ctx.editMessageText("Ошибка: студент не найден")
    }

    student.role = 'Студент';
    student.step = 'WAITING_FOR_GROUP_SELECTION';
    save();

    const groups = getAllGroups();

    if (groups.length === 0) {
        return ctx.editMessageText("Пока нету зарегистрированных групп. Обратись к старосте,")
    }

    const buttons = groups.map(group =>
        Markup.button.callback(group, `select_group_${group}`)
    );
    ctx.answerCbQuery();

    return ctx.editMessageText(
        "Выберите группу:",
        Markup.inlineKeyboard(buttons, {columns: 2})
    );
})

bot.action('role_leader', (ctx) => {
    const student = getStudent(ctx.from.id)

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ученик не найден")
    }

    student.role = "Староста";
    student.step = "WAITING_FOR_GROUP_SELECTION";
    save();

    const groups = getAllGroups();
    const buttons = groups.map(group =>
        Markup.button.callback(group, `select_group_${group}`)
    );


    buttons.push(Markup.button.callback('Новая группы', 'create_new_group'));

    ctx.answerCbQuery();
    return ctx.editMessageText(
        "Выбери свою группу или создай",
        Markup.inlineKeyboard(buttons, {columns: 2})
    );
});

bot.action(/selected_group_(.+)/, (ctx) => {
    const groupName = ctx.match[1];
    const student = getStudent(ctx.from.id);

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ошибка: студент не найден")
    }

    if (student.step !== "WAITING_FOR_GROUP_SELECTION") {
        ctx.answerCbQuery();

        return ctx.editMessageText("Ошибка, ты не выбрал группу")
    }

    if (student.role === "Студент") {
        student.group = groupName;
        student.step = "REGISTERED";
        save();

        ctx.answerCbQuery();
        return ctx.editMessageText(`Записал, ты в группе ${student.group}`)
    }

    if (student.role === "Староста") {
        const existingLeader = students.find(s =>
            s.group === groupName &&
            s.role === "Староста"
        )

        if (existingLeader) {
            ctx.answerCbQuery();
            return ctx.editMessageText("В этой группе есть староста.")
        }

        student.group = groupName;
        student.step = "REGISTERED";
        save();

        ctx.answerCbQuery();
        return ctx.editMessageText(`Ты зарегистрирован как староста группы ${student.group}`)
    }
})

bot.action('create_new_group', (ctx) => {
    const student = getStudent(ctx.from.id);

    if (!student) {
        ctx.answerCbQuery();
        return ctx.editMessageText("Ошибка: студент не найден")
    }

    student.step = "WAITING_FOR_NEW_GROUP";
    save();
    ctx.answerCbQuery();
    return ctx.editMessageText("Введи название группы")
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
        save();

        return ctx.reply(`${cleanName}, всё верно?`,
            Markup.inlineKeyboard([
                Markup.button.callback("Да", "confirm_name"),
                Markup.button.callback("Не правильно", "edit_name_at_reg")
            ])
        );
    } else if (student.step === 'WAITING_FOR_NEW_GROUP') {
        const cleanGroup = normalizeGroup(userText);

        if (cleanGroup > 15) {
            return ctx.reply("Название группы длинное");
        }

        student.group = cleanGroup;
        student.step = "REGISTERED";
        save();
        ctx.reply(`Все записал, студент ${student.name} из группы ${student.group}`);
    }
});

bot.launch();
console.log("Работа началась");