// comandos/imagen.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function ejecutarImagen(descripcion) {
    if (!descripcion) {
        return {
            exito: false,
            mensaje: '🎨 *ARTEMIS IMAGEN*\n━━━━━━━━━━━━━━━━━━\n\n❌ *Uso correcto:*\n.imagen [descripción]\n\n📝 *Ejemplos:*\n.imagen un gato con sombrero\n.imagen paisaje montañoso al atardecer\n.imagen robot futurista'
        };
    }
    
    try {
        // Gemini no genera imágenes, así que usamos una API alternativa gratuita
        // Usamos Pollinations (gratis, sin API key)
        const imagenUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(descripcion)}?width=512&height=512&nologo=true`;
        
        const mensaje = `🎨 *ARTEMIS IMAGEN*\n━━━━━━━━━━━━━━━━━━\n\n📝 *Descripción:* ${descripcion}\n\n🖼️ *Generando imagen...*\n\n${imagenUrl}\n\n━━━━━━━━━━━━━━━━━━\n_Powered by Pollinations AI_`;
        
        return { exito: true, mensaje, imagenUrl };
        
    } catch (error) {
        console.error("Error imagen:", error);
        return {
            exito: false,
            mensaje: '❌ No se pudo generar la imagen. Intenta de nuevo.'
        };
    }
}

module.exports = { ejecutarImagen };