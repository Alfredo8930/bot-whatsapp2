// services/maintenanceService.js
const fs = require('fs');
const path = require('path');

class MaintenanceService {
    constructor() {
        this.maintenanceMode = false;
        this.maintenanceFile = path.join(__dirname, '../data/maintenance.json');
        this.loadStatus();
    }

    // Cargar estado guardado
    loadStatus() {
        try {
            if (fs.existsSync(this.maintenanceFile)) {
                const data = JSON.parse(fs.readFileSync(this.maintenanceFile, 'utf-8'));
                this.maintenanceMode = data.maintenanceMode || false;
                console.log(`📌 Estado mantenimiento: ${this.maintenanceMode ? 'ACTIVO' : 'INACTIVO'}`);
            }
        } catch (error) {
            console.error('Error cargando estado:', error);
        }
    }

    // Guardar estado
    saveStatus() {
        try {
            fs.writeFileSync(this.maintenanceFile, JSON.stringify({
                maintenanceMode: this.maintenanceMode,
                lastUpdate: new Date()
            }));
        } catch (error) {
            console.error('Error guardando estado:', error);
        }
    }

    // Activar mantenimiento
    activate(reason = 'Mantenimiento programado') {
        this.maintenanceMode = true;
        this.saveStatus();
        return {
            status: true,
            message: `🔧 *MODO MANTENIMIENTO ACTIVADO*\n\n📝 Razón: ${reason}\n\n⚠️ El bot no responderá comandos hasta nuevo aviso.`
        };
    }

    // Desactivar mantenimiento
    deactivate() {
        this.maintenanceMode = false;
        this.saveStatus();
        return {
            status: false,
            message: `✅ *MODO MANTENIMIENTO DESACTIVADO*\n\n🟢 El bot está completamente operativo nuevamente.\n\nGracias por tu paciencia.`
        };
    }

    // Verificar si está en mantenimiento
    isMaintenanceMode() {
        return this.maintenanceMode;
    }

    // Obtener estado
    getStatus() {
        return {
            maintenanceMode: this.maintenanceMode,
            message: this.maintenanceMode 
                ? '🔧 Bot en mantenimiento - Comandos temporalmente deshabilitados'
                : '✅ Bot operativo - Todos los comandos disponibles'
        };
    }
}

module.exports = new MaintenanceService();