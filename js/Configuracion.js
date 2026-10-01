// Esta parte es de cerrar sesion la parte de abajo en configuracion
document.addEventListener("DOMContentLoaded", () => {
    const cerrarSesionBtn = document.getElementById("cerrarSesion");
    cerrarSesionBtn.addEventListener("click", () => {
        window.location.href = "Login.html";
    });
});

// Esta parte es de soporte, lleva a Ayuda.html
document.addEventListener("DOMContentLoaded", () => {
    const ayudabtn = document.getElementById("ayuda");
    ayudabtn.addEventListener("click", () => {
        window.location.href = "Ayuda.html";
    });
});

// Esta parte es de Cambiar la contraseña lleva a CambiarContrana.html
document.addEventListener("DOMContentLoaded", () => {
    const cambiarContrabtn = document.getElementById("cambiarContra");
    cambiarContrabtn.addEventListener("click", () => {
        window.location.href = "CambiarContrasena.html";
    });
});