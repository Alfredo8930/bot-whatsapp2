// services/adminService.js
const crypto = require('crypto');

class AdminService {
    constructor() {
        // Contraseña para comandos remotos (cambia esto)
        this.adminPassword = process.env.ADMIN_PASSWORD || "ArtemisAdmin2026";
        
        // Números autorizados (además del dueño)
        this.authorizedNumbers = (process.env.AUTHORIZED_NUMBERS || "").split(",").filter(Boolean);
    }

    // Verificar si el usuario es admin
    isAuthorized(senderJid) {
        // Extraer número sin @s.whatsapp.net
        const number = senderJid.split('@')[0];
        
        // Verificar si es el dueño (número configurado)
        const isOwner = number === process.env.OWNER_NUMBER;
        
        // Verificar si está en lista autorizada
        const isAuthorized = this.authorizedNumbers.includes(number);
        
        return isOwner || isAuthorized;
    }

    // Verificar contraseña
    verifyPassword(password) {
        return password === this.adminPassword;
    }

    // Generar token para sesión
    generateToken(senderJid) {
        const token = crypto.randomBytes(32).toString('hex');
        return token;
    }
}

module.exports = new AdminService();