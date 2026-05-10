// utils/dateUtils.js
function getFormattedDate() {
    const meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = meses[hoy.getMonth()];
    const año = hoy.getFullYear();
    
    return `${dia} de ${mes} de ${año}`;
}

module.exports = { getFormattedDate };