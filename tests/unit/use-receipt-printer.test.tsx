import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDetectPrinterCapabilities = vi.fn();
const mockPrinterProfileFromCapability = vi.fn();
const mockGetPrinterAdapter = vi.fn();

vi.mock("@/lib/peripherals", () => {
  const DEFAULT_PRINTER_PROFILE = {
    id: "fallback",
    label: "Fallback Thermal",
    supportsGraphics: false,
    paperWidthMm: 58,
    connection: "usb" as const,
  };
  return {
    DEFAULT_PRINTER_PROFILE,
    detectPrinterCapabilities: mockDetectPrinterCapabilities,
    printerProfileFromCapability: mockPrinterProfileFromCapability,
  };
});

vi.mock("@/lib/printer", () => ({
  getPrinterAdapter: mockGetPrinterAdapter,
}));

const { useReceiptPrinter } = await import("@/hooks/use-receipt-printer");

describe("useReceiptPrinter", () => {
  const fakeJob = {
    receiptNumber: "RCP-123",
    storeName: "Flagship",
    timestamp: new Date().toISOString(),
    items: [],
    totals: {
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      currency: "USD",
      paymentMethod: "cash",
    },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("hydrates detected printer profiles and prints via adapter", async () => {
    const capability = {
      type: "PRINTER",
      vendor: "Acme",
      model: "Thermal-9000",
      connection: "usb",
      isAvailable: true,
      lastChecked: Date.now(),
      metadata: {},
    } as const;
    mockDetectPrinterCapabilities.mockResolvedValue([capability]);
    mockPrinterProfileFromCapability.mockImplementation((cap) => ({
      id: `${cap.vendor}-${cap.model}`,
      label: `${cap.vendor} ${cap.model}`,
      supportsGraphics: true,
      paperWidthMm: 58,
      connection: cap.connection,
    }));
    const adapterPrint = vi.fn().mockResolvedValue(undefined);
    mockGetPrinterAdapter.mockReturnValue({ print: adapterPrint });

    const { result } = renderHook(() => useReceiptPrinter());

    await waitFor(() => {
      expect(result.current.profiles[0]?.id).toBe("Acme-Thermal-9000");
    });

    await act(async () => {
      await result.current.printReceipt(fakeJob);
    });

    expect(adapterPrint).toHaveBeenCalledWith(fakeJob);
    expect(result.current.lastError).toBeNull();
  });

  it("captures adapter errors and exposes them via lastError", async () => {
    mockDetectPrinterCapabilities.mockResolvedValue([]);
    mockPrinterProfileFromCapability.mockReturnValue(null);
    const adapterPrint = vi.fn().mockRejectedValue(new Error("Printer offline"));
    mockGetPrinterAdapter.mockReturnValue({ print: adapterPrint });

    const { result } = renderHook(() => useReceiptPrinter());

    await expect(result.current.printReceipt(fakeJob)).rejects.toThrow("Printer offline");
    await waitFor(() => {
      expect(result.current.lastError).toBe("Printer offline");
    });
  });
});
