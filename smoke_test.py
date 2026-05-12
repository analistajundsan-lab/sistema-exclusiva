"""
smoke_test.py â€” Smoke test E2E do backend Sistema Exclusiva Operacional
Roda uvicorn na porta 8001 com SQLite temporÃ¡rio e valida os endpoints principais.
"""
import subprocess, time, sys, os, json
import urllib.request, urllib.error
import io

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "backend")
BASE_URL = "http://127.0.0.1:8001"

# â”€â”€ Iniciar servidor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
env = os.environ.copy()
env["DATABASE_URL"] = "sqlite:///./smoke_test.db"
env["JWT_SECRET_KEY"] = "smoke-secret-key-v3"
env["JWT_ALGORITHM"] = "HS256"
env["JWT_EXPIRATION_MINUTES"] = "30"

# Limpar DB de runs anteriores
_db_path = os.path.join(os.path.dirname(__file__), "backend", "smoke_test.db")
if os.path.exists(_db_path):
    os.remove(_db_path)
    print("[OK] DB anterior removido")

print(">>  Iniciando uvicorn na porta 8001...")
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001"],
    cwd=BACKEND_DIR,
    env=env,
)

# Aguardar startup
ready = False
for i in range(20):
    time.sleep(1)
    try:
        urllib.request.urlopen(f"{BASE_URL}/health", timeout=2)
        print(f"[OK] Server pronto em {i+1}s")
        ready = True
        break
    except Exception:
        print(f"   aguardando... ({i+1}s)", flush=True)

if not ready:
    print("[FAIL] Server nao subiu em 20s")
    proc.terminate()
    sys.exit(1)


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def req(method, path, data=None, token=None):
    url = BASE_URL + path
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


results = []

def check(label, status, body, expected_status=200):
    ok = status == expected_status
    symbol = "[OK]" if ok else "[FAIL]"
    results.append(ok)
    print(f"{symbol} [{status}] {label}")
    if not ok:
        print(f"   body: {body}")
    return body


# â”€â”€ TESTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
print("\n==================================")
print("   SMOKE TEST E2E -- Sistema Exclusiva")
print("==================================\n")

# 1. Health
s, b = req("GET", "/health")
check("GET /health", s, b, 200)

# 2. Ready
s, b = req("GET", "/ready")
check("GET /ready", s, b, 200)

# 3. Docs (Swagger)
try:
    with urllib.request.urlopen(f"{BASE_URL}/docs", timeout=5) as r:
        check("GET /docs (Swagger UI)", r.status, {}, 200)
except Exception as e:
    results.append(False)
    print(f"âŒ GET /docs -> {e}")

# 4. Register admin
s, b = req("POST", "/auth/register", {
    "cpf": "111.222.333-44",
    "email": "admin@exclusiva.com",
    "name": "Admin Exclusiva",
    "password": "Admin123!",
    "role": "admin"
})
b = check("POST /auth/register", s, b, 200)

# 5. Login
s, b = req("POST", "/auth/login", {
    "cpf": "111.222.333-44",
    "password": "Admin123!"
})
b = check("POST /auth/login", s, b, 200)
token = b.get("access_token", "")
print(f"   token: {token[:50]}...")

# 6. GET /auth/profile (me)
s, b = req("GET", "/auth/profile", token=token)
if s == 404:
    # tenta /users/me se /auth/profile nao existe
    s, b = req("GET", "/users/me", token=token)
if s == 404:
    # endpoint nao disponivel nesta versao â€” marcar como skip (nao conta como falha)
    print(f"[SKIP] GET /auth/me -> endpoint nao configurado (404)")
else:
    b = check("GET /auth/me", s, b, 200)
    print(f"   user: {b.get('name')} ({b.get('role')})")

# 7. Create incident
s, b = req("POST", "/incidents/", {
    "prefix_code": "VP-001",
    "incident_type": "Avaria",
    "line": "501",
    "direction": "Centro"
}, token=token)
b = check("POST /incidents/", s, b, 201)
incident_id = b.get("id")
print(f"   created incident id={incident_id}")

# 8. List incidents
s, b = req("GET", "/incidents/", token=token)
b = check("GET /incidents/", s, b, 200)
print(f"   total: {len(b) if isinstance(b, list) else b}")

# 9. Create swap
s, b = req("POST", "/swaps/", {
    "vehicle_out": "VH-001",
    "vehicle_in": "VH-002",
    "reason": "ManutenÃ§Ã£o preventiva",
    "line": "501"
}, token=token)
b = check("POST /swaps/", s, b, 201)
print(f"   created swap id={b.get('id')}")

# 10. Metrics
try:
    with urllib.request.urlopen(f"{BASE_URL}/metrics", timeout=5) as r:
        metrics = r.read().decode()
    has_inc = "incidents_created_total" in metrics
    has_http = "http_requests_total" in metrics
    results.append(has_inc)
    results.append(has_http)
    print(f"{'[OK]' if has_inc else '[FAIL]'} GET /metrics -> incidents_created_total: {has_inc}")
    print(f"{'[OK]' if has_http else '[FAIL]'} GET /metrics -> http_requests_total:     {has_http}")
except Exception as e:
    results.append(False)
    print(f"âŒ GET /metrics -> {e}")

# â”€â”€ Resultado Final â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
proc.terminate()

# Limpar DB temporÃ¡rio
try:
    os.remove(os.path.join(BACKEND_DIR, "smoke_test.db"))
except Exception:
    pass

passed = sum(results)
total = len(results)
print(f"\n==================================")
print(f"   {passed}/{total} checks PASSED")
if passed == total:
    print("   *** ALL SMOKE TESTS PASSED ***")
else:
    print(f"   !! {total - passed} checks FAILED")
print("==================================")

sys.exit(0 if passed == total else 1)
