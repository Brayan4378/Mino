const formularioCambio = document.getElementById("formularioCambiarContrasena");
const estadoCambio = document.getElementById("estadoCambioContrasena");

formularioCambio.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const contrasenaActual = document.getElementById("contrasenaActual").value;
    const contrasenaNueva = document.getElementById("contrasenaNueva").value;
    const confirmar = document.getElementById("confirmarContrasena").value;

    if (!window.MinoApi.tieneSesion()) {
        estadoCambio.textContent = "Inicia sesión antes de cambiar la contraseña.";
        estadoCambio.dataset.tipo = "error";
        return;
    }

    if (contrasenaNueva !== confirmar) {
        estadoCambio.textContent = "La confirmación no coincide con la nueva contraseña.";
        estadoCambio.dataset.tipo = "error";
        return;
    }

    estadoCambio.textContent = "Actualizando contraseña...";
    estadoCambio.dataset.tipo = "";

    try {
        const resultado = await window.MinoApi.solicitar("/usuarios/me/password", {
            method: "PUT",
            body: JSON.stringify({ contrasenaActual, contrasenaNueva })
        });

        formularioCambio.reset();
        estadoCambio.textContent = resultado.mensaje;
        estadoCambio.dataset.tipo = "exito";
    } catch (error) {
        estadoCambio.textContent = error.message;
        estadoCambio.dataset.tipo = "error";
    }
});
