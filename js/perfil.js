const estadoPerfil = document.getElementById("estadoPerfil");
const formularioPerfil = document.getElementById("formularioPerfil");
const formularioFotoPerfil = document.getElementById("formularioFotoPerfil");
const formularioContrasena = document.getElementById("formularioCambiarContrasena");
const seccionEditarPerfil = document.getElementById("seccionEditarPerfil");
const seccionCambiarContrasena = document.getElementById("seccionCambiarContrasena");
const botonesPerfil = document.getElementById("perfil-botones");
const botonSeguirPerfil = document.getElementById("botonSeguirPerfil");
const botonLoginSeguir = document.getElementById("botonLoginSeguir");
const parametrosPerfil = new URLSearchParams(window.location.search);
const idSolicitado = parametrosPerfil.get("id");
let perfilPropio = false;
let idPerfilActual = null;

function mostrarEstado(elemento, mensaje, tipo = "") {
    elemento.textContent = mensaje;
    elemento.dataset.tipo = tipo;
}

function mostrarDatosPerfil(usuario) {
    document.querySelector(".perfil-pagina").classList.remove("perfil-restringido");
    document.getElementById("perfil-usuario").textContent = usuario.nombre;
    const fotoPerfil = document.getElementById("perfil-foto");
    fotoPerfil.onerror = () => {
        fotoPerfil.onerror = null;
        fotoPerfil.src = "/Imagenes/usuario.png";
    };
    fotoPerfil.src = usuario.fotoPerfil
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

function mostrarPerfilRestringido(usuario, tieneSesion) {
    const pagina = document.querySelector(".perfil-pagina");
    pagina.classList.add("perfil-restringido");
    document.getElementById("perfil-usuario").textContent = usuario.nombre;
    const fotoPerfil = document.getElementById("perfil-foto");
    fotoPerfil.onerror = () => {
        fotoPerfil.onerror = null;
        fotoPerfil.src = "/Imagenes/usuario.png";
    };
    fotoPerfil.src = usuario.fotoPerfil
        ? window.MinoApi.urlArchivo(usuario.fotoPerfil)
        : "/Imagenes/usuario.png";
    document.getElementById("perfil-stats").hidden = true;
    document.getElementById("perfil-genero").hidden = true;
    document.getElementById("perfil-bio").hidden = true;
    formularioFotoPerfil.hidden = true;
    seccionEditarPerfil.hidden = true;
    seccionCambiarContrasena.hidden = true;

    botonesPerfil.hidden = false;
    document.getElementById("botonEditarPerfil").hidden = true;
    document.getElementById("botonCambiarContrasena").hidden = true;
    botonSeguirPerfil.hidden = !tieneSesion || usuario.siguiendo;
    botonSeguirPerfil.dataset.siguiendo = String(Boolean(usuario.siguiendo));
    botonSeguirPerfil.dataset.solicitudPendiente = String(Boolean(usuario.solicitudPendiente));
    botonSeguirPerfil.textContent = usuario.solicitudPendiente
        ? "Cancelar solicitud"
        : "Seguir";
    botonLoginSeguir.hidden = tieneSesion;
    document.getElementById("botonEnviarMensaje").hidden = true;
    mostrarEstado(
        estadoPerfil,
        "Esta cuenta es privada. Síguela para ver su perfil y sus publicaciones."
    );
}

function crearFilaRelacion(usuario) {
    const fila = document.createElement("article");
    fila.className = "relacion-perfil";

    const enlace = document.createElement("a");
    enlace.className = "relacion-perfil-enlace";
    enlace.href = `Perfil.html?id=${encodeURIComponent(usuario.id)}`;

    const foto = document.createElement("img");
    foto.className = "relacion-perfil-foto";
    foto.src = usuario.fotoPerfil
        ? window.MinoApi.urlArchivo(usuario.fotoPerfil)
        : "/Imagenes/usuario.png";
    foto.alt = "";
    foto.addEventListener("error", () => {
        foto.src = "/Imagenes/usuario.png";
    }, { once: true });

    const nombre = document.createElement("span");
    nombre.className = "relacion-perfil-nombre";
    nombre.textContent = usuario.nombre;
    enlace.append(foto, nombre);
    fila.append(enlace);

    const usuarioSesion = window.MinoApi.obtenerUsuario();
    if (window.MinoApi.tieneSesion() && usuarioSesion && Number(usuarioSesion.id) !== Number(usuario.id)) {
        const boton = document.createElement("button");
        boton.className = "relacion-perfil-seguir";
        boton.type = "button";
        boton.dataset.siguiendo = String(usuario.siguiendo);
        boton.textContent = usuario.siguiendo ? "Dejar de seguir" : "Seguir";
        boton.setAttribute(
            "aria-label",
            `${usuario.siguiendo ? "Dejar de seguir a" : "Seguir a"} ${usuario.nombre}`
        );
        boton.addEventListener("click", async () => {
            const siguiendo = boton.dataset.siguiendo === "true";
            boton.disabled = true;
            mostrarEstado(estadoRelacionesPerfil, "");
            try {
                await window.MinoApi.solicitar(
                    `/usuarios/${encodeURIComponent(usuario.id)}/seguir`,
                    { method: siguiendo ? "DELETE" : "POST" }
                );
                boton.dataset.siguiendo = String(!siguiendo);
                boton.textContent = siguiendo ? "Seguir" : "Dejar de seguir";
                boton.setAttribute(
                    "aria-label",
                    `${siguiendo ? "Seguir a" : "Dejar de seguir a"} ${usuario.nombre}`
                );
            } catch (error) {
                mostrarEstado(estadoRelacionesPerfil, error.message, "error");
            } finally {
                boton.disabled = false;
            }
        });
        fila.append(boton);
    }

    return fila;
}

const modalRelacionesPerfil = document.getElementById("modalRelacionesPerfil");
const listaRelacionesPerfil = document.getElementById("listaRelacionesPerfil");
const estadoRelacionesPerfil = document.getElementById("estadoRelacionesPerfil");

async function abrirListaRelaciones(tipo) {
    if (!idPerfilActual) return;

    const esSeguidores = tipo === "seguidores";
    document.getElementById("tituloRelacionesPerfil").textContent =
        esSeguidores ? "Seguidores" : "Seguidos";
    listaRelacionesPerfil.replaceChildren();
    mostrarEstado(estadoRelacionesPerfil, "Cargando...");
    modalRelacionesPerfil.showModal();

    try {
        const usuarios = await window.MinoApi.solicitar(
            `/usuarios/${encodeURIComponent(idPerfilActual)}/${tipo}`
        );
        listaRelacionesPerfil.replaceChildren();
        if (usuarios.length === 0) {
            mostrarEstado(
                estadoRelacionesPerfil,
                esSeguidores ? "Aún no tiene seguidores." : "Aún no sigue a nadie."
            );
            return;
        }

        mostrarEstado(estadoRelacionesPerfil, "");
        usuarios.forEach((usuario) => {
            listaRelacionesPerfil.append(crearFilaRelacion(usuario));
        });
    } catch (error) {
        mostrarEstado(estadoRelacionesPerfil, error.message, "error");
    }
}

document.getElementById("abrirListaSeguidores").addEventListener("click", () => {
    abrirListaRelaciones("seguidores");
});
document.getElementById("abrirListaSeguidos").addEventListener("click", () => {
    abrirListaRelaciones("seguidos");
});
document.getElementById("cerrarModalRelaciones").addEventListener("click", () => {
    modalRelacionesPerfil.close();
});

function mostrarAccesoLogin() {
    document.getElementById("perfil-header").hidden = true;
    document.getElementById("seccionPublicacionesPerfil").hidden = true;
    formularioFotoPerfil.hidden = true;
    seccionEditarPerfil.hidden = true;
    seccionCambiarContrasena.hidden = true;
    mostrarEstado(estadoPerfil, "Tu sesión venció. Inicia sesión para ver tu perfil. ");
    const enlace = document.createElement("a");
    enlace.href = "Login.html";
    enlace.textContent = "Iniciar sesión";
    estadoPerfil.appendChild(enlace);
}

function cargarDatosFormulario(usuario) {
    formularioPerfil.elements.nombre.value = usuario.nombre;
    formularioPerfil.elements.correo.value = usuario.correo;
    formularioPerfil.elements.genero.value = usuario.genero || "";
    formularioPerfil.elements.bio.value = usuario.bio || "";
}

async function mostrarPerfilCargado(usuario, tieneSesion) {
    const usuarioSesion = window.MinoApi.obtenerUsuario();
    const esPerfilPropio = !idSolicitado ||
        (usuarioSesion && Number(idSolicitado) === Number(usuarioSesion.id));

    perfilPropio = Boolean(esPerfilPropio);
    idPerfilActual = usuario.id;
    if (usuario.accesoRestringido) {
        document.getElementById("seccionPublicacionesPerfil").hidden = true;
        mostrarPerfilRestringido(usuario, tieneSesion);
        return;
    }

    document.getElementById("perfil-header").hidden = false;
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
        if (tieneSesion) {
            const seguimiento = await window.MinoApi.solicitar(
                `/usuarios/${encodeURIComponent(usuario.id)}/seguimiento`
            );
            botonSeguirPerfil.dataset.siguiendo = String(seguimiento.siguiendo);
            botonSeguirPerfil.dataset.solicitudPendiente = String(seguimiento.solicitudPendiente);
            botonSeguirPerfil.textContent = seguimiento.siguiendo
                ? "Dejar de seguir"
                : seguimiento.solicitudPendiente
                    ? "Cancelar solicitud"
                    : "Seguir";
            botonSeguirPerfil.hidden = false;
        } else {
            botonLoginSeguir.hidden = false;
        }
        botonesPerfil.hidden = false;
    }

    mostrarEstado(estadoPerfil, "");
    await window.cargarPublicacionesPerfil(usuario.id);
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
        await mostrarPerfilCargado(usuario, tieneSesion);
    } catch (error) {
        if (!window.MinoApi.tieneSesion()) {
            if (!idSolicitado) {
                mostrarAccesoLogin();
                return;
            }

            try {
                const usuario = await window.MinoApi.solicitar(
                    `/usuarios/${encodeURIComponent(idSolicitado)}`
                );
                await mostrarPerfilCargado(usuario, false);
                return;
            } catch (errorSinSesion) {
                mostrarEstado(estadoPerfil, errorSinSesion.message, "error");
                return;
            }
        }
        mostrarEstado(estadoPerfil, error.message, "error");
    }
}

botonSeguirPerfil.addEventListener("click", async () => {
    if (!idSolicitado || perfilPropio) return;
    const siguiendo = botonSeguirPerfil.dataset.siguiendo === "true";
    const solicitudPendiente = botonSeguirPerfil.dataset.solicitudPendiente === "true";
    botonSeguirPerfil.disabled = true;
    try {
        const resultado = await window.MinoApi.solicitar(
            `/usuarios/${encodeURIComponent(idSolicitado)}/seguir`,
            { method: siguiendo || solicitudPendiente ? "DELETE" : "POST" }
        );
        botonSeguirPerfil.dataset.siguiendo = String(Boolean(resultado.siguiendo));
        botonSeguirPerfil.dataset.solicitudPendiente = String(Boolean(resultado.solicitudPendiente));
        botonSeguirPerfil.textContent = resultado.siguiendo
            ? "Dejar de seguir"
            : resultado.solicitudPendiente
                ? "Cancelar solicitud"
                : "Seguir";

        if (document.querySelector(".perfil-pagina").classList.contains("perfil-restringido")) {
            const usuario = await window.MinoApi.solicitar(
                `/usuarios/${encodeURIComponent(idSolicitado)}`
            );
            mostrarPerfilRestringido(usuario, true);
        }
        mostrarEstado(estadoPerfil, resultado.mensaje, "exito");
    } catch (error) {
        mostrarEstado(estadoPerfil, error.message, "error");
    } finally {
        botonSeguirPerfil.disabled = false;
    }
});

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
