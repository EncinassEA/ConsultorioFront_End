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
  vistaPreviaPaciente: boolean = false;

  clinica: any = {
    id: 1,
    nombre: 'Clínica Medical Staff',
    logo: '🏥',
    direccion: 'Av. Miguel Alemán 153 Sur, Cd. Obregón',
    telefono: '644 415 3044',
    descripcion: 'Clínica médica general y especialidades.',
    limiteEspecialidades: 3
  };

  especialidades: any[] = [];

  // Modales de edición (solo Admin)
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

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get modoEdicion(): boolean {
    return this.esAdmin && !this.vistaPreviaPaciente;
  }

  ngOnInit() {
    const idParam = Number(this.route.snapshot.paramMap.get('id'));
    if (idParam > 0) this.clinicaId = idParam;

    this.esAdmin = !!localStorage.getItem('token_medical_staff');
    this.cargarPerfil();
  }

  cargarPerfil() {
    this.http.get<any>(`${this.apiBase}/Especialidades/clinica/${this.clinicaId}`).subscribe({
      next: (res) => {
        if (res?.clinica) this.clinica = res.clinica;
        if (Array.isArray(res?.especialidades)) this.especialidades = res.especialidades;
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

  // --- EDICIÓN DE CLÍNICA (ADMIN) ---
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
        Swal.fire('Error', err?.error || 'No se pudo actualizar la clínica.', 'error');
      }
    });
  }

  // --- CRUD ESPECIALIDADES (ADMIN) ---
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
        Swal.fire('Aviso', typeof err?.error === 'string' ? err.error : 'No se pudo guardar la especialidad.', 'warning');
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
          next: () => {
            this.cargarPerfil();
          },
          error: () => Swal.fire('Error', 'No se pudo eliminar la especialidad.', 'error')
        });
      }
    });
  }

  // --- ACCIÓN DE CITA (PACIENTE) ---
  solicitarCita(esp: any) {
    if (esp.estado !== 'Activa') return;
    Swal.fire({
      title: `Agendar en ${esp.nombre}`,
      text: `Clínica: ${this.clinica.nombre}. Aquí conectaremos el formulario público de citas.`,
      icon: 'info',
      confirmButtonText: 'Entendido'
    });
  }

  volverAlDashboard() {
    this.router.navigate(['/dashboard']);
  }
}