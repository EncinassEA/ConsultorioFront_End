import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inicio.component.html',
  styleUrls: ['./inicio.component.scss']
})
export class InicioComponent implements OnInit {
  private apiBase = 'https://localhost:7290/api';

  // Estado de sesión en la landing
  usuarioLogueado: { nombre: string; correo: string; rol: string } | null = null;

  // Estadísticas reales desde Neon
  statsReales = {
    totalClinicas: 0,
    totalPacientes: 0,
    totalConsultas: 0,
    totalEspecialistas: 0
  };

  // Modal de Login / Registro de Paciente
  mostrarModalLogin: boolean = false;
  modoAuth: 'login' | 'registro' = 'login';
  credenciales = { correo: '', password: '' };
  registroPaciente = {
    nombre: '',
    apellidos: '',
    curp: '',
    sexo: 'Masculino',
    fechaNacimiento: '',
    telefono: '',
    correo: '',
    password: ''
  };
  cargandoLogin: boolean = false;

  // Visibilidad de contraseñas (ojito)
  verPasswordLogin: boolean = false;
  verPasswordRegistro: boolean = false;
  verPasswordClinica: boolean = false;

  // Modal de Registro de Nueva Clínica (Planes SaaS)
  mostrarModalRegistroClinica: boolean = false;
  cargandoClinica: boolean = false;
  registroClinica = {
    nombreClinica: '',
    logo: '🏥',
    direccion: '',
    telefono: '',
    descripcion: '',
    plan: 'Basico',
    nombreAdmin: '',
    correoAdmin: '',
    passwordAdmin: ''
  };

  // ================= PORTAL DEL PACIENTE (MODAL AMBIENTE PROPIO) =================
  mostrarPortalPaciente: boolean = false;
  tabPortalPaciente: 'citas' | 'historial' | 'perfil' = 'citas';
  cargandoPortal: boolean = false;
  guardandoPerfil: boolean = false;
  misCitas: any[] = [];
  miHistorial: any[] = [];
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

  // ================= BUSCADOR + SELECTOR INNOVADOR DE ESPECIALIDADES =================
  terminoBusqueda: string = '';
  especialidadSeleccionada: string = '';
  iconoEspecialidadSeleccionada: string = '🩺';
  mostrarSelectorEspecialidades: boolean = false;
  filtroDropdownEspecialidad: string = '';
  ciudadFija: string = 'Ciudad Obregón, Son.';

  especialidadesDisponibles: { nombre: string; icono: string; totalClinicas: number }[] = [];

  private temasTarjetas = ['blue-theme', 'teal-theme', 'purple-theme', 'orange-theme'];

  consultorios: any[] = [];
  consultoriosFiltrados: any[] = [];

  beneficiosPacientes = [
    { titulo: 'Agenda 24/7', desc: 'Reserva tu cita en cualquier momento, sin esperar a que abran la clínica.', icono: '⏰' },
    { titulo: 'Historial Digital', desc: 'Tus recetas y diagnósticos guardados de forma segura en tu celular.', icono: '📱' },
    { titulo: 'Cero Filas', desc: 'Llega directo a tu consulta. El sistema avisa cuando es tu turno real.', icono: '🚶' },
    { titulo: 'Especialistas Certificados', desc: 'Verificamos las cédulas de todos los médicos en nuestra plataforma.', icono: '✅' }
  ];

  planesSaaS = [
    {
      id: 'Basico',
      nombre: 'Plan Básico',
      precio: '$499',
      periodo: '/mes',
      badge: 'Ideal para empezar',
      destacado: false,
      limite: 'Hasta 3 especialidades',
      beneficios: [
        'Perfil público personalizado de tu clínica',
        'Hasta 3 áreas o especialidades activas',
        'Agenda multi-médico con colores',
        'Expediente clínico NOM-004 y recetas',
        'Modo PWA sin conexión (Offline)'
      ]
    },
    {
      id: 'Profesional',
      nombre: 'Plan Profesional',
      precio: '$999',
      periodo: '/mes',
      badge: 'Más popular',
      destacado: true,
      limite: 'Hasta 6 especialidades',
      beneficios: [
        'Todo lo incluido en el Plan Básico',
        'Hasta 6 especialidades simultáneas',
        'Control de inventario y alertas de stock',
        'Gestión de personal y recepción',
        'Sincronización con app móvil para pacientes'
      ]
    },
    {
      id: 'Empresarial',
      nombre: 'Plan Empresarial',
      precio: '$1,999',
      periodo: '/mes',
      badge: 'Clínicas grandes',
      destacado: false,
      limite: 'Hasta 15 especialidades',
      beneficios: [
        'Todo lo incluido en el Plan Profesional',
        'Hasta 15 especialidades y áreas médicas',
        'Múltiples doctores y recepcionistas',
        'Exportación de historial clínico (CSV)',
        'Soporte prioritario e integración de mapa'
      ]
    }
  ];

  constructor(private http: HttpClient, private router: Router) {}

  get esPaciente(): boolean {
    return !!this.usuarioLogueado && this.usuarioLogueado.rol.toLowerCase() === 'paciente';
  }

  get especialidadesFiltradasDropdown() {
    const t = this.filtroDropdownEspecialidad.trim().toLowerCase();
    if (!t) return this.especialidadesDisponibles;
    return this.especialidadesDisponibles.filter(e => e.nombre.toLowerCase().includes(t));
  }

  get citasActivasPaciente() {
    return this.misCitas.filter(c => c.estado === 'Pendiente' || c.estado === 'Agendada');
  }

  get citasPasadasPaciente() {
    return this.misCitas.filter(c => c.estado !== 'Pendiente' && c.estado !== 'Agendada');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.specialty-picker-group')) {
      this.mostrarSelectorEspecialidades = false;
    }
  }

  ngOnInit() {
    this.cargarSesionActual();
    this.cargarClinicasPublicas();
    this.cargarEstadisticasPublicas();
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

  private cargarSesionActual() {
    const token = localStorage.getItem('token_medical_staff');
    if (!token) {
      this.usuarioLogueado = null;
      return;
    }

    const payload = this.decodificarJwt(token);
    const rol =
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      payload['role'] ||
      localStorage.getItem('rol_usuario') ||
      '';
    const nombre =
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
      payload['name'] ||
      localStorage.getItem('nombre_usuario') ||
      localStorage.getItem('correo_usuario') ||
      'Usuario';
    const correo =
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
      payload['email'] ||
      localStorage.getItem('correo_usuario') ||
      '';

    if (rol) {
      this.usuarioLogueado = { nombre, correo, rol };
    }
  }

  private guardarSesionDesdeToken(tokenLimpio: string, correoFallback: string) {
    localStorage.setItem('token_medical_staff', tokenLimpio);
    localStorage.setItem('correo_usuario', correoFallback);

    const payload = this.decodificarJwt(tokenLimpio);
    const rol =
      payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] ||
      payload['role'] ||
      'Doctor';
    const nombre =
      payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
      payload['name'] ||
      correoFallback;
    const clinicaId = Number(payload['ClinicaId'] || 0);
    const pacienteId = Number(payload['PacienteId'] || 0);

    localStorage.setItem('rol_usuario', rol);
    localStorage.setItem('nombre_usuario', nombre);
    if (clinicaId > 0) localStorage.setItem('clinica_id', String(clinicaId));
    if (pacienteId > 0) localStorage.setItem('paciente_id', String(pacienteId));

    this.usuarioLogueado = { nombre, correo: correoFallback, rol };
    return { rol, nombre, clinicaId, pacienteId };
  }

  cargarEstadisticasPublicas() {
    this.http.get<any>(`${this.apiBase}/Clinicas/estadisticas-publicas`).subscribe({
      next: (res) => {
        if (res) {
          this.statsReales = {
            totalClinicas: res.totalClinicas ?? 0,
            totalPacientes: res.totalPacientes ?? 0,
            totalConsultas: res.totalConsultas ?? 0,
            totalEspecialistas: res.totalEspecialistas ?? 0
          };
          if (Array.isArray(res.especialidadesDisponibles) && res.especialidadesDisponibles.length > 0) {
            this.especialidadesDisponibles = res.especialidadesDisponibles;
          }
        }
      },
      error: () => {}
    });
  }

  cargarClinicasPublicas() {
    this.http.get<any[]>(`${this.apiBase}/Clinicas/publicas`).subscribe({
      next: (lista) => {
        if (Array.isArray(lista)) {
          this.consultorios = lista.map((c, idx) => {
            const listaEsp = Array.isArray(c.especialidades)
              ? c.especialidades.map((e: any) => ({
                  id: e.id,
                  nombre: e.nombre,
                  icono: e.icono || '🩺',
                  estado: e.estado || 'Activa'
                }))
              : [];

            return {
              id: c.id,
              nombre: c.nombre || 'Clínica Médica',
              direccion: c.direccion || 'Ciudad Obregón, Sonora',
              telefono: c.telefono || '',
              descripcion: c.descripcion || 'Atención médica profesional y citas digitales.',
              especialidades: listaEsp,
              totalEspecialistas: c.totalEspecialistas ?? 0,
              estado: 'Abierto',
              theme: this.temasTarjetas[idx % this.temasTarjetas.length],
              icono: c.logo || '🏥'
            };
          });

          if (!this.statsReales.totalClinicas) {
            this.statsReales.totalClinicas = this.consultorios.length;
          }

          // Si aún no cargaron las especialidades desde estadísticas, las extraemos de las clínicas
          if (!this.especialidadesDisponibles.length) {
            const mapa = new Map<string, { nombre: string; icono: string; totalClinicas: number }>();
            this.consultorios.forEach(cl => {
              cl.especialidades.forEach((e: any) => {
                const key = (e.nombre || '').trim().toLowerCase();
                if (!key) return;
                if (mapa.has(key)) {
                  mapa.get(key)!.totalClinicas++;
                } else {
                  mapa.set(key, { nombre: e.nombre.trim(), icono: e.icono || '🩺', totalClinicas: 1 });
                }
              });
            });
            this.especialidadesDisponibles = Array.from(mapa.values());
          }
        }
        this.aplicarFiltrosClinicas(false);
      },
      error: () => {
        this.consultorios = [];
        this.consultoriosFiltrados = [];
      }
    });
  }

  esUrlImagen(valor: string | null | undefined): boolean {
    if (!valor) return false;
    return valor.startsWith('http://') || valor.startsWith('https://') || valor.startsWith('data:image/');
  }

  // ================= FILTROS Y SELECTOR INNOVADOR =================
  toggleSelectorEspecialidades(event: Event) {
    event.stopPropagation();
    this.mostrarSelectorEspecialidades = !this.mostrarSelectorEspecialidades;
  }

  seleccionarEspecialidad(esp: { nombre: string; icono: string } | null) {
    if (!esp) {
      this.especialidadSeleccionada = '';
      this.iconoEspecialidadSeleccionada = '🩺';
    } else {
      this.especialidadSeleccionada = esp.nombre;
      this.iconoEspecialidadSeleccionada = esp.icono || '🩺';
    }
    this.mostrarSelectorEspecialidades = false;
    this.filtroDropdownEspecialidad = '';
    this.aplicarFiltrosClinicas(false);
  }

  aplicarFiltroRapido(esp: { nombre: string; icono: string }) {
    if (this.especialidadSeleccionada.toLowerCase() === esp.nombre.toLowerCase()) {
      this.seleccionarEspecialidad(null);
    } else {
      this.seleccionarEspecialidad(esp);
      this.aplicarFiltrosClinicas(true);
    }
  }

  buscarClinica() {
    this.mostrarSelectorEspecialidades = false;
    this.aplicarFiltrosClinicas(true);
  }

  aplicarFiltrosClinicas(hacerScroll: boolean) {
    const t = this.terminoBusqueda.trim().toLowerCase();
    const esp = this.especialidadSeleccionada.trim().toLowerCase();

    this.consultoriosFiltrados = this.consultorios.filter(c => {
      const coincideTexto =
        !t ||
        (c.nombre || '').toLowerCase().includes(t) ||
        (c.direccion || '').toLowerCase().includes(t) ||
        (c.descripcion || '').toLowerCase().includes(t) ||
        (c.especialidades || []).some((e: any) => (e.nombre || '').toLowerCase().includes(t));

      const coincideEsp =
        !esp ||
        (c.especialidades || []).some((e: any) => (e.nombre || '').toLowerCase().includes(esp)) ||
        (c.descripcion || '').toLowerCase().includes(esp);

      return coincideTexto && coincideEsp;
    });

    if (hacerScroll) {
      const seccion = document.getElementById('clinicas');
      if (seccion) seccion.scrollIntoView({ behavior: 'smooth' });
    }
  }

  limpiarFiltros() {
    this.terminoBusqueda = '';
    this.especialidadSeleccionada = '';
    this.iconoEspecialidadSeleccionada = '🩺';
    this.filtroDropdownEspecialidad = '';
    this.consultoriosFiltrados = [...this.consultorios];
  }

  // ================= NAVEGACIÓN =================
  verPerfilClinica(clinica: any) {
    this.router.navigate(['/clinica', clinica.id || 1]);
  }

  irAPlanes() {
    const seccion = document.getElementById('planes');
    if (seccion) seccion.scrollIntoView({ behavior: 'smooth' });
  }

  abrirModalLogin(modo: 'login' | 'registro' = 'login') {
    this.modoAuth = modo;
    this.verPasswordLogin = false;
    this.verPasswordRegistro = false;
    this.mostrarModalLogin = true;
  }

  abrirRegistroClinica(planId: string) {
    this.verPasswordClinica = false;
    this.registroClinica = {
      nombreClinica: '',
      logo: '🏥',
      direccion: '',
      telefono: '',
      descripcion: '',
      plan: planId || 'Basico',
      nombreAdmin: '',
      correoAdmin: '',
      passwordAdmin: ''
    };
    this.mostrarModalRegistroClinica = true;
  }

  irADashboard() {
    this.router.navigate(['/dashboard']);
  }

  cerrarSesionInicio() {
    localStorage.removeItem('token_medical_staff');
    localStorage.removeItem('correo_usuario');
    localStorage.removeItem('rol_usuario');
    localStorage.removeItem('nombre_usuario');
    localStorage.removeItem('clinica_id');
    localStorage.removeItem('paciente_id');
    this.usuarioLogueado = null;
    this.mostrarPortalPaciente = false;
  }

  // ================= PORTAL DEL PACIENTE (MIS CITAS / HISTORIAL / MI PERFIL) =================
  abrirPortalPaciente(tab: 'citas' | 'historial' | 'perfil') {
    this.tabPortalPaciente = tab;
    this.mostrarPortalPaciente = true;
    this.cargarDatosTabPortal(tab);
  }

  cambiarTabPortal(tab: 'citas' | 'historial' | 'perfil') {
    this.tabPortalPaciente = tab;
    this.cargarDatosTabPortal(tab);
  }

  private cargarDatosTabPortal(tab: 'citas' | 'historial' | 'perfil') {
    this.cargandoPortal = true;

    if (tab === 'citas') {
      this.http.get<any[]>(`${this.apiBase}/Citas/mis-citas`).subscribe({
        next: (lista) => {
          this.cargandoPortal = false;
          this.misCitas = Array.isArray(lista) ? lista : [];
        },
        error: () => {
          this.cargandoPortal = false;
          this.misCitas = [];
        }
      });
    } else if (tab === 'historial') {
      this.http.get<any[]>(`${this.apiBase}/NotasMedicas/mi-historial`).subscribe({
        next: (lista) => {
          this.cargandoPortal = false;
          this.miHistorial = Array.isArray(lista) ? lista : [];
        },
        error: () => {
          this.cargandoPortal = false;
          this.miHistorial = [];
        }
      });
    } else if (tab === 'perfil') {
      this.http.get<any>(`${this.apiBase}/Pacientes/mi-perfil`).subscribe({
        next: (p) => {
          this.cargandoPortal = false;
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
        error: () => {
          this.cargandoPortal = false;
        }
      });
    }
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
        const nuevoNombre = `${payload.nombre} ${payload.apellidos}`.trim();
        localStorage.setItem('nombre_usuario', nuevoNombre);
        if (this.usuarioLogueado) {
          this.usuarioLogueado = { ...this.usuarioLogueado, nombre: nuevoNombre };
        }
        Swal.fire({ title: 'Perfil actualizado', icon: 'success', timer: 1400, showConfirmButton: false });
      },
      error: (err) => {
        this.guardandoPerfil = false;
        Swal.fire('Error', this.extraerError(err, 'No se pudo actualizar tu perfil.'), 'error');
      }
    });
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

  // --- LOGIN UNIFICADO (PERSONAL Y PACIENTES) ---
  iniciarSesion() {
    const correoLimpio = this.credenciales.correo.trim().toLowerCase();
    if (!correoLimpio || !this.credenciales.password) {
      Swal.fire('Campos incompletos', 'Por favor ingresa tu correo y contraseña.', 'warning');
      return;
    }

    this.cargandoLogin = true;
    const payload = { correo: correoLimpio, password: this.credenciales.password };

    this.http.post(`${this.apiBase}/Usuarios/login`, payload, { responseType: 'text' }).subscribe({
      next: (token: string) => {
        this.cargandoLogin = false;
        const tokenLimpio = token.replace(/"/g, '');
        const sesion = this.guardarSesionDesdeToken(tokenLimpio, correoLimpio);

        this.mostrarModalLogin = false;
        this.credenciales = { correo: '', password: '' };

        if (sesion.rol.toLowerCase() === 'paciente') {
          Swal.fire({
            title: `¡Hola, ${sesion.nombre}!`,
            text: 'Ya puedes agendar citas, revisar tu historial o editar tu perfil desde la barra superior.',
            icon: 'success',
            timer: 1900,
            showConfirmButton: false
          });
        } else {
          Swal.fire({
            title: '¡Bienvenido!',
            text: 'Acceso autorizado al panel clínico.',
            icon: 'success',
            timer: 1200,
            showConfirmButton: false
          }).then(() => {
            this.router.navigate(['/dashboard']);
          });
        }
      },
      error: (err) => {
        this.cargandoLogin = false;
        Swal.fire('Acceso Denegado', this.extraerError(err, 'Correo o contraseña incorrectos.'), 'error');
      }
    });
  }

  // --- REGISTRO DE PACIENTE ---
  registrarPaciente() {
    const r = this.registroPaciente;
    if (!r.nombre.trim() || !r.apellidos.trim() || !r.curp.trim() || !r.correo.trim() || !r.password) {
      Swal.fire('Campos obligatorios', 'Nombre, Apellidos, CURP, Correo y Contraseña son requeridos.', 'warning');
      return;
    }

    const telefonoLimpio = (r.telefono || '').replace(/[\s-]/g, '');
    if (telefonoLimpio && !/^\d{10}$/.test(telefonoLimpio)) {
      Swal.fire('Teléfono inválido', 'Ingresa un número de 10 dígitos.', 'warning');
      return;
    }

    this.cargandoLogin = true;
    const payload = {
      nombre: r.nombre.trim(),
      apellidos: r.apellidos.trim(),
      curp: r.curp.trim().toUpperCase(),
      sexo: r.sexo || 'No especificado',
      fechaNacimiento: r.fechaNacimiento ? `${r.fechaNacimiento}T12:00:00.000Z` : null,
      telefono: telefonoLimpio || null,
      correo: r.correo.trim().toLowerCase(),
      password: r.password
    };

    this.http.post<any>(`${this.apiBase}/Usuarios/registro-paciente`, payload).subscribe({
      next: (res) => {
        this.cargandoLogin = false;
        if (res?.token) {
          this.guardarSesionDesdeToken(res.token, payload.correo);
        }
        this.mostrarModalLogin = false;
        this.cargarEstadisticasPublicas();
        Swal.fire({
          title: '¡Cuenta creada!',
          text: 'Tus datos quedaron listos para agendar citas en cualquier clínica.',
          icon: 'success',
          timer: 1900,
          showConfirmButton: false
        }).then(() => {
          const seccion = document.getElementById('clinicas');
          if (seccion) seccion.scrollIntoView({ behavior: 'smooth' });
        });
      },
      error: (err) => {
        this.cargandoLogin = false;
        Swal.fire('No se pudo registrar', this.extraerError(err, 'Verifica los datos ingresados.'), 'error');
      }
    });
  }

  // --- REGISTRO DE NUEVA CLÍNICA + PLAN ---
  registrarClinica() {
    const c = this.registroClinica;
    if (!c.nombreClinica.trim() || !c.nombreAdmin.trim() || !c.correoAdmin.trim() || !c.passwordAdmin) {
      Swal.fire('Datos incompletos', 'Completa el nombre de tu clínica y los datos del administrador.', 'warning');
      return;
    }

    this.cargandoClinica = true;
    const payload = {
      nombreClinica: c.nombreClinica.trim(),
      logo: c.logo?.trim() || '🏥',
      direccion: c.direccion?.trim() || null,
      telefono: c.telefono?.trim() || null,
      descripcion: c.descripcion?.trim() || null,
      plan: c.plan || 'Basico',
      nombreAdmin: c.nombreAdmin.trim(),
      correoAdmin: c.correoAdmin.trim().toLowerCase(),
      passwordAdmin: c.passwordAdmin
    };

    this.http.post<any>(`${this.apiBase}/Clinicas/registrar`, payload).subscribe({
      next: (res) => {
        this.cargandoClinica = false;
        if (res?.token) {
          this.guardarSesionDesdeToken(res.token, payload.correoAdmin);
        }
        this.mostrarModalRegistroClinica = false;
        Swal.fire({
          title: `¡${res?.nombreClinica || 'Clínica'} registrada!`,
          text: `Tu plan ${res?.plan || c.plan} está activo. Entrando a tu panel administrativo...`,
          icon: 'success',
          timer: 1800,
          showConfirmButton: false
        }).then(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: (err) => {
        this.cargandoClinica = false;
        Swal.fire('Error al registrar clínica', this.extraerError(err, 'No se pudo completar el registro.'), 'error');
      }
    });
  }
}