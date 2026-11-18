const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { randomUUID } = require("crypto");
const multer = require("multer");
const { WebSocket, WebSocketServer } = require("ws");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./database");
const app = express();
const httpServer = http.createServer(app);
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const SECRET = process.env.JWT_SECRET;
const DIRECTORIO_FOTOS = path.join(__dirname, "uploads");
const MAXIMO_FOTO_BYTES = 3 * 1024 * 1024;
const MAXIMO_HISTORIA_BYTES = 10 * 1024 * 1024;
const MAXIMO_PUBLICACION_BYTES = 10 * 1024 * 1024;
const recibirFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_FOTO_BYTES, files: 1 }
}).single("foto");
const recibirImagenPublicacion = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAXIMO_PUBLICACION_BYTES, files: 1 }
}).single("imagen");
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
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/uploads", (req, res, next) => {
  const nombreArchivo = decodeURIComponent(path.basename(req.path));
  const url = urlFotoPerfil(nombreArchivo);
  const historia = db.prepare(`
    SELECT
      h.usuario_id,
      h.fecha_expiracion <= datetime('now') AS expirada
    FROM historias h
    JOIN multimedia m ON m.historia_id = h.id
    WHERE m.url = ?
  `).get(url);
  if (!historia) return next();

  res.locals.archivoHistoria = true;
  if (historia.expirada) {
    return res.status(404).json({ mensaje: "Historia no encontrada o expirada" });
  }

  return verificarTokenOpcional(req, res, () => {
    if (!puedeVerHistoria(historia.usuario_id, req.usuario?.id)) {
      return res.status(403).json({
        mensaje: "Solo los seguidores pueden ver esta historia"
      });
    }
    return next();
  });
}, express.static(DIRECTORIO_FOTOS, {
  dotfiles: "deny",
  index: false,
  maxAge: "1d",
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Cache-Control",
      res.locals.archivoHistoria ? "private, no-store" : "public, max-age=86400, immutable"
    );
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

function eliminarImagenPublicacion(url) {
  if (typeof url !== "string") return;
  const nombreArchivo = path.basename(url);
  eliminarFotoGuardada(nombreArchivo);
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

function verificarTokenOpcional(req, res, next) {
  const autorizacion = req.headers.authorization;
  if (autorizacion === undefined) {
    req.usuario = null;
    return next();
  }

  const coincidencia = typeof autorizacion === "string"
    ? autorizacion.match(/^Bearer\s+(\S+)$/i)
    : null;
  if (!coincidencia) {
    return res.status(401).json({ mensaje: "Token inválido o vencido" });
  }

  try {
    const payload = jwt.verify(coincidencia[1], SECRET);
    if (!payload || typeof payload !== "object" || !Number.isInteger(payload.id)) {
      return res.status(401).json({ mensaje: "Token inválido o vencido" });
    }

    req.usuario = payload;
    return next();
  } catch {
    return res.status(401).json({ mensaje: "Token inválido o vencido" });
  }
}

function consultarPublicaciones(
  usuarioId,
  limite,
  priorizarSeguidos = false,
  prioridadUsuarioId = null,
  viewerId = null
) {
  return db.prepare(`
    SELECT
      p.id,
      p.usuario_id AS userId,
      u.nombre AS nombreUsuario,
      u.foto_perfil AS fotoPerfil,
      p.titulo AS title,
      p.contenido AS body,
      p.fecha_creacion AS fechaCreacion,
      (
        SELECT m.url
        FROM multimedia m
        WHERE m.publicacion_id = p.id AND m.tipo = 'imagen'
        ORDER BY m.id DESC
        LIMIT 1
      ) AS imagenUrl,
      (SELECT COUNT(*) FROM likes l WHERE l.publicacion_id = p.id) AS likes,
      (SELECT COUNT(*) FROM comentarios c WHERE c.publicacion_id = p.id) AS comentarios,
      CASE WHEN ? IS NOT NULL AND EXISTS (
        SELECT 1 FROM likes l
        WHERE l.publicacion_id = p.id AND l.usuario_id = ?
      ) THEN 1 ELSE 0 END AS likedByMe
    FROM publicaciones p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE (? IS NULL OR p.usuario_id = ?)
      AND (
        u.privado = 0 OR u.id = ? OR EXISTS (
          SELECT 1
          FROM seguidores acceso
          WHERE acceso.seguidor_id = ? AND acceso.seguido_id = u.id
        )
      )
    ORDER BY
      CASE WHEN ? = 1 AND EXISTS (
        SELECT 1
        FROM seguidores s
        WHERE s.seguidor_id = ? AND s.seguido_id = p.usuario_id
      ) THEN 0 ELSE 1 END,
      p.fecha_creacion DESC,
      p.id DESC
    LIMIT ?
  `).all(
    viewerId,
    viewerId,
    usuarioId,
    usuarioId,
    viewerId,
    viewerId,
    priorizarSeguidos ? 1 : 0,
    prioridadUsuarioId,
    limite
  ).map((publicacion) => ({
    ...publicacion,
    fotoPerfil: urlFotoPerfil(publicacion.fotoPerfil),
    likedByMe: Boolean(publicacion.likedByMe)
  }));
}

function obtenerPublicacion(id) {
  const publicacion = db.prepare(`
    SELECT
      p.id,
      p.usuario_id AS userId,
      u.nombre AS nombreUsuario,
      u.foto_perfil AS fotoPerfil,
      p.titulo AS title,
      p.contenido AS body,
      p.fecha_creacion AS fechaCreacion,
      (
        SELECT m.url
        FROM multimedia m
        WHERE m.publicacion_id = p.id AND m.tipo = 'imagen'
        ORDER BY m.id DESC
        LIMIT 1
      ) AS imagenUrl
    FROM publicaciones p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ?
  `).get(id);
  return {
    ...publicacion,
    fotoPerfil: urlFotoPerfil(publicacion.fotoPerfil)
  };
}

function obtenerIdPositivo(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validarDatosPublicacion(cuerpo) {
  const { title, body } = cuerpo;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.trim().length > 100 ||
    typeof body !== "string" ||
    !body.trim() ||
    body.trim().length > 500
  ) {
    return null;
  }

  return { title: title.trim(), body: body.trim() };
}

// Consultar publicaciones públicas y las publicaciones propias del usuario
app.get("/api/publicaciones", verificarTokenOpcional, (req, res) => {
  const limite = req.query.limit === undefined ? 10 : Number(req.query.limit);
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 50) {
    return res.status(400).json({
      mensaje: "El límite debe ser un número entre 1 y 50"
    });
  }

  const usuarioId = req.usuario ? req.usuario.id : null;
  return res.json(consultarPublicaciones(
    null,
    limite,
    usuarioId !== null,
    usuarioId,
    usuarioId
  ));
});

app.get("/api/publicaciones/mias", verificarToken, (req, res) => {
  return res.json(consultarPublicaciones(req.usuario.id, 100, false, null, req.usuario.id));
});

app.get("/api/usuarios/:id/publicaciones", verificarTokenOpcional, (req, res) => {
  const usuarioId = obtenerIdPositivo(req.params.id);
  if (!usuarioId) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }
  if (!db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(usuarioId)) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }
  if (rechazarContenidoPrivado(usuarioId, req.usuario?.id, res)) return;

  const limite = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 100) {
    return res.status(400).json({
      mensaje: "El límite debe ser un número entre 1 y 100"
    });
  }

  return res.json(consultarPublicaciones(
    usuarioId,
    limite,
    false,
    null,
    req.usuario ? req.usuario.id : null
  ));
});

app.post("/api/publicaciones", verificarToken, (req, res, next) => {
  recibirImagenPublicacion(req, res, (error) => {
    if (error) return responderErrorCarga(error, res, next);

    const publicacion = validarDatosPublicacion(obtenerCuerpo(req));
    if (!publicacion) {
      return res.status(400).json({
        mensaje: "El título es obligatorio (máximo 100 caracteres) y el contenido también (máximo 500)"
      });
    }

    const formato = req.file ? obtenerFormatoFoto(req.file.buffer) : null;
    if (req.file && !formato) {
      return res.status(400).json({
        mensaje: "La imagen debe ser un archivo PNG, JPG o WEBP válido"
      });
    }

    let nombreArchivo;
    try {
      const resultado = db.transaction(() => {
        const insertada = db.prepare(`
          INSERT INTO publicaciones (usuario_id, titulo, contenido)
          VALUES (?, ?, ?)
        `).run(req.usuario.id, publicacion.title, publicacion.body);
        const id = Number(insertada.lastInsertRowid);
        if (req.file) {
          nombreArchivo = guardarImagen(req.file.buffer, formato);
          db.prepare(`
            INSERT INTO multimedia (publicacion_id, tipo, url)
            VALUES (?, 'imagen', ?)
          `).run(id, urlFotoPerfil(nombreArchivo));
        }
        return obtenerPublicacion(id);
      })();

      return res.status(201).json({ publicacion: resultado });
    } catch (errorGuardar) {
      if (nombreArchivo) eliminarFotoGuardada(nombreArchivo);
      return next(errorGuardar);
    }
  });
});

app.put("/api/publicaciones/:id", verificarToken, (req, res, next) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de publicación inválido" });
  }

  recibirImagenPublicacion(req, res, (error) => {
    if (error) return responderErrorCarga(error, res, next);

    const datos = validarDatosPublicacion(obtenerCuerpo(req));
    if (!datos) {
      return res.status(400).json({
        mensaje: "El título es obligatorio (máximo 100 caracteres) y el contenido también (máximo 500)"
      });
    }

    const existente = db.prepare(
      "SELECT usuario_id FROM publicaciones WHERE id = ?"
    ).get(id);
    if (!existente) {
      return res.status(404).json({ mensaje: "Publicación no encontrada" });
    }
    if (existente.usuario_id !== req.usuario.id) {
      return res.status(403).json({
        mensaje: "Solo puede editar sus propias publicaciones"
      });
    }

    const formato = req.file ? obtenerFormatoFoto(req.file.buffer) : null;
    if (req.file && !formato) {
      return res.status(400).json({
        mensaje: "La imagen debe ser un archivo PNG, JPG o WEBP válido"
      });
    }

    const imagenAnterior = req.file
      ? db.prepare(`
        SELECT url FROM multimedia
        WHERE publicacion_id = ? AND tipo = 'imagen'
        ORDER BY id DESC LIMIT 1
      `).get(id)
      : null;
    let nombreArchivo;
    let actualizada;
    try {
      actualizada = db.transaction(() => {
        db.prepare(`
          UPDATE publicaciones
          SET titulo = ?, contenido = ?
          WHERE id = ?
        `).run(datos.title, datos.body, id);

        if (req.file) {
          nombreArchivo = guardarImagen(req.file.buffer, formato);
          db.prepare(`
            DELETE FROM multimedia
            WHERE publicacion_id = ? AND tipo = 'imagen'
          `).run(id);
          db.prepare(`
            INSERT INTO multimedia (publicacion_id, tipo, url)
            VALUES (?, 'imagen', ?)
          `).run(id, urlFotoPerfil(nombreArchivo));
        }
        return obtenerPublicacion(id);
      })();
    } catch (errorGuardar) {
      if (nombreArchivo) eliminarFotoGuardada(nombreArchivo);
      return next(errorGuardar);
    }

    try {
      if (imagenAnterior) eliminarImagenPublicacion(imagenAnterior.url);
    } catch (errorLimpieza) {
      return next(errorLimpieza);
    }
    return res.json({ publicacion: actualizada });
  });
});

app.delete("/api/publicaciones/:id", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de publicación inválido" });
  }

  const existente = db.prepare(
    "SELECT usuario_id FROM publicaciones WHERE id = ?"
  ).get(id);
  if (!existente) {
    return res.status(404).json({ mensaje: "Publicación no encontrada" });
  }
  if (existente.usuario_id !== req.usuario.id) {
    return res.status(403).json({
      mensaje: "Solo puede eliminar sus propias publicaciones"
    });
  }

  const imagenes = db.prepare(`
    SELECT url FROM multimedia
    WHERE publicacion_id = ? AND tipo = 'imagen'
  `).all(id);
  db.prepare("DELETE FROM publicaciones WHERE id = ?").run(id);
  for (const imagen of imagenes) eliminarImagenPublicacion(imagen.url);
  return res.json({ mensaje: "Publicación eliminada" });
});

function consultarComentarios(publicacionId) {
  return db.prepare(`
    SELECT
      c.id,
      c.contenido,
      c.comentario_padre_id AS comentarioPadreId,
      c.fecha_creacion AS fechaCreacion,
      u.id AS usuarioId,
      u.nombre,
      u.foto_perfil AS fotoPerfil
    FROM comentarios c
    JOIN usuarios u ON u.id = c.usuario_id
    WHERE c.publicacion_id = ?
    ORDER BY c.fecha_creacion ASC, c.id ASC
    LIMIT 100
  `).all(publicacionId).map((comentario) => ({
    ...comentario,
    fotoPerfil: urlFotoPerfil(comentario.fotoPerfil)
  }));
}

app.get("/api/publicaciones/:id/comentarios", verificarTokenOpcional, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de publicación inválido" });
  }
  const existe = db.prepare(
    "SELECT id, usuario_id FROM publicaciones WHERE id = ?"
  ).get(id);
  if (!existe) {
    return res.status(404).json({ mensaje: "Publicación no encontrada" });
  }
  if (rechazarContenidoPrivado(existe.usuario_id, req.usuario?.id, res)) return;
  const comentarios = consultarComentarios(id);
  const total = db.prepare(
    "SELECT COUNT(*) AS total FROM comentarios WHERE publicacion_id = ?"
  ).get(id).total;
  return res.json({ comentarios, total });
});

app.post("/api/publicaciones/:id/comentarios", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de publicación inválido" });
  }
  const cuerpo = obtenerCuerpo(req);
  const contenido = cuerpo.contenido;
  if (typeof contenido !== "string" || !contenido.trim() || contenido.trim().length > 500) {
    return res.status(400).json({ mensaje: "El comentario debe tener entre 1 y 500 caracteres" });
  }
  const comentarioPadreId = cuerpo.comentarioPadreId === undefined ||
    cuerpo.comentarioPadreId === null ||
    cuerpo.comentarioPadreId === ""
    ? null
    : obtenerIdPositivo(cuerpo.comentarioPadreId);
  if (
    cuerpo.comentarioPadreId !== undefined &&
    cuerpo.comentarioPadreId !== null &&
    cuerpo.comentarioPadreId !== "" &&
    comentarioPadreId === null
  ) {
    return res.status(400).json({ mensaje: "Identificador de comentario inválido" });
  }

  const publicacion = db.prepare(
    "SELECT usuario_id FROM publicaciones WHERE id = ?"
  ).get(id);
  if (!publicacion) {
    return res.status(404).json({ mensaje: "Publicación no encontrada" });
  }
  if (rechazarContenidoPrivado(publicacion.usuario_id, req.usuario.id, res)) return;

  const comentarioPadre = comentarioPadreId === null
    ? null
    : db.prepare(`
      SELECT id, usuario_id AS usuarioId
      FROM comentarios
      WHERE id = ? AND publicacion_id = ?
    `).get(comentarioPadreId, id);
  if (comentarioPadreId !== null && !comentarioPadre) {
    return res.status(404).json({ mensaje: "Comentario al que respondes no encontrado" });
  }

  const comentario = db.transaction(() => {
    const insertado = db.prepare(`
      INSERT INTO comentarios (publicacion_id, usuario_id, comentario_padre_id, contenido)
      VALUES (?, ?, ?, ?)
    `).run(id, req.usuario.id, comentarioPadreId, contenido.trim());
    const destinatarioId = comentarioPadre
      ? comentarioPadre.usuarioId
      : publicacion.usuario_id;
    if (destinatarioId !== req.usuario.id) {
      db.prepare(`
        INSERT INTO notificaciones (usuario_id, actor_id, tipo, publicacion_id, comentario_id)
        VALUES (?, ?, 'comentario', ?, ?)
      `).run(
        destinatarioId,
        req.usuario.id,
        id,
        Number(insertado.lastInsertRowid)
      );
    }
    const comentarios = consultarComentarios(id);
    const comentario = comentarios.find((item) => item.id === Number(insertado.lastInsertRowid));
    return {
      comentario,
      comentarios,
      total: db.prepare(
        "SELECT COUNT(*) AS total FROM comentarios WHERE publicacion_id = ?"
      ).get(id).total
    };
  })();
  return res.status(201).json(comentario);
});

function cambiarLikePublicacion(req, res, agregar) {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de publicación inválido" });
  }
  const publicacion = db.prepare(
    "SELECT usuario_id FROM publicaciones WHERE id = ?"
  ).get(id);
  if (!publicacion) {
    return res.status(404).json({ mensaje: "Publicación no encontrada" });
  }
  if (rechazarContenidoPrivado(publicacion.usuario_id, req.usuario.id, res)) return;

  db.transaction(() => {
    if (agregar) {
      const resultado = db.prepare(`
        INSERT OR IGNORE INTO likes (publicacion_id, usuario_id)
        VALUES (?, ?)
      `).run(id, req.usuario.id);
      if (resultado.changes && publicacion.usuario_id !== req.usuario.id) {
        db.prepare(`
          INSERT INTO notificaciones (usuario_id, actor_id, tipo, publicacion_id)
          VALUES (?, ?, 'like_publicacion', ?)
        `).run(publicacion.usuario_id, req.usuario.id, id);
      }
    } else {
      db.prepare("DELETE FROM likes WHERE publicacion_id = ? AND usuario_id = ?")
        .run(id, req.usuario.id);
      db.prepare(`
        DELETE FROM notificaciones
        WHERE usuario_id = ? AND actor_id = ? AND tipo = 'like_publicacion' AND publicacion_id = ?
      `).run(publicacion.usuario_id, req.usuario.id, id);
    }
  })();

  const likes = db.prepare(
    "SELECT COUNT(*) AS total FROM likes WHERE publicacion_id = ?"
  ).get(id).total;
  return res.json({ liked: agregar, likes });
}

app.post("/api/publicaciones/:id/like", verificarToken, (req, res) => {
  return cambiarLikePublicacion(req, res, true);
});

app.delete("/api/publicaciones/:id/like", verificarToken, (req, res) => {
  return cambiarLikePublicacion(req, res, false);
});

// Consultar el perfil privado del usuario autenticado
app.get("/api/usuarios/me", verificarToken, (req, res) => {
  const usuario = db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.correo,
      u.genero,
      u.bio,
      u.privado,
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
  usuario.privado = Boolean(usuario.privado);
  return res.json(usuario);
});

app.patch("/api/usuarios/me/privacidad", verificarToken, (req, res) => {
  const { privado } = obtenerCuerpo(req);
  if (typeof privado !== "boolean") {
    return res.status(400).json({
      mensaje: "El estado de privacidad debe ser verdadero o falso"
    });
  }

  const resultado = db.prepare(
    "UPDATE usuarios SET privado = ? WHERE id = ?"
  ).run(privado ? 1 : 0, req.usuario.id);
  if (!resultado.changes) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }

  return res.json({
    privado,
    mensaje: privado ? "La cuenta ahora es privada" : "La cuenta ahora es pública"
  });
});

// Buscar perfiles públicos sin exponer correos ni contraseñas
app.get("/api/usuarios/buscar", verificarTokenOpcional, (req, res) => {
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
    SELECT
      u.id,
      u.nombre,
      CASE WHEN EXISTS (
        SELECT 1
        FROM seguidores s
        WHERE s.seguidor_id = ? AND s.seguido_id = u.id
      ) THEN 1 ELSE 0 END AS siguiendo,
      CASE WHEN EXISTS (
        SELECT 1
        FROM solicitudes_seguimiento solicitud
        WHERE solicitud.solicitante_id = ? AND solicitud.usuario_id = u.id
      ) THEN 1 ELSE 0 END AS solicitudPendiente
    FROM usuarios u
    WHERE u.nombre LIKE ? COLLATE NOCASE
      AND (? IS NULL OR u.id <> ?)
    ORDER BY nombre COLLATE NOCASE
    LIMIT 30
  `).all(
    req.usuario ? req.usuario.id : null,
    req.usuario ? req.usuario.id : null,
    `%${consulta}%`,
    req.usuario ? req.usuario.id : null,
    req.usuario ? req.usuario.id : null
  ).map((usuario) => ({
    ...usuario,
    siguiendo: Boolean(usuario.siguiendo),
    solicitudPendiente: Boolean(usuario.solicitudPendiente)
  }));

  return res.json(usuarios);
});

app.get("/api/usuarios/sugerencias", verificarToken, (req, res) => {
  const limite = req.query.limit === undefined ? 6 : Number(req.query.limit);
  if (!Number.isSafeInteger(limite) || limite < 1 || limite > 20) {
    return res.status(400).json({
      mensaje: "El límite de sugerencias debe estar entre 1 y 20"
    });
  }

  const sugerencias = db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.foto_perfil AS fotoPerfil,
      u.privado,
      (
        SELECT COUNT(*)
        FROM seguidores mutuos
        WHERE mutuos.seguido_id = u.id
          AND mutuos.seguidor_id IN (
            SELECT seguidos.seguido_id
            FROM seguidores seguidos
            WHERE seguidos.seguidor_id = ?
          )
      ) AS contactosEnComun
    FROM usuarios u
    WHERE u.id <> ?
      AND NOT EXISTS (
        SELECT 1
        FROM seguidores s
        WHERE s.seguidor_id = ? AND s.seguido_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM solicitudes_seguimiento solicitud
        WHERE solicitud.solicitante_id = ? AND solicitud.usuario_id = u.id
      )
    ORDER BY contactosEnComun DESC, u.id DESC
    LIMIT ?
  `).all(req.usuario.id, req.usuario.id, req.usuario.id, req.usuario.id, limite)
    .map((usuario) => ({
      ...usuario,
      fotoPerfil: urlFotoPerfil(usuario.fotoPerfil),
      privado: Boolean(usuario.privado)
    }));

  return res.json(sugerencias);
});

app.get("/api/usuarios/:id/seguimiento", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }

  const usuario = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(id);
  if (!usuario) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }

  const relacion = db.prepare(`
    SELECT 1
    FROM seguidores
    WHERE seguidor_id = ? AND seguido_id = ?
  `).get(req.usuario.id, id);
  const solicitud = db.prepare(`
    SELECT 1
    FROM solicitudes_seguimiento
    WHERE solicitante_id = ? AND usuario_id = ?
  `).get(req.usuario.id, id);
  return res.json({
    siguiendo: Boolean(relacion),
    solicitudPendiente: Boolean(solicitud)
  });
});

app.post("/api/usuarios/:id/seguir", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }
  if (id === req.usuario.id) {
    return res.status(400).json({ mensaje: "No puede seguir su propia cuenta" });
  }

  const usuario = db.prepare("SELECT id, privado FROM usuarios WHERE id = ?").get(id);
  if (!usuario) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }

  if (usuario.privado) {
    const yaSigue = db.prepare(`
      SELECT 1 FROM seguidores WHERE seguidor_id = ? AND seguido_id = ?
    `).get(req.usuario.id, id);
    if (yaSigue) {
      return res.json({ siguiendo: true, solicitudPendiente: false, mensaje: "Ya sigues a este usuario" });
    }

    db.prepare(`
      INSERT OR IGNORE INTO solicitudes_seguimiento (solicitante_id, usuario_id)
      VALUES (?, ?)
    `).run(req.usuario.id, id);
    return res.json({
      siguiendo: false,
      solicitudPendiente: true,
      mensaje: "Solicitud de seguimiento enviada"
    });
  }

  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO seguidores (seguidor_id, seguido_id)
      VALUES (?, ?)
    `).run(req.usuario.id, id);
    db.prepare(`
      DELETE FROM solicitudes_seguimiento
      WHERE solicitante_id = ? AND usuario_id = ?
    `).run(req.usuario.id, id);
  })();
  return res.json({
    siguiendo: true,
    solicitudPendiente: false,
    mensaje: "Ahora sigues a este usuario"
  });
});

app.delete("/api/usuarios/:id/seguir", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }

  const usuario = db.prepare("SELECT id FROM usuarios WHERE id = ?").get(id);
  if (!usuario) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }

  db.transaction(() => {
    db.prepare(`
      DELETE FROM solicitudes_seguimiento
      WHERE solicitante_id = ? AND usuario_id = ?
    `).run(req.usuario.id, id);
    db.prepare(`
      DELETE FROM seguidores
      WHERE seguidor_id = ? AND seguido_id = ?
    `).run(req.usuario.id, id);
  })();
  return res.json({
    siguiendo: false,
    solicitudPendiente: false,
    mensaje: "Dejaste de seguir a este usuario"
  });
});

app.post("/api/solicitudes-seguimiento/:id/aceptar", verificarToken, (req, res) => {
  const solicitudId = obtenerIdPositivo(req.params.id);
  if (!solicitudId) {
    return res.status(400).json({ mensaje: "Identificador de solicitud inválido" });
  }

  const solicitud = db.prepare(`
    SELECT solicitante_id
    FROM solicitudes_seguimiento
    WHERE id = ? AND usuario_id = ?
  `).get(solicitudId, req.usuario.id);
  if (!solicitud) {
    return res.status(404).json({ mensaje: "Solicitud de seguimiento no encontrada" });
  }

  db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO seguidores (seguidor_id, seguido_id)
      VALUES (?, ?)
    `).run(solicitud.solicitante_id, req.usuario.id);
    db.prepare("DELETE FROM solicitudes_seguimiento WHERE id = ?").run(solicitudId);
  })();
  return res.json({ aceptada: true, mensaje: "Solicitud de seguimiento aceptada" });
});

app.delete("/api/solicitudes-seguimiento/:id", verificarToken, (req, res) => {
  const solicitudId = obtenerIdPositivo(req.params.id);
  if (!solicitudId) {
    return res.status(400).json({ mensaje: "Identificador de solicitud inválido" });
  }

  const resultado = db.prepare(`
    DELETE FROM solicitudes_seguimiento
    WHERE id = ? AND usuario_id = ?
  `).run(solicitudId, req.usuario.id);
  if (!resultado.changes) {
    return res.status(404).json({ mensaje: "Solicitud de seguimiento no encontrada" });
  }
  return res.json({ aceptada: false, mensaje: "Solicitud de seguimiento rechazada" });
});

function consultarRelacionesUsuario(usuarioId, tipo, solicitanteId) {
  const columnaObjetivo = tipo === "seguidores" ? "seguido_id" : "seguidor_id";
  const columnaUsuario = tipo === "seguidores" ? "seguidor_id" : "seguido_id";
  return db.prepare(`
    SELECT
      u.id,
      u.nombre,
      u.foto_perfil AS fotoPerfil,
      CASE WHEN EXISTS (
        SELECT 1
        FROM seguidores relacion
        WHERE relacion.seguidor_id = ? AND relacion.seguido_id = u.id
      ) THEN 1 ELSE 0 END AS siguiendo
    FROM seguidores s
    JOIN usuarios u ON u.id = s.${columnaUsuario}
    WHERE s.${columnaObjetivo} = ?
    ORDER BY s.fecha_seguimiento DESC, s.id DESC
  `).all(solicitanteId, usuarioId)
    .map((usuario) => ({
      ...usuario,
      fotoPerfil: urlFotoPerfil(usuario.fotoPerfil),
      siguiendo: Boolean(usuario.siguiendo)
    }));
}

function responderRelacionesUsuario(req, res, tipo) {
  const usuarioId = obtenerIdPositivo(req.params.id);
  if (!usuarioId) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }

  const existe = db.prepare("SELECT id, privado FROM usuarios WHERE id = ?").get(usuarioId);
  if (!existe) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }
  if (existe.privado && !puedeVerContenidoUsuario(usuarioId, req.usuario?.id)) {
    return res.status(403).json({
      mensaje: "Esta cuenta es privada. Síguela para ver sus relaciones."
    });
  }

  return res.json(consultarRelacionesUsuario(
    usuarioId,
    tipo,
    req.usuario ? req.usuario.id : null
  ));
}

app.get("/api/usuarios/:id/seguidores", verificarTokenOpcional, (req, res) => {
  return responderRelacionesUsuario(req, res, "seguidores");
});

app.get("/api/usuarios/:id/seguidos", verificarTokenOpcional, (req, res) => {
  return responderRelacionesUsuario(req, res, "seguidos");
});

// Consultar un perfil público
app.get("/api/usuarios/:id", verificarTokenOpcional, (req, res) => {
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
      u.genero,
      u.foto_perfil AS fotoPerfil,
      u.privado,
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
  const siguiendo = req.usuario
    ? Boolean(db.prepare(`
      SELECT 1
      FROM seguidores
      WHERE seguidor_id = ? AND seguido_id = ?
    `).get(req.usuario.id, id))
    : false;
  const solicitudPendiente = req.usuario
    ? Boolean(db.prepare(`
      SELECT 1
      FROM solicitudes_seguimiento
      WHERE solicitante_id = ? AND usuario_id = ?
    `).get(req.usuario.id, id))
    : false;
  const puedeVer = puedeVerContenidoUsuario(id, req.usuario?.id);
  if (!puedeVer) {
    return res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      fotoPerfil: usuario.fotoPerfil,
      privado: true,
      accesoRestringido: true,
      siguiendo,
      solicitudPendiente
    });
  }

  usuario.privado = Boolean(usuario.privado);
  usuario.siguiendo = siguiendo;
  usuario.solicitudPendiente = solicitudPendiente;
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

app.get("/api/historias", verificarTokenOpcional, (req, res) => {
  const usuarioIdSolicitado = req.query.usuarioId === undefined
    ? null
    : obtenerIdPositivo(req.query.usuarioId);
  if (req.query.usuarioId !== undefined && !usuarioIdSolicitado) {
    return res.status(400).json({ mensaje: "Identificador de usuario inválido" });
  }
  if (
    usuarioIdSolicitado &&
    !db.prepare("SELECT 1 FROM usuarios WHERE id = ?").get(usuarioIdSolicitado)
  ) {
    return res.status(404).json({ mensaje: "Usuario no encontrado" });
  }
  if (
    usuarioIdSolicitado &&
    !puedeVerHistoria(usuarioIdSolicitado, req.usuario?.id)
  ) {
    return res.status(403).json({
      mensaje: "Solo el dueño del perfil y sus seguidores pueden ver sus historias"
    });
  }

  const historias = db.prepare(`
    SELECT
      h.id,
      h.contenido,
      h.fecha_creacion AS fechaCreacion,
      u.id AS usuarioId,
      u.nombre,
      u.foto_perfil AS fotoPerfil,
      m.url,
      (SELECT COUNT(*) FROM likes_historias l WHERE l.historia_id = h.id) AS likes,
      CASE WHEN ? IS NOT NULL AND EXISTS (
        SELECT 1 FROM likes_historias l
        WHERE l.historia_id = h.id AND l.usuario_id = ?
      ) THEN 1 ELSE 0 END AS likedByMe
    FROM historias h
    JOIN usuarios u ON u.id = h.usuario_id
    JOIN multimedia m ON m.historia_id = h.id
    WHERE h.fecha_expiracion > datetime('now')
      AND (? IS NULL OR h.usuario_id = ?)
      AND (
        h.usuario_id = ? OR EXISTS (
          SELECT 1
          FROM seguidores s
          WHERE s.seguidor_id = ? AND s.seguido_id = h.usuario_id
        )
      )
    ORDER BY h.fecha_creacion
  `).all(
    req.usuario ? req.usuario.id : null,
    req.usuario ? req.usuario.id : null,
    usuarioIdSolicitado,
    usuarioIdSolicitado,
    req.usuario ? req.usuario.id : null,
    req.usuario ? req.usuario.id : null
  );

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
      likes: historia.likes,
      likedByMe: Boolean(historia.likedByMe),
      ...(historia.contenido ? { text: historia.contenido } : {})
    });
  }

  return res.json([...historiasPorUsuario.values()]);
});

function puedeVerHistoria(usuarioId, solicitanteId) {
  if (usuarioId === solicitanteId) return true;
  if (!solicitanteId) return false;
  return Boolean(db.prepare(`
    SELECT 1
    FROM seguidores
    WHERE seguidor_id = ? AND seguido_id = ?
  `).get(solicitanteId, usuarioId));
}

app.post("/api/historias/:id/like", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de historia inválido" });
  }
  const historia = db.prepare(`
    SELECT usuario_id
    FROM historias
    WHERE id = ? AND fecha_expiracion > datetime('now')
  `).get(id);
  if (!historia) {
    return res.status(404).json({ mensaje: "Historia no encontrada o expirada" });
  }
  if (!puedeVerHistoria(historia.usuario_id, req.usuario.id)) {
    return res.status(403).json({
      mensaje: "Solo los seguidores pueden ver o indicar que les gusta esta historia"
    });
  }

  db.transaction(() => {
    const resultado = db.prepare(`
      INSERT OR IGNORE INTO likes_historias (historia_id, usuario_id)
      VALUES (?, ?)
    `).run(id, req.usuario.id);
    if (resultado.changes && historia.usuario_id !== req.usuario.id) {
      db.prepare(`
        INSERT INTO notificaciones (usuario_id, actor_id, tipo, historia_id)
        VALUES (?, ?, 'like_historia', ?)
      `).run(historia.usuario_id, req.usuario.id, id);
    }
  })();

  const likes = db.prepare(
    "SELECT COUNT(*) AS total FROM likes_historias WHERE historia_id = ?"
  ).get(id).total;
  return res.json({ liked: true, likes });
});

app.delete("/api/historias/:id/like", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de historia inválido" });
  }
  const historia = db.prepare("SELECT usuario_id FROM historias WHERE id = ?").get(id);
  if (!historia) {
    return res.status(404).json({ mensaje: "Historia no encontrada" });
  }
  if (!puedeVerHistoria(historia.usuario_id, req.usuario.id)) {
    return res.status(403).json({
      mensaje: "Solo los seguidores pueden ver o indicar que les gusta esta historia"
    });
  }

  db.transaction(() => {
    db.prepare("DELETE FROM likes_historias WHERE historia_id = ? AND usuario_id = ?")
      .run(id, req.usuario.id);
    db.prepare(`
      DELETE FROM notificaciones
      WHERE usuario_id = ? AND actor_id = ? AND tipo = 'like_historia' AND historia_id = ?
    `).run(historia.usuario_id, req.usuario.id, id);
  })();

  const likes = db.prepare(
    "SELECT COUNT(*) AS total FROM likes_historias WHERE historia_id = ?"
  ).get(id).total;
  return res.json({ liked: false, likes });
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

app.get("/api/notificaciones", verificarToken, (req, res) => {
  const notificaciones = db.prepare(`
    SELECT
      n.id,
      n.tipo,
      n.fecha_creacion AS fechaCreacion,
      n.leida,
      actor.id AS actorId,
      actor.nombre AS actorNombre,
      actor.foto_perfil AS actorFotoPerfil,
      n.publicacion_id AS publicacionId,
      p.titulo AS tituloPublicacion,
      n.historia_id AS historiaId,
      h.contenido AS textoHistoria,
      historia_media.url AS imagenHistoria,
      n.comentario_id AS comentarioId,
      c.contenido AS contenidoComentario
    FROM notificaciones n
    JOIN usuarios actor ON actor.id = n.actor_id
    LEFT JOIN publicaciones p ON p.id = n.publicacion_id
    LEFT JOIN historias h ON h.id = n.historia_id
    LEFT JOIN multimedia historia_media
      ON historia_media.historia_id = h.id AND historia_media.tipo = 'imagen'
    LEFT JOIN comentarios c ON c.id = n.comentario_id
    WHERE n.usuario_id = ?
    ORDER BY n.fecha_creacion DESC, n.id DESC
    LIMIT 100
  `).all(req.usuario.id).map((notificacion) => ({
    ...notificacion,
    actorFotoPerfil: urlFotoPerfil(notificacion.actorFotoPerfil),
    leida: Boolean(notificacion.leida),
    imagenHistoria: notificacion.imagenHistoria
      ? urlFotoPerfil(path.basename(notificacion.imagenHistoria))
      : null
  }));
  const solicitudesSeguimiento = db.prepare(`
    SELECT
      solicitud.id,
      solicitud.fecha_solicitud AS fechaSolicitud,
      solicitante.id AS solicitanteId,
      solicitante.nombre AS solicitanteNombre,
      solicitante.foto_perfil AS solicitanteFotoPerfil
    FROM solicitudes_seguimiento solicitud
    JOIN usuarios solicitante ON solicitante.id = solicitud.solicitante_id
    WHERE solicitud.usuario_id = ?
    ORDER BY solicitud.fecha_solicitud DESC, solicitud.id DESC
  `).all(req.usuario.id).map((solicitud) => ({
    ...solicitud,
    solicitanteFotoPerfil: urlFotoPerfil(solicitud.solicitanteFotoPerfil)
  }));
  const noLeidas = db.prepare(
    "SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida = 0"
  ).get(req.usuario.id).total;
  return res.json({
    notificaciones,
    solicitudesSeguimiento,
    solicitudesPendientes: solicitudesSeguimiento.length,
    noLeidas
  });
});

app.post("/api/notificaciones/leer-todas", verificarToken, (req, res) => {
  const resultado = db.prepare(`
    UPDATE notificaciones
    SET leida = 1
    WHERE usuario_id = ? AND leida = 0
  `).run(req.usuario.id);
  return res.json({ actualizadas: resultado.changes });
});

app.patch("/api/notificaciones/:id/leer", verificarToken, (req, res) => {
  const id = obtenerIdPositivo(req.params.id);
  if (!id) {
    return res.status(400).json({ mensaje: "Identificador de notificación inválido" });
  }
  const resultado = db.prepare(`
    UPDATE notificaciones
    SET leida = 1
    WHERE id = ? AND usuario_id = ?
  `).run(id, req.usuario.id);
  if (!resultado.changes) {
    return res.status(404).json({ mensaje: "Notificación no encontrada" });
  }
  return res.json({ leida: true });
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

function puedeVerContenidoUsuario(usuarioId, solicitanteId) {
  const usuario = db.prepare(
    "SELECT privado FROM usuarios WHERE id = ?"
  ).get(usuarioId);
  if (!usuario) return false;
  if (solicitanteId === usuarioId || !usuario.privado) return true;
  if (solicitanteId === null || solicitanteId === undefined) return false;
  return Boolean(db.prepare(`
    SELECT 1
    FROM seguidores
    WHERE seguidor_id = ? AND seguido_id = ?
  `).get(solicitanteId, usuarioId));
}

function rechazarContenidoPrivado(usuarioId, solicitanteId, res) {
  if (puedeVerContenidoUsuario(usuarioId, solicitanteId)) return false;
  res.status(403).json({
    mensaje: "Esta cuenta es privada. Síguela para ver su perfil y contenido."
  });
  return true;
}

function enviarPaquete(socket, paquete) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(paquete));
  }
}

function enviarErrorSocket(socket, mensaje, requestId) {
  enviarPaquete(socket, { type: "error", mensaje, requestId });
}

function desuscribirSocket(socket) {
  if (!socket.conversacionId) return;
  const sockets = socketsPorConversacion.get(socket.conversacionId);
  sockets?.delete(socket);
  if (sockets?.size === 0) {
    socketsPorConversacion.delete(socket.conversacionId);
  }
  socket.conversacionId = null;
}

const socketsPorConversacion = new Map();

const buscarMensajePorId = db.prepare(`
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
`);

function guardarMensajeSocket(conversacionId, usuarioId, contenido, clientId, leido) {
  const guardar = db.transaction(() => {
    const existente = db.prepare(`
      SELECT id
      FROM mensajes
      WHERE conversacion_id = ? AND remitente_id = ? AND client_id = ?
    `).get(conversacionId, usuarioId, clientId);

    if (existente) return buscarMensajePorId.get(existente.id);

    const resultado = db.prepare(`
      INSERT INTO mensajes (
        conversacion_id, remitente_id, contenido, client_id, leido
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(conversacionId, usuarioId, contenido, clientId, leido ? 1 : 0);

    return buscarMensajePorId.get(Number(resultado.lastInsertRowid));
  });

  return guardar.immediate();
}

function procesarPaqueteSocket(socket, paquete) {
  if (!paquete || typeof paquete !== "object" || Array.isArray(paquete)) {
    enviarErrorSocket(socket, "El mensaje recibido no es válido");
    return;
  }

  if (!socket.usuario) {
    if (paquete.type !== "authenticate" || typeof paquete.token !== "string") {
      socket.close(4401, "Autenticación requerida");
      return;
    }

    try {
      const usuario = jwt.verify(paquete.token, SECRET);
      if (
        !usuario ||
        typeof usuario !== "object" ||
        !Number.isInteger(usuario.id) ||
        !db.prepare("SELECT id FROM usuarios WHERE id = ?").get(usuario.id)
      ) {
        socket.close(4401, "Token inválido o vencido");
        return;
      }

      socket.usuario = usuario;
      clearTimeout(socket.authTimer);
      enviarPaquete(socket, { type: "authenticated" });
    } catch {
      socket.close(4401, "Token inválido o vencido");
    }
    return;
  }

  if (paquete.type === "subscribe") {
    const conversacionId = Number(paquete.conversationId);
    if (!Number.isSafeInteger(conversacionId) || conversacionId < 1) {
      enviarErrorSocket(socket, "Identificador de conversación inválido");
      return;
    }

    const conversacion = buscarConversacion(conversacionId);
    if (
      !conversacion ||
      (conversacion.usuario_1_id !== socket.usuario.id &&
        conversacion.usuario_2_id !== socket.usuario.id)
    ) {
      enviarErrorSocket(socket, "No tiene acceso a esta conversación");
      return;
    }

    desuscribirSocket(socket);
    socket.conversacionId = conversacionId;
    if (!socketsPorConversacion.has(conversacionId)) {
      socketsPorConversacion.set(conversacionId, new Set());
    }
    socketsPorConversacion.get(conversacionId).add(socket);
    enviarPaquete(socket, { type: "subscribed", conversationId: conversacionId });
    return;
  }

  if (paquete.type === "unsubscribe") {
    desuscribirSocket(socket);
    enviarPaquete(socket, { type: "unsubscribed" });
    return;
  }

  if (paquete.type !== "send_message") {
    enviarErrorSocket(socket, "Tipo de mensaje no reconocido", paquete.requestId);
    return;
  }

  const requestId = paquete.requestId;
  const contenido = typeof paquete.contenido === "string"
    ? paquete.contenido.trim()
    : "";
  if (
    typeof requestId !== "string" ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(requestId) ||
    !socket.conversacionId ||
    Number(paquete.conversationId) !== socket.conversacionId ||
    !contenido ||
    contenido.length > 2000
  ) {
    enviarErrorSocket(socket, "No se pudo validar el mensaje", requestId);
    return;
  }

  const conversacion = buscarConversacion(socket.conversacionId);
  if (
    !conversacion ||
    (conversacion.usuario_1_id !== socket.usuario.id &&
      conversacion.usuario_2_id !== socket.usuario.id)
  ) {
    desuscribirSocket(socket);
    enviarErrorSocket(socket, "No tiene acceso a esta conversación", requestId);
    return;
  }

  const destinatarioId = conversacion.usuario_1_id === socket.usuario.id
    ? conversacion.usuario_2_id
    : conversacion.usuario_1_id;
  const destinatarioActivo = [...(socketsPorConversacion.get(socket.conversacionId) || [])]
    .some((cliente) => cliente.usuario.id === destinatarioId);
  const mensaje = guardarMensajeSocket(
    socket.conversacionId,
    socket.usuario.id,
    contenido,
    requestId,
    destinatarioActivo
  );
  const destinatarios = socketsPorConversacion.get(socket.conversacionId) || [];
  for (const cliente of destinatarios) {
    if (cliente !== socket) {
      enviarPaquete(cliente, {
        type: "new_message",
        conversationId: socket.conversacionId,
        mensaje
      });
    }
  }
  enviarPaquete(socket, {
    type: "message_sent",
    requestId,
    conversationId: socket.conversacionId,
    mensaje
  });
}

webSocketServer.on("connection", (socket) => {
  socket.usuario = null;
  socket.conversacionId = null;
  socket.authTimer = setTimeout(() => {
    socket.close(4401, "Autenticación requerida");
  }, 10000);

  socket.on("message", (datos, esBinario) => {
    if (esBinario) {
      enviarErrorSocket(socket, "Solo se aceptan mensajes de texto");
      return;
    }
    try {
      procesarPaqueteSocket(socket, JSON.parse(datos.toString()));
    } catch (error) {
      console.error("Error procesando mensaje WebSocket:", error);
      enviarErrorSocket(socket, "No se pudo procesar el mensaje");
    }
  });

  socket.on("close", () => {
    clearTimeout(socket.authTimer);
    desuscribirSocket(socket);
  });
  socket.on("error", (error) => {
    console.error("Error en conexión WebSocket:", error);
  });
});

httpServer.on("upgrade", (req, socket, head) => {
  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSocketServer.handleUpgrade(req, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, req);
  });
});

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
  httpServer.listen(puerto, () => {
    console.log(`API funcionando en http://localhost:${puerto}`);
  });
}

module.exports = app;