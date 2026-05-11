// comandos/imagen.js
const axios = require("axios");

async function ejecutarImagen(descripcion, sock, from) {
    if (!descripcion) {
        return {
            exito: false,
            mensaje: '🎨 *ARTEMIS IMAGEN*\n━━━━━━━━━━━━━━━━━━\n\n❌ *Uso correcto:*\n.imagen [descripción]\n\n📝 *Ejemplos:*\n.imagen un gato con sombrero\n.imagen paisaje montañoso al atardecer\n.imagen robot futurista'
        };
    }

    try {
        const imagenUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(descripcion)}?width=512&height=512&nologo=true`;

        // Descargar la imagen como buffer
        const response = await axios.get(imagenUrl, {
            responseType: "arraybuffer",
            timeout: 15000
        });

        const buffer = Buffer.from(response.data);

        // Mandar imagen real al grupo
        await sock.sendMessage(from, {
            image: buffer,
            caption: `🎨 *ARTEMIS IMAGEN*\n━━━━━━━━━━━━━━━━━━\n\n📝 *${descripcion}*\n\n_Powered by Pollinations AI_`,
            mimetype: "image/jpeg"
        });

        return { exito: true, mensaje: null }; // null porque ya se mandó la imagen directamente

    } catch (error) {
        console.error("Error imagen:", error.message);
        return {
            exito: false,
            mensaje: '❌ No se pudo generar la imagen. Intenta con otra descripción.'
        };
    }
}

module.exports = { ejecutarImagen };