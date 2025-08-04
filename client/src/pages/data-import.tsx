import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import TopBar from "@/components/layout/topbar";
import CSVUploader from "@/components/data-import/csv-uploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, Database, CheckCircle, AlertTriangle, Download } from "lucide-react";
import { formatDateTime } from "@/lib/pos-utils";
import type { Store, LowStockAlert } from "@shared/schema";

interface ImportJob {
  id: string;
  type: "products" | "inventory" | "transactions";
  status: "pending" | "processing" | "completed" | "failed";
  fileName: string;
  totalRows: number;
  processedRows: number;
  errorCount: number;
  createdAt: string;
  completedAt?: string;
}

export default function DataImport() {
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [activeTab, setActiveTab] = useState("products");
  const queryClient = useQueryClient();

  const userData = {
    role: "manager",
    name: "John Doe",
    initials: "JD",
  };

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ["/api/stores"],
  });

  // Auto-select first store when stores are loaded
  useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0].id);
    }
  }, [stores, selectedStore]);

  const { data: alerts = [] } = useQuery<LowStockAlert[]>({
    queryKey: ["/api/stores", selectedStore, "alerts"],
  });

  // Mock import jobs data - in real app this would come from backend
  const [importJobs, setImportJobs] = useState<ImportJob[]>([
    {
      id: "1",
      type: "products",
      status: "completed",
      fileName: "products_export.csv",
      totalRows: 150,
      processedRows: 150,
      errorCount: 0,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
    },
    {
      id: "2",
      type: "inventory",
      status: "processing",
      fileName: "inventory_update.csv",
      totalRows: 75,
      processedRows: 45,
      errorCount: 2,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleFileUpload = (file: File, type: string) => {
    const newJob: ImportJob = {
      id: Date.now().toString(),
      type: type as "products" | "inventory" | "transactions",
      status: "pending",
      fileName: file.name,
      totalRows: 0,
      processedRows: 0,
      errorCount: 0,
      createdAt: new Date().toISOString(),
    };

    setImportJobs(prev => [newJob, ...prev]);

    // Simulate processing
    setTimeout(() => {
      setImportJobs(prev => prev.map(job => 
        job.id === newJob.id 
          ? { ...job, status: "processing", totalRows: 100 }
          : job
      ));

      // Simulate progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
          setImportJobs(prev => prev.map(job => 
            job.id === newJob.id 
              ? { 
                  ...job, 
                  status: "completed", 
                  processedRows: 100,
                  completedAt: new Date().toISOString()
                }
              : job
          ));
        } else {
          setImportJobs(prev => prev.map(job => 
            job.id === newJob.id 
              ? { ...job, processedRows: Math.floor(progress) }
              : job
          ));
        }
      }, 1000);
    }, 2000);
  };

  const downloadTemplate = (type: string) => {
    // In real app, this would download actual templates
    console.log(`Downloading ${type} template`);
  };

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
    <div className="min-h-screen bg-slate-50">
      <TopBar
        title="Data Import & Migration"
        subtitle="Import data from existing POS systems and manage data migration"
        currentDateTime={currentDateTime}
        onLogout={() => {}}
        userRole={userData.role}
        userName={userData.name}
        userInitials={userData.initials}
        selectedStore={selectedStore}
        stores={stores}
        onStoreChange={setSelectedStore}
        alertCount={alerts.length}
      />
      
      <main className="p-4 md:p-6">
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                    {importJobs.filter(job => job.status === "completed").length}
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
                    {importJobs.filter(job => job.status === "processing").length}
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
                    {importJobs.filter(job => job.status === "failed").length}
                  </div>
                  <p className="text-xs text-muted-foreground">Need attention</p>
                </CardContent>
              </Card>
            </div>

            {/* Import Interface */}
            <Card>
              <CardHeader>
                <CardTitle>Import Data</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="products">Products</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory</TabsTrigger>
                    <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="products" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold">Product Import</h3>
                        <p className="text-sm text-gray-600">
                          Import product catalog from CSV files. Includes name, barcode, price, cost, and category.
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => downloadTemplate("products")}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                    <CSVUploader onFileUpload={(file) => handleFileUpload(file, "products")} />
                  </TabsContent>
                  
                  <TabsContent value="inventory" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold">Inventory Import</h3>
                        <p className="text-sm text-gray-600">
                          Update stock levels and inventory data. Includes quantities, min/max levels, and store locations.
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => downloadTemplate("inventory")}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                    <CSVUploader onFileUpload={(file) => handleFileUpload(file, "inventory")} />
                  </TabsContent>
                  
                  <TabsContent value="transactions" className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold">Transaction Import</h3>
                        <p className="text-sm text-gray-600">
                          Import historical transaction data for analytics. Includes sales records and transaction details.
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => downloadTemplate("transactions")}>
                        <Download className="w-4 h-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                    <CSVUploader onFileUpload={(file) => handleFileUpload(file, "transactions")} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Import History */}
            <Card>
              <CardHeader>
                <CardTitle>Import History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {importJobs.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Upload className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No import jobs yet</p>
                      <p className="text-sm">Upload a CSV file to get started</p>
                    </div>
                  ) : (
                    importJobs.map((job) => (
                      <div key={job.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(job.status)}
                            <div>
                              <p className="font-medium">{job.fileName}</p>
                              <p className="text-sm text-gray-500 capitalize">{job.type} import</p>
                            </div>
                          </div>
                          <Badge variant={getStatusColor(job.status)} className="capitalize">
                            {job.status}
                          </Badge>
                        </div>
                        
                        {job.status === "processing" && (
                          <div className="mb-2">
                            <div className="flex justify-between text-sm mb-1">
                              <span>Progress</span>
                              <span>{job.processedRows}/{job.totalRows || "?"}</span>
                            </div>
                            <Progress 
                              value={job.totalRows ? (job.processedRows / job.totalRows) * 100 : 0} 
                              className="h-2"
                            />
                          </div>
                        )}
                        
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Started: {formatDateTime(new Date(job.createdAt))}</span>
                          {job.completedAt && (
                            <span>Completed: {formatDateTime(new Date(job.completedAt))}</span>
                          )}
                          {job.errorCount > 0 && (
                            <span className="text-red-600">{job.errorCount} errors</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
    </div>
  );
}
