import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, FileText, Receipt } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { useComprobantes, useVerPdfComprobante } from "../../features/comprobantes/hooks";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { formatearMoneda, formatearFecha } from "../../lib/format";

export default function Comprobantes() {
  const [params] = useSearchParams();
  const odontologoId = params.get("odontologo") ? Number(params.get("odontologo")) : undefined;
  const clinicaId = params.get("clinica") ? Number(params.get("clinica")) : undefined;

  const [busquedaCruda, setBusquedaCruda] = useState("");
  const busqueda = useDebouncedValue(busquedaCruda, 200);
  const { data: comprobantes, isLoading } = useComprobantes({ odontologoId, clinicaId, busqueda });
  const verPdf = useVerPdfComprobante();

  return (
    <div>
      <PageHeader title="Comprobantes" description="Comprobantes de entrega (no fiscales) generados por cada orden." />

      <div className="relative max-w-xs w-full mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
        <Input
          value={busquedaCruda}
          onChange={(e) => setBusquedaCruda(e.target.value)}
          placeholder="Buscar por N° de comprobante u orden…"
          className="pl-9"
        />
      </div>

      {!isLoading && comprobantes?.length === 0 && (
        <EmptyState
          icon={<Receipt size={28} />}
          title="Sin comprobantes todavía"
          description="Se generan desde una orden de trabajo, con el botón 'Generar comprobante'."
        />
      )}

      {(isLoading || (comprobantes && comprobantes.length > 0)) && (
        <Table>
          <Thead>
            <Tr>
              <Th>N° Comprobante</Th>
              <Th>N° OT</Th>
              <Th>Odontólogo</Th>
              <Th>Paciente</Th>
              <Th>Fecha</Th>
              <Th>Total</Th>
              <Th>Estado</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {comprobantes?.map((c) => (
              <Tr key={c.id}>
                <Td className="font-mono font-medium">{c.numero}</Td>
                <Td className="font-mono text-carbon/60">{c.ordenNumero}</Td>
                <Td>
                  {c.clinicaNombre ? (
                    <>
                      <span className="font-medium">{c.clinicaNombre}</span>
                      <span className="block text-xs text-carbon/40">{c.odontologoNombre}</span>
                    </>
                  ) : (
                    c.odontologoNombre
                  )}
                </Td>
                <Td className="text-carbon/60">{c.pacienteNombreCompleto}</Td>
                <Td className="text-carbon/60">{formatearFecha(c.fechaEmision)}</Td>
                <Td className="font-medium">{formatearMoneda(c.totalCentavos, c.moneda)}</Td>
                <Td>
                  <Badge tono={c.anulado ? "error" : "exito"}>{c.anulado ? "Anulado" : "Vigente"}</Badge>
                </Td>
                <Td>
                  {!c.anulado && (
                    <Button variant="ghost" size="sm" onClick={() => verPdf.mutate(c.id)}>
                      <FileText size={14} /> Ver PDF
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
