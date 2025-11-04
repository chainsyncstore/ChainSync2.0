import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TemplateDownloaderProps {
  type: "inventory" | "products" | "transactions" | "loyalty";
  className?: string;
}

export default function TemplateDownloader({ type, className }: TemplateDownloaderProps) {
  const generateTemplate = () => {
    let headers: string[] = [];
    let sampleData: string[] = [];

    switch (type) {
      case "inventory":
        headers = [
          "product_id",
          "product_name", 
          "barcode",
          "description",
          "price",
          "cost",
          "quantity",
          "min_stock_level",
          "max_stock_level",
          "category",
          "brand"
        ];
        sampleData = [
          "550e8400-e29b-41d4-a716-446655440000",
          "Sample Product",
          "1234567890123",
          "This is a sample product description",
          "29.99",
          "15.00",
          "50",
          "10",
          "100",
          "electronics",
          "Sample Brand"
        ];
        break;
      
      case "products":
        headers = [
          "name",
          "barcode",
          "description",
          "price",
          "cost",
          "category",
          "brand"
        ];
        sampleData = [
          "Sample Product",
          "1234567890123",
          "This is a sample product description",
          "29.99",
          "15.00",
          "electronics",
          "Sample Brand"
        ];
        break;
      
      case "transactions":
        headers = [
          "transaction_date",
          "product_id",
          "product_name",
          "quantity",
          "unit_price",
          "total_price",
          "payment_method",
          "cashier_id"
        ];
        sampleData = [
          "2024-01-15T10:30:00Z",
          "550e8400-e29b-41d4-a716-446655440000",
          "Sample Product",
          "2",
          "29.99",
          "59.98",
          "card",
          "cashier-123"
        ];
        break;
      
      case "loyalty":
        headers = [
          "first_name",
          "last_name",
          "email",
          "phone",
          "loyalty_number",
          "current_points",
          "lifetime_points",
          "tier_name",
          "member_since"
        ];
        sampleData = [
          "John",
          "Doe",
          "john.doe@email.com",
          "+1-555-0123",
          "LOY001",
          "1250",
          "2500",
          "Silver",
          "2024-01-15"
        ];
        break;
    }

    // Create CSV content
    let additionalRows: string[] = [];
    
    if (type === "loyalty") {
      additionalRows = [
        "Jane,Smith,jane.smith@email.com,+1-555-0456,LOY002,3200,5000,Gold,2024-01-10",
        "Bob,Johnson,bob.johnson@email.com,+1-555-0789,LOY003,450,800,Bronze,2024-02-01",
        "Alice,Brown,alice.brown@email.com,+1-555-0321,LOY004,8500,12000,Gold,2024-01-20",
        "Charlie,Wilson,charlie.wilson@email.com,+1-555-0654,LOY005,15000,20000,Platinum,2024-01-05"
      ];
    } else {
      additionalRows = Array(2).fill(null).map((_, i) => {
        if (type === "inventory") {
          return [
            `550e8400-e29b-41d4-a716-44665544000${i + 1}`,
            `Sample Product ${i + 2}`,
            `123456789012${i + 4}`,
            `Sample description ${i + 2}`,
            `${(Math.random() * 50 + 10).toFixed(2)}`,
            `${(Math.random() * 25 + 5).toFixed(2)}`,
            `${Math.floor(Math.random() * 100) + 1}`,
            `${Math.floor(Math.random() * 10) + 5}`,
            `${Math.floor(Math.random() * 200) + 50}`,
            ["electronics", "clothing", "food"][i % 3],
            `Brand ${i + 2}`
          ].join(",");
        } else {
          return sampleData.map((_, j) => {
            if (j === 0) return `Sample ${type.slice(0, -1)} ${i + 2}`;
            if (j === 1) return `123456789012${i + 4}`;
            if (j === 2) return `Sample description ${i + 2}`;
            if (j === 3) return `${Math.floor(Math.random() * 100) + 1}`;
            if (j === 4) return `${Math.floor(Math.random() * 10) + 5}`;
            if (j === 5) return `${Math.floor(Math.random() * 200) + 50}`;
            if (j === 6) return ["electronics", "clothing", "food"][i % 3];
            if (j === 7) return `Brand ${i + 2}`;
            return "";
          }).join(",");
        }
      });
    }
    
    const csvContent = [
      headers.join(","),
      sampleData.join(","),
      ...additionalRows
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${type}_template.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button 
      variant="outline" 
      onClick={generateTemplate}
      className={className}
    >
      <Download className="w-4 h-4 mr-2" />
      Download Template
    </Button>
  );
} 