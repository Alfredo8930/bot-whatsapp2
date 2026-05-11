// utils/dateUtils.js
function getFormattedDate() {
    const meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    
    // Forzar hora de México (UTC-6)
    const ahora = new Date();
    const fechaMexico = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    
    const dia = fechaMexico.getDate();
    const mes = meses[fechaMexico.getMonth()];
    const año = fechaMexico.getFullYear();
    
    return `${dia} de ${mes} de ${año}`;
}

module.exports = { getFormattedDate };