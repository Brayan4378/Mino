const formularioBusqueda = document.getElementById("formularioBusqueda");
const consultaUsuarios = document.getElementById("consultaUsuarios");
const estadoBusqueda = document.getElementById("estadoBusqueda");
const resultadosUsuarios = document.getElementById("resultadosUsuarios");

function mostrarEstadoBusqueda(mensaje, tipo = "") {
    estadoBusqueda.textContent = mensaje;
    estadoBusqueda.dataset.tipo = tipo;
}

formularioBusqueda.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const consulta = consultaUsuarios.value.trim();
    resultadosUsuarios.replaceChildren();

    if (!consulta) {
        mostrarEstadoBusqueda("Escribe un nombre para buscar personas.");
        return;
    }

    mostrarEstadoBusqueda("Buscando...");

    try {
        const usuarios = await window.MinoApi.solicitar(
            `/usuarios/buscar?q=${encodeURIComponent(consulta)}`
        );

        if (usuarios.length === 0) {
            mostrarEstadoBusqueda("No se encontraron usuarios.");
            return;
        }

        usuarios.forEach((usuario) => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "resultado-usuario";

            const inicial = document.createElement("span");
            inicial.className = "resultado-usuario-inicial";
            inicial.setAttribute("aria-hidden", "true");
            inicial.textContent = usuario.nombre.charAt(0).toUpperCase();

            const detalles = document.createElement("div");
            detalles.className = "resultado-usuario-detalles";

            const nombre = document.createElement("strong");
            nombre.textContent = usuario.nombre;

            const enlace = document.createElement("a");
            enlace.href = `Perfil.html?id=${encodeURIComponent(usuario.id)}`;
            enlace.textContent = "Ver perfil";
            enlace.setAttribute("aria-label", `Ver el perfil de ${usuario.nombre}`);

            const enlaceMensaje = document.createElement("a");
            enlaceMensaje.href = `Mensajes.html?usuarioId=${encodeURIComponent(usuario.id)}`;
            enlaceMensaje.textContent = "Mensaje";
            enlaceMensaje.setAttribute("aria-label", `Enviar un mensaje a ${usuario.nombre}`);

            detalles.append(nombre);
            const acciones = document.createElement("div");
            acciones.className = "resultado-usuario-acciones";
            acciones.append(enlace, enlaceMensaje);
            tarjeta.append(inicial, detalles, acciones);
            resultadosUsuarios.append(tarjeta);
        });

        mostrarEstadoBusqueda(`${usuarios.length} usuario(s) encontrado(s).`);
    } catch (error) {
        mostrarEstadoBusqueda(error.message, "error");
    }
});
