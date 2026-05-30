import nodemailer from 'nodemailer';
import type { MailServer } from './settings.js';

export async function testSmtp(smtp: MailServer): Promise<void> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
