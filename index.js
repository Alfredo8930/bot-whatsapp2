const fs = require("fs");

if (fs.existsSync("./auth")) {
    fs.rmSync("./auth", { recursive: true, force: true });
    console.log("🧹 Carpeta auth eliminada");
}

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require("@whiskeysockets/baileys");

const { MongoClient } = require("mongodb");
const path = require("path");

// Después de los otros requires
const { ejecutarHoroscopo } = require('./comandos/horoscopo.js');

const { ejecutarIA } = require('./comandos/ia.js');
const { ejecutarImagen } = require('./comandos/imagen.js');

// Después de los otros requires
const maintenanceService = require('./services/maintenanceService');
const adminService = require('./services/adminService');
const { ejecutarComandoAdmin } = require('./comandos/adminCommands');

// Array para almacenar grupos activos
const gruposActivos = new Set();

// ==============================
// MONGODB
// ==============================
const MONGO_URI = process.env.MONGO_URI;
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
const DEFAULT_COMANDOS = {};

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

// Guardar imagen en MongoDB como base64 asociada a un comando
async function saveImagen(groupId, comando, base64Data, mimetype, caption) {
    const clave = comando.startsWith(".") ? comando.slice(1) : comando;
    await col("imagenes").updateOne(
        { _id: groupId },
        { $set: { [`imgs.${clave}`]: { data: base64Data, mimetype, caption } } },
        { upsert: true }
    );
}

// Obtener imagen de un comando
async function getImagen(groupId, comando) {
    const clave = comando.startsWith(".") ? comando.slice(1) : comando;
    const doc = await col("imagenes").findOne({ _id: groupId });
    return doc?.imgs?.[clave] || null;
}

// Listar comandos de imagen de un grupo
async function listarImagenes(groupId) {
    const doc = await col("imagenes").findOne({ _id: groupId });
    if (!doc?.imgs) return [];
    return Object.keys(doc.imgs).map(k => `.${k}`);
}

// Eliminar imagen — limpia documento si queda vacío
async function deleteImagen(groupId, comando) {
    const clave = comando.startsWith(".") ? comando.slice(1) : comando;
    await col("imagenes").updateOne(
        { _id: groupId },
        { $unset: { [`imgs.${clave}`]: "" } }
    );
    // Limpiar documento si imgs quedó vacío
    const doc = await col("imagenes").findOne({ _id: groupId });
    if (doc && (!doc.imgs || Object.keys(doc.imgs).length === 0)) {
        await col("imagenes").deleteOne({ _id: groupId });
    }
}

// ==============================
// ANTILINKS — estado por grupo
// ==============================
async function getAntilinks(groupId) {
    const doc = await col("grupos").findOne({ _id: groupId });
    return doc?.antilinks === true;
}

async function setAntilinks(groupId, estado) {
    await col("grupos").updateOne(
        { _id: groupId },
        { $set: { antilinks: estado } },
        { upsert: true }
    );
}

// ==============================
// REGLAS — por grupo
// ==============================
async function getReglas(groupId) {
    const doc = await col("grupos").findOne({ _id: groupId });
    return doc?.reglas || null;
}

async function saveReglas(groupId, texto) {
    await col("grupos").updateOne(
        { _id: groupId },
        { $set: { reglas: texto } },
        { upsert: true }
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
    ".ayuda", ".cerrargrupo", ".abrirgrupo", ".expulsar", ".aviso", ".img", ".link",
    ".antilinks", ".reglas", ".verreglas", ".n"
];

// ==============================
// COOLDOWN — anti-spam (5s por usuario por grupo)
// ==============================
const cooldowns = new Map();
const COOLDOWN_MS = 5000;

function checkCooldown(groupId, jid) {
    const key = `${groupId}:${jid}`;
    const now = Date.now();
    if (cooldowns.has(key) && now - cooldowns.get(key) < COOLDOWN_MS) return false;
    cooldowns.set(key, now);
    return true;
}

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


        // MANEJO DE MENSAJES PRIVADOS (SOLO DUEÑO)
        if (!from.endsWith("@g.us")) {
            const senderJid = msg.key.participantAlt || msg.key.participant || msg.participant || from;
            const rawText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
            
            if (!rawText) return;
            
            if (adminService.isAuthorized(senderJid)) {
                const [cmd, ...args] = rawText.split(' ');
                const resultado = await ejecutarComandoAdmin(cmd, args, senderJid, sock, Array.from(gruposActivos));
                await sock.sendMessage(from, { text: resultado.mensaje });
                return;
            } else {
                await sock.sendMessage(from, { text: "🤖 *ARTEMIS BOT*\n\nEste bot solo funciona en grupos.\n\nSi eres administrador, contacta al dueño." });
                return;
            }
        }

        // REGISTRAR GRUPOS ACTIVOS
        const groupId = from;
        if (!gruposActivos.has(groupId)) {
            gruposActivos.add(groupId);
        }

        // VERIFICAR MANTENIMIENTO (SOLO PARA NO-ADMINS)
        const lidJid = msg.key.participant || msg.participant || from;
        const senderJid = msg.key.participantAlt || lidJid;

        if (maintenanceService.isMaintenanceMode() && !(await isAdmin(sock, groupId, lidJid, senderJid))) {
            await sock.sendMessage(from, { text: "🔧 *BOT EN MANTENIMIENTO*\n\nVuelve pronto!" });
            return;
        }

        // rawText completo con saltos de línea
        const rawText = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            ""
        ).trim();

        if (!rawText) return;

        // ==============================
        // ANTILINKS — eliminar mensajes con links si está activo
        // ==============================
        const tieneLink = /https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|bit\.ly|t\.me|discord\.gg|discord\.com\/invite|t\.me\/|telegram\.me\/|\.com|\.net|\.io|\.org|\.xyz/i.test(rawText);
        if (tieneLink) {
            const antilinkActivo = await getAntilinks(groupId);
            if (antilinkActivo) {
                const esAdminSender = await isAdmin(sock, groupId, lidJid, senderJid);
                if (!esAdminSender) {
                    try {
                        await sock.sendMessage(from, {
                            delete: msg.key
                        });
                        await sock.sendMessage(from, {
                            text: `⛔ @${lidJid.split("@")[0]} los links no están permitidos en este grupo.`,
                            mentions: [lidJid]
                        });
                    } catch (err) {
                        console.error("Error eliminando link:", err.message);
                    }
                    return;
                }
            }
        }

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

        // .eliminar .comando — elimina texto e imagen
        if (firstLine.startsWith(".eliminar ")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const comando = firstLine.slice(10).trim();
            const actuales = await getComandos(groupId);
            const imgExiste = await getImagen(groupId, comando);
            const textoExiste = !!actuales[comando];

            if (!textoExiste && !imgExiste) {
                await sock.sendMessage(from, { text: `❌ El comando *${comando}* no existe.` });
                return;
            }

            const eliminados = [];
            if (textoExiste) {
                await deleteComando(groupId, comando);
                eliminados.push("texto");
            }
            if (imgExiste) {
                await deleteImagen(groupId, comando);
                eliminados.push("imagen");
            }
            await sock.sendMessage(from, {
                text: `🗑️ Comando *${comando}* eliminado (${eliminados.join(" y ")}).`
            });
            return;
        }

        // .listar — muestra comandos de texto e imágenes
        if (firstLine === ".listar") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const actuales = await getComandos(groupId);
            const imgs = await listarImagenes(groupId);

            const textoComandos = Object.keys(actuales).length > 0
                ? Object.keys(actuales).join("\n")
                : "_Ninguno_";

            const textoImgs = imgs.length > 0
                ? imgs.join("\n")
                : "_Ninguna_";

            await sock.sendMessage(from, {
                text:
                    `╔═══════╗\n` +
                    `  📋 *COMANDOS ACTIVOS*\n` +
                    `╚═══════╝\n\n` +
                    `*── Texto ──*\n${textoComandos}\n\n` +
                    `*── Imágenes 🖼️ ──*\n${textoImgs}`
            });
            return;
        }

        // .ayuda (versión actualizada con horóscopo)
        if (firstLine === ".ayuda") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) return;
            const ayuda =
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  🤖 *A R T E M I S*\n` +
                `_Panel de Administración_\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  📋 *COMANDOS DE TEXTO*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `➕ *Crear comando*\n` +
                `┌ .nuevo .comando\n` +
                `└ Texto (soporta varias líneas)\n\n` +
                `✏️ *Editar comando*\n` +
                `┌ .editar .comando\n` +
                `└ Nuevo texto\n\n` +
                `🗑️ *Eliminar comando o imagen*\n` +
                `└ .eliminar .comando\n\n` +
                `📋 *Ver comandos activos*\n` +
                `└ .listar\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  🖼️ *COMANDOS DE IMAGEN*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `📸 *Guardar imagen*\n` +
                `┌ Responde una imagen con:\n` +
                `└ .img .comando Texto opcional\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  📨 *DIFUSIÓN*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `📩 *Reenviar mensaje al grupo*\n` +
                `└ Responde cualquier msg con: .n\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  ⚙️ *GESTIÓN DEL GRUPO*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `📢 *Aviso al grupo*\n` +
                `└ .aviso Texto del mensaje\n\n` +
                `🔗 *Link de invitación*\n` +
                `└ .link\n\n` +
                `👤 *Expulsar participante*\n` +
                `└ .expulsar @usuario\n\n` +
                `🔒 *Cerrar grupo:* .cerrargrupo\n` +
                `🔓 *Abrir grupo:* .abrirgrupo\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  🔮 *COMANDOS PÚBLICOS*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `✨ *Horóscopo del día*\n` +
                `└ .horo [signo]\n` +
                `Ejemplo: .horo acuario\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  🤖 *COMANDOS DE IA*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `💬 *Preguntar a IA*\n` +
                `└ .ia [tu pregunta]\n` +
                `Ejemplo: .ia ¿Qué es el amor?\n\n` +
                `🎨 *Generar imagen*\n` +
                `└ .imagen [descripción]\n` +
                `Ejemplo: .imagen un dragon volando\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `  🛡️ *SEGURIDAD*\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━\n\n` +
                `🚫 *Activar anti-links*\n` +
                `└ .antilinks on\n\n` +
                `✅ *Desactivar anti-links*\n` +
                `└ .antilinks off\n\n` +
                `📋 *Guardar reglas del grupo*\n` +
                `┌ .reglas\n` +
                `└ Texto de las reglas\n\n` +
                `👁️ *Ver reglas* (todos)\n` +
                `└ .verreglas\n\n` +
                `━━━━━━━━┛ ✠ ┗━━━━━━━━\n` +
                `_Solo admins pueden usar comandos de administración._\n` +
                `_ .horo disponible para todos._\n` +
                `━━━━━━━━┓ ✠ ┏━━━━━━━━`;
            await sock.sendMessage(from, { text: ayuda });
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
        // .antilinks on/off
        if (firstLine === ".antilinks on" || firstLine === ".antilinks off") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const estado = firstLine === ".antilinks on";
            await setAntilinks(groupId, estado);
            await sock.sendMessage(from, {
                text: estado
                    ? "🔒 *Antilinks activado*\nLos links serán eliminados automáticamente."
                    : "🔓 *Antilinks desactivado*\nLos links están permitidos en el grupo."
            });
            return;
        }

        // .reglas — guardar reglas del grupo
        if (firstLine.startsWith(".reglas")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const restoLinea1 = lineas[0].slice(7).trim();
            const restoLineas = lineas.slice(1).join("\n").trim();
            const textoReglas = [restoLinea1, restoLineas].filter(Boolean).join("\n").trim();

            if (!textoReglas) {
                await sock.sendMessage(from, {
                    text: "❌ Escribe las reglas:\n.reglas\n1. Respeto ante todo\n2. No spam\n3. No links"
                });
                return;
            }
            await saveReglas(groupId, textoReglas);
            await sock.sendMessage(from, { text: "✅ Reglas del grupo guardadas." });
            return;
        }

        // .verreglas — ver reglas del grupo (todos pueden usarlo)
        if (firstLine === ".verreglas") {
            const reglas = await getReglas(groupId);
            if (!reglas) {
                await sock.sendMessage(from, { text: "📋 Este grupo no tiene reglas configuradas aún." });
            } else {
                await sock.sendMessage(from, {
                    text: `╔═══════╗\n` +
                          `   📋 *REGLAS DEL GRUPO*\n` +
                          `╚═══════╝\n\n` +
                          `${reglas}\n\n` +
                          `╔═══════╗\n` +
                          `_Al estar en este grupo aceptas las reglas._\n` +
                          `╚═══════╝`
                });
            }
            return;
        }

        // .aviso — menciona a todos con un mensaje destacado
        // Solo admins. Formato:
        //   .aviso Texto en una línea
        //   o
        //   .aviso
        //   Texto multilínea
        // ==============================
        if (firstLine.startsWith(".aviso")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }

            const restoLinea1 = lineas[0].slice(6).trim();
            const restoLineas = lineas.slice(1).join("\n").trim();
            const textoAviso = [restoLinea1, restoLineas].filter(Boolean).join("\n").trim();

            if (!textoAviso) {
                await sock.sendMessage(from, {
                    text: "❌ Escribe el aviso:\n.aviso Texto del aviso"
                });
                return;
            }

            const pushName = msg.pushName || "Administrador";
            const mensajeAviso =
                `╭━━━〔 📢 *AVISO DE ${pushName.toUpperCase()}* 〕━━━⬣\n\n` +
                `${textoAviso}\n\n` +
                `╰━━━━━━━━━━━━━━━━━━━━⬣`;

            await sock.sendMessage(from, { text: mensajeAviso });
            return;
        }

        // .link — genera el link de invitación del grupo
        if (firstLine === ".link") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            try {
                const code = await sock.groupInviteCode(groupId);
                const link = `https://chat.whatsapp.com/${code}`;
                await sock.sendMessage(from, {
                    text: `🔗 *Link de invitación del grupo:*\n\n${link}\n\n_Este link puede ser usado por cualquiera para unirse al grupo._`
                });
            } catch {
                await sock.sendMessage(from, { text: "❌ No se pudo obtener el link. El bot debe ser administrador." });
            }
            return;
        }

        // Agregar después del bloque de .link y antes de .img

        // ==============================
        // .horo — HORÓSCOPO DINÁMICO
        // ==============================
        if (firstLine.startsWith(".horo ")) {
            // No requiere ser admin, cualquiera puede usarlo
            const signo = firstLine.slice(6).trim(); // quita ".horo "
            const resultado = await ejecutarHoroscopo(signo);
            await sock.sendMessage(from, { text: resultado.mensaje });
            return;
        }

        // ==============================
        // .ia — INTELIGENCIA ARTIFICIAL
        // ==============================
        if (firstLine.startsWith(".ia ")) {
            const pregunta = firstLine.slice(4).trim();
            const resultado = await ejecutarIA(pregunta);
            await sock.sendMessage(from, { text: resultado.mensaje });
            return;
        }

        // ==============================
        // .imagen — GENERAR IMAGEN CON IA
        // ==============================
        if (firstLine.startsWith(".imagen ")) {
            const descripcion = firstLine.slice(8).trim();
            const resultado = await ejecutarImagen(descripcion);
            await sock.sendMessage(from, { text: resultado.mensaje });
            return;
        }

         // .estado - ver estado del bot (desde grupos, solo admins)
        if (firstLine === ".estado") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }
            const status = maintenanceService.getStatus();
            await sock.sendMessage(from, { text: `📊 *ESTADO DEL BOT*\n━━━━━━━━━━━━━━━━━━\n\n${status.message}` });
            return;
        }

        // ==============================
        // .img — guardar imagen con comando
        // Uso: responde a una imagen con .img .comando Descripción opcional
        // Para ver imagen: escribe .comando (igual que cualquier otro comando)
        // Para eliminar: .eliminar .comando (usa la colección de imágenes)
        // ==============================
        if (firstLine.startsWith(".img ")) {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }

            const parteComando = lineas[0].slice(5).trim().split(" ")[0].toLowerCase();
            const caption = lineas[0].slice(5 + parteComando.length).trim() || "";

            if (!parteComando.startsWith(".")) {
                await sock.sendMessage(from, { text: "❌ El comando debe empezar con punto.\nEjemplo: .img .promo Texto opcional" });
                return;
            }

            // La imagen debe venir en el mensaje citado (reply) o en el mismo mensaje
            const imgMsg = msg.message?.imageMessage ||
                           msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

            if (!imgMsg) {
                await sock.sendMessage(from, { text: "❌ Responde a una imagen con .img .comando\n\nEjemplo:\n1. Sube la imagen al grupo\n2. Respóndela con: .img .promo Texto opcional" });
                return;
            }

            // Validar tamaño de imagen (máx 5MB)
            const fileLength = imgMsg.fileLength || imgMsg.fileEncSha256?.length || 0;
            if (fileLength > 5 * 1024 * 1024) {
                await sock.sendMessage(from, { text: "❌ La imagen es demasiado grande. Máximo permitido: 5MB." });
                return;
            }

            try {
                const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                const buffer = await downloadMediaMessage(
                    {
                        key: msg.message?.extendedTextMessage?.contextInfo?.stanzaId
                            ? { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId, remoteJid: from, participant: msg.message.extendedTextMessage.contextInfo.participant }
                            : msg.key,
                        message: msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message
                    },
                    "buffer",
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                );
                const base64 = buffer.toString("base64");
                const mimetype = imgMsg.mimetype || "image/jpeg";
                await saveImagen(groupId, parteComando, base64, mimetype, caption);
                await sock.sendMessage(from, { text: `✅ Imagen guardada en *${parteComando}*` });
            } catch (err) {
                console.error("Error guardando imagen:", err.message);
                await sock.sendMessage(from, { text: "❌ No se pudo guardar la imagen. Intenta de nuevo." });
            }
            return;
        }

        // ==============================
        // RESPONDER COMANDOS PERSONALIZADOS
        // Usa solo la primera línea para buscar
        // ==============================
        // .n — reenviar mensaje citado al grupo
        if (firstLine === ".n") {
            if (!await isAdmin(sock, groupId, lidJid, senderJid)) {
                await sock.sendMessage(from, { text: "⛔ Solo administradores." });
                return;
            }

            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            const stanzaId = ctx?.stanzaId;
            const participant = ctx?.participant;

            if (!quoted || !stanzaId) {
                await sock.sendMessage(from, { text: "❌ Responde a un mensaje con .n para reenviarlo." });
                return;
            }

            try {
                // Detectar tipo de mensaje y reenviarlo correctamente
                if (quoted.conversation || quoted.extendedTextMessage) {
                    const texto = quoted.conversation || quoted.extendedTextMessage?.text || "";
                    await sock.sendMessage(from, { text: texto });

                } else if (quoted.imageMessage) {
                    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                    const buffer = await downloadMediaMessage(
                        { key: { remoteJid: from, id: stanzaId, participant }, message: quoted },
                        "buffer", {}, { reuploadRequest: sock.updateMediaMessage }
                    );
                    await sock.sendMessage(from, {
                        image: buffer,
                        caption: quoted.imageMessage.caption || "",
                        mimetype: quoted.imageMessage.mimetype || "image/jpeg"
                    });

                } else if (quoted.videoMessage) {
                    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                    const buffer = await downloadMediaMessage(
                        { key: { remoteJid: from, id: stanzaId, participant }, message: quoted },
                        "buffer", {}, { reuploadRequest: sock.updateMediaMessage }
                    );
                    await sock.sendMessage(from, {
                        video: buffer,
                        caption: quoted.videoMessage.caption || "",
                        mimetype: quoted.videoMessage.mimetype || "video/mp4"
                    });

                } else if (quoted.stickerMessage) {
                    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                    const buffer = await downloadMediaMessage(
                        { key: { remoteJid: from, id: stanzaId, participant }, message: quoted },
                        "buffer", {}, { reuploadRequest: sock.updateMediaMessage }
                    );
                    await sock.sendMessage(from, {
                        sticker: buffer,
                        mimetype: quoted.stickerMessage.mimetype || "image/webp"
                    });

                } else if (quoted.documentMessage) {
                    const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                    const buffer = await downloadMediaMessage(
                        { key: { remoteJid: from, id: stanzaId, participant }, message: quoted },
                        "buffer", {}, { reuploadRequest: sock.updateMediaMessage }
                    );
                    await sock.sendMessage(from, {
                        document: buffer,
                        mimetype: quoted.documentMessage.mimetype,
                        fileName: quoted.documentMessage.fileName || "archivo"
                    });

                } else {
                    await sock.sendMessage(from, { text: "❌ Tipo de mensaje no soportado para reenviar." });
                }
            } catch (err) {
                console.error("Error reenviando mensaje:", err.message);
                await sock.sendMessage(from, { text: "❌ No se pudo reenviar el mensaje." });
            }
            return;
        }

        // Primero buscar si es un comando de imagen
        const imgGuardada = await getImagen(groupId, firstLine);
        if (imgGuardada) {
            await sock.sendMessage(from, {
                image: Buffer.from(imgGuardada.data, "base64"),
                caption: imgGuardada.caption || "",
                mimetype: imgGuardada.mimetype || "image/jpeg"
            });
            return;
        }

        // Luego buscar en comandos de texto
        const comandos = await getComandos(groupId);
        if (comandos[firstLine]) {
            await sock.sendMessage(from, { text: comandos[firstLine] });
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
