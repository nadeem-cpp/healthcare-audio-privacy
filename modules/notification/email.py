# Path: modules/notification/email.py
"""
Purpose:
    SMTP email channel used by the notification module.

What it does:
    - Connects via SMTP and sends email messages asynchronously.
"""
import smtplib
import ssl
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from logging_config import logger


class Email:
    def __init__(self, email: str, password: str, smtp_host: str = "smtp.gmail.com", smtp_port: int = 587):
        self.email = email
        self.password = password
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port

    def _connect(self) -> smtplib.SMTP:
        """Create and authenticate a fresh SMTP connection."""
        server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=30)
        server.ehlo()
        server.starttls(context=ssl.create_default_context())
        server.ehlo()
        server.login(self.email, self.password)
        return server

    async def send(
        self,
        to: str | list[str],
        subject: str,
        body: str,
        html: bool = False,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        attachments: list[dict] | None = None,
    ) -> bool:
        """
        Send an email.

        :param to: recipient email or list of recipients
        :param subject: email subject
        :param body: email body (plain text or HTML)
        :param html: set True if body is HTML
        :param cc: optional list of CC recipients
        :param bcc: optional list of BCC recipients
        :param attachments: optional list of dicts: [{"filename": "x.pdf", "content": bytes}]
        :return: True if sent successfully, False otherwise
        """
        recipients = [to] if isinstance(to, str) else list(to)
        all_recipients = recipients + (cc or []) + (bcc or [])

        try:
            msg = MIMEMultipart()
            msg["From"] = self.email
            msg["To"] = ", ".join(recipients)
            msg["Subject"] = subject
            if cc:
                msg["Cc"] = ", ".join(cc)

            msg.attach(MIMEText(body, "html" if html else "plain"))

            for attachment in attachments or []:
                part = MIMEApplication(attachment["content"], Name=attachment["filename"])
                part["Content-Disposition"] = f'attachment; filename="{attachment["filename"]}"'
                msg.attach(part)

            server = self._connect()
            try:
                server.sendmail(self.email, all_recipients, msg.as_string())
            finally:
                server.quit()

            logger.info(f"Email sent to {all_recipients} | subject: {subject}")
            return True

        except smtplib.SMTPAuthenticationError as e:
            logger.error(f"SMTP auth failed for {self.email}: {e}")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email: {e}\n{traceback.format_exc()}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}\n{traceback.format_exc()}")
            return False
