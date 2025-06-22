# ItemSeek2 Backend API

Multi-tenant inventory management backend with industry-agnostic design.

## Features

- 🔐 JWT-based authentication with refresh tokens
- 🏢 Multi-tenant architecture
- 👥 Role-based access control (RBAC)
- 📦 Comprehensive inventory management
- 🤖 AI provider integration support
- 📊 Audit logging
- 🚀 Production-ready with rate limiting

## Tech Stack

- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT with bcrypt
- **Validation**: Zod
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate limiting

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm (recommended) or npm

## Installation

1. Clone the repository:
```bash
git clone https://github.com/opentimejapan/itemseek2-backend.git
cd itemseek2-backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/itemseek2
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
```

## Database Setup

1. Create database:
```bash
createdb itemseek2
```

2. Run migrations:
```bash
npm run db:push
```

3. Seed demo data (optional):
```bash
npm run db:seed
```

Demo credentials:
- Admin: `admin@demo.com` / `demo123456`
- Manager: `manager@demo.com` / `demo123456`

## Development

Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3100`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - Create new organization and admin user
- `POST /api/auth/logout` - Logout current session
- `POST /api/auth/refresh` - Refresh access token

### Users
- `GET /api/users/me` - Get current user
- `PATCH /api/users/me` - Update current user
- `POST /api/users/me/change-password` - Change password
- `GET /api/users` - List organization users (admin only)
- `POST /api/users` - Create user (admin only)
- `PATCH /api/users/:id` - Update user (admin only)

### Organization
- `GET /api/organization` - Get organization details
- `PATCH /api/organization` - Update organization (admin only)
- `POST /api/organization/ai-providers` - Add AI provider (admin only)
- `DELETE /api/organization/ai-providers/:id` - Remove AI provider (admin only)

### Inventory
- `GET /api/inventory` - List inventory items
- `GET /api/inventory/:id` - Get single item
- `POST /api/inventory` - Create item (manager+)
- `PATCH /api/inventory/:id` - Update item (manager+)
- `POST /api/inventory/:id/quantity` - Update quantity
- `DELETE /api/inventory/:id` - Delete item (admin only)
- `GET /api/inventory/:id/movements` - Get item movements

## Role Hierarchy

1. **System Admin**: Full system access (future feature)
2. **Organization Admin**: Full organization access
3. **Manager**: Inventory management, team management
4. **User**: Basic inventory operations
5. **Viewer**: Read-only access

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Set production environment:
```bash
NODE_ENV=production
```

3. Start with PM2:
```bash
pm2 start dist/index.js --name itemseek2-backend
```

## Security

- All passwords are hashed with bcrypt
- JWT tokens expire after 7 days
- Refresh tokens expire after 30 days
- Rate limiting on all endpoints
- SQL injection protection via parameterized queries
- XSS protection via Helmet

## License

Private - ItemSeek2 © 2024