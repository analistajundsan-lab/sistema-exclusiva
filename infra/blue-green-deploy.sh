#!/bin/bash

set -e

ENVIRONMENT=${1:-staging}
echo "ðŸ”„ Performing blue-green deployment to $ENVIRONMENT..."

# Get current (blue) version
BLUE_VERSION=$(kubectl get deployment exclusiva-backend -n $ENVIRONMENT -o jsonpath='{.spec.template.spec.containers[0].image}' | awk -F: '{print $2}')
GREEN_VERSION="$(date +%Y%m%d_%H%M%S)"

echo "Current version (blue): $BLUE_VERSION"
echo "New version (green): $GREEN_VERSION"

# Deploy new version
echo "ðŸš€ Deploying new version..."
kubectl set image deployment/exclusiva-backend exclusiva-backend=exclusiva-backend:$GREEN_VERSION -n $ENVIRONMENT

# Wait for rollout
echo "â³ Waiting for deployment to be ready..."
kubectl rollout status deployment/exclusiva-backend -n $ENVIRONMENT --timeout=5m

# Run smoke tests
echo "ðŸ§ª Running smoke tests..."
BACKEND_URL=$(kubectl get svc exclusiva-backend -n $ENVIRONMENT -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

for i in {1..10}; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://$BACKEND_URL/health)
  if [ $RESPONSE -eq 200 ]; then
    echo "âœ… Smoke test passed!"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "âŒ Smoke test failed, rolling back..."
    kubectl rollout undo deployment/exclusiva-backend -n $ENVIRONMENT
    exit 1
  fi
  sleep 5
done

echo "âœ… Blue-green deployment complete!"
echo "ðŸŽ‰ New version $GREEN_VERSION is now live!"
