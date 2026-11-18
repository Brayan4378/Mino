const botonAbrirMiniChat = document.getElementById("abrirMiniChat");
const panelMiniChat = document.getElementById("miniChat");
const botonCerrarMiniChat = document.getElementById("cerrarMiniChat");
const botonVolverMiniChat = document.getElementById("miniChatVolver");
const avatarMiniChat = document.getElementById("miniChatAvatar");
const tituloMiniChat = document.getElementById("miniChatTitulo");
const subtituloMiniChat = document.getElementById("miniChatSubtitulo");
const listaVistaMiniChat = document.getElementById("miniChatListaVista");
const listaConversacionesMiniChat = document.getElementById("miniChatListaConversaciones");
const estadoMiniChat = document.getElementById("miniChatEstado");
const vistaConversacionMiniChat = document.getElementById("miniChatConversacion");
const listaMensajesMiniChat = document.getElementById("miniChatMensajes");
const estadoMensajeMiniChat = document.getElementById("miniChatEstadoMensaje");
const formularioMiniChat = document.getElementById("miniChatCompositor");
const entradaMiniChat = document.getElementById("miniChatEntrada");
const enviarMiniChat = formularioMiniChat.querySelector("button[type='submit']");
const conversacionRestaurarId = Number(
    document.documentElement.dataset.miniChatRestore
);

let conversacionMiniChat = null;
let conversacionesMiniChat = [];
let mensajesMiniChat = new Map();
let socketMiniChat = null;
let socketMiniChatAutenticado = false;
let conversacionMiniChatSuscrita = null;
let conversacionMiniChatSolicitada = null;
let solicitudMiniChatPendiente = null;
let temporizadorReconectarMiniChat = null;
let esperaReconectarMiniChat = 1000;
let generacionSocketMiniChat = 0;
const conversacionMiniChatGuardadaKey = "minoMiniChatConversacionActiva";

delete document.documentElement.dataset.miniChatRestore;

function mostrarEstadoMiniChat(elemento, mensaje, tipo = "") {
    elemento.textContent = mensaje;
    if (tipo) elemento.dataset.tipo = tipo;
    else delete elemento.dataset.tipo;
}

function obtenerInicialMiniChat(nombre) {
    return nombre.trim().charAt(0).toUpperCase() || "?";
}

function guardarConversacionMiniChat(id) {
    try {
        sessionStorage.setItem(conversacionMiniChatGuardadaKey, String(id));
    } catch (error) {
        console.error("No se pudo guardar la conversación del minichat:", error);
    }
}

function limpiarConversacionMiniChatGuardada() {
    try {
        sessionStorage.removeItem(conversacionMiniChatGuardadaKey);
    } catch (error) {
        console.error("No se pudo limpiar la conversación guardada del minichat:", error);
    }
}

function actualizarControlesMiniChat() {
    enviarMiniChat.disabled = Boolean(solicitudMiniChatPendiente) ||
        !socketMiniChatAutenticado ||
        conversacionMiniChatSuscrita !== Number(conversacionMiniChat?.id);
}

function crearEnlaceInicioSesion() {
    const enlace = document.createElement("a");
    enlace.href = "Login.html";
    enlace.textContent = "Iniciar sesión";
    return enlace;
}

function mostrarConversacionesMiniChat(conversaciones) {
    conversacionesMiniChat = conversaciones;
    listaConversacionesMiniChat.replaceChildren();
    if (conversaciones.length === 0) {
        const vacio = document.createElement("p");
        vacio.className = "miniChatVacio";
        vacio.textContent = "Aún no tienes conversaciones.";
        const enlace = document.createElement("a");
        enlace.href = "Mensajes.html";
        enlace.textContent = "Iniciar una conversación";
        listaConversacionesMiniChat.append(vacio, enlace);
        return;
    }

    conversaciones.forEach((conversacion) => {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "miniChatTarjeta";
        boton.dataset.conversationId = String(conversacion.id);

        const avatar = document.createElement("span");
        avatar.className = "miniChatAvatar";
        avatar.textContent = obtenerInicialMiniChat(conversacion.nombre);
        avatar.setAttribute("aria-hidden", "true");

        const datos = document.createElement("span");
        datos.className = "miniChatDatos";
        const nombre = document.createElement("strong");
        nombre.textContent = conversacion.nombre;
        const vistaPrevia = document.createElement("span");
        vistaPrevia.className = "miniChatVistaPrevia";
        vistaPrevia.textContent = conversacion.ultimoMensaje
            ? Number(conversacion.ultimoRemitenteId) === Number(window.MinoApi.obtenerUsuario().id)
                ? `Tú: ${conversacion.ultimoMensaje}`
                : conversacion.ultimoMensaje
            : "Inicia la conversación";
        datos.append(nombre, vistaPrevia);

        const noLeidos = Number(conversacion.noLeidos);
        if (noLeidos > 0) {
            const insignia = document.createElement("span");
            insignia.className = "miniChatNoLeidos";
            insignia.textContent = String(noLeidos);
            insignia.setAttribute("aria-label", `${noLeidos} mensajes sin leer`);
            boton.append(avatar, datos, insignia);
        } else {
            boton.append(avatar, datos);
        }

        boton.addEventListener("click", () => void seleccionarConversacionMiniChat(conversacion));
        listaConversacionesMiniChat.appendChild(boton);
    });
}

function actualizarVistaPreviaConversacionMiniChat(conversacionId, mensaje) {
    if (!mensaje) return;
    const conversacion = conversacionesMiniChat.find(
        (item) => Number(item.id) === Number(conversacionId)
    );
    if (conversacion) {
        conversacion.ultimoMensaje = mensaje.contenido;
        conversacion.ultimoRemitenteId = mensaje.remitenteId;
        conversacion.fechaUltimoMensaje = mensaje.fechaEnvio;
    }
    if (Number(conversacionMiniChat?.id) === Number(conversacionId)) {
        conversacionMiniChat.ultimoMensaje = mensaje.contenido;
        conversacionMiniChat.ultimoRemitenteId = mensaje.remitenteId;
        conversacionMiniChat.fechaUltimoMensaje = mensaje.fechaEnvio;
    }

    const tarjeta = listaConversacionesMiniChat.querySelector(
        `.miniChatTarjeta[data-conversation-id="${Number(conversacionId)}"]`
    );
    const vistaPrevia = tarjeta?.querySelector(".miniChatVistaPrevia");
    if (vistaPrevia) {
        const prefijo = Number(mensaje.remitenteId) ===
            Number(window.MinoApi.obtenerUsuario().id)
            ? "Tú: "
            : "";
        vistaPrevia.textContent = `${prefijo}${mensaje.contenido}`;
    }
}

async function cargarConversacionesMiniChat() {
    if (!window.MinoApi.tieneSesion()) {
        mostrarEstadoMiniChat(estadoMiniChat, "Inicia sesión para ver tus mensajes.");
        listaConversacionesMiniChat.replaceChildren(crearEnlaceInicioSesion());
        return;
    }

    mostrarEstadoMiniChat(estadoMiniChat, "Cargando conversaciones...");
    try {
        const conversaciones = await window.MinoApi.solicitar("/conversaciones");
        if (!Array.isArray(conversaciones)) {
            throw new Error("La respuesta no contiene una lista de conversaciones.");
        }
        mostrarConversacionesMiniChat(conversaciones);
        mostrarEstadoMiniChat(estadoMiniChat, "");
    } catch (error) {
        mostrarEstadoMiniChat(
            estadoMiniChat,
            error.message || "No se pudieron cargar las conversaciones.",
            "error"
        );
    }
}

function renderizarMensajesMiniChat() {
    const ordenados = [...mensajesMiniChat.values()].sort(
        (a, b) => Number(a.id) - Number(b.id)
    );
    listaMensajesMiniChat.replaceChildren(...ordenados.map((mensaje) => {
        const burbuja = document.createElement("p");
        burbuja.className = Number(mensaje.remitenteId) ===
            Number(window.MinoApi.obtenerUsuario().id)
            ? "mensajeUsuario"
            : "";
        burbuja.dataset.id = String(mensaje.id);
        burbuja.textContent = mensaje.contenido;
        return burbuja;
    }));
    listaMensajesMiniChat.scrollTop = listaMensajesMiniChat.scrollHeight;
}

function agregarMensajeMiniChat(mensaje) {
    if (!mensaje || !Number.isSafeInteger(Number(mensaje.id))) return;
    mensajesMiniChat.set(Number(mensaje.id), mensaje);
    renderizarMensajesMiniChat();
}

async function sincronizarMensajesMiniChat(conversacionId) {
    if (
        panelMiniChat.hidden ||
        !conversacionMiniChat ||
        Number(conversacionMiniChat.id) !== Number(conversacionId)
    ) return;

    const cursor = Math.max(0, ...mensajesMiniChat.keys());
    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${encodeURIComponent(conversacionId)}/mensajes?afterId=${cursor}`
        );
        if (Number(conversacionMiniChat?.id) !== Number(conversacionId)) return;
        datos.mensajes.forEach(agregarMensajeMiniChat);
    } catch (error) {
        mostrarEstadoMiniChat(
            estadoMensajeMiniChat,
            error.message || "No se pudieron sincronizar los mensajes.",
            "error"
        );
    }
}

function solicitarSuscripcionMiniChat() {
    if (
        !socketMiniChatAutenticado ||
        !conversacionMiniChat ||
        conversacionMiniChatSolicitada === Number(conversacionMiniChat.id)
    ) return;

    conversacionMiniChatSolicitada = Number(conversacionMiniChat.id);
    socketMiniChat.send(JSON.stringify({
        type: "subscribe",
        conversationId: conversacionMiniChatSolicitada
    }));
}

function enviarMensajePendienteMiniChat() {
    if (
        !solicitudMiniChatPendiente ||
        !socketMiniChatAutenticado ||
        conversacionMiniChatSuscrita !== solicitudMiniChatPendiente.conversationId ||
        solicitudMiniChatPendiente.generacionSocket === generacionSocketMiniChat
    ) return;

    solicitudMiniChatPendiente.generacionSocket = generacionSocketMiniChat;
    socketMiniChat.send(JSON.stringify({
        type: "send_message",
        requestId: solicitudMiniChatPendiente.requestId,
        conversationId: solicitudMiniChatPendiente.conversationId,
        contenido: solicitudMiniChatPendiente.contenido
    }));
}

function procesarPaqueteMiniChat(evento) {
    let paquete;
    try {
        paquete = JSON.parse(evento.data);
    } catch (error) {
        console.error("La respuesta del minichat no contiene JSON válido.", error);
        mostrarEstadoMiniChat(estadoMensajeMiniChat, "Se recibió una respuesta inválida.", "error");
        return;
    }

    if (paquete.type === "authenticated") {
        socketMiniChatAutenticado = true;
        esperaReconectarMiniChat = 1000;
        actualizarControlesMiniChat();
        solicitarSuscripcionMiniChat();
    } else if (paquete.type === "subscribed") {
        conversacionMiniChatSuscrita = Number(paquete.conversationId);
        conversacionMiniChatSolicitada = conversacionMiniChatSuscrita;
        actualizarControlesMiniChat();
        void sincronizarMensajesMiniChat(conversacionMiniChatSuscrita);
        enviarMensajePendienteMiniChat();
    } else if (paquete.type === "new_message" || paquete.type === "message_sent") {
        if (Number(paquete.conversationId) === Number(conversacionMiniChat?.id)) {
            agregarMensajeMiniChat(paquete.mensaje);
            mostrarEstadoMiniChat(estadoMensajeMiniChat, "");
        }
        actualizarVistaPreviaConversacionMiniChat(
            paquete.conversationId,
            paquete.mensaje
        );

        if (
            paquete.type === "message_sent" &&
            solicitudMiniChatPendiente?.requestId === paquete.requestId
        ) {
            solicitudMiniChatPendiente = null;
            entradaMiniChat.value = "";
            actualizarControlesMiniChat();
            mostrarEstadoMiniChat(estadoMensajeMiniChat, "");
        }
        if (
            paquete.type === "new_message" &&
            listaVistaMiniChat.hidden === false &&
            !conversacionesMiniChat.some(
                (conversacion) =>
                    Number(conversacion.id) === Number(paquete.conversationId)
            )
        ) {
            void cargarConversacionesMiniChat();
        }
    } else if (paquete.type === "error") {
        if (solicitudMiniChatPendiente?.requestId === paquete.requestId) {
            solicitudMiniChatPendiente = null;
            actualizarControlesMiniChat();
        }
        mostrarEstadoMiniChat(estadoMensajeMiniChat, paquete.mensaje, "error");
    }
}

function conectarSocketMiniChat() {
    if (
        panelMiniChat.hidden ||
        !window.MinoApi.tieneSesion() ||
        socketMiniChat
    ) return;

    const conexion = new WebSocket(window.MinoApi.urlWebSocket());
    socketMiniChat = conexion;
    generacionSocketMiniChat += 1;
    actualizarControlesMiniChat();

    conexion.addEventListener("open", () => {
        if (socketMiniChat !== conexion) return;
        conexion.send(JSON.stringify({
            type: "authenticate",
            token: localStorage.getItem("minoToken")
        }));
    });
    conexion.addEventListener("message", (evento) => {
        if (socketMiniChat === conexion) procesarPaqueteMiniChat(evento);
    });
    conexion.addEventListener("close", (evento) => {
        if (socketMiniChat !== conexion) return;
        socketMiniChat = null;
        socketMiniChatAutenticado = false;
        conversacionMiniChatSuscrita = null;
        conversacionMiniChatSolicitada = null;
        actualizarControlesMiniChat();

        if (evento.code === 4401) {
            window.MinoApi.cerrarSesion();
            mostrarEstadoMiniChat(estadoMensajeMiniChat, "La sesión venció. Inicia sesión de nuevo.", "error");
            return;
        }
        if (!panelMiniChat.hidden) {
            mostrarEstadoMiniChat(estadoMensajeMiniChat, "Reconectando...");
            temporizadorReconectarMiniChat = window.setTimeout(
                conectarSocketMiniChat,
                esperaReconectarMiniChat
            );
            esperaReconectarMiniChat = Math.min(esperaReconectarMiniChat * 2, 15000);
        }
    });
    conexion.addEventListener("error", () => {
        mostrarEstadoMiniChat(estadoMensajeMiniChat, "Conexión en tiempo real interrumpida.", "error");
    });
}

async function seleccionarConversacionMiniChat(conversacion) {
    conversacionMiniChat = conversacion;
    guardarConversacionMiniChat(conversacion.id);
    mensajesMiniChat = new Map();
    listaVistaMiniChat.hidden = true;
    vistaConversacionMiniChat.hidden = false;
    botonVolverMiniChat.hidden = false;
    avatarMiniChat.hidden = false;
    avatarMiniChat.textContent = obtenerInicialMiniChat(conversacion.nombre);
    tituloMiniChat.textContent = conversacion.nombre;
    subtituloMiniChat.textContent = "Activo en conversación";
    listaMensajesMiniChat.replaceChildren();
    mostrarEstadoMiniChat(estadoMensajeMiniChat, "Cargando mensajes...");
    conectarSocketMiniChat();
    solicitarSuscripcionMiniChat();

    try {
        const datos = await window.MinoApi.solicitar(
            `/conversaciones/${encodeURIComponent(conversacion.id)}/mensajes`
        );
        if (Number(conversacionMiniChat?.id) !== Number(conversacion.id)) return;
        datos.mensajes.forEach(agregarMensajeMiniChat);
        mostrarEstadoMiniChat(
            estadoMensajeMiniChat,
            datos.mensajes.length ? "" : "Este es el inicio de la conversación."
        );
    } catch (error) {
        mostrarEstadoMiniChat(
            estadoMensajeMiniChat,
            error.message || "No se pudieron cargar los mensajes.",
            "error"
        );
    }
}

async function restaurarConversacionMiniChat(conversacionId) {
    panelMiniChat.hidden = false;
    botonAbrirMiniChat.setAttribute("aria-expanded", "true");
    listaVistaMiniChat.hidden = true;
    vistaConversacionMiniChat.hidden = false;
    botonVolverMiniChat.hidden = false;
    avatarMiniChat.hidden = false;
    tituloMiniChat.textContent = "Cargando conversación...";
    mostrarEstadoMiniChat(estadoMensajeMiniChat, "Restaurando conversación...");

    try {
        const conversaciones = await window.MinoApi.solicitar("/conversaciones");
        if (!Array.isArray(conversaciones)) {
            throw new Error("La respuesta no contiene una lista de conversaciones.");
        }
        mostrarConversacionesMiniChat(conversaciones);
        const conversacion = conversaciones.find(
            (item) => Number(item.id) === Number(conversacionId)
        );
        if (!conversacion) {
            limpiarConversacionMiniChatGuardada();
            volverAConversacionesMiniChat();
            mostrarEstadoMiniChat(
                estadoMiniChat,
                "No se encontró la conversación guardada.",
                "error"
            );
            return;
        }
        await seleccionarConversacionMiniChat(conversacion);
        conectarSocketMiniChat();
    } catch (error) {
        limpiarConversacionMiniChatGuardada();
        mostrarEstadoMiniChat(
            estadoMensajeMiniChat,
            error.message || "No se pudo restaurar la conversación.",
            "error"
        );
    }
}

function volverAConversacionesMiniChat() {
    limpiarConversacionMiniChatGuardada();
    if (socketMiniChatAutenticado && conversacionMiniChatSuscrita !== null) {
        socketMiniChat.send(JSON.stringify({ type: "unsubscribe" }));
    }
    conversacionMiniChat = null;
    conversacionMiniChatSuscrita = null;
    conversacionMiniChatSolicitada = null;
    mensajesMiniChat.clear();
    listaVistaMiniChat.hidden = false;
    vistaConversacionMiniChat.hidden = true;
    botonVolverMiniChat.hidden = true;
    avatarMiniChat.hidden = true;
    tituloMiniChat.textContent = "Mensajes";
    subtituloMiniChat.textContent = "Tus conversaciones";
    mostrarEstadoMiniChat(estadoMensajeMiniChat, "");
    actualizarControlesMiniChat();
    void cargarConversacionesMiniChat();
}

function cerrarMiniChat() {
    limpiarConversacionMiniChatGuardada();
    panelMiniChat.hidden = true;
    botonAbrirMiniChat.setAttribute("aria-expanded", "false");
    if (temporizadorReconectarMiniChat !== null) {
        window.clearTimeout(temporizadorReconectarMiniChat);
        temporizadorReconectarMiniChat = null;
    }
    if (socketMiniChat) {
        const conexion = socketMiniChat;
        socketMiniChat = null;
        conexion.close(1000, "Minichat cerrado");
    }
    socketMiniChatAutenticado = false;
    conversacionMiniChatSuscrita = null;
    conversacionMiniChatSolicitada = null;
    actualizarControlesMiniChat();
}

botonAbrirMiniChat.addEventListener("click", () => {
    const abierto = panelMiniChat.hidden;
    panelMiniChat.hidden = !abierto;
    botonAbrirMiniChat.setAttribute("aria-expanded", String(abierto));
    if (abierto) {
        void cargarConversacionesMiniChat();
        conectarSocketMiniChat();
    } else {
        cerrarMiniChat();
    }
});

botonCerrarMiniChat.addEventListener("click", cerrarMiniChat);
botonVolverMiniChat.addEventListener("click", volverAConversacionesMiniChat);

formularioMiniChat.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const contenido = entradaMiniChat.value.trim();
    if (!contenido || !conversacionMiniChat || solicitudMiniChatPendiente) return;
    if (
        !socketMiniChatAutenticado ||
        conversacionMiniChatSuscrita !== Number(conversacionMiniChat.id)
    ) {
        mostrarEstadoMiniChat(estadoMensajeMiniChat, "Conectando al chat. Intenta enviar de nuevo.");
        return;
    }

    const requestId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    solicitudMiniChatPendiente = {
        requestId,
        conversationId: Number(conversacionMiniChat.id),
        contenido,
        generacionSocket: 0
    };
    actualizarControlesMiniChat();
    mostrarEstadoMiniChat(estadoMensajeMiniChat, "Enviando...");
    enviarMensajePendienteMiniChat();
});

document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !panelMiniChat.hidden) {
        cerrarMiniChat();
        botonAbrirMiniChat.focus();
    }
});

if (
    Number.isSafeInteger(conversacionRestaurarId) &&
    conversacionRestaurarId > 0 &&
    window.MinoApi.tieneSesion()
) {
    void restaurarConversacionMiniChat(conversacionRestaurarId);
} else if (Number.isSafeInteger(conversacionRestaurarId) && conversacionRestaurarId > 0) {
    limpiarConversacionMiniChatGuardada();
}
