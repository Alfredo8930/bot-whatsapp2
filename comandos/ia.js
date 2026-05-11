// comandos/ia.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function ejecutarIA(pregunta) {
    if (!pregunta) {
        return {
            exito: false,
            mensaje: '🤖 *ARTEMIS IA*\n━━━━━━━━━━━━━━━━━━\n\n❌ *Uso correcto:*\n.ia [tu pregunta]\n\n📝 *Ejemplos:*\n.ia ¿Qué es un bot?\n.ia Cuéntame un chiste\n.ia Explica la inteligencia artificial\n.ia Resumen de noticias hoy'
        };
    }
    
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 1000,
            }
        });
        
        const result = await model.generateContent(pregunta);
        const respuesta = result.response.text();
        
        // Limitar respuesta (WhatsApp tiene límite de caracteres)
        const respuestaFinal = respuesta.length > 3000 
            ? respuesta.substring(0, 3000) + "...\n\n(Respuesta truncada)" 
            : respuesta;
        
        const mensaje = `🤖 *ARTEMIS IA*\n━━━━━━━━━━━━━━━━━━\n\n❓ *Tu pregunta:*\n${pregunta}\n\n📝 *Respuesta:*\n${respuestaFinal}\n\n━━━━━━━━━━━━━━━━━━\n_Powered by Google Gemini_`;
        
        return { exito: true, mensaje };
        
    } catch (error) {
        console.error("Error Gemini:", error);
        
        if (error.message.includes("API key")) {
            return {
                exito: false,
                mensaje: '❌ Error: API key no configurada.\nContacta al administrador.'
            };
        }
        
        if (error.message.includes("quota")) {
            return {
                exito: false,
                mensaje: '❌ Límite de uso diario alcanzado.\nIntenta mañana.'
            };
        }
        
        return {
            exito: false,
            mensaje: '❌ Lo siento, no pude procesar tu pregunta. Intenta de nuevo.'
        };
    }
}

module.exports = { ejecutarIA };