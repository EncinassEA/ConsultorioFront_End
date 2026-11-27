import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';

interface CitaOfflinePendiente {
  tempId: number;
  payload: any;
  meta: {
    pacienteNombre: string;
    curpPaciente: string;
    nombreDoctor: string;
    rolDoctor: string;
    colorDoctor: string;
  };
}

interface ConsultaOfflinePendiente {
  tempId: number;
  citaIdOriginal: number | null;
  necesitaCitaExpress: boolean;
  citaExpressPayload: any | null;
  payloadNota: any;
  payloadAlergias: { pacienteId: number; payload: any } | null;
  meta: {
    pacienteNombre: string;
    nombreDoctor: string;
    fechaRegistro: string;
  };
}

@Component({
  selector: 'app-dashboard-clinica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-clinica.component.html',
  styleUrls: ['./dashboard-clinica.component.scss']
})
export class DashboardClinicaComponent implements OnInit, OnDestroy {
  // Configuración persistente de la clínica (nube + respaldo local)
  configClinica = {
    id: 0,
    nombre: 'Clínica Medical Staff',
    logo: '🏥',
    direccion: 'Av. Miguel Alemán 153 Sur, Cd. Obregón',
    telefono: '644 415 3044'
  };

  // Estadísticas del servidor (/api/Admin/estadisticas)
  estadisticasAdmin = {
    totalCitasHoy: 0,
    citasPendientes: 0,
    totalPacientes: 0
  };

  activeTab: string = 'resumen';

  // Modos de visualización (Tarjetas vs Lista)
  vistaPacientes: 'tarjetas' | 'lista' = 'tarjetas';
  vistaInventario: 'tarjetas' | 'lista' = 'tarjetas';
  vistaPersonal: 'tarjetas' | 'lista' = 'tarjetas';

  // Paleta de 10 colores fijos bien diferenciados para la Agenda
  paletaColoresAgenda: string[] = [
    '#2563eb', // Azul
    '#7c3aed', // Morado
    '#059669', // Verde
    '#dc2626', // Rojo
    '#d97706', // Naranja
    '#db2777', // Rosa
    '#0891b2', // Cian
    '#4f46e5', // Índigo
    '#65a30d', // Lima oscuro
    '#475569'  // Gris pizarra
  ];
  doctorFiltroAgenda: number = 0; // 0 = Todos los médicos

  // Usuario/Médico autenticado dinámicamente desde la BD
  doctorActual: any = {
    id: 1,
    nombre: 'Cargando...',
    especialidad: 'Médico Cirujano',
    cedula: 'En trámite',
    rol: 'Doctor',
    iniciales: 'MS',
    colorAgenda: '#2563eb'
  };

  fechaHoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  fechaHoyISO = this.obtenerFechaLocalISO(new Date());

  // Calendario y Agenda
  mesDesplegado = new Date();
  mesActualTitulo: string = '';
  diasCalendario: any[] = [];
  nombresMeses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  fechaFiltroAgenda: string = this.fechaHoyISO;
  citasFiltradasAgenda: any[] = [];
  fechaFiltroHistorial: string = '';

  // Modales
  mostrarModalCita: boolean = false;
  mostrarModalPaciente: boolean = false;
  mostrarModalInventario: boolean = false;
  mostrarModalPersonal: boolean = false;
  mostrarModalDetalleConsulta: boolean = false;
  consultaSeleccionada: any = null;

  // Búsquedas y ordenamiento
  terminoBusquedaPaciente: string = '';
  pacientesFiltrados: any[] = [];
  terminoBusquedaInventario: string = '';
  criterioOrdenInventario: string = 'defecto';
  inventarioFiltrado: any[] = [];

  // Estado de Consulta Activa (Secciones 1 a 5 del Expediente Clínico)
  pacienteEnConsulta: any = null;
  alergiasOriginalesConsulta: string = '';
  historialPacienteActual: any[] = [];
  signosVitales = {
    motivoConsulta: '',
    frecuenciaCardiaca: '',
    frecuenciaRespiratoria: '',
    temperatura: null as number | null,
    saturacionOxigeno: '',
    peso: null as number | null,
    talla: null as number | null,
    imc: null as number | null,
    exploracionFisica: '',
    diagnostico: '',
    codigoCIE10: '',
    planTerapeutico: '',
    recetaMedicamentos: '',
    estudiosAuxiliares: '',
    fechaProximaCita: ''
  };

  // Formularios de Modales (Pacientes, Citas, Inventario, Personal)
  pacienteEditando: any = this.obtenerPacienteVacio();
  nuevaCitaForm: any = {
    pacienteId: 0,
    doctorId: 1,
    fecha: this.fechaHoyISO,
    hora: '09:00',
    motivoConsulta: '',
    notasRecepcion: ''
  };
  productoEditando: any = {
    id: 0,
    nombre: '',
    cantidad: null,
    unidadMedida: 'Piezas',
    fechaCaducidad: '',
    fechaRegistro: ''
  };
  personalEditando: any = this.obtenerPersonalVacio();

  // Listas de datos (nube + mezcla offline)
  private citasServidor: any[] = [];
  private notasServidor: any[] = [];
  todasLasCitas: any[] = [];
  citasDeHoy: any[] = [];
  directorioPacientes: any[] = [];
  consultasRealizadas: any[] = [];
  consultasFiltradas: any[] = [];
  inventario: any[] = [];
  listaPersonal: any[] = [];
  listaDoctores: any[] = [];

  consultasDeHoy: number = 0;
  inventarioCritico: number = 0;

  // ================= PWA / MODO OFFLINE =================
  private readonly KEY_CACHE = 'cache_dashboard_medical_staff';
  private readonly KEY_COLA_CITAS = 'cola_offline_citas_ms';
  private readonly KEY_COLA_CONSULTAS = 'cola_offline_consultas_ms';

  colaCitasOffline: CitaOfflinePendiente[] = [];
  colaConsultasOffline: ConsultaOfflinePendiente[] = [];
  isOffline: boolean = !navigator.onLine;
  sincronizando: boolean = false;

  private readonly onOfflineHandler = () => {
    this.isOffline = true;
  };

  private readonly onOnlineHandler = () => {
    this.isOffline = false;
    if (this.totalPendientesSync > 0) {
      this.sincronizarPendientes();
    } else {
      this.cargarDatosReales();
    }
  };

  // URLs Oficiales del Backend ASP.NET Core (.NET 8)
  private apiBase = 'https://localhost:7290/api';
  apiUsuarios = `${this.apiBase}/Usuarios`;
  apiPacientes = `${this.apiBase}/Pacientes`;
  apiCitas = `${this.apiBase}/Citas`;
  apiNotas = `${this.apiBase}/NotasMedicas`;
  apiInsumos = `${this.apiBase}/Insumos`;
  apiClinicas = `${this.apiBase}/Clinicas`;
  apiAdmin = `${this.apiBase}/Admin`;

  constructor(private http: HttpClient, private router: Router) {}

  get totalPendientesSync(): number {
    return this.colaCitasOffline.length + this.colaConsultasOffline.length;
  }

  ngOnInit() {
    if (!localStorage.getItem('token_medical_staff')) {
      this.router.navigate(['/']);
      return;
    }

    const configGuardada = localStorage.getItem('config_clinica_medical_staff');
    if (configGuardada) {
      try {
        this.configClinica = { ...this.configClinica, ...JSON.parse(configGuardada) };
      } catch {
        localStorage.removeItem('config_clinica_medical_staff');
      }
    }

    this.cargarColasOffline();
    this.cargarCacheLocal();

    window.addEventListener('offline', this.onOfflineHandler);
    window.addEventListener('online', this.onOnlineHandler);

    if (!this.isOffline && this.totalPendientesSync > 0) {
      this.sincronizarPendientes();
    } else {
      this.cargarDatosReales();
    }
  }

  ngOnDestroy() {
    window.removeEventListener('offline', this.onOfflineHandler);
    window.removeEventListener('online', this.onOnlineHandler);
  }

  // ================= GESTIÓN DE CACHÉ Y COLAS OFFLINE =================
  private cargarColasOffline() {
    try {
      this.colaCitasOffline = JSON.parse(localStorage.getItem(this.KEY_COLA_CITAS) || '[]');
    } catch {
      this.colaCitasOffline = [];
    }
    try {
      this.colaConsultasOffline = JSON.parse(localStorage.getItem(this.KEY_COLA_CONSULTAS) || '[]');
    } catch {
      this.colaConsultasOffline = [];
    }
  }

  private guardarColasOffline() {
    localStorage.setItem(this.KEY_COLA_CITAS, JSON.stringify(this.colaCitasOffline));
    localStorage.setItem(this.KEY_COLA_CONSULTAS, JSON.stringify(this.colaConsultasOffline));
  }

  private actualizarCacheLocal(parcial: Record<string, any>) {
    try {
      const actual = JSON.parse(localStorage.getItem(this.KEY_CACHE) || '{}');
      localStorage.setItem(this.KEY_CACHE, JSON.stringify({ ...actual, ...parcial }));
    } catch {
      // Si el almacenamiento local está lleno, no interrumpe el flujo
    }
  }

  private cargarCacheLocal() {
    try {
      const cache = JSON.parse(localStorage.getItem(this.KEY_CACHE) || '{}');
      if (cache.stats) this.estadisticasAdmin = cache.stats;
      if (Array.isArray(cache.usuarios) && cache.usuarios.length) {
        this.procesarUsuarios(cache.usuarios);
      }
      if (Array.isArray(cache.pacientes)) {
        this.procesarPacientes(cache.pacientes);
      }
      if (Array.isArray(cache.insumos)) {
        this.procesarInventario(cache.insumos);
      }
      if (Array.isArray(cache.citas)) {
        this.citasServidor = cache.citas;
      }
      if (Array.isArray(cache.notas)) {
        this.notasServidor = cache.notas;
      }
      this.combinarCitasConOffline();
      this.combinarNotasConOffline();
    } catch {
      // Sin caché previo
    }
  }

  private combinarCitasConOffline() {
    const citasCompletadasOffline = new Set(
      this.colaConsultasOffline
        .map(q => q.citaIdOriginal)
        .filter((id): id is number => id !== null && id !== undefined)
    );

    const mapeadasServidor = this.citasServidor.map(cita => ({
      ...cita,
      estado: citasCompletadasOffline.has(Number(cita.id)) ? 'Completada' : cita.estado,
      fechaHoraSegura: cita.fechaHora,
      fechaLocalISO: this.obtenerFechaLocalISO(cita.fechaHora),
      pacienteNombre: cita.nombrePaciente || 'Paciente',
      motivo: cita.motivoConsulta || 'Consulta general',
      colorDoctor: this.obtenerColorDoctor(cita.doctorId, cita.colorDoctor),
      pendienteSync: false
    }));

    const mapeadasOffline = this.colaCitasOffline.map(item => ({
      id: item.tempId,
      folio: 'PENDIENTE',
      pacienteId: item.payload.pacienteId,
      nombrePaciente: item.meta.pacienteNombre,
      curpPaciente: item.meta.curpPaciente,
      doctorId: item.payload.doctorId,
      nombreDoctor: item.meta.nombreDoctor,
      rolDoctor: item.meta.rolDoctor,
      colorDoctor: this.obtenerColorDoctor(item.payload.doctorId, item.meta.colorDoctor),
      fechaHora: item.payload.fechaHora,
      fechaHoraSegura: item.payload.fechaHora,
      fechaLocalISO: this.obtenerFechaLocalISO(item.payload.fechaHora),
      pacienteNombre: item.meta.pacienteNombre,
      motivoConsulta: item.payload.motivoConsulta,
      motivo: item.payload.motivoConsulta || 'Consulta general',
      estado: citasCompletadasOffline.has(item.tempId) ? 'Completada' : (item.payload.estado || 'Agendada'),
      notasRecepcion: item.payload.notasRecepcion,
      pendienteSync: true
    }));

    this.todasLasCitas = [...mapeadasServidor, ...mapeadasOffline].sort(
      (a, b) => new Date(a.fechaHoraSegura).getTime() - new Date(b.fechaHoraSegura).getTime()
    );

    this.citasDeHoy = this.todasLasCitas.filter(
      c => c.fechaLocalISO === this.fechaHoyISO
    );
    this.filtrarAgendaPorDia(this.fechaFiltroAgenda);
    this.generarCalendario();
  }

  private combinarNotasConOffline() {
    const mapeadasServidor = this.notasServidor.map(nota => ({
      ...nota,
      pacienteNombre: nota.nombrePaciente,
      fechaConsultaSegura: nota.fechaRegistro,
      fechaLocalISO: this.obtenerFechaLocalISO(nota.fechaRegistro),
      pendienteSync: false
    }));

    const mapeadasOffline = this.colaConsultasOffline.map(item => ({
      id: item.tempId,
      ...item.payloadNota,
      nombrePaciente: item.meta.pacienteNombre,
      pacienteNombre: item.meta.pacienteNombre,
      nombreDoctor: item.meta.nombreDoctor,
      fechaRegistro: item.meta.fechaRegistro,
      fechaConsultaSegura: item.meta.fechaRegistro,
      fechaLocalISO: this.obtenerFechaLocalISO(item.meta.fechaRegistro),
      pendienteSync: true
    }));

    this.consultasRealizadas = [...mapeadasOffline, ...mapeadasServidor].sort(
      (a, b) => new Date(b.fechaConsultaSegura).getTime() - new Date(a.fechaConsultaSegura).getTime()
    );

    this.consultasDeHoy = this.consultasRealizadas.filter(
      c => c.fechaLocalISO === this.fechaHoyISO
    ).length;
    this.filtrarHistorial(this.fechaFiltroHistorial);
  }

  manejarClickSincronizacion() {
    if (this.isOffline || !navigator.onLine) {
      this.isOffline = !navigator.onLine;
      if (this.isOffline) {
        Swal.fire(
          'Sin conexión a internet',
          this.totalPendientesSync > 0
            ? `Tienes ${this.totalPendientesSync} registro(s) guardados en este dispositivo. Se subirán automáticamente en cuanto regrese la conexión.`
            : 'Puedes seguir agendando citas y realizando consultas. Todo se guardará en este dispositivo hasta que vuelva el internet.',
          'info'
        );
        return;
      }
    }

    if (this.totalPendientesSync > 0) {
      this.sincronizarPendientes();
    } else {
      this.cargarDatosReales();
    }
  }

  async sincronizarPendientes() {
    if (this.sincronizando || this.isOffline || !navigator.onLine || this.totalPendientesSync === 0) {
      return;
    }

    this.sincronizando = true;
    let subidos = 0;
    let errores = 0;
    const mapaCitasIds = new Map<number, number>();

    // 1. Subir primero las citas pendientes (para obtener sus IDs reales)
    const citasPendientesCopia = [...this.colaCitasOffline];
    for (const item of citasPendientesCopia) {
      try {
        const citaCreada: any = await firstValueFrom(this.http.post(this.apiCitas, item.payload));
        if (citaCreada?.id) {
          mapaCitasIds.set(item.tempId, citaCreada.id);
        }
        this.colaCitasOffline = this.colaCitasOffline.filter(c => c.tempId !== item.tempId);
        this.guardarColasOffline();
        subidos++;
      } catch (err: any) {
        if (err?.status === 0) {
          this.isOffline = true;
          break;
        }
        errores++;
      }
    }

    // 2. Subir las consultas médicas pendientes
    if (!this.isOffline) {
      const consultasPendientesCopia = [...this.colaConsultasOffline];
      for (const item of consultasPendientesCopia) {
        try {
          if (item.payloadAlergias) {
            try {
              await firstValueFrom(
                this.http.put(`${this.apiPacientes}/${item.payloadAlergias.pacienteId}`, item.payloadAlergias.payload)
              );
            } catch {
              // No bloquea la subida de la nota médica
            }
          }

          let citaIdReal = item.citaIdOriginal;

          if (item.necesitaCitaExpress && item.citaExpressPayload) {
            const citaExpressCreada: any = await firstValueFrom(
              this.http.post(this.apiCitas, item.citaExpressPayload)
            );
            citaIdReal = citaExpressCreada.id;
          } else if (citaIdReal !== null && citaIdReal < 0) {
            const idMapeado = mapaCitasIds.get(citaIdReal);
            if (!idMapeado) {
              errores++;
              continue;
            }
            citaIdReal = idMapeado;
          }

          const payloadNotaFinal = {
            ...item.payloadNota,
            citaId: Number(citaIdReal)
          };

          await firstValueFrom(this.http.post(this.apiNotas, payloadNotaFinal));
          this.colaConsultasOffline = this.colaConsultasOffline.filter(q => q.tempId !== item.tempId);
          this.guardarColasOffline();
          subidos++;
        } catch (err: any) {
          if (err?.status === 0) {
            this.isOffline = true;
            break;
          }
          errores++;
        }
      }
    }

    this.sincronizando = false;

    if (subidos > 0) {
      Swal.fire({
        title: '☁️ Datos sincronizados',
        text: errores > 0
          ? `Se subieron ${subidos} registro(s) a la nube. ${errores} quedaron pendientes por revisar.`
          : `Se subieron ${subidos} registro(s) guardados sin conexión a la nube.`,
        icon: errores > 0 ? 'warning' : 'success',
        timer: 2600,
        showConfirmButton: false
      });
    }

    if (!this.isOffline) {
      this.cargarDatosReales();
    } else {
      this.combinarCitasConOffline();
      this.combinarNotasConOffline();
    }
  }

  private esErrorDeRed(err: any): boolean {
    return this.isOffline || !navigator.onLine || err?.status === 0;
  }

  // --- UTILIDADES DE FECHA LOCAL, COLORES Y MENSAJES DE ERROR ---
  obtenerColorDoctor(doctorId: number, colorDesdeCita?: string | null): string {
    if (colorDesdeCita && colorDesdeCita.trim().length > 0) {
      return colorDesdeCita.trim();
    }
    const medico = this.listaPersonal.find(u => Number(u.id) === Number(doctorId));
    if (medico?.colorAgenda) {
      return medico.colorAgenda;
    }
    const indice = Math.abs(Number(doctorId) || 0) % this.paletaColoresAgenda.length;
    return this.paletaColoresAgenda[indice];
  }

  obtenerFechaLocalISO(valor: Date | string | null | undefined): string {
    if (!valor) return '';
    if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
      return valor.trim();
    }
    const fecha = valor instanceof Date ? valor : new Date(valor);
    if (isNaN(fecha.getTime())) return '';
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  construirFechaSoloDiaISO(fechaYMD: string | null | undefined): string | null {
    if (!fechaYMD) return null;
    const limpia = fechaYMD.substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return null;
    return `${limpia}T12:00:00.000Z`;
  }

  extraerMensajeError(err: any, mensajePorDefecto: string): string {
    if (!err) return mensajePorDefecto;
    if (typeof err.error === 'string' && err.error.trim().length > 0) {
      return err.error.replace(/^"|"$/g, '');
    }
    if (err.error?.errors) {
      return Object.values(err.error.errors).flat().join(' | ');
    }
    if (err.error?.mensaje) return err.error.mensaje;
    if (err.error?.title) return err.error.title;
    return mensajePorDefecto;
  }

  obtenerPacienteVacio() {
    return {
      id: 0,
      fotoUrl: '',
      nombre: '',
      apellidos: '',
      curp: '',
      sexo: 'Masculino',
      fechaNacimiento: '',
      direccion: '',
      telefono: '',
      contactoEmergencia: '',
      antecedentesHeredoFamiliares: '',
      antecedentesPatologicos: '',
      alergias: 'Ninguna',
      antecedentesNoPatologicos: '',
      fechaRegistro: ''
    };
  }

  obtenerPersonalVacio() {
    const coloresEnUso = new Set(
      (this.listaPersonal || []).map(u => (u.colorAgenda || '').toLowerCase())
    );
    const colorDisponible = this.paletaColoresAgenda
      ? (this.paletaColoresAgenda.find(c => !coloresEnUso.has(c.toLowerCase())) ||
         this.paletaColoresAgenda[(this.listaPersonal?.length || 0) % this.paletaColoresAgenda.length])
      : '#2563eb';

    return {
      id: 0,
      nombre: '',
      correo: '',
      password: '',
      rol: 'Doctor',
      estado: 'Activo',
      colorAgenda: colorDisponible,
      telefono: '',
      estudios: 'Médico Cirujano',
      universidadEgreso: '',
      cedulaProfesional: '',
      cedulaEspecialidad: '',
      tarifaConsulta: 800
    };
  }

  calcularEdad(fechaNacimientoStr: string): number {
    if (!fechaNacimientoStr) return 0;
    const partes = fechaNacimientoStr.substring(0, 10).split('-').map(Number);
    if (partes.length !== 3 || partes.some(isNaN)) return 0;

    const hoy = new Date();
    const cumple = new Date(partes[0], partes[1] - 1, partes[2]);
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
      edad--;
    }
    return edad >= 0 ? edad : 0;
  }

  calcularIMC() {
    const peso = Number(this.signosVitales.peso);
    const talla = Number(this.signosVitales.talla);
    if (peso > 0 && talla > 0) {
      const tallaMetros = talla > 3 ? talla / 100 : talla;
      this.signosVitales.imc = Number((peso / (tallaMetros * tallaMetros)).toFixed(2));
    } else {
      this.signosVitales.imc = null;
    }
  }

  // --- PROCESADORES DE LISTAS ---
  private procesarUsuarios(usuarios: any[]) {
    this.listaPersonal = usuarios.map((u, idx) => ({
      ...u,
      colorAgenda: u.colorAgenda || this.paletaColoresAgenda[idx % this.paletaColoresAgenda.length]
    }));

    const doctoresActivos = this.listaPersonal.filter(
      u => u.rol?.toLowerCase() === 'doctor' && u.estado !== 'Suspendido'
    );
    this.listaDoctores = doctoresActivos.length > 0
      ? doctoresActivos
      : this.listaPersonal.filter(u => u.estado !== 'Suspendido');

    const correoLogueado = (localStorage.getItem('correo_usuario') || '').trim().toLowerCase();
    const usuarioActivo =
      this.listaPersonal.find(u => (u.correo || '').trim().toLowerCase() === correoLogueado) ||
      this.listaDoctores[0] ||
      this.listaPersonal[0];

    if (usuarioActivo) {
      const partes = (usuarioActivo.nombre || 'MS').trim().split(/\s+/);
      const iniciales = partes.length > 1
        ? (partes[0][0] + partes[1][0]).toUpperCase()
        : partes[0].substring(0, 2).toUpperCase();
      this.doctorActual = {
        id: usuarioActivo.id,
        nombre: usuarioActivo.nombre,
        especialidad: usuarioActivo.estudios || usuarioActivo.rol,
        cedula: usuarioActivo.cedulaProfesional ? `CED. PROF: ${usuarioActivo.cedulaProfesional}` : 'Personal Autorizado',
        rol: usuarioActivo.rol,
        iniciales: iniciales,
        colorAgenda: usuarioActivo.colorAgenda || '#2563eb'
      };
      this.nuevaCitaForm.doctorId = usuarioActivo.id;
    }
  }

  private procesarPacientes(res: any[]) {
    this.directorioPacientes = res.map(p => {
      const fechaLimpia = p.fechaNacimiento ? String(p.fechaNacimiento).substring(0, 10) : '';
      return {
        ...p,
        nombreCompleto: `${p.nombre || ''} ${p.apellidos || ''}`.trim(),
        fechaNacimiento: fechaLimpia,
        edad: this.calcularEdad(fechaLimpia),
        alergias: p.alergias || 'Ninguna'
      };
    });
    this.filtrarPacientes();
  }

  private procesarInventario(res: any[]) {
    this.inventario = res.map(i => ({
      ...i,
      nombreProducto: i.nombre,
      unidad: i.unidadMedida || 'Piezas',
      estado: i.cantidad < 10 ? 'Crítico' : (i.estado || 'Óptimo')
    }));
    this.inventarioCritico = this.inventario.filter(i => i.cantidad < 10).length;
    this.aplicarFiltrosInventario();
  }

  // --- CARGA DE DATOS (NUBE + RESPALDO OFFLINE) ---
  cargarDatosReales() {
    this.fechaHoyISO = this.obtenerFechaLocalISO(new Date());

    if (this.isOffline || !navigator.onLine) {
      this.isOffline = true;
      this.cargarCacheLocal();
      return;
    }

    // 1. Configuración de la Clínica
    this.http.get<any[]>(this.apiClinicas).subscribe({
      next: (clinicas) => {
        if (clinicas && clinicas.length > 0) {
          const c = clinicas[0];
          this.configClinica = {
            id: c.id,
            nombre: c.nombre || 'Clínica Medical Staff',
            logo: c.logo || '🏥',
            direccion: c.direccion || 'Av. Miguel Alemán 153 Sur, Cd. Obregón',
            telefono: c.telefono || '644 415 3044'
          };
          localStorage.setItem('config_clinica_medical_staff', JSON.stringify(this.configClinica));
        }
      },
      error: (err) => {
        if (err?.status === 0) this.isOffline = true;
      }
    });

    // 2. Estadísticas
    this.http.get<any>(`${this.apiAdmin}/estadisticas`).subscribe({
      next: (stats) => {
        if (stats) {
          this.estadisticasAdmin = {
            totalCitasHoy: stats.totalCitasHoy ?? 0,
            citasPendientes: stats.citasPendientes ?? 0,
            totalPacientes: stats.totalPacientes ?? 0
          };
          this.actualizarCacheLocal({ stats: this.estadisticasAdmin });
        }
      },
      error: () => {}
    });

    // 3. Usuarios
    this.http.get<any[]>(this.apiUsuarios).subscribe({
      next: (usuarios) => {
        this.procesarUsuarios(usuarios);
        this.actualizarCacheLocal({ usuarios });
      },
      error: (err) => {
        if (err.status === 401) this.cerrarSesion();
        if (err.status === 0) this.isOffline = true;
      }
    });

    // 4. Pacientes
    this.http.get<any[]>(this.apiPacientes).subscribe({
      next: (res) => {
        this.procesarPacientes(res);
        this.actualizarCacheLocal({ pacientes: res });
        this.cargarCitas();
        this.cargarHistorialConsultas();
      },
      error: (err) => {
        if (err.status === 0) {
          this.isOffline = true;
          this.cargarCacheLocal();
        }
      }
    });

    // 5. Inventario
    this.http.get<any[]>(this.apiInsumos).subscribe({
      next: (res) => {
        this.procesarInventario(res);
        this.actualizarCacheLocal({ insumos: res });
      },
      error: () => {}
    });
  }

  cargarCitas() {
    this.http.get<any[]>(this.apiCitas).subscribe({
      next: (res) => {
        this.citasServidor = res;
        this.actualizarCacheLocal({ citas: res });
        this.combinarCitasConOffline();
      },
      error: (err) => {
        if (err.status === 0) {
          this.isOffline = true;
          this.combinarCitasConOffline();
        }
      }
    });
  }

  cargarHistorialConsultas() {
    this.http.get<any[]>(this.apiNotas).subscribe({
      next: (res) => {
        this.notasServidor = res;
        this.actualizarCacheLocal({ notas: res });
        this.combinarNotasConOffline();
      },
      error: (err) => {
        if (err.status === 0) {
          this.isOffline = true;
          this.combinarNotasConOffline();
        }
      }
    });
  }

  cambiarPestana(pestana: string) {
    this.activeTab = pestana;
    this.pacienteEnConsulta = null;
    if (!this.isOffline && navigator.onLine) {
      this.cargarDatosReales();
    } else {
      this.combinarCitasConOffline();
      this.combinarNotasConOffline();
    }
  }

  abrirPerfilClinica() {
    const idClinica = this.configClinica?.id > 0 ? this.configClinica.id : 1;
    this.router.navigate(['/clinica', idClinica]);
  }

  cerrarSesion() {
    localStorage.removeItem('token_medical_staff');
    localStorage.removeItem('correo_usuario');
    this.router.navigate(['/']);
  }

  // --- FILTROS DE AGENDA (POR DÍA Y POR DOCTOR) E HISTORIAL ---
  seleccionarDoctorAgenda(doctorId: number) {
    this.doctorFiltroAgenda = doctorId;
    this.filtrarAgendaPorDia(this.fechaFiltroAgenda);
    this.generarCalendario();
  }

  filtrarAgendaPorDia(fecha: string) {
    this.fechaFiltroAgenda = fecha;
    this.citasFiltradasAgenda = this.todasLasCitas.filter(
      c =>
        c.fechaLocalISO === fecha &&
        (this.doctorFiltroAgenda === 0 || Number(c.doctorId) === Number(this.doctorFiltroAgenda))
    );
  }

  filtrarHistorial(fechaBuscada: string) {
    this.fechaFiltroHistorial = fechaBuscada;
    this.consultasFiltradas = !fechaBuscada
      ? [...this.consultasRealizadas]
      : this.consultasRealizadas.filter(c => c.fechaLocalISO === fechaBuscada);
  }

  abrirDetalleConsulta(consulta: any) {
    this.consultaSeleccionada = consulta;
    this.mostrarModalDetalleConsulta = true;
  }

  exportarHistorialCSV() {
    if (!this.consultasFiltradas.length) {
      Swal.fire('Sin datos', 'No hay consultas para exportar.', 'info');
      return;
    }
    const encabezados = ['ID,Fecha,EstadoSync,Paciente,Medico,Motivo,Diagnostico,CIE10,PlanTerapeutico'];
    const filas = this.consultasFiltradas.map(c =>
      `${c.id},"${new Date(c.fechaConsultaSegura).toLocaleDateString()}","${c.pendienteSync ? 'Pendiente de subir' : 'Sincronizado'}","${c.pacienteNombre}","${c.nombreDoctor || ''}","${(c.motivoConsulta || '').replace(/"/g, '""')}","${(c.diagnostico || '').replace(/"/g, '""')}","${c.codigoCIE10 || ''}","${(c.planTerapeutico || '').replace(/"/g, '""')}"`
    );
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encabezados.concat(filas).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Historial_Clinico_${this.fechaHoyISO}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- CRUD PACIENTES (CON EXPEDIENTE NOM-004 COMPLETO) ---
  filtrarPacientes() {
    const t = this.terminoBusquedaPaciente.toLowerCase().trim();
    this.pacientesFiltrados = !t
      ? [...this.directorioPacientes]
      : this.directorioPacientes.filter(
          p =>
            p.nombreCompleto.toLowerCase().includes(t) ||
            (p.curp && p.curp.toLowerCase().includes(t)) ||
            (p.telefono && p.telefono.includes(t))
        );
  }

  abrirModalNuevoPaciente() {
    this.pacienteEditando = this.obtenerPacienteVacio();
    this.mostrarModalPaciente = true;
  }

  abrirModalEditarPaciente(paciente: any) {
    this.pacienteEditando = { ...paciente };
    this.mostrarModalPaciente = true;
  }

  guardarPacienteManual() {
    if (!this.pacienteEditando.nombre || !this.pacienteEditando.apellidos || !this.pacienteEditando.curp) {
      Swal.fire('Campos Obligatorios', 'Nombre, Apellidos y CURP son requeridos por normativa clínica.', 'warning');
      return;
    }

    const telefonoLimpio = (this.pacienteEditando.telefono || '').replace(/[\s-]/g, '');
    if (telefonoLimpio && !/^\d{10}$/.test(telefonoLimpio)) {
      Swal.fire('Teléfono Inválido', 'Si ingresas teléfono, debe contener exactamente 10 dígitos numéricos.', 'warning');
      return;
    }

    const payload: any = {
      id: this.pacienteEditando.id || 0,
      fotoUrl: this.pacienteEditando.fotoUrl || null,
      nombre: this.pacienteEditando.nombre.trim(),
      apellidos: this.pacienteEditando.apellidos.trim(),
      curp: this.pacienteEditando.curp.toUpperCase().trim(),
      sexo: this.pacienteEditando.sexo || 'No especificado',
      fechaNacimiento: this.construirFechaSoloDiaISO(this.pacienteEditando.fechaNacimiento),
      direccion: this.pacienteEditando.direccion || null,
      telefono: telefonoLimpio || null,
      contactoEmergencia: this.pacienteEditando.contactoEmergencia || null,
      antecedentesHeredoFamiliares: this.pacienteEditando.antecedentesHeredoFamiliares || 'Negados',
      antecedentesPatologicos: this.pacienteEditando.antecedentesPatologicos || 'Negados',
      alergias: this.pacienteEditando.alergias || 'Ninguna',
      antecedentesNoPatologicos: this.pacienteEditando.antecedentesNoPatologicos || 'Negados'
    };

    if (this.pacienteEditando.id && this.pacienteEditando.id > 0) {
      if (this.pacienteEditando.fechaRegistro) {
        payload.fechaRegistro = this.pacienteEditando.fechaRegistro;
      }
      this.http.put(`${this.apiPacientes}/${this.pacienteEditando.id}`, payload).subscribe({
        next: () => {
          this.mostrarModalPaciente = false;
          Swal.fire({ title: 'Expediente Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo actualizar el paciente.'), 'error')
      });
    } else {
      delete payload.id;
      this.http.post(this.apiPacientes, payload).subscribe({
        next: () => {
          this.mostrarModalPaciente = false;
          Swal.fire({ title: 'Paciente Registrado', icon: 'success', timer: 1500, showConfirmButton: false });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'Verifica que los campos obligatorios estén correctos.'), 'error')
      });
    }
  }

  borrarPaciente(id: number) {
    Swal.fire({
      title: '¿Eliminar expediente?',
      text: 'Esta acción borrará al paciente del directorio.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Sí, eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        this.http.delete(`${this.apiPacientes}/${id}`).subscribe({
          next: () => {
            Swal.fire({ title: 'Eliminado', icon: 'success', timer: 1000, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => Swal.fire('No permitido', this.extraerMensajeError(err, 'El paciente tiene citas o notas médicas asociadas.'), 'error')
        });
      }
    });
  }

  // --- CRUD CITAS (CON SOPORTE OFFLINE PWA) ---
  abrirModalAgendarCita() {
    this.nuevaCitaForm = {
      pacienteId: this.directorioPacientes.length ? this.directorioPacientes[0].id : 0,
      doctorId: this.doctorFiltroAgenda > 0
        ? this.doctorFiltroAgenda
        : (this.listaDoctores.length ? this.listaDoctores[0].id : (this.doctorActual.id || 1)),
      fecha: this.fechaFiltroAgenda || this.fechaHoyISO,
      hora: '10:00',
      motivoConsulta: '',
      notasRecepcion: ''
    };
    this.mostrarModalCita = true;
  }

  private encolarCitaOffline(payloadCita: any, mostrarAlerta: boolean = true): number {
    const pac = this.directorioPacientes.find(p => Number(p.id) === Number(payloadCita.pacienteId));
    const doc = this.listaPersonal.find(u => Number(u.id) === Number(payloadCita.doctorId));
    const tempId = -Date.now() - Math.floor(Math.random() * 1000);

    const pendiente: CitaOfflinePendiente = {
      tempId,
      payload: payloadCita,
      meta: {
        pacienteNombre: pac?.nombreCompleto || 'Paciente',
        curpPaciente: pac?.curp || '',
        nombreDoctor: doc?.nombre || this.doctorActual.nombre,
        rolDoctor: doc?.rol || 'Doctor',
        colorDoctor: this.obtenerColorDoctor(payloadCita.doctorId, doc?.colorAgenda)
      }
    };

    this.colaCitasOffline.push(pendiente);
    this.guardarColasOffline();
    this.combinarCitasConOffline();

    if (mostrarAlerta) {
      this.mostrarModalCita = false;
      Swal.fire({
        title: '⏳ Cita guardada sin conexión',
        text: 'Se agregó a tu agenda local y se subirá automáticamente en cuanto vuelva el internet.',
        icon: 'info',
        timer: 2600,
        showConfirmButton: false
      });
    }

    return tempId;
  }

  guardarNuevaCita() {
    if (!this.nuevaCitaForm.pacienteId || !this.nuevaCitaForm.fecha || !this.nuevaCitaForm.motivoConsulta) {
      Swal.fire('Datos incompletos', 'Selecciona un paciente, fecha y motivo de consulta.', 'warning');
      return;
    }

    const fechaHoraISO = new Date(`${this.nuevaCitaForm.fecha}T${this.nuevaCitaForm.hora || '09:00'}:00`).toISOString();

    const payloadCita = {
      pacienteId: Number(this.nuevaCitaForm.pacienteId),
      doctorId: Number(this.nuevaCitaForm.doctorId),
      fechaHora: fechaHoraISO,
      motivoConsulta: this.nuevaCitaForm.motivoConsulta.trim(),
      estado: 'Agendada',
      notasRecepcion: this.nuevaCitaForm.notasRecepcion || 'Agendada desde panel'
    };

    if (this.isOffline || !navigator.onLine) {
      this.isOffline = true;
      this.encolarCitaOffline(payloadCita, true);
      return;
    }

    this.http.post(this.apiCitas, payloadCita).subscribe({
      next: () => {
        this.mostrarModalCita = false;
        Swal.fire({ title: 'Cita Agendada', icon: 'success', timer: 1500, showConfirmButton: false });
        this.cargarDatosReales();
      },
      error: (err) => {
        if (this.esErrorDeRed(err)) {
          this.isOffline = true;
          this.encolarCitaOffline(payloadCita, true);
        } else {
          Swal.fire('No se pudo agendar', this.extraerMensajeError(err, 'No se pudo registrar la cita.'), 'error');
        }
      }
    });
  }

  cancelarCita(cita: any) {
    if (cita.pendienteSync) {
      this.eliminarCita(cita.id);
      return;
    }

    Swal.fire({
      title: '¿Cancelar esta cita?',
      text: `Paciente: ${cita.pacienteNombre}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d97706',
      confirmButtonText: 'Sí, cancelar cita'
    }).then(r => {
      if (r.isConfirmed) {
        const payload = {
          id: cita.id,
          folio: cita.folio || null,
          pacienteId: cita.pacienteId,
          doctorId: cita.doctorId,
          fechaHora: cita.fechaHora,
          motivoConsulta: cita.motivoConsulta || null,
          estado: 'Cancelada',
          notasRecepcion: cita.notasRecepcion || null
        };
        this.http.put(`${this.apiCitas}/${cita.id}`, payload).subscribe({
          next: () => {
            Swal.fire({ title: 'Cita Cancelada', icon: 'success', timer: 1200, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo cancelar la cita.'), 'error')
        });
      }
    });
  }

  eliminarCita(id: number) {
    Swal.fire({
      title: '¿Eliminar cita?',
      text: id < 0 ? 'Se eliminará esta cita local pendiente de subir.' : 'Se eliminará permanentemente de la agenda.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        if (id < 0) {
          this.colaCitasOffline = this.colaCitasOffline.filter(c => c.tempId !== id);
          this.guardarColasOffline();
          this.combinarCitasConOffline();
          Swal.fire({ title: 'Cita local eliminada', icon: 'success', timer: 1000, showConfirmButton: false });
          return;
        }

        this.http.delete(`${this.apiCitas}/${id}`).subscribe({
          next: () => {
            Swal.fire({ title: 'Cita Eliminada', icon: 'success', timer: 1000, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo eliminar la cita.'), 'error')
        });
      }
    });
  }

  // --- CONSULTA MÉDICA Y EXPEDIENTE CLÍNICO (CON SOPORTE OFFLINE PWA) ---
  limpiarSignosVitales(motivoPorDefecto: string = '') {
    this.signosVitales = {
      motivoConsulta: motivoPorDefecto,
      frecuenciaCardiaca: '80 lpm',
      frecuenciaRespiratoria: '18 rpm',
      temperatura: 36.6,
      saturacionOxigeno: '98%',
      peso: null,
      talla: null,
      imc: null,
      exploracionFisica: '',
      diagnostico: '',
      codigoCIE10: '',
      planTerapeutico: '',
      recetaMedicamentos: '',
      estudiosAuxiliares: '',
      fechaProximaCita: ''
    };
  }

  private cargarHistorialPacienteEnConsulta(pacienteId: number) {
    if (this.isOffline || !navigator.onLine) {
      this.historialPacienteActual = this.consultasRealizadas.filter(
        c => Number(c.pacienteId) === Number(pacienteId)
      );
      return;
    }

    this.http.get<any[]>(`${this.apiNotas}/historial/${pacienteId}`).subscribe({
      next: (notas) => {
        const remotas = notas.map(n => ({
          ...n,
          pacienteNombre: n.nombrePaciente,
          fechaConsultaSegura: n.fechaRegistro,
          pendienteSync: false
        }));
        const locales = this.consultasRealizadas.filter(
          c => c.pendienteSync && Number(c.pacienteId) === Number(pacienteId)
        );
        this.historialPacienteActual = [...locales, ...remotas];
      },
      error: () => {
        this.historialPacienteActual = this.consultasRealizadas.filter(
          c => Number(c.pacienteId) === Number(pacienteId)
        );
      }
    });
  }

  iniciarConsultaDesdeCita(cita: any) {
    if (cita.estado === 'Completada') {
      Swal.fire('Cita ya atendida', 'Esta cita ya tiene una nota médica registrada en el historial.', 'info');
      return;
    }
    if (cita.estado === 'Cancelada') {
      Swal.fire('Cita cancelada', 'No se puede iniciar consulta en una cita cancelada.', 'warning');
      return;
    }

    const pac = this.directorioPacientes.find(p => Number(p.id) === Number(cita.pacienteId));
    if (pac) {
      this.pacienteEnConsulta = { ...pac, citaIdActiva: cita.id };
      this.alergiasOriginalesConsulta = pac.alergias || 'Ninguna';
      this.cargarHistorialPacienteEnConsulta(pac.id);
      this.limpiarSignosVitales(cita.motivoConsulta || cita.motivo || 'Consulta programada');
      this.activeTab = 'consulta';
    } else {
      Swal.fire('Aviso', 'No se encontró el expediente base del paciente.', 'warning');
    }
  }

  iniciarConsultaDesdePaciente(pac: any) {
    this.pacienteEnConsulta = { ...pac, citaIdActiva: null };
    this.alergiasOriginalesConsulta = pac.alergias || 'Ninguna';
    this.cargarHistorialPacienteEnConsulta(pac.id);
    this.limpiarSignosVitales('Revisión médica general');
    this.activeTab = 'consulta';
  }

  terminarConsulta() {
    this.pacienteEnConsulta = null;
  }

  private construirPayloadAlergiasSiCambio(): { pacienteId: number; payload: any } | null {
    const alergiasActuales = (this.pacienteEnConsulta.alergias || 'Ninguna').trim();
    if (alergiasActuales === this.alergiasOriginalesConsulta) {
      return null;
    }
    const payloadPac: any = {
      id: this.pacienteEnConsulta.id,
      fotoUrl: this.pacienteEnConsulta.fotoUrl || null,
      nombre: this.pacienteEnConsulta.nombre,
      apellidos: this.pacienteEnConsulta.apellidos,
      curp: this.pacienteEnConsulta.curp,
      sexo: this.pacienteEnConsulta.sexo,
      fechaNacimiento: this.construirFechaSoloDiaISO(this.pacienteEnConsulta.fechaNacimiento),
      direccion: this.pacienteEnConsulta.direccion || null,
      telefono: this.pacienteEnConsulta.telefono || null,
      contactoEmergencia: this.pacienteEnConsulta.contactoEmergencia || null,
      antecedentesHeredoFamiliares: this.pacienteEnConsulta.antecedentesHeredoFamiliares || 'Negados',
      antecedentesPatologicos: this.pacienteEnConsulta.antecedentesPatologicos || 'Negados',
      alergias: alergiasActuales,
      antecedentesNoPatologicos: this.pacienteEnConsulta.antecedentesNoPatologicos || 'Negados'
    };
    if (this.pacienteEnConsulta.fechaRegistro) {
      payloadPac.fechaRegistro = this.pacienteEnConsulta.fechaRegistro;
    }
    return { pacienteId: this.pacienteEnConsulta.id, payload: payloadPac };
  }

  private construirPayloadNota(citaId: number) {
    return {
      pacienteId: Number(this.pacienteEnConsulta.id),
      citaId: Number(citaId),
      doctorId: Number(this.doctorActual.id || 1),
      motivoConsulta: this.signosVitales.motivoConsulta,
      frecuenciaCardiaca: this.signosVitales.frecuenciaCardiaca,
      frecuenciaRespiratoria: this.signosVitales.frecuenciaRespiratoria,
      temperatura: this.signosVitales.temperatura ? Number(this.signosVitales.temperatura) : null,
      saturacionOxigeno: this.signosVitales.saturacionOxigeno,
      peso: this.signosVitales.peso ? Number(this.signosVitales.peso) : null,
      talla: this.signosVitales.talla ? Number(this.signosVitales.talla) : null,
      imc: this.signosVitales.imc ? Number(this.signosVitales.imc) : null,
      exploracionFisica: this.signosVitales.exploracionFisica || 'Sin hallazgos anormales',
      diagnostico: this.signosVitales.diagnostico,
      codigoCIE10: this.signosVitales.codigoCIE10 || 'Z00.0',
      planTerapeutico: this.signosVitales.planTerapeutico,
      recetaMedicamentos: this.signosVitales.recetaMedicamentos || '',
      estudiosAuxiliares: this.signosVitales.estudiosAuxiliares || 'Ninguno'
    };
  }

  private guardarConsultaOffline() {
    const citaIdOriginal = this.pacienteEnConsulta.citaIdActiva ?? null;
    const necesitaCitaExpress = !citaIdOriginal;
    const citaExpressPayload = necesitaCitaExpress
      ? {
          pacienteId: Number(this.pacienteEnConsulta.id),
          doctorId: Number(this.doctorActual.id || 1),
          fechaHora: new Date().toISOString(),
          motivoConsulta: this.signosVitales.motivoConsulta,
          estado: 'Agendada',
          notasRecepcion: 'Consulta directa en consultorio (modo sin conexión)'
        }
      : null;

    const payloadAlergias = this.construirPayloadAlergiasSiCambio();
    if (payloadAlergias) {
      const pacLocal = this.directorioPacientes.find(p => Number(p.id) === Number(this.pacienteEnConsulta.id));
      if (pacLocal) pacLocal.alergias = payloadAlergias.payload.alergias;
    }

    const pendiente: ConsultaOfflinePendiente = {
      tempId: -Date.now() - Math.floor(Math.random() * 1000),
      citaIdOriginal,
      necesitaCitaExpress,
      citaExpressPayload,
      payloadNota: this.construirPayloadNota(citaIdOriginal || 0),
      payloadAlergias,
      meta: {
        pacienteNombre: this.pacienteEnConsulta.nombreCompleto,
        nombreDoctor: this.doctorActual.nombre,
        fechaRegistro: new Date().toISOString()
      }
    };

    this.colaConsultasOffline.push(pendiente);
    this.guardarColasOffline();

    if (this.signosVitales.fechaProximaCita) {
      const proxCita = {
        pacienteId: Number(this.pacienteEnConsulta.id),
        doctorId: Number(this.doctorActual.id || 1),
        fechaHora: new Date(`${this.signosVitales.fechaProximaCita}T09:00:00`).toISOString(),
        motivoConsulta: 'Cita de seguimiento: ' + this.signosVitales.diagnostico,
        estado: 'Agendada',
        notasRecepcion: 'Agendada automáticamente sin conexión'
      };
      this.encolarCitaOffline(proxCita, false);
    }

    this.combinarCitasConOffline();
    this.combinarNotasConOffline();

    Swal.fire({
      title: '⏳ Consulta guardada sin conexión',
      text: 'Ya aparece en tu Historial como "Esperando internet" y se subirá automáticamente en cuanto regrese la conexión.',
      icon: 'info',
      timer: 3000,
      showConfirmButton: false
    });

    this.terminarConsulta();

    if (!this.isOffline && navigator.onLine) {
      this.sincronizarPendientes();
    }
  }

  guardarConsultaCompleta() {
    if (!this.signosVitales.motivoConsulta || !this.signosVitales.diagnostico || !this.signosVitales.planTerapeutico) {
      Swal.fire('Campos requeridos', 'Motivo de consulta, Diagnóstico y Plan Terapéutico son obligatorios.', 'warning');
      return;
    }

    const citaEsOffline = this.pacienteEnConsulta.citaIdActiva && Number(this.pacienteEnConsulta.citaIdActiva) < 0;
    if (this.isOffline || !navigator.onLine || citaEsOffline) {
      if (!navigator.onLine) this.isOffline = true;
      this.guardarConsultaOffline();
      return;
    }

    const alergiasCambio = this.construirPayloadAlergiasSiCambio();
    if (alergiasCambio) {
      this.http.put(`${this.apiPacientes}/${alergiasCambio.pacienteId}`, alergiasCambio.payload).subscribe({
        error: () => {}
      });
    }

    if (!this.pacienteEnConsulta.citaIdActiva) {
      const citaExpress = {
        pacienteId: this.pacienteEnConsulta.id,
        doctorId: this.doctorActual.id || 1,
        fechaHora: new Date().toISOString(),
        motivoConsulta: this.signosVitales.motivoConsulta,
        estado: 'Agendada',
        notasRecepcion: 'Consulta directa en consultorio'
      };
      this.http.post<any>(this.apiCitas, citaExpress).subscribe({
        next: (citaCreada) => {
          this.enviarNotaMedicaAlServidor(citaCreada.id);
        },
        error: (err) => {
          if (this.esErrorDeRed(err)) {
            this.isOffline = true;
            this.guardarConsultaOffline();
          } else {
            Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo generar el folio de cita para la nota médica.'), 'error');
          }
        }
      });
    } else {
      this.enviarNotaMedicaAlServidor(this.pacienteEnConsulta.citaIdActiva);
    }
  }

  private enviarNotaMedicaAlServidor(citaId: number) {
    const payloadNota = this.construirPayloadNota(citaId);

    this.http.post(this.apiNotas, payloadNota).subscribe({
      next: () => {
        if (this.signosVitales.fechaProximaCita) {
          const proxCita = {
            pacienteId: Number(this.pacienteEnConsulta.id),
            doctorId: Number(this.doctorActual.id || 1),
            fechaHora: new Date(`${this.signosVitales.fechaProximaCita}T09:00:00`).toISOString(),
            motivoConsulta: 'Cita de seguimiento: ' + this.signosVitales.diagnostico,
            estado: 'Agendada',
            notasRecepcion: 'Agendada automáticamente al finalizar consulta'
          };
          this.http.post(this.apiCitas, proxCita).subscribe({
            next: () => {
              Swal.fire({
                title: '¡Consulta y Seguimiento Guardados!',
                text: 'La cita actual pasó a Completada automáticamente.',
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
              });
              this.finalizarYRecargarTodo();
            },
            error: (err) => {
              if (this.esErrorDeRed(err)) {
                this.isOffline = true;
                this.encolarCitaOffline(proxCita, false);
              }
              Swal.fire(
                'Expediente guardado con aviso',
                `La nota médica se guardó, pero el seguimiento quedó pendiente: ${this.extraerMensajeError(err, 'Conflicto de horario a las 09:00')}`,
                'warning'
              );
              this.finalizarYRecargarTodo();
            }
          });
        } else {
          Swal.fire({
            title: '¡Expediente Guardado!',
            text: 'La cita se marcó como Completada correctamente.',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
          this.finalizarYRecargarTodo();
        }
      },
      error: (err) => {
        if (this.esErrorDeRed(err)) {
          this.isOffline = true;
          this.guardarConsultaOffline();
        } else {
          Swal.fire('Error', this.extraerMensajeError(err, 'Ocurrió un problema al guardar la nota médica.'), 'error');
        }
      }
    });
  }

  finalizarYRecargarTodo() {
    this.terminarConsulta();
    this.cargarDatosReales();
  }

  // --- CRUD INVENTARIO (/api/Insumos) ---
  abrirModalNuevoProducto() {
    this.productoEditando = {
      id: 0,
      nombre: '',
      cantidad: null,
      unidadMedida: 'Piezas',
      fechaCaducidad: '',
      fechaRegistro: ''
    };
    this.mostrarModalInventario = true;
  }

  abrirModalEditarProducto(item: any) {
    this.productoEditando = {
      id: item.id,
      nombre: item.nombre || item.nombreProducto,
      cantidad: item.cantidad,
      unidadMedida: item.unidadMedida || item.unidad || 'Piezas',
      fechaCaducidad: item.fechaCaducidad ? String(item.fechaCaducidad).substring(0, 10) : '',
      fechaRegistro: item.fechaRegistro || ''
    };
    this.mostrarModalInventario = true;
  }

  guardarProductoManual() {
    if (!this.productoEditando.nombre || !this.productoEditando.nombre.trim()) {
      Swal.fire('Atención', 'Ingresa el nombre del insumo médico.', 'warning');
      return;
    }

    const cantidadNum = Number(this.productoEditando.cantidad) || 0;
    const payload: any = {
      id: this.productoEditando.id || 0,
      nombre: this.productoEditando.nombre.trim(),
      cantidad: cantidadNum,
      unidadMedida: this.productoEditando.unidadMedida || 'Piezas',
      estado: cantidadNum < 10 ? 'Crítico' : 'Óptimo',
      fechaCaducidad: this.construirFechaSoloDiaISO(this.productoEditando.fechaCaducidad)
    };

    if (this.productoEditando.id && this.productoEditando.id > 0) {
      if (this.productoEditando.fechaRegistro) {
        payload.fechaRegistro = this.productoEditando.fechaRegistro;
      }
      this.http.put(`${this.apiInsumos}/${this.productoEditando.id}`, payload).subscribe({
        next: () => {
          this.mostrarModalInventario = false;
          Swal.fire({ title: 'Inventario Actualizado', icon: 'success', timer: 1200, showConfirmButton: false });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo actualizar el insumo.'), 'error')
      });
    } else {
      delete payload.id;
      this.http.post(this.apiInsumos, payload).subscribe({
        next: () => {
          this.mostrarModalInventario = false;
          Swal.fire({ title: 'Insumo Registrado', icon: 'success', timer: 1200, showConfirmButton: false });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo guardar el insumo.'), 'error')
      });
    }
  }

  borrarProducto(id: number) {
    Swal.fire({
      title: '¿Eliminar insumo?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        this.http.delete(`${this.apiInsumos}/${id}`).subscribe({
          next: () => {
            Swal.fire({ title: 'Eliminado', icon: 'success', timer: 1000, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo eliminar el insumo.'), 'error')
        });
      }
    });
  }

  buscarInventario(event: any) {
    this.terminoBusquedaInventario = event.target.value.toLowerCase();
    this.aplicarFiltrosInventario();
  }

  ordenarInventario(event: any) {
    this.criterioOrdenInventario = event.target.value;
    this.aplicarFiltrosInventario();
  }

  aplicarFiltrosInventario() {
    this.inventarioFiltrado = this.inventario.filter(i =>
      (i.nombreProducto || '').toLowerCase().includes(this.terminoBusquedaInventario)
    );
    if (this.criterioOrdenInventario === 'mayor') {
      this.inventarioFiltrado.sort((a, b) => b.cantidad - a.cantidad);
    } else if (this.criterioOrdenInventario === 'menor') {
      this.inventarioFiltrado.sort((a, b) => a.cantidad - b.cantidad);
    } else if (this.criterioOrdenInventario === 'critico') {
      this.inventarioFiltrado.sort((a, b) => (a.estado === 'Crítico' ? -1 : 1));
    }
  }

  // --- CRUD PERSONAL MÉDICO (/api/Usuarios) ---
  abrirModalNuevoPersonal() {
    this.personalEditando = this.obtenerPersonalVacio();
    this.mostrarModalPersonal = true;
  }

  abrirModalEditarPersonal(user: any) {
    this.personalEditando = {
      id: user.id,
      nombre: user.nombre || '',
      correo: user.correo || '',
      password: '',
      rol: user.rol || 'Doctor',
      estado: user.estado || 'Activo',
      colorAgenda: user.colorAgenda || this.obtenerColorDoctor(user.id),
      telefono: user.telefono || '',
      estudios: user.estudios || '',
      universidadEgreso: user.universidadEgreso || '',
      cedulaProfesional: user.cedulaProfesional || '',
      cedulaEspecialidad: user.cedulaEspecialidad || '',
      tarifaConsulta: user.tarifaConsulta ?? 800
    };
    this.mostrarModalPersonal = true;
  }

  colorUsadoPorOtro(color: string): string | null {
    const otro = this.listaPersonal.find(
      u =>
        u.id !== this.personalEditando.id &&
        (u.colorAgenda || '').toLowerCase() === (color || '').toLowerCase()
    );
    return otro ? otro.nombre : null;
  }

  guardarPersonal() {
    const esEdicion = this.personalEditando.id && this.personalEditando.id > 0;

    if (!this.personalEditando.nombre || !this.personalEditando.correo) {
      Swal.fire('Campos requeridos', 'Nombre y Correo son obligatorios.', 'warning');
      return;
    }

    if (!esEdicion && !this.personalEditando.password) {
      Swal.fire('Contraseña requerida', 'Debes asignar una contraseña para el nuevo usuario.', 'warning');
      return;
    }

    if (esEdicion) {
      const payloadActualizar = {
        id: this.personalEditando.id,
        nombre: this.personalEditando.nombre.trim(),
        correo: this.personalEditando.correo.trim().toLowerCase(),
        rol: this.personalEditando.rol,
        estado: this.personalEditando.estado || 'Activo',
        colorAgenda: this.personalEditando.colorAgenda || '#2563eb',
        password: this.personalEditando.password?.trim() || null,
        telefono: this.personalEditando.telefono || null,
        estudios: this.personalEditando.estudios || null,
        universidadEgreso: this.personalEditando.universidadEgreso || null,
        cedulaProfesional: this.personalEditando.cedulaProfesional || null,
        cedulaEspecialidad: this.personalEditando.cedulaEspecialidad || null,
        tarifaConsulta: this.personalEditando.tarifaConsulta ? Number(this.personalEditando.tarifaConsulta) : null
      };

      this.http.put(`${this.apiUsuarios}/${this.personalEditando.id}`, payloadActualizar).subscribe({
        next: () => {
          this.mostrarModalPersonal = false;
          Swal.fire({ title: 'Personal Actualizado', icon: 'success', timer: 1500, showConfirmButton: false });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo actualizar el usuario.'), 'error')
      });
    } else {
      const payloadNuevo = {
        nombre: this.personalEditando.nombre.trim(),
        correo: this.personalEditando.correo.trim().toLowerCase(),
        passwordHash: this.personalEditando.password,
        rol: this.personalEditando.rol,
        estado: 'Activo',
        colorAgenda: this.personalEditando.colorAgenda || '#2563eb',
        telefono: this.personalEditando.telefono || null,
        estudios: this.personalEditando.estudios || null,
        universidadEgreso: this.personalEditando.universidadEgreso || null,
        cedulaProfesional: this.personalEditando.cedulaProfesional || null,
        cedulaEspecialidad: this.personalEditando.cedulaEspecialidad || null,
        tarifaConsulta: this.personalEditando.tarifaConsulta ? Number(this.personalEditando.tarifaConsulta) : null
      };

      this.http.post(this.apiUsuarios, payloadNuevo).subscribe({
        next: () => {
          this.mostrarModalPersonal = false;
          Swal.fire({
            title: 'Personal Registrado',
            text: 'Usuario creado con acceso seguro.',
            icon: 'success',
            timer: 1800,
            showConfirmButton: false
          });
          this.cargarDatosReales();
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo registrar el usuario.'), 'error')
      });
    }
  }

  suspenderPersonal(user: any) {
    Swal.fire({
      title: `¿Suspender a ${user.nombre}?`,
      text: 'No podrá iniciar sesión hasta que sea reactivado.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Sí, suspender'
    }).then(r => {
      if (r.isConfirmed) {
        this.http.put<any>(`${this.apiUsuarios}/${user.id}/suspender`, {}).subscribe({
          next: (res) => {
            Swal.fire({ title: 'Suspendido', text: res?.mensaje || 'Acceso suspendido.', icon: 'success', timer: 1500, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo suspender el acceso.'), 'error')
        });
      }
    });
  }

  activarPersonal(user: any) {
    this.http.put<any>(`${this.apiUsuarios}/${user.id}/activar`, {}).subscribe({
      next: (res) => {
        Swal.fire({ title: 'Reactivado', text: res?.mensaje || 'Acceso reactivado.', icon: 'success', timer: 1500, showConfirmButton: false });
        this.cargarDatosReales();
      },
      error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo reactivar al usuario.'), 'error')
    });
  }

  eliminarPersonal(user: any) {
    if (this.isOffline || !navigator.onLine) {
      Swal.fire('Sin conexión', 'Conéctate a internet para eliminar personal.', 'info');
      return;
    }

    Swal.fire({
      title: `¿Eliminar a ${user.nombre}?`,
      text: 'Esta acción eliminará al usuario permanentemente.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Sí, eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        this.http.delete(`${this.apiUsuarios}/${user.id}`).subscribe({
          next: () => {
            Swal.fire({ title: 'Usuario eliminado', icon: 'success', timer: 1300, showConfirmButton: false });
            this.cargarDatosReales();
          },
          error: (err) => {
            Swal.fire('No se pudo eliminar', this.extraerMensajeError(err, 'Ocurrió un error al eliminar el usuario.'), 'warning');
          }
        });
      }
    });
  }

  // --- CALENDARIO VISUAL ---
  imprimirReceta() {
    window.print();
  }

  generarCalendario() {
    const year = this.mesDesplegado.getFullYear();
    const month = this.mesDesplegado.getMonth();
    this.mesActualTitulo = `${this.nombresMeses[month]} ${year}`;
    this.diasCalendario = [];
    const primerDia = new Date(year, month, 1).getDay();
    const diasEnMes = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < primerDia; i++) {
      this.diasCalendario.push({ numero: '', inactivo: true, citas: [], fechaCompleta: '' });
    }
    for (let i = 1; i <= diasEnMes; i++) {
      const fechaStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const citasDelDia = this.todasLasCitas.filter(
        c =>
          c.fechaLocalISO === fechaStr &&
          (this.doctorFiltroAgenda === 0 || Number(c.doctorId) === Number(this.doctorFiltroAgenda))
      );
      this.diasCalendario.push({ numero: i, inactivo: false, citas: citasDelDia, fechaCompleta: fechaStr });
    }
  }

  mesAnterior() {
    this.mesDesplegado.setMonth(this.mesDesplegado.getMonth() - 1);
    this.generarCalendario();
  }

  mesSiguiente() {
    this.mesDesplegado.setMonth(this.mesDesplegado.getMonth() + 1);
    this.generarCalendario();
  }

  cerrarModalCita() {
    this.mostrarModalCita = false;
  }

  cerrarModalInventario() {
    this.mostrarModalInventario = false;
  }
}