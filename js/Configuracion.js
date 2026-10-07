function abrirVentana(ventanaId) {
    const ventana = document.getElementById(ventanaId);
    ventana.style.display = "flex";
}

function cerrarVentana(ventanaId) {
    const ventana = document.getElementById(ventanaId);
    ventana.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    const botonCerrarSesion = document.getElementById("cerrarSesion");
    const modalCerrarSesion = document.getElementById("modalCerrarSesion");
    const botonCambiarContrasena = document.getElementById("cambiarContra");
    const modalContrasena = document.getElementById("modalContrasena");
    const formularioContrasena = document.getElementById("formularioContrasena");

    botonCerrarSesion.addEventListener("click", () => {
        abrirVentana("modalCerrarSesion");
    });

    document.getElementById("confirmarCerrarSesion").addEventListener("click", () => {
        window.location.href = "Login.html";
    });

    document.getElementById("cancelarCerrarSesion").addEventListener("click", () => {
        cerrarVentana("modalCerrarSesion");
    });

    document.getElementById("cerrarModalSesion").addEventListener("click", () => {
        cerrarVentana("modalCerrarSesion");
    });

    botonCambiarContrasena.addEventListener("click", () => {
        abrirVentana("modalContrasena");
        document.getElementById("contrasenaSimulada").focus();
    });

    document.getElementById("cerrarModalContrasena").addEventListener("click", () => {
        cerrarVentana("modalContrasena");
    });

    document.getElementById("cancelarModalContrasena").addEventListener("click", () => {
        cerrarVentana("modalContrasena");
    });

    formularioContrasena.addEventListener("submit", (evento) => {
        evento.preventDefault();
        window.location.href = "CambiarContrasena.html";
    });

    document.getElementById("ayuda").addEventListener("click", () => {
        window.location.href = "Ayuda.html";
    });
});