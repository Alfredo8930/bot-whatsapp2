// comandos/horoscopo.js
const axios = require('axios');
const horoscoposLocal = require('../data/horoscopos.js');
const { getFormattedDate } = require('../utils/dateUtils.js');

// Mapeo de signos y sus variantes
const signosMap = {
    // español
    'aries': 'aries',
    'tauro': 'taurus',
    'geminis': 'gemini',
    'geminis': 'gemini',
    'cancer': 'cancer',
    'cáncer': 'cancer',
    'leo': 'leo',
    'virgo': 'virgo',
    'libra': 'libra',
    'escorpio': 'scorpio',
    'escorpión': 'scorpio',
    'sagitario': 'sagittarius',
    'capricornio': 'capricorn',
    'acuario': 'aquarius',
    'piscis': 'pisces',
    // inglés
    'aquarius': 'aquarius',
    'pisces': 'pisces',
    'capricorn': 'capricorn',
    'sagittarius': 'sagittarius',
    'scorpio': 'scorpio',
    'taurus': 'taurus',
    'gemini': 'gemini',
    'cancer': 'cancer',
    'leo': 'leo',
    'virgo': 'virgo',
    'libra': 'libra'
};

// Nombres en español para mostrar
const nombresEspañol = {
    aries: 'ARIES',
    taurus: 'TAURO',
    gemini: 'GÉMINIS',
    cancer: 'CÁNCER',
    leo: 'LEO',
    virgo: 'VIRGO',
    libra: 'LIBRA',
    scorpio: 'ESCORPIO',
    sagittarius: 'SAGITARIO',
    capricorn: 'CAPRICORNIO',
    aquarius: 'ACUARIO',
    pisces: 'PISCIS'
};

async function obtenerHoroscopoAPI(signo) {
    const signoAPI = signosMap[signo.toLowerCase()];
    if (!signoAPI) return null;
    
    // Lista de APIs de respaldo
    const apis = [
        {
            url: `https://aztro.sameerkumar.website/?sign=${signoAPI}&day=today`,
            method: 'post',
            transform: (data) => ({
                horoscopo: data.description,
                compatibilidad: data.compatibility.split(' ')[0],
                color: data.color,
                numero: data.lucky_number,
                estado_animo: data.mood
            })
        },
        {
            url: `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${signoAPI}&day=TODAY`,
            method: 'get',
            transform: (data) => ({
                horoscopo: data.data.horoscope_data,
                compatibilidad: data.data.compatibility,
                color: data.data.color,
                numero: data.data.lucky_number,
                estado_animo: data.data.mood
            })
        }
    ];
    
    for (const api of apis) {
        try {
            let response;
            if (api.method === 'post') {
                response = await axios.post(api.url);
            } else {
                response = await axios.get(api.url);
            }
            
            if (response.data) {
                console.log(`✅ API funcionando: ${api.url}`);
                return api.transform(response.data);
            }
        } catch (error) {
            console.log(`❌ API falló: ${api.url}`);
            continue;
        }
    }
    
    console.error(`❌ Todas las APIs fallaron para ${signo}`);
    return null;
}

function obtenerHoroscopoLocal(signo) {
    const signoKey = signo.toLowerCase();
    // Buscar en el mapa de nombres
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
    const signoKey = signoUsuario.toLowerCase();
    const signoAPI = signosMap[signoKey] || signoKey;
    const nombreSigno = nombresEspañol[signoAPI] || signoUsuario.toUpperCase();
    const fechaActual = getFormattedDate();
    
    let mensaje = `🔮 *HORÓSCOPO DE ${nombreSigno}*\n`;
    mensaje += `📅 ${fechaActual}\n\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━\n\n`;
    mensaje += `${data.horoscopo}\n\n`;
    mensaje += `━━━━━━━━━━━━━━━━━━\n\n`;
    mensaje += `💖 *Compatibilidad:* ${data.compatibilidad}\n`;
    mensaje += `🎨 *Color:* ${data.color}\n`;
    mensaje += `🍀 *Número de suerte:* ${data.numero}\n`;
    mensaje += `😊 *Estado de ánimo:* ${data.estado_animo}\n\n`;
    
    if (fuente === 'local') {
        mensaje += `━━━━━━━━━━━━━━━━━━\n`;
        mensaje += `⚠️ *Horóscopo local* (API temporalmente no disponible)\n`;
    }
    
    mensaje += `━━━━━━━━━━━━━━━━━━`;
    
    return mensaje;
}

async function ejecutarHoroscopo(signoUsuario) {
    if (!signoUsuario) {
        return {
            exito: false,
            mensaje: `❌ *Uso correcto:*\n.horo [signo]\n\n📋 *Signos disponibles:*\nAries, Tauro, Géminis, Cáncer, Leo, Virgo, Libra, Escorpio, Sagitario, Capricornio, Acuario, Piscis`
        };
    }
    
    const signoKey = signoUsuario.toLowerCase();
    if (!signosMap[signoKey] && !Object.values(signosMap).includes(signoKey)) {
        return {
            exito: false,
            mensaje: `❌ Signo *${signoUsuario}* no válido.\n\n📋 *Signos disponibles:*\nAries, Tauro, Géminis, Cáncer, Leo, Virgo, Libra, Escorpio, Sagitario, Capricornio, Acuario, Piscis`
        };
    }
    
    // Intentar API primero
    let data = await obtenerHoroscopoAPI(signoUsuario);
    let fuente = 'api';
    
    // Fallback a local si API falla
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
    
    const mensaje = formatearHoroscopo(signoUsuario, data, fuente);
    
    return {
        exito: true,
        mensaje: mensaje
    };
}

module.exports = { ejecutarHoroscopo };