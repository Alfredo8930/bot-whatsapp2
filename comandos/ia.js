// comandos/ia.js
const Groq = require("groq-sdk");

// Inicializar Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function ejecutarIA(pregunta) {
    if (!pregunta) {
        return {
            exito: false,
            mensaje: '🤖 *ARTEMIS IA*\n━━━━━━━━━━━━━━━━━━\n\n❌ *Uso correcto:*\n.ia [tu pregunta]\n\n📝 *Ejemplos:*\n.ia ¿Qué es un bot?\n.ia Cuéntame un chiste\n.ia Explica la inteligencia artificial\n.ia Resumen de noticias hoy'
        };
    }

    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: "Eres ARTEMIS, un asistente inteligente de WhatsApp. Responde siempre en español, de forma clara, concisa y amigable. Máximo 2000 caracteres."
                },
                {
                    role: "user",
                    content: pregunta
                }
            ],
            temperature: 0.9,
            max_tokens: 1000
        });

        const respuesta = completion.choices[0]?.message?.content || "Sin respuesta.";

        const respuestaFinal = respuesta.length > 3000
            ? respuesta.substring(0, 3000) + "...\n\n(Respuesta truncada)"
            : respuesta;

        const mensaje =
            `🤖 *ARTEMIS IA*\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `❓ *Tu pregunta:*\n${pregunta}\n\n` +
            `📝 *Respuesta:*\n${respuestaFinal}\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `_Powered by Groq AI_ ⚡`;

        return { exito: true, mensaje };

    } catch (error) {
        console.error("Error Groq:", error);

        if (error.message?.includes("API key") || error.message?.includes("auth")) {
            return {
                exito: false,
                mensaje: '❌ Error: GROQ_API_KEY no configurada.\nContacta al administrador.'
            };
        }

        if (error.message?.includes("quota") || error.message?.includes("rate")) {
            return {
                exito: false,
                mensaje: '❌ Límite de uso alcanzado.\nIntenta en unos minutos.'
            };
        }

        return {
            exito: false,
            mensaje: '❌ Lo siento, no pude procesar tu pregunta. Intenta de nuevo.'
        };
    }
}

module.exports = { ejecutarIA };