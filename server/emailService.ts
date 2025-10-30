import nodemailer from "nodemailer";

interface EmailConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}

class EmailService {
  private transporter: any;
  private from: string;
  private enabled: boolean;

  constructor() {
    const config: EmailConfig = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM_EMAIL || "noreply@mikrotik-monitor.local",
    };

    this.from = config.from || "noreply@mikrotik-monitor.local";

    // Check if SMTP is configured
    if (config.host && config.port && config.user && config.pass) {
      this.enabled = true;
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });
      console.log("Email service enabled with SMTP configuration");
    } else {
      this.enabled = false;
      console.log("Email service disabled - using console logging for testing");
    }
  }

  async sendAlertEmail(to: string, alert: {
    routerName: string;
    portName: string;
    currentTraffic: string;
    threshold: string;
    severity: string;
  }): Promise<void> {
    const subject = `[${alert.severity.toUpperCase()}] Traffic Alert: ${alert.routerName} - ${alert.portName}`;
    const text = `
Traffic Alert Notification

Router: ${alert.routerName}
Port: ${alert.portName}
Severity: ${alert.severity}

Current RX Traffic: ${alert.currentTraffic}
Threshold: ${alert.threshold}

The RX (download) traffic on ${alert.portName} has fallen below the configured threshold.
Please check your router configuration and network connectivity.

---
MikroTik Monitor
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; border-radius: 4px; }
    .content { background: #f9f9f9; padding: 20px; margin-top: 20px; border-radius: 4px; }
    .alert-box { background: white; border-left: 4px solid #f44336; padding: 15px; margin: 15px 0; }
    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Traffic Alert Notification</h2>
    </div>
    <div class="content">
      <div class="alert-box">
        <p><strong>Router:</strong> ${alert.routerName}</p>
        <p><strong>Port:</strong> ${alert.portName}</p>
        <p><strong>Severity:</strong> ${alert.severity}</p>
      </div>
      <p><strong>Current RX Traffic:</strong> ${alert.currentTraffic}</p>
      <p><strong>Configured Threshold:</strong> ${alert.threshold}</p>
      <p>The RX (download) traffic on <strong>${alert.portName}</strong> has fallen below the configured threshold. Please check your router configuration and network connectivity.</p>
    </div>
    <div class="footer">
      <p>MikroTik Monitor - Network Traffic Monitoring Platform</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    if (this.enabled) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          text,
          html,
        });
        console.log(`Alert email sent to ${to}`);
      } catch (error) {
        console.error("Failed to send email:", error);
        throw new Error("Failed to send email notification");
      }
    } else {
      // For testing without SMTP: log to console
      console.log("=== EMAIL NOTIFICATION (Testing Mode) ===");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body:\n${text}`);
      console.log("=========================================");
    }
  }

  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const subject = "Welcome to MikroTik Monitor";
    const text = `
Welcome to MikroTik Monitor!

Hello ${name},

Thank you for joining MikroTik Monitor. Your account has been created and is pending administrator approval.

Once your account is activated, you'll be able to:
- Add and monitor multiple MikroTik routers
- View real-time traffic graphs
- Configure custom alert thresholds
- Receive notifications when traffic drops below limits

You'll receive an email notification once your account is approved.

---
MikroTik Monitor
    `.trim();

    if (this.enabled) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          text,
        });
        console.log(`Welcome email sent to ${to}`);
      } catch (error) {
        console.error("Failed to send welcome email:", error);
      }
    } else {
      console.log(`[TEST] Welcome email to ${to}: ${subject}`);
    }
  }

  async sendAccountApprovedEmail(to: string, name: string): Promise<void> {
    const subject = "Your MikroTik Monitor Account Has Been Approved";
    const text = `
Hello ${name},

Great news! Your MikroTik Monitor account has been approved and activated.

You can now log in and start monitoring your MikroTik network infrastructure.

---
MikroTik Monitor
    `.trim();

    if (this.enabled) {
      try {
        await this.transporter.sendMail({
          from: this.from,
          to,
          subject,
          text,
        });
        console.log(`Account approved email sent to ${to}`);
      } catch (error) {
        console.error("Failed to send approval email:", error);
      }
    } else {
      console.log(`[TEST] Account approved email to ${to}: ${subject}`);
    }
  }
}

export const emailService = new EmailService();
