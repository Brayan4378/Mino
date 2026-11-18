const seccionPublicacionesPerfil = document.getElementById("seccionPublicacionesPerfil");
const estadoPublicacionesPerfil = document.getElementById("estadoPublicacionesPerfil");
const listaPublicacionesPerfil = document.getElementById("listaPublicacionesPerfil");

function mostrarEstadoPublicacionesPerfil(mensaje, tipo = "") {
    estadoPublicacionesPerfil.textContent = mensaje;
    estadoPublicacionesPerfil.dataset.tipo = tipo;
}

function crearPublicacionPerfil(publicacion) {
    const tarjeta = document.createElement("article");
    tarjeta.className = "publicacion-perfil";

    if (publicacion.imagenUrl) {
        const imagen = document.createElement("img");
        imagen.src = window.MinoApi.urlArchivo(publicacion.imagenUrl);
        imagen.alt = publicacion.title;
        imagen.loading = "lazy";
        tarjeta.appendChild(imagen);
    }

    const contenido = document.createElement("div");
    contenido.className = "contenido-publicacion-perfil";
    const titulo = document.createElement("h3");
    titulo.textContent = publicacion.title;
    const texto = document.createElement("p");
    texto.textContent = publicacion.body;
    contenido.append(titulo, texto);

    const interacciones = document.createElement("span");
    interacciones.className = "interacciones-publicacion-perfil";
    interacciones.textContent = `♥ ${publicacion.likes}  ·  Comentarios ${publicacion.comentarios}`;
    tarjeta.append(contenido, interacciones);
    return tarjeta;
}

window.cargarPublicacionesPerfil = async (usuarioId) => {
    seccionPublicacionesPerfil.hidden = false;
    listaPublicacionesPerfil.replaceChildren();
    mostrarEstadoPublicacionesPerfil("Cargando publicaciones...");

    try {
        const publicaciones = await window.MinoApi.solicitar(
            `/usuarios/${encodeURIComponent(usuarioId)}/publicaciones`
        );
        if (!Array.isArray(publicaciones)) {
            throw new Error("La respuesta no contiene una lista de publicaciones.");
        }

        listaPublicacionesPerfil.replaceChildren(
            ...publicaciones.map(crearPublicacionPerfil)
        );
        mostrarEstadoPublicacionesPerfil(
            publicaciones.length ? "" : "Aún no tiene publicaciones."
        );
    } catch (error) {
        mostrarEstadoPublicacionesPerfil(
            error.message || "No se pudieron cargar las publicaciones.",
            "error"
        );
    }
};
