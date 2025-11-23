import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Order } from '../order/entities/order.entity';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null;

  constructor(private readonly configService: ConfigService) {
    this.transporter = this.createTransporter();
  }

  async sendOrderConfirmation(order: Order) {
    if (!this.transporter) {
      this.logger.warn('Email transporter not configured. Skip sending mail.');
      return;
    }

    const from =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'no-reply@vre-deco.com';
    const frontendBase =
      this.configService.get<string>('FRONTEND_BASE_URL') ||
      'http://localhost:5173';
    const normalizedBase = frontendBase.replace(/\/$/, '');
    const orderUrl = `${normalizedBase}/order/${order.id}`;

    const subject = `Confirmation de commande ${order.id}`;
    const text = [
      `Bonjour ${order.name || ''}`.trim(),
      '',
      `Votre commande ${order.id} a été payée avec succès.`,
      `Vous pouvez consulter les détails et le suivi ici : ${orderUrl}`,
      '',
      'Merci pour votre confiance,',
      'L’équipe VRE-DECO.com',
    ].join('\n');

    const html = `
      <p>Bonjour ${order.name || ''},</p>
      <p>Votre commande <strong>${order.id}</strong> a été payée avec succès.</p>
      <p>Consultez les détails et le suivi ici : <a href="${orderUrl}">${orderUrl}</a></p>
      <p>Merci pour votre confiance,<br/>L’équipe VRE-DECO.com</p>
    `;

    try {
      await this.transporter.sendMail({
        to: order.email,
        from,
        subject,
        text,
        html,
      });
      this.logger.log(`Order confirmation email sent to ${order.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send order confirmation to ${order.email}`,
        error as Error,
      );
    }
  }

  private createTransporter(): Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<string>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');
    const secure =
      this.configService.get<string>('SMTP_SECURE', 'false') === 'true';

    if (!host || !port) {
      this.logger.warn('SMTP_HOST / SMTP_PORT missing, email disabled.');
      return null;
    }

    try {
      return nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure,
        auth:
          user && pass
            ? {
                user,
                pass,
              }
            : undefined,
      });
    } catch (error) {
      this.logger.error('Cannot create email transporter', error as Error);
      return null;
    }
  }
}
