import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-perfil-clinica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './perfil-clinica.html',
  styleUrls: ['./perfil-clinica.scss']
})
export class PerfilClinica implements OnInit {
  private apiBase = 'https://localhost:7290/api';

  clinicaId: number = 1;
  esAdmin: boolean = false;
  esStaff: boolean = false;
  esPaciente: boolean = false;
  nombreUsuario: string = '';
  vistaPreviaPaciente: boolean = false;

  clinica: any = {
    id: 1,
    nombre: 'Clínica Medical Staff',
    logo: '🏥',
    direccion: 'Av. Miguel Alemán 153 Sur, Cd. Obregón',
    telefono: '644 415 3044',
    descripcion: 'Clínica médica general y especialidades.',
    plan: 'Basico',
    limiteEspecialidades: 3
  };

  especialidades: any[] = [];
  doctores: any[] = [];

  // Modales de Admin
  mostrarModalClinica: boolean = false;
  clinicaForm: any = {};

  mostrarModalEspecialidad: boolean = false;
  especialidadForm: any = {
    id: 0,
    nombre: '',
    icono: '🩺',
    descripcion: '',
    estado: 'Activa'
  };

  iconosSugeridos: string[] = ['🦷', '🩺', '👶', '❤️', '👁️', '🦴', '🧠', '🧪', '💊'];

  // Modal de Agendar Cita (Paciente)
  mostrarModalCita: boolean = false;
  enviandoCita: boolean = false;
  especialidadSeleccionada: any = null;
  citaForm: any = {
    doctorId: 0,
    fecha: this.obtenerFechaHoyISO(),
    hora: '10:00',
    motivoConsulta: '',
    notasPaciente: ''
  };

  // Modales de Portal del Paciente (Perfil, Mis Citas, Mi Historial)
  mostrarModalMiPerfil: boolean = false;
  guardandoPerfil: boolean = false;
  miPerfilForm: any = {
    nombre: '',
    apellidos: '',
    curp: '',
    sexo: 'Masculino',
    fechaNacimiento: '',
    telefono: '',
    direccion: '',
    contactoEmergencia: '',
    alergias: 'Ninguna'
  };

  mostrarModalMisCitas: boolean = false;
  misCitas: any[] = [];
  cargandoMisCitas: boolean = false;

  mostrarModalMiHistorial: boolean = false;
  miHistorial: any[] = [];
  cargandoMiHistorial: boolean = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get modoEdicion(): boolean {
    return this.esAdmin && !this.vistaPreviaPaciente;
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const idParam = Number(params.get('id'));
      const clinicaGuardada = Number(localStorage.getItem('clinica_id') || '1');
      this.clinicaId = idParam > 0 ? idParam : (clinicaGuardada > 0 ? clinicaGuardada : 1);

      this.detectarSesion();
      this.cargarPerfil();
    });
  }

  private obtenerFechaHoyISO(): string {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private decodificarJwt(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  }

  private detectarSesion() {
    const token = localStorage.getItem('token_medical_staff');
    if (!token) {
      this.esAdmin = false;
      this.esStaff = false;
      this.esPaciente = false;
      this.nombreUsuario = '';
      return;
    }

    const payload = this.decodificarJwt(token);
    const rol = (
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      payload['role'] ||
      localStorage.getItem('rol_usuario') ||
      ''
    ).toString();
    const clinicaToken = Number(payload['ClinicaId'] || localStorage.getItem('clinica_id') || '0');

    this.nombreUsuario =
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
      payload['name'] ||
      localStorage.getItem('nombre_usuario') ||
      localStorage.getItem('correo_usuario') ||
      'Usuario';

    this.esPaciente = rol.toLowerCase() === 'paciente';
    this.esStaff = !!rol && !this.esPaciente;
    this.esAdmin = this.esStaff && (clinicaToken === this.clinicaId || clinicaToken === 0);
  }

  private extraerError(err: any, defecto: string): string {
    if (typeof err?.error === 'string' && err.error.trim().length > 0) {
      return err.error.replace(/^"|"$/g, '');
    }
    if (err?.error?.errors) {
      return Object.values(err.error.errors).flat().join(' | ');
    }
    return err?.error?.title || defecto;
  }

  cargarPerfil() {
    this.http.get<any>(`${this.apiBase}/Especialidades/clinica/${this.clinicaId}`).subscribe({
      next: (res) => {
        if (res?.clinica) this.clinica = res.clinica;
        if (Array.isArray(res?.especialidades)) this.especialidades = res.especialidades;
        if (Array.isArray(res?.doctores)) this.doctores = res.doctores;
      },
      error: () => {
        Swal.fire('Error', 'No se pudo cargar la información de la clínica.', 'error');
      }
    });
  }

  esUrlImagen(valor: string | null | undefined): boolean {
    if (!valor) return false;
    return valor.startsWith('http://') || valor.startsWith('https://') || valor.startsWith('data:image/');
  }

  // ================= EDICIÓN DE CLÍNICA (ADMIN) =================
  abrirModalEditarClinica() {
    this.clinicaForm = { ...this.clinica };
    this.mostrarModalClinica = true;
  }

  guardarClinica() {
    if (!this.clinicaForm.nombre?.trim()) {
      Swal.fire('Campo requerido', 'El nombre de la clínica es obligatorio.', 'warning');
      return;
    }

    this.http.put<any>(`${this.apiBase}/Clinicas/${this.clinica.id}`, this.clinicaForm).subscribe({
      next: (actualizada) => {
        this.clinica = actualizada || { ...this.clinicaForm };
        this.mostrarModalClinica = false;
        Swal.fire({ title: 'Perfil actualizado', icon: 'success', timer: 1400, showConfirmButton: false });
      },
      error: (err) => {
        Swal.fire('Error', this.extraerError(err, 'No se pudo actualizar la clínica.'), 'error');
      }
    });
  }

  // ================= CRUD ESPECIALIDADES (ADMIN) =================
  abrirModalNuevaEspecialidad() {
    this.especialidadForm = {
      id: 0,
      nombre: '',
      icono: '🩺',
      descripcion: '',
      estado: 'Activa'
    };
    this.mostrarModalEspecialidad = true;
  }

  abrirModalEditarEspecialidad(esp: any) {
    this.especialidadForm = { ...esp };
    this.mostrarModalEspecialidad = true;
  }

  guardarEspecialidad() {
    if (!this.especialidadForm.nombre?.trim()) {
      Swal.fire('Campo requerido', 'Escribe el nombre de la especialidad.', 'warning');
      return;
    }

    const esEdicion = this.especialidadForm.id > 0;
    const req = esEdicion
      ? this.http.put(`${this.apiBase}/Especialidades/${this.especialidadForm.id}`, this.especialidadForm)
      : this.http.post(`${this.apiBase}/Especialidades`, this.especialidadForm);

    req.subscribe({
      next: () => {
        this.mostrarModalEspecialidad = false;
        Swal.fire({
          title: esEdicion ? 'Especialidad actualizada' : 'Especialidad agregada',
          icon: 'success',
          timer: 1400,
          showConfirmButton: false
        });
        this.cargarPerfil();
      },
      error: (err) => {
        Swal.fire('Aviso', this.extraerError(err, 'No se pudo guardar la especialidad.'), 'warning');
      }
    });
  }

  eliminarEspecialidad(esp: any) {
    Swal.fire({
      title: `¿Eliminar ${esp.nombre}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Sí, eliminar'
    }).then(r => {
      if (r.isConfirmed) {
        this.http.delete(`${this.apiBase}/Especialidades/${esp.id}`).subscribe({
          next: () => this.cargarPerfil(),
          error: (err) => Swal.fire('Error', this.extraerError(err, 'No se pudo eliminar la especialidad.'), 'error')
        });
      }
    });
  }

  // ================= AGENDAR CITA REAL (PACIENTE) =================
  solicitarCita(esp: any) {
    if (esp.estado !== 'Activa') return;

    if (!this.esPaciente && !this.vistaPreviaPaciente) {
      Swal.fire({
        title: 'Inicia sesión como Paciente',
        text: 'Para agendar tu cita con tus datos precargados, inicia sesión o crea tu cuenta de paciente.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Ir a Iniciar Sesión',
        cancelButtonText: 'Cancelar'
      }).then(res => {
        if (res.isConfirmed) {
          this.router.navigate(['/']);
        }
      });
      return;
    }

    this.especialidadSeleccionada = esp;
    this.citaForm = {
      doctorId: this.doctores.length > 0 ? this.doctores[0].id : 0,
      fecha: this.obtenerFechaHoyISO(),
      hora: '10:00',
      motivoConsulta: '',
      notasPaciente: ''
    };
    this.mostrarModalCita = true;
  }

  confirmarSolicitudCita() {
    if (this.vistaPreviaPaciente && !this.esPaciente) {
      Swal.fire('Vista previa', 'Estás en modo vista previa de administrador. Inicia sesión con una cuenta de Paciente para enviar citas reales.', 'info');
      return;
    }

    if (!this.citaForm.doctorId || !this.citaForm.fecha || !this.citaForm.hora || !this.citaForm.motivoConsulta?.trim()) {
      Swal.fire('Campos incompletos', 'Selecciona médico, fecha, hora y describe tu motivo de consulta.', 'warning');
      return;
    }

    this.enviandoCita = true;
    const fechaHoraISO = new Date(`${this.citaForm.fecha}T${this.citaForm.hora}:00`).toISOString();
    const prefijoEsp = this.especialidadSeleccionada?.nombre ? `[${this.especialidadSeleccionada.nombre}] ` : '';

    const payload = {
      clinicaId: Number(this.clinica.id || this.clinicaId),
      doctorId: Number(this.citaForm.doctorId),
      fechaHora: fechaHoraISO,
      motivoConsulta: `${prefijoEsp}${this.citaForm.motivoConsulta.trim()}`,
      notasPaciente: this.citaForm.notasPaciente?.trim() || null
    };

    this.http.post<any>(`${this.apiBase}/Citas/solicitar`, payload).subscribe({
      next: (res) => {
        this.enviandoCita = false;
        this.mostrarModalCita = false;
        Swal.fire({
          title: '¡Cita solicitada!',
          text: res?.mensaje || 'Tu solicitud quedó en estado Pendiente hasta que la clínica la confirme.',
          icon: 'success'
        });
      },
      error: (err) => {
        this.enviandoCita = false;
        Swal.fire('No se pudo agendar', this.extraerError(err, 'Ocurrió un error al solicitar tu cita.'), 'error');
      }
    });
  }

  // ================= PORTAL DEL PACIENTE (PERFIL / CITAS / HISTORIAL) =================
  abrirMiPerfil() {
    this.mostrarModalMiPerfil = true;
    this.http.get<any>(`${this.apiBase}/Pacientes/mi-perfil`).subscribe({
      next: (p) => {
        this.miPerfilForm = {
          nombre: p.nombre || '',
          apellidos: p.apellidos || '',
          curp: p.curp || '',
          sexo: p.sexo || 'Masculino',
          fechaNacimiento: p.fechaNacimiento ? String(p.fechaNacimiento).substring(0, 10) : '',
          telefono: p.telefono || '',
          direccion: p.direccion || '',
          contactoEmergencia: p.contactoEmergencia || '',
          alergias: p.alergias || 'Ninguna'
        };
      },
      error: (err) => {
        this.mostrarModalMiPerfil = false;
        Swal.fire('Error', this.extraerError(err, 'No se pudo cargar tu perfil.'), 'error');
      }
    });
  }

  guardarMiPerfil() {
    if (!this.miPerfilForm.nombre?.trim() || !this.miPerfilForm.apellidos?.trim()) {
      Swal.fire('Campos requeridos', 'Nombre y apellidos son obligatorios.', 'warning');
      return;
    }

    this.guardandoPerfil = true;
    const payload = {
      nombre: this.miPerfilForm.nombre.trim(),
      apellidos: this.miPerfilForm.apellidos.trim(),
      sexo: this.miPerfilForm.sexo,
      fechaNacimiento: this.miPerfilForm.fechaNacimiento ? `${this.miPerfilForm.fechaNacimiento}T12:00:00.000Z` : null,
      telefono: this.miPerfilForm.telefono?.trim() || null,
      direccion: this.miPerfilForm.direccion?.trim() || null,
      contactoEmergencia: this.miPerfilForm.contactoEmergencia?.trim() || null
    };

    this.http.put<any>(`${this.apiBase}/Pacientes/mi-perfil`, payload).subscribe({
      next: () => {
        this.guardandoPerfil = false;
        this.mostrarModalMiPerfil = false;
        this.nombreUsuario = `${payload.nombre} ${payload.apellidos}`.trim();
        localStorage.setItem('nombre_usuario', this.nombreUsuario);
        Swal.fire({ title: 'Perfil actualizado', icon: 'success', timer: 1400, showConfirmButton: false });
      },
      error: (err) => {
        this.guardandoPerfil = false;
        Swal.fire('Error', this.extraerError(err, 'No se pudo actualizar tu perfil.'), 'error');
      }
    });
  }

  abrirMisCitas() {
    this.mostrarModalMisCitas = true;
    this.cargandoMisCitas = true;
    this.http.get<any[]>(`${this.apiBase}/Citas/mis-citas`).subscribe({
      next: (lista) => {
        this.cargandoMisCitas = false;
        this.misCitas = Array.isArray(lista) ? lista : [];
      },
      error: (err) => {
        this.cargandoMisCitas = false;
        Swal.fire('Error', this.extraerError(err, 'No se pudieron cargar tus citas.'), 'error');
      }
    });
  }

  abrirMiHistorial() {
    this.mostrarModalMiHistorial = true;
    this.cargandoMiHistorial = true;
    this.http.get<any[]>(`${this.apiBase}/NotasMedicas/mi-historial`).subscribe({
      next: (lista) => {
        this.cargandoMiHistorial = false;
        this.miHistorial = Array.isArray(lista) ? lista : [];
      },
      error: (err) => {
        this.cargandoMiHistorial = false;
        Swal.fire('Error', this.extraerError(err, 'No se pudo cargar tu historial médico.'), 'error');
      }
    });
  }

  // ================= NAVEGACIÓN =================
  volverAlDashboard() {
    this.router.navigate(['/dashboard']);
  }

  volverAlInicio() {
    this.router.navigate(['/']);
  }

  cerrarSesion() {
    localStorage.removeItem('token_medical_staff');
    localStorage.removeItem('correo_usuario');
    localStorage.removeItem('rol_usuario');
    localStorage.removeItem('nombre_usuario');
    localStorage.removeItem('clinica_id');
    localStorage.removeItem('paciente_id');
    this.detectarSesion();
    this.router.navigate(['/']);
  }
}