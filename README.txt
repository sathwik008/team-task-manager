Team Task Manager

Overview
This is a full-stack web application where users can sign up, log in, create projects, add team members, assign tasks, and track progress with role-based access control.

Core Features
- User authentication: signup and login
- Role-based access: Admin and Member
- Project creation and team management
- Task creation, assignment, and status tracking
- Dashboard with total, in-progress, completed, and overdue tasks
- REST APIs with SQLite database
- Railway-ready deployment setup

Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js
- Database: SQLite
- Authentication: Token-based auth with hashed passwords

How to Run Locally
1. Use Node.js version 22 or later
2. Copy .env.example to .env
3. Start the app with: npm start
4. Open http://localhost:3000

Environment Variables
PORT=3000
HOST=0.0.0.0
APP_SECRET=replace-with-a-secure-random-string
DATABASE_PATH=./data/team-task-manager.sqlite

API Summary
Auth
- POST /api/auth/signup
- POST /api/auth/login
- GET /api/auth/me

Dashboard
- GET /api/dashboard

Projects
- GET /api/projects
- POST /api/projects
- GET /api/projects/:id
- POST /api/projects/:id/members
- PATCH /api/projects/:id/members/:userId
- DELETE /api/projects/:id/members/:userId

Tasks
- POST /api/projects/:id/tasks
- PATCH /api/tasks/:id

Role Rules
- Any logged-in user can create a project
- The project creator becomes Admin
- Admins can add/remove members, update roles, assign tasks, and edit task details
- Members can view project data, create tasks, self-assign, and update status for their assigned tasks

Railway Deployment
1. Push the code to GitHub
2. Create a new Railway project from the GitHub repo
3. Add APP_SECRET as an environment variable
4. Optionally mount a volume for SQLite persistence
5. Deploy and open the generated Railway URL

Suggested Demo Flow
1. Sign up as Admin
2. Create a project
3. Sign up as Member in another browser/incognito tab
4. Add the Member to the project using their email
5. Create a task and assign it to the Member
6. Log in as the Member and update task status
7. Show the dashboard updates and overdue/progress tracking
