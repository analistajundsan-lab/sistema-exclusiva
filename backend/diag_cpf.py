"""Diagnostico de acesso por CPF.

Investiga por que um usuario nao consegue logar ("CPF inexistente"/"CPF ou
senha invalidos") apesar de existir no cadastro. Compara o hash de CPF
armazenado com o que o sistema calcula HOJE (HMAC seguro + legado) e localiza o
usuario por nome, deixando claro se a causa e:

  (a) divergencia de hash  -> CPF gravado != CPF digitado, OU pepper trocado;
  (b) usuario inexistente   -> nunca foi criado / CPF diferente;
  (c) usuario inativo       -> existe, mas is_active=False.

Uso (rodar no MESMO ambiente do backend, com DATABASE_URL e CPF_HASH_PEPPER):

    python diag_cpf.py 03663487601
    python diag_cpf.py 03663487601 --nome FEICHAS

NUNCA imprime CPF completo nos logs persistidos; apenas em stdout local para a
investigacao pontual. Nao altera nada (somente leitura).
"""

import argparse
import re

from config import settings
from models import SessionLocal, User
from routes_auth import _hash_cpf_legacy, _hash_cpf_secure, find_user_by_cpf


def _mask(cpf: str) -> str:
    d = re.sub(r"\D", "", cpf)
    return f"***.***.{d[6:9]}-{d[9:]}" if len(d) == 11 else "(invalido)"


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnostico de acesso por CPF")
    parser.add_argument("cpf", help="CPF a investigar (com ou sem mascara)")
    parser.add_argument(
        "--nome",
        default=None,
        help="Trecho do nome para busca alternativa (ex.: FEICHAS)",
    )
    args = parser.parse_args()

    cpf_clean = re.sub(r"\D", "", args.cpf)
    print("=" * 70)
    print("DIAGNOSTICO DE ACESSO POR CPF")
    print("=" * 70)
    print(f"CPF (mascarado): {_mask(cpf_clean)}  | digitos: {len(cpf_clean)}")
    print(f"CPF_HASH_PEPPER definido? {'SIM' if settings.CPF_HASH_PEPPER else 'NAO'}")
    print("-" * 70)

    secure = _hash_cpf_secure(cpf_clean) if settings.CPF_HASH_PEPPER else "(pepper off)"
    legacy = _hash_cpf_legacy(cpf_clean)
    print(f"hash seguro (HMAC) esperado: {secure}")
    print(f"hash legado (sha256[:16])  : {legacy}")
    print("-" * 70)

    db = SessionLocal()
    try:
        user, needs_rehash = find_user_by_cpf(db, cpf_clean)
        if user:
            print("RESULTADO: usuario ENCONTRADO pelo CPF.")
            print(f"  id={user.id}  nome={user.name!r}  email={user.email!r}")
            print(f"  is_active={user.is_active}  role={user.role}")
            print(f"  must_change_password={user.must_change_password}")
            print(f"  hash_armazenado={user.cpf_hash}")
            print(f"  via_hash_legado(needs_rehash)={needs_rehash}")
            if not user.is_active:
                print("  >>> CAUSA PROVAVEL: usuario INATIVO (reative no painel).")
            else:
                print("  >>> CPF resolve certo. Se o login falha, e a SENHA.")
                print("      Acao: redefinir senha temporaria (recriar ou reset).")
        else:
            print("RESULTADO: NENHUM usuario casa com este CPF (seguro nem legado).")
            print("  >>> CAUSA: hash gravado != hash atual deste CPF.")
            print("      Hipoteses: (1) CPF gravado diferente do digitado;")
            print("                 (2) CPF_HASH_PEPPER foi trocado apos a criacao.")

        if args.nome:
            print("-" * 70)
            like = f"%{args.nome.upper()}%"
            rows = db.query(User).filter(User.name.ilike(like)).order_by(User.id).all()
            print(f"Busca por nome ~ {args.nome!r}: {len(rows)} resultado(s)")
            for r in rows:
                casa_seguro = settings.CPF_HASH_PEPPER and r.cpf_hash == secure
                casa_legado = r.cpf_hash == legacy
                print(
                    f"  id={r.id} nome={r.name!r} active={r.is_active} "
                    f"must_change={r.must_change_password} "
                    f"hash={r.cpf_hash[:20]}... "
                    f"casa_cpf={'SIM' if (casa_seguro or casa_legado) else 'NAO'}"
                )
            print("  (casa_cpf=NAO em todos => o CPF deste cadastro NAO e o digitado")
            print("   ou o pepper mudou: corrija recriando o usuario com o CPF certo.)")
    finally:
        db.close()
    print("=" * 70)


if __name__ == "__main__":
    main()
