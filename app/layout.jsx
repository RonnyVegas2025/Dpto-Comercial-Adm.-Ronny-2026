import './globals.css';

export const metadata = {
  title: 'Vegas Card — Gestão Comercial',
  description: 'Sistema de gestão comercial Vegas Card',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: '#0a0c10', color: '#e8eaf0' }}>
        {children}
      </body>
    </html>
  );
}

