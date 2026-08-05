# Daily Track Todo

Plain JavaScript calendar todo app with a separate frontend and backend.

## Project structure

```text
frontend/
  index.html
  app.js
  styles.css
  config.js

backend/
  server.js
  package.json
```

## Run backend

Create `backend/.env` from `backend/.env.example`, then set your MongoDB connection string:

```bash
cd backend
npm start
```

The API runs at `http://localhost:4000` by default. It uses MongoDB when `MONGODB_URI` is available, and falls back to `backend/database/tasks.json` for local development.

## Run frontend

Open `frontend/index.html` in your browser.

If your backend is deployed somewhere else, update `frontend/config.js`:

```js
window.TODO_API_URL = "https://your-backend-url.com";
```

## API

- `GET /health`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks/completed`

Tasks support `title`, `due`, `priority`, and `status`. Status can be `todo`, `in-progress`, or `done`.
