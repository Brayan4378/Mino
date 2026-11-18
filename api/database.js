const Database = require("better-sqlite3");
const path = require("node:path");

// Conexión a la base de datos
const db = new Database(path.join(__dirname, "usuarios.db"));
db.pragma("foreign_keys = ON");

// crea las tablas de la red social si no existen
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    privado INTEGER NOT NULL DEFAULT 0 CHECK (privado IN (0, 1)),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    contenido TEXT NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS multimedia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER,
    historia_id INTEGER,
    tipo TEXT NOT NULL CHECK (tipo IN ('imagen', 'video', 'audio')),
    url TEXT NOT NULL,
    descripcion TEXT,
    fecha_subida DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
      (publicacion_id IS NOT NULL AND historia_id IS NULL) OR
      (publicacion_id IS NULL AND historia_id IS NOT NULL)
    ),
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (historia_id) REFERENCES historias(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comentarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    comentario_padre_id INTEGER,
    contenido TEXT NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (comentario_padre_id) REFERENCES comentarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (publicacion_id, usuario_id),
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS historias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    contenido TEXT,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion DATETIME NOT NULL DEFAULT (datetime('now', '+24 hours')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS historia_vistas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    historia_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    fecha_vista DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (historia_id, usuario_id),
    FOREIGN KEY (historia_id) REFERENCES historias(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes_historias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    historia_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (historia_id, usuario_id),
    FOREIGN KEY (historia_id) REFERENCES historias(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    actor_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('like_publicacion', 'comentario', 'like_historia')),
    publicacion_id INTEGER,
    historia_id INTEGER,
    comentario_id INTEGER,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leida INTEGER NOT NULL DEFAULT 0 CHECK (leida IN (0, 1)),
    CHECK (
      (tipo IN ('like_publicacion', 'comentario') AND publicacion_id IS NOT NULL AND historia_id IS NULL) OR
      (tipo = 'like_historia' AND historia_id IS NOT NULL AND publicacion_id IS NULL)
    ),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (historia_id) REFERENCES historias(id) ON DELETE CASCADE,
    FOREIGN KEY (comentario_id) REFERENCES comentarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS seguidores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seguidor_id INTEGER NOT NULL,
    seguido_id INTEGER NOT NULL,
    fecha_seguimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (seguidor_id, seguido_id),
    CHECK (seguidor_id <> seguido_id),
    FOREIGN KEY (seguidor_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (seguido_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS solicitudes_seguimiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitante_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (solicitante_id, usuario_id),
    CHECK (solicitante_id <> usuario_id),
    FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_1_id INTEGER NOT NULL,
    usuario_2_id INTEGER NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (usuario_1_id, usuario_2_id),
    CHECK (usuario_1_id < usuario_2_id),
    FOREIGN KEY (usuario_1_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_2_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER NOT NULL,
    remitente_id INTEGER NOT NULL,
    contenido TEXT NOT NULL,
    client_id TEXT,
    tipo TEXT NOT NULL DEFAULT 'texto'
      CHECK (tipo IN ('texto', 'imagen', 'video', 'audio')),
    leido INTEGER NOT NULL DEFAULT 0 CHECK (leido IN (0, 1)),
    fecha_envio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (remitente_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_publicaciones_usuario
    ON publicaciones(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_multimedia_publicacion
    ON multimedia(publicacion_id);
  CREATE INDEX IF NOT EXISTS idx_multimedia_historia
    ON multimedia(historia_id);
  CREATE INDEX IF NOT EXISTS idx_comentarios_publicacion
    ON comentarios(publicacion_id);
  CREATE INDEX IF NOT EXISTS idx_likes_publicacion
    ON likes(publicacion_id);
  CREATE INDEX IF NOT EXISTS idx_historias_usuario
    ON historias(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_historia_vistas_historia
    ON historia_vistas(historia_id);
  CREATE INDEX IF NOT EXISTS idx_likes_historias_historia
    ON likes_historias(historia_id);
  CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha
    ON notificaciones(usuario_id, fecha_creacion DESC);
  CREATE INDEX IF NOT EXISTS idx_seguidores_seguido
    ON seguidores(seguido_id);
  CREATE INDEX IF NOT EXISTS idx_solicitudes_seguimiento_usuario_fecha
    ON solicitudes_seguimiento(usuario_id, fecha_solicitud DESC);
  CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion
    ON mensajes(conversacion_id, fecha_envio)
`);

const columnasUsuario = new Set(
  db.pragma("table_info(usuarios)").map((columna) => columna.name)
);

const columnasMensaje = new Set(
  db.pragma("table_info(mensajes)").map((columna) => columna.name)
);
const columnasComentario = new Set(
  db.pragma("table_info(comentarios)").map((columna) => columna.name)
);

if (!columnasUsuario.has("privado")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN privado INTEGER NOT NULL DEFAULT 0");
}

if (!columnasMensaje.has("client_id")) {
  db.exec("ALTER TABLE mensajes ADD COLUMN client_id TEXT");
}

if (!columnasComentario.has("comentario_padre_id")) {
  db.exec(`
    ALTER TABLE comentarios
    ADD COLUMN comentario_padre_id INTEGER REFERENCES comentarios(id) ON DELETE CASCADE
  `);
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_mensajes_client_id
    ON mensajes(remitente_id, conversacion_id, client_id)
    WHERE client_id IS NOT NULL
`);
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_comentarios_padre
    ON comentarios(comentario_padre_id)
`);

if (!columnasUsuario.has("genero")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN genero TEXT NOT NULL DEFAULT ''");
}

if (!columnasUsuario.has("bio")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
}

if (!columnasUsuario.has("foto_perfil")) {
  db.exec("ALTER TABLE usuarios ADD COLUMN foto_perfil TEXT");
}

module.exports = db;