const elementoHistorias = document.getElementById("stories");
const formularioHistoria = document.getElementById("formularioHistoria");
const estadoHistorias = document.getElementById("estadoHistorias");

function mostrarEstadoHistoria(mensaje, tipo = "") {
    if (!estadoHistorias) return;
    estadoHistorias.textContent = mensaje;
    if (tipo) {
        estadoHistorias.dataset.tipo = tipo;
    } else {
        delete estadoHistorias.dataset.tipo;
    }
}

if (formularioHistoria) {
    formularioHistoria.addEventListener("submit", async (evento) => {
        evento.preventDefault();

        if (!window.MinoApi.tieneSesion()) {
            mostrarEstadoHistoria("Inicia sesión para publicar una historia.", "error");
            return;
        }

        const boton = formularioHistoria.querySelector("button[type='submit']");
        boton.disabled = true;
        mostrarEstadoHistoria("Publicando historia...");

        try {
            const resultado = await window.MinoApi.solicitar("/historias", {
                method: "POST",
                body: new FormData(formularioHistoria)
            });
            formularioHistoria.reset();
            mostrarEstadoHistoria(resultado.mensaje, "exito");
        } catch (error) {
            mostrarEstadoHistoria(error.message, "error");
        } finally {
            boton.disabled = false;
        }
    });
}

if (elementoHistorias) {
    if (typeof window.Zuck !== "function") {
        console.error("No se pudo cargar Zuck.js. Verifica tu conexión a internet.");
    } else if (!window.MinoApi) {
        console.error("No se pudo cargar la API de Mino para mostrar historias.");
    } else {
        function mostrarHistorias(historias) {
            // zuck arma el visor con las historias disponibles
            window.Zuck(elementoHistorias, {
                skin: "snapgram",
                avatars: true,
                backButton: true,
                backNative: false,
                previousTap: true,
                autoFullScreen: false,
                localStorage: true,
                language: {
                    unmute: "Activar sonido",
                    keyboardTip: "Presiona la barra espaciadora para pausar",
                    visitLink: "Abrir enlace",
                    time: {
                        ago: "hace",
                        hour: "hora",
                        hours: "horas",
                        minute: "minuto",
                        minutes: "minutos",
                        fromnow: "desde ahora",
                        seconds: "segundos",
                        yesterday: "ayer",
                        tomorrow: "mañana",
                        days: "días"
                    }
                },
                stories: historias
            });

            if (historias.length === 0) {
                const espacioVacio = document.createElement("div");
                espacioVacio.className = "historia-vacia";
                espacioVacio.setAttribute("aria-label", "Historia de Mino");

                const logo = document.createElement("img");
                logo.src = "/Imagenes/logo_transparent.png";
                logo.alt = "";

                const nombre = document.createElement("span");
                nombre.textContent = "Mino";
                espacioVacio.append(logo, nombre);
                elementoHistorias.appendChild(espacioVacio);
            }
        }

        window.MinoApi.solicitar("/historias")
            .then((historias) => {
                const historiasConUrlCompleta = historias.map((historia) => ({
                    ...historia,
                    photo: window.MinoApi.urlArchivo(historia.photo),
                    items: historia.items.map((item) => ({
                        ...item,
                        src: window.MinoApi.urlArchivo(item.src),
                        preview: window.MinoApi.urlArchivo(item.preview)
                    }))
                }));

                mostrarHistorias(historiasConUrlCompleta);
            })
            .catch((error) => {
                console.error("No se pudieron cargar las historias:", error);
                mostrarHistorias([]);
            });
    }
}
