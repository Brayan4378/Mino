const direccionAPI = "https://jsonplaceholder.typicode.com/posts";
const clavePublicacionesLocales = "mino.publicaciones.creadas.v1";
const clavePublicacionesEliminadas = "mino.publicaciones.eliminadas.v1";
const claveActualizacionesLocales = "mino.publicaciones.actualizadas.v1";
const contenedorPublicaciones = document.getElementById("listaPublicaciones");
const listaMisPublicaciones = document.getElementById("misPublicaciones");
const listaPublicacionesEditables = document.getElementById("publicacionesEditables");
const formularioPublicacion = document.getElementById("formularioPublicacion");
const estadoPublicaciones = document.getElementById("estadoPublicaciones");

let publicacionesLocales = leerLista(clavePublicacionesLocales);
let publicacionesAPI = [];
const idsEliminados = new Set(leerLista(clavePublicacionesEliminadas).map(String));
let actualizacionesLocales = leerObjeto(claveActualizacionesLocales);

function leerLista(clave) {
    try {
        const datos = JSON.parse(localStorage.getItem(clave) || "[]");
        return Array.isArray(datos) ? datos : [];
    } catch (error) {
        return [];
    }
}

function leerObjeto(clave) {
    try {
        const datos = JSON.parse(localStorage.getItem(clave) || "{}");
        return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : {};
    } catch (error) {
        return {};
    }
}

function guardarLista(clave, datos) {
    try {
        localStorage.setItem(clave, JSON.stringify(datos));
        return true;
    } catch (error) {
        return false;
    }
}

function mostrarMensaje(mensaje, tipo = "") {
    if (!estadoPublicaciones) return;
    estadoPublicaciones.textContent = mensaje;
    if (tipo) {
        estadoPublicaciones.dataset.tipo = tipo;
    } else {
        delete estadoPublicaciones.dataset.tipo;
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

    const botonGuardar = crearElemento("button", "", "Guardar cambios");
    botonGuardar.type = "submit";

    const botonCancelar = crearElemento("button", "", "Cancelar");
    botonCancelar.type = "button";
    botonCancelar.dataset.accion = "cancelar-edicion";

    formulario.append(etiquetaTitulo, etiquetaContenido, botonGuardar, botonCancelar);
    return formulario;
}

function crearTarjetaPublicacion(publicacion, opciones = {}) {
    const { permitirEdicion = false, mostrarMenu = true } = opciones;
    const tarjeta = crearElemento("article", permitirEdicion ? "publicacion publicacion-propia" : "publicacion");
    tarjeta.dataset.id = publicacion.id;

    const encabezado = crearElemento("div", "publicacion-encabezado");
    const avatar = crearElemento("span", "avatar-publicacion", `U${publicacion.userId || 1}`);
    avatar.setAttribute("aria-hidden", "true");
    const usuario = crearElemento("strong", "", `Usuario ${publicacion.userId || 1}`);
    encabezado.append(avatar, usuario);

    if (permitirEdicion) {
        const acciones = crearElemento("div", "acciones-publicacion");
        const botonEditar = crearElemento("button", "", "Editar");
        botonEditar.type = "button";
        botonEditar.dataset.accion = "editar";
        acciones.appendChild(botonEditar);
        encabezado.appendChild(acciones);
    } else if (mostrarMenu) {
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
    if (permitirEdicion) tarjeta.appendChild(crearFormularioEdicion(publicacion));
    return tarjeta;
}

function mostrarPublicaciones() {
    if (!contenedorPublicaciones) return;
    const publicaciones = [...publicacionesLocales, ...publicacionesAPI]
        .filter((publicacion) => !idsEliminados.has(String(publicacion.id)));
    contenedorPublicaciones.replaceChildren(...publicaciones.map((publicacion) => crearTarjetaPublicacion(publicacion)));
}

function mostrarMisPublicaciones() {
    if (!listaMisPublicaciones) return;
    if (publicacionesLocales.length === 0) {
        listaMisPublicaciones.replaceChildren(crearElemento("p", "", "Aun no tienes publicaciones."));
        return;
    }
    listaMisPublicaciones.replaceChildren(...publicacionesLocales.map((publicacion) =>
        crearTarjetaPublicacion(publicacion, { mostrarMenu: false })
    ));
}

function mostrarPublicacionesEditables() {
    if (!listaPublicacionesEditables) return;
    const editables = publicacionesAPI.filter((publicacion) => !idsEliminados.has(String(publicacion.id)));
    listaPublicacionesEditables.replaceChildren(...editables.map((publicacion) =>
        crearTarjetaPublicacion(publicacion, { permitirEdicion: true })
    ));
}

async function solicitarAPI(url, opciones = {}) {
    const respuesta = await fetch(url, opciones);
    if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
    if (respuesta.status === 204) return null;
    return respuesta.json();
}

async function cargarPublicaciones() {
    if (!contenedorPublicaciones && !listaPublicacionesEditables) return;
    mostrarPublicaciones();
    mostrarPublicacionesEditables();
    try {
        const datos = await solicitarAPI(`${direccionAPI}?_limit=10`);
        if (!Array.isArray(datos)) throw new Error("La respuesta no contiene una lista");
        publicacionesAPI = datos.map((publicacion) => ({
            ...publicacion,
            ...(actualizacionesLocales[String(publicacion.id)] || {})
        }));
        mostrarPublicaciones();
        mostrarPublicacionesEditables();
        mostrarMensaje(`Se cargaron ${publicacionesAPI.length} publicaciones.`, "exito");
    } catch (error) {
        mostrarMensaje("No se pudieron cargar las publicaciones. Revisa tu conexion e intenta de nuevo.", "error");
    }
}

if (formularioPublicacion) {
    formularioPublicacion.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const datosFormulario = new FormData(formularioPublicacion);
        const nuevaPublicacion = {
            title: datosFormulario.get("title").trim(),
            body: datosFormulario.get("body").trim(),
            userId: 1
        };

        if (!nuevaPublicacion.title || !nuevaPublicacion.body) {
            mostrarMensaje("Escribe un titulo y el contenido de la publicacion.", "error");
            return;
        }

        const botonEnviar = formularioPublicacion.querySelector("button[type='submit']");
        botonEnviar.disabled = true;
        try {
            const creada = await solicitarAPI(direccionAPI, {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=UTF-8" },
                body: JSON.stringify(nuevaPublicacion)
            });
            const publicacionLocal = {
                ...creada,
                ...nuevaPublicacion,
                id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                apiId: creada.id,
                esLocal: true
            };
            publicacionesLocales.unshift(publicacionLocal);
            const guardada = guardarLista(clavePublicacionesLocales, publicacionesLocales);
            formularioPublicacion.reset();
            mostrarMisPublicaciones();
            mostrarPublicaciones();
            mostrarMensaje(guardada ? "Publicacion creada correctamente." : "Se creo, pero no se pudo guardar en este navegador.", guardada ? "exito" : "error");
        } catch (error) {
            mostrarMensaje("No se pudo crear la publicacion. Intenta de nuevo.", "error");
        } finally {
            botonEnviar.disabled = false;
        }
    });
}

if (contenedorPublicaciones) {
    contenedorPublicaciones.addEventListener("click", async (evento) => {
        const boton = evento.target.closest("button[data-accion='eliminar']");
        if (!boton) return;
        const tarjeta = boton.closest(".publicacion");
        const id = tarjeta.dataset.id;
        const publicacion = [...publicacionesLocales, ...publicacionesAPI]
            .find((elemento) => String(elemento.id) === id);
        if (!publicacion || !window.confirm("¿Quieres eliminar esta publicacion?")) return;

        boton.disabled = true;
        try {
            await solicitarAPI(`${direccionAPI}/${publicacion.apiId || publicacion.id}`, { method: "DELETE" });
            if (publicacion.esLocal) {
                publicacionesLocales = publicacionesLocales.filter((elemento) => String(elemento.id) !== id);
                guardarLista(clavePublicacionesLocales, publicacionesLocales);
                mostrarMisPublicaciones();
            } else {
                idsEliminados.add(id);
                guardarLista(clavePublicacionesEliminadas, [...idsEliminados]);
            }
            mostrarPublicaciones();
            mostrarMensaje("Publicacion eliminada correctamente.", "exito");
        } catch (error) {
            boton.disabled = false;
            mostrarMensaje("No se pudo eliminar la publicacion. Intenta de nuevo.", "error");
        }
    });
}

if (listaPublicacionesEditables) {
    listaPublicacionesEditables.addEventListener("click", (evento) => {
        const boton = evento.target.closest("button[data-accion]");
        if (!boton) return;
        const formulario = boton.closest(".publicacion").querySelector(".formulario-edicion");
        if (boton.dataset.accion === "editar") {
            formulario.hidden = !formulario.hidden;
        } else if (boton.dataset.accion === "cancelar-edicion") {
            formulario.hidden = true;
        }
    });

    listaPublicacionesEditables.addEventListener("submit", async (evento) => {
        if (!evento.target.matches(".formulario-edicion")) return;
        evento.preventDefault();
        const formulario = evento.target;
        const tarjeta = formulario.closest(".publicacion");
        const id = tarjeta.dataset.id;
        const publicacionOriginal = publicacionesAPI.find((publicacion) => String(publicacion.id) === id);
        if (!publicacionOriginal) return;
        const datosFormulario = new FormData(formulario);
        const cambios = {
            title: datosFormulario.get("title").trim(),
            body: datosFormulario.get("body").trim(),
            userId: publicacionOriginal.userId
        };

        if (!cambios.title || !cambios.body) {
            mostrarMensaje("El titulo y el contenido no pueden quedar vacios.", "error");
            return;
        }

                const botonGuardar = formulario.querySelector("button[type='submit']");
                botonGuardar.disabled = true;
                try {
                    await solicitarAPI(`${direccionAPI}/${publicacionOriginal.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json; charset=UTF-8" },
                        body: JSON.stringify(cambios)
                    });
                    publicacionesAPI = publicacionesAPI.map((publicacion) =>
                String(publicacion.id) === id ? { ...publicacion, ...cambios } : publicacion
            );
                    actualizacionesLocales = { ...actualizacionesLocales, [id]: cambios };
                    guardarLista(claveActualizacionesLocales, actualizacionesLocales);
                    mostrarPublicacionesEditables();
            mostrarPublicaciones();
            mostrarMensaje("Publicacion actualizada correctamente.", "exito");
        } catch (error) {
            botonGuardar.disabled = false;
            mostrarMensaje("No se pudo actualizar la publicacion. Intenta de nuevo.", "error");
        }
    });
}

mostrarMisPublicaciones();
cargarPublicaciones();