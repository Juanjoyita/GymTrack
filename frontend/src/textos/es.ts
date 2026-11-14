// Textos de la interfaz centralizados para poder traducirlos más adelante (constitución, "Idioma").
export const textos = {
  app: {
    nombre: 'GymTrack',
    lema: 'Tu registro de entrenamientos',
  },
  shell: {
    saltarAlContenido: 'Saltar al contenido',
    proximamente: 'Próximamente',
    queIncluira: 'Qué podrás hacer aquí',
  },
  navegacion: {
    etiqueta: 'Navegación principal',
    entrenar: 'Entrenar',
    historial: 'Historial',
    progreso: 'Progreso',
    rutinas: 'Rutinas',
    cuenta: 'Cuenta',
  },
  // Descripción de cada sección mientras se implementa su historia (spec, US1–US5).
  secciones: {
    entrenar: {
      descripcion: 'Inicia un entrenamiento y anota cada serie justo después de terminarla.',
      incluira: [
        'Registrar series con peso y repeticiones',
        'Valores prellenados con tu última sesión',
        'Seguir registrando aunque se corte la conexión',
      ],
    },
    historial: {
      descripcion: 'Consulta tus entrenamientos anteriores, del más reciente al más antiguo.',
      incluira: [
        'Resumen de cada sesión: duración, series y volumen',
        'Filtros por ejercicio y por fechas',
        'Corregir o eliminar entrenamientos pasados',
      ],
    },
    progreso: {
      descripcion: 'Comprueba si estás mejorando en cada ejercicio.',
      incluira: [
        'Evolución del peso máximo, el volumen y el 1RM estimado',
        'Récords personales con su fecha',
        'Gráfico y tabla con los mismos datos',
      ],
    },
    rutinas: {
      descripcion: 'Organiza tus propias rutinas por día de la semana.',
      incluira: [
        'Rutinas con nombre, día y ejercicios',
        'Iniciar un entrenamiento desde una rutina',
      ],
    },
    cuenta: {
      descripcion: 'Gestiona tus preferencias y tus datos.',
      incluira: [
        'Elegir la unidad de peso: kg o lb',
        'Exportar tus datos en CSV y JSON',
        'Eliminar tu cuenta y todos tus datos',
      ],
    },
  },
  acceso: {
    frase: 'Cada repetición cuenta.',
    comprobando: 'Comprobando tu sesión…',
    reintentar: 'Reintentar',
    email: 'Correo electrónico',
    contrasena: 'Contraseña',
    ayudaContrasena: 'Entre 8 y 128 caracteres.',
    errorEmail: 'Escribe un correo electrónico válido, como nombre@ejemplo.com.',
    errorContrasenaVacia: 'Escribe tu contraseña.',
    errorContrasenaLongitud: 'La contraseña debe tener entre 8 y 128 caracteres.',
    credencialesIncorrectas: 'El correo o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
    login: {
      titulo: 'Iniciar sesión',
      subtitulo: 'Entra para seguir con tus entrenamientos.',
      enviar: 'Iniciar sesión',
      enviando: 'Iniciando sesión…',
      pregunta: '¿Aún no tienes cuenta?',
      enlace: 'Crear cuenta',
    },
    registro: {
      titulo: 'Crear cuenta',
      subtitulo: 'Solo necesitas un correo y una contraseña.',
      enviar: 'Crear cuenta',
      enviando: 'Creando cuenta…',
      pregunta: '¿Ya tienes cuenta?',
      enlace: 'Iniciar sesión',
    },
    sesionIniciada: 'Sesión iniciada como',
    cerrarSesion: 'Cerrar sesión',
    cerrandoSesion: 'Cerrando sesión…',
  },
  noEncontrada: {
    titulo: 'Página no encontrada',
    descripcion: 'La dirección que buscas no existe.',
    volver: 'Volver al inicio',
  },
  errores: {
    generico: 'No se pudo completar la solicitud.',
    sinConexion: 'No hay conexión con el servidor.',
  },
} as const;

export type ClaveSeccion = keyof typeof textos.secciones;
