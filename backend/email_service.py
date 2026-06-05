import logging
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from config import settings

logger = logging.getLogger(__name__)
BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")


def _fmt_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    local = dt.astimezone(BRASILIA_TZ) if dt.tzinfo else dt
    return local.strftime("%d/%m/%Y %H:%M")


def _blocking_items_html(items: list[str]) -> str:
    rows = "".join(
        f"""<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;">
                <span style="color:#dc2626;font-weight:600;">⚠</span>
                &nbsp;{item}
              </td>
            </tr>"""
        for item in items
    )
    return f"""<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #fca5a5;">
      <thead>
        <tr style="background:#fee2e2;">
          <th style="padding:10px 12px;text-align:left;color:#991b1b;font-size:13px;">
            Itens Impeditivos Identificados
          </th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>"""


def build_ficha_tecnica_html(
    *,
    ticket_id: int,
    unit: str,
    prefix: str,
    plate: Optional[str],
    driver_name: str,
    driver_registration: str,
    submitted_at: datetime,
    blocking_items: list[str],
    system_url: str = "https://sistema-exclusiva-pied.vercel.app",
) -> str:
    items_html = _blocking_items_html(blocking_items)
    items_plain = "\n".join(f"  • {i}" for i in blocking_items)
    date_str = _fmt_dt(submitted_at)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ficha Técnica de Manutenção — {prefix}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 6px rgba(0,0,0,0.07);max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:24px 32px;">
              <p style="margin:0;color:#bfdbfe;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
                Sistema Exclusiva Turismo
              </p>
              <h1 style="margin:4px 0 0;color:#ffffff;font-size:22px;font-weight:700;">
                🔧 Ficha Técnica de Manutenção
              </h1>
            </td>
          </tr>

          <!-- Alert banner -->
          <tr>
            <td style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 32px;">
              <p style="margin:0;color:#991b1b;font-size:14px;font-weight:600;">
                ⛔ Veículo com item impeditivo — análise e liberação obrigatórias antes da operação.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">

              <!-- Ticket ref -->
              <p style="margin:0 0 20px;font-size:12px;color:#6b7280;">
                Ticket <strong style="color:#1e40af;">#{ticket_id}</strong>
                &nbsp;·&nbsp; Registrado em {date_str}
              </p>

              <!-- Info grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="50%" style="padding:0 8px 16px 0;vertical-align:top;">
                    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;border:1px solid #e2e8f0;">
                      <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Veículo</p>
                      <p style="margin:0;font-size:18px;font-weight:700;color:#1e293b;">{prefix}</p>
                      {f'<p style="margin:2px 0 0;font-size:13px;color:#64748b;">Placa: {plate}</p>' if plate else ''}
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 16px 8px;vertical-align:top;">
                    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;border:1px solid #e2e8f0;">
                      <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Unidade</p>
                      <p style="margin:0;font-size:18px;font-weight:700;color:#1e293b;">{unit}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                    <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;border:1px solid #e2e8f0;">
                      <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Condutor</p>
                      <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">{driver_name}</p>
                      <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Matrícula: {driver_registration}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                    <div style="background:#fef3c7;border-radius:8px;padding:14px 16px;border:1px solid #fde68a;">
                      <p style="margin:0 0 4px;font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Data da Ocorrência</p>
                      <p style="margin:0;font-size:14px;font-weight:600;color:#78350f;">{date_str}</p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Blocking items -->
              {items_html}

              <!-- CTA -->
              <div style="margin-top:28px;text-align:center;">
                <a href="{system_url}/checklist"
                   style="display:inline-block;background:#1e40af;color:#ffffff;text-decoration:none;
                          padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                  Acessar o Sistema para Aprovar
                </a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">
                Sistema Exclusiva Turismo · Gerado automaticamente em {date_str}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send(*, to: list[str], subject: str, html: str) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY nao configurado — email nao enviado")
        return False
    try:
        import resend  # type: ignore

        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send(
            {
                "from": settings.EMAIL_FROM,
                "to": to,
                "subject": subject,
                "html": html,
            }
        )
        logger.info("Email enviado para %s: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("Falha ao enviar email para %s: %s", to, exc, exc_info=True)
        return False


def send_ficha_tecnica(
    *,
    manager_email: str,
    ticket_id: int,
    unit: str,
    prefix: str,
    plate: Optional[str],
    driver_name: str,
    driver_registration: str,
    submitted_at: datetime,
    blocking_items: list[str],
) -> bool:
    html = build_ficha_tecnica_html(
        ticket_id=ticket_id,
        unit=unit,
        prefix=prefix,
        plate=plate,
        driver_name=driver_name,
        driver_registration=driver_registration,
        submitted_at=submitted_at,
        blocking_items=blocking_items,
    )
    subject = f"[IMPEDITIVO] Veículo {prefix} — Unidade {unit} — Ficha Técnica #{ticket_id}"
    return _send(to=[manager_email], subject=subject, html=html)


def send_sst_approval_notification(
    *,
    sst_emails: list[str],
    ticket_id: int,
    unit: str,
    prefix: str,
    blocking_items: list[str],
    approver_name: str,
    notes: Optional[str],
) -> bool:
    items_html = _blocking_items_html(blocking_items)
    notes_block = (
        f'<div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;margin-top:16px;border-radius:4px;">'
        f'<p style="margin:0;font-size:13px;color:#15803d;"><strong>Observação da gerência:</strong> {notes}</p></div>'
        if notes
        else ""
    )
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Aprovação SST — Veículo {prefix}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);max-width:600px;width:100%;">
        <tr>
          <td style="background:#166534;padding:24px 32px;">
            <p style="margin:0;color:#bbf7d0;font-size:11px;text-transform:uppercase;">Sistema Exclusiva Turismo — SST</p>
            <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;">✅ Ticket #{ticket_id} Aprovado para Avaliação</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 8px;color:#374151;">
              A gerência <strong>{approver_name}</strong> aprovou o ticket <strong>#{ticket_id}</strong>
              referente ao veículo <strong>{prefix}</strong> da unidade <strong>{unit}</strong>
              para avaliação primária do SST.
            </p>
            {notes_block}
            <div style="margin-top:24px;">{items_html}</div>
            <div style="margin-top:28px;text-align:center;">
              <a href="https://sistema-exclusiva-pied.vercel.app/checklist"
                 style="display:inline-block;background:#166534;color:#fff;text-decoration:none;
                        padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">
                Acessar Painel SST
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;">Sistema Exclusiva Turismo · Notificação automática</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    subject = f"[SST] Aprovado para avaliação — Veículo {prefix} Ticket #{ticket_id}"
    return _send(to=sst_emails, subject=subject, html=html)
