import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CSVUploaderProps {
  onFileUpload: (file: File) => void;
  acceptedFormats?: string[];
  maxFileSize?: number; // in MB
  disabled?: boolean;
}

export default function CSVUploader({
  onFileUpload,
  acceptedFormats = [".csv", ".xlsx", ".xls"],
  maxFileSize = 10,
  disabled = false,
}: CSVUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const validateFile = (file: File): boolean => {
    // Check file size
    if (file.size > maxFileSize * 1024 * 1024) {
      setErrorMessage(`File size must be less than ${maxFileSize}MB`);
      setUploadStatus("error");
      return false;
    }

    // Check file type
    const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!acceptedFormats.includes(fileExtension)) {
      setErrorMessage(`File type must be one of: ${acceptedFormats.join(", ")}`);
      setUploadStatus("error");
      return false;
    }

    // Check file name for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(file.name)) {
      setErrorMessage("File name contains invalid characters");
      setUploadStatus("error");
      return false;
    }

    // Check file name length
    if (file.name.length > 255) {
      setErrorMessage("File name is too long (max 255 characters)");
      setUploadStatus("error");
      return false;
    }

    return true;
  };

  const handleFiles = useCallback((files: FileList) => {
    if (files.length === 0) return;

    const file = files[0];
    setSelectedFile(file);
    setErrorMessage("");

    if (validateFile(file)) {
      setUploadStatus("success");
      onFileUpload(file);
    }
  }, [onFileUpload, acceptedFormats, maxFileSize]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles, disabled]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  }, [handleFiles, disabled]);

  const reset = () => {
    setSelectedFile(null);
    setUploadStatus("idle");
    setErrorMessage("");
  };

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div
          className={cn(
            "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-gray-300",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary hover:bg-primary/5",
            uploadStatus === "error" ? "border-red-300 bg-red-50" : "",
            uploadStatus === "success" ? "border-green-300 bg-green-50" : ""
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && document.getElementById("csv-file-input")?.click()}
        >
          <input
            id="csv-file-input"
            type="file"
            accept={acceptedFormats.join(",")}
            onChange={handleFileInput}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="space-y-4">
            {/* Upload Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              {uploadStatus === "success" ? (
                <CheckCircle className="w-8 h-8 text-green-600" />
              ) : uploadStatus === "error" ? (
                <AlertCircle className="w-8 h-8 text-red-600" />
              ) : (
                <Upload className="w-8 h-8 text-gray-600" />
              )}
            </div>

            {/* Upload Text */}
            <div>
              {uploadStatus === "success" ? (
                <div>
                  <p className="text-lg font-medium text-green-900">File uploaded successfully!</p>
                  {selectedFile && (
                    <p className="text-sm text-green-700 mt-1">{selectedFile.name}</p>
                  )}
                </div>
              ) : uploadStatus === "error" ? (
                <div>
                  <p className="text-lg font-medium text-red-900">Upload failed</p>
                  <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-medium text-gray-900">
                    Drop your CSV file here, or{" "}
                    <span className="text-primary">browse</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supports: {acceptedFormats.join(", ")} (max {maxFileSize}MB)
                  </p>
                </div>
              )}
            </div>

            {/* File Info */}
            {selectedFile && uploadStatus !== "error" && (
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                <FileText className="w-4 h-4" />
                <span>{selectedFile.name}</span>
                <span>({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            )}

            {/* Action Buttons */}
            {uploadStatus !== "idle" && (
              <div className="flex justify-center space-x-4">
                <Button variant="outline" onClick={reset}>
                  Upload Another File
                </Button>
                {uploadStatus === "success" && (
                  <Button onClick={() => selectedFile && onFileUpload(selectedFile)}>
                    Process File
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upload Guidelines */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">CSV Format Guidelines:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Include column headers in the first row</li>
            <li>• Use UTF-8 encoding for special characters</li>
            <li>• Ensure required fields are not empty</li>
            <li>• Check for duplicate entries before uploading</li>
            <li>• Verify data formats (prices, dates, etc.)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
