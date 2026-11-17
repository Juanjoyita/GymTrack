import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { CLAVE_EN_CURSO, iniciarDesdeRutina } from '../../api/entrenamientos';
import { textos } from '../../textos/es';

const t = textos.rutinas;

/**
 * Inicia el entrenamiento desde una rutina y abre Entrenar con la sesión que creó el servidor. A partir
 * de ahí la sesión es un entrenamiento normal (FR-029): sus series usan la cola y funcionan sin red.
 */
export function useIniciarDesdeRutina() {
  const cliente = useQueryClient();
  const navegar = useNavigate();
  return useMutation({
    mutationFn: iniciarDesdeRutina,
    onSuccess: (entrenamiento) => {
      cliente.setQueryData(CLAVE_EN_CURSO, entrenamiento);
      navegar('/');
    },
  });
}

/** Mensaje claro para un fallo al iniciar; `irAEntrenar` si ya hay uno en curso. */
export function mensajeInicio(error: unknown): { texto: string; irAEntrenar?: boolean } {
  if (error instanceof ErrorRed) return { texto: t.sinConexionIniciar };
  if (error instanceof ErrorApi && error.codigo === 'ENTRENAMIENTO_EN_CURSO') return { texto: t.yaEnCurso, irAEntrenar: true };
  if (error instanceof ErrorApi && error.status === 404) return { texto: t.noExiste };
  return { texto: t.errorIniciar };
}
