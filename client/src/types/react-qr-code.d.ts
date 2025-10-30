declare module 'react-qr-code' {
  import * as React from 'react';

  export interface QRCodeProps extends React.SVGProps<SVGSVGElement> {
    value: string;
    size?: number;
    level?: 'L' | 'M' | 'Q' | 'H';
    bgColor?: string;
    fgColor?: string;
    style?: React.CSSProperties;
  }

  const QRCode: React.FC<QRCodeProps>;
  export default QRCode;
}
