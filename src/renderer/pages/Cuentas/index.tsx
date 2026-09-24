import { useNavigate } from "react-router-dom";
import { Landmark, Building2 } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/ui/Table";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { useSaldosTodos, useSaldosTodosClinicas } from "../../features/cuentas/hooks";
import { formatearMoneda } from "../../lib/format";

export default function Cuentas() {
  const navigate = useNavigate();
  const { data: saldos, isLoading } = useSaldosTodos();
  const { data: saldosClinicas, isLoading: cargandoClinicas } = useSaldosTodosClinicas();

  return (
    <div>
      <PageHeader title="Cuentas" description="Cuenta corriente de cada odontólogo y de cada clínica, por moneda." />

      {!isLoading && saldos?.length === 0 && (
        <EmptyState icon={<Landmark size={28} />} title="Todavía no hay movimientos de odontólogos" />
      )}

      {(isLoading || (saldos && saldos.length > 0)) && (
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
            {saldos?.map((s) => (
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

      {saldosClinicas && saldosClinicas.length > 0 && (
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
              {saldosClinicas?.map((s) => (
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
