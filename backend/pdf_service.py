import io
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

BRASILIA_TZ = ZoneInfo("America/Sao_Paulo")

LOCAL_AVARIA_LABELS = {
    "FL": "Frente Esquerdo",
    "FR": "Frente Direito",
    "ML": "Meio Esquerdo",
    "MR": "Meio Direito",
    "TL": "Traseiro Esquerdo",
    "TR": "Traseiro Direito",
    "F": "Frente",
    "T": "Traseiro",
}


def _fmt_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    local = dt.astimezone(BRASILIA_TZ) if dt.tzinfo else dt
    return local.strftime("%d/%m/%Y %H:%M")


def _fmt_date(dt: Optional[datetime]) -> str:
    if not dt:
        return "____ / ____ / ______"
    local = dt.astimezone(BRASILIA_TZ) if dt.tzinfo else dt
    return local.strftime("%d / %m / %Y")


def generate_comunicacao_acidente_pdf(
    *,
    ticket_id: int,
    unit: str,
    prefix: str,
    plate: Optional[str],
    model: Optional[str],
    driver_name: str,
    driver_registration: str,
    submitted_at: datetime,
    blocking_items: list[str],
    nr_interno: str = "",
    tipo_acidente: str = "",
) -> bytes:
    """Gera PDF da Comunicação de Acidente — EXCLUSIVA TURISMO."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm, mm
        from reportlab.platypus import (
            HRFlowable,
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
    except ImportError:
        raise RuntimeError("reportlab nao instalado — adicione ao requirements.txt")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", fontSize=14, fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=4
    )
    header_style = ParagraphStyle(
        "header", fontSize=9, fontName="Helvetica-Bold", alignment=TA_LEFT
    )
    label_style = ParagraphStyle(
        "label", fontSize=7.5, fontName="Helvetica-Bold", textColor=colors.HexColor("#555555")
    )
    value_style = ParagraphStyle(
        "value", fontSize=9, fontName="Helvetica", leading=12
    )
    red_style = ParagraphStyle(
        "red", fontSize=9, fontName="Helvetica-Bold", textColor=colors.HexColor("#CC0000")
    )
    small_style = ParagraphStyle(
        "small", fontSize=8, fontName="Helvetica", textColor=colors.HexColor("#444444")
    )

    BLACK = colors.black
    LIGHT_GRAY = colors.HexColor("#F5F5F5")
    DARK_GRAY = colors.HexColor("#222222")
    RED = colors.HexColor("#CC0000")
    HEADER_BG = colors.HexColor("#1A1A2E")

    elements = []

    # ── Header principal ──────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph("<b>EXCLUSIVA TURISMO</b>", ParagraphStyle("co", fontSize=11, fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("COMUNICAÇÃO DE ACIDENTE", ParagraphStyle("ct", fontSize=14, fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_CENTER)),
            Paragraph(f"<b>Nº {ticket_id:04d}</b><br/><font size='8'>CANACEM: _____________</font>",
                      ParagraphStyle("nr", fontSize=11, fontName="Helvetica-Bold", textColor=colors.white, alignment=TA_CENTER)),
        ]
    ]
    header_table = Table(header_data, colWidths=[5 * cm, None, 5 * cm])
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (0, 0), 12),
        ("RIGHTPADDING", (-1, -1), (-1, -1), 12),
        ("LINEBELOW", (0, 0), (-1, -1), 2, RED),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.3 * cm))

    # ── Dados do veículo ──────────────────────────────────────────────────────
    def field(label: str, value: str, bg=LIGHT_GRAY) -> Table:
        t = Table(
            [[Paragraph(label, label_style), Paragraph(value or "—", value_style)]],
            colWidths=[3.2 * cm, None],
        )
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#E8E8E8")),
            ("BACKGROUND", (1, 0), (1, 0), bg),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ]))
        return t

    date_str = _fmt_dt(submitted_at)

    vehicle_data = [
        [
            field("PREFIXO", prefix),
            Spacer(0.3 * cm, 0),
            field("PLACA", plate or ""),
            Spacer(0.3 * cm, 0),
            field("MARCA / MODELO", model or ""),
        ],
        [Spacer(0, 0.15 * cm)] * 5,
        [
            field("UNIDADE", unit),
            Spacer(0.3 * cm, 0),
            field("DATA / HORA", date_str),
            Spacer(0.3 * cm, 0),
            field("MATRÍCULA CONDUTOR", driver_registration),
        ],
        [Spacer(0, 0.15 * cm)] * 5,
        [
            {"colspan": 5, "data": field("CONDUTOR / AUXILIADOR", driver_name, bg=colors.white)},
            None, None, None, None,
        ],
    ]

    sec1 = Table([
        [field("PREFIXO", prefix), field("PLACA", plate or ""), field("MARCA / MODELO", model or "")],
        [Spacer(0, 0.2 * cm), None, None],
        [field("UNIDADE", unit), field("DATA / HORA", date_str), field("MATRÍCULA CONDUTOR", driver_registration)],
    ], colWidths=["33%", "33%", "34%"], rowHeights=None)
    sec1.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 0)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(sec1)
    elements.append(Spacer(0, 0.15 * cm))

    sec2 = Table(
        [[field("CONDUTOR / MOTORISTA ENVOLVIDO", driver_name, bg=colors.white)]],
        colWidths=["100%"],
    )
    elements.append(sec2)
    elements.append(Spacer(0, 0.4 * cm))

    # ── Tipo de acidente ──────────────────────────────────────────────────────
    acidente_interno = "☑" if tipo_acidente == "INTERNO" else "☐"
    acidente_externo = "☑" if tipo_acidente == "EXTERNO" else "☐"
    tipo_data = [
        [
            Paragraph("<b>ACIDENTE:</b>", label_style),
            Paragraph(f"{acidente_interno} INTERNO", value_style),
            Paragraph(f"{acidente_externo} EXTERNO", value_style),
            Paragraph("<b>Nº BOLETIM OCORRÊNCIA:</b> ___________________", label_style),
            Paragraph("<b>RESPONSÁVEL DO TRÁFEGO:</b> ________________", label_style),
        ]
    ]
    tipo_table = Table(tipo_data, colWidths=[3 * cm, 3 * cm, 3 * cm, None, None])
    tipo_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
    ]))
    elements.append(tipo_table)
    elements.append(Spacer(0, 0.4 * cm))

    # ── Itens impeditivos ─────────────────────────────────────────────────────
    elements.append(
        Table(
            [[Paragraph("⚠  ITENS IMPEDITIVOS IDENTIFICADOS NO CHECK-LIST", ParagraphStyle(
                "sec", fontSize=9, fontName="Helvetica-Bold",
                textColor=colors.white, backColor=RED
            ))]],
            colWidths=["100%"],
        )
    )
    elements.append(Spacer(0, 0.1 * cm))

    items_rows = [[
        Paragraph(f"<b>{i + 1}.</b>  {item}", value_style),
    ] for i, item in enumerate(blocking_items)]

    if not items_rows:
        items_rows = [[Paragraph("Nenhum item impeditivo registrado.", small_style)]]

    items_table = Table(items_rows, colWidths=["100%"])
    items_table.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, colors.HexColor("#FFAAAA")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#FFF5F5"), colors.white]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#FFAAAA")),
    ]))
    elements.append(items_table)
    elements.append(Spacer(0, 0.4 * cm))

    # ── Portaria / Emissão de Vale ────────────────────────────────────────────
    portaria_data = [
        [
            Paragraph("<b>A PORTARIA QUANTO AO CONSERTO DO VEÍCULO:</b>", label_style),
            Paragraph("_" * 40, value_style),
            Paragraph("<b>EMISSÃO DE VALE:</b>", label_style),
            Paragraph("_" * 20, value_style),
        ]
    ]
    portaria_table = Table(portaria_data, colWidths=[6.5 * cm, None, 4 * cm, 5 * cm])
    portaria_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("LINEAFTER", (1, 0), (1, 0), 0.5, colors.HexColor("#CCCCCC")),
    ]))
    elements.append(portaria_table)
    elements.append(Spacer(0, 0.2 * cm))

    # ── Tabela emissão de vale ─────────────────────────────────────────────────
    vale_header = [
        Paragraph("<b>EMISSÃO DE VALE</b>", label_style),
        Paragraph("<b>ASSINATURA</b>", label_style),
        Paragraph("<b>DATA DA COMUNICAÇÃO</b>", label_style),
    ]
    vale_rows = [vale_header] + [["", "", ""] for _ in range(3)]
    vale_table = Table(vale_rows, colWidths=[5 * cm, 8 * cm, 5 * cm])
    vale_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDDDDD")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(vale_table)
    elements.append(Spacer(0, 0.4 * cm))

    # ── Assinaturas finais ────────────────────────────────────────────────────
    sign_data = [
        [
            Paragraph("<b>INICIAÇÃO</b><br/>____________________________", small_style),
            Paragraph("<b>ASSINATURA</b><br/>____________________________", small_style),
            Paragraph("<b>EMISSÃO DE VALE</b><br/>____________________________", small_style),
        ],
        [
            Paragraph(f"<b>DATA DA COMUNICAÇÃO</b><br/>{_fmt_date(submitted_at)}", small_style),
            Paragraph(f"<b>DATA DA COMUNICAÇÃO</b><br/>{_fmt_date(submitted_at)}", small_style),
            Paragraph(f"<b>DATA DA COMUNICAÇÃO</b><br/>{_fmt_date(submitted_at)}", small_style),
        ],
    ]
    sign_table = Table(sign_data, colWidths=["33%", "34%", "33%"])
    sign_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, BLACK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(sign_table)

    # ── Rodapé ────────────────────────────────────────────────────────────────
    elements.append(Spacer(0, 0.2 * cm))
    elements.append(
        Paragraph(
            f"<i>Documento gerado automaticamente pelo Sistema Exclusiva Turismo · Ticket #{ticket_id} · {_fmt_dt(submitted_at)}</i>",
            ParagraphStyle("footer", fontSize=7, textColor=colors.HexColor("#999999"), alignment=TA_CENTER),
        )
    )

    doc.build(elements)
    return buf.getvalue()
