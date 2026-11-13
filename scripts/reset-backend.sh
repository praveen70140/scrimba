#!/usr/bin/env bash
set -Eeuo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
if [[ "${1:-}" == --help ]]; then
  echo 'Usage: bash scripts/reset-backend.sh'
  echo 'Deletes this Compose project’s containers and volumes (all users and uploads), reinstalls dependencies, rebuilds, migrates, and starts the API.'
  echo 'Stop the running API first. Source files, .env files, and bun.lock are preserved.'
  exit 0
fi
[[ $# == 0 ]] || { echo 'Unexpected argument; use --help.' >&2; exit 1; }
command -v bun >/dev/null
command -v docker >/dev/null
[[ -f .env.docker && -f backend/.env ]] || { echo 'Create .env.docker and backend/.env first.' >&2; exit 1; }
docker compose config --quiet
docker info >/dev/null
compose_project="$(docker compose config --format json | bun -e 'console.log((await Bun.stdin.json()).name)')"
[[ -n "$compose_project" && "$compose_project" != undefined ]] || exit 1
printf 'Purging backend containers, database users, courses, and uploaded objects for %s.\n' "$compose_project"
docker compose down --volumes --remove-orphans
# Include obsolete volumes from earlier versions of this project's Compose file.
mapfile -t old_volumes < <(docker volume ls --quiet --filter "label=com.docker.compose.project=$compose_project")
if (( ${#old_volumes[@]} )); then docker volume rm "${old_volumes[@]}"; fi
rm -rf -- backend/dist backend/tsconfig.tsbuildinfo packages/shared/dist packages/shared/tsconfig.tsbuildinfo
# Bun workspaces share one dependency installation. Use an empty, temporary
# download cache instead of either reusing or deleting the global Bun cache.
rm -rf -- node_modules backend/node_modules extension/node_modules packages/shared/node_modules
reset_cache="$(mktemp -d)"
trap 'rm -rf -- "$reset_cache"' EXIT
bun install --frozen-lockfile --force --no-cache --cache-dir "$reset_cache"
(cd backend && bun run prisma generate && bun run tsc -b --force)
docker compose up -d --force-recreate --pull always db rustfs
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'PostgreSQL did not become ready.' >&2; exit 1; }
# Derive the migration connection from Compose, including its published port.
# Never print the credentials or trust an unrelated DATABASE_URL in the shell.
bun -e '
const result = Bun.spawnSync(["docker", "compose", "config", "--format", "json"]);
if (result.exitCode) throw new Error("Could not read Compose configuration");
const db = JSON.parse(result.stdout.toString()).services.db;
const port = db.ports.find(p => Number(p.target) === 5432)?.published;
if (!port) throw new Error("Database has no published port");
const url = new URL("postgresql://127.0.0.1");
url.port = String(port);
url.username = db.environment.POSTGRES_USER;
url.password = db.environment.POSTGRES_PASSWORD;
url.pathname = "/" + db.environment.POSTGRES_DB;
const migration = Bun.spawnSync(["bun", "run", "prisma", "migrate", "deploy"], {
  cwd: "backend", env: {...process.env, DATABASE_URL: url.href}, stdout: "inherit", stderr: "inherit"
});
process.exit(migration.exitCode);
'
(cd backend && bun -e '
import { ListBucketsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3Client, initS3 } from "./src/s3.ts";
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try { await s3Client.send(new ListBucketsCommand({})); ready = true; break; }
  catch { await Bun.sleep(1000); }
}
if (!ready) throw new Error("RustFS did not become ready; check S3 credentials in backend/.env");
await initS3();
await s3Client.send(new HeadBucketCommand({Bucket: process.env.S3_BUCKET || "scrimba"}));
')
rm -rf -- "$reset_cache"
trap - EXIT
printf 'Backend rebuilt with empty storage. Starting API using backend/.env (Ctrl+C to stop).\n'
cd backend
exec bun run start
