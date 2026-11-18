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
    const cuentaPrivada = document.getElementById("cuentaPrivada");
    const estadoPrivacidad = document.getElementById("estadoPrivacidad");

    async function cargarPrivacidad() {
        if (!window.MinoApi.tieneSesion()) {
            estadoPrivacidad.textContent = "Inicia sesión para cambiar la privacidad.";
            return;
        }

        try {
            const usuario = await window.MinoApi.solicitar("/usuarios/me");
            cuentaPrivada.checked = usuario.privado;
            cuentaPrivada.disabled = false;
        } catch (error) {
            estadoPrivacidad.textContent = error.message;
            estadoPrivacidad.dataset.tipo = "error";
            console.error("No se pudo cargar la privacidad de la cuenta:", error);
        }
    }

    cuentaPrivada.addEventListener("change", async () => {
        const privacidadAnterior = !cuentaPrivada.checked;
        const seraPrivada = cuentaPrivada.checked;
        const confirmacion = seraPrivada
            ? "¿Quieres hacer privada tu cuenta? Solo tus seguidores podrán ver tu perfil e historias."
            : "¿Quieres quitar el modo privado? Tu perfil volverá a ser visible para todos; las historias seguirán siendo solo para tus seguidores.";

        if (!window.confirm(confirmacion)) {
            cuentaPrivada.checked = privacidadAnterior;
            return;
        }

        cuentaPrivada.disabled = true;
        estadoPrivacidad.textContent = "Guardando cambio...";
        delete estadoPrivacidad.dataset.tipo;
        try {
            const resultado = await window.MinoApi.solicitar("/usuarios/me/privacidad", {
                method: "PATCH",
                body: JSON.stringify({ privado: seraPrivada })
            });
            cuentaPrivada.checked = resultado.privado;
            estadoPrivacidad.textContent = resultado.mensaje;
        } catch (error) {
            cuentaPrivada.checked = privacidadAnterior;
            estadoPrivacidad.textContent = error.message;
            estadoPrivacidad.dataset.tipo = "error";
            console.error("No se pudo actualizar la privacidad de la cuenta:", error);
        } finally {
            cuentaPrivada.disabled = false;
        }
    });

    void cargarPrivacidad();

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