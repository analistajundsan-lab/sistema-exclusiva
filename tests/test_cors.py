from fastapi.testclient import TestClient

from main import app


def test_cors_allows_vercel_origin():
    client = TestClient(app)
    origin = "https://sistema-exclusiva-pied.vercel.app"
    response = client.get("/health", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_preflight_allows_vercel_origin():
    client = TestClient(app)
    origin = "https://sistema-exclusiva-pied.vercel.app"
    response = client.options(
        "/auth/users/3",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
