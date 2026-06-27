# DocSense

An AI-powered document intelligence platform focused on scalable backend architecture. Work in progress.

## Project Structure

The repository is structured as a monorepo containing both the backend and frontend components:

```
docsense/
├── backend/       # Bun + Express + Prisma API
└── frontend/      # Client application directory
```

## Technologies

### Backend
- Runtime: Bun
- Framework: Express
- Database: PostgreSQL (with Prisma ORM)
- Validation: Zod
- Logging: Pino

### Frontend
- Target Framework: React / TypeScript

## Getting Started

### Prerequisites
- Bun (v1.0.0 or higher)
- PostgreSQL database instance

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd docsense
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   ```
   ```bash
   bun install
   ```

### Environment Configuration

Configure the environment variables by creating a `.env` file in the `backend/` directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/docsense?schema=public"
PORT=3000
```

### Running the Applications

#### Backend

To start the backend server in development mode with hot reloading:

```bash
cd backend
bun run dev
```

To run in production mode:

```bash
cd backend
bun run start
```

### Database Operations (Prisma)

Ensure you run these commands from the `backend/` directory:

- **Generate Client**:
  ```bash
  bunx --bun prisma generate
  ```
- **Run Migrations**:
  ```bash
  bun run db:migrate
  ```
- **Open Prisma Studio**:
  ```bash
  bun run db:studio
  ```

## Verification

Validate the backend TypeScript compiler configuration and dependencies configuration:

```bash
bun pm trust
```

