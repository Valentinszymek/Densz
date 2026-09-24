import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Download, FileSpreadsheet, FileText, FileType, ChevronRight } from "lucide-react";
import type { RangoFechas, FiltroAuditoriaDto } from "@shared/types/entities";
import { Button } from "./Button";
import { useExportar } from "../../features/export/hooks";

type TipoExport = "odontologos" | "clinicas" | "pacientes" | "trabajos" | "cuenta" | "pagos" | "estadisticas" | "auditoria";

interface GrupoExport {
  tipo: TipoExport;
  /** Cómo se llama esta opción dentro del menú (ej. "Cuenta", "Pagos"). */
  etiqueta: string;
  nombreSugerido: string;
  odontologoId?: number;
  clinicaId?: number;
  rango?: RangoFechas;
  filtroAuditoria?: FiltroAuditoriaDto;
}

interface ExportMenuProps {
  /** Modo simple (un solo destino) — como se usa en la mayoría de las pantallas. */
  tipo?: TipoExport;
  nombreSugerido?: string;
  odontologoId?: number;
  clinicaId?: number;
  rango?: RangoFechas;
  filtroAuditoria?: FiltroAuditoriaDto;
  /** Modo múltiple: varios destinos posibles (ej. "Cuenta" y "Pagos") bajo
   * un único botón "Exportar", en vez de un botón repetido por cada uno
   * (evita el "Exportar / Exportar" duplicado en Cuentas). */
  grupos?: GrupoExport[];
}

const ITEMS_FORMATO: Array<{ formato: "csv" | "xlsx" | "pdf"; etiqueta: string; icono: typeof FileText }> = [
  { formato: "csv", etiqueta: "CSV", icono: FileText },
  { formato: "xlsx", etiqueta: "Excel", icono: FileSpreadsheet },
  { formato: "pdf", etiqueta: "PDF", icono: FileType }
];

const itemClase = "flex items-center gap-2 px-3 py-2 text-sm hover:bg-gold/10 cursor-pointer outline-none";

export function ExportMenu(props: ExportMenuProps) {
  const exportar = useExportar();
  const grupos: GrupoExport[] =
    props.grupos ??
    (props.tipo && props.nombreSugerido
      ? [
          {
            tipo: props.tipo,
            etiqueta: "Exportar",
            nombreSugerido: props.nombreSugerido,
            odontologoId: props.odontologoId,
            clinicaId: props.clinicaId,
            rango: props.rango,
            filtroAuditoria: props.filtroAuditoria
          }
        ]
      : []);

  function onExportar(g: GrupoExport, formato: "csv" | "xlsx" | "pdf") {
    exportar.mutate({
      tipo: g.tipo,
      formato,
      nombreSugerido: g.nombreSugerido,
      opciones: { odontologoId: g.odontologoId, clinicaId: g.clinicaId, rango: g.rango, filtroAuditoria: g.filtroAuditoria }
    });
  }

  const modoMultiple = grupos.length > 1;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="sm" disabled={exportar.isPending}>
          <Download size={14} /> Exportar
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[170px] rounded-lg bg-cream-card border border-carbon/10 shadow-lg py-1">
          {!modoMultiple &&
            grupos[0] &&
            ITEMS_FORMATO.map(({ formato, etiqueta, icono: Icono }) => (
              <DropdownMenu.Item key={formato} onSelect={() => onExportar(grupos[0], formato)} className={itemClase}>
                <Icono size={14} /> {etiqueta}
              </DropdownMenu.Item>
            ))}

          {modoMultiple &&
            grupos.map((g) => (
              <DropdownMenu.Sub key={g.tipo}>
                <DropdownMenu.SubTrigger className={`${itemClase} justify-between`}>
                  <span>{g.etiqueta}</span>
                  <ChevronRight size={13} className="text-carbon/40" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent
                    sideOffset={4}
                    className="z-50 min-w-[150px] rounded-lg bg-cream-card border border-carbon/10 shadow-lg py-1"
                  >
                    {ITEMS_FORMATO.map(({ formato, etiqueta, icono: Icono }) => (
                      <DropdownMenu.Item key={formato} onSelect={() => onExportar(g, formato)} className={itemClase}>
                        <Icono size={14} /> {etiqueta}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
