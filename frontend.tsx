import { useState } from 'react';

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleUpload = async () => {
    if (!file) return alert('Please select a file');

    const formData = new FormData();
    formData.append('file', file);

    await fetch('http://localhost:3000/upload', { method: 'POST', body: formData });
    const response = await fetch('http://localhost:3000/summarize');
    const data = await response.json();
    setSummary(data.summary);
  };

  const handleFeedback = async (isApproved: boolean) => {
    if (!isApproved) {
      const response = await fetch('http://localhost:3000/summarize');
      const data = await response.json();
      setSummary(data.summary);
    } else {
      setFeedback('Summary Approved');
    }
  };

  return (
    <div>
      <h1>Upload Document for Summary</h1>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={handleUpload}>Upload & Summarize</button>

      {summary && (
        <div>
          <h2>Summary:</h2>
          <p>{summary}</p>
          <button onClick={() => handleFeedback(true)}>Approve</button>
          <button onClick={() => handleFeedback(false)}>Regenerate</button>
        </div>
      )}

      {feedback && <p>{feedback}</p>}
    </div>
  );
};

export default App;