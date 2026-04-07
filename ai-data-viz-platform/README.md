# AI-Powered Data Visualization and Dataset Q&A

This project lets users upload CSV or Excel files, generate multiple chart types automatically, and ask grounded questions about the uploaded dataset using Gemini or OpenAI.

## Stack

- Frontend: Next.js in [`client`](/d:/ETECH%20LAB/ai-data-viz-platform/client)
- Backend: Express in [`server`](/d:/ETECH%20LAB/ai-data-viz-platform/server)
- Charts: Recharts
- AI provider: Gemini or OpenAI
- Local orchestration: Docker Compose

## Recommended Deployment

- Deploy `client` to Vercel
- Deploy `server` to Render

This repo is split into two apps. Do not deploy the repo root directly to Vercel.

## 1. Deploy the Backend on Render

Render can use [`render.yaml`](/d:/ETECH%20LAB/ai-data-viz-platform/render.yaml) or manual settings.

### Backend settings

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`

### Backend environment variables

Use [`server/.env.example`](/d:/ETECH%20LAB/ai-data-viz-platform/server/.env.example) as the template.

Required values:

```env
PORT=5005
ENABLE_MONGODB=false
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash
CORS_ORIGIN=https://your-vercel-app.vercel.app
```

Notes:

- `ENABLE_MONGODB=false` is enough for the current upload + chart + dataset-QA flow.
- If you later add auth or persisted storage, set up MongoDB and flip `ENABLE_MONGODB=true`.

After deployment, note your Render backend URL, for example:

```text
https://ai-data-viz-platform-api.onrender.com
```

## 2. Deploy the Frontend on Vercel

When importing the GitHub repo into Vercel:

- Framework Preset: `Next.js`
- Root Directory: `client`

Do not use a local Windows path like `D:\...`.

### Frontend environment variable

Use [`client/.env.example`](/d:/ETECH%20LAB/ai-data-viz-platform/client/.env.example) as the template and add this in Vercel:

```env
NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com/api
```

Example:

```env
NEXT_PUBLIC_API_URL=https://ai-data-viz-platform-api.onrender.com/api
```

Then redeploy the Vercel project.

## Local Development

### Backend

```bash
cd server
npm install
node server.js
```

### Frontend

```bash
cd client
npm install
npm run dev
```

## Docker

For local Docker usage:

```bash
docker-compose up --build
```

## Important Security Note

If you accidentally committed a real API key in `server/.env`, rotate that key immediately in your Gemini dashboard and replace it with a new one.
