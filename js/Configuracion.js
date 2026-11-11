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
    const botonCambiarContrasena = document.getElementById("cambiarContra");

    botonCerrarSesion.addEventListener("click", () => {
        abrirVentana("modalCerrarSesion");
    });

    document.getElementById("confirmarCerrarSesion").addEventListener("click", () => {
        window.MinoApi.cerrarSesion();
        window.location.href = "Login.html";
    });

    document.getElementById("cancelarCerrarSesion").addEventListener("click", () => {
        cerrarVentana("modalCerrarSesion");
    });

    document.getElementById("cerrarModalSesion").addEventListener("click", () => {
        cerrarVentana("modalCerrarSesion");
    });

    botonCambiarContrasena.addEventListener("click", () => {
        window.location.href = "CambiarContrasena.html";
    });

    document.getElementById("ayuda").addEventListener("click", () => {
        window.location.href = "Ayuda.html";
    });
});