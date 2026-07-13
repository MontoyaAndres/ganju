import { ReactElement, ReactNode } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import { AppProps } from 'next/app';
import { AppCacheProvider } from '@mui/material-nextjs/v15-pagesRouter';
import { ThemeProvider } from '@mui/material/styles';
import { ThemeProvider as EmotionThemeProvider } from '@emotion/react';
import CssBaseline from '@mui/material/CssBaseline';
import { UI } from '@ganju/ui';

import { materialTheme } from '../theme';
import { globalStyles } from '../global-styles';

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

export interface MyAppProps extends AppProps {
  Component: NextPageWithLayout;
}

const MyApp = (props: MyAppProps) => {
  const { Component, pageProps } = props;

  const getLayout = Component.getLayout ?? (page => page);

  return (
    <AppCacheProvider {...props}>
      <Head>
        <meta
          name="viewport"
          content="initial-scale=1, width=device-width, maximum-scale=1, interactive-widget=resizes-content"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <title key="title">Ganju</title>
        <meta
          name="description"
          content="Ganju dashboard — manage your projects, tools, resources, and channels."
          key="description"
        />
        <meta name="robots" content="noindex, nofollow" key="robots" />

        <meta name="theme-color" content="#FFFFFF" />
        <meta name="msapplication-TileColor" content="#FFFFFF" />
        <meta name="msapplication-TileImage" content="/favicon.svg" />
        <meta name="application-name" content="Ganju" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Ganju" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-tap-highlight" content="no" />

        <meta property="og:type" content="website" key="og:type" />
        <meta property="og:site_name" content="Ganju" key="og:site_name" />
        <meta
          name="twitter:card"
          content="summary_large_image"
          key="twitter:card"
        />
      </Head>
      <div id="modal" />
      <ThemeProvider theme={materialTheme}>
        <EmotionThemeProvider theme={materialTheme}>
          {globalStyles}
          <CssBaseline />
          <UI.Alert.SnackbarProvider>
            <>{getLayout(<Component {...pageProps} />)}</>
          </UI.Alert.SnackbarProvider>
        </EmotionThemeProvider>
      </ThemeProvider>
    </AppCacheProvider>
  );
};

export default MyApp;
