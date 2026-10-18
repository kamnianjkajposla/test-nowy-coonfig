const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ==========================================================
// USTAWIENIA I BEZPIECZNE ŚCIEŻKI
// ==========================================================

const TOKEN = process.env.DISCORD_TOKEN;
let DATA_DIR = process.env.DATA_DIR && typeof process.env.DATA_DIR === 'string' ? process.env.DATA_DIR : __dirname;

try {
    if (fs.existsSync(DATA_DIR) && !fs.lstatSync(DATA_DIR).isDirectory()) {
        console.warn(`⚠️ Ścieżka ${DATA_DIR} jest plikiem, a nie katalogiem! Przełączam na katalog bieżący.`);
        DATA_DIR = __dirname;
    }
} catch (e) {
    DATA_DIR = __dirname;
}

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, "ticket-config.json");

// ==========================================================
// SERWER HTTP (DLA HOSTINGU / RENDER / COLIFY)
// ==========================================================

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bot Discord działa prawidłowo!");
});

server.listen(PORT, () => {
    console.log(`🌐 Serwer HTTP nasłuchuje na porcie ${PORT}`);
});

// ==========================================================
// OBSŁUGA BŁĘDÓW (ZAPOBIEGA CRASHOWANIU BOTA)
// ==========================================================

process.on("unhandledRejection", error => {
    console.error("❌ Nieobsłużone odrzucenie Promise:", error);
});

process.on("uncaughtException", error => {
    console.error("❌ Nieprzechwycony wyjątek:", error);
});

// ==========================================================
// KLIENT DISCORD
// ==========================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message
    ]
});

// ==========================================================
// DOMYŚLNA KONFIGURACJA DLA JEDNEGO SERWERA
// ==========================================================

const defaultGuildConfig = {
    supportRoleIds: [],
    ticketCategoryId: null,
    transcriptChannelId: null,
    verifiedRoleId: null,

    ticketPanel: {
        title: "🎫 SYSTEM TICKETÓW",
        description: "Wybierz rodzaj zgłoszenia z rozwijanego menu poniżej:",
        placeholder: "📁 Wybierz kategorię zgłoszenia",
        thumbnail: "",
        image: "",
        color: "#2ecc71"
    },

    verifyPanel: {
        title: "🔐 Weryfikacja tożsamości",
        description: "Kliknij poniższy przycisk, aby pomyślnie przejść weryfikację i odblokować dostęp do serwera.",
        buttonLabel: "Zweryfikuj się",
        buttonEmoji: "✅",
        thumbnail: "",
        image: "",
        color: "#00FF00"
    },

    categories: [
        {
            id: "pomoc",
            name: "Pomoc",
            emoji: "🆘",
            description: "Potrzebuję pomocy technicznej",
            questions: [
                "W czym potrzebujesz pomocy?",
                "Od kiedy występuje problem?"
            ]
        },
        {
            id: "zgloszenie",
            name: "Zgłoszenie",
            emoji: "🚨",
            description: "Chcę zgłosić gracza lub incydent",
            questions: [
                "Kogo zgłaszasz?",
                "Jaki jest powód zgłoszenia?",
                "Podaj dowody (linki/zdjęcia)."
            ]
        },
        {
            id: "inne",
            name: "Inne",
            emoji: "📌",
            description: "Inna sprawa",
            questions: [
                "Opisz swoją sprawę."
            ]
        }
    ]
};

// Mapa przechowywania przejętych ticketów (channelId -> userId)
const claimedTickets = new Map();

// ==========================================================
// ŁADOWANIE I WERYFIKACJA STRUKTURY WIELUSERWEROWEJ
// ==========================================================

let globalConfig = {};

function loadGlobalConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 4), "utf8");
        return {};
    }

    try {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
        return typeof data === "object" && data !== null ? data : {};
    } catch (error) {
        console.error("❌ Błąd odczytu pliku konfiguracyjnego:", error);
        return {};
    }
}

globalConfig = loadGlobalConfig();

function getGuildConfig(guildId) {
    if (!guildId) return JSON.parse(JSON.stringify(defaultGuildConfig));

    if (!globalConfig[guildId]) {
        globalConfig[guildId] = JSON.parse(JSON.stringify(defaultGuildConfig));
        saveGlobalConfig();
    }

    const cfg = globalConfig[guildId];

    if (!Array.isArray(cfg.categories)) cfg.categories = [];
    if (!Array.isArray(cfg.supportRoleIds)) cfg.supportRoleIds = [];
    if (!cfg.ticketPanel || typeof cfg.ticketPanel !== "object") cfg.ticketPanel = {};
    if (!cfg.verifyPanel || typeof cfg.verifyPanel !== "object") cfg.verifyPanel = {};

    if (typeof cfg.ticketPanel.title !== "string") cfg.ticketPanel.title = defaultGuildConfig.ticketPanel.title;
    if (typeof cfg.ticketPanel.description !== "string") cfg.ticketPanel.description = defaultGuildConfig.ticketPanel.description;
    if (typeof cfg.ticketPanel.placeholder !== "string") cfg.ticketPanel.placeholder = defaultGuildConfig.ticketPanel.placeholder;
    if (typeof cfg.ticketPanel.color !== "string") cfg.ticketPanel.color = defaultGuildConfig.ticketPanel.color;

    if (typeof cfg.verifyPanel.title !== "string") cfg.verifyPanel.title = defaultGuildConfig.verifyPanel.title;
    if (typeof cfg.verifyPanel.description !== "string") cfg.verifyPanel.description = defaultGuildConfig.verifyPanel.description;
    if (typeof cfg.verifyPanel.buttonLabel !== "string") cfg.verifyPanel.buttonLabel = defaultGuildConfig.verifyPanel.buttonLabel;
    if (typeof cfg.verifyPanel.buttonEmoji !== "string") cfg.verifyPanel.buttonEmoji = defaultGuildConfig.verifyPanel.buttonEmoji;
    if (typeof cfg.verifyPanel.color !== "string") cfg.verifyPanel.color = defaultGuildConfig.verifyPanel.color;

    return cfg;
}

function saveGlobalConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(globalConfig, null, 4), "utf8");
        return true;
    } catch (error) {
        console.error("❌ Błąd zapisu konfiguracji globalnej:", error);
        return false;
    }
}

// ==========================================================
// POMOCNICZE
// ==========================================================

function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function isAdmin(member) {
    if (!member) return false;
    return member.permissions?.has(PermissionsBitField.Flags.Administrator);
}

function isSupportOrAdmin(member, guildId) {
    if (!member) return false;
    if (isAdmin(member)) return true;
    const cfg = getGuildConfig(guildId);
    return member.roles.cache.some(role => cfg.supportRoleIds.includes(role.id));
}

function safeChannelName(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9ąćęłńóśźż_-]/gi, "-")
        .replace(/-+/g, "-")
        .substring(0, 70);
}

function parseHexColor(hexString, defaultColor = 0x2ecc71) {
    if (!hexString) return defaultColor;
    const cleanHex = hexString.replace("#", "").trim();
    const parsed = parseInt(cleanHex, 16);
    return isNaN(parsed) ? defaultColor : parsed;
}

// ==========================================================
// GENEROWANIE PANELI EMBED
// ==========================================================

function createTicketPanel(guildId) {
    const cfg = getGuildConfig(guildId);
    const panel = cfg.ticketPanel;

    const embed = new EmbedBuilder()
        .setTitle((panel.title || "🎫 SYSTEM TICKETÓW").substring(0, 256))
        .setDescription((panel.description || "Wybierz kategoria zgłoszenia:").substring(0, 4096))
        .setColor(parseHexColor(panel.color, 0x2ecc71));

    if (panel.thumbnail && panel.thumbnail.startsWith("http")) {
        embed.setThumbnail(panel.thumbnail);
    }
    if (panel.image && panel.image.startsWith("http")) {
        embed.setImage(panel.image);
    }

    const options = cfg.categories.slice(0, 25).map(category => {
        const option = new StringSelectMenuOptionBuilder()
            .setLabel(category.name.substring(0, 100))
            .setValue(category.id)
            .setDescription((category.description || "Otwórz ticket").substring(0, 100));

        if (category.emoji) option.setEmoji(category.emoji);
        return option;
    });

    if (options.length === 0) {
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel("Brak kategorii")
                .setValue("none")
                .setDescription("Skonfiguruj kategorie za pomocą /ticket")
        );
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket_category_select_public")
        .setPlaceholder((panel.placeholder || "📁 Wybierz kategorię").substring(0, 150))
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(menu);

    return { embeds: [embed], components: [row] };
}

function createVerifyPanel(guildId) {
    const cfg = getGuildConfig(guildId);
    const panel = cfg.verifyPanel;

    const embed = new EmbedBuilder()
        .setTitle((panel.title || "🔐 Weryfikacja").substring(0, 256))
        .setDescription((panel.description || "Kliknij poniżej, aby uzyskać dostęp.").substring(0, 4096))
        .setColor(parseHexColor(panel.color, 0x00FF00))
        .setTimestamp();

    if (panel.thumbnail && panel.thumbnail.startsWith("http")) {
        embed.setThumbnail(panel.thumbnail);
    }
    if (panel.image && panel.image.startsWith("http")) {
        embed.setImage(panel.image);
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_btn")
            .setLabel((panel.buttonLabel || "Zweryfikuj się").substring(0, 80))
            .setStyle(ButtonStyle.Success)
            .setEmoji(panel.buttonEmoji || "✅")
    );

    return { embeds: [embed], components: [row] };
}

// ==========================================================
// PANEL ZARZĄDZANIA ADMINA
// ==========================================================

function createAdminPanel() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin_ticket_panel").setLabel("📤 Wyślij Panel Ticket").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("admin_edit_panel").setLabel("✏️ Wygląd Panelu Ticket").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("admin_categories").setLabel("📁 Kategorie").setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin_questions").setLabel("❓ Pytania").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin_roles").setLabel("👥 Role obsługi").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("admin_transcripts").setLabel("📜 Ustaw Transkrypcje").setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("admin_info").setLabel("ℹ️ Stan konfiguracji").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("admin_close_panel").setLabel("❌ Zamknij").setStyle(ButtonStyle.Danger)
    );

    return [row1, row2, row3];
}

// ==========================================================
// MODALE EDYCJI PANELI (WYGLĄD, NAZWA, MINIATURKA)
// ==========================================================

function ticketPanelModal(guildId) {
    const cfg = getGuildConfig(guildId);
    const modal = new ModalBuilder().setCustomId("ticket_panel_modal").setTitle("✏️ Personalizacja Panelu Ticket");

    const title = new TextInputBuilder()
        .setCustomId("panel_title")
        .setLabel("Tytuł panelu")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setValue(cfg.ticketPanel.title || "");

    const description = new TextInputBuilder()
        .setCustomId("panel_description")
        .setLabel("Opis panelu")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(cfg.ticketPanel.description || "");

    const thumbnail = new TextInputBuilder()
        .setCustomId("panel_thumbnail")
        .setLabel("URL Miniaturki (np. logo/grafika)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(cfg.ticketPanel.thumbnail || "");

    const image = new TextInputBuilder()
        .setCustomId("panel_image")
        .setLabel("URL Baneru (duży obrazek na dole)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(cfg.ticketPanel.image || "");

    const color = new TextInputBuilder()
        .setCustomId("panel_color")
        .setLabel("Kolor paska HEX (np. #2ecc71 lub #ff0000)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10)
        .setValue(cfg.ticketPanel.color || "#2ecc71");

    modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description),
        new ActionRowBuilder().addComponents(thumbnail),
        new ActionRowBuilder().addComponents(image),
        new ActionRowBuilder().addComponents(color)
    );

    return modal;
}

function verifyPanelModal(guildId) {
    const cfg = getGuildConfig(guildId);
    const modal = new ModalBuilder().setCustomId("verify_panel_modal").setTitle("🔐 Personalizacja Panelu Weryfikacji");

    const title = new TextInputBuilder()
        .setCustomId("verify_title")
        .setLabel("Tytuł panelu")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
        .setValue(cfg.verifyPanel.title || "");

    const description = new TextInputBuilder()
        .setCustomId("verify_description")
        .setLabel("Opis panelu")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(cfg.verifyPanel.description || "");

    const thumbnail = new TextInputBuilder()
        .setCustomId("verify_thumbnail")
        .setLabel("URL Miniaturki (np. logo)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(cfg.verifyPanel.thumbnail || "");

    const buttonLabel = new TextInputBuilder()
        .setCustomId("verify_btn_label")
        .setLabel("Tekst na przycisku")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setValue(cfg.verifyPanel.buttonLabel || "");

    const color = new TextInputBuilder()
        .setCustomId("verify_color")
        .setLabel("Kolor HEX (np. #00ff00)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10)
        .setValue(cfg.verifyPanel.color || "#00FF00");

    modal.addComponents(
        new ActionRowBuilder().addComponents(title),
        new ActionRowBuilder().addComponents(description),
        new ActionRowBuilder().addComponents(thumbnail),
        new ActionRowBuilder().addComponents(buttonLabel),
        new ActionRowBuilder().addComponents(color)
    );

    return modal;
}

function addCategoryModal() {
    const modal = new ModalBuilder().setCustomId("category_add_modal").setTitle("📁 Dodaj nową kategorię");

    const name = new TextInputBuilder().setCustomId("category_name").setLabel("Nazwa kategorii").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
    const emoji = new TextInputBuilder().setCustomId("category_emoji").setLabel("Emotka").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue("📁");
    const description = new TextInputBuilder().setCustomId("category_description").setLabel("Opis w menu rozwijanym").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(100);

    modal.addComponents(
        new ActionRowBuilder().addComponents(name),
        new ActionRowBuilder().addComponents(emoji),
        new ActionRowBuilder().addComponents(description)
    );

    return modal;
}

function categoryAdminMenu(guildId, customId) {
    const cfg = getGuildConfig(guildId);
    const options = cfg.categories.slice(0, 25).map(category => {
        const option = new StringSelectMenuOptionBuilder().setLabel(category.name.substring(0, 100)).setValue(category.id);
        if (category.emoji) option.setEmoji(category.emoji);
        return option;
    });

    if (options.length === 0) {
        options.push(new StringSelectMenuOptionBuilder().setLabel("Brak kategorii").setValue("none"));
    }

    const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder("📁 Wybierz kategorię").addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
}

function createTicketModal(category) {
    const questions = category.questions || [];
    const questionsToAsk = questions.slice(0, 5);

    const modal = new ModalBuilder().setCustomId(`ticket_questions_modal_${category.id}`).setTitle(category.name.substring(0, 45));

    questionsToAsk.forEach((question, index) => {
        const input = new TextInputBuilder()
            .setCustomId(`answer_${index}`)
            .setLabel(question.substring(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    return modal;
}

// ==========================================================
// TWORZENIE KANAŁU TICKETU
// ==========================================================

async function createTicketAfterForm(interaction, category, answers) {
    const guild = interaction.guild;
    if (!guild) return null;

    const cfg = getGuildConfig(guild.id);

    const existing = guild.channels.cache.find(channel => channel.topic === `ticket-owner:${interaction.user.id}`);
    if (existing) {
        return { error: `❌ Masz już otwarty ticket: ${existing}` };
    }

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles
            ]
        }
    ];

    for (const roleId of cfg.supportRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
            permissionOverwrites.push({
                id: role.id,
                allow: [
                    PermissionsBitField.Flags.ViewChannel,
                    PermissionsBitField.Flags.SendMessages,
                    PermissionsBitField.Flags.ReadMessageHistory,
                    PermissionsBitField.Flags.AttachFiles
                ]
            });
        }
    }

    const channelName = safeChannelName(`${category.name}-${interaction.user.username}`);
    const channelOptions = {
        name: `ticket-${channelName}`.substring(0, 100),
        type: ChannelType.GuildText,
        topic: `ticket-owner:${interaction.user.id}`,
        permissionOverwrites,
        reason: `Ticket utworzony przez ${interaction.user.tag}`
    };

    if (cfg.ticketCategoryId) {
        const parent = guild.channels.cache.get(cfg.ticketCategoryId);
        if (parent && parent.type === ChannelType.GuildCategory) {
            channelOptions.parent = parent.id;
        }
    }

    let channel;
    try {
        channel = await guild.channels.create(channelOptions);
    } catch (error) {
        console.error("❌ Błąd tworzenia ticketu:", error);
        return { error: "❌ Nie udało się utworzyć kanału ticketu." };
    }

    let supportMention = cfg.supportRoleIds.map(id => `<@&${id}>`).join(" ");

    const embed = new EmbedBuilder()
        .setTitle(`${category.emoji || "📁"} ${category.name}`)
        .setDescription(`Ticket utworzony przez ${interaction.user}\n\nKategoria: **${category.name}**`)
        .setColor(parseHexColor(cfg.ticketPanel.color, 0x3498db))
        .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_claim").setLabel("🙋 Przejmij ticket").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Zamknij ticket").setStyle(ButtonStyle.Danger)
    );

    await channel.send({
        content: `${interaction.user} ${supportMention}`.trim(),
        embeds: [embed],
        components: [buttons]
    });

    let answersText = "📝 **ODPOWIEDZI Z FORMULARZA**\n\n";
    category.questions.slice(0, 5).forEach((question, index) => {
        const answer = answers[index] || "Brak odpowiedzi";
        answersText += `**${index + 1}. ${question}**\n${answer}\n\n`;
    });

    const answersEmbed = new EmbedBuilder()
        .setTitle("📝 Odpowiedzi zgłoszenia")
        .setDescription(answersText.substring(0, 4096))
        .setColor(0x2ecc71)
        .setFooter({ text: `Użytkownik: ${interaction.user.tag}` })
        .setTimestamp();

    await channel.send({ embeds: [answersEmbed] });

    return { channel };
}

// ==========================================================
// TRANSKRYPCJA
// ==========================================================

async function createTranscript(channel, closer) {
    let messages = [];
    let lastId;

    try {
        while (true) {
            const fetched = await channel.messages.fetch({
                limit: 100,
                ...(lastId ? { before: lastId } : {})
            });

            if (fetched.size === 0) break;
            messages.push(...fetched.values());
            lastId = fetched.last().id;
            if (fetched.size < 100) break;
        }
    } catch (error) {
        console.error("Błąd generowania transkrypcji:", error);
    }

    messages.reverse();

    let text = `TRANSKRYPCJA KANAŁU: #${channel.name}\n`;
    text += `Serwer: ${channel.guild.name} (ID: ${channel.guild.id})\n`;
    text += `Data: ${new Date().toISOString()}\n`;
    text += `Zamknięte przez: ${closer.tag}\n`;
    text += "=".repeat(50) + "\n\n";

    for (const msg of messages) {
        const time = msg.createdAt.toISOString();
        text += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
        if (msg.embeds.length > 0) {
            text += `[EMBEDY]: ${msg.embeds.map(e => e.title || e.description || "").join(" | ")}\n`;
        }
    }

    const buffer = Buffer.from(text, "utf8");
    return new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });
}

// ==========================================================
// ZDARZENIA BOTA
// ==========================================================

client.once("ready", async () => {
    console.log(`✅ Zalogowano jako ${client.user.tag}!`);

    const commands = [
        {
            name: "weryfikacja",
            description: "Ustawia rolę po weryfikacji oraz wysyła panel weryfikacyjny.",
            options: [
                {
                    name: "rola",
                    type: 8, // Role
                    description: "Rola nadawana po zweryfikowaniu",
                    required: true
                }
            ],
            default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
        },
        {
            name: "weryfikacja-edycja",
            description: "Otwiera panel edycji wyglądu i miniaturki panelu weryfikacji",
            default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
        },
        {
            name: "transkrypcja-ustaw",
            description: "Ustawia kanał transkrypcji dla obecnego serwera",
            options: [
                {
                    name: "kanal",
                    type: 7, // Channel
                    description: "Wybierz kanał tekstowy",
                    required: true,
                    channel_types: [ChannelType.GuildText]
                }
            ],
            default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
        },
        {
            name: "ticket",
            description: "Otwiera panel zarządzania systemem ticketów dla tego serwera",
            default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log("✅ Rejestracja komend slash zakończona.");
    } catch (error) {
        console.error("❌ Błąd rejestracji komend:", error);
    }
});

client.on("guildMemberAdd", async member => {
    try {
        const unverifiedRole = member.guild.roles.cache.find(role => role.name === "Niezweryfikowany");
        if (unverifiedRole) {
            await member.roles.add(unverifiedRole);
        }
    } catch (error) {
        console.error(`Błąd przy nadawaniu roli dla ${member.user.tag}:`, error);
    }
});

client.on("channelDelete", channel => {
    if (claimedTickets.has(channel.id)) {
        claimedTickets.delete(channel.id);
    }
});

// ==========================================================
// OBSŁUGA INTERAKCJI
// ==========================================================

client.on("interactionCreate", async interaction => {
    try {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const cfg = getGuildConfig(guildId);

        // --- KOMENDY SLASH ---
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "weryfikacja") {
                if (!isAdmin(interaction.member)) {
                    return await interaction.reply({ content: "❌ Brak uprawnień administratora.", ephemeral: true });
                }

                const targetRole = interaction.options.getRole("rola");
                cfg.verifiedRoleId = targetRole.id;
                saveGlobalConfig();

                await interaction.channel.send(createVerifyPanel(guildId));
                await interaction.reply({ content: `✅ Ustawiono rolę weryfikacyjną na **${targetRole.name}** i wysłano panel!`, ephemeral: true });
            }
            else if (interaction.commandName === "weryfikacja-edycja") {
                if (!isAdmin(interaction.member)) {
                    return await interaction.reply({ content: "❌ Brak uprawnień administratora.", ephemeral: true });
                }
                await interaction.showModal(verifyPanelModal(guildId));
            }
            else if (interaction.commandName === "transkrypcja-ustaw") {
                if (!isAdmin(interaction.member)) {
                    return await interaction.reply({ content: "❌ Brak uprawnień administratora.", ephemeral: true });
                }

                const channel = interaction.options.getChannel("kanal");
                cfg.transcriptChannelId = channel.id;
                saveGlobalConfig();

                await interaction.reply({ content: `✅ Ustawiono kanał transkrypcji dla tego serwera na: ${channel}`, ephemeral: true });
            }
            else if (interaction.commandName === "ticket") {
                if (!isAdmin(interaction.member)) {
                    return await interaction.reply({ content: "❌ Brak uprawnień administratora.", ephemeral: true });
                }

                await interaction.reply({
                    content: `⚙️ **Panel zarządzania ticketami dla serwera: ${interaction.guild.name}**`,
                    components: createAdminPanel(),
                    ephemeral: true
                });
            }
        }

        // --- PRZYCISKI ---
        else if (interaction.isButton()) {
            if (interaction.customId === "verify_btn") {
                await interaction.deferReply({ ephemeral: true });

                if (!cfg.verifiedRoleId) {
                    return await interaction.editReply({ content: "❌ Rola weryfikacyjna nie została jeszcze skonfigurowana." });
                }

                const member = interaction.member;
                const guild = interaction.guild;

                const unverifiedRole = guild.roles.cache.find(role => role.name === "Niezweryfikowany");
                const verifiedRole = guild.roles.cache.get(cfg.verifiedRoleId);

                if (!verifiedRole) {
                    return await interaction.editReply({ content: "❌ Skonfigurowana rola weryfikacji nie istnieje na tym serwerze." });
                }

                try {
                    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
                        await member.roles.remove(unverifiedRole);
                    }
                    if (!member.roles.cache.has(verifiedRole.id)) {
                        await member.roles.add(verifiedRole);
                    }

                    await interaction.editReply({ content: "🎉 Twoje konto zostało pomyślnie zweryfikowane!" });
                } catch (error) {
                    console.error("Błąd nadawania roli weryfikacyjnej:", error);
                    await interaction.editReply({ content: "❌ Wystąpił błąd podczas nadawania ról." });
                }
            }
            else if (interaction.customId === "admin_ticket_panel") {
                if (!isAdmin(interaction.member)) return;
                const panelData = createTicketPanel(guildId);
                await interaction.channel.send(panelData);
                await interaction.reply({ content: "✅ Wysyłano publiczny panel ticketów na ten kanał!", ephemeral: true });
            }
            else if (interaction.customId === "admin_edit_panel") {
                if (!isAdmin(interaction.member)) return;
                await interaction.showModal(ticketPanelModal(guildId));
            }
            else if (interaction.customId === "admin_categories") {
                if (!isAdmin(interaction.member)) return;
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId("cat_add").setLabel("➕ Dodaj").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("cat_del").setLabel("🗑️ Usuń").setStyle(ButtonStyle.Danger)
                );
                await interaction.reply({ content: "📁 Zarządzanie kategoriami ticketów:", components: [row], ephemeral: true });
            }
            else if (interaction.customId === "cat_add") {
                if (!isAdmin(interaction.member)) return;
                await interaction.showModal(addCategoryModal());
            }
            else if (interaction.customId === "cat_del") {
                if (!isAdmin(interaction.member)) return;
                await interaction.reply({ content: "Wybierz kategorię do usunięcia:", components: [categoryAdminMenu(guildId, "cat_del_select")], ephemeral: true });
            }
            else if (interaction.customId === "admin_roles") {
                if (!isAdmin(interaction.member)) return;

                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId("support_role_select")
                    .setPlaceholder("👥 Wybierz rolę do dodania/usunięcia z obsługi");

                const row = new ActionRowBuilder().addComponents(roleSelect);
                const currentRolesList = cfg.supportRoleIds.map(id => `<@&${id}>`).join(", ") || "Brak";

                await interaction.reply({
                    content: `👥 **Role obsługi na tym serwerze:** ${currentRolesList}\n\nWybierz rolę z listy poniżej:`,
                    components: [row],
                    ephemeral: true
                });
            }
            else if (interaction.customId === "admin_transcripts") {
                if (!isAdmin(interaction.member)) return;

                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId("transcript_channel_select")
                    .setPlaceholder("📜 Wybierz kanał dla transkrypcji")
                    .setChannelTypes(ChannelType.GuildText);

                const row = new ActionRowBuilder().addComponents(channelSelect);

                await interaction.reply({
                    content: `Aktualny kanał transkrypcji: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "Brak"}\n\nWybierz nowy kanał:`,
                    components: [row],
                    ephemeral: true
                });
            }
            else if (interaction.customId === "admin_info") {
                if (!isAdmin(interaction.member)) return;
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`ℹ️ Konfiguracja: ${interaction.guild.name}`)
                            .setDescription(`Liczba kategorii: **${cfg.categories.length}**\nRole obsługi: **${cfg.supportRoleIds.length}**\nRola zweryfikowana: ${cfg.verifiedRoleId ? `<@&${cfg.verifiedRoleId}>` : "Brak"}\nKanał transkrypcji: ${cfg.transcriptChannelId ? `<#${cfg.transcriptChannelId}>` : "Brak"}`)
                            .setColor(0x3498db)
                    ],
                    ephemeral: true
                });
            }
            else if (interaction.customId === "admin_close_panel") {
                if (!isAdmin(interaction.member)) return;
                await interaction.message.delete().catch(() => {});
            }
            else if (interaction.customId === "ticket_claim") {
                if (!isSupportOrAdmin(interaction.member, guildId)) {
                    return await interaction.reply({ content: "❌ Nie masz uprawnień do przejęcia tego ticketu.", ephemeral: true });
                }

                if (claimedTickets.has(interaction.channel.id)) {
                    const claimedUserId = claimedTickets.get(interaction.channel.id);
                    return await interaction.reply({
                        content: `⚠️ Ten ticket został już przejęty przez <@${claimedUserId}>!`,
                        ephemeral: true
                    });
                }

                claimedTickets.set(interaction.channel.id, interaction.user.id);

                const claimEmbed = new EmbedBuilder()
                    .setTitle("👔 Zgłoszenie Przyjęte")
                    .setDescription(`Twój ticket został oficjalnie przyjęty do obsługi przez ${interaction.user}.\nOd tej pory ta osoba zajmuje się Twoim zgłoszeniem. Prosimy o cierpliwość!`)
                    .setColor(0x2F3136)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `Obsługa zgłoszenia: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                await interaction.reply({ embeds: [claimEmbed] });
            }
            else if (interaction.customId === "ticket_close") {
                if (!isSupportOrAdmin(interaction.member, guildId)) {
                    return await interaction.reply({ content: "❌ Tylko administracja lub członkowie obsługi mogą zamknąć ten ticket.", ephemeral: true });
                }

                await interaction.reply({ content: "🔒 Zamykanie ticketu i generowanie transkrypcji..." });
                const attachment = await createTranscript(interaction.channel, interaction.user);

                if (cfg.transcriptChannelId) {
                    const transChannel = interaction.guild.channels.cache.get(cfg.transcriptChannelId);
                    if (transChannel) {
                        await transChannel.send({
                            content: `📜 Transkrypcja z zamkniętego ticketu #${interaction.channel.name}:`,
                            files: [attachment]
                        }).catch(() => {});
                    }
                }

                setTimeout(async () => {
                    claimedTickets.delete(interaction.channel.id);
                    await interaction.channel.delete().catch(() => {});
                }, 4000);
            }
        }

        // --- SELECT MENUS ---
        else if (interaction.isRoleSelectMenu()) {
            if (interaction.customId === "support_role_select") {
                const selectedRoleId = interaction.values[0];

                if (cfg.supportRoleIds.includes(selectedRoleId)) {
                    cfg.supportRoleIds = cfg.supportRoleIds.filter(id => id !== selectedRoleId);
                    saveGlobalConfig();
                    await interaction.update({ content: `🗑️ Usunięto rolę <@&${selectedRoleId}> z ról obsługi tego serwera.`, components: [] });
                } else {
                    cfg.supportRoleIds.push(selectedRoleId);
                    saveGlobalConfig();
                    await interaction.update({ content: `✅ Dodano rolę <@&${selectedRoleId}> do ról obsługi tego serwera.`, components: [] });
                }
            }
        }
        else if (interaction.isChannelSelectMenu()) {
            if (interaction.customId === "transcript_channel_select") {
                const selectedChannelId = interaction.values[0];
                cfg.transcriptChannelId = selectedChannelId;
                saveGlobalConfig();
                await interaction.update({
                    content: `✅ Ustawiono nowy kanał transkrypcji: <#${selectedChannelId}>`,
                    components: []
                });
            }
        }
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === "ticket_category_select_public") {
                const catId = interaction.values[0];
                const category = cfg.categories.find(c => c.id === catId);
                if (!category) return await interaction.reply({ content: "❌ Wybrana kategoria nie istnieje.", ephemeral: true });

                if (category.questions && category.questions.length > 0) {
                    await interaction.showModal(createTicketModal(category));
                } else {
                    await interaction.deferReply({ ephemeral: true });
                    const res = await createTicketAfterForm(interaction, category, []);
                    if (res?.error) return await interaction.editReply({ content: res.error });
                    await interaction.editReply({ content: `✅ Stworzono ticket: ${res.channel}` });
                }
            }
            else if (interaction.customId === "cat_del_select") {
                const catId = interaction.values[0];
                cfg.categories = cfg.categories.filter(c => c.id !== catId);
                saveGlobalConfig();
                await interaction.update({ content: "🗑️ Pomyślnie usunięto kategorię z konfiguracji tego serwera!", components: [] });
            }
        }

        // --- MODALE SUBMIT ---
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === "ticket_panel_modal") {
                cfg.ticketPanel.title = interaction.fields.getTextInputValue("panel_title");
                cfg.ticketPanel.description = interaction.fields.getTextInputValue("panel_description");
                cfg.ticketPanel.thumbnail = interaction.fields.getTextInputValue("panel_thumbnail");
                cfg.ticketPanel.image = interaction.fields.getTextInputValue("panel_image");
                cfg.ticketPanel.color = interaction.fields.getTextInputValue("panel_color");

                saveGlobalConfig();
                await interaction.reply({ content: "✅ Zaktualizowano wygląd i miniatury panelu ticketów dla tego serwera!", ephemeral: true });
            }
            else if (interaction.customId === "verify_panel_modal") {
                cfg.verifyPanel.title = interaction.fields.getTextInputValue("verify_title");
                cfg.verifyPanel.description = interaction.fields.getTextInputValue("verify_description");
                cfg.verifyPanel.thumbnail = interaction.fields.getTextInputValue("verify_thumbnail");
                cfg.verifyPanel.buttonLabel = interaction.fields.getTextInputValue("verify_btn_label");
                cfg.verifyPanel.color = interaction.fields.getTextInputValue("verify_color");

                saveGlobalConfig();
                await interaction.reply({ content: "✅ Zaktualizowano wygląd panelu weryfikacji dla tego serwera!", ephemeral: true });
            }
            else if (interaction.customId === "category_add_modal") {
                cfg.categories.push({
                    id: makeId(),
                    name: interaction.fields.getTextInputValue("category_name"),
                    emoji: interaction.fields.getTextInputValue("category_emoji"),
                    description: interaction.fields.getTextInputValue("category_description"),
                    questions: ["Opisz swoją sprawę:"]
                });

                saveGlobalConfig();
                await interaction.reply({ content: "✅ Pomyślnie dodano nową kategorię!", ephemeral: true });
            }
            else if (interaction.customId.startsWith("ticket_questions_modal_")) {
                const catId = interaction.customId.replace("ticket_questions_modal_", "");
                const category = cfg.categories.find(c => c.id === catId);
                if (!category) return await interaction.reply({ content: "❌ Błąd kategorii.", ephemeral: true });

                const answers = [];
                category.questions.slice(0, 5).forEach((_, idx) => {
                    answers.push(interaction.fields.getTextInputValue(`answer_${idx}`));
                });

                await interaction.deferReply({ ephemeral: true });
                const res = await createTicketAfterForm(interaction, category, answers);
                if (res?.error) return await interaction.editReply({ content: res.error });
                await interaction.editReply({ content: `✅ Utworzono Twój ticket: ${res.channel}` });
            }
        }
    } catch (error) {
        console.error("❌ Błąd interakcji:", error);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "Wystąpił błąd podczas wykonywania tej akcji.", ephemeral: true }).catch(() => {});
        }
    }
});

// ==========================================================
// URUCHOMIENIE BOTA
// ==========================================================

client.login(TOKEN);
