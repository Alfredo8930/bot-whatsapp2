// comandos/adminCommands.js
const maintenanceService = require('../services/maintenanceService');
const adminService = require('../services/adminService');

async function ejecutarComandoAdmin(comando, args, senderJid, sock, grupos) {
    // Verificar autorización
    if (!adminService.isAuthorized(senderJid)) {
        return {
            exito: false,
            mensaje: '⛔ *ACCESO DENEGADO*\n\nNo tienes permiso para usar comandos de administración remota.\n\nEste incidente ha sido registrado.'
        };
    }

    // .mantenimiento on [razón]
    if (comando === '.mantenimiento' && args[0] === 'on') {
        const razon = args.slice(1).join(' ') || 'Actualización del sistema';
        const result = maintenanceService.activate(razon);
        
        // Enviar aviso a todos los grupos
        await enviarAvisoATodos(sock, grupos, result.message);
        
        return {
            exito: true,
            mensaje: result.message
        };
    }

    // .mantenimiento off
    if (comando === '.mantenimiento' && args[0] === 'off') {
        const result = maintenanceService.deactivate();
        
        // Enviar aviso a todos los grupos
        await enviarAvisoATodos(sock, grupos, result.message);
        
        return {
            exito: true,
            mensaje: result.message
        };
    }

    // .estado - ver estado actual
    if (comando === '.estado') {
        const status = maintenanceService.getStatus();
        return {
            exito: true,
            mensaje: `📊 *ESTADO DEL BOT*\n━━━━━━━━━━━━━━━━━━\n\n${status.message}\n\n🔐 *Admin remoto:* ${adminService.isAuthorized(senderJid) ? '✅ Autorizado' : '❌ No autorizado'}`
        };
    }

    // .aviso [mensaje] - enviar aviso a todos los grupos
    if (comando === '.aviso-todos') {
        const mensaje = args.join(' ');
        if (!mensaje) {
            return {
                exito: false,
                mensaje: '❌ Uso: .aviso-todos [mensaje]'
            };
        }
        
        const aviso = `📢 *AVISO IMPORTANTE*\n━━━━━━━━━━━━━━━━━━\n\n${mensaje}\n\n━━━━━━━━━━━━━━━━━━\n_Administración Artemis_`;
        
        await enviarAvisoATodos(sock, grupos, aviso);
        
        return {
            exito: true,
            mensaje: `✅ Aviso enviado a ${grupos.length} grupos`
        };
    }

    return {
        exito: false,
        mensaje: '❌ Comando no reconocido.\n\nComandos disponibles:\n.mantenimiento on [razón]\n.mantenimiento off\n.estado\n.aviso-todos [mensaje]'
    };
}

// Función para enviar aviso a todos los grupos
async function enviarAvisoATodos(sock, grupos, mensaje) {
    const gruposActivos = grupos.filter(g => g !== undefined);
    
    for (const grupo of gruposActivos) {
        try {
            await sock.sendMessage(grupo, { text: mensaje });
            await delay(1000); // Esperar 1 segundo entre grupos para evitar spam
        } catch (error) {
            console.error(`Error enviando a ${grupo}:`, error.message);
        }
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { ejecutarComandoAdmin, enviarAvisoATodos };