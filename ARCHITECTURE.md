# Architecture Overview

## Application shape

This project is a lightweight full-stack monolith:

- `server.js` serves the REST API
- `server.js` also serves the frontend files
- `app.js` is the client-side SPA logic
- `styles.css` handles the responsive UI
- SQLite stores users, projects, memberships, and tasks

## Backend

The backend uses Node.js native modules only:

- `node:http` for the web server
- `node:sqlite` for the SQL database
- `node:crypto` for password hashing and token signing

### Core backend responsibilities

- user signup and login
- password hashing with `scrypt`
- bearer-token authentication
- project membership checks
- role-based access control
- task CRUD updates required by the UI
- dashboard aggregation queries

## Data model

### `users`

- `id`
- `name`
- `email`
- `password_hash`
- `password_salt`
- `created_at`

### `projects`

- `id`
- `name`
- `description`
- `due_date`
- `created_by`
- `created_at`

### `project_members`

- `project_id`
- `user_id`
- `role` (`admin` or `member`)
- `joined_at`

### `tasks`

- `id`
- `project_id`
- `title`
- `description`
- `status` (`todo`, `in_progress`, `done`)
- `priority` (`low`, `medium`, `high`)
- `due_date`
- `assigned_to`
- `created_by`
- `created_at`
- `updated_at`

## RBAC model

- Project creators become `admin`
- `Admins` can add/remove members, change roles, assign tasks, and edit task details
- `Members` can view project data, create tasks, self-assign tasks, and update status for tasks assigned to them

## Frontend flow

1. User signs up or logs in
2. Token is stored in `localStorage`
3. App loads dashboard and project list
4. Selecting a project loads its members, tasks, and summary metrics
5. Admin actions and member actions are rendered conditionally based on role

## Deployment note

The app is designed to run easily on Railway as a single service. For SQLite persistence in production, use a mounted Railway volume and point the database file there through `DATABASE_PATH` or `RAILWAY_VOLUME_MOUNT_PATH`.
