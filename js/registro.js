document.getElementById("formularioRegistro").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const estado = document.getElementById("estadoRegistro");
    const nombre = document.getElementById("username").value.trim();
    const correo = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const genero = document.getElementById("genero").value;

    estado.textContent = "Creando cuenta...";
    estado.dataset.tipo = "";

    try {
        await window.MinoApi.solicitar("/usuarios", {
            method: "POST",
            body: JSON.stringify({ nombre, correo, password, genero })
        });

        const sesion = await window.MinoApi.solicitar("/login", {
            method: "POST",
            body: JSON.stringify({ correo, password })
        });

        window.MinoApi.guardarSesion(sesion);
        window.location.href = "Menu.html";
    } catch (error) {
        estado.textContent = error.message;
        estado.dataset.tipo = "error";
    }
});