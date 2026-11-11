const estadoPerfil = document.getElementById("estadoPerfil");
const formularioPerfil = document.getElementById("formularioPerfil");
const formularioFotoPerfil = document.getElementById("formularioFotoPerfil");
const formularioContrasena = document.getElementById("formularioCambiarContrasena");
const seccionEditarPerfil = document.getElementById("seccionEditarPerfil");
const seccionCambiarContrasena = document.getElementById("seccionCambiarContrasena");
const botonesPerfil = document.getElementById("perfil-botones");
const parametrosPerfil = new URLSearchParams(window.location.search);
const idSolicitado = parametrosPerfil.get("id");
let perfilPropio = false;

function mostrarEstado(elemento, mensaje, tipo = "") {
    elemento.textContent = mensaje;
    elemento.dataset.tipo = tipo;
}

function mostrarDatosPerfil(usuario) {
    document.getElementById("perfil-usuario").textContent = usuario.nombre;
    document.getElementById("perfil-foto").src = usuario.fotoPerfil
        ? window.MinoApi.urlArchivo(usuario.fotoPerfil)
        : "/Imagenes/usuario.png";
    document.getElementById("perfil-num-publicaciones").textContent = usuario.publicaciones;
    document.getElementById("perfil-num-seguidores").textContent = usuario.seguidores;
    document.getElementById("perfil-num-seguidos").textContent = usuario.seguidos;
    document.getElementById("perfil-genero").textContent = usuario.genero
        ? `Género: ${usuario.genero}`
        : "";
    document.getElementById("perfil-bio").textContent = usuario.bio || "";
}

function mostrarAccesoLogin() {
    mostrarEstado(estadoPerfil, "Inicia sesión para ver tu perfil. ");
    const enlace = document.createElement("a");
    enlace.href = "Login.html";
    enlace.textContent = "Ir a iniciar sesión";
    estadoPerfil.appendChild(enlace);
}

function cargarDatosFormulario(usuario) {
    formularioPerfil.elements.nombre.value = usuario.nombre;
    formularioPerfil.elements.correo.value = usuario.correo;
    formularioPerfil.elements.genero.value = usuario.genero || "";
    formularioPerfil.elements.bio.value = usuario.bio || "";
}

async function cargarPerfil() {
    const usuarioSesion = window.MinoApi.obtenerUsuario();
    const tieneSesion = window.MinoApi.tieneSesion();

    if (!idSolicitado && !tieneSesion) {
        mostrarAccesoLogin();
        return;
    }

    if (idSolicitado && !/^[1-9]\d*$/.test(idSolicitado)) {
        mostrarEstado(estadoPerfil, "El perfil solicitado no es válido.", "error");
        return;
    }

    const esPerfilPropio = !idSolicitado ||
        (usuarioSesion && Number(idSolicitado) === Number(usuarioSesion.id));

    if (esPerfilPropio && !tieneSesion) {
        mostrarAccesoLogin();
        return;
    }

    try {
        const usuario = esPerfilPropio
            ? await window.MinoApi.solicitar("/usuarios/me")
            : await window.MinoApi.solicitar(`/usuarios/${encodeURIComponent(idSolicitado)}`);

        perfilPropio = Boolean(esPerfilPropio);
        mostrarDatosPerfil(usuario);

        if (perfilPropio) {
            cargarDatosFormulario(usuario);
            formularioFotoPerfil.hidden = false;
            document.getElementById("botonEditarPerfil").hidden = false;
            document.getElementById("botonCambiarContrasena").hidden = false;
            botonesPerfil.hidden = false;
        } else {
            const botonEnviarMensaje = document.getElementById("botonEnviarMensaje");
            botonEnviarMensaje.href = `Mensajes.html?usuarioId=${encodeURIComponent(usuario.id)}`;
            botonEnviarMensaje.hidden = false;
            botonesPerfil.hidden = false;
        }

        mostrarEstado(estadoPerfil, "");
    } catch (error) {
        mostrarEstado(estadoPerfil, error.message, "error");
    }
}

document.getElementById("botonEditarPerfil").addEventListener("click", () => {
    seccionEditarPerfil.hidden = !seccionEditarPerfil.hidden;
    seccionCambiarContrasena.hidden = true;
});

document.getElementById("botonCambiarContrasena").addEventListener("click", () => {
    seccionCambiarContrasena.hidden = !seccionCambiarContrasena.hidden;
    seccionEditarPerfil.hidden = true;
});

document.getElementById("cancelarEdicionPerfil").addEventListener("click", () => {
    seccionEditarPerfil.hidden = true;
});

document.getElementById("cancelarCambioContrasena").addEventListener("click", () => {
    seccionCambiarContrasena.hidden = true;
    formularioContrasena.reset();
    mostrarEstado(document.getElementById("estadoContrasenaPerfil"), "");
});

formularioPerfil.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!perfilPropio) return;

    const estado = document.getElementById("estadoEdicionPerfil");
    const datos = {
        nombre: formularioPerfil.elements.nombre.value.trim(),
        correo: formularioPerfil.elements.correo.value.trim(),
        genero: formularioPerfil.elements.genero.value,
        bio: formularioPerfil.elements.bio.value.trim()
    };

    mostrarEstado(estado, "Guardando cambios...");

    try {
        await window.MinoApi.solicitar(
            `/usuarios/${encodeURIComponent(window.MinoApi.obtenerUsuario().id)}`,
            {
                method: "PUT",
                body: JSON.stringify(datos)
            }
        );

        const usuarioSesion = {
            ...window.MinoApi.obtenerUsuario(),
            nombre: datos.nombre,
            correo: datos.correo
        };
        localStorage.setItem("minoUsuario", JSON.stringify(usuarioSesion));

        const perfilActualizado = await window.MinoApi.solicitar("/usuarios/me");
        mostrarDatosPerfil(perfilActualizado);
        cargarDatosFormulario(perfilActualizado);
        mostrarEstado(estado, "Perfil actualizado.", "exito");
    } catch (error) {
        mostrarEstado(estado, error.message, "error");
    }
});

formularioFotoPerfil.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!perfilPropio) return;

    const archivo = formularioFotoPerfil.elements.foto.files[0];
    const estado = document.getElementById("estadoFotoPerfil");
    if (!archivo) {
        mostrarEstado(estado, "Selecciona una imagen.", "error");
        return;
    }

    const boton = formularioFotoPerfil.querySelector("button[type='submit']");
    boton.disabled = true;
    mostrarEstado(estado, "Subiendo foto...");

    try {
        const datos = new FormData();
        datos.append("foto", archivo);
        const resultado = await window.MinoApi.solicitar("/usuarios/me/foto", {
            method: "POST",
            body: datos
        });

        document.getElementById("perfil-foto").src =
            `${window.MinoApi.urlArchivo(resultado.fotoPerfil)}?actualizada=${Date.now()}`;
        localStorage.setItem("minoUsuario", JSON.stringify({
            ...window.MinoApi.obtenerUsuario(),
            fotoPerfil: resultado.fotoPerfil
        }));
        formularioFotoPerfil.reset();
        mostrarEstado(estado, resultado.mensaje, "exito");
    } catch (error) {
        mostrarEstado(estado, error.message, "error");
    } finally {
        boton.disabled = false;
    }
});

formularioContrasena.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!perfilPropio) return;

    const estado = document.getElementById("estadoContrasenaPerfil");
    const contrasenaActual = document.getElementById("contrasenaActualPerfil").value;
    const contrasenaNueva = document.getElementById("contrasenaNuevaPerfil").value;
    const confirmar = document.getElementById("confirmarContrasenaPerfil").value;

    if (contrasenaNueva !== confirmar) {
        mostrarEstado(estado, "La confirmación no coincide con la nueva contraseña.", "error");
        return;
    }

    mostrarEstado(estado, "Actualizando contraseña...");

    try {
        const resultado = await window.MinoApi.solicitar("/usuarios/me/password", {
            method: "PUT",
            body: JSON.stringify({ contrasenaActual, contrasenaNueva })
        });

        formularioContrasena.reset();
        mostrarEstado(estado, resultado.mensaje, "exito");
    } catch (error) {
        mostrarEstado(estado, error.message, "error");
    }
});

cargarPerfil();
