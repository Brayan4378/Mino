const elementoHistorias = document.getElementById("stories");
const formularioHistoria = document.getElementById("formularioHistoria");
const estadoHistorias = document.getElementById("estadoHistorias");
const archivosHistorias = new Set();
const esPerfil = Boolean(document.querySelector(".perfil-pagina"));

window.addEventListener("pagehide", () => {
    for (const url of archivosHistorias) {
        URL.revokeObjectURL(url);
    }
    archivosHistorias.clear();
});

function mostrarEstadoHistoria(mensaje, tipo = "") {
    if (!estadoHistorias) return;
    estadoHistorias.textContent = mensaje;
    if (tipo) {
        estadoHistorias.dataset.tipo = tipo;
    } else {
        delete estadoHistorias.dataset.tipo;
    }
}

async function procesarLikeHistoria(evento) {
    const boton = evento.target.closest("button[data-like-historia]");
    if (!boton) return;
    evento.preventDefault();
    evento.stopPropagation();

    if (!window.MinoApi.tieneSesion()) {
        window.location.href = "Login.html";
        return;
    }

    const estabaMarcada = boton.dataset.liked === "true";
    boton.disabled = true;
    try {
        const resultado = await window.MinoApi.solicitar(
            `/historias/${encodeURIComponent(boton.dataset.likeHistoria)}/like`,
            { method: estabaMarcada ? "DELETE" : "POST" }
        );
        boton.dataset.liked = String(resultado.liked);
        boton.setAttribute("aria-pressed", String(resultado.liked));
        boton.classList.toggle("activo", resultado.liked);
        boton.querySelector(".cantidad-likes-historia").textContent = String(resultado.likes);
        boton.firstChild.textContent = resultado.liked ? "♥ Te gusta " : "♡ Me gusta ";
    } catch (error) {
        mostrarEstadoHistoria(error.message, "error");
    } finally {
        boton.disabled = false;
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

            if (historias.length === 0 && !esPerfil) {
                const espacioVacio = document.createElement("p");
                espacioVacio.className = "historia-vacia";
                espacioVacio.textContent = window.MinoApi.tieneSesion()
                    ? "Aún no hay historias de las personas que sigues."
                    : "Inicia sesión para ver las historias de las personas que sigues.";
                if (!window.MinoApi.tieneSesion()) {
                    const enlaceLogin = document.createElement("a");
                    enlaceLogin.href = "Login.html";
                    enlaceLogin.textContent = "Iniciar sesión";
                    espacioVacio.append(" ", enlaceLogin);
                }
                elementoHistorias.appendChild(espacioVacio);
            } else if (historias.length === 0) {
                mostrarEstadoHistoria("Este perfil no tiene historias activas.");
            }
        }

        async function cargarHistorias() {
            if (!esPerfil) return window.MinoApi.solicitar("/historias");

            const idPerfil = new URLSearchParams(window.location.search).get("id");
            if (idPerfil) {
                if (!/^[1-9]\d*$/.test(idPerfil)) {
                    throw new Error("El perfil solicitado no es válido.");
                }
                return window.MinoApi.solicitar(
                    `/historias?usuarioId=${encodeURIComponent(idPerfil)}`
                );
            }

            const usuario = await window.MinoApi.solicitar("/usuarios/me");
            if (!Number.isSafeInteger(Number(usuario.id)) || Number(usuario.id) < 1) {
                throw new Error("No se pudo identificar al dueño de este perfil.");
            }
            return window.MinoApi.solicitar(
                `/historias?usuarioId=${encodeURIComponent(usuario.id)}`
            );
        }

        cargarHistorias()
            .then(async (historias) => {
                const historiasConUrlCompleta = await Promise.all(
                    historias.map(async (historia) => ({
                        ...historia,
                        photo: window.MinoApi.urlArchivo(historia.photo),
                        items: await Promise.all(historia.items.map(async (item) => {
                            const src = await window.MinoApi.obtenerArchivo(item.src);
                            archivosHistorias.add(src);
                            return { ...item, src, preview: src };
                        }))
                    }))
                );

                mostrarHistorias(historiasConUrlCompleta);
            })
            .catch((error) => {
                console.error("No se pudieron cargar las historias:", error);
                mostrarEstadoHistoria(error.message, "error");
                if (!estadoHistorias) {
                    const aviso = document.createElement("p");
                    aviso.className = "historia-vacia";
                    aviso.textContent = error.message || "No se pudieron cargar las historias.";
                    elementoHistorias.replaceChildren(aviso);
                } else {
                    elementoHistorias.replaceChildren();
                }
            });
    }
}

document.addEventListener("click", procesarLikeHistoria, true);
