# AI-Powered Data Visualization and Insight Platform

## 🎯 Overview
This platform allows users to upload datasets (CSV/Excel), automatically visualizes them, and provides natural language query capabilities using an AI/LLM for advanced data insights.

## 🏗️ Tech Stack
- **Frontend**: Next.js (App Router) + Tailwind CSS + ShadCN UI
- **Backend**: Node.js (Express)
- **Database**: MongoDB
- **AI Integration**: OpenAI API
- **Charts**: Recharts
- **Containerization**: Docker

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose installed on your system.
- Node.js (v18+) if you want to run it locally without Docker.

### 🐳 Running with Docker (Recommended)

1. Create a `.env` file in the `server` directory and add your OpenAI API Key and standard variables:
   ```env
   PORT=5000
   MONGO_URI=mongodb://mongo:27017/ai-data-viz
   JWT_SECRET=your_jwt_secret_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```
2. Similarly, the frontend can be configured if needed (e.g., in `client/.env.local`).
3. Run the complete stack via Docker Compose from the root directory:
   ```bash
   docker-compose up --build
   ```
4. Access the frontend at `http://localhost:3000` and the API at `http://localhost:5000/api/health`.

### ⚡ Running Locally (Without Docker)

#### Backend
1. Open the `server` directory: `cd server`
2. Install dependencies: `npm install`
3. Setup MongoDB locally (ensure it runs on port 27017).
4. Create a `.env` file as described above but map `MONGO_URI` to `mongodb://localhost:27017/ai-data-viz`.
5. Start the server: `node server.js`

#### Frontend
1. Open the `client` directory: `cd client`
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

## 📁 Project Structure
- `/client` → Next.js app with Tailwind, ShadCN UI for the modern, premium dashboard.
- `/server` → Express API handling file uploads, user auth, and LLM communication.
- `docker-compose.yml` → Container orchestration for simple deployment.

## ✨ Features Progress
- [x] Initial Repository Structure Setup
- [x] Dockerization Configured
- [ ] Backend: Authentication (JWT)
- [ ] Backend: File Upload & Parsing (Multer + CSV-Parser)
- [ ] Backend: AI Integration (OpenAI API)
- [ ] Frontend: Dashboard UI with Sidebar
- [ ] Frontend: Visualization integration (Recharts)




