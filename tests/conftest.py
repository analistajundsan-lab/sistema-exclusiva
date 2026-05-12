import sys
import os
import pytest

# Adiciona backend ao path para que os testes encontrem os módulos
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# Força variáveis de ambiente para SQLite antes de qualquer import
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-only"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["JWT_EXPIRATION_MINUTES"] = "30"


@pytest.fixture(autouse=True)
def isolate_db_override(request):
    """Garante que cada módulo de teste usa seu próprio override de DB."""
    from models import get_db
    from main import app

    module = request.module
    # Cada arquivo de teste define override_get_db no nível do módulo
    if hasattr(module, "override_get_db"):
        app.dependency_overrides[get_db] = module.override_get_db
    yield
    # Restaura após o teste (o próximo teste vai definir o seu)
