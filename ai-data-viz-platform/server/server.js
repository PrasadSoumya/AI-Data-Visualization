require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : true
}));

// Routes
// const authRoutes = require('./routes/auth');
const datasetRoutes = require('./routes/dataset');
const insightRoutes = require('./routes/insights');

// app.use('/api/auth', authRoutes);
app.use('/api/datasets', datasetRoutes);
app.use('/api/insights', insightRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'Platform is running' });
});

// Database connection
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-data-viz';
const ENABLE_MONGODB = process.env.ENABLE_MONGODB !== 'false';

const startServer = () => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
};

if (!ENABLE_MONGODB) {
  console.log('MongoDB connection skipped because ENABLE_MONGODB=false');
  startServer();
} else {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log('Connected to MongoDB');
      startServer();
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB', err);
      console.log('Starting server without MongoDB because current features do not require it.');
      startServer();
    });
}

// Main entry point for application running

// Main entry point for application running

// Entry point loaded

// Initialize middleware
