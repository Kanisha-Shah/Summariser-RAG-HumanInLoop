import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import dotenv from 'dotenv';
import cors from 'cors';
import pdfParse from 'pdf-parse';
import path from "path";


// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pdf')) {
            res.setHeader('Access-Control-Allow-Origin', '*'); // ✅ Allow CORS for PDFs
            res.setHeader('Content-Type', 'application/pdf');
        }
    }
}));
app.use(express.json());

app.use(cors({
    origin: "http://localhost:3002", // ✅ Allow Frontend to Access PDFs
    methods: "GET,POST",
    allowedHeaders: "Content-Type"
}));

// Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename: (_, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// ✅ Initialize SQLite Database
const initializeDB = async (): Promise<Database> => {
  const db = await open({
    filename: 'documents.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE,
      content TEXT,
      approved_summary TEXT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      feedback TEXT,
      refined_summary TEXT
    )
  `);

  return db;
};

const dbPromise = initializeDB(); // ✅ Ensure DB is initialized before use

// ✅ Async error handling wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ✅ Upload and Extract Text Once (No Re-extraction Later)
app.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
    
      const db = await dbPromise;
      await db.run('INSERT OR REPLACE INTO documents (filename, content) VALUES (?, ?)', [
        req.file.originalname, "[FILE STORED]" // ✅ Store placeholder instead of extracting text now
      ]);
    
      res.json({ message: 'File uploaded successfully', filename: req.file.originalname });    
}));

// ✅ Summarize Using Stored Text (Ensuring OpenAI API is Handled Properly)
app.post('/summarize', asyncHandler(async (req: Request, res: Response) => {
    const { filename }: { filename: string } = req.body;
    if (!filename) {
      res.status(400).json({ error: 'Filename required' });
      return;
    }
  
    const filePath = path.join(__dirname, 'uploads', filename);
    const isPDF = filename.endsWith('.pdf');
    let text = '';
  
    try {
      if (isPDF) {
        const pdfBuffer = fs.readFileSync(filePath);
        const parsedPdf = await pdfParse(pdfBuffer);
        text = parsedPdf.text;
      } else {
        text = fs.readFileSync(filePath, 'utf-8');
      }
  
      if (!text.trim()) {
        res.status(400).json({ error: 'No extractable text found in the document' });
        return;
      }
  
      // ✅ Store Extracted Text in DB (Optional)
      const db = await dbPromise;
      await db.run('UPDATE documents SET content = ? WHERE filename = ?', [text, filename]);
  
      // ✅ Generate Summary Using OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: "system", content: "You are an expert document summarizer. Extract key points from the given text. In maximum 300 words. Keep it concise and impactful." },
          { role: "user", content: `Summarize the following document:\n\n${text.substring(0, 4000)}` }
        ],
        max_tokens: 512,
        temperature: 0.7,
      });
  
      res.json({ summary: response.choices[0]?.message?.content?.trim() || "No summary available." });
  
    } catch (error) {
      console.error("OpenAI API Error:", error);
      res.status(500).json({ error: "Failed to generate summary. Please try again later." });
    }
  }));

// ✅ Feedback Processing (Now Stores Correct Summary When Approved)
app.post('/feedback', asyncHandler(async (req: Request, res: Response) => {
  const { filename, feedback }: { filename: string; feedback: string } = req.body;

  if (!filename) {
    res.status(400).json({ error: 'Filename required' });
    return;
  }

  const db = await dbPromise;

  if (feedback === "approved") {
    // ✅ Save the last generated summary in `approved_summary` (fixing incorrect storage)
    const summaryData = await db.get<{ summary: string }>(
      'SELECT refined_summary AS summary FROM feedback WHERE filename = ? ORDER BY id DESC LIMIT 1', 
      [filename]
    );

    if (!summaryData?.summary) {
      res.status(400).json({ error: 'No summary available to approve' });
      return;
    }

    await db.run('UPDATE documents SET approved_summary = ? WHERE filename = ?', [summaryData.summary, filename]);
    res.json({ message: "Summary approved and saved." });
    return;
  }

  // ✅ Otherwise, regenerate the summary based on feedback
  const document = await db.get<{ content: string }>('SELECT content FROM documents WHERE filename = ?', [filename]);

  if (!document || !document.content.trim()) {
    res.status(400).json({ error: 'No extractable text found for this document' });
    return;
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: "system", content: "You are an expert document summarizer. Extract key points from the given text. In maximum 300 words. Keep it concise and impactful." },
        { role: "user", content: `Here is a document summary:\n\n"${document.content.substring(0, 4000)}"\n\nUser feedback: "${feedback}". Please refine the summary accordingly.` }
      ],
      max_tokens: 512,
      temperature: 0.7,
    });

    const refinedSummary = response.choices?.[0]?.message?.content?.trim() || "No refined summary available.";

    await db.run('INSERT INTO feedback (filename, feedback, refined_summary) VALUES (?, ?, ?)', [
      filename, feedback, refinedSummary
    ]);

    res.json({ summary: refinedSummary });

  } catch (error) {
    console.error("OpenAI API Error:", error);
    res.status(500).json({ error: "Failed to process feedback. Please try again later." });
  }
}));

// Start Server
app.listen(3000, () => console.log('Server running on http://localhost:3000'));