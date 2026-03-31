require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

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

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err);
  });

// Main entry point for application running

// Main entry point for application running
