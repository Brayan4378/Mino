(function () {
    const API_BASE_URL = "http://localhost:3000/api";
    const TOKEN_KEY = "minoToken";
    const USER_KEY = "minoUsuario";

    async function solicitar(ruta, opciones = {}) {
        const headers = new Headers(opciones.headers || {});
        const token = localStorage.getItem(TOKEN_KEY);

        if (
            opciones.body &&
            !(opciones.body instanceof FormData) &&
            !headers.has("Content-Type")
        ) {
            headers.set("Content-Type", "application/json");
        }

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        let respuesta;
        try {
            respuesta = await fetch(`${API_BASE_URL}${ruta}`, {
                ...opciones,
                headers
            });
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error("No se pudo conectar con la API. Iníciala con npm start dentro de api.");
            }
            throw error;
        }

        let datos;
        try {
            datos = JSON.parse(await respuesta.text());
        } catch {
            throw new Error(
                `La API respondió en un formato inesperado (HTTP ${respuesta.status}). Verifica que esté ejecutándose en localhost:3000.`
            );
        }

        if (!respuesta.ok) {
            if (respuesta.status === 401) {
                cerrarSesion();
            }
            throw new Error(datos.mensaje || "No se pudo completar la solicitud.");
        }

        return datos;
    }

    function guardarSesion(datos) {
        localStorage.setItem(TOKEN_KEY, datos.token);
        localStorage.setItem(USER_KEY, JSON.stringify(datos.usuario));
    }

    function obtenerUsuario() {
        const usuario = localStorage.getItem(USER_KEY);
        return usuario ? JSON.parse(usuario) : null;
    }

    function cerrarSesion() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    window.MinoApi = {
        solicitar,
        urlArchivo: (ruta) => new URL(ruta, `${API_BASE_URL}/`).href,
        guardarSesion,
        obtenerUsuario,
        cerrarSesion,
        tieneSesion: () => Boolean(localStorage.getItem(TOKEN_KEY))
    };
})();
