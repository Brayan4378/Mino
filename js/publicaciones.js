const contenedorPublicaciones = document.getElementById("listaPublicaciones");
const listaMisPublicaciones = document.getElementById("misPublicaciones");
const listaPublicacionesEditables = document.getElementById("publicacionesEditables");
const formularioPublicacion = document.getElementById("formularioPublicacion");
const estadoPublicaciones = document.getElementById("estadoPublicaciones");

let publicacionesAPI = [];
let publicacionesPropias = [];
const usuarioActual = window.MinoApi.obtenerUsuario();

function mostrarMensaje(mensaje, tipo = "") {
    if (!estadoPublicaciones) return;
    estadoPublicaciones.textContent = mensaje;
    if (tipo) {
        estadoPublicaciones.dataset.tipo = tipo;
    } else {
        delete estadoPublicaciones.dataset.tipo;
    }
}

function mostrarEstado(elemento, mensaje, tipo = "") {
    elemento.textContent = mensaje;
    if (tipo) {
        elemento.dataset.tipo = tipo;
    } else {
        delete elemento.dataset.tipo;
    }
}

function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined && texto !== null) elemento.textContent = texto;
    return elemento;
}

function crearFormularioEdicion(publicacion) {
    const formulario = crearElemento("form", "formulario-edicion");
    formulario.hidden = true;

    const etiquetaTitulo = crearElemento("label", "", "Titulo");
    const campoTitulo = crearElemento("input");
    campoTitulo.name = "title";
    campoTitulo.value = publicacion.title;
    campoTitulo.maxLength = 100;
    campoTitulo.required = true;
    etiquetaTitulo.appendChild(campoTitulo);

    const etiquetaContenido = crearElemento("label", "", "Contenido");
    const campoContenido = crearElemento("textarea");
    campoContenido.name = "body";
    campoContenido.value = publicacion.body;
    campoContenido.maxLength = 500;
    campoContenido.rows = 3;
    campoContenido.required = true;
    etiquetaContenido.appendChild(campoContenido);

    const etiquetaImagen = crearElemento("label", "", "Cambiar imagen (opcional, máximo 10 MB)");
    const campoImagen = crearElemento("input");
    campoImagen.type = "file";
    campoImagen.name = "imagen";
    campoImagen.accept = "image/png,image/jpeg,image/webp";
    etiquetaImagen.appendChild(campoImagen);

    const botonGuardar = crearElemento("button", "", "Guardar cambios");
    botonGuardar.type = "submit";

    const botonCancelar = crearElemento("button", "", "Cancelar");
    botonCancelar.type = "button";
    botonCancelar.dataset.accion = "cancelar-edicion";

    formulario.append(etiquetaTitulo, etiquetaContenido, etiquetaImagen, botonGuardar, botonCancelar);
    return formulario;
}

function crearTarjetaPublicacion(publicacion, opciones = {}) {
    const { permitirEdicion = false, mostrarMenu = true } = opciones;
    const esPropia = usuarioActual && Number(publicacion.userId) === Number(usuarioActual.id);
    const tarjeta = crearElemento("article", permitirEdicion ? "publicacion publicacion-propia" : "publicacion");
    tarjeta.dataset.id = publicacion.id;
    tarjeta.id = `publicacion-${publicacion.id}`;

    const encabezado = crearElemento("div", "publicacion-encabezado");
    const inicial = publicacion.nombreUsuario
        ? publicacion.nombreUsuario.trim().charAt(0).toUpperCase()
        : "U";
    let avatar;
    if (publicacion.fotoPerfil) {
        avatar = crearElemento("img", "avatar-publicacion");
        avatar.src = window.MinoApi.urlArchivo(publicacion.fotoPerfil);
        avatar.alt = "";
        avatar.addEventListener("error", () => {
            const inicialFallback = crearElemento("span", "avatar-publicacion", inicial);
            inicialFallback.setAttribute("aria-hidden", "true");
            avatar.replaceWith(inicialFallback);
        }, { once: true });
    } else {
        avatar = crearElemento("span", "avatar-publicacion", inicial);
        avatar.setAttribute("aria-hidden", "true");
    }
    const usuario = crearElemento("strong", "", publicacion.nombreUsuario || `Usuario ${publicacion.userId}`);
    encabezado.append(avatar, usuario);

    if (permitirEdicion) {
        const acciones = crearElemento("div", "acciones-publicacion");
        const botonEditar = crearElemento("button", "", "Editar");
        botonEditar.type = "button";
        botonEditar.dataset.accion = "editar";
        const botonEliminar = crearElemento("button", "", "Eliminar");
        botonEliminar.type = "button";
        botonEliminar.dataset.accion = "eliminar";
        acciones.append(botonEditar, botonEliminar);
        encabezado.appendChild(acciones);
    } else if (mostrarMenu && esPropia) {
        const menu = crearElemento("details", "menu-publicacion");
        const botonOpciones = crearElemento("summary", "boton-opciones-publicacion");
        botonOpciones.setAttribute("aria-label", "Opciones de publicacion");
        botonOpciones.title = "Opciones de publicacion";
        for (let indice = 0; indice < 3; indice += 1) {
            botonOpciones.appendChild(crearElemento("span", "linea-menu-publicacion"));
        }

        const botonEliminar = crearElemento("button", "", "Eliminar");
        botonEliminar.type = "button";
        botonEliminar.dataset.accion = "eliminar";
        menu.append(botonOpciones, botonEliminar);
        encabezado.appendChild(menu);
    }

    const titulo = crearElemento("h3", "", publicacion.title);
    const contenido = crearElemento("p", "", publicacion.body);
    tarjeta.append(encabezado, titulo, contenido);
    if (publicacion.imagenUrl) {
        const imagen = crearElemento("img", "imagen-publicacion");
        imagen.src = window.MinoApi.urlArchivo(publicacion.imagenUrl);
        imagen.alt = "Imagen de la publicación";
        imagen.loading = "lazy";
        tarjeta.appendChild(imagen);
    }
    tarjeta.appendChild(crearInteraccionesPublicacion(publicacion));
    if (permitirEdicion) tarjeta.appendChild(crearFormularioEdicion(publicacion));
    return tarjeta;
}

function crearInteraccionesPublicacion(publicacion) {
    const interacciones = crearElemento("section", "interacciones-publicacion");
    const acciones = crearElemento("div", "acciones-sociales-publicacion");
    const botonLike = crearElemento(
        "button",
        publicacion.likedByMe ? "boton-like-publicacion activo" : "boton-like-publicacion",
        publicacion.likedByMe ? "♥ Te gusta" : "♡ Me gusta"
    );
    botonLike.type = "button";
    botonLike.dataset.accionSocial = "like";
    botonLike.dataset.liked = String(Boolean(publicacion.likedByMe));
    botonLike.setAttribute("aria-pressed", String(Boolean(publicacion.likedByMe)));
    const cantidadLikes = crearElemento("span", "cantidad-likes", String(publicacion.likes || 0));
    const botonComentarios = crearElemento(
        "button",
        "boton-comentarios",
        `Comentarios (${publicacion.comentarios || 0})`
    );
    botonComentarios.type = "button";
    botonComentarios.dataset.accionSocial = "comentarios";
    botonComentarios.setAttribute("aria-expanded", "false");
    acciones.append(botonLike, cantidadLikes, botonComentarios);

    const panelComentarios = crearElemento("div", "panel-comentarios");
    panelComentarios.hidden = true;
    const listaComentarios = crearElemento("div", "lista-comentarios");
    listaComentarios.setAttribute("aria-live", "polite");
    const estadoComentarios = crearElemento("p", "estado-comentarios");
    estadoComentarios.setAttribute("role", "status");
    const formulario = crearElemento("form", "formulario-comentario");
    formulario.dataset.publicacionId = String(publicacion.id);
    const campo = crearElemento("input");
    campo.name = "contenido";
    campo.type = "text";
    campo.maxLength = 500;
    campo.placeholder = "Escribe un comentario...";
    campo.setAttribute("aria-label", "Escribe un comentario");
    campo.required = true;
    const enviar = crearElemento("button", "", "Publicar");
    enviar.type = "submit";
    formulario.append(campo, enviar);
    panelComentarios.append(listaComentarios, estadoComentarios, formulario);
    interacciones.append(acciones, panelComentarios);
    return interacciones;
}

function crearFormularioRespuesta(comentario) {
    const formulario = crearElemento("form", "formulario-comentario formulario-respuesta");
    formulario.hidden = true;
    formulario.dataset.comentarioPadreId = String(comentario.id);

    const campo = crearElemento("input");
    campo.name = "contenido";
    campo.type = "text";
    campo.maxLength = 500;
    campo.placeholder = `Responder a ${comentario.nombre}...`;
    campo.setAttribute("aria-label", `Responder al comentario de ${comentario.nombre}`);
    campo.required = true;

    const enviar = crearElemento("button", "", "Responder");
    enviar.type = "submit";
    formulario.append(campo, enviar);
    return formulario;
}

function mostrarListaComentarios(contenedor, comentarios) {
    contenedor.replaceChildren();
    const comentariosPorId = new Map(
        comentarios.map((comentario) => [String(comentario.id), { ...comentario, respuestas: [] }])
    );
    const comentariosPrincipales = [];

    comentariosPorId.forEach((comentario) => {
        const padre = comentario.comentarioPadreId === null
            ? null
            : comentariosPorId.get(String(comentario.comentarioPadreId));
        if (padre) {
            padre.respuestas.push(comentario);
        } else {
            comentariosPrincipales.push(comentario);
        }
    });

    function crearFilaComentario(comentario) {
        const fila = crearElemento("article", "comentario-publicacion");
        const avatar = crearElemento("img", "avatar-comentario");
        avatar.src = comentario.fotoPerfil
            ? window.MinoApi.urlArchivo(comentario.fotoPerfil)
            : "/Imagenes/usuario.png";
        avatar.alt = "";
        avatar.addEventListener("error", () => {
            avatar.src = "/Imagenes/usuario.png";
        }, { once: true });

        const texto = crearElemento("p", "texto-comentario");
        const autor = crearElemento("strong", "", comentario.nombre);
        texto.append(autor, document.createTextNode(` ${comentario.contenido}`));
        const contenido = crearElemento("div", "contenido-comentario");
        const botonResponder = crearElemento("button", "boton-responder-comentario", "Responder");
        botonResponder.type = "button";
        botonResponder.dataset.responderComentario = String(comentario.id);
        botonResponder.setAttribute("aria-expanded", "false");
        contenido.append(texto, botonResponder, crearFormularioRespuesta(comentario));

        if (comentario.respuestas.length > 0) {
            const respuestas = crearElemento("div", "respuestas-comentario");
            comentario.respuestas.forEach((respuesta) => {
                respuestas.appendChild(crearFilaComentario(respuesta));
            });
            contenido.appendChild(respuestas);
        }
        fila.append(avatar, contenido);
        return fila;
    }

    comentariosPrincipales.forEach((comentario) => {
        contenedor.appendChild(crearFilaComentario(comentario));
    });
}

function actualizarContadorComentarios(tarjeta, cantidad) {
    const boton = tarjeta.querySelector("[data-accion-social='comentarios']");
    boton.textContent = `Comentarios (${cantidad})`;
}

function mostrarPublicaciones() {
    if (!contenedorPublicaciones) return;
    contenedorPublicaciones.replaceChildren(...publicacionesAPI.map((publicacion) =>
        crearTarjetaPublicacion(publicacion)
    ));
    if (window.location.hash.startsWith("#publicacion-")) {
        document.getElementById(window.location.hash.slice(1))
            ?.scrollIntoView({ block: "center" });
    }
}

function mostrarMisPublicaciones() {
    if (!listaMisPublicaciones) return;
    if (publicacionesPropias.length === 0) {
        listaMisPublicaciones.replaceChildren(crearElemento("p", "", "Aun no tienes publicaciones."));
        return;
    }
    listaMisPublicaciones.replaceChildren(...publicacionesPropias.map((publicacion) =>
        crearTarjetaPublicacion(publicacion, { mostrarMenu: false })
    ));
}

function mostrarPublicacionesEditables() {
    if (!listaPublicacionesEditables) return;
    if (publicacionesPropias.length === 0) {
        listaPublicacionesEditables.replaceChildren(crearElemento("p", "", "Aun no tienes publicaciones."));
        return;
    }
    listaPublicacionesEditables.replaceChildren(...publicacionesPropias.map((publicacion) =>
        crearTarjetaPublicacion(publicacion, { permitirEdicion: true })
    ));
}

async function cargarPublicaciones() {
    let cargaCorrecta = true;
    if (contenedorPublicaciones) {
        try {
            const datos = await window.MinoApi.solicitar("/publicaciones?limit=10");
            if (!Array.isArray(datos)) throw new Error("La respuesta no contiene una lista de publicaciones");
            publicacionesAPI = datos;
            mostrarPublicaciones();
            if (publicacionesAPI.length === 0) {
                mostrarMensaje("Sin publicaciones que mostrar.");
            } else {
                mostrarMensaje("");
            }
        } catch (error) {
            cargaCorrecta = false;
            mostrarMensaje(error.message || "No se pudieron cargar las publicaciones.", "error");
        }
    }

    if (listaMisPublicaciones || listaPublicacionesEditables) {
        if (!usuarioActual) {
            mostrarMisPublicaciones();
            mostrarPublicacionesEditables();
            mostrarMensaje("Inicia sesión para consultar y administrar tus publicaciones.", "error");
            return false;
        }

        try {
            const datos = await window.MinoApi.solicitar("/publicaciones/mias");
            if (!Array.isArray(datos)) throw new Error("La respuesta no contiene una lista de publicaciones");
            publicacionesPropias = datos;
            mostrarMisPublicaciones();
            mostrarPublicacionesEditables();
        } catch (error) {
            cargaCorrecta = false;
            mostrarMensaje(error.message || "No se pudieron cargar tus publicaciones.", "error");
        }
    }
    return cargaCorrecta;
}

if (formularioPublicacion) {
    formularioPublicacion.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const datosFormulario = new FormData(formularioPublicacion);
        const nuevaPublicacion = {
            title: String(datosFormulario.get("title") || "").trim(),
            body: String(datosFormulario.get("body") || "").trim()
        };
        const imagen = datosFormulario.get("imagen");

        if (!nuevaPublicacion.title || !nuevaPublicacion.body) {
            mostrarMensaje("Escribe un titulo y el contenido de la publicacion.", "error");
            return;
        }
        if (imagen.size > 10 * 1024 * 1024) {
            mostrarMensaje("La imagen no puede superar los 10 MB.", "error");
            return;
        }

        const botonEnviar = formularioPublicacion.querySelector("button[type='submit']");
        botonEnviar.disabled = true;
        try {
            datosFormulario.set("title", nuevaPublicacion.title);
            datosFormulario.set("body", nuevaPublicacion.body);
            await window.MinoApi.solicitar("/publicaciones", {
                method: "POST",
                body: datosFormulario
            });
            formularioPublicacion.reset();
            if (await cargarPublicaciones()) {
                mostrarMensaje("Publicacion creada correctamente.", "exito");
            }
        } catch (error) {
            mostrarMensaje(error.message || "No se pudo crear la publicacion.", "error");
        } finally {
            botonEnviar.disabled = false;
        }
    });
}

async function eliminarPublicacion(boton) {
    const tarjeta = boton.closest(".publicacion");
    if (!tarjeta || !window.confirm("¿Quieres eliminar esta publicacion?")) return;

    boton.disabled = true;
    try {
        await window.MinoApi.solicitar(`/publicaciones/${encodeURIComponent(tarjeta.dataset.id)}`, {
            method: "DELETE"
        });
        if (await cargarPublicaciones()) {
            mostrarMensaje("Publicacion eliminada correctamente.", "exito");
        }
    } catch (error) {
        boton.disabled = false;
        mostrarMensaje(error.message || "No se pudo eliminar la publicacion.", "error");
    }
}

document.addEventListener("click", async (evento) => {
    const botonResponder = evento.target.closest("button[data-responder-comentario]");
    if (botonResponder) {
        if (!window.MinoApi.tieneSesion()) {
            window.location.href = "Login.html";
            return;
        }

        const formulario = botonResponder.parentElement.querySelector(".formulario-respuesta");
        formulario.hidden = !formulario.hidden;
        botonResponder.setAttribute("aria-expanded", String(!formulario.hidden));
        if (!formulario.hidden) formulario.elements.contenido.focus();
        return;
    }

    const boton = evento.target.closest("button[data-accion-social]");
    if (!boton) return;
    const tarjeta = boton.closest(".publicacion");
    if (!tarjeta) return;

    if (boton.dataset.accionSocial === "like") {
        if (!window.MinoApi.tieneSesion()) {
            window.location.href = "Login.html";
            return;
        }

        boton.disabled = true;
        const estabaMarcada = boton.dataset.liked === "true";
        try {
            const resultado = await window.MinoApi.solicitar(
                `/publicaciones/${encodeURIComponent(tarjeta.dataset.id)}/like`,
                { method: estabaMarcada ? "DELETE" : "POST" }
            );
            boton.dataset.liked = String(resultado.liked);
            boton.setAttribute("aria-pressed", String(resultado.liked));
            boton.classList.toggle("activo", resultado.liked);
            boton.textContent = resultado.liked ? "♥ Te gusta" : "♡ Me gusta";
            tarjeta.querySelector(".cantidad-likes").textContent = String(resultado.likes);
        } catch (error) {
            mostrarMensaje(error.message, "error");
        } finally {
            boton.disabled = false;
        }
        return;
    }

    const panel = tarjeta.querySelector(".panel-comentarios");
    const abierto = boton.getAttribute("aria-expanded") === "true";
    panel.hidden = abierto;
    boton.setAttribute("aria-expanded", String(!abierto));
    if (abierto || boton.dataset.cargado === "true") return;

    const estado = panel.querySelector(".estado-comentarios");
    mostrarEstado(estado, "Cargando comentarios...");
    try {
        const comentarios = await window.MinoApi.solicitar(
            `/publicaciones/${encodeURIComponent(tarjeta.dataset.id)}/comentarios`
        );
        mostrarListaComentarios(panel.querySelector(".lista-comentarios"), comentarios.comentarios);
        actualizarContadorComentarios(tarjeta, comentarios.total);
        boton.dataset.cargado = "true";
        mostrarEstado(estado, comentarios.total ? "" : "Aún no hay comentarios.");
    } catch (error) {
        mostrarEstado(estado, error.message, "error");
    }
});

document.addEventListener("submit", async (evento) => {
    const formulario = evento.target.closest(".formulario-comentario, .formulario-respuesta");
    if (!formulario) return;
    evento.preventDefault();
    if (!window.MinoApi.tieneSesion()) {
        window.location.href = "Login.html";
        return;
    }

    const tarjeta = formulario.closest(".publicacion");
    const campo = formulario.elements.contenido;
    const contenido = campo.value.trim();
    if (!contenido) return;

    const boton = formulario.querySelector("button[type='submit']");
    boton.disabled = true;
    try {
        const resultado = await window.MinoApi.solicitar(
            `/publicaciones/${encodeURIComponent(tarjeta.dataset.id)}/comentarios`,
            {
                method: "POST",
                body: JSON.stringify({
                    contenido,
                    ...(formulario.dataset.comentarioPadreId
                        ? { comentarioPadreId: formulario.dataset.comentarioPadreId }
                        : {})
                })
            }
        );
        campo.value = "";
        mostrarListaComentarios(
            tarjeta.querySelector(".lista-comentarios"),
            resultado.comentarios
        );
        actualizarContadorComentarios(tarjeta, resultado.total);
        tarjeta.querySelector("[data-accion-social='comentarios']").dataset.cargado = "true";
        mostrarEstado(tarjeta.querySelector(".estado-comentarios"), "");
        if (!resultado.comentario) throw new Error("No se pudo confirmar el comentario publicado.");
    } catch (error) {
        mostrarEstado(tarjeta.querySelector(".estado-comentarios"), error.message, "error");
    } finally {
        boton.disabled = false;
    }
});

if (contenedorPublicaciones) {
    contenedorPublicaciones.addEventListener("click", async (evento) => {
        const boton = evento.target.closest("button[data-accion='eliminar']");
        if (boton) await eliminarPublicacion(boton);
    });
}

if (listaPublicacionesEditables) {
    listaPublicacionesEditables.addEventListener("click", async (evento) => {
        const boton = evento.target.closest("button[data-accion]");
        if (!boton) return;
        const formulario = boton.closest(".publicacion").querySelector(".formulario-edicion");
        if (boton.dataset.accion === "editar") {
            formulario.hidden = !formulario.hidden;
        } else if (boton.dataset.accion === "cancelar-edicion") {
            formulario.hidden = true;
        } else if (boton.dataset.accion === "eliminar") {
            await eliminarPublicacion(boton);
        }
    });

    listaPublicacionesEditables.addEventListener("submit", async (evento) => {
        if (!evento.target.matches(".formulario-edicion")) return;
        evento.preventDefault();
        const formulario = evento.target;
        const tarjeta = formulario.closest(".publicacion");
        const datosFormulario = new FormData(formulario);
        const cambios = {
            title: String(datosFormulario.get("title") || "").trim(),
            body: String(datosFormulario.get("body") || "").trim()
        };
        const imagen = datosFormulario.get("imagen");

        if (!cambios.title || !cambios.body) {
            mostrarMensaje("El titulo y el contenido no pueden quedar vacios.", "error");
            return;
        }
        if (imagen && imagen.size > 10 * 1024 * 1024) {
            mostrarMensaje("La imagen no puede superar los 10 MB.", "error");
            return;
        }

        const botonGuardar = formulario.querySelector("button[type='submit']");
        botonGuardar.disabled = true;
        try {
            datosFormulario.set("title", cambios.title);
            datosFormulario.set("body", cambios.body);
            await window.MinoApi.solicitar(`/publicaciones/${encodeURIComponent(tarjeta.dataset.id)}`, {
                method: "PUT",
                body: datosFormulario
            });
            if (await cargarPublicaciones()) {
                mostrarMensaje("Publicacion actualizada correctamente.", "exito");
            }
        } catch (error) {
            botonGuardar.disabled = false;
            mostrarMensaje(error.message || "No se pudo actualizar la publicacion.", "error");
        }
    });
}

mostrarMisPublicaciones();
cargarPublicaciones();
