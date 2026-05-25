# Daily Track Todo

Plain JavaScript todo app with a separate frontend and backend.

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

```bash
cd backend
npm start
```

The API runs at `http://localhost:4000` and stores tasks in `backend/tasks.json`.

## Run frontend

Open `frontend/index.html` in your browser.

If your backend is deployed somewhere else, update `frontend/config.js`:

```js
window.TODO_API_URL = "https://your-backend-url.com";
```

## API

- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `DELETE /api/tasks/completed`
