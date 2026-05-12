#!/bin/bash

set -e

echo "ðŸš€ Deploying Sistema Exclusiva to Kubernetes..."

NAMESPACE="production"
ENVIRONMENT=${1:-staging}

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply configurations
echo "ðŸ“‹ Applying configurations..."
kubectl apply -f infra/k8s/config.yaml

# Apply database
echo "ðŸ—„ï¸ Deploying PostgreSQL..."
kubectl apply -f infra/k8s/postgres.yaml
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s

# Apply backend
echo "ðŸ”§ Deploying backend..."
kubectl apply -f infra/k8s/backend.yaml

# Apply frontend
echo "ðŸŽ¨ Deploying frontend..."
kubectl apply -f infra/k8s/frontend.yaml

# Apply scaling
echo "ðŸ“ˆ Configuring autoscaling..."
kubectl apply -f infra/k8s/hpa.yaml

# Apply network policies
echo "ðŸ”’ Applying network policies..."
kubectl apply -f infra/k8s/network-policy.yaml

# Apply backup jobs
echo "ðŸ’¾ Configuring backups..."
kubectl apply -f infra/k8s/backup.yaml

echo ""
echo "âœ… Deployment complete!"
echo ""
echo "ðŸ“Š Monitoring:"
kubectl get svc -n $NAMESPACE
kubectl get pods -n $NAMESPACE
echo ""
echo "ðŸŒ Access your application:"
echo "   Backend:  http://$(kubectl get svc exclusiva-backend -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
echo "   Frontend: http://$(kubectl get svc exclusiva-frontend -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
