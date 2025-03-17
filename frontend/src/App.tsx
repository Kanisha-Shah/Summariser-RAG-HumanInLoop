import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // Import the updated CSS

interface SummarizeResponse {
  summary: string;
}

interface FeedbackResponse {
  summary: string;
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState('');
  const [filename, setFilename] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    try {
      await axios.post('http://localhost:3000/upload', formData);
      setFilename(file.name);
      alert('File uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload file');
    }
    setLoading(false);
  };

  const handleSummarize = async () => {
    if (!filename) {
      alert('Upload a file first');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post<SummarizeResponse>('http://localhost:3000/summarize', { filename });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Summarization failed:', error);
      alert('Failed to generate summary');
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
      <h1>📄 AI Document Summarizer</h1>

      <div className="upload-section">
        <input type="file" onChange={handleFileChange} />
        <button className="upload-btn" onClick={handleUpload} disabled={loading}>
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      <div className="action-buttons">
        {filename && (
          <button className="summarize-btn" onClick={handleSummarize} disabled={loading}>
            {loading ? 'Summarizing...' : 'Generate Summary'}
          </button>
        )}
      </div>

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