const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require("@whiskeysockets/baileys");

const { MongoClient } = require("mongodb");
const path = require("path");

// ==============================
// MONGODB
// ==============================
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://joseaalfredo98_db_user:AS9yuOAQDohpl64M@cluster0.cvmbrsk.mongodb.net/?appName=Cluster0";
const DB_NAME = "whatsapp_bot"; // base separada, no toca kanestream

let db;

async function connectDB() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log("✅ Conectado a MongoDB");
}

function col(name) {
    return db.collection(name);
}

// ==============================
// AUTH
// ==============================
const AUTH_FOLDER = path.join(__dirname, "auth");

// ==============================
// COMANDOS POR DEFECTO
// ==============================
const DEFAULT_COMANDOS = {
    ".bienvenida": "👋 *¡Bienvenido al grupo!*\n\nGracias por unirte.\nAquí encontrarás toda la información que necesitas.\n\n_Si tienes dudas, contacta a un administrador._"
};

// ==============================
// DB — un documento por grupo
// ==============================
async function getComandos(groupId) {
    const doc = await col("grupos").findOne({ _id: groupId });
    if (!doc) {
        // Guardar defaults sin punto en las claves
        const defaultsSinPunto = {};
        for (const [k, v] of Object.entries(DEFAULT_COMANDOS)) {
            defaultsSinPunto[k.startsWith(".") ? k.slice(1) : k] = v;
        }
        await col("grupos").insertOne({ _id: groupId, comandos: defaultsSinPunto });
        return { ...DEFAULT_COMANDOS };
    }
    return normalizarComandos(doc.comandos || {});
}

async function saveComando(groupId, comando, texto) {
    // MongoDB no permite puntos en claves con $set
    // guardamos sin el punto inicial: ".menu" -> clave "menu"
    const clave = comando.startsWith(".") ? comando.slice(1) : comando;
    await col("grupos").updateOne(
        { _id: groupId },
        { $set: { [`comandos.${clave}`]: texto } },
        { upsert: true }
    );
}

async function deleteComando(groupId, comando) {
    const clave = comando.startsWith(".") ? comando.slice(1) : comando;
    await col("grupos").updateOne(
        { _id: groupId },
        { $unset: { [`comandos.${clave}`]: "" } }
    );
}

// Al leer comandos reponemos el punto al inicio de cada clave
function normalizarComandos(raw) {
    const result = {};
    for (const [k, v] of Object.entries(raw)) {
        result[k.startsWith(".") ? k : "." + k] = v;
    }
    return result;
}

// ==============================
// ADMIN CHECK — igual que bot_combos
// ==============================
async function isAdmin(sock, groupId, lidJid, senderJid) {
    try {
        const meta = await sock.groupMetadata(groupId);
        const p = meta.participants.find(x =>
            x.id === lidJid ||
            x.id === senderJid
        );
        return p?.admin === "admin" || p?.admin === "superadmin";
    } catch {
        return false;
    }
}

const RESERVADOS = [
    ".nuevo", ".editar", ".eliminar", ".listar",
    ".ayuda", ".cerrargrupo", ".abrirgrupo", ".expulsar"
];

// ==============================
// BOT
// ==============================
async function startBot() {
    await connectDB();

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        browser: Browsers.ubuntu("Chrome")
    });

    sock.ev.on("creds.update", saveCreds);

    const phoneNumber = process.env.PHONE_NUMBER;

    if (!sock.authState.creds.registered) {
        if (!phoneNumber) {
            console.log("❌ Falta PHONE_NUMBER. Ejemplo: PHONE_NUMBER=521XXXXXXXXX node index.js");
        } else {
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    console.log("╔══════════════════════════════════╗");
                    console.log("║  🔑 CODIGO DE VINCULACION:       ║");
                    console.log(`║      ${code}               ║`);
                    console.log("╚══════════════════════════════════╝");
                    console.log("👆 WhatsApp → Dispositivos vinculados → Vincular con número");
                } catch (err) {
                    console.log("❌ Error al pedir código:", err.message);
                }
            }, 3000);
        }
    }

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const reconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("⚠️ Conexión cerrada. Reconectar:", reconectar);
            if (reconectar) startBot();
        } else if (connection === "open") {
            console.log("✅ BOT CONECTADO");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        const msg = messages[0];
        if (!msg?.message) return;
        if (msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        if (!from.endsWith("@g.us")) return; // solo grupos

        const groupId = from;
        const lidJid    = msg.key.participant || msg.participant || from;
        const senderJid = msg.key.participantAlt || lidJid;

        // rawText completo con saltos de línea
        const rawText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            ""
        ).trim();

        if (!rawText) return;

        // Primera línea en minúsculas para detectar el comando
        const lineas = rawText.split("\n");
        const firstLine = lineas[0].toLowerCase().trim();

        // ==============================
        // PANEL ADMIN
        // ==============================

        // .nuevo .comando
        // El texto va después del comando o en las líneas siguientes
        // Ejemplos:
        //   .nuevo .promo 🔥 Oferta del día
        //
        //   .nuevo .artemis
        //   🤖 Hola soy ARTEMIS
        //   Escribe .menu para más info
        if (firstLine.startsWith(".nuevo ")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }

            const primeraParte = lineas[0].slice(7).trim(); // quita ".nuevo "
            const primerEspacio = primeraParte.indexOf(" ");

            let comando, mensaje;

            if (primerEspacio === -1) {
                // .nuevo .comando (texto en líneas siguientes)
                comando = primeraParte.toLowerCase();
                mensaje = lineas.slice(1).join("\n").trim();
            } else {
                // .nuevo .comando Texto en misma línea (puede tener más líneas abajo)
                comando = primeraParte.slice(0, primerEspacio).toLowerCase();
                const restoLinea1 = primeraParte.slice(primerEspacio + 1).trim();
                const restoLineas = lineas.slice(1).join("\n").trim();
                mensaje = [restoLinea1, restoLineas].filter(Boolean).join("\n").trim();
            }

            if (!comando.startsWith(".")) {
                await sock.sendMessage(from, { text: "❌ El comando debe empezar con punto." });
                return;
            }

            if (!mensaje) {
                await sock.sendMessage(from, {
                    text: "❌ *Uso:*\n\n" +
                          "Una línea:\n.nuevo .promo 🔥 Oferta del día\n\n" +
                          "Con saltos de línea:\n.nuevo .artemis\n🤖 Hola soy ARTEMIS\nEscribe .menu para más info"
                });
                return;
            }

            if (RESERVADOS.includes(comando)) {
                await sock.sendMessage(from, { text: `⛔ El comando *${comando}* está reservado.` });
                return;
            }

            const actuales = await getComandos(groupId);
            const esNuevo = !actuales[comando];
            await saveComando(groupId, comando, mensaje);
            await sock.sendMessage(from, {
                text: `${esNuevo ? "✅ Comando creado" : "✏️ Comando actualizado"}: *${comando}*`
            });
            return;
        }

        // .editar .comando — mismo formato que .nuevo
        if (firstLine.startsWith(".editar ")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }

            const primeraParte = lineas[0].slice(8).trim();
            const primerEspacio = primeraParte.indexOf(" ");

            let comando, mensaje;

            if (primerEspacio === -1) {
                comando = primeraParte.toLowerCase();
                mensaje = lineas.slice(1).join("\n").trim();
            } else {
                comando = primeraParte.slice(0, primerEspacio).toLowerCase();
                const restoLinea1 = primeraParte.slice(primerEspacio + 1).trim();
                const restoLineas = lineas.slice(1).join("\n").trim();
                mensaje = [restoLinea1, restoLineas].filter(Boolean).join("\n").trim();
            }

            if (!mensaje) {
                await sock.sendMessage(from, {
                    text: "❌ Escribe el nuevo texto:\n.editar .menu\nNuevo texto aquí\nMás líneas si quieres"
                });
                return;
            }

            const actuales = await getComandos(groupId);
            if (!actuales[comando]) {
                await sock.sendMessage(from, { text: `❌ El comando *${comando}* no existe.\nUsa .listar para ver los disponibles.` });
                return;
            }

            await saveComando(groupId, comando, mensaje);
            await sock.sendMessage(from, { text: `✏️ Comando *${comando}* actualizado.` });
            return;
        }

        // .eliminar .comando
        if (firstLine.startsWith(".eliminar ")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const comando = firstLine.slice(10).trim();
            const actuales = await getComandos(groupId);
            if (!actuales[comando]) {
                await sock.sendMessage(from, { text: `❌ El comando *${comando}* no existe.` });
                return;
            }
            await deleteComando(groupId, comando);
            await sock.sendMessage(from, { text: `🗑️ Comando *${comando}* eliminado.` });
            return;
        }

        // .listar
        if (firstLine === ".listar") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const actuales = await getComandos(groupId);
            const lista = Object.keys(actuales).join("\n");
            await sock.sendMessage(from, { text: `📋 *Comandos activos en este grupo:*\n\n${lista}` });
            return;
        }

        // .ayuda
        if (firstLine === ".ayuda") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) return;
            const ayuda =
                `╔════════════════════════════╗\n` +
                `║     🤖  *A R T E M I S*     ║\n` +
                `║    Panel de Administración   ║\n` +
                `╚════════════════════════════╝\n\n` +
                `*── GESTIÓN DE COMANDOS ──*\n\n` +
                `➕ *Crear comando*\n` +
                `┌ .nuevo .comando\n` +
                `└ Texto del mensaje (puede tener\n  varias líneas)\n\n` +
                `✏️ *Editar comando existente*\n` +
                `┌ .editar .comando\n` +
                `└ Nuevo texto del mensaje\n\n` +
                `🗑️ *Eliminar comando*\n` +
                `└ .eliminar .comando\n\n` +
                `📋 *Ver todos los comandos*\n` +
                `└ .listar\n\n` +
                `👋 *Enviar mensaje de bienvenida*\n` +
                `└ .bienvenida\n\n` +
                `*── GESTIÓN DEL GRUPO ──*\n\n` +
                `👤 *Expulsar participante*\n` +
                `└ .expulsar @usuario\n\n` +
                `🔒 *Cerrar grupo* — solo admins escriben\n` +
                `└ .cerrargrupo\n\n` +
                `🔓 *Abrir grupo* — todos pueden escribir\n` +
                `└ .abrirgrupo\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `_Solo los administradores del grupo_\n` +
                `_pueden ejecutar estos comandos._`;
            await sock.sendMessage(from, { text: ayuda });
            return;
        }

        // .bienvenida — editable desde WhatsApp con .editar .bienvenida
        if (firstLine === ".bienvenida") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const actuales = await getComandos(groupId);
            const texto = actuales[".bienvenida"] || DEFAULT_COMANDOS[".bienvenida"];
            await sock.sendMessage(from, { text: texto });
            return;
        }

        // .expulsar @usuario
        if (firstLine.startsWith(".expulsar")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!mentionedJid) {
                await sock.sendMessage(from, { text: "❌ Etiqueta al usuario:\n.expulsar @usuario" });
                return;
            }
            try {
                await sock.groupParticipantsUpdate(from, [mentionedJid], "remove");
                await sock.sendMessage(from, { text: "✅ Usuario expulsado." });
            } catch {
                await sock.sendMessage(from, { text: "❌ No se pudo expulsar. El bot debe ser administrador." });
            }
            return;
        }

        // .cerrargrupo
        if (firstLine === ".cerrargrupo") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            try {
                await sock.groupSettingUpdate(from, "announcement");
                await sock.sendMessage(from, {
                    text:
                        `╔════════════════════════════╗\n` +
                        `║     🔒  *GRUPO CERRADO*     ║\n` +
                        `╚════════════════════════════╝\n\n` +
                        `El grupo ha sido *cerrado temporalmente*.\n\n` +
                        `⚠️ Por el momento solo los administradores\n` +
                        `pueden enviar mensajes.\n\n` +
                        `Agradecemos tu comprensión. 🙏`
                });
            } catch {
                await sock.sendMessage(from, { text: "❌ El bot debe ser administrador del grupo." });
            }
            return;
        }

        // .abrirgrupo
        if (firstLine === ".abrirgrupo") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            try {
                await sock.groupSettingUpdate(from, "not_announcement");
                await sock.sendMessage(from, {
                    text:
                        `╔════════════════════════════╗\n` +
                        `║     🔓  *GRUPO ABIERTO*     ║\n` +
                        `╚════════════════════════════╝\n\n` +
                        `El grupo ha sido *abierto* nuevamente. ✅\n\n` +
                        `Ya pueden participar libremente.\n` +
                        `Recuerda mantener el respeto y las\n` +
                        `normas del grupo. 😊`
                });
            } catch {
                await sock.sendMessage(from, { text: "❌ El bot debe ser administrador del grupo." });
            }
            return;
        }

        // ==============================
        // RESPONDER COMANDOS PERSONALIZADOS
        // Usa solo la primera línea para buscar
        // ==============================
        const comandos = await getComandos(groupId);
        if (comandos[firstLine]) {
            await sock.sendMessage(from, { text: comandos[firstLine] });
        }
    });

    // ==============================
    // BIENVENIDA AUTOMÁTICA
    // Se activa cuando alguien entra al grupo
    // ==============================
    sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
        if (action !== "add") return;

        const bienvenida =
            `╔════════════════════════════╗\n` +
            `║     🤖  *A R T E M I S*     ║\n` +
            `╚════════════════════════════╝\n\n` +
            `¡Bienvenido al grupo! 👋\n\n` +
            `Estoy aquí para brindarte una experiencia\n` +
            `de compra rápida, segura y sin complicaciones.\n\n`;

        try {
            await sock.sendMessage(id, { text: bienvenida });
        } catch (err) {
            console.error("Error enviando bienvenida:", err.message);
        }
    });
}

process.on("uncaughtException", (err) => {
    console.error("❌ uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
    console.error("❌ unhandledRejection:", reason);
});

startBot();
