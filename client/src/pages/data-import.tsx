import { useQuery } from "@tanstack/react-query";
import { Upload, Database, CheckCircle, AlertTriangle, CalendarClock, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CSVUploader from "@/components/data-import/csv-uploader";
import ProductInput from "@/components/data-import/product-input";
import TemplateDownloader from "@/components/data-import/template-downloader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { getCsrfToken } from "@/lib/csrf";
import { formatDateTime } from "@/lib/pos-utils";
import type { Store } from "@shared/schema";

interface ImportJob {
  id: string;
  type: "products" | "inventory" | "transactions" | "loyalty";
  status: "pending" | "processing" | "completed" | "failed";
  fileName: string;
  totalRows: number;
  processedRows: number;
  errorCount: number;
  createdAt: string;
  completedAt?: string;
}

export default function DataImport() {
  const { user } = useAuth();
  const role = user?.role?.toLowerCase() ?? "";
  const isManager = role === "manager";
  const managerStoreId = isManager ? (user?.storeId ?? "") : "";
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [activeTab, setActiveTab] = useState("products");

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  const { data: importJobHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/import-jobs"],
  });

  useEffect(() => {
    if (isManager && managerStoreId && selectedStore !== managerStoreId) {
      setSelectedStore(managerStoreId);
    }
  }, [isManager, managerStoreId, selectedStore]);

  // Auto-select first store for non-managers when stores are loaded
  useEffect(() => {
    if (isManager) return;
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore, isManager]);

  // Mock import jobs data - in real app this would come from backend
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [successSummary, setSuccessSummary] = useState<string | null>(null);
  const [inventoryMode, setInventoryMode] = useState<"overwrite" | "regularize" | null>(null);
  const [loyaltyMode, setLoyaltyMode] = useState<"overwrite" | "regularize" | null>(null);
  const [transactionCutoff, setTransactionCutoff] = useState<string>("");
  type ImportStats =
    | { type: "inventory"; mode?: string; addedProducts: number; stockAdjusted: number; skipped: number }
    | { type: "loyalty"; mode?: string; imported: number; updated: number; skipped: number }
    | { type: "historical"; cutoffDate: string; imported: number; skipped: number; invalid: number };
  const [importStats, setImportStats] = useState<ImportStats | null>(null);

  const fileEndpoints = useMemo(() => ({
    inventory: "/api/inventory/import",
    transactions: "/api/transactions/import",
    loyalty: "/api/customers/import", // loyalty tab reuses customer import (placeholder until dedicated route)
    products: "/api/products", // handled via ProductInput component, not CSV uploader
  }), []);

  const handleFileUpload = async (
    file: File,
    type: "inventory" | "transactions" | "loyalty",
    options?: { mode?: "overwrite" | "regularize"; cutoffDate?: string }
  ) => {
    const endpoint = fileEndpoints[type];
    if (!endpoint) {
      setImportErrors([{ error: `No endpoint configured for ${type} import.` }]);
      return;
    }

    if (!selectedStore && type !== "loyalty") {
      setImportErrors([{ error: "Please select a store before uploading." }]);
      return;
    }

    if ((type === "inventory" || type === "loyalty") && !options?.mode) {
      setImportErrors([{ error: `Select a ${type} import mode before uploading.` }]);
      return;
    }

    if (type === "transactions" && !options?.cutoffDate) {
      setImportErrors([{ error: "Select an adoption cutoff date before uploading." }]);
      return;
    }

    setIsUploading(true);
    setImportErrors([]);
    setSuccessSummary(null);
    setImportStats(null);

    const jobId = Date.now().toString();
    const newJob: ImportJob = {
      id: jobId,
      type,
      status: "processing",
      fileName: file.name,
      totalRows: 0,
      processedRows: 0,
      errorCount: 0,
      createdAt: new Date().toISOString(),
    };
    setImportJobs((prev) => [newJob, ...prev]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (type !== "loyalty" && selectedStore) {
        formData.append("storeId", selectedStore);
      }
      if (options?.mode) {
        formData.append("mode", options.mode);
      }
      if (options?.cutoffDate) {
        formData.append("cutoffDate", options.cutoffDate);
      }

      const csrfToken = await getCsrfToken();
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "X-CSRF-Token": csrfToken,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setImportJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, status: "failed", errorCount: 1 } : job));
        setImportErrors([{ error: result?.error || "Import failed unexpectedly." }]);
        return;
      }

      const imported = Number(result?.imported ?? 0);
      const updated = Number(result?.updated ?? 0);
      const invalid = Number(result?.invalid ?? 0);
      const invalidRows = Array.isArray(result?.invalidRows) ? result.invalidRows : [];
      const summaryParts: string[] = [];
      if (result?.mode) {
        summaryParts.push(`Mode: ${String(result.mode).toUpperCase()}`);
      }
      summaryParts.push(`Imported ${imported}`);
      if (updated > 0) {
        summaryParts.push(`Updated ${updated}`);
      }
      if (invalid > 0) {
        summaryParts.push(`${invalid} invalid`);
      }

      setImportJobs((prev) => prev.map((job) => job.id === jobId
        ? {
            ...job,
            status: invalid > 0 ? "completed" : "completed",
            processedRows: imported + updated,
            totalRows: imported + updated + invalid,
            errorCount: invalid,
            completedAt: new Date().toISOString(),
          }
        : job
      ));

      if (invalidRows.length > 0) {
        setImportErrors(invalidRows.map((row: any) => ({
          error: row.error || "Row failed validation",
          row: row.row,
        })));
      } else {
        setImportErrors([]);
      }

      setSuccessSummary(summaryParts.join(" · "));

      if (type === "inventory") {
        setImportStats({
          type: "inventory",
          mode: result?.mode,
          addedProducts: Number(result?.addedProducts ?? 0),
          stockAdjusted: Number(result?.stockAdjusted ?? 0),
          skipped: Number(result?.skipped ?? 0),
        });
      } else if (type === "loyalty") {
        setImportStats({
          type: "loyalty",
          mode: result?.mode,
          imported: Number(result?.imported ?? 0),
          updated: Number(result?.updated ?? 0),
          skipped: Number(result?.skipped ?? 0),
        });
      } else if (type === "transactions") {
        setImportStats({
          type: "historical",
          cutoffDate: String(result?.cutoffDate ?? options?.cutoffDate ?? ""),
          imported: Number(result?.imported ?? 0),
          skipped: Number(result?.skipped ?? 0),
          invalid: Number(result?.invalid ?? 0),
        });
      } else {
        setImportStats(null);
      }
    } catch (error) {
      setImportJobs((prev) => prev.map((job) => job.id === jobId ? { ...job, status: "failed", errorCount: 1 } : job));
      setImportErrors([{ error: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isManager) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access restricted</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Insufficient permissions</AlertTitle>
            <AlertDescription>
              Only store managers with an assigned location can import data.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isManager && !managerStoreId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store assignment required</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>No store assigned</AlertTitle>
            <AlertDescription>
              Ask an administrator to assign you to a store before using the import tools.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: ImportJob["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "processing":
        return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      default:
        return <div className="w-4 h-4 bg-gray-300 rounded-full" />;
    }
  };

  const getStatusColor = (status: ImportJob["status"]) => {
    switch (status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "processing":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Imports</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{importJobs.length}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {importJobs.filter((job) => job.status === "completed").length}
            </div>
            <p className="text-xs text-muted-foreground">Successful imports</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {importJobs.filter((job) => job.status === "processing").length}
            </div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {importJobs.filter((job) => job.status === "failed").length}
            </div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>

      </div>

      {/* Import Interface */}
      <Card>
        <CardHeader />
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="transactions">Historical Transactions</TabsTrigger>
              <TabsTrigger value="loyalty">Loyalty</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Product Import</h3>
                  <p className="text-sm text-gray-600">
                    Add individual products and stock levels. Products can be added via barcode scan or manual input.
                    If a product already exists, stock will be added to the existing inventory.
                  </p>
                </div>
              </div>
              <ProductInput selectedStore={selectedStore} />
            </TabsContent>

            <TabsContent value="inventory" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Inventory Import</h3>
                  <p className="text-sm text-gray-600">
                    Update stock levels and inventory data. Download the template to see the required format for bulk inventory updates.
                  </p>
                </div>
                <TemplateDownloader type="inventory" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inventory-mode">Inventory import mode</Label>
                  <Select
                    value={inventoryMode ?? undefined}
                    onValueChange={(value) => setInventoryMode(value as "overwrite" | "regularize")}
                  >
                    <SelectTrigger id="inventory-mode">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regularize">
                        Regularize (add quantities to existing stock)
                      </SelectItem>
                      <SelectItem value="overwrite">
                        Overwrite (set quantities exactly to file values)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Regularize adds the CSV quantity to current stock; Overwrite replaces stock with the CSV quantity.
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/40 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Mode tips</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Use Regularize for cycle counts or incremental restocks.</li>
                    <li>Use Overwrite when inventory should match the CSV exactly.</li>
                  </ul>
                </div>
              </div>
              <CSVUploader
                onFileUpload={(file) => inventoryMode && handleFileUpload(file, "inventory", { mode: inventoryMode })}
                disabled={isUploading || !inventoryMode}
              />
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Historical Transactions</h3>
                  <p className="text-sm text-gray-600">
                    Import historical transaction data for analytics. Choose your adoption cutoff to avoid duplicating live sales.
                  </p>
                </div>
                <TemplateDownloader type="transactions" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transaction-cutoff" className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4" /> Adoption cutoff date
                </Label>
                <input
                  id="transaction-cutoff"
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={transactionCutoff}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setTransactionCutoff(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Rows dated on or after this cutoff will be rejected so your live sales stay clean.
                </p>
              </div>
              <CSVUploader
                onFileUpload={(file) => transactionCutoff && handleFileUpload(file, "transactions", { cutoffDate: transactionCutoff })}
                disabled={isUploading || !transactionCutoff}
              />
            </TabsContent>

            <TabsContent value="loyalty" className="space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold">Loyalty Program Import</h3>
                  <p className="text-sm text-gray-600">
                    Import customer loyalty data including customer information, points, and tier assignments.
                  </p>
                </div>
                <TemplateDownloader type="loyalty" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loyalty-mode">Loyalty import mode</Label>
                  <Select
                    value={loyaltyMode ?? undefined}
                    onValueChange={(value) => setLoyaltyMode(value as "overwrite" | "regularize")}
                  >
                    <SelectTrigger id="loyalty-mode">
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regularize">Regularize (ignore duplicates by email/phone)</SelectItem>
                      <SelectItem value="overwrite">Overwrite (update matching customers)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Regularize keeps existing loyalty records when email or phone already exists. Overwrite updates those rows instead.
                  </p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/40 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Mode tips</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Use Regularize for partial lists—existing members remain untouched.</li>
                    <li>Use Overwrite to refresh contact info or points en masse.</li>
                  </ul>
                </div>
              </div>
              <CSVUploader
                onFileUpload={(file) => loyaltyMode && handleFileUpload(file, "loyalty", { mode: loyaltyMode })}
                disabled={isUploading || !loyaltyMode}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {(successSummary || importErrors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {successSummary && (
              <Alert variant="default" className="bg-green-50 border-green-200 text-green-900">
                <AlertTitle>Success</AlertTitle>
                <AlertDescription>{successSummary}</AlertDescription>
              </Alert>
            )}

            {importStats?.type === "inventory" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Mode</p>
                  <p className="text-lg font-semibold capitalize">{importStats.mode ?? "?"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Products added</p>
                  <p className="text-2xl font-semibold">{importStats.addedProducts}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Stock adjustments</p>
                  <p className="text-2xl font-semibold">{importStats.stockAdjusted}</p>
                  <p className="text-xs text-muted-foreground">{importStats.skipped} skipped rows</p>
                </div>
              </div>
            )}

            {importStats?.type === "loyalty" && (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Mode</p>
                  <p className="text-lg font-semibold capitalize">{importStats.mode ?? "?"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">New customers</p>
                  <p className="text-2xl font-semibold">{importStats.imported}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Updated records</p>
                  <p className="text-2xl font-semibold">{importStats.updated}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Skipped duplicates</p>
                  <p className="text-2xl font-semibold">{importStats.skipped}</p>
                  <p className="text-xs text-muted-foreground">Duplicates skipped during Regularize mode.</p>
                </div>
              </div>
            )}

            {importStats?.type === "historical" && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Cutoff date</p>
                  <p className="text-lg font-semibold">{importStats.cutoffDate?.slice(0, 10) || "—"}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Imported rows</p>
                  <p className="text-2xl font-semibold">{importStats.imported}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">Skipped/Invalid</p>
                  <p className="text-2xl font-semibold">{importStats.skipped + importStats.invalid}</p>
                  <p className="text-xs text-muted-foreground">{importStats.skipped} skipped · {importStats.invalid} invalid</p>
                </div>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="space-y-2">
                <Alert variant="destructive">
                  <AlertTitle>Some rows failed to import</AlertTitle>
                  <AlertDescription>
                    Review the errors below, correct your CSV, and retry. The valid rows were imported successfully.
                  </AlertDescription>
                </Alert>
                <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                  {importErrors.map((rowError, index) => (
                    <div key={`${rowError.error}-${index}`} className="p-3 text-sm space-y-1">
                      <div className="font-medium text-red-600">{rowError.error}</div>
                      {rowError.row && (
                        <pre className="bg-muted/50 rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(rowError.row, null, 2)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(successSummary || importErrors.length > 0) && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => {
                  setSuccessSummary(null);
                  setImportErrors([]);
                  setImportStats(null);
                }}>
                  Clear Results
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Import History</CardTitle>
            <p className="text-sm text-muted-foreground">Latest 25 batches across all import types.</p>
          </div>
          <History className="w-5 h-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {importJobHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No import jobs yet</p>
                <p className="text-sm">Upload a CSV file to get started</p>
              </div>
            ) : (
              importJobHistory.map((job) => (
                <div key={job.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <p className="font-medium">{job.fileName || job.type}</p>
                        <p className="text-sm text-gray-500 capitalize">{job.type?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <Badge variant={getStatusColor(job.status)} className="capitalize">
                      {job.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-4">
                    <span>Rows: {job.processedRows}/{job.totalRows}</span>
                    {job.cutoffDate && <span>Cutoff: {new Date(job.cutoffDate).toLocaleDateString()}</span>}
                    {job.mode && <span>Mode: {job.mode}</span>}
                    <span>Started: {formatDateTime(new Date(job.createdAt))}</span>
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    {job.completedAt ? (
                      <span>Completed: {formatDateTime(new Date(job.completedAt))}</span>
                    ) : (
                      <span>In progress</span>
                    )}
                    {job.errorCount > 0 && (
                      <span className="text-red-600">{job.errorCount} errors · {job.skippedCount} skipped</span>
                    )}
                  </div>

                  {job.details?.invalidRows && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-foreground">View sample errors</summary>
                      <pre className="mt-2 max-h-40 overflow-y-auto bg-muted/60 p-2 rounded">{JSON.stringify(job.details.invalidRows, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
