const listaSugerencias = document.getElementById("listaSugerencias");
const estadoSugerencias = document.getElementById("estadoSugerencias");

function mostrarEstadoSugerencias(mensaje, tipo = "") {
    estadoSugerencias.textContent = mensaje;
    if (tipo) estadoSugerencias.dataset.tipo = tipo;
    else delete estadoSugerencias.dataset.tipo;
}

function crearSugerencia(usuario) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "sugerencia";

    const enlace = document.createElement("a");
    enlace.className = "sugerencia-perfil";
    enlace.href = `Perfil.html?id=${encodeURIComponent(usuario.id)}`;

    const avatar = document.createElement("img");
    avatar.src = usuario.fotoPerfil
        ? window.MinoApi.urlArchivo(usuario.fotoPerfil)
        : "/Imagenes/usuario.png";
    avatar.alt = "";
    avatar.addEventListener("error", () => {
        avatar.src = "/Imagenes/usuario.png";
    }, { once: true });

    const nombre = document.createElement("span");
    nombre.textContent = usuario.nombre;
    enlace.append(avatar, nombre);

    const seguir = document.createElement("button");
    seguir.type = "button";
    seguir.className = "boton-sugerencia-seguir";
    seguir.dataset.usuarioId = usuario.id;
    seguir.dataset.privado = String(usuario.privado);
    seguir.textContent = usuario.privado ? "Solicitar" : "Seguir";

    tarjeta.append(enlace, seguir);
    return tarjeta;
}

async function cargarSugerencias() {
    if (!window.MinoApi.tieneSesion()) {
        listaSugerencias.replaceChildren();
        mostrarEstadoSugerencias("Inicia sesión para ver sugerencias.");
        return;
    }

    try {
        const usuarios = await window.MinoApi.solicitar("/usuarios/sugerencias?limit=6");
        listaSugerencias.replaceChildren(...usuarios.map(crearSugerencia));
        mostrarEstadoSugerencias(
            usuarios.length ? "" : "Por ahora no hay más personas para sugerir."
        );
    } catch (error) {
        mostrarEstadoSugerencias(error.message, "error");
        console.error("No se pudieron cargar las sugerencias:", error);
    }
}

listaSugerencias.addEventListener("click", async (evento) => {
    const boton = evento.target.closest("button[data-usuario-id]");
    if (!boton) return;

    boton.disabled = true;
    try {
        const resultado = await window.MinoApi.solicitar(
            `/usuarios/${encodeURIComponent(boton.dataset.usuarioId)}/seguir`,
            { method: "POST" }
        );
        if (resultado.solicitudPendiente) {
            boton.textContent = "Solicitado";
            boton.disabled = true;
        } else {
            boton.textContent = "Siguiendo";
            boton.disabled = true;
        }
        mostrarEstadoSugerencias(resultado.mensaje, "exito");
    } catch (error) {
        mostrarEstadoSugerencias(error.message, "error");
        boton.disabled = false;
    }
});

cargarSugerencias();
