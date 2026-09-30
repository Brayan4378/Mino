function validarRegistro() {
    let nombre = document.getElementById("username").value;
    let correo = document.getElementById("email").value;
    let contrasena = document.getElementById("password").value;
    let terminos = document.getElementById("terminos").checked;

    if (nombre === "" || correo === "" || contrasena === "") {
        alert("Por favor llena todos los campos");
        return;
    }

    if (terminos === false) {
        alert("Debes aceptar los términos y condiciones");
        return;
    }

    alert("Usuario registrado");
    window.location.href = "Menu.html";
}