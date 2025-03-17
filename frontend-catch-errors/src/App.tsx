import React, { useState } from "react";
import axios from "axios";
import { Document, Page, pdfjs } from "react-pdf";
import "./App.css";

// Configure PDF.js worker for rendering PDFs
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js`;

interface SummarizeResponse {
  summary: string;
  errors?: { line: number; text: string }[];
}

interface FeedbackResponse {
  summary: string;
}

const App: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfURL, setPdfURL] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [filename, setFilename] = useState("");
  const [errors, setErrors] = useState<{ line: number; text: string }[]>([]);

  // Handle PDF file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
        const file = event.target.files[0];

        if (file.type !== "application/pdf") {
            alert("Please select a valid PDF file.");
            return;
        }

        setPdfFile(file);
    }
  };

  // Upload the PDF file to the backend
  const handleUpload = async () => {
    if (!pdfFile) {
        alert("Please select a file");
        return;
    }

    const formData = new FormData();
    formData.append("file", pdfFile);

    setLoading(true);
    try {
        const response = await axios.post<{ message: string; filename: string }>(
            "http://localhost:3000/upload",
            formData
        );

        const uploadedFilename = response.data.filename;
        const fileUrl = `http://localhost:3000/uploads/${uploadedFilename}`;

        console.log("📄 PDF URL:", fileUrl);  // ✅ Debug URL in Console

        setPdfURL(fileUrl);
        setFilename(uploadedFilename);

        alert("File uploaded successfully");
    } catch (error) {
        console.error("Upload failed:", error);
        alert("Failed to upload file");
    }
    setLoading(false);
  };  
  // Generate summary and find errors
  const handleSummarize = async () => {
    if (!filename) {
        alert("Upload a file first");
        return;
    }

    setLoading(true);
    try {
        const response = await axios.post<{ summary: string; errors?: { line: number; text: string }[] }>(
            "http://localhost:3000/summarize",
            { filename }
        );

        setSummary(response.data.summary);
        setErrors(response.data.errors || []);

        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 1000);
    } catch (error) {
        console.error("Summarization failed:", error);
        alert("Failed to generate summary");
    }
    setLoading(false);
  };

  const handleFeedback = async (isApproved: boolean) => {
    if (!filename) {
      alert('No file uploaded');
      return;
    }

    if (isApproved) {
      alert('Summary Approved!');
      return;
    }

    const userFeedback = prompt('Enter feedback to improve the summary:');
    if (!userFeedback) return;

    setLoading(true);
    try {
      const response = await axios.post<FeedbackResponse>('http://localhost:3000/feedback', {
        filename,
        feedback: userFeedback,
      });

      setSummary(response.data.summary);
    } catch (error) {
      console.error('Feedback failed:', error);
      alert('Failed to process feedback');
    }
    setLoading(false);
  };
  

  return (
    <div className="container">
      <h1>📄 AI-Powered PDF Analyzer</h1>

      {/* Upload Section (Input + Button in One Line) */}
      <div className="upload-section">
        <input type="file" accept="application/pdf" onChange={handleFileChange} />
        <button className="upload-btn" onClick={handleUpload} disabled={loading}>
          {loading ? "Uploading..." : "Upload"}
        </button>
      </div>

      {pdfURL && (
        <div className="pdf-container">
          <Document
            file={{ url: pdfURL }} // Ensure it's correctly referenced from uploads
            onLoadSuccess={({ numPages }) => {
              console.log("Total Pages in PDF:", numPages);
              setNumPages(numPages);
          }}
          loading="Loading PDF..."
          error={<p style={{ color: "red" }}>Failed to load PDF file</p>}
        >
          {Array.from(new Array(numPages), (_, index) => (
            <div key={`page_${index + 1}`} className="pdf-page-container">
              <Page
                pageNumber={index + 1}
                renderTextLayer={false} // ✅ Prevents React-PDF from rendering text over and over
                renderAnnotationLayer={false} // ✅ Prevents annotation duplication
              />
            </div>
          ))}
          </Document>
        </div>
      )}

      {/* Generate Summary Button (Below PDF) */}
      {filename && (
        <button className="summarize-btn" onClick={handleSummarize} disabled={loading}>
          {loading ? "Analyzing..." : "Generate Summary"}
        </button>
      )}

      {/* Summary Output */}
      {summary && (
        <div className="summary-box">
          <h2>🔍 Summary:</h2>
          <p>{summary}</p>
          <div className="feedback-buttons">
            <button className="approve-btn" onClick={() => handleFeedback(true)}>✅ Approve</button>
            <button className="regenerate-btn" onClick={() => handleFeedback(false)}>🔄 Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;