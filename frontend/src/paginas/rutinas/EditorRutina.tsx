import { esquemaRutina } from '@gymtrack/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, ErrorRed } from '../../api/cliente';
import { listarEjercicios } from '../../api/ejercicios';
import { actualizarRutina, CLAVE_RUTINAS, crearRutina, obtenerRutina, type DatosRutina, type Rutina } from '../../api/rutinas';
import { useTituloDocumento } from '../../app/useTituloDocumento';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campo';
import { CampoSeleccion } from '../../componentes/CampoSeleccion';
import { AREA_TACTIL, FOCO_VISIBLE } from '../../componentes/estilos';
import { IconoCargando } from '../../componentes/Iconos';
import { textos } from '../../textos/es';
import { AvisoError } from '../auth/AvisoError';
import { diaIso, nombreDia } from './dias';
import { EjerciciosRutina } from './EjerciciosRutina';

const t = textos.rutinas;
const DIAS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ valor: String(d), texto: nombreDia(d) }));

interface FormularioRutinaProps {
  titulo: string;
  inicial?: Rutina;
  guardar: (datos: DatosRutina) => Promise<Rutina>;
  /** Aviso que se muestra al abrir (p. ej., tras un conflicto de versión se carga la vigente). */
  avisoInicial?: string;
}

/** Formulario de una rutina: nombre, día y ejercicios ordenados, validado con el esquema compartido. */
export function FormularioRutina({ titulo, inicial, guardar, avisoInicial }: FormularioRutinaProps) {
  useTituloDocumento(titulo);
  const cliente = useQueryClient();
  const navegar = useNavigate();
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [dia, setDia] = useState(String(inicial?.diaSemana ?? diaIso()));
  const [seleccion, setSeleccion] = useState(inicial?.ejercicios.map((e) => e.ejercicioId) ?? []);
  const [errores, setErrores] = useState<{ nombre?: string; ejercicios?: string }>({});
  const campoNombre = useRef<HTMLInputElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const catalogo = useQuery({ queryKey: ['ejercicios', ''], queryFn: ({ signal }) => listarEjercicios('', signal), retry: false });

  const mutacion = useMutation({
    mutationFn: guardar,
    onSuccess: (rutina) => {
      void cliente.invalidateQueries({ queryKey: CLAVE_RUTINAS });
      navegar('/rutinas', { state: { aviso: t.guardada(rutina.nombre) } });
    },
  });

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    const datos = { nombre: nombre.trim(), diaSemana: Number(dia), ejercicioIds: seleccion };
    const resultado = esquemaRutina.safeParse(datos);
    if (!resultado.success) {
      const campos = new Set(resultado.error.issues.map((i) => i.path[0]));
      setErrores({ nombre: campos.has('nombre') ? t.errorNombre : undefined, ejercicios: campos.has('ejercicioIds') ? t.errorEjercicios : undefined });
      (campos.has('nombre') ? campoNombre : buscador).current?.focus();
      return;
    }
    setErrores({});
    mutacion.mutate(datos);
  }

  const error = mutacion.error;
  const aviso = !error ? avisoInicial ?? null : error instanceof ErrorRed ? textos.errores.sinConexion
    : error instanceof ErrorApi && error.status === 404 ? t.errorNoDisponible : t.errorGuardar;

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-6">
      <h1 tabIndex={-1} className="font-display text-4xl font-bold leading-tight text-white focus:outline-none">{titulo}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo ref={campoNombre} etiqueta={t.nombre} value={nombre} maxLength={80} autoComplete="off" error={errores.nombre}
          onChange={(e) => setNombre(e.target.value)} />
        <CampoSeleccion etiqueta={t.dia} value={dia} onChange={(e) => setDia(e.target.value)} opciones={DIAS} />
      </div>
      {catalogo.isPending ? (
        <p role="status" className="flex items-center gap-2 text-slate-300"><IconoCargando className="size-5 motion-safe:animate-spin" />{textos.selector.cargando}</p>
      ) : catalogo.isError ? (
        <div className="flex flex-col gap-3">
          <AvisoError mensaje={catalogo.error instanceof ErrorRed ? textos.errores.sinConexion : textos.errores.generico} />
          <Boton variante="secundario" onClick={() => catalogo.refetch()}>{textos.acceso.reintentar}</Boton>
        </div>
      ) : (
        <EjerciciosRutina catalogo={catalogo.data} seleccion={seleccion} buscador={buscador} error={errores.ejercicios}
          onCambiar={(nueva) => { setSeleccion(nueva); if (nueva.length) setErrores((e) => ({ ...e, ejercicios: undefined })); }} />
      )}
      {aviso && <AvisoError mensaje={aviso} />}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Boton type="submit" cargando={mutacion.isPending} className="flex-1">{mutacion.isPending ? t.guardando : t.guardar}</Boton>
        <Link to="/rutinas" className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center justify-center rounded-xl border border-slate-600 px-5 font-semibold text-white hover:border-slate-400`}>{t.cancelar}</Link>
      </div>
    </form>
  );
}

/** /rutinas/nueva */
export function PaginaNuevaRutina() {
  return <FormularioRutina titulo={t.nueva} guardar={crearRutina} />;
}

/**
 * /rutinas/:id. Ante un 409 se carga la versión vigente del servidor (FR-031: nada se sobrescribe en
 * silencio) y se explica; el formulario se vuelve a montar con ella.
 */
export function PaginaEditarRutina() {
  const { id = '' } = useParams();
  const cliente = useQueryClient();
  const clave = [...CLAVE_RUTINAS, id];
  const [conflicto, setConflicto] = useState(false);
  const rutina = useQuery({ queryKey: clave, queryFn: ({ signal }) => obtenerRutina(id, signal), retry: false });

  if (rutina.isPending) {
    return <p role="status" className="flex items-center gap-2 text-slate-300"><IconoCargando className="size-5 motion-safe:animate-spin" />{t.cargandoEditor}</p>;
  }
  if (rutina.isError) {
    const noExiste = rutina.error instanceof ErrorApi && rutina.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-3">
        <AvisoError mensaje={noExiste ? t.noExiste : rutina.error instanceof ErrorRed ? textos.errores.sinConexion : t.errorCargar} />
        <Link to="/rutinas" className={`${AREA_TACTIL} ${FOCO_VISIBLE} inline-flex items-center rounded-md font-bold text-lime-300 underline decoration-lime-300/40 decoration-2 underline-offset-4`}>{t.volver}</Link>
      </div>
    );
  }

  const actual = rutina.data;
  async function guardar(datos: DatosRutina) {
    try {
      return await actualizarRutina(id, { ...datos, version: actual.version });
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === 'CONFLICTO_VERSION' && error.actual) {
        cliente.setQueryData(clave, error.actual as Rutina);
        setConflicto(true);
      }
      throw error;
    }
  }
  return <FormularioRutina key={actual.version} titulo={t.editarTitulo} inicial={actual} guardar={guardar} avisoInicial={conflicto ? t.conflicto : undefined} />;
}
