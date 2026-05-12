#!/bin/bash

set -e

echo "🧪 Running load tests..."

# Install tools
pip install locust

# Create locustfile
cat > locustfile.py <<'EOF'
from locust import HttpUser, task, between
import random

class APIUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        # Login
        response = self.client.post("/auth/login", json={
            "cpf": "123.456.789-00",
            "password": "password123"
        })
        self.token = response.json()["access_token"]
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}"}
    
    @task(3)
    def list_incidents(self):
        self.client.get("/incidents", headers=self.get_headers())
    
    @task(2)
    def create_incident(self):
        self.client.post(
            "/incidents",
            json={
                "prefix_code": f"VP-{random.randint(1,999):03d}",
                "incident_type": "Avaria",
                "description": "Test incident"
            },
            headers=self.get_headers()
        )
    
    @task(3)
    def list_swaps(self):
        self.client.get("/swaps", headers=self.get_headers())
    
    @task(1)
    def create_swap(self):
        self.client.post(
            "/swaps",
            json={
                "vehicle_out": f"VP-{random.randint(1,999):03d}",
                "vehicle_in": f"VP-{random.randint(1,999):03d}"
            },
            headers=self.get_headers()
        )
    
    @task(5)
    def health_check(self):
        self.client.get("/health")
EOF

# Run load test
locust -f locustfile.py \
  -H http://localhost:8000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --headless \
  --csv=load_test_results

echo "✅ Load test complete!"
echo "📊 Results saved to load_test_results.csv"
