import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _send(to_email: str, subject: str, html: str) -> None:
    smtp_email    = os.getenv("SMTP_EMAIL", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_host     = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port     = int(os.getenv("SMTP_PORT", "587"))

    if not smtp_email or not smtp_password:
        logger.warning("SMTP not configured — email not sent")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"TrueVision <{smtp_email}>"
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(smtp_email, smtp_password)
        smtp.sendmail(smtp_email, to_email, msg.as_string())

    logger.info(f"Email sent to {to_email}: {subject}")


def send_verification_email(to_email: str, token: str) -> None:
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    verify_url   = f"{frontend_url}/verify-email?token={token}"

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0B0F17;font-family:Inter,Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" style="background:#0B0F17;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" style="max-width:500px;background:#151B28;border:1px solid #1E2530;border-radius:24px;overflow:hidden;">
      <tr><td align="center" style="padding:40px 0 20px;">
        <h1 style="color:#00E5FF;margin:0;font-size:28px;font-weight:800;letter-spacing:-1px;">
          True<span style="color:#fff;">Vision</span>
        </h1>
      </td></tr>
      <tr><td align="center" style="padding:0 40px 40px;">
        <h2 style="color:#fff;font-size:20px;font-weight:700;margin-bottom:12px;">Подтвердите ваш Email</h2>
        <p style="color:#6B7280;font-size:15px;line-height:22px;margin-bottom:30px;">
          Нажмите кнопку ниже, чтобы активировать аккаунт.
        </p>
        <a href="{verify_url}"
           style="display:inline-block;padding:14px 32px;background:#00E5FF;color:#0B0F17;
                  font-weight:700;text-decoration:none;border-radius:12px;font-size:16px;">
          Подтвердить почту
        </a>
        <p style="margin-top:40px;color:#4B5563;font-size:12px;">
          Если вы не регистрировались — проигнорируйте это письмо.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:20px;border-top:1px solid #1E2530;">
        <p style="color:#4A5568;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:1px;">
          Контроль. Рост. Уверенность.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>"""

    _send(to_email, "TrueVision — Подтвердите email", html)
