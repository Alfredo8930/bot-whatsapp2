// comandos/horoscopo.js
const axios = require('axios');
const translate = require('translate-google');
const horoscoposLocal = require('../data/horoscopos.js');
const { getFormattedDate } = require('../utils/dateUtils.js');

const signosMap = {
    'aries': 'aries', 'tauro': 'taurus', 'geminis': 'gemini',
    'cancer': 'cancer', 'leo': 'leo', 'virgo': 'virgo',
    'libra': 'libra', 'escorpio': 'scorpio', 'sagitario': 'sagittarius',
    'capricornio': 'capricorn', 'acuario': 'aquarius', 'piscis': 'pisces',
    'aquarius': 'aquarius', 'pisces': 'pisces', 'capricorn': 'capricorn',
    'sagittarius': 'sagittarius', 'scorpio': 'scorpio', 'taurus': 'taurus',
    'gemini': 'gemini'
};

const nombresEspañol = {
    aries: 'ARIES', taurus: 'TAURO', gemini: 'GÉMINIS',
    cancer: 'CÁNCER', leo: 'LEO', virgo: 'VIRGO',
    libra: 'LIBRA', scorpio: 'ESCORPIO', sagittarius: 'SAGITARIO',
    capricorn: 'CAPRICORNIO', aquarius: 'ACUARIO', pisces: 'PISCIS'
};

async function obtenerHoroscopoAPI(signo) {
    const signoAPI = signosMap[signo.toLowerCase()];
    if (!signoAPI) return null;
    
    try {
        const response = await axios.get(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${signoAPI}&day=TODAY`);
        
        console.log(`✅ API funcionando para ${signo}`);
        
        if (response.data && response.data.data) {
            const horoscopoIngles = response.data.data.horoscope;
            
            // Traducir a español
            let horoscopoEspanol = horoscopoIngles;
            try {
                horoscopoEspanol = await translate(horoscopoIngles, { to: 'es' });
                console.log(`✅ Traducción completada para ${signo}`);
            } catch (error) {
                console.error(`❌ Error en traducción: ${error.message}`);
                horoscopoEspanol = horoscopoIngles + "\n\n(Texto en inglés - error de traducción)";
            }
            
            return {
                horoscopo: horoscopoEspanol,
                compatibilidad: obtenerCompatibilidad(signoAPI),
                color: obtenerColor(signoAPI),
                numero: Math.floor(Math.random() * 30) + 1,
                estado_animo: obtenerEstadoAnimo(signoAPI)
            };
        }
        return null;
    } catch (error) {
        console.error(`❌ Error API: ${error.message}`);
        return null;
    }
}

function obtenerCompatibilidad(signo) {
    const compatibilidad = {
        aries: 'Leo o Sagitario',
        taurus: 'Virgo o Capricornio',
        gemini: 'Libra o Acuario',
        cancer: 'Escorpio o Piscis',
        leo: 'Aries o Sagitario',
        virgo: 'Tauro o Capricornio',
        libra: 'Géminis o Acuario',
        scorpio: 'Cáncer o Piscis',
        sagittarius: 'Aries o Leo',
        capricorn: 'Tauro o Virgo',
        aquarius: 'Géminis o Libra',
        pisces: 'Cáncer o Escorpio'
    };
    return compatibilidad[signo] || 'Depende de tu energía actual';
}

function obtenerColor(signo) {
    const colores = {
        aries: '🔴 Rojo',
        taurus: '🟢 Verde',
        gemini: '🟡 Amarillo',
        cancer: '⚪ Blanco',
        leo: '🟠 Naranja',
        virgo: '🟤 Marrón',
        libra: '💗 Rosa',
        scorpio: '🟣 Morado',
        sagittarius: '🔵 Azul',
        capricorn: '⚫ Gris',
        aquarius: '🔵 Turquesa',
        pisces: '🟣 Lila'
    };
    return colores[signo] || '🌈 Multicolor';
}

function obtenerEstadoAnimo(signo) {
    const animos = {
        aries: '⚡ Energético',
        taurus: '😌 Tranquilo',
        gemini: '💬 Sociable',
        cancer: '🥺 Sensible',
        leo: '🎭 Confiado',
        virgo: '📋 Organizado',
        libra: '🎨 Romántico',
        scorpio: '🔮 Misterioso',
        sagittarius: '😄 Optimista',
        capricorn: '📈 Ambicioso',
        aquarius: '💡 Creativo',
        pisces: '🎨 Soñador'
    };
    return animos[signo] || '😊 Feliz';
}

function obtenerHoroscopoLocal(signo) {
    const signoKey = signo.toLowerCase();
    let key = null;
    for (const [localKey, apiKey] of Object.entries(signosMap)) {
        if (localKey === signoKey || apiKey === signoKey) {
            key = localKey;
            break;
        }
    }
    if (!key) return null;
    
    const data = horoscoposLocal[key];
    if (!data) return null;
    
    return {
        horoscopo: data.horoscopo,
        compatibilidad: data.compatibilidad,
        color: data.color,
        numero: data.numero,
        estado_animo: data.estado_animo
    };
}

function formatearHoroscopo(signoUsuario, data, fuente = 'api') {
    const signoAPI = signosMap[signoUsuario.toLowerCase()] || signoUsuario.toLowerCase();
    const nombreSigno = nombresEspañol[signoAPI] || signoUsuario.toUpperCase();
    const fechaActual = getFormattedDate();
    
    let mensaje = `🔮 *HORÓSCOPO DE ${nombreSigno}*\n`;
    mensaje += `📅 ${fechaActual}\n\n━━━━━━━━━━━━━━━━━━\n\n`;
    mensaje += `${data.horoscopo}\n\n━━━━━━━━━━━━━━━━━━\n\n`;
    mensaje += `💖 *Compatibilidad:* ${data.compatibilidad}\n`;
    mensaje += `🎨 *Color:* ${data.color}\n`;
    mensaje += `🍀 *Número de suerte:* ${data.numero}\n`;
    mensaje += `😊 *Estado de ánimo:* ${data.estado_animo}\n\n`;
    
    if (fuente === 'local') {
        mensaje += `━━━━━━━━━━━━━━━━━━\n⚠️ *Datos locales* (API no disponible)\n`;
    }
    mensaje += `━━━━━━━━━━━━━━━━━━`;
    return mensaje;
}

async function ejecutarHoroscopo(signoUsuario) {
    if (!signoUsuario) {
        return {
            exito: false,
            mensaje: `❌ *Uso correcto:*\n.horo [signo]\n\n📋 *Signos:* Aries, Tauro, Géminis, Cáncer, Leo, Virgo, Libra, Escorpio, Sagitario, Capricornio, Acuario, Piscis`
        };
    }
    
    if (!signosMap[signoUsuario.toLowerCase()] && !Object.values(signosMap).includes(signoUsuario.toLowerCase())) {
        return {
            exito: false,
            mensaje: `❌ Signo *${signoUsuario}* no válido.\n\n📋 *Signos:* Aries, Tauro, Géminis, Cáncer, Leo, Virgo, Libra, Escorpio, Sagitario, Capricornio, Acuario, Piscis`
        };
    }
    
    let data = await obtenerHoroscopoAPI(signoUsuario);
    let fuente = 'api';
    
    if (!data) {
        data = obtenerHoroscopoLocal(signoUsuario);
        fuente = 'local';
        if (!data) {
            return {
                exito: false,
                mensaje: `❌ No se pudo obtener el horóscopo para *${signoUsuario}*. Intenta más tarde.`
            };
        }
    }
    
    return { exito: true, mensaje: formatearHoroscopo(signoUsuario, data, fuente) };
}

module.exports = { ejecutarHoroscopo };