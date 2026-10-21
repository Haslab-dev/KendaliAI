import React, { useState } from 'react';
import { WhatsAppConversationList } from './WhatsAppConversationList';
import { WhatsAppChatArea } from './WhatsAppChatArea';
import { TelegramConnectModal } from './TelegramConnectModal';

export const WhatsAppAssistantView: React.FC = () => {
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-background">
      {/* Left WhatsApp Conversation List */}
      <WhatsAppConversationList onOpenTelegramModal={() => setTelegramModalOpen(true)} />

      {/* Main WhatsApp Chat Pane */}
      <WhatsAppChatArea onOpenTelegramModal={() => setTelegramModalOpen(true)} />

      {/* Telegram Connection & Pairing Modal */}
      <TelegramConnectModal
        isOpen={telegramModalOpen}
        onClose={() => setTelegramModalOpen(false)}
      />
    </div>
  );
};
