document.querySelector(".login form").addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const estado = document.getElementById("estadoLogin");
    const correo = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    estado.textContent = "Iniciando sesión...";
    estado.dataset.tipo = "";

    try {
        const datos = await window.MinoApi.solicitar("/login", {
            method: "POST",
            body: JSON.stringify({ correo, password })
        });

        window.MinoApi.guardarSesion(datos);
        window.location.href = "Menu.html";
    } catch (error) {
        estado.textContent = error.message;
        estado.dataset.tipo = "error";
    }
});