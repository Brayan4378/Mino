const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const multer = require("multer");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./database");
const app = express();
const SECRET = process.env.JWT_SECRET;
const DIRECTORIO_FOTOS = path.join(__dirname, "uploads");
const MAXIMO_FOTO_BYTES = 3 * 1024 * 1024;
const MAXIMO_HISTORIA_BYTES = 10 * 1024 * 1024;
const recibirFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_FOTO_BYTES, files: 1 }
}).single("foto");
const recibirArchivoHistoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_HISTORIA_BYTES, files: 1 }
}).single("archivo");

fs.mkdirSync(DIRECTORIO_FOTOS, { recursive: true });

if (!SECRET) {
  throw new Error("Falta configurar JWT_SECRET en api/.env.");
}

if (SECRET.length < 32) {
  console.warn("JWT_SECRET debería tener al menos 32 caracteres.");
}

app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use("/uploads", express.static(DIRECTORIO_FOTOS, {
  dotfiles: "deny",
  index: false,
  maxAge: "1d",
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  }
}));

function obtenerFormatoFoto(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return { extension: "png", mime: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", mime: "image/webp" };
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  ) {
    return { extension: "jpg", mime: "image/jpeg" };
  }

  return null;
}

function eliminarFotoGuardada(nombreArchivo) {
  if (
    typeof nombreArchivo !== "string" ||
    !/^[0-9a-f-]{36}\.(png|webp|jpg)$/.test(nombreArchivo)
  ) {
    return;
  }

  const archivo = path.join(DIRECTORIO_FOTOS, nombreArchivo);
  if (fs.existsSync(archivo)) {
    fs.unlinkSync(archivo);
  }
}

function urlFotoPerfil(nombreArchivo) {
  return nombreArchivo ? `/uploads/${encodeURIComponent(nombreArchivo)}` : null;
}

function responderErrorCarga(error, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);

  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      mensaje: "El archivo supera el tamaño máximo permitido"
    });
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      mensaje: "Seleccione un solo archivo válido"
    });
  }

  return res.status(500).json({
    mensaje: "No se pudo procesar el archivo"
  });
}

function guardarImagen(buffer, formato) {
  const nombreArchivo = `${randomUUID()}.${formato.extension}`;
  fs.writeFileSync(path.join(DIRECTORIO_FOTOS, nombreArchivo), buffer);
  return nombreArchivo;
}

function obtenerCuerpo(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body
    : {};
}

// REGISTRO
app.post("/api/usuarios", (req, res, next) => {
  const { nombre, correo, password, genero } = obtenerCuerpo(req);

  if (
    typeof nombre !== "string" ||
    !nombre.trim() ||
    nombre.trim().length > 80 ||
    typeof correo !== "string" ||
    !correo.trim() ||
    correo.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) ||
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    (genero !== undefined &&
      !["", "Masculino", "Femenino", "Otro"].includes(genero))
  ) {
    return res.status(400).json({
      mensaje: "Revise el nombre, correo, contraseña y los demás datos ingresados"
    });
  }

  const nombreNormalizado = nombre.trim();
  const correoNormalizado = correo.trim().toLowerCase();
  const generoNormalizado = typeof genero === "string" ? genero : "";

  try {
    const hash = bcrypt.hashSync(password, 10);
    const resultado = db.prepare(`
      INSERT INTO usuarios (nombre, correo, password, genero)
      VALUES (?, ?, ?, ?)
    `).run(
      nombreNormalizado,
      correoNormalizado,
      hash,
      generoNormalizado
    );

    return res.status(201).json({
      mensaje: "Usuario registrado",
      id: Number(resultado.lastInsertRowid)
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        mensaje: "Ya existe una cuenta con ese correo."
      });
    }

    return next(error);
  }
});

// LOGIN
app.post("/api/login", (req, res) => {
  const { correo, password } = obtenerCuerpo(req);

  if (
    typeof correo !== "string" ||
    !correo.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    return res.status(400).json({
      mensaje: "Ingrese correo y contraseña"
    });
  }

  const usuario = db.prepare(`
    SELECT id, nombre, correo, password
    FROM usuarios
    WHERE correo = ?
  `).get(correo.trim().toLowerCase());

  if (!usuario || !bcrypt.compareSync(password, usuario.password)) {
    return res.status(401).json({
      mensaje: "Correo o contraseña incorrectos"
    });
  }

  const token = jwt.sign(
    { id: usuario.id },
    SECRET,
    { expiresIn: "2h" }
  );

  return res.json({
    mensaje: "Inicio de sesión exitoso",
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo
    }
  });
});

// MIDDLEWARE PARA VALIDAR TOKEN
function verificarToken(req, res, next) {
  const autorizacion = req.headers.authorization;
  const coincidencia = typeof autorizacion === "string"
    ? autorizacion.match(/^Bearer\s+(\S+)$/i)
    : null;

  if (!coincidencia) {
    return res.status(401).json({
      mensaje: "Debe iniciar sesión"
    });
  }

  try {
    const payload = jwt.verify(coincidencia[1], SECRET);
    if (!payload || typeof payload !== "object" || !Number.isInteger(payload.id)) {
      return res.status(401).json({
        mensaje: "Token inválido o vencido"
      });
    }

    req.usuario = payload;
    return next();
  } catch {
    return res.status(401).json({
      mensaje: "Token inválido o vencido"
    });
  }
}

// Consultar el perfil privado del usuario autenticado
app.get("/api/usuarios/me", verificarToken, (req, res) => {
  const usuario = db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.correo,
      u.genero,
      u.bio,
      u.foto_perfil AS fotoPerfil,
      (SELECT COUNT(*) FROM publicaciones p WHERE p.usuario_id = u.id) AS publicaciones,
      (SELECT COUNT(*) FROM seguidores s WHERE s.seguido_id = u.id) AS seguidores,
      (SELECT COUNT(*) FROM seguidores s WHERE s.seguidor_id = u.id) AS seguidos
    FROM usuarios u
    WHERE u.id = ?
  `).get(req.usuario.id);

  if (!usuario) {
    return res.status(404).json({
      mensaje: "Usuario no encontrado"
    });
  }

  usuario.fotoPerfil = urlFotoPerfil(usuario.fotoPerfil);
  return res.json(usuario);
});

// Buscar perfiles públicos sin exponer correos ni contraseñas
app.get("/api/usuarios/buscar", (req, res) => {
  const consulta = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (consulta.length > 80) {
    return res.status(400).json({
      mensaje: "La búsqueda no puede superar 80 caracteres"
    });
  }

  if (!consulta) {
    return res.json([]);
  }

  const usuarios = db.prepare(`
    SELECT id, nombre
    FROM usuarios
    WHERE nombre LIKE ? COLLATE NOCASE
    ORDER BY nombre COLLATE NOCASE
    LIMIT 30
  `).all(`%${consulta}%`);

  return res.json(usuarios);
});

// Consultar un perfil público
app.get("/api/usuarios/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      mensaje: "Identificador de usuario inválido"
    });
  }

  const usuario = db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.bio,
      u.foto_perfil AS fotoPerfil,
      (SELECT COUNT(*) FROM publicaciones p WHERE p.usuario_id = u.id) AS publicaciones,
      (SELECT COUNT(*) FROM seguidores s WHERE s.seguido_id = u.id) AS seguidores,
      (SELECT COUNT(*) FROM seguidores s WHERE s.seguidor_id = u.id) AS seguidos
    FROM usuarios u
    WHERE u.id = ?
  `).get(id);

  if (!usuario) {
    return res.status(404).json({
      mensaje: "Usuario no encontrado"
    });
  }

  usuario.fotoPerfil = urlFotoPerfil(usuario.fotoPerfil);
  return res.json(usuario);
});

// CONSULTAR
app.get("/api/usuarios", verificarToken, (req, res) => {
  const usuarios = db.prepare(`
    SELECT id, nombre
    FROM usuarios
  `).all();

  return res.json(usuarios);
});

// ACTUALIZAR el perfil propio
app.put("/api/usuarios/:id", verificarToken, (req, res) => {
  const id = Number(req.params.id);
  const { nombre, correo, genero, bio } = obtenerCuerpo(req);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      mensaje: "Identificador de usuario inválido"
    });
  }

  if (id !== req.usuario.id) {
    return res.status(403).json({
      mensaje: "Solo puede actualizar su propio perfil"
    });
  }

  if (
    typeof nombre !== "string" ||
    !nombre.trim() ||
    nombre.trim().length > 80
  ) {
    return res.status(400).json({
      mensaje: "El nombre es obligatorio y no debe superar 80 caracteres"
    });
  }

  if (
    correo !== undefined &&
    (typeof correo !== "string" ||
      !correo.trim() ||
      correo.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()))
  ) {
    return res.status(400).json({
      mensaje: "Ingrese un correo válido"
    });
  }

  if (
    (bio !== undefined && typeof bio !== "string") ||
    (genero !== undefined &&
      !["", "Masculino", "Femenino", "Otro"].includes(genero))
  ) {
    return res.status(400).json({
      mensaje: "Revise los datos del perfil"
    });
  }

  if (bio !== undefined && bio.trim().length > 250) {
    return res.status(400).json({
      mensaje: "La biografía no puede superar 250 caracteres"
    });
  }

  const usuarioActual = db.prepare(`
    SELECT id, nombre, correo, genero, bio
    FROM usuarios
    WHERE id = ?
  `).get(id);

  if (!usuarioActual) {
    return res.status(404).json({
      mensaje: "Usuario no encontrado"
    });
  }

  const correoNormalizado = correo === undefined
    ? usuarioActual.correo
    : correo.trim().toLowerCase();

  try {
    db.prepare(`
      UPDATE usuarios
      SET nombre = ?, correo = ?, genero = ?, bio = ?
      WHERE id = ?
    `).run(
      nombre.trim(),
      correoNormalizado,
      genero === undefined ? usuarioActual.genero : genero,
      bio === undefined ? usuarioActual.bio : bio.trim(),
      id
    );
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        mensaje: "Ya existe una cuenta con ese correo."
      });
    }

    throw error;
  }

  return res.json({ mensaje: "Perfil actualizado" });
});

app.post("/api/usuarios/me/foto", verificarToken, (req, res, next) => {
  recibirFoto(req, res, (error) => {
    if (error) return responderErrorCarga(error, res, next);
    if (!req.file) {
      return res.status(400).json({ mensaje: "Seleccione una foto de perfil" });
    }

    const formato = obtenerFormatoFoto(req.file.buffer);
    if (!formato) {
      return res.status(400).json({
        mensaje: "La foto debe ser una imagen PNG, JPG o WEBP válida"
      });
    }

    const usuario = db.prepare(
      "SELECT foto_perfil FROM usuarios WHERE id = ?"
    ).get(req.usuario.id);
    if (!usuario) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    let nombreArchivo;
    try {
      nombreArchivo = guardarImagen(req.file.buffer, formato);
      db.prepare("UPDATE usuarios SET foto_perfil = ? WHERE id = ?")
        .run(nombreArchivo, req.usuario.id);
    } catch (errorGuardar) {
      if (nombreArchivo) eliminarFotoGuardada(nombreArchivo);
      return next(errorGuardar);
    }

    eliminarFotoGuardada(usuario.foto_perfil);
    return res.json({
      mensaje: "Foto de perfil actualizada",
      fotoPerfil: urlFotoPerfil(nombreArchivo)
    });
  });
});

app.get("/api/historias", (req, res) => {
  const historias = db.prepare(`
    SELECT
      h.id,
      h.contenido,
      h.fecha_creacion AS fechaCreacion,
      u.id AS usuarioId,
      u.nombre,
      u.foto_perfil AS fotoPerfil,
      m.url
    FROM historias h
    JOIN usuarios u ON u.id = h.usuario_id
    JOIN multimedia m ON m.historia_id = h.id
    WHERE h.fecha_expiracion > datetime('now')
    ORDER BY h.fecha_creacion
  `).all();

  const historiasPorUsuario = new Map();
  for (const historia of historias) {
    const clave = String(historia.usuarioId);
    if (!historiasPorUsuario.has(clave)) {
      historiasPorUsuario.set(clave, {
        id: clave,
        photo: urlFotoPerfil(historia.fotoPerfil) || "/Imagenes/usuario.png",
        name: historia.nombre,
        lastUpdated: Math.floor(new Date(`${historia.fechaCreacion.replace(" ", "T")}Z`).getTime() / 1000),
        items: []
      });
    }

    const timestamp = Math.floor(
      new Date(`${historia.fechaCreacion.replace(" ", "T")}Z`).getTime() / 1000
    );
    historiasPorUsuario.get(clave).items.push({
      id: String(historia.id),
      type: "photo",
      length: 5,
      src: historia.url,
      preview: historia.url,
      time: timestamp,
      ...(historia.contenido ? { text: historia.contenido } : {})
    });
  }

  return res.json([...historiasPorUsuario.values()]);
});

app.post("/api/historias", verificarToken, (req, res, next) => {
  recibirArchivoHistoria(req, res, (error) => {
    if (error) return responderErrorCarga(error, res, next);

    const { contenido } = obtenerCuerpo(req);
    if (
      typeof contenido !== "string" ||
      contenido.trim().length > 250
    ) {
      return res.status(400).json({
        mensaje: "El texto de la historia no debe superar 250 caracteres"
      });
    }

    if (!req.file) {
      return res.status(400).json({ mensaje: "Seleccione una imagen para la historia" });
    }

    const formato = obtenerFormatoFoto(req.file.buffer);
    if (!formato) {
      return res.status(400).json({
        mensaje: "La historia debe ser una imagen PNG, JPG o WEBP válida"
      });
    }

    let nombreArchivo;
    try {
      nombreArchivo = guardarImagen(req.file.buffer, formato);
      const resultado = db.transaction(() => {
        const historia = db.prepare(`
          INSERT INTO historias (usuario_id, contenido)
          VALUES (?, ?)
        `).run(req.usuario.id, contenido.trim() || null);
        const url = urlFotoPerfil(nombreArchivo);
        db.prepare(`
          INSERT INTO multimedia (historia_id, tipo, url)
          VALUES (?, 'imagen', ?)
        `).run(Number(historia.lastInsertRowid), url);
        return { id: Number(historia.lastInsertRowid), url };
      })();

      return res.status(201).json({
        mensaje: "Historia publicada. Estará disponible durante 24 horas.",
        historia: resultado
      });
    } catch (errorGuardar) {
      if (nombreArchivo) eliminarFotoGuardada(nombreArchivo);
      return next(errorGuardar);
    }
  });
});

// Cambiar la contraseña propia verificando la contraseña actual
app.put("/api/usuarios/me/password", verificarToken, (req, res) => {
  const { contrasenaActual, contrasenaNueva } = obtenerCuerpo(req);

  if (
    typeof contrasenaActual !== "string" ||
    !contrasenaActual ||
    typeof contrasenaNueva !== "string" ||
    contrasenaNueva.length < 8 ||
    Buffer.byteLength(contrasenaNueva, "utf8") > 72
  ) {
    return res.status(400).json({
      mensaje: "La contraseña nueva debe tener entre 8 y 72 bytes"
    });
  }

  const usuario = db.prepare(`
    SELECT password
    FROM usuarios
    WHERE id = ?
  `).get(req.usuario.id);

  if (!usuario) {
    return res.status(404).json({
      mensaje: "Usuario no encontrado"
    });
  }

  if (!bcrypt.compareSync(contrasenaActual, usuario.password)) {
    return res.status(400).json({
      mensaje: "La contraseña actual es incorrecta"
    });
  }

  const hash = bcrypt.hashSync(contrasenaNueva, 10);
  db.prepare("UPDATE usuarios SET password = ? WHERE id = ?")
    .run(hash, req.usuario.id);

  return res.json({ mensaje: "Contraseña actualizada" });
});

function buscarConversacion(id) {
  return db.prepare(`
    SELECT id, usuario_1_id, usuario_2_id
    FROM conversaciones
    WHERE id = ?
  `).get(id);
}

function validarAccesoConversacion(id, usuarioId, res) {
  const conversacion = buscarConversacion(id);
  if (!conversacion) {
    res.status(404).json({ mensaje: "Conversación no encontrada" });
    return null;
  }

  if (conversacion.usuario_1_id !== usuarioId &&
      conversacion.usuario_2_id !== usuarioId) {
    res.status(403).json({ mensaje: "No tiene acceso a esta conversación" });
    return null;
  }

  return conversacion;
}

// Listar las conversaciones del usuario autenticado
app.get("/api/conversaciones", verificarToken, (req, res) => {
  const conversaciones = db.prepare(`
    SELECT
      c.id,
      otro.id AS usuarioId,
      otro.nombre AS nombre,
      ultimo.contenido AS ultimoMensaje,
      ultimo.remitente_id AS ultimoRemitenteId,
      ultimo.fecha_envio AS fechaUltimoMensaje,
      (
        SELECT COUNT(*)
        FROM mensajes sin_leer
        WHERE sin_leer.conversacion_id = c.id
          AND sin_leer.remitente_id != ?
          AND sin_leer.leido = 0
      ) AS noLeidos
    FROM conversaciones c
    JOIN usuarios otro
      ON otro.id = CASE
        WHEN c.usuario_1_id = ? THEN c.usuario_2_id
        ELSE c.usuario_1_id
      END
    LEFT JOIN mensajes ultimo
      ON ultimo.id = (
        SELECT MAX(m.id)
        FROM mensajes m
        WHERE m.conversacion_id = c.id
      )
    WHERE c.usuario_1_id = ? OR c.usuario_2_id = ?
    ORDER BY COALESCE(ultimo.fecha_envio, c.fecha_creacion) DESC, c.id DESC
  `).all(req.usuario.id, req.usuario.id, req.usuario.id, req.usuario.id);

  return res.json(conversaciones);
});

// Crear o recuperar una conversación privada de dos personas
app.post("/api/conversaciones", verificarToken, (req, res) => {
  const { usuarioId } = obtenerCuerpo(req);
  if (!Number.isSafeInteger(usuarioId) || usuarioId < 1 ||
      usuarioId === req.usuario.id) {
    return res.status(400).json({
      mensaje: "Seleccione otro usuario para iniciar la conversación"
    });
  }

  const existeUsuario = db.prepare(
    "SELECT id FROM usuarios WHERE id = ?"
  ).get(usuarioId);
  if (!existeUsuario) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }

  const usuario1Id = Math.min(req.usuario.id, usuarioId);
  const usuario2Id = Math.max(req.usuario.id, usuarioId);
  db.prepare(`
    INSERT INTO conversaciones (usuario_1_id, usuario_2_id)
    VALUES (?, ?)
    ON CONFLICT (usuario_1_id, usuario_2_id) DO NOTHING
  `).run(usuario1Id, usuario2Id);

  const conversacion = db.prepare(`
    SELECT id
    FROM conversaciones
    WHERE usuario_1_id = ? AND usuario_2_id = ?
  `).get(usuario1Id, usuario2Id);

  return res.status(200).json({ id: conversacion.id });
});

// Consultar el historial de una conversación propia
app.get("/api/conversaciones/:id/mensajes", verificarToken, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      mensaje: "Identificador de conversación inválido"
    });
  }

  const conversacion = validarAccesoConversacion(id, req.usuario.id, res);
  if (!conversacion) return;

  const beforeId = req.query.beforeId === undefined
    ? null
    : Number(req.query.beforeId);
  const afterId = req.query.afterId === undefined
    ? null
    : Number(req.query.afterId);

  if (
    (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1)) ||
    (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) ||
    (beforeId !== null && afterId !== null)
  ) {
    return res.status(400).json({
      mensaje: "El cursor del historial no es válido"
    });
  }

  let filas;
  let masAntiguos = false;
  if (afterId !== null) {
    filas = db.prepare(`
      SELECT
        m.id,
        m.remitente_id AS remitenteId,
        u.nombre AS nombreRemitente,
        m.contenido,
        m.fecha_envio AS fechaEnvio,
        m.leido
      FROM mensajes m
      JOIN usuarios u ON u.id = m.remitente_id
      WHERE m.conversacion_id = ? AND m.id > ?
      ORDER BY m.id ASC
      LIMIT 100
    `).all(id, afterId);
  } else if (beforeId !== null) {
    filas = db.prepare(`
      SELECT
        m.id,
        m.remitente_id AS remitenteId,
        u.nombre AS nombreRemitente,
        m.contenido,
        m.fecha_envio AS fechaEnvio,
        m.leido
      FROM mensajes m
      JOIN usuarios u ON u.id = m.remitente_id
      WHERE m.conversacion_id = ? AND m.id < ?
      ORDER BY m.id DESC
      LIMIT 51
    `).all(id, beforeId);
    masAntiguos = filas.length > 50;
    filas = filas.slice(0, 50).reverse();
  } else {
    filas = db.prepare(`
      SELECT
        m.id,
        m.remitente_id AS remitenteId,
        u.nombre AS nombreRemitente,
        m.contenido,
        m.fecha_envio AS fechaEnvio,
        m.leido
      FROM mensajes m
      JOIN usuarios u ON u.id = m.remitente_id
      WHERE m.conversacion_id = ?
      ORDER BY m.id DESC
      LIMIT 51
    `).all(id);
    masAntiguos = filas.length > 50;
    filas = filas.slice(0, 50).reverse();
  }

  db.prepare(`
    UPDATE mensajes
    SET leido = 1
    WHERE conversacion_id = ? AND remitente_id != ? AND leido = 0
  `).run(id, req.usuario.id);

  return res.json({ mensajes: filas, masAntiguos });
});

// Enviar un mensaje de texto a un participante de la conversación
app.post("/api/conversaciones/:id/mensajes", verificarToken, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      mensaje: "Identificador de conversación inválido"
    });
  }

  const conversacion = validarAccesoConversacion(id, req.usuario.id, res);
  if (!conversacion) return;

  const { contenido } = obtenerCuerpo(req);
  if (
    typeof contenido !== "string" ||
    !contenido.trim() ||
    contenido.trim().length > 2000
  ) {
    return res.status(400).json({
      mensaje: "Escriba un mensaje de hasta 2000 caracteres"
    });
  }

  const resultado = db.prepare(`
    INSERT INTO mensajes (conversacion_id, remitente_id, contenido)
    VALUES (?, ?, ?)
  `).run(id, req.usuario.id, contenido.trim());

  const mensaje = db.prepare(`
    SELECT
      m.id,
      m.remitente_id AS remitenteId,
      u.nombre AS nombreRemitente,
      m.contenido,
      m.fecha_envio AS fechaEnvio,
      m.leido
    FROM mensajes m
    JOIN usuarios u ON u.id = m.remitente_id
    WHERE m.id = ?
  `).get(Number(resultado.lastInsertRowid));

  return res.status(201).json({ mensaje });
});

// ELIMINAR la cuenta propia
app.delete("/api/usuarios/:id", verificarToken, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      mensaje: "Identificador de usuario inválido"
    });
  }

  if (id !== req.usuario.id) {
    return res.status(403).json({
      mensaje: "Solo puede eliminar su propia cuenta"
    });
  }

  const resultado = db.prepare(
    "DELETE FROM usuarios WHERE id = ?"
  ).run(id);

  if (resultado.changes === 0) {
    return res.status(404).json({
      mensaje: "Usuario no encontrado"
    });
  }

  return res.json({ mensaje: "Usuario eliminado" });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      mensaje: "El cuerpo de la solicitud debe contener JSON válido"
    });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({
      mensaje: "El cuerpo de la solicitud es demasiado grande"
    });
  }

  console.error("Error en la API:", error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({
    mensaje: "Error interno del servidor"
  });
});

if (require.main === module) {
  const puerto = Number(process.env.PORT) || 3000;
  app.listen(puerto, () => {
    console.log(`API funcionando en http://localhost:${puerto}`);
  });
}

module.exports = app;