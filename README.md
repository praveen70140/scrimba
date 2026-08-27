# Scrimba Clone

This repository contains a clone of the Scrimba learning platform, featuring a VS Code extension and a backend service to create, record, and play interactive coding lessons.

## Prerequisites

- [Bun](https://bun.sh/) (used as the primary package manager and runtime)
- [Docker](https://www.docker.com/) & Docker Compose (for PostgreSQL and MinIO)
- [Node.js](https://nodejs.org/) (for VS Code extension tools)
- [VS Code](https://code.visualstudio.com/)

## Project Structure

- `backend/`: The backend API server, handling database interactions and file uploads.
- `extension/`: The VS Code extension that records typing, terminal interactions, and plays them back.
- `packages/`: Shared utilities and code across the workspace.

## Getting Started

### 1. Install Dependencies

Install all dependencies from the root directory using Bun:

```bash
bun install
```

### 2. Setup Docker Services (Database & Storage)

The backend requires a PostgreSQL database and an S3-compatible storage service (MinIO is used for local development).

1. Create your Docker environment file by copying the template:
   ```bash
   cp .env.docker.example .env.docker
   ```
2. Start the services using Docker Compose:
   ```bash
   docker compose up -d
   ```
   *(This starts PostgreSQL on port `5432` and the MinIO API/Console on ports `9000`/`9001`)*

### 3. Configure the Backend

The backend needs environment variables and a database schema.

1. Ensure the `backend/.env` file exists and has the correct `DATABASE_URL` and `S3_*` credentials matching your `.env.docker`. (It comes pre-configured with defaults).
2. Generate the Prisma client and run migrations:
   ```bash
   cd backend
   bunx prisma generate
   bunx prisma migrate dev
   ```

### 4. Run the Backend

Start the backend API in development mode (with hot-reload):

```bash
# From the root directory:
bun run dev:backend

# Or from the backend directory:
cd backend
bun run --watch src/index.ts
```

### 5. Run the VS Code Extension in Debug Mode

To test and develop the VS Code extension:

1. Build the extension and backend (or run the build script from the root):
   ```bash
   bun run build
   ```
2. Open the project root or the `extension/` folder in VS Code.
3. Press `F5` to open the "Run and Debug" panel. This will compile the TypeScript code and launch a new VS Code window (the **Extension Development Host**) with the extension loaded.
4. In the Extension Development Host window, you can run commands from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) by searching for `Scrim:`. You should also see the Scrimba icon in the Activity Bar.

*(Tip: To automatically recompile the extension when you make changes, you can run `bun run tsc -w` inside the `extension` folder).*

## Other Important Details

- **MinIO Console**: You can view the mock S3 storage by visiting `http://localhost:9001` in your browser. Log in using `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` defined in `.env.docker`.
- **Database**: We use Prisma as our ORM. If you modify the schema (`backend/prisma/schema.prisma`), remember to run `bunx prisma migrate dev` to update your local database.
- **Monorepo setup**: This project uses Bun workspaces. You can see the configuration in `package.json`. Shared code is located in the `packages/` directory and referenced via `workspace:*`.
