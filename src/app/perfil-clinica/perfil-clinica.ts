import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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
  cargandoPerfil: boolean = true;
  errorCarga: string = '';

  esAdmin: boolean = false;
  esStaff: boolean = false;
  esPaciente: boolean = false;
  nombreUsuario: string = '';
  vistaPreviaPaciente: boolean = false;

  // Datos reales desde Neon (sin valores falsos precargados)
  clinica: any = null;
  especialidades: any[] = [];
  doctores: any[] = [];

  // Estados de edición directa (inline) para Admin
  editandoIdentidad: boolean = false;
  editandoDescripcion: boolean = false;
  editandoUbicacion: boolean = false;
  guardandoInline: boolean = false;
  borradorClinica: any = {};

  // Drag & Drop de logo (PNG / JPG)
  arrastrandoLogo: boolean = false;
  arrastrandoLogoModal: boolean = false;
  subiendoLogo: boolean = false;

  // Modal general de edición de Clínica
  mostrarModalClinica: boolean = false;
  guardandoClinica: boolean = false;
  clinicaForm: any = {};

  // Modal de Especialidad (sin selector de emojis)
  mostrarModalEspecialidad: boolean = false;
  guardandoEspecialidad: boolean = false;
  especialidadForm: any = {
    id: 0,
    nombre: '',
    icono: '',
    descripcion: '',
    estado: 'Activa'
  };

  // Modal de Agendar Cita (Paciente — listo para el siguiente paso)
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
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  get modoEdicion(): boolean {
    return this.esAdmin && !this.vistaPreviaPaciente;
  }

  get limiteAlcanzado(): boolean {
    const limite = Number(this.clinica?.limiteEspecialidades || 3);
    return this.especialidades.length >= limite;
  }

  get inicialesClinica(): string {
    const nombre = (this.clinica?.nombre || 'CL').trim();
    const partes = nombre.split(/\s+/);
    return partes.length > 1
      ? (partes[0][0] + partes[1][0]).toUpperCase()
      : nombre.substring(0, 2).toUpperCase();
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

  private sincronizarConfigLocal() {
    if (!this.clinica) return;
    localStorage.setItem(
      'config_clinica_medical_staff',
      JSON.stringify({
        id: this.clinica.id,
        nombre: this.clinica.nombre,
        logo: this.clinica.logo,
        direccion: this.clinica.direccion,
        telefono: this.clinica.telefono
      })
    );
  }

  cargarPerfil() {
    this.cargandoPerfil = true;
    this.errorCarga = '';
    this.cdr.detectChanges();

    this.http.get<any>(`${this.apiBase}/Especialidades/clinica/${this.clinicaId}`).subscribe({
      next: (res) => {
        this.clinica = res?.clinica || null;
        this.especialidades = Array.isArray(res?.especialidades) ? res.especialidades : [];
        this.doctores = Array.isArray(res?.doctores) ? res.doctores : [];
        this.cargandoPerfil = false;
        if (this.esAdmin) this.sincronizarConfigLocal();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoPerfil = false;
        this.errorCarga = this.extraerError(err, 'No se pudo cargar la información de la clínica.');
        this.cdr.detectChanges();
      }
    });
  }

  esUrlImagen(valor: string | null | undefined): boolean {
    if (!valor) return false;
    return valor.startsWith('http://') || valor.startsWith('https://') || valor.startsWith('data:image/');
  }

  alternarVistaPrevia() {
    this.vistaPreviaPaciente = !this.vistaPreviaPaciente;
    if (this.vistaPreviaPaciente) {
      this.cancelarEdicionesInline();
    }
  }

  // ================= SUBIDA DE LOGO (DRAG & DROP PNG / JPG) =================
  onDragOverLogo(event: DragEvent, enModal: boolean = false) {
    if (!this.modoEdicion && !enModal) return;
    event.preventDefault();
    event.stopPropagation();
    if (enModal) this.arrastrandoLogoModal = true;
    else this.arrastrandoLogo = true;
  }

  onDragLeaveLogo(event: DragEvent, enModal: boolean = false) {
    event.preventDefault();
    event.stopPropagation();
    if (enModal) this.arrastrandoLogoModal = false;
    else this.arrastrandoLogo = false;
  }

  onDropLogo(event: DragEvent, enModal: boolean = false) {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoLogo = false;
    this.arrastrandoLogoModal = false;

    if (!this.modoEdicion && !enModal) return;
    const archivo = event.dataTransfer?.files?.[0];
    if (archivo) {
      this.procesarArchivoLogo(archivo, enModal);
    }
  }

  onSelectLogoFile(event: Event, enModal: boolean = false) {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (archivo) {
      this.procesarArchivoLogo(archivo, enModal);
    }
    input.value = '';
  }

  private procesarArchivoLogo(archivo: File, enModal: boolean) {
    const tiposValidos = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!tiposValidos.includes(archivo.type)) {
      Swal.fire('Formato no permitido', 'Sube una imagen en formato PNG o JPG.', 'warning');
      return;
    }

    if (archivo.size > 5 * 1024 * 1024) {
      Swal.fire('Imagen muy pesada', 'Selecciona una imagen menor a 5 MB.', 'warning');
      return;
    }

    this.subiendoLogo = true;
    this.cdr.detectChanges();

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar a máximo 420px para guardarlo rápido y ligero en la base de datos
        const maxSide = 420;
        let width = img.width;
        let height = img.height;

        if (width > maxSide || height > maxSide) {
          if (width > height) {
            height = Math.round((height * maxSide) / width);
            width = maxSide;
          } else {
            width = Math.round((width * maxSide) / height);
            height = maxSide;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        const formatoSalida = archivo.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = formatoSalida === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.86);

        if (enModal) {
          this.clinicaForm.logo = dataUrl;
          this.subiendoLogo = false;
          this.cdr.detectChanges();
        } else {
          this.guardarLogoDirecto(dataUrl);
        }
      };

      img.onerror = () => {
        this.subiendoLogo = false;
        this.cdr.detectChanges();
        Swal.fire('Error', 'No se pudo leer la imagen seleccionada.', 'error');
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(archivo);
  }

  private guardarLogoDirecto(dataUrl: string) {
    const payload = { ...this.clinica, logo: dataUrl };
    this.http.put<any>(`${this.apiBase}/Clinicas/${this.clinica.id}`, payload).subscribe({
      next: (actualizada) => {
        this.clinica = actualizada || payload;
        this.subiendoLogo = false;
        this.sincronizarConfigLocal();
        this.cdr.detectChanges();
        Swal.fire({ title: 'Logo actualizado', icon: 'success', timer: 1300, showConfirmButton: false });
      },
      error: (err) => {
        this.subiendoLogo = false;
        this.cdr.detectChanges();
        Swal.fire('Error al guardar logo', this.extraerError(err, 'No se pudo guardar el logo en la base de datos.'), 'error');
      }
    });
  }

  quitarLogoModal() {
    this.clinicaForm.logo = '';
  }

  // ================= EDICIÓN DIRECTA (INLINE) EN TARJETAS =================
  cancelarEdicionesInline() {
    this.editandoIdentidad = false;
    this.editandoDescripcion = false;
    this.editandoUbicacion = false;
  }

  iniciarEdicionInline(seccion: 'identidad' | 'descripcion' | 'ubicacion') {
    this.cancelarEdicionesInline();
    this.borradorClinica = { ...this.clinica };
    if (seccion === 'identidad') this.editandoIdentidad = true;
    if (seccion === 'descripcion') this.editandoDescripcion = true;
    if (seccion === 'ubicacion') this.editandoUbicacion = true;
  }

  guardarEdicionInline() {
    if (!this.borradorClinica.nombre?.trim()) {
      Swal.fire('Campo requerido', 'El nombre de la clínica es obligatorio.', 'warning');
      return;
    }

    this.guardandoInline = true;
    this.cdr.detectChanges();

    const payload = {
      ...this.clinica,
      nombre: this.borradorClinica.nombre.trim(),
      telefono: this.borradorClinica.telefono?.trim() || null,
      descripcion: this.borradorClinica.descripcion?.trim() || null,
      direccion: this.borradorClinica.direccion?.trim() || null
    };

    this.http.put<any>(`${this.apiBase}/Clinicas/${this.clinica.id}`, payload).subscribe({
      next: (actualizada) => {
        this.clinica = actualizada || payload;
        this.guardandoInline = false;
        this.cancelarEdicionesInline();
        this.sincronizarConfigLocal();
        this.cdr.detectChanges();
        Swal.fire({ title: 'Cambios guardados', icon: 'success', timer: 1200, showConfirmButton: false });
      },
      error: (err) => {
        this.guardandoInline = false;
        this.cdr.detectChanges();
        Swal.fire('Error', this.extraerError(err, 'No se pudieron guardar los cambios.'), 'error');
      }
    });
  }

  abrirEnGoogleMaps() {
    const dir = (this.clinica?.direccion || '').trim();
    if (!dir) {
      Swal.fire('Sin dirección', 'Agrega primero la dirección de la clínica para abrirla en el mapa.', 'info');
      return;
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`, '_blank');
  }

  // ================= MODAL GENERAL DE EDICIÓN DE CLÍNICA =================
  abrirModalEditarClinica() {
    this.cancelarEdicionesInline();
    this.clinicaForm = { ...this.clinica };
    this.mostrarModalClinica = true;
  }

  guardarClinica() {
    if (!this.clinicaForm.nombre?.trim()) {
      Swal.fire('Campo requerido', 'El nombre de la clínica es obligatorio.', 'warning');
      return;
    }

    this.guardandoClinica = true;
    this.cdr.detectChanges();

    const payload = {
      ...this.clinicaForm,
      nombre: this.clinicaForm.nombre.trim(),
      telefono: this.clinicaForm.telefono?.trim() || null,
      direccion: this.clinicaForm.direccion?.trim() || null,
      descripcion: this.clinicaForm.descripcion?.trim() || null
    };

    this.http.put<any>(`${this.apiBase}/Clinicas/${this.clinica.id}`, payload).subscribe({
      next: (actualizada) => {
        this.clinica = actualizada || payload;
        this.guardandoClinica = false;
        this.mostrarModalClinica = false;
        this.sincronizarConfigLocal();
        this.cdr.detectChanges();
        Swal.fire({ title: 'Perfil actualizado', icon: 'success', timer: 1400, showConfirmButton: false });
      },
      error: (err) => {
        this.guardandoClinica = false;
        this.cdr.detectChanges();
        Swal.fire('Error', this.extraerError(err, 'No se pudo actualizar la clínica.'), 'error');
      }
    });
  }

  // ================= CRUD ESPECIALIDADES (ADMIN) =================
  abrirModalNuevaEspecialidad() {
    if (this.limiteAlcanzado) {
      Swal.fire(
        'Límite de plan alcanzado',
        `Tu Plan ${this.clinica?.plan || 'Básico'} permite hasta ${this.clinica?.limiteEspecialidades || 3} especialidades.`,
        'info'
      );
      return;
    }

    this.especialidadForm = {
      id: 0,
      nombre: '',
      icono: '',
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

    this.guardandoEspecialidad = true;
    this.cdr.detectChanges();

    const esEdicion = this.especialidadForm.id > 0;
    const payload = {
      ...this.especialidadForm,
      nombre: this.especialidadForm.nombre.trim(),
      descripcion: this.especialidadForm.descripcion?.trim() || '',
      estado: this.especialidadForm.estado || 'Activa'
    };

    const req = esEdicion
      ? this.http.put(`${this.apiBase}/Especialidades/${this.especialidadForm.id}`, payload)
      : this.http.post(`${this.apiBase}/Especialidades`, payload);

    req.subscribe({
      next: () => {
        this.guardandoEspecialidad = false;
        this.mostrarModalEspecialidad = false;
        this.cdr.detectChanges();
        Swal.fire({
          title: esEdicion ? 'Especialidad actualizada' : 'Especialidad agregada',
          icon: 'success',
          timer: 1300,
          showConfirmButton: false
        });
        this.cargarPerfil();
      },
      error: (err) => {
        this.guardandoEspecialidad = false;
        this.cdr.detectChanges();
        Swal.fire('Aviso', this.extraerError(err, 'No se pudo guardar la especialidad.'), 'warning');
      }
    });
  }

  eliminarEspecialidad(esp: any) {
    Swal.fire({
      title: `¿Eliminar ${esp.nombre}?`,
      text: 'Dejará de mostrarse en el perfil público de tu clínica.',
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
    this.cdr.detectChanges();

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
        this.cdr.detectChanges();
        Swal.fire({
          title: '¡Cita solicitada!',
          text: res?.mensaje || 'Tu solicitud quedó en estado Pendiente hasta que la clínica la confirme.',
          icon: 'success'
        });
      },
      error: (err) => {
        this.enviandoCita = false;
        this.cdr.detectChanges();
        Swal.fire('No se pudo agendar', this.extraerError(err, 'Ocurrió un error al solicitar tu cita.'), 'error');
      }
    });
  }

  // ================= PORTAL DEL PACIENTE (PERFIL / CITAS / HISTORIAL) =================
  abrirMiPerfil() {
    this.mostrarModalMiPerfil = true;
    this.cdr.detectChanges();

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
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.mostrarModalMiPerfil = false;
        this.cdr.detectChanges();
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
    this.cdr.detectChanges();

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
        this.cdr.detectChanges();
        Swal.fire({ title: 'Perfil actualizado', icon: 'success', timer: 1400, showConfirmButton: false });
      },
      error: (err) => {
        this.guardandoPerfil = false;
        this.cdr.detectChanges();
        Swal.fire('Error', this.extraerError(err, 'No se pudo actualizar tu perfil.'), 'error');
      }
    });
  }

  abrirMisCitas() {
    this.mostrarModalMisCitas = true;
    this.cargandoMisCitas = true;
    this.cdr.detectChanges();

    this.http.get<any[]>(`${this.apiBase}/Citas/mis-citas`).subscribe({
      next: (lista) => {
        this.cargandoMisCitas = false;
        this.misCitas = Array.isArray(lista) ? lista : [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoMisCitas = false;
        this.cdr.detectChanges();
        Swal.fire('Error', this.extraerError(err, 'No se pudieron cargar tus citas.'), 'error');
      }
    });
  }

  abrirMiHistorial() {
    this.mostrarModalMiHistorial = true;
    this.cargandoMiHistorial = true;
    this.cdr.detectChanges();

    this.http.get<any[]>(`${this.apiBase}/NotasMedicas/mi-historial`).subscribe({
      next: (lista) => {
        this.cargandoMiHistorial = false;
        this.miHistorial = Array.isArray(lista) ? lista : [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoMiHistorial = false;
        this.cdr.detectChanges();
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