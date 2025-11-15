import { useState, useEffect, useCallback, useRef, createContext, useContext, useMemo } from "react";
import type { ScannerProfile } from "@/lib/peripherals";
import { DEFAULT_SCANNER_PROFILE } from "@/lib/peripherals";

// eslint-disable-next-line no-unused-vars
type BarcodeHandler = (code: string) => void;
// eslint-disable-next-line no-unused-vars
type SetOnScanHandler = (handler: BarcodeHandler) => void;
// eslint-disable-next-line no-unused-vars
type SelectProfileHandler = (profileId: string) => void;

interface ScannerContextType {
  isScanning: boolean;
  inputBuffer: string;
  isScannerActive: boolean;
  activateScanner: () => void;
  deactivateScanner: () => void;
  onScan: BarcodeHandler | null;
  setOnScan: SetOnScanHandler;
  profiles: ScannerProfile[];
  selectedProfile: ScannerProfile;
  selectProfile: SelectProfileHandler;
  refreshProfiles: () => Promise<void>;
}

const ScannerContext = createContext<ScannerContextType | null>(null);

export function useScannerContext() {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error("useScannerContext must be used within a ScannerProvider");
  }
  return context;
}

const PROFILE_STORAGE_KEY = "chainsync_scanner_profile";

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [inputBuffer, setInputBuffer] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [onScan, setOnScan] = useState<BarcodeHandler | null>(null);
  const [profiles, setProfiles] = useState<ScannerProfile[]>([DEFAULT_SCANNER_PROFILE]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(DEFAULT_SCANNER_PROFILE.id);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedProfile = useMemo(() => {
    const found = profiles.find((profile) => profile.id === selectedProfileId);
    return found || profiles[0] || DEFAULT_SCANNER_PROFILE;
  }, [profiles, selectedProfileId]);

  const activateScanner = useCallback(() => {
    setIsScannerActive(true);
    setIsScanning(true);
    setInputBuffer("");
  }, []);

  const deactivateScanner = useCallback(() => {
    setIsScannerActive(false);
    setIsScanning(false);
    setInputBuffer("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Only process if scanner is active
    if (!isScannerActive) {
      return;
    }

    // Ignore if user is typing in input fields, textareas, or contenteditable elements
    const target = event.target as HTMLElement;
    if (target && (
      target.tagName === "INPUT" || 
      target.tagName === "TEXTAREA" || 
      target.contentEditable === "true" ||
      target.closest('[contenteditable="true"]')
    )) {
      return;
    }

    const triggerKey = selectedProfile.triggerKey || "Enter";

    if (event.key === triggerKey) {
      if (inputBuffer.length > 3 && onScan) { // Minimum barcode length
        onScan(inputBuffer);
        setInputBuffer("");
        setIsScanning(false);
        // Keep scanner active for next scan
        setIsScannerActive(true);
      }
    } else if (/^[0-9a-zA-Z]$/.test(event.key)) {
      setInputBuffer(prev => prev + event.key);
      setIsScanning(true);
      
      // Clear buffer after 1 second of inactivity
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setInputBuffer("");
        setIsScanning(false);
      }, 1000);
    }
  }, [inputBuffer, onScan, isScannerActive, selectedProfile.triggerKey]);

  useEffect(() => {
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  const refreshProfiles = useCallback(async () => {
    try {
      const { detectScannerCapabilities, profileFromCapability } = await import("@/lib/peripherals");
      const capabilities = await detectScannerCapabilities();
      const detected = capabilities
        .map((cap) => profileFromCapability(cap))
        .filter((profile): profile is ScannerProfile => Boolean(profile));
      const nextProfiles = detected.length > 0 ? detected : [DEFAULT_SCANNER_PROFILE];
      setProfiles(nextProfiles);
      if (!nextProfiles.some((profile) => profile.id === selectedProfileId)) {
        const nextId = nextProfiles[0]?.id ?? DEFAULT_SCANNER_PROFILE.id;
        setSelectedProfileId(nextId);
        localStorage.setItem(PROFILE_STORAGE_KEY, nextId);
      }
    } catch (error) {
      console.warn("Scanner capability detection failed, falling back", error);
      setProfiles([DEFAULT_SCANNER_PROFILE]);
      setSelectedProfileId(DEFAULT_SCANNER_PROFILE.id);
      localStorage.setItem(PROFILE_STORAGE_KEY, DEFAULT_SCANNER_PROFILE.id);
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value: ScannerContextType = {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
    onScan,
    setOnScan,
    profiles,
    selectedProfile,
    selectProfile,
    refreshProfiles,
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
    </ScannerContext.Provider>
  );
}

export function useBarcodeScanner(onScan: BarcodeHandler) {
  const [inputBuffer, setInputBuffer] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activateScanner = useCallback(() => {
    setIsScannerActive(true);
    setIsScanning(true);
    setInputBuffer("");
  }, []);

  const deactivateScanner = useCallback(() => {
    setIsScannerActive(false);
    setIsScanning(false);
    setInputBuffer("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    // Only process if scanner is active
    if (!isScannerActive) {
      return;
    }

    // Ignore if user is typing in input fields, textareas, or contenteditable elements
    const target = event.target as HTMLElement;
    if (target && (
      target.tagName === "INPUT" || 
      target.tagName === "TEXTAREA" || 
      target.contentEditable === "true" ||
      target.closest('[contenteditable="true"]')
    )) {
      return;
    }

    if (event.key === "Enter") {
      if (inputBuffer.length > 3) { // Minimum barcode length
        onScan(inputBuffer);
        setInputBuffer("");
        setIsScanning(false);
        // Keep scanner active for next scan
        setIsScannerActive(true);
      }
    } else if (/^[0-9a-zA-Z]$/.test(event.key)) {
      setInputBuffer(prev => prev + event.key);
      setIsScanning(true);
      
      // Clear buffer after 1 second of inactivity
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setInputBuffer("");
        setIsScanning(false);
      }, 1000);
    }
  }, [inputBuffer, onScan, isScannerActive]);

  useEffect(() => {
    document.addEventListener("keypress", handleKeyPress);
    return () => document.removeEventListener("keypress", handleKeyPress);
  }, [handleKeyPress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    isScanning,
    inputBuffer,
    isScannerActive,
    activateScanner,
    deactivateScanner,
  };
}
