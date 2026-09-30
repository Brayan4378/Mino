function validarLogin() {
    let nombre = document.getElementById("username").value;
    let contrasena = document.getElementById("password").value;

    if (nombre === "" || contrasena === "") {
        alert("Por favor llena todos los campos");
        return;
    }
alert("Bievenido a Mino, " + nombre + "!");
    window.location.href = "Menu.html";
}