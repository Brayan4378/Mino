const listaConversaciones = document.getElementById("listaConversaciones");
const listaMensajes = document.getElementById("listaMensajes");
const formularioBuscarContacto = document.getElementById("formularioBuscarContacto");
const buscarContacto = document.getElementById("buscarContacto");
const resultadosContactos = document.getElementById("resultadosContactos");
const conversacionActiva = document.getElementById("conversacionActiva");
const formularioEnviarMensaje = document.getElementById("formularioEnviarMensaje");
const entradaMensaje = document.getElementById("entradaMensaje");
const estadoMensajes = document.getElementById("estadoMensajes");
const estadoEnviarMensaje = document.getElementById("estadoEnviarMensaje");
const estadoConversaciones = document.getElementById("estadoConversaciones");
const estadoBuscarContacto = document.getElementById("estadoBuscarContacto");
const botonCargarAnteriores = document.getElementById("cargarMensajesAnteriores");
const idUsuarioInicial = new URLSearchParams(window.location.search).get("usuarioId");

let idConversacionActiva = null;
let conversacionActivaData = null;
let usuarioActual = null;
let cargandoHistorial = false;
let buscandoContactos = false;

function mostrarEstado(elemento, texto, tipo = "") {
    elemento.textContent = texto;
    elemento.dataset.tipo = tipo;
}

function obtenerNombreInicial(nombre) {
    return nombre.trim().charAt(0).toUpperCase() || "?";
}

function formatearHora(fecha) {
    const valor = new Date(`${fecha.replace(" ", "T")}Z`);
    if (Number.isNaN(valor.getTime())) return "";
    return new Intl.DateTimeFormat("es-MX", {
        hour: "2-digit",
        minute: "2-digit"
    }).format(valor);
}

function mostrarAccesoLogin() {
    mostrarEstado(estadoConversaciones, "Inicia sesión para ver tus mensajes.");
    const enlace = document.createElement("a");
    enlace.href = "Login.html";
    enlace.textContent = " Iniciar sesión";
    estadoConversaciones.append(enlace);
    document.getElementById("mensajes-vacio").hidden = true;
}

function crearElementoMensaje(mensaje) {
    const elemento = document.createElement("article");
    elemento.className = "mensaje-burbuja";
    elemento.dataset.id = mensaje.id;
    elemento.classList.toggle(
        "mensaje-propio",
        Number(mensaje.remitenteId) === Number(usuarioActual.id)
    );

    if (Number(mensaje.remitenteId) !== Number(usuarioActual.id)) {
        const autor = document.createElement("span");
        autor.className = "mensaje-autor";
        autor.textContent = mensaje.nombreRemitente;
        elemento.append(autor);
    }

    const contenido = document.createElement("p");
    contenido.textContent = mensaje.contenido;
    const hora = document.createElement("time");
    hora.dateTime = mensaje.fechaEnvio.replace(" ", "T");
    hora.textContent = formatearHora(mensaje.fechaEnvio);
    elemento.append(contenido, hora);
    return elemento;
}

function agregarMensaje(mensaje, alInicio = false) {
    if (listaMensajes.querySelector(`[data-id="${mensaje.id}"]`)) return;
    const elemento = crearElementoMensaje(mensaje);
    if (alInicio) {
        listaMensajes.prepend(elemento);
    } else {
        listaMensajes.append(elemento);
    }
}

function renderizarConversaciones(conversaciones) {
    listaConversaciones.replaceChildren();

    if (conversaciones.length === 0) {
        mostrarEstado(estadoConversaciones, "Aún no tienes conversaciones. Busca a alguien para empezar.");
        return;
    }

    mostrarEstado(estadoConversaciones, "");
    conversaciones.forEach((conversacion) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "conversacion-tarjeta";
        boton.dataset.id = conversacion.id;
        boton.setAttribute(
            "aria-pressed",
            String(Number(conversacion.id) === Number(idConversacionActiva))
        );

        const avatar = document.createElement("span");
        avatar.className = "conversacion-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = obtenerNombreInicial(conversacion.nombre);

        const datos = document.createElement("span");
        datos.className = "conversacion-datos";
        const nombre = document.createElement("strong");
        nombre.textContent = conversacion.nombre;
        const vistaPrevia = document.createElement("span");
        vistaPrevia.className = "conversacion-preview";
        if (conversacion.ultimoMensaje) {
            const prefijo = Number(conversacion.ultimoRemitenteId) === Number(usuarioActual.id)
                ? "Tú: "
                : "";
            vistaPrevia.textContent = `${prefijo}${conversacion.ultimoMensaje}`;
        } else {
            vistaPrevia.textContent = "Inicia la conversación";
        }
        datos.append(nombre, vistaPrevia);

        const meta = document.createElement("span");
        meta.className = "conversacion-meta";
        if (conversacion.fechaUltimoMensaje) {
            const hora = document.createElement("time");
            hora.dateTime = conversacion.fechaUltimoMensaje.replace(" ", "T");
            hora.textContent = formatearHora(conversacion.fechaUltimoMensaje);
            meta.append(hora);
        }
        if (Number(conversacion.noLeidos) > 0) {
            const noLeidos = document.createElement("span");
            noLeidos.className = "conversacion-no-leidos";
            noLeidos.textContent = conversacion.noLeidos;
            noLeidos.setAttribute("aria-label", `${conversacion.noLeidos} mensajes sin leer`);
            meta.append(noLeidos);
        }

        boton.append(avatar, datos, meta);
        boton.addEventListener("click", () => seleccionarConversacion(conversacion));
        listaConversaciones.append(boton);
    });
}

async function cargarConversaciones() {
    try {
        const conversaciones = await window.MinoApi.solicitar("/conversaciones");
        renderizarConversaciones(conversaciones);
    } catch (error) {
        mostrarEstado(estadoConversaciones, error.message, "error");
    }
}

function mostrarConversacion(conversacion) {
    conversacionActivaData = conversacion;
    idConversacionActiva = Number(conversacion.id);
    document.getElementById("mensajes-vacio").hidden = true;
    conversacionActiva.hidden = false;
    document.getElementById("nombreConversacion").textContent = conversacion.nombre;
    document.getElementById("avatarConversacion").textContent =
        obtenerNombreInicial(conversacion.nombre);
    document.getElementById("verPerfilConversacion").href =
        `Perfil.html?id=${encodeURIComponent(conversacion.usuarioId)}`;
    document.getElementById("mensajes-container").classList.add("chat-abierto");
    renderizarConversacionesActual();
}

function renderizarConversacionesActual() {
    listaConversaciones.querySelectorAll(".conversacion-tarjeta").forEach((boton) => {
        boton.setAttribute(
            "aria-pressed",
            String(Number(boton.dataset.id) === Number(idConversacionActiva))
        );
    });
}

async function seleccionarConversacion(conversacion) {
    mostrarConversacion(conversacion);
    listaMensajes.replaceChildren();
    mostrarEstado(estadoMensajes, "Cargando mensajes...");
    botonCargarAnteriores.hidden = true;

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${encodeURIComponent(conversacion.id)}/mensajes`
        );
        if (Number(conversacion.id) !== Number(idConversacionActiva)) return;

        datos.mensajes.forEach((mensaje) => agregarMensaje(mensaje));
        botonCargarAnteriores.hidden = !datos.masAntiguos;
        mostrarEstado(estadoMensajes, datos.mensajes.length ? "" : "Este es el inicio de la conversación.");
        listaMensajes.scrollTop = listaMensajes.scrollHeight;
        await cargarConversaciones();
    } catch (error) {
        mostrarEstado(estadoMensajes, error.message, "error");
    }
}

async function abrirConversacionCon(usuario) {
    mostrarEstado(estadoBuscarContacto, "Abriendo conversación...");
    try {
        const datos = await window.MinoApi.solicitar("/conversaciones", {
            method: "POST",
            body: JSON.stringify({ usuarioId: Number(usuario.id) })
        });
        const conversacion = {
            id: datos.id,
            usuarioId: usuario.id,
            nombre: usuario.nombre,
            ultimoMensaje: "",
            noLeidos: 0
        };
        resultadosContactos.replaceChildren();
        buscarContacto.value = "";
        mostrarEstado(estadoBuscarContacto, "");
        await cargarConversaciones();
        await seleccionarConversacion(conversacion);
    } catch (error) {
        mostrarEstado(estadoBuscarContacto, error.message, "error");
    }
}

function renderizarResultadosContactos(usuarios) {
    resultadosContactos.replaceChildren();
    const encontrados = usuarios.filter(
        (usuario) => Number(usuario.id) !== Number(usuarioActual.id)
    );

    if (encontrados.length === 0) {
        mostrarEstado(estadoBuscarContacto, "No se encontraron personas con ese nombre.");
        return;
    }

    mostrarEstado(estadoBuscarContacto, "Selecciona a quién quieres escribir.");
    encontrados.forEach((usuario) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "contacto-resultado";

        const avatar = document.createElement("span");
        avatar.className = "conversacion-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = obtenerNombreInicial(usuario.nombre);

        const nombre = document.createElement("strong");
        nombre.textContent = usuario.nombre;

        const accion = document.createElement("span");
        accion.textContent = "Escribir";
        boton.append(avatar, nombre, accion);
        boton.addEventListener("click", () => abrirConversacionCon(usuario));
        resultadosContactos.append(boton);
    });
}

formularioBuscarContacto.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const consulta = buscarContacto.value.trim();
    resultadosContactos.replaceChildren();

    if (!consulta) {
        mostrarEstado(estadoBuscarContacto, "Escribe el nombre de una persona para buscar.");
        return;
    }

    if (buscandoContactos) return;
    buscandoContactos = true;
    mostrarEstado(estadoBuscarContacto, "Buscando personas...");

    try {
        const usuarios = await window.MinoApi.solicitar(
            `/usuarios/buscar?q=${encodeURIComponent(consulta)}`
        );
        renderizarResultadosContactos(usuarios);
    } catch (error) {
        mostrarEstado(estadoBuscarContacto, error.message, "error");
    } finally {
        buscandoContactos = false;
    }
});

document.getElementById("botonBuscarContacto").addEventListener("click", () => {
    buscarContacto.focus();
    document.getElementById("mensajes-lista").scrollTop = 0;
});

document.getElementById("volverConversaciones").addEventListener("click", () => {
    document.getElementById("mensajes-container").classList.remove("chat-abierto");
});

botonCargarAnteriores.addEventListener("click", async () => {
    if (cargandoHistorial || !listaMensajes.firstElementChild) return;
    cargandoHistorial = true;
    botonCargarAnteriores.disabled = true;
    const alturaAnterior = listaMensajes.scrollHeight;
    const primerMensajeId = Number(listaMensajes.firstElementChild.dataset.id);

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${idConversacionActiva}/mensajes?beforeId=${primerMensajeId}`
        );
        const fragmento = document.createDocumentFragment();
        datos.mensajes.forEach((mensaje) => {
            if (!listaMensajes.querySelector(`[data-id="${mensaje.id}"]`)) {
                fragmento.append(crearElementoMensaje(mensaje));
            }
        });
        listaMensajes.prepend(fragmento);
        listaMensajes.scrollTop = listaMensajes.scrollHeight - alturaAnterior;
        botonCargarAnteriores.hidden = !datos.masAntiguos;
    } catch (error) {
        mostrarEstado(estadoMensajes, error.message, "error");
    } finally {
        cargandoHistorial = false;
        botonCargarAnteriores.disabled = false;
    }
});

formularioEnviarMensaje.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const contenido = entradaMensaje.value.trim();
    if (!contenido || !idConversacionActiva) return;

    const boton = formularioEnviarMensaje.querySelector("button");
    boton.disabled = true;
    mostrarEstado(estadoEnviarMensaje, "");

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${idConversacionActiva}/mensajes`,
            {
                method: "POST",
                body: JSON.stringify({ contenido })
            }
        );
        agregarMensaje(datos.mensaje);
        entradaMensaje.value = "";
        mostrarEstado(estadoMensajes, "");
        listaMensajes.scrollTop = listaMensajes.scrollHeight;
        await cargarConversaciones();
    } catch (error) {
        mostrarEstado(estadoEnviarMensaje, error.message, "error");
    } finally {
        boton.disabled = false;
        entradaMensaje.focus();
    }
});

entradaMensaje.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
        evento.preventDefault();
        formularioEnviarMensaje.requestSubmit();
    }
});

async function actualizarMensajesNuevos() {
    if (!idConversacionActiva || document.hidden) return;
    const ultimoMensaje = listaMensajes.lastElementChild;
    const ultimoId = ultimoMensaje ? Number(ultimoMensaje.dataset.id) : 0;
    const cercaDelFinal = listaMensajes.scrollHeight -
        listaMensajes.scrollTop - listaMensajes.clientHeight < 120;

    try {
        let cursor = ultimoId;
        let nuevos;
        do {
            nuevos = await window.MinoApi.solicitar(
                `/conversaciones/${idConversacionActiva}/mensajes?afterId=${cursor}`
            );
            nuevos.mensajes.forEach((mensaje) => {
                agregarMensaje(mensaje);
                cursor = Math.max(cursor, Number(mensaje.id));
            });
        } while (nuevos.mensajes.length === 100);

        if (nuevos.mensajes.length) {
            mostrarEstado(estadoMensajes, "");
        }
        if (nuevos.mensajes.length && cercaDelFinal) {
            listaMensajes.scrollTop = listaMensajes.scrollHeight;
        }
        if (nuevos.mensajes.length) await cargarConversaciones();
    } catch (error) {
        mostrarEstado(estadoMensajes, error.message, "error");
    }
}

async function iniciarMensajes() {
    if (!window.MinoApi.tieneSesion()) {
        mostrarAccesoLogin();
        return;
    }

    usuarioActual = window.MinoApi.obtenerUsuario();
    if (!usuarioActual) {
        mostrarAccesoLogin();
        return;
    }

    await cargarConversaciones();

    if (idUsuarioInicial && /^[1-9]\d*$/.test(idUsuarioInicial)) {
        try {
            const usuario = await window.MinoApi.solicitar(
                `/usuarios/${encodeURIComponent(idUsuarioInicial)}`
            );
            await abrirConversacionCon(usuario);
        } catch (error) {
            mostrarEstado(estadoBuscarContacto, error.message, "error");
        }
    } else if (idUsuarioInicial) {
        mostrarEstado(estadoBuscarContacto, "El usuario solicitado no es válido.", "error");
    }

    window.setInterval(() => {
        void cargarConversaciones();
        void actualizarMensajesNuevos();
    }, 5000);
}

iniciarMensajes();
