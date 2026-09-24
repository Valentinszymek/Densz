import { HashRouter, Routes, Route } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { RutaProtegida } from "../components/layout/RutaProtegida";
import { RutaSoloAdmin } from "../components/layout/RutaSoloAdmin";
import { ProteccionGuard } from "../components/proteccion/ProteccionGuard";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Odontologos from "../pages/Odontologos";
import OdontologoDetalle from "../pages/Odontologos/OdontologoDetalle";
import Clinicas from "../pages/Clinicas";
import ClinicaDetalle from "../pages/Clinicas/ClinicaDetalle";
import Pacientes from "../pages/Pacientes";
import PacienteDetalle from "../pages/Pacientes/PacienteDetalle";
import Trabajos from "../pages/Trabajos";
import NuevoTrabajo from "../pages/Trabajos/NuevoTrabajo";
import OrdenDetalle from "../pages/Trabajos/OrdenDetalle";
import Precios from "../pages/Precios";
import Cuentas from "../pages/Cuentas";
import CuentaDetalle from "../pages/Cuentas/CuentaDetalle";
import ClinicaCuentaDetalle from "../pages/Cuentas/ClinicaCuentaDetalle";
import Comprobantes from "../pages/Comprobantes";
import Estadisticas from "../pages/Estadisticas";
import Backups from "../pages/Backups";
import Configuracion from "../pages/Configuracion";
import Usuarios from "../pages/Usuarios";
import Auditoria from "../pages/Auditoria";

// HashRouter (en vez de BrowserRouter): la app se sirve desde file://
// en producción, sin servidor HTTP que resuelva rutas arbitrarias.
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RutaProtegida />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/odontologos" element={<Odontologos />} />
            <Route path="/odontologos/:id" element={<OdontologoDetalle />} />
            <Route path="/clinicas" element={<Clinicas />} />
            <Route path="/clinicas/:id" element={<ClinicaDetalle />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/:id" element={<PacienteDetalle />} />
            <Route path="/trabajos" element={<Trabajos />} />
            <Route path="/trabajos/nuevo" element={<NuevoTrabajo />} />
            <Route path="/trabajos/:id/editar" element={<NuevoTrabajo />} />
            <Route path="/trabajos/:id" element={<OrdenDetalle />} />
            {/* Secciones restringidas a ADMINISTRADOR: además de estar
                ocultas del sidebar (navigation.ts), un RutaSoloAdmin evita
                llegar por URL directa. La validación real igual vive en el
                proceso main (requerirPermiso en cada handler IPC) — esto
                es solo para no mostrar una pantalla que de entrada va a
                fallar. */}
            <Route element={<RutaSoloAdmin />}>
              <Route path="/precios" element={<Precios />} />
              <Route path="/comprobantes" element={<Comprobantes />} />
              <Route path="/backups" element={<Backups />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/auditoria" element={<Auditoria />} />
              {/* Cuentas y Estadísticas comparten la misma protección
                  opcional por contraseña (§3, §4) — un único guard cubre
                  ambas, así el desbloqueo también se comparte (§11). */}
              <Route element={<ProteccionGuard />}>
                <Route path="/cuentas" element={<Cuentas />} />
                <Route path="/cuentas/clinica/:id" element={<ClinicaCuentaDetalle />} />
                <Route path="/cuentas/:id" element={<CuentaDetalle />} />
                <Route path="/estadisticas" element={<Estadisticas />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  );
}
