import { Bodoni_Moda, JetBrains_Mono, Shippori_Mincho_B1, Yuji_Boku } from 'next/font/google';

export const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--cp-font-display',
});

export const shippori = Shippori_Mincho_B1({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  display: 'swap',
  variable: '--cp-font-body',
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
  variable: '--cp-font-mono',
});

export const yujiBoku = Yuji_Boku({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--cp-font-brush',
});
