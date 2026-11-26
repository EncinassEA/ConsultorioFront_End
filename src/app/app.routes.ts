import { Routes } from '@angular/router';
import { InicioComponent } from './features/inicio/inicio.component';
import { DashboardClinicaComponent } from './features/dashboard-clinica/dashboard-clinica.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardClinicaComponent },
  { path: '', component: InicioComponent },
  { path: '**', redirectTo: '' }
];