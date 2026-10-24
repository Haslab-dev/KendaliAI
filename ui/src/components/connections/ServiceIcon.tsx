import React, { useState } from 'react';

interface ServiceIconProps {
  slug: string;
  name?: string;
  logoUrl?: string;
  className?: string;
}

export const ServiceIcon: React.FC<ServiceIconProps> = ({ slug, name, logoUrl, className = 'w-6 h-6' }) => {
  const [imgError, setImgError] = useState(false);
  const s = slug.toLowerCase();

  // If a valid live logoUrl is provided and hasn't errored, prefer it
  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={name || slug}
        className={`${className} object-contain rounded-md`}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  // --- Real Official Brand SVG Vector Icons ---

  // 1. Google Workspace (Unified Suite)
  if (s === 'googleworkspace' || s === 'googlesuper' || s === 'workspace' || s === 'google') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
      </svg>
    );
  }

  // 2. Google Docs
  if (s === 'googledocs' || s === 'gdocs' || s === 'docs') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" fill="#4285F4"/>
        <path d="M14 2v6h6L14 2z" fill="#A1C2FA"/>
        <path d="M8 12h8M8 15h8M8 18h5" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
  }

  // 3. Google Sheets
  if (s === 'googlesheets' || s === 'gsheets' || s === 'sheets') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" fill="#0F9D58"/>
        <path d="M14 2v6h6L14 2z" fill="#87CEAC"/>
        <rect x="7.5" y="11" width="9" height="7.5" rx="0.5" fill="#FFFFFF" fillOpacity="0.2" stroke="#FFFFFF" strokeWidth="1.2"/>
        <path d="M7.5 13.5h9M7.5 16h9M12 11v7.5" stroke="#FFFFFF" strokeWidth="1.2"/>
      </svg>
    );
  }

  // 4. Google Drive
  if (s === 'googledrive' || s === 'gdrive' || s === 'drive') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M8.2 2l7.6 13.2H4.4L0.6 8.6 8.2 2z" fill="#0066DA"/>
        <path d="M15.8 2h7.6l-7.6 13.2h-7.6L15.8 2z" fill="#00AC47"/>
        <path d="M4.4 15.2h15.2l-3.8 6.6H0.6l3.8-6.6z" fill="#EA4335"/>
        <path d="M8.2 2l7.6 13.2H0.6L8.2 2z" fill="#FFBA00" fillOpacity="0.9"/>
      </svg>
    );
  }

  // 5. Gmail
  if (s === 'gmail' || s === 'googlemail') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M2 5.5V19a2 2 0 002 2h2.5V11.5L2 8V5.5z" fill="#4285F4"/>
        <path d="M17.5 21H20a2 2 0 002-2V5.5L17.5 8v13z" fill="#34A853"/>
        <path d="M17.5 11.5V6.75L12 11 6.5 6.75v4.75L12 15.5l5.5-4z" fill="#EA4335"/>
        <path d="M2 5.5C2 4.4 2.9 3.5 4 3.5h1.2l6.8 5.2 6.8-5.2H20c1.1 0 2 .9 2 2v1.25L12 14.5 2 6.75V5.5z" fill="#FBBC05"/>
      </svg>
    );
  }

  // 6. Google Calendar
  if (s === 'googlecalendar' || s === 'gcalendar' || s === 'calendar') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="3" fill="#FFFFFF"/>
        <path d="M3 7a3 3 0 013-3h12a3 3 0 013 3v2H3V7z" fill="#4285F4"/>
        <rect x="7" y="2" width="2" height="4" rx="1" fill="#1A73E8"/>
        <rect x="15" y="2" width="2" height="4" rx="1" fill="#1A73E8"/>
        <text x="12" y="18" textAnchor="middle" fill="#1A73E8" fontSize="9" fontWeight="bold" fontFamily="sans-serif">31</text>
      </svg>
    );
  }

  // 7. Jira
  if (s === 'jira' || s === 'atlassian-jira') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M11.5 2.5C7.36 2.5 4 5.86 4 10v4c0 4.14 3.36 7.5 7.5 7.5s7.5-3.36 7.5-7.5v-4c0-4.14-3.36-7.5-7.5-7.5z" fill="#0052CC"/>
        <path d="M11.5 6a4 4 0 00-4 4v4a4 4 0 004 4 4 4 0 004-4v-4a4 4 0 00-4-4z" fill="#2684FF"/>
        <path d="M11.5 9.5a1.5 1.5 0 00-1.5 1.5v2a1.5 1.5 0 003 0v-2a1.5 1.5 0 00-1.5-1.5z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 8. GitHub
  if (s === 'github') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    );
  }

  // 9. GitLab
  if (s === 'gitlab') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M23.6 9.87l-1.08-3.32a.79.79 0 00-1.5 0l-1.08 3.32H3.98l-1.08-3.32a.79.79 0 00-1.5 0L.32 9.87a1.6 1.6 0 00.58 1.79l10.6 7.7a.8.8 0 00.94 0l10.6-7.7a1.6 1.6 0 00.56-1.79z" fill="#E24329"/>
        <path d="M12 19.36l3.8-11.7H8.2L12 19.36z" fill="#E24329"/>
        <path d="M12 19.36L8.2 7.66H3.98l8.02 11.7z" fill="#FC6D26"/>
        <path d="M3.98 7.66L2.9 4.34a.79.79 0 00-1.5 0L.32 9.87a1.6 1.6 0 00.58 1.79l3.08-3.99z" fill="#FCA326"/>
        <path d="M12 19.36l3.8-11.7h4.22l-8.02 11.7z" fill="#FC6D26"/>
        <path d="M20.02 7.66l1.08-3.32a.79.79 0 011.5 0l1.08 5.53a1.6 1.6 0 01-.58 1.79l-3.08-3.99z" fill="#FCA326"/>
      </svg>
    );
  }

  // 10. Notion
  if (s === 'notion') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 7.5L9.5 7l7.5 1v8.5l-2.5.5L7 16V7.5z" fill="currentColor" fillOpacity="0.15"/>
        <path d="M7 8v8.5l2.5-.5V8.5L7 8zM9.5 8l5 9.5V8.5L9.5 8zM14.5 8v8.5l2.5-.5V8.5L14.5 8z" fill="currentColor"/>
      </svg>
    );
  }

  // 11. Linear
  if (s === 'linear') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#5E6AD2"/>
        <path d="M6.5 15.5l11-7M6.5 12l7.5-4.5M10 16.5l7.5-4.5" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    );
  }

  // 12. Slack
  if (s === 'slack') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M6 14.5a2.5 2.5 0 01-2.5-2.5c0-1.38 1.12-2.5 2.5-2.5h2.5v5H6z" fill="#E01E5A"/>
        <path d="M8.5 6A2.5 2.5 0 0111 8.5V11H6A2.5 2.5 0 018.5 6z" fill="#36C5F0"/>
        <path d="M18 9.5a2.5 2.5 0 012.5 2.5c0 1.38-1.12 2.5-2.5 2.5h-2.5v-5H18z" fill="#2EB67D"/>
        <path d="M15.5 18a2.5 2.5 0 01-2.5-2.5V13h5a2.5 2.5 0 01-2.5 5z" fill="#ECB22E"/>
        <circle cx="8.5" cy="15.5" r="2.5" fill="#E01E5A"/>
        <circle cx="15.5" cy="8.5" r="2.5" fill="#36C5F0"/>
        <circle cx="15.5" cy="15.5" r="2.5" fill="#2EB67D"/>
        <circle cx="8.5" cy="8.5" r="2.5" fill="#ECB22E"/>
      </svg>
    );
  }

  // 13. Discord
  if (s === 'discord') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#5865F2"/>
        <path d="M18.8 6.5A14.6 14.6 0 0015.2 5.4a.2.2 0 00-.2.1 10.2 10.2 0 00-.4 1 13.5 13.5 0 00-5.2 0 10.3 10.3 0 00-.4-1 .2.2 0 00-.2-.1A14.6 14.6 0 005.2 6.5a.2.2 0 00-.1.1A17.6 17.6 0 003 16.9a.2.2 0 00.1.2 14.8 14.8 0 004.5 2.3.2.2 0 00.2-.1c.4-.5.7-1.1 1-1.7a.2.2 0 00-.1-.3 9.7 9.7 0 01-1.4-.7.2.2 0 010-.3c.1-.1.2-.2.3-.2a10.6 10.6 0 008.8 0c.1 0 .2.1.3.2a.2.2 0 010 .3c-.4.3-.9.5-1.4.7a.2.2 0 00-.1.3c.3.6.6 1.2 1 1.7a.2.2 0 00.2.1 14.8 14.8 0 004.5-2.3.2.2 0 00.1-.2 17.6 17.6 0 00-2-10.3.2.2 0 00-.1-.1zM8.8 14.2c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.4.7 1.4 1.6c0 .9-.6 1.6-1.4 1.6zm6.4 0c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.4.7 1.4 1.6c0 .9-.6 1.6-1.4 1.6z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 14. Figma
  if (s === 'figma') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M8 2h4v5H8a2.5 2.5 0 010-5z" fill="#F24E1E"/>
        <path d="M12 2h4a2.5 2.5 0 010 5h-4V2z" fill="#FF7262"/>
        <path d="M8 7h4v5H8a2.5 2.5 0 010-5z" fill="#A259FF"/>
        <circle cx="14.5" cy="9.5" r="2.5" fill="#1ABCFE"/>
        <path d="M8 12h4v5a2.5 2.5 0 11-4 0v-5z" fill="#0ACF83"/>
      </svg>
    );
  }

  // 15. Asana
  if (s === 'asana') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="4" fill="#F06A6A"/>
        <circle cx="6.5" cy="16" r="3.5" fill="#F06A6A"/>
        <circle cx="17.5" cy="16" r="3.5" fill="#F06A6A"/>
      </svg>
    );
  }

  // 16. Trello
  if (s === 'trello') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#0079BF"/>
        <rect x="4.5" y="4.5" width="6.5" height="13" rx="1.5" fill="#FFFFFF"/>
        <rect x="13" y="4.5" width="6.5" height="8.5" rx="1.5" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 17. Confluence
  if (s === 'confluence') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M4 14.5C4 18.64 7.36 22 11.5 22c2.8 0 5.24-1.54 6.5-3.8l-4-2.2c-.6.9-1.5 1.5-2.5 1.5-1.93 0-3.5-1.57-3.5-3.5 0-.8.3-1.6.8-2.2L9.2 9C6.1 10.3 4 12.2 4 14.5z" fill="#0052CC"/>
        <path d="M20 9.5C20 5.36 16.64 2 12.5 2c-2.8 0-5.24 1.54-6.5 3.8l4 2.2c.6-.9 1.5-1.5 2.5-1.5 1.93 0 3.5 1.57 3.5 3.5 0 .8-.3 1.6-.8 2.2l3.1 2.8c3.1-1.3 5.2-3.2 5.2-5.5z" fill="#2684FF"/>
      </svg>
    );
  }

  // 18. Airtable
  if (s === 'airtable') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M11.4 3.4a1 1 0 011.2 0l8.7 5.7a1 1 0 01-.5 1.8H3.2a1 1 0 01-.5-1.8l8.7-5.7z" fill="#FCB400"/>
        <path d="M12 12.5v8.5a.8.8 0 01-.8.8H3.8a.8.8 0 01-.8-.8v-6.9a.8.8 0 01.4-.7l8-2.5a.8.8 0 01.4.1.8.8 0 01.2.6z" fill="#18BFFF"/>
        <path d="M20.2 12.2l-6.8-3.4a.8.8 0 00-1 .4l-1.9 4.8 7.8 7.3a.8.8 0 001.3-.4v-8a.8.8 0 00-.4-.7z" fill="#F82B60"/>
      </svg>
    );
  }

  // 19. Coda
  if (s === 'coda') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#F8523A"/>
        <rect x="7" y="8" width="10" height="8" rx="4" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 20. Microsoft Teams
  if (s === 'msteams' || s === 'teams') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#5059C9"/>
        <path d="M15 8a2 2 0 11-4 0 2 2 0 014 0zM17 12h-8c-1.1 0-2 .9-2 2v3h12v-3c0-1.1-.9-2-2-2z" fill="#FFFFFF" fillOpacity="0.4"/>
        <rect x="3" y="6" width="10" height="12" rx="2" fill="#7B83EB"/>
        <text x="8" y="15" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="bold" fontFamily="sans-serif">T</text>
      </svg>
    );
  }

  // 21. Telegram
  if (s === 'telegram') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill="#229ED9"/>
        <path d="M5.5 11.5l11-4.5c.5-.2 1 .1.8.7l-1.8 8.8c-.1.6-.7.8-1.2.5l-3.3-2.5-1.6 1.5c-.2.2-.4.4-.8.4l.2-3.3 6-5.4c.3-.2 0-.4-.4-.2L8.5 13.5l-3-1c-.6-.2-.6-.7 0-1z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 22. HubSpot
  if (s === 'hubspot') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF7A59"/>
        <circle cx="12" cy="12" r="4.5" fill="#FFFFFF"/>
        <circle cx="12" cy="12" r="2.5" fill="#FF7A59"/>
        <circle cx="18" cy="8" r="2" fill="#FFFFFF"/>
        <line x1="14.5" y1="10" x2="16.5" y2="8.5" stroke="#FFFFFF" strokeWidth="1.8"/>
        <circle cx="6" cy="12" r="1.5" fill="#FFFFFF"/>
        <line x1="6.5" y1="12" x2="8.5" y2="12" stroke="#FFFFFF" strokeWidth="1.8"/>
      </svg>
    );
  }

  // 23. Salesforce
  if (s === 'salesforce') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M9.5 6.5A5.5 5.5 0 0118.5 8a4.5 4.5 0 012.5 4 4.5 4.5 0 01-4 4.5H6.5A4.5 4.5 0 012 12a4.5 4.5 0 014-4.5 5.5 5.5 0 013.5-1z" fill="#00A1E0"/>
        <path d="M10 9a3 3 0 015.5 1 2.5 2.5 0 011.5 2.3 2.5 2.5 0 01-2.5 2.5H8A2.5 2.5 0 015.5 12.3 2.5 2.5 0 017.8 10 3 3 0 0110 9z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 24. Zendesk
  if (s === 'zendesk') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#03363D"/>
        <path d="M7 7h6a6 6 0 01-6 6V7z" fill="#FFFFFF"/>
        <path d="M17 17h-6a6 6 0 016-6v6z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 25. Stripe
  if (s === 'stripe') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#635BFF"/>
        <path d="M14.5 11.2c0-1.2-.9-1.8-2.5-2.1-1.1-.2-1.4-.4-1.4-.8 0-.4.4-.7 1.1-.7 1 0 1.9.4 2.6.9l.7-1.8C14.2 6.3 13.1 6 12 6c-2.4 0-4 1.3-4 3.2 0 1.2.9 1.8 2.5 2.1 1.2.3 1.5.5 1.5.9 0 .5-.5.8-1.3.8-1.1 0-2.2-.5-3-1.1l-.7 1.8c.9.6 2.2.9 3.5.9 2.5 0 4-1.2 4-3.4z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 26. Supabase
  if (s === 'supabase') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path d="M12.5 2.5L2 14.5h9L9.5 22.5 21 9.5h-9l.5-7z" fill="#3ECF8E"/>
      </svg>
    );
  }

  // 27. Postman
  if (s === 'postman') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF6C37"/>
        <path d="M8 14.5l3-2.5 4.5 4-1-6.5 4-2.5-6.5-1-2.5-4-1 6-4 1.5 3 2.5z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 28. LinkedIn
  if (s === 'linkedin') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="4" fill="#0A66C2"/>
        <path d="M7 10h2.5v7H7v-7zM8.2 6.5a1.4 1.4 0 110 2.8 1.4 1.4 0 010-2.8zM11.5 10H14v1c.5-.7 1.4-1.2 2.5-1.2 2.2 0 3.5 1.4 3.5 3.8V17h-2.5v-3.8c0-1-.4-1.7-1.4-1.7-1 0-1.6.7-1.6 1.7V17h-2.5v-7z" fill="#FFFFFF"/>
      </svg>
    );
  }

  // 29. X (Twitter)
  if (s === 'twitter' || s === 'x') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    );
  }

  // Default Fallback: Stylized colored badge with first 2 letters
  const label = (name || slug).slice(0, 2).toUpperCase();
  return (
    <div className={`${className} rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-3xs text-primary`}>
      {label}
    </div>
  );
};
