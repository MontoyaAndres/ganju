import {
  Html,
  Head,
  Main,
  NextScript,
  DocumentProps,
  DocumentContext
} from 'next/document';
import {
  DocumentHeadTags,
  DocumentHeadTagsProps,
  documentGetInitialProps
} from '@mui/material-nextjs/v15-pagesRouter';

import { DEFAULT_LOCALE } from '../seo';

const MyDocument = (
  props: DocumentProps & DocumentHeadTagsProps & { locale?: string }
) => {
  return (
    <Html lang={props.locale ?? DEFAULT_LOCALE}>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fustat:wght@200..800&display=swap"
          rel="stylesheet"
        />
        <meta name="emotion-insertion-point" content="" />
        <DocumentHeadTags {...props} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
};

MyDocument.getInitialProps = async (ctx: DocumentContext) => {
  const finalProps = await documentGetInitialProps(ctx);
  return { ...finalProps, locale: ctx.locale ?? DEFAULT_LOCALE };
};

export default MyDocument;
