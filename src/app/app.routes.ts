import { Routes } from '@angular/router';
import { InicioComponent } from './features/inicio/inicio.component';
import { DashboardClinicaComponent } from './features/dashboard-clinica/dashboard-clinica.component';
import { PerfilClinica } from './perfil-clinica/perfil-clinica';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardClinicaComponent },
  { path: 'clinica', component: PerfilClinica },
  { path: 'clinica/:id', component: PerfilClinica },
  { path: '', component: InicioComponent },

  { path: '**', redirectTo: '' }
];