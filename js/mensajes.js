const listaConversaciones = document.getElementById("listaConversaciones");
const listaMensajes = document.getElementById("listaMensajes");
const formularioBuscarContacto = document.getElementById("formularioBuscarContacto");
const buscarContacto = document.getElementById("buscarContacto");
const resultadosContactos = document.getElementById("resultadosContactos");
const conversacionActiva = document.getElementById("conversacionActiva");
const formularioEnviarMensaje = document.getElementById("formularioEnviarMensaje");
const entradaMensaje = document.getElementById("entradaMensaje");
const botonEnviarMensaje = formularioEnviarMensaje.querySelector("button");
const estadoMensajes = document.getElementById("estadoMensajes");
const estadoEnviarMensaje = document.getElementById("estadoEnviarMensaje");
const estadoConversaciones = document.getElementById("estadoConversaciones");
const estadoBuscarContacto = document.getElementById("estadoBuscarContacto");
const botonCargarAnteriores = document.getElementById("cargarMensajesAnteriores");
const idUsuarioInicial = new URLSearchParams(window.location.search).get("usuarioId");
const conversacionGuardadaKey = "minoConversacionActiva";

let idConversacionActiva = null;
let conversacionActivaData = null;
let chatAbierto = false;
let usuarioActual = null;
let cargandoHistorial = false;
let buscandoContactos = false;
let solicitudPendiente = null;
let socket = null;
let socketAutenticado = false;
let idConversacionSuscrita = null;
let generacionSocket = 0;
let esperaReconectar = 1000;
let temporizadorReconectar = null;
let generacionHistorial = 0;
let idHistorialCargado = null;

function mostrarEstado(elemento, texto, tipo = "") {
    elemento.textContent = texto;
    if (tipo) elemento.dataset.tipo = tipo;
    else delete elemento.dataset.tipo;
}

function obtenerNombreInicial(nombre) {
    return nombre.trim().charAt(0).toUpperCase() || "?";
}

function establecerChatAbierto(abierto) {
    chatAbierto = abierto;
    const contenedor = document.getElementById("mensajes-container");
    contenedor.classList.toggle("chat-abierto", abierto);
    document.body.dataset.chatOpen = String(abierto);
    delete document.documentElement.dataset.chatRestore;
    conversacionActiva.hidden = !abierto;
    document.getElementById("mensajes-vacio").hidden = abierto;
}

function guardarConversacionSeleccionada(id) {
    try {
        sessionStorage.setItem(conversacionGuardadaKey, String(id));
    } catch (error) {
        console.error("No se pudo guardar la conversación activa:", error);
    }
}

function obtenerConversacionGuardadaId() {
    try {
        const id = Number(sessionStorage.getItem(conversacionGuardadaKey));
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    } catch (error) {
        console.error("No se pudo restaurar la conversación activa:", error);
        return null;
    }
}

function limpiarConversacionGuardada() {
    try {
        sessionStorage.removeItem(conversacionGuardadaKey);
    } catch (error) {
        console.error("No se pudo limpiar la conversación activa:", error);
    }
}

if (
    !idUsuarioInicial &&
    window.MinoApi.tieneSesion() &&
    obtenerConversacionGuardadaId()
) {
    establecerChatAbierto(true);
    document.getElementById("nombreConversacion").textContent = "Cargando conversación...";
    mostrarEstado(estadoMensajes, "Cargando conversación...");
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
    limpiarConversacionGuardada();
    establecerChatAbierto(false);
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

function agregarMensaje(mensaje) {
    if (listaMensajes.querySelector(`[data-id="${mensaje.id}"]`)) return false;
    listaMensajes.append(crearElementoMensaje(mensaje));
    return true;
}

function ordenarMensajes() {
    const elementos = [...listaMensajes.children];
    elementos.sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id));
    listaMensajes.replaceChildren(...elementos);
}

function renderizarConversaciones(conversaciones) {
    listaConversaciones.replaceChildren();

    if (conversaciones.length === 0) {
        mostrarEstado(
            estadoConversaciones,
            "Aún no tienes conversaciones. Busca a alguien para empezar."
        );
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

function renderizarConversacionesActual() {
    listaConversaciones.querySelectorAll(".conversacion-tarjeta").forEach((boton) => {
        boton.setAttribute(
            "aria-pressed",
            String(Number(boton.dataset.id) === Number(idConversacionActiva))
        );
    });
}

function actualizarVistaPreviaConversacion(mensaje) {
    if (!conversacionActivaData) return;
    conversacionActivaData.ultimoMensaje = mensaje.contenido;
    conversacionActivaData.ultimoRemitenteId = mensaje.remitenteId;
    const tarjetaActiva = listaConversaciones.querySelector(
        `.conversacion-tarjeta[data-id="${idConversacionActiva}"]`
    );
    const vistaPrevia = tarjetaActiva?.querySelector(".conversacion-preview");
    if (vistaPrevia) {
        const prefijo = Number(mensaje.remitenteId) === Number(usuarioActual.id) ? "Tú: " : "";
        vistaPrevia.textContent = `${prefijo}${mensaje.contenido}`;
    }
    if (tarjetaActiva && mensaje.fechaEnvio) {
        let hora = tarjetaActiva.querySelector(".conversacion-meta time");
        if (!hora) {
            hora = document.createElement("time");
            tarjetaActiva.querySelector(".conversacion-meta").prepend(hora);
        }
        hora.dateTime = mensaje.fechaEnvio.replace(" ", "T");
        hora.textContent = formatearHora(mensaje.fechaEnvio);
    }
}

async function cargarConversaciones() {
    try {
        const conversaciones = await window.MinoApi.solicitar("/conversaciones");
        renderizarConversaciones(conversaciones);
        renderizarConversacionesActual();
        return conversaciones;
    } catch (error) {
        mostrarEstado(estadoConversaciones, error.message, "error");
        return null;
    }
}

function mostrarConversacion(conversacion) {
    conversacionActivaData = conversacion;
    idConversacionActiva = Number(conversacion.id);
    guardarConversacionSeleccionada(idConversacionActiva);
    establecerChatAbierto(true);
    document.getElementById("nombreConversacion").textContent = conversacion.nombre;
    document.getElementById("avatarConversacion").textContent =
        obtenerNombreInicial(conversacion.nombre);
    document.getElementById("verPerfilConversacion").href =
        `Perfil.html?id=${encodeURIComponent(conversacion.usuarioId)}`;
    renderizarConversacionesActual();
    actualizarSuscripcionSocket();
}

async function seleccionarConversacion(conversacion) {
    mostrarConversacion(conversacion);
    const generacion = ++generacionHistorial;
    idHistorialCargado = null;
    listaMensajes.replaceChildren();
    mostrarEstado(estadoMensajes, "Cargando mensajes...");
    botonCargarAnteriores.hidden = true;

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${encodeURIComponent(conversacion.id)}/mensajes`
        );
        if (
            generacion !== generacionHistorial ||
            Number(conversacion.id) !== Number(idConversacionActiva)
        ) return;

        datos.mensajes.forEach(agregarMensaje);
        ordenarMensajes();
        idHistorialCargado = Number(conversacion.id);
        botonCargarAnteriores.hidden = !datos.masAntiguos;
        mostrarEstado(
            estadoMensajes,
            datos.mensajes.length ? "" : "Este es el inicio de la conversación."
        );
        listaMensajes.scrollTop = listaMensajes.scrollHeight;
        await cargarConversaciones();
        if (
            socketAutenticado &&
            idConversacionSuscrita === idHistorialCargado
        ) {
            void sincronizarMensajesPerdidos(idHistorialCargado);
        }
    } catch (error) {
        if (generacion === generacionHistorial) {
            mostrarEstado(estadoMensajes, error.message, "error");
        }
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

function enviarPaqueteSocket(paquete) {
    if (!socketAutenticado || !socket || socket.readyState !== WebSocket.OPEN) {
        return false;
    }
    socket.send(JSON.stringify(paquete));
    return true;
}

function actualizarSuscripcionSocket() {
    if (!socketAutenticado) return;
    if (chatAbierto && idConversacionActiva) {
        if (idConversacionSuscrita !== Number(idConversacionActiva)) {
            idConversacionSuscrita = Number(idConversacionActiva);
            enviarPaqueteSocket({
                type: "subscribe",
                conversationId: idConversacionSuscrita
            });
        }
        return;
    }

    if (idConversacionSuscrita !== null) {
        idConversacionSuscrita = null;
        enviarPaqueteSocket({ type: "unsubscribe" });
    }
}

function actualizarControlesEnvio() {
    botonEnviarMensaje.disabled = Boolean(solicitudPendiente) || !socketAutenticado;
    entradaMensaje.disabled = Boolean(solicitudPendiente);
}

function intentarEnviarPendiente() {
    if (
        !solicitudPendiente ||
        solicitudPendiente.conversationId !== idConversacionSuscrita ||
        solicitudPendiente.generacionSocket === generacionSocket
    ) return;

    solicitudPendiente.generacionSocket = generacionSocket;
    enviarPaqueteSocket({
        type: "send_message",
        requestId: solicitudPendiente.requestId,
        conversationId: solicitudPendiente.conversationId,
        contenido: solicitudPendiente.contenido
    });
}

async function sincronizarMensajesPerdidos(conversacionId) {
    if (
        Number(conversacionId) !== Number(idConversacionActiva) ||
        Number(conversacionId) !== idHistorialCargado ||
        !chatAbierto
    ) return;
    let cursor = [...listaMensajes.children].reduce(
        (ultimoId, elemento) => Math.max(ultimoId, Number(elemento.dataset.id)),
        0
    );

    try {
        let datos;
        do {
            datos = await window.MinoApi.solicitar(
                `/conversaciones/${conversacionId}/mensajes?afterId=${cursor}`
            );
            if (
                Number(conversacionId) !== Number(idConversacionActiva) ||
                !chatAbierto
            ) return;

            datos.mensajes.forEach((mensaje) => {
                agregarMensaje(mensaje);
                cursor = Math.max(cursor, Number(mensaje.id));
            });
        } while (datos.mensajes.length === 100);

        if (datos.mensajes.length) {
            ordenarMensajes();
            listaMensajes.scrollTop = listaMensajes.scrollHeight;
            mostrarEstado(estadoMensajes, "");
            const ultimo = datos.mensajes[datos.mensajes.length - 1];
            actualizarVistaPreviaConversacion(ultimo);
            await cargarConversaciones();
        }
    } catch (error) {
        mostrarEstado(estadoMensajes, error.message, "error");
    }
}

function procesarMensajeEnTiempoReal(paquete) {
    const mensaje = paquete.mensaje;
    const conversacionId = Number(paquete.conversationId);
    if (!mensaje || !Number.isSafeInteger(conversacionId)) return;

    if (conversacionId === Number(idConversacionActiva) && chatAbierto) {
        const cercaDelFinal = listaMensajes.scrollHeight -
            listaMensajes.scrollTop - listaMensajes.clientHeight < 120;
        agregarMensaje(mensaje);
        ordenarMensajes();
        if (cercaDelFinal) listaMensajes.scrollTop = listaMensajes.scrollHeight;
        mostrarEstado(estadoMensajes, "");
        actualizarVistaPreviaConversacion(mensaje);
    }

    if (paquete.type === "message_sent" && solicitudPendiente?.requestId === paquete.requestId) {
        if (
            conversacionId === Number(idConversacionActiva) &&
            entradaMensaje.value === solicitudPendiente.contenido
        ) {
            entradaMensaje.value = "";
        }
        solicitudPendiente = null;
        actualizarControlesEnvio();
        mostrarEstado(estadoEnviarMensaje, "");
        if (conversacionId !== Number(idConversacionActiva)) {
            void cargarConversaciones();
        }
        return;
    }

    if (paquete.type === "new_message") {
        if (conversacionId !== Number(idConversacionActiva) || !chatAbierto) {
            void cargarConversaciones();
        }
    }
}

function procesarPaqueteRecibido(evento) {
    let paquete;
    try {
        paquete = JSON.parse(evento.data);
    } catch (error) {
        console.error("La conexión de mensajes envió datos inválidos:", error);
        mostrarEstado(estadoEnviarMensaje, "Se recibió una respuesta inválida.", "error");
        return;
    }

    if (paquete.type === "authenticated") {
        socketAutenticado = true;
        esperaReconectar = 1000;
        actualizarControlesEnvio();
        mostrarEstado(estadoEnviarMensaje, "");
        actualizarSuscripcionSocket();
    } else if (paquete.type === "subscribed") {
        const conversacionConfirmada = Number(paquete.conversationId);
        if (
            !chatAbierto ||
            conversacionConfirmada !== Number(idConversacionActiva)
        ) {
            actualizarSuscripcionSocket();
            return;
        }
        idConversacionSuscrita = conversacionConfirmada;
        void sincronizarMensajesPerdidos(idConversacionSuscrita);
        intentarEnviarPendiente();
    } else if (
        paquete.type === "new_message" ||
        paquete.type === "message_sent"
    ) {
        procesarMensajeEnTiempoReal(paquete);
    } else if (paquete.type === "error") {
        if (solicitudPendiente?.requestId === paquete.requestId) {
            solicitudPendiente = null;
            actualizarControlesEnvio();
        }
        mostrarEstado(estadoEnviarMensaje, paquete.mensaje, "error");
    }
}

function conectarSocket() {
    if (!window.MinoApi.tieneSesion() || socket) return;
    const conexion = new WebSocket(window.MinoApi.urlWebSocket());
    socket = conexion;
    ++generacionSocket;

    conexion.addEventListener("open", () => {
        if (socket !== conexion) return;
        conexion.send(JSON.stringify({
            type: "authenticate",
            token: localStorage.getItem("minoToken")
        }));
    });

    conexion.addEventListener("message", (evento) => {
        if (socket === conexion) procesarPaqueteRecibido(evento);
    });

    conexion.addEventListener("close", (evento) => {
        if (socket !== conexion) return;
        socket = null;
        socketAutenticado = false;
        idConversacionSuscrita = null;
        actualizarControlesEnvio();

        if (evento.code === 4401) {
            window.MinoApi.cerrarSesion();
            mostrarAccesoLogin();
            mostrarEstado(estadoEnviarMensaje, "La sesión venció. Inicia sesión de nuevo.", "error");
            return;
        }

        if (solicitudPendiente) {
            mostrarEstado(estadoEnviarMensaje, "Reconectando para confirmar el envío...");
        }
        temporizadorReconectar = window.setTimeout(conectarSocket, esperaReconectar);
        esperaReconectar = Math.min(esperaReconectar * 2, 15000);
    });

    conexion.addEventListener("error", () => {
        mostrarEstado(estadoEnviarMensaje, "Conexión en tiempo real interrumpida.", "error");
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
        const encontrados = usuarios.filter(
            (usuario) => Number(usuario.id) !== Number(usuarioActual.id)
        );
        resultadosContactos.replaceChildren();

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
    limpiarConversacionGuardada();
    establecerChatAbierto(false);
    actualizarSuscripcionSocket();
});

botonCargarAnteriores.addEventListener("click", async () => {
    if (cargandoHistorial || !listaMensajes.firstElementChild) return;
    cargandoHistorial = true;
    botonCargarAnteriores.disabled = true;
    const idConversacionConsultada = idConversacionActiva;
    const alturaAnterior = listaMensajes.scrollHeight;
    const primerMensajeId = Number(listaMensajes.firstElementChild.dataset.id);

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${idConversacionConsultada}/mensajes?beforeId=${primerMensajeId}`
        );
        if (Number(idConversacionActiva) !== Number(idConversacionConsultada)) return;
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

function enviarMensaje() {
    const contenido = entradaMensaje.value.trim();
    if (!contenido || !idConversacionActiva || solicitudPendiente) return;
    if (!socketAutenticado || idConversacionSuscrita !== Number(idConversacionActiva)) {
        mostrarEstado(estadoEnviarMensaje, "Conectando al chat. Intenta enviar de nuevo en un momento.");
        return;
    }

    const requestId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    solicitudPendiente = {
        requestId,
        conversationId: Number(idConversacionActiva),
        contenido,
        generacionSocket: 0
    };
    actualizarControlesEnvio();
    mostrarEstado(estadoEnviarMensaje, "Enviando...");
    intentarEnviarPendiente();
}

formularioEnviarMensaje.addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviarMensaje();
});

botonEnviarMensaje.addEventListener("click", enviarMensaje);

entradaMensaje.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
        evento.preventDefault();
        enviarMensaje();
    }
});

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

    actualizarControlesEnvio();
    const conversaciones = await cargarConversaciones();
    conectarSocket();

    if (idUsuarioInicial && /^[1-9]\d*$/.test(idUsuarioInicial)) {
        try {
            const usuario = await window.MinoApi.solicitar(
                `/usuarios/${encodeURIComponent(idUsuarioInicial)}`
            );
            await abrirConversacionCon(usuario);
        } catch (error) {
            mostrarEstado(estadoBuscarContacto, error.message, "error");
        }
    } else if (!idUsuarioInicial && Array.isArray(conversaciones)) {
        const conversacionGuardadaId = obtenerConversacionGuardadaId();
        const conversacionGuardada = conversaciones.find(
            (conversacion) => Number(conversacion.id) === conversacionGuardadaId
        );
        if (conversacionGuardada) {
            await seleccionarConversacion(conversacionGuardada);
        } else if (conversacionGuardadaId) {
            limpiarConversacionGuardada();
            establecerChatAbierto(false);
        }
    } else if (idUsuarioInicial) {
        mostrarEstado(estadoBuscarContacto, "El usuario solicitado no es válido.", "error");
    }
}

window.addEventListener("beforeunload", () => {
    if (temporizadorReconectar !== null) {
        window.clearTimeout(temporizadorReconectar);
    }
    socket?.close(1000, "Página cerrada");
});

iniciarMensajes();
