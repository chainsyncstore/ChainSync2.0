import { useCallback, useEffect, useMemo, useState } from "react";
import type { PrinterProfile } from "@/lib/peripherals";
import { DEFAULT_PRINTER_PROFILE, detectPrinterCapabilities, printerProfileFromCapability } from "@/lib/peripherals";
import type { ReceiptPrintJob } from "@/lib/printer";
import { getPrinterAdapter } from "@/lib/printer";

/* eslint-disable no-unused-vars */
interface UseReceiptPrinterResult {
  profiles: PrinterProfile[];
  selectedProfile: PrinterProfile;
  selectProfile: (_profileId: string) => void;
  refreshProfiles: () => Promise<void>;
  printReceipt: (job: ReceiptPrintJob) => Promise<void>;
  isPrinting: boolean;
  lastError: string | null;
}
/* eslint-enable no-unused-vars */

const PROFILE_STORAGE_KEY = "chainsync_printer_profile";

export function useReceiptPrinter(): UseReceiptPrinterResult {
  const [profiles, setProfiles] = useState<PrinterProfile[]>([DEFAULT_PRINTER_PROFILE]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(DEFAULT_PRINTER_PROFILE.id);
  const [isPrinting, setIsPrinting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const selectedProfile = useMemo(() => {
    const found = profiles.find((profile) => profile.id === selectedProfileId);
    return found || profiles[0] || DEFAULT_PRINTER_PROFILE;
  }, [profiles, selectedProfileId]);

  const refreshProfiles = useCallback(async () => {
    try {
      const capabilities = await detectPrinterCapabilities();
      const detected = capabilities
        .map((cap) => printerProfileFromCapability(cap))
        .filter((profile): profile is PrinterProfile => Boolean(profile));
      const nextProfiles = detected.length > 0 ? detected : [DEFAULT_PRINTER_PROFILE];
      setProfiles(nextProfiles);
      if (!nextProfiles.some((profile) => profile.id === selectedProfileId)) {
        const nextId = nextProfiles[0]?.id ?? DEFAULT_PRINTER_PROFILE.id;
        setSelectedProfileId(nextId);
        localStorage.setItem(PROFILE_STORAGE_KEY, nextId);
      }
    } catch (error) {
      console.warn("Printer capability detection failed, using fallback", error);
      setProfiles([DEFAULT_PRINTER_PROFILE]);
      setSelectedProfileId(DEFAULT_PRINTER_PROFILE.id);
      localStorage.setItem(PROFILE_STORAGE_KEY, DEFAULT_PRINTER_PROFILE.id);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) {
      setSelectedProfileId(stored);
    }
    void refreshProfiles();
  }, [refreshProfiles]);

  const selectProfile = useCallback((profileId: string) => {
    setSelectedProfileId(profileId);
    localStorage.setItem(PROFILE_STORAGE_KEY, profileId);
  }, []);

  const printReceipt = useCallback(async (job: ReceiptPrintJob) => {
    setIsPrinting(true);
    setLastError(null);
    try {
      const adapter = getPrinterAdapter(selectedProfile);
      await adapter.print(job);
    } catch (error) {
      console.error("Receipt print failed", error);
      const message = error instanceof Error ? error.message : "Unknown printer error";
      setLastError(message);
      throw error;
    } finally {
      setIsPrinting(false);
    }
  }, [selectedProfile]);

  return {
    profiles,
    selectedProfile,
    selectProfile,
    refreshProfiles,
    printReceipt,
    isPrinting,
    lastError,
  };
}
