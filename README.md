# GhostMail

Personal web mail client. Connects to any IMAP/SMTP server, runs in browser on phone / tablet / desktop.

## Stack
- **server/**: Fastify + ImapFlow + Nodemailer (TypeScript)
- **web/**: React + Vite + TailwindCSS (TypeScript)

## Quick start

```bash
npm install
cp server/.env.example server/.env   # fill in IMAP creds + WEB_PASSWORD_HASH + JWT_SECRET
npm run dev
```

Open http://localhost:5173.

## Generate a password hash

```bash
node -e "import('bcrypt').then(b => b.hash(process.argv[1], 12).then(console.log))" 'your-web-password'
```

## Deploy

Production target: `mail.hwaipy.cn` on server `Code`. See `deploy/` (TBD).
