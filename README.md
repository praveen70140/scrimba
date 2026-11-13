# Scrimba Clone

This repository contains a clone of the Scrimba learning platform, featuring a VS Code extension and a backend service to create, record, and play interactive coding lessons.

## Prerequisites

- [Bun](https://bun.sh/) (used as the primary package manager and runtime)
- [Docker](https://www.docker.com/) & Docker Compose (for PostgreSQL and RustFS)
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

The backend requires a PostgreSQL database and an S3-compatible storage service (RustFS is used for local development).

1. Create your Docker environment file by copying the template:
   ```bash
   cp .env.docker.example .env.docker
   ```
2. Start the services using Docker Compose:
   ```bash
   docker compose up -d
   ```
   *(This starts PostgreSQL on port `5434` and the RustFS S3 API/Console on ports `9000`/`9001`)*

### 3. Configure the Backend

The backend needs environment variables and a database schema.

1. Ensure the `backend/.env` file exists and has the correct `DATABASE_URL` and `S3_*` credentials matching your `.env.docker`. (Copy `backend/.env.example` to `backend/.env` and set a random `JWT_SECRET`).
2. Generate the Prisma client and run migrations:
   ```bash
   cd backend
   bunx prisma generate
   bunx prisma migrate dev
   ```

### 4. Run the Backend

Start the backend API locally on your host machine (outside of Docker) in development mode:

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

- **RustFS Console**: You can view the mock S3 storage by visiting `http://localhost:9001` in your browser. Log in using `RUSTFS_ACCESS_KEY` and `RUSTFS_SECRET_KEY` defined in `.env.docker`.
- **Database**: We use Prisma as our ORM. If you modify the schema (`backend/prisma/schema.prisma`), remember to run `bunx prisma migrate dev` to update your local database.
- **Monorepo setup**: This project uses Bun workspaces. You can see the configuration in `package.json`. Shared code is located in the `packages/` directory and referenced via `workspace:*`.

## Product model

The product uses three terms deliberately:

- A **lesson checkpoint** is a point in the recorded lesson. Teachers can place a challenge checkpoint while recording.
- A **workspace snapshot** is the editable project created from the exact file state at that checkpoint. The snapshot opens in a separate VS Code window.
- **Git fork** is an optional local implementation detail. Students can choose “Open workspace and initialize Git”; otherwise the snapshot is simply a normal folder and the student can run Git commands manually in its terminal.

When playback reaches a challenge checkpoint, playback pauses and the extension creates a workspace snapshot automatically. It writes `CHALLENGE.md` and `.scrim-challenge.json` beside the project files. The teacher decides whether the challenge can be skipped and may provide a visible test command. Students can run the test from the workspace or use **Scrim: Check Challenge**.

## Why Nix

Each course template carries a `flake.nix`. The flake is the environment contract for the snapshot: it declares the language runtime, packages, and development commands instead of relying on whatever happens to be installed on the student’s machine. The extension does not replay the teacher’s arbitrary terminal history. A student opens the workspace terminal and runs `nix --extra-experimental-features 'nix-command flakes' develop`, which enters the declared environment in the correct workspace directory.

This choice follows the research behind Nix and NixOS. Dolstra and colleagues describe a purely functional configuration model in which packages and configuration are built from a declarative specification and stored immutably, reducing the hidden machine state that usually makes environments hard to reproduce. See [NixOS: A Purely Functional Linux Distribution](https://nixos.org/~eelco/pubs/nixos-icfp2008-submitted.pdf), the [Nix research index](https://nixos.org/research/), and the practical [How Nix Works](https://nixos.org/guides/how-nix-works/) guide.

For the first version, Linux is the supported host. The snapshot code uses portable path handling and ordinary subprocess execution so WSL support remains possible later. `flake.nix` and lockfiles are course-managed; the extension warns students to leave them unchanged while solving a challenge.

## Reset development deployments

Close the running backend and Extension Development Host before resetting.
These commands delete development data immediately, with no confirmation prompt:

```bash
bun run reset:backend
bun run reset:extension
```

The backend reset deletes this Compose project's containers and volumes, including
all database users, courses, progress, and uploaded objects. It recreates PostgreSQL
and RustFS, regenerates Prisma, forces a TypeScript rebuild, applies migrations,
creates the storage bucket, and starts the API in the foreground. Migration
credentials and the published database port come from Compose; `backend/.env`
must also point to that database and use the configured RustFS credentials.

The extension reset deletes extension/shared build outputs, `.vscode-test`, and
all of `~/.scrimba` (local courses, recordings, downloads, and workspace snapshots).
It rebuilds and bundles the extension. Press F5 afterward to start a fresh host;
the extension erases its saved login token on that first activation. If SecretStorage
is unavailable, the marker remains so clearing the token can be retried.

Both scripts remove and reinstall the shared Bun workspace dependencies using
the existing lockfile and an empty temporary download cache. They preserve source
files, `.env` files, and unrelated editor data. Run either script from any directory
using its absolute path, or use the `bun run` commands from the project root.

## Patched VS Code with video fullscreen

The `vscode/` directory contains pinned Code - OSS fullscreen patches and a GitHub
Actions build/release workflow. See [the fullscreen build instructions](vscode/README.md)
for the pin, upstream pipeline references, release artifacts, and patch validation.
