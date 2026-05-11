// services/sessionService.js
const fs = require('fs');
const path = require('path');

class SessionService {
    constructor(db) {
        this.db = db;
        this.collection = db.collection('sessions');
    }

    // Guardar sesión en MongoDB
    async saveSession(authFolder) {
        try {
            const credsPath = path.join(authFolder, 'creds.json');
            if (fs.existsSync(credsPath)) {
                const credsContent = fs.readFileSync(credsPath, 'utf-8');
                const base64Creds = Buffer.from(credsContent).toString('base64');
                
                await this.collection.updateOne(
                    { _id: 'whatsapp_session' },
                    { 
                        $set: { 
                            creds: base64Creds,
                            updatedAt: new Date()
                        } 
                    },
                    { upsert: true }
                );
                console.log("✅ Sesión guardada en MongoDB");
                return true;
            }
        } catch (error) {
            console.error("❌ Error guardando sesión:", error);
            return false;
        }
    }

    // Cargar sesión desde MongoDB
    async loadSession(authFolder) {
        try {
            const doc = await this.collection.findOne({ _id: 'whatsapp_session' });
            
            if (doc && doc.creds) {
                const credsPath = path.join(authFolder, 'creds.json');
                const credsBuffer = Buffer.from(doc.creds, 'base64');
                const credsString = credsBuffer.toString('utf-8');
                
                // Crear carpeta si no existe
                if (!fs.existsSync(authFolder)) {
                    fs.mkdirSync(authFolder, { recursive: true });
                }
                
                fs.writeFileSync(credsPath, credsString);
                console.log("✅ Sesión cargada desde MongoDB");
                return true;
            }
            console.log("📱 No hay sesión guardada. Se generará nueva.");
            return false;
        } catch (error) {
            console.error("❌ Error cargando sesión:", error);
            return false;
        }
    }

    // Eliminar sesión (para forzar nueva vinculación)
    async deleteSession(authFolder) {
        try {
            await this.collection.deleteOne({ _id: 'whatsapp_session' });
            if (fs.existsSync(authFolder)) {
                fs.rmSync(authFolder, { recursive: true, force: true });
            }
            console.log("🗑️ Sesión eliminada");
            return true;
        } catch (error) {
            console.error("❌ Error eliminando sesión:", error);
            return false;
        }
    }
}

module.exports = SessionService;