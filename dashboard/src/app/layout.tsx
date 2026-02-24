import '@mantine/core/styles.css';
import './globals.css';

import { ColorSchemeScript, MantineProvider, createTheme } from '@mantine/core';
import { MainLayout } from '@/components/MainLayout';

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, sans-serif',
});

export const metadata = {
  title: 'Compuzone Scraping Dashboard',
  description: 'Team dashboard for tracking Compuzone PC prices',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <MainLayout>
            {children}
          </MainLayout>
        </MantineProvider>
      </body>
    </html>
  );
}
