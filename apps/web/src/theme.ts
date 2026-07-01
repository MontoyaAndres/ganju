import { createTheme } from '@mui/material/styles';

const basicConfig = {
  colors: {
    transparent: 'transparent',
    black: '#000000',
    bastille: '#1C1825',
    white: '#FFFFFF',
    red: '#FF0000',
    alto: '#D4D4D4',
    fernGreen: '#417741',
    saltBox: '#6E6B73',
    peppermint: '#E8F5E9',
    parsley: '#1B5E20',
    japaneseLaurel: '#2E7D32',
    earlyDawn: '#FFF8E1',
    romanCoffee: '#795548',
    tahitiGold: '#F57C00',
    thunderbird: '#C62828',
    fairPink: '#FFEBEE',
    salem: '#1F7A3A',
    corn: '#e0a800',
    roman: '#d9534f',
    indigo: '#5c6ac4'
  },
  chart: {
    telegram: '#7FC8EC',
    whatsapp: '#86D9A4',
    slack: '#C9A0DC',
    discord: '#9AA6F2',
    fallback: '#9AA0A6',
    mcp: '#1C1825',
    mcpPalette: [
      '#5B8DEF',
      '#E0894F',
      '#3FB6A8',
      '#B06FD8',
      '#D9657F',
      '#E0B341',
      '#6C7BE0',
      '#7BB35F'
    ]
  },
  fonts: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '26px',
    '4xl': '34px',
    '5xl': '40px',
    '6xl': '60px',
    '7xl': '70px',
    '8xl': '90px',
    '9xl': '100px'
  },
  'custom-shadows': {
    smallest: '0px 10px 50px #00000029',
    small: '0px 3px 20px #00000040'
  },
  screens: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px'
  }
};

export const materialConfig = {
  ...basicConfig,
  palette: {
    primary: {
      main: '#1C1825'
    },
    secondary: {
      main: '#FFFFFF'
    }
  },
  typography: {
    fontFamily: 'Fustat'
  }
};

export const materialTheme = createTheme(materialConfig);
