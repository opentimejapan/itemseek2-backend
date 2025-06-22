#!/bin/bash

echo "🚀 ItemSeek2 Backend Deployment Script"
echo "======================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Creating from .env.example..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration and run this script again."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Generate database migrations
echo "🗄️  Generating database migrations..."
npm run db:generate

# Run migrations
echo "🗄️  Running database migrations..."
npm run db:push

# Optional: Seed database
read -p "Do you want to seed the database with demo data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🌱 Seeding database..."
    npm run db:seed
fi

# Start with PM2
if command -v pm2 &> /dev/null
then
    echo "🚀 Starting with PM2..."
    pm2 start dist/index.js --name itemseek2-backend
    pm2 save
else
    echo "⚠️  PM2 not found. Starting with node..."
    echo "For production, install PM2: npm install -g pm2"
    node dist/index.js
fi

echo "✅ Deployment complete!"
echo "API running at http://localhost:3100"