#!/bin/bash

set -e

echo "ðŸ“¦ Building production images..."

# Build backend
echo "ðŸ”¨ Building backend..."
docker build -t exclusiva-backend:latest ./backend
docker tag exclusiva-backend:latest exclusiva-backend:$(date +%Y%m%d_%H%M%S)

# Build frontend
echo "ðŸŽ¨ Building frontend..."
docker build -t exclusiva-frontend:latest ./frontend
docker tag exclusiva-frontend:latest exclusiva-frontend:$(date +%Y%m%d_%H%M%S)

# Build all services
echo "ðŸ³ Building full stack..."
docker-compose -f docker-compose.prod.yml build

echo "âœ… Build complete!"
echo ""
echo "Images ready for deployment:"
docker images | grep aap
