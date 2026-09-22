# Path: modules/notification/notification.py
"""
Purpose:
    Facade for sending notifications across configured channels.

What it does:
    - Delegates email sends to the Email channel; stubs for SMS/Slack.
"""
from .email import Email


class Notification:
    def __init__(self, email_channel: Email | None = None, sms_channel=None, slack_channel=None):
        self.email_channel = email_channel
        self.sms_channel = sms_channel
        self.slack_channel = slack_channel


    async def send_email(self, to: str, subject: str, body: str, **kwargs) -> bool:
        if not self.email_channel:
            raise ValueError("Email channel not configured for this Notification instance")
        return await self.email_channel.send(to=to, subject=subject, body=body, **kwargs)


    async def send_sms(self, to: str, body: str) -> bool:
        if not self.sms_channel:
            raise ValueError("SMS channel not configured")
        return await self.sms_channel.send(to=to, body=body)

    # future: send_slack, send_push, etc.
