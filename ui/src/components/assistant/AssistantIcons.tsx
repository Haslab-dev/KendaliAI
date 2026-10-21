import React from 'react';

export interface AssistantIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Official WhatsApp Brand Icon (Speech bubble with phone receiver)
 * WhatsApp Green: #25D366
 */
export const WhatsAppIcon: React.FC<AssistantIconProps> = ({
  size = 20,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.63C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2Z"
      fill="#25D366"
    />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M17.51 14.33C17.21 14.18 15.74 13.46 15.46 13.36C15.19 13.26 14.99 13.21 14.79 13.51C14.59 13.81 14.02 14.48 13.84 14.68C13.67 14.88 13.5 14.91 13.2 14.76C12.9 14.61 11.94 14.3 10.8 13.28C9.91 12.49 9.31 11.51 9.14 11.21C8.97 10.91 9.12 10.75 9.27 10.6C9.4 10.47 9.57 10.25 9.72 10.08C9.87 9.91 9.92 9.78 10.02 9.58C10.12 9.38 10.07 9.21 10 9.06C9.92 8.91 9.32 7.43 9.07 6.83C8.83 6.25 8.58 6.33 8.4 6.32H7.83C7.63 6.32 7.31 6.39 7.03 6.69C6.76 6.99 6 7.7 6 9.14C6 10.58 7.05 11.97 7.2 12.17C7.35 12.37 9.26 15.31 12.19 16.57C12.89 16.87 13.43 17.05 13.86 17.19C14.56 17.41 15.2 17.38 15.7 17.3C16.26 17.22 17.42 16.6 17.66 15.92C17.9 15.24 17.9 14.66 17.83 14.54C17.76 14.41 17.58 14.34 17.28 14.19L17.51 14.33Z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * Official Telegram Brand Icon (Sky blue circular badge with white paper plane)
 * Telegram Sky Blue: #229ED9
 */
export const TelegramIcon: React.FC<AssistantIconProps> = ({
  size = 20,
  className = '',
  ...props
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="10" fill="#229ED9" />
    <path
      d="M17.4 6.9L4.8 11.8C3.9 12.2 3.9 12.7 4.7 12.9L7.9 13.9L15.3 9.2C15.6 9 15.9 9.2 15.7 9.4L9.7 14.8L9.5 17.7C9.8 17.7 9.9 17.6 10.1 17.4L11.5 16L14.4 18.1C14.9 18.4 15.3 18.2 15.4 17.6L17.9 7.8C18.1 7 17.6 6.6 17.4 6.9Z"
      fill="#FFFFFF"
    />
  </svg>
);

/**
 * AssistantBrandIcon — Composite / default badge for Assistant Mode.
 * Renders the WhatsApp brand icon by default, or Telegram icon when specified.
 */
export const AssistantBrandIcon: React.FC<
  AssistantIconProps & { channel?: 'telegram' | 'whatsapp' | string }
> = ({ channel = 'whatsapp', size = 20, className = '', ...props }) => {
  if (channel === 'telegram') {
    return <TelegramIcon size={size} className={className} {...props} />;
  }
  return <WhatsAppIcon size={size} className={className} {...props} />;
};
