// comandos/adminCommands.js
const maintenanceService = require('../services/maintenanceService');
const adminService = require('../services/adminService');

// Variable global para sessionService (se setea desde index.js)
let sessionServiceGlobal = null;

function setSessionService(service) {
    sessionServiceGlobal = service;
}

async function ejecutarComandoAdmin(comando, args, senderJid, sock, grupos) {
    if (!adminService.isAuthorized(senderJid)) {
        return {
            exito: false,
            mensaje: '⛔ *ACCESO DENEGADO*\n\nNo tienes permiso para usar comandos de administración.'
        };
    }

    // .estado
    if (comando === '.estado') {
        const status = maintenanceService.getStatus();
        return {
            exito: true,
            mensaje: `📊 *ESTADO DEL BOT*\n━━━━━━━━━━━━━━━━━━\n\n${status.message}`
        };
    }

    // .mantenimiento on
    if (comando === '.mantenimiento' && args[0] === 'on') {
        const razon = args.slice(1).join(' ') || 'Actualización del sistema';
        const result = maintenanceService.activate(razon);
        
        for (const grupo of grupos) {
            try {
                await sock.sendMessage(grupo, { text: result.message });
            } catch (error) {}
        }
        return { exito: true, mensaje: result.message };
    }

    // .mantenimiento off
    if (comando === '.mantenimiento' && args[0] === 'off') {
        const result = maintenanceService.deactivate();
        
        for (const grupo of grupos) {
            try {
                await sock.sendMessage(grupo, { text: result.message });
            } catch (error) {}
        }
        return { exito: true, mensaje: result.message };
    }

    // .reset-session - Forzar nueva vinculación (solo dueño)
    //if (comando === '.reset-session') {
       // if (sessionServiceGlobal) {
         //   await sessionServiceGlobal.deleteSession('./auth');
          //  return {
           //     exito: true,
             /*   mensaje: '🔄 Sesión reiniciada. Reinicia el bot para vincular nuevamente.'
            };
        } else {
            return {
                exito: false,
                mensaje: '❌ Servicio de sesión no disponible.'
            };
        }
    }*/

    return {
        exito: false,
        mensaje: '❌ Comandos: .estado | .mantenimiento on [razón] | .mantenimiento off | .reset-session'
    };
}

module.exports = { ejecutarComandoAdmin, setSessionService };