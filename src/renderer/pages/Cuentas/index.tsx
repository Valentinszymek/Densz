import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark, Building2, Search } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { useSaldosTodos, useSaldosTodosClinicas } from "../../features/cuentas/hooks";
import { formatearMoneda } from "../../lib/format";

export default function Cuentas() {
  const navigate = useNavigate();
  const { data: saldos, isLoading } = useSaldosTodos();
  const { data: saldosClinicas, isLoading: cargandoClinicas } = useSaldosTodosClinicas();
  const [busqueda, setBusqueda] = useState("");

  // Filtro de interfaz: los saldos ya vienen calculados del backend, acá
  // solo se filtra qué filas mostrar — nunca se tocan montos/DEBE/HABER.
  const texto = busqueda.trim().toLowerCase();
  const saldosFiltrados = useMemo(
    () => (texto ? saldos?.filter((s) => s.odontologoNombre.toLowerCase().includes(texto)) : saldos),
    [saldos, texto]
  );
  const saldosClinicasFiltrados = useMemo(
    () => (texto ? saldosClinicas?.filter((s) => s.clinicaNombre.toLowerCase().includes(texto)) : saldosClinicas),
    [saldosClinicas, texto]
  );

  return (
    <div>
      <PageHeader title="Cuentas" description="Cuenta corriente de cada odontólogo y de cada clínica, por moneda." />

      <div className="relative max-w-sm w-full mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-carbon/35" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar odontólogo o clínica…"
          className="pl-9"
        />
      </div>

      {!isLoading && saldosFiltrados?.length === 0 && (
        <EmptyState
          icon={<Landmark size={28} />}
          title={texto ? "Ningún odontólogo coincide con la búsqueda" : "Todavía no hay movimientos de odontólogos"}
        />
      )}

      {(isLoading || (saldosFiltrados && saldosFiltrados.length > 0)) && (
        <Table>
          <Thead>
            <Tr>
              <Th>Odontólogo</Th>
              <Th>Debe</Th>
              <Th>Haber</Th>
              <Th>Saldo</Th>
            </Tr>
          </Thead>
          <Tbody>
            {saldosFiltrados?.map((s) => (
              <Tr key={s.odontologoId} className="cursor-pointer" onClick={() => navigate(`/cuentas/${s.odontologoId}`)}>
                <Td className="font-medium">{s.odontologoNombre}</Td>
                <Td className="text-carbon/60">
                  {s.saldos.map((m) => (
                    <div key={m.moneda}>{formatearMoneda(m.totalDebeCentavos, m.moneda)}</div>
                  ))}
                </Td>
                <Td className="text-carbon/60">
                  {s.saldos.map((m) => (
                    <div key={m.moneda}>{formatearMoneda(m.totalHaberCentavos, m.moneda)}</div>
                  ))}
                </Td>
                <Td>
                  <div className="flex flex-col gap-1 items-start">
                    {s.saldos.map((m) => (
                      <Badge key={m.moneda} tono={m.saldoCentavos > 0 ? "advertencia" : "exito"}>
                        {formatearMoneda(m.saldoCentavos, m.moneda)}
                      </Badge>
                    ))}
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {saldosClinicasFiltrados && saldosClinicasFiltrados.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-carbon/40 mt-8 mb-2">
            <Building2 size={13} /> Clínicas
          </p>
          <Table>
            <Thead>
              <Tr>
                <Th>Clínica</Th>
                <Th>Debe</Th>
                <Th>Haber</Th>
                <Th>Saldo</Th>
              </Tr>
            </Thead>
            <Tbody>
              {saldosClinicasFiltrados?.map((s) => (
                <Tr key={s.clinicaId} className="cursor-pointer" onClick={() => navigate(`/cuentas/clinica/${s.clinicaId}`)}>
                  <Td className="font-medium">{s.clinicaNombre}</Td>
                  <Td className="text-carbon/60">
                    {s.saldos.map((m) => (
                      <div key={m.moneda}>{formatearMoneda(m.totalDebeCentavos, m.moneda)}</div>
                    ))}
                  </Td>
                  <Td className="text-carbon/60">
                    {s.saldos.map((m) => (
                      <div key={m.moneda}>{formatearMoneda(m.totalHaberCentavos, m.moneda)}</div>
                    ))}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1 items-start">
                      {s.saldos.map((m) => (
                        <Badge key={m.moneda} tono={m.saldoCentavos > 0 ? "advertencia" : "exito"}>
                          {formatearMoneda(m.saldoCentavos, m.moneda)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </>
      )}
      {cargandoClinicas && null}
    </div>
  );
}
