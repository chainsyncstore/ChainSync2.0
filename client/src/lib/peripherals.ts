export type ConnectionType = "usb" | "serial" | "bluetooth" | "network" | "keyboard-emulation" | "unknown";

export interface PeripheralCapability {
  type: "SCANNER" | "PRINTER";
  vendor?: string;
  model?: string;
  connection: ConnectionType;
  isAvailable: boolean;
  lastChecked: number;
  metadata?: Record<string, unknown>;
}

export interface ScannerProfile {
  id: string;
  label: string;
  triggerKey?: string;
  connection: ConnectionType;
  vendorHint?: string;
  modelHint?: string;
}

export interface PrinterProfile {
  id: string;
  label: string;
  supportsGraphics: boolean;
  paperWidthMm: number;
  connection: ConnectionType;
  vendorHint?: string;
  modelHint?: string;
}

export const DEFAULT_SCANNER_PROFILE: ScannerProfile = {
  id: "keyboard-basic",
  label: "Keyboard Wedge Scanner",
  triggerKey: "Enter",
  connection: "keyboard-emulation",
};

export const DEFAULT_PRINTER_PROFILE: PrinterProfile = {
  id: "thermal-58mm",
  label: "Thermal Receipt Printer (58mm)",
  supportsGraphics: false,
  paperWidthMm: 58,
  connection: "usb",
};

export function profileFromCapability(capability: PeripheralCapability): ScannerProfile | null {
  if (capability.type !== "SCANNER") return null;
  return {
    id: capability.vendor ? `${capability.vendor}-${capability.model || "generic"}` : `scanner-${capability.connection}`,
    label: capability.vendor && capability.model ? `${capability.vendor} ${capability.model}` : "Detected Scanner",
    triggerKey: "Enter",
    connection: capability.connection,
    vendorHint: capability.vendor,
    modelHint: capability.model,
  };
}

export function printerProfileFromCapability(capability: PeripheralCapability): PrinterProfile | null {
  if (capability.type !== "PRINTER") return null;
  return {
    id: capability.vendor ? `${capability.vendor}-${capability.model || "generic"}` : `printer-${capability.connection}`,
    label: capability.vendor && capability.model ? `${capability.vendor} ${capability.model}` : "Detected Printer",
    supportsGraphics: Boolean(capability.metadata?.supportsGraphics),
    paperWidthMm: Number(capability.metadata?.paperWidthMm) || 58,
    connection: capability.connection,
    vendorHint: capability.vendor,
    modelHint: capability.model,
  };
}

export async function detectScannerCapabilities(): Promise<PeripheralCapability[]> {
  const capabilities: PeripheralCapability[] = [];
  try {
    if ((navigator as any).usb?.getDevices) {
      const devices = await (navigator as any).usb.getDevices();
      devices.forEach((device: any) => {
        capabilities.push({
          type: "SCANNER",
          vendor: device.productName || device.manufacturerName,
          model: device.serialNumber || device.productName,
          connection: "usb",
          isAvailable: true,
          lastChecked: Date.now(),
          metadata: { vendorId: device.vendorId, productId: device.productId },
        });
      });
    }
  } catch (error) {
    console.warn("USB scanner capability detection failed", error);
  }

  if (capabilities.length === 0) {
    capabilities.push({
      type: "SCANNER",
      connection: "keyboard-emulation",
      isAvailable: true,
      lastChecked: Date.now(),
      metadata: { fallback: true },
    });
  }

  return capabilities;
}

export async function detectPrinterCapabilities(): Promise<PeripheralCapability[]> {
  const capabilities: PeripheralCapability[] = [];
  try {
    if ((navigator as any).usb?.getDevices) {
      const devices = await (navigator as any).usb.getDevices();
      devices
        .filter((device: any) => /printer/i.test(device.productName || ""))
        .forEach((device: any) => {
          capabilities.push({
            type: "PRINTER",
            vendor: device.productName || device.manufacturerName,
            model: device.serialNumber || device.productName,
            connection: "usb",
            isAvailable: true,
            lastChecked: Date.now(),
            metadata: { vendorId: device.vendorId, productId: device.productId },
          });
        });
    }
  } catch (error) {
    console.warn("USB printer capability detection failed", error);
  }

  if (capabilities.length === 0) {
    capabilities.push({
      type: "PRINTER",
      connection: "network",
      isAvailable: false,
      lastChecked: Date.now(),
      metadata: { fallback: true },
    });
  }

  return capabilities;
}
