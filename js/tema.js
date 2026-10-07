document.addEventListener("DOMContentLoaded", function () {
    const modoOscuro = document.getElementById("modoOscuro");

    if (modoOscuro) {
        modoOscuro.addEventListener("change", function () {
            if (modoOscuro.checked) {
                document.documentElement.classList.remove("temaClaro");
            } else {
                document.documentElement.classList.add("temaClaro");
            }
        });
    }
});