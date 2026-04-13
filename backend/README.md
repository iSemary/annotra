# Annotra


## Backend setup

### PostgreSQL

The default [`backend/.env.example`](.env.example) uses **`localhost:15432`**, matching the repo-root [`docker-compose.yml`](../docker-compose.yml) service `db` (user, password, and database name: `annotra`). Start it with:

```bash
docker compose up -d db
```

### Environment

Copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and set `JWT_SECRET` (min 32 characters). Point `DATABASE_URL` at running Postgres. For a first-time local admin, set `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` (see seeding below). [`scripts/autorun.sh`](../scripts/autorun.sh) creates `.env` from `.env.example` when it is missing.

### Run locally


```bash
cd backend
chmod +x setup-venv.sh   # once, if needed
./setup-venv.sh            # creates .venv and installs requirements.txt
source .venv/bin/activate
alembic upgrade head
```

Or manually:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # required before every pip/python in this project
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
alembic upgrade head
```

From the repo root instead of `cd backend`, use: `alembic -c backend/alembic.ini upgrade head` (keep using the same venv and `pip install` from `backend/`).

The first migration seeds **permissions** and **system roles** (e.g. OWNER, ADMIN). It does not create a company or user.

**Optional — bootstrap company + superuser** (reads `DEFAULT_ADMIN_*` / `DEFAULT_COMPANY_NAME` from `.env`):

```bash
python -m scripts.seed_db
```

If `DEFAULT_ADMIN_EMAIL` or `DEFAULT_ADMIN_PASSWORD` is unset, the script exits successfully without changes. If that email already exists, it skips. Registration via the API always creates non-superuser owners for new companies.

**Start the API** (use the port from `API_PORT` in `.env`, often **8006**):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8006
```

Or from the repo root, [`scripts/autorun.sh`](../scripts/autorun.sh) opens a GUI terminal that runs migrate, seed, and Uvicorn (`API_PORT` or **8006**). A second terminal starts the frontend on **3000**.

### Seed environment variables

| Variable | Purpose |
| --- | --- |
| `DEFAULT_ADMIN_EMAIL` | Superuser login email (required for seed to run) |
| `DEFAULT_ADMIN_PASSWORD` | Plain password; (min 8 characters) |
| `DEFAULT_COMPANY_NAME` | Name of the seeded tenant (default: Annotra) |
| `DEFAULT_ADMIN_FULL_NAME`
| `DEFAULT_ADMIN_PHONE` | E.164 phone|

## Postman

Import [`postman/collection.json`](postman/collection.json) and [`postman/environment.json`](postman/environment.json).

## API prefix

All resource routes are under `/api/v1`.