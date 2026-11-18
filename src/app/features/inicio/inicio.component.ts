import { Component } from '@angular/core';
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
export class InicioComponent {
  mostrarModalLogin: boolean = false;
  credenciales = { correo: '', password: '' };
  cargandoLogin: boolean = false;

  private apiLoginUrl = 'https://localhost:7290/api/Usuarios/login';

  listaEspecialidades = [
    'Odontología', 'Pediatría', 'Ginecología', 'Oftalmología', 
    'Dermatología', 'Medicina General', 'Ortopedia', 'Cardiología'
  ];

  consultorios = [
    { 
      nombre: 'Centro Médico Integral Sur', 
      direccion: 'Blvd. Rodolfo Elías Calles 542', 
      especialidades: ['Medicina General', 'Pediatría'], 
      especialistas: 5, 
      calificacion: 4.9, 
      resenas: 120, 
      estado: 'Abierto', 
      theme: 'blue-theme',
      icono: '🏥'
    },
    { 
      nombre: 'Sonrisas Sanas Obregón', 
      direccion: 'Calle California 312, Centro', 
      especialidades: ['Ortodoncia', 'Odontopediatría'], 
      especialistas: 3, 
      calificacion: 5.0, 
      resenas: 85, 
      estado: 'Abierto', 
      theme: 'teal-theme',
      icono: '🦷'
    },
    { 
      nombre: 'Clínica Visión Clara', 
      direccion: 'Plaza Tutuli, Local 12', 
      especialidades: ['Oftalmología', 'Óptica'], 
      especialistas: 2, 
      calificacion: 4.8, 
      resenas: 56, 
      estado: 'Cerrado', 
      theme: 'purple-theme',
      icono: '👁️'
    },
    { 
      nombre: 'CardioCare Sonora', 
      direccion: 'Av. Miguel Alemán 900 Norte', 
      especialidades: ['Cardiología', 'Medicina Interna'], 
      especialistas: 4, 
      calificacion: 4.9, 
      resenas: 210, 
      estado: 'Abierto', 
      theme: 'orange-theme',
      icono: '❤️'
    }
  ];

  beneficiosPacientes = [
    { titulo: 'Agenda 24/7', desc: 'Reserva tu cita en cualquier momento, sin esperar a que abran la clínica.', icono: '⏰' },
    { titulo: 'Historial Digital', desc: 'Tus recetas y diagnósticos guardados de forma segura en tu celular.', icono: '📱' },
    { titulo: 'Cero Filas', desc: 'Llega directo a tu consulta. El sistema avisa cuando es tu turno real.', icono: '🚶' },
    { titulo: 'Especialistas Certificados', desc: 'Verificamos las cédulas de todos los médicos en nuestra plataforma.', icono: '✅' }
  ];

  constructor(private http: HttpClient, private router: Router) {}

  buscarClinica() {
    Swal.fire('Directorio Médico', 'Filtrando consultorios disponibles en Ciudad Obregón...', 'info');
  }

  iniciarSesion() {
    if (!this.credenciales.correo || !this.credenciales.password) {
      Swal.fire('Campos incompletos', 'Por favor ingresa tu correo y contraseña.', 'warning');
      return;
    }

    this.cargandoLogin = true;
    this.http.post(this.apiLoginUrl, this.credenciales, { responseType: 'text' }).subscribe({
      next: (token: string) => {
        this.cargandoLogin = false;
        // Limpiamos comillas por si vienen en la respuesta y guardamos el JWT
        const tokenLimpio = token.replace(/"/g, '');
        localStorage.setItem('token_medical_staff', tokenLimpio);
        localStorage.setItem('correo_usuario', this.credenciales.correo);

        this.mostrarModalLogin = false;
        Swal.fire({
          title: '¡Bienvenido!',
          text: 'Acceso autorizado al panel clínico.',
          icon: 'success',
          timer: 1200,
          showConfirmButton: false
        }).then(() => {
          this.router.navigate(['/dashboard']);
        });
      },
      error: () => {
        this.cargandoLogin = false;
        Swal.fire('Acceso Denegado', 'Correo o contraseña incorrectos.', 'error');
      }
    });
  }
}