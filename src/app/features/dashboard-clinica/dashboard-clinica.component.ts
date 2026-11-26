import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-dashboard-clinica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-clinica.component.html',
  styleUrls: ['./dashboard-clinica.component.scss']
})
export class DashboardClinicaComponent implements OnInit {
  // Configuración persistente de la clínica (PostgreSQL + respaldo localStorage)
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

  mostrarModalConfig: boolean = false;
  activeTab: string = 'resumen';

  // Usuario/Médico autenticado dinámicamente desde la BD
  doctorActual: any = {
    id: 1,
    nombre: 'Cargando...',
    especialidad: 'Médico Cirujano',
    cedula: 'En trámite',
    rol: 'Doctor',
    iniciales: 'MS'
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

  // Búsquedas
  terminoBusquedaPaciente: string = '';
  pacientesFiltrados: any[] = [];
  terminoBusquedaInventario: string = '';
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

  // Listas de datos reales desde PostgreSQL
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

  // URLs Oficiales de tu Backend ASP.NET Core (.NET 8)
  private apiBase = 'https://localhost:7290/api';
  apiUsuarios = `${this.apiBase}/Usuarios`;
  apiPacientes = `${this.apiBase}/Pacientes`;
  apiCitas = `${this.apiBase}/Citas`;
  apiNotas = `${this.apiBase}/NotasMedicas`;
  apiInsumos = `${this.apiBase}/Insumos`;
  apiClinicas = `${this.apiBase}/Clinicas`;
  apiAdmin = `${this.apiBase}/Admin`;

  isOffline: boolean = !navigator.onLine;

  constructor(private http: HttpClient, private router: Router) {}

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

    window.addEventListener('offline', () => (this.isOffline = true));
    window.addEventListener('online', () => {
      this.isOffline = false;
      this.cargarDatosReales();
    });

    this.cargarDatosReales();
  }

  // --- UTILIDADES DE FECHA LOCAL Y MENSAJES DE ERROR ---
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
    // Mediodía UTC evita que cambie de día en zonas horarias negativas (UTC-7 Sonora)
    return `${limpia}T12:00:00.000Z`;
  }

  extraerMensajeError(err: any, mensajePorDefecto: string): string {
    if (!err) return mensajePorDefecto;
    if (typeof err.error === 'string' && err.error.trim().length > 0) {
      return err.error.replace(/^"|"$/g, '');
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
    return {
      id: 0,
      nombre: '',
      correo: '',
      password: '',
      rol: 'Doctor',
      estado: 'Activo',
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

  // --- CARGA DE DATOS DESDE POSTGRESQL ---
  cargarDatosReales() {
    this.fechaHoyISO = this.obtenerFechaLocalISO(new Date());

    // 1. Cargar configuración de la Clínica desde PostgreSQL
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
      error: () => {
        // Mantiene la configuración actual en localStorage si aún no hay registro
      }
    });

    // 2. Cargar Estadísticas del AdminController
    this.http.get<any>(`${this.apiAdmin}/estadisticas`).subscribe({
      next: (stats) => {
        if (stats) {
          this.estadisticasAdmin = {
            totalCitasHoy: stats.totalCitasHoy ?? 0,
            citasPendientes: stats.citasPendientes ?? 0,
            totalPacientes: stats.totalPacientes ?? 0
          };
        }
      },
      error: () => {}
    });

    // 3. Cargar Usuarios (Doctores y Recepcionistas)
    this.http.get<any[]>(this.apiUsuarios).subscribe({
      next: (usuarios) => {
        this.listaPersonal = usuarios;
        const doctoresActivos = usuarios.filter(
          u => u.rol?.toLowerCase() === 'doctor' && u.estado !== 'Suspendido'
        );
        this.listaDoctores = doctoresActivos.length > 0
          ? doctoresActivos
          : usuarios.filter(u => u.estado !== 'Suspendido');

        const correoLogueado = (localStorage.getItem('correo_usuario') || '').trim().toLowerCase();
        const usuarioActivo =
          usuarios.find(u => (u.correo || '').trim().toLowerCase() === correoLogueado) ||
          this.listaDoctores[0] ||
          usuarios[0];

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
            iniciales: iniciales
          };
          this.nuevaCitaForm.doctorId = usuarioActivo.id;
        }
      },
      error: (err) => {
        if (err.status === 401) this.cerrarSesion();
      }
    });

    // 4. Cargar Pacientes
    this.http.get<any[]>(this.apiPacientes).subscribe(res => {
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
      this.cargarCitas();
      this.cargarHistorialConsultas();
    });

    // 5. Cargar Inventario (Insumos)
    this.http.get<any[]>(this.apiInsumos).subscribe(res => {
      this.inventario = res.map(i => ({
        ...i,
        nombreProducto: i.nombre,
        unidad: i.unidadMedida || 'Piezas',
        estado: i.cantidad < 10 ? 'Crítico' : (i.estado || 'Óptimo')
      }));
      this.inventarioCritico = this.inventario.filter(i => i.cantidad < 10).length;
      this.aplicarFiltrosInventario();
    });
  }

  cargarCitas() {
    this.http.get<any[]>(this.apiCitas).subscribe(res => {
      this.todasLasCitas = res.map(cita => ({
        ...cita,
        fechaHoraSegura: cita.fechaHora,
        fechaLocalISO: this.obtenerFechaLocalISO(cita.fechaHora),
        pacienteNombre: cita.nombrePaciente || 'Paciente',
        motivo: cita.motivoConsulta || 'Consulta general'
      }));

      this.citasDeHoy = this.todasLasCitas.filter(
        c => c.fechaLocalISO === this.fechaHoyISO
      );
      this.filtrarAgendaPorDia(this.fechaFiltroAgenda);
      this.generarCalendario();
    });
  }

  cargarHistorialConsultas() {
    this.http.get<any[]>(this.apiNotas).subscribe(res => {
      this.consultasRealizadas = res.map(nota => ({
        ...nota,
        pacienteNombre: nota.nombrePaciente,
        fechaConsultaSegura: nota.fechaRegistro,
        fechaLocalISO: this.obtenerFechaLocalISO(nota.fechaRegistro)
      }));
      this.consultasDeHoy = this.consultasRealizadas.filter(
        c => c.fechaLocalISO === this.fechaHoyISO
      ).length;
      this.filtrarHistorial(this.fechaFiltroHistorial);
    });
  }

  cambiarPestana(pestana: string) {
    this.activeTab = pestana;
    this.pacienteEnConsulta = null;
    this.cargarDatosReales();
  }

  cerrarSesion() {
    localStorage.removeItem('token_medical_staff');
    localStorage.removeItem('correo_usuario');
    this.router.navigate(['/']);
  }

  // --- CONFIGURACIÓN DE CLÍNICA (/api/Clinicas) ---
  guardarConfiguracionClinica(nombre: string, logo: string, dir: string, tel: string) {
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      Swal.fire('Campo requerido', 'El nombre de la clínica es obligatorio.', 'warning');
      return;
    }

    const payload: any = {
      nombre: nombreLimpio,
      logo: logo.trim() || '🏥',
      direccion: dir.trim() || null,
      telefono: tel.trim() || null
    };

    const peticion = this.configClinica.id > 0
      ? this.http.put<any>(`${this.apiClinicas}/${this.configClinica.id}`, { ...payload, id: this.configClinica.id })
      : this.http.post<any>(this.apiClinicas, payload);

    peticion.subscribe({
      next: (clinicaGuardada) => {
        this.configClinica = {
          id: clinicaGuardada?.id ?? this.configClinica.id,
          nombre: payload.nombre,
          logo: payload.logo,
          direccion: payload.direccion || '',
          telefono: payload.telefono || ''
        };
        localStorage.setItem('config_clinica_medical_staff', JSON.stringify(this.configClinica));
        this.mostrarModalConfig = false;
        Swal.fire({
          title: 'Actualizado',
          text: 'Datos de la clínica guardados en PostgreSQL.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
      },
      error: (err) => {
        Swal.fire('Error', this.extraerMensajeError(err, 'No se pudieron guardar los datos de la clínica.'), 'error');
      }
    });
  }

  // --- FILTROS DE AGENDA E HISTORIAL ---
  filtrarAgendaPorDia(fecha: string) {
    this.fechaFiltroAgenda = fecha;
    this.citasFiltradasAgenda = this.todasLasCitas.filter(
      c => c.fechaLocalISO === fecha
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
    const encabezados = ['ID,Fecha,Paciente,Medico,Motivo,Diagnostico,CIE10,PlanTerapeutico'];
    const filas = this.consultasFiltradas.map(c =>
      `${c.id},"${new Date(c.fechaConsultaSegura).toLocaleDateString()}","${c.pacienteNombre}","${c.nombreDoctor || ''}","${(c.motivoConsulta || '').replace(/"/g, '""')}","${(c.diagnostico || '').replace(/"/g, '""')}","${c.codigoCIE10 || ''}","${(c.planTerapeutico || '').replace(/"/g, '""')}"`
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

  // --- CRUD CITAS ---
  abrirModalAgendarCita() {
    this.nuevaCitaForm = {
      pacienteId: this.directorioPacientes.length ? this.directorioPacientes[0].id : 0,
      doctorId: this.listaDoctores.length ? this.listaDoctores[0].id : (this.doctorActual.id || 1),
      fecha: this.fechaFiltroAgenda || this.fechaHoyISO,
      hora: '10:00',
      motivoConsulta: '',
      notasRecepcion: ''
    };
    this.mostrarModalCita = true;
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

    this.http.post(this.apiCitas, payloadCita).subscribe({
      next: () => {
        this.mostrarModalCita = false;
        Swal.fire({ title: 'Cita Agendada', icon: 'success', timer: 1500, showConfirmButton: false });
        this.cargarDatosReales();
      },
      error: (err) => Swal.fire('No se pudo agendar', this.extraerMensajeError(err, 'No se pudo registrar la cita en PostgreSQL.'), 'error')
    });
  }

  cancelarCita(cita: any) {
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
      text: 'Se eliminará permanentemente de la agenda.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Eliminar'
    }).then(r => {
      if (r.isConfirmed) {
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

  // --- CONSULTA MÉDICA Y EXPEDIENTE CLÍNICO (SECCIONES 3, 4 Y 5) ---
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
    this.http.get<any[]>(`${this.apiNotas}/historial/${pacienteId}`).subscribe({
      next: (notas) => {
        this.historialPacienteActual = notas.map(n => ({
          ...n,
          pacienteNombre: n.nombrePaciente,
          fechaConsultaSegura: n.fechaRegistro
        }));
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

  guardarConsultaCompleta() {
    if (!this.signosVitales.motivoConsulta || !this.signosVitales.diagnostico || !this.signosVitales.planTerapeutico) {
      Swal.fire('Campos requeridos', 'Motivo de consulta, Diagnóstico y Plan Terapéutico son obligatorios.', 'warning');
      return;
    }

    // Si el doctor modificó las alergias en la receta, actualizar también el expediente del paciente
    const alergiasActuales = (this.pacienteEnConsulta.alergias || 'Ninguna').trim();
    if (alergiasActuales !== this.alergiasOriginalesConsulta) {
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
      this.http.put(`${this.apiPacientes}/${this.pacienteEnConsulta.id}`, payloadPac).subscribe({
        error: () => {}
      });
    }

    // Si el paciente se atendió sin cita previa, creamos su cita de recepción en automático para cumplir la FK
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
          this.enviarNotaMedicaAPostgreSQL(citaCreada.id);
        },
        error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'No se pudo generar el folio de cita para la nota médica.'), 'error')
      });
    } else {
      this.enviarNotaMedicaAPostgreSQL(this.pacienteEnConsulta.citaIdActiva);
    }
  }

  private enviarNotaMedicaAPostgreSQL(citaId: number) {
    const payloadNota = {
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
              Swal.fire(
                'Expediente guardado con aviso',
                `La nota médica se guardó, pero no se pudo agendar el seguimiento: ${this.extraerMensajeError(err, 'Conflicto de horario a las 09:00')}`,
                'warning'
              );
              this.finalizarYRecargarTodo();
            }
          });
        } else {
          Swal.fire({
            title: '¡Expediente Guardado!',
            text: 'La cita se marcó como Completada en PostgreSQL.',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
          this.finalizarYRecargarTodo();
        }
      },
      error: (err) => Swal.fire('Error', this.extraerMensajeError(err, 'Ocurrió un problema al guardar la nota médica.'), 'error')
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
    const criterio = event.target.value;
    if (criterio === 'mayor') this.inventarioFiltrado.sort((a, b) => b.cantidad - a.cantidad);
    else if (criterio === 'menor') this.inventarioFiltrado.sort((a, b) => a.cantidad - b.cantidad);
    else if (criterio === 'critico') this.inventarioFiltrado.sort((a, b) => (a.estado === 'Crítico' ? -1 : 1));
    else this.aplicarFiltrosInventario();
  }

  aplicarFiltrosInventario() {
    this.inventarioFiltrado = this.inventario.filter(i =>
      (i.nombreProducto || '').toLowerCase().includes(this.terminoBusquedaInventario)
    );
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
      telefono: user.telefono || '',
      estudios: user.estudios || '',
      universidadEgreso: user.universidadEgreso || '',
      cedulaProfesional: user.cedulaProfesional || '',
      cedulaEspecialidad: user.cedulaEspecialidad || '',
      tarifaConsulta: user.tarifaConsulta ?? 800
    };
    this.mostrarModalPersonal = true;
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
            text: 'Contraseña encriptada con BCrypt en PostgreSQL.',
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
      const citasDelDia = this.todasLasCitas.filter(c => c.fechaLocalISO === fechaStr);
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