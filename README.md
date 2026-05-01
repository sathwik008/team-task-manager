# Team Task Manager

A full-stack web app where teams can create projects, invite members, assign tasks, and monitor progress with role-based access control.

## Features

- User signup and login
- Role-based access: `admin` and `member`
- Project creation and team management
- Task creation, assignment, and status tracking
- Dashboard with totals, in-progress work, completed items, and overdue tasks
- REST API + SQLite database
- Railway-ready deployment

## Tech stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js native HTTP server
- Database: SQLite via Node's built-in `node:sqlite`
- Auth: token-based auth with hashed passwords using `crypto.scrypt`

## Local setup

1. Use Node.js `22+`.
2. Copy `.env.example` to `.env`.
3. Start the app:

```bash
npm start
```

4. Open `http://localhost:3000`.

## Environment variables

```env
PORT=3000
HOST=0.0.0.0
APP_SECRET=replace-with-a-secure-random-string
DATABASE_PATH=./data/team-task-manager.sqlite
```

On Railway, you can either:

- set `DATABASE_PATH` to a mounted volume path, or
- attach a volume and use `RAILWAY_VOLUME_MOUNT_PATH` so the app stores SQLite at `<volume>/team-task-manager.sqlite`.

## Railway deployment

1. Push this repo to GitHub.
2. Create a new Railway project from the repo.
3. Add environment variables:
   - `APP_SECRET`
   - optionally `DATABASE_PATH`, or attach a Railway volume
4. Deploy.
5. Open the generated Railway URL and create accounts normally through the UI.

## API overview

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Dashboard

- `GET /api/dashboard`

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/members`
- `PATCH /api/projects/:id/members/:userId`
- `DELETE /api/projects/:id/members/:userId`

### Tasks

- `POST /api/projects/:id/tasks`
- `PATCH /api/tasks/:id`

## RBAC rules

- Any authenticated user can create a project.
- The project creator becomes that project's `admin`.
- `Admins` can add/remove members, change member roles, assign tasks to any project member, and edit task details.
- `Members` can view project data, create tasks, assign tasks only to themselves, and update status only for tasks assigned to them.

## Demo flow

1. Sign up as User A and create a project.
2. Sign up as User B in another browser or incognito window.
3. Log back in as User A and add User B to the project by email.
4. Create tasks and assign one to User B.
5. Log in as User B and move the task from `To Do` to `In Progress` or `Done`.

## Project structure

- `/Users/sathwikdamera/Documents/New project/server.js` - API server, auth, database, RBAC
- `/Users/sathwikdamera/Documents/New project/app.js` - frontend app logic
- `/Users/sathwikdamera/Documents/New project/styles.css` - UI styling
- `/Users/sathwikdamera/Documents/New project/index.html` - app shell

## Notes

- SQLite is used to satisfy the database requirement with minimal setup.
- For production durability on Railway, use a mounted volume for the SQLite file.
