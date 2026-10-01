import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { useUsuarios } from "../../features/usuarios/hooks";
import { formatearFechaHora, formatearRol } from "../../lib/format";
import { UsuarioForm } from "./UsuarioForm";
import { UsuarioDetalle } from "./UsuarioDetalle";

function Avatar({ nombre }: { nombre: string }) {
  const inicial = nombre.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-carbon text-gold text-sm font-semibold">
      {inicial}
    </span>
  );
}

export default function Usuarios() {
  const { data: usuarios, isLoading } = useUsuarios();
  const [formAbierto, setFormAbierto] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  // Se busca en la lista viva (no se guarda una copia congelada del
  // usuario) para que el panel de detalle refleje al instante cualquier
  // cambio hecho desde ahí mismo (desactivar, cambiar rol, etc.), sin
  // tener que cerrarlo y volver a abrirlo.
  const seleccionado = usuarios?.find((u) => u.id === seleccionadoId) ?? null;

  return (
    <div>
      <PageHeader
        title="Usuarios"
        description="Gestioná las cuentas que tienen acceso a Densz."
        actions={
          <Button onClick={() => setFormAbierto(true)}>
            <Plus size={16} /> Nuevo usuario
          </Button>
        }
      />

      <Table>
        <Thead>
          <Tr>
            <Th>Usuario</Th>
            <Th>Rol</Th>
            <Th>Último acceso</Th>
            <Th>Estado</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {!isLoading &&
            usuarios?.map((u) => (
              <Tr key={u.id} className="cursor-pointer" onClick={() => setSeleccionadoId(u.id)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar nombre={u.nombreUsuario} />
                    <p className="font-medium text-carbon font-mono truncate">@{u.nombreUsuario}</p>
                  </div>
                </Td>
                <Td>
                  <Badge tono="gold">{u.rolNombre ? formatearRol(u.rolNombre) : "—"}</Badge>
                </Td>
                <Td className="text-carbon/50 text-xs">{u.ultimoAcceso ? formatearFechaHora(u.ultimoAcceso) : "Nunca"}</Td>
                <Td>
                  <Badge tono={u.activo ? "exito" : "neutral"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                </Td>
                <Td>
                  <ChevronRight size={16} className="text-carbon/30" />
                </Td>
              </Tr>
            ))}
        </Tbody>
      </Table>

      <UsuarioForm open={formAbierto} onOpenChange={setFormAbierto} />
      {seleccionado && (
        <UsuarioDetalle open onOpenChange={(o) => !o && setSeleccionadoId(null)} usuario={seleccionado} />
      )}
    </div>
  );
}
