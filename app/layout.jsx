import './globals.css';
import { AuthProvider } from './context/AuthContext';
import AppShell from './AppShell';

export const metadata = {
  title: 'Vegas Card — Gestão Comercial',
  description: 'Sistema de gestão comercial Vegas Card',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: '#f5f6fa', color: '#1a1d2e' }}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
