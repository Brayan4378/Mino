const listaNotificaciones = document.getElementById("listaNotificaciones");
const seccionSolicitudesSeguimiento = document.getElementById("seccionSolicitudesSeguimiento");
const listaSolicitudesSeguimiento = document.getElementById("listaSolicitudesSeguimiento");
const tituloActividadNotificaciones = document.getElementById("tituloActividadNotificaciones");
const estadoNotificaciones = document.getElementById("estadoNotificaciones");
const botonMarcarTodasLeidas = document.getElementById("marcarTodasLeidas");
const insigniaNotificaciones = document.getElementById("insigniaNotificaciones");

function mostrarEstadoNotificaciones(mensaje, tipo = "") {
    if (!estadoNotificaciones) return;
    estadoNotificaciones.textContent = mensaje;
    if (tipo) estadoNotificaciones.dataset.tipo = tipo;
    else delete estadoNotificaciones.dataset.tipo;
}

function actualizarInsigniaNotificaciones(cantidad) {
    if (!insigniaNotificaciones) return;
    insigniaNotificaciones.hidden = !cantidad;
    insigniaNotificaciones.textContent = cantidad > 99 ? "99+" : String(cantidad);
    insigniaNotificaciones.setAttribute(
        "aria-label",
        `${cantidad} notificaciones o solicitudes pendientes`
    );
}

function crearSolicitudSeguimiento(solicitud) {
    const fila = document.createElement("article");
    fila.className = "notificacion notificacion-no-leida notificacion-solicitud";
    fila.dataset.solicitudId = solicitud.id;

    const enlacePerfil = document.createElement("a");
    enlacePerfil.className = "notificacion-avatar-enlace";
    enlacePerfil.href = `Perfil.html?id=${encodeURIComponent(solicitud.solicitanteId)}`;
    const avatar = document.createElement("img");
    avatar.className = "notificacion-avatar";
    avatar.src = solicitud.solicitanteFotoPerfil
        ? window.MinoApi.urlArchivo(solicitud.solicitanteFotoPerfil)
        : "Imagenes/usuario.png";
    avatar.alt = "";
    avatar.addEventListener("error", () => {
        avatar.src = "Imagenes/usuario.png";
    }, { once: true });
    enlacePerfil.appendChild(avatar);

    const contenido = document.createElement("div");
    contenido.className = "notificacion-contenido";
    const texto = document.createElement("p");
    const actor = document.createElement("a");
    actor.className = "notificacion-actor";
    actor.href = enlacePerfil.href;
    actor.textContent = solicitud.solicitanteNombre;
    texto.append(actor, document.createTextNode(" quiere seguirte."));

    const fecha = document.createElement("time");
    fecha.className = "notificacion-fecha";
    fecha.dateTime = solicitud.fechaSolicitud.replace(" ", "T") + "Z";
    fecha.textContent = obtenerFechaNotificacion(solicitud.fechaSolicitud);
    contenido.append(texto, fecha);

    const acciones = document.createElement("div");
    acciones.className = "solicitud-seguimiento-acciones";
    const aceptar = document.createElement("button");
    aceptar.type = "button";
    aceptar.dataset.accionSolicitud = "aceptar";
    aceptar.textContent = "Aceptar";
    const rechazar = document.createElement("button");
    rechazar.type = "button";
    rechazar.dataset.accionSolicitud = "rechazar";
    rechazar.textContent = "Rechazar";
    acciones.append(aceptar, rechazar);

    fila.append(enlacePerfil, contenido, acciones);
    return fila;
}

function obtenerFechaNotificacion(fecha) {
    const fechaNormalizada = fecha.includes("T") ? fecha : `${fecha.replace(" ", "T")}Z`;
    const valor = new Date(fechaNormalizada);
    if (Number.isNaN(valor.getTime())) return "";
    return new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short"
    }).format(valor);
}

function crearNotificacion(notificacion) {
    const fila = document.createElement("article");
    fila.className = notificacion.leida
        ? "notificacion"
        : "notificacion notificacion-no-leida";
    fila.dataset.id = notificacion.id;

    const enlacePerfil = document.createElement("a");
    enlacePerfil.className = "notificacion-avatar-enlace";
    enlacePerfil.href = `Perfil.html?id=${encodeURIComponent(notificacion.actorId)}`;
    const avatar = document.createElement("img");
    avatar.className = "notificacion-avatar";
    avatar.src = notificacion.actorFotoPerfil
        ? window.MinoApi.urlArchivo(notificacion.actorFotoPerfil)
        : "Imagenes/usuario.png";
    avatar.alt = "";
    avatar.addEventListener("error", () => {
        avatar.src = "Imagenes/usuario.png";
    }, { once: true });
    enlacePerfil.appendChild(avatar);

    const contenido = document.createElement("div");
    contenido.className = "notificacion-contenido";
    const texto = document.createElement("p");
    const actor = document.createElement("a");
    actor.className = "notificacion-actor";
    actor.href = enlacePerfil.href;
    actor.textContent = notificacion.actorNombre;

    let accion;
    let enlaceDestino;
    if (notificacion.tipo === "like_publicacion") {
        accion = "le dio Me gusta a tu publicación.";
        enlaceDestino = `Menu.html#publicacion-${notificacion.publicacionId}`;
    } else if (notificacion.tipo === "comentario") {
        accion = "comentó en tu publicación.";
        enlaceDestino = `Menu.html#publicacion-${notificacion.publicacionId}`;
    } else {
        accion = "le dio Me gusta a tu historia.";
        enlaceDestino = "Menu.html#historias";
    }

    texto.append(actor, document.createTextNode(` ${accion}`));
    contenido.appendChild(texto);

    if (notificacion.tipo === "comentario" && notificacion.contenidoComentario) {
        const comentario = document.createElement("p");
        comentario.className = "notificacion-comentario";
        comentario.textContent = `“${notificacion.contenidoComentario}”`;
        contenido.appendChild(comentario);
    }

    const detalle = notificacion.tipo === "like_historia"
        ? notificacion.textoHistoria
        : notificacion.tituloPublicacion;
    if (detalle) {
        const vistaPrevia = document.createElement("p");
        vistaPrevia.className = "notificacion-detalle";
        vistaPrevia.textContent = detalle;
        contenido.appendChild(vistaPrevia);
    }

    const fecha = document.createElement("time");
    fecha.className = "notificacion-fecha";
    fecha.dateTime = notificacion.fechaCreacion.replace(" ", "T") + "Z";
    fecha.textContent = obtenerFechaNotificacion(notificacion.fechaCreacion);
    contenido.appendChild(fecha);

    const destino = document.createElement("a");
    destino.className = "notificacion-destino";
    destino.href = enlaceDestino;
    destino.textContent = notificacion.tipo === "like_historia"
        ? "Ver historias"
        : "Ver publicación";

    fila.append(enlacePerfil, contenido, destino);
    if (!notificacion.leida) {
        const marcarLeida = document.createElement("button");
        marcarLeida.className = "notificacion-marcar-leida";
        marcarLeida.type = "button";
        marcarLeida.dataset.accionNotificacion = "leer";
        marcarLeida.setAttribute("aria-label", "Marcar notificación como leída");
        marcarLeida.title = "Marcar como leída";
        fila.appendChild(marcarLeida);
    }
    return fila;
}

async function cargarNotificaciones() {
    if (!window.MinoApi.tieneSesion()) {
        mostrarEstadoNotificaciones("Inicia sesión para ver tus notificaciones.");
        listaNotificaciones?.replaceChildren();
        listaSolicitudesSeguimiento?.replaceChildren();
        if (seccionSolicitudesSeguimiento) seccionSolicitudesSeguimiento.hidden = true;
        return;
    }

    try {
        const resultado = await window.MinoApi.solicitar("/notificaciones");
        const solicitudes = resultado.solicitudesSeguimiento || [];
        actualizarInsigniaNotificaciones(resultado.noLeidas + solicitudes.length);
        if (botonMarcarTodasLeidas) {
            botonMarcarTodasLeidas.disabled = resultado.noLeidas === 0;
        }
        if (seccionSolicitudesSeguimiento && listaSolicitudesSeguimiento) {
            listaSolicitudesSeguimiento.replaceChildren(...solicitudes.map(crearSolicitudSeguimiento));
            seccionSolicitudesSeguimiento.hidden = solicitudes.length === 0;
        }
        if (tituloActividadNotificaciones) {
            tituloActividadNotificaciones.hidden = resultado.notificaciones.length === 0;
        }
        if (listaNotificaciones) {
            listaNotificaciones.replaceChildren(
                ...resultado.notificaciones.map(crearNotificacion)
            );
            mostrarEstadoNotificaciones(
                resultado.notificaciones.length || solicitudes.length
                    ? ""
                    : "Aún no tienes notificaciones ni solicitudes de seguimiento."
            );
        }
    } catch (error) {
        mostrarEstadoNotificaciones(error.message, "error");
        console.error("No se pudieron cargar las notificaciones:", error);
    }
}

if (listaSolicitudesSeguimiento) {
    listaSolicitudesSeguimiento.addEventListener("click", async (evento) => {
        const boton = evento.target.closest("button[data-accion-solicitud]");
        if (!boton) return;
        const fila = boton.closest("[data-solicitud-id]");
        const aceptar = boton.dataset.accionSolicitud === "aceptar";
        listaSolicitudesSeguimiento.querySelectorAll("button").forEach((accion) => {
            accion.disabled = true;
        });
        try {
            const id = encodeURIComponent(fila.dataset.solicitudId);
            await window.MinoApi.solicitar(
                aceptar
                    ? `/solicitudes-seguimiento/${id}/aceptar`
                    : `/solicitudes-seguimiento/${id}`,
                { method: aceptar ? "POST" : "DELETE" }
            );
            mostrarEstadoNotificaciones(
                aceptar ? "Solicitud aceptada." : "Solicitud rechazada.",
                "exito"
            );
            await cargarNotificaciones();
        } catch (error) {
            mostrarEstadoNotificaciones(error.message, "error");
            listaSolicitudesSeguimiento.querySelectorAll("button").forEach((accion) => {
                accion.disabled = false;
            });
        }
    });
}

if (botonMarcarTodasLeidas) {
    botonMarcarTodasLeidas.addEventListener("click", async () => {
        botonMarcarTodasLeidas.disabled = true;
        try {
            await window.MinoApi.solicitar("/notificaciones/leer-todas", { method: "POST" });
            await cargarNotificaciones();
        } catch (error) {
            mostrarEstadoNotificaciones(error.message, "error");
        } finally {
            botonMarcarTodasLeidas.disabled = false;
        }
    });
}

if (listaNotificaciones) {
    listaNotificaciones.addEventListener("click", async (evento) => {
        const boton = evento.target.closest("button[data-accion-notificacion='leer']");
        if (!boton) return;
        const fila = boton.closest(".notificacion");
        boton.disabled = true;
        try {
            await window.MinoApi.solicitar(
                `/notificaciones/${encodeURIComponent(fila.dataset.id)}/leer`,
                { method: "PATCH" }
            );
            fila.classList.remove("notificacion-no-leida");
            boton.remove();
            await cargarNotificaciones();
        } catch (error) {
            mostrarEstadoNotificaciones(error.message, "error");
            boton.disabled = false;
        }
    });
}

cargarNotificaciones();
